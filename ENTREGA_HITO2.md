# MVP 2 · HITO 2 — Pizarra KaTeX Animada y Avatar Dinámico Enriquecido

Entrega del segundo hito. Todo lo que sigue está implementado, compilado y
verificado con la suite del proyecto.

> **Estado al cierre** (las cifras de cada ronda están en su sección; éstas son
> las de la última pasada completa): **108.068 comprobaciones en Chrome y 0
> fallos** con ocho clases —incluida una en un móvil de 390 px— y 170 capturas
> (`qa/observaciones.mjs`), **31.371
> afirmaciones matemáticas recalculadas y 0 incorrectas** (`qa/rigor.mjs`),
> **780** del hito (`qa/hito2.mjs`), **19** de los mandos y los estados del
> avatar en un navegador de verdad (`qa/mandos.mjs`), **13** de la voz
> (`qa/voz.mjs`), **87** de navegación (`qa/navegador.mjs`), 1.465 del núcleo,
> 827 de la lección, aceptación 24/24 y un barrido de 200 sesiones y 1.800
> turnos sin violaciones. `npm ci`, `tsc --noEmit` y `npm run build`, limpios.

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
| Los cuatro mandos y los cinco estados del avatar, comprobados **en un Chrome de verdad** durante una clase entera | `qa/mandos.mjs` | ✅ |
| Voz neuronal del tutor por endpoint propio (Google Cloud TTS / ElevenLabs), con vuelta a la del navegador si no hay clave | `app/api/voz/route.ts` + `lib/voz/config.ts` + `public/tts.js` | ✅ (falta la clave en el servidor del cliente) |
| Que lo desplegado sea lo entregado: salud con el commit vivo y batería que lo comprueba desde fuera | `qa/despliegue.mjs` + `scripts/despliegue.mjs` + `render.yaml` | ✅ |

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

Y por el mismo camino se resuelve el **revelado progresivo**: cada cifra que
todavía no toca lleva una clase `pz-rev-N` y arranca invisible; cuando la
lección llega al paso N, el componente le sube la opacidad. Las piezas ocultas
siguen ocupando su sitio, así que la fórmula no se mueve al aparecer y las cajas
medidas al montar la escena siguen siendo válidas. Tampoco aquí se recompone
nada.

Las medidas se rehacen al cambiar de escena y al cambiar el tamaño
(`ResizeObserver`, y también cuando terminan de cargar las fuentes de KaTeX).
**No** se rehacen al cambiar de foco, que es lo que ocurre veinte veces por
lección.

---

## 3. Lo que la pizarra sabe animar hoy

El guion decide, línea a línea, qué tipo de escena es. Todo esto es
determinista: no interviene el modelo.

### Cuenta en columna — llevadas y reagrupaciones

La cuenta **no aparece resuelta**: empieza con los dos sumandos y cada columna
suelta su cifra cuando le toca. `234 + 178` da cinco pasos:

1. Sólo los sumandos, la raya y el signo. *«Vamos a sumar 234 más 178, columna
   por columna.»*
2. Caja sobre las **unidades** → *«4 más 8 son 12. Escribo 2 y llevo 1.»*
   Aparecen el **2** debajo y el **1** de llevada encima de las decenas, con el
   rótulo **llevo 1**.
3. La caja se mueve a las **decenas** → *«3 más 7 más 1 que llevábamos son 11.
   Escribo 1 y llevo 1.»* Aparecen el **1** debajo y la nueva llevada.
4. Caja sobre las **centenas** → *«2 más 1 más 1 son 4.»*
5. Óvalo sobre el resultado completo → *«El resultado es 412.»*

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
API del navegador y monta el escenario del aula: **pizarra oscura, avatar en un
lateral y la fórmula ocupando el resto**.

- **Tipografía escalada al ancho de la pantalla**: `clamp(2.25rem, 6.5vw,
  4.5rem)` para la fórmula, que en una pantalla de aula equivale a lo que en
  Tailwind serían `text-4xl`–`text-6xl`. El pie narrado y los mandos escalan con
  ella.
- **Lienzo alto** (`min-height: min(58vh, 34rem)`): la fórmula se centra en un
  espacio grande en lugar de quedar en un renglón perdido.
- **Avatar siempre a la vista**, a `clamp(7rem, 13vw, 15rem)` en la columna
  izquierda, con su estado pedagógico en marcha. Por debajo de 1024 px cede el
  sitio a la fórmula.
- **Alto contraste**: fondo de pizarra oscura, texto blanco, **rayas de KaTeX a
  4 px** —son bordes de 1 px y proyectadas desaparecen— y resaltados en ámbar,
  que es el color de tiza que mejor aguanta un proyector.

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
node qa/hito2.mjs                                  # sin servidor: 235 comprobaciones
BASE_URL=http://localhost:3000 node qa/hito2.mjs   # con servidor: 253
```

---

## 9. Verificación ejecutada

Compilación (`npm run build`) y comprobación de tipos (`tsc --noEmit`) limpias.
Suite completa contra la aplicación compilada y en marcha:

| Batería | Comprobaciones | Fallos |
| --- | ---: | ---: |
| `qa/hito2.mjs` (este hito) | 329 | 0 |
| `qa/hito1.mjs` | 124 | 0 |
| `qa/diagnostico-nivel.mjs` | 94 | 0 |
| `qa/matematicas.mjs` | 100 | 0 |
| `qa/diagnostico.mjs` | 416 | 0 |
| `qa/paso1.mjs` | 72 | 0 |
| `qa/leccion.mjs` | 819 | 0 |
| `qa/frontend.mjs` | 10 | 0 |
| `qa/navegador.mjs` (navegador real) | 12 | 0 |
| **Suma de estas** | **1.976** | **0** |

Y la suite entera, con las catorce baterías de `npm test`: **3.588
comprobaciones, 0 fallos**.

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
| `qa/hito2.mjs` | 253 comprobaciones del hito |
| `ENTREGA_HITO2.md` | Este documento |

**Modificados**

| Fichero | Cambio |
| --- | --- |
| `components/leccion/avatar-2d.tsx` | Cinco estados, adornos y entrada con fundido |
| `components/leccion/aula.tsx` | Monta el panel animado, le pasa la voz y cede el turno de palabra |
| `components/docente/formulario-tema.tsx` | Orden de bloques del backlog y aviso de la casilla practicable |
| `app/globals.css` | Animaciones nuevas del avatar, trazos de la pizarra y tema de proyección |

---

## 12. Correcciones tras la prueba del cliente

Dos observaciones al probar el despliegue, las dos certeras. Esto es lo que se
ha cambiado.

### 1. La cuenta aparecía ya resuelta

**El problema.** En el primer paso la suma se mostraba entera —resultado abajo
y llevadas arriba— y el resaltado se limitaba a pasear un recuadro por encima.
Eso no es una lección animada: es un resultado con adornos.

**Qué ocurre ahora.** Cada cifra aparece en el paso que la calcula, con el
recorrido que describía el pliego (arriba, sección 3): sumandos → unidades (con
su cifra y su llevada) → decenas → centenas → resultado completo, y el foco
coordinado con la locución.

**Cómo, sin romper lo anterior.** El guion marca cada pieza pendiente con
`pz-rev-N` y la hoja de estilos las arranca invisibles; el componente sube la
opacidad de las que ya tocan. **No se recompone la fórmula** —seguiría siendo el
parpadeo que el pliego prohíbe— y, como lo oculto sigue ocupando su sitio, ni la
fórmula se mueve ni hay que volver a medir las cajas.

Lo mismo se aplicó al despeje: lo que se resta al otro lado aparece al cancelar,
y la solución, en el último paso. Antes se leía la respuesta antes de la
pregunta.

**El contador también estaba mal.** Decía «Paso 1 de 4» contando escenas
mientras por dentro daba cuatro pasos, así que desde fuera parecía que no
avanzaba. Ahora cuenta los pasos de la animación (`Paso 2 de 5`) y, si hay más
de una línea, lo indica aparte.

### 2. El modo proyección no escalaba

**El problema.** En pantalla grande la fórmula quedaba diminuta en medio de un
lienzo en blanco, y el avatar desaparecía.

**Qué ocurre ahora.** Pizarra oscura de aula, fórmula escalada al ancho de la
pantalla sobre un lienzo alto, avatar visible en el lateral con su estado
pedagógico, rayas de KaTeX a 4 px, resaltados en ámbar y mandos agrandados para
una pantalla táctil. El detalle está en la sección 6.

### Comprobado

`qa/hito2.mjs` pasa de 139 a **164 comprobaciones**. Las nuevas fijan que la
cifra de cada columna y cada llevada se destapan en el paso que las calcula
—verificado también como regla general sobre seis cuentas, sumas y restas—, que
en el paso de entrada no hay nada destapado, que la solución del despeje llega
la última, y que el tema de proyección escala con `vw`, reserva lienzo, deja
sitio al avatar y usa pizarra oscura. Suite completa: **1.791 comprobaciones, 0
fallos**.

---

## 13. Segunda revisión del cliente: el andamiaje pedagógico

Dos observaciones más sobre el despliegue, y las dos apuntaban a lo mismo: la
lección enseñaba el resultado antes de explicarlo.

### 1. El bloque «Desarrollo» destripaba la solución

**El problema.** Arriba, en la pizarra de siempre, aparecía la suma entera
resuelta —412 con sus llevadas— desde el primer paso. Con la solución a la
vista, la animación de abajo no explica nada.

**Qué ocurre ahora.** Mientras el tutor está explicando y la animación no ha
destapado todo, el bloque «Desarrollo» **no compone las líneas que la pizarra
animada está animando**. Las de prosa sí, porque no adelantan nada. En cuanto
la animación llega al final —o termina la lección— el desarrollo completo
vuelve, que es lo que el alumno necesita para repasar.

Se decide con `esAnimable()`: una línea que produce focos es una línea que la
animación va a contar paso a paso, así que arriba no se adelanta.

### 2. La pizarra no seguía a la voz

**El problema.** La locución y el subtítulo iban por *«Sumamos las decenas: 3 +
7 + 1 que llevábamos = 11…»* y la pizarra animada seguía en el paso 1, sin
ningún foco, esperando a que alguien pulsara **Reproducir**. Voz y pizarra
contaban cosas distintas.

**Qué ocurre ahora.** La pizarra **se coloca sola donde va el tutor**. El aula
le pasa lo que se está diciendo y el guion decide a qué escena y a qué foco
corresponde:

| El tutor dice | La pizarra |
| --- | --- |
| «Vamos a sumar 234 más 178…» | sólo los sumandos |
| «Sumamos las unidades: 4 + 8 = 12…» | caja sobre las unidades; aparecen el 2 y la llevada |
| «Sumamos las decenas: 3 + 7 + 1…» | la caja se mueve a las decenas; aparecen el 1 y la llevada |
| «Sumamos las centenas…» | caja sobre las centenas |
| «El resultado es 412» | óvalo sobre el resultado |

No hace falta que el tutor use las palabras del guion: se puntúa por
solapamiento de cifras y términos, de modo que *«escribimos 1 y llevamos 1»*
reconoce el paso que el guion narra como *«escribo 1 y llevo 1»*. Si nada encaja
con claridad, la pizarra **se queda donde está** en lugar de saltar al azar. Y
si el alumno reproduce el repaso por su cuenta, manda él: el seguimiento se
aparta para no tirar de la lección desde dos sitios.

Para que el seguimiento no fuera ambiguo, el guion ahora **descarta escenas
repetidas**: el enunciado (`234 + 178`) y su desarrollo (`234 + 178 = 412`) son
la misma cuenta, y antes producían dos escenas idénticas —de ahí el «línea 1/2»
de la captura.

### 3. La columna operada se ilumina

Como pedía el mensaje, el resaltado ya no es sólo un borde: la columna en curso
lleva **fondo de color** además del trazo (el equivalente a `bg-blue-100 ring-2
ring-blue-500`, en ámbar sobre la pizarra oscura de proyección). Se dibuja en la
capa SVG, así que sigue sin recomponerse la fórmula.

### Comprobado

`qa/hito2.mjs` pasa de 164 a **191 comprobaciones**. Las nuevas recorren el
diálogo real del tutor —las cinco frases de la captura— y fijan que cada una
coloca la pizarra en el paso que le corresponde; que una frase ajena no la
mueve; que una línea de prosa parecida no le roba el turno a la columna que se
está operando; que `situar()` coloca sin hablar ni programar temporizadores y se
aparta si el repaso se reproduce solo; y que el desarrollo de arriba no compone
lo que la animación está contando. Suite completa: **1.818 comprobaciones, 0
fallos**.

---

## 14. Tercera revisión: sincronización guiada por eventos de voz

El cliente probó el despliegue y señaló tres cosas. Las tres estaban.

### 1. El avance se guiaba por temporizadores, no por la voz

**El problema.** El foco cambiaba de columna con un temporizador propio, así que
en cuanto la locución tardaba un poco —y en su equipo no hay voz `es-ES`, con lo
que el ritmo lo marcaba otro reloj— la pizarra iba por su cuenta.

**Qué ocurre ahora.** El resaltado se enciende con el evento `onstart` REAL de
`SpeechSynthesisUtterance`, no al encolar la locución:

- `public/tts.js` acepta `onStart` en `speak()` y lo dispara desde
  `utterance.onstart` (y también si la locución acaba sin haber avisado, para no
  dejarse un paso sin pintar).
- El sincronizador separa **el segmento que se está diciendo** del **segmento
  que la pizarra muestra**: mientras el navegador prepara la voz, la pizarra
  sigue en el paso anterior. El paso salta cuando empieza a sonar.
- `onend` sigue siendo lo que encadena el paso siguiente.

Un movimiento manual —avanzar, repetir, situar— iguala los dos al instante: ahí
no hay ninguna voz que esperar.

Y si el sintetizador se cuelga una vez, **ya no se le vuelve a esperar** en el
resto de la lección: se pasa a temporizador y se dice en pantalla. Antes se le
encolaba cada paso y la pizarra avanzaba a golpe de rescate, siempre por detrás.

### 2. Dos motores de audio, dos índices de paso

**El problema.** El avatar decía una cosa y la tarjeta del paso a paso mostraba
otra, porque cada uno llevaba su propia reproducción.

**Qué ocurre ahora.** Manda **quien esté hablando**. Con el tutor en marcha, los
botones de la pizarra actúan sobre él —`Pausar` pausa SU locución, y la pizarra
se detiene con él porque la va siguiendo—; con la lección parada, el panel
reproduce el repaso por su cuenta. Nunca los dos a la vez. El aula le pasa al
panel el estado del tutor (`leccionEnMarcha`, `leccionPausada`) y sus mandos.

### 3. La zona bajo la raya se quedaba vacía

**El problema.** Las cifras del resultado y las llevadas no aparecían nunca,
aunque el guion las tuviera marcadas para su paso.

**La causa.** El revelado se hacía **escribiendo `style.opacity` sobre los nodos
de KaTeX**. Cualquier repintado del bloque se llevaba por delante esos estilos
escritos a mano, y las cifras no volvían.

**Qué ocurre ahora.** El revelado se declara con una **regla CSS** —
`#pizarra .pz-rev-0, #pizarra .pz-rev-1 { opacity: 1 }`— que el navegador vuelve
a aplicar siempre. Sigue sin recomponerse la fórmula, así que el parpadeo que
prohíbe el pliego tampoco vuelve. La regla la genera `reglasDeRevelado()`, que
está en `lib/` y tiene sus propias pruebas: en el paso de las unidades sólo está
destapado el 2; en el de las decenas, el 2 y el 1; en el de las centenas, los
tres. **Lo escrito se queda escrito.**

### 4. Un solo recuadro, el de la columna que se opera

En la captura se veían las tres columnas marcadas a la vez y dos rótulos de
llevada pisándose. Era el rastro de los pasos anteriores, que en pantalla se
leía como "todo resaltado". Ahora hay **un único recuadro encendido**, el de la
columna en curso; lo que queda de los pasos anteriores son las cifras ya
escritas, como en una cuenta hecha a mano.

### Comprobado

`qa/hito2.mjs` pasa de 191 a **209 comprobaciones**. Las nuevas fijan que la
pizarra no se mueve hasta que la voz suena y que salta en cuanto suena; que un
navegador que no avisa del arranque no deja pasos sin pintar; que las reglas de
revelado dejan escrito lo ya calculado paso a paso; que sólo se dibuja el foco
en curso; y que los mandos actúan sobre la locución del tutor cuando es él quien
habla. Suite completa: **1.836 comprobaciones, 0 fallos**.

---

## 15. La cuenta que dibuja el motor

En el despliegue seguía viéndose el bloque **DESARROLLO** con la suma resuelta
—412 con sus llevadas— mientras la pizarra animada iba por el primer paso, pese
a la corrección de la sección 13.

**Por qué.** El motor no escribe el desarrollo como `234 + 178 = 412`: lo
**dibuja** en columna, en varias líneas. El guion sólo sabía leer la forma de una
línea, así que esa línea no contaba como animable: no se ocultaba arriba, y
abajo entraba como un simple bloque de texto en lugar de animarse.

**Qué ocurre ahora.** El guion lee las dos formas —`operacionDeLinea()`, que ya
usaba la pizarra clásica—, de modo que:

- el desarrollo dibujado **desaparece de arriba** mientras la animación lo va
  contando, y vuelve al terminar;
- **es la misma escena** que el enunciado, así que el contador deja de decir
  "línea 1/4" repitiendo la misma cuenta;
- y una cuenta dibujada a medias —el motor escribe una sola columna del
  resultado— se anima igual, entera y bien.

`qa/hito2.mjs` sube a **214 comprobaciones**; las nuevas fijan que la cuenta
dibujada produce exactamente los mismos focos que la escrita en una línea y que
enunciado y desarrollo son una sola escena. Suite completa: **1.841, 0 fallos**.

---

## 16. Dos voces peleando por el sintetizador

El cliente describió el síntoma con precisión: *"el marcado va a toda velocidad
y se desfasa de la locución"*. Su diagnóstico apuntaba a un
`setInterval(..., 2600)` en `pizarra-animada.tsx`.

**Ese temporizador no existe en el código.** No hay ni un `setInterval` en la
pizarra ni en el sincronizador, ni ninguna constante de 2,6 s: el avance se
encadena con el fin de la locución (`onend`) y el resaltado se enciende con su
`onstart`, como se explica en la sección 14. La suite lo comprueba explícitamente
para que quede fijado.

**Pero el síntoma era real, y la causa es la que el cliente señala en su punto
2: dos audios peleando por el foco del navegador.** Podían sonar a la vez el
tutor de la lección y el repaso animado, y como cada locución empieza
cancelando la anterior (`speechSynthesis.cancel()`), se cancelaban entre ellas:
cada cancelación dispara el `onend` de la otra, las dos daban su paso por
terminado al instante y el resaltado salía disparado por las columnas mientras
el audio apenas había empezado a hablar. Exactamente lo que se veía.

### Un solo dueño del sintetizador

- Si el tutor vuelve a hablar —porque se reanuda la lección o llega un ejemplo
  nuevo— **el repaso animado calla** y pasa a seguirlo.
- Si el alumno reproduce el repaso, **el tutor calla**: se le pausa y además se
  corta lo que tuviera en la boca (`pause()` no hace nada si la lección no
  estaba en marcha, y esa locución a medias seguía sonando por debajo).
- Los botones de reproducción actúan siempre sobre quien está hablando, como ya
  se describió en la sección 14.

### Pausa didáctica entre columnas

Añadida la pausa de **600 ms** que pedía el mensaje: la locución de una columna
ya no empalma con la de la siguiente, de modo que el alumno ve la cifra recién
escrita antes de que el foco se mueva. Es un valor configurable
(`PAUSA_ENTRE_PASOS`), y la espera se cancela si el alumno pausa.

El ritmo de la voz ya era el que pedía el mensaje: `rate = 0.95`, y el idioma
sale de la propia voz elegida (con la voz mexicana instalada en su equipo,
`es-MX`; `es-ES` es el respaldo cuando no hay ninguna).

### Comprobado

`qa/hito2.mjs` sube a **223 comprobaciones**. Las nuevas fijan que ni la pizarra
ni el sincronizador usan `setInterval`, que el encadenado sale del fin de la
locución, que el repaso se calla cuando el tutor retoma la palabra, que al tomar
la voz se corta la del tutor, y que entre columna y columna hay una pausa que se
cancela al pausar. Suite completa: **1.850 comprobaciones, 0 fallos**.

---

## 17. Repaso completo del pliego, punto por punto

Con el pliego del Hito 2 delante otra vez, se revisó cada requisito contra el
código. Tres cosas estaban a medias; las tres quedan cerradas.

### 1. Cancelaciones en simplificaciones algebraicas

El pliego pide "tachados/cancelaciones en simplificaciones algebraicas" y sólo
estaba la cancelación del despeje (el `+5` y el `−5` de los dos lados). Ahora se
anima también la simplificación de una fracción: el factor común se **tacha
arriba y abajo a la vez** —como se hace a mano— y la fracción reducida aparece
sólo después.

- `12/8` → *"Dividimos arriba y abajo entre 4"*, rótulo **÷ 4**, y queda 3 entre 2.
- `6x/3` → queda `2x`.
- `x²/x` → *"se cancela una x de arriba con la de abajo"*, queda `x`.
- `7/3` no se anima: no hay nada que cancelar.

### 2. Los estados del avatar, con su disparador

Los cinco estados existían, pero el pliego dice **cuándo** se usa cada uno, y
dos no los disparaba nadie:

- **PENSANDO — "validación en servidor en curso"**: el avatar piensa mientras
  `/api/practica/corregir` comprueba la respuesta. Antes el alumno enviaba su
  respuesta y el tutor se quedaba con la misma cara.
- **CELEBRANDO — "feedback positivo ante respuesta correcta"**: al recibir un
  veredicto correcto.
- **APOYO — "feedback empático ante error"**: al recibir uno incorrecto. Además,
  el tutor narraba el fallo (*"Casi. …"*) con el gesto de explicar; ahora lo hace
  con el de apoyo.
- Un veredicto que el motor **no puede verificar** no se trata como error del
  alumno: ahí no se pone cara de apoyo.

### 3. Saber qué versión se está probando

Varias rondas se fueron en decidir si lo que se veía era la corrección o el
despliegue anterior. La tarjeta del tutor muestra ahora, en pequeño, el commit
desplegado (`build a1b2c3d`, de la variable que Vercel expone). De un vistazo se
sabe si lo que hay en pantalla incluye el último arreglo.

### Y el resto del pliego, comprobado

| Requisito | Estado |
| --- | --- |
| `pizarra-animada.tsx` recibe los pasos en `/estudiante/leccion` | ✅ sección 1 |
| Resaltado con SVG overlay / bounding box, sin recompilar KaTeX | ✅ sección 2 |
| Llevadas encima de las columnas y tachados de cancelación | ✅ secciones 3 y 17.1 |
| `sincronizador-leccion.ts` con eventos del TTS | ✅ secciones 4 y 14 |
| Pausar, Reanudar, Repetir paso, Avanzar | ✅ sección 4 |
| Degradación a temporizador si el audio falla o está desactivado | ✅ sección 4 |
| Cinco estados del avatar con transiciones suaves | ✅ secciones 5 y 17.2 |
| Modo proyección: pantalla completa y alto contraste | ✅ sección 6 |
| Backlog: orden de bloques en `/docente/crear-tema` | ✅ sección 7 |
| `qa/hito2.mjs` | ✅ 239 comprobaciones |

Suite completa: **1.866 comprobaciones, 0 fallos**.

---

## 18. La pizarra callaba al tutor (probado en un navegador de verdad)

El cliente pidió levantar el proyecto y probarlo de principio a fin **en el
navegador** antes de mandar nada más. Hecho: `qa/navegador.mjs` abre un Chrome
real, entra como alumno, pide una lección de aritmética y observa la pantalla
mientras corre. En la primera ejecución apareció esto:

```
utterances creadas: 8   ·   locuciones pronunciadas: 0   ·   cancelaciones: 18
```

**Ocho frases preparadas, ninguna dicha, dieciocho cancelaciones en doce
segundos.** Ésa era la causa de todo lo que el cliente venía describiendo.

### Qué pasaba

El sincronizador de la pizarra cancela el sintetizador al reordenarse —cosa
razonable cuando es él quien habla—. Pero la pizarra **sigue** al tutor: cada
frase suya la recoloca, y esa recolocación pasaba por la misma limpieza. Es
decir: cada vez que el tutor empezaba una frase, la pizarra cancelaba su voz.

Y una cancelación dispara el `onend` de la locución que corta. Para el motor de
la lección, eso significa "ya he terminado de decirlo": pasaba a la frase
siguiente de inmediato. De ahí que **el marcado fuera a toda velocidad con el
audio recién empezado**, que se desfasara de la locución y que en el equipo del
cliente pareciera que mandaban temporizadores.

### La corrección

La pizarra sólo calla lo que ha dicho ella. La máquina lleva ahora una marca de
"tengo una locución en el aire", y si no la tiene, no cancela: la voz que suena
es la del tutor y no se toca.

### Y las otras dos cosas del mensaje

