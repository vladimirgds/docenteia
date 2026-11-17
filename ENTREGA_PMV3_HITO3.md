# PMV 3 · HITO 3 — Pizarra conversacional interactiva

**Proyecto:** MentorIA Math · **Rama:** `feat/pmv3-staging`
Sin cambios en la base de datos: este hito consume los procedimientos publicados en el Hito 2.

---

## 1. Qué pedía el hito y dónde está

| Requisito | Entregado en |
| --- | --- |
| Pizarra digital con **KaTeX** | [`pizarra-interactiva.tsx`](components/pizarra/pizarra-interactiva.tsx); los pasos de un procedimiento se proyectan con KaTeX |
| **Profesor virtual 3D** | [`profesor-3d.tsx`](components/pizarra/profesor-3d.tsx) (three.js): señala con el brazo hacia el láser, mueve la boca al hablar, parpadea; 2D de respaldo sin WebGL |
| **Tocar un término** para oír su explicación | Cada término es una caja real en la fórmula; tocarlo (o su botón accesible) dice su explicación |
| **Pedir pistas** | `POST /api/estudiante/procedimientos/[id]/pista`: una a una, de la más suave a la más concreta |
| **Responder por texto o voz** | Campo de texto + botón «Responder hablando» (reconocimiento de voz → notación → corrección en el servidor) |
| **Puntero láser** que señala el término exacto y **se mantiene sincronizado** al pausar, repetir y reanudar | [`secuenciador.ts`](lib/pizarra/secuenciador.ts) (máquina de estados) + el láser de la pizarra |

Entradas: alumno → [`/estudiante/pizarra`](app/estudiante/pizarra/page.tsx) y `/estudiante/pizarra/[id]`; docente → **Vista previa** de cada procedimiento (`/docente/procedimientos/[id]/previa`), para probarlo antes de publicar.

---

## 2. La sincronía láser ↔ audio (la parte delicada)

La narración es una lista de **segmentos**: cada uno, una frase y el término al que apunta. El
secuenciador es **puro** (sin React ni navegador) para poder probarlo contra un locutor falso que
dispara los eventos en el orden —y a la hora— que se quiera, incluidos los malos.

Reglas que sostienen la sincronía:

1. El láser se **mueve cuando EMPIEZA el audio**, no cuando se encola: nunca señala algo que aún no se ha nombrado.
2. **Pausar** cancela el audio y deja el láser **donde está**.
3. **Reanudar** vuelve a decir el segmento en curso desde el principio y el láser vuelve a su término: reempiezan **juntos** (una voz sintética no se puede continuar a media frase de forma fiable).
4. **Repetir** reempieza el segmento; **Repetir paso**, el primero del paso. **Siguiente/Anterior** saltan de paso y siguen narrando.
5. Un evento de un audio **cancelado** no puede avanzar nada (cada locución lleva un número de generación). Es el fallo clásico de los sintetizadores: `cancel()` dispara `onend`, y sin este candado «pausar» saltaría al segmento siguiente.
6. **Tocar un término** interrumpe, dice su explicación señalándolo y se queda en pausa **sin mover la posición**: reanudar continúa por donde iba.

Dos peculiaridades del sintetizador real que el adaptador ([`voz-navegador.ts`](lib/pizarra/voz-navegador.ts)) absorbe: Chrome a veces **no dispara `onstart`** o **no dispara `onend`**; un temporizador de cortesía y un vigilante evitan que el láser no se mueva nunca o que la narración se cuelgue. Sin voz, la pizarra funciona con un locutor temporizado: el láser y los pasos avanzan igual.

### El láser aterriza en la caja exacta

Cada término se compone para KaTeX con `\htmlClass{pzt-N}{…}`, de modo que el navegador tiene un elemento real al que apuntar. Como los fragmentos se convierten por separado, **el servidor rechaza al guardar** un término que no es un trozo completo (`/24` dentro de `6/24` compilaría, pero rompería la fracción). La confianza de KaTeX está restringida a **nuestras** clases `pzt-N`: ni `\href`, ni `\url`, ni imágenes, ni clases arbitrarias (comprobado).

---

## 3. Lo que el alumno NO ve

- Las **respuestas** de las preguntas no viajan al navegador (sólo el veredicto); las **pistas** salen una a una, el servidor las guarda.
- Sólo ve lo **publicado**, y de los docentes **en cuyas aulas está matriculado**. El borrador, el publicado de otro docente o uno inexistente: **404**.
- Un docente en la API del alumno: 403.

---

## 4. Verificación ejecutada

| Batería | Resultado |
| --- | --- |
| `node --experimental-strip-types qa/pmv3-pizarra-sincronia.mjs` — **nueva** (secuenciador contra un locutor falso) | **49 comprobaciones · 0 fallidas** |
| `node qa/pmv3-hito3.mjs` — **nueva** (API + **Chrome real** con voz guionizada) | **67 comprobaciones · 0 fallidas** |
| `npx tsc --noEmit` | sin errores |

`pmv3-hito3.mjs` comprueba, en un Chrome real: profesor 3D dibujándose · el láser **no** señala nada hasta que empieza el audio · aterriza **dentro de la caja** de «1/2», luego de «1/3» · pausa: el láser **se queda** y un `onend` tardío **no avanza** · reanudar y repetir: audio y láser reempiezan juntos · tocar un término dice **su** explicación y deja la narración en su sitio · «Siguiente» · pistas una a una (también habladas) · respuesta escrita incorrecta/correcta · responder **hablando** («diez entre doce» → `10/12` → correcto) · sin errores de consola · vista previa del docente (y 404 para el de otro).

### Defectos reales que encontró la propia batería (corregidos)

- El láser quedaba **20 px** por debajo del término: el contenedor de la pizarra usaba `space-y-3`, que añadía un margen al láser y anulaba su centrado. Ahora se centra con `transform`.
- El resaltado del término **se borraba** en el render siguiente: en esta versión de React un `{ __html }` nuevo cuenta como cambio y reemplaza el contenido del bloque. Ahora se memorizan los objetos.
- `\class` (de MathJax) **no existe en KaTeX** (`\htmlClass`): se vio al renderizar de verdad, no al comparar cadenas.
- El 3D pintaba a 60 fps continuos y, sin tarjeta gráfica (habitual en aulas), **saturaba el equipo**: ahora ~30 fps al moverse, ~8 en reposo y 0 con la pestaña oculta.

---

## 5. Límites honestos

- El profesor 3D está modelado con **primitivas** (no hay un archivo de modelo): cumple —gesticula, señala, habla—, pero es estilizado. Sustituir `construirProfesor` por un GLB propio no cambia nada más.
- La **voz** es la del navegador (`speechSynthesis`); la plataforma ya tenía `/api/voz` para voz neuronal (Google/ElevenLabs), pero un audio de red no entrega el instante exacto de cada sílaba, y la sincronía del láser se apoya en `onstart`/`onend` del sintetizador del navegador. Queda como mejora si se quiere voz neuronal con este mismo láser.
- El **dictado** traduce con prudencia lo que se puede (números en palabras, «más», «entre», «al cuadrado»…); lo que no reconoce lo deja tal cual y decide el corrector del servidor.
- El reconocimiento de voz depende del navegador (Chrome/Edge sí; Firefox no): si no existe, el botón no aparece y el texto sigue funcionando.
