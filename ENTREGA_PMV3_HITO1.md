# PMV 3 · HITO 1 — Catálogo maestro, bancos privados por docente y borradores IA

**Proyecto:** MentorIA Math · **Fase:** PMV 3
**Hito:** 1 — gestión de contenido y bancos de ejercicios
**Rama:** `feat/pmv3-staging`

---

## 1. Qué pedía el hito y dónde está

| Requisito | Entregado en |
| --- | --- |
| Catálogo maestro para el diagnóstico general | `AmbitoContenido.MAESTRO` en [`schema.prisma`](prisma/schema.prisma). El diagnóstico lee **sólo** el catálogo: [`lib/diagnostico/prueba.ts`](lib/diagnostico/prueba.ts), [`app/api/diagnostico/route.ts`](app/api/diagnostico/route.ts) |
| Bancos privados por docente | `AmbitoContenido.DOCENTE` + reglas centralizadas en [`lib/docente/bancos.ts`](lib/docente/bancos.ts) |
| Sistema de borradores generados por IA | [`POST /api/docente/ejercicios/borradores-ia`](app/api/docente/ejercicios/borradores-ia/route.ts) + [`lib/docente/borradores-ia.ts`](lib/docente/borradores-ia.ts) |
| Banco docente vacío para la carga inicial por tema | [`GET /api/docente/bancos`](app/api/docente/bancos/route.ts), vista [`/docente/bancos`](app/docente/bancos/page.tsx) |
| Preservar datos e historial | Migración aditiva [`20261117120000_pmv3_hito1_bancos_docentes`](prisma/migrations/20261117120000_pmv3_hito1_bancos_docentes/migration.sql) — ver §5 |

Además, para cargar contenido sin partir de cero: `POST /api/docente/ejercicios/[id]/copiar`
copia un ejercicio del catálogo al banco propio (como borrador).

---

## 2. El modelo, en una frase

> **Un ejercicio es del catálogo (MAESTRO) o del banco privado de un docente (DOCENTE).**
> El banco de un docente en un tema son *sus* ejercicios DOCENTE de ese tema: por eso
> nace vacío y no hay nada que "aprovisionar".

|  | MAESTRO (catálogo) | DOCENTE (banco privado) |
| --- | --- | --- |
| Quién lo ve | Quien ya lo veía (su colegio + catálogo base) | **Sólo su autor** y un SUPERADMIN |
| Quién lo edita | SUPERADMIN (o su colegio, si es contenido del colegio) | Su autor |
| ¿Entra en el diagnóstico? | Sí, si está publicado y verificado | **Nunca** |
| ¿Le llega a un alumno? | Por diagnóstico, lección y tareas | **Sólo** por una tarea de ese docente |
| Quién decide el ámbito | El **servidor**: SUPERADMIN → MAESTRO, resto → DOCENTE | (un `ambito` en el cuerpo de la petición se ignora) |

Un ejercicio ajeno responde **404, no 403**: confirmar que el id de otro docente existe ya
es información.

**Borrar un tema no destruye el trabajo ajeno.** Borrar un tema borraba todos sus ejercicios;
con bancos privados eso arrasaría en silencio el banco de otros docentes del colegio. Ahora, si
el tema contiene ejercicios privados de otro docente, el borrado responde 409 y se ofrece
archivarlo (que conserva todo).

### Un detalle que parece menor y no lo es: la unicidad

El PMV 2 tenía un índice único global `(motor, nivel, enunciado)`. Con bancos privados,
ese índice **filtraba información**: si el docente B guardaba un enunciado que ya estaba en
el banco privado del docente A, recibía «ya existe» y así se enteraba de qué tenía A. Se
sustituyó por dos índices **parciales**: uno para el catálogo y otro por
`(autor, tema, enunciado)` en los bancos privados. La batería lo comprueba (§7.C).

---

## 3. Borradores con IA: Gemini propone, el servidor decide

```
docente ──► POST /borradores-ia {tema, dificultad, cantidad, indicaciones}
              │
              ├─ sesión + permiso de escritura + tope de consumo (8 / 10 min por usuario)
              ├─ Gemini devuelve JSON con esquema (enunciado, respuesta, pistas)
              ├─ CADA ejercicio pasa por el validador determinista del servidor
              │     · respuesta de Gemini == respuesta del motor  → VERIFICADO
              │     · discrepan                                   → DESCARTADO (se le dice al docente)
              │     · el motor no sabe leerlo                     → borrador SIN VERIFICAR
              └─ se guarda SIEMPRE como BORRADOR en el banco privado (origen = IA)

docente ──► revisa / edita ──► PATCH {estado: PUBLICADO}
              · un borrador de IA sin verificar → 422, no se publica
              · al publicar queda constancia: revisadoPorId + revisadoEn
```

