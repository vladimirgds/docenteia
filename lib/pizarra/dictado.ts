/**
 * DEL DICTADO A LA NOTACIÓN (PMV 3 · HITO 3).
 *
 * Cuando el alumno responde HABLANDO, el navegador entrega texto en español:
 * «quince por tres a la cuarta más uno». El corrector del servidor entiende la
 * notación plana (`15(3x+1)^4`), no el castellano, así que antes de enviarla se
 * traduce lo que se puede traducir con seguridad: números dichos con palabras,
 * operaciones y potencias sencillas.
 *
 * Es deliberadamente CONSERVADOR: lo que no reconoce se deja tal cual, y el
 * corrector decide. Traducir de más sería inventar la respuesta del alumno.
 */

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const ORDINALES: Record<string, number> = { cuadrado: 2, cuadrada: 2, cubo: 3, cubica: 3, cuarta: 4, quinta: 5, sexta: 6 };

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "");

export function dictadoAMatematica(dictado: string): string {
  let t = sinTildes(dictado.toLowerCase()).replace(/[.,;¿?¡!]+$/g, "").trim();

  // «treinta y cinco» → 35
  t = t.replace(/\b(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa) y (un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g, (_m, d: string, u: string) =>
    String(DECENAS[d] + UNIDADES[u]),
  );
  for (const [palabra, n] of Object.entries(DECENAS)) t = t.replace(new RegExp(`\\b${palabra}\\b`, "g"), String(n));
  for (const [palabra, n] of Object.entries(UNIDADES)) t = t.replace(new RegExp(`\\b${palabra}\\b`, "g"), String(n));

  // «x a la cuarta», «x al cuadrado», «x al cubo»
  t = t.replace(/\b(?:a la|al) (cuadrado|cuadrada|cubo|cubica|cuarta|quinta|sexta)\b/g, (_m, o: string) => `^${ORDINALES[o]}`);
  t = t.replace(/\b(?:a la|elevado a|elevada a) (\d+)\b/g, "^$1");

  t = t
    .replace(/\bdividido entre\b|\bdividido por\b|\bsobre\b|\bentre\b/g, "/")
    .replace(/\bmultiplicado por\b|\bpor\b|\bveces\b/g, "*")
    .replace(/\bmas\b/g, "+")
    .replace(/\bmenos\b/g, "-")
    .replace(/\bigual a\b|\bes igual a\b|\bigual\b/g, "=")
    .replace(/\bparentesis abierto\b|\babre parentesis\b/g, "(")
    .replace(/\bparentesis cerrado\b|\bcierra parentesis\b/g, ")")
    .replace(/\bequis\b/g, "x")
    .replace(/\bla respuesta es\b|\bel resultado es\b|\bes\b/g, "");

  // «1 / 2» → «1/2»; espacios sobrantes.
  t = t.replace(/\s*([+\-*/=^()])\s*/g, " $1 ").replace(/\s+/g, " ").trim();
  t = t.replace(/(\d) ([xyz])\b/g, "$1$2");
  t = t.replace(/(\d) \/ (\d)/g, "$1/$2").replace(/\^ (\d)/g, "^$1").replace(/ \^/g, "^");
  return t;
}
