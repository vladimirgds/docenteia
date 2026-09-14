/**
 * EL EJERCICIO NO PUEDE QUEDAR A MEDIAS.
 *
 * Lo reportó el cliente sobre una lección de fracciones: "¡Lección completada!"
 * en el subtítulo y, en la pizarra, el desarrollo cortado en "6/10 + 5/10", sin
 * el 11/10. Y después lo fijó como norma: "ningún ejercicio puede quedar
 * inconcluso; el último paso debe mostrar siempre el resultado final enmarcado
 * con su feedback de conclusión".
 *
 * Aquí se decide cómo cerrar el ejercicio que el alumno acaba de resolver —o
 * de fallar con los intentos agotados—, con la respuesta esperada:
 *
 *   · si la última línea ya dice la respuesta ("… = 11/10"), se ETIQUETA como
 *     cierre, para que se enmarque;
 *   · si es una operación a medias que vale exactamente la respuesta —"6/10 +
 *     5/10" o "6/10 + 5/10 = ?"—, se completa con ella;
 *   · si no, se añade el enunciado resuelto, CONSOLIDADO: "3/5 + 1/2 = 6/10 +
 *     5/10 = 11/10", "x = 3", "derivada de 5x² = 10x".
 *
 * La línea de cierre va etiquetada como `resultado`: la pizarra la enmarca, le
 * pone el visto y la anuncia como "Resultado final".
 *
 * Nunca se escribe una cuenta que no se haya comprobado: la respuesta tiene que
 * salir de verdad del enunciado —sumando, sustituyendo la x, derivando o
 * multiplicando de vuelta—; si no se puede comprobar, no se toca nada.
 */

import { derivar } from "../matematicas/derivar.ts";
import { equivalentes } from "../matematicas/equivalencia.ts";
import { analizar, evaluar, variablesDe } from "../matematicas/expresiones.ts";
import type { OperacionPaso } from "./marcado.ts";

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

