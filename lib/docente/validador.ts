import type { Tema } from "@prisma/client";

// Rutas relativas y con extensión, no el alias "@/": este módulo lo importan a
// la vez Next.js —que resuelve el alias— y los scripts de qa/, que se ejecutan
// con Node a secas. La ruta relativa funciona en los dos sitios.
import { computeAnswer } from "../../src/preLight.js";
import {
  analizar,
  escribir,
  evaluar,
  formatearNumero,
  variablesDe,
} from "../matematicas/expresiones.ts";
import { compararRespuesta } from "../matematicas/equivalencia.ts";
import { simplificar } from "../matematicas/derivar.ts";
import { resolverConDetalle } from "../leccion/correccion.ts";
import { CLAVE_POR_TEMA } from "../leccion/temas.ts";
import {
  colapsarSignos,
  combinaciones,
  huecosDe,
  revisarDeclaracion,
  sustituir,
  tieneHuecos,
  type Parametro,
  type Valores,
} from "./parametros.ts";

/**
 * VALIDADOR MATEMÁTICO EN SERVIDOR.
 *
 * Es el entregable central del HITO 1: "comprobar la consistencia
 * algebraica/aritmética antes de almacenar el contenido en base de datos".
 *
 * QUÉ COMPRUEBA, Y POR QUÉ ASÍ
 * Un ejercicio del banco tiene, como mucho, tres fuentes de verdad:
 *
 *   1. la respuesta que ESCRIBE el docente,
 *   2. la fórmula de respuesta de la plantilla, evaluada con aritmética exacta,
 *   3. la solución que CALCULA el motor determinista a partir del enunciado.
 *
 * El validador las enfrenta entre sí. Guardar un ejercicio cuya respuesta no
 * coincide con lo que el motor calcula es plantar una bomba de relojería: el
 * alumno resuelve bien, el corrector le dice que ha fallado, y el fallo no se
 * descubre hasta que alguien reclama. Por eso la discrepancia BLOQUEA el
 * guardado y se le enseña al docente con los números concretos.
 *
 * QUÉ NO HACE
 * No inventa veredictos. Si el tema no declara motor —o el motor no sabe leer
 * ese enunciado— el informe lo dice, el ejercicio se guarda SIN verificar y la
 * interfaz lo marca. Es la misma regla que gobierna la corrección del alumno en
 * el PMV 1: antes de calificar sin garantía, no calificar.
 *
 * La IA no interviene en ningún punto de esta validación.
 */

/** Una combinación concreta comprobada, con lo que dijo cada fuente. */
export interface MuestraValidada {
  /** Valores de los parámetros. `null` en un ejercicio sin plantilla. */
  valores: Valores | null;
  /** El enunciado ya con los huecos rellenos. */
  enunciado: string;
  /** Lo que dice el docente (o su fórmula). */
  respuestaEsperada: string | null;
  /** Lo que calcula el motor determinista. */
  respuestaMotor: string | null;
  /** true/false si se pudieron comparar; null si no había con qué. */
  coincide: boolean | null;
  /** La respuesta la puso el motor porque el docente no escribió ninguna. */
  adoptada?: boolean;
  /** Explicación cuando algo no cuadró en esta muestra concreta. */
  problema?: string;
}

export interface InformeValidacion {
  /** ¿Se puede guardar? Falso sólo si hay errores que lo impiden. */
  valido: boolean;
  /** ¿La matemática está comprobada por el motor determinista? */
  verificado: boolean;
  motor: Tema | null;
  /** La respuesta que debe guardarse (la del docente, o la que calculó el motor). */
  respuestaCorrecta: string | null;
  muestras: MuestraValidada[];
  /** Cuántas combinaciones admite la plantilla en total (1 si no lo es). */
  totalCombinaciones: number;
  /** ¿Se comprobaron todas las combinaciones posibles? */
  exhaustivo: boolean;
  /** Cuántas muestras se han podido comparar de verdad. */
  comprobadas: number;
  /** Reglas del cálculo que ha aplicado el motor: "regla del producto"… */
  reglas: string[];
  /** Impiden guardar. */
  errores: string[];
  /** No impiden guardar, pero el docente debe verlos. */
  avisos: string[];
  revisadoEn: string;
}

export interface EntradaValidacion {
  enunciado: string;
  respuestaCorrecta?: string | null;
  /** Fórmula de la respuesta en función de los parámetros: "({c} - {b}) / {a}". */
  respuestaFormula?: string | null;
  plantilla?: boolean;
  parametros?: readonly Parametro[];
  /** Motor determinista heredado del tema. `null` = sin corrección automática. */
  motor?: Tema | null;
  pistas?: readonly string[];
  /** Tope de combinaciones a comprobar cuando el espacio es grande. */
  maxMuestras?: number;
}