- **El bloque DESARROLLO seguía apareciendo.** Filtrar sus líneas no bastaba,
  porque esa tarjeta **compone** la cuenta a partir de los pasos narrados
  ("unidades: 4 + 8 = 12"), no de una línea con el resultado. Ahora el aula le
  dice explícitamente a la pizarra que no lo pinte mientras la animación
  explica. Verificado en el navegador: no aparece en ninguna muestra.
- **El contador decía "línea 1/3".** La prosa ya no entra en el guion: una
  frase del tutor no tiene nada que resaltar, sólo repetía el subtítulo y
  partía la lección en trozos que no eran pasos. Y el guion deja de rehacerse
  —y de reiniciar la pizarra— cuando el tutor añade una línea que no cambia lo
  que hay que animar.

### Lo que comprueba `qa/navegador.mjs`

Con un `speechSynthesis` de mentira de tiempos conocidos (arranca a los 200 ms,
termina a los 1.600 ms), porque un navegador headless no trae voces y sin
eventos no habría nada que medir:

| Comprobación | Qué caza |
| --- | --- |
| El bloque DESARROLLO no aparece mientras la animación explica | el spoiler pedagógico |
| El resaltado no se mueve antes de que empiece a sonar la voz | el marcado adelantado |
| El tutor habla de verdad (≥ 2 locuciones) | el silencio disfrazado de animación |
| A ninguna locución se la corta a mitad de frase | **la cancelación cruzada** |
| Las cifras destapadas no vuelven a esconderse | el revelado que se pierde |
| La consola no suelta errores | excepciones de render |

Suite completa: **1.875 comprobaciones, 0 fallos**, de las cuales 8 se ejecutan
dentro de Chrome.

---

## 19. Las palabras del tutor, el subtítulo heredado y un signo cambiado

Tres cosas del último repaso del cliente sobre el build `42fceda`.

### 1. El resaltado no seguía a la locución (Aritmética)

**Lo que se veía.** Con la voz en "Sumamos 8 + 5… escribimos el 3 debajo de las
unidades", la pizarra seguía en el paso 1. Y al llegar a las decenas, el óvalo
estaba sobre las centenas.

**Por qué.** El seguimiento comparaba **trozos de palabra**, no palabras. En
"nos lle**vamos** el 1" encontraba "vamos" —la entrada de la escena dice "**Vamos**
a sumar…"— y en "a la **columna** de las decenas" encontraba "columna", también
de la entrada. Resultado: la entrada empataba con la columna que se estaba
explicando y, al empatar, ganaba ella.

**La corrección.**

- Se comparan **palabras enteras**. "vamos" ya no aparece dentro de "llevamos".
- Cada columna lleva ahora **la palabra por la que el tutor la llama**
  —"unidades", "decenas", "centenas"—, que es la señal fiable: el modelo redacta
  la frase como quiere, pero nombra la columna. Vale más que cualquier otra
  coincidencia.
- Un empate entre la entrada de la escena y un paso lo gana el paso: la entrada
  no señala nada.

Comprobado con **las frases exactas de la captura del cliente**, que las escribe
el modelo y no coinciden con las del guion: llevan la pizarra a unidades,
decenas, centenas y resultado, en ese orden, y una frase ajena no la mueve.

### 2. El subtítulo de una fase se quedaba en la siguiente

Al pasar de "Concepto" a "Reglas y propiedades", el ejemplo de la pizza seguía
debajo mientras el tutor ya explicaba otra cosa. El subtítulo pertenece a la
fase que se cierra: ahora se limpia al abrirse la nueva y lo repone su primera
frase.

### 3. `1/2 - 3/6` donde tocaba `1/2 = 3/6`

En la lección de 1/2 + 1/3, el paso de conversión a común denominador aparecía
con un menos en lugar del igual. **Toda la cadena de composición local conserva
el "="** —se comprobó una por una: `planoALatex`, `notacionFormal`,
`lineaResaltada`, `columnaDeLinea` y `corregirIgualdades`—, así que la línea
llega ya con el signo cambiado desde el generador de la lección (en el
despliegue del cliente la redacta el modelo; el motor determinista local escribe
`1/2 = 3/6`).

Como un signo mal puesto en un tutor de matemáticas no es aceptable venga de
donde venga, la validación de la pizarra —la misma que ya corregía operaciones
falsas— repara ahora este caso: **una línea que es exactamente dos fracciones
unidas por un menos, sin ningún igual, y cuyos dos lados valen lo mismo**, es
una equivalencia con el signo cambiado. `1/2 - 3/6` vale cero y como paso no
dice nada; como equivalencia es el paso de la lección. Una resta de verdad
(`3/4 - 1/4`) y una suma (`1/2 + 2/4`, que es un ejercicio legítimo) no se
tocan, y la reparación queda anotada en los avisos.

### Comprobado

`qa/hito2.mjs` sube a **253 comprobaciones** y `qa/navegador.mjs` sigue en 8,
dentro de Chrome. Suite completa: **1.888 comprobaciones, 0 fallos**.

> Nota: el mensaje del cliente anuncia cuatro inconsistencias y en la captura
> sólo se leen tres. Si hay una cuarta, hace falta el texto para cerrarla.

---

## 20. La cuenta que no llegaba a cerrarse

Este repaso no salió de una captura del cliente. Salió de levantar el proyecto
entero —PostgreSQL, servidor y navegador— y mirar la lección corriendo de
principio a fin. De ahí salió un fallo de verdad en la pizarra, y dos pruebas
que no probaban lo que decían.

### 1. Con números de una cifra, el ejemplo no cerraba nunca

**Lo que se veía.** Un alumno de primaria recién diagnosticado recibe cuentas de
una cifra: `3 + 4`. La animación llegaba a *«Paso 2 de 3»* y ahí se quedaba. El
óvalo sobre el resultado —el paso que remata la cuenta, el que dice *«el
resultado es 7»*— no se encendía nunca, y la lección pasaba al ejercicio
siguiente con el contador a medias.

**Por qué.** La pizarra sigue al tutor comparando lo que dice con la narración
de cada paso, y esa comparación sólo contaba **palabras de cuatro letras o más y
números de dos cifras o más**. Aplicada al cierre de una cuenta pequeña, no
queda nada que comparar:

| Cuenta | Narración del paso | Lo que dice el tutor | Piezas comparables |
| --- | --- | --- | --- |
| `234 + 178` | «El resultado es 412.» | «Así, 234 + 178 = 412…» | `resultado`, **`412`** ✅ |
| `3 + 4` | «El resultado es 7.» | «Así, 3 + 4 = 7…» | `resultado` — que el tutor no dice ❌ |

Con el `412` bastaba; con el `7` no había nada, y el cierre no encajaba en
ningún paso. La regla de las dos cifras se puso por un motivo razonable —«234 +
178 = 412» lleva dentro un 2, un 1 y un 4, y contarlos habría confundido el
cierre con el paso de las centenas—, pero ese riesgo no llega a darse: los dos
lados se parten en números **enteros**, así que la pieza `2` sólo casa con un
`2` suelto, nunca con el que va dentro de `234`.

**La corrección.** Dos cambios en `lib/leccion/animacion.ts`:

- Se cuentan los números enteros, tengan una cifra o cuatro. Con eso, además,
  dos sumas distintas de una cifra dejan de ser indistinguibles entre sí.
- El cierre se reconoce **por su forma, no por parecido**: una frase que no
  nombra ninguna columna —el tutor dice «unidades» o «decenas» siempre que
  explica una— y que repite la cuenta entera, sumandos y total, sólo puede ser
  el cierre. Eso lo separa de la presentación de la cuenta SIGUIENTE («Vamos a
  sumar 7 más 2, columna por columna» tampoco nombra columna, pero no dice ni 3,
  ni 4, ni 7).

En el navegador, la lección pasa ahora por *«Paso 3 de 3 · El resultado es 7»*,
que antes no aparecía nunca. `qa/hito2.mjs` sube a **259 comprobaciones**, con
seis nuevas que fijan el caso: el recorrido completo de una cuenta de una cifra,
que el cierre no se quede en las unidades, y que presentar la cuenta siguiente
lleve la pizarra a **esa** cuenta sin cerrar la anterior.

### 2. La prueba de navegador llevaba días sin ejecutarse

`qa/navegador.mjs` es la batería que abre un Chrome de verdad, y es la que
destapó el fallo de la voz cancelada que la lectura del código había dado por
bueno. Tenía dos problemas:

- Cargaba el motor de navegador desde **una carpeta temporal del equipo de quien
  la escribió**. Esa carpeta se limpió, y desde entonces no cargaba.
- Al no cargar, **avisaba y salía con código 0**: figuraba como superada sin
  haber abierto un navegador.

Ahora `playwright-core` es una dependencia de desarrollo declarada —el *driver*,
sin navegadores dentro: conduce el Chrome que ya esté instalado—, y no poder
correr es un **fallo**, con su código de salida. Una prueba que no puede correr
no es una prueba que pasa.

Además, ni `qa/hito2.mjs` ni `qa/navegador.mjs` estaban en `npm test`: la batería
del hito en curso había que lanzarla a mano. Las dos entran ahora en la suite, y
cada una tiene su atajo (`npm run qa:hito2`, `npm run qa:navegador`).

### 3. Dos comprobaciones que no comprobaban lo que decían

Al arreglar el cierre, la lección empezó a llegar a su último paso —cosa que
antes no hacía— y dejó al descubierto dos reglas escritas a la medida de un caso
concreto:

- **«El desarrollo no aparece mientras la animación explica»** daba por
  terminada la animación al llegar a `Paso 5 de 5`, que son los pasos de la
  cuenta de tres cifras del ejemplo grande. Una cuenta de una cifra tiene tres,
  y al terminar en «Paso 3 de 3» la comprobación la acusaba de destripar la
  solución. Ahora se pregunta por la forma —el último paso, sea cual sea el
  número—, y se exige además que el tutor **esté hablando**, que es la condición
  con la que la lección esconde el desarrollo. En la pausa entre el ejemplo y la
  práctica sigue compuesto el desarrollo de la cuenta anterior, ya explicada
  entera: eso no destripa nada y es justo lo que el alumno necesita para
  repasar.
- **«La consola no suelta errores»** disculpaba todo lo que encajara en
  `/Failed to load resource/`, que es el texto con el que Chrome anuncia
  **cualquier** recurso que no carga. El escape se puso para tapar el 404 del
  favicon —que el proyecto no tenía—, y de paso habría tapado un trozo de
  JavaScript que faltara o una llamada a la API que devolviera 500. Se añade
  `app/icon.svg` —dibujado con rectángulos y no con un glifo, para que no dependa
  de las tipografías de quien lo mire— y la comprobación pasa a ser lo que decía
  ser: la consola limpia del todo, sin excepciones.

### Comprobado

Contra la aplicación compilada, con PostgreSQL y el servidor en marcha:

| Batería | Comprobaciones | Fallos |
| --- | ---: | ---: |
| `qa/diagnostico.mjs` | 416 | 0 |
| `qa/paso1.mjs` | 72 | 0 |
| `qa/hito1.mjs` | 124 | 0 |
| `qa/hito2.mjs` | 329 | 0 |
| `qa/matematicas.mjs` | 100 | 0 |
| `qa/diagnostico-nivel.mjs` | 94 | 0 |
| `qa/qa.mjs` | 1.462 | 0 |
| `qa/frontend.mjs` | 10 | 0 |
| `qa/sesiones.mjs` | 126 | 0 |
| `qa/aceptacion.mjs` | 24 | 0 |
| `qa/leccion.mjs` | 819 | 0 |
| `qa/navegador.mjs` (Chrome real) | 12 | 0 |
| **Total** | **3.588** | **0** |

Y `qa/barrido.mjs`: 200 sesiones, 1.800 turnos, 0 violaciones.

`npm test` termina con código 0 y ejecuta **las catorce baterías**, la del
navegador incluida. Compilación y comprobación de tipos, limpias.

---

## 20. Cuarta revisión: cancelación, diálogo pegado y lienzos vacíos

Cuatro puntos sobre el build `38a10ff`. Los cuatro, corregidos.

### 1. La cancelación se tragaba el signo igual (error matemático)

**Lo que se veía.** En `2x + 6 = 16 − 6`, la caja roja y la tachadura de *«se
cancelan»* encerraban `+ 6 = 16 − 6`: el signo igual y un número que no se
cancela con nada. Como afirmación matemática, falsa.

**Por qué.** Los dos seises compartían la clase `pz-cancela`, y el resaltado
dibuja **una caja que abarca todas las piezas de una misma clase**. Para una
columna de una cuenta eso es justo lo que se quiere —las tres cifras, un
recuadro— pero para dos términos a uno y otro lado del igual es un disparate: la
caja los une pasando por encima de todo lo que hay en medio.

**La corrección.** Un foco puede enmarcar **varias piezas por separado**. Cada
término que se va lleva su propia marca (`pz-cancela-izq`, `pz-cancela-der`) y
la pizarra dibuja **un recuadro por término**, con el rótulo escrito una sola
vez. Lo mismo al simplificar una fracción: numerador y denominador se tachan por
separado, sin cruzar la raya.

Medido en el navegador, no a ojo: con la lección de ecuaciones en pantalla, los
recuadros salen en 683–704 y 744–761, y el signo igual está en 700–714 —**fuera
de los dos**—. Es una comprobación permanente de `qa/navegador.mjs`.

### 2. El diálogo se quedaba pegado de la fase anterior

En "Reglas y propiedades" de Fracciones seguía debajo el ejemplo de la pizza, de
"Concepto". Limpiar el subtítulo al abrir la fase —lo que se hizo en la ronda
anterior— **no basta**: el orden de las directivas lo decide el generador de la
lección, y una frase de la fase que se cierra puede llegar después del cambio.

Ahora el subtítulo va **etiquetado con la fase a la que pertenece**, igual que ya
se hacía con el contenido de la pizarra, y sólo se pinta si esa fase es la que
está abierta. Llegue cuando llegue, una frase de Concepto no aparece bajo el
rótulo de Reglas.

### 3. Faltaba señalar el numerador y el denominador

En "Concepto" de Fracciones, el tutor explicaba las dos palabras y la pizarra
enseñaba una barra con una celda azul, sin decir cuál era cuál. Ahora el dibujo
lo señala: una **flecha a la parte sombreada** rotulada *numerador: lo que
tomamos*, y una **llave que abarca las cuatro partes** rotulada *denominador:
partes iguales del todo*.

### 4. El recuadro en blanco de Aritmética

Dos causas, las dos corregidas:

- **El lienzo tenía la altura del ejemplo resuelto en todas las fases.** Concepto
  y Reglas enseñan una tarjeta y poco más, así que quedaba medio lienzo vacío.
  Ahora el alto se ajusta a la fase —fijo dentro de cada una, que es lo que
  evitaba que los botones bailaran— y cambia sólo al cambiar de fase, cuando la
  vista se sustituye entera de todas formas.
- **Aritmética era el único tema sin diagrama.** Su fase de Concepto se quedaba
  con una línea de texto en medio del lienzo. Ahora tiene el suyo: dos grupos de
  fichas que se juntan en un total.

Medido en el navegador, el hueco en blanco de la fase de Concepto de Aritmética
pasa de **330 px a 93 px**, y el de Reglas de 273 px a 168 px, con la tarjeta de
la regla ocupando el resto.

Y de paso: la pizarra ya no repite el rótulo de la regla que la tarjeta acaba de
enseñar. En la fase de Reglas se leía "Suma con llevada" en la tarjeta, otra vez
debajo y una tercera en el subtítulo.

### Comprobado

`qa/hito2.mjs` sube a **270 comprobaciones** y `qa/navegador.mjs` a **12**, tres
de ellas nuevas y dentro de Chrome: que se dibuje un recuadro por término
cancelado y que ninguno encierre el signo igual. `npm test` completo: **3.529
comprobaciones, 0 fallos**.

---

## 21. Quinta revisión: el turno de palabra, el reinicio y el diagrama que habla

Cuatro peticiones estructurales sobre el commit `3c02cd6`. Las cuatro,
atendidas.

### 1. Un solo dueño del sintetizador

**Lo que decía el mensaje.** Que `aula.tsx` y `pizarra-animada.tsx` llamaban a
`window.speechSynthesis.speak()` de forma independiente, y que hacía falta
centralizar el audio en un único servicio.

**Lo que había.** Ninguno de los dos llama a la Web Speech API: el único fichero
que la toca es `public/tts.js`, y el único que crea un sintetizador es
`aula.tsx`, que se lo pasa a la pizarra. Eso ya estaba.

**Lo que sí faltaba, y era el fondo de la petición.** Las reglas de convivencia
—quién puede hablar, quién puede callar a quién— vivían repartidas en tres
ficheros: una bandera en la máquina de estados, una llamada a `pause()` en el
aula y un efecto en el panel. Tres sitios que tenían que estar de acuerdo. El
fallo más caro de esta entrega salió justo de ahí.

Ahora hay un servicio, `lib/leccion/voz.ts`, y **la regla completa cabe en una
frase**: *hablar te da el turno; callar sólo te calla a ti*. Cada uno recibe su
vista del sintetizador —`voz.para("tutor")`, `voz.para("pizarra")`— con la misma
superficie de siempre, así que ni el motor de la lección ni la pizarra saben que
existe un reparto. La bandera que llevaba la máquina **se ha retirado**: la
regla ya no está en dos sitios que puedan discrepar.

### 2. Cambiar de fase o de tema empieza de cero

El subtítulo ya iba etiquetado con su fase desde la ronda anterior —por eso el
ejemplo de la pizza no puede aparecer bajo el rótulo de Reglas—, pero faltaba lo
demás: la pizarra animada seguía donde la había dejado la fase anterior. Ahora
recibe una clave de `tema · fase` y, al cambiar, vuelve a su primer paso. Y al
dejar el tema se calla lo que estuviera sonando, venga de quien venga.

Una precisión: **no se cancela la voz en cada cambio de fase**, como sugería el
mensaje. La fase se abre justo antes de que el tutor empiece a hablar de ella, y
cancelar ahí le cortaría la primera frase de cada módulo —el mismo tipo de fallo
que costó tres rondas—. Se cancela al cambiar de tema y al salir, que es cuando
de verdad sobra lo anterior.

### 3. La cancelación, dentro de un miembro

La ecuación se compone ahora **miembro a miembro**: se construye el izquierdo
con sus marcas, se escribe el igual, y se construye el derecho con las suyas.
Ninguna marca puede abarcar de un lado al otro porque ninguna se aplica sobre la
cadena entera. La suite lo comprueba en el LaTeX —ninguna marca contiene un
`=`— y en el navegador, midiendo dónde caen los recuadros y dónde el signo.

### 4. El diagrama dibuja la fracción de la que se habla

`DiagramaConcepto` acepta ahora `numerador`, `denominador`, `etiquetaNumerador`
y `etiquetaDenominador`, y la pizarra le pasa **la fracción que hay en la línea
en curso**. Si la lección explica 2/6, el dibujo tiene seis partes con dos
sombreadas y las leyendas dicen «numerador: 2», «denominador: 6». Las divisiones
se reparten dentro del lienzo, así que vale igual para 2 partes que para 12, y
la suite comprueba que ninguna se sale.

### Comprobado

`qa/hito2.mjs` sube a **293 comprobaciones**, con un bloque nuevo que ejerce el
turno de palabra: que hablar lo tome, que quien no lo tiene no pueda callar al
que sí, que hablar se lo arrebate al otro cortándolo una sola vez, y que la
regla no haya vuelto a duplicarse en la máquina. `npm test` completo: **3.552
comprobaciones, 0 fallos**.

---

## 22. Marcado semántico genérico: el frontend deja de crecer con el catálogo

El cliente lo planteó como lo que es, un problema de arquitectura: *«resolver la
vista caso por caso no escala; la base de datos alojará miles de ejercicios y el
sistema debe responder de forma genérica»*. Tenía razón. Hasta aquí, cada tipo de
ejercicio tenía su lector en el guion, y enseñar una operación nueva significaba
tocar la pizarra.

### 1. El paso llega etiquetado

Un paso ya no es sólo LaTeX: puede traer **la instrucción de foco**, que es lo
único que el frontend necesita para saber qué señalar.

```ts
{
  latex: "2x + 8 - 2x = 3x - 1 - 2x",
  operacion: { tipo: "cancelacion", terminosFoco: ["2x"], etiqueta: "se cancelan" },
  narracion: "Restamos 2x en los dos lados."
}
```

El contrato viaja de punta a punta: el generador lo emite, `src/preLight.js` lo
**valida** —tipo conocido y términos no vacíos; lo que no encaja se descarta con
un aviso, en lugar de llegar a la interfaz—, el reproductor lo entrega con la
directiva y el aula lo transporta hasta la pizarra.

### 2. La subrutina de marcado

`lib/leccion/marcado.ts` recibe el paso etiquetado y devuelve la escena: el
LaTeX con las marcas inyectadas y el foco que la pizarra encenderá. No sabe de
temas; sólo de operaciones.

- **Cada término listado recibe SU marca y SU recuadro.** En `2x + 8 - 2x` se
  marcan **las dos** apariciones, no la primera: lo que se cancela son las dos.
- **El marcado nunca cruza el igual**, y no por cuidado sino por construcción:
  la expresión se parte por los `=` de nivel superior, se marca dentro de cada
  miembro y se vuelve a unir. Es imposible que una caja abarque de un lado al
  otro.
- **Ni toca los nombres de macro**: la `x` de `\times` no es la incógnita.
- Un término que no está escrito **no se marca**: un recuadro sobre la nada no
  da error, sólo se ve mirando.
- Las cuatro operaciones del contrato —`amplificacion`, `distributiva`,
  `columna`, `cancelacion`— se resuelven con el mismo código; añadir una quinta
  es añadir una fila a una tabla, no un caso al frontend.

### 3. Sin etiqueta, se deduce

El generador todavía no emite metadatos, así que la lección de hoy sigue
llegando en texto plano. El guion prueba primero la etiqueta y, si no la hay,
deduce la operación como hasta ahora. Los dos caminos acaban en la misma escena,
de modo que el día que el catálogo empiece a etiquetar sus pasos no hay nada que
cambiar en la pizarra.

Y con la deducción llega **la amplificación**, que es lo que el cliente marcó en
rojo sobre la captura: `1/2 = 3/6` se escribía como un salto que el alumno tenía
que creerse. Ahora se compone el paso intermedio —`1×3 / 2×3`— con el factor
recuadrado **arriba y abajo**, que es lo que enseña que se multiplica por lo
mismo en los dos sitios, y el resultado no se destapa hasta el último paso.

### 4. El marcado se dibuja

El óvalo, la caja y el tachado ya no aparecen: **se trazan**, como los traza un
profesor. `pathLength` normaliza el contorno —da igual que sea un rectángulo,
una elipse o una raya— y la animación lo recorre en 420 ms, al compás de la voz;
el fondo entra después, para que primero se vea el gesto.

Se ha hecho con CSS y no con RoughNotation —el mensaje admitía las dos— porque
esa librería dibuja sus propias capas en el DOM y competiría con la capa SVG que
ya medimos sobre la fórmula; y porque una animación de trazo son ocho líneas de
hoja de estilos, sin dependencia nueva que mantener. Con
`prefers-reduced-motion`, no se dibuja nada.

### Comprobado

`qa/hito2.mjs` sube a **315 comprobaciones**, con tres bloques nuevos: el
contrato y la subrutina —incluido que ninguna marca cruce el igual en las cuatro
operaciones, que se marquen todas las apariciones y que un término ausente no
invente un resaltado—, la amplificación, y el trazo dibujado. `npm test`
completo: **3.574 comprobaciones, 0 fallos**.

---

## 23. Los pasos intermedios que faltaban, y el marcado que se ve

El cliente revisó el build `4528e52` —anterior a la entrega del marcado
semántico, que se fusionó después como `d6ccb29`— y pidió cerrar el PMV con
cuatro cosas. Una ya estaba; las otras tres, hechas.

### 1. Fracciones: el paso intermedio (ya entregado)

`1/2 = 3/6` se compone desde `bf076ae` como `1×3 / 2×3 = 3/6`, con el factor
recuadrado **arriba y abajo** —que es lo que enseña que se multiplica por lo
mismo en los dos sitios— y el resultado destapándose sólo al final. Estaba
fusionado pero no desplegado cuando se hizo la revisión.

### 2. Ecuaciones: la propiedad distributiva

En `2(x + 4)` el alumno veía aparecer `2x + 8` sin saber de dónde. Ahora el
reparto se cuenta en dos pasos:

1. Se enmarcan **el 2 y la x** a la vez → *«El 2 multiplica a x: da 2x.»*
2. Se enmarcan **el 2 y el 4** → *«Y el 2 multiplica a 4: da 8.»*
3. Óvalo sobre el resultado, que hasta ese momento no estaba escrito →
   *«Queda 2x + 8.»*

Cada paso enmarca el factor **y** el sumando al que llega, que es justo lo que
hace ver que el de fuera entra en los dos y no sólo en el primero. Funciona
igual con signo menos dentro (`3(2x − 5)` → `6x − 15`), y lo que no es un
reparto de los que se enseñan aquí —dos variables distintas, factor con
incógnita— se deja pasar en lugar de adornarlo mal.

### 3. Aritmética: el acarreo, destacado cuando se nombra

