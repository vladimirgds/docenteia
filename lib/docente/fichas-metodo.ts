import { z } from "zod";

import { MAX_PASOS, pasoSchema, type Paso } from "./procedimientos.ts";

/**
 * FICHAS DE MÉTODO (PMV 3 · HITO 5A) — la forma de los datos y su lógica pura.
 *
 * Una FICHA describe un método para que el docente lo defina sin tocar código:
 *
 *   · PATRÓN DE ENTRADA — cuándo se aplica: `({~a}x^{m}{+b})^{n}` encaja con
 *     `(3x^2+1)^4` y con `(5x^3-2)^2`. Cada `{…}` es una variable.
 *   · VARIABLES — lo que se extrae del patrón (a, m, b, n) y lo que se calcula a
 *     partir de ello (`l = mcm(b, d)`).
 *   · CONDICIONES — cuándo NO se aplica aunque encaje (`n >= 2`, `b != d`).
 *   · PASOS ORDENADOS — plantillas con variables y cuentas: `{n*a*m}x^{m-1}`.
 *   · OPERACIONES ADMITIDAS — qué operaciones usa; el servidor sabe cuáles puede
 *     comprobar con su motor y marca las demás como PENDIENTES.
 *   · EJEMPLOS y PISTAS — incluidas pistas de error: «si el alumno omite el
 *     factor de la derivada interior, dile esto».
 *
 * Una ficha NO es código: las plantillas sólo admiten números, variables, las
 * cuatro operaciones, potencias y unas pocas funciones (mcd, mcm, abs, min, max).
 * Nada se ejecuta: se interpreta con un analizador propio.
 *
 * Este módulo lo cargan la API, el agente de IA y las baterías de QA (Node con
 * `strip-types`): imports relativos con `.ts` y sin sintaxis exclusiva de TS.
 */

// ── Forma de los datos ──────────────────────────────────────────────────────

export const TIPOS_VARIABLE = ["entero", "natural", "positivo"] as const;
export type TipoVariable = (typeof TIPOS_VARIABLE)[number];

const NOMBRE_VARIABLE = /^[a-z][a-z0-9_]{0,11}$/;

export const variableSchema = z.object({
  nombre: z.string().trim().regex(NOMBRE_VARIABLE, "Nombre de variable no válido (minúsculas, cifras y «_», máx. 12)"),
  /** Qué representa, para el docente: «coeficiente de x», «exponente exterior». */
  descripcion: z.string().trim().max(120).optional().nullable(),
  /** entero = cualquiera · natural = 0, 1, 2… · positivo = 1, 2, 3… */
  tipo: z.enum(TIPOS_VARIABLE).default("entero"),
  /** Si se da, la variable no sale del patrón: se calcula a partir de las anteriores. */
  calculada: z.string().trim().min(1).max(160).optional().nullable(),
  /** Rango en el que el servidor prueba la ficha con casos generados. */
  min: z.number().int().min(-99).max(99).optional(),
  max: z.number().int().min(-99).max(99).optional(),
});
export type Variable = z.infer<typeof variableSchema>;

export const pistaDeErrorSchema = z.object({
  /** Lo que se le dice al alumno. Admite variables: «la derivada de {~a}x^{m}{+b}…». */
  texto: z.string().trim().min(1, "La pista no puede estar vacía").max(300),
  /**
   * El factor que el alumno OMITE. Se detecta así: si (su respuesta) × (este
   * factor) equivale a la respuesta correcta, se le olvidó ese factor.
   */
  omiteFactor: z.string().trim().min(1).max(160).optional().nullable(),
  /**
   * Una respuesta ERRÓNEA típica (error de signo, de exponente…), como plantilla:
   * «{-n*a*m}x^{m-1}({~a}x^{m}{+b})^{n-1}». Si la respuesta del alumno equivale a
   * ella, se le da esta pista.
   */
  respuestaErronea: z.string().trim().min(1).max(200).optional().nullable(),
});
export type PistaDeError = z.infer<typeof pistaDeErrorSchema>;

