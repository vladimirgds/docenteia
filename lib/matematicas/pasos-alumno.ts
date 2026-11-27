import {
  analizar,
  escribir,
  evaluar,
  formatearNumero,
  variablesDe,
  type Nodo,
} from "./expresiones.ts";
import { equivalentes } from "./equivalencia.ts";

/**
 * VALIDADOR DE PASOS DEL ALUMNO (PMV 3 · HITO 2).
 *
 * `verificar-pasos.ts` comprueba los pasos que escribe un DOCENTE contra el
 * resultado del ejemplo. Esto es otra cosa: dado el paso anterior y el que
 * escribe el ALUMNO, decide si la TRANSFORMACIÓN es válida, y si no lo es, dice
 * POR QUÉ. Así se puede señalar el PRIMER paso incorrecto de una resolución, no
 * sólo que la respuesta final está mal.
 *
 *   · EXPRESIONES: el paso tiene que valer lo mismo que el anterior
 *     (`2(x + 4)` → `2x + 8`).
 *   · ECUACIONES: el paso tiene que ser una ecuación con la MISMA diferencia
 *     «lado izquierdo − lado derecho» salvo un factor constante distinto de cero
 *     (`2(x+4) = 3x−1` → `2x+8 = 3x−1`, o `2x−3x = −1−8`, o `x = 9`). Eso admite
 *     pasar términos, intercambiar lados y multiplicar o dividir por una
 *     constante, y rechaza todo lo que cambia la solución.
 *
 * Cuando el paso es incorrecto se busca la CAUSA más probable probando los
 * errores típicos sobre el paso anterior: una distributiva incompleta, un
 * término que cambia de lado sin cambiar de signo, un signo mal repartido. Si
 * ninguno encaja, se dice qué lado cambió de valor.
 *
 * Sin dependencias de Prisma ni de React: lo carga Node tal cual en `qa/`.
 */

export type Causa =
  | "DISTRIBUTIVA_INCOMPLETA"
  | "SIGNO_AL_DISTRIBUIR"
  | "TRANSPOSICION_SIN_CAMBIAR_SIGNO"
  | "LADO_CAMBIADO"
  | "CAMBIA_LA_SOLUCION"
  | "NO_EQUIVALENTE"
  | "CAMBIA_DE_TIPO"
  | "NO_LEGIBLE";

export interface VeredictoPaso {
  /** `true` válido, `false` inválido, `null` el motor no sabe juzgarlo. */
  ok: boolean | null;
  causa: Causa | null;
  /** Explicación para el alumno, sin revelar el paso correcto. */
  explicacion: string;
  /** El paso no cambia nada respecto al anterior (válido, pero no avanza). */
  sinAvance?: boolean;
}

// ── Lectura ──────────────────────────────────────────────────────────────────

const limpiar = (t: string) =>
  String(t ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, " ")
    .trim();

interface Ecuacion {
  izq: Nodo;
  der: Nodo;
  izqTexto: string;
  derTexto: string;
}

type Leido = { tipo: "ecuacion"; ec: Ecuacion } | { tipo: "expresion"; nodo: Nodo; texto: string } | null;

export function leer(texto: string): Leido {
  const t = limpiar(texto);
  if (!t) return null;
  const partes = t.split("=");
  if (partes.length === 2) {
    const izq = analizar(partes[0]);
    const der = analizar(partes[1]);
    if (!izq || !der) return null;
    return { tipo: "ecuacion", ec: { izq, der, izqTexto: partes[0].trim(), derTexto: partes[1].trim() } };
  }
  if (partes.length > 2) return null;
  const nodo = analizar(t);
  return nodo ? { tipo: "expresion", nodo, texto: t } : null;
}

const cerca = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

const PUNTOS = [0.7, 1.3, 2.1, 3.4, -1.6, 5.2];

function variableDe(...nodos: Nodo[]): string {
  const todas = [...new Set(nodos.flatMap((n) => variablesDe(n)))];
  return todas[0] ?? "x";
}

/** D(x) = lado izquierdo − lado derecho, como función de la variable. */
const diferencia = (e: Ecuacion, v: string) => (x: number) => evaluar(e.izq, { [v]: x }) - evaluar(e.der, { [v]: x });

/**
 * ¿Son proporcionales dos funciones con factor distinto de cero? Es lo que
 * conserva la solución de una ecuación al transformarla bien.
 */