En "Reglas y propiedades" se veía una cuenta estática en una esquina. Ahora **la
cuenta de la regla entra en la pizarra animada**: se monta paso a paso, y al
oír *«si pasa de 9, llevo 1»* el foco salta a la columna que se lleva una. La
frase de esa fase no nombra ninguna posición decimal, así que "llevo",
"llevada", "llevamos" y "acarreo" delatan por sí solas a la columna que acarrea.

### 4. El marcado se ve como una etiqueta

- **El término marcado se colorea**: rojo lo que se cancela, azul lo que se
  opera, verde el resultado. Antes era texto negro con una raya fina encima.
- **El fondo del recuadro se ve** (de 0,16 a 0,22 de opacidad) y el trazo sigue
  dibujándose de principio a fin.
- **El recuadro entra con una transición**: aparece con una pizca de escala
  —260 ms, con un rebote corto— en lugar de encenderse de golpe.

Se ha hecho con CSS y no con Framer Motion: la capa de resaltados es SVG medido
sobre la fórmula, y animarla con una librería de layout obligaría a que esa
librería conociera unas coordenadas que se recalculan con cada cambio de tamaño.
Con `prefers-reduced-motion`, nada de esto se anima.

### Un fallo que sólo se veía abriendo la página

Al meter la regla en la pizarra animada, dos constantes quedaron usadas antes de
declararse. TypeScript no lo ve —son válidas en el módulo— y la aplicación
compila, pero al montar la lección lanza *«Cannot access before
initialization»* y la vista se queda en blanco. **Lo cazó `qa/navegador.mjs`**,
que abre un Chrome de verdad: el arreglo salió de ahí antes de mandar nada.

### Comprobado

`qa/hito2.mjs` sube a **329 comprobaciones**, con tres bloques nuevos: la
distributiva —dos pasos, el factor con cada sumando, el resultado destapado al
final y el resultado correcto con signo menos—, el acarreo respondiendo a
"llevo", y el aspecto de etiqueta del marcado. `npm test` completo: **3.588
comprobaciones, 0 fallos**.

---

## 24. Por qué la pizarra seguía siendo una foto: el guion salía vacío

El cliente revisó el despliegue `d6ccb29` —ya con el marcado semántico dentro— y
respondió lo mismo que la vez anterior: *«sigue igual»*. Tenía razón, y la
corrección anterior no le había llegado a la pantalla por dos motivos distintos,
los dos de fondo.

### El generador no escribe como el generador de mentira

La lectura de amplificaciones aceptaba `3/5 = 6/10`, que es como escribe el paso
el generador de pruebas. El de verdad escribe la multiplicación entera:

```
3/5 = (3 * 2)/(5 * 2) = 6/10
```

Tres miembros, con el producto en medio. Ninguna lectura del guion la reconocía,
así que esa línea —y las otras dos de la lección— caían en *prosa*, que no se
anima. Con las tres líneas descartadas, **el guion salía vacío y el panel
animado ni se montaba**: en pantalla quedaba la tarjeta de desarrollo, con la
solución completa a la vista y sin un solo resaltado. Eso es, literalmente, *«una
imagen estática con audio de fondo»*.

Ahora se leen las tres formas en que puede llegar el mismo paso —con el producto
delante, detrás o sin él, en texto plano o en LaTeX, con asterisco o con aspa— y
todas acaban en la misma escena. La línea se compone entera y se destapa por
partes: primero `3/5`, luego el producto con el factor recuadrado arriba y abajo,
y sólo al final el resultado.

Y con ella entró la otra mitad de la lección, que tampoco se animaba: sumar una
vez igualados los denominadores. `6/10 + 5/10 = (6 + 5)/10 = 11/10` se cuenta
ahora con un recuadro sobre cada numerador —*«sumamos los numeradores»*— y otro
sobre cada denominador —*«el denominador no cambia»*—, que es exactamente la
regla que se enseña. Van en colores distintos a propósito: con los cuatro
números marcados igual, la mitad del mensaje se pierde.

Una amplificación que no sale (`1/2 = (1×3)/(2×3) = 3/7`) o una suma que no
cuadra (`1/4 + 2/4 = 4/4`) no se adornan: se dejan pasar sin marcar.

### Las dos vistas hablaban de reglas distintas

En «Reglas y propiedades» seguía la cuenta estática en una esquina, y la
corrección anterior no podía funcionar por una razón que sólo se ve ejecutando:

- El enunciado de «Suma con llevada» **no es una operación**, es un `array` de
  LaTeX ya montado. No había nada que un guion supiera animar. Ahora se deshace
  hasta la cuenta que representa —`24 + 17 = 41`— y se anima columna por columna.
  Si el total dibujado no cuadra, no se compone nada.
- Y la regla se resolvía **en dos sitios con criterios distintos**: el aula
  miraba la regla *detectada* —que en aritmética casi siempre es nula, porque el
  motor narra la regla y no la escribe— mientras la tarjeta caía en su último
  recurso y componía la primera del tema. Una vista no tenía cuenta que animar y
  la otra tenía una compuesta y quieta. Ahora se resuelve **una sola vez**, en el
  aula, y baja ya elegida; cuando la cuenta se anima, la tarjeta deja de
  componerla y se queda con el nombre de la regla.

### Y una lección para las propias pruebas

Las dos comprobaciones que cubrían esto miraban el **código fuente** con una
expresión regular. Las dos pasaban. Y las dos cosas estaban rotas en pantalla:
la línea estaba escrita, sí, pero el dato real nunca llegaba a ella. Se han
sustituido por comprobaciones de **comportamiento sobre el catálogo real** —del
enunciado a la cuenta, y de la cuenta a sus focos— y por dos observaciones en el
navegador: que mientras «Suma con llevada» está en pantalla la cuenta se está
animando, y que la tarjeta no compone una segunda copia.

### Comprobado

`qa/hito2.mjs` sube a **358 comprobaciones**, con el bloque nuevo A00a1 que
prueba la lección de fracciones *con las líneas que escribe el generador de
verdad*, no con las cómodas. `qa/navegador.mjs` sube a **19** y añade una
lección de fracciones completa en Chrome: el paso llega marcado, el término va
en color —no en negro—, su recuadro se dibuja y lo que aún no ha salido sigue
oculto. `npm test` completo: **0 fallos**.

---

## 25. Desfase de estado, texto en el módulo equivocado y una sola subrutina

Cuarta revisión sobre el despliegue `7deff5d`. Cuatro puntos, y tres de ellos
tenían la misma raíz: algo colocado donde no iba.

### La pizarra iba tres pasos por delante del audio

Mientras el avatar daba la bienvenida de «Reglas y propiedades» —*«Cuando los
números tienen varias cifras…»*—, la pizarra ya estaba en **Paso 3 de 4**, con
la columna de las decenas encerrada y resuelta.

La pizarra sigue a la voz comparando lo que se oye con la narración de cada
paso. Y esa locución de apertura dice *«…primero las unidades, luego las
decenas…»* y *«…LLEVAMOS 1…»*: repite la palabra «decenas» y un par de unos, y
con eso puntúa más alto en el paso de las decenas que en ningún otro sitio.

Afinar la puntuación no arregla esto —un «1» suelto aparece en cualquier frase—.
Lo que faltaba era una regla de orden, que es la que sigue una cuenta de verdad:

- Estando en reposo, una frase que **enumera** columnas no puede llevar la
  pizarra más allá del primer paso: enumerar es presentar el método, no operar
  ninguna columna.
- Y no se salta ningún paso: se avanza **de uno en uno**. Si una locución apunta
  tres pasos más allá, la pizarra da uno. Retroceder sigue siendo libre, porque
  «repito el paso anterior» tiene que poder volver.

La segunda regla es la que impide que la primera congele nada: pase lo que pase,
la locución siguiente puede avanzar.

### El texto de la pizza no estaba congelado: estaba en el módulo equivocado

En «Reglas y propiedades» de Fracciones se leía y se oía el ejemplo de la pizza,
que es de «Concepto». Parecía estado sin limpiar. No lo era.

Las redacciones de concepto se repartían en módulos **por posición**: el primer
bloque es el *qué es*, el segundo la *regla*. Eso vale para derivadas y para
factorización, cuyo segundo bloque es literalmente la regla de la potencia o la
diferencia de cuadrados. En fracciones **no**: sus dos bloques explican qué es
una fracción, así que el de la pizza acababa etiquetado como «regla» y se
narraba con la fase de reglas ya abierta. El audio y el rótulo decían cosas
distintas porque el contenido estaba en el sitio equivocado.

Ahora el módulo **lo dice el bloque**, y la posición sólo decide cuando el bloque
no lo dice. Fracciones conserva su fase de Reglas —la abre la equivalencia que se
empuja a continuación— y derivadas y factorización conservan la suya.

De paso, la limpieza al cambiar de fase se completa: el subtítulo se vaciaba pero
su etiqueta de fase no. Media limpieza de estado es justo lo que hay que dejar de
hacer.

*(Lo que no se hace es cancelar el sintetizador en cada cambio de fase. Las fases
se abren DENTRO de la misma narración continua: cancelar ahí cortaría al tutor a
media frase. Al cambiar de tema sí se calla todo, y eso ya estaba.)*

### La notación se caía a texto plano

`3/5 = (3 * 2)/(5 * 2) = 6/10` se componía con sus asteriscos y sus barras, con
aspecto de consola. La causa: la pizarra de arriba componía con el conversor
genérico, que no sabe leer un producto dentro de una fracción, mientras la de
abajo componía **la misma línea** como fracción con el factor en color.

Eran dos caminos para lo mismo, y ese es el problema de fondo que señala el
punto 4 del informe.

### Una sola subrutina para las dos pizarras

Las dos componen ahora con `escenaDeLinea`, que es la subrutina de marcado:

- Recibe el paso **con su instrucción de foco** —tipo de operación, términos y
  rótulo— cuando el generador la manda, y la deduce del contenido cuando no.
- Pone el recuadro, el color o el tachado sobre el término que toque **sin saber
  de qué tema se trata ni qué números lleva**.
- Sólo se cae al conversor genérico cuando no reconoce nada que marcar, que es
  lo correcto para una línea de prosa.

Lo que responde «Explicar regla» entra por ese mismo sitio, así que sale con el
mismo formato y con las mismas marcas. No hay una sola rama por tipo de
ejercicio en ninguna de las dos vistas.

Queda dicho con precisión: el **contrato** de metadatos viaja de punta a punta
—el generador puede emitirlo, `preLight` lo valida, el reproductor lo entrega y
las dos pizarras lo aplican—, pero el generador todavía no etiqueta la mayoría de
los pasos, así que hoy el trabajo lo hace la deducción. Cuando el catálogo
empiece a etiquetar, no hay nada que tocar en el frontend: es el camino que ya
usan los pasos etiquetados.

### Comprobado en local, como se pidió

`qa/hito2.mjs` sube a **359 comprobaciones**, con tres bloques nuevos: el reparto
de bloques en su módulo, la subrutina compartida, y la pizarra empezando en
reposo y avanzando en orden.

`qa/navegador.mjs` sube a **26** y abre Chrome de verdad para lo que sólo se ve
ejecutando: que cada cuenta empieza por su primer paso y avanza de uno en uno,
que en ninguna muestra se lee el ejemplo de Concepto bajo el rótulo de Reglas,
que no queda en pantalla ni una fórmula con sintaxis de consola, y que **se pulsa
«Explicar regla»** y la notación sigue compuesta.

`npm test` completo: **0 fallos**.

---

## 26. El motor entrega el paso etiquetado: el contrato, cumplido

En la entrega anterior quedó dicho con precisión lo que faltaba del punto 4 del
cliente: el **contrato** de metadatos viajaba de punta a punta, pero **nadie lo
cumplía**. Los motores escribían texto y la pizarra lo adivinaba. Esta entrega lo
cierra.

### Lo que pedía el cliente

> El paso matemático entrega: expresión, tipo de foco (columna, factor,
> cancelación) y texto de locución. La subrutina aplica el recuadro, color o
> tachado automáticamente sobre el token correspondiente sin importar el tema ni
> los números.

### Lo que entrega ahora el motor

Cada paso operativo de la pizarra sale del motor con su instrucción de foco:

```js
{ tipo: "pizarra", contenido: "2/6 + 3/6 = (2 + 3)/6 = 5/6",
  operacion: { tipo: "suma-fracciones", terminosFoco: ["2", "3"] },
  narracion: "Con el mismo denominador, solo se suman los numeradores…" }
```

- `tipo` es un **gesto**, no un tema: `columna`, `factor`, `cancelacion` —los tres
  que nombró el cliente— y tres gestos compuestos con dibujo propio:
  `amplificacion`, `suma-fracciones` y `distributiva`. Un catálogo de miles de
  ejercicios cabe en esos seis, porque lo que cambia de un ejercicio a otro son
  los números, no el gesto. (Desde la sección 31 hay un séptimo, `resultado`:
  el cierre del ejercicio, la respuesta final enmarcada.)
- `terminosFoco` son términos **escritos** en el paso, tal cual.
- `narracion` es lo que dice el tutor mientras se marca.

Lo emiten los nueve motores deterministas: suma, resta, multiplicación, división,
fracciones con igual y con distinto denominador, ecuaciones lineales, derivadas y
factorización. **14 pasos operativos, todos etiquetados, ninguno perdido en la
validación del servidor.** Los enunciados, las preguntas y los resultados finales
van sin etiqueta a propósito: en ellos no se opera.

### Cómo lo usa la pizarra

La subrutina `escenaDeLinea` es la única puerta, para las dos pizarras:

1. **Si el paso trae etiqueta válida, manda ella.** Su tipo elige el compositor de
   ese gesto —la columna con sus llevadas, la amplificación con el producto a la
   vista—; si ningún compositor sabe leer el paso, el **marcador genérico** pone
   el recuadro, el color o el tachado sobre los términos que diga. Una etiqueta
   válida nunca se sustituye por una suposición.
2. **Sólo sin etiqueta se deduce**, como hasta ahora.

Cada escena lleva anotado si salió de la etiqueta o de la deducción, y la pizarra
animada lo expone. Así se puede **afirmar desde fuera** —y se comprueba en
Chrome— que el paso se pinta con lo que dijo el motor.

### Lo que no se animaba y ahora sí

Tres pasos que ninguna lectura sabía reconocer se animan ahora porque el motor
dice qué hacer con ellos, sin haber escrito un lector para ninguno:

- `12 × 4 = (10 + 2) × 4` — se recuadran el 10 y el 2 en que se rompe el número.
- `derivada de x² = 2x` — el exponente que baja y el coeficiente en que se
  convierte: la regla de la potencia, dibujada.
- `x² - 9 = (x - 3)(x + 3)` — el 9 y los dos 3, con el rótulo «9 = 3²».

Y la división, que era la única lección **sin un solo paso animado**: escribía
`84 ÷ 4 = 21 (porque 4 × 21 = 84)`, que es una frase y no se puede componer como
fórmula. Ahora son dos líneas limpias —la división y su comprobación— con el
divisor y el cociente recuadrados en las dos.

### Las etiquetas malas no dibujan nada

- Un término que no está escrito en el paso **invalida la etiqueta**: el servidor
  la descarta y la pizarra deduce el paso como antes. Nunca un recuadro al aire.
- Un término es un término: el «5» no está en «15», ni el «1» en «11/10», ni la
  «x» en «dx». Y un superíndice cuenta como escrito: en «3x²» el 2 está.
- El servidor y la interfaz reconocen la misma lista de gestos, y una prueba lo
  vigila.

### Dos pruebas que no probaban nada

Al revisar la batería apareció algo que conviene decir: dos cadenas de LaTeX de
`qa/hito2.mjs` estaban escritas con **una** barra dentro de las comillas. En
JavaScript `"\frac"` es un salto de página seguido de «rac», y `"\times"` un
tabulador seguido de «imes». Una de esas pruebas —«no se marca la x de una
macro»— corría sobre una cadena **sin ninguna macro**, así que pasaba sin probar
nada; además `\times` ni siquiera lleva x. Las dos están corregidas, la de la
macro usa una que sí contiene la letra, y un rastreo de todo el QA y de las
fuentes de la pizarra confirma que no queda ninguna más.

### Comprobado

`qa/hito2.mjs` sube a **406 comprobaciones**: el contrato motor por motor pasado
por el PRE Light real, los tres pasos que sólo se animan con etiqueta, y el
rechazo de etiquetas malas. `qa/navegador.mjs` sube a **27** y comprueba en una
lección de fracciones de verdad que la pizarra dibuja **por etiqueta**
(`suma-fracciones`), no por deducción. `npm test` completo, con las baterías que
hablan con Gemini en vivo: **0 fallos**.

### Lo que queda para después, dicho claro

El catálogo de ejercicios del panel docente guarda sus pasos resueltos, pero hoy
**ninguna lección los lee**: las lecciones salen de los motores. Cuando se conecte
el catálogo a las lecciones, sus pasos podrán llevar la misma etiqueta y la
pizarra no necesitará ningún cambio: es el camino que ya recorren los pasos de los
motores. Y el generador de Gemini puede enviar la etiqueta —el servidor la valida
igual—, pero no se le ha pedido todavía: cambiar lo que se le pide a un modelo en
vivo merece su propia prueba, no un añadido de pasada.

---

## 27. Revisión f515a57: el ejercicio se completa, la marca no tapa y la proyección no falta

Cuatro observaciones del cliente sobre el despliegue `f515a57`. Las cuatro se
reprodujeron primero en Chrome, con los mismos pasos que él —la lección entera,
la práctica contestada y los botones de apoyo pulsados en el mismo momento—, y se
compararon las capturas con las suyas antes de tocar nada.

### 1. "Más difícil" se quedaba en "Preparando el ejercicio…"

Reproducido tal cual. "Más difícil" trae otro ejercicio **sin cambiar de fase**,
y la tarjeta se vaciaba a la espera de la directiva que lo escribe, que llega
detrás de dos locuciones: *«Vamos con otro: 2000 + 1800»* y *«Vamos a sumar
2000 + 1800 paso a paso»*. Todo ese rato el tutor hablaba de una cuenta y la
tarjeta decía *«Preparando el ejercicio…»*.

Y al llegar la práctica aparecía un segundo defecto, visible en la otra captura
del cliente: la tarjeta seguía mostrando el **ejemplo** (2000 + 1800) mientras la
caja de respuesta preguntaba por **otra** cuenta (2411 + 2457).

- La tarjeta toma el ejercicio nuevo **en el acto**: viene en la respuesta del
  servidor desde el primer momento.
- Un enunciado para resolver —«19 + 45 = ?»— **se lleva la tarjeta**, y con él se
  retira el desarrollo del ejemplo, que era de otra cuenta. Lo que se pregunta es
  lo que se ve.

### 2. El óvalo tapaba el resultado

El resultado ya no se rodea: **se subraya dos veces y se confirma con un visto a
su derecha**, como lo dibujó el cliente. Nada toca las cifras, y el número —en
verde— se lee entero. Los tres trazos se dibujan uno detrás de otro, y todo es
proporcional al tamaño del número: en proyección, con la fórmula multiplicada y
el trazo engordado, dos rayas a distancia fija se fundían en una sola barra.

Al probarlo sobre una fracción apareció un fallo de medida que venía de antes: la
caja de un trozo de fórmula se medía por el span que lo envuelve, y en una
fracción KaTeX sube el numerador y baja el denominador **fuera** de esa caja. La
doble raya caía encima del denominador. Ahora se miden los glifos y la raya de la
fracción: la marca abarca la fracción entera, y lo mismo vale para las cajas.

### 3. La regla y su ejemplo, centrados y al mismo tamaño

El ejemplo `1/2 = 2/4 = 3/6` se componía en línea: fracciones de texto diminutas
en la esquina de abajo, y a ese tamaño el «=» se quedaba en dos rayitas que en la
pantalla del cliente se leían como un menos. Ahora la regla y su ejemplo van en
modo display, centrados y con la misma letra grande (equivalente a `text-2xl`).

### 4a. El ejercicio no puede quedar truncado

Aquí había dos causas, y las dos se reprodujeron.

**La explicación se comía la pregunta.** El alumno está ante *«¿Cuánto es 3/5 +
1/2?»* y pulsa «No entendí este paso». La explicación la redacta el modelo en vivo
y **se detiene antes del resultado a propósito** —dárselo sería resolverle la
práctica—. Pero sustituía a la lección entera, y la pregunta pendiente se perdía
con ella: el tutor explicaba y terminaba con *«¡Lección completada!»* sin que el
alumno hubiera contestado. Ese es exactamente el «6/10 + 5/10» de la captura.
Ahora el reproductor recuerda la pregunta que el alumno tiene delante, y la
explicación termina **devolviéndosela**, con su respuesta esperada: se corrige
igual, y la lección sólo termina al contestarla.

**Y al acertar, nadie cerraba el desarrollo.** Ahora, con la respuesta ya
acertada, la pizarra lo cierra: si la última línea es una operación a medias que
**vale** exactamente la respuesta, se completa —«6/10 + 5/10» pasa a «6/10 + 5/10
= 11/10»—; si no, se añade el enunciado resuelto. Nunca se escribe una cuenta que
no se haya comprobado. Y la pizarra animada, al terminar la lección, se queda en
su último paso con el resultado subrayado y confirmado, en lugar de volver al
primero con el resultado escondido.

### 4b. El botón de Modo proyección no puede desaparecer

Vivía sólo en el panel animado, y el panel se retiraba cuando la fase no tenía un
paso animable: en la práctica —con el enunciado y nada más— o en el concepto.
Ahora el panel **no se retira nunca durante una clase**. Si no hay nada que
animar, se queda como una barra con el botón —sin repetir debajo lo que ya enseña
la pizarra— y, al proyectar, pone en grande lo último que hay escrito: el paso, el
enunciado o la regla, con el avatar al lado.

Al comprobarlo aparecieron dos defectos de la proyección que venían de antes: el
botón **«Salir de proyección» era un rectángulo blanco sin texto** —letra blanca
sobre el fondo blanco del botón—, y el avatar, con los colores de la interfaz
clara, casi desaparecía sobre la pizarra oscura. Los dos están corregidos.

### Comprobado

`qa/hito2.mjs` sube a **430 comprobaciones**, con un bloque para esta revisión: la
marca del resultado, la regla centrada, la tarjeta en el «más difícil», el cierre
del ejercicio con sus casos límite, la pregunta devuelta tras explicar y el panel
que no se retira. `qa/navegador.mjs` sube a **43** y reproduce en Chrome los
cuatro flujos del cliente: mide que las dos rayas quedan **por debajo** de las
cifras y el visto **a su derecha**, que la tarjeta nunca se queda en «Preparando»
y muestra lo que se pregunta, que el desarrollo se cierra al acertar, que el botón
de proyección está en la práctica, que «Salir de proyección» se lee, y que tras
«No entendí este paso» la pregunta vuelve en lugar de darse la lección por
completada. `npm test` completo: **0 fallos**.

---

## 28. Revisión 9b06d70: pizza circular, sincronía real, el brazo de la distributiva y tres fuentes

Cuatro observaciones sobre el despliegue `9b06d70`, las cuatro de maquetación,
sincronización y tipografía. Se reprodujo cada una en Chrome antes de tocar
nada, y se volvió a comprobar visualmente después con capturas propias.

### 1. Fracciones: la pizza ahora es un círculo, y el vocabulario se explica en dos pasos

El diagrama de la fase de Concepto era un rectángulo partido en celdas. El
cliente lo señaló con precisión: mientras la locución dice *«partes una pizza en
4 porciones iguales»*, el dibujo no tenía nada de pizza. Ahora es un **círculo
cortado en gajos** —un `<path>` de arco por porción, no un `<rect>` en fila—, y
cada gajo entra con su propio pequeño «corte», uno detrás de otro, en vez de
aparecer entero de golpe.

Y el rótulo *«Fracción: numerador / denominador»* no podía seguir apareciendo
entero desde el primer instante. La causa de fondo: una sola locución nombraba
las dos palabras a la vez, y el Web Speech API no da un punto fiable dentro de
una frase para saber CUÁNDO, dentro de ella, se ha dicho cada una —entre
navegadores y voces, ese detalle no es de fiar—. En vez de fingir una sincronía
que no se puede medir, el vocabulario se cuenta ahora en **dos locuciones
cortas**, una por palabra: primero el numerador, con su flecha y su rótulo en el
gajo; después el denominador, con un arco que abraza toda la pizza. Cada uno
aparece exactamente cuando se escribe su propia línea en la pizarra, que es una
señal que sí se puede medir con certeza.

Y se añadió lo que el cliente pidió explícitamente: la expresión formal
**«Numerador / Denominador: 1/4»**, con una fracción de verdad compuesta por
KaTeX, que cierra la idea una vez dichas las dos palabras.

La frase de cierre —*«Fracción: numerador / denominador»*— se conserva tal cual
estaba, mismo texto y mismo espaciado: es la marca de la que depende que la
lección siguiente rote a la otra redacción («cuántas partes tomo») en lugar de
repetir ésta, y cambiarla habría roto esa rotación en silencio.

### 2. «llevo 1» ya no tapa la cifra

El rótulo de la llevada subía un margen FIJO (6 px), pensado para el tamaño de
letra de pantalla. En Modo proyección esa letra crece mucho más —hasta 1,75rem,
para leerse desde el fondo del aula— y el rótulo quedaba prácticamente encima de
la cifra que llevaba encima: el cliente lo fotografió tapando el «1».

