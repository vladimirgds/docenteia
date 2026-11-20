# PMV 3 · HITO 2 — Editor de contenido para docentes, agente Gemini y verificación de pasos

**Proyecto:** MentorIA Math · **Rama:** `feat/pmv3-staging`

---

## 1. Qué pedía el hito y dónde está

| Requisito | Entregado en |
| --- | --- |
| Editor para **definir, probar y publicar** reglas, métodos y procedimientos desde el panel, sin cambios en el código | [`/docente/procedimientos`](app/docente/procedimientos/page.tsx) + [`gestor-procedimientos.tsx`](components/docente/gestor-procedimientos.tsx); API en [`/api/docente/procedimientos`](app/api/docente/procedimientos/route.ts) |
| Agente de IA (Gemini) que genera **borradores editables** de pasos, ejercicios, preguntas y pistas | [`POST /api/docente/procedimientos/borrador-ia`](app/api/docente/procedimientos/borrador-ia/route.ts) + [`lib/docente/procedimientos-ia.ts`](lib/docente/procedimientos-ia.ts) |
| El servidor **verifica los pasos matemáticos que el motor soporta** | [`lib/docente/verificar-pasos.ts`](lib/docente/verificar-pasos.ts); catálogo en [`GET …/soporte`](app/api/docente/procedimientos/soporte/route.ts) |
| Probar el flujo completo con **suma de fracciones** y **regla de la cadena** | [`qa/pmv3-hito2.mjs`](qa/pmv3-hito2.mjs) (secciones B y C) y la prueba con Gemini real (§4) |

Migración: [`20261118100000_pmv3_hito2_procedimientos`](prisma/migrations/20261118100000_pmv3_hito2_procedimientos/migration.sql) — **sólo crea una tabla y un tipo**, no toca ninguna fila existente.

---

## 2. Qué es un procedimiento

Un **ejemplo resuelto paso a paso**. Cada paso lleva lo que *dice* el profesor, lo que *escribe* en la pizarra (notación plana, p. ej. `5(3x+1)^4 · 3`) y, opcionalmente, **términos tocables** con su explicación. Más preguntas de comprensión y pistas. Tres tipos —regla, método, procedimiento— que se guardan igual.

Mismas reglas de propiedad que los ejercicios (Hito 1): privado de su autor, visible a un SUPERADMIN, y sólo llega a alumnos matriculados en un aula de ese docente. Un procedimiento ajeno responde **404**.

---

## 3. La verificación de pasos

Dado el ejemplo y sus pasos, el servidor comprueba **cada paso** contra el motor determinista y responde paso por paso: *verificado*, *incorrecto* (con el motivo y los números) o *no verificable*.

| Motor | Qué significa «paso correcto» |
| --- | --- |
| Aritmética / Fracciones | vale lo mismo que el ejemplo (`1/2+1/3` → `3/6+2/6` → `5/6`) |
| Ecuaciones lineales | misma solución (`2x+5=15` → `2x=10` → `x=5`) |
| Derivadas | equivale a la derivada del ejemplo (`5(3x+1)^4·3` → `15(3x+1)^4`); las piezas intermedias (`u = 3x+1`) son *definición* y no se comparan |
| Factorización | mismo polinomio; el último paso, la forma factorizada |

Además: el paso debe poder **mostrarse** (se renderiza con KaTeX), los términos tocables deben ser **fragmentos exactos** de lo que se escribe, y —en derivadas— si el docente declara una regla que el motor no aplicó, se avisa.

**Nunca se verifica contra una sola fuente.** Antes de comparar los pasos, el resultado del ejemplo se contrasta con un **segundo cálculo independiente** (evaluación numérica, raíz de la ecuación por muestreo, derivada numérica). Si discrepan, el ejemplo **no se verifica**. Es lo que protege del defecto del motor de fracciones (§6): `3/4 * (1/2 + 2/5)` → el motor dice `9/10`, el segundo cálculo `27/40`; el servidor responde «una comprobación independiente no lo confirma» en lugar de validar pasos contra un resultado equivocado.

### Publicar

- Guardar un borrador **siempre** se puede (un editor que no deja guardar mientras hay un paso mal pierde el trabajo); el informe marca el fallo.
- **Publicar** exige: ningún paso incorrecto **y** verificado. Escrito a mano y no verificable (p. ej. tema sin motor) → sólo con confirmación expresa (`confirmarSinVerificar`). **Borrador de IA → nunca sin verificar**; al publicarlo queda constancia de la revisión (`revisadoPorId`, `revisadoEn`).
- Cada publicación queda en la auditoría.

---

## 4. El agente de Gemini

