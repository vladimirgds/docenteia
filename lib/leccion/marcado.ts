/**
 * MARCADO SEMÁNTICO GENÉRICO.
 *
 * Un paso de una lección no dice sólo QUÉ se escribe, sino QUÉ se está
 * operando: qué términos se cancelan, por qué factor se amplifica, qué columna
 * toca. Con esa instrucción —y sin saber nada del tema— esta subrutina inyecta
 * el marcado en el LaTeX y produce los focos que la pizarra irá encendiendo.
 *
 * POR QUÉ ESTO Y NO UN CASO POR TEMA
 * Porque el catálogo va a tener miles de ejercicios y el frontend no puede
 * crecer con ellos. Hasta ahora cada tipo de ejercicio tenía su constructor de
 * escena, y añadir uno nuevo obligaba a tocar la pizarra. Con el paso
 * etiquetado, el que añade ejercicios describe la operación y aquí no hay nada
 * que cambiar.
 *
 * LO QUE NO PUEDE PASAR
 * Que una marca cruce el signo igual. Un tachado que abarca "+ 6 = 16 - 6"
 * afirma que se cancela el igual y el otro miembro, que es falso. Por eso el
 * marcado se aplica SIEMPRE dentro de un miembro: la expresión se parte por el
 * "=" de nivel superior, se marca dentro de cada trozo y se vuelve a unir.
 */

import type { Escena, Foco, TipoFoco } from "./animacion.ts";

/** Las operaciones que la pizarra sabe señalar. */
export type TipoOperacion = "amplificacion" | "distributiva" | "columna" | "cancelacion";

/** La instrucción de foco que acompaña a un paso. */
export interface OperacionPaso {
  tipo: TipoOperacion;
  /**
   * Los términos sobre los que actúa la operación, tal como aparecen escritos:
   * `["3"]` para el factor de una amplificación, `["2x"]` para lo que se
   * cancela. Cada uno recibe SU marca y SU recuadro.
   */
  terminosFoco: string[];
  /** Rótulo corto que acompaña al recuadro: "llevo 1", "×3". */
  etiqueta?: string;
  /** Columna activa, cuando la operación es en columna. */
  columna?: number;
}

/** Un paso de la lección, ya etiquetado por quien lo genera o lo almacena. */
export interface PasoSemantico {
  latex: string;
  operacion?: OperacionPaso;
  narracion?: string;
}

/** Cómo se dibuja cada operación. */
const TRAZO: Record<TipoOperacion, TipoFoco> = {
  amplificacion: "caja",
  distributiva: "caja",
  columna: "caja",
  cancelacion: "tachado",
};

/** Lo que el tutor dice si el paso no trae narración propia. */
const NARRACION: Record<TipoOperacion, (terminos: string[]) => string> = {
  amplificacion: (t) => `Multiplicamos arriba y abajo por ${t[0] ?? "el mismo número"}.`,
  distributiva: (t) => `Repartimos ${t[0] ?? "el factor"} entre los dos sumandos del paréntesis.`,
  columna: (t) => `Operamos ${t[0] ?? "esta columna"}.`,
  cancelacion: (t) => `Se cancela ${t.join(" con ")}.`,
};

// ── Partir por el igual ──────────────────────────────────────────────────────

/**
 * Los miembros de una expresión, partida por los "=" de nivel superior.
 *
 * "De nivel superior" quiere decir fuera de llaves: el "=" que pueda haber
 * dentro de un `\htmlClass{...}{...}` o de una fracción no separa nada.
 */
