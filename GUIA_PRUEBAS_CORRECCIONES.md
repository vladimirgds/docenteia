# Guía de pruebas — correcciones del HITO 1

Tres correcciones, una por cada cosa reportada tras verificar el hito:

1. **Derivadas con `e^x` y `ln(x)`** — el motor las daba por "no comprobable".
2. **La prueba diagnóstica daba derivadas** a un alumno de 3.º de secundaria.
3. **Nivel ≠ nivel educativo** — faltaba la taxonomía de etapa y curso.

Cada apartado de esta guía se puede comprobar en unos minutos, y al final están
las baterías automáticas por si prefieres verlo sin tocar la interfaz.

---

## Puesta en marcha

```bash
git fetch && git checkout entrega/hito1-correcciones
npm install
npm run db:deploy      # IMPORTANTE: hay dos migraciones nuevas
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

## Comprobación automática

```bash
npm run qa:diagnostico-nivel   # 85 comprobaciones · etapa, curso y prueba
npm run qa:matematicas         # 100 comprobaciones · derivadas y equivalencia
npm run qa:hito1               # 108 comprobaciones · autoría docente
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
| `qa/diagnostico-nivel.mjs` | 85 · 0 |
| `qa/matematicas.mjs` | 100 · 0 |
| `qa/hito1.mjs` | 108 · 0 |
| `qa/diagnostico.mjs` | 416 · 0 |
| `qa/leccion.mjs` | 811 · 0 |
| `qa/paso1.mjs` · `qa/frontend.mjs` | 72 · 0 · 10 · 0 |
| **Total** | **1.602 comprobaciones · 0 fallos** |

---

## Detalle técnico

El detalle de cada corrección —decisiones de diseño, modelo de datos y
migraciones— está en [`ENTREGA_HITO1.md`](ENTREGA_HITO1.md), apartados 10, 11
y 12.