El margen ahora se mide en `em` —la propia unidad de la letra del rótulo, con
`dy="-0.65em"`— así que crece exactamente al mismo ritmo que la letra, en
pantalla y en proyección, sin que el componente tenga que saber a qué tamaño se
está dibujando. Medido en Chrome: **8 px de hueco limpio** entre el rótulo y la
caja, en proyección.

### 3. El brazo de la propiedad distributiva

El cliente lo dibujó a mano sobre su captura: un arco que sale del factor y
entra en cada sumando, para que se vea que el de fuera «viaja hasta» el de
dentro y no sólo que los dos quedan recuadrados a la vez. Ahora hay un arco de
verdad —una curva SVG con su punta de flecha, del borde de abajo del factor al
borde de abajo del sumando, hundiéndose más cuanto más lejos están— que se
dibuja con el mismo trazo azul y la misma animación de las cajas. Sólo aparece
cuando el foco encendido enmarca exactamente el factor y un sumando, que es como
`escenaDeDistributiva` arma sus focos: no hay ocasión de dibujarlo donde no toca.

### 4. Identidad tipográfica: tres roles, tres fuentes

- **Lo que el tutor DICE** —el subtítulo, el pie de la pizarra animada— va en
  `"Segoe Print", "Bradley Hand", "Snell Roundhand", cursive`: el nombre exacto
  que dio el cliente, con alternativas para quien no tenga esa fuente de
  Windows.
- **Lo que se ESCRIBE en la pizarra que no es una fórmula** —la etiqueta de
  «llevo 1» o «× 2», los rótulos del diagrama, una nota que no se dejó componer
  como LaTeX— va en `"Chalkboard SE", "Comic Sans MS", "Comic Sans",
  sans-serif`: también nombradas por el cliente, una de Windows y otra de
  macOS.
- **Las fórmulas** se quedan exactamente como estaban: las compone KaTeX, que ya
  es la fuente de matemáticas estándar que pedía el cliente como alternativa a
  Cambria Math. No se le fuerza ninguna fuente encima.

Son fuentes del sistema a propósito, no cargadas como fuente web: son tipos con
derechos de Microsoft/Apple, sin versión abierta que se pueda auto-alojar, y las
tres son exactamente las que pidió el cliente por su nombre, no una
aproximación. Un equipo sin ninguna de las dos —Linux, la mayoría de los
móviles— cae en el género que sigue en la lista y sigue leyéndose como letra
escrita a mano, distinta de la de la pizarra.

### Comprobado

`qa/hito2.mjs` sube a **453 comprobaciones**: la forma del diagrama, el orden de
la aparición progresiva pasado por el motor y el PRE Light reales —no un mock—,
la marca de rotación intacta, el desplazamiento de la etiqueta en `em`, el
componente del brazo y las tres reglas de tipografía. `qa/navegador.mjs` sube a
**58** y lo comprueba en Chrome de verdad: que la pizza se dibuja con gajos, que
el numerador se ve antes que el denominador y nunca al revés, que la expresión
formal acaba apareciendo, que «llevo 1» deja un hueco medido de verdad en
proyección, que el brazo de la distributiva es una curva con su flecha, y que la
fórmula de KaTeX no hereda la fuente manuscrita del subtítulo.

Las 13 baterías sin navegador (diagnóstico, PRE Light, PASO 1, HITO 1, HITO 2,
matemáticas, nivel, QA, frontend, sesiones, aceptación, lección multimodal y
barrido) se ejecutaron una a una: **0 fallos**. La máquina de esta sesión llegó
al final del turno con poca memoria libre —compartida con otras aplicaciones en
uso—, y una repetición de la batería completa de Chrome en ese momento no llegó
a terminar por esa razón, no por el código: la misma batería había terminado
limpia, completa y dos veces seguidas —58 de 58— minutos antes, con capturas de
pantalla propias que confirman cada uno de los cuatro puntos.

## 29. Cuatro observaciones más sobre lo ya desplegado: dos correcciones y dos huecos que faltaban por llenar

El cliente revisó el resultado de `9b06d70` ya en producción y devolvió cuatro
puntos nuevos, dos de ellos correcciones sobre lo que se acababa de entregar y
dos huecos que el punto 28 no cubría todavía. Los cuatro, reproducidos y
verificados antes de darlos por cerrados.

### 1. Tipografía: el cliente corrigió el reparto de roles

El punto 28 le había puesto letra manuscrita («Segoe Print») al **habla** del
tutor —el subtítulo, el pie de la pizarra animada— siguiendo al pie de la letra
la redacción original del cliente. Su revisión lo corrige explícitamente:

> «Subtítulos del Avatar (Barra inferior): Debe mantenerse con tipografía
> estándar limpia del sistema (Inter / Sans-serif normal)... Actualmente le
> pusiste la cursiva manuscrita a todo el texto inferior.»
> «Pizarra y notas de clase: Es aquí donde debe aplicarse la fuente estilo
> pizarra escolar (Chalkboard SE / Segoe Print).»

Es decir: no son tres roles con tres fuentes —habla, pizarra, fórmulas—, son
**dos**. El habla del tutor se lee con la tipografía estándar de la interfaz,
sin cursiva. Y «Chalkboard SE» y «Segoe Print», que el punto 28 había repartido
una para el habla y otra para lo escrito, son en realidad **dos alternativas
del mismo estilo de pizarra**.

Se quitó la clase `.pz-manuscrita` por completo —no queda ni un rastro, lo
comprueba `qa/hito2.mjs`— y el subtítulo, el pie de la pizarra animada y una
nota de prosa que no se dejó componer como fórmula vuelven a heredar la
tipografía limpia de siempre. `.pz-tiza` —la etiqueta de la llevada, los
rótulos del diagrama, una nota escrita en la pizarra— ahora lleva `"Chalkboard
SE", "Segoe Print", "Comic Sans MS", "Comic Sans", cursive, sans-serif` como una
sola lista de alternativas. Comprobado en Chrome de verdad: el subtítulo mide
`ui-sans-serif, system-ui, sans-serif...`, la etiqueta mide `"Chalkboard SE",
"Segoe Print"...`, y la fórmula sigue midiendo la suya propia de KaTeX —las tres
distintas entre sí, ninguna pisando a otra—.

### 2. «llevo 1» volvió a tapar una cifra, esta vez con llevadas encadenadas

El punto 28 corrigió el caso simple —una sola llevada—, pero el cliente lo
volvió a fotografiar con una suma de varias cifras, donde una columna **recibe**
una llevada y a la vez **genera** la suya propia hacia la siguiente (por
ejemplo, en `234 + 876`: unidades lleva a decenas, y decenas, con esa llevada ya
sumada, genera otra hacia centenas). La caja que mide esa columna sólo incluía
las cifras del sumando, no la llevada que entra por arriba, así que el tope de
la caja —de donde cuelga el rótulo— quedaba por debajo de esa llevada, y «llevo
1» aterrizaba encima de ella en vez de sobre su propia cifra.

El arreglo no necesitó geometría nueva: la marca de la llevada ahora lleva
también la clase de SU PROPIA columna (`pz-llevada-N pz-col-N`, no sólo
`pz-llevada-N`), así que entra en la medición existente de esa caja, y el mismo
`dy="-0.65em"` del punto 28 la despeja correctamente porque ahora mide contra el
tope real, más alto. `qa/hito2.mjs` fija `"234 + 876"` como caso de regresión:
tres llevadas encadenadas, las tres con su doble clase.

### 3. En Conceptos, la proyección no enseñaba nada; en la práctica difícil, escondía de dónde salía el común denominador

Dos huecos en la misma fase, los dos con la palabra «proyección» de por medio:

**3a. El diagrama no se proyectaba.** El botón de Modo proyección seguía en pie
durante la fase de Concepto —eso lo arregló una ronda anterior—, pero sin nada
animado que mostrar, el panel proyectado se limitaba a componer el último texto
escrito con KaTeX, a tamaño de fórmula: una frase diminuta en medio de la
pantalla negra. El gráfico circular que la pizarra clásica sí dibuja arriba
nunca llegaba al panel proyectado. Ahora, cuando la fase de Concepto tiene un
diagrama para el tema en curso, se dibuja ahí en grande —hasta 44rem de
ancho— en lugar del texto suelto, con el mismo cálculo (`conceptoDeFraccion`,
en `lib/leccion/diagramas.ts`) que usa la pizarra clásica, para que las dos no
puedan discrepar sobre si ya se dijo «numerador» o «denominador».

Verificado en Chrome de verdad esto costó un vaivén: la primera versión centraba
el diagrama con `align-items: center` en un contenedor flex en columna, y ese
`align-items` —el eje CRUZADO de una columna, el horizontal— hacía que el `div`
de `DiagramaConcepto` dejara de estirarse al ancho disponible y se encogiera a
su contenido; el SVG, con `width: 100%` resuelto contra ese ancho ya encogido,
terminaba en el tamaño de reserva de un SVG sin tamaño (300×150 px), más
pequeño que antes de tocar nada. Se vio exactamente así en una medición con
Playwright —`300px` de ancho real— antes de corregirlo quitando ese
`align-items` (el valor por defecto, `stretch`, es el que hacía falta) y
volviendo a medir: **646px**, la práctica totalidad del contenedor.

**3b. La práctica difícil decía el común denominador sin escribir de dónde
salía.** En «1/2 + 1/3», la locución decía «el mínimo común denominador es 6» y
la pizarra pasaba directo a las fracciones ya convertidas, sin el paso
intermedio. El cliente lo señaló con su propio ejemplo —«2×3=6 o múltiplos
comunes»—, y hacen falta las dos formas: multiplicar los denominadores sólo da
el mínimo común múltiplo cuando son coprimos (`gcd = 1`); la mayoría de los
pares de "difícil"/"experto" del generador NO lo son, y aplicar ese atajo ahí
habría escrito un común denominador que no es el mínimo. Ahora, antes de
convertir las fracciones, se escribe y se narra el paso que corresponda:
`MCM(2, 3): 2 × 3 = 6` cuando son coprimos, o `Múltiplos de 4: 4, 8, 12.
Múltiplos de 6: 6, 12. El menor en común: 12.` cuando no. Comprobado con las
cuatro combinaciones del generador (dos coprimas, dos no) y con las 200
sesiones × 8 turnos del barrido completo, incluida `Resuelve 1/2 + 1/3`
explícitamente: 0 violaciones.

### 4. La tarjeta de la regla, sin fórmula, seguía ocupando el alto pensado para una con fórmula

El punto 25 ya había reducido el alto de la pizarra en Concepto y Reglas para
no dejar «medio lienzo en blanco». Pero dentro de ESE alto reducido queda un
caso más pequeño todavía: cuando la cuenta de la regla se anima en el panel de
abajo, la tarjeta de arriba se queda sólo con el nombre y un aviso de una
línea —«La cuenta se monta paso a paso aquí debajo»—, sin notación ni ejemplo.
El cliente la volvió a fotografiar, esta vez como «tarjeta residual... ocupando
espacio innecesario». Se añadió un tercer nivel de alto, más pequeño
(`h-[8rem] sm:h-[9rem]`), que se activa exactamente en ese caso —Reglas, con la
cuenta animándose abajo— y en ningún otro, así que ninguna otra fase cambia de
tamaño.

### Comprobado

`qa/hito2.mjs` sube a **479 comprobaciones**. `qa/navegador.mjs` —**59**,
ejecutado limpio de principio a fin en esta sesión, sin cortes— vuelve a medir
en Chrome de verdad las fuentes computadas de los tres roles, que el hueco de
«llevo 1» sigue existiendo, y el resto de las comprobaciones ya existentes del
punto 28. Las 13 baterías sin navegador se ejecutaron una a una con el
servidor local levantado —incluidas las que dependen de él (QA, sesiones,
aceptación, lección multimodal, barrido, PASO 1, preflight)—: **0 fallos**, con
el barrido completo (200 sesiones, 1.800 turnos) pasando por la rama de
fracciones difíciles que ejercita el punto 3b. `tsc --noEmit` y `npm run build`
limpios en cada paso.

## 30. Revisión daa127d: lo que dice el avatar es lo que muestra la pizarra

Cinco incoherencias sobre el despliegue `daa127d`, más dos anotaciones sobre la
proyección de Concepto («no sincroniza lo que dice con lo que muestra», «el
avatar habla mucho pero muestra poco»). Casi todas tenían la misma raíz, y por
eso se corrigió la raíz y no cada síntoma: **el motor narraba primero y escribía
después**. Cada línea aparecía cuando su frase ya había terminado, así que la
pizarra iba siempre una frase por detrás de la voz.

### 1 y 2. «No entendí este paso»: el mismo ejercicio, desglosado, y la clase sigue

Reproducido tal cual: el botón pedía la explicación al modelo en vivo y, cuando
el modelo no respondía (cuota agotada), el servidor caía en una **lección de
demostración genérica del tema** —la de la pizza, con «1/4 + 1/4 = 2/4» y otra
pregunta—. De ahí las dos capturas: el desarrollo resolvía una cuenta distinta
de la del enunciado, se hablaba de una pizza que no se veía, y la explicación
*sustituía* a la lección, que acababa en «¡Lección completada!» sin llegar a la
práctica. Había además un segundo fallo debajo: el ejercicio que viajaba con la
petición era el último escrito de la lección —el de la práctica—, no el de la
tarjeta, así que en el ejemplo se explicaba un ejercicio que el alumno aún no
había visto.

Ahora:

- **El botón desglosa el ejercicio de la tarjeta, sin IA.** Fracciones con todo
  detalle (por qué hace falta el denominador común, el MCM escrito, cada
  conversión, la suma y la simplificación), y también ecuaciones, aritmética,
  derivadas y factorización.
- **El paso exacto.** La interfaz envía el paso que el alumno tiene delante —el
  que enseña la pizarra animada—, y ese paso recibe su andamiaje justo antes de
  desglosarse («la clave de este paso: con el mismo denominador los trozos son
  del mismo tamaño…»).
- **La respuesta final consolidada.** En el ejemplo se llega hasta el final:
  `1/2 + 1/3 = 3/6 + 2/6 = (3 + 2)/6 = 5/6`. Esa misma línea cierra ahora
  también el ejemplo normal de la lección. En la práctica, con la pregunta sin
  contestar, el desglose se detiene antes del resultado (darlo sería
  resolverle el ejercicio) y le devuelve su pregunta.
- **Retomar el ejercicio.** Tras explicar, la lección se **reanuda**: vuelve la
  pregunta pendiente, si la había, y las fases que quedaban (la práctica), en
  lugar de darse por completada.
- En Concepto y Reglas, donde no hay ejercicio en la tarjeta, se cuenta la misma
  idea con otras palabras, sin traer ningún ejemplo nuevo. Y «Explicar regla»,
  si el modelo no responde, tampoco cae ya en la lección de demostración:
  explica la regla sobre el mismo ejercicio.

### 3. El fotograma de los numeradores ya no dura «unos milisegundos»

En el ejemplo, la línea `3/6 + 2/6 = 5/6` se escribía **después** de su frase
(«Sumamos los numeradores…»), y 0,7 s más tarde la frase siguiente se la
llevaba. Ahora cada paso animado se escribe antes de contarlo, **cada foco
tiene su propia frase** —la misma que enseña el pie del panel: primero los
numeradores, luego el denominador que no cambia, luego lo que queda— y detrás de
cada frase hay una **pausa de lectura de 1 segundo** antes de cualquier
transición (sin poner al avatar a «pensar»). Lo mismo para las conversiones del
MCM, la simplificación, las columnas de aritmética, el reparto del paréntesis en
ecuaciones y el paso de cada resultado final a la práctica. La reproducción del
propio panel pasa también de 0,6 s a 1 s entre pasos. Como red de seguridad
general, el PRE Light reordena cualquier paso etiquetado que se narre antes de
escribirse y le añade su pausa, venga del motor o del modelo.

### 4. Tipografía y jerarquía en Modo Proyección

Los rótulos («Fracciones equivalentes:», «MCM(2, 3):», «Propiedad uniforme de la
suma:») se proyectaban como un párrafo a tamaño de texto junto a una fórmula a
tamaño de proyección. Ahora cada línea escrita se proyecta como **nota de
pizarra**: el rótulo en letra de pizarra (Chalkboard SE / Segoe Print) y nunca
por debajo de `text-2xl` —crece con la pantalla—, la fórmula en KaTeX y en
estilo de bloque, un escalón por encima del rótulo, y cada idea en su renglón
(«Múltiplos de 4… / Múltiplos de 6… / El menor en común…»). El subtítulo sigue en
la letra limpia del sistema.

Y lo anotado sobre Concepto: la proyección enseñaba sólo la última línea, así
que cada frase nueva borraba la anterior («habla mucho pero muestra poco»).
Ahora en Concepto y Reglas se proyecta **todo lo escrito en la fase**, con la
línea que se está contando resaltada; en Concepto, el diagrama a un lado y las
notas al otro. «Fracción: numerador / denominador» se compone como fracción de
verdad, con su raya, como lo dibujó el cliente. En Reglas de fracciones, lo que
se dice ya coincide con lo que se escribe: se escriben y se cuentan las tres
propiedades del catálogo (equivalentes, igual denominador, distinto
denominador) —antes la pizarra ponía «Fracciones equivalentes» mientras el
tutor explicaba cómo se suman—. En ecuaciones, la frase de Reglas nombra la
propiedad que está escrita.

### 5. La tarjeta no adelanta el resultado de la distributiva

La tarjeta se componía con la misma escena que anima el panel, y esa escena
lleva dentro lo que la animación destapa al final; fuera del panel se veía todo.
Además la escena escribía una **cadena falsa**: `2(x + 4) = 3x − 1 = 2x + 8`.
Ahora:

- La tarjeta de EJERCICIO compone el enunciado **tal cual está escrito**.
- En una ecuación, lo repartido va en su **propio renglón**, alineado por el
  igual: `2x + 8 = 3x − 1` debajo de `2(x + 4) = 3x − 1`.
- La animación reparte **los dos términos** con su frase cada uno («El 2
  multiplica a x: da 2x», «Y el 2 multiplica a 4: da 8») hasta destapar la
  ecuación repartida. De paso se corrigió el signo de esas frases cuando hay un
  término negativo dentro («multiplica a −3: da −6»).
- **El enunciado de la práctica ya no se anima.** La captura mostraba la pizarra
  repartiendo el 2 del ejercicio que el alumno tenía que resolver: la propia
  pregunta del tutor compartía cifras con el primer paso y lo encendía. Tampoco
  cae ya en el desarrollo tras «Más difícil»: se lleva la tarjeta, aunque no
  termine en «= ?».

### Comprobado

`qa/hito2.mjs` sube a **533 comprobaciones**, con un bloque nuevo que **simula la
pizarra siguiendo a la voz** con las funciones reales sobre las lecciones de
fracciones de los tres niveles: cada paso animado se escribe antes de contarse,
cada foco se ve mientras suena su frase, tras cada frase hay al menos 1 s de
pausa y al cerrar la pizarra se queda en el resultado. Comprueba también el
desglose del mismo ejercicio en todos los temas (sin revelar la respuesta en la
práctica), la vuelta a la clase, el servidor respondiendo al botón sin IA, las
notas proyectadas y la distributiva. `qa/navegador.mjs` sube a **73** y lo mide
en Chrome de verdad: mientras el tutor dice «…el número de ABAJO es el
denominador» ya está escrito; las notas se acumulan; la fracción de palabras
lleva su raya; el rótulo proyectado mide entre 26 px (Concepto, junto al
diagrama) y 33 px (Reglas) en letra de pizarra, nunca menos de 24; el recuadro
de los numeradores se sostiene más de un segundo; «No entendí este paso» no
cambia el ejercicio y la clase llega a la práctica con su pregunta; la tarjeta
no enseña el reparto mientras se anima, y el enunciado de la práctica no se
anima. La batería de Chrome se ejecutó completa, 73 de 73, contra la
**compilación de producción** (`npm run build` + `npm run start`). Las 13
baterías restantes, con el servidor local levantado —incluido el barrido de 200
sesiones y 1.800 turnos—: **0 fallos**. `tsc --noEmit` limpio.

Queda anotado, por transparencia: en esta máquina la clave de Gemini del `.env`
local no es válida, así que toda consulta a la IA cae en su respaldo —que es
justo el camino que esta revisión deja coherente—; y durante una de las
ejecuciones largas contra el servidor de desarrollo la base de datos remota
cortó la conexión (`ConnectionReset`) tras cientos de sesiones de prueba, lo que
detuvo esa ejecución a mitad. Repetida contra el servidor de producción,
terminó completa y limpia.

## 31. Revisión daa127d (2ª): fracción formal, cierre enmarcado, ejercicio fijo y visto sólo al final

Cinco puntos más sobre las capturas de `daa127d`. Se comprobaron uno a uno sobre
el código ya entregado en la ronda anterior (`36a49a7`) y los cinco seguían
siendo ciertos o lo eran en parte, así que se corrigen todos.

### 1. Fracciones: notación formal, sin barra inclinada

Bajo el gráfico circular aparecía «Numerador / Denominador: 1/4», con la barra
inclinada. Ahora es **una sola expresión vertical** compuesta por KaTeX:
*Numerador* sobre *Denominador* igual a *1* sobre *4*, cada fracción con su raya
horizontal y en estilo de bloque (`\dfrac`), de modo que ninguna baja a tamaño
de subíndice. Se destapa, como antes, cuando ya se han dicho las dos palabras,
usa la fracción que enseña el dibujo (3 de 8 se escribe 3 sobre 8) y aparece
también **al proyectar Concepto**, debajo del gráfico. La expresión se genera en
un solo sitio (`expresionFormalDeFraccion`, en `lib/leccion/notas.ts`), y la
pizarra y la proyección la componen con el mismo componente.

### 2. Ningún ejercicio queda inconcluso

«El último paso debe mostrar siempre el resultado final enmarcado con su
feedback de conclusión.» Se aplica a todos los temas, no sólo a las fracciones:

- **Un gesto nuevo en el contrato del paso: `resultado`.** Es el cierre del
  ejercicio: la línea con la respuesta final. La pizarra la **enmarca** —un
  rectángulo con aire alrededor de la respuesta, que no roza ninguna cifra— y le
  pone el visto verde; la pizarra clásica la muestra con el marco (`\boxed`) y el
  rótulo «✓ Resultado final». Un paso que opera y a la vez cierra (la derivada
  de un monomio, la diferencia de cuadrados) lleva la marca `final`: primero se
  recuadra la operación y después se enmarca su resultado.
- **Todos los ejemplos terminan en su cierre**, anunciado con «¡Y listo!
  Resultado final: …». En fracciones con denominadores distintos es la respuesta
  consolidada, `3/5 + 1/2 = 6/10 + 5/10 = (6 + 5)/10 = 11/10`; con el mismo
  denominador, `2/6 + 3/6 = 5/6` (o `… = 4/6 = 2/3` si se simplifica); en
  ecuaciones, `x = 5`; en aritmética, la cuenta igualada a su total; en
  derivadas y factorización, la línea del resultado.
- **«No entendí este paso» en la práctica llega también al final.** Antes se
  detenía en «6/10 + 5/10 = ?» para no darle al alumno la respuesta que tenía que
  escribir: era exactamente lo que se ve en la captura. Ahora el desglose llega
  al resultado enmarcado y, en vez de cerrar, le devuelve la palabra: «Ahora
  escríbelo tú en la casilla de respuesta para comprobarlo». Sus pasos se animan
  como los del ejemplo.
- **La práctica se cierra en cuanto queda resuelta**, acertada o con los tres
  intentos agotados. El reproductor avisa a la interfaz (`onExerciseResolved`)
  justo antes del feedback; la interfaz escribe la línea de cierre —comprobada:
  sumando, sustituyendo la x, derivando o multiplicando de vuelta— y el feedback
  la nombra: «¡Muy bien! Respuesta correcta. Resultado final: 11/10». Con los
  intentos agotados ya no se queda sin respuesta: «Mira la pizarra: el resultado
  final es 11/10». Mientras quedan intentos, sigue sin revelarse: sólo pistas del
  método.

### 3. Proyección: el ejercicio original, fijo arriba

Al proyectar «2(x + 3) = 16» sólo se veía la línea que se operaba. Ahora la
proyección lleva arriba, fijo, **el ejercicio original limpio** —tal como está en
la tarjeta, sin marcas— y debajo el paso activo del desarrollo, con la
distributiva y todo lo que sigue. Va con `position: sticky`, así que no se
pierde aunque el panel se desplace; no se repite cuando lo único proyectado es el
propio enunciado (la práctica, antes de contestar), y el lienzo del paso cede
algo de altura para que los dos quepan sin desplazarse.

### 4. El visto verde, sólo en la respuesta final

El visto que flotaba junto a la x de «2x + 6 = 16 − 6» era el del coeficiente:
esa escena, además de cancelar el 6, encendía el 2 con la marca de resultado y
terminaba en «⇒ x = 5», adelantando el paso siguiente. Ahora:

- **Un paso, una operación.** Sobre `2x + 6 = 16` sólo se quitan el +6 y el −6,
  cada uno con su tachado; el 2 no se marca ni se colorea. Dividir entre 2 va en
  **su** línea, `2x = 10`, con una caja y el rótulo «÷ 2».
