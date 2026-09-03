/**
 * Separación de prosa y fórmulas en un texto mixto.
 *
 * Vive en su propio módulo, y no dentro del componente que lo usa, para que la
 * suite de QA pueda ejercitarlo sin montar React: es la pieza que decide qué
 * parte de un enunciado se compone como matemática, y equivocarse ahí se ve
 * directamente en la pantalla del alumno.
 */

// ── Notación plana → LaTeX ───────────────────────────────────────────────────
// El motor pedagógico escribe la pizarra en notación plana ("12x³ - 4x",
// "1/2 + 1/4"), que es la que entienden sus analizadores y su suite de pruebas.
// La pizarra del alumno, en cambio, debe verse compuesta. Aquí se traduce lo
// uno en lo otro, sin tocar el motor.

const SUPERINDICES: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-", "⁺": "+", "ⁿ": "n",
};

/** Nombres de función que no cuentan como prosa al decidir si una línea es matemática. */
const FUNCIONES = new Set([
  "sin", "sen", "cos", "tan", "cot", "sec", "csc",
  "log", "ln", "exp", "lim", "max", "min", "sqrt", "raiz",
]);

/**
 * ¿Esta línea es una expresión matemática PURA, que se pueda componer entera?
 *
 * La pizarra recibe las dos cosas: las directivas `pizarra` traen la fórmula
 * ("2x + 5 = 15") y las de `hablar` traen la explicación en castellano. Pero
 * también llegan líneas MIXTAS —"derivada de x² = 2x", "unidades: 4 + 7 = 11"—
 * con una etiqueta en castellano delante de la fórmula.
 *
 * El criterio es que NO haya ninguna palabra real. Antes se toleraba una, y
 * bastaba para que esas líneas mixtas se compusieran enteras con KaTeX: al
 * pasarlas por el motor matemático, "derivada" y "unidades" se tipografían como
 * un producto de variables sueltas —d·e·r·i·v·a·d·a— y en pantalla las letras
 * aparecen pegadas y en cursiva. Una línea con palabras se trata como prosa con
 * fórmulas dentro, que es lo que es.
 */
export function pareceMatematica(linea: string): boolean {
  const texto = String(linea ?? "").trim();
  if (!texto) return false;
  const palabras = (texto.toLowerCase().match(/[a-záéíóúñ]{3,}/g) || []).filter(
    (p) => !FUNCIONES.has(p),
  );
  return palabras.length === 0;
}

/**
 * ¿Esta línea vale para la pizarra, o es un párrafo explicativo?
 *
 * La pizarra es un lienzo de IDEAS FUERZA: el título de la regla, las fórmulas
 * y el ejercicio. La explicación hablada va en el subtítulo. El motor
 * determinista ya respeta ese reparto —de las 57 líneas distintas que produce,
 * la más larga son 63 caracteres: "Derivada: razón de cambio (la pendiente) de
 * una función"—, pero desde que las aclaraciones las redacta el modelo en vivo,
 * a la pizarra puede llegar un párrafo entero.
 *
 * Por eso el reparto se comprueba aquí y no se da por supuesto: lo que no cabe
 * como idea fuerza se manda al subtítulo, venga de donde venga.
 *
 * Los umbrales dejan margen sobre el contenido real (7 palabras y 63
 * caracteres en el caso más largo) para no rechazar lo que hoy funciona.
 */
export const MAX_CARACTERES_PIZARRA = 90;
export const MAX_PALABRAS_PIZARRA = 8;

export function esIdeaFuerza(texto: string): boolean {
  const linea = String(texto ?? "").trim();
  if (!linea) return false;

  // Una fórmula entra siempre, por larga que sea: es el contenido propio de la
  // pizarra y no hay nada que resumir.
  if (pareceMatematica(linea)) return true;

  if (linea.length > MAX_CARACTERES_PIZARRA) return false;

  const palabras = (linea.toLowerCase().match(/[a-záéíóúñ]{3,}/g) || []).filter(
    (p) => !FUNCIONES.has(p),
  );
  return palabras.length < MAX_PALABRAS_PIZARRA;
}

/**
 * Reescribe en NOTACIÓN FORMAL las líneas que el motor escribe en castellano.
 *
 * El motor rotula la derivada con palabras —"derivada de x² = 2x"—, que es
 * legible pero no es notación matemática. En la pizarra corresponde el operador
 * formal:
 *
 *   derivada de x² = 2x   →   d/dx(x²) = 2x   compuesto con \frac{d}{dx}
 *
 * Devuelve LaTeX ya listo, o null si la línea no encaja en ningún patrón
 * conocido. Sólo se aplica a lo que se ESCRIBE en la pizarra: en la explicación
 * hablada, "la derivada de x³ es 3x²" es una frase, y convertir el "es" en un
 * "=" cambiaría lo que el tutor está diciendo.
 */
