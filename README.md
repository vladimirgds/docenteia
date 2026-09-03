# MentorIA Math

Plataforma educativa de matemáticas: un tutor que explica paso a paso, corrige
con un motor determinista en servidor (sin depender de la IA para la
matemática) y adapta cada lección al nivel real del estudiante.

Este repositorio contiene la migración del prototipo Node.js/Express a la
arquitectura del PMV 1 —**Next.js (App Router) + TypeScript + PostgreSQL**— y,
sobre ella, el **MVP 2**.

> **Estado: PMV 1 completo · MVP 2 HITO 1 completo.**
>
> El PMV 1 entregó la fundación, la persistencia, el control de roles, el
> diagnóstico inicial y la lección interactiva (motor pedagógico LSG en cuatro
> fases, avatar 2D, pizarra con KaTeX, voz en español y corrección determinista
> en servidor).
>
> El **HITO 1 del MVP 2** convierte el currículo en dato: el profesorado crea sus
> propios temas, reglas pedagógicas y ejercicios —incluidas plantillas
> parametrizadas— y un **validador matemático en servidor** comprueba la
> consistencia antes de guardar nada. Ver
> [`ENTREGA_HITO1.md`](ENTREGA_HITO1.md). Quedan los hitos 2 (pizarra animada y
> avatar), 3 (multi-tenancy y tareas) y 4 (reportes y QA final).

---

## Índice

