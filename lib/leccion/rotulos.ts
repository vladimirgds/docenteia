/**
 * Números con su nombre debajo.
 *
 * El tutor dice "24 y 17 son los SUMANDOS, y 41 es la SUMA", pero en la pizarra
 * aparecía sólo el esquema abstracto —"sumando + sumando = suma"—, sin los
 * números que el alumno estaba oyendo. Tenía que emparejar de memoria la
 * palabra con la cifra.
 *
 * Aquí cada número lleva su rótulo debajo, con la llave que se usa en clase:
 *
 *     24    +    17    =    41
 *   ‾‾‾‾       ‾‾‾‾       ‾‾‾‾
 *   sumando    sumando    suma
 *
 * El motor escribe la línea marcando cada número con su nombre entre
 * corchetes —"24 [sumando] + 17 [sumando] = 41 [suma o total]"— y aquí se
 * compone. Así los nombres los decide quien conoce la operación (el motor, que
 * sabe si es una resta o una división) y no este módulo.
 *
 * Vive en `lib/` para que la suite compruebe la composición sin montar React.
 */

/** ¿La línea trae números rotulados? */
const PATRON_ROTULO = /(-?\d+(?:[.,]\d+)?)\s*\[([^\]]{1,24})\]/g;

/**
 * Compone en LaTeX una línea con números rotulados, o `null` si no lo es.
 *
 * Se exige al menos un número rotulado y que fuera de los rótulos no quede
 * nada que no sea la operación: si la línea trae prosa, se compone como prosa,
 * porque una frase pasada por KaTeX sale en cursiva y con las letras separadas.
 */
export function rotulosALatex(texto: string): string | null {
  const linea = String(texto ?? "").trim();
  if (!linea) return null;

  PATRON_ROTULO.lastIndex = 0;
  const marcas = [...linea.matchAll(PATRON_ROTULO)];
  if (marcas.length === 0) return null;

  // Una suma o una resta, EN COLUMNA (ver `rotulosEnColumna`).
  const enColumna = rotulosEnColumna(linea);
  if (enColumna) return enColumna;

  // Lo que queda al quitar los números rotulados tiene que ser sólo la
  // operación: signos, paréntesis y espacios.
  const resto = linea.replace(PATRON_ROTULO, " ").trim();
  if (!/^[-+×÷·*/=()\s,.]*$/u.test(resto)) return null;

  return linea
    .replace(PATRON_ROTULO, (_todo, numero: string, rotulo: string) => {
      const limpio = rotulo.trim().replace(/\s+/g, "\\ ");
      return `\\underbrace{${numero}}_{\\text{${limpio}}}`;
    })
    // Los operadores, con su nombre de LaTeX: esta línea no pasa por
    // `planoALatex`, que es quien los traduce en el resto de la pizarra.
    .replace(/·/g, " \\cdot ")
    .replace(/×/g, " \\times ")
    .replace(/÷/g, " \\div ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * LA SUMA Y LA RESTA ROTULADAS, EN COLUMNA.
 *
 * El cliente la fotografió en horizontal —"234 [sumando] + 178 [sumando] = 412
 * [suma o total]"— y la dibujó como se hace en clase:
 *
 *        234   (sumando)
 *      + 178   (sumando)
 *      ─────
 *        412   (suma o total)
 *
 * "Toda suma con números de dos o más cifras se presenta en disposición
 * vertical formal." Las cifras, alineadas a la derecha por su valor posicional;
 * cada nombre, a su derecha y entre paréntesis, en letra de pizarra (la clase
 * `pz-palabra` la pone la hoja de estilos: es escritura, no fórmula).
 *
 * `null` si la línea no es exactamente "a [r] ± b [r] = c [r]".
 */
function rotulosEnColumna(linea: string): string | null {
  const m = linea
    .replace(/[−–—]/g, "-")
    .match(/^\s*(\d+)\s*\[([^\]]{1,24})\]\s*([+-])\s*(\d+)\s*\[([^\]]{1,24})\]\s*=\s*(\d+)\s*\[([^\]]{1,24})\]\s*$/);
  if (!m) return null;
  const [, a, ra, op, b, rb, c, rc] = m;
  // KaTeX no admite `@{}` en la cabecera del array: el aire entre el número y
  // su nombre va dentro de la celda.
  const palabra = (r: string) => `\\enspace\\htmlClass{pz-palabra}{\\text{(${r.trim()})}}`;
  return (
    `\\begin{array}{rrl} ` +
    `& ${a} & ${palabra(ra)} \\\\ ` +
    `${op} & ${b} & ${palabra(rb)} \\\\ \\hline ` +
    `& ${c} & ${palabra(rc)} ` +
    `\\end{array}`
  );
}

/** ¿La línea lleva números rotulados? */
export function tieneRotulos(texto: string): boolean {
  PATRON_ROTULO.lastIndex = 0;
  return PATRON_ROTULO.test(String(texto ?? ""));
}

/** La línea sin las marcas, para leerla o narrarla: "24 + 17 = 41". */
export function sinRotulos(texto: string): string {
  return String(texto ?? "")
    .replace(PATRON_ROTULO, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