export function miembros(latex: string): string[] {
  const trozos: string[] = [];
  let profundidad = 0;
  let actual = "";

  for (let i = 0; i < latex.length; i++) {
    const c = latex[i];
    if (c === "{") profundidad++;
    if (c === "}") profundidad = Math.max(0, profundidad - 1);
    if (c === "=" && profundidad === 0) {
      trozos.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  trozos.push(actual);
  return trozos;
}

/** ¿Este trozo de LaTeX es parte del nombre de una macro? */
function dentroDeMacro(latex: string, posicion: number): boolean {
  // Se retrocede sobre letras hasta encontrar —o no— la barra de una macro.
  let i = posicion - 1;
  while (i >= 0 && /[a-zA-Z]/.test(latex[i])) i--;
  return i >= 0 && latex[i] === "\\";
}

/**
 * Envuelve TODAS las apariciones de los términos dentro de este miembro.
 *
 * Todas, no la primera: en "2x + 8 - 2x" lo que se cancela son los dos `2x`, y
 * marcar sólo el primero señalaría el término equivocado. El pliego lo dice
 * igual —el marcado va "exclusivamente sobre los términos listados"—, así que
 * se marca cada aparición y ninguna otra cosa.
 *
 * Se calculan primero todas las posiciones y se compone la cadena en UNA
 * pasada. Marcando de una en una sobre el resultado anterior habría que
 * distinguir el texto original del marcado ya inyectado, y ese es justo el tipo
 * de reemplazo ciego que el cliente pide evitar.
 */
export function marcarTerminos(
  miembro: string,
  terminos: readonly string[],
  claseDe: (termino: string, aparicion: number) => string,
): { latex: string; piezas: string[] } {
  const tramos: Array<{ desde: number; hasta: number; clase: string }> = [];

  terminos.forEach((crudo) => {
    const termino = String(crudo ?? "").trim();
    if (!termino) return;
    let aparicion = 0;
    let desde = 0;
    while (desde <= miembro.length - termino.length) {
      const donde = miembro.indexOf(termino, desde);
      if (donde < 0) break;
      // Un término que empieza por letra no puede caer dentro del nombre de una
      // macro: la "x" de `	imes` no es la incógnita.
      if (!(/^[a-zA-Z]/.test(termino) && dentroDeMacro(miembro, donde))) {
        tramos.push({
          desde: donde,
          hasta: donde + termino.length,
          clase: claseDe(termino, aparicion),
        });
        aparicion++;
      }
      desde = donde + 1;
    }
  });

  // De izquierda a derecha, y ante un solapamiento gana el tramo más largo: si
  // se pidieran "2" y "2x", el que manda es el término completo.
  tramos.sort((a, b) => a.desde - b.desde || b.hasta - a.hasta);

  const piezas: string[] = [];
  let latex = "";
  let cursor = 0;
  for (const tramo of tramos) {
    if (tramo.desde < cursor) continue;
    latex += miembro.slice(cursor, tramo.desde);
    latex += `\\htmlClass{${tramo.clase}}{${miembro.slice(tramo.desde, tramo.hasta)}}`;
    piezas.push(tramo.clase.split(/\s+/).at(-1) as string);
    cursor = tramo.hasta;
  }
  latex += miembro.slice(cursor);

  return { latex, piezas };
}

// ── La subrutina ─────────────────────────────────────────────────────────────

/**
 * El paso etiquetado, convertido en escena: LaTeX marcado y focos que encender.
 *
 * Cada término de `terminosFoco` recibe su propia marca —y por tanto su propio
 * recuadro— y se busca dentro de cada miembro por separado, de modo que el
 * marcado no puede cruzar el igual por construcción, no por cuidado.
 */
export function escenaDePasoSemantico(paso: PasoSemantico, id: string): Escena | null {
  const operacion = paso.operacion;
  const base = String(paso.latex ?? "").trim();
  if (!operacion || !base) return null;

  const terminos = (operacion.terminosFoco ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  if (terminos.length === 0) return null;

  // El marcado va por miembros: lo que se cancela a la izquierda es una marca,
  // y lo que se cancela a la derecha es otra. Partido por el igual, ninguna
  // marca puede cruzarlo por construcción.
  const partes = miembros(base);
  const piezas: string[] = [];

  const marcadas = partes.map((parte, iParte) => {
    const resultado = marcarTerminos(
      parte,
      terminos,
      (termino, aparicion) => {
        const clase = `pz-foco-${terminos.indexOf(termino)}-${iParte}-${aparicion}`;
        return `pz-marcado ${clase}`;
      },
    );
    piezas.push(...resultado.piezas);
    return resultado.latex;
  });

  // Ni un término encontrado: mejor no inventar un resaltado que señale al aire.
  if (piezas.length === 0) return null;

  const foco: Foco = {
    clase: "pz-marcado",
    piezas,
    tipo: TRAZO[operacion.tipo] ?? "caja",
    narracion: paso.narracion?.trim() || NARRACION[operacion.tipo](terminos),
    ...(operacion.etiqueta ? { etiqueta: operacion.etiqueta } : {}),
  };

  return {
    id,
    texto: base,
    latex: marcadas.join(" = "),
    narracion: paso.narracion?.trim() || NARRACION[operacion.tipo](terminos),
    clase: "semantica",
    focos: [foco],
  };
}

// ── Amplificación ────────────────────────────────────────────────────────────

/**
 * Lee `1/2 = 3/6` como lo que es: la misma fracción amplificada por 3.
 *
 * El salto de 1/2 a 3/6 no se ve —el cliente lo marcó en rojo sobre la
 * captura—, y para enseñarlo hace falta saber por cuánto se multiplicó. Aquí
 * sólo se leen los números; el dibujo lo compone el guion, que es quien conoce
 * las convenciones de marcado y de revelado.
 *
 * Se exige que sea la MISMA fracción y que el factor sea entero: "1/2 = 2/5" no
 * es una amplificación, es un error, y no se le va a poner un adorno encima.
 */
export function leerAmplificacion(
  texto: string,
): { a: number; b: number; c: number; d: number; factor: number } | null {
  const limpio = String(texto ?? "")
    .replace(/\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
    .replace(/\s+/g, "");

  const m = limpio.match(/^(\d{1,3})\/(\d{1,3})=(\d{1,4})\/(\d{1,4})$/);
  if (!m) return null;

  const [a, b, c, d] = m.slice(1).map(Number);
  if (!a || !b || !c || !d) return null;

  const factor = d / b;
  if (!Number.isInteger(factor) || factor < 2) return null;
  if (a * d !== c * b) return null;

  return { a, b, c, d, factor };
}