function proporcionales(f: (x: number) => number, g: (x: number) => number): boolean | null {
  let lambda: number | null = null;
  let comparados = 0;
  let ambasNulas = true;
  for (const p of PUNTOS) {
    const a = f(p);
    const b = g(p);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    comparados++;
    if (Math.abs(a) > 1e-9) ambasNulas = false;
    if (Math.abs(b) > 1e-9) ambasNulas = false;
    if (Math.abs(a) <= 1e-9) {
      if (Math.abs(b) > 1e-9) return false;
      continue;
    }
    const l = b / a;
    if (Math.abs(l) <= 1e-9) return false;
    if (lambda === null) lambda = l;
    else if (!cerca(l, lambda)) return false;
  }
  if (comparados < 3) return null;
  if (ambasNulas) return true; // dos identidades (0 = 0)
  return lambda !== null;
}

// ── Formas lineales ──────────────────────────────────────────────────────────

export interface Lineal {
  a: number;
  b: number;
}

/** `a·v + b`, si la expresión es lineal en `v`; `null` si no lo es o no se lee. */
export function formaLineal(n: Nodo, v: string): Lineal | null {
  const f0 = evaluar(n, { [v]: 0 });
  const f1 = evaluar(n, { [v]: 1 });
  const f2 = evaluar(n, { [v]: 2 });
  const f3 = evaluar(n, { [v]: -3 });
  if (![f0, f1, f2, f3].every(Number.isFinite)) return null;
  if (!cerca(f2 - f1, f1 - f0) || !cerca(f3, f0 - 3 * (f1 - f0))) return null;
  return { a: f1 - f0, b: f0 };
}

const num = (n: number) => formatearNumero(Math.round(n * 1e9) / 1e9);

/** Un número exacto: entero, o fracción simple (1/3) si lo es; si no, decimal. */
export function numeroExacto(n: number): string {
  if (Number.isInteger(Math.round(n * 1e9) / 1e9)) return num(n);
  for (let d = 2; d <= 100; d++) {
    const k = n * d;
    if (Math.abs(k - Math.round(k)) < 1e-9) {
      const t = Math.round(k);
      const g = (a: number, b: number): number => (b === 0 ? Math.abs(a) : g(b, a % b));
      const m = g(t, d);
      return `${t / m}/${d / m}`;
    }
  }
  return num(n);
}

/** «2x + 8», «-x + 9», «5», «0». */
export function textoLineal({ a, b }: Lineal, v = "x"): string {
  const parteA = a === 0 ? "" : a === 1 ? v : a === -1 ? `-${v}` : `${num(a)}${v}`;
  if (!parteA) return num(b);
  if (b === 0) return parteA;
  return `${parteA} ${b < 0 ? "-" : "+"} ${num(Math.abs(b))}`;
}

// ── Errores típicos: reescrituras equivocadas del paso anterior ───────────────

interface Variante {
  nodo: Nodo;
  causa: "DISTRIBUTIVA_INCOMPLETA" | "SIGNO_AL_DISTRIBUIR";
  /** Fragmento original que se reescribió mal, para poder explicarlo. */
  fragmento: Nodo;
  factor: Nodo;
  dentro: [Nodo, Nodo, "+" | "-"];
}

const esConstante = (n: Nodo) => variablesDe(n).length === 0;
const esSuma = (n: Nodo): n is Extract<Nodo, { tipo: "suma" | "resta" }> => n.tipo === "suma" || n.tipo === "resta";

