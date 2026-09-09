# MVP 2 · HITO 2 — Pizarra KaTeX Animada y Avatar Dinámico Enriquecido

Entrega del segundo hito. Todo lo que sigue está implementado, compilado y
verificado con la suite del proyecto: **3.588 comprobaciones automáticas, 0
fallos** (`npm test`, código de salida 0), de las cuales **329 son nuevas** y
específicas de este hito (`qa/hito2.mjs`) y **12 se ejecutan dentro de un
Chrome de verdad** (`qa/navegador.mjs`).

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
