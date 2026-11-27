# PMV 3 · Hito 5A (ampliación) — La ficha de método dentro de una tarea evaluable

Cierra el límite que dejó el Hito 5A («la ficha no se aplica todavía dentro de una tarea evaluable»).

## Qué hay

| Qué | Dónde |
| --- | --- |
| Al asignar una tarea **del banco**, el docente puede elegir una **ficha de método publicada** (desplegable «Ficha de método (opcional)») | [`formulario-tarea.tsx`](components/docente/formulario-tarea.tsx) · `POST /api/docente/tareas` con `fichaId` |
| La ficha se **congela al asignar**: se copia la versión **publicada** (no la de trabajo) en la tarea | Columnas `fichaId`, `fichaVersion`, `fichaTitulo`, `fichaContenido` en `tareas` · [`app/api/docente/tareas/route.ts`](app/api/docente/tareas/route.ts) |
| Al corregir, si el ejercicio encaja con el método y el alumno falla, recibe la **pista de error concreta** de la ficha (factor omitido o respuesta errónea típica), **sin revelar la respuesta** | [`lib/docente/fichas-tarea.ts`](lib/docente/fichas-tarea.ts) · ruta `…/ejercicios/[ejercicioId]/corregir` · recuadro `pista-metodo` en [`tarea-de-banco.tsx`](components/estudiante/tarea-de-banco.tsx) |
| La **nota** la sigue calculando el servidor con las reglas de siempre | La ficha sólo da veredicto cuando el corrector general **no sabe** decidir; nunca contradice uno que sí sabe dar |

## Reglas

- Sólo fichas **PUBLICADAS** (un borrador → 409) y **visibles** para quien asigna (la privada de otro docente → 404).
- Editar y republicar la ficha **no cambia** las tareas ya asignadas; las nuevas toman la versión nueva.
- Si la copia congelada no pasa la validación (Zod), la tarea se corrige **sin ficha**, como antes.
- El enunciado se lee tal cual, tras «:», tras `f(x) =` / `y =`, o sin la consigna («Deriva (3x^2+1)^4»).
- Las pistas **generales** las sigue dando el tutor adaptativo (Hito 4); la ficha sólo añade las de error concreto.
- Sin ficha, nada cambia (`metodo: null` en la respuesta).

## Evidencia

- `qa/pmv3-hito5a-ficha-en-tarea.mjs` · **29** comprobaciones: lectura del enunciado, asignar (publicada / borrador / ajena / inexistente), congelado de la versión, pista por factor omitido y por exponente sin bajar, sin fuga de la respuesta, nota 100 al entregar, versión 1 frente a versión 2, tarea sin ficha y alumno ajeno.
- Regresión sin fallos: `pmv3-hito1-evaluacion` 61, `pmv3-hito5a-fichas` 121, `pmv3-tutor-motor` 22, `pmv3-piloto` 58 (Chrome real), `pmv3-hito5a-navegador` 36 (Chrome real), `hito3-banco-ejercicios` 41; `tsc --noEmit` sin errores.
- Migración aditiva `20261126100000_pmv3_hito5b_ficha_en_tarea` (cuatro columnas opcionales); marcha atrás en la cabecera del SQL.

## Límites

- Sólo tareas **del banco**: las tareas en modo «generación en vivo (IA)» no pasan por esta corrección.
- El desplegable del docente y el recuadro de pista del alumno están comprobados por la API y por `tsc`, no con un recorrido propio en Chrome.