export const MAX_VARIABLES = 12;

export const fichaSchema = z.object({
  titulo: z.string().trim().min(3, "El título es demasiado corto").max(160),
  descripcion: z.string().trim().max(1000).optional().nullable(),
  /** Cuándo se aplica: texto con `{variables}`. */
  patron: z.string().trim().min(3, "Falta el patrón de entrada").max(200),
  variables: z.array(variableSchema).min(1, "Declara al menos una variable").max(MAX_VARIABLES),
  /** Expresiones que tienen que cumplirse (≠ 0): «n >= 2», «b != d». */
  condiciones: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  /** Operaciones que usa el método (ver `OPERACIONES_SOPORTADAS`). */
  operaciones: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  pasos: z.array(pasoSchema).min(1, "Añade al menos un paso").max(MAX_PASOS),
  /** Problemas de muestra que el servidor resuelve con la ficha y verifica con el motor. */
  ejemplos: z.array(z.string().trim().min(1).max(200)).min(1, "Añade al menos un ejemplo").max(6),
  /** Pistas generales, de la más suave a la más concreta. */
  pistas: z.array(z.string().trim().min(1).max(240)).max(5).default([]),
  pistasDeError: z.array(pistaDeErrorSchema).max(6).default([]),
});
export type Ficha = z.infer<typeof fichaSchema>;
/** Lo que llega por la red: con los valores por defecto aún sin aplicar. */
export type EntradaFicha = z.input<typeof fichaSchema>;

/** Una ficha tal como se guarda en la base: JSON, no se confía en su forma. */
export function leerFicha(json: unknown): Ficha | null {
  const r = fichaSchema.safeParse(json);
  return r.success ? r.data : null;
}

// ── Intérprete de expresiones (sin eval) ─────────────────────────────────────

export class ErrorDePlantilla extends Error {}

/** `in` mira también la cadena de prototipos («constructor»): aquí sólo cuenta lo propio. */
const tiene = (objeto: object, clave: string) => Object.prototype.hasOwnProperty.call(objeto, clave);

type Ficho = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const MAX_EXPRESION = 200;
const MAX_MAGNITUD = 1e12;

function tokenizar(fuente: string): Ficho[] {
  if (fuente.length > MAX_EXPRESION) throw new ErrorDePlantilla("La expresión es demasiado larga.");
  const salida: Ficho[] = [];
  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < fuente.length && /[0-9.]/.test(fuente[j])) j++;
      const n = Number(fuente.slice(i, j));
      if (!Number.isFinite(n)) throw new ErrorDePlantilla(`Número no válido «${fuente.slice(i, j)}».`);
      salida.push({ t: "num", v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < fuente.length && /[A-Za-z0-9_]/.test(fuente[j])) j++;
      salida.push({ t: "id", v: fuente.slice(i, j) });
      i = j;
      continue;
    }
    const dos = fuente.slice(i, i + 2);
    if ([">=", "<=", "==", "!=", "&&", "||"].includes(dos)) {
      salida.push({ t: "op", v: dos });
      i += 2;
      continue;
    }
    if ("+-*/%^(),<>".includes(c)) {
      salida.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new ErrorDePlantilla(`Carácter no permitido «${c}» en «${fuente}».`);
  }
  return salida;
}

const mcdDe = (a: number, b: number): number => (b === 0 ? Math.abs(a) : mcdDe(b, a % b));

function entero(v: number, funcion: string): number {
  if (!Number.isInteger(v)) throw new ErrorDePlantilla(`${funcion}() sólo admite enteros.`);
  return v;
}

