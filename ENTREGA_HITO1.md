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
| `npm run qa:hito1` — **nueva** | **116 comprobaciones · 0 fallidas** |
| `npm run qa:matematicas` — **nueva** | **100 comprobaciones · 0 fallidas** |
| `npm run qa:diagnostico-nivel` — **nueva** | **94 comprobaciones · 0 fallidas** |
| `qa/leccion.mjs` (PMV 1, lección) | 811 · 0 |
| `qa/diagnostico.mjs` (banco, por nivel y etapa) | 416 · 0 |
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
qa/hito1.mjs                    108 comprobaciones
qa/matematicas.mjs              100 comprobaciones (ampliación)
ENTREGA_HITO1.md                este documento
```

---

## 10. Ampliación tras la verificación del cliente

Al revisar el hito, el cliente encontró el límite exacto del motor heredado: la
autoría funcionaba con polinomios, pero **una derivada con funciones
trascendentes —`e^x`, `ln(x)`— se marcaba como "no comprobable"**. Pidió tres
cosas, y las tres están resueltas.

### 1. El analizador entiende e^x y ln(x)

El motor del PMV 1 leía las expresiones con expresiones regulares: buscaba
"coeficiente + variable + exponente". `e^x` no era una función que no supiera
derivar, era texto que no encajaba en el patrón. Parchear el patrón sólo habría
movido el límite un poco más allá, así que se ha hecho lo que faltaba: leer la
expresión como una **gramática**.

`lib/matematicas/expresiones.ts` convierte el texto en un árbol —números,
variables, constantes `e` y `π`, superíndices Unicode, multiplicación implícita,
llaves de LaTeX, y las funciones `ln`, `log`, `exp`, `sqrt`, `sin`, `cos`,
`tan`, con o sin paréntesis— y `lib/matematicas/derivar.ts` deriva sobre él.

### 2. Regla del producto y del cociente, verificadas

Al derivar sobre la estructura, las reglas se componen solas:

| Ejercicio | El motor calcula | Reglas que declara haber aplicado |
| --- | --- | --- |
| `x·ln(x)` | `ln(x) + 1` | producto · logaritmo |
| `ln(x)/x` | `(1 - ln(x))/x²` | cociente · logaritmo |
| `(x² + 1)/(x - 3)` | `(2x·(x - 3) - (x² + 1))/(x - 3)²` | cociente · suma · potencia |
| `e^(2x)` | `2e^(2x)` | exponencial · cadena |
| `ln(x² + 1)` | `2x/(x² + 1)` | cadena · logaritmo |
| `x^x` | `(ln(x) + 1)x^x` | derivación logarítmica |

Las reglas aplicadas se guardan en el informe del ejercicio y se muestran en
pantalla: el docente ve **con qué** se ha comprobado su ejercicio, no sólo que
salió bien.

### 3. La corrección acepta respuestas equivalentes

Se dejan de comparar cadenas y se comparan **funciones**: dos respuestas son la
misma si valen lo mismo, evaluadas en varios puntos. Con eso, `e^x + 2x` y
`2x + e^x` dejan de ser respuestas distintas, y con ellas `12x^3` y `12x³`,
`7/2` y `3.5`, `f'(x) = e^x` y `e^x`, o `2e^x` y `e^x + e^x`.

Dos cosas se han conservado a propósito:

- **La forma sigue importando donde el ejercicio ES la forma.** Si se pedía
  factorizar y el alumno entrega `x² - 9`, se rechaza: vale lo mismo que
  `(x - 3)(x + 3)` y no es la respuesta a lo que se preguntaba.
- **Las respuestas en prosa** —"la respuesta es 4", "8 metros/segundo"— las
  sigue interpretando el corrector del PMV 1, que sabe leerlas.

### Comprobado contra las matemáticas, no contra lo que yo recuerde

Además de las comprobaciones caso a caso, la batería deriva 16 funciones y
compara cada derivada con la **pendiente numérica real** de su función
(diferencia centrada). Si una regla estuviera mal escrita, la comparación
fallaría aunque el resultado coincidiera con lo que la prueba esperaba.

### Ficheros de la ampliación