/** "11/10", "4868", "-3", "3.5" → racional. `null` si no es un número de esa forma. */
function leerNumero(texto: string): Racional | null {
  const t = String(texto ?? "").replace(/\s+/g, "").replace(/[−–—]/g, "-").replace(",", ".");
  const f = t.match(/^(-?\d+)\/(\d+)$/);
  if (f) return Number(f[2]) ? reducir({ n: Number(f[1]), d: Number(f[2]) }) : null;
  if (/^-?\d+$/.test(t)) return { n: Number(t), d: 1 };
  const dec = t.match(/^(-?)(\d+)\.(\d{1,6})$/);
  if (dec) {
    const d = 10 ** dec[3].length;
    return reducir({ n: (dec[1] ? -1 : 1) * (Number(dec[2]) * d + Number(dec[3])), d });
  }
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

/** El valor numérico de una expresión SIN incógnitas: "12 × 4", "84 ÷ 4". */
function valorNumericoDe(texto: string): number | null {
  const nodo = analizar(texto);
  if (!nodo || variablesDe(nodo).length > 0) return null;
  const v = evaluar(nodo, {});
  return Number.isFinite(v) ? v : null;
}

const casi = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

export type Cierre =
  | { accion: "completar"; indice: number; texto: string; operacion: OperacionPaso; narracion: string }
  | { accion: "anadir"; texto: string; operacion: OperacionPaso; narracion: string };

/** Una línea del desarrollo, como la guarda el aula: texto y, si la trae, su etiqueta. */
export type LineaDelDesarrollo = string | { texto: string; operacion?: { tipo: string } | null };

/**
 * La suma de dos fracciones, CONSOLIDADA como la cierra el tutor en el ejemplo:
 * "3/5 + 1/2 = 6/10 + 5/10 = 11/10", o "2/6 + 3/6 = 5/6" si ya comparten
 * denominador. `null` si el enunciado no es eso o si no da `valor`.
 */
function sumaConsolidada(base: string, valor: Racional): string | null {
  const m = base.replace(/\s+/g, "").replace(/[−–—]/g, "-").match(/^(\d+)\/(\d+)([+-])(\d+)\/(\d+)$/);
  if (!m) return null;
  const [n1, d1, , n2, d2] = [Number(m[1]), Number(m[2]), m[3], Number(m[4]), Number(m[5])];
  if (!d1 || !d2) return null;
  const op = m[3];
  const L = (d1 * d2) / mcd(d1, d2);
  const a = n1 * (L / d1);
  const b = n2 * (L / d2);
  const s = op === "+" ? a + b : a - b;
  const total = reducir({ n: s, d: L });
  if (!iguales(total, valor)) return null;
  const miembros = [`${n1}/${d1} ${op} ${n2}/${d2}`];
  if (d1 !== d2) miembros.push(`${a}/${L} ${op} ${b}/${L}`);
  miembros.push(`${s}/${L}`);
  const simple = total.d === 1 ? String(total.n) : `${total.n}/${total.d}`;
  if (simple !== `${s}/${L}`) miembros.push(simple);
  return miembros.join(" = ");
}

/** Lo que pide el enunciado, sin rótulo ni interrogación: "Ejercicio 1:  3/5 + 1/2 = ?" → "3/5 + 1/2". */
function baseDelEnunciado(enunciado: string): string {
  return String(enunciado ?? "")
    .replace(/^\s*ejercicio[^:]{0,20}:\s*/i, "")
    .replace(/^\s*¿?\s*(cu[aá]nto\s+(es|vale)|cu[aá]l\s+es\s+la\s+derivada\s+de|c[oó]mo\s+se\s+factoriza)\s+/i, "")
    .replace(/\?.*$/, "")
    .replace(/=\s*$/, "")
    .trim();
}

export function cierreDelDesarrollo(opciones: {
  /** El ejercicio de la tarjeta: "3/5 + 1/2 = ?". */
  enunciado: string | null | undefined;
  /** Las líneas del desarrollo, en orden. */
  lineas: readonly LineaDelDesarrollo[];
  /** La respuesta esperada del ejercicio: "11/10". */
  respuesta: string | null | undefined;
  /** La pregunta que se le hizo, que dice QUÉ se pedía: "¿Cuál es la derivada de 5x²?". */
  pregunta?: string | null;
}): Cierre | null {
  const respuesta = String(opciones.respuesta ?? "").trim();
  if (!respuesta) return null;
  const valor = leerNumero(respuesta);

  const operacion: OperacionPaso = { tipo: "resultado", terminosFoco: [respuesta] };
  const narracion = `Resultado final: ${respuesta}.`;
  const cierre = (texto: string): Cierre => ({ accion: "anadir", texto, operacion, narracion });

  const lineas = opciones.lineas.map((l) =>
    typeof l === "string" ? { texto: l, operacion: null } : { texto: l.texto, operacion: l.operacion ?? null },
  );
  const indice = lineas.length - 1;
  const ultima = indice >= 0 ? lineas[indice] : null;

  // Ya cerrado: la última línea ES el cierre.
  if (ultima?.operacion?.tipo === "resultado") return null;

  const compacta = (t: string) => t.replace(/\s+/g, "");
  const textoUltima = String(ultima?.texto ?? "").trim();

  if (textoUltima) {
    // La última línea ya dice la respuesta: sólo le falta la etiqueta que la enmarca.
    if (compacta(textoUltima).endsWith(`=${compacta(respuesta)}`)) {
      return { accion: "completar", indice, texto: textoUltima, operacion, narracion };
    }
    // A medias —"6/10 + 5/10 = ?"— o sin igual —"6/10 + 5/10"—, y valiendo justo la respuesta.
    const izquierda = textoUltima.replace(/=\s*\?\s*$/, "").trim();
    if (valor && (izquierda !== textoUltima || !textoUltima.includes("=")) && iguales(valorDeSuma(izquierda), valor)) {
      return { accion: "completar", indice, texto: `${izquierda} = ${respuesta}`, operacion, narracion };
    }
  }

  const base = baseDelEnunciado(String(opciones.enunciado ?? ""));
  if (!base) return null;
  const pide = `${opciones.pregunta ?? ""} ${opciones.enunciado ?? ""}`.toLowerCase();

  // DERIVADA: se deriva de verdad y se compara.
  if (/deriv/.test(pide)) {
    const expr = base.replace(/^derivada\s+de\s+/i, "").trim();
    const derivada = derivar(expr);
    if (derivada && equivalentes(derivada, respuesta) === true) return cierre(`derivada de ${expr} = ${respuesta}`);
    return null;
  }

  // FACTORIZACIÓN: se multiplica de vuelta y se compara con la expresión.
  if (/factoriz/.test(pide)) {
    if (equivalentes(base, respuesta) === true) return cierre(`${base} = ${respuesta}`);
    return null;
  }

  // ECUACIÓN: la solución se sustituye en los dos miembros.
  if (base.includes("=")) {
    const [izq, der, ...resto] = base.split("=");
    if (resto.length > 0 || !valor) return null;
    const nIzq = analizar(izq);
    const nDer = analizar(der);
    if (!nIzq || !nDer) return null;
    const variables = [...new Set([...variablesDe(nIzq), ...variablesDe(nDer)])];
    if (variables.length !== 1) return null;
    const x = valor.n / valor.d;
    const [v] = variables;
    if (!casi(evaluar(nIzq, { [v]: x }), evaluar(nDer, { [v]: x }))) return null;
    return cierre(`${v} = ${respuesta}`);
  }

  if (!valor) return null;

  // FRACCIONES: el enunciado resuelto, consolidado con el paso por el común denominador.
  const consolidada = sumaConsolidada(base, valor);
  if (consolidada) return cierre(consolidada);

  // SUMAS Y RESTAS de enteros o fracciones.
  if (iguales(valorDeSuma(base), valor)) return cierre(`${base} = ${respuesta}`);

  // PRODUCTOS Y COCIENTES: "12 × 4", "84 ÷ 4".
  const numerico = valorNumericoDe(base);
  if (numerico != null && casi(numerico, valor.n / valor.d)) return cierre(`${base} = ${respuesta}`);

  // Y la división no exacta, que se da con un decimal y truncada ("1000 ÷ 3 ≈ 333.3"): se cierra con
  // "≈", y sólo si ése es de verdad el valor truncado.
  const decimales = respuesta.match(/[.,](\d{1,3})$/)?.[1].length ?? 0;
  if (numerico != null && decimales > 0) {
    const escala = 10 ** decimales;
    if (casi(Math.trunc(numerico * escala) / escala, valor.n / valor.d)) return cierre(`${base} ≈ ${respuesta}`);
  }

  return null;
}
