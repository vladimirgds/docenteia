# PMV 3 · Hito 2 (cierre) — Orquestador pedagógico y validación de pasos

Completa el Hito 2 con lo que pedía el Word y faltaba (la primera entrega cubría el editor de procedimientos del docente, ver [`ENTREGA_PMV3_HITO2.md`](ENTREGA_PMV3_HITO2.md)).

## Qué pide el Word y qué hay

| Pide el Word | Qué hay |
| --- | --- |
| Servicio de servidor que lee **modo de aprendizaje, paso activo e intentos** | `lib/tutoria/practica-guiada.ts`: lee el estado de la práctica (guardado en BD), valida el paso, pide una decisión a `lib/tutoria/orquestador.ts` y la registra. El navegador sólo escribe pasos y pide ayuda: no decide qué se le revela. |
| Decide cuándo **explicar, preguntar, dar una pista o mostrar una solución** | `decidir()` (función pura): `EXPLICAR`, `PREGUNTAR`, `PISTA` (nivel 1 u 2), `MOSTRAR_PASO`, `MOSTRAR_SOLUCION`, `CONTINUAR`, `REGISTRAR`, `NEGAR`. |
| **Política de revelación** antes de entregar **texto, audio o instrucciones del LSG** | `aplicarPoliticaRevelacion()` filtra cada pieza (texto + audio + LSG a la vez) según lo que la decisión permite revelar: `nada < pista < paso < solución`. Es la última puerta: aunque el armado de la respuesta incluyera la solución por error, no sale (probado). |
| Extender el validador a **transformaciones intermedias**, identificar el **primer paso incorrecto** | `lib/matematicas/pasos-alumno.ts`: `validarTransformacion` (expresiones y ecuaciones) y `primerPasoIncorrecto`. |
| **Registrar el motivo** de cada decisión | Tabla `decisiones_pedagogicas`: evento, acción, código de razón, motivo en palabras, nivel de ayuda, hasta dónde se reveló, paso, la entrada completa (modo, paso, intentos, causa del error) y cuántas piezas retuvo la política. |

## Modos de aprendizaje (propuesta, a confirmar con el cliente)

| Modo | Qué recibe el alumno |
| --- | --- |
| `EXPLICACION` | El tutor presenta el procedimiento: se revela todo. |
| `PRACTICA_GUIADA` | 1.er fallo: se explica el error. 2.º: pista orientadora. 3.º: pista concreta. 4.º: se **muestra el paso**. **Nunca** se entrega la solución completa de golpe. |
| `PRACTICA_LIBRE` | Pistas a demanda; la solución completa llega tras agotar las pistas. |
| `EVALUACION` | Sin pistas ni soluciones (se niegan); las respuestas sólo se registran, sin decir si estaban bien. |

Los umbrales (`UMBRALES` en `orquestador.ts`) se pueden cambiar sin tocar la lógica. **Pendiente del cliente:** confirmar los modos y cuántas pistas antes de mostrar un paso o la solución.

## Demostración del Word (`2(x+4)=3x-1`)

- **Acepta** `2x+8=3x-1` (y `2x-3x=-1-8`, `-x=-9`, `x=9`, `3x-1=2x+8`, `4x+16=6x-2`…).
- **Rechaza** `2x+4=3x-1` y **explica el error**: «Al quitar el paréntesis de 2(x + 4), el 2 multiplica a TODOS los términos: 2·x + 2·4. En tu paso el 4 quedó sin multiplicar.» Sin escribir el paso correcto.
- Otros errores con explicación propia: un término que cambia de lado sin cambiar de signo, un signo mal repartido en `−(x−3)`, un lado que cambió de valor, un cambio de solución.
- **Pide la solución en práctica guiada** → recibe la ayuda prevista por la política: una pista; a la siguiente, otra más concreta; sólo tras esfuerzo, el **paso** (nunca la solución completa).
- Cada decisión queda registrada y el docente la ve en `/docente/tutoria` («Prácticas guiadas») y en `GET /api/docente/practicas-guiadas`.

## Dónde se usa

Página del alumno `/estudiante/practica-guiada` (tarjeta en su portada): escribe una ecuación lineal, elige el modo y resuelve paso a paso. Verificada en **Chrome real** en escritorio y móvil (capturas en `qa/evidencia/`).

## Evidencia

- `qa/pmv3-hito2-orquestador.mjs` · **82** comprobaciones (validador, orquestador, política de revelación, servidor, registro, concurrencia, panel del docente).
- `qa/pmv3-hito2-navegador.mjs` · **16** comprobaciones en Chrome real (escritorio, móvil, evaluación).
- Migración aditiva `20261120200000_pmv3_hito2_orquestador` (tablas `practicas_guiadas` y `decisiones_pedagogicas`); marcha atrás en la cabecera del SQL.

## Límites

- El tutor guía **ecuaciones lineales de una incógnita** (la validación de transformaciones también funciona con expresiones y con ecuaciones no lineales, pero sin resolución modelo ni pistas). Otras ramas (factorización, derivadas) se pueden añadir sobre el mismo orquestador.
- La práctica guiada es una actividad propia del alumno; todavía no cuelga de una tarea evaluable (la integración con las tareas y la tutoría por habilidad llega con el Hito 4).
- La voz del tutor (`salida.audio`) se entrega en la respuesta; reproducirla con la pizarra sincronizada llega con el Hito 3.