/** Todas las formas en que se puede «distribuir mal» un subárbol de `n`. */
function variantesErroneas(n: Nodo): Variante[] {
  const salida: Variante[] = [];
  const recorrer = (nodo: Nodo, reemplazar: (nuevo: Nodo) => Nodo) => {
    if (nodo.tipo === "producto") {
      for (const [factor, otro] of [
        [nodo.izq, nodo.der],
        [nodo.der, nodo.izq],
      ] as const) {
        if (esSuma(otro)) {
          // k(a ± b) → k·a ± b : el factor sólo llega al primer término.
          salida.push({
            nodo: reemplazar({ tipo: otro.tipo, izq: { tipo: "producto", izq: factor, der: otro.izq }, der: otro.der }),
            causa: "DISTRIBUTIVA_INCOMPLETA",
            fragmento: nodo,
            factor,
            dentro: [otro.izq, otro.der, otro.tipo === "suma" ? "+" : "-"],
          });
        }
      }
    }
    if (nodo.tipo === "negacion" && esSuma(nodo.arg)) {
      // −(a ± b) → −a ± b : el signo sólo llega al primer término.
      salida.push({
        nodo: reemplazar({ tipo: nodo.arg.tipo, izq: { tipo: "negacion", arg: nodo.arg.izq }, der: nodo.arg.der }),
        causa: "SIGNO_AL_DISTRIBUIR",
        fragmento: nodo,
        factor: { tipo: "numero", valor: -1 },
        dentro: [nodo.arg.izq, nodo.arg.der, nodo.arg.tipo === "suma" ? "+" : "-"],
      });
    }
    // Un −k(a ± b) llega como negación de un producto: ya lo cubren los dos casos.
    switch (nodo.tipo) {
      case "suma":
      case "resta":
      case "producto":
      case "cociente":
        recorrer(nodo.izq, (nuevo) => reemplazar({ ...nodo, izq: nuevo }));
        recorrer(nodo.der, (nuevo) => reemplazar({ ...nodo, der: nuevo }));
        break;
      case "potencia":
        recorrer(nodo.base, (nuevo) => reemplazar({ ...nodo, base: nuevo }));
        break;
      case "negacion":
      case "funcion":
        recorrer(nodo.arg, (nuevo) => reemplazar({ ...nodo, arg: nuevo }));
        break;
      default:
    }
  };
  recorrer(n, (nuevo) => nuevo);
  return salida;
}

/** Los términos de primer nivel de una suma, con su signo. */
function terminos(n: Nodo, signo = 1): { nodo: Nodo; signo: number }[] {
  if (n.tipo === "suma") return [...terminos(n.izq, signo), ...terminos(n.der, signo)];
  if (n.tipo === "resta") return [...terminos(n.izq, signo), ...terminos(n.der, -signo)];
  if (n.tipo === "negacion") return terminos(n.arg, -signo);
  return [{ nodo: n, signo }];
}

const texto = (n: Nodo) => escribir(n);

function explicarDistribucion(v: Variante): string {
  const [a, b, op] = v.dentro;
  const k = texto(v.factor);
  if (v.causa === "SIGNO_AL_DISTRIBUIR") {
    return `Al quitar el paréntesis de ${texto(v.fragmento)}, el signo menos afecta a TODOS los términos: −${texto(a)} ${op === "+" ? "−" : "+"} ${texto(b)}. En tu paso el segundo término conservó su signo.`;
  }
  return `Al quitar el paréntesis de ${texto(v.fragmento)}, el ${k} multiplica a TODOS los términos: ${k}·${texto(a)} ${op} ${k}·${texto(b)}. En tu paso el ${texto(b)} quedó sin multiplicar.`;
}

// ── El validador ─────────────────────────────────────────────────────────────

/**
 * ¿Es `siguiente` una transformación válida de `anterior`? Si no, ¿por qué?
 */
export function validarTransformacion(anterior: string, siguiente: string): VeredictoPaso {
  const a = leer(anterior);
  const s = leer(siguiente);
  if (!s) {
    return { ok: null, causa: "NO_LEGIBLE", explicacion: "No he podido leer ese paso: escríbelo como una expresión o ecuación (por ejemplo 2x + 8 = 3x − 1)." };
  }
  if (!a) {
    return { ok: null, causa: "NO_LEGIBLE", explicacion: "No se puede comparar con el paso anterior." };
  }
  if (a.tipo !== s.tipo) {
    return {
      ok: false,
      causa: "CAMBIA_DE_TIPO",
      explicacion:
        a.tipo === "ecuacion"
          ? "El paso anterior es una ecuación (tiene «=») y éste no: en cada paso hay que seguir con la ecuación."
          : "El paso anterior es una expresión y éste es una ecuación: no se ha dicho que sea igual a nada.",
    };
  }

  // ── Ecuaciones ─────────────────────────────────────────────────────────────
  if (a.tipo === "ecuacion" && s.tipo === "ecuacion") {
    const v = variableDe(a.ec.izq, a.ec.der, s.ec.izq, s.ec.der);
    const igual = limpiar(anterior).replace(/\s/g, "") === limpiar(siguiente).replace(/\s/g, "");
    const prop = proporcionales(diferencia(a.ec, v), diferencia(s.ec, v));
    if (prop === null) {
      return { ok: null, causa: "NO_LEGIBLE", explicacion: "No puedo comprobar este paso con seguridad (la expresión no está definida en los puntos de prueba)." };
    }
    if (prop) {
      return igual
        ? { ok: true, causa: null, explicacion: "Es el mismo paso: no has avanzado todavía.", sinAvance: true }
        : { ok: true, causa: null, explicacion: "Correcto: el paso mantiene la solución de la ecuación." };
    }
    return diagnosticarEcuacion(a.ec, s.ec, v);
  }

  // ── Expresiones ────────────────────────────────────────────────────────────
  if (a.tipo === "expresion" && s.tipo === "expresion") {
    const eq = equivalentes(a.texto, s.texto);
    if (eq === null) {
      return { ok: null, causa: "NO_LEGIBLE", explicacion: "No puedo comprobar este paso con seguridad." };
    }
    if (eq) return { ok: true, causa: null, explicacion: "Correcto: vale lo mismo que el paso anterior." };
    for (const variante of variantesErroneas(a.nodo)) {
      if (equivalentes(escribir(variante.nodo), s.texto)) {
        return { ok: false, causa: variante.causa, explicacion: explicarDistribucion(variante) };
      }
    }
    return {
      ok: false,
      causa: "NO_EQUIVALENTE",
      explicacion: `Este paso no vale lo mismo que el anterior: ${a.texto} y ${s.texto} dan resultados distintos.`,
    };
  }
  return { ok: null, causa: "NO_LEGIBLE", explicacion: "No puedo comprobar este paso." };
}

