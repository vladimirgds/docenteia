# MVP 2 · HITO 1 — Módulo de Autoría Docente y Gestión Curricular

**Proyecto:** MentorIA Math · **Fase:** MVP 2 (versión institucional)
**Hito:** 1 de 4 — Autoría curricular docente
**Estado:** completo y verificado sobre base de datos real.

---

## 1. Qué pedía el pliego y dónde está

| Requisito del pliego | Entregado en |
| --- | --- |
| Interfaz de administración curricular: crear, editar y **categorizar** temas | [`/docente/curriculo`](app/docente/curriculo/page.tsx) — asignaturas, árbol de temas y subtemas, filtros y estados |
| Formulario estructurado de **reglas pedagógicas** y creación de ejercicios con **respuestas parametrizadas** | [`/docente/crear-tema`](app/docente/crear-tema/page.tsx) y [`/docente/ejercicios`](app/docente/ejercicios/page.tsx) |
| **Validador matemático en servidor** antes de almacenar | [`lib/docente/validador.ts`](lib/docente/validador.ts) + [`/api/docente/ejercicios/validar`](app/api/docente/ejercicios/validar/route.ts) |
| Vistas `/docente/curriculo`, `/docente/crear-tema`, `/docente/ejercicios` | Las tres, funcionales y verificadas por HTTP |
| Endpoints `/api/docente/temas` y `/api/docente/ejercicios` | Los dos, más `materias`, `[id]` y `validar` (7 rutas) |
| Esquema y **migraciones de Prisma** para el catálogo dinámico | [`prisma/migrations/20260901120000_hito1_autoria_docente`](prisma/migrations/20260901120000_hito1_autoria_docente/migration.sql) |
| RBAC jerárquico SUPERADMIN · DIRECTOR · DOCENTE · ESTUDIANTE (§2 del pliego) | [`lib/rbac.ts`](lib/rbac.ts), middleware y todas las rutas nuevas |

---

## 2. La idea que sostiene el hito

En el PMV 1 el currículo estaba **escrito en el código**: cinco temas fijos en un
`enum` y un catálogo de reglas cargado por semilla. El HITO 1 lo invierte: el
currículo pasa a ser **dato que el docente crea, edita y publica**, y el `enum`
`Tema` deja de significar «los temas que existen» para significar «los motores
deterministas que saben calificar».

De ahí sale toda la arquitectura:

> Un tema creado por un profesor puede **apoyarse en un motor** —y entonces sus
> ejercicios se corrigen solos, con matemática garantizada— o **no apoyarse en
> ninguno**, y entonces la plataforma lo dice, en vez de fingir una corrección
> que nadie puede respaldar.

Esa honestidad es la misma regla que gobernaba la corrección del alumno en el
PMV 1, aplicada ahora a la autoría.

### Lo que el docente gana, en concreto

- Escribe sus temas, con subtemas, objetivos, etiquetas y estado (borrador →
  publicado → archivado). Lo que está en borrador **no llega a ningún alumno**.
- Escribe reglas pedagógicas de cuatro clases —regla, propiedad, estrategia y
  **error frecuente**— con su notación en LaTeX y su vista previa compuesta
  mientras escribe.
- Sube ejercicios **sueltos** o **plantillas parametrizadas**: de
  `{a}x + {b} = {c}` con `a ∈ [2,5]`, `b ∈ [-4,4]`, `c ∈ [6,14]` salen 243
  ejercicios distintos con su respuesta exacta cada uno.
- Y, sobre todo: **el servidor no le deja guardar matemática incorrecta.**

---

## 3. El validador matemático (el corazón del hito)

Un ejercicio tiene, como mucho, tres fuentes de verdad:

1. la respuesta que **escribe** el docente,
2. la **fórmula** de respuesta de la plantilla, evaluada con aritmética exacta
   (7/2 es 7/2, no 3,4999…),
3. la solución que **calcula el motor determinista** (PRE Light) a partir del
   enunciado.

El validador las enfrenta entre sí y **bloquea el guardado** si no coinciden,
mostrando los números concretos:

```
✗ 2x + 1 = 8 (a=2, b=1, c=8): El motor calcula 7/2 y la respuesta indicada es -7/2.
✗ 3x + 1 = 9 (a=3, b=1, c=9): El motor calcula 8/3 y la respuesta indicada es -8/3.
   …y 6 combinación(es) más con el mismo problema.
```