const FUNCIONES: Record<string, (...a: number[]) => number> = {
  mcd: (a, b) => mcdDe(entero(a, "mcd"), entero(b, "mcd")),
  mcm: (a, b) => {
    entero(a, "mcm");
    entero(b, "mcm");
    return a === 0 || b === 0 ? 0 : Math.abs(a * b) / mcdDe(a, b);
  },
  abs: (a) => Math.abs(a),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
};

/** Evalúa una expresión aritmética/lógica con las variables dadas. Booleanos = 1/0. */
export function evaluarExpresion(fuente: string, variables: Readonly<Record<string, number>>): number {
  const fichas = tokenizar(fuente);
  let pos = 0;
  const mira = () => fichas[pos];
  const esOp = (v: string) => mira()?.t === "op" && mira().v === v;
  const toma = (v: string) => {
    if (!esOp(v)) throw new ErrorDePlantilla(`Se esperaba «${v}» en «${fuente}».`);
    pos++;
  };
  const acota = (n: number) => {
    if (!Number.isFinite(n) || Math.abs(n) > MAX_MAGNITUD) throw new ErrorDePlantilla("El resultado se sale de rango.");
    return n;
  };

  function o(): number {
    let v = y();
    while (esOp("||")) {
      pos++;
      const d = y();
      v = v !== 0 || d !== 0 ? 1 : 0;
    }
    return v;
  }
  function y(): number {
    let v = comparar();
    while (esOp("&&")) {
      pos++;
      const d = comparar();
      v = v !== 0 && d !== 0 ? 1 : 0;
    }
    return v;
  }
  function comparar(): number {
    const v = suma();
    for (const op of [">=", "<=", "==", "!=", ">", "<"]) {
      if (esOp(op)) {
        pos++;
        const d = suma();
        const EPS = 1e-9;
        return (
          op === ">=" ? v >= d - EPS :
          op === "<=" ? v <= d + EPS :
          op === "==" ? Math.abs(v - d) <= EPS :
          op === "!=" ? Math.abs(v - d) > EPS :
          op === ">" ? v > d + EPS :
          v < d - EPS
        )
          ? 1
          : 0;
      }
    }
    return v;
  }
  function suma(): number {
    let v = producto();
    while (esOp("+") || esOp("-")) {
      const op = mira().v;
      pos++;
      const d = producto();
      v = acota(op === "+" ? v + d : v - d);
    }
    return v;
  }
  function producto(): number {
    let v = unario();
    while (esOp("*") || esOp("/") || esOp("%")) {
      const op = mira().v;
      pos++;
      const d = unario();
      if ((op === "/" || op === "%") && d === 0) throw new ErrorDePlantilla("División entre cero.");
      v = acota(op === "*" ? v * d : op === "/" ? v / d : v % d);
    }
    return v;
  }
  function unario(): number {
    if (esOp("-")) {
      pos++;
      return -unario();
    }
    if (esOp("+")) {
      pos++;
      return unario();
    }
    return potencia();
  }
  function potencia(): number {
    const base = atomo();
    if (esOp("^")) {
      pos++;
      return acota(Math.pow(base, unario()));
    }
    return base;
  }
  function atomo(): number {
    const f = mira();
    if (!f) throw new ErrorDePlantilla(`La expresión «${fuente}» está incompleta.`);
    if (f.t === "num") {
      pos++;
      return f.v;
    }
    if (f.t === "id") {
      pos++;
      if (esOp("(")) {
        const fn = tiene(FUNCIONES, f.v) ? FUNCIONES[f.v] : undefined;
        if (!fn) throw new ErrorDePlantilla(`La función «${f.v}» no existe (usa mcd, mcm, abs, min, max).`);
        pos++;
        const args: number[] = [];
        if (!esOp(")")) {
          args.push(o());
          while (esOp(",")) {
            pos++;
            args.push(o());
          }
        }
        toma(")");
        return acota(fn(...args));
      }
      if (!tiene(variables, f.v)) throw new ErrorDePlantilla(`La variable «${f.v}» no está declarada.`);
      return variables[f.v];
    }
    if (f.v === "(") {
      pos++;
      const v = o();
      toma(")");
      return v;
    }
    throw new ErrorDePlantilla(`Símbolo inesperado «${f.v}» en «${fuente}».`);
  }

  const resultado = o();
  if (pos < fichas.length) throw new ErrorDePlantilla(`Sobra «${fichas[pos].v}» en «${fuente}».`);
  return resultado;
}

