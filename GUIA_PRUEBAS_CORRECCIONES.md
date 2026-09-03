# Guía de pruebas — correcciones del HITO 1

Seis correcciones, una por cada cosa reportada tras verificar el hito:

1. **Derivadas con `e^x` y `ln(x)`** — el motor las daba por "no comprobable".
2. **La prueba diagnóstica daba derivadas** a un alumno de 3.º de secundaria.
3. **Nivel ≠ nivel educativo** — faltaba la taxonomía de etapa y curso.
4. **La lección listaba todos los temas** sin discriminar la etapa del alumno.
5. **El formulario de reglas**: notación LaTeX, jerarquía del nivel y la casilla
   de práctica sin motor.
6. **La vista de ejercicios**: "Nivel" renombrado a Dificultad, el alcance
   heredado a la vista y grado propio opcional por ejercicio.

Cada apartado de esta guía se puede comprobar en unos minutos, y al final están
las baterías automáticas por si prefieres verlo sin tocar la interfaz.

---

## Puesta en marcha

```bash
git fetch && git checkout entrega/hito1-correcciones
npm install
npm run db:deploy      # IMPORTANTE: hay migraciones nuevas
npm run db:seed        # recarga el catálogo, ya clasificado por etapa
npm run dev
```

| Rol | Correo | Contraseña |
| --- | --- | --- |
| DOCENTE | `docente@mentoriamath.local` | `Docente-2026` |
| DIRECTOR | `director@mentoriamath.local` | `Director-2026` |
| SUPERADMIN | `admin@mentoriamath.local` | `Admin-2026` |

> Sin `db:deploy` la aplicación falla en la primera consulta: el esquema tiene
> columnas nuevas (etapa y curso en temas, ejercicios, preguntas y perfiles).

---

## 1 · La prueba diagnóstica se ajusta al curso

**Lo que fallaba:** un alumno declaraba 3.º de secundaria y la evaluación le
presentaba derivadas.

1. Entra en **/registro** y crea una cuenta de alumno. Fíjate en que el alta ya
   **no pide "ciclo" ni "grado"** en texto libre.
2. Al terminar aterrizas en **Configuración de nivel educativo**:
   - **Paso 1** — tres etapas: PRIMARIA (1.º a 6.º Grado), SECUNDARIA (1.º a 5.º
     Año), SUPERIOR / UNIVERSITARIO (1.º a 10.º Ciclo).
   - **Paso 2** — los cursos de la etapa elegida. Elige **Secundaria · 3.er Año**.
   - Debajo aparece *"Estás configurando tu nivel como: Secundaria · 3.er Año"*.
3. Pulsa **Finalizar configuración y empezar**. En la evaluación comprueba:
   - La cabecera dice *"Preguntas de nivel Intermedio, ajustadas a tu curso
     (Secundaria · 3.er Año)"*.
   - **Ninguna de las cinco preguntas es de derivadas.**
4. Repite con otra cuenta eligiendo **Superior · 2.º Ciclo**: ahí **sí** salen
   derivadas, que es lo correcto.
5. Y con una de **Primaria · 5.º Grado**: ni derivadas ni factorización.

**Qué comprobar además**

- Si intentas entrar en `/estudiante/diagnostico` sin haber configurado la etapa,
  la aplicación te lleva antes a configurarla: no se compone una prueba de un
  temario que no es el tuyo.
- Las cuentas creadas antes de este cambio, que tienen el curso escrito a mano
  ("Secundaria", "3.º"), se interpretan solas y quedan clasificadas igual.

---

## 2 · Derivadas con funciones trascendentes

**Lo que fallaba:** al escribir una derivada con `e^x` o `ln(x)`, el motor no la
reconocía y la marcaba como "No comprobable".

Entra como **docente** → **Ejercicios**, elige un tema con motor *Derivadas*
(por ejemplo el tema "Derivadas" del catálogo).

| Escribe esto | Pulsa | Resultado esperado |
| --- | --- | --- |
| Enunciado `x·ln(x)` · respuesta `1 + ln(x)` | Validar | **Verificado**, y el informe indica: *regla del producto · derivada del logaritmo* |
| Enunciado `e^(2x)` · respuesta `e^(2x)` | Validar | **Rechazado**: *"El motor calcula 2e^(2x) y la respuesta indicada es e^(2x)"* |
| Corrige la respuesta a `2e^(2x)` | Validar | Verificado |
| Enunciado `(x² + 1)/(x - 3)` · respuesta **vacía** | Validar | La calcula el servidor con la *regla del cociente* |
| Enunciado `ln(x)/x` · respuesta `(1 - ln(x))/x²` | Validar | Verificado |