Comprobaciones que hace, en orden:

| Comprobación | Ejemplo de lo que atrapa |
| --- | --- |
| Estructura del enunciado | `3(x + 5 = 20` → «Queda un "(" sin cerrar» |
| Coherencia de la plantilla | huecos sin declarar, parámetros sin usar, rangos vacíos |
| **Barrido de combinaciones** | con ≤ 240 combinaciones las prueba **todas**; con más, una muestra **reproducible** de 24 |
| División por cero y casos degenerados | un rango que permite `a = 0` en `{b}/{a}` se rechaza |
| Acuerdo entre respuesta y motor | la discrepancia bloquea el guardado |
| Respuesta ausente | si el tema tiene motor, **la calcula el servidor** y el ejercicio queda verificado |
| Sin motor | se guarda, se marca **«sin verificar»** y se explica por qué |
| Pistas | avisa si una pista contiene la respuesta en lugar del método |

Dos consecuencias de diseño que conviene subrayar:

- **El motor lo hereda el ejercicio DEL TEMA, nunca del formulario.** Si se
  aceptara del cliente, bastaría con declarar el motor más conveniente para que
  un ejercicio pasara por verificado en un tema que no lo corrige.
- **Se revalida en cada edición**, aunque el cambio parezca inocente: tocar el
  rango de un parámetro basta para que una plantilla que cuadraba deje de
  cuadrar. Y si cambia el enunciado sin tocar la respuesta, la respuesta
  guardada se considera caduca y la recalcula el motor.

La IA **no interviene en ningún punto** de esta validación.

---

## 4. Modelo de datos y migración

Se han **ampliado los modelos existentes** en lugar de crear tablas paralelas:
dos tablas para el mismo concepto acaban divergiendo y obligan a decidir, en
cada consulta, cuál de las dos es la buena.

| Modelo | Cambio |
| --- | --- |
| `Materia` | pasa a ser la **asignatura** del gestor: descripción, color, orden, activa, y la relación con sus temas |
| `NodoConocimiento` | es **el tema del currículo**: `motor` (antes `tema`, ahora opcional), asignatura, estado, autor, objetivos, etiquetas y fechas |
| `ReglaMatematica` | cuelga de su tema (`nodoId`), gana `tipo`, `estado` y autor; hereda motor y estado del tema |
| `Ejercicio` | gana autoría, estado, `plantilla`, `parametros`, `respuestaFormula`, `pistas` e `informeValidacion` |
| `Rol` | `ADMIN` → `SUPERADMIN`, y aparece `DIRECTOR` |
| `OrigenContenido` | aparece `DOCENTE`, junto a `DETERMINISTA` e `IA` |

### La migración está escrita a mano en tres puntos, y esto importa

`prisma migrate dev` habría generado una migración **destructiva**:

1. **El enum `Rol`.** Prisma recrea el tipo y castea con `"rol"::text::"Rol_new"`,
   lo que **revienta** en cuanto existe una cuenta `ADMIN`. Aquí se renombra el
   valor: la cuenta de administración del PMV 1 sigue siendo la misma fila.
2. **Las columnas `tema`.** Prisma las borra y crea `motor` vacía: el árbol de
   conocimiento y el banco de ejercicios perderían su vínculo con el motor.
   Aquí se **renombran**.
3. **El estado del contenido.** `estado` nace con `BORRADOR` —lo correcto para
   lo que se cree desde el panel—, pero aplicarlo al contenido del PMV 1
   habría **despublicado el temario entero**. Se backfillea a `PUBLICADO`.

**Verificado sobre una base con datos del PMV 1** (cuenta ADMIN, nodos y
ejercicios con su `tema`, reglas y fechas antiguas):

```
1. la cuenta ADMIN es ahora SUPERADMIN ....... SUPERADMIN
2. el enum Rol tiene los 4 valores .......... ESTUDIANTE,DOCENTE,SUPERADMIN,DIRECTOR
3. el nodo conserva su motor ................ DERIVADAS
4. el temario sigue publicado ............... PUBLICADO
5. los nodos quedan bajo su asignatura ...... 2 de 2
6. el ejercicio conserva motor y respuesta .. DERIVADAS / 12x³ / PUBLICADO
7. no se refecha lo antiguo ................. actualizadoEn = creadoEn (30 días atrás)
8. la regla conserva su motor ............... DERIVADAS · estado PUBLICADO
9. el origen DOCENTE ya existe .............. DETERMINISTA,IA,DOCENTE
```