/** Cuántas discrepancias se detallan antes de resumir: más es ruido. */
const MAX_ERRORES_DETALLADOS = 3;
export const MAX_LONGITUD_ENUNCIADO = 300;

export function validarEjercicio(entrada: EntradaValidacion): InformeValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];
  const enunciado = String(entrada.enunciado ?? "").trim();
  const declarada = limpiar(entrada.respuestaCorrecta);
  const formula = limpiar(entrada.respuestaFormula);
  const motor = entrada.motor ?? null;
  const parametros = (entrada.parametros ?? []) as Parametro[];
  const esPlantilla = entrada.plantilla === true;

  const informe: InformeValidacion = {
    valido: false,
    verificado: false,
    motor,
    respuestaCorrecta: declarada,
    muestras: [],
    totalCombinaciones: 1,
    exhaustivo: true,
    comprobadas: 0,
    reglas: [],
    errores,
    avisos,
    revisadoEn: new Date().toISOString(),
  };

  // ── 1. El enunciado, antes de mirar ninguna cuenta ─────────────────────────
  if (!enunciado) {
    errores.push("El enunciado está vacío.");
    return informe;
  }
  if (enunciado.length > MAX_LONGITUD_ENUNCIADO) {
    errores.push(
      `El enunciado tiene ${enunciado.length} caracteres: el máximo son ${MAX_LONGITUD_ENUNCIADO}.`,
    );
  }
  const delimitador = delimitadorSinCerrar(enunciado);
  if (delimitador) errores.push(delimitador);

  // ── 2. Coherencia de la plantilla ──────────────────────────────────────────
  if (esPlantilla) {
    if (parametros.length === 0) {
      errores.push("Es una plantilla pero no tiene ningún parámetro declarado.");
    }
    errores.push(...revisarDeclaracion([enunciado, formula ?? ""], parametros));
    if (!formula) {
      // Sin fórmula sólo queda la respuesta fija del docente, que valdría para
      // una combinación y sería falsa para las demás: el ejercicio parecería
      // variar y estaría corrigiendo siempre contra el mismo número.
      errores.push(
        "Una plantilla necesita la fórmula de la respuesta en función de sus parámetros; una respuesta fija sólo sería correcta para una de las combinaciones.",
      );
    }
  } else {
    if (tieneHuecos(enunciado)) {
      errores.push(
        `El enunciado tiene huecos (${huecosDe(enunciado)
          .map((h) => `{${h}}`)
          .join(", ")}) pero el ejercicio no está marcado como plantilla.`,
      );
    }
    if (parametros.length > 0) {
      avisos.push("Hay parámetros declarados que no se usan: el ejercicio no es una plantilla.");
    }
  }

  if (errores.length > 0) return informe; // No tiene sentido calcular sobre algo mal formado.

  // ── 3. Las combinaciones que se van a comprobar ────────────────────────────
  const casos: Array<Valores | null> = [];
  if (esPlantilla) {
    const combos = combinaciones(parametros, { cuantas: entrada.maxMuestras ?? undefined });
    informe.totalCombinaciones = combos.totales;
    informe.exhaustivo = combos.exhaustivo;
    if (combos.muestras.length === 0) {
      errores.push("Los parámetros no producen ninguna combinación válida.");
      return informe;
    }
    casos.push(...combos.muestras);
  } else {
    casos.push(null);
  }

  // ── 4. Enfrentar las fuentes de verdad, combinación a combinación ──────────
  const claveMotor = motor ? CLAVE_POR_TEMA[motor] : undefined;
  const discrepancias: MuestraValidada[] = [];
  const reglasAplicadas = new Set<string>();
  let sinResolver = 0;
  let noEnteras = 0;

  for (const valores of casos) {
    const texto = valores ? sustituir(enunciado, valores) : enunciado;

    let esperada: string | null = null;
    let problema: string | undefined;

    if (formula) {
      const evaluada = evaluarFormula(formula, valores ?? {});
      if (evaluada == null) {
        problema = `No se puede evaluar la fórmula de respuesta con ${describir(valores)}: comprueba que no haya divisiones por cero ni operaciones imposibles.`;
        esperada = null;
      } else {
        esperada = evaluada;
      }
    } else {
      esperada = declarada;
    }

    const delMotor = claveMotor ? resolverSeguro(texto, claveMotor) : { respuesta: null, reglas: [] };
    const respuestaMotor = delMotor.respuesta;
    for (const regla of delMotor.reglas) reglasAplicadas.add(regla);
    if (claveMotor && respuestaMotor == null) sinResolver++;

    let coincide: boolean | null = null;
    let adoptada = false;
    if (esperada != null && respuestaMotor != null) {
      // Se comparan como FUNCIONES, no como cadenas: "e^x + 2x" y "2x + e^x"
      // son la misma respuesta, y rechazar la segunda era el falso negativo que
      // reportó el cliente.
      coincide = compararRespuesta(esperada, respuestaMotor).correcto;
      if (!coincide) {
        problema = `El motor calcula ${respuestaMotor} y la respuesta indicada es ${esperada}.`;
      }
    } else if (esperada == null && respuestaMotor != null) {
      // El docente ha escrito el enunciado y ha dejado la respuesta en blanco:
      // la pone el motor. Cuenta como verificada porque es exactamente el mismo
      // cálculo que hará el corrector cuando responda el alumno; no hay dos
      // versiones de la verdad que puedan discrepar.
      esperada = respuestaMotor;
      coincide = true;
      adoptada = true;
    }

    // Sólo se cuenta sobre respuestas NUMÉRICAS: en una plantilla de derivadas
    // la respuesta es una expresión, y avisar de que "no es un número entero"
    // no significaría nada.
    if (esperada != null && !/[a-zA-Z]/.test(esperada) && !/^-?\d+$/.test(esperada.replace(/\s+/g, ""))) {
      noEnteras++;
    }

    const muestra: MuestraValidada = {
      valores,
      enunciado: texto,
      respuestaEsperada: esperada,
      respuestaMotor,
      coincide,
      ...(adoptada ? { adoptada: true } : {}),
      ...(problema ? { problema } : {}),
    };

    if (coincide === true) informe.comprobadas++;
    if (problema) discrepancias.push(muestra);

    // Se guardan unas pocas muestras representativas: el informe viaja a la
    // interfaz y se queda en la base de datos, y no tiene sentido almacenar
    // doscientas filas idénticas en estructura.
    if (informe.muestras.length < 6 || (problema && informe.muestras.length < 12)) {
      informe.muestras.push(muestra);
    }
  }

  // ── 5. Veredicto ───────────────────────────────────────────────────────────
  for (const mala of discrepancias.slice(0, MAX_ERRORES_DETALLADOS)) {
    const contexto = mala.valores ? `${mala.enunciado} (${describir(mala.valores)})` : mala.enunciado;
    errores.push(`${contexto}: ${mala.problema}`);
  }
  if (discrepancias.length > MAX_ERRORES_DETALLADOS) {
    errores.push(
      `…y ${discrepancias.length - MAX_ERRORES_DETALLADOS} combinación(es) más con el mismo problema.`,
    );
  }

  informe.reglas = [...reglasAplicadas];

  const primera = informe.muestras[0];
  informe.respuestaCorrecta =
    primera?.respuestaEsperada ?? primera?.respuestaMotor ?? declarada ?? null;

  if (!motor) {
    // Sin motor no hay nada que comprobar, y la respuesta del docente es la
    // única verdad disponible: sin ella el ejercicio no se podría calificar
    // nunca, ni a mano.
    if (!informe.respuestaCorrecta) {
      errores.push(
        "El tema no tiene motor de corrección automática, así que hay que escribir la respuesta correcta a mano.",
      );
    } else {
      avisos.push(
        "El tema no declara motor determinista: el ejercicio se guarda SIN verificación automática y no podrá autocorregirse.",
      );
    }
  } else if (sinResolver === casos.length) {
    avisos.push(
      `El motor (${motor.toLowerCase().replace(/_/g, " ")}) no ha sabido resolver este enunciado, así que no se ha podido verificar.`,
    );
    if (!informe.respuestaCorrecta) {
      errores.push(
        "El motor no resuelve este enunciado y no se ha indicado la respuesta correcta: no quedaría forma de calificarlo.",
      );
    }
  } else if (sinResolver > 0) {
    avisos.push(
      `El motor no ha sabido resolver ${sinResolver} de las ${casos.length} combinaciones comprobadas.`,
    );
  }

  if (esPlantilla && noEnteras > 0) {
    avisos.push(
      `En ${noEnteras} de las ${casos.length} combinaciones la solución no es un número entero. Si buscabas resultados enteros, ajusta los rangos o excluye valores.`,
    );
  }
  if (esPlantilla && !informe.exhaustivo) {
    avisos.push(
      `La plantilla admite ${informe.totalCombinaciones} combinaciones: se han comprobado ${casos.length} elegidas de forma reproducible.`,
    );
  }

  for (const pista of entrada.pistas ?? []) {
    if (informe.respuestaCorrecta && contiene(pista, informe.respuestaCorrecta)) {
      avisos.push("Una de las pistas contiene la respuesta: conviene reformularla como método.");
      break;
    }
  }

  informe.valido = errores.length === 0;
  informe.verificado = informe.valido && informe.comprobadas > 0 && discrepancias.length === 0;
  return informe;
}