- **El visto es sólo para la respuesta final.** Un resultado intermedio —lo que
  queda al amplificar, al repartir, al sumar numeradores— lleva el doble
  subrayado y nada más. Señalar un coeficiente o un exponente es una caja, no un
  resultado.
- La pizarra reconoce además la **locución exacta** que el motor asigna a cada
  paso: si el tutor dice esa frase, ese paso gana a cualquier parecido. Así, la
  regla de la potencia ya no se queda en el enunciado «x²» y la pizarra llega a
  enmarcar el resultado de la derivada.

### 5. Escala tipográfica en proyección

La captura es de `daa127d`, anterior a las notas de pizarra de la ronda pasada.
Con ellas, «Propiedad uniforme de la suma: lo mismo a los dos lados» ya se
proyectaba a `text-2xl`; ahora una nota sola en su lienzo sube a **`text-3xl`
como mínimo** (crece con la pantalla hasta 3 rem), centrada, en blanco sobre la
pizarra oscura y con trazo más grueso. Lo que el tutor explica bajo cada paso
proyectado no baja de `text-2xl`.

### Un fallo más, encontrado al probarlo

La batería de Chrome cazó uno que no estaba en las capturas: con el desglose de
la práctica llegando ya a su cierre, la pregunta que se le devuelve al alumno
iba justo detrás de esa línea, y el aula la tomaba por el enunciado de la
pregunta —«la última línea escrita antes de preguntar»—: se llevaba la tarjeta y
vaciaba el desarrollo recién explicado. Ahora un paso etiquetado nunca pasa por
enunciado. Y mientras el tutor **pregunta**, la pizarra animada deja de seguir a
la voz: «¿Cuánto es 1/7 + 5/7?» repite las cifras del primer paso y la
rebobinaba hasta él, escondiendo el desarrollo resuelto justo cuando el alumno
tenía que contestar.

### Comprobado

`qa/hito2.mjs` sube a **577 comprobaciones**, con un bloque nuevo para esta
revisión: la definición formal (una sola expresión, dos rayas de fracción,
ninguna barra); el cierre enmarcado en el ejemplo de `3/5 + 1/2`; que en **todos
los motores** —suma, resta, multiplicación, división, fracciones en tres
niveles, ecuaciones, derivadas y factorización— la pizarra esté en la respuesta
enmarcada al sonar «Resultado final»; que el desglose de la práctica llegue al
final en fracciones, ecuaciones, aritmética y derivadas; el cierre comprobado de
once prácticas distintas; el **reproductor real** cerrando el ejercicio antes
del feedback, acertando y con los tres intentos agotados (sin revelar nada
mientras quedan intentos); que sobre `2x + 6 = 16` sólo haya el tachado del +6 y
el −6, y que en toda la lección de `2(x + 3) = 16` la única respuesta final sea
`x = 5`. `qa/navegador.mjs` sube a **90** y lo mide en Chrome de verdad,
proyectando: la fracción formal bajo el gráfico; **ningún visto** en ningún paso
intermedio; al decir «Resultado final», marco y visto sobre la respuesta; el
ejercicio original fijo arriba mientras abajo cambia el paso —también en
`2(x + 3) = 16`, con la distributiva—; la práctica fallada tres veces termina
enmarcada y con su feedback de conclusión; la línea de cierre de la pizarra
clásica, con su marco visible y su rótulo; y «Propiedad uniforme de la suma»
proyectada a 38 px, centrada. Todo contra la **compilación de producción**. Las
demás baterías, con el servidor levantado —incluido el barrido de 200 sesiones y
1.800 turnos—: **0 fallos**. `tsc --noEmit` y `npm run build` limpios.

## 32. Informe técnico del cliente: los cinco subprocesos universales y las 16 observaciones, verificadas

El cliente envió un informe formal («Informe técnico y funcional de arquitectura
y diseño pedagógico») con cinco subprocesos que deben gobernar toda la
plataforma y dieciséis observaciones concretas, y pidió **verificarlas antes de
darlas por levantadas**. Se implementan como reglas generales —ninguna rama por
ejercicio— y se verifican en Chrome con una batería nueva que mide en pantalla
lo que el informe exige.

### SUB-TIP-01 · Una fuente por rol

Cada elemento lleva su discriminador: `TUTOR_DIALOG` (lo que dice el tutor:
subtítulos, el pie de cada paso, la retroalimentación, el estado del avatar),
`BOARD_LABEL` (lo escrito en la pizarra: notas, «Ejercicio:», «MCM(2, 3):»,
rótulos de las marcas, los del dibujo) y `MATH_EXPRESSION` (KaTeX). Los roles
viven en `lib/leccion/roles.ts`; las familias, en Tailwind (`font-tutor`,
`font-pizarra`, `font-formula`) y se aplican por `[data-rol]` en `globals.css`,
nunca a mano en un componente. Segoe Print para el tutor, Chalkboard SE para la
pizarra (en Windows, que no la trae, su equivalente Comic Sans MS), KaTeX para
las fórmulas. Lo que dice el tutor compone además sus fórmulas enteras:
«2(x + 3) = 16» es UNA fórmula, no «2(» de prosa, «x + 3» y «) = 16».

### SUB-PIZ-02 · La pizarra en dos ambientes

`Pizarra` es ahora la pizarra de la clase entera: «Ejercicio:» y el enunciado
fijos arriba, y debajo dos ambientes al 50 %. Cada línea del desarrollo es un
paso con su propia pizarra animada y su estado —activa, completada, pendiente—,
así que **nada se borra**: al terminar, los dos ambientes enseñan el
procedimiento entero. El reparto lo decide `repartirEnAmbientes`
(`lib/leccion/ambientes.ts`), una regla monótona que no mira lo que viene
después: el planteamiento y los pasos que repiten su primer gesto, al Ambiente
1; los cálculos auxiliares (el MCM, lo que sale de cada columna) y el cierre, al
Ambiente 2; el primer paso con otro gesto abre el Ambiente 2 y desde ahí todo
sigue en él. El cierre es el ejercicio y su respuesta en cápsula —«1/2 + 1/3 =
[5/6] ✓»—, y una suma o una resta se cierra **en columna**, con el total
enmarcado. Un paso anterior que ya llegaba a la respuesta (la cuenta animada)
la deja subrayada: se enmarca una sola vez.

### SUB-PRJ-03 · Proyección espejo

Proyectar es poner en pantalla completa **el mismo panel**: no hay una segunda
vista que pueda enseñar otra cosa. Sin textos de interfaz, fondo `slate-950`,
fórmulas de 48 px como mínimo (también las de las notas), notas y rótulos de 24
px como mínimo y 24 px entre notas.

### SUB-NOT-04 · Anotaciones que no tapan

`colocarEtiqueta` (`lib/leccion/etiquetas.ts`) prueba los cuatro lados de cada
marca contra las cifras MEDIDAS en el navegador y se queda en el primero que
deja 8 px de aire; la caja de la letra del rótulo se mide también (la de
Windows tiene ascendentes muy largos) y el rótulo no sale de su ambiente.
«llevo 1» va estrictamente encima de su llevada (`anclaEtiqueta`). La cápsula de
la respuesta —esquinas redondeadas, borde esmeralda 500 de 2 px, fondo al 10 %,
visto a la derecha— recorta su aire contra lo que tiene al lado. La
distributiva es la escuadra que dibujó el cliente, con la punta de tamaño fijo
(`markerUnits="userSpaceOnUse"`) y el «× 2» debajo.

### SUB-MTH-05 · Notación formal estricta

`planoALatex` compone `(a)/(b)`, `n/(b)` y `d/dx` como fracciones y `*` como
`×`; «234 [sumando] + 178 [sumando] = 412 [suma o total]» va en columna con cada
nombre; la práctica de suma y resta, en columna con el «?» bajo la raya; y
tampoco la interfaz escribe barras («línea 1 de 2»).

### Fallos encontrados al verificar

La batería nueva cazó, además, estos, ya corregidos: al **reanudar tras una
pausa** durante una ayuda («Más difícil», «No entendí»), el reproductor
reescribía la pizarra sin haberla podido vaciar y **duplicaba el desarrollo**
(ahora vuelve a la foto de la pizarra con la que empezó la ayuda,
`baseDeAyuda`); **«Más difícil» pulsado en Concepto o en Reglas** traía un
ejercicio que se quedaba en esa fase, pintado como notas sueltas, sin
«Ejercicio:» ni animación (ahora abre antes la fase del ejemplo); la solución de
una ecuación larga no cabía en su ambiente (va en
su propio renglón, alineada por el igual); la cápsula podía rozar el «=»; al
proyectar, «(suma o total)» se salía por la derecha; KaTeX mete espacios de
anchura cero (`vlist-s`) que se contaban como cifras; y el ámbar del dibujo daba
3,2:1 sobre blanco (ahora ámbar 700, 5:1).

### Comprobado

`qa/observaciones.mjs` (nuevo) da cuatro clases enteras en Chrome —aritmética
básica y avanzada con llevadas, fracciones con MCM y ecuaciones con
distributiva, hasta el nivel difícil—, mide la pizarra de continuo y, en cada
momento clave, pausa, fotografía la pantalla y la proyección y las compara:
**23.176 comprobaciones y 0 fallos**, con 84 capturas de evidencia: en
proyección, fórmulas de 48 px, notas de 25,6 px y rótulos de 26 px como mínimo;
ningún rótulo a menos de 9,5 px de una cifra; contraste del dibujo de 13,6:1
proyectado y 4,7:1 en pantalla; y ni una «/» ni un «*» en el texto visible. Con
`QA_VOZ_REAL=1` corre con el **motor de voz real** del sistema: una clase de
fracciones entera, hasta el nivel difícil, con pausas y reanudaciones, **21.035
comprobaciones y 0 fallos** (en esta máquina sólo hay voces de Windows en
inglés: se usa una, declarada es-ES; lo que se mide es el ritmo real de la voz,
no la pronunciación). `qa/hito2.mjs`: **597** (bloque nuevo con los cinco
subprocesos y las comprobaciones de fuente reescritas a la nueva pizarra);
`qa/leccion.mjs`: **825**; `qa/navegador.mjs`: **86** (sus comprobaciones de la
pizarra antigua, reescritas a la de dos ambientes: la escuadra, la cápsula del
cierre, la fracción de palabras, las fuentes por rol); las demás baterías
—diagnóstico 416, paso 1 72, hito 1 124, diagnóstico por nivel 94, qa 1.462,
sesiones 126, aceptación 24, matemáticas 100, frontend 10 y el barrido de 200
sesiones y 1.800 turnos—: **0 fallos**. `tsc --noEmit` y `npm run build`,
limpios.

## 33. Segunda ronda del cliente: las ayudas en la práctica, la fracción vertical y la tarjeta proyectada

Cuatro observaciones para cerrar el hito, con sus capturas (1e–4e). Las cuatro se
resuelven como reglas generales —ningún caso por ejercicio— y se verifican en
Chrome con la batería del informe, ampliada.

### 1. «Explicar regla» anima el ejercicio (1e)

En la práctica de 678 + 145 el avatar contaba «Ahora sumamos las decenas: 7 + 4,
más el 1 que nos llevamos…» mientras la pizarra seguía quieta en el «?». Dos
causas: «Explicar regla» se redactaba como prosa del modelo, sin pasos que
animar, y el planteamiento de una práctica es estático por diseño (animarlo es
hacerle al alumno su ejercicio). Ahora, con un ejercicio en la tarjeta, las dos
ayudas —«No entendí este paso» y «Explicar regla»— lo desglosan con el motor
determinista (`queryCore.js`: `reglaSobreElEjercicio`); «Explicar regla» abre
nombrando la regla y contándola («La regla que estamos aplicando es «Suma con
llevada». …») y sigue sobre el ejercicio. Mientras el tutor lo resuelve porque
el alumno lo pidió, su planteamiento se anima como el de un ejemplo
(`enunciadoExplicado` en el aula y en la pizarra): la columna que se nombra se
enciende y cada cifra del resultado se escribe cuando la voz llega a ella. Sin
ejercicio en la tarjeta (Concepto, Reglas) la regla la sigue explicando el
modelo.

### 2. La práctica no pregunta lo que ya está resuelto (2e)

Tras explicar «3/5 + 1/2», la pizarra enseñaba el desarrollo entero con el 11/10
y la casilla volvía a preguntar «¿Cuánto es 3/5 + 1/2?». Ahora el desglose llega
a su resultado enmarcado —ningún ejercicio queda inconcluso— y termina con «Ahora
te toca a ti con uno nuevo, parecido a este» y un ejercicio NUEVO del mismo tipo
(`practicaParecida` en `lsgPrompt.js`: sumas y restas con el mismo número de
cifras, fracciones con igual o distinto denominador según el original,
ecuaciones, derivadas y factorizaciones). El enunciado nuevo se lleva la tarjeta
y deja la pizarra limpia; su pregunta sustituye a la pendiente
(`preguntaFinal`, sin un segundo «Ahora inténtalo tú»); desde ese momento es el
que se corrige; y lo que quedaba de la fase tras la pregunta vieja sigue
después de la nueva (`trasLaPrimeraPregunta`). Con la práctica ya contestada no
hay ejercicio nuevo: sólo se explica.

Encontrado al hacerlo: la primera línea que escribe un desglose se anotaba como
enunciado de la fase («MCM(5, 2): 5 × 2 = 10»), y a la segunda pulsación de una
ayuda se habría llevado la tarjeta. La fase conserva ahora su ejercicio —o el
nuevo que cierra el desglose—.

### 3. Fracción vertical también con letras (4e)

La propiedad de amplificación salía «a/b = (a×k)/(b×k)»: `planoALatex` pasaba a
raya los paréntesis y los números, pero no una letra suelta. Ahora compone
`\frac{a}{b} = \frac{a \times k}{b \times k}`, y lo mismo «x/2», «2x/3» o
«x²/4»; «±» pasa a `\pm`. Se respeta lo que no es una fracción de letras
(«km/h», «y/o», `d/dx`). Y el modelo recibe la instrucción de escribir entre
paréntesis cualquier numerador o denominador compuesto.

### 4. La tarjeta de la regla, en proporción con el panel (3e)

Proyectada, la tarjeta de «Fracciones equivalentes» heredaba el tamaño de las
fórmulas sueltas —hasta 64 px— y, en modo display, sus fracciones doblaban en
altura a las notas del Ambiente 2. Ahora su fórmula va al tamaño exacto de la de
una nota (48 px, el mínimo de aula), el nombre al del texto de las notas, y con
el mismo aire que el lienzo deja a los lados.

### Comprobado

`qa/observaciones.mjs` crece con las ayudas: da **cinco clases enteras** en Chrome
—aritmética básica y avanzada, fracciones hasta el nivel difícil, fracciones a
**1920 × 1080** y ecuaciones— y, en cada práctica, pulsa «Explicar regla» y «No
entendí este paso», sigue la explicación muestra a muestra y comprueba que la
columna se enciende, que cada cifra del resultado sale con su locución —ni antes
ni después—, que después la clase sigue con un ejercicio nuevo y la pizarra
limpia, y que ese ejercicio se corrige y se cierra enmarcado: **61.878
comprobaciones y 0 fallos**, con 126 capturas de evidencia. Con el **motor de voz
real** del sistema, el caso exacto de la captura —678 + 145 con las dos
ayudas—: **30.727 comprobaciones y 0 fallos**. `qa/hito2.mjs`: **639** (bloque
nuevo A00h: el desglose con la regla, el ejercicio parecido de cada motor, la
vuelta con la pregunta nueva, la fracción de letras y la escala de la tarjeta);
`qa/leccion.mjs`: **825**; `qa/navegador.mjs`: **87**; las demás baterías
—diagnóstico 416, paso 1 72, hito 1 124, diagnóstico por nivel 94, qa 1.462,
sesiones 126, aceptación 24, matemáticas 100, frontend 10 y el barrido de 200
sesiones y 1.800 turnos—: **0 fallos**. `tsc --noEmit` y `npm run build`,
limpios.

## 34. Tercera ronda del cliente: rigor en la cancelación, la multiplicación a la vista, notas sin desfase y los dos ambientes

Cuatro observaciones más, con sus capturas (a1–a4), sobre lo ya desplegado. Como
siempre, resueltas como reglas generales y verificadas en Chrome.

### 1. La cancelación ocurre DENTRO de su miembro (a4)

La pizarra escribía «2x + 6 = 16 − 6» y tachaba el +6 de la izquierda contra el
−6 de la derecha, cruzando el signo igual. El cliente, sin matices: «es
matemáticamente incorrecto». Ahora la propiedad uniforme se aplica de verdad —el
−6 se escribe en LOS DOS miembros— y el tachado va sólo sobre el par de opuestos
del miembro en el que estaba:

```
2x + 6 − 6 = 16 − 6        (tachados el +6 y el −6, los dos a la izquierda)
        2x = 10            (la resta del miembro derecho, en la línea siguiente)
```

A la derecha no se tacha nada: queda la resta simple, que es la que da el 10.
Las dos marcas (`pz-cancela-termino` y `pz-cancela-opuesto`) viven en el mismo
miembro, así que ninguna caja cruza el igual. La locución lo cuenta igual:
«Quitamos 6 en los dos lados: a la izquierda se cancela +6 con −6, y a la
derecha 16 menos 6 son 10» —sin la «y −6» de antes, que la composición de
fórmulas dentro de la frase leía como expresión y escribía en cursiva
matemática—.

### 2. Lo que la voz multiplica, se ve multiplicado (a2)

En Reglas de fracciones el tutor decía «si multiplicas arriba y abajo de 1/2 por
2, sale 2/4» mientras la pizarra escribía sólo el resultado, «2/4 = 1/2». Ahora
se escribe el paso entero, con el factor a la vista y en fracción vertical:
`1/2 = (1 × 2)/(2 × 2) = 2/4`.

### 3. Las notas del Ambiente 2, al paso de la voz (a1)

El motor de aritmética hablaba primero y escribía después, así que la nota de
las unidades aparecía cuando la voz ya iba por las decenas —el desfase que
fotografió el cliente en 234 + 178—. Ahora cada línea se escribe al EMPEZAR la
frase que la explica, como ya hacían el concepto y el desglose: mientras se
suman las unidades, la nota de la derecha explica las unidades.

### 4. Los dos ambientes, aprovechados (a3)

En 1/2 + 1/3, el Ambiente 1 se quedaba con las dos conversiones y el Ambiente 2
con el MCM y un hueco. La regla de reparto cambia en un punto: **un solo paso
acompaña al planteamiento** en el Ambiente 1; el siguiente abre el Ambiente 2,
aunque repita el mismo gesto. Así queda la primera conversión a la izquierda y,
a la derecha, el MCM, la segunda conversión, la suma y la respuesta enmarcada
—que es el reparto que dibujó el cliente—. Sigue siendo monótona: ninguna línea
escrita cambia de lado cuando llega la siguiente.

Con el Ambiente 2 más cargado, proyectar pedía sitio: en proyección se recorta
lo que no es contenido —el relleno del panel, la fila del botón de salir, los
mandos y los márgenes que KaTeX pone alrededor de cada fórmula— y el factor por
anchura de las fórmulas baja de 3,6vw a 3,4vw, que en una pantalla de 1366
deja las fórmulas en su suelo de 48 px. Los 24 px entre pasos, que pidió el
informe, no se tocan. Con eso, los cuatro pasos de un ambiente caben en una
pantalla y «−x + 8 − 8 = −1 − 8» cabe entera en su mitad.

### Comprobado

`qa/observaciones.mjs` mide ahora, en cada muestra de las cinco clases, lo que
esta ronda exige: dónde cae cada marca de cancelación respecto al signo igual
—y que lo tachado sea siempre el término y su opuesto—, qué nota está escrita
mientras suena cada columna, que la pizarra enseñe la multiplicación cuando la
voz la dice, y en qué ambiente entra cada paso. **62.721 comprobaciones y 0
fallos**, con 126 capturas. Con el **motor de voz real** del sistema, la clase
de aritmética entera —la de las notas y la cuenta en columna—: **30.715
comprobaciones y 0 fallos**, que es la prueba de que la nota y la columna van al
paso de la voz de verdad y no de un temporizador. `qa/hito2.mjs`: **652**
(bloque nuevo A00g: la cancelación dentro de su miembro en todo el catálogo de
ecuaciones, la equivalencia escrita con su factor y las notas sin desfase en los
cuatro motores de aritmética); `qa/leccion.mjs`: **825**; `qa/navegador.mjs`:
**87**; las demás baterías —diagnóstico 416, paso 1 72, hito 1 124, diagnóstico
por nivel 94, qa 1.462, sesiones 126, aceptación 24, matemáticas 100, frontend
10 y el barrido de 200 sesiones y 1.800 turnos—: **0 fallos**. `tsc --noEmit` y
`npm run build`, limpios.

## 35. Rigor de cálculo: cuatro errores matemáticos, y la batería que los habría cazado antes

El cliente señaló errores de cálculo. Tenía razón: había cuatro, y ninguna de
las baterías anteriores podía verlos, porque todas comprobaban la FORMA de la
lección —sus fases, sus marcas, sus tamaños— y la calificación de un puñado de
casos, pero ninguna recalculaba, una por una, las afirmaciones matemáticas que
el alumno ve y oye.

### 1. Una respuesta CORRECTA calificada como error (el rótulo del ejercicio)

La tanda de práctica escribe en la pizarra `Ejercicio 1:  5x`, y esa línea es la
que viaja a `/api/practica/corregir`. El `1:` del rótulo se pegaba al monomio
—`1:  5x` se leía como `15x`— y el corrector esperaba 15 donde la derivada vale
5: el alumno respondía bien, el tutor cantaba «¡Correcto!» y el servidor lo
calificaba como error en la misma pantalla. Ahora `resolverEjercicio` quita el
rótulo antes de resolver: el rótulo numera el ejercicio, no forma parte de él.

### 2. Una ecuación resuelta como si fuera una cuenta suelta

`computeAnswer("¿Cuánto vale x en x/2 + 5 = 12?")` devolvía **7**. La respuesta
es 14: dentro de la ecuación hay un `2 + 5`, y el buscador de expresiones
aritméticas lo evaluaba. Lo mismo con `x/3 + 7 = 12` (decía 10, es 15) y con
`5x/2 - 3 = 2x + 6` (decía −1, es 18). Ahora una ecuación se resuelve con el
solucionador exacto —que sabe quitar denominadores— antes de buscar ninguna
cuenta suelta; y si hay incógnita y no se sabe resolver, se devuelve `null`:
inventar un número es peor que no contestar.

### 3. La pizarra decía «quitamos» mientras sumaba

En `2x − 6 = 16` el pie decía «Quitamos 6 en los dos lados… y a la derecha 16
más 6 son 22». Se está SUMANDO 6. Ahora el verbo lo decide el signo del término:
resta con `+6`, suma con `−6`.

### 4. El coeficiente de −3x⁴ no es 3

Al derivar término a término, la pizarra decía «Miramos el término 2x elevado a
5» —que se lee (2x)⁵, y el coeficiente multiplica, no se eleva— y «Su
coeficiente es 3» en el término −3x⁴, cuyo coeficiente es −3: justo el signo que
baja con la regla de la potencia hasta el −12x³ del resultado. Ahora se dice «el
término 2 por x elevado a 5» y «su coeficiente es menos 3».

### La batería que faltaba: `qa/rigor.mjs`

Verifica CADA afirmación matemática con aritmética racional exacta y álgebra de
polinomios **escritas en la propia batería**: si el motor y el verificador
compartieran código, compartirían el error. Recorre 768 lecciones (8 motores × 4
niveles × 8 vueltas del catálogo × 3 formas), los 640 desgloses de los 388
ejercicios del banco, 224 lecciones de problemas aplicados y tandas de práctica,
las 18 preguntas del diagnóstico y el catálogo de reglas. De cada una comprueba:

- cada igualdad escrita en la pizarra, y cada eslabón de sus cadenas;
- cada cuenta dicha por el tutor («4 más 8 son 12», «16 menos 6 son 10»);
- **lo que la animación compone por su cuenta**: la compensación del despeje, el
  reparto del paréntesis, la amplificación, la simplificación y la cuenta en
  columna dibujada, fila a fila;
- **cada pie de la pizarra**, contra la línea que está marcando: el factor que
  dice multiplicar, el coeficiente y el exponente de cada término con su signo,
  la cifra que escribe y la que se lleva, el préstamo de la resta, la operación
  que dice hacer en el despeje, la solución que canta;
- que **cada línea de un despeje conserva la solución** de la ecuación de la que
  viene —es lo único que autoriza a escribirla debajo—;
- la respuesta esperada de cada pregunta, recalculada, más el veredicto del
  corrector sobre ella y sobre las formas equivalentes de escribirla;
- las identidades del catálogo de reglas, con sustituciones numéricas.

Y se comprueba a sí misma: antes de recorrer nada se le pasan **30 errores
conocidos** —los cuatro de esta ronda entre ellos— y se exige que los cace
todos. Una batería que no caza nada da siempre «0 fallos», que es justo lo que
parece un éxito. Además cuenta cuántas veces dispara cada comprobación y falla
si alguna no llegó a usarse nunca.

### Comprobado

