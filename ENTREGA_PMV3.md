# PMV 3 — Entrega completa

**Proyecto:** MentorIA Math · **Rama:** `feat/pmv3-staging` (sobre `main` del PMV 2)

Cada hito tiene su documento de entrega con la demostración, la evidencia y los límites. Este es el índice.

> **Cierre frente al Word del cliente (H1 → H5B), fila por fila:** [`ENTREGA_PMV3_CIERRE.md`](ENTREGA_PMV3_CIERRE.md). **Operación** (configuración, migraciones, despliegue, reversión, consumo): [`GUIA_OPERACION_PMV3.md`](GUIA_OPERACION_PMV3.md).

| Hito | Qué entrega | Documento | Batería de aceptación |
| --- | --- | --- | --- |
| **1** — Contenido y bancos | Catálogo maestro (alimenta el diagnóstico) y bancos **privados por docente** (nacen vacíos); borradores generados por IA; migración **sin pérdida de datos** (probada sobre una copia de los 420 ejercicios reales: checksum idéntico) | [`ENTREGA_PMV3_HITO1.md`](ENTREGA_PMV3_HITO1.md) | `pmv3-hito1` · 76 |
| **1 (cierre)** — Evaluación segura | **Versión** del ejercicio; ejercicios y **rúbricas congelados al asignar**; **nota calculada en el servidor** (igual peso, sin crédito parcial, último intento); reenvíos y reintentos **en transacción**; tareas históricas rellenadas por la migración | [`ENTREGA_PMV3_HITO1_EVALUACION.md`](ENTREGA_PMV3_HITO1_EVALUACION.md) | `pmv3-hito1-evaluacion` · 61 |
| **2** — Editor del docente | Reglas, métodos y procedimientos definidos, **probados y publicados desde el panel**; agente **Gemini** que redacta borradores editables (pasos, ejercicios, preguntas, pistas); el servidor **verifica los pasos** que el motor soporta; probado con **suma de fracciones** y **regla de la cadena** (5/5 verificados con Gemini real) | [`ENTREGA_PMV3_HITO2.md`](ENTREGA_PMV3_HITO2.md) | `pmv3-hito2` · 60 |
| **2 (cierre)** — Orquestador pedagógico | Servicio de servidor que lee **modo, paso e intentos** y decide **explicar / preguntar / pista / mostrar paso**; **política de revelación** sobre texto, audio y LSG; validador de **pasos intermedios** del alumno (`2(x+4)=3x-1`: acepta `2x+8`, rechaza `2x+4` y explica); **decisiones registradas** con su motivo | [`ENTREGA_PMV3_HITO2_ORQUESTADOR.md`](ENTREGA_PMV3_HITO2_ORQUESTADOR.md) | `pmv3-hito2-orquestador` · 82 y `pmv3-hito2-navegador` · 16 (Chrome real) |
| **5A (cierre)** — Agente de IA y editor de **fichas de método** versionadas | Patrón de entrada, variables, condiciones, pasos, operaciones, ejemplos y pistas; Gemini con salida estructurada validada con **Zod**; el **motor** verifica cada paso en ejemplos y casos generados y marca los **pendientes**; **aprobación docente** para publicar; reutilización con `(5x^3-2)^2` y pista si el alumno omite `6x` | [`ENTREGA_PMV3_HITO5A_FICHAS.md`](ENTREGA_PMV3_HITO5A_FICHAS.md) | `pmv3-hito5a-fichas` · 121 y `pmv3-hito5a-navegador` · 36 (Chrome real) |
| **5A (ampliación)** — Ficha de método en tareas evaluables | El docente aplica una ficha **publicada** a una tarea del banco; se **congela** al asignar; al fallar, el alumno recibe la **pista de error concreta** sin revelar la respuesta; la nota sigue siendo del servidor | [`ENTREGA_PMV3_HITO5A_FICHA_EN_TAREA.md`](ENTREGA_PMV3_HITO5A_FICHA_EN_TAREA.md) | `pmv3-hito5a-ficha-en-tarea` · 29 |
| **3** — Pizarra interactiva | KaTeX, **profesor 3D**, **tocar un término** para oírlo, pistas, respuesta por **texto o voz**, y **puntero láser** que señala el término exacto y se mantiene **sincronizado** al pausar, repetir y reanudar | [`ENTREGA_PMV3_HITO3.md`](ENTREGA_PMV3_HITO3.md) | `pmv3-pizarra-sincronia` · 49 y `pmv3-hito3` · 67 (Chrome real) |
| **4** — Tutoría adaptativa y reportes | Pistas ante el error; **repaso breve** tras un bloqueo; **regreso al paso original**; **ejercicio equivalente**; el docente revisa el progreso y **exporta a PDF y Excel** | [`ENTREGA_PMV3_HITO4.md`](ENTREGA_PMV3_HITO4.md) | `pmv3-tutor-motor` · 22 |
| **3A (cierre)** — Analogía y apariciones | **Analogía** de un término y **volver al paso**; ids estables por paso, **miembro** y **aparición**; el láser señala la aparición correcta al pausar, repetir y **redimensionar**; **medición del desfase** audio → láser; **transcripción editable** al responder por voz | [`ENTREGA_PMV3_CIERRE.md`](ENTREGA_PMV3_CIERRE.md) §H3A | `pmv3-h3a-analogia` · 23 (Chrome real) |
| **3B** — Profesor virtual 3D | Personaje **GLB** con esqueleto y expresiones en **React Three Fiber**, boca con las **marcas de voz**, brazo y mirada al objetivo, **rayo** hasta el término, carga **bajo demanda**, **respaldo 2D** con el mismo recorrido; modelo **CC0** editable | [`ENTREGA_PMV3_CIERRE.md`](ENTREGA_PMV3_CIERRE.md) §H3B | `pmv3-h3b-profesor` · 42 (Chrome real, escritorio y móvil) |
| **4 (cierre)** — Habilidades y analítica | **Habilidades y prerrequisitos sin ciclos**; registro por habilidad; el bloqueo abre el **repaso del prerrequisito** (caso **2x − 3x** → repaso de signos); **mismas métricas y filtro** en panel, PDF y Excel | [`ENTREGA_PMV3_CIERRE.md`](ENTREGA_PMV3_CIERRE.md) §H4 | `pmv3-h4-habilidades` · 40 |
| **5B** — Piloto integrado y entrega | **Consumo de IA y voz** medido y registrado (`/api/admin/consumo`); versión por commit en `/api/health`; guía de operación | [`ENTREGA_PMV3_CIERRE.md`](ENTREGA_PMV3_CIERRE.md) §H5B · [`GUIA_OPERACION_PMV3.md`](GUIA_OPERACION_PMV3.md) | `pmv3-h5b-consumo` · 14 (con Gemini real) |
| **Piloto** | Del ejercicio creado y asignado hasta la tutoría adaptativa y el reporte de progreso, de punta a punta | [`ENTREGA_PMV3_HITO4.md`](ENTREGA_PMV3_HITO4.md) §5 · [`GUIA_PILOTO_PMV3.md`](GUIA_PILOTO_PMV3.md) | `pmv3-piloto` · 58 (Chrome real) |