// ── Plantillas ───────────────────────────────────────────────────────────────

const HUECO = /\{([^{}]*)\}/g;

function numeroEntero(v: number, origen: string): number {
  if (!Number.isFinite(v) || Math.abs(v - Math.round(v)) > 1e-9) {
    throw new ErrorDePlantilla(`«${origen}» no da un número entero (da ${v}).`);
  }
  return Math.round(v) === 0 ? 0 : Math.round(v); // sin «-0»
}

/**
 * Rellena una plantilla. Cada `{…}` lleva una expresión y, opcionalmente, un
 * prefijo que dice cómo se escribe:
 *   · `{n-1}`  → el número tal cual («3»).
 *   · `{+b}`   → con signo explícito («+1», «-2»): para `x^2{+b}`.
 *   · `{~a}`   → como coeficiente: el 1 no se escribe («x»), el −1 es «-».
 * Después se limpia lo trivial: `x^1` → `x`, `(…)^1` → `(…)`.
 */
export function rellenar(plantilla: string, variables: Readonly<Record<string, number>>): string {
  const texto = plantilla.replace(HUECO, (_t, interior: string) => {
    const modo = interior.startsWith("+") ? "+" : interior.startsWith("~") ? "~" : "";
    const expr = modo ? interior.slice(1) : interior;
    const v = numeroEntero(evaluarExpresion(expr, variables), expr);
    if (modo === "+") return v >= 0 ? `+${v}` : `-${Math.abs(v)}`;
    if (modo === "~") return v === 1 ? "" : v === -1 ? "-" : String(v);
    return String(v);
  });
  return texto.replace(/\^1(?![0-9])/g, "");
}

/** Las variables que nombra una plantilla (de dentro de sus llaves). */
export function nombresEnPlantilla(plantilla: string): string[] {
  const nombres = new Set<string>();
  for (const m of plantilla.matchAll(HUECO)) {
    const interior = m[1].replace(/^[+~]/, "");
    for (const id of interior.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      if (!tiene(FUNCIONES, id)) nombres.add(id);
    }
  }
  return [...nombres];
}

// ── Patrón de entrada ────────────────────────────────────────────────────────