1. [Requisitos](#requisitos)
2. [Puesta en marcha paso a paso](#puesta-en-marcha-paso-a-paso)
3. [Despliegue en Vercel](#despliegue-en-vercel)
4. [Variables de entorno](#variables-de-entorno)
5. [Comandos disponibles](#comandos-disponibles)
6. [Suite de validación (QA)](#suite-de-validación-qa)
7. [Arquitectura](#arquitectura)
8. [Modelo de datos](#modelo-de-datos)
9. [Autoría docente (MVP 2 · HITO 1)](#autoría-docente-mvp-2--hito-1)
10. [El diagnóstico inicial](#el-diagnóstico-inicial)
11. [Qué entra en el Paso 1 y qué no](#qué-entra-en-el-paso-1-y-qué-no)

---

## Requisitos

- **Node.js 18 o superior** (probado en Node 24).
- **PostgreSQL**: una instancia de Supabase o un PostgreSQL local.
- Una **API key de Google Gemini** (opcional en el Paso 1: sin ella la
  aplicación arranca en modo demostración y la suite de QA se ejecuta igual).

---

## Puesta en marcha paso a paso

### 1. Clonar e instalar

```bash
git clone https://github.com/vladimirgds/docenteia.git
cd docenteia
npm install
```

### 2. Configurar el entorno

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Abre `.env` y rellena, como mínimo, `DATABASE_URL`, `DIRECT_URL` y
`AUTH_SECRET`. Para generar el secreto:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> Se usa `.env` y no `.env.local` porque la CLI de Prisma **sólo lee `.env`**:
> con la configuración en `.env.local` las migraciones fallan. Así hay una sola
> copia de la configuración, que leen a la vez Next.js, Prisma y los scripts de
> `qa/`. Ninguno de los dos ficheros se sube al repositorio.

#### Si usas Supabase

En *Project Settings → Database → Connection string*:

- `DATABASE_URL` → cadena del **pooler**, puerto `6543`, añadiendo
  `?pgbouncer=true&connection_limit=1`.
- `DIRECT_URL` → cadena de **conexión directa**, puerto `5432`.

Prisma usa la primera para consultar y la segunda para migrar. Con un
PostgreSQL local, ambas son la misma cadena.

### 3. Crear las tablas

```bash
npx prisma migrate deploy     # aplica la migración incluida en el repositorio
npm run db:generate           # genera el cliente de Prisma
```

Durante el desarrollo, para crear migraciones nuevas:

```bash
npm run db:migrate            # equivale a: prisma migrate dev
```

### 4. Sembrar los datos base

```bash
npm run db:seed
```

Crea la materia, el árbol de conocimiento de los cinco temas, el banco de
preguntas del diagnóstico y dos usuarios que el registro público **no** puede
crear:

| Rol        | Correo                         | Contraseña      |
| ---------- | ------------------------------ | --------------- |
| SUPERADMIN | `admin@mentoriamath.local`     | `Admin-2026`    |
| DIRECTOR   | `director@mentoriamath.local`  | `Director-2026` |
| DOCENTE    | `docente@mentoriamath.local`   | `Docente-2026`  |

> **Cámbialas antes de cualquier despliegue.** Se pueden fijar por entorno con
> `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DIRECTOR_EMAIL`,
> `SEED_DIRECTOR_PASSWORD`, `SEED_DOCENTE_EMAIL` y `SEED_DOCENTE_PASSWORD`.

### 5. Levantar la aplicación

```bash
npm run dev
```

Abre **http://localhost:3000**.

### 6. Verificación del cierre del Hito 1

Los cuatro puntos comprometidos para el Paso 1, en el orden en que conviene
comprobarlos.

#### A. Flujo funcional: registro → diagnóstico → nivel → persistencia

1. Entra en `/registro` y crea una cuenta de estudiante.
2. Al terminar entras directamente en la **evaluación diagnóstica** (5 preguntas).
3. Responde y pulsa *Terminar evaluación*: el servidor corrige, aplica la regla
   de corte (0-2 Básico · 3-4 Intermedio · 5 Avanzado) y muestra el **nivel**.
4. En `/estudiante` verás el nivel y el historial, **leídos de PostgreSQL**.
5. Recarga la página o vuelve a entrar: el nivel sigue ahí. Eso es la persistencia.

Para comprobar que la corrección es real, no cosmética: repite el registro con
otra cuenta y responde a propósito 2 preguntas bien y 3 mal → debe salir
**Básico**. Con las 5 bien → **Avanzado**.

#### B. Control de roles (RBAC)

6. Sal y entra con el usuario **docente** de la semilla. En `/docente` verás al
   estudiante que acabas de crear, con su nivel.
7. Con ese mismo usuario, intenta abrir `/admin`: el sistema te devuelve a tu
   zona. Sin sesión, cualquier ruta protegida te manda a `/login`.
8. Entra como **admin** y abre `/admin`: verás el recuento de usuarios,
   preguntas activas, nodos del árbol y diagnósticos completados.

#### C. Persistencia en base de datos

```bash
npm run db:studio
```

Abre Prisma Studio y comprueba las tablas `usuarios`, `perfiles_estudiante`
(con `nivelActual` relleno), `intentos_diagnostico`, `respuestas_diagnostico` e
`historial_nivel`.

#### D. Paridad con el prototipo (suite de validación)

Con la aplicación levantada en otra terminal:

```bash
npm test
```

Debe terminar sin fallos. La última ejecución sobre esta versión da 2.617
comprobaciones aprobadas y 1.800 turnos de barrido sin una sola violación; el
detalle está en [Suite de validación](#suite-de-validación-qa).

---

## Despliegue en Vercel

La aplicación está lista para desplegarse sin configuración adicional: Next.js
se detecta solo y el `build` ya ejecuta `prisma generate`.

### 1. Base de datos

Crea un proyecto en [Supabase](https://supabase.com) (el plan gratuito basta
para un preview) y copia las dos cadenas de conexión desde
*Project Settings → Database → Connection string*.

### 2. Importar el repositorio

En Vercel: **Add New → Project → Import Git Repository**, elige el repositorio y
la rama que quieras previsualizar. No hace falta tocar los ajustes de build.

### 3. Variables de entorno

En *Settings → Environment Variables*, añade las tres obligatorias:

| Variable       | Valor                                                            |
| -------------- | ---------------------------------------------------------------- |
| `DATABASE_URL` | Cadena del **pooler** de Supabase, puerto `6543`, con `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL`   | Cadena **directa** de Supabase, puerto `5432`                    |
| `AUTH_SECRET`  | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

`GEMINI_API_KEY` es opcional: sin ella la aplicación arranca en modo
demostración, que es suficiente para revisar todo el Paso 1 (el diagnóstico es
determinista y no usa IA).

> El uso del **pooler** en `DATABASE_URL` no es opcional en serverless: cada
> función abre su propia conexión y una conexión directa agota el límite de
> PostgreSQL en cuanto hay algo de concurrencia.

### 4. Las tablas se crean solas

No hay que ejecutar nada a mano. El `package.json` define un script
`vercel-build`, que Vercel usa de forma automática cuando existe:

```
prisma generate && prisma migrate deploy && seed && next build
```

Es decir: cada despliegue aplica las migraciones pendientes y siembra los datos
base antes de compilar. La semilla es idempotente, así que repetirla en cada
despliegue no duplica nada.

> Por eso **`DIRECT_URL` es obligatoria**, no opcional: `prisma migrate deploy`
> no puede migrar a través del pooler y usa la conexión directa. Si falta, el
> despliegue falla con `Environment variable not found: DIRECT_URL`.

El script `build` normal (`prisma generate && next build`) se deja intacto para
el desarrollo local, donde no se quiere que compilar toque la base de datos.

### 5. Comprobar

Abre `https://<tu-despliegue>.vercel.app/api/health`. Responde con un
diagnóstico preciso en lugar de un simple ok/error:

| `base_datos`     | Qué significa                                      |
| ---------------- | -------------------------------------------------- |
| `ok`             | Todo listo, con el banco de preguntas cargado.     |
| `sin_configurar` | Faltan las variables de entorno.                   |
| `sin_migrar`     | La base responde pero no tiene las tablas.         |
| `sin_sembrar`    | Hay tablas, pero el banco de preguntas está vacío. |
| `error`          | La base no es alcanzable o las credenciales fallan.|

El campo `detalle` dice exactamente qué comando falta.

### Limitación conocida en serverless

Los contadores del limitador de peticiones y la caché de lecciones viven en la
memoria del proceso. En serverless cada instancia tiene la suya, así que los
topes se aplican **por instancia** y el tope diario global de llamadas a la IA
deja de ser global: con N instancias, el gasto máximo real es N veces el
configurado.

Para un preview de revisión es irrelevante. Para producción hay que respaldar
esos contadores en almacenamiento compartido (una tabla en PostgreSQL o Redis),
y así está anotado para el Paso 4.

---

## Variables de entorno

| Variable          | Obligatoria | Para qué sirve                                                        |
| ----------------- | ----------- | --------------------------------------------------------------------- |
| `DATABASE_URL`    | Sí          | Conexión de la aplicación a PostgreSQL (pooler en Supabase).           |
| `DIRECT_URL`      | Sí          | Conexión directa que usa Prisma para migrar.                          |
| `AUTH_SECRET`     | Sí          | Firma de la sesión de NextAuth.                                        |
| `AUTH_TRUST_HOST` | En la nube  | Necesaria detrás de un proxy (Vercel, Render).                        |
| `GEMINI_API_KEY`  | No          | Sin ella, la IA funciona en **modo demostración** (LSG simulado).      |
| `GEMINI_MODEL`    | No          | Por defecto `gemini-2.5-flash-lite`, con fallback automático.           |
| `BASE_URL`        | No          | URL contra la que corre la suite de QA. Por defecto `localhost:3000`.  |

Todas están documentadas con más detalle en [`.env.example`](.env.example).

> **Sobre Gemini:** Google retira modelos con frecuencia, así que el cliente
> lleva *fallback* automático: si un modelo devuelve 404, prueba el siguiente y
> recuerda cuál funcionó. Además, la API no está disponible en todas las
> regiones (`400 User location is not supported`) y, sin un proyecto de Google
> Cloud con **facturación activa**, los `429` son frecuentes.

---

## Comandos disponibles

| Comando               | Qué hace                                              |
| --------------------- | ----------------------------------------------------- |
| `npm run dev`         | Arranca la aplicación en desarrollo (puerto 3000).    |
| `npm run build`       | Genera el cliente de Prisma y compila para producción.|
| `npm start`           | Sirve la compilación de producción.                   |
| `npm run typecheck`   | Comprueba los tipos sin compilar.                     |
| `npm run db:migrate`  | Crea y aplica migraciones (desarrollo).               |
| `npm run db:deploy`   | Aplica migraciones existentes (producción).           |
| `npm run db:seed`     | Siembra datos base y usuarios de demostración.        |
| `npm run db:studio`   | Abre Prisma Studio para inspeccionar la base.         |
| `npm test`            | Ejecuta la suite de validación completa.              |
| `npm run qa:diagnostico` | Valida el banco de preguntas (no necesita servidor).|
| `npm run qa:hito1`    | Valida la autoría docente y el validador matemático.  |
| `npm run qa:matematicas` | Valida el analizador, la derivación y la equivalencia.|
| `npm run qa:diagnostico-nivel` | Valida que cada alumno recibe la prueba de su nivel.|
| `npm run legacy:start`| Arranca el prototipo Express original (puerto 3001).  |

---

## Suite de validación (QA)

La suite heredada del prototipo se conserva íntegra y **ya no depende de
Render**: corre contra `http://localhost:3000` o contra lo que indique
`BASE_URL`.

```bash
npm run dev      # en una terminal
npm test         # en otra
```

`npm test` empieza por una comprobación previa (`qa/preflight.mjs`) que verifica
que hay un servidor escuchando. Sin ella, una aplicación no arrancada se
manifiesta como una cascada de fallos de prueba, que es un síntoma engañoso.

| Batería               | Qué comprueba                                                       |
| --------------------- | ------------------------------------------------------------------- |
| `qa/diagnostico.mjs`  | El banco oficial de preguntas, contra el motor determinista.         |
| `qa/leccion.mjs`      | La lección multimodal: 4 fases, KaTeX, botones y corrección.         |
| `qa/qa.mjs`           | Lógica (clasificador, solver, saneo) y lecciones reales end-to-end.  |
| `qa/frontend.mjs`     | Funciones de decisión del frontend, sin servidor.                    |
| `qa/sesiones.mjs`     | Continuidad de tema a lo largo de una conversación.                  |
| `qa/aceptacion.mjs`   | Los casos de aceptación de los cinco temas garantizados.             |
| `qa/paso1.mjs`        | Contrato del Paso 1: regla de corte, rutas protegidas y registro.    |
| `qa/barrido.mjs`      | Barrido por propiedades: genera conversaciones y exige invariantes.  |

Resultado de la última ejecución completa sobre esta versión:

```
Banco de preguntas   124 aprobadas · 0 fallidas
Paso 1 (fundación)    72 aprobadas · 0 fallidas
Lección (Paso 2)     809 aprobadas · 0 fallidas
qa.mjs              1462 aprobadas · 0 fallidas
frontend.mjs          10 cargas    · 0 fallidas
sesiones.mjs         126 aprobadas · 0 fallidas
aceptacion.mjs        24 / 24 correctas
barrido.mjs          200 sesiones · 1800 turnos · 0 violaciones
```

Baterías sueltas y parámetros:

```bash
npm run qa:barrido
BASE_URL=http://localhost:3000 BARRIDO_TURNOS=10 BARRIDO_SEC=20 node qa/barrido.mjs
```

> `qa/qa.mjs` genera lecciones **reales con Gemini** cuando hay
> `GEMINI_API_KEY` configurada. Sin clave, funciona en modo demostración y no
> consume cuota.

---

## Arquitectura

```
Consulta (texto / voz)
        │
        ▼
 Clasificador de intención  →  resolver | aprender | explicar | practicar   (src/classifier.js)
        │
        ▼
 ¿Es un TEMA NÚCLEO?  ── SÍ ──→  MOTOR DETERMINISTA                         (src/lsgPrompt.js)
        │                        ecuaciones lineales · derivadas ·
        NO                       factorización · fracciones · aritmética
        │                        (0 coste de IA · matemática GARANTIZADA)
        ▼                                  │
 IA generativa (Gemini)  →  genera el LSG  │                                (src/geminiClient.js)
        │                                  │
        ▼                                  ▼
 PRE Light  →  valida y normaliza el LSG en pasos/módulos                   (src/preLight.js)
        │
        ▼
 Next.js  →  App Router, RSC, rutas de API                                  (app/)
```

### Por qué el núcleo sigue en JavaScript

`src/` contiene unas 5.000 líneas de lógica matemática validada en producción y
respaldada por la suite de QA. Reescribirlas en TypeScript habría sido
reescribir la pedagogía, que es justamente lo que este contrato pide **no**
hacer. En su lugar:

- El núcleo se mantiene tal cual y se declara su superficie pública en
  `src/queryCore.d.ts`.
- **Todo el código nuevo del PMV 1 es TypeScript en modo estricto** y consume
  ese núcleo con tipos.

### Paridad con el prototipo

El manejador de `/api/query` se extrajo a `src/queryCore.js`, un módulo
independiente del framework. Lo llaman **los dos** caminos:

- `app/api/query/route.ts` — la aplicación del PMV 1.
- `server.js` — el prototipo Express, que se conserva como referencia
  ejecutable (`npm run legacy:start`, puerto 3001).

Al compartir implementación no pueden divergir: la paridad algorítmica es
**estructural**, no algo que haya que verificar a mano tras cada cambio.

### Estructura del repositorio

```
app/                    Rutas y páginas (App Router)
  api/                    query · diagnostico · registro · health · auth
  api/docente/            MVP 2: materias · temas · ejercicios · validar
  estudiante/             panel, evaluación diagnóstica y lección
  docente/                panel, currículo, crear-tema y ejercicios
  admin/                  zona del superadministrador
components/             Componentes de UI (shadcn/ui) y KaTeX
  docente/                MVP 2: gestor curricular, formularios y validación
lib/                    prisma · rbac · diagnóstico · utilidades
  docente/                MVP 2: validador matemático, parámetros, currículo
  matematicas/            MVP 2: analizador de expresiones, derivación
                          simbólica y equivalencia de respuestas
prisma/                 schema.prisma · migraciones · semilla
src/                    NÚCLEO HEREDADO: classifier · preLight · lsgPrompt ·
                        geminiClient · queryCore  (+ declaraciones .d.ts)
public/                 Frontend del prototipo (referencia del Paso 3)
qa/                     Suite de validación
auth.ts / auth.config.ts / middleware.ts    Autenticación y RBAC
```

---

## Modelo de datos

14 tablas en cuatro bloques (ver [`prisma/schema.prisma`](prisma/schema.prisma)):

**Usuarios y roles**
`usuarios` con RBAC jerárquico de cuatro perfiles: `ESTUDIANTE`, `DOCENTE`,
`DIRECTOR` y `SUPERADMIN` (el `ADMIN` del PMV 1, renombrado sin perder cuentas).

**Perfil académico**
`perfiles_estudiante` (ciclo, grado, nivel vigente y metadatos de contexto que
se inyectan en cada consulta a la IA), `materias`, `perfil_materias` e
`historial_nivel`, que registra cada cambio de nivel con su motivo.

**Knowledge Tree**
`nodos_conocimiento` (árbol real, con padre e hijos), `ejercicios` (banco con
metadatos y marca de validado), `sesiones_aprendizaje`, `registros_progreso` y
`registros_error` (catálogo de debilidades frecuentes, acumulado por tipo).

**Currículo**
`reglas_matematicas`: el catálogo formal de reglas y propiedades de cada tema,
con su enunciado en LaTeX y una marca de si el motor puede calificar ejercicios
de ese tipo.

**Diagnóstico**
`preguntas_diagnostico`, `intentos_diagnostico` y `respuestas_diagnostico`.

### Sobre la autenticación

Se usa **NextAuth v5 (Auth.js)** con proveedor *Credentials* y estrategia JWT.
Esa combinación no utiliza las tablas `Account`/`Session`/`VerificationToken`
del adaptador de base de datos, así que no están en el esquema: no son tablas
muertas, sencillamente no intervienen.

El registro público crea **siempre** usuarios `ESTUDIANTE`. El rol nunca se
acepta desde el cuerpo de la petición: un registro abierto que permita elegir
`ADMIN` es una escalada de privilegios servida en bandeja. Los perfiles docente
y administrador los crea la semilla o un administrador.

---

## Autoría docente (MVP 2 · HITO 1)

El currículo deja de estar escrito en el código y pasa a escribirlo el
profesorado. Documento completo de entrega:
[`ENTREGA_HITO1.md`](ENTREGA_HITO1.md).

### Las tres vistas

| Ruta | Para qué |
| --- | --- |
| `/docente/curriculo` | Asignaturas y árbol de temas: crear, categorizar, publicar y archivar. |
| `/docente/crear-tema` | Formulario estructurado del tema y de sus **reglas pedagógicas**, con la notación compuesta en KaTeX mientras se escribe. La misma ruta edita, con `?id=`. |
| `/docente/ejercicios` | Banco de ejercicios: sueltos o **plantillas parametrizadas**, con el informe del validador antes de guardar. |

### Los endpoints

```
GET  POST            /api/docente/materias         asignaturas
PATCH DELETE         /api/docente/materias/[id]
GET  POST            /api/docente/temas            temas + sus reglas (transaccional)
GET  PATCH DELETE    /api/docente/temas/[id]
GET  POST            /api/docente/ejercicios       banco, con validación obligatoria
PATCH DELETE         /api/docente/ejercicios/[id]
POST                 /api/docente/ejercicios/validar   comprobar SIN guardar
```

### El validador matemático en servidor

Nada entra al banco sin pasar por él. Enfrenta tres fuentes de verdad —la
respuesta que escribe el docente, la fórmula de la plantilla evaluada con
aritmética exacta y la solución que calcula el motor determinista— y **bloquea
el guardado** cuando no coinciden, diciendo con qué números falla:

```
✗ 2x + 1 = 8 (a=2, b=1, c=8): El motor calcula 7/2 y la respuesta indicada es -7/2.
```

Con plantillas parametrizadas recorre **todas** las combinaciones cuando son 240
o menos, y una muestra **reproducible** cuando son más. Si el tema no declara
motor, el ejercicio se guarda **marcado como no verificado** y se explica por
qué: nunca se inventa un veredicto. La IA no interviene en ningún punto.

### Derivadas con exponenciales y logaritmos

El motor del PMV 1 sólo sabía derivar polinomios, porque leía las expresiones
con expresiones regulares. `lib/matematicas/` las lee como una gramática: de ahí
salen `e^x`, `ln(x)`, `sqrt`, seno y coseno, y con ellos las reglas del
**producto**, del **cociente** y de la **cadena**, que se componen entre sí.

Y la corrección compara **funciones, no cadenas**: `e^x + 2x` y `2x + e^x` son
la misma respuesta. Sólo donde la forma es el ejercicio —una factorización— se
sigue exigiendo la forma.

### Dos ejes: dónde está el alumno y cuánto cuesta el contenido

- **Etapa + curso** (Primaria 1.º-6.º, Secundaria 1.º-5.º, Superior 1.º-10.º)
  dicen dónde está el alumno en el sistema educativo y deciden **qué contenidos
  existen para él**. Se configuran en `/estudiante/nivel-educativo`, en dos pasos.
- **Nivel** (Básico, Intermedio, Avanzado) dice cuánto cuesta un contenido dentro
  de su etapa. Lo mide el diagnóstico.

Cada tema y cada ejercicio declaran su **alcance**: la etapa y el curso a partir
del cual se plantean. Así, una derivada marcada como Superior no le aparece a un
alumno de secundaria por muy avanzado que vaya en lo suyo, y un universitario sí
recibe la factorización de secundaria, que tiene estudiada.

Las preguntas salen del catálogo sembrado (cinco por nivel, de opción múltiple)
y del **banco del profesorado**: los ejercicios publicados y verificados de ese
nivel entran en la prueba como preguntas de respuesta abierta, corregidas por el
mismo motor determinista. El nivel definitivo lo sigue decidiendo el resultado,
con la regla de corte de siempre.

### El tema y su motor

Un tema del docente puede declarar uno de los cinco motores deterministas
(aritmética, fracciones, ecuaciones lineales, factorización, derivadas) y
heredar la corrección automática, o no declarar ninguno. Sus reglas heredan el
motor y el estado del tema, de modo que **lo que publica un profesor aparece en
la lección del alumno** sin tocar código.

---

## El diagnóstico inicial

Cinco preguntas, una por cada tema garantizado por PRE Light, ordenadas de menor
a mayor dificultad. Regla de corte acordada:

| Aciertos | Nivel        |
| -------- | ------------ |
| 0 – 2    | `BASICO`     |
| 3 – 4    | `INTERMEDIO` |
| 5        | `AVANZADO`   |

Es **totalmente determinista**: se cuentan las respuestas correctas y se aplica
el tramo. La IA no interviene en ningún punto.

Dos decisiones de implementación que conviene conocer:

- **La respuesta correcta nunca sale del servidor.** Ni el `GET` de preguntas ni
  la respuesta del `POST` la incluyen; si viajara al navegador, falsear el
  diagnóstico sería cuestión de abrir las herramientas de desarrollo.
- **El envío debe cubrir el banco completo.** Un diagnóstico a medias produciría
  un recuento que no significa nada, así que se rechaza en lugar de clasificarlo.

El banco vive en
[`prisma/seed-data/preguntas-diagnostico.json`](prisma/seed-data/preguntas-diagnostico.json)
y la regla, en un único sitio:
[`lib/diagnostico/clasificar.ts`](lib/diagnostico/clasificar.ts).

---

## Qué entra en el Paso 1 y qué no

### Entregado en el Paso 1

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Framer Motion.
- KaTeX configurado y en uso en el diagnóstico.
- PostgreSQL + Prisma: esquema completo, migración y semilla.
- RBAC de tres roles, con protección en middleware **y** en las rutas de API.
- Diagnóstico inicial determinista, con persistencia del nivel y su historial.
- Núcleo heredado integrado: Gemini por variables de entorno, PRE Light y
  esquemas LSG operativos desde la aplicación Next.
- Suite de QA ejecutable en local, sin dependencia de Render.

### Entregado en el Paso 2

La lección interactiva vive en `/estudiante/leccion`.

- **Módulo 4 — Generador dinámico de lecciones.** El LSG llega estructurado en
  las cuatro fases obligatorias: concepto → reglas → ejemplos resueltos →
  práctica. Para los cinco temas soportados la lección la produce el motor
  determinista, así que es reproducible y no consume cuota de IA; fuera de esos
  temas interviene Gemini.

  En la fase **Reglas y propiedades** la pizarra compone **únicamente la regla
  que el tutor está explicando en ese momento**, deducida de las líneas ya
  narradas: la tarjeta aparece cuando se la nombra y cambia al ritmo del
  diálogo. Mostrar el catálogo entero de golpe desincronizaba la pizarra del
  audio —la voz explicaba la potencia mientras en pantalla aparecían también el
  cociente y la cadena—. El catálogo completo del tema NO se pinta en la pizarra en ningún momento.

  En la fase de **ejemplos**, cada paso lleva la etiqueta de **qué regla se está
  aplicando**.

  El catálogo vive en la tabla `reglas_matematicas`, sembrada desde
  [`prisma/seed-data/reglas-matematicas.json`](prisma/seed-data/reglas-matematicas.json):
  ampliar el temario es cargar contenido, no tocar la aplicación.

  > Cada regla indica si el motor determinista sabe **calificar** ejercicios de
  > ese tipo. Conviene enseñar la regla del producto o la de la cadena, pero hoy
  > el motor cubre la potencia sobre polinomios y no ésas; las que quedan fuera
  > se muestran marcadas como *sólo referencia*. Prometer una práctica que
  > después habría que corregir con la IA sería justo lo que el PRE Light evita.
- **Módulo 5 — Validador determinista.** Sirve desde las rutas de API de
  Next.js, compartiendo núcleo con el prototipo (ver *Paridad*).
- **Módulo 7 — Avatar + SmartBoard.** Avatar 2D con los cuatro estados
  (*esperando*, *hablando*, *pensando*, *corrigiendo*) sincronizados con la voz,
  narrada en español con la Web Speech API.

  La pizarra está organizada por **escenas**: cada fase pedagógica es una vista
  propia y, al pasar de una a otra, el contenido se sustituye con una
  transición limpia en lugar de apilar párrafos hacia abajo. Sobre la pizarra,
  un indicador muestra en qué fase va el alumno y cuáles ha completado.

  El renderizado en KaTeX alcanza **todo** el contenido, no sólo las fórmulas
  destacadas: las explicaciones del tutor llevan la matemática incrustada en la
  frase ("la derivada de x³ es 3x²") y sin marcar, porque el motor las produce
  así, de modo que las fórmulas se detectan dentro del texto y se componen. El
  criterio de detección es deliberadamente estricto: marcar de más deja una
  palabra rota en pantalla, mientras que marcar de menos sólo deja una fórmula
  sosa.
- **Módulo 8 — Entorno de resolución.** Caja de respuesta y botones de apoyo:
  *No entendí este paso*, *Dame otro ejemplo*, *Explicar regla*, más ajuste de
  dificultad. Ninguno cambia de tema.
- **Módulo 9 — Corrección automática.** La respuesta se evalúa contra la
  solución que **recalcula el servidor**, no contra un valor enviado por el
  navegador. Cada intento queda registrado en `registros_progreso`, y los
  fallos alimentan el catálogo de debilidades.

- **Módulos 2, 6 y 11 — Persistencia del avance.** Cada lección abre una
  `sesion_aprendizaje` y cada intento de práctica queda colgado de ella. Al
  volver, el alumno ve en cada tema cuántas lecciones lleva, cuándo fue la
  última y su proporción de aciertos, y puede **continuar** en lugar de repetir
  el diálogo introductorio.

### Progresión de dificultad

La escalera tiene cuatro peldaños —`facil`, `normal`, `dificil`, `experto`— y
*Más difícil* sube **uno cada vez** en lugar de saltar al último y quedarse ahí.
Las listas de ejercicios de cada nivel son datos en `src/lsgPrompt.js`, así que
ampliar la escalera es añadir contenido.

### Explicaciones dinámicas

Los botones que **aclaran** —*No entendí este paso*, *Explicar regla*— piden la
explicación al modelo en vivo (bandera `explicacionDinamica`), en lugar de
devolver el guion fijo del prototipo.

> La bandera afecta **sólo a la prosa**. Los botones que traen ejercicio nuevo
> —*Dame otro ejemplo*, *Más difícil*— siguen saliendo del motor determinista:
> si la aritmética de una práctica la escribiera el modelo, se perdería la
> garantía del PRE Light, que es la razón de ser de todo esto.

Dos decisiones que conviene conocer:

- **La pizarra se traduce, el motor no se toca.** El motor escribe en notación
  plana (`12x³ - 4x`), que es la que entienden sus analizadores y su suite.
  `planoALatex()` la compone para el alumno sin alterar una línea de la lógica
  validada.
- **Lo que no se puede calcular, no se califica.** Si el motor no cubre un
  enunciado, la corrección lo dice en lugar de emitir un veredicto. Dar por
  buena una respuesta que no se ha podido verificar es exactamente la
  alucinación que este módulo existe para evitar.

### Pasos siguientes

- **Paso 4** — Panel docente con métricas y mapa de calor, y despliegue
  productivo en Vercel + Supabase.

### Nota sobre el banco de preguntas

`prisma/seed-data/preguntas-diagnostico.json` contiene el **banco oficial**
entregado por el cliente, **guardado con su formato original tal cual** (`id`,
`tema` en minúsculas, `pregunta`, `opciones` como lista de textos,
`respuesta_correcta`). No se ha reescrito a propósito: así, sustituirlo por una
versión nueva es copiar y pegar el fichero y volver a ejecutar
`npm run db:seed`, sin tocar código.

### Cómo se escribe la matemática

Dentro de los enunciados y de las opciones, la matemática va **entre `$…$`** y
se escribe en LaTeX. Sólo eso se compone con KaTeX; el resto de la frase se
muestra como prosa normal:

```json
"pregunta": "Resuelve y simplifica: $\\frac{2}{3} + \\frac{5}{6}$",
"opciones": ["$\\frac{7}{9}$", "$\\frac{3}{2}$", "$\\frac{7}{6}$", "$\\frac{4}{3}$"]
```

Así `2/3 + 5/6` aparece como una fracción real apilada y no como texto corrido.
Para una fórmula en bloque, centrada en su propia línea, se usa `$$…$$`. Un `$`
suelto y sin pareja no abre fórmula, de modo que escribir un precio sigue
funcionando.

El banco guarda **sólo** la versión en LaTeX. Cuando hay que verificar la
matemática, `latexAPlano()` la traduce a notación plana para el motor
determinista; guardar el enunciado dos veces —una para mostrar y otra para
validar— habría acabado con las dos versiones desincronizadas.

La adaptación al esquema ocurre en la semilla ([`prisma/seed.ts`](prisma/seed.ts)):

- Las opciones pasan de lista de textos a pares `{ id, texto }` y la respuesta
  correcta pasa de ser el **texto** a ser el **id** de esa opción. Así, lo que
  el navegador envía al corregir es un identificador opaco y no la propia
  respuesta, y la comparación deja de depender de espacios, mayúsculas o de cómo
  esté escrita la fórmula.
- Si la `respuesta_correcta` no coincide con ninguna opción, la semilla **falla
  y se detiene**. Un banco así clasificaría mal a todos los alumnos sin dar
  ningún síntoma visible.
- Las preguntas que dejen de estar en el fichero se **desactivan**, no se
  borran: eliminarlas se llevaría por delante, en cascada, las respuestas de los
  alumnos que ya las contestaron.

Además, `npm run qa:diagnostico` contrasta cada respuesta declarada contra el
**mismo motor determinista que califica las prácticas** (`src/preLight.js`). Las
cinco del banco oficial están verificadas por esa vía; si el motor no cubriera
un enunciado, la batería lo declara «sin verificar» en lugar de darlo por bueno.