Regresión: las baterías del PMV 2 (`npm test`, más las 20 de `qa/hito3*` y `qa/hito4*`) siguen pasando.

## Cómo ejecutar todo

```bash
npm install
npx prisma migrate deploy      # migraciones del PMV 3, todas ADITIVAS (ver GUIA_OPERACION_PMV3.md)
npm run db:seed
npm run dev                    # sin GEMINI_API_KEY: modo demostración, sin gastar cuota
npm test                       # incluye las baterías del PMV 3
```

Con `GEMINI_API_KEY` configurada, el agente de IA usa Gemini real (`GEMINI_MODEL` para los ejercicios, `GEMINI_MODEL_PROCEDIMIENTOS` para los procedimientos; por defecto `gemini-2.5-flash-lite` y `gemini-2.5-flash`).

## Migraciones (todas aditivas)

| Migración | Qué hace |
| --- | --- |
| `20261117120000_pmv3_hito1_bancos_docentes` | `ambito`/revisión en `ejercicios` (todo lo existente queda **MAESTRO**); sustituye el índice único global por dos **parciales** |
| `20261118100000_pmv3_hito2_procedimientos` | Tabla `procedimientos` |
| `20261119100000_pmv3_hito4_tutoria` | Tablas `sesiones_tutoria` y `eventos_tutoria` |
| `20261120200000_pmv3_hito2_orquestador` | Tablas `practicas_guiadas` y `decisiones_pedagogicas`, tipo `ModoAprendizaje` |
| `20261122100000_pmv3_hito5a_fichas_metodo` | Tablas `fichas_metodo` y `fichas_metodo_versiones` |
| `20261120100000_pmv3_hito1_evaluacion_segura` | `ejercicios.version`, `tareas.reglaCalificacion`, tablas `tarea_ejercicios`, `intentos_tarea`, `respuestas_intento`, `ejercicio_versiones`; rellena la copia congelada de las tareas históricas |

> ⚠ **Antes de desplegar sobre la base real**: copia de seguridad, y ten en cuenta que `vercel-build` ejecuta `prisma migrate deploy` y la semilla en cada compilación: si el entorno *Preview* de Vercel usa la base de producción, la primera vista previa de esta rama la migrará. Marcha atrás y detalles: `ENTREGA_PMV3_HITO1.md` §5.

## Hallazgos que conviene conocer

- **Motor de fracciones (PMV 2)**: calcula mal expresiones con paréntesis u otro operador (`3/4 * (1/2 + 2/5)` → `9/10`, correcto `27/40`) y las marca como verificadas. **No se ha modificado**; el verificador de pasos del Hito 2 **no se deja engañar** (contrasta con una segunda fuente independiente) y los borradores de IA exigen que Gemini y el motor coincidan. Recomendado: limitar el motor a una operación entre dos fracciones o sustituirlo por un analizador completo.
- Las páginas del panel docente leían todo el banco sin el filtro institucional del Hito 4 del PMV 2; ahora aplican la misma regla que la API.
- Borrar un tema destruía los ejercicios de todos los docentes que escribieron en él; ahora se rechaza si hay banco privado ajeno (se ofrece archivar).

## Seguridad

Las credenciales (base de datos, Gemini) se compartieron por chat: **cámbialas** al terminar. En el repositorio no hay ninguna (`.env` está ignorado).

## Alcance y límites (resumen)

Profesor 3D modelado con primitivas (sin archivo de modelo); voz del navegador (no neuronal) para poder sincronizar el láser con `onstart`/`onend`; ejercicio equivalente del banco existente (no generado a medida); la tutoría actúa sobre tareas del banco. Cada documento de hito lista sus límites con detalle.