// ── Piezas sueltas ───────────────────────────────────────────────────────────

function limpiar(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Resuelve la fórmula de respuesta de una plantilla, con los parámetros puestos.
 *
 * Tiene dos salidas legítimas, y la diferencia importa:
 *
 *   · NUMÉRICA. "({c} - {b})/{a}" con a=4, b=3, c=17 da "7/2" —exacto, no
 *     3.4999999999999996—, porque es contra esa fracción contra la que se
 *     corrige al alumno.
 *   · SIMBÓLICA. Una plantilla de derivadas —enunciado "ln({a}x)", fórmula
 *     "1/x"— tiene por respuesta una EXPRESIÓN, no un número. Antes eso se
 *     rechazaba como fórmula no evaluable, que dejaba fuera justo las
 *     plantillas de cálculo. Ahora se devuelve la expresión ya sustituida y es
 *     la comparación con el motor la que dictamina.
 *
 * Devuelve null sólo cuando la fórmula no da ninguna de las dos cosas: una
 * división por cero, o algo que no se deja leer.
 */
export function evaluarFormula(formula: string, valores: Valores): string | null {
  // `limpiar: false` a propósito: aquí no se escribe un enunciado para nadie,
  // sino una expresión para evaluar, y "quitar" un 1 o un "+ 0" en una fórmula
  // puede cambiar lo que se calcula. Lo único que sí se arregla son los signos
  // encadenados que deja un parámetro negativo, que no son otra cuenta: son la
  // misma cuenta mal escrita.
  const expresion = colapsarSignos(sustituir(formula, valores, { limpiar: false }));
  if (tieneHuecos(expresion)) return null; // Faltaba algún valor.

  const arbol = analizar(expresion);
  const esSimbolica = arbol !== null && variablesDe(arbol).length > 0;
  // Se simplifica antes de guardarla: la fórmula "{a}·{n}·x^({n}-1)" con a=2 y
  // n=2 se sustituye en "2·2x^(2 - 1)", que es correcto y nadie escribiría.
  if (esSimbolica) return escribir(simplificar(arbol));

  try {
    const resultado = computeAnswer(expresion);
    const texto = resultado == null ? null : String(resultado).trim();
    if (texto) return texto;
    // `computeAnswer` sólo hace aritmética racional: una fórmula con ln o con
    // una raíz —"ln({a})/ln(2)"— se le escapa. El analizador nuevo sí la
    // evalúa; se usa DESPUÉS para no perder la fracción exacta en los casos
    // que el primero ya resuelve bien.
    return evaluarConAnalizador(expresion);
  } catch {
    // División por cero y demás: no es una excepción del sistema, es un dato
    // sobre esta combinación concreta, y así lo trata quien llama.
    return null;
  }
}

/** Evaluación numérica de una expresión constante, ya sustituida. */
function evaluarConAnalizador(expresion: string): string | null {
  const arbol = analizar(expresion);
  if (!arbol || variablesDe(arbol).length > 0) return null;
  const valor = evaluar(arbol, {});
  return Number.isFinite(valor) ? formatearNumero(valor) : null;
}

/** El motor, sin que un enunciado raro tumbe la validación entera. */
function resolverSeguro(enunciado: string, clave: string): { respuesta: string | null; reglas: string[] } {
  try {
    return resolverConDetalle(enunciado, clave);
  } catch {
    return { respuesta: null, reglas: [] };
  }
}

/**
 * Paréntesis, corchetes y llaves sin cerrar.
 *
 * Es el error de tecleo más común al escribir matemáticas, y además el que peor
 * se diagnostica después: el motor devuelve "no lo sé resolver" y el docente no
 * tiene forma de saber que el problema era un paréntesis.
 */
export function delimitadorSinCerrar(texto: string): string | null {
  const pares: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const pila: string[] = [];
  for (const c of texto) {
    if (c === "(" || c === "[" || c === "{") pila.push(c);
    else if (c in pares) {
      if (pila.pop() !== pares[c]) return `Hay un "${c}" que no cierra ningún paréntesis abierto.`;
    }
  }
  return pila.length > 0 ? `Queda un "${pila[pila.length - 1]}" sin cerrar.` : null;
}

/** "a=3, b=-2" — para que el docente vea con qué números ha fallado. */
function describir(valores: Valores | null): string {
  if (!valores) return "los valores dados";
  return Object.entries(valores)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

/** ¿La pista lleva dentro la respuesta, aunque esté escrita de otra forma? */
function contiene(pista: string, respuesta: string): boolean {
  const limpia = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return limpia(pista).includes(limpia(respuesta));
}
