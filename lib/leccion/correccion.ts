// Ruta relativa, no el alias "@/": este módulo lo importan tanto Next.js (que
// resuelve el alias) como los scripts de qa/, que se ejecutan con Node a secas
// y no lo conocen. La ruta relativa funciona en los dos.
import {
  computeAnswer,
  computeDerivative,
  computeFactorization,
  solveFractionFromText,
  solveLinearFromText,
} from "../../src/preLight.js";
import { derivarExpresion } from "../matematicas/derivar.ts";
import { analizar, evaluar, formatearNumero, variablesDe } from "../matematicas/expresiones.ts";

/**
 * Resolución determinista de un ejercicio, en el servidor.
 *
 * El motor no tiene una única puerta de entrada: cada familia de ejercicios
 * tiene su propio solver, y `computeAnswer` sólo cubre aritmética y derivadas.
 * Usarlo para todo dejaba sin calificar las ecuaciones lineales y la
 * factorización —dos de los cinco temas— devolviendo "no verificable" para
 * ejercicios que el motor sí sabe resolver.
 *
 * El TEMA ACTIVO decide qué solver se aplica, y lo hace de forma EXCLUSIVA: una
 * expresión suelta como "x² - 9" se puede derivar o factorizar, y en una
 * sesión de factorización hay que factorizarla. Sin tema se prueban las
 * lecturas en el mismo orden que usa el núcleo heredado.
 */

type Solver = (expresion: string) => string | null;

/**
 * Derivación simbólica (MVP 2).
 *
 * El motor heredado sólo sabía derivar polinomios, porque leía la expresión con
 * expresiones regulares: `e^x` y `ln(x)` no encajaban en el patrón y el
 * ejercicio se marcaba como NO COMPROBABLE, que es justo lo que reportó el
 * cliente. Este solver lee la expresión como una gramática y aplica las reglas
 * del cálculo —potencia, producto, cociente, cadena, exponencial y logaritmo—,
 * así que cubre lo de antes y lo de ahora.
 *
 * El heredado se conserva DETRÁS: si algún día el analizador nuevo no supiera
 * leer una expresión que el viejo sí entendía, la lección no se queda sin
 * respuesta.
 */
const derivarSimbolico: Solver = (e) => derivarExpresion(e)?.expresion ?? null;

/** Derivar exige la palabra clave: `computeDerivative("3x²")` devuelve null. */
const derivar: Solver = (e) => computeDerivative(/deriv|d\s*\/\s*dx/i.test(e) ? e : `derivada de ${e}`);

const factorizar: Solver = (e) => computeFactorization(/factoriz/i.test(e) ? e : `factoriza ${e}`);

/**
 * Aritmética, con el evaluador heredado y el analizador nuevo contrastados.
 *
 * El heredado calcula con fracciones EXACTAS —"1/2 + 1/4" da "3/4", no 0.75—, y
 * por eso sigue siendo el primero. Pero no entiende las potencias: para
 * "2^3 + 1" devuelve 4, y para "5·(-3)" no devuelve nada. Un ejercicio con una
 * potencia acababa con el alumno corregido contra un número equivocado, que es
 * la clase de fallo que este proyecto no se permite.
 *
 * Así que se calcula también con el analizador nuevo, que sí tiene gramática y
 * precedencia, y se comparan:
 *
 *   · coinciden           → vale la del heredado, que conserva la fracción exacta;
 *   · discrepan           → vale la del analizador, que es la que sabe leer la expresión;
 *   · el heredado no sabe → vale la del analizador.
 *
 * Sin acuerdo entre los dos, no se responde: eso es lo que significa devolver null.
 */
const aritmetica: Solver = (expresion) => {
  const heredada = seguro(() => computeAnswer(expresion));
  const arbol = analizar(expresion);
  const nueva =
    arbol && variablesDe(arbol).length === 0 ? seguroNumero(() => evaluar(arbol, {})) : null;

  if (heredada == null) return nueva;
  if (nueva == null) return heredada;

  const comoNumero = Number(analizar(heredada) ? evaluar(analizar(heredada)!, {}) : NaN);
  const coinciden = Number.isFinite(comoNumero) && Math.abs(comoNumero - Number(nueva)) < 1e-9;
  return coinciden ? heredada : nueva;
};

function seguro(calcular: () => unknown): string | null {
  try {
    const r = calcular();
    const texto = r == null ? null : String(r).trim();
    return texto ? texto : null;
  } catch {
    return null;
  }
}

function seguroNumero(calcular: () => number): string | null {
  try {
    const valor = calcular();
    return Number.isFinite(valor) ? formatearNumero(valor) : null;
  } catch {
    return null;
  }
}

const SOLVERS_POR_TEMA: Record<string, Solver[]> = {
  aritmetica: [aritmetica],
  fracciones: [solveFractionFromText, computeAnswer],
  lineales: [solveLinearFromText],
  ecuaciones_lineales: [solveLinearFromText],
  factorizacion: [factorizar],
  derivadas: [derivarSimbolico, derivar],
};

/** Orden de tanteo cuando no se sabe el tema, el mismo que aplica el núcleo. */
const SOLVERS_SIN_TEMA: Solver[] = [
  solveLinearFromText,
  solveFractionFromText,
  aritmetica,
  derivar,
  factorizar,
];

/**
 * Como `resolverEjercicio`, pero contando además QUÉ REGLAS se han aplicado.
 *
 * Lo usa el validador del panel docente para que el informe no diga sólo "sale
 * lo mismo", sino "comprobado con la regla del producto y la de la cadena". Al
 * docente le dice que el motor ha entendido su ejercicio, y no que ha acertado
 * de casualidad.
 */
export function resolverConDetalle(
  ejercicio: string,
  tema?: string,
): { respuesta: string | null; reglas: string[] } {
  if (String(tema ?? "").trim().toLowerCase() === "derivadas") {
    const derivada = derivarExpresion(String(ejercicio ?? ""));
    if (derivada) return { respuesta: derivada.expresion, reglas: derivada.reglas };
  }
  return { respuesta: resolverEjercicio(ejercicio, tema), reglas: [] };
}

/**
 * Devuelve la solución del ejercicio, o `null` si el motor no lo cubre.
 *
 * Ese `null` es información, no un fallo: significa que no se puede calificar
 * con garantía. Devolver un veredicto inventado en ese caso sería exactamente
 * la alucinación que el validador determinista existe para evitar.
 */
export function resolverEjercicio(ejercicio: string, tema?: string): string | null {
  const expresion = String(ejercicio ?? "").trim();
  if (!expresion) return null;

  const clave = String(tema ?? "").trim().toLowerCase();
  const solvers = SOLVERS_POR_TEMA[clave] ?? SOLVERS_SIN_TEMA;

  for (const solver of solvers) {
    try {
      const resultado = solver(expresion);
      if (resultado != null && String(resultado).trim() !== "") return String(resultado);
    } catch {
      // Un solver que no sabe leer la expresión no debe tumbar la corrección:
      // se pasa al siguiente.
    }
  }
  return null;
}
