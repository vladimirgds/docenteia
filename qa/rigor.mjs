// RIGOR MATEMÁTICO: TODO LO QUE SE ESCRIBE Y TODO LO QUE SE DICE, COMPROBADO
// CON UN MOTOR INDEPENDIENTE
//
// POR QUÉ EXISTE
// Las demás baterías comprueban que la lección tenga la forma correcta —sus
// fases, sus marcas, sus tamaños— y que el corrector califique bien. Ninguna
// comprobaba, una por una, las AFIRMACIONES MATEMÁTICAS que el alumno ve y oye:
// cada igualdad escrita en la pizarra, cada "4 más 8 son 12" del tutor, cada
// pie de una escena animada, cada línea que la propia animación compone por su
// cuenta (la compensación de un despeje, el reparto de un paréntesis, la
// amplificación de una fracción, la cuenta en columna dibujada). Ahí es donde
// puede colarse un error de cálculo sin que nada lo note.
//
// Esta batería recorre TODO el catálogo —los cuatro motores de aritmética,
// fracciones, ecuaciones, derivadas y factorización, en todos sus niveles, más
// el desglose de cada ejercicio y el ejercicio nuevo que sigue a una práctica—
// y verifica cada afirmación con aritmética racional exacta y álgebra de
// polinomios escritas AQUÍ: si el motor y el verificador compartieran código,
// compartirían el error.
//
//   node qa/rigor.mjs

import { createRequire } from "node:module";

import katex from "katex";

const require = createRequire(import.meta.url);

import { escenaDeLinea } from "../lib/leccion/animacion.ts";
import { resolverEjercicio } from "../lib/leccion/correccion.ts";
import { buildHint, checkAnswer } from "../public/pseLight.js";
import { computeAnswer, processLSG } from "../src/preLight.js";
import * as G from "../src/lsgPrompt.js";

// ── Resultados ───────────────────────────────────────────────────────────────