```
docente ─► POST /borrador-ia {tema, tipo, qué quiero enseñar, dificultad, nº ejercicios}
             ├─ sesión + permiso + tope de consumo (6 / 10 min por usuario)
             ├─ Gemini redacta: pasos, términos, preguntas, pistas, ejercicios
             ├─ el servidor VERIFICA los pasos
             │     └─ si hay fallos → se le devuelven a Gemini (hasta 2 veces) para que corrija
             ├─ los ejercicios pasan por el validador del Hito 1 (Gemini == motor, o se descartan)
             └─ todo se guarda como BORRADOR del docente, con el informe
```

Sin `GEMINI_API_KEY` funciona en **modo demostración** (arma el procedimiento con el propio motor), para probar sin gastar cuota.

### Prueba con Gemini real

| Procedimiento pedido | Resultado |
| --- | --- |
| Suma de fracciones con distinto denominador | verificado · 3/3 ejercicios verificados |
| Resta de fracciones | verificado · 3/3 |
| **Regla de la cadena** `(3x+1)^5` | verificado |
| Regla del producto | verificado · 2/3 (1 descartado por el servidor) |
| Resolver ecuaciones de primer grado | verificado · 3/3 |

**5 de 5 procedimientos verificados; 11 de 12 ejercicios** (el que falló lo descartó el servidor).

Cómo se llegó ahí, para que quede constancia: con el modelo ligero (`flash-lite`) y sin reparación, sólo **2 de 5** pasaban la verificación; el servidor señaló errores reales de Gemini (un paso que escribe una sola fracción, derivadas intermedias marcadas como cálculo). Dos cambios lo llevaron a 5/5: (1) **autorreparación** —se le devuelve a Gemini el informe del verificador— y (2) usar `gemini-2.5-flash` con presupuesto de razonamiento para procedimientos (configurable con `GEMINI_MODEL_PROCEDIMIENTOS`). Con otra muestra, los números pueden variar: el modelo no es determinista, **la verificación sí**.

---

## 5. Cómo probarlo

```bash
npx prisma migrate deploy && npm run dev
```

1. DOCENTE (`docente@mentoriamath.local` / `Docente-2026`) → **Procedimientos**.
2. Tema *Fracciones* → «Qué quieres enseñar»: *Suma de fracciones* → **Generar borrador**. Aparece el formulario relleno, cada paso con su estado.
3. Cambia un paso a algo falso (p. ej. `3/6 + 2/5`) → **Probar**: el paso queda en rojo con el motivo; **Guardar** guarda el borrador; publicar → rechazado.
4. Corrígelo → **Probar** → «Verificado por el motor» → **Publicar**.
5. Repite con tema *Derivadas* y «Regla de la cadena».

Batería: `npm run qa:pmv3-hito2` (con la app en marcha, sin `GEMINI_API_KEY`).

---

## 6. Verificación ejecutada

| Batería | Resultado |
| --- | --- |
| `node qa/pmv3-hito2.mjs` — **nueva** | **60 comprobaciones · 0 fallidas** |
| `node qa/pmv3-hito1.mjs` (regresión, tras extraer la lógica común de borradores) | 76 · 0 |
| `node qa/hito1.mjs` | 124 · 0 |
| `npx tsc --noEmit` | sin errores |
| Chrome real: generar → probar → ver estados por paso, KaTeX en vivo | sin errores de consola |
| Gemini real, 5 procedimientos | 5/5 verificados |

**Qué cubre `pmv3-hito2.mjs`:** acceso 401/403 · catálogo de lo verificable · **suma de fracciones** (probar → guardar → paso equivocado señalado → no se publica → corregir → publicar) · **regla de la cadena** (verificada, regla confirmada por el motor, olvidar el factor interior se detecta) · ejemplo dudoso no verificado · términos inexistentes rechazados · agente de IA (borrador completo, verificado, siempre BORRADOR, ejercicios enlazados, editable, no publicable si se rompe) · constancia de revisión · privacidad entre docentes · tema sin motor · tope de consumo.

---

## 7. Hallazgos

- **Motor de fracciones (PMV 2):** calcula mal expresiones con paréntesis u otro operador (`3/4 * (1/2 + 2/5)` → `9/10`; `9/4 / 3/8` → `3/32`). El verificador del Hito 2 no se deja engañar (§3), y no se ha modificado el motor. Recomendación: limitarlo a una operación entre dos fracciones, o sustituirlo por un parser completo.
- El verificador **no entiende el lenguaje natural** dentro de un paso: lo que se escribe en la pizarra debe ser matemática (`escribe`); las palabras van en la explicación.

## 8. Fuera de este hito

Pizarra interactiva (Hito 3) y tutor adaptativo + informes (Hito 4), que consumen los procedimientos publicados aquí.