**Lo importante del primer caso:** la respuesta se escribió en otro orden que el
que produce el motor (`ln(x) + 1`) y aun así se da por buena. Ahora se comparan
**funciones, no textos**: `e^x + 2x` y `2x + e^x` son la misma respuesta, igual
que `12x^3` y `12x³`, o `7/2` y `3.5`.

Donde la forma **sí** importa se sigue exigiendo: si el ejercicio pide factorizar
`x² - 9`, la respuesta `x² - 9` se rechaza.

---

## 3 · La taxonomía curricular

**Lo que faltaba:** el campo *Nivel* indicaba complejidad relativa, no el nivel
educativo del alumno.

Ahora son **dos ejes independientes**:

| Eje | Qué dice |
| --- | --- |
| **Etapa + curso** | Dónde está el alumno → **qué contenidos existen para él** |
| **Nivel** (Básico/Intermedio/Avanzado) | Cuánto cuesta un contenido **dentro de su etapa** |

### En el panel docente

1. **Currículo** → edita cualquier tema. Verás el bloque **Alcance curricular**:
   etapa educativa y curso a partir del cual se plantea.
2. Marca un tema como **Superior · 1.er Ciclo** y publica un ejercicio suyo:
   no le aparecerá a ningún alumno de secundaria, por avanzado que vaya.
3. En el listado del currículo tienes la **columna Alcance** y el **filtro por
   etapa**. Los temas sin etapa salen como *Transversal* (llegan a cualquiera).
4. En **Ejercicios**, cada ejercicio muestra el alcance que **hereda de su tema**,
   y los que entran en la evaluación inicial llevan la etiqueta
   *"Entra en el diagnóstico"*.

### Cómo se lee el alcance

Se lee **"a partir de"**. La factorización marcada como *Secundaria 3.º* se
plantea desde 3.º de secundaria **y también en Superior**: lo que se estudia
antes sigue valiendo después. Lo contrario no ocurre nunca.

```
Secundaria 3.er año  →  derivadas: NO   ·  factorización: sí
Secundaria 1.er año  →  derivadas: NO   ·  factorización: no
Superior 2.º ciclo   →  derivadas: sí   ·  factorización: sí
Primaria 5.º grado   →  derivadas: NO   ·  factorización: no
```

### El contenido sembrado ya viene clasificado

| Motor | A partir de |
| --- | --- |
| Aritmética | Primaria 1.º |
| Fracciones | Primaria 4.º |
| Ecuaciones lineales | Secundaria 1.º |
| Factorización | Secundaria 3.º |
| **Derivadas** | **Superior 1.º** |

Los ejercicios que publiques y queden verificados entran automáticamente en la
evaluación inicial de los alumnos a los que les corresponden (hasta 3 de las 5
preguntas; las otras 2 salen del catálogo calibrado).

---

## 4 · La lección sólo ofrece los temas del curso

**Lo que fallaba:** un alumno de 6.º de primaria entraba en la lección
interactiva y le aparecían Ecuaciones lineales, Factorización y Derivadas. Las
tarjetas salían de una lista escrita en el código —los cinco motores— sin mirar
quién estaba delante.

Ahora la lista sale del **currículo**, filtrada por la etapa y el curso del
alumno: se ofrece un tema si existe al menos uno **publicado** con ese motor
cuyo alcance cubre a ese alumno.

1. Entra con un alumno de **Primaria · 6.º Grado** (regístralo, configura su
   curso y completa la evaluación inicial) y ve a **/estudiante/leccion**.
   → Sólo verás **Aritmética** y **Fracciones**.
   → Arriba dice *"Temas publicados para tu curso: Primaria · 6.º Grado"*.
2. Con un alumno de **Secundaria · 3.er Año**: aparecen además **Ecuaciones
   lineales** y **Factorización**, pero **no Derivadas**.
3. Con uno de **Superior**: aparecen los cinco.