let ok = 0;
const fallos = [];
/** Cuántas veces ha disparado cada comprobación: lo que no dispara, no verifica. */
const veces = {};
const anotar = (clave) => {
  veces[clave] = (veces[clave] ?? 0) + 1;
};
/** Durante la autocomprobación, lo que falla se recoge aquí en vez de cantarse. */
let cazados = null;
function check(nombre, condicion, detalle = "") {
  if (cazados) {
    if (!condicion) cazados.push(`${nombre} — ${detalle}`);
    return;
  }
  if (condicion) ok++;
  else if (!fallos.some((f) => f.nombre === nombre && f.detalle === detalle)) {
    fallos.push({ nombre, detalle });
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

/**
 * EL VERIFICADOR SE COMPRUEBA A SÍ MISMO.
 *
 * Una batería que no caza nada da siempre "0 fallos", que es justo lo que
 * parece un éxito. Antes de recorrer el catálogo se le pasan errores conocidos
 * —de los que de verdad aparecieron— y se exige que los cace todos: sólo
 * entonces significa algo que luego no encuentre ninguno.
 */
let autocomprobaciones = 0;
function debeCazar(descripcion, fn) {
  autocomprobaciones++;
  cazados = [];
  try {
    fn();
  } catch (e) {
    cazados.push(`excepción: ${String(e.message).slice(0, 80)}`);
  }
  const encontrados = cazados;
  cazados = null;
  check(`el verificador caza: ${descripcion}`, encontrados.length > 0, "no lo detectó");
}

// ── Aritmética racional exacta (independiente) ───────────────────────────────

const mcd = (a, b) => (b === 0n ? (a < 0n ? -a : a) : mcd(b, a % b));
function R(n, d = 1n) {
  n = BigInt(n);
  d = BigInt(d);
  if (d === 0n) return null;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = mcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const suma = (a, b) => (a && b ? R(a.n * b.d + b.n * a.d, a.d * b.d) : null);
const resta = (a, b) => (a && b ? R(a.n * b.d - b.n * a.d, a.d * b.d) : null);
const porR = (a, b) => (a && b ? R(a.n * b.n, a.d * b.d) : null);
const entreR = (a, b) => (a && b && b.n !== 0n ? R(a.n * b.d, a.d * b.n) : null);
const igualR = (a, b) => Boolean(a && b && a.n === b.n && a.d === b.d);

// ── Polinomios en una variable: mapa exponente → racional ────────────────────

const constante = (r) => (r ? new Map([[0, r]]) : null);
function sumaP(a, b) {
  if (!a || !b) return null;
  const s = new Map(a);
  for (const [e, c] of b) s.set(e, suma(s.get(e) ?? R(0), c));
  return limpiar(s);
}
function restaP(a, b) {
  if (!a || !b) return null;
  const s = new Map(a);
  for (const [e, c] of b) s.set(e, resta(s.get(e) ?? R(0), c));
  return limpiar(s);
}
function porP(a, b) {
  if (!a || !b) return null;
  const s = new Map();
  for (const [ea, ca] of a) {
    for (const [eb, cb] of b) {
      const e = ea + eb;
      s.set(e, suma(s.get(e) ?? R(0), porR(ca, cb)));
    }
  }
  return limpiar(s);
}
function entreP(a, b) {
  if (!a || !b) return null;
  // Sólo se divide entre constantes: es todo lo que aparece en estas lecciones.
  if (b.size !== 1 || !b.has(0)) return null;
  const k = b.get(0);
  if (!k || k.n === 0n) return null;
  const s = new Map();
  for (const [e, c] of a) s.set(e, entreR(c, k));
  return limpiar(s);
}
function potenciaP(a, n) {
  if (!a || !Number.isInteger(n) || n < 0) return null;
  let r = constante(R(1));
  for (let i = 0; i < n; i++) r = porP(r, a);
  return r;
}
function limpiar(m) {
  for (const [e, c] of [...m]) if (!c || c.n === 0n) m.delete(e);
  return m;
}
const esCero = (p) => p != null && p.size === 0;
const igualesP = (a, b) => a != null && b != null && esCero(restaP(a, b));
const esConstante = (p) => p != null && (p.size === 0 || (p.size === 1 && p.has(0)));
const valorDe = (p) => (esConstante(p) ? (p.get(0) ?? R(0)) : null);
const gradoDe = (p) => (p && p.size ? Math.max(...p.keys()) : 0);

/** Deriva un polinomio (independiente del motor). */
function derivarP(p) {
  if (!p) return null;
  const d = new Map();
  for (const [e, c] of p) if (e > 0) d.set(e - 1, porR(c, R(e)));
  return limpiar(d);
}

// ── Lector de expresiones ────────────────────────────────────────────────────

const SUPER = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "ⁿ": "n" };

/** Normaliza a una sintaxis única: números, x, + - * / ^ y paréntesis. */
export function normalizar(texto) {
  let s = String(texto ?? "");
  s = s.replace(/[−–—]/g, "-").replace(/[·×]/g, "*").replace(/÷/g, "/").replace(/,/g, ".");
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ]+/g, (m) => `^${[...m].map((c) => SUPER[c] ?? "").join("")}`);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Lee una expresión y devuelve su polinomio, o null si no es una expresión
 * matemática que esta batería sepa leer (entonces no se juzga).
 */
export function leer(texto) {
  const s = normalizar(texto).replace(/\s+/g, "");
  // Se admiten las llaves del exponente de LaTeX: "x^{2}" es una potencia, no
  // una expresión ilegible (sin esto, media docena de preguntas del banco
  // quedaban sin juzgar y nadie lo sabía).
  if (!s || !/^[-+*/^(){}.\dxyzab]+$/i.test(s)) return null;
  let i = 0;
  const fin = () => i >= s.length;
  const ver = () => s[i];

  function expresion() {
    let v = termino();
    while (!fin() && (ver() === "+" || ver() === "-")) {
      const op = s[i++];
      const t = termino();
      v = op === "+" ? sumaP(v, t) : restaP(v, t);
    }
    return v;
  }
  function termino() {
    let v = unario();
    while (!fin() && (ver() === "*" || ver() === "/")) {
      const op = s[i++];
      const t = unario();
      v = op === "*" ? porP(v, t) : entreP(v, t);
    }
    // Yuxtaposición: "2x", "3(x+1)", "(x+1)(x-1)".
    while (!fin() && (/[a-z(]/i.test(ver()) || /\d/.test(ver()))) {
      const antes = i;
      const t = unario();
      if (t == null || i === antes) return null;
      v = porP(v, t);
    }
    return v;
  }
  function unario() {
    if (fin()) return null;
    if (ver() === "-") {
      i++;
      const v = unario();
      return v ? porP(constante(R(-1)), v) : null;
    }
    if (ver() === "+") {
      i++;
      return unario();
    }
    return potencia();
  }
  function potencia() {
    let base = atomo();
    if (!fin() && ver() === "^") {
      i++;
      let e = "";
      if (ver() === "{") {
        i++;
        while (!fin() && ver() !== "}") e += s[i++];
        i++;
      } else {
        if (ver() === "-") e += s[i++];
        while (!fin() && /\d/.test(ver())) e += s[i++];
      }
      const n = Number(e);
      if (!Number.isInteger(n) || n < 0) return null;
      base = potenciaP(base, n);
    }
    return base;
  }
  function atomo() {
    if (fin()) return null;
    if (ver() === "(") {
      i++;
      const v = expresion();
      if (ver() !== ")") return null;
      i++;
      return v;
    }
    if (/\d/.test(ver())) {
      let n = "";
      while (!fin() && /[\d.]/.test(ver())) n += s[i++];
      if (n.includes(".")) {
        const [ent, dec] = n.split(".");
        return constante(R(BigInt(ent + dec), 10n ** BigInt(dec.length)));
      }
      return constante(R(BigInt(n)));
    }
    if (/[a-z]/i.test(ver())) {
      i++;
      return new Map([[1, R(1)]]);
    }
    return null;
  }

  const v = expresion();
  return fin() ? v : null;
}

/** El LaTeX que compone la pizarra, devuelto como texto plano legible. */
export function latexAPlano(latex) {
  let s = String(latex ?? "");
  // Las marcas de la animación no son contenido: se quedan con su cuerpo.
  for (let k = 0; k < 12; k++) {
    const antes = s;
    s = s.replace(/\\htmlClass\{[^{}]*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, "$1");
    s = s.replace(/\\boxed\{((?:[^{}]|\{[^{}]*\})*)\}/g, "$1");
    s = s.replace(/\\text\{([^{}]*)\}/g, " $1 ");
    if (s === antes) break;
  }
  s = s.replace(/\\phantom\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
  for (let k = 0; k < 8; k++) {
    const antes = s;
    s = s.replace(/\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, "(($1)/($2))");
    if (s === antes) break;
  }
  s = s
    .replace(/\\times|\\cdot/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\left|\\right/g, "")
    .replace(/\\[,;!]/g, " ")
    .replace(/\\quad|\\qquad/g, " ")
    .replace(/\\neq/g, "≠")
    .replace(/\\pm/g, "±")
    .replace(/\{\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/** Las FILAS de lo compuesto: un `aligned` son varias afirmaciones, no una. */
export function filasDe(latex) {
  const plano = latexAPlano(latex);
  const alineado = plano.match(/\\begin\{aligned\}([\s\S]*)\\end\{aligned\}/);
  const cuerpo = alineado ? alineado[1] : plano;
  return cuerpo
    .split(/\\\\(?:\[[^\]]*\])?/)
    .map((f) => f.replace(/&/g, "").trim())
    .filter(Boolean);
}

// ── Afirmaciones ─────────────────────────────────────────────────────────────

/**
 * Comprueba una CADENA DE IGUALDADES ("a = b = c"): todas sus partes valen lo
 * mismo. Devuelve null si no hay nada que juzgar (no es una igualdad legible).
 */
function cadenaCierta(texto) {
  const s = normalizar(texto);
  if (!s.includes("=") || /[≠±<>]/.test(s)) return null;
  const partes = s.split("=").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const vals = partes.map(leer);
  if (vals.some((v) => v == null)) return null;
  // Con variable, una igualdad puede ser una ECUACIÓN (no una identidad): eso
  // lo juzga quien conoce el ejercicio, no esta función.
  if (vals.some((v) => !esConstante(v))) return null;
  for (let k = 1; k < vals.length; k++) if (!igualR(valorDe(vals[0]), valorDe(vals[k]))) return false;
  return true;
}

/** La solución de una ecuación lineal en x, como racional; null si no lo es. */
function solucionDe(texto) {
  const s = normalizar(texto);
  const partes = s.split("=");
  if (partes.length !== 2) return null;
  const izq = leer(partes[0]);
  const der = leer(partes[1]);
  if (!izq || !der) return null;
  const dif = restaP(izq, der);
  if (!dif || gradoDe(dif) !== 1) return null;
  const a = dif.get(1);
  const b = dif.get(0) ?? R(0);
  if (!a || a.n === 0n) return null;
  return entreR(porR(b, R(-1)), a);
}

/** Frases del tutor con una cuenta dentro: "4 más 8 son 12", "16 menos 6 son 10". */
const VERBALES = [
  [/(-?[\d./]+)\s+más\s+(-?[\d./]+)(?:\s+más\s+(-?[\d./]+))?\s+(?:que llevábamos\s+)?(?:son|es|da|hacen)\s+(-?[\d./]+)/gi, "+"],
  [/(-?[\d./]+)\s+menos\s+(-?[\d./]+)\s+(?:son|es|da|hacen)\s+(-?[\d./]+)/gi, "-"],
  [/(-?[\d./]+)\s+por\s+(-?[\d./]+)\s+(?:son|es|da|hacen)\s+(-?[\d./]+)/gi, "*"],
  [/(-?[\d./]+)\s+entre\s+(-?[\d./]+)\s+(?:son|es|da|hacen)\s+(-?[\d./]+)/gi, "/"],
];

/** Todas las afirmaciones verbales de una frase, ya juzgadas. */
function verbalesCiertas(frase) {
  const malas = [];
  let halladas = 0;
  let disparo = false;
  for (const [patron, op] of VERBALES) {
    for (const m of String(frase ?? "").matchAll(patron)) {
      const nums = m.slice(1).filter(Boolean).map(leer);
      if (nums.some((n) => n == null || !esConstante(n))) continue;
      const esperado = nums.slice(0, -1).reduce((acc, n) => {
        if (acc == null) return n;
        return op === "+" ? sumaP(acc, n) : op === "-" ? restaP(acc, n) : op === "*" ? porP(acc, n) : entreP(acc, n);
      }, null);
      const dicho = nums[nums.length - 1];
      halladas++;
      if (!disparo) {
        disparo = true;
        anotar("cuenta dicha por el tutor");
      }
      if (!esperado || !igualesP(esperado, dicho)) malas.push(m[0]);
    }
  }
  return { halladas, malas };
}

/** "la derivada de P es Q" / "derivada de P = Q". */
function derivadasCiertas(frase) {
  const malas = [];
  let halladas = 0;
  const patrones = [
    /derivada de ([^.,;]+?) es ([^.,;]+?)(?=[.,;]|$)/gi,
    /derivada de ([^=]+?)\s*=\s*([^.,;]+?)(?=[.,;]|$)/gi,
  ];
  for (const patron of patrones) {
    for (const m of String(frase ?? "").matchAll(patron)) {
      const f = leer(m[1]);
      const d = leer(m[2]);
      if (!f || !d) continue;
      halladas++;
      if (!igualesP(derivarP(f), d)) malas.push(m[0]);
    }
  }
  return { halladas, malas };
}

/** Notas de columna: "unidades: 4 + 8 = 12 (se escribe 2, se lleva 1)". */
function columnaCierta(texto) {
  const m = String(texto ?? "").match(
    /^(unidades|decenas|centenas|unidades de millar|millares)\s*:\s*(-?\d+)\s*([+-])\s*(-?\d+)(?:\s*([+-])\s*(-?\d+))?\s*=\s*(-?\d+)(?:\s*\(se escribe (-?\d+)(?:, se lleva (-?\d+))?[^)]*\))?/i,
  );
  if (!m) return null;
  const [, , a, op1, b, op2, c, total, escribe, lleva] = m;
  let v = Number(a) + (op1 === "+" ? Number(b) : -Number(b));
  if (op2) v += op2 === "+" ? Number(c) : -Number(c);
  if (v !== Number(total)) return `${texto} · da ${v}`;
  if (escribe != null) {
    const cifra = ((v % 10) + 10) % 10;
    if (Number(escribe) !== cifra) return `${texto} · se escribe ${cifra}`;
    if (lleva != null && Number(lleva) !== Math.floor(v / 10)) return `${texto} · se lleva ${Math.floor(v / 10)}`;
  }
  return null;
}

/** La cuenta en columna DIBUJADA: sus cifras tienen que dar el resultado. */
function columnaDibujadaCierta(latex) {
  const cuerpo = String(latex ?? "").match(/\\begin\{array\}\{[^}]*\}([\s\S]*?)\\end\{array\}/);
  if (!cuerpo) return null;
  const filas = cuerpo[1]
    .split(/\\\\/)
    .map((f) => f.replace(/\\hline/g, "").trim())
    .filter(Boolean)
    .map((f) => f.split("&").map((c) => latexAPlano(c).replace(/\\scriptstyle|\s/g, "")));
  // Las filas con cifras: la primera con signo es el segundo operando.
  const numeros = filas.map((f) => ({
    signo: f.find((c) => c === "+" || c === "-") ?? "",
    cifras: f.filter((c) => /^\d$/.test(c)).join(""),
    llevadas: f.filter((c) => /^\d$/.test(c)).length,
  }));
  const conCifras = numeros.filter((n) => n.cifras.length > 0);
  if (conCifras.length < 3) return null;
  // La última fila con cifras es el resultado; las dos anteriores con signo o
  // sin él, los operandos. La fila de llevadas queda arriba y se descarta si su
  // número de cifras no cuadra con los operandos.
  const resultado = conCifras[conCifras.length - 1];
  const b = conCifras[conCifras.length - 2];
  const a = conCifras[conCifras.length - 3];
  if (!a.cifras || !b.cifras || !resultado.cifras) return null;
  const op = b.signo === "-" ? -1 : 1;
  const esperado = Number(a.cifras) + op * Number(b.cifras);
  if (Number(resultado.cifras) !== esperado) {
    return `${a.cifras} ${b.signo || "+"} ${b.cifras} dibujado como ${resultado.cifras} (es ${esperado})`;
  }
  return null;
}


// ── Lo que se DICE sobre cada escena, comprobado contra la línea ─────────────

/** Los términos de un polinomio, leídos aquí: signo, coeficiente y exponente. */
function terminosDe(expresion) {
  const s = normalizar(expresion).replace(/\s+/g, "");
  if (!/^[-+]?(\d*[a-z]?(\^\d+)?)([-+]\d*[a-z]?(\^\d+)?)*$/i.test(s)) return null;
  const out = [];
  for (const m of s.matchAll(/([+-]?)(\d*)([a-z]?)(?:\^(\d+))?/gi)) {
    if (!m[0]) continue;
    if (!m[2] && !m[3]) continue;
    out.push({
      negativo: m[1] === "-",
      coeficiente: m[2] || "",
      variable: m[3] || "",
      exponente: m[4] || "",
    });
  }
  return out.length ? out : null;
}

/** Una fracción escrita "a/b" o "(a)/(b)", como par de enteros. */
function fraccionDe(texto) {
  const m = normalizar(texto).replace(/[()\s]/g, "").match(/^(-?\d+)\/(-?\d+)$/);
  return m ? { n: Number(m[1]), d: Number(m[2]) } : null;
}

/**
 * JUZGA UN PIE: lo que la pizarra dice mientras marca algo.
 *
 * Aquí es donde se cuela un error sin que nadie lo note: el resultado final
 * puede estar bien y la explicación ser falsa —"su coeficiente es 3" en un
 * término que vale -3, "quitamos 6" mientras se suma 6—. Cada afirmación se
 * recalcula contra la línea que la escena está componiendo.
 */
function juzgarPie(foco, escena, donde, indice) {
  const frase = String(foco?.narracion ?? "");
  if (!frase) return;
  juzgarFrase(frase, `${donde} · pie`);
  const linea = normalizar(escena.texto ?? "");
  const [izqLinea, derLinea] = linea.split("=").map((p) => (p ?? "").trim());

  // "El 2 multiplica a x: da 2x."
  const producto = frase.match(/El (-?[\d.]+) multiplica a (-?[^:]+): da ([^.]+)\./i);
  if (producto) {
    anotar("reparto del paréntesis");
    const f = leer(producto[1]);
    const t = leer(producto[2]);
    const r = leer(producto[3]);
    check(`el reparto del paréntesis está bien hecho (${donde})`, Boolean(f && t && r) && igualesP(porP(f, t), r), frase);
  }

  // "Queda 2x + 6 = 16." — lo repartido tiene que valer lo mismo que la línea.
  const queda = frase.match(/^Queda ([^.]+)\.$/i);
  if (queda && escena.clase === "distributiva") {
    anotar("lo que queda tras repartir");
    const partes = queda[1].split("=").map((p) => leer(p));
    const original = izqLinea ? leer(izqLinea) : null;
    if (partes[0] && original) {
      check(`lo que queda tras repartir vale lo mismo (${donde})`, igualesP(partes[0], original), `${frase} · sobre ${escena.texto}`);
    }
  }

  // "Queda 9 entre 12." — la fracción que queda es la de la línea.
  const entre = frase.match(/^Queda (-?\d+) entre (-?\d+)\.$/i);
  if (entre && derLinea) {
    anotar("la fracción que queda");
    const dicha = R(BigInt(entre[1]), BigInt(entre[2]));
    // Lo que queda es el ÚLTIMO eslabón de la cadena: "2/6 + 3/6 = (2 + 3)/6 = 5/6".
    const escrita = fraccionDe(linea.split("=").pop().trim());
    if (escrita) {
      check(`la fracción que queda es la escrita (${donde})`, igualR(dicha, R(BigInt(escrita.n), BigInt(escrita.d))), `${frase} · sobre ${escena.texto}`);
    }
  }

  // "Multiplicamos arriba y abajo por 3." / "Dividimos arriba y abajo entre 4."
  const porK = frase.match(/Multiplicamos arriba y abajo por (-?\d+)/i);
  const entreK = frase.match(/Dividimos arriba y abajo entre (-?\d+)/i);
  if ((porK || entreK) && izqLinea && derLinea) {
    anotar("factor de amplificación o simplificación");
    const a = fraccionDe(izqLinea);
    const b = fraccionDe(derLinea);
    const k = Number((porK ?? entreK)[1]);
    if (a && b && k) {
      const bien = porK ? a.n * k === b.n && a.d * k === b.d : a.n === b.n * k && a.d === b.d * k;
      check(`el factor que se dice es el que se aplica (${donde})`, bien, `${frase} · sobre ${escena.texto}`);
    }
  }

  // "El denominador 12 no cambia: se queda en 12."
  const den = frase.match(/El denominador (-?\d+) no cambia: se queda en (-?\d+)/i);
  if (den) {
    const dela = fraccionDe(izqLinea.split("+")[0].trim());
    check(
      `el denominador que no cambia es el de las fracciones (${donde})`,
      den[1] === den[2] && (!dela || String(dela.d) === den[1]),
      `${frase} · sobre ${escena.texto}`,
    );
  }

  // "Restamos 6 en los dos lados" / "Sumamos 6 en los dos lados": el verbo tiene
  // que decir lo que se hace, y el signo del término manda.
  const enLosDosLados = frase.match(/^(Restamos|Sumamos|Quitamos|Añadimos) (\d+) en los dos lados/i);
  if (enLosDosLados && escena.clase === "despeje") {
    anotar("la operación que se dice en el despeje");
    const terminos = terminosDe(izqLinea) ?? [];
    const constante = terminos.find((t) => !t.variable);
    if (constante) {
      const esperado = constante.negativo ? "Sumamos" : "Restamos";
      check(
        `la operación que se dice es la que se hace (${donde})`,
        enLosDosLados[1].toLowerCase() === esperado.toLowerCase() && enLosDosLados[2] === (constante.coeficiente || "1"),
        `${frase} · sobre ${escena.texto} (debería decir «${esperado} ${constante.coeficiente}»)`,
      );
    }
  }

  // "Dividimos los dos lados entre 2."
  const divide = frase.match(/Dividimos los dos lados entre (-?\d+)/i);
  if (divide) {
    anotar("dividir entre el coeficiente");
    const terminos = terminosDe(izqLinea) ?? [];
    const conX = terminos.find((t) => t.variable);
    if (conX) {
      const coef = `${conX.negativo ? "-" : ""}${conX.coeficiente || "1"}`;
      check(`se divide entre el coeficiente que hay escrito (${donde})`, divide[1] === coef, `${frase} · sobre ${escena.texto} (el coeficiente es ${coef})`);
    }
  }

  // "x vale 5." — contra la ecuación de la línea.
  const vale = frase.match(/^([a-z]) vale (-?[\d/]+)\.$/i);
  if (vale && linea.includes("=")) {
    anotar("la solución cantada");
    const sol = solucionDe(linea);
    const dicho = leer(vale[2]);
    if (sol && dicho && esConstante(dicho)) {
      check(`la solución que se canta es la de la ecuación (${donde})`, igualR(sol, valorDe(dicho)), `${frase} · sobre ${escena.texto}`);
    }
  }

  // "Escribo 2 y llevo 1." — con lo que se acaba de decir que suma.
  const escribo = frase.match(/son (-?\d+)\.?\s*Escribo (\d+)(?: y llevo (\d+))?/i);
  if (escribo) {
    anotar("cifra escrita y llevada");
    const total = Number(escribo[1]);
    const cifra = ((total % 10) + 10) % 10;
    const llevada = Math.floor(total / 10);
    check(
      `la cifra que se escribe y la que se lleva son las de esa columna (${donde})`,
      Number(escribo[2]) === cifra && (escribo[3] == null || Number(escribo[3]) === llevada),
      frase,
    );
  }

  // "pido prestada una decena: 13 menos 8 son 5" — la decena prestada suma 10.
  const prestada = frase.match(
    /a (-?\d+)(?:, ya rebajado a (-?\d+),)?\s*no le puedo quitar (\d+)[^:]*:\s*(-?\d+) menos (\d+) son (-?\d+)/i,
  );
  if (prestada) {
    anotar("préstamo de la resta");
    const [, arriba, rebajado, abajo, conPrestamo, abajo2, resultado] = prestada;
    // La cifra de partida es la ya rebajada por el préstamo anterior, si la hay.
    const base = Number(rebajado ?? arriba);
    check(
      `el préstamo suma una decena a la cifra de arriba (${donde})`,
      Number(conPrestamo) === base + 10 && abajo === abajo2 && Number(resultado) === Number(conPrestamo) - Number(abajo),
      frase,
    );
  }

  // "El resultado es 412." / "Resultado final: 412."
  const resultado = frase.match(/(?:El resultado es|Resultado final:)\s*([^.]+)\./i);
  if (resultado) {
    anotar("resultado cantado");
    const dicho = leer(resultado[1]);
    const cuenta = leer(derLinea && derLinea !== "?" ? derLinea : izqLinea);
    if (dicho && cuenta && esConstante(dicho) && esConstante(cuenta)) {
      check(`el resultado que se canta es el de la cuenta (${donde})`, igualR(valorDe(dicho), valorDe(cuenta)), `${frase} · sobre ${escena.texto}`);
    }
  }

  // El polinomio: cada término, su coeficiente y su exponente, con SU SIGNO.
  if (escena.clase === "polinomio") {
    const terminos = terminosDe(izqLinea);
    if (terminos) {
      anotar("términos del polinomio");
      const mira = frase.match(/^Miramos el término (.+)\.$/i);
      const coef = frase.match(/^Su coeficiente es (menos )?(-?\d+)\.$/i);
      const expo = frase.match(/^Su exponente es (-?\d+)\.$/i);
      // De qué término se habla: los focos van en orden, y cada "Miramos" abre
      // el suyo.
      const hasta = escena.focos.slice(0, indice + 1).filter((f) => /^Miramos el término/i.test(String(f.narracion ?? ""))).length;
      const t = terminos[Math.max(0, hasta - 1)];
      if (t) {
        if (mira) {
          const esperado = [
            t.negativo ? "menos " : "",
            t.coeficiente ? `${t.coeficiente}${t.variable ? " por " : ""}` : "",
            t.variable,
            t.exponente ? ` elevado a ${t.exponente}` : "",
          ].join("").trim();
          check(`el término que se nombra es el que se marca, con su signo (${donde})`, mira[1].trim() === esperado, `«${mira[1]}» debería ser «${esperado}» en ${escena.texto}`);
        }
        if (coef) {
          const dicho = `${coef[1] ? "-" : ""}${coef[2]}`;
          const real = `${t.negativo ? "-" : ""}${t.coeficiente || "1"}`;
          check(`el coeficiente que se dice es el del término, con su signo (${donde})`, dicho === real, `«${frase}» en ${escena.texto}: el coeficiente es ${real}`);
        }
        if (expo) {
          check(`el exponente que se dice es el del término (${donde})`, expo[1] === (t.exponente || "1"), `«${frase}» en ${escena.texto}: el exponente es ${t.exponente || "1"}`);
        }
      }
    }
  }
}

// ── El recorrido: cada línea, cada frase, cada escena ─────────────────────────

const leccion = (crudo) => {
  // Algunos generadores devuelven ya la lección envuelta, y otros no devuelven
  // LSG en absoluto para ciertas combinaciones: lo que no sea lección, no se juzga.
  const fuente = crudo?.lsg ?? crudo;
  if (!fuente || (!Array.isArray(fuente.directivas) && !Array.isArray(fuente.modulos))) return null;
  try {
    return processLSG(fuente, fuente.intencion, "prueba").lsg;
  } catch {
    return null;
  }
};

/**
 * Comprueba una frase hablada o un pie: sus cuentas y sus derivadas.
 *
 * SÓLO SE CUENTA LO QUE SE JUZGA. Una frase sin ninguna cuenta dentro no suma
 * una comprobación: un número inflado por las frases que no dicen matemáticas
 * es exactamente lo que hace que un "0 fallos" no signifique nada.
 */
function juzgarFrase(frase, donde) {
  const verbales = verbalesCiertas(frase);
  for (const mala of verbales.malas) check(`cuenta dicha correcta (${donde})`, false, mala);
  ok += verbales.halladas - verbales.malas.length;
  const derivadas = derivadasCiertas(frase);
  for (const mala of derivadas.malas) check(`derivada dicha correcta (${donde})`, false, mala);
  ok += derivadas.halladas - derivadas.malas.length;
  const cadena = cadenaCierta(frase.replace(/^[^:]*:\s*/, ""));
  if (cadena === false) check(`igualdad dicha correcta (${donde})`, false, frase);
  else if (cadena === true) ok++;
}

/** Comprueba una línea escrita y TODO lo que su escena compone y dice. */
function juzgarLinea(contenido, operacion, narracion, donde, contexto) {
  const texto = String(contenido ?? "");
  // 1. La nota de columna, con su cifra y su llevada.
  const notaMala = columnaCierta(texto);
  const esNota = /^(unidades|decenas|centenas|unidades de millar|millares)\s*:/i.test(texto);
  if (esNota) anotar("nota de columna");
  if (notaMala) check(`nota de columna correcta (${donde})`, false, notaMala);
  else if (esNota) ok++;

  // 2. La línea escrita: cadena de igualdades o ecuación equivalente.
  juzgarIgualdad(texto, `${donde} · escrito`, contexto);

  // 3. Lo que la ANIMACIÓN compone a partir de ella, fila a fila.
  const escena = escenaDeLinea({ latex: texto, ...(operacion ? { operacion } : {}), ...(narracion ? { narracion } : {}) }, "r");
  if (escena?.latex) {
    const dibujo = columnaDibujadaCierta(escena.latex);
    const hayArray = /\\begin\{array\}/.test(escena.latex);
    if (hayArray) anotar("cuenta en columna dibujada");
    if (dibujo) check(`cuenta en columna dibujada correcta (${donde})`, false, dibujo);
    else if (hayArray) ok++;
    if (!/\\begin\{array\}/.test(escena.latex)) {
      for (const fila of filasDe(escena.latex)) juzgarIgualdad(fila, `${donde} · compuesto`, contexto);
    }
    try {
      katex.renderToString(escena.latex, { displayMode: true, throwOnError: true, strict: false, trust: (c) => c.command === "\\htmlClass" });
      ok++;
    } catch (e) {
      check(`la escena se compone con KaTeX (${donde})`, false, `${texto}: ${String(e.message).slice(0, 60)}`);
    }
    (escena.focos ?? []).forEach((f, k) => juzgarPie(f, escena, donde, k));
  }
}

/**
 * Una igualdad escrita: si no tiene variable, sus partes valen lo mismo; si la
 * tiene y es una ecuación del ejercicio, tiene que ser EQUIVALENTE a él (misma
 * solución), que es lo único que autoriza a escribirla debajo.
 */
function juzgarIgualdad(texto, donde, contexto) {
  const s = normalizar(texto);
  if (!s.includes("=")) return;
  const cadena = cadenaCierta(s);
  if (cadena === false) {
    check(`igualdad escrita correcta (${donde})`, false, texto);
    return;
  }
  if (cadena === true) {
    anotar("igualdad escrita");
    ok++;
    return;
  }
  // Con variable: identidad (las dos partes son el mismo polinomio) o ecuación.
  const partes = s.split("=").map((p) => p.trim());
  const vals = partes.map(leer);
  if (vals.some((v) => v == null)) return;
  if (vals.every((v, k) => k === 0 || igualesP(vals[0], v))) {
    ok++;
    return;
  }
  const sol = solucionDe(`${partes[0]} = ${partes[partes.length - 1]}`);
  if (sol == null) return;
  if (contexto.solucion == null) {
    contexto.solucion = sol;
    ok++;
    return;
  }
  anotar("línea del despeje que conserva la solución");
  check(
    `cada línea del despeje conserva la solución (${donde})`,
    igualR(sol, contexto.solucion),
    `${texto} → x = ${sol.n}/${sol.d}, pero el ejercicio da x = ${contexto.solucion.n}/${contexto.solucion.d}`,
  );
}

/**
 * Cómo escribiría un alumno la MISMA respuesta: sin espacios, con "x =" delante,
 * con coma decimal, o el decimal exacto de una fracción. Todas valen.
 */
function formasEquivalentes(esperada) {
  const formas = new Set();
  const t = String(esperada).trim();
  formas.add(` ${t} `);
  if (/^-?\d+$/.test(t)) formas.add(`x = ${t}`);
  const frac = t.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const n = Number(frac[1]);
    const d = Number(frac[2]);
    if (d !== 0 && Number.isInteger((n / d) * 100) && n % d !== 0) {
      formas.add(String(n / d));
      formas.add(String(n / d).replace(".", ","));
    }
  }
  formas.delete(t);
  return [...formas];
}

/** Recorre una lección entera. */
function juzgarLeccion(lsg, donde) {
  if (!lsg) return;
  const modulos = Array.isArray(lsg.modulos) && lsg.modulos.length ? lsg.modulos : [{ id: "", directivas: lsg.directivas ?? [] }];
  for (const m of modulos) {
    // Cada fase trae su ejercicio: la solución de la primera ecuación manda.
    const contexto = { solucion: null };
    for (const d of m.directivas ?? []) {
      const sitio = `${donde}/${m.id || "único"}`;
      if (d.tipo === "pizarra") {
        juzgarLinea(d.contenido, d.operacion, d.narracion, sitio, contexto);
        contexto.ultimaPizarra = String(d.contenido ?? "");
      }
      if (d.tipo === "hablar") {
        juzgarFrase(d.texto, sitio);
        // AL PASAR LA PALABRA EMPIEZA OTRO EJERCICIO: lo que se escriba a partir
        // de aquí ya no tiene por qué conservar la solución del anterior.
        if (/te toca a ti|vamos con otr|ahora inténtalo|parecido a este|otra ecuación|otra suma/i.test(String(d.texto ?? ""))) {
          contexto.solucion = null;
        }
      }
      if (d.tipo === "preguntar") {
        juzgarFrase(d.texto, `${sitio} · pregunta`);
        juzgarRespuesta(d, sitio, contexto.ultimaPizarra ?? "");
      }
    }
  }
}

/**
 * LA RESPUESTA ESPERADA Y QUIEN CALIFICA.
 *
 * Se recalcula aquí la respuesta y, además, se le pregunta al corrector: una
 * respuesta correcta que el sistema da por mala es, para el alumno, el mismo
 * error de cálculo que una cuenta mal hecha.
 */
function juzgarRespuesta(directiva, donde, enunciado = "") {
  const texto = String(directiva.texto ?? "");
  const esperada = String(directiva.respuesta ?? "").trim();
  if (!esperada) return;

  // 1. El corrector acepta la respuesta buena.
  const veredicto = checkAnswer(esperada, esperada);
  check(`el corrector acepta la respuesta correcta (${donde})`, veredicto?.correct === true, `${texto} → ${esperada}`);
  // 2. Y las formas equivalentes de escribirla que un alumno usaría.
  for (const forma of formasEquivalentes(esperada)) {
    const v = checkAnswer(forma, esperada);
    check(`el corrector acepta «${forma}» para ${esperada} (${donde})`, v?.correct === true, texto);
  }
  // 3. El motor de respuestas del servidor coincide con lo esperado.
  const calculada = computeAnswer(texto);
  if (calculada != null && String(calculada).trim() !== "") {
    const a = leer(calculada);
    const b = leer(esperada);
    if (a && b && esConstante(a) && esConstante(b)) {
      check(`el motor de respuestas coincide con la esperada (${donde})`, igualR(valorDe(a), valorDe(b)), `${texto} → motor ${calculada}, lección ${esperada}`);
    }
  }
  // 4. Y el que corrige el ejercicio escrito en la pizarra, también.
  if (enunciado) {
    const delEnunciado = resolverEjercicio(enunciado);
    if (delEnunciado != null) {
      const a = leer(delEnunciado);
      const b = leer(esperada);
      if (a && b && esConstante(a) && esConstante(b)) {
        check(`el corrector del enunciado coincide con la respuesta (${donde})`, igualR(valorDe(a), valorDe(b)), `${enunciado} → corrector ${delEnunciado}, lección ${esperada}`);
      }
    }
  }
  const comoRacional = (t) => {
    const v = leer(t);
    return esConstante(v) ? valorDe(v) : null;
  };

  // "¿Cuánto vale x en <ecuación>?"
  const eq = texto.match(/vale\s+[a-z]\s+en\s+([^?]+)\?/i);
  if (eq) {
    const sol = solucionDe(eq[1]);
    if (sol) check(`la respuesta de la ecuación es correcta (${donde})`, igualR(sol, comoRacional(esperada)), `${eq[1]} → ${esperada}`);
    return;
  }
  // "¿Cuál es la derivada de <función>?"
  const der = texto.match(/derivada de ([^?]+)\?/i);
  if (der) {
    const f = leer(der[1]);
    const r = leer(esperada);
    if (f && r) check(`la respuesta de la derivada es correcta (${donde})`, igualesP(derivarP(f), r), `${der[1]} → ${esperada}`);
    return;
  }
  // "¿Cómo se factoriza <polinomio>?" → el producto tiene que dar el polinomio.
  const fac = texto.match(/factoriza\s+([^?]+)\?/i);
  if (fac) {
    const p = leer(fac[1]);
    const q = leer(esperada);
    if (p && q) check(`la factorización propuesta es correcta (${donde})`, igualesP(p, q), `${fac[1]} → ${esperada}`);
    return;
  }
  // "¿Cuánto es <cuenta>?"
  const cuenta = texto.match(/cuánto es\s+([^?]+)\?/i);
  if (cuenta) {
    const v = leer(cuenta[1]);
    const r = comoRacional(esperada);
    if (v && esConstante(v) && r) {
      check(`la respuesta de la cuenta es correcta (${donde})`, igualR(valorDe(v), r), `${cuenta[1]} → ${esperada}`);
    }
  }
}

// ── Qué se recorre ───────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════════════");
console.log(" RIGOR MATEMÁTICO — cada cuenta escrita y dicha, recalculada aquí");
console.log("══════════════════════════════════════════════════════════════\n");

// 0. AUTOCOMPROBACIÓN: errores conocidos que esta batería tiene que cazar.
{
  const sinContexto = () => ({ solucion: null });
  const escenaFalsa = (texto, clase, narracion, latex) => ({ texto, clase, latex: latex ?? texto, focos: [{ clase: "x", tipo: "caja", narracion }] });

  debeCazar("una igualdad escrita falsa (2 + 3 = 6)", () => juzgarLinea("2 + 3 = 6", null, null, "auto", sinContexto()));
  debeCazar("una fracción mal amplificada (1/2 = 3/4)", () => juzgarLinea("1/2 = 3/4", null, null, "auto", sinContexto()));
  debeCazar("una nota de columna con mal total", () => juzgarLinea("unidades: 4 + 8 = 13 (se escribe 3, se lleva 1)", null, null, "auto", sinContexto()));
  debeCazar("una nota de columna con mala cifra escrita", () => juzgarLinea("unidades: 4 + 8 = 12 (se escribe 3, se lleva 1)", null, null, "auto", sinContexto()));
  debeCazar("una nota de columna con mala llevada", () => juzgarLinea("unidades: 4 + 8 = 12 (se escribe 2, se lleva 2)", null, null, "auto", sinContexto()));
  debeCazar("una suma dicha mal (4 más 8 son 13)", () => juzgarFrase("Unidades: 4 más 8 son 13.", "auto"));
  debeCazar("una resta dicha mal (16 menos 6 son 11)", () => juzgarFrase("A la derecha, 16 menos 6 son 11.", "auto"));
  debeCazar("un producto dicho mal (3 por 4 son 11)", () => juzgarFrase("Y 3 por 4 son 11.", "auto"));
  debeCazar("una derivada dicha mal", () => juzgarFrase("La derivada de 3x⁴ es 12x².", "auto"));
  debeCazar("un despeje que cambia la solución", () => {
    const ctx = sinContexto();
    juzgarLinea("2x + 6 = 16", null, null, "auto", ctx);
    juzgarLinea("2x = 11", null, null, "auto", ctx);
  });
  debeCazar("un coeficiente dicho sin su signo", () =>
    juzgarPie({ narracion: "Su coeficiente es 3." }, escenaFalsa("2x⁵ - 3x⁴", "polinomio", "Su coeficiente es 3."), "auto", 1));
  debeCazar("un término nombrado como potencia del coeficiente", () =>
    juzgarPie({ narracion: "Miramos el término 2x elevado a 5." }, escenaFalsa("2x⁵ - 3x⁴", "polinomio", "Miramos el término 2x elevado a 5."), "auto", 0));
  debeCazar("un exponente dicho mal", () =>
    juzgarPie({ narracion: "Su exponente es 4." }, escenaFalsa("2x⁵ - 3x⁴", "polinomio", "Su exponente es 4."), "auto", 1));
  debeCazar("un reparto de paréntesis mal hecho", () =>
    juzgarPie({ narracion: "El 2 multiplica a 3: da 5." }, escenaFalsa("2(x + 3) = 16", "distributiva", "El 2 multiplica a 3: da 5."), "auto", 0));
  debeCazar("un reparto cuyo resultado no vale lo mismo", () =>
    juzgarPie({ narracion: "Queda 2x + 5 = 16." }, escenaFalsa("2(x + 3) = 16", "distributiva", "Queda 2x + 5 = 16."), "auto", 0));
  debeCazar("una solución cantada que no es la de la ecuación", () =>
    juzgarPie({ narracion: "x vale 6." }, escenaFalsa("2x = 10", "despeje", "x vale 6."), "auto", 0));
  debeCazar("decir «quitamos» mientras se suma", () =>
    juzgarPie({ narracion: "Quitamos 6 en los dos lados: a la izquierda se cancela -6 con +6, y a la derecha 16 más 6 son 22." }, escenaFalsa("2x - 6 = 16", "despeje", ""), "auto", 0));
  debeCazar("dividir entre un número que no es el coeficiente", () =>
    juzgarPie({ narracion: "Dividimos los dos lados entre 3." }, escenaFalsa("2x = 10", "despeje", ""), "auto", 0));
  debeCazar("un factor de amplificación que no es el aplicado", () =>
    juzgarPie({ narracion: "Multiplicamos arriba y abajo por 2." }, escenaFalsa("3/4 = 9/12", "amplificacion", ""), "auto", 0));
  debeCazar("una fracción resultante que no es la escrita", () =>
    juzgarPie({ narracion: "Queda 4 entre 12." }, escenaFalsa("3/4 = 9/12", "amplificacion", ""), "auto", 0));
  debeCazar("una cifra escrita que no es la de su columna", () =>
    juzgarPie({ narracion: "Unidades: 4 más 8 son 12. Escribo 3 y llevo 1." }, escenaFalsa("234 + 178", "columna", ""), "auto", 0));
  debeCazar("un préstamo que no suma una decena", () =>
    juzgarPie({ narracion: "Unidades: a 3 no le puedo quitar 8, así que pido prestada una decena: 12 menos 8 son 4." }, escenaFalsa("503 - 278", "columna", ""), "auto", 0));
  debeCazar("un resultado cantado que no es el de la cuenta", () =>
    juzgarPie({ narracion: "El resultado es 413." }, escenaFalsa("234 + 178 = 412", "cierre", ""), "auto", 0));
  debeCazar("una cuenta en columna DIBUJADA con mal resultado", () => {
    const malo = String.raw`\begin{array}{rcc} & 2 & 3 & 4 \\ + & 1 & 7 & 8 \\ \hline & 4 & 1 & 3 \end{array}`;
    const mensaje = columnaDibujadaCierta(malo);
    check("columna dibujada", !mensaje, mensaje ?? "");
  });
  debeCazar("un corrector que rechaza la respuesta correcta", () => {
    const v = checkAnswer("11/10", "11/10");
    check("corrector", v?.correct === true, "");
    const w = checkAnswer("0", "11/10");
    check("corrector acepta lo que no debe", w?.correct !== true, "aceptó 0 como 11/10");
    // El error de prueba: exigir que acepte algo que NO es la respuesta.
    check("prueba de que caza", checkAnswer("7", "11/10")?.correct === true, "no cazaría un rechazo indebido");
  });
  debeCazar("una respuesta esperada que no es la correcta", () =>
    juzgarRespuesta({ texto: "¿Cuánto es 7 + 5?", respuesta: "13" }, "auto"));
  debeCazar("una respuesta de ecuación que no es la correcta", () =>
    juzgarRespuesta({ texto: "¿Cuánto vale x en 2x + 5 = 15? Escribe solo el número.", respuesta: "6" }, "auto"));
  debeCazar("una derivada esperada que no es la correcta", () =>
    juzgarRespuesta({ texto: "¿Cuál es la derivada de 5x²?", respuesta: "10x²" }, "auto"));
  debeCazar("una factorización esperada que no es la correcta", () =>
    juzgarRespuesta({ texto: "¿Cómo se factoriza x² - 9? Escríbelo como producto.", respuesta: "(x - 3)(x + 2)" }, "auto"));
  console.log(`  · autocomprobación: ${autocomprobaciones} errores de prueba, todos cazados\n`);
}

const NIVELES = ["facil", "normal", "dificil", "experto"];
const GENERADORES = {
  suma: G.sumaResueltaLSG,
  resta: G.restaResueltaLSG,
  multiplicacion: G.multiplicacionResueltaLSG,
  division: G.divisionResueltaLSG,
  fracciones: G.fraccionResueltaLSG,
  lineal: G.linealResueltaLSG,
  derivada: G.derivadaResueltaLSG,
  factorizacion: G.factorizacionResueltaLSG,
};

// 1. Las lecciones completas, en todos los niveles y con la rotación del
//    catálogo: cada `evitar` distinto elige otro ejercicio de la lista.
let lecciones = 0;
for (const [tema, gen] of Object.entries(GENERADORES)) {
  for (const nivel of NIVELES) {
    for (const vuelta of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const cursores = { [tema]: vuelta, suma: vuelta, resta: vuelta, multiplicacion: vuelta, division: vuelta, fraccion: vuelta, lineal: vuelta, derivada: vuelta, factorizacion: vuelta };
      for (const extra of [{ concepto: true }, { practica: true }, { seguimiento: true }]) {
        const lsg = leccion(gen({ nivel, cursores, ...extra }));
        juzgarLeccion(lsg, `${tema}/${nivel}/v${vuelta}${extra.concepto ? "/concepto" : extra.practica ? "/práctica" : "/seguimiento"}`);
        lecciones++;
      }
    }
  }
}
console.log(`  · ${lecciones} lecciones recorridas (8 temas × 4 niveles × 8 vueltas × 3 formas)`);

// 2. El banco de ejercicios entero: el desglose de cada uno —con resultado y
//    sin él— y el ejercicio parecido con el que sigue la práctica.
const banco = typeof G.bancoDeEjercicios === "function" ? G.bancoDeEjercicios() : null;
const ejercicios = new Set();
const recolectar = (v) => {
  if (typeof v === "string") ejercicios.add(v);
  else if (Array.isArray(v)) v.forEach(recolectar);
  else if (v && typeof v === "object") Object.values(v).forEach(recolectar);
};
recolectar(banco);
const DEL_CATALOGO = [...ejercicios].filter((e) => /[\d]/.test(e) && e.length < 40);
let desgloses = 0;
for (const ej of DEL_CATALOGO) {
  for (const conResultado of [true, false]) {
    const crudo = G.desgloseDelEjercicioLSG({ ejercicio: ej, conResultado });
    if (!crudo) continue;
    juzgarLeccion(leccion(crudo), `desglose/${ej}${conResultado ? "" : "/práctica"}`);
    desgloses++;
    if (crudo.nuevaPractica) {
      const nueva = crudo.nuevaPractica;
      juzgarRespuesta({ texto: nueva.pregunta, respuesta: nueva.respuesta }, `parecido de ${ej}`);
      juzgarLinea(nueva.enunciado, null, null, `parecido de ${ej}`, { solucion: null });
    }
  }
}
console.log(`  · ${desgloses} desgloses del catálogo (${DEL_CATALOGO.length} ejercicios)`);

// 2b. LOS PROBLEMAS DE LA VIDA REAL y las tandas de práctica: también hacen
//     cuentas, y con fórmulas (áreas, velocidades, promedios).
let aplicadas = 0;
for (const nivel of NIVELES) {
  for (const vuelta of [0, 1, 2, 3]) {
    const cursores = { suma: vuelta, resta: vuelta, multiplicacion: vuelta, division: vuelta, fraccion: vuelta, lineal: vuelta, derivada: vuelta, factorizacion: vuelta };
    const aplicadasLSG = [
      ["aritmética aplicada", () => G.aritmeticaAplicadaLSG("suma", { nivel, cursores })],
      ["resta aplicada", () => G.aritmeticaAplicadaLSG("resta", { nivel, cursores })],
      ["multiplicación aplicada", () => G.aritmeticaAplicadaLSG("multiplicacion", { nivel, cursores })],
      ["división aplicada", () => G.aritmeticaAplicadaLSG("division", { nivel, cursores })],
      ["lineal aplicada", () => G.linealAplicadaLSG({ nivel, cursores })],
      ["fracción aplicada", () => G.fraccionAplicadaLSG({ nivel, cursores })],
      ["derivada aplicada", () => G.derivadaAplicadaLSG({ nivel, cursores })],
      ["factorización aplicada", () => G.factorizacionAplicadaLSG({ nivel, cursores })],
      ["partes de la suma", () => G.partesLSG("suma", { nivel, cursores })],
      ["partes de la resta", () => G.partesLSG("resta", { nivel, cursores })],
    ];
    for (const [nombre, gen] of aplicadasLSG) {
      let crudo = null;
      try {
        crudo = gen();
      } catch {
        crudo = null;
      }
      if (!crudo) continue;
      juzgarLeccion(leccion(crudo), `${nombre}/${nivel}/v${vuelta}`);
      aplicadas++;
    }
    // La tanda de práctica ("¡A practicar!"), que es la que escribe "Ejercicio 1: …".
    for (const consulta of ["Quiero practicar sumas", "Quiero practicar derivadas", "Quiero practicar fracciones", "Quiero practicar ecuaciones"]) {
      let crudo = null;
      try {
        crudo = G.leccionBotonLSG({ query: consulta, seguimiento: "practicar", contexto: consulta, currentTopic: consulta, cursores });
      } catch {
        crudo = null;
      }
      if (crudo) {
        juzgarLeccion(leccion(crudo), `tanda/${consulta}/${nivel}/v${vuelta}`);
        aplicadas++;
      }
    }
  }
}
console.log(`  · ${aplicadas} lecciones de problemas aplicados y tandas de práctica`);

// 3. Las reexplicaciones del concepto, que también cuentan cuentas.
for (const tema of ["suma", "resta", "multiplicación", "división", "fracciones", "ecuaciones", "derivadas", "factorización"]) {
  for (const insistencia of [0, 1, 2]) {
    juzgarLeccion(leccion(G.reexplicacionDeConceptoLSG(tema, insistencia)), `reexplicación/${tema}/${insistencia}`);
  }
}


// ── 3b. Las pistas que se dan al fallar ──────────────────────────────────────
// También son texto que el alumno lee, y si llevaran una cuenta tendría que ser
// cierta.
{
  let pistas = 0;
  for (const [pregunta, pizarra] of [
    ["¿Cuánto es 678 + 145?", "678 + 145 = ?"],
    ["¿Cuánto es 3/5 + 1/2? Escríbelo en su forma más simple.", "MCM(5, 2): 5 × 2 = 10"],
    ["¿Cuánto vale x en 2(x + 3) = 16? Escribe solo el número.", "2x + 6 = 16"],
    ["¿Cuál es la derivada de 3x⁴ - 2x²?", "derivada de 3x⁴ - 2x² = 12x³ - 4x"],
    ["¿Cómo se factoriza x² - 9? Escríbelo como producto.", "x² - 9 = (x - 3)(x + 3)"],
    ["¿Cuánto es 52 - 27?", "52 - 27 = ?"],
    ["¿Cuánto es 23 × 14?", "23 × 14 = ?"],
    ["¿Cuánto es 144 ÷ 12?", "144 ÷ 12 = ?"],
  ]) {
    for (const nivel of [0, 1, 2, 3]) {
      const pista = buildHint(pregunta, pizarra, nivel);
      if (!pista) continue;
      pistas++;
      juzgarFrase(String(pista), `pista/${pregunta.slice(0, 24)}/${nivel}`);
    }
  }
  console.log(`  · ${pistas} pistas de ayuda revisadas`);
}

// ── 4. El banco del diagnóstico y el catálogo de reglas ──────────────────────

/** El ejercicio que plantea una pregunta del banco, en texto plano. */
function ejercicioDeLaPregunta(texto) {
  const trozos = [...String(texto ?? "").matchAll(/\$([^$]+)\$/g)].map((m) => latexAPlano(m[1]).trim());
  // "…derivada de $f(x) = 4x³ - 5x + 7$ respecto a $x$": el último trozo es la
  // variable, no el ejercicio. Una letra suelta nunca es el enunciado.
  const utiles = trozos.filter((t) => t.length > 1);
  return utiles.length ? utiles[utiles.length - 1] : (trozos[trozos.length - 1] ?? null);
}

{
  const banco = require("../prisma/seed-data/preguntas-diagnostico.json");
  const preguntas = Array.isArray(banco) ? banco : Object.values(banco)[0];
  let juzgadas = 0;
  const sinJuzgar = [];
  for (const p of preguntas ?? []) {
    const enunciado = ejercicioDeLaPregunta(p.pregunta);
    const correcta = latexAPlano(String(p.respuesta_correcta ?? "").replace(/\$/g, "")).trim();
    if (!enunciado || !correcta) {
      sinJuzgar.push(p.id);
      continue;
    }
    const texto = String(p.pregunta ?? "");

    // Qué se pide: derivada, ecuación o cuenta.
    let esperada = null;
    if (/derivad/i.test(texto)) {
      // "f(x) = 4x³ - 5x + 7": lo que se deriva es el lado derecho.
      const funcion = enunciado.replace(/^derivada de\s*/i, "").replace(/^[a-z]\s*\([a-z]\)\s*=\s*/i, "").replace(/^[a-z]\s*=\s*/i, "");
      const f = leer(funcion);
      esperada = f ? derivarP(f) : null;
    } else if (enunciado.includes("=") && !/^[\d\s+\-*/().]+$/.test(enunciado)) {
      const sol = solucionDe(enunciado);
      esperada = sol ? constante(sol) : null;
    } else if (/factoriza/i.test(texto)) {
      esperada = leer(enunciado);
    } else {
      esperada = leer(enunciado);
    }
    const dicha = leer(/factoriza/i.test(texto) ? correcta : correcta.replace(/^x\s*=\s*/, ""));
    if (!esperada || !dicha) {
      sinJuzgar.push(p.id);
      continue;
    }
    juzgadas++;
    check(
      `el banco del diagnóstico da la respuesta correcta (${p.id})`,
      igualesP(esperada, dicha),
      `${enunciado} → dice ${correcta}`,
    );
    // Y ningún distractor puede valer lo mismo que la respuesta buena.
    for (const opcion of p.opciones ?? []) {
      const limpia = latexAPlano(String(opcion).replace(/\$/g, "")).trim();
      if (limpia === correcta) continue;
      const valor = leer(/factoriza/i.test(texto) ? limpia : limpia.replace(/^x\s*=\s*/, ""));
      if (!valor) continue;
      check(
        `ningún distractor vale lo mismo que la respuesta (${p.id})`,
        !igualesP(esperada, valor),
        `${enunciado}: «${limpia}» también es correcta`,
      );
    }
  }
  const total = (preguntas ?? []).length;
  console.log(
    `  · ${juzgadas} de ${total} preguntas del banco de diagnóstico recalculadas` +
      (sinJuzgar.length ? ` (sin juzgar, por notación que esta batería no lee: ${sinJuzgar.join(", ")})` : ""),
  );
}

{
  // EL CATÁLOGO DE REGLAS: cada identidad, comprobada con números al azar.
  // "a/b = (a×k)/(b×k)" tiene que ser cierta para cualquier a, b, k; si el
  // catálogo tuviera una errata, la tarjeta de la pizarra la enseñaría como ley.
  const reglas = require("../prisma/seed-data/reglas-matematicas.json");
  const lista = Array.isArray(reglas) ? reglas : Object.values(reglas)[0];
  const letras = ["a", "b", "c", "d", "k", "n", "x"];
  let identidades = 0;
  for (const r of lista ?? []) {
    const formula = String(r.enunciado ?? "");
    // Sólo identidades algebraicas: fuera las cuentas dispuestas y el operador
    // de derivada, que no son igualdades entre expresiones.
    if (/\\begin|\\frac\{d\}\{dx\}|f\(|g\(|f'|\\rightarrow|\\Longrightarrow/.test(formula)) continue;
    const partes = latexAPlano(formula).split("=");
    if (partes.length !== 2) continue;
    const limpio = (t) => t.replace(/,\s*\\?quad.*$/, "").replace(/\\,/g, "").replace(/,.*$/, "").trim();
    const izq = limpio(partes[0]);
    const der = limpio(partes[1]);
    if (!izq || !der || /≠/.test(izq + der)) continue;
    // Con "±" la regla son DOS identidades: una con + y otra con −. Se comprueban
    // las dos, que es lo que la regla afirma.
    const signos = /±/.test(izq + der) ? ["+", "-"] : [""];
    // Se evalúa con enteros al azar, varias veces.
    let iguales = 0;
    let intentos = 0;
    for (const signo of signos) {
      for (let v = 0; v < 12; v++) {
        const valores = {};
        for (const l of letras) valores[l] = 2 + ((v * 7 + l.charCodeAt(0)) % 9);
        // Cada letra entra ENTRE PARÉNTESIS: "a c" con a=3 y c=5 es 3 por 5, no 35.
        const sustituir = (t) =>
          t.replace(/±/g, signo).replace(/[a-z]/g, (l) => `(${valores[l] ?? 3})`);
        const a = leer(sustituir(izq));
        const b = leer(sustituir(der));
        if (!a || !b) continue;
        intentos++;
        if (igualesP(a, b)) iguales++;
      }
    }
    if (intentos === 0) continue;
    identidades++;
    check(`la regla «${r.nombre}» es una identidad cierta`, iguales === intentos, `${formula} falla en ${intentos - iguales} de ${intentos} sustituciones`);
  }
  console.log(`  · ${identidades} reglas del catálogo comprobadas con sustituciones`);
}

// ── Resultado ────────────────────────────────────────────────────────────────

console.log("\n── Qué se ha comprobado, y cuántas veces ──");
for (const [clave, n] of Object.entries(veces).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(6)} · ${clave}`);
}
const sinDisparar = [
  "nota de columna",
  "cuenta en columna dibujada",
  "reparto del paréntesis",
  "la fracción que queda",
  "factor de amplificación o simplificación",
  "la operación que se dice en el despeje",
  "dividir entre el coeficiente",
  "la solución cantada",
  "cifra escrita y llevada",
  "préstamo de la resta",
  "resultado cantado",
  "términos del polinomio",
  "cuenta dicha por el tutor",
  "igualdad escrita",
  "línea del despeje que conserva la solución",
].filter((c) => !veces[c]);
check("todas las comprobaciones de esta batería llegan a dispararse", sinDisparar.length === 0, sinDisparar.join(" · "));

console.log("\n══════════════════════════════════════════════════════════════");
console.log(` ${ok} afirmaciones matemáticas comprobadas · ${fallos.length} incorrectas`);
if (fallos.length) {
  console.log("\n Incorrectas:");
  for (const f of fallos.slice(0, 40)) console.log(`   · ${f.nombre}${f.detalle ? ` — ${f.detalle}` : ""}`);
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(fallos.length ? 1 : 0);
