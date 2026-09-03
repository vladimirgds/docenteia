# MVP 2 · HITO 2 — Pizarra KaTeX Animada y Avatar Dinámico Enriquecido

Entrega del segundo hito. Todo lo que sigue está implementado, compilado y
verificado con la suite del proyecto: **1.766 comprobaciones automáticas, 0
fallos**, de las cuales **139 son nuevas** y específicas de este hito
(`qa/hito2.mjs`).

---

## 1. Qué pedía el pliego y dónde está

| Requisito del cliente | Fichero | Estado |
| --- | --- | --- |
| `components/leccion/pizarra-animada.tsx` con resaltado dinámico sobre columnas, cifras operadas, llevadas, reagrupaciones y cancelaciones | `components/leccion/pizarra-animada.tsx` + `lib/leccion/animacion.ts` | ✅ |
| Resaltado con **overlay SVG / cajas** sin recompilar el bloque KaTeX (sin parpadeo) | `components/leccion/pizarra-animada.tsx` | ✅ |
| `components/leccion/sincronizador-leccion.ts` con TTS → avance de paso y encendido/apagado de resaltados | `components/leccion/sincronizador-leccion.ts` + `lib/leccion/sincronizacion.ts` | ✅ |
| Controles: **Pausar, Reanudar, Repetir paso, Avanzar manualmente** | `components/leccion/pizarra-animada.tsx` (`PanelAnimado`) | ✅ |
| Degradación elegante a **temporizador automático** si el audio falla o está deshabilitado | `lib/leccion/sincronizacion.ts` | ✅ |
| `components/leccion/avatar-2d.tsx` con **IDLE, EXPLICANDO, CELEBRANDO, APOYO, PENSANDO** y transiciones suaves | `components/leccion/avatar-2d.tsx` + `lib/leccion/avatar.ts` + `app/globals.css` | ✅ |
| **Modo Proyección**: pantalla completa + alto contraste, líneas KaTeX gruesas, tipografía escalada | `components/leccion/pizarra-animada.tsx` + `app/globals.css` | ✅ |
| Backlog UX del Hito 1: reordenar bloques de `/docente/crear-tema` | `components/docente/formulario-tema.tsx` | ✅ |
| `qa/hito2.mjs`: inicialización de la pizarra, máquina de estados del avatar, ausencia de excepciones de render | `qa/hito2.mjs` | ✅ |

---

## 2. La idea que sostiene el hito

Una pizarra que se anima repintando la fórmula parpadea. Cada vez que KaTeX
recompone el bloque, el navegador tira los nodos anteriores y dibuja otros: a
veinte resaltados por lección, eso se ve, y lo que el alumno percibe no es una
explicación sino un tembleque.

Aquí el resaltado **no toca la fórmula**:

1. El guion (`lib/leccion/animacion.ts`) marca cada pieza resaltable con
   `\htmlClass{...}` — una clase por columna, por coeficiente, por exponente,
   por término que se cancela.
2. KaTeX compone la escena **una sola vez** y conserva esas clases en el HTML.
3. El componente busca las clases en el DOM, mide su caja con
   `getBoundingClientRect` y guarda las coordenadas.
4. Encender un foco es cambiar **la opacidad de un rectángulo SVG** en una capa
   por encima. Ni un nodo de la fórmula se sustituye.

Cuando varias piezas comparten clase —las tres cifras de una columna—, el
recuadro abarca a todas: así sale la caja vertical sobre la columna, que es
exactamente lo que pedía el pliego.

Las medidas se rehacen al cambiar de escena y al cambiar el tamaño
(`ResizeObserver`, y también cuando terminan de cargar las fuentes de KaTeX).
**No** se rehacen al cambiar de foco, que es lo que ocurre veinte veces por
lección.

---

## 3. Lo que la pizarra sabe animar hoy

El guion decide, línea a línea, qué tipo de escena es. Todo esto es
determinista: no interviene el modelo.

### Cuenta en columna — llevadas y reagrupaciones