```
lib/matematicas/expresiones.ts   analizador: texto → árbol (nuevo)
lib/matematicas/derivar.ts       reglas de derivación y simplificación (nuevo)
lib/matematicas/equivalencia.ts  ¿son la misma respuesta? (nuevo)
lib/matematicas/index.ts         lo que era lib/matematicas.ts, más el LaTeX
                                 de ln, log, sen, cos, tan, sqrt y exp
lib/leccion/correccion.ts        el solver de derivadas usa el motor nuevo
lib/docente/validador.ts         compara por equivalencia y guarda las reglas
app/api/practica/corregir/…      el alumno también se beneficia
qa/matematicas.mjs               100 comprobaciones (nuevo)
```

Nota de alcance: el motor sigue **sin** cubrir integrales, límites ni
trigonometría inversa. Lo que hay ahora es lo que se pidió —derivadas con
exponenciales, logaritmos, producto, cociente y cadena— más raíz y
trigonometría básica, que salían gratis al derivar sobre el árbol.

---

## 11. Segunda observación del cliente: la prueba, ajustada al curso

> "Al loguearse un alumno e indicar su grado escolar (ej. 3.º de secundaria), la
> prueba diagnóstica le presenta derivadas en lugar de contenidos acordes a su
> nivel."

Tenía razón, y la causa era estructural: el diagnóstico del PMV 1 era **una sola
lista** de cinco preguntas —una por cada tema del motor, derivadas incluidas—
que se servía entera a todo el mundo. El alumno declaraba su curso al
registrarse y ese dato no se usaba para nada.

### 1. El currículo se clasifica por nivel, y el docente lo ve

El nivel ya existía en los formularios; lo que faltaba era que sirviera para
algo y que se notara:

- El ejercicio **hereda el nivel de su tema** al elegirlo, que es justo el paso
  que se olvida cuando hay que marcarlo a mano cada vez.
- El banco tiene **filtro por nivel**, y cada ejercicio que cumple las
  condiciones lleva la etiqueta **"Entra en el diagnóstico"**.
- El currículo cuenta los **temas sin nivel**, que son los que no llegan a
  ningún alumno por esta vía.

### 2. La prueba se compone por nivel, en `app/api/diagnostico/route.ts`

El nivel de partida sale, por este orden: del nivel ya diagnosticado, del
**curso declarado** al registrarse, o —si no hay nada— de lo básico. Con él se
arma la prueba a partir de dos fuentes:

| Fuente | Qué aporta |
| --- | --- |
| Catálogo (`preguntas_diagnostico`) | Preguntas de opción múltiple calibradas por nivel |
| Banco del docente (`ejercicios`) | Lo que ha publicado y verificado el profesorado para ese nivel, de respuesta abierta |

Del banco entran como máximo 3 de las 5, y sólo ejercicios **publicados,
verificados por el motor y sin huecos de plantilla**: son los únicos que el
servidor puede corregir sin margen de duda. Las dos fuentes se reparten **por
tema**, para que la prueba no acabe midiendo un solo asunto.

La corrección recompone la prueba en el servidor y sólo admite esas preguntas:
no se acepta la lista que envía el navegador, porque bastaría con mandar las
fáciles.

### 3. Preguntas base sembradas en los tres niveles

`prisma/seed-data/preguntas-diagnostico.json` pasa de 5 preguntas a **15: cinco
por nivel**. Se sembraron cinco y no las tres o cuatro pedidas para que la regla
de corte acordada con el cliente —0-2 básico · 3-4 intermedio · 5 avanzado—
siga contando sobre cinco exactamente igual que antes.

| Nivel | Temas que se preguntan |
| --- | --- |
| Básico | aritmética, fracciones, ecuaciones lineales |
| Intermedio | aritmética, fracciones, ecuaciones lineales, factorización |
| Avanzado | factorización, derivadas, ecuaciones lineales |

**Las derivadas sólo aparecen en el nivel avanzado.**

### 4. El curso deja de escribirse a mano

El registro pedía "Ciclo" y "Grado" en dos campos de texto libre. Ahora es una
lista cerrada de cursos —de 1.º de primaria a preuniversitario—, porque de ese
dato depende qué prueba se compone y "3º" escrito de seis maneras son seis
alumnos que no se pueden clasificar. El mapeo tolera igualmente lo que ya
estuviera guardado ("3.º de secundaria", "tercero", "3 ESO").