function diagnosticarEcuacion(prev: Ecuacion, paso: Ecuacion, v: string): VeredictoPaso {
  const dPaso = diferencia(paso, v);

  // 1. Una distributiva (o un signo) mal repartidos en el paso anterior.
  for (const lado of ["izq", "der"] as const) {
    for (const variante of variantesErroneas(prev[lado])) {
      const candidata: Ecuacion = { ...prev, [lado]: variante.nodo };
      if (proporcionales(diferencia(candidata, v), dPaso)) {
        return { ok: false, causa: variante.causa, explicacion: explicarDistribucion(variante) };
      }
    }
  }

  // 2. Si sólo UN lado cambió de valor, el error está en ese lado.
  const ladoIgual = (x: Nodo, y: Nodo) => {
    const t = equivalentes(escribir(x), escribir(y));
    return t === true;
  };
  const izqIgual = ladoIgual(prev.izq, paso.izq);
  const derIgual = ladoIgual(prev.der, paso.der);
  // También se compara cruzado: el alumno puede haber intercambiado los lados.
  const cruzado = ladoIgual(prev.izq, paso.der) && ladoIgual(prev.der, paso.izq);
  if (!cruzado && izqIgual !== derIgual) {
    const cambiado = izqIgual ? "derecho" : "izquierdo";
    const antes = izqIgual ? prev.der : prev.izq;
    const despues = izqIgual ? paso.der : paso.izq;
    const lin = formaLineal(antes, v);
    const equivale = lin && sinEspacios(textoLineal(lin, v)) !== sinEspacios(texto(antes)) ? ` (${texto(antes)} equivale a ${textoLineal(lin, v)})` : "";
    return {
      ok: false,
      causa: "LADO_CAMBIADO",
      explicacion: `El lado ${cambiado} ya no vale lo mismo: ${texto(antes)} no es igual a ${texto(despues)}${equivale}. Revisa ese lado.`,
    };
  }

  // 3. Un término que pasa al otro lado (cambian los dos lados) sin cambiar de signo (sólo lineales).
  const dPrev = diferencia(prev, v);
  for (const [lado, sentido] of [["izq", 1], ["der", -1]] as const) {
    for (const t of terminos(prev[lado])) {
      const valor = (x: number) => t.signo * evaluar(t.nodo, { [v]: x });
      // Mal movido: D' = D − 2·t (desde la izquierda) o D + 2·t (desde la derecha).
      const mal = (x: number) => dPrev(x) - sentido * 2 * valor(x);
      if (proporcionales(mal, dPaso)) {
        const original = `${t.signo < 0 ? "−" : "+"}${texto(t.nodo)}`;
        const correcto = `${t.signo < 0 ? "+" : "−"}${texto(t.nodo)}`;
        return {
          ok: false,
          causa: "TRANSPOSICION_SIN_CAMBIAR_SIGNO",
          explicacion: `Al pasar ${original} al otro lado de la igualdad hay que cambiarle el signo (pasa como ${correcto}). En tu paso se quedó con el mismo signo.`,
        };
      }
    }
  }

  // 4. Lo demás: dice qué solución tenía y cuál tiene ahora.
  const lp = formaLineal({ tipo: "resta", izq: prev.izq, der: prev.der }, v);
  const ls = formaLineal({ tipo: "resta", izq: paso.izq, der: paso.der }, v);
  if (lp && ls && lp.a !== 0 && ls.a !== 0) {
    return {
      ok: false,
      causa: "CAMBIA_LA_SOLUCION",
      explicacion: `Este paso cambia la solución: la ecuación anterior se resuelve con ${v} = ${numeroExacto(-lp.b / lp.a)} y la tuya con ${v} = ${numeroExacto(-ls.b / ls.a)}. Revisa las operaciones de este paso.`,
    };
  }
  return { ok: false, causa: "NO_EQUIVALENTE", explicacion: "Este paso no es equivalente al anterior: la ecuación ya no tiene la misma solución." };
}