export function notacionFormal(linea: string): string | null {
  const texto = String(linea ?? "").trim();
  if (!texto) return null;

  // "derivada de <función> = <resultado>"
  const conResultado = texto.match(/^derivada\s+de\s+(.+?)\s*=\s*(.+)$/i);
  if (conResultado) {
    return `\\frac{d}{dx}\\left(${planoALatex(conResultado[1])}\\right) = ${planoALatex(conResultado[2])}`;
  }

  // "derivada de <función>"
  const soloFuncion = texto.match(/^derivada\s+de\s+(.+)$/i);
  if (soloFuncion) {
    return `\\frac{d}{dx}\\left(${planoALatex(soloFuncion[1])}\\right)`;
  }

  // "<etiqueta>: <fórmula>" — "unidades: 4 + 7 = 11". La etiqueta se compone
  // como TEXTO dentro de la fórmula, de modo que la línea sigue siendo una sola
  // expresión centrada pero la palabra se lee como palabra.
  const conEtiqueta = texto.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{3,20}):\s*(.+)$/);
  if (conEtiqueta && pareceMatematica(conEtiqueta[2])) {
    return `\\text{${conEtiqueta[1].trim()}:}\\;\\; ${planoALatex(conEtiqueta[2])}`;
  }

  return null;
}

/**
 * Traduce notación plana a LaTeX para componerla con KaTeX.
 *
 * Es la inversa de `latexAPlano()`: aquélla existe para que el motor pueda
 * verificar, y ésta para que el alumno pueda leer.
 */
export function planoALatex(expresion: string): string {
  let s = String(expresion ?? "");

  // Signos menos tipográficos → el menos ASCII que entiende KaTeX.
  s = s.replace(/[−–—]/g, "-");

  // Superíndices Unicode en bloque: "x³" → "x^{3}", "xⁿ⁻¹" → "x^{n-1}".
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ]+/g, (m) => {
    const exp = [...m].map((c) => SUPERINDICES[c] ?? "").join("");
    return exp ? `^{${exp}}` : "";
  });

  // Operadores.
  s = s
    .replace(/·/g, " \\cdot ")
    .replace(/×/g, " \\times ")
    .replace(/÷/g, " \\div ")
    .replace(/≠/g, " \\neq ")
    .replace(/≤/g, " \\leq ")
    .replace(/≥/g, " \\geq ")
    .replace(/≈/g, " \\approx ")
    .replace(/⇒|=>/g, " \\Rightarrow ")
    .replace(/→/g, " \\to ");

  // Fracciones NUMÉRICAS: "1/2" → "\frac{1}{2}". Sólo dígito/dígito, para no
  // estropear "d/dx", que no es una fracción sino una notación de derivada.
  s = s.replace(/(?<![\w}])(\d+)\s*\/\s*(\d+)(?![\w{])/g, "\\frac{$1}{$2}");

  // Nombres de función (MVP 2). Sin la barra delante, KaTeX compone "ln(x)"
  // como el producto de tres variables en cursiva —l·n·x—, que es exactamente
  // lo que se veía en la pizarra en cuanto el temario incluyó logaritmos.
  s = s.replace(/\bexp\s*\(([^()]*)\)/gi, "e^{$1}");
  s = s.replace(/\b(?:sqrt|raiz)\s*\(([^()]*)\)/gi, "\\sqrt{$1}");
  s = s.replace(/\b(ln|log|sin|sen|cos|tan)\b/g, (_, f) => `\\${f === "sen" ? "sin" : f}`);

  // Caracteres que LaTeX interpreta como órdenes y aquí son literales.
  s = s.replace(/%/g, "\\%").replace(/(?<!\\)&/g, "\\&");

  return s.replace(/\s+/g, " ").trim();
}

// ── Matemáticas dentro de la prosa ───────────────────────────────────────────
// Las explicaciones del tutor llevan las fórmulas incrustadas en la frase: "la
// derivada de x³ es 3x², y la de x⁵ es 5x⁴". El motor las escribe así, sin
// delimitadores, porque su suite de pruebas trabaja sobre ese texto. Para
// componerlas hay que reconocerlas dentro de la frase.
//
// El criterio es deliberadamente ESTRICTO. Marcar de más es peor que marcar de
// menos: una palabra convertida en fórmula se ve rota, mientras que una fórmula
// que se queda en texto plano sólo se ve sosa. Por eso una letra suelta ("a",
// "y", "n") no basta para abrir una expresión: hace falta un exponente, un
// operador entre operandos, o un coeficiente pegado a la variable ("2x").

const SUPERINDICE = "[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁻⁺]";
/** Una variable es UNA letra suelta, no la inicial de una palabra. */
const VARIABLE = "(?<![A-Za-zÁÉÍÓÚÜÑáéíóúüñ])[a-z](?![A-Za-zÁÉÍÓÚÜÑáéíóúüñ])";
// El orden de las alternativas importa: "coeficiente + variable" va PRIMERO
// porque la alternancia es perezosa por la izquierda. Con el número delante,
// "3x²" se partía en un "3" suelto —que luego se descartaba por no ser
// expresión— y un "x²" huérfano, de modo que el coeficiente desaparecía de la
// fórmula compuesta.
const ATOMO = `(?:\\d*${VARIABLE}${SUPERINDICE}*|\\d+(?:[.,]\\d+)?${SUPERINDICE}*)`;
const OPERADOR = "\\s*[-+*/=·×÷≈≠≤≥]\\s*";