**Por qué «se descarta» y no «se corrige con la respuesta del motor».** Con Gemini real se
vio que el motor de fracciones del PMV 2 lee mal algunas expresiones (§6). Si el servidor
adoptara su respuesta cuando Gemini discrepa, marcaría como *verificado* un resultado
equivocado. Exigir que **dos fuentes independientes coincidan** evita ese fallo.

**Sin `GEMINI_API_KEY`** el endpoint funciona en *modo demostración* (genera ejercicios
sencillos a partir del propio motor), igual que el resto de la plataforma: la batería de QA
no consume cuota.

### Prueba contra Gemini real (modelo `gemini-2.5-flash-lite`)

20 borradores pedidos en 5 motores, pasados por el validador con la regla de coincidencia:

| Motor | Propuestos | Verificados (Gemini = motor) | Descartados |
| --- | --- | --- | --- |
| Aritmética | 4 | 4 | 0 |
| Ecuaciones lineales | 4 | 4 | 0 |
| Derivadas (polinomios) | 4 | 4 | 0 |
| Factorización | 4 | 4 | 0 |
| Fracciones | 4 | 3 | 1 (`11/12 / 4/5`: Gemini acertó, el motor no — ver §6) |

Antes de afinar el *prompt* para pedir sólo lo que el motor soporta, Gemini devolvía
derivadas con `sin`, `ln` y `e^x`: el servidor las dejó **sin verificar**, y por tanto sin
poder publicarse.

---

## 4. Cómo probarlo

```bash
npm install
npx prisma migrate deploy       # aplica la migración nueva (ver §5 antes de hacerlo en producción)
npm run db:seed
npm run dev                     # http://localhost:3000
```

1. Entra como **DOCENTE** (`docente@mentoriamath.local` / `Docente-2026`) → **Mis bancos**:
   todos los temas con *Tu banco: Vacío* y el catálogo al lado.
2. **Ejercicios** → *Nuevo ejercicio* en un tema del catálogo base → queda como **Mi banco**.
3. **Ejercicios** → *Generar borradores con IA* → aparecen como **Borrador IA**.
4. *Revisar y publicar* un borrador verificado → pasa a **IA · revisado**.
5. En la tabla, un ejercicio del catálogo ofrece **Copiar a mi banco**.
6. Entra con **otro docente**: no ve nada de lo anterior.

Batería de este hito: `npm run qa:pmv3-hito1` (con la aplicación en marcha y, para no gastar
cuota, **sin** `GEMINI_API_KEY`).

---

## 5. Migración y datos existentes

La migración es **aditiva** y no reescribe ninguna fila:

- Añade `ambito` (por defecto `MAESTRO`), `revisadoPorId` y `revisadoEn` a `ejercicios`.
- Todo lo que ya existe queda como `MAESTRO` ⇒ el diagnóstico, la lección y las tareas se
  comportan **exactamente igual**; los bancos docentes nacen vacíos.
- Crea los dos índices parciales **antes** de retirar el global: en ningún momento queda el
  catálogo sin protección frente a duplicados.

**Verificada sobre una copia de los datos reales** (420 ejercicios del proyecto):

| | Antes | Después |
| --- | --- | --- |
| Filas | 420 | 420 |
| Checksum MD5 de las 23 columnas originales | `be8d07ce…aa` | `be8d07ce…aa` (idéntico) |
| Ámbito | — | 420 × MAESTRO |
| Ejercicios que alimentan el diagnóstico | 419 | 419 |

### ⚠ Antes de desplegar en la base real

1. **Haz una copia de seguridad** (en Supabase: *Database → Backups*, o `pg_dump`).
2. `vercel-build` ejecuta `prisma migrate deploy` **y la semilla** en cada compilación. Si el
   entorno *Preview* de Vercel usa la misma `DATABASE_URL` que producción, **la primera vista
   previa de esta rama migrará la base de producción**. Recomendado: que *Preview* apunte a
   una base distinta (p. ej. una *branch* de Supabase).
