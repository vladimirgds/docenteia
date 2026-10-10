# MVP 2 · HITO 3 — Arquitectura Multi-Tenant (Colegios, Aulas y Tareas Programadas)

**Proyecto:** MentorIA Math · **Fase:** MVP 2 (versión institucional)
**Hito:** 3 de 4 — Colegios, aulas y tareas programadas
**Estado:** completo y verificado sobre base de datos real.

---

## 1. Qué pedía el pliego y dónde está

| Requisito del pliego | Entregado en |
| --- | --- |
| Modelo relacional multi-colegio: Institución → Aula (grado/sección) → Docente titular → Estudiantes | [`prisma/schema.prisma`](prisma/schema.prisma) — `Institucion`, `Aula`, `Matricula` |
| Enrolamiento mediante enlaces y códigos alfanuméricos de invitación por aula | [`lib/docente/codigo-acceso.ts`](lib/docente/codigo-acceso.ts) + [`/api/estudiante/unirse`](app/api/estudiante/unirse/route.ts) |
| Módulo de asignación de tareas con fechas de inicio, vencimiento, cantidad de ejercicios y límite de reintentos | [`Tarea`](prisma/schema.prisma) y [`EntregaTarea`](prisma/schema.prisma) en el esquema; [`/api/docente/tareas`](app/api/docente/tareas/route.ts) y [`/api/estudiante/tareas/[id]/entregar`](app/api/estudiante/tareas/%5Bid%5D/entregar/route.ts) |
| Modelos de datos en Prisma: Institución, Aula, Matrícula, Tarea y EntregaTarea | Los cinco, con migración [`20261009224824_hito3_multi_tenant`](prisma/migrations/20261009224824_hito3_multi_tenant/migration.sql) |
| Vistas `/docente/aulas`, `/docente/asignar-tarea` y `/estudiante/unirse` | Las tres, funcionales y verificadas por HTTP y visualmente en Chrome |
| Panel de supervisión institucional para directores de colegio | [`/director`](app/director/page.tsx) + [`/api/director/resumen`](app/api/director/resumen/route.ts) |

---

## 2. La idea que sostiene el hito

El PMV 1 y el HITO 1 sirven a un alumno suelto: se registra, declara su etapa y
aprende por su cuenta. El HITO 3 abre la plataforma a **colegios**: un docente
organiza a sus alumnos en **aulas** (un grado y una sección concretos), reparte
un código con el que se matriculan, y les **programa tareas** con una ventana de
tiempo y un límite de reintentos. El director del colegio supervisa el conjunto
sin entrar en el currículo de nadie — exactamente la misma frontera que ya
separaba a DOCENTE de DIRECTOR en el HITO 1 (`puedeEditarCurriculo`), aplicada
ahora a quién puede *crear* aulas y tareas frente a quien sólo las *resume*.

La jerarquía es la que pidió el pliego, sin desviarse: **Institución → Aula →
Docente titular → Estudiantes**, estos últimos por matrícula y no por
pertenencia directa — un mismo alumno puede estar en aulas de colegios
distintos (clases particulares, refuerzo), así que la matrícula es el vínculo,
no un campo fijo en su cuenta.

### Lo que gana cada rol, en concreto

- **El docente** crea un aula en un formulario de tres campos y recibe un
  código de seis caracteres (`crypto.randomBytes(3)`, como pedía el pliego) que
  copia o comparte como enlace. Desde la misma tarjeta ve a sus alumnos y les
  asigna una tarea con fechas, cantidad de ejercicios y reintentos.
- **El alumno** escribe o pega el código una vez — si llega por enlace,
  ni eso— y ve sus tareas con su estado real: pendiente, entregada o vencida.
- **El director** abre su panel y ve, de su colegio y de nadie más: cuántos
  alumnos, cuántas aulas, cuántos docentes, y una tabla por aula con su tasa de
  entrega.

---

## 3. Por qué la regla no vive donde el pliego la escribió (y la razón es seguridad)

El pliego especifica `POST /api/docente/aulas` con `{ nombre, grado, seccion,
institucionId }` — `institucionId` como parte del cuerpo de la petición, igual
que `docenteId` «de la sesión activa».

Ahí está el matiz: **`docenteId` se asigna desde la sesión; `institucionId`,
tal como está escrito, llegaría del cliente**. Aceptarlo así deja un agujero
concreto — cualquier docente podría crear aulas en un colegio que no es el
suyo con sólo adivinar o conocer su id, porque nada comprueba que *ese*
docente pertenezca a *esa* institución.

La solución, por simetría con `docenteId`: **`institucionId` también sale de
la sesión**, no del cuerpo de la petición. Un docente pertenece a un colegio —
campo nuevo en `Usuario`, poblado en el token de NextAuth igual que ya viajan
`perfilId` y `nivelActual`— y `POST /api/docente/aulas` lo lee de ahí. El
esquema de validación (`aulaSchema`) ni siquiera tiene un campo
`institucionId` que aceptar; la batería lo comprueba explícitamente.