const EXPRESION = new RegExp(`${ATOMO}(?:${OPERADOR}${ATOMO})*`, "gu");

/** ¿El fragmento capturado es de verdad una expresión, o sólo un número suelto? */
function mereceComposicion(fragmento: string): boolean {
  const tieneExponente = new RegExp(SUPERINDICE).test(fragmento);
  const tieneOperador = /[-+*/=·×÷≈≠≤≥]/.test(fragmento);
  const coeficientePegado = /\d[a-z]/.test(fragmento);
  return tieneExponente || tieneOperador || coeficientePegado;
}

/**
 * Separa una frase en tramos de prosa y tramos de fórmula, detectando las
 * fórmulas automáticamente (sin delimitadores).
 *
 * Se usa para las explicaciones del tutor y para las líneas de pizarra que son
 * frases; cuando el texto ya trae `$…$`, se usa `separarFormulas`, que es
 * explícita y no necesita adivinar nada.
 */
export function separarProsaYMatematicas(texto: string): Parte[] {
  const entrada = String(texto ?? "");
  const partes: Parte[] = [];
  let ultimo = 0;

  for (const m of entrada.matchAll(EXPRESION)) {
    const fragmento = m[0];
    const indice = m.index ?? 0;
    if (!fragmento.trim() || !mereceComposicion(fragmento)) continue;

    // Los espacios de los extremos pertenecen a la frase, no a la fórmula.
    const inicio = indice + (fragmento.length - fragmento.trimStart().length);
    const limpio = fragmento.trim();
    if (!limpio) continue;

    if (inicio > ultimo) {
      partes.push({ tipo: "texto", contenido: entrada.slice(ultimo, inicio) });
    }
    partes.push({ tipo: "linea", contenido: limpio });
    ultimo = inicio + limpio.length;
  }

  if (ultimo < entrada.length) {
    partes.push({ tipo: "texto", contenido: entrada.slice(ultimo) });
  }

  return partes.length > 0 ? partes : [{ tipo: "texto", contenido: entrada }];
}

export type TipoParte = "texto" | "linea" | "bloque";

export interface Parte {
  tipo: TipoParte;
  contenido: string;
}

/**
 * Separa un texto en tramos de prosa y tramos de fórmula.
 *
 * Reconoce `$$…$$` (fórmula en bloque) y `$…$` (en línea). El bloque se busca
 * primero para que no se confunda con dos fórmulas en línea vacías.
 *
 * Un `$` suelto y sin pareja NO abre fórmula: se queda como carácter normal,
 * que es lo que espera quien escribe un precio. Y un texto sin ningún `$` se
 * devuelve entero como prosa, así que los enunciados sin matemáticas siguen
 * siendo válidos.
 */
export function separarFormulas(texto: string): Parte[] {
  const entrada = String(texto ?? "");
  const patron = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  const partes: Parte[] = [];
  let ultimo = 0;
  let m: RegExpExecArray | null;

  while ((m = patron.exec(entrada)) !== null) {
    if (m.index > ultimo) {
      partes.push({ tipo: "texto", contenido: entrada.slice(ultimo, m.index) });
    }
    if (m[1] !== undefined) {
      partes.push({ tipo: "bloque", contenido: m[1].trim() });
    } else {
      partes.push({ tipo: "linea", contenido: m[2].trim() });
    }
    ultimo = m.index + m[0].length;
  }

  if (ultimo < entrada.length) {
    partes.push({ tipo: "texto", contenido: entrada.slice(ultimo) });
  }

  return partes.length > 0 ? partes : [{ tipo: "texto", contenido: entrada }];
}

/**
 * La expresión matemática principal de una frase, o `null` si no hay ninguna.
 *
 * El motor no siempre ESCRIBE el enunciado: a veces sólo lo narra ("vamos a
 * derivar 3x⁴ - 2x²") o lo lleva dentro de la pregunta que le hace al alumno.
 * Como la prosa no sube a la pizarra, en esos casos el lienzo se quedaba en
 * blanco aunque el ejercicio estuviera perfectamente definido.
 *
 * Aquí se recupera: se detectan los tramos de fórmula de la frase y se elige el
 * más largo, que es el enunciado y no un número suelto de la explicación. La
 * prosa se descarta entera, así que a la pizarra sigue subiendo sólo la
 * expresión.
 */
export function expresionPrincipal(texto: string): string | null {
  const formulas = separarProsaYMatematicas(String(texto ?? ""))
    .filter((p) => p.tipo === "linea")
    // Los signos de puntuación cierran la frase, no la fórmula.
    .map((p) => p.contenido.replace(/[.,;:¿?¡!]+$/u, "").trim())
    .filter((f) => f.length > 0);

  if (formulas.length === 0) return null;

  const principal = formulas.reduce((a, b) => (b.length > a.length ? b : a));
  // Un número suelto no es un enunciado: "en 2 pasos" no plantea nada.
  return /[a-zA-Z]|[-+*/=·×÷^]/.test(principal) ? principal : null;
}