`24 + 17` se dispone en vertical, con el **1 de la llevada escrito encima de las
decenas**, y se recorre de derecha a izquierda:

- Caja sobre las unidades → *«Unidades: 4 más 7 son 11. Escribo 1 y llevo 1.»*
  con el rótulo **llevo 1** sobre la caja.
- Caja sobre las decenas → *«Decenas: 2 más 1 más 1 que llevábamos son 4.»*
- Óvalo sobre el resultado → *«El resultado es 41.»*

En la resta, la reagrupación se narra con las dos cifras, la escrita y la
rebajada: `52 - 27` dice *«a 2 no le puedo quitar 7, así que pido prestada una
decena»* y luego *«5, ya rebajado a 4, menos 2 son 2»*, con el rótulo
**reagrupo**. Las marcas salen del mismo cálculo que ya usaba la pizarra
(`lib/leccion/columna.ts`), así que lo que se dice y lo que se ve no pueden
divergir. La suite lo comprueba caso por caso, incluidas las cascadas
(`999 + 1`, `100 - 1`).

### Polinomios — coeficiente y exponente

`3x⁴ - 2x²` se recorre término a término, y dentro de cada término se rodean el
coeficiente y el exponente por separado, rotulados. Es lo que el tutor nombra al
aplicar la regla de la potencia.

### Despeje — cancelación tachada

`3x + 5 = 20` marca el **+5 y el −5 tachados a los dos lados a la vez** —el
momento en que se entiende el despeje—, luego señala el coeficiente
(*«dividimos los dos lados entre 3»*) y termina en la solución. Las soluciones no
enteras se dan como **fracción exacta** (`x vale 15/2`), no como decimal.

### Prosa

Una frase del tutor no se compone como fórmula: se pinta como texto. Sin ese
límite, «Vamos a ver la regla de la potencia» encajaba letra a letra en el
patrón de polinomio y la pizarra se ponía a señalar sílabas como si fueran
términos. La suite lo comprueba.

---

## 4. El sincronizador

`lib/leccion/sincronizacion.ts` es una máquina de estados **sin React**, y
`components/leccion/sincronizador-leccion.ts` la envuelve en un hook. Se separan
así porque una máquina con temporizadores se comprueba mucho mejor sin
navegador: la suite le inyecta un reloj falso y una voz falsa.

Una lección es una lista de escenas; cada escena, una lista de segmentos (la
frase de entrada y luego un segmento por foco). Mientras suena un segmento, su
foco está encendido; cuando calla, se apaga y entra el siguiente.

**Los cuatro mandos del pliego** están en el panel: Pausar, Reanudar, Repetir
paso y Avanzar. Añadidos: retroceder y un selector de escena para volver a un
paso concreto sin reproducir la lección entera —pensado para el profesor en
clase.

### La degradación no es un adorno

Tres caminos llevan al temporizador automático, y los tres están probados:

- **No hay voz utilizable** (el navegador no trae voz en español, o el alumno
  ha silenciado): se reproduce con temporizador desde el principio y la interfaz
  lo dice.
- **La voz falla a mitad**: la promesa se rechaza, se pasa a temporizador, se
  marca `vozCaida` y en pantalla aparece *«La voz ha fallado: se avanza por
  temporizador.»*
- **La voz ni resuelve ni rechaza** —pasa en Chrome cuando la pestaña pierde el
  foco—: un temporizador de rescate desatasca la lección al doble de lo que
  debería haber tardado. Sin él, la pizarra se quedaría congelada para siempre.

Cada segmento que arranca se lleva un número de orden; si termina cuando ya no
es el vigente, no avanza. Es lo que impide que una locución cancelada al pulsar
«Avanzar» resuelva tarde y salte un paso de más.

Y como el sintetizador es uno solo y lo comparten el tutor de la lección y el
repaso animado, **al darle a reproducir en la pizarra animada el tutor calla**:
sin eso las dos voces se pisan y no se entiende ninguna.

---

## 5. El avatar

Cinco estados, los que pedía el pliego:

| Estado | Cuándo | Cómo se ve |
| --- | --- | --- |
| `IDLE` | en reposo | respiración leve y parpadeo |
| `EXPLICANDO` | mientras narra | boca articulada y un asentimiento mínimo |
| `CELEBRANDO` | al acertar o terminar | sonrisa amplia, rebote y destellos |
| `APOYO` | tras un fallo | cejas internas levantadas, cabeza ladeada, mano abierta |
| `PENSANDO` | calculando o en pausa | mirada alta y puntitos de reflexión |

El motor (PSE Light) sigue emitiendo sus propios nombres (`hablando`,
`preguntando`…). La traducción vive en `lib/leccion/avatar.ts`, fuera del
componente, para que la suite pueda recorrer la tabla entera sin montar React:
que ningún estado del motor se quede sin traducir es justo lo que se rompe en
silencio al añadir uno.

**Transiciones.** El atributo `d` de un `path` no interpola con CSS, así que un
cambio de gesto sería un salto seco. La cara entra con un fundido corto que se
vuelve a lanzar en cada cambio de estado. Todas las animaciones se desactivan
con `prefers-reduced-motion`.

---

## 6. Modo proyección

Botón en la cabecera del panel. Lleva el bloque a **pantalla completa** con la
API del navegador y le aplica el tema de alto contraste:

- tipografía escalada (`--pz-escala`), fondo blanco puro / negro puro,
- **rayas de KaTeX engordadas** —la de la fracción, la de la cuenta en columna,
  son bordes de 1 px y proyectadas desaparecen—,
- trazo del resaltado a 5 px y rótulos más grandes.

Salir con Escape o con el botón del navegador se detecta (`fullscreenchange`),
no se supone. Y si el navegador deniega la pantalla completa —pasa dentro de
algunos iframes—, **el alto contraste se aplica igual**: se pierde el pantalla
completa, no la legibilidad.

---

## 7. Backlog del Hito 1: orden de los bloques

`/docente/crear-tema` sigue ahora el orden pedido:

**Datos del tema → Alcance curricular → Objetivos y etiquetas → Reglas y
propiedades → Motor de corrección → Publicación.**

Un detalle que el cambio de orden obligaba a cuidar: «Se puede practicar»
depende del motor, que ahora se elige *después*. El aviso de la casilla lo dice
explícitamente («elige antes un motor de corrección, en el bloque de más
abajo»), en lugar de dejar una casilla desactivada sin explicación. El orden se
verifica en la suite leyendo el HTML de la página.

---

## 8. Cómo probarlo

### Recorrido de aceptación (4 minutos)

1. Entra como alumno y abre **Lección**. Elige un tema y deja que el tutor
   plantee el ejercicio.
2. Bajo la pizarra de siempre aparece **«Paso a paso animado»**. Pulsa
   **Reproducir**: verás la caja recorrer las columnas (o los términos, o la
   cancelación) mientras la voz explica cada una.
3. Prueba **Pausar**, **Reanudar**, **Repetir paso** y **Avanzar**. El pie
   escrito bajo la fórmula dice siempre lo que se está señalando.
4. Silencia la voz con el altavoz del panel del tutor: la animación **sigue**,
   ahora por temporizador, y lo dice en pantalla.
5. Pulsa **Modo proyección**: pantalla completa, tipografía grande y trazos
   gruesos. Sal con Escape.
6. Mira el avatar mientras todo esto ocurre: explica, piensa al pausar y celebra
   al terminar la lección.
7. Como docente, abre **Crear tema** y comprueba el orden de los bloques.

### Suite automática

```bash
node qa/hito2.mjs                                  # sin servidor: 121 comprobaciones
BASE_URL=http://localhost:3000 node qa/hito2.mjs   # con servidor: 139
```

---

## 9. Verificación ejecutada

Compilación (`npm run build`) y comprobación de tipos (`tsc --noEmit`) limpias.
Suite completa contra la aplicación compilada y en marcha:

| Batería | Comprobaciones | Fallos |
| --- | ---: | ---: |
| `qa/hito2.mjs` (este hito) | 139 | 0 |
| `qa/hito1.mjs` | 124 | 0 |
| `qa/diagnostico-nivel.mjs` | 94 | 0 |
| `qa/matematicas.mjs` | 100 | 0 |
| `qa/diagnostico.mjs` | 416 | 0 |
| `qa/paso1.mjs` | 72 | 0 |
| `qa/leccion.mjs` | 811 | 0 |
| `qa/frontend.mjs` | 10 | 0 |
| **Total** | **1.766** | **0** |

Lo que comprueba `qa/hito2.mjs`, en concreto:

- **Guion**: llevadas y reagrupaciones idénticas a las de la aritmética en
  columna; cascadas; cancelación en los dos lados; fracción exacta; prosa no
  animada como fórmula.
- **Invariante de resaltado**: ningún foco apunta a una clase que no exista en
  la fórmula, KaTeX compone todas las escenas sin error, y las clases **llegan
  al HTML** —que es lo que después se mide—.
- **Máquina de estados**: recorrido completo, pausa que de verdad detiene,
  reanudación, repetir sin avanzar, avance y retroceso manuales, salto de
  escena, los tres caminos de degradación a temporizador, y que no quede ningún
  temporizador corriendo al terminar.
- **Avatar**: los cinco estados, la traducción desde los cinco del motor, y que
  cada estado tenga boca, cejas, color y animación —y que esa animación exista
  en la hoja de estilos—.
- **Vista de lección**: responde 200 sin rebotar, sin excepciones de render, con
  el aula montada y con la pizarra animada dentro del paquete de cliente.
- **Formulario de tema**: los seis bloques, en el orden pedido.

---

## 10. Lo que NO entra en este hito

- **Lottie.** El avatar es SVG animado con CSS, que es lo que ya usaba el
  proyecto: pesa cero, responde al tema claro/oscuro y se desactiva con
  `prefers-reduced-motion`. El pliego admitía «SVG/Lottie»; si prefieres Lottie
  para las animaciones de celebración, se cambia sin tocar la máquina de
  estados, que está separada del dibujo a propósito.
- **Geometría comprobada en navegador.** La medida de las cajas
  (`getBoundingClientRect`) sólo existe con un motor de maquetación real; en el
  proyecto no hay navegador headless instalado, así que eso se verifica a ojo en
  el recorrido de aceptación. Lo que sí se comprueba automáticamente es todo lo
  que lo hace posible: que las clases existan, que sobrevivan al HTML y que
  ningún foco quede huérfano.
- Reconocimiento de escritura a mano sobre la pizarra y exportación de la
  lección animada a vídeo: no estaban en el pliego del hito.

---

## 11. Ficheros de esta entrega

**Nuevos**

| Fichero | Qué hace |
| --- | --- |
| `lib/leccion/animacion.ts` | El guion: convierte cada línea en escena, con sus focos y su narración |
| `lib/leccion/sincronizacion.ts` | La máquina de estados: voz, temporizador, mandos |
| `lib/leccion/avatar.ts` | Los cinco estados pedagógicos y la traducción desde el motor |
| `components/leccion/pizarra-animada.tsx` | La pizarra con capa SVG y el panel con mandos y modo proyección |
| `components/leccion/sincronizador-leccion.ts` | El hook de React sobre la máquina, con el locutor real |
| `qa/hito2.mjs` | 139 comprobaciones del hito |
| `ENTREGA_HITO2.md` | Este documento |

**Modificados**

| Fichero | Cambio |
| --- | --- |
| `components/leccion/avatar-2d.tsx` | Cinco estados, adornos y entrada con fundido |
| `components/leccion/aula.tsx` | Monta el panel animado, le pasa la voz y cede el turno de palabra |
| `components/docente/formulario-tema.tsx` | Orden de bloques del backlog y aviso de la casilla practicable |
| `app/globals.css` | Animaciones nuevas del avatar, trazos de la pizarra y tema de proyección |