### Comprobado de punta a punta

`npm run qa:diagnostico-nivel` registra alumnos de verdad contra el servidor y
comprueba el caso exacto del cliente:

```
✓ se registra un alumno de 3.º de secundaria
✓ la prueba se arma con nivel INTERMEDIO
✓ el servidor dice que el nivel sale del curso declarado
✓ NO le aparece ninguna pregunta de derivadas (el fallo reportado)
✓ un alumno de bachillerato SÍ recibe nivel avanzado, y en su prueba sí hay derivadas
✓ sin curso declarado, la prueba es de nivel básico
```

### Ficheros

```
lib/curriculo/etapas.ts          taxonomía curricular: etapa, curso y alcance
lib/diagnostico/seleccion.ts     composición de la prueba, con reparto por tema (nuevo)
lib/diagnostico/prueba.ts        la prueba de un alumno, leída de la base (nuevo)
lib/diagnostico/banco.ts         el catálogo declara nivel; equilibrio por nivel
app/api/diagnostico/route.ts     compone y corrige por nivel
app/estudiante/diagnostico/…     la página usa la misma composición que la API
components/formulario-diagnostico.tsx  admite respuestas abiertas del banco
components/formulario-registro.tsx     el curso se elige de una lista
prisma/seed-data/preguntas-diagnostico.json  15 preguntas, 5 por nivel
qa/diagnostico-nivel.mjs         62 comprobaciones (nuevo)
qa/sesion.mjs                    inicio de sesión compartido por las baterías
```

---

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

---

## 12. Tercera observación: la taxonomía curricular

> "El campo actual Nivel (Básico, Intermedio, Avanzado) sólo indica complejidad
> relativa interna, pero no el nivel educativo del estudiante."

Exacto, y ahí estaba el fondo del problema. El sistema tenía **un solo eje** y lo
usaba para dos cosas incompatibles: graduar la dificultad y decidir qué
contenidos le tocan a cada alumno. Por eso un chico de secundaria que respondía
bien acababa recibiendo derivadas: "avanzado" no significa "universitario",
significa "lo más difícil de lo tuyo".

### Los dos ejes, separados

| Eje | Qué dice | Quién lo pone |
| --- | --- | --- |
| **Etapa + curso** | Dónde está el alumno: Secundaria 3.er año, Superior 2.º ciclo | El alumno, al configurar su perfil |
| **Nivel** (Básico/Intermedio/Avanzado) | Cuánto cuesta un contenido dentro de su etapa | El docente al crearlo; el diagnóstico al medir |

`EtapaEducativa` es un enum nuevo —PRIMARIA (1.º a 6.º grado), SECUNDARIA (1.º a
5.º año), SUPERIOR (1.º a 10.º ciclo)— y viaja en el modelo de **temas,
ejercicios, preguntas del diagnóstico y perfil del alumno**.

### El alcance se lee "a partir de"

Un contenido declara `etapa` y `cursoMin`. La factorización, marcada como
Secundaria 3.º, se plantea desde 3.º de secundaria **y también en Superior**: lo
que se estudia antes sigue valiendo después, como en cualquier temario. Lo que
no ocurre nunca es lo contrario:

```
Secundaria 3.er año  →  derivadas: NO   ·  factorización: sí  ·  transversal: sí
Secundaria 1.er año  →  derivadas: NO   ·  factorización: no  ·  transversal: sí
Superior 2.º ciclo   →  derivadas: sí   ·  factorización: sí  ·  transversal: sí
Primaria 5.º grado   →  derivadas: NO   ·  factorización: no  ·  transversal: sí
```

Un contenido sin etapa es **transversal** y le llega a cualquiera. Es lo que
permitió introducir la taxonomía sin dejar a nadie sin temario mientras el
profesorado clasifica lo suyo.

### La pantalla de configuración