// ── La resolución completa ───────────────────────────────────────────────────

export interface ResultadoCadena {
  /** Índice (0-based) del primer paso incorrecto, o `null` si no hay ninguno. */
  primerIncorrecto: number | null;
  veredictos: VeredictoPaso[];
}

/**
 * Recorre la resolución de un alumno y encuentra el PRIMER paso mal. Cada paso se
 * compara con el anterior (el primero, con el enunciado). Los pasos que el motor
 * no sabe juzgar no detienen la búsqueda, pero tampoco cuentan como correctos.
 */
export function primerPasoIncorrecto(problema: string, pasos: string[]): ResultadoCadena {
  const veredictos: VeredictoPaso[] = [];
  let anterior = problema;
  let primero: number | null = null;
  pasos.forEach((paso, i) => {
    const v = validarTransformacion(anterior, paso);
    veredictos.push(v);
    if (v.ok === false && primero === null) primero = i;
    // Se sigue desde el paso del alumno aunque sea incorrecto sólo si es legible:
    // así un único error no tiñe todos los pasos siguientes. Pero si falló, se
    // sigue comparando con el último paso BUENO.
    if (v.ok !== false) anterior = paso;
  });
  return { primerIncorrecto: primero, veredictos };
}

// ── El siguiente paso correcto (para pistas y soluciones) ────────────────────

export interface PasoModelo {
  tipo: "distributiva" | "simplificar" | "agrupar" | "reducir" | "dividir" | "resultado";
  /** La ecuación tal como queda tras este paso. */
  texto: string;
  /** Qué se hace, dicho para el alumno. */
  explicacion: string;
  /** Dos pistas de menos a más concreta, que no escriben el paso. */
  pistas: [string, string];
}

const tieneParentesis = (n: Nodo): boolean => variantesErroneas(n).length > 0 || contieneProductoSobreSuma(n);

function contieneProductoSobreSuma(n: Nodo): boolean {
  switch (n.tipo) {
    case "producto":
      return esSuma(n.izq) || esSuma(n.der) || contieneProductoSobreSuma(n.izq) || contieneProductoSobreSuma(n.der);
    case "negacion":
      return esSuma(n.arg) || contieneProductoSobreSuma(n.arg);
    case "suma":
    case "resta":
    case "cociente":
      return contieneProductoSobreSuma(n.izq) || contieneProductoSobreSuma(n.der);
    default:
      return false;
  }
}

const sinEspacios = (t: string) => limpiar(t).replace(/\s/g, "");

/**
 * La resolución modelo de una ecuación lineal desde donde esté: quitar paréntesis
 * → agrupar → reducir → despejar. `null` si no es una ecuación lineal en una
 * variable (entonces el servidor no sabe guiarla).
 */
