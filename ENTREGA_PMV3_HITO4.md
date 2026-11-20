# PMV 3 · HITO 4 — Tutoría adaptativa y reportes de progreso (y piloto completo)

**Proyecto:** MentorIA Math · **Rama:** `feat/pmv3-staging`
Migración: [`20261119100000_pmv3_hito4_tutoria`](prisma/migrations/20261119100000_pmv3_hito4_tutoria/migration.sql) — **aditiva** (dos tipos y dos tablas; no toca ninguna fila existente).

---

## 1. Qué pedía el hito y dónde está

| Requisito | Entregado en |
| --- | --- |
| Tutor que ofrece **pistas ante un error** | Cada error devuelve la siguiente pista de la escalera ([`servidor.ts`](lib/tutoria/servidor.ts)); también a petición del alumno |
| Si se **bloquea repetidamente**: abrir un **repaso breve**, **regresar al paso original** y **proponer un ejercicio equivalente** | La decisión es una máquina de estados pura ([`motor.ts`](lib/tutoria/motor.ts)); el repaso es la **pizarra del Hito 3** dentro de la propia tarea ([`tarea-de-banco.tsx`](components/estudiante/tarea-de-banco.tsx)) |
| El docente **revisa el progreso** de sus alumnos | [`/docente/tutoria`](app/docente/tutoria/page.tsx): resumen por alumno y, ejercicio a ejercicio, la historia de la tutoría |
| **Exportar a PDF y Excel** | Los informes existentes ganan la tutoría: columnas nuevas en «Estudiantes» y una hoja **«Tutoría adaptativa»** en el Excel; sección en el PDF |

---

## 2. La regla del tutor

Es **determinista** (nada la decide la IA), con dos umbrales a la vista:

```
 error ──► PISTA (la siguiente: 0, 1, 2…)
 3 errores seguidos (UMBRAL_BLOQUEO) ──► ABRIR REPASO BREVE
 cerrar el repaso ──► VOLVER AL PASO ORIGINAL (errores a cero: oportunidad limpia)
 en el regreso:
     acierta ──► PROPONER EJERCICIO EQUIVALENTE
     2 errores más (UMBRAL_REGRESO) ──► PROPONER EJERCICIO EQUIVALENTE (en vez de insistir)
```

- **Errores seguidos**: un acierto rompe la racha. «Dos errores, acierto, dos errores» **no** es un bloqueo.
- **Qué repaso se abre**: el que el docente enlazó (`repasoId`) a un procedimiento del tema; si no hay, el procedimiento publicado **más corto** del tema. Siempre uno al que **el alumno tiene acceso**.
- **Sin repaso publicado** en el tema: se le dice con claridad («pídele ayuda a tu profesor») y el itinerario **no se atasca** —la sesión pasa a «regreso» y sigue—.
- **Qué ejercicio equivalente**: mismo tema, **misma dificultad** y mismo motor; **publicado y verificado**; que no tenga ya en la tarea ni se le haya propuesto. Sale del catálogo del colegio o del **banco privado del docente que asignó la tarea** —**nunca** del de otro docente (comprobado con 4 alumnos)—. No cuenta para la nota; queda como evidencia de consolidación.
- **Pistas**: primero las que escribió el docente en el ejercicio; si se acaban, las generales de un procedimiento del tema. Si no hay más, **se dice** (no se inventa).

### Defensas del servidor

La tutoría sólo funciona para un **alumno matriculado**, en una **tarea abierta**, sobre **un ejercicio de esa tarea**. Un alumno sin aula recibe 403; un ejercicio ajeno a la tarea, 404; un equivalente que no se le propuso (o el de otro docente), 404. «Cerrar el repaso» sólo cuenta si el repaso estaba abierto: el navegador no puede reiniciar a su antojo el contador de errores. Las respuestas no viajan al navegador.

---

## 3. Qué ve el alumno

En una tarea del banco, un error **no avanza**: el alumno se queda en el ejercicio, ve la pista, y puede pedir otra. Si se bloquea, **aparece la pizarra del repaso** (profesor 3D, láser, términos tocables) dentro de la tarea y un botón «He terminado el repaso: volver al ejercicio». Tras acertar, un cuadro «Para afianzarlo: un ejercicio parecido». Siempre hay «No sé: pasar al siguiente» para no atrapar a nadie.

## 4. Qué ve el docente

`/docente/tutoria`: por aula, pistas / repasos / equivalentes / **bloqueos** por alumno, y desplegable por ejercicio con la historia **en orden**: *respuesta incorrecta → pista → … → repaso abierto → repaso cerrado → respuesta correcta → equivalente propuesto → respondido*. Botones **Exportar PDF** y **Exportar Excel**. Un docente sólo ve a los alumnos de **sus** aulas.

---

## 5. Piloto completo

`node qa/pmv3-piloto.mjs` recorre, de punta a punta y en un Chrome real:

1. El docente **crea el ejercicio** (con 3 pistas) y un banco de parecidos; el agente de IA **genera el procedimiento** del tema y el docente lo **publica**.
2. Crea el aula y **asigna el ejercicio** en una tarea.
3. El alumno **se matricula** y resuelve: error→pista · error→pista · error→**repaso** → **vuelve** al original → acierta → **equivalente** → lo resuelve → la tarea se **entrega**.
4. El docente **revisa el progreso** en su panel y **exporta PDF y Excel** (el Excel se vuelve a leer y se comprueban las cifras: 3 errores, 2 pistas, 1 repaso, 1 equivalente).

Guía manual para repetirlo en staging: [`GUIA_PILOTO_PMV3.md`](GUIA_PILOTO_PMV3.md).

---

## 6. Verificación ejecutada

| Batería | Resultado |
| --- | --- |
| `node --experimental-strip-types qa/pmv3-tutor-motor.mjs` — **nueva** (decisión del tutor) | **22 comprobaciones · 0 fallidas** |
| `node qa/pmv3-piloto.mjs` — **nueva** (API + **Chrome real** + exportaciones) | **58 comprobaciones · 0 fallidas** |
| Regresión: las 20 baterías de los hitos 3 y 4 del PMV 2 (`qa/hito3*.mjs`, `qa/hito4*.mjs`) | 20/20 con salida 0 |
| `npx tsc --noEmit` | sin errores |

### Defectos reales que encontró el piloto (corregidos)

- **El historial salía desordenado.** `now()` de Postgres es la hora del *inicio de la transacción*: los eventos de una misma respuesta (respuesta, pista, repaso…) compartían hora y se leían en cualquier orden. Ahora cada evento lleva su hora, creciente.
- **Un tema sin repaso publicado dejaba la sesión en «repaso» para siempre.** Ahora se da por saltado y el itinerario sigue.
- Sin haber hecho la **evaluación inicial**, el alumno es llevado al diagnóstico antes de poder abrir una tarea (comportamiento correcto del producto; la batería lo completa por la API).

---

## 7. Límites honestos

- El **repaso** y las **pistas generales** dependen de que el docente haya **publicado** un procedimiento en el tema (Hito 2). Sin él, el tutor lo dice y sigue con pistas y equivalentes; no inventa contenido.
- El **ejercicio equivalente** sale del banco existente (mismo tema y dificultad). Si el tema sólo tiene un ejercicio, no hay equivalente y el tutor lo dice. Generar uno **a medida** con la plantilla parametrizada o con IA es una mejora natural, no incluida.
- La tutoría actúa sobre los **ejercicios de las tareas del banco**. Las preguntas de comprensión de la pizarra (Hito 3) tienen pistas y corrección, pero no abren repasos.
- El PDF es una libreta con membrete y firma en blanco (el cliente no entregó logo).
