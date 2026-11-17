# PMV 3 — Entrega completa

**Proyecto:** MentorIA Math · **Rama:** `feat/pmv3-staging` (sobre `main` del PMV 2)

Cada hito tiene su documento de entrega con la demostración, la evidencia y los límites. Este es el índice.

| Hito | Qué entrega | Documento | Batería de aceptación |
| --- | --- | --- | --- |
| **1** — Contenido y bancos | Catálogo maestro (alimenta el diagnóstico) y bancos **privados por docente** (nacen vacíos); borradores generados por IA; migración **sin pérdida de datos** (probada sobre una copia de los 420 ejercicios reales: checksum idéntico) | [`ENTREGA_PMV3_HITO1.md`](ENTREGA_PMV3_HITO1.md) | `pmv3-hito1` · 76 |
| **2** — Editor del docente | Reglas, métodos y procedimientos definidos, **probados y publicados desde el panel**; agente **Gemini** que redacta borradores editables (pasos, ejercicios, preguntas, pistas); el servidor **verifica los pasos** que el motor soporta; probado con **suma de fracciones** y **regla de la cadena** (5/5 verificados con Gemini real) | [`ENTREGA_PMV3_HITO2.md`](ENTREGA_PMV3_HITO2.md) | `pmv3-hito2` · 60 |
| **3** — Pizarra interactiva | KaTeX, **profesor 3D**, **tocar un término** para oírlo, pistas, respuesta por **texto o voz**, y **puntero láser** que señala el término exacto y se mantiene **sincronizado** al pausar, repetir y reanudar | [`ENTREGA_PMV3_HITO3.md`](ENTREGA_PMV3_HITO3.md) | `pmv3-pizarra-sincronia` · 49 y `pmv3-hito3` · 67 (Chrome real) |
| **4** — Tutoría adaptativa y reportes | Pistas ante el error; **repaso breve** tras un bloqueo; **regreso al paso original**; **ejercicio equivalente**; el docente revisa el progreso y **exporta a PDF y Excel** | [`ENTREGA_PMV3_HITO4.md`](ENTREGA_PMV3_HITO4.md) | `pmv3-tutor-motor` · 22 |
| **Piloto** | Del ejercicio creado y asignado hasta la tutoría adaptativa y el reporte de progreso, de punta a punta | [`ENTREGA_PMV3_HITO4.md`](ENTREGA_PMV3_HITO4.md) §5 · [`GUIA_PILOTO_PMV3.md`](GUIA_PILOTO_PMV3.md) | `pmv3-piloto` · 58 (Chrome real) |

Regresión: las baterías del PMV 2 (`npm test`, más las 20 de `qa/hito3*` y `qa/hito4*`) siguen pasando.

## Cómo ejecutar todo

```bash
npm install
npx prisma migrate deploy      # 3 migraciones nuevas, todas ADITIVAS
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

> ⚠ **Antes de desplegar sobre la base real**: copia de seguridad, y ten en cuenta que `vercel-build` ejecuta `prisma migrate deploy` y la semilla en cada compilación: si el entorno *Preview* de Vercel usa la base de producción, la primera vista previa de esta rama la migrará. Marcha atrás y detalles: `ENTREGA_PMV3_HITO1.md` §5.

## Hallazgos que conviene conocer

- **Motor de fracciones (PMV 2)**: calcula mal expresiones con paréntesis u otro operador (`3/4 * (1/2 + 2/5)` → `9/10`, correcto `27/40`) y las marca como verificadas. **No se ha modificado**; el verificador de pasos del Hito 2 **no se deja engañar** (contrasta con una segunda fuente independiente) y los borradores de IA exigen que Gemini y el motor coincidan. Recomendado: limitar el motor a una operación entre dos fracciones o sustituirlo por un analizador completo.
- Las páginas del panel docente leían todo el banco sin el filtro institucional del Hito 4 del PMV 2; ahora aplican la misma regla que la API.
- Borrar un tema destruía los ejercicios de todos los docentes que escribieron en él; ahora se rechaza si hay banco privado ajeno (se ofrece archivar).

## Seguridad

Las credenciales (base de datos, Gemini) se compartieron por chat: **cámbialas** al terminar. En el repositorio no hay ninguna (`.env` está ignorado).

## Alcance y límites (resumen)

Profesor 3D modelado con primitivas (sin archivo de modelo); voz del navegador (no neuronal) para poder sincronizar el láser con `onstart`/`onend`; ejercicio equivalente del banco existente (no generado a medida); la tutoría actúa sobre tareas del banco. Cada documento de hito lista sus límites con detalle.