**Y el servidor lo impide, no sólo la pantalla.** Si se repite la petición a
mano, `/api/sesion` la rechaza:

```
POST /api/sesion {"tema":"derivadas"}      → 403  (alumno de primaria)
POST /api/sesion {"tema":"factorizacion"}  → 403
POST /api/sesion {"tema":"lineales"}       → 403
POST /api/sesion {"tema":"aritmetica"}     → 200
```

Una comprobación que sólo vive en la interfaz no es una comprobación: basta con
repetir la llamada para saltarla.

Si un alumno no tiene ningún tema publicado para su curso, la pantalla se lo
dice —con su curso por delante— en lugar de quedarse en blanco. Y si la base de
datos no responde, no se restringe nada: dejar a un alumno sin lección por un
fallo de infraestructura sería peor que enseñarle una tarjeta de más.

---

## 5 · El formulario de reglas: notación, nivel y práctica

Tres ajustes pedidos tras revisar `/docente/crear-tema`.

### 5.1 · La vista previa tolera la barra duplicada

**Lo que fallaba:** con una barra (`\frac{a}{b}`) la fórmula se componía al
instante; con dos (`\\frac{a}{b}`) no. La causa estaba en el propio formulario: los
textos de ayuda mostraban la versión con **dos barras**, así que el campo estaba
enseñando la sintaxis equivocada.

1. En cualquier regla, escribe el enunciado con UNA barra: `\frac{a}{b}` →
   se compone debajo al momento.
2. Escríbelo ahora con DOS: `\\frac{a}{b}` → **también se compone**. La barra
   duplicada que deja un copiado desde código se corrige sola.
3. Debajo del campo tienes la ayuda: *"Sintaxis KaTeX, con UNA barra
   invertida"*, con ejemplos.
4. Guarda y vuelve a abrir el tema: lo almacenado es la versión de una barra,
   no la del copiado. La corrección se aplica también en el servidor, así que
   vale igual si el contenido entra por la API.

> Se colapsa la barra doble **sólo cuando le sigue una letra**, que es la firma
> del escape accidental. El `\\frac{a}{b}` de un salto de línea real —el de una
> matriz o un `egin{cases}`— va seguido de espacio o corchete y se respeta.

### 5.2 · El nivel de la regla hereda el del tema

**La duda planteada:** si el nivel de la regla sobrescribe el del tema o hereda.

**Decisión: hereda.** El desplegable de cada regla ya no dice "Sin nivel" sino
**"Hereda del tema (Intermedio)"**, mostrando el nivel actual del tema. Sólo se
indica uno propio para marcar una regla más difícil —o más fácil— que el resto
del tema.

Se guarda como *heredado*, no como una copia del valor: si mañana cambias el
nivel del tema, sus reglas lo siguen en lugar de quedarse con el viejo. La
tarjeta lo explica en pantalla, incluido lo que afecta y lo que no: gradúa la
dificultad de sus ejercicios, no decide **a quién** le llegan —eso lo hace el
alcance curricular—.

### 5.3 · "Se puede practicar" depende del motor

**Lo que pedías:** si el tema está en *"Sin motor (corrección manual)"*, la
casilla debería deshabilitarse o desmarcarse.

1. Pon el tema en **Sin motor**: la casilla de todas sus reglas queda
   **deshabilitada y desmarcada**, y el texto de ayuda explica por qué —*"el
   tema no tiene motor de corrección, así que nadie puede calificar su
   práctica"*—.
2. Elige un motor: la casilla se habilita y el texto pasa a nombrarlo —*"El
   motor Ecuaciones lineales calificará los ejercicios de esta regla"*—.
3. Marca una regla como practicable, guarda, y quita después el motor del tema:
   al guardar, esa regla deja de ser practicable. No queda ninguna promesa que
   el sistema no pueda cumplir.

El servidor aplica la misma regla venga la petición de donde venga: en el alta,
en la edición y también cuando un tema pierde su motor.

---

## 6 · Dificultad, alcance visible y grado propio del ejercicio

Tres ajustes en **/docente/ejercicios**, pedidos tras revisar la vista.

### 6.1 · "Nivel" pasa a llamarse "Dificultad"