`qa/rigor.mjs` (nuevo, en `npm test`): **58.677 afirmaciones matemáticas
recalculadas, 0 incorrectas**, con sus 30 autocomprobaciones cazadas y las 16
comprobaciones especializadas disparando todas (17 de las 18 preguntas del
diagnóstico recalculadas —la de `ln(x)` queda fuera de un motor polinómico—, 12
identidades del catálogo de reglas y 32 pistas de ayuda revisadas). `qa/hito2.mjs`: **666** (bloque
nuevo A00f con las regresiones de los cuatro errores); `qa/qa.mjs`: **1.465**;
`qa/leccion.mjs`: **825**; `qa/navegador.mjs`: **87**; `qa/observaciones.mjs`
(Chrome, cinco clases): **62.203 comprobaciones y 0 fallos**, 126 capturas; las demás baterías
—diagnóstico 416, paso 1 72, hito 1 124, diagnóstico por nivel 94, sesiones 126,
aceptación 24, matemáticas 100, frontend 10 y el barrido de 200 sesiones y 1.800
turnos—: **0 fallos**. `tsc --noEmit` y `npm run build`, limpios.

## 36. Revisión final: dos temas que ninguna batería había abierto, y lo que escondían

La pregunta era si quedaba algo. Quedaba, y estaba donde no se había mirado: de
los cinco motores que un alumno puede abrir, la batería de Chrome daba clase en
tres —aritmética, fracciones y ecuaciones—. **Derivadas y Factorización no las
había abierto nunca nadie**, y ahí vivía, entre otras cosas, la escena de
polinomio que se acababa de corregir. Ahora son dos clases más de la batería
(siete en total), con sus ayudas y su proyección. Al abrirlas apareció esto:

### 1. La tarjeta de la regla se cortaba contra el borde (Derivadas)

«Regla de la potencia» trae dos ejemplos —`d/dx[x³] = 3x²` y `d/dx[x⁵] = 5x⁴`— y
a tamaño de aula no caben en media pizarra: la tarjeta los cortaba por la mitad
y dejaba un «d/dx» suelto colgando del borde. Siete fórmulas del catálogo pasan
del ancho disponible.

**Lo que se hace ahora** (`lib/leccion/ajuste.ts`): la fórmula se parte en
renglones por donde una fórmula se puede partir —primero por el separador entre
ejemplos, luego por el signo de relación, nunca dentro de unas llaves—, y los
renglones van arrimados a la izquierda, como se parte una cuenta larga en una
pizarra de verdad. Si aun así no cabe —«a² − b² = (a − b)(a + b)» no tiene un
segundo igual por el que partir—, se encoge lo justo y nunca por debajo del
80 %: una tarjeta un poco más pequeña se lee; una tarjeta cortada, no.

### 2. La respuesta enmarcada se salía de la pizarra (Factorización)

El cierre «x² − 1 = (x − 1)(x + 1)», con su cápsula y su visto, se salía por el
borde derecho en proyección: la cápsula se pinta POR ENCIMA de la fórmula, así
que la caja no se enteraba de que su contenido ya no cabía. Ahora la pizarra
animada mide hasta dónde llega de verdad lo compuesto —contra el borde de su
ambiente, que es lo que se ve— y parte la línea en dos renglones. Y vuelve a
medirlo cuando cargan las fuentes de KaTeX y cuando se entra o se sale de
proyección, que es cuando cambia el tamaño de la letra.

### 3. La etiqueta de la regla de la potencia nombraba un 1 que no está escrito

Sobre «x²» la etiqueta decía «1 × 2 = 2»: en «x²» no hay ningún 1 escrito que
multiplicar, y además la etiqueta quedaba a 6,5 px de una cifra (el informe
exige 8). Ahora, sin coeficiente a la vista, la etiqueta es el gesto —«× 2»—,
como la de una amplificación; con coeficiente escrito se sigue viendo la cuenta
entera, «2 × 3 = 6».

### 4. «2 · 1x¹⁻¹ = 2»

El paso que enseña la regla aplicada escribía, para 2x, «2 · 1x¹⁻¹ = 2». Es
cierto, pero se lee mal: escribe un coeficiente 1 que no está en el término y
deja el exponente sin resolver. Ahora, con exponente 1, se escribe «2 · 1 = 2»,
y en «x» a secas no se escribe paso intermedio: su derivada es 1 y no hay nada
que enseñar en medio. Con exponente mayor no cambia nada: «3 · 4x⁴⁻¹ = 12x³».

### Y la batería de rigor, contada honestamente

`qa/rigor.mjs` decía «58.677 afirmaciones comprobadas». No era verdad: sumaba
también las frases que no dicen ninguna matemática. Ahora **sólo cuenta lo que
de verdad juzga**: 31.294 afirmaciones. El número es menor y es el bueno; un
número inflado es justo lo que hace que un «0 fallos» no signifique nada.

### Comprobado

`qa/observaciones.mjs`, ahora con **siete clases** (aritmética básica y
avanzada, fracciones, fracciones a 1920 × 1080, ecuaciones, **derivadas** y
**factorización**), cada una con sus dos ayudas en la práctica: **80.866 comprobaciones y 0 fallos**, con 166 capturas. Con el
**motor de voz real** del sistema, la clase de derivadas entera —la de los
términos y sus coeficientes—: **28.695 comprobaciones y 0 fallos**. La
batería de rigor: **31.294 afirmaciones matemáticas recalculadas, 0
incorrectas**, con sus 29 autocomprobaciones cazadas. `qa/hito2.mjs`: **674**
(bloque nuevo A00e con la partición de fórmulas); `qa/qa.mjs`: **1.465**;
`qa/leccion.mjs`: **825**; `qa/navegador.mjs`: **87**; las demás baterías
—diagnóstico 416, paso 1 72, hito 1 124, diagnóstico por nivel 94, sesiones 126,
aceptación 24, matemáticas 100, frontend 10 y el barrido de 200 sesiones y 1.800
turnos—: **0 fallos**. `tsc --noEmit` y `npm run build`, limpios.


## 37. Cuarta ronda del cliente: la pizarra deja de adelantarse, el tachado espera a la voz, se van las barras y la voz se puede volver neuronal

Cuatro puntos, con sus capturas. Van uno a uno.

### 1. La pizarra escribía pasos que el tutor todavía no había explicado

En la captura, el Ambiente 2 tenía a la vez las tres ecuaciones del ejercicio
—`2x + 8 = 3x − 1`, `−x + 8 = −1`, `−x = −9`—: la pasada, la de ahora y la que
aún no ha llegado, todas encima, con varias barras de desplazamiento para que
cupieran. Al ir y venir con los botones de paso, se acumulaba todo.

La pizarra repartía en los dos ambientes **todos** los elementos del guion y
luego los pintaba en tres estados —completada, activa, pendiente—. Los
pendientes eran, literalmente, el final del ejercicio escrito antes de tiempo.

**Lo que se hace ahora** (`components/leccion/pizarra.tsx`): se filtra antes de
repartir. Lo que sigue pendiente no se pinta —ni en el Ambiente 1 ni en el 2—,
así que en el paso 1 sólo está la distribución inicial y el segundo ambiente
está limpio; y el marco de cierre se calcula sobre lo visible, no sobre la lista
entera. Cuando la clase termina sí se enseña el ejercicio completo, que es el
repaso: para eso la pizarra declara `data-terminada`, y la batería distingue
«todavía no explicado» de «clase terminada».

### 2. El tachado rojo aparecía antes de que el avatar lo explicara

En `2(x + 3) = 16 → 2x + 6 − 6 = 16 − 6` los tachados estaban puestos desde el
segundo cero. La escena tenía **un solo foco** que hacía dos cosas a la vez:
destapar la resta y tacharla.

**Ahora el paso se cuenta en dos tiempos**, que es lo que pidió el cliente:

1. se proyecta la operación uniforme completa, `2x + 6 − 6 = 16 − 6`, **sin
   tachar nada** —una caja por miembro, ninguna cruza el igual—, mientras la voz
   dice «restamos 6 en los dos lados»;
2. y sólo cuando la voz dice **«a la izquierda se cancela +6 con −6, y a la
   derecha 16 menos 6 son 10»** se dispara el aspa roja sobre los dos términos
   opuestos.

Para que el audio mande de verdad, el motor dice esa segunda frase —`locucionCancelacion`
en `src/lsgPrompt.js`, tanto en la lección como en el desglose de «no entiendo»—
y la pizarra la reconoce como la suya: la batería comprueba que la frase del
motor y la narración del foco son **la misma, palabra por palabra**, porque si
se separan el tachado volvería a llegar a destiempo.

### 3. Las barras grises de desplazamiento

Seguían saliendo bajo la suma en columna y bajo la caja de resultado. En una
pizarra no hay barras de desplazamiento; y desde que las fórmulas que no caben
se parten en renglones o se encogen (§36), tampoco hacen falta. Se esconde el
raíl nativo (`scrollbar-width: none` y `::-webkit-scrollbar { display: none }`)
conservando el arrastre con el dedo para móviles muy estrechos, y en proyección
se cierra del todo el desbordamiento horizontal. La batería de Chrome mide ahora
cada caja de la pizarra y falla si alguna desborda a lo ancho con el raíl
abierto, o si ya le está robando alto a su caja —que es lo que se ve en la foto—.

### 4. La tipografía del avatar, y la voz

**La letra.** El bloque donde habla el avatar iba en manuscrita (Segoe Print).
Se lee bien en un rótulo de tres palabras y mal en un párrafo de cuarenta, y el
cliente lo dijo así: «genera fatiga visual en párrafos largos». Ahora la voz del
tutor va en **una sans limpia** (Inter, y la del sistema si no está), a cuerpo
de lectura y con el renglón holgado. La manuscrita queda **reservada al lienzo
de la pizarra**: las notas y los rótulos breves, que es donde imita la tiza. Los
tres roles se siguen viendo distintos —sans para la voz, manuscrita para la
pizarra, KaTeX para las fórmulas— y la fuente la sigue poniendo el ROL, nunca un
componente a mano (SUB-TIP-01).

**La voz.** El audio venía de `window.speechSynthesis`, que suena metálico. Se
añade `app/api/voz` (+ `lib/voz/config.ts`): recibe una frase y devuelve un MP3
sintetizado con **voz neuronal en español**, con **Google Cloud Text-to-Speech
(Neural2)** o **ElevenLabs**, el que tenga clave —`GOOGLE_TTS_API_KEY` o
`ELEVENLABS_API_KEY`, documentadas en `.env.example`—. La clave vive sólo en el
servidor: el navegador pide el audio a la aplicación y nunca la ve. Las frases
se guardan en memoria, así que una clase repetida no se paga dos veces.

Lo importante es que **la sincronía no cambia**: el aviso de arranque que
enciende el foco de la pizarra sigue siendo el momento REAL en que empieza a
sonar la frase (antes, el `onstart` de la locución; ahora, el `playing` del
audio). Y hay red de seguridad en los tres sitios donde puede fallar: sin clave
configurada el endpoint responde 503 y el navegador se queda con su voz de
siempre; si el proveedor se cae a media frase, la frase **se termina por donde
iba**, sin repetir lo ya dicho; y si el navegador no deja sonar un audio sin
gesto del usuario, se vuelve a la voz del sistema. La clase no se queda muda por
esto en ningún caso.

> Para que suene la voz neuronal hace falta que el cliente contrate una de las
> dos claves y la ponga en el servidor. Sin ella, todo lo demás de esta ronda
> funciona igual: la aplicación arranca, habla con la voz del navegador y lo
> dice en la interfaz («voz del sistema» / «voz neuronal»).

### Una comprobación que cambió de significado

`R2-01` («los pasos se escriben uno tras otro, no todos de golpe») contaba
cuántas líneas se veían en cada fotograma y exigía **tres** conteos distintos.
Con la corrección 1 eso dejó de medir lo que decía: antes contaba las líneas
**escritas** —incluidas las que aún no se habían explicado, que es justo lo que
el cliente pidió quitar— y ahora cuenta las **explicadas**. En Factorización,
donde el guion escribe dos líneas seguidas mientras la voz sigue en la anterior,
la pizarra las destapa casi a la vez y el conteo va `1 → 3`: no es que aparezcan
de golpe, es que la voz las alcanza juntas.

La comprobación ahora exige que la pizarra **empiece con menos de lo que acaba y
vaya creciendo**, que es lo que el cliente fotografió al revés; y lo que ya no
se puede colar —una línea pintada antes de explicarse— lo cierra `R4-01`, con
5.744 comprobaciones en las siete clases. Queda dicho aquí porque relajar una
comprobación sin contarlo es la forma más fácil de que un «0 fallos» no
signifique nada.

### Comprobado

`qa/observaciones.mjs` con las siete clases (aritmética básica y avanzada,
fracciones, fracciones a 1920 × 1080, ecuaciones, derivadas y factorización):
**94.972 comprobaciones y 0 fallos**, con 166 capturas, de las cuales **11.639
son de esta ronda** —R4-01 (5.744): ninguna línea pintada antes de explicarse;
R4-02 (151): el tachado sólo mientras la voz dice que se cancela; R4-03
(5.744): ninguna barra de desplazamiento dentro de la pizarra—. La batería de
rigor: **31.476 afirmaciones matemáticas recalculadas, 0 incorrectas**.
`qa/hito2.mjs`: **700** (bloque nuevo R4 con el endpoint de voz y sus tres
redes de seguridad); `qa/qa.mjs`: **1.465**; `qa/navegador.mjs`: **87**;
`qa/leccion.mjs`, diagnóstico, paso 1, hito 1, diagnóstico por nivel, sesiones,
aceptación 24/24, matemáticas, frontend y el barrido de 200 sesiones y 1.800
turnos: **0 fallos**. `tsc --noEmit` y `npm run build`, limpios.


## 38. Quinta ronda del cliente: el procedimiento no se parte en dos, y la voz neuronal suena de verdad

Dos observaciones, las dos críticas.

### 1. «La pizarra se limpia y salta directamente a 2x = 10»

No se borraba nada —el paso seguía escrito—, pero **estaba en la otra columna**.
La cadena del despeje empezaba en el Ambiente 1 (la resta a los dos lados, sobre
el propio enunciado) y en el segundo paso saltaba al Ambiente 2 (`2x = 10`,
`x = 5`). Leído de corrido, el alumno ve vaciarse el sitio donde estaba mirando
y aparecer otra cosa a la derecha: es un borrado, aunque técnicamente no lo sea.

**Lo que se hace ahora** (`lib/leccion/ambientes.ts`): una cadena de resolución
**sigue en el ambiente donde empieza**, bajando un paso debajo de otro, como un
cuaderno.

- Si el enunciado es ya el primer eslabón —`2x + 5 = 15`, sobre el que se
  cancela—, la cadena baja por el Ambiente 1: la resta a los dos lados,
  `2x = 10`, `x = 5`; y a la derecha, la respuesta enmarcada con su visto, que
  es donde el informe del cliente pide "la respuesta final consolidada".
- Si el enunciado se transforma primero —`2(x + 3) = 16`—, esa transformación se
  queda en el Ambiente 1 (`2(x + 3) = 16` y `2x + 6 = 16`) y **la cadena entera
  baja por el Ambiente 2**: `2x + 6 − 6 = 16 − 6` con su tachado, `2x = 10`,
  `x = 5` y el recuadro final. Que es, paso por paso, el flujo que dibujó el
  cliente.

Sigue en pie lo de la ronda anterior —no se pinta lo que aún no se ha
explicado— y lo de la suma de fracciones —una conversión a cada lado, para que
ningún ambiente quede vacío—: lo que cambia es que un despeje ya no se reparte
entre los dos.

### 2. «La voz sigue siendo la nativa del navegador»

Era verdad, y por dos motivos que ahora se cierran:

1. **Sin clave configurada no hay voz neuronal que oír.** El endpoint estaba
   hecho, pero una instalación sin `GOOGLE_TTS_API_KEY` ni `ELEVENLABS_API_KEY`
   responde 503 y la clase se queda —correctamente— con la voz del navegador. Es
   lo que pasa hoy en el despliegue: **falta contratar una de las dos claves y
   ponerla en el servidor**. No hay nada más que hacer en el código para eso.
2. **Y aunque la hubiera, el navegador podía negarse a reproducir el audio.** Un
   navegador sólo deja sonar audio si la primera reproducción ocurre dentro de un
   gesto del usuario; la primera frase de la clase llega *después* de pedirla al
   servidor, cuando el gesto ya ha pasado. La reproducción se rechazaba en
   silencio y la frase salía por la voz del navegador: el cliente oía la metálica
   con la neuronal configurada. Ahora hay **un solo reproductor `<audio>`**, que
   se autoriza con el primer clic reproduciendo un silencio de un milisegundo, y
   todas las frases suenan en él.

Además, **con voz neuronal la síntesis del navegador se apaga**: en cuanto el
servidor dice que la hay, se cancela `speechSynthesis` y no se vuelve a usar. Un
tropiezo de red se reintenta una vez antes de ceder, y sólo a la tercera caída
seguida se da la neuronal por perdida —es preferible una voz peor a una clase a
trompicones—.

Y esto ya no se comprueba leyendo el código: `qa/voz.mjs` abre una clase en
Chrome con un proveedor de mentira interpuesto y comprueba que la lección pide
el audio a `/api/voz` frase a frase, que lo reproduce en un `<audio>` de la
página, que **`speechSynthesis.speak` no se llama ni una sola vez**, que la
pizarra sigue sincronizada y que la interfaz dice qué voz suena. Y con el
endpoint apagado (503), que la clase no se queda muda: vuelve a la voz del
navegador y no anuncia una voz neuronal que no hay.

### Comprobado

`qa/observaciones.mjs`, siete clases en Chrome: **95.119 comprobaciones y 0
fallos**, 166 capturas. `qa/voz.mjs` —batería nueva, también en Chrome—:
**13/13**, con el endpoint respondiendo audio y con el endpoint apagado.
`qa/hito2.mjs`: **708**. La batería de rigor: **31.476 afirmaciones matemáticas
recalculadas, 0 incorrectas**. `qa/qa.mjs`: **1.465**; `qa/navegador.mjs`:
**87**; `qa/leccion.mjs`, diagnóstico, paso 1, hito 1, diagnóstico por nivel,
sesiones, aceptación 24/24, matemáticas, frontend y el barrido de 200 sesiones
y 1.800 turnos: **0 fallos**. `tsc --noEmit` y `npm run build`, limpios.


## 39. Por qué el cliente veía siempre lo mismo: el despliegue no construía la aplicación

El cliente lo dijo cinco rondas seguidas —«está igual, no has cambiado nada»— y
tenía razón. No era la pizarra: **era el despliegue**.

`GET https://math-ia.onrender.com/api/health` devolvía la versión `e96a544`, del
**24 de agosto**, y la respuesta traía la cabecera `x-powered-by: Express`. Ese
commit es el prototipo anterior: su árbol tiene `server.js` y `src/`, y no tiene
`app/` ni `components/` ni pizarra alguna. Es decir, la URL que aparece en
`ENTREGA.md` y en las guías de prueba llevaba semanas sirviendo el prototipo,
no la aplicación.

**La causa, en una línea.** `render.yaml` se quedó escrito para el prototipo:

```yaml
buildCommand: npm install     # ← nunca compila
startCommand: npm start       # ← `next start`, que EXIGE un `next build` previo
```

Cuando la aplicación era Express, instalar y arrancar bastaba. Con Next.js,
`next start` sin build muere al arrancar («Could not find a production build»),
Render marca el despliegue como fallido y **mantiene vivo el último contenedor
que sí arrancó**: el de agosto. Cada entrega se subía, se fusionaba… y no se
veía.

Y había una segunda mina en el mismo fichero: `NODE_VERSION: "20"`. La siembra
del banco de preguntas corre con `node --experimental-strip-types`, que existe a
partir de **22.6**; con Node 20 ese paso falla aunque todo lo demás esté bien.
`package.json` declaraba `engines: >=18`, así que cualquier plataforma podía
elegir un Node incapaz de construir el proyecto.

**Lo que se ha corregido** (`render.yaml`, `package.json`):

- el blueprint compila antes de arrancar, con la **misma secuencia que Vercel**
  (`npm ci && npm run vercel-build`: generar cliente, migrar, sembrar, compilar);
- fija `NODE_VERSION 22.18.0`, y el paquete declara `engines: >=22.6`;
- pide en el panel los secretos que la aplicación necesita para algo más que
  arrancar —`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`— y deja hueco, sin
  escribir ninguna clave en el repositorio, a la voz neuronal
  (`GOOGLE_TTS_API_KEY`, `ELEVENLABS_API_KEY`).

**Cómo se comprueba desde fuera, en un segundo y sin entrar a ningún panel:**

```
curl -sI https://math-ia.onrender.com/api/health | grep -i x-powered-by
   Express → está sirviendo el prototipo viejo
   Next.js → está sirviendo la aplicación

curl -s  https://math-ia.onrender.com/api/health     → "version": <commit>
```

Y en la propia pantalla de la lección, bajo el avatar, aparece `build <commit>`.

**Y lo que no se puede arreglar desde el repositorio:** que el servicio de
Render (o de Vercel) vuelva a desplegar. El blueprint sólo lo relee Render si el
servicio sigue enlazado al Blueprint; si sus ajustes se editaron a mano, mandan
los del panel. Los secretos hay que pegarlos allí una vez. Eso es del cliente.

**La comprobación que faltaba.** `qa/hito2.mjs` incluye ahora un bloque de
despliegue: que arrancar exija compilar, que el blueprint compile, que use la
secuencia de Vercel, que el Node fijado soporte la siembra, que el paquete
declare ese mínimo, que los secretos estén pedidos y que la versión desplegada
se publique en `/api/health` y en pantalla. Nueve comprobaciones que habrían
convertido cinco rondas de «está igual» en un fallo de batería el primer día.

### Y cuando corregir el blueprint no basta