export type ResultadoPatron =
  | { coincide: true; variables: Record<string, number> }
  | { coincide: false; motivo: string };

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** El problema tal como lo compara el patrón: sin espacios ni variantes de signo. */
export function normalizarProblema(texto: string): string {
  return texto
    .replace(/[−–—]/g, "-")
    .replace(/[·×]/g, "*")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Los nombres de variable que usa el patrón, en orden de aparición. */
export function variablesDelPatron(patron: string): string[] {
  const nombres: string[] = [];
  for (const m of patron.matchAll(HUECO)) nombres.push(m[1].replace(/^[+~]/, "").trim());
  return nombres;
}

function compilarPatron(patron: string): { regex: RegExp; grupos: { nombre: string; modo: "" | "+" | "~" }[] } {
  const limpio = normalizarProblema(patron);
  const grupos: { nombre: string; modo: "" | "+" | "~" }[] = [];
  let fuente = "";
  let ultimo = 0;
  for (const m of limpio.matchAll(HUECO)) {
    fuente += escaparRegex(limpio.slice(ultimo, m.index));
    const interior = m[1];
    const modo = interior.startsWith("+") ? "+" : interior.startsWith("~") ? "~" : "";
    const nombre = (modo ? interior.slice(1) : interior).trim();
    if (!NOMBRE_VARIABLE.test(nombre)) {
      throw new ErrorDePlantilla(`En el patrón sólo caben variables sueltas: «{${interior}}» no lo es.`);
    }
    grupos.push({ nombre, modo });
    fuente += modo === "+" ? "([+-][0-9]+)" : modo === "~" ? "(-?[0-9]*)" : "(-?[0-9]+)";
    ultimo = m.index + m[0].length;
  }
  fuente += escaparRegex(limpio.slice(ultimo));
  return { regex: new RegExp(`^${fuente}$`), grupos };
}

function cumpleTipo(v: number, tipo: TipoVariable): boolean {
  return Number.isInteger(v) && (tipo === "entero" || (tipo === "natural" ? v >= 0 : v >= 1));
}

/** Resuelve las variables calculadas, en el orden declarado. */
export function completarVariables(
  ficha: Pick<Ficha, "variables">,
  base: Readonly<Record<string, number>>,
): Record<string, number> {
  const valores: Record<string, number> = { ...base };
  for (const v of ficha.variables) {
    if (v.calculada) valores[v.nombre] = evaluarExpresion(v.calculada, valores);
  }
  return valores;
}

/** ¿Las condiciones de la ficha se cumplen? Devuelve el motivo si no. */
export function comprobarCondiciones(
  ficha: Pick<Ficha, "condiciones">,
  variables: Readonly<Record<string, number>>,
): string | null {
  for (const c of ficha.condiciones) {
    let ok: number;
    try {
      ok = evaluarExpresion(c, variables);
    } catch (e) {
      return `La condición «${c}» no se puede evaluar: ${e instanceof Error ? e.message : "error"}`;
    }
    if (ok === 0) return `No se cumple la condición «${c}».`;
  }
  return null;
}

/** ¿Encaja este problema con el patrón de la ficha y cumple sus condiciones? */
export function aplicarPatron(
  ficha: Pick<Ficha, "patron" | "variables" | "condiciones">,
  problema: string,
): ResultadoPatron {
  let compilado;
  try {
    compilado = compilarPatron(ficha.patron);
  } catch (e) {
    return { coincide: false, motivo: e instanceof Error ? e.message : "Patrón no válido." };
  }
  const m = compilado.regex.exec(normalizarProblema(problema));
  if (!m) return { coincide: false, motivo: `«${problema}» no tiene la forma que describe el patrón «${ficha.patron}».` };

  const tipos = new Map(ficha.variables.map((v) => [v.nombre, v.tipo] as const));
  const base: Record<string, number> = {};
  for (let i = 0; i < compilado.grupos.length; i++) {
    const { nombre, modo } = compilado.grupos[i];
    const crudo = m[i + 1];
    const valor = modo === "~" ? (crudo === "" ? 1 : crudo === "-" ? -1 : Number(crudo)) : Number(crudo);
    if (tiene(base, nombre) && base[nombre] !== valor) {
      return { coincide: false, motivo: `«${nombre}» aparece dos veces en el patrón con valores distintos.` };
    }
    if (!tipos.has(nombre)) return { coincide: false, motivo: `La variable «${nombre}» del patrón no está declarada.` };
    if (!cumpleTipo(valor, tipos.get(nombre)!)) {
      return { coincide: false, motivo: `«${nombre}» vale ${valor}, que no es ${tipos.get(nombre)}.` };
    }
    base[nombre] = valor;
  }

  let variables: Record<string, number>;
  try {
    variables = completarVariables(ficha, base);
  } catch (e) {
    return { coincide: false, motivo: e instanceof Error ? e.message : "No se pueden calcular las variables." };
  }
  const motivo = comprobarCondiciones(ficha, variables);
  return motivo ? { coincide: false, motivo } : { coincide: true, variables };
}

// ── Instanciar la ficha ──────────────────────────────────────────────────────

export interface Instancia {
  /** El problema escrito con el patrón (forma canónica). */
  problema: string;
  variables: Record<string, number>;
  pasos: Paso[];
  /** La respuesta final: lo que escribe el último paso. */
  resultado: string;
}

/** Aplica la ficha a unas variables: el problema y los pasos concretos. */
export function instanciar(ficha: Ficha, variables: Readonly<Record<string, number>>): Instancia {
  const problema = rellenar(ficha.patron, variables);
  const pasos: Paso[] = [];
  for (const [i, p] of ficha.pasos.entries()) {
    const escribe = rellenar(p.escribe, variables);
    const concreto = {
      explica: rellenar(p.explica, variables),
      escribe,
      tipo: p.tipo,
      ...(p.regla ? { regla: p.regla } : {}),
      ...(p.terminos && p.terminos.length > 0
        ? { terminos: p.terminos.map((t) => ({ texto: rellenar(t.texto, variables), explica: rellenar(t.explica, variables) })) }
        : {}),
    };
    const r = pasoSchema.safeParse(concreto);
    if (!r.success) {
      throw new ErrorDePlantilla(`El paso ${i + 1} no es válido con estos valores: ${r.error.issues[0]?.message ?? "error"}.`);
    }
    // Un paso que no cambia nada respecto al anterior (p. ej. «simplificar» una
    // fracción que ya era irreducible) se funde con él: la pizarra no repite líneas.
    const previo = pasos[pasos.length - 1];
    if (previo && previo.escribe === r.data.escribe) {
      if (r.data.tipo === "resultado") pasos[pasos.length - 1] = { ...previo, tipo: "resultado" };
      continue;
    }
    pasos.push(r.data);
  }
  return { problema, variables: { ...variables }, pasos, resultado: pasos[pasos.length - 1].escribe };
}

/** Atajo: encajar un problema y aplicar la ficha. */
export function resolverConFicha(
  ficha: Ficha,
  problema: string,
): { ok: true; instancia: Instancia } | { ok: false; motivo: string } {
  const r = aplicarPatron(ficha, problema);
  if (!r.coincide) return { ok: false, motivo: r.motivo };
  try {
    return { ok: true, instancia: instanciar(ficha, r.variables) };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "No se pudo aplicar la ficha." };
  }
}

