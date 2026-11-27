# PMV 3 · Hito 5A (cierre) — Agente de IA y editor de fichas de método versionadas

Completa el Hito 5A con lo que pedía el Word y faltaba. La primera entrega cubría el editor de procedimientos (ejemplos resueltos paso a paso, ver [`ENTREGA_PMV3_HITO2.md`](ENTREGA_PMV3_HITO2.md)); aquí se añade la **ficha de método**: un método *generalizable* que se aplica a cualquier problema que encaje con su patrón.

## Qué pide el Word y qué hay

| Pide el Word | Qué hay |
| --- | --- |
| Que el docente defina **cuándo se aplica un método, qué pasos sigue y qué pistas ofrece**, a mano o pidiendo un borrador a la IA | Editor en [`/docente/metodos`](app/docente/metodos/page.tsx) ([`gestor-fichas.tsx`](components/docente/gestor-fichas.tsx)) y agente en `POST /api/docente/fichas-metodo/borrador-ia`. |
| **Fichas versionadas** con **patrón de entrada, condiciones, variables, pasos ordenados, operaciones admitidas, ejemplos y pistas** | Tablas `fichas_metodo` y `fichas_metodo_versiones`; forma de la ficha en [`lib/docente/fichas-metodo.ts`](lib/docente/fichas-metodo.ts). Cada cambio de contenido crea una versión; restaurar una antigua crea otra nueva (no se reescribe el pasado). |
| **Gemini con salida estructurada**, formato validado con **Zod** | [`lib/docente/fichas-ia.ts`](lib/docente/fichas-ia.ts): `responseSchema` de Gemini + `fichaSchema` de Zod. Si Zod rechaza la respuesta, se le devuelven los errores a Gemini (hasta 2 veces); si aun así no cumple, **no se guarda nada**. |
| **Comprobar las operaciones soportadas con el motor matemático** | [`lib/docente/fichas-verificar.ts`](lib/docente/fichas-verificar.ts): cada operación declarada se contrasta con el catálogo del motor del tema, y **cada paso** de la ficha se verifica con el motor en los ejemplos *y* en casos que genera el servidor. |
| **Guardar el borrador para revisión** y **publicar en el banco privado con aprobación docente** | Todo nace `BORRADOR`. Publicar exige `aprobar: true` (la casilla «He revisado la ficha y la apruebo»), queda `aprobadaPorId/aprobadaEn` y una entrada en la auditoría. |
| **Marcar los casos pendientes de validación automática** | `pendienteValidacion` en la ficha y `pendientes[]` en el informe, con código y motivo (ver abajo). |

## La ficha son datos, no código

```
patrón      ({~a}x^{m}{+b})^{n}            ← cuándo se aplica
variables   a, m, b, n (y las calculadas: l = mcm(b, d))
condiciones a >= 1 · m >= 2 · b != 0 · n >= 2
pasos       u = {~a}x^{m}{+b}
            {n}({~a}x^{m}{+b})^{n-1} · {~a*m}x^{m-1}
            {n*a*m}x^{m-1}({~a}x^{m}{+b})^{n-1}
operaciones cadena, potencia
pista error omiteFactor {~a*m}x^{m-1}  →  «Te falta la derivada de la función interior…»
```

Las plantillas se interpretan con un analizador propio (números, variables, `+ - * / % ^`, comparaciones, `&&`, `||` y `mcd`, `mcm`, `abs`, `min`, `max`). **No hay `eval`**: `process.exit(1)`, `constructor`, `a; b` o `a[0]` se rechazan (probado). Cada `{…}` debe dar un **entero**; la división entre cero y los resultados desproporcionados se rechazan.

## Cómo la verifica el servidor

1. **Estructura:** las variables del patrón están declaradas, ninguna sobra, y las plantillas sólo nombran variables que existen.
2. **Operaciones:** se contrastan con lo que el motor del tema sabe comprobar.
3. **Ejemplos:** cada uno encaja con el patrón, cumple las condiciones, se resuelve con la ficha y **cada paso se verifica con el motor** (`verificarPasos`, con segunda fuente independiente).
4. **Casos generados:** el servidor genera casos del patrón (determinista) y repite la verificación. Es lo que demuestra que la ficha vale para *el método* y no sólo para los ejemplos que escribió su autor.

Un paso que el motor da por **incorrecto** es un **error** (no se publica). Lo que el motor **no sabe juzgar** es un **pendiente**:

| Código | Cuándo |
| --- | --- |
| `SIN_MOTOR` | El tema no tiene motor. |
| `OPERACION_NO_SOPORTADA` | Una operación declarada que el motor del tema no comprueba. |
| `EJEMPLO_NO_VERIFICABLE` / `CASO_NO_VERIFICABLE` | El motor no pudo comprobar todos los pasos. |
| `PISTA_NO_COMPROBABLE` | Reservado para pistas de error que el motor no pueda evaluar. |

**Reglas de publicación:** con errores, nunca. Con pendientes, un docente puede publicar **confirmándolo expresamente**; un **borrador de IA con pendientes no se publica ni confirmándolo**.

## La demostración del Word