Con `render.yaml` ya corregido y fusionado (PR #57), el sitio **seguía sirviendo
la versión de agosto**: `x-powered-by: Express`, `version: e96a544`. Era
previsible y hay que decirlo: una plataforma sólo relee el blueprint si el
servicio sigue enlazado a él. Si sus ajustes se editaron a mano —y los de este
servicio son los del prototipo—, mandan los del panel, y desde el repositorio no
se pueden cambiar.

Pero sí hay un gancho que se ejecuta **siempre**, mande quien mande: el
`postinstall` de npm, que corre con `npm install` y con `npm ci`. Ahí va ahora
`scripts/despliegue.mjs`, que decide qué hacer según dónde esté:

| Dónde | Qué hace |
| --- | --- |
| Un portátil (`npm install` normal) | sólo `prisma generate`: nadie quiere compilar por instalar una dependencia |
| Vercel | sólo `prisma generate`; el resto lo hace `vercel-build`, y compilar dos veces es pagar el doble |
| Render (o `CONSTRUIR_AL_INSTALAR=1`) | prepara la base **y compila** |

Con esto, aunque el panel siga diciendo `npm install`, la aplicación se
construye y `next start` tiene qué servir.

Y una decisión deliberada, que es la lección de todo esto: **la base de datos no
puede tumbar un despliegue**. Migrar y sembrar se intentan, y si fallan se avisa
muy alto y se sigue; compilar, en cambio, es obligatorio. Un despliegue que no
sale deja a todo el mundo mirando una versión vieja sin enterarse —cinco rondas—;
uno que sale con la base a medias se ve en `/api/health` («sin_migrar»,
«sin_sembrar») y se arregla en cinco minutos. Probado con la base apagada: migrar
y sembrar avisan, `next build` termina y el despliegue sale.

### Cómo se comprueba, en una orden

```
npm run qa:despliegue                                   # el sitio en vivo
node qa/despliegue.mjs https://otra-direccion.com       # cualquier otra
node qa/despliegue.mjs https://otra-direccion.com 8166d2e   # y qué commit se espera
```

Dice si contesta, si lo que sirve es la aplicación o el prototipo viejo, qué
commit está vivo y si es el que toca. Hoy, contra el sitio en vivo, responde lo
que hay que responder: **2 fallos** —«lo que sirve es la aplicación, no el
prototipo de Express» y «la versión desplegada es la esperada»—. Cuando el
cliente redespliegue, esa misma orden dará 5 de 5 y no hará falta discutir si se
ven o no se ven los cambios.


## 40. La entrega, comprobada en el propio repositorio del cliente

Con todo fusionado —PR #53 a #58— el sitio en vivo seguía sirviendo, cinco horas
después, la versión del 24 de agosto: `x-powered-by: Express`, `version
e96a544`. Ya no es que el blueprint no compilara (corregido) ni que el panel
mande sobre el blueprint (resuelto con el gancho `postinstall`): es que **ese
servicio no está desplegando este repositorio**. Eso sólo se ve, y sólo se
arregla, desde su panel.

Lo que sí se puede hacer desde aquí es que nadie tenga que fiarse de nadie. La
pregunta «¿está igual porque no habéis cambiado nada, o porque no ha llegado?»
tiene dos mitades, y ahora las dos se responden solas, en la pestaña *Actions*
del repositorio del cliente:

> **Estos dos flujos viajan fuera del repositorio.** Crear ficheros en
> `.github/workflows` exige un permiso de GitHub (`workflow`) que la credencial
> de esta entrega no tiene. Los dos ficheros van adjuntos con la entrega: basta
> con añadirlos desde la web del repositorio (Add file → Create new file) o
> autorizar ese permiso y subirlos. Todo lo demás de esta sección ya está dentro.

| Flujo | Cuándo | Qué responde |
| --- | --- | --- |
| `verificacion.yml` | en cada push y cada PR a `main` | ¿compila el código, desde cero y en una máquina limpia, y pasa sus baterías? (`npm ci`, tipos, `next build`, hito 2, rigor, matemáticas) |
| `despliegue.yml` | cada 6 h y a mano | ¿lo que está vivo en la URL es ese mismo código? |

Si la primera está en verde y la segunda en rojo —que es exactamente lo que pasa
hoy—, el problema no está en el código: está en el servicio que despliega. Y el
propio flujo imprime qué mirar: si el servicio apunta a este repositorio y a
`main`, si el despliegue automático está activo, qué dice el registro del último
despliegue y si están puestas `DATABASE_URL`, `DIRECT_URL` y `AUTH_SECRET`.

### Tres cosas más que habrían vuelto a fallar

- **El candado de dependencias estaba desfasado.** `package.json` pedía Node
  `>=22.6` y `package-lock.json` seguía diciendo `>=18`. `npm ci` —la orden que
  ejecutan Render y el flujo de integración— falla cuando los dos no coinciden.
  Actualizado y probado: `npm ci` limpio, 50 segundos.
- **Compilar en el plan gratuito se queda sin memoria.** 512 MB dan lo justo, y
  cuando el sistema mata la compilación el registro sólo dice «exited with
  status 137», que no se parece a un error. El blueprint fija ahora
  `NODE_OPTIONS=--max-old-space-size=448`.
- **Y se ha probado el camino de Render entero, con la base apagada**:
  instalación limpia (`npm ci`), migración y siembra avisando y continuando,
  `next build` terminando, `.next/BUILD_ID` escrito. Es decir: aunque el cliente
  no ponga todavía las claves de la base, el despliegue saldrá y `/api/health`
  dirá qué le falta.

### Comprobado (entrega del Hito 2, cierre)

`qa/observaciones.mjs`, siete clases en Chrome: **95.129 comprobaciones y 0
fallos**, 166 capturas. `qa/voz.mjs`: **13/13**. `qa/hito2.mjs`: **724** (con el
bloque de despliegue: que arrancar exija compilar, que instalar construya, que
la base caída no tumbe el despliegue y que se vigile qué versión está viva).
Rigor: **31.476 afirmaciones matemáticas recalculadas, 0 incorrectas**.
`qa/qa.mjs`: **1.465**; `qa/leccion.mjs`: **825**; `qa/navegador.mjs`: **87**;
`qa/matematicas.mjs`: 100; `qa/hito1.mjs`: 124; diagnóstico por nivel 94;
aceptación **24/24**; diagnóstico, sesiones, paso 1 y frontend sin fallos; y el
barrido de **200 sesiones y 1.800 turnos, 0 violaciones**. `npm ci` limpio,
`tsc --noEmit` y `npm run build`, limpios.


## 41. Sexta ronda: los pasos se apilan de verdad, y la voz dice qué le falta

El cliente resolvió por su cuenta el cruce de entornos, y con eso se pudo
trabajar sobre lo que de verdad pasa: **no usan Render, usan Vercel**
(`docenteia-nu.vercel.app`), y esa instalación **sí** estaba sirviendo el último
commit. La URL de Render que arrastraban las guías era un servicio abandonado de
agosto, y perseguirla costó dos rondas. Queda dicho para que no vuelva a pasar:
la dirección que vale es la de Vercel, y `/api/health` la identifica.

Con el entorno claro, los dos problemas que quedaban son reales y están
corregidos.

### 1. La pizarra sobrescribía el paso en vez de apilarlo

El cliente lo pidió con un dibujo: al terminar la explicación tienen que quedar
**los cinco renglones a la vista**, uno debajo de otro —la resta escrita en los
dos lados, la resta cancelada, `2x = 10`, `x = 5` y el recuadro final—. Lo que
había apilaba cuatro: los dos primeros eran **el mismo renglón**, que primero
escribía la resta y luego se tachaba encima. El paso se sobrescribía a sí mismo.

**Ahora son dos renglones.** El motor escribe una línea más —la igualdad con la
resta ya puesta, `2x + 6 − 6 = 16 − 6`— y el tachado se dibuja sobre ella
(`escenaDeCancelacion` en `lib/leccion/animacion.ts`), mientras la primera se
queda como estaba. Al acabar, el panel de desarrollo enseña:

```
2x + 6 − 6 = 16 − 6      ← «Restamos 6 en ambos lados»
2x + 6̶ − 6̶ = 16 − 6      ← «A la izquierda se cancela +6 con −6…»
2x = 10
x = 5
[5] ✓
```

Y una trampa que cazó la batería antes de salir: la etiqueta del renglón nuevo
llevaba el término leído de un texto **con espacios**, así que decía señalar un
"0" que no está escrito y **el saneado del servidor la descartaba entera** —el
renglón habría llegado a producción sin tachado—. `qa/hito2.mjs` lo detectó en
el mismo sitio donde comprueba que ninguna etiqueta se pierde al validar.

### 2. La voz no decía qué le faltaba

El diagnóstico del cliente era exacto: `/api/voz` responde 503 porque **no hay
ninguna clave configurada en Vercel**, y el reproductor hace lo que debe —volver
a la voz del navegador—. Lo que estaba mal es que averiguar *qué variable hacía
falta* obligó a leer el código fuente en producción. Eso ya lo contesta el
servicio:

| Llamada | Qué responde |
| --- | --- |
| `GET /api/voz` | si está apagada: `motivo: "sin_configurar"` y **los nombres de variable** que acepta |
| `GET /api/voz?probar=1` | con clave puesta: sintetiza una palabra y dice si el proveedor **la acepta** (`prueba: "ok"`) o la rechaza, con el motivo |
| `GET /api/health` | el mismo estado, en el campo `voz`, sin abrir otro endpoint |

Y se aceptan los nombres que uno escribe de memoria —`GOOGLE_TTS_KEY`,
`ELEVEN_LABS_API_KEY`, `XI_API_KEY`…—: una clave bien puesta con otro nombre ya
no se ignora en silencio, y la respuesta dice **con cuál** se encontró.

### Sobre «una integración que no dependa de cuotas»

El cliente pidió, si no hay credenciales, «una integración que no dependa de
cuotas bloqueadas». Hay que ser claro: **no existe una voz neuronal seria y
gratuita sin credencial**. Lo que circula —el servicio de lectura de Edge, el
TTS interno del traductor de Google— son **endpoints privados sin documentar**,
que se usan con tokens obtenidos por ingeniería inversa: se caen sin aviso,
quedan fuera de los términos de servicio del proveedor y no se pueden poner en
el producto de un cliente que factura. No se ha hecho, a propósito.

Lo que sí hay, y es la vía correcta: **Google Cloud Text-to-Speech tiene nivel
gratuito mensual** (en el momento de escribir esto, un millón de caracteres para
voces Neural2). Una clase entera gasta unos pocos miles de caracteres, así que
el uso normal cabe holgadamente dentro de ese nivel. Hace falta crear la clave
una vez y pegarla en Vercel como `GOOGLE_TTS_API_KEY`; desde ese momento el
tutor habla con voz neuronal y la síntesis del navegador queda apagada.

### Comprobado

`qa/observaciones.mjs`, siete clases en Chrome: **94.489 comprobaciones y 0
fallos**, 166 capturas. `qa/voz.mjs`: **13/13**. `qa/hito2.mjs`: **729**, con
los renglones apilados y el diagnóstico de la voz. Rigor: **31.930 afirmaciones
matemáticas recalculadas, 0 incorrectas** (las del renglón nuevo, incluidas).
`qa/qa.mjs`: 1.465; `qa/leccion.mjs`: 826; `qa/navegador.mjs`: 87; matemáticas
100; hito 1 124; diagnóstico por nivel 94; aceptación **24/24**; diagnóstico,
sesiones, paso 1 y frontend sin fallos; barrido de **200 sesiones y 1.800
turnos, 0 violaciones**. `tsc --noEmit` y `npm run build`, limpios.


## 42. Séptima ronda: lo que el avatar dice, escrito; y la voz, diagnosticada en pantalla

### 1. «Escribir en la pizarra exactamente lo que narra el avatar»

El cliente lo cazó con `x/3 + 7 = 12`: el tutor decía «multiplicamos AMBOS lados
por 3» y la pizarra **saltaba directamente a `x + 21 = 36`**. La multiplicación
—la operación que el avatar acababa de nombrar— no se escribía en ninguna parte.
Y puso la regla general: *toda operación que el avatar mencione debe quedar
registrada visualmente antes de enseñar el resultado*.

Era verdad, y venía del motor: el paso de preparación calculaba la
transformación y escribía **sólo su resultado**. Ahora son dos pasos, y el mismo
criterio se aplicó donde se cometía el mismo silencio:

| Ecuación | Antes | Ahora |
| --- | --- | --- |
| `x/3 + 7 = 12` | `x + 21 = 36` | `3 · (x/3 + 7) = 3 · 12` → `x + 21 = 36` |
| `0,5x = 4` | `x = 8` | `2 · 0.5x = 2 · 4` → `x = 8` |
| `5x − 7 = 2x + 5` | `3x − 7 = 5` | `5x − 7 − 2x = 2x + 5 − 2x` → `3x − 7 = 5` |

Con la cancelación en dos renglones (§41), la clase de `x/3 + 7 = 12` termina
exactamente con el flujo que dibujó el cliente:

```
x/3 + 7 = 12                 (enunciado)
3 · (x/3 + 7) = 3 · 12       ← la multiplicación, escrita
x + 21 = 36                  ← el reparto
x + 21 − 21 = 36 − 21        ← la resta uniforme, escrita
x + 2̶1̶ − 2̶1̶ = 36 − 21        ← la cancelación, tachada
x = 15                       ← y el recuadro final
```

**Dos excepciones, y las dos razonadas.** Dividir entre el coeficiente enseña su
resultado en la misma línea (`2x = 10` → `x = 5`): es como el propio cliente lo
dibujó en su flujo de referencia. Y la resta de la cancelación sí se escribe,
pero la escribe la lección en su renglón aparte, no el paso del motor.

La regla queda comprobada, y de forma general: `qa/hito2.mjs` recorre las
ecuaciones de todas las formas, busca en lo que dice el tutor cualquier
«multiplicamos / restamos / sumamos … en los dos lados» y **exige que ese mismo
número aparezca escrito en la línea de ese paso**. Si alguien vuelve a narrar
una operación sin escribirla, la batería lo dice.

### 2. La voz: el servidor ya contesta, y ahora la pantalla también

El cliente leyó en la interfaz «voz: Microsoft Raul - Spanish (Mexico)» y dedujo
—bien— que `public/tts.js` estaba cayendo al respaldo. La causa es la de
siempre, y ahora la confirma el propio despliegue:

```
GET https://docenteia-nu.vercel.app/api/voz
{"disponible":false,"motivo":"sin_configurar","variables":{"google":["GOOGLE_TTS_API_KEY",…]}}
```

**No hay ninguna clave configurada en Vercel.** El código hace lo correcto. Lo
que faltaba era decirlo donde el cliente estaba mirando: bajo el avatar se lee
ahora

> voz del navegador: Microsoft Raul · **sin voz neuronal: falta
> GOOGLE_TTS_API_KEY en el servidor**

Con la clave puesta, esa misma línea dirá «voz neuronal (google)» y la síntesis
del navegador queda apagada. Y para saber si una clave puesta FUNCIONA —que no
es lo mismo que estar puesta— basta `GET /api/voz?probar=1`, que sintetiza una
palabra y devuelve la respuesta del proveedor.

### Comprobado

`qa/observaciones.mjs`, siete clases en Chrome: **94.798 comprobaciones y 0
fallos**, 166 capturas. `qa/voz.mjs`: **13/13**. `qa/hito2.mjs`: **733**, con la
regla nueva —lo que el tutor dice que hace con los dos lados tiene que estar
escrito— comprobada sobre todas las formas de ecuación. Rigor: **32.608
afirmaciones matemáticas recalculadas, 0 incorrectas** (las de los renglones
nuevos, incluidas). `qa/qa.mjs`: 1.465; `qa/leccion.mjs`: 826;
`qa/navegador.mjs`: 87; matemáticas 100; hito 1 124; diagnóstico por nivel 94;
aceptación **24/24**; diagnóstico, sesiones, paso 1 y frontend sin fallos;
barrido de **200 sesiones y 1.800 turnos, 0 violaciones**. `tsc --noEmit` y
`npm run build`, limpios.


## 43. Octava ronda: las líneas que aparecían «de golpe» y no coincidían con la voz

El cliente fotografió `2(x + 4) = 3x − 1` y rodeó en rojo dos renglones: «esto
apareció de golpe, sin coincidir con lo que dice el avatar». Tenía razón, y la
causa era peor de lo que parecía.

### Qué pasaba

Las dos líneas que se añadieron en la ronda anterior —`2x + 8 = 3x − 1` y
`2x + 8 − 3x = 3x − 1 − 3x`— **no llevaban etiqueta de operación**. Sin etiqueta,
la pizarra deduce la escena por descarte… y caían en el compositor de
**polinomios**, que es el de las derivadas. El resultado: la pizarra las contaba
como «miramos el término 2 por x, su coeficiente es 2, miramos el término 8…»,
frases que el tutor no dice nunca.

Y de ahí salían los dos síntomas a la vez:

- **No coincidían con la voz**, porque la pizarra avanza reconociendo lo que se
  dice, y ninguna de esas frases se decía;
- **aparecían de golpe**, porque desde la corrección de «no pintes lo que aún no
  has explicado», una línea cuya escena no se alcanza **no se dibuja**: las dos
  esperaban calladas y saltaban juntas cuando el puntero por fin pasaba.

### Qué se ha hecho

1. **Una ecuación con incógnita a los dos lados ya no se compone como un
   polinomio de derivadas.** `escenaDePolinomio` la rechaza: era una deducción
   por descarte que sólo podía contar algo falso.
2. **Los dos pasos nuevos llevan su etiqueta**, y con ella dos escenas propias,
   hermanas de las que ya existían para las constantes:
   - `escenaDeRestaDeIncognita` — sobre `2x + 8 = 3x − 1` **escribe** el `− 3x` en
     los dos miembros, con una caja por miembro, mientras la voz dice «restamos
     3x en los dos lados»;
   - `escenaDeCancelacionDeIncognita` — sobre `2x + 8 − 3x = 3x − 1 − 3x` **tacha**
     el par que se va, que aquí está en el miembro DERECHO, cuando la voz dice
     «a la derecha se cancela 3x con −3x, y a la izquierda 2x menos 3x es −x».
3. Y esa frase la construyen el motor y la pizarra por separado, con los mismos
   números: la batería comprueba que sean **idénticas**, como ya se hacía con la
   cancelación de constantes.

Además, que la primera línea EVOLUCIONE —que destape el `− 3x` en vez de quedarse
igual— quita de paso el efecto de ver dos veces la misma igualdad: arriba a la
izquierda como resultado de repartir el paréntesis, y otra vez abajo sin cambio.

La clase de `2(x + 4) = 3x − 1` queda así, un renglón por frase:

```
2(x + 4) = 3x − 1        el enunciado, con el reparto animado
2x + 8 − 3x = 3x − 1 − 3x   ← «restamos 3x en los dos lados» (cajas)
2x + 8 − 3̶x̶ = 3̶x̶ − 1 − 3x   ← «a la derecha se cancela 3x con −3x…» (tachado)
−x + 8 − 8 = −1 − 8       ← «restamos 8 en los dos lados» (cajas)
−x + 8̶ − 8̶ = −1 − 8       ← «a la izquierda se cancela +8 con −8…» (tachado)
−x = −9   ·   x = 9       ← y el recuadro final
```

### Lo que ahora impide que vuelva a pasar

- `qa/hito2.mjs`: **ninguna línea escrita de esa lección puede quedarse sin foco
  ni componerse como un polinomio**, y se comprueba que al decir «restamos 3x en
  los dos lados» la pizarra escribe, y que sólo al decir que se cancela, tacha.
- `qa/rigor.mjs` audita ahora las frases nuevas —86 + 86 afirmaciones— con las
  mismas reglas que las demás: el término que se quita es el que está al otro
  lado, el verbo corresponde a su signo, y lo que queda al juntarlos es exacto.

### Comprobado

`qa/observaciones.mjs`, siete clases en Chrome: **94.433 comprobaciones y 0
fallos**, 166 capturas —con `R3-01` generalizada: las marcas de una cancelación
tienen que estar todas del mismo lado del igual, sea el izquierdo (constantes) o
el derecho (términos con incógnita), y ninguna puede quedar a caballo—.
`qa/voz.mjs`: **13/13**. `qa/hito2.mjs`: **737**. Rigor: **31.466 afirmaciones
matemáticas recalculadas, 0 incorrectas**, con las 172 nuevas de la cancelación
con incógnita. `qa/qa.mjs`: 1.465; `qa/leccion.mjs`: 826; `qa/navegador.mjs`:
87; matemáticas 100; hito 1 124; diagnóstico por nivel 94; aceptación **24/24**;
diagnóstico, sesiones, paso 1 y frontend sin fallos; barrido de **200 sesiones y
1.800 turnos, 0 violaciones**. `tsc --noEmit` y `npm run build`, limpios.


## 44. Novena ronda: dividir también se escribe, y se ve cuándo le toca al alumno

El cliente cerró él mismo el primer punto —«ya verifiqué /api/voz… ya tengo
identificado dónde cargar la variable en el panel de Vercel»—, así que la voz
neuronal queda a la espera de su clave. Los otros dos son míos y están hechos.

### 1. Toda acción verbalizada se escribe (ahora también la división)

La regla que puso el cliente es general: *si el avatar dice «multiplicamos por 7
ambos miembros», la pizarra debe renderizar primero la expresión formal* y en el
renglón siguiente el resultado. La multiplicación y la resta ya lo hacían; **la
división no**: el tutor decía «dividimos ambos lados entre 2» y la pizarra
saltaba a `x = 5`.

Ahora son dos renglones, como todo lo demás:

```
2x = 10
2x ÷ 2 = 10 ÷ 2     ← «dividimos ambos lados entre 2»
x = 5               ← «al dividir queda x = 5»
[5] ✓
```

Y la línea nueva lleva su etiqueta —el número entre el que se divide, que ahí sí
está escrito en los dos miembros—, porque **una línea sin foco no se sincroniza
con la voz**: sería exactamente el defecto de la ronda anterior. Lo cazó la
batería en el acto, con `−x ÷ −1 = −9 ÷ −1`, que era el único caso sin cifra que
señalar.

**El reparto entre los dos ambientes se ha reajustado en consecuencia.** Con dos
tiempos por operación, un despeje son cinco o seis renglones: dejarlos todos en
la columna izquierda vaciaba el panel de desarrollo —lo que el cliente pidió
evitar en su día—. Ahora al enunciado le acompaña **un** paso (el que cierra la
operación empezada sobre él) y el resto baja por el Ambiente 2, de corrido.

### 2. Se ve —y se oye— cuándo le toca al alumno

En la práctica, la lección se para esperando respuesta. El cliente lo describió
sin rodeos: el avatar se queda en «Te acompaño» y *«el estudiante no piensa que
debe interactuar; piensa que el sistema se congeló»*. Tres cosas, y las tres a la
vez:

- **El avatar lo dice.** Al plantear cualquier pregunta —venga del generador que
  venga, porque va en el reproductor— añade: «Ahora te toca a ti: resuelve el
  ejercicio y escribe tu respuesta en la caja de abajo».
- **El rótulo del avatar cambia** de «Te acompaño» a **«Te toca a ti»** mientras
  hay una pregunta delante.
- **El formulario se resalta**: marco grueso, la misma frase en azul sobre la
  pregunta, un latido de dos pulsos al aparecer y la vista que baja sola hasta
  él. Con `prefers-reduced-motion` no late, sólo se queda marcado.

### Comprobado

`qa/observaciones.mjs`, siete clases en Chrome: **101.867 comprobaciones y 0
fallos**, 166 capturas. `qa/voz.mjs`: **13/13**. `qa/hito2.mjs`: **744**, con las
comprobaciones nuevas —la división escrita y con foco, la invitación al alumno
en el reproductor, la frase repetida junto al formulario, el resalte, el
desplazamiento hasta la caja y el respeto a `prefers-reduced-motion`—. Rigor:
**31.586 afirmaciones matemáticas recalculadas, 0 incorrectas**. `qa/qa.mjs`:
1.465; `qa/leccion.mjs`: 827; `qa/navegador.mjs`: 87; matemáticas 100; hito 1
124; diagnóstico por nivel 94; aceptación **24/24**; diagnóstico, sesiones, paso
1 y frontend sin fallos; barrido de **200 sesiones y 1.800 turnos, 0
violaciones**. `tsc --noEmit` y `npm run build`, limpios.


## 45. Qué faltaba de verdad en el Hito 2, revisado punto por punto

Con todas las rondas cerradas, esta es la revisión de lo que quedaba. Se ha
repasado el pliego del hito entero, no sólo lo último que se pidió.

### Lo que faltaba y ya está hecho

**Dos de los cuatro mandos no se habían probado nunca en un navegador.** El
pliego pide «Pausar, Reanudar, Repetir paso y Avanzar manualmente». La batería de
Chrome llegaba a pulsar Pausar y Reanudar; que **«Avanzar» avance** y que
**«Repetir paso» repita** sólo estaba comprobado por dentro, simulando el
reproductor en Node. Ahora hay una batería que da una clase entera en Chrome
—`qa/mandos.mjs`, 19 comprobaciones— y pulsa los cuatro:

- pausar deja de hablar (se cuentan las locuciones, interceptando el
  sintetizador);
- «Avanzar» mueve el paso: cambia lo resaltado o la línea activa;
- «Repetir paso» vuelve a contarlo: se oye otra vez;
- reanudar y la clase sigue sola.

**Los cinco estados del avatar tampoco se habían visto cambiar en una clase
real.** La máquina de estados estaba comprobada como función. Ahora se anota el
estado del avatar durante toda la clase y se exige verlo pasar por
**EXPLICANDO**, **APOYO** al preguntar —con su rótulo «Te toca a ti» y la
invitación dicha en voz alta— y **CELEBRANDO** tras una respuesta correcta.

Y la cabecera de esta entrega, que seguía anunciando las 3.588 comprobaciones
del primer día, ahora dice las de verdad.

### Lo que no depende de este repositorio

1. **La clave de la voz neuronal.** El código está terminado y probado; sin
   `GOOGLE_TTS_API_KEY` (o `ELEVENLABS_API_KEY`) en Vercel, `/api/voz` responde
   `sin_configurar` —lo dice él mismo, y también la pantalla bajo el avatar— y la
   clase habla con la voz del navegador. Es lo único que separa al tutor de su
   voz neuronal.
2. **Dos flujos de GitHub Actions** (`verificacion.yml` y `despliegue.yml`), que
   contestan solos «¿compila main?» y «¿es eso lo que está desplegado?». Van
   adjuntos con la entrega: crear ficheros en `.github/workflows` exige un
   permiso de GitHub que la credencial de esta entrega no tiene.

### Lo que no es de este hito

Hito 3 (Colegios y tareas) y Hito 4 (Reportes y cierre) no están empezados, y
Hito 3 necesita antes tres decisiones del cliente: cómo se une un alumno a un
aula, si un docente puede pertenecer a varias instituciones y qué cuenta como
«reintento» en una tarea.

### Y un defecto que apareció al buscar lo que faltaba: la pizarra en un móvil

Repasando qué no se había mirado nunca, salió esto: **la lección no se había
abierto jamás en una pantalla estrecha**. La batería daba clase a 1366 px y una
a 1920; nadie la había visto a 390. Y las dos quejas que más ha repetido el
cliente —cosas que se salen por el borde y barras de desplazamiento— son
exactamente las que aparecen cuando el sitio se estrecha.

Estaba rota: en modo proyección, el Ambiente 1 **se salía 59,5 px por la
derecha**. La causa es que el mínimo de 48 px por fórmula que pide el informe
está pensado para un aula; en 390 px de ancho, media pizarra son 180 px y esa
fórmula no cabe de ninguna manera.

**Corregido:** por debajo del tamaño de un portátil, el suelo de la fórmula
proyectada baja (`clamp(1.5rem, 7vw, 3rem)`), así que sigue siendo letra grande
—por encima de los 24 px que el informe pide para los rótulos— y no se sale
nada. En 1366 y en 1920 no cambia ni un píxel: ahí el mínimo de aula se respeta
igual que antes. La batería exige lo uno o lo otro según el ancho de la ventana,
y lo que no se negocia en ninguna pantalla es que nada se salga.

Y la clase de móvil se queda en la batería: **ocho clases** en lugar de siete.


## 46. Décima ronda: la respuesta no puede ir antes de la operación que la produce

El cliente revisó el despliegue (commit `cbf6ecf`) y encontró un desorden real en
`2(x + 3) = 16`. La pizarra enseñaba:

```
2x = 10
x = 5                ← la respuesta…
2x ÷ 2 = 10 ÷ 2      ← …y DESPUÉS la división que la produce
[5] ✓
```

**De dónde salía ese `x = 5` adelantado.** No era un paso escrito por el motor:
era la propia línea `2x = 10`, que traía la solución dentro como segundo
renglón. Tenía sentido cuando la división no se escribía —la línea hacía las dos
cosas—, pero desde que cada operación se escribe en su propio renglón (§44) esa
solución sobra y, además, llega antes de tiempo.

**Corregido.** La línea que se va a dividir ya no adelanta nada: la escena del
despeje sólo destapa la solución cuando nadie más la va a escribir (el camino
deducido, sin guion). Con la etiqueta del motor delante, se queda en su sitio:

```
2x + 6 − 6 = 16 − 6      ← «restamos 6 en los dos lados»
2x + 6̶ − 6̶ = 16 − 6      ← «a la izquierda se cancela +6 con −6…»
2x = 10
2x ÷ 2 = 10 ÷ 2          ← «dividimos ambos lados entre 2»
x = [5] ✓                ← y el recuadro final
```

Que es, renglón por renglón, la secuencia que pidió el cliente.

**Y el caso que se habría escapado:** con coeficiente −1 —`−x = −9`— no hay cifra
que recuadrar, así que esa línea no llevaba etiqueta, la pizarra la deducía… y la
escena deducida vuelve a adelantar la solución. Ahora el motor la etiqueta
igualmente señalando el término (`−x`), y la escena marca ese término en lugar de
una cifra que no existe. Sin eso, la línea se habría quedado además sin foco, que
es el defecto de la ronda anterior.

Queda comprobado con tres comprobaciones nuevas: que la línea previa a la
división no trae ni solución escrita ni marca de resuelto, que el orden escrito
es dividir y después la solución, y que lo mismo vale cuando el coeficiente es
−1.

### Sobre la voz, respondiendo a la pregunta del cliente

Pregunta si hace falta que cargue él `GOOGLE_TTS_API_KEY` en Vercel «o si
subiremos credenciales operativas de prueba». **Tiene que cargarla él**, y no se
van a subir credenciales: una clave en el repositorio es un incidente de
seguridad —queda en el historial de git para siempre y cualquiera con acceso al
código puede gastarla—. Por eso el endpoint la lee del entorno del servidor y
nunca viaja al navegador.

Con la clave puesta en **Production** y un despliegue nuevo, `/api/voz?probar=1`
responde `"prueba": "ok"` y la línea bajo el avatar pasa de «falta
GOOGLE_TTS_API_KEY en el servidor» a «voz neuronal (google)». La síntesis del
navegador —la Microsoft Raul que está oyendo— se apaga en ese momento.


## 47. Undécima ronda: el pie dice lo que se señala, y la división se escribe como fracción

Tres observaciones del cliente sobre la misma zona de la pizarra, y las tres
eran ciertas.

### 1. «Dice "dividimos los dos lados entre 2" pero sólo señala el 2 del 2x»

En la línea `2x = 10` el pie anunciaba la división en los dos lados mientras la
caja marcaba un solo número —y no podía marcar otro: **a la derecha no hay
ningún 2**—. Ahora el pie cuenta lo que de verdad está señalado: «La x está
multiplicada por 2». Que se divide en los dos lados lo enseña el renglón
siguiente, donde sí hay dos cosas que marcar.

### 2. «Dice "al dividir queda x = 5" pero muestra esto»

El pie de la línea de la división traía la frase del paso SIGUIENTE —el
resultado, que en esa línea todavía no está—. Era el efecto de una regla general
que hasta ahora funcionaba: cada línea se etiqueta con la operación que se va a
hacer sobre ella. En esta no valía, porque lo que viene después no es una
operación sino la respuesta.

La línea de la división tiene ahora su propia escena y su propio pie:
«Dividimos los dos lados entre 2», con **los dos denominadores marcados, uno en
cada miembro** —ninguna marca cruza el igual—.

### 3. «Crea la regla general: se divide como fracción»

Hecho. Donde antes se escribía `2x ÷ 2 = 10 ÷ 2`, ahora se escribe la fracción,
que es como se hace en clase y como se ve que el 2 de arriba y el de abajo se
van:

```
2x + 6 − 6 = 16 − 6
2x + 6̶ − 6̶ = 16 − 6
2x = 10
2x     10
── = ──
 2      2
x = [5] ✓
```

Tres comprobaciones nuevas lo fijan: que el pie de la división hable de dividir
y no del resultado, que marque los dos denominadores (uno por miembro), y que el
pie de `2x = 10` hable del coeficiente que está marcado y **no** de «los dos
lados».

## 48. Duodécima ronda: el QA lo hacemos nosotros, y contra el despliegue de verdad

> «Alex sigue igual… antes de decirme que yo verifique, debes hacer tú el QA.
> Asimismo, la voz del Avatar está igual.»

Las dos cosas eran ciertas, y las dos tenían la misma causa de fondo: **las
baterías sólo sabían correr contra `localhost`**. Todo lo que se daba por
comprobado estaba comprobado en un servidor de desarrollo, no en el que el
cliente abre.

### 1. Las baterías, apuntadas al despliegue

La sesión se inyectaba como cookie *por dominio* (`domain`, `path`,
`secure: false`). Contra `https://` eso no vale: el nombre de la cookie lleva el
prefijo `__Secure-` y Chrome exige `secure`, así que la rechazaba y la batería
veía la pantalla de invitado. Ahora la cookie se declara **por URL**, que es lo
que resuelve el propio navegador, y las seis baterías de Chrome
—`observaciones`, `navegador`, `voz`, `mandos`, `hito2`, `barrido`— corren igual
contra `localhost` que contra `https://docenteia-nu.vercel.app`:

```
BASE_URL=https://docenteia-nu.vercel.app node qa/observaciones.mjs
```

### 2. Lo que apareció al mirar el despliegue: la práctica

Con la batería apuntada al sitio de verdad salió un defecto que en local nunca
se había visto, porque sólo ocurre en la **fase de práctica**: para `x + 3 = 8`
la pizarra escribía

```
x + 3̶ − 3̶ = 8 − 3      ← ya tachada, y con «x = 5» dentro
x + 3̶ − 3̶ = 8 − 3      ← otra vez la misma, tachada
```

El enunciado de la práctica se escribe **sin etiqueta** —es un enunciado, no un
paso—, así que la pizarra tenía que deducir su escena, y la escena deducida
—`escenaDeDespeje`— todavía tachaba y adelantaba la solución. Tenía sentido
cuando el motor no escribía los pasos intermedios; desde la ronda anterior los
escribe todos, uno por renglón, y por eso la deducción los duplicaba.

`escenaDeDespeje` ya **no tacha ni adelanta el resultado nunca**: escribe la
resta y ahí se queda. Tachar es de `escenaDeCancelacion`, dividir es de
`escenaDeDivisionEnFraccion`, y la respuesta sale en la línea de cierre. Un
renglón, un tiempo.

### 3. La voz: lo que nos tocaba a nosotros, hecho

Que la voz neuronal del servidor siga apagada es la clave que falta en Vercel
—eso sólo lo puede poner el cliente, y la pantalla lo dice por su nombre—. Pero
había además un fallo nuestro en la voz de repuesto, la del propio navegador, y
era el que hacía que sonara igual de metálica en un equipo que tiene voces
buenas instaladas:

* **`Microsoft Álvaro Online (Natural)`** —la mejor voz masculina en español que
  ofrece Edge— **no se reconocía como masculina**. El patrón usaba `\b`, que sólo
  marca frontera entre `[A-Za-z0-9_]` y lo demás: delante de una `Á` no hay
  frontera ninguna y la comparación fallaba en silencio. Lo mismo por detrás con
  `Lucía` o `Mónica`. Ahora la frontera se escribe con letras Unicode.
* Y **no se prefería la voz neuronal del sistema sobre la de escritorio**: se
  tomaba la primera que cumpliera el género, de modo que en un equipo con `Pablo`
  (escritorio, metálica) y `Álvaro Online (Natural)` al lado, salía la metálica.

Ahora se puntúan todas las voces en español que ofrezca el navegador
—varón 16 · variante `es-ES` 8 / América 4 · natural 2 · no femenina 1— y gana
la mejor. El género sigue mandando (el avatar es Alex) y la variante sigue por
delante del timbre; lo nuevo es que, a igualdad, **la neuronal gana a la de
escritorio**. A una voz natural, además, ya no se le baja el tono: bajarlo era
justo lo que le devolvía el timbre metálico.

La pantalla distingue ahora los tres casos, con su nombre:

```
voz neuronal (google)
voz natural del navegador: Microsoft Álvaro Online (Natural) — Spanish (Spain)
   · sin voz neuronal: falta GOOGLE_TTS_API_KEY en el servidor
voz del navegador: Microsoft Helena Desktop — Spanish (Spain)
   · sin voz neuronal: falta GOOGLE_TTS_API_KEY en el servidor
```

Diez comprobaciones nuevas fijan la elección pasándole al elector **las listas de
voces que devuelven de verdad Edge y Chrome en Windows**, no leyendo el código.

### 4. Y una comprobación que se había quedado mirando al renglón anterior

`qa/navegador.mjs` buscaba el tachado con `document.querySelector(".pz-animada")`
—en singular—, es decir, siempre en el **primer** panel animado. Cuando escribir
la resta y tacharla pasaron a ser dos tiempos con un renglón cada uno, el tachado
se mudó al segundo, y la batería se quedó esperando 60 s algo que estaba justo
debajo. Ahora busca el panel **que tiene el tachado**, y espera 120 s, que es lo
que tarda la lección con la voz real del navegador marcando el ritmo.

Es el tipo de fallo que sólo aparece corriendo las baterías enteras después de
cada cambio, no sólo la del hito.

## 49. Decimotercera ronda: la regla general de `ax + b = c`, sin desfase

El cliente lo pidió como **regla, no como parche**: «no podemos seguir parcheando
paso a paso para un ejercicio específico; se requiere una regla general
algorítmica para ecuaciones de la forma `ax + b = c` que garantice sincronización
estricta entre lo que dice la locución y lo que dibuja la pizarra».

Y tenía razón en que no la había del todo: los tres primeros tiempos sí estaban,
pero **la división iba un renglón adelantada**.

### La causa: el motor habla y DESPUÉS escribe

La frase del paso *k* acompaña a la línea *k−1*, que es la que el alumno tiene
delante. Para la resta y la cancelación eso encaja. Para la división no:

| se oía | y en la pizarra estaba |
| --- | --- |
| «dividimos ambos lados entre 2» | `2x = 10` — donde **sólo hay un 2 que señalar** |
| «al dividir queda x = 5» | `2x/2 = 10/2` — **la respuesta, antes de su renglón** |

Las dos capturas del cliente son exactamente esas dos filas.

### La regla, ahora

Cada frase se corrió un renglón, y el resultado es el algoritmo que pidió, igual
para **cualquier** `ax + b = c` —con paréntesis, con denominador, con la incógnita
a los dos lados o con solución fraccionaria—:

| # | la pizarra enseña | la voz dice | marcas |
| --- | --- | --- | --- |
| 1 | `2x + 6 − 6 = 16 − 6` | «Restamos 6 en los dos lados» | **2 cajas**, una por miembro |
| 2 | `2x + 6̶ − 6̶ = 16 − 6` | «A la izquierda se cancela +6 con −6…» | tachado, dentro de un miembro |
| 3 | `2x = 10` | «Ahora la x está multiplicada por 2…» | 1 caja · etiqueta **`× 2`** |
| 4 | `2x/2 = 10/2` | «Dividimos los dos lados entre 2» | **2 cajas** · etiqueta **`÷ 2`** |
| 5 | `x = 5` | «¡Y listo! Resultado final: x = 5» | recuadro + visto |

Medido en un Chrome de verdad sobre el ejercicio del cliente, ése es el registro
que sale: `cajas: 2` en el tiempo 1, `cajas: 1` y `× 2` en el 3, `cajas: 2` y
`÷ 2` en el 4.

### Y la etiqueta ya no contradice a su propio pie

Sobre el `2` de `2x = 10` ponía **`÷ 2`** mientras el pie decía «la x está
multiplicada por 2» —«pero sólo divide al 2x, y no al 10», anotó el cliente sobre
la captura—. Es que ahí todavía no se divide nada: esa caja enseña la
multiplicación que hay que deshacer. Ahora la etiqueta dice `× 2`, y el `÷ 2`
aparece **sólo** en el renglón donde la división está escrita en los dos
miembros.

Como la cancelación, la frase de la división se construye **una sola vez**
(`fraseDivisionEnDosLados`) y la usan el motor y la pizarra: si se separaran, los
denominadores se marcarían cuando el tutor ya está en otra cosa. La batería lo
fija letra por letra.

### 2. La voz neuronal: la clave exacta

> «Confírmame qué clave exacta (GOOGLE_TTS_API_KEY o ELEVENLABS_API_KEY) debo
> registrar en Vercel.»

**`GOOGLE_TTS_API_KEY`**. Pero el nombre solo no basta —hay dos formas de
ponerla y que siga sin sonar—, así que ahora lo contesta el propio endpoint:

```
GET /api/voz
{
  "disponible": false,
  "motivo": "sin_configurar",
  "ayuda": "Defina UNA de estas dos en Vercel → Settings → Environment Variables →
            Production, y vuelva a desplegar: GOOGLE_TTS_API_KEY = clave de API de
            Google Cloud (empieza por «AIza…», NO es el JSON de una cuenta de
            servicio) del proyecto que tenga habilitada la API «Cloud
            Text-to-Speech»; o ELEVENLABS_API_KEY = clave de ElevenLabs. Después
            compruebe que FUNCIONA en /api/voz?probar=1: responde {prueba:\"ok\"}
            o el error exacto del proveedor."
}
```

Las dos maneras de equivocarse son pegar el JSON de una cuenta de servicio en vez
de una clave de API, y crear la clave sin habilitar la API de Text-to-Speech en
ese proyecto: en los dos casos la variable **está** puesta y la voz sigue sin
sonar. Por eso `?probar=1` sintetiza una palabra de verdad y devuelve el error
literal del proveedor.

Lo que **no** se puede hacer es servir audio neuronal sin proveedor: no existe un
endpoint gratuito y con licencia para producción. Mientras la clave no esté, el
tutor habla con la mejor voz que ofrezca el navegador —desde la ronda anterior,
la neuronal del sistema si la hay— y la pantalla dice, con su nombre, qué falta.

## 50. Decimocuarta ronda: el sitio de la pizarra, repartido

La sincronización quedó resuelta —«probamos la sincronización de la pizarra con
la voz del avatar en pantalla completa y la secuencia animada quedó muy bien»—, y
lo que llegó esta vez fue de diseño visual: **tres observaciones sobre el uso del
espacio**, todas ciertas y todas reproducidas aquí antes de tocar nada.

Medido en un Chrome de verdad sobre el ejercicio de la captura,
`2(x + 4) = 3x − 1`, en proyección a 1536×864 (que es un 1920×1080 con la escala
de Windows al 125 %):

| | antes | después |
| --- | --- | --- |
| `2x + 8 − 3x = 3x − 1 − 3x` | partida en **dos renglones** | **una sola línea** |
| Alto que sobra por debajo del borde | **308 px** | 31 px, y ninguno a ciegas |
| Pasos que se quedaban fuera de la pantalla | 2 (y la respuesta final) | **ninguno** |
| Ancho de las columnas | 627 / 627 | **527 / 728** |

Y a 1920×1080 el ejercicio entero **cabe en una pantalla sin desplazar nada**:
0 px de sobra.

### 1. «La fuente matemática está demasiado grande»

Tenía dos causas, y las dos se arreglan por separado.

**La escala base.** Estaba en 48–64 px porque el informe pedía «fórmulas ≥ 48 px»
para que se lean desde el fondo del aula. Con ese tamaño, un despeje de ocho
renglones no entra en una pantalla. Baja un escalón, a **36–52 px**: sigue al
doble de los 24 px con los que el propio informe mide un rótulo legible en
proyección, y lo que se gana es alto —ocho renglones donde antes cabían seis—.

**Y partir ya no es la primera salida.** Cuando una línea no cabía de ancho, esta
pizarra sólo sabía **partirla** (`partirLaMasLarga`), y eso es lo que produjo el
`2x + 8 − 3x` / `= 3x − 1 − 3x` de la captura. Una ecuación quebrada se lee peor
que una ecuación pequeña, así que ahora **ese renglón —y sólo ése— se encoge**
hasta que quepa entero, con un suelo de tres cuartos de su tamaño
(`ENCAJE_MINIMO`). Partir sigue existiendo, como último recurso, para la línea
que ni encogida al suelo entra.

El encaje va en `em`, así que se compone con el tamaño de cada pantalla en vez de
sustituirlo, y al cambiarlo el `ResizeObserver` del panel vuelve a medir las
cifras: los recuadros y los tachados siguen donde están las letras.

### 2. «Conviene balancear mejor el ancho útil entre ambas columnas»

Estaban al **50/50**, y las dos no llevan lo mismo ni por diseño: en el Ambiente 1
van el planteamiento y **un** paso —líneas cortas—, y por el Ambiente 2 baja la
cadena entera, con los renglones más largos que tiene un despeje. Ahora se
reparten **42/58**. La proporción es la del contenido, y los dos paneles siguen
siendo continuos y visibles a la vez, que es lo que pedía el informe.

### 3. «Los últimos pasos y el resultado final quedan ocultos debajo»

La pizarra **se desplaza sola, suavemente, al renglón que se está explicando**, y
`block: "nearest"` hace que no se mueva nada si ese paso ya se ve.

De las dos salidas que apuntaba el cliente —autodesplazamiento o «limpiar etapas
intermedias»— se toma la primera. Borrar lo ya explicado contradice al informe
(«todos los pasos deben permanecer en pantalla simultáneamente al concluir la
explicación») y es justo lo que en su día se leyó como que la pizarra se borraba
sola.

Un detalle que costó encontrar: **un paso no tiene su altura definitiva cuando se
vuelve activo**. Las fuentes de KaTeX llegan después, una fracción crece al
componerse y un renglón que no cabía se encoge en una segunda pasada. Mirando
sólo al principio, la línea del cierre —`x = 5` con su cápsula, su visto y su
frase— se quedaba **35 px por debajo del borde**: precisamente la respuesta
final. Ahora se vuelve a acercar en el fotograma siguiente, a los 350 ms y cada
vez que ese renglón cambia de tamaño.

### Lo que queda fijado

Dos comprobaciones nuevas en las ocho clases de Chrome, y siete en la batería del
hito:

* **R5-01** — ninguna ecuación se parte en dos renglones. Se cuenta el número de
  rectángulos que devuelve cada fórmula: un elemento en línea da **uno por
  fragmento de línea**, así que contarlos es contar los renglones que ocupa.
* **R5-03** — el paso que se está explicando se ve **entero**, sin desplazar a
  mano. Con una excepción honesta: un paso más alto que la propia pizarra —una
  nota de prosa larga— no cabe entero y de ése se exige lo que sí se puede dar,
  que empiece a la vista.
* **OBS-08** pasa de «los dos ambientes miden lo mismo» a «el ancho se reparte
  42/58, y el panel de desarrollo es el más ancho».
* **SUB-PRJ-03** baja su suelo de 48 a 36 px, con el porqué escrito al lado.

Y dos cosas que la pasada de las ocho clases sacó a la luz, y que ninguna prueba
de una sola clase habría visto:

* Las **palabras dentro de una fórmula** —«llevamos 1», «Resultado:»— se miden en
  `em` contra ella, así que bajaron con la escala base: 0,52 × 37 px son 19 px,
  por debajo del mínimo de 24. Ahora llevan su suelo en píxeles
  (`max(1.5rem, 0.52em)`): el factor manda cuando la fórmula es grande, el suelo
  cuando no.
* **En un móvil no hay dos columnas que repartir.** Por debajo de 640 px los dos
  ambientes se apilan a todo el ancho, y ahí lo que toca es que midan lo mismo.
  OBS-08 comprueba el 42/58 cuando van al lado y la igualdad cuando van apilados.

## 51. Decimoquinta ronda: los cuatro puntos de la prueba a fondo en producción

Con la voz neuronal ya conectada —`GOOGLE_TTS_API_KEY` puesta en Vercel, y
`/api/voz` respondiendo `{"disponible": true, "proveedor": "google"}`—, el
cliente probó el flujo entero en producción y trajo cuatro observaciones.

### 1. Los papeles de los dos ambientes… y la regla al revés

Las dos primeras reglas son las de la ronda anterior, y ya estaban hechas:
Ambiente 1 el hilo conductor limpio, Ambiente 2 **exclusivamente** los cálculos
de apoyo, desgloses, operaciones inversas y cancelaciones.

La tercera **cambia de sentido**. En la ronda anterior decía:

> «El Ambiente 2 debe limpiarse o refrescarse para dar paso al siguiente cálculo
> auxiliar.»

y ahora:

> «Regla de persistencia: cuando concluye una operación auxiliar y su resultado
> se traslada formalmente al siguiente renglón del Ambiente 1, el Ambiente 2 **NO
> debe limpiarse**. Las operaciones auxiliares deben permanecer visibles para que
> el estudiante pueda revisar y comprender la evolución progresiva de todo el
> desarrollo.»

Manda la de ahora: **nada se borra**, ni en una columna ni en la otra. Se han
retirado, por tanto, el borrado por bloques y las dos piezas que existían sólo
para descongestionar la columna derecha —el relevo del hilo al Ambiente 2 cuando
el 1 se llenaba, y el cuadro flotante «Borrador»—. Con «exclusivamente» en la
definición del Ambiente 2, ese relevo además ya no cabía.

Lo que evita que haya que ir a buscar un paso sigue en pie: la pizarra **se
desplaza sola al renglón que se está explicando**.

### 2. Dos voces a la vez

> «Ocasionalmente se escuchan dos voces al mismo tiempo: la voz neuronal actual
> (Google Cloud TTS) montada sobre la voz sintética básica del navegador.»

El diagnóstico del cliente era exacto, y las dos causas que apuntaba se daban:

* al arrancar el audio neuronal **no se cancelaba la cola del navegador**;
* y dos eventos asíncronos podían solaparse: un MP3 que tardaba en llegar sonaba
  cuando la frase siguiente ya había empezado.

Empezar una locución hace ahora dos cosas antes de nada: **callar lo que estuviera
sonando** por las dos vías (`speechSynthesis.cancel()` y `pause()` del
reproductor neuronal) y **tomar un número de turno**. Todo lo que llega después
por la vía asíncrona comprueba que sigue siendo su turno; si no lo es, se calla.

### 3. «Más difícil» tiene que ser más difícil

> «Al pulsar "Más difícil", el sistema únicamente reemplaza el ejercicio por otro
> de estructura idéntica (7x + 6 = 1x + 36 por 5x + 12 = 1x + 44).»

Cierto: los cuatro peldaños generados eran todos `ax + b = cx + d` con otras
cifras. Ahora cada peldaño pide una **técnica** más, como ya hacía la escalera de
factorización:

| peldaño | técnica nueva | ejemplo |
| --- | --- | --- |
| 1 | coeficiente **negativo** al otro lado | `3x + 2 = -x + 10` |
| 2 | **paréntesis**: hay que repartir antes de despejar | `3(x + 3) = 2x + 13` |
| 3 | **término fraccionario**: hay que quitar el denominador | `x/3 + 6 = 11` |
| 4 | **paréntesis en los dos lados** | `2(x + 4) = 3(x + 1)` |

Todo lo generado se construye **desde su solución**, entera por construcción, para
que el motor determinista pueda resolverlo y calificarlo sin recurrir a la IA.
`qa/rigor.mjs` recalcula cada peldaño: 31.371 afirmaciones, 0 incorrectas.

### 4. Notación canónica y el «por qué» de cada paso

**«1x» no existe.** Salía del generador, que construía el lado derecho con un
coeficiente que podía valer 1. Los coeficientes unitarios se escriben ahora como
manda el álgebra: `x`, y `-x`. De paso se cerraron dos agujeros del mismo sitio:
un paréntesis vacío (`4(x)` → `4x`) y dos ecuaciones que salían como identidades
(`2(x + 6) = 2x + 12`, verdadera para cualquier x y por tanto sin nada que
despejar).

**Y el avatar explica para qué opera, no sólo qué hace.** Cada frase abre con el
propósito:

| antes | ahora |
| --- | --- |
| «Primero juntamos los términos con x en el lado izquierdo: restamos x en los dos lados.» | «**Para cancelar la x del miembro derecho y agrupar las incógnitas a la izquierda**, restamos x en ambos miembros de la ecuación.» |
| «Para despejar, restamos 12 en ambos lados (operación inversa).» | «**Para despejar el término con la x, aplicamos el inverso aditivo**: restamos 12 en ambos miembros.» |
| «Dividimos los dos lados entre 4.» | «**Aplicamos la operación inversa**: dividimos los dos lados entre 4.» |

La frase de la división sigue siendo **letra por letra** la misma que la pizarra
pone en el pie del renglón, porque el panel sigue a la voz comparando lo dicho
con cada foco; y a la lista de palabras con las que reconoce la marca uniforme se
le añadió «ambos miembros», que es como se dice ahora.
