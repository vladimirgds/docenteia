/**
 * Paso intermedio del desarrollo de una derivada.
 *
 * El motor escribe el enunciado y el resultado —"x²" y luego "derivada de x² =
 * 2x"— pero el paso de en medio, donde se ve APLICADA la regla, sólo lo narra.
 * En la pizarra hace falta, porque es justo lo que el alumno tiene que
 * comparar con el enunciado:
 *
 *   5x²   →   5 · 2x²⁻¹ = 10x
 *
 * Se genera sólo para un MONOMIO. Con un polinomio el desarrollo son varios
 * pasos y fabricar uno solo daría una idea equivocada del método, así que en
 * ese caso se devuelve null y la pizarra se queda con lo que escriba el motor.
 *
 * NO importa el motor determinista, a pesar de que sería lo natural para
 * contrastar el resultado. Este módulo lo usa la pizarra, que es un componente
 * de cliente: importar `src/preLight.js` arrastraría al navegador las 1.800
 * líneas del motor, y de hecho hacía reventar por memoria la compilación.
 *
 * La garantía no se pierde, cambia de sitio: la batería de QA comprueba que lo
 * que devuelve esta función coincide con lo que califica el motor. Un paso
 * intermedio que llevara a otro resultado sería peor que no tener paso.
 */

const SUPERINDICES = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

function aSuperindice(n: number): string {
  if (n < 0) return "⁻" + aSuperindice(-n);
  return String(n)
    .split("")
    .map((d) => SUPERINDICES[Number(d)])
    .join("");
}

/** Convierte los superíndices Unicode de una expresión a "^n". */
function normalizar(expresion: string): string {
  return String(expresion ?? "")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) =>
      "^" + [...m].map((c) => SUPERINDICES.indexOf(c)).join(""),
    )
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function pasoIntermedioDerivada(expresion: string): string | null {
  const limpia = normalizar(expresion);
  if (!limpia) return null;

  // Un ÚNICO monomio: coeficiente opcional, la variable x y exponente opcional.
  // El anclaje a los extremos es lo que descarta los polinomios.
  const m = limpia.match(/^([+-]?\d*)x(?:\^(\d+))?$/);
  if (!m) return null;

  const coeficiente = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : Number(m[1]);
  const exponente = m[2] ? Number(m[2]) : 1;
  if (!Number.isFinite(coeficiente) || coeficiente === 0 || exponente < 1) return null;

  const nuevoCoef = coeficiente * exponente;
  const nuevoExp = exponente - 1;

  // La derivada, tal como la escribiría el motor.
  const resultado =
    nuevoExp === 0
      ? String(nuevoCoef)
      : nuevoExp === 1
        ? `${nuevoCoef === 1 ? "" : nuevoCoef === -1 ? "-" : nuevoCoef}x`
        : `${nuevoCoef === 1 ? "" : nuevoCoef === -1 ? "-" : nuevoCoef}x${aSuperindice(nuevoExp)}`;

  const coefVisible = coeficiente === 1 ? "" : coeficiente === -1 ? "-" : `${coeficiente} · `;

  // CON EXPONENTE 1 NO HAY POTENCIA QUE ENSEÑAR. "2 · 1x¹⁻¹ = 2" es cierto, pero
  // se lee mal: escribe un coeficiente 1 que no está en el término y deja el
  // exponente sin resolver. Lo que se aplica ahí es el coeficiente por 1. Y en
  // "x" a secas no hay nada intermedio que enseñar: su derivada es 1.
  if (exponente === 1) {
    return Math.abs(coeficiente) === 1 ? null : `${coefVisible}1 = ${resultado}`;
  }
  return `${coefVisible}${exponente}x${aSuperindice(exponente)}⁻¹ = ${resultado}`;
}
