/**
 * QUE NADA SE SALGA DE SU MITAD DE LA PIZARRA.
 *
 * A tamaño de aula (48 px como mínimo, SUB-PRJ-03) hay fórmulas que no caben en
 * medio lienzo: la regla de la potencia con sus dos ejemplos, el cierre de una
 * factorización —"x² − 9 = (x − 3)(x + 3)" con su cápsula—, el despeje de una
 * ecuación larga. Recortarlas deja un trozo colgando del borde (el cliente
 * fotografió un "d/dx" suelto); encogerlas rompería el tamaño de aula.
 *
 * Lo que se hace es lo que se hace en una pizarra de verdad: SE PARTE EN
 * RENGLONES, por donde una fórmula se puede partir sin romperse.
 */

/** Los separadores por los que una fórmula se puede partir, en orden. */
const SEPARADORES = ["\\qquad", "\\quad"];
const RELACIONES = ["\\Longrightarrow", "\\Rightarrow", "\\rightarrow", "\\to", "="];

const limpiar = (t: string) =>
  t
    .trim()
    .replace(/^(?:\\[,;:!]|\s)+/, "")
    .replace(/(?:\\[,;:!]|\s)+$/, "")
    .trim();

/**
 * Parte una fórmula en dos por su primer separador de NIVEL SUPERIOR: primero
 * por los que separan dos ejemplos distintos, y si no hay, por el signo de
 * relación —el igual o la flecha—, que se lleva consigo el renglón siguiente.
 *
 * Nunca dentro de unas llaves: ahí está el numerador de una fracción o un
 * exponente, y partir ahí no daría dos fórmulas sino dos trozos rotos.
 */
export function partirFormula(latex: string): [string, string] | null {
  const texto = String(latex ?? "");
  for (const lista of [SEPARADORES, RELACIONES]) {
    let nivel = 0;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === "{") nivel++;
      else if (c === "}") nivel--;
      if (nivel !== 0) continue;
      const sep = lista.find((x) => texto.startsWith(x, i));
      if (!sep) continue;
      const izquierda = limpiar(texto.slice(0, i));
      const derecha = limpiar(texto.slice(i + sep.length));
      if (!izquierda || !derecha) continue;
      return lista === SEPARADORES ? [izquierda, derecha] : [izquierda, `${sep} ${derecha}`];
    }
  }
  return null;
}

/** Parte la fila más larga que se deje partir; `null` si ninguna se deja. */
export function partirLaMasLarga(filas: readonly string[]): string[] | null {
  const candidatas = filas
    .map((fila, i) => ({ i, fila, partes: partirFormula(fila) }))
    .filter((c) => c.partes != null)
    .sort((a, b) => b.fila.length - a.fila.length);
  const elegida = candidatas[0];
  if (!elegida?.partes) return null;
  return [...filas.slice(0, elegida.i), ...elegida.partes, ...filas.slice(elegida.i + 1)];
}

/**
 * Las filas, compuestas como UNA sola fórmula de varios renglones, todos
 * ARRIMADOS A LA IZQUIERDA:
 *
 *   x² − 9
 *   = (x − 3)(x + 3)
 *
 * Arrimados y no alineados por el igual: alineándolos, el segundo renglón
 * empieza donde acaba el primero y lo que no cabía se sigue saliendo por el
 * borde.
 *
 * Se compone en un solo bloque para que las marcas del guion —que van por
 * `\htmlClass`— sigan estando donde estaban, y la capa de resaltados las
 * encuentre igual.
 */
export function comoFilas(filas: readonly string[]): string {
  if (filas.length < 2) return filas[0] ?? "";
  const cuerpo = filas.map((f) => `&${f}`).join(" \\\\[0.15em] ");
  return `\\begin{aligned} ${cuerpo} \\end{aligned}`;
}

/** ¿Una fórmula ya compuesta en varias filas o como cuenta dispuesta? No se toca. */
export function yaEstaDispuesta(latex: string): boolean {
  return /\\begin\{aligned\}|\\begin\{array\}/.test(String(latex ?? ""));
}