El selector decía *Nivel* con Básico / Intermedio / Avanzado, que se confundía
con el nivel educativo del alumno. Ahora se llama **Dificultad** —en el
formulario, en el filtro y en la columna del banco—, y lo mismo en el formulario
de temas y de reglas. El nivel educativo tiene su propio sitio: el **alcance
curricular**.

El campo en base de datos no cambia; lo que cambia es cómo se llama donde se lee.

### 6.2 · El alcance heredado, a la vista

Estaba en letra pequeña dentro del subtítulo. Ahora, encima del formulario:

```
[ Tema: Aritmética básica ] → [ Alcance: Primaria · 1.er Grado ]  heredado del tema
```

Cuando el ejercicio lleva grado propio, la píldora cambia de color y el texto
pasa a *"ajustado para este ejercicio"*.

### 6.3 · Grado propio del ejercicio (opcional)

**El problema:** un tema *Perímetros* con alcance Primaria · 3.er Grado obligaba
a que todos sus ejercicios fueran de 3.º. Uno con decimales pensado para 5.º se
le mostraba igualmente a un alumno de 3.º, y la única salida era duplicar el
tema —*Perímetros 3.º*, *Perímetros 5.º*— y partir el catálogo.

**Cómo se prueba:**

1. Crea un tema con alcance **Primaria · 3.er Grado** y entra en *Ejercicios*.
2. Con el tema elegido aparece el bloque **"Personalizar el grado mínimo para
   este ejercicio"**. Sin marcarlo, el ejercicio hereda: la píldora dice
   *Primaria · 3.er Grado · heredado del tema*.
3. Márcalo y elige **5.º Grado**: el desplegable sólo ofrece 3.º en adelante,
   dentro de la etapa del tema. Guarda.
4. En el banco, ese ejercicio muestra su píldora en verde con **· propio**; los
   demás siguen mostrando el heredado.
5. Cambia ahora el alcance del tema a 4.º: los heredados le siguen
   automáticamente y el de 5.º se queda donde lo pusiste.

**Los dos límites**, y el porqué de cada uno:

| Intento | Resultado |
| --- | --- |
| Grado **mayor** que el del tema | Se acepta: el ejercicio pide más madurez |
| Grado **menor** que el del tema | Se rechaza: llegaría a alumnos a los que el tema entero no les corresponde |
| **Otra etapa** | Se rechaza: cambiar de etapa es cambiar de tema |
| **El mismo** grado que el tema | Se guarda como heredado, no como copia |

Esa última fila es la que mantiene viva la herencia: si se guardara una copia,
al mover el tema sus ejercicios se quedarían con el valor viejo.

---

## Comprobación automática

```bash
npm run qa:diagnostico-nivel   # 94 comprobaciones · etapa, curso, prueba y lección
npm run qa:matematicas         # 100 comprobaciones · derivadas y equivalencia
npm run qa:hito1               # 124 comprobaciones · autoría docente
```

Las dos primeras registran alumnos reales contra el servidor (necesitan
`npm run dev` levantado en otra terminal) y comprueban el caso exacto reportado:

```
✓ el servidor reconoce su etapa y su curso
✓ NO le aparece ninguna pregunta de derivadas (el fallo reportado)
✓ un alumno de superior recibe dificultad avanzada, y en su prueba SÍ hay derivadas
✓ un alumno de primaria no ve ni derivadas ni factorización
✓ una cuenta antigua con el curso en texto también se clasifica
✓ un curso imposible se rechaza (secundaria no tiene 8.º año)
✓ sin etapa declarada, el servidor pide configurarla
```

La suite completa —incluida la del PMV 1, sin regresiones— está en verde:

| Batería | Resultado |
| --- | --- |
| `qa/diagnostico-nivel.mjs` | 94 · 0 |
| `qa/matematicas.mjs` | 100 · 0 |
| `qa/hito1.mjs` | 124 · 0 |
| `qa/diagnostico.mjs` | 416 · 0 |
| `qa/leccion.mjs` | 811 · 0 |
| `qa/paso1.mjs` · `qa/frontend.mjs` | 72 · 0 · 10 · 0 |
| **Total** | **1.627 comprobaciones · 0 fallos** |

---

## Detalle técnico

El detalle de cada corrección —decisiones de diseño, modelo de datos y
migraciones— está en [`ENTREGA_HITO1.md`](ENTREGA_HITO1.md), apartados 10 a 13.
