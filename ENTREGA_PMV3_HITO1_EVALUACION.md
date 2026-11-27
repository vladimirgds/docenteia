# PMV 3 · Hito 1 (cierre) — Evaluación segura

Completa el Hito 1 con lo que pedía el Word del PMV 3 y faltaba tras la primera entrega (bancos y permisos, ver [`ENTREGA_PMV3_HITO1.md`](ENTREGA_PMV3_HITO1.md)).

**Regla de calificación del piloto** (propuesta por el cliente): todos los ejercicios pesan lo mismo, **sin crédito parcial**, y la nota de la tarea es la del **último intento**, calculada **en el servidor**.

## Qué cambia

| Pide el Word | Qué hay ahora |
| --- | --- |
| Versión del ejercicio | `Ejercicio.version` (empieza en 1). Cada edición del **contenido** (enunciado, respuesta o pistas) la sube y deja la anterior en `ejercicio_versiones`. Cambiar el nivel o el estado no la sube. |
| Fijar ejercicios y rúbricas al asignar | Al crear la tarea, en la misma transacción, se copian a `tarea_ejercicios` el enunciado, la respuesta, los pasos, las pistas, la versión y la **rúbrica** (`{puntos:1, creditoParcial:false, criterio:"EQUIVALENCIA"}`). La regla de nota queda escrita en `tareas.reglaCalificacion`. El alumno resuelve, se le corrige y ve el resultado **contra esa copia**, no contra el banco vivo. |
| Nota calculada en servidor | `corregir` guarda en el intento en curso el veredicto que da el servidor. `entregar` **ignora** `puntaje`, `detalle` y `completada` del navegador y calcula la nota con la copia congelada y esas respuestas (`lib/docente/calificacion.ts`, funciones puras). El desglose lo escribe el servidor. |
| Reenvíos y reintentos en transacción | `corregir` y `entregar` toman un cerrojo (`pg_advisory_xact_lock`) por alumno y tarea y comprueban el tope de intentos **dentro** de la transacción. Un doble clic o seis peticiones a la vez cuentan **un** intento. Nunca queda un intento a medias. |
| Último intento | Cada intento se guarda (`intentos_tarea`, `respuestas_intento`); la nota de la tarea es la del último, aunque sea peor que la anterior. |

## Demostración del Word (cubierta por `qa/pmv3-hito1-evaluacion.mjs`, 61 comprobaciones)

1. **Kim crea su primer ejercicio y lo asigna.** Su banco privado empieza vacío; el ejercicio nace en la versión 1; la tarea queda con su copia congelada.
2. **Otra docente del mismo colegio** ve el catálogo maestro y su propio banco, **no** lo de Kim; no puede editarlo ni asignarlo (404 / 400).
3. **Editar el ejercicio** (`10 + 5` → `10 + 6`): versión 2, versión 1 en el historial, la tarea anterior sigue con `10 + 5 = 15` y su **nota no cambia**; una tarea nueva congela la versión 2.
4. **El diagnóstico general sigue funcionando** y el catálogo maestro no cambia por lo que hagan los docentes.
5. **Nota falsificada:** el navegador envía `puntaje: 100` con un ejercicio fallado → el servidor registra 50.
6. **Último intento:** 100 → 0 → 100; cuenta el último; el cuarto intento se rechaza.
7. **Concurrencia:** 6 entregas simultáneas → 1 aceptada y 5 rechazadas; en el último intento permitido, 5 a la vez → un solo intento contado.

## Migración (`20261120100000_pmv3_hito1_evaluacion_segura`)

**Aditiva**: columnas con valor por defecto y tablas nuevas; no cambia ni borra filas ni IDs. El único `INSERT` rellena `tarea_ejercicios` para las **tareas históricas** con el ejercicio tal como está hoy (versión 1), de modo que desde ahora editarlo no las altere. Las notas históricas se conservan y quedan marcadas `modoNota = CLIENTE` (las calculó el navegador). La marcha atrás está en la cabecera del archivo SQL. **Hacer copia de seguridad antes de aplicarla en producción.**

## Límites

- **Tareas del motor conversacional** (sin ejercicios en la base de datos: el navegador los genera): su nota sigue viniendo del cliente, marcada `modoNota = CLIENTE`. Lo que sí queda blindado es el tope de reintentos. Pasarlas también a nota de servidor exige que el servidor guarde cada ejercicio que genera; es un cambio mayor que no estaba en el Word y se puede abordar si el cliente lo pide.
- La regla de nota es la única admitida hoy (la del piloto). La columna `reglaCalificacion` y la rúbrica por ejercicio permiten ampliarla (puntos distintos, crédito parcial) sin otra migración.
- Una tarea cuyo intento queda abierto sin entregar conserva sus respuestas; se retoma al volver.