Y `prisma migrate diff` confirma que la migración escrita a mano deja **el
esquema exacto** que espera el modelo (`-- This is an empty migration.`), tanto
sobre una base nueva como sobre una actualizada desde el PMV 1.

---

## 5. Control de acceso

| Rol | Zona | Currículo |
| --- | --- | --- |
| `ESTUDIANTE` | `/estudiante` | — |
| `DOCENTE` | `/docente` | **lee y escribe** |
| `DIRECTOR` | `/docente` | **sólo lee** (supervisión) |
| `SUPERADMIN` | todas | lee y escribe |

El director **no edita el currículo**: un director que pueda reescribir los temas
de sus profesores convierte la autoría docente en una promesa condicional. La
regla no vive en un botón oculto —vive en el servidor— y está comprobada por
HTTP: un director autenticado recibe **403** al intentar crear un tema o borrar
un ejercicio.

---

## 6. Cómo probarlo

```bash
npm install
cp .env.example .env          # rellena DATABASE_URL, DIRECT_URL y AUTH_SECRET
npm run db:deploy             # aplica las migraciones
npm run db:seed               # siembra el catálogo base y los usuarios
npm run dev
```

Usuarios de demostración (cámbialos antes de cualquier despliegue público):

| Rol | Correo | Contraseña |
| --- | --- | --- |
| SUPERADMIN | `admin@mentoriamath.local` | `Admin-2026` |
| DIRECTOR | `director@mentoriamath.local` | `Director-2026` |
| DOCENTE | `docente@mentoriamath.local` | `Docente-2026` |

### Recorrido de aceptación (5 minutos)

1. Entra como **DOCENTE** → `/docente`. Verás la portada de autoría con lo que
   hay en cada sección.
2. **Currículo** → «Nueva asignatura» → crea *Álgebra*.
3. **Crear tema** → título *Ecuaciones de primer grado*, asignatura *Álgebra*,
   motor **Ecuaciones lineales**, estado **Publicado**. Añade una regla con
   enunciado `ax + b = c`: la verás compuesta debajo mientras escribes.
4. **Ejercicios** → tema *Ecuaciones de primer grado*, enunciado `3x + 5 = 20`,
   respuesta **6** → pulsa **Validar**.
   → *«El motor calcula 5 y la respuesta indicada es 6»*. **No se puede guardar.**
5. Cambia la respuesta a **5** → Validar → *Verificado por el motor
   determinista* → **Guardar**.
6. Deja la respuesta **vacía** con enunciado `2x = 7` → Validar → el servidor la
   calcula: **7/2** (exacta, no 3,5).
7. Marca **plantilla**, enunciado `{a}x + {b} = {c}`, fórmula `({c} - {b}) / {a}`,
   parámetros `a: 2–5`, `b: -4–4`, `c: 6–14` → Validar → verás las combinaciones
   comprobadas una a una.
8. Ahora pon `a: 0–5` → Validar → el validador **rechaza** el rango: con `a = 0`
   la fórmula divide por cero.
9. Sal y entra como **DIRECTOR**: ves el currículo completo, sin botones de
   edición.

---

## 7. Verificación ejecutada

Todo lo siguiente se ha ejecutado en esta entrega, contra PostgreSQL 16 real y
la aplicación compilada en modo producción:

| Batería | Resultado |
| --- | --- |
| `npm run qa:hito1` — **nueva** | **104 comprobaciones · 0 fallidas** |
| `qa/leccion.mjs` (PMV 1, lección) | 809 · 0 |
| `qa/diagnostico.mjs` (PMV 1, banco) | 124 · 0 |
| `qa/paso1.mjs` (PMV 1, roles y registro) | 72 · 0 |
| `qa/frontend.mjs` (PMV 1, arranque) | 10 · 0 |
| `npx tsc --noEmit` | sin errores |
| `npm run build` | compila; las 3 vistas nuevas entran en el bundle |
| `prisma migrate deploy` (base nueva) | 4 migraciones aplicadas |
| `prisma migrate deploy` (base con datos del PMV 1) | sin pérdida de datos (§4) |