Si una cuenta de DOCENTE o DIRECTOR no tiene colegio asignado todavía, la ruta
lo dice con un 409 claro — *"Tu cuenta todavía no está asignada a ningún
colegio. Pide al administrador que te vincule a uno"* — en vez de fallar en
silencio o, peor, aceptar cualquier id que llegue.

---

## 4. Modelo de datos y migración

```
Institucion 1───* Aula *───1 Usuario (docente titular)
                  │
                  *
             Matricula *───1 Usuario (estudiante)
                  │
Aula 1────────────┘
  │
  *
Tarea ──→ NodoConocimiento (tema, opcional)
  │
  *
EntregaTarea ───1 Usuario (estudiante)
```

- **`Institucion`** — el colegio. `codigoModular` opcional y único: una
  academia privada puede no tener uno.
- **`Aula`** — grado, sección y su **`codigoAcceso`** único de seis
  hexadecimales en mayúsculas. `activa: false` cierra la matrícula sin borrar
  el historial de quien ya estaba.
- **`Matricula`** — el enlace alumno↔aula, con `@@unique([aulaId,
  estudianteId])`: es el 409 de «ya estás matriculado» cuando se repite el
  código.
- **`Tarea`** — título, ventana `fechaInicio`/`fechaVencimiento`,
  `cantidadEjercicios`, `limiteReintentos` (**0 = sin tope**, no «sin
  configurar»: evita distinguir los dos casos en cada sitio que lo lee) y un
  `nodoId` opcional hacia `NodoConocimiento` — el «Tema» del pliego es, en este
  esquema, el mismo nodo del currículo que ya administra el HITO 1, no una
  tabla nueva.
- **`EntregaTarea`** — una fila por alumno y tarea (`@@unique([tareaId,
  estudianteId])`), no una por intento: lo que importa de cada reintento es
  que `intentosUsados` sube y `puntaje` puede mejorar, no un historial
  línea a línea. Ese historial fino sigue en `RegistroProgreso`, que ya lo
  llevaba.

`Usuario` gana `institucionId` (opcional, `SetNull` si el colegio se borra) y
las relaciones inversas (`aulasComoDocente`, `matriculas`, `tareasAsignadas`,
`entregas`).

La migración `20261009224824_hito3_multi_tenant` se aplicó contra PostgreSQL
real sin tocar ninguna tabla existente más allá de la columna nueva en
`usuarios`.

### La semilla de demostración

`prisma/seed.ts` crea ahora un *Colegio de demostración* y vincula a él las
cuentas DIRECTOR y DOCENTE de siempre — el SUPERADMIN se queda sin colegio a
propósito, porque administra la plataforma entera, no uno—. Así el flujo es
demostrable desde el primer `npm run db:seed`, sin un paso manual de
«asignar institución» que el pliego no pedía como entregable.

---

## 5. Control de acceso

| Rol | Zona nueva | Qué ve |
| --- | --- | --- |
| `ESTUDIANTE` | `/estudiante/unirse` | se matricula con un código |
| `DOCENTE` | `/docente/aulas`, `/docente/asignar-tarea` | **sus** aulas y tareas, nunca las de otro docente |
| `DIRECTOR` | `/director` (nueva zona) | el resumen de **su** colegio entero |
| `SUPERADMIN` | todas | — |

Tres fronteras comprobadas por HTTP, no sólo por la interfaz:

- Un docente que conoce el id de un aula ajena recibe **404** al pedir su
  ficha o programarle una tarea — «no existe», no «no tienes permiso»: no hay
  por qué confirmarle que el id es válido.
- Un estudiante que llama a `/api/docente/aulas` recibe **403**.
- Un estudiante que llama a `/api/director/resumen` recibe **403**.

El panel del director (`/director`) ya tiene **zona propia** en el RBAC — el
comentario que dejó el HITO 1, *«el panel propio del director llega en el
HITO 3»*, se cumple literalmente: `INICIO_POR_ROL.DIRECTOR` deja de apuntar a
`/docente` y pasa a `/director`.

---

## 6. Cómo probarlo

```bash
npm run db:deploy
npm run db:seed
npm run dev
```

### Recorrido de aceptación (5 minutos)

1. Entra como **DOCENTE** (`docente@mentoriamath.local` / `Docente-2026`) →
   **Aulas** → «Crear nueva aula» → grado `3`, sección `B` → aparece la
   tarjeta con su código de seis caracteres y los botones «Copiar código» /
   «Copiar enlace».
2. **Asignar tarea** → elige esa aula, título *Práctica 1*, vencimiento
   mañana, 2 reintentos → **Asignar tarea**.
