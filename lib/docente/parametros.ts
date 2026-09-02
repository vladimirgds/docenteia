/**
 * Ejercicios PARAMETRIZADOS: de un enunciado con huecos salen muchos ejercicios.
 *
 * El pliego del HITO 1 pide "creación de ejercicios con respuestas
 * parametrizadas". La idea es que el docente escriba una vez
 *
 *     enunciado: "{a}x + {b} = {c}"     respuesta: "({c} - {b}) / {a}"
 *
 * y el sistema pueda producir tantos ejercicios distintos como alumnos haya,
 * cada uno con su respuesta exacta. Aquí se resuelve la mecánica de esos
 * huecos; quién comprueba que la matemática cuadra es `validador.ts`.
 *
 * Dos decisiones condicionan todo lo demás:
 *
 *   1. LAS MUESTRAS SON DETERMINISTAS. Con la misma plantilla y la misma
 *      semilla salen exactamente los mismos valores. Sin eso, un ejercicio
 *      podría validarse hoy y fallar mañana con otros números, que es la peor
 *      clase de fallo: el que aparece en clase y no en la validación.
 *
 *   2. CUANDO EL ESPACIO ES PEQUEÑO SE RECORRE ENTERO. Si de la plantilla salen
 *      120 combinaciones, se comprueban las 120. Muestrear pudiendo ser
 *      exhaustivo es dejar pasar precisamente el caso raro —el que deja un
 *      denominador a cero— que es el que revienta delante de los alumnos.
 *
 * Este módulo no importa nada de Next.js ni de Prisma: es aritmética pura, y la
 * batería de QA lo ejercita sin levantar servidor ni base de datos.
 */

/** Un hueco del enunciado, con el rango de valores que puede tomar. */
export interface Parametro {
  /** Nombre del hueco tal como aparece entre llaves: `a` para `{a}`. */
  nombre: string;
  min: number;
  max: number;
  /** Salto entre valores. 1 por defecto; 0.5 para decimales. */
  paso?: number;
  /** Valores prohibidos. El caso clásico: el 0 en un coeficiente. */
  excluir?: number[];
}

/** Un juego concreto de valores: a=3, b=-2, c=10. */
export type Valores = Record<string, number>;

/** Tope de valores por parámetro, para que un rango absurdo no agote la memoria. */
export const MAX_VALORES_POR_PARAMETRO = 400;
/** Por debajo de este número de combinaciones se recorren TODAS. */
export const LIMITE_EXHAUSTIVO = 240;
/** Cuántas combinaciones se comprueban cuando el espacio es demasiado grande. */
export const MUESTRAS_POR_DEFECTO = 24;

const PATRON_HUECO = /\{\s*([A-Za-z][A-Za-z0-9_]{0,15})\s*\}/g;

/** Los huecos que aparecen en un texto, sin repetir y en orden de aparición. */
export function huecosDe(texto: string): string[] {
  const vistos: string[] = [];
  for (const m of String(texto ?? "").matchAll(PATRON_HUECO)) {
    if (!vistos.includes(m[1])) vistos.push(m[1]);
  }
  return vistos;
}

/** ¿El texto tiene algún hueco que rellenar? */
export function tieneHuecos(texto: string): boolean {
  return huecosDe(texto).length > 0;
}

