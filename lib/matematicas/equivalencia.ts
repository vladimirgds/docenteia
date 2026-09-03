import { analizar, evaluar, variablesDe, type Nodo } from "./expresiones.ts";
import { pareceMatematica } from "./index.ts";
import { checkAnswer } from "../../public/pseLight.js";

/**
 * ¿SON LA MISMA RESPUESTA?
 *
 * El corrector del PMV 1 comparaba textos con reglas de normalización: ordenaba
 * los términos de un polinomio, aceptaba "x^3" por "x³" y poco más. Con eso,
 * `e^x + 2x` y `2x + e^x` eran respuestas distintas, y el alumno que escribía la
 * segunda recibía un "incorrecto" que no se merecía.
 *
 * Aquí la pregunta se responde de otra forma: dos expresiones son la misma
 * respuesta si son LA MISMA FUNCIÓN, y eso se comprueba evaluándolas en varios
 * puntos. Reordenar términos, sacar factor común, escribir 3.5 en vez de 7/2 o
 * 2·e^x en vez de e^x + e^x deja de importar, porque ninguna de esas cosas
 * cambia el valor de la función.
 *
 * DÓNDE ESTÁ EL LÍMITE, DICHO CLARAMENTE
 *
 *   · Los puntos de prueba son POSITIVOS, porque ln y la raíz no existen a la
 *     izquierda del cero. Dos expresiones que sólo difieren para x negativo
 *     —ln(x²) y 2·ln(x)— se aceptan como iguales. Para un ejercicio de aula es
 *     lo correcto; conviene saber que es una decisión y no un descuido.
 *   · Cuando se esperaba una FACTORIZACIÓN y el alumno responde sin factorizar,
 *     no se compara por valor: "x² - 9" vale lo mismo que "(x - 3)(x + 3)" y no
 *     es la respuesta a un ejercicio que pide factorizar. Ese caso lo sigue
 *     juzgando el corrector del PMV 1, que exige la forma factorizada.
 *   · Al revés no se protege: si se esperaba la forma desarrollada y el alumno
 *     entrega la factorizada, se acepta. Es una decisión consciente —ninguno de
 *     los cinco motores plantea ejercicios de "desarrollar", y rechazar por la
 *     forma fabricaría falsos negativos justo en lo que el cliente pidió
 *     arreglar—; si algún día hay un motor de desarrollo, aquí hay que volver.
 *   · Lo que no se deja leer como expresión —"8 metros por segundo", "la
 *     respuesta es 4"— también vuelve al corrector heredado, que sabe
 *     interpretar frases.
 */

/** Puntos de prueba: positivos, irracionales a ojo y sin repetir la escala. */
const PUNTOS = [0.317, 0.734, 1.213, 1.879, 2.457, 3.121, 4.023, 5.611, 7.219, 9.043];

/** Cuántos puntos válidos hacen falta para dar un veredicto. */
const MINIMO_PUNTOS = 4;

/** Dos valores son el mismo si se separan menos que esto, en relativo. */
const TOLERANCIA = 1e-9;

/**
 * Compara dos expresiones como funciones.
 *
 * Devuelve `true`/`false` cuando puede decidir, y `null` cuando no: alguna de
 * las dos no se deja leer, o no quedan puntos donde ambas estén definidas. Ese
 * `null` es lo que hace que quien llama pase el caso al corrector heredado en
 * lugar de dar por incorrecta una respuesta que quizá no lo sea.
 */
export function equivalentes(a: string, b: string): boolean | null {
  const izq = analizar(normalizar(a));
  const der = analizar(normalizar(b));
  if (!izq || !der) return null;

  const variables = [...new Set([...variablesDe(izq), ...variablesDe(der)])];

  // Sin variables es una comparación de números: 7/2 y 3.5, o 12 y 6·2.
  if (variables.length === 0) {
    const va = evaluar(izq, {});
    const vb = evaluar(der, {});
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return null;
    return cerca(va, vb);
  }

  let comparados = 0;
  for (const punto of PUNTOS) {
    // Cada variable toma un valor distinto: si tomaran el mismo, "x + y" y
    // "2x" darían siempre lo mismo y se aceptarían como equivalentes.
    const valores: Record<string, number> = {};
    variables.forEach((v, i) => {
      valores[v] = punto + i * 0.611;
    });

    const va = evaluar(izq, valores);
    const vb = evaluar(der, valores);
    // Donde una de las dos no está definida no hay nada que comparar: se pasa
    // al punto siguiente en lugar de contar el caso como una diferencia.
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;

    comparados++;
    if (!cerca(va, vb)) return false;
  }

  return comparados >= MINIMO_PUNTOS ? true : null;
}

function cerca(a: number, b: number): boolean {
  const escala = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= TOLERANCIA * escala;
}