`/estudiante/nivel-educativo`, en dos pasos —etapa y curso— tal como estaba
planteada: tarjetas para PRIMARIA / SECUNDARIA / SUPERIOR y los cursos que
corresponden a cada una, con el resumen ("Estás configurando tu nivel como:
Secundaria · 3.er Año") antes de finalizar.

Se pregunta **una vez**, después del registro y antes de la evaluación inicial, y
se puede volver a ella al cambiar de curso. El registro dejó de pedir "ciclo" y
"grado" en texto libre: de ese dato depende todo lo que el alumno recibe, y
escondido al final de un formulario de alta se rellenaba a la ligera.

Un alumno sin etapa declarada no recibe una prueba de un temario que no es el
suyo: se le lleva a configurarla. Las cuentas del PMV 1, que tienen el curso en
texto, se interpretan automáticamente ("Secundaria" + "3.º" → SECUNDARIA 3).

### En el panel docente

- El formulario de tema tiene **Alcance curricular**: etapa y curso a partir del
  cual se plantea, con la explicación de en qué se diferencia del nivel.
- Los **subtemas heredan el alcance** del tema padre, igual que el motor.
- Los **ejercicios heredan el alcance de su tema**: es el tema quien sabe a qué
  alumnos va dirigido, y duplicar el dato sólo daría ocasión de que se
  contradigan.
- El listado del currículo muestra el alcance de cada tema y **filtra por
  etapa**; el banco muestra el alcance heredado de cada ejercicio.

### El contenido sembrado, clasificado

Las 18 preguntas del catálogo declaran su etapa y su curso, y las 394 del banco
determinista heredan el alcance de su motor:

| Motor | A partir de |
| --- | --- |
| Aritmética | Primaria 1.º |
| Fracciones | Primaria 4.º |
| Ecuaciones lineales | Secundaria 1.º |
| Factorización | Secundaria 3.º |
| **Derivadas** | **Superior 1.º** |

### Comprobado

`npm run qa:diagnostico-nivel` — **85 comprobaciones** — registra alumnos reales
contra el servidor, les configura la etapa por la pantalla nueva y comprueba lo
que se pidió:

```
✓ el servidor reconoce su etapa y su curso
✓ NO le aparece ninguna pregunta de derivadas (el fallo reportado)
✓ un alumno de superior recibe dificultad avanzada, y en su prueba SÍ hay derivadas
✓ un alumno de primaria no ve ni derivadas ni factorización
✓ una cuenta antigua con el curso en texto también se clasifica
✓ un curso imposible se rechaza (secundaria no tiene 8.º año)
✓ sin etapa declarada, el servidor pide configurarla
```

Y, de paso, la batería del banco descubrió que el evaluador aritmético heredado
calculaba mal las potencias —`2^3 + 1` daba 4— y no sabía leer `5·(-3)`. Ahora se
contrasta con el analizador nuevo: si discrepan manda el que tiene gramática, y
si coinciden se conserva la fracción exacta del heredado.

### Ficheros de esta ampliación

```
lib/curriculo/etapas.ts                       la taxonomía y el alcance (nuevo)
components/configurador-nivel-educativo.tsx   la pantalla de dos pasos (nuevo)
app/estudiante/nivel-educativo/page.tsx       su ruta (nuevo)
app/api/estudiante/nivel-educativo/route.ts   guardar etapa y curso (nuevo)
prisma/migrations/20260902140000_taxonomia_curricular
lib/diagnostico/seleccion.ts   filtra por etapa además de por nivel
lib/diagnostico/prueba.ts      consulta y compone con el curso del alumno
lib/leccion/correccion.ts      aritmética contrastada entre los dos motores
components/docente/*           alcance en el formulario, la tabla y el banco
qa/diagnostico-nivel.mjs       85 comprobaciones
```

---

## 13. Cuarta observación: la lección listaba todo el temario

> "Me registré con un perfil de 6.º de Primaria, pero al ingresar a la vista de
> Lección interactiva el sistema lista todos los temas disponibles sin
> discriminar la etapa del alumno."

Cierto, y el diagnóstico era acertado: la vista pintaba sus tarjetas a partir de
`TEMAS_LECCION`, la lista de los cinco motores **escrita en el código**, sin
consultar el currículo ni el curso del alumno. La taxonomía ya filtraba la
evaluación inicial, pero esta pantalla se había quedado fuera.

### La lista se pregunta al currículo

`lib/leccion/disponibles.ts` responde a "qué temas puede ver este alumno": un
motor se ofrece si existe al menos un tema **PUBLICADO** que lo use y cuyo
**alcance cubra** a ese alumno. Lo que el docente clasifica es exactamente lo que
el alumno recibe.

| Alumno | Temas que ve |
| --- | --- |
| Primaria · 6.º | Aritmética, Fracciones |
| Secundaria · 3.er año | + Ecuaciones lineales, Factorización |
| Superior · 2.º ciclo | + Derivadas |

La pantalla dice además de dónde sale la lista —*"Temas publicados para tu
curso: Primaria · 6.º Grado"*—: un alumno que no ve derivadas tiene derecho a
saber por qué.

### Y el servidor lo impide, no sólo la pantalla

`/api/sesion` comprueba el alcance antes de abrir una sesión de lección:

```
POST /api/sesion {"tema":"derivadas"}   → 403   (alumno de 6.º de primaria)
POST /api/sesion {"tema":"aritmetica"}  → 200
```

Una comprobación que sólo vive en la interfaz no es una comprobación: basta con
repetir la petición a mano para saltarla. El catálogo de reglas que viaja al
navegador se recorta igual, para no mandarle el temario de cursos que no son
suyos.

Dos decisiones deliberadas:

- **Sin temas para su curso**, la pantalla lo dice con su curso por delante, en
  lugar de quedarse en blanco.
- **Si la base de datos no responde**, no se restringe nada. Dejar a un alumno
  sin lección por un fallo de infraestructura es peor que enseñarle una tarjeta
  de más, y el resto de la vista ya está preparada para funcionar sin base.

### Ficheros

```
lib/leccion/disponibles.ts        qué temas le corresponden (nuevo)
app/estudiante/leccion/page.tsx   compone la lista y recorta las reglas
components/leccion/aula.tsx       pinta los temas que recibe, no los cinco fijos
app/api/sesion/route.ts           403 si el tema no es de su curso
qa/diagnostico-nivel.mjs          94 comprobaciones (9 nuevas, de esta vista)
```

---

## 14. Quinta observación: el formulario de reglas

Tres ajustes sobre `/docente/crear-tema`, los tres con el mismo hilo: que el
formulario no le pida al docente saber cómo funciona por dentro.

### La barra duplicada

El campo de enunciado formal mostraba en su texto de ayuda la fórmula con **dos
barras** —un descuido de escritura en la propia pantalla—, de modo que el
formulario enseñaba una sintaxis que después no se componía. Corregido el texto,
y añadido `normalizarLatex`: la barra doble se colapsa **sólo cuando le sigue
una letra**, que es la firma inequívoca de un copiado desde código. El salto de
línea legítimo de LaTeX va seguido de espacio o corchete y se respeta, así que
una matriz o un `egin{cases}` siguen componiéndose igual.

Se aplica en la vista previa y **al guardar**, en el alta y en la edición: lo que
se almacena es lo que verá el alumno en la pizarra.

### La jerarquía del nivel

Se planteaba la duda de si el nivel de la regla sobrescribe el del tema. La
decisión, ahora explícita en la interfaz: **hereda**. El desplegable dice
"Hereda del tema (Intermedio)" con el nivel vigente, y se guarda como heredado
—nulo— y no como una copia, de modo que al cambiar el nivel del tema sus reglas
lo siguen. La tarjeta explica además el alcance de ese campo: gradúa la
dificultad de los ejercicios de la regla, no decide a qué alumnos les llegan,
que es cosa de la etapa y el curso.

### La casilla de práctica

"Se puede practicar" sólo tiene sentido si hay motor que califique. Ahora la
casilla se **deshabilita y desmarca** cuando el tema está en "Sin motor", con el
texto explicando por qué; al elegir motor, se habilita y lo nombra. Y el
servidor lo garantiza en los tres caminos —alta, edición y cuando un tema pierde
su motor—, porque una comprobación que sólo vive en la interfaz se salta
repitiendo la petición.

### Comprobado

Ocho comprobaciones nuevas en `npm run qa:hito1` (116 en total): la barra doble
se corrige al guardar —enunciado y ejemplo—, el nivel vacío se guarda como
heredado, un tema con motor admite la práctica, uno sin motor la rechaza aunque
se pida por API, y quitarle el motor a un tema desmarca las suyas.