3. **Marcha atrás.** El código anterior (`main`) hace `upsert` por `(motor, nivel,
   enunciado)` en la semilla y necesita el índice global antiguo. Para volver:
   ```sql
   -- sólo si NO hay ejercicios privados duplicados entre sí (mismo motor+nivel+enunciado)
   CREATE UNIQUE INDEX "ejercicios_motor_nivel_enunciado_key"
     ON "ejercicios"("motor","nivel","enunciado");
   DROP INDEX "ejercicios_maestro_unico", "ejercicios_banco_docente_unico";
   ```
   Las columnas nuevas pueden quedarse: el código antiguo las ignora.

> Nota para quien use `prisma migrate dev`: Prisma no sabe expresar índices parciales y los
> propondrá borrar al comparar con el esquema. No los aceptes; `migrate deploy` no se ve
> afectado.

---

## 6. Hallazgos del PMV 2 que conviene saber

Salieron al probar con Gemini real; **no se han tocado** (no son de este hito) pero afectan a
lo que el servidor puede decir que verifica:

1. **El motor de fracciones calcula mal expresiones con paréntesis o varios operadores**, y
   aun así las marca como *verificadas*:
   - `3/4 * (1/2 + 2/5)` → el motor dice `9/10` (correcto: `27/40`)
   - `(5/6 - 1/3) / (1/4)` → `1/2` (correcto: `2`)
   - `9/4 / 3/8` → `3/32` (correcto: `6`)

   Un docente que escriba uno de esos enunciados y deje la respuesta en blanco («déjalo
   vacío y lo calcula el motor») guardaría una respuesta **incorrecta como verificada**.
   Los borradores de IA están protegidos (§3). Corregirlo corresponde al **Hito 2** (el
   servidor debe verificar lo que el motor soporta): se propone limitar el motor de
   fracciones a una operación entre dos fracciones, o ampliarlo con un parser completo.
2. `/docente/ejercicios` y el panel `/docente` leían **toda** la tabla de ejercicios y todos
   los temas sin el filtro institucional del Hito 4. Ahora usan la misma regla de
   visibilidad que la API.

---

## 7. Verificación ejecutada

| Batería | Resultado |
| --- | --- |
| `node qa/pmv3-hito1.mjs` — **nueva** | **76 comprobaciones · 0 fallidas** |
| `node qa/hito1.mjs` (regresión: autoría y RBAC) | 124 · 0 |
| `node qa/hito3-banco-ejercicios.mjs` | 41 · 0 |
| `node qa/hito4-aislamiento-institucional.mjs` | 42 · 0 |
| `node qa/hito4-admin-contenido.mjs` | 15 · 0 |
| `npx tsc --noEmit` | sin errores |
| Migración sobre copia de datos reales | filas y checksum idénticos (§5) |
| Revisión visual en Chrome real | `/docente/bancos` y `/docente/ejercicios`, sin errores de consola |
| Prueba con Gemini real | 20 propuestos · 19 verificados · 1 descartado (§3) |

**Qué cubre `qa/pmv3-hito1.mjs`:** acceso (401/403) · banco propio vacío para un docente
nuevo · privacidad entre dos docentes **del mismo colegio** (listado, filtro por tema, por
id, editar, borrar, copiar → 404) · ausencia de fuga por enunciado repetido · el cliente no
puede elegir el ámbito · lo privado no entra en el catálogo ni en el diagnóstico · borradores
IA (siempre BORRADOR, verificados, editables, no publicables sin verificar, constancia de la
revisión) · copiar del catálogo · tareas con banco privado (otro docente no puede citar el
id) · borrar un tema con ejercicios privados de otro docente → 409 · tope de consumo (429 con
`Retry-After`).

---

## 8. Lo que NO entra en este hito

- **Editor de reglas y métodos con pasos** y verificación de los pasos que soporta el motor
  (suma de fracciones, regla de la cadena): Hito 2.
- **Pizarra conversacional, profesor 3D, puntero láser y tutoría adaptativa**: Hitos
  siguientes.
- **Compartir un banco privado con colegas** o promoverlo al catálogo: no está en el
  alcance; hoy el único camino al catálogo es que lo cree un SUPERADMIN.
- Los tests de `qa/` que cuentan ejercicios por tema siguen funcionando porque los
  ejercicios del catálogo no cambian; no se ha tocado el banco de preguntas del diagnóstico
  (`PreguntaDiagnostico`).