| Paso | Resultado |
| --- | --- |
| 1. **«Suma de fracciones»** desde el panel (IA → revisar → aprobar → publicar) | Verificada por el motor en `1/2 + 1/3`, `3/4 + 1/6` y 8 casos generados; publicada. |
| 2. **Regla de la cadena** `(3x^2+1)^4` (tecleada a mano en el editor) | `u = 3x^2+1` → `4(3x^2+1)^3 · 6x` → `24x(3x^2+1)^3`. Verificada; publicada. |
| 3. **Pista si el alumno omite `6x`** | El criterio es matemático: *(respuesta del alumno) × (factor) equivale a la correcta*. Con `4(3x^2+1)^3` → «Te falta un factor: la derivada de la función interior 3x^2+1. Derívala y multiplícala.» La pista **no revela** `6x` ni `24x`. |
| 4. **Reutilizar con `(5x^3-2)^2`** | Sin tocar código: `u = 5x^3-2` → `2(5x^3-2) · 15x^2` → `30x^2(5x^3-2)`. El motor verifica los 3 pasos **y** el validador del banco valida el ejercicio; se puede guardar como ejercicio borrador. Omitir `15x^2` da la misma pista de error. |

Si el docente se equivoca (olvida el factor interior en el paso 2), el motor lo señala en el caso concreto en que falla y la ficha **no se publica**.

## Versiones y lo que ve el alumno

- La ficha tiene `version` (la de trabajo) y `publicadaVersion` (la que ven los alumnos). **Editar una ficha publicada no cambia lo que ven los alumnos** hasta que el docente la vuelve a aprobar.
- Historial: `GET …/versiones` (lista), `?version=N` (contenido), `POST …/versiones {version}` (restaurar → versión nueva, con nota «Restaurada de la versión N»).
- Ediciones simultáneas: se serializan con un cerrojo de PostgreSQL por ficha (6 ediciones a la vez → versiones 1…7 sin huecos ni duplicados; probado).
- Alumno: `/estudiante/metodos` (tarjeta en su portada). Sólo ve las fichas **publicadas** de los docentes de sus aulas y del catálogo; una ficha privada de otro docente responde **404**. La API **nunca devuelve la respuesta correcta**.

## Privacidad y consumo

- Una ficha privada no la ve, edita, borra, aplica ni restaura otro docente (404, no 403). Un SUPERADMIN sí. Una ficha ya publicada no se borra (409): se archiva.
- El agente de IA tiene tope por usuario (6 / 10 min) y por IP (18 / 10 min), como el resto de endpoints de Gemini.
- Sin `GEMINI_API_KEY` funciona en **modo demostración** (devuelve las fichas de referencia, y sólo esas), para probar el flujo sin gastar cuota.

## Evidencia

- `qa/pmv3-hito5a-fichas.mjs` · **121** comprobaciones: plantillas y patrón, verificación con el motor, pendientes, Zod y reparación de Gemini (simulado), API completa, versiones, alumno, privacidad, concurrencia y tope de consumo.
- `qa/pmv3-hito5a-navegador.mjs` · **36** comprobaciones en **Chrome real**: el docente pide el borrador de fracciones a la IA y lo publica; **teclea la regla de la cadena a mano**, la prueba, provoca y corrige un error, la reutiliza con `(5x^3-2)^2`, la publica, edita y restaura versiones; escritorio y móvil; el alumno omite `6x` y recibe la pista. Capturas en `qa/evidencia/` (`metodos-docente.png`, `metodos-docente-movil.png`, `metodos-alumno.png`).
- Migración aditiva `20261122100000_pmv3_hito5a_fichas_metodo` (dos tablas); marcha atrás en la cabecera del SQL.

## Límites (a decir con franqueza)

- **Comprobación con Gemini real (25-nov-2026):** una llamada real (`gemini-2.5-flash`, «Regla de la cadena», ejemplo `(3x^2+1)^4`) devolvió la ficha `({~a}x^{m}{+b})^{n}`, necesitó 1 reparación de Zod y el motor la verificó sin errores ni pendientes. Sigue sin probarse con volumen ni con otros temas. Lo anterior de este punto: el entorno de desarrollo corre sin clave para no gastar cuota. El agente está probado con respuestas de Gemini **simuladas** (incluidos los casos «no pasa Zod» y «el motor lo rechaza», que disparan la reparación) y con el modo demostración. La prueba con Gemini real —como la que se hizo en el Hito 2 con los procedimientos— queda para staging con la clave y un tope de gasto.
- El lenguaje de plantillas cubre expresiones **enteras** (`{n*a*m}`); fracciones dentro de una plantilla se escriben con dos huecos (`{s/g}/{l/g}`), y una simplificación a denominador 1 queda escrita `2/1`.
- Las pistas de error reconocen dos cosas: un **factor omitido** y una **respuesta errónea típica** (campo `respuestaErronea`, una plantilla: error de signo, de exponente…; se rechaza al verificar si en realidad equivale a la correcta). Otros errores se cubren con las pistas generales.
- ~~La ficha no se aplica todavía dentro de una tarea evaluable.~~ Resuelto en la ampliación del Hito 5A: ver [`ENTREGA_PMV3_HITO5A_FICHA_EN_TAREA.md`](ENTREGA_PMV3_HITO5A_FICHA_EN_TAREA.md).