La batería `qa/hito1.mjs` cubre, además de las funciones puras, **el ciclo
completo por HTTP con sesión iniciada**: crear asignatura → crear tema con su
regla → comprobar que la regla hereda motor y estado tal como los busca la
lección → renderizar las cuatro vistas → validar en seco → rechazar el ejercicio
incorrecto (422) → guardar el correcto → guardar una plantilla parametrizada →
detectar el duplicado (409) → editar recalculando la respuesta → seguir
rechazando una respuesta equivocada (422) → revalidar el banco entero al cambiar
el motor del tema → impedir el ciclo en el árbol (409) → comprobar la frontera
del director (403 al escribir, 200 al leer) → borrar y limpiar.

> Nota: el PMV 1 declaraba que «lo que necesita sesión iniciada queda fuera del
> alcance de una batería sin navegador». Ya no: la batería del HITO 1 inicia
> sesión contra NextAuth (CSRF + credenciales) y prueba las rutas protegidas de
> verdad. Es la base sobre la que el HITO 4 montará la suite completa.

Las baterías que consumen cuota de Gemini (`qa.mjs`, `aceptacion.mjs`,
`sesiones.mjs`, `barrido.mjs`) **no** se han ejecutado en esta entrega para no
gastar la cuota del cliente; no dependen de nada que el HITO 1 haya tocado.

---

## 8. Lo que NO entra en este hito

Se declara para que no haya sorpresas de alcance:

- **La pizarra animada y el avatar reactivo** son el HITO 2. Lo que el HITO 1
  deja preparado: los ejercicios guardan sus **pasos de resolución
  deterministas** cuando el motor sabe producirlos, que es el material con el
  que la animación se construirá sin llamar a la IA.
- **Instituciones, aulas y tareas** son el HITO 3. El HITO 1 introduce el rol
  `DIRECTOR` y la asignatura como contenedor, que son sus cimientos.
- **Reportes PDF/Excel y alertas** son el HITO 4.
- El **motor determinista sigue cubriendo cinco familias** (aritmética,
  fracciones, ecuaciones lineales, factorización y derivadas). Un tema de un
  docente fuera de esas familias se crea y se enseña igual, pero sus ejercicios
  se guardan sin verificación automática y así se indica en pantalla. Ampliar el
  motor no formaba parte de este hito.

---

## 9. Ficheros de esta entrega

**Nuevos**

```
lib/docente/validador.ts        el validador matemático en servidor
lib/docente/parametros.ts       plantillas parametrizadas y muestreo determinista
lib/docente/curriculo.ts        esquemas de validación, claves y árbol
lib/docente/temas.ts            persistencia compartida de temas y reglas
lib/docente/ejercicios.ts       informe de validación → fila del banco
lib/docente/api.ts              sesión, parseo y errores de /api/docente
lib/docente/cliente.ts          puente de los formularios con la API

app/api/docente/materias/route.ts + [id]/route.ts
app/api/docente/temas/route.ts + [id]/route.ts
app/api/docente/ejercicios/route.ts + [id]/route.ts + validar/route.ts

app/docente/curriculo/page.tsx
app/docente/crear-tema/page.tsx
app/docente/ejercicios/page.tsx
components/docente/gestor-curriculo.tsx
components/docente/formulario-tema.tsx
components/docente/gestor-ejercicios.tsx
components/docente/navegacion.tsx
components/ui/{textarea,select,badge}.tsx

prisma/migrations/20260901120000_hito1_autoria_docente/migration.sql
qa/hito1.mjs                    104 comprobaciones
ENTREGA_HITO1.md                este documento
```

**Modificados**

```
prisma/schema.prisma            catálogo dinámico, roles y autoría
prisma/seed.ts                  asignatura, estados, reglas por tema y 3 roles
lib/rbac.ts                     cuatro roles jerárquicos
lib/leccion/temas.ts            traducción motor ↔ clave del solver
app/docente/page.tsx            portada de autoría
app/estudiante/leccion/page.tsx sólo suben a la lección las reglas publicadas
app/api/registro/route.ts       comentario de roles al día
package.json                    `qa:hito1` incorporado a `npm test`
```