/** Redondeo a 6 decimales: suficiente para el aula, y quita la basura binaria. */
function redondear(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Los valores que puede tomar un parámetro, en orden.
 *
 * Devuelve lista vacía cuando el rango no da ningún valor utilizable (rango
 * invertido, paso no positivo, o todo excluido). El validador lo trata como
 * error: una plantilla cuyo parámetro no admite ningún valor no es un ejercicio.
 */
export function valoresPosibles(p: Parametro): number[] {
  const paso = p.paso == null || p.paso === 0 ? 1 : Math.abs(p.paso);
  if (!Number.isFinite(p.min) || !Number.isFinite(p.max) || p.max < p.min) return [];

  const excluidos = new Set((p.excluir ?? []).map(redondear));
  const valores: number[] = [];
  for (let v = p.min; v <= p.max + 1e-9 && valores.length < MAX_VALORES_POR_PARAMETRO; v += paso) {
    // El acumulado en coma flotante convierte 0.1+0.2 en 0.30000000000000004, y
    // ese número acabaría escrito en el enunciado de un alumno.
    const valor = redondear(v);
    if (!excluidos.has(valor)) valores.push(valor);
  }
  return valores;
}

/**
 * Generador pseudoaleatorio pequeño y reproducible (mulberry32).
 *
 * Se usa uno propio en lugar de Math.random justamente para poder repetir la
 * misma tirada: la validación de un ejercicio tiene que ser comprobable dos
 * veces con el mismo resultado, aquí y en la máquina del cliente.
 */
function generador(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Combinaciones {
  /** Las combinaciones elegidas. */
  muestras: Valores[];
  /** Cuántas combinaciones distintas admite la plantilla en total. */
  totales: number;
  /** ¿Se han recorrido todas? */
  exhaustivo: boolean;
}

/**
 * Elige las combinaciones de valores con las que se va a comprobar la plantilla.
 *
 * Exhaustivo cuando el espacio es pequeño; muestreo determinista cuando no. El
 * muestreo evita repetir combinación: comprobar dos veces la misma no aporta
 * nada y deja sin mirar otra que sí podía fallar.
 */
export function combinaciones(
  parametros: readonly Parametro[],
  { cuantas = MUESTRAS_POR_DEFECTO, semilla = 20260901 } = {},
): Combinaciones {
  const dominios = parametros.map((p) => valoresPosibles(p));
  if (dominios.length === 0 || dominios.some((d) => d.length === 0)) {
    return { muestras: [], totales: 0, exhaustivo: false };
  }

  const totales = dominios.reduce((n, d) => n * d.length, 1);

  if (totales <= LIMITE_EXHAUSTIVO) {
    const muestras: Valores[] = [];
    for (let i = 0; i < totales; i++) {
      const valores: Valores = {};
      let resto = i;
      for (let j = dominios.length - 1; j >= 0; j--) {
        const dominio = dominios[j];
        valores[parametros[j].nombre] = dominio[resto % dominio.length];
        resto = Math.floor(resto / dominio.length);
      }
      muestras.push(valores);
    }
    return { muestras, totales, exhaustivo: true };
  }

  const azar = generador(semilla);
  const vistas = new Set<string>();
  const muestras: Valores[] = [];
  // El tope de vueltas evita quedarse dando vueltas cuando el azar repite; con
  // un espacio grande no se llega ni de lejos, pero el bucle no depende de eso.
  for (let intento = 0; intento < cuantas * 40 && muestras.length < cuantas; intento++) {
    const valores: Valores = {};
    for (let j = 0; j < dominios.length; j++) {
      const dominio = dominios[j];
      valores[parametros[j].nombre] = dominio[Math.floor(azar() * dominio.length)];
    }
    const firma = JSON.stringify(valores);
    if (vistas.has(firma)) continue;
    vistas.add(firma);
    muestras.push(valores);
  }
  return { muestras, totales, exhaustivo: false };
}

/** Sin exponente científico ni ceros de arrastre: "2", "-1.5", no "1.5000000001". */
export function formatearNumero(n: number): string {
  const valor = redondear(n);
  return Number.isInteger(valor) ? String(valor) : String(parseFloat(valor.toFixed(6)));
}

/**
 * Deja el enunciado como lo escribiría una persona.
 *
 *   "3x + -5 = 7"  →  "3x - 5 = 7"
 *   "3x - -5 = 7"  →  "3x + 5 = 7"
 *   "1x + 4 = 9"   →  "x + 4 = 9"
 *
 * El coeficiente 1 sólo se quita cuando es un 1 SUELTO pegado a la variable: en
 * "21x" el 1 forma parte del 21, y borrarlo cambiaría el ejercicio.
 */
export function normalizarSignos(texto: string): string {
  let s = colapsarSignos(texto);
  // "+ 0" y "- 0" sobran, pero sólo cuando el cero es un término entero.
  s = s.replace(/\s[+\-]\s*0(?![\d.])/g, "");
  s = s.replace(/(?<![\d.])1(?=[a-zA-Z])/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

/**
 * Colapsa los signos encadenados, y NADA MÁS.
 *
 * Es la mitad de `normalizarSignos` que también vale para una FÓRMULA. La otra
 * mitad —quitar el "+ 0" y el coeficiente 1— es maquillaje de enunciado y en
 * una fórmula puede cambiar el cálculo, así que se queda fuera.
 *
 * Hace falta porque sustituir un parámetro negativo produce expresiones que el
 * evaluador aritmético no sabe leer: "({c} - {b}) / {a}" con b = -3 se
 * convierte en "(11 - -3) / 2", y ese doble signo devolvía "no evaluable". El
 * ejercicio era correcto; lo que fallaba era la escritura.
 */
export function colapsarSignos(texto: string): string {
  let s = String(texto ?? "");
  let anterior;
  do {
    anterior = s;
    s = s.replace(/([+\-])\s*-\s*(?=[\d.])/g, (_, signo) => (signo === "+" ? "- " : "+ "));
  } while (s !== anterior);
  return s.replace(/\s{2,}/g, " ").trim();
}

/**
 * Rellena los huecos de un texto con sus valores.
 *
 * Lo interesante no es el reemplazo, que es trivial, sino lo que viene después:
 * un valor negativo deja el enunciado en "3x + -5 = 7". Eso no se le enseña a
 * un alumno, y además hay analizadores que se atragantan con ello. Por eso se
 * normalizan los signos encadenados y el coeficiente 1, que tampoco se escribe.
 */
export function sustituir(
  plantilla: string,
  valores: Valores,
  { limpiar = true } = {},
): string {
  const texto = String(plantilla ?? "").replace(PATRON_HUECO, (original, nombre) => {
    const valor = valores[nombre];
    return valor == null || !Number.isFinite(valor) ? original : formatearNumero(valor);
  });
  return limpiar ? normalizarSignos(texto) : texto;
}

/**
 * Comprueba que la declaración de parámetros y el texto encajan.
 *
 * Devuelve los problemas en castellano, listos para enseñárselos al docente. Se
 * mira en las dos direcciones —huecos sin declarar y parámetros sin usar—
 * porque los dos fallos son fáciles de cometer y producen síntomas distintos:
 * el primero deja un "{d}" impreso en el examen, y el segundo hace creer que un
 * ejercicio varía cuando en realidad es siempre el mismo.
 */
export function revisarDeclaracion(
  textos: readonly string[],
  parametros: readonly Parametro[],
): string[] {
  const problemas: string[] = [];
  const declarados = parametros.map((p) => p.nombre);
  const usados = [...new Set(textos.flatMap((t) => huecosDe(t)))];

  for (const hueco of usados) {
    if (!declarados.includes(hueco)) {
      problemas.push(
        `El hueco {${hueco}} aparece en el ejercicio pero no está declarado como parámetro.`,
      );
    }
  }
  for (const p of parametros) {
    if (!usados.includes(p.nombre)) {
      problemas.push(`El parámetro {${p.nombre}} está declarado pero no se usa en ningún sitio.`);
    }
    if (valoresPosibles(p).length === 0) {
      problemas.push(
        `El parámetro {${p.nombre}} no admite ningún valor: revisa el rango (${p.min} a ${p.max}), el paso y los valores excluidos.`,
      );
    }
  }
  if (new Set(declarados).size !== declarados.length) {
    problemas.push("Hay parámetros repetidos: cada nombre debe aparecer una sola vez.");
  }
  return problemas;
}
