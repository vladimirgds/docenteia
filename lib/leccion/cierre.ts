/**
 * EL EJERCICIO NO PUEDE QUEDAR A MEDIAS.
 *
 * Lo reportó el cliente sobre una lección de fracciones: "¡Lección completada!"
 * en el subtítulo y, en la pizarra, el desarrollo cortado en "6/10 + 5/10", sin
 * el 11/10. La explicación de ese ejercicio la redacta el modelo en vivo
 * mientras el alumno lo está resolviendo, y se detiene justo antes del
 * resultado a propósito: dárselo sería resolverle la práctica. Hasta ahí, bien.
 * Lo que faltaba es que, una vez ACERTADO, nadie cerrara el desarrollo.
 *
 * Aquí se decide cómo cerrarlo, con la respuesta que el alumno acaba de dar por
 * buena:
 *
 *   · si la última línea es una operación sin resultado y VALE exactamente la
 *     respuesta, se completa: "6/10 + 5/10" pasa a "6/10 + 5/10 = 11/10";
 *   · si no, y el desarrollo no enseña ya el resultado, se añade el enunciado
 *     resuelto: "3/5 + 1/2 = 11/10".
 *
 * Nunca se escribe una cuenta que no se haya comprobado: si la línea no vale la
 * respuesta, o el enunciado no da lo que se dice, no se toca nada.
 */

/** Un número racional, sin perder exactitud: 11/10 no es 1.1000000000000001. */
interface Racional {
  n: number;
  d: number;
}

const mcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : mcd(b, a % b));

function reducir(r: Racional): Racional {
  if (r.d === 0) return r;
  const g = mcd(r.n, r.d) || 1;
  const s = r.d < 0 ? -1 : 1;
  return { n: (s * r.n) / g, d: (s * r.d) / g };
}

/** "11/10", "4868", "-3" → racional. `null` si no es un número de esa forma. */
function leerNumero(texto: string): Racional | null {
  const t = String(texto ?? "").replace(/\s+/g, "").replace(/[−–—]/g, "-");
  const f = t.match(/^(-?\d+)\/(\d+)$/);
  if (f) return Number(f[2]) ? reducir({ n: Number(f[1]), d: Number(f[2]) }) : null;
  if (/^-?\d+$/.test(t)) return { n: Number(t), d: 1 };
  return null;
}

/**
 * El valor de una suma o resta de enteros y fracciones: "6/10 + 5/10",
 * "2411 + 2457", "3/5 + 1/2". `null` para cualquier otra cosa: un producto, un
 * paréntesis, una incógnita. Es a propósito estrecho: sólo se cierra lo que se
 * puede comprobar sin interpretar.
 */
export function valorDeSuma(texto: string): Racional | null {
  const t = String(texto ?? "").replace(/\s+/g, "").replace(/[−–—]/g, "-");
  if (!t || !/^-?\d+(\/\d+)?([+-]\d+(\/\d+)?)+$/.test(t)) return null;
  let total: Racional = { n: 0, d: 1 };
  for (const [, signo, n, d] of t.matchAll(/([+-]?)(\d+)(?:\/(\d+))?/g)) {
    const den = d ? Number(d) : 1;
    if (!den) return null;
    const num = (signo === "-" ? -1 : 1) * Number(n);
    total = reducir({ n: total.n * den + num * total.d, d: total.d * den });
  }
  return total;
}

const iguales = (a: Racional | null, b: Racional | null) =>
  a != null && b != null && a.n * b.d === b.n * a.d;

export type Cierre =
  | { accion: "completar"; indice: number; texto: string }
  | { accion: "anadir"; texto: string };

export function cierreDelDesarrollo(opciones: {
  /** El ejercicio de la tarjeta: "3/5 + 1/2 = ?". */
  enunciado: string | null | undefined;
  /** Las líneas del desarrollo, en orden. */
  lineas: readonly string[];
  /** La respuesta que el alumno acaba de acertar: "11/10". */
  respuesta: string | null | undefined;
}): Cierre | null {
  const respuesta = String(opciones.respuesta ?? "").trim();
  const valor = leerNumero(respuesta);
  if (!valor) return null;

  const compacta = (t: string) => t.replace(/\s+/g, "");
  // Si el resultado ya está escrito al final de alguna línea, está cerrado.
  if (opciones.lineas.some((l) => compacta(String(l)).endsWith(`=${compacta(respuesta)}`))) {
    return null;
  }

  // La última línea, a medias y valiendo justo la respuesta: se completa ella.
  const indice = opciones.lineas.length - 1;
  const ultima = indice >= 0 ? String(opciones.lineas[indice]).trim() : "";
  if (ultima && !ultima.includes("=") && iguales(valorDeSuma(ultima), valor)) {
    return { accion: "completar", indice, texto: `${ultima} = ${respuesta}` };
  }

  // Si no, el enunciado resuelto, siempre que dé lo que se dice.
  const base = String(opciones.enunciado ?? "").replace(/=\s*[?¿]\s*$/, "").trim();
  if (base && iguales(valorDeSuma(base), valor)) {
    return { accion: "anadir", texto: `${base} = ${respuesta}` };
  }
  return null;
}
