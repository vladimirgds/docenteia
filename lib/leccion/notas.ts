/**
 * UNA NOTA DE PIZARRA, PARTIDA EN LO QUE ES: un rótulo y lo que dice.
 *
 * El motor escribe en la pizarra líneas como "Fracciones equivalentes: 2/4 =
 * 1/2", "MCM(2, 3): 2 × 3 = 6" o "Propiedad uniforme de la suma: lo mismo a los
 * dos lados". Proyectadas se componían con la prosa a tamaño de párrafo y la
 * fórmula a tamaño de proyección: el rótulo quedaba diminuto al lado de unos
 * números gigantes. El cliente lo fotografió tres veces —"letra reducida", "no
 * corresponde al tipo de letra recomendada"— y pidió una jerarquía: el rótulo
 * en letra de pizarra y a tamaño de aula, la fórmula en KaTeX.
 *
 * Aquí sólo se decide la ESTRUCTURA —qué es rótulo, qué es cuerpo, qué va en su
 * propia línea—; cómo se pinta lo decide el componente. Vive en `lib/` para que
 * la suite pueda comprobarlo sin montar React.
 */
export interface TrozoDeNota {
  /** "Fracciones equivalentes:" —con sus dos puntos—, o null si la línea no lleva rótulo. */
  rotulo: string | null;
  /** Lo que dice: una fórmula, prosa, o las dos cosas mezcladas. */
  cuerpo: string;
  /**
   * "numerador / denominador": una fracción escrita CON PALABRAS. Se compone
   * como fracción de verdad —el cliente la dibujó así sobre su captura, con la
   * raya horizontal—, no como dos palabras separadas por una barra.
   */
  fraccion: { arriba: string; abajo: string } | null;
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function partirTrozo(texto: string): TrozoDeNota {
  const limpio = texto.replace(/\s+/g, " ").trim();
  // El rótulo es lo que va antes de los PRIMEROS dos puntos, siempre que ahí no
  // haya un igual: "x = 2: ..." no es un rótulo, es una igualdad.
  const m = limpio.match(/^([^:=]{2,60}?):\s*(.+)$/);
  const rotulo = m ? `${m[1].trim()}:` : null;
  const cuerpo = m ? m[2].trim() : limpio;
  const f = cuerpo.match(/^([a-záéíóúñ]{3,})\s*\/\s*([a-záéíóúñ]{3,})$/i);
  return { rotulo, cuerpo, fraccion: f ? { arriba: mayuscula(f[1]), abajo: mayuscula(f[2]) } : null };
}

/**
 * Una línea de pizarra, en los trozos que van cada uno en su renglón.
 *
 * "Múltiplos de 4: 4, 8, 12. Múltiplos de 6: 6, 12. El menor en común: 12." son
 * TRES notas en una línea: proyectadas en un solo renglón no caben ni se leen.
 * Se parte por punto y seguido —cuando detrás empieza otra frase— y por el
 * separador "·" que usa el motor para poner dos ideas juntas.
 */
export function partirNota(texto: string): TrozoDeNota[] {
  const limpio = String(texto ?? "").trim();
  if (!limpio) return [];
  return limpio
    .split(/\s+·\s+|\.\s+(?=[A-ZÁÉÍÓÚÑ¿])/)
    .map((t) => t.replace(/\.\s*$/, "").trim())
    .filter(Boolean)
    .map(partirTrozo);
}

/**
 * ¿La línea es una nota con rótulo de palabras? "unidades: 3 + 4 = 7",
 * "MCM(2, 3): 2 × 3 = 6".
 *
 * Una línea así se pinta como NOTA —el rótulo en letra de pizarra, la fórmula
 * en KaTeX—, no como una fórmula entera con el rótulo metido dentro: compuesto
 * por KaTeX, "unidades:" salía con la letra romana de las fórmulas, que no es la
 * del rótulo (SUB-TIP-01).
 */
export function esNotaRotulada(texto: string): boolean {
  const [primero] = partirNota(texto);
  return Boolean(primero?.rotulo && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/.test(primero.rotulo));
}

/**
 * LA DEFINICIÓN DE FRACCIÓN, EN NOTACIÓN FORMAL: Numerador sobre Denominador,
 * igual a la fracción del dibujo.
 *
 * Antes se escribía "Numerador / Denominador: 1/4", con la barra inclinada, y
 * el cliente lo corrigió: "evita usar la barra inclinada en explicaciones de
 * conceptos básicos; el estudiante necesita ver la estructura de numerador
 * arriba y denominador abajo". Aquí va entera en una sola expresión —palabras
 * y números, cada uno con su raya horizontal—, compuesta en modo `\dfrac` para
 * que ninguna de las dos fracciones baje a tamaño de subíndice.
 */
export function expresionFormalDeFraccion(numerador = 1, denominador = 4): string {
  const n = Number.isInteger(numerador) ? numerador : 1;
  const d = Number.isInteger(denominador) && denominador > 0 ? denominador : 4;
  return `\\dfrac{\\text{Numerador}}{\\text{Denominador}} = \\dfrac{${n}}{${d}}`;
}