export function resolverPorPasos(ecuacion: string): PasoModelo[] | null {
  const l = leer(ecuacion);
  if (!l || l.tipo !== "ecuacion") return null;
  const v = variableDe(l.ec.izq, l.ec.der);
  const iz = formaLineal(l.ec.izq, v);
  const de = formaLineal(l.ec.der, v);
  if (!iz || !de) return null;

  const pasos: PasoModelo[] = [];
  let actual = sinEspacios(ecuacion);

  // 1. Quitar paréntesis / reducir cada lado a «ax + b».
  const ladoEscrito = (n: Nodo, f: Lineal) => textoLineal(f, v);
  const formaCompacta = `${ladoEscrito(l.ec.izq, iz)} = ${ladoEscrito(l.ec.der, de)}`;
  if (sinEspacios(formaCompacta) !== actual) {
    const conParentesis = tieneParentesis(l.ec.izq) || tieneParentesis(l.ec.der);
    pasos.push(
      conParentesis
        ? {
            tipo: "distributiva",
            texto: formaCompacta,
            explicacion: "Quita los paréntesis con la propiedad distributiva: el número de fuera multiplica a cada término de dentro.",
            pistas: [
              "¿Hay algún paréntesis que puedas quitar antes de mover términos?",
              "Usa la propiedad distributiva: el número de fuera multiplica a CADA término del paréntesis.",
            ],
          }
        : {
            tipo: "simplificar",
            texto: formaCompacta,
            explicacion: "Reduce cada lado: suma los términos semejantes.",
            pistas: ["¿Puedes simplificar cada lado por separado?", "Junta los términos con x entre sí y los números entre sí, en cada lado."],
          },
    );
    actual = sinEspacios(formaCompacta);
  }

  // 2. Agrupar: las x a la izquierda, los números a la derecha.
  const A = iz.a - de.a;
  const B = de.b - iz.b;
  const hayQueMover = de.a !== 0 || iz.b !== 0;
  const parteX = (c: number) => (c === 1 ? v : c === -1 ? `-${v}` : `${num(c)}${v}`);
  if (hayQueMover) {
    const izq = de.a !== 0 ? `${iz.a === 0 ? "" : parteX(iz.a)}${de.a > 0 ? " - " : iz.a === 0 ? "" : " + "}${parteX(Math.abs(de.a))}`.trim() : parteX(iz.a);
    const izqTxt = iz.a === 0 && de.a !== 0 ? `${de.a > 0 ? "-" : ""}${parteX(Math.abs(de.a))}` : izq;
    const der = iz.b !== 0 ? `${num(de.b)} ${iz.b > 0 ? "-" : "+"} ${num(Math.abs(iz.b))}` : num(de.b);
    const agrupada = `${izqTxt} = ${der}`;
    pasos.push({
      tipo: "agrupar",
      texto: agrupada,
      explicacion: "Pasa los términos con x a la izquierda y los números a la derecha, cambiándoles el signo al cambiar de lado.",
      pistas: [
        "¿Qué términos tienen la x y cuáles son solo números? Hay que separarlos.",
        "Pasa los términos con x al lado izquierdo y los números al derecho. Al cambiar de lado, cambian de signo.",
      ],
    });
    actual = sinEspacios(agrupada);
  }

  // 3. Reducir.
  if (A === 0) {
    const reducida = `0 = ${num(B)}`;
    pasos.push({
      tipo: "resultado",
      texto: reducida,
      explicacion: B === 0 ? "Los dos lados son siempre iguales: hay infinitas soluciones." : "Es imposible: la ecuación no tiene solución.",
      pistas: ["Reduce los términos con x: ¿qué queda?", "Los términos con x se cancelan. Mira qué queda a cada lado."],
    });
    return pasos;
  }
  const reducida = `${parteX(A)} = ${num(B)}`;
  if (sinEspacios(reducida) !== actual) {
    pasos.push({
      tipo: "reducir",
      texto: reducida,
      explicacion: "Reduce: suma los términos semejantes de cada lado.",
      pistas: ["¿Puedes juntar los términos semejantes de cada lado?", "Calcula el coeficiente de x (resta los de x) y el número del otro lado."],
    });
    actual = sinEspacios(reducida);
  }

  // 4. Despejar.
  const solucion = B / A;
  const resultado = `${v} = ${numeroExacto(solucion)}`;
  if (sinEspacios(resultado) !== actual) {
    pasos.push({
      tipo: "dividir",
      texto: resultado,
      explicacion: `Despeja ${v}: divide los dos lados entre ${num(A)}.`,
      pistas: [`¿Qué número multiplica a ${v}? Hay que deshacerlo.`, `Divide los dos lados entre el coeficiente de ${v}.`],
    });
  }
  return pasos;
}

/** ¿Es `texto` la solución final de la ecuación `problema` (x = número)? */
export function esSolucionFinal(problema: string, texto: string): boolean {
  const p = leer(problema);
  const s = leer(texto);
  if (!p || p.tipo !== "ecuacion" || !s || s.tipo !== "ecuacion") return false;
  const v = variableDe(p.ec.izq, p.ec.der);
  const izqVar = s.ec.izq.tipo === "variable" && s.ec.izq.nombre === v && esConstante(s.ec.der);
  const derVar = s.ec.der.tipo === "variable" && s.ec.der.nombre === v && esConstante(s.ec.izq);
  if (!izqVar && !derVar) return false;
  return validarTransformacion(problema, texto).ok === true;
}