3. Abre una sesión de alumno (o regístrate en `/registro`) → ve a
   `/estudiante/unirse?codigo=…` con el código que copiaste → **Confirmar** →
   «¡Ya estás en la clase!».
4. Entra como **DIRECTOR** (`director@mentoriamath.local` / `Director-2026`) →
   `/director` → el aula y el alumno ya aparecen en la tabla, con su tasa de
   entrega.
5. Repite el paso 1 con otro docente (o intenta `POST /api/docente/aulas` con
   la sesión del estudiante) → **403**.

---

## 7. Verificación ejecutada

| Batería | Resultado |
| --- | --- |
| `node qa/hito3.mjs` — **nueva** | **74 comprobaciones · 0 fallidas** |
| `node qa/hito1.mjs` (regresión: RBAC, zonas) | 124 · 0 |
| `node qa/hito2.mjs` (regresión: pizarra) | 841 · 0 |
| `node qa/rigor.mjs` (regresión: motor matemático) | 34.195 afirmaciones · 0 incorrectas |
| `node qa/leccion.mjs` | 845 · 0 |
| `node qa/qa.mjs` | 1.465 · 0 |
| `node qa/aceptacion.mjs` | 24/24 |
| `node qa/mandos.mjs` | 19 · 0 |
| `node qa/voz.mjs` | 13 · 0 |
| `node qa/navegador.mjs` | 87 · 0 |
| `node qa/barrido.mjs` | 200 sesiones · 1.800 turnos · 0 |
| `node qa/observaciones.mjs` | 0 fallos en las ocho clases |
| `npx prisma format` / `validate` | sin errores |
| `npx tsc --noEmit` | sin errores |
| `npm run build` | compila; las cuatro vistas nuevas y las siete rutas entran en el bundle |
| Revisión visual en Chrome real (Playwright) | las cuatro páginas, sin errores de consola |

`qa/hito3.mjs` cubre, en su sección C, **el ciclo completo por HTTP con cuatro
sesiones** —docente, alumno, un segundo alumno y director—: crear un aula →
listarla → matricular un alumno con su código → rechazar la segunda matrícula
(409) → rechazar un código inexistente (404) → rechazar una tarea con
vencimiento anterior al inicio (400) → programar una tarea con reintentos →
verla *pendiente* en el alumno → agotar los reintentos (dos intentos
aceptados, el tercero en 409) → verla *entregada*, con el puntaje del último
intento aceptado → rechazar la entrega de un alumno no matriculado (403) →
crear una tarea ya vencida y verla bloqueada (409) y etiquetada *vencida* →
confirmar que un aula ajena sigue siendo ajena (404 en la ficha y al
programarle tareas) → RBAC del estudiante (403 en rutas de docente y de
director) → el resumen del director con las cifras exactas de lo que se
acaba de hacer.

**Un defecto real, encontrado por la propia revisión visual y corregido antes
de esta entrega:** `/estudiante/unirse` duplicaba la cabecera —dos
«MentorIA Math», dos «Salir»— porque la página montaba su propia `<Cabecera>`
sobre la que ya pone `app/estudiante/layout.tsx` para toda la zona
`/estudiante`. Las otras tres páginas nuevas no tienen ese layout compartido
y sí necesitan la suya; sólo ésta la duplicaba. Corregido y verificado con una
captura de pantalla real, no sólo con el status HTTP.

---

## 8. Lo que NO entra en este hito

- **Alta de colegios desde la interfaz.** El pliego no la pidió como
  entregable de este hito —sus tres vistas son para docente y alumno, su
  panel para director—, y la semilla ya deja un colegio de demostración
  vinculado a las cuentas de prueba. Vincular una cuenta nueva a un colegio,
  por ahora, es un `UPDATE` en `usuarios.institucionId` (o una ruta de
  SUPERADMIN, si el pliego la pide en un hito posterior).
- **Qué ejercicios concretos cuenta una tarea.** `cantidadEjercicios` es una
  cuota, no una lista de ids: la tarea no fuerza qué ejercicios resuelve el
  alumno, sólo cuántos y con qué plazo. Encajarlo con el banco de ejercicios
  del HITO 1 es una decisión de producto que el pliego de este hito no fija.
- **Hito 4.** El cliente pidió terminar los dos de una vez —*"el hito3 es
  sencillo, y cuatro también"*—, pero no llegó ninguna especificación de
  Hito 4 en esta ronda: ni documento, ni captura, ni una frase que lo
  describa. El comentario que ya dejó el HITO 1 en el código apunta a que
  Hito 4 monta la suite de QA completa sobre todo lo anterior, pero confirmar
  eso necesita el pliego, no una suposición. En cuanto llegue, se entrega con
  la misma batería de pruebas que esta.