// ── Casos generados (para probar la ficha más allá de sus ejemplos) ─────────

/** Generador pseudoaleatorio determinista: la misma ficha da siempre los mismos casos. */
function generador(semilla: number) {
  let s = semilla >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const RANGO_POR_TIPO: Record<TipoVariable, [number, number]> = {
  entero: [-6, 6],
  natural: [0, 9],
  positivo: [1, 9],
};

/**
 * Casos que cumplen el patrón y las condiciones, para comprobar que la ficha
 * funciona en GENERAL y no sólo con los ejemplos que escribió su autor.
 */
export function generarCasos(ficha: Ficha, cuantos: number, semilla = 20261122): Instancia[] {
  const azar = generador(semilla);
  const libres = ficha.variables.filter((v) => !v.calculada);
  const vistos = new Set<string>();
  const casos: Instancia[] = [];
  for (let intento = 0; intento < cuantos * 60 && casos.length < cuantos; intento++) {
    const base: Record<string, number> = {};
    for (const v of libres) {
      const [dmin, dmax] = RANGO_POR_TIPO[v.tipo];
      const min = v.min ?? dmin;
      const max = v.max ?? dmax;
      base[v.nombre] = min + Math.floor(azar() * (Math.max(max, min) - min + 1));
    }
    try {
      const variables = completarVariables(ficha, base);
      if (comprobarCondiciones(ficha, variables)) continue;
      const inst = instanciar(ficha, variables);
      if (vistos.has(inst.problema)) continue;
      vistos.add(inst.problema);
      casos.push(inst);
    } catch {
      // Una combinación que no se puede escribir no es un caso: se descarta.
    }
  }
  return casos;
}