/**
 * Quita lo que envuelve a una respuesta sin formar parte de ella.
 *
 * El alumno escribe "y = 2x + 1" o "f'(x) = e^x", y el docente escribe la
 * respuesta pelada. Comparar esas dos cadenas tal cual es comparar la etiqueta,
 * no la respuesta.
 */
export function normalizar(respuesta: string): string {
  return String(respuesta ?? "")
    .trim()
    .replace(/^(?:y|f\s*'\s*\(\s*[a-z]\s*\)|f\s*'|dy\s*\/\s*dx|d\s*\/\s*d[a-z]|[a-z])\s*=\s*/i, "")
    .replace(/[.;,]+$/, "")
    .trim();
}

/**
 * ¿Esta respuesta está escrita en forma FACTORIZADA?
 *
 * Se pregunta al árbol, no al texto. Buscar un paréntesis parecía suficiente y
 * no lo era ni de lejos: "1 + ln(x)" lleva paréntesis y no es una
 * factorización, y "2/(2x)" o "1/(2·sqrt(x))" —la derivada de la raíz— tampoco.
 * Tratarlas como tales las mandaba al corrector heredado, que no sabe leerlas, y
 * daba por incorrectas respuestas correctas. Justo el fallo que se venía a
 * arreglar, reaparecido por la puerta de atrás.
 *
 * Factorizada es un PRODUCTO cuyos factores son sumas: (x - 3)(x + 3), x(x + 7),
 * (x - 5)². Lo demás no lo es.
 */
export function esFactorizacion(texto: string): boolean {
  const arbol = analizar(texto);
  // Si no se deja leer, queda el indicio textual de toda la vida: ")(" .
  if (!arbol) return /\)\s*\(/.test(texto);
  return esProductoDeFactores(arbol);
}

function esSuma(nodo: Nodo): boolean {
  return nodo.tipo === "suma" || nodo.tipo === "resta";
}

function esProductoDeFactores(nodo: Nodo): boolean {
  switch (nodo.tipo) {
    case "producto":
      return (
        esSuma(nodo.izq) ||
        esSuma(nodo.der) ||
        esProductoDeFactores(nodo.izq) ||
        esProductoDeFactores(nodo.der)
      );
    case "potencia":
      // (x - 5)² es una factorización; x² no.
      return esSuma(nodo.base) || esProductoDeFactores(nodo.base);
    case "negacion":
      return esProductoDeFactores(nodo.arg);
    default:
      return false;
  }
}

export interface Comparacion {
  /** ¿Se ha podido juzgar? */
  conocido: boolean;
  correcto: boolean;
  /** Cómo se ha decidido, para el informe y para depurar. */
  via: "equivalencia" | "heredado";
}

/**
 * El veredicto que usan el corrector del alumno y el validador del docente.
 *
 * Primero intenta la equivalencia real; si no puede decidir —o si el ejercicio
 * es de factorizar, donde la FORMA es parte de la respuesta— delega en el
 * corrector heredado del PMV 1, que sigue siendo el que sabe leer frases,
 * unidades y binomios.
 */
export function compararRespuesta(dada: string, esperada: string): Comparacion {
  const respuesta = normalizar(dada);
  const referencia = normalizar(esperada);

  if (!referencia) return { conocido: false, correcto: false, via: "heredado" };
  if (!respuesta) return { conocido: true, correcto: false, via: "heredado" };

  // La vía simbólica sólo se usa sobre lo que ES matemática. Una respuesta en
  // prosa —"la respuesta es 4", "8 metros/segundo"— se dejaría analizar como un
  // producto de variables sueltas (l·a·r·e·s…) y saldría "incorrecta", que es
  // peor que no opinar: para eso está el corrector heredado, que sabe leerla.
  const analizable = pareceMatematica(respuesta) && pareceMatematica(referencia);

  // Cuándo manda la FORMA y no sólo el valor: sólo cuando se pedía una
  // factorización y el alumno no la ha hecho. Ese es el único caso en que dos
  // expresiones que valen lo mismo no son la misma respuesta —"x² - 9" no
  // responde a "factoriza x² - 9"—. Si las dos están factorizadas, se comparan
  // por valor como todo lo demás, y así "10·(2x + 1)^4" y "10(2x + 1)⁴" —la
  // derivada de (2x+1)^5, con paréntesis legítimos— dejan de ser respuestas
  // distintas por una tilde de multiplicar.
  const exigeFactorizar = esFactorizacion(referencia) && !esFactorizacion(respuesta);

  if (analizable && !exigeFactorizar) {
    const veredicto = equivalentes(respuesta, referencia);
    if (veredicto !== null) return { conocido: true, correcto: veredicto, via: "equivalencia" };
  }

  const heredado = checkAnswer(respuesta, referencia);
  return { conocido: heredado.known === true, correcto: heredado.correct === true, via: "heredado" };
}
