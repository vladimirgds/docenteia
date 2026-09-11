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

/**
 * Las operaciones que la pizarra sabe señalar.
 *
 * Son TIPOS DE GESTO, no tipos de ejercicio: un catálogo de miles de ejercicios
 * cabe en estos pocos, porque lo que cambia de un ejercicio a otro son los
 * números y el tema, no el gesto con el que se enseña. Las tres primeras son
 * las que nombró el cliente —columna, factor, cancelación—; las otras tres son
 * gestos compuestos que tienen su propio dibujo.
 */
export type TipoOperacion =
  | "columna"
  | "factor"
  | "cancelacion"
  | "amplificacion"
  | "suma-fracciones"
  | "distributiva";

/**
 * La lista, para quien necesite validar sin conocer el tipo.
 *
 * `src/preLight.js` mantiene su propia copia —es JavaScript de servidor y no
 * importa módulos de la interfaz—; `qa/hito2.mjs` comprueba que las dos digan
 * lo mismo.
 */
export const TIPOS_OPERACION: readonly TipoOperacion[] = [
  "columna",
  "factor",
  "cancelacion",
  "amplificacion",
  "suma-fracciones",
  "distributiva",
];

/** La instrucción de foco que acompaña a un paso. */
export interface OperacionPaso {
  tipo: TipoOperacion;
  /**
   * Los términos sobre los que actúa la operación, TAL COMO APARECEN ESCRITOS
   * en el paso: `["2", "3"]` para los numeradores que se suman, `["5"]` para lo
   * que se cancela. Cada uno recibe SU marca y SU recuadro.
   *
   * Un término que no esté en el paso invalida la instrucción entera: la
   * pizarra no dibuja un recuadro alrededor de algo que no está escrito.
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
  columna: "caja",
  factor: "caja",
  cancelacion: "tachado",
  amplificacion: "caja",
  "suma-fracciones": "caja",
  distributiva: "caja",
};

/** Lo que el tutor dice si el paso no trae narración propia. */
const NARRACION: Record<TipoOperacion, (terminos: string[]) => string> = {
  columna: (t) => `Operamos ${t.join(" y ") || "esta columna"}.`,
  factor: (t) => `Fíjate en ${t.join(" y ")}.`,
  cancelacion: (t) => `Se cancela ${t.join(" con ")}.`,
  amplificacion: (t) => `Multiplicamos arriba y abajo por el mismo número: ${t.join(" es ")}.`,
  "suma-fracciones": (t) => `Operamos los numeradores: ${t.join(" y ")}.`,
  distributiva: (t) => `Repartimos entre ${t.join(" y ")}.`,
};

// ── ¿Está el término en el paso? ─────────────────────────────────────────────

/**
 * ¿Aparece `termino` en `texto` COMO TÉRMINO, y no como trozo de otro?
 *
 * Un "1" no está en "11/10": las dos cifras de "11" son un número entero, y
 * recuadrar la primera diría que se opera con un uno que no existe. Así que un
 * término que empieza o acaba en cifra no puede tener otra cifra pegada por ese
 * lado —ni una coma o un punto decimal que la continúe—. Es la misma regla que
 * aplica el marcador, y la usa también la validación del paso: si la etiqueta
 * nombra un término que no está, la etiqueta no vale.
 */
export function posicionesDeTermino(texto: string, termino: string): number[] {
  const t = String(termino ?? "").trim();
  const s = String(texto ?? "");
  if (!t) return [];

  const posiciones: number[] = [];
  let desde = 0;
  while (desde <= s.length - t.length) {
    const donde = s.indexOf(t, desde);
    if (donde < 0) break;
    desde = donde + 1;

    const antes = s[donde - 1] ?? "";
    const antesDeAntes = s[donde - 2] ?? "";
    const despues = s[donde + t.length] ?? "";
    const despuesDeDespues = s[donde + t.length + 1] ?? "";

    if (/^\d/.test(t)) {
      if (/\d/.test(antes)) continue;
      if (/[.,]/.test(antes) && /\d/.test(antesDeAntes)) continue;
    }
    if (/\d$/.test(t)) {
      if (/\d/.test(despues)) continue;
      if (/[.,]/.test(despues) && /\d/.test(despuesDeDespues)) continue;
    }
    // Con las letras, lo mismo: la "x" de "dx" o de "max" no es la incógnita, y
    // un término que empieza por letra no puede caer dentro del nombre de una
    // macro —la "x" de `\times`—.
    if (/^[a-zA-Z]/.test(t)) {
      if (/[a-zA-Z]/.test(antes)) continue;
      if (dentroDeMacro(s, donde)) continue;
    }
    if (/[a-zA-Z]$/.test(t) && /[a-zA-Z]/.test(despues)) continue;

    posiciones.push(donde);
  }
  return posiciones;
}

/**
 * El texto tal como se compara: guiones unificados y superíndices escritos como
 * exponentes. En "3x²" el exponente 2 ESTÁ escrito —es el que baja al derivar—
 * aunque no haya un carácter "2" en la cadena.
 */
function comparable(texto: string): string {
  const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return String(texto ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => `^${[...m].map((c) => SUPER.indexOf(c)).join("")}`);
}

/** La etiqueta de un paso vale si TODOS sus términos están escritos en él. */
export function etiquetaValida(texto: string, operacion: OperacionPaso | undefined | null): boolean {
  if (!operacion || !TIPOS_OPERACION.includes(operacion.tipo)) return false;
  const terminos = (operacion.terminosFoco ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  if (terminos.length === 0) return false;
  const plano = comparable(texto);
  return terminos.every((t) => posicionesDeTermino(plano, comparable(t)).length > 0);
}

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
    // Las apariciones COMO TÉRMINO: ni el "1" de "11", ni la "x" de `\times`.
    posicionesDeTermino(miembro, termino).forEach((donde, aparicion) => {
      tramos.push({
        desde: donde,
        hasta: donde + termino.length,
        clase: claseDe(termino, aparicion),
      });
    });
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
export function escenaDePasoSemantico(
  paso: PasoSemantico,
  id: string,
  /**
   * Cómo pasar a LaTeX lo que escribe el motor, si quien llama lo sabe.
   *
   * El paso llega como lo escribe el motor —"2/6 + 3/6 = 5/6", "12 × 4"—, y
   * marcar sobre ese texto y pasárselo a KaTeX dejaría barras y aspas sueltas
   * en pantalla: la notación degradada que el cliente ya señaló una vez. Así
   * que se compone el paso Y cada término con la misma función, y se marca
   * sobre el resultado: "1/2" se busca como `\frac{1}{2}`.
   *
   * Si el paso no se puede componer —es prosa—, no se marca nada: poner un
   * recuadro en mitad de una frase compuesta como fórmula es peor que no
   * ponerlo.
   */
  componer?: (texto: string) => string | null,
): Escena | null {
  const operacion = paso.operacion;
  const texto = String(paso.latex ?? "").trim();
  if (!operacion || !texto) return null;

  const base = componer ? componer(texto) : texto;
  if (!base) return null;

  // Los términos tal como se DICEN —para la locución— y tal como se ESCRIBEN
  // en el LaTeX —para buscarlos—. Decir "\frac{1}{2}" en voz alta no ayuda.
  const dichos = (operacion.terminosFoco ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  const terminos = dichos.map((t) => (componer ? (componer(t) ?? t) : t));
  if (terminos.length === 0) return null;

  // Rojo lo que se va; azul lo que se opera. El color sale del GESTO, no del
  // tema: una cancelación se ve igual en una ecuación que en una fracción.
  const color = operacion.tipo === "cancelacion" ? "pz-marcado" : "pz-operado";

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
        return `${color} ${clase}`;
      },
    );
    piezas.push(...resultado.piezas);
    return resultado.latex;
  });

  // Ni un término encontrado: mejor no inventar un resaltado que señale al aire.
  if (piezas.length === 0) return null;

  const foco: Foco = {
    clase: color,
    piezas,
    tipo: TRAZO[operacion.tipo] ?? "caja",
    // Lo que dice el motor, que es lo que va a decir el tutor: así la voz y el
    // recuadro se encuentran.
    narracion: paso.narracion?.trim() || NARRACION[operacion.tipo](dichos),
    ...(operacion.etiqueta ? { etiqueta: operacion.etiqueta } : {}),
  };

  return {
    id,
    texto,
    latex: marcadas.join(" = "),
    // La entrada es neutra A PROPÓSITO. Si dijera lo mismo que el foco, la
    // frase del tutor empataría con las dos y la pizarra podría quedarse en la
    // entrada —sin recuadro— justo mientras se explica lo recuadrado.
    narracion: "Fíjate en este paso.",
    clase: "semantica",
    focos: [foco],
  };
}

// ── Amplificación ────────────────────────────────────────────────────────────

/**
 * Notación plana, venga como venga la línea.
 *
 * El generador escribe los pasos en texto corrido —"3/5 = (3 * 2)/(5 * 2) =
 * 6/10"—, pero puede mandarlos en LaTeX, y la multiplicación aparece con
 * asterisco, con aspa o con punto según quién la escriba. Los lectores de abajo
 * trabajan sobre UNA sola forma; traducir a ella es tarea de aquí.
 *
 * (La barra invertida va escapada: `/\frac/` no es "\frac", es un salto de
 * página seguido de "rac". Lo era, y por eso ninguna fracción en LaTeX se
 * reconocía.)
 */
function plana(texto: string): string {
  return String(texto ?? "")
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\times|\\cdot/g, "*")
    .replace(/[×·]/g, "*")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "")
    // Paréntesis que sólo envuelven un número: "(3)/(5)" es "3/5".
    .replace(/\((\d+)\)/g, "$1");
}

/** Una fracción escrita a secas: "6/10". */
function fraccionSimple(trozo: string): { n: number; d: number } | null {
  const m = trozo.match(/^(\d{1,4})\/(\d{1,4})$/);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  return d ? { n, d } : null;
}

/** Una fracción con la multiplicación a la vista: "(3*2)/(5*2)". */
function fraccionExplicita(
  trozo: string,
): { a: number; b: number; kArriba: number; kAbajo: number } | null {
  const m = trozo.match(/^\((\d{1,4})\*(\d{1,3})\)\/\((\d{1,4})\*(\d{1,3})\)$/);
  if (!m) return null;
  const [a, kArriba, b, kAbajo] = m.slice(1).map(Number);
  return b ? { a, b, kArriba, kAbajo } : null;
}

/**
 * Lee `1/2 = 3/6` como lo que es: la misma fracción amplificada por 3.
 *
 * El salto de 1/2 a 3/6 no se ve —el cliente lo marcó en rojo sobre la
 * captura—, y para enseñarlo hace falta saber por cuánto se multiplicó. Aquí
 * sólo se leen los números; el dibujo lo compone el guion, que es quien conoce
 * las convenciones de marcado y de revelado.
 *
 * SE ADMITEN LAS TRES FORMAS EN LAS QUE LLEGA EL PASO.
 * El generador de mentira escribe "3/5 = 6/10" y el de verdad escribe
 * "3/5 = (3 * 2)/(5 * 2) = 6/10". Leyendo sólo la primera, la lección de
 * fracciones que el cliente tenía delante no producía NI UNA escena: el panel
 * animado no se montaba y en pantalla quedaba la tarjeta de siempre, estática.
 * Por eso se leen las tres —con el producto delante, detrás o sin él— y todas
 * acaban en la misma escena.
 *
 * Se exige que sea la MISMA fracción y que el factor sea entero: "1/2 = 2/5" no
 * es una amplificación, es un error, y no se le va a poner un adorno encima.
 */
export function leerAmplificacion(
  texto: string,
): { a: number; b: number; c: number; d: number; factor: number } | null {
  const partes = plana(texto).split("=");
  if (partes.length < 2 || partes.length > 3) return null;

  const origen = fraccionSimple(partes[0]);
  if (!origen || !origen.n) return null;

  // El producto, esté en medio o al final. Es lo que fija el factor sin tener
  // que deducirlo: si está escrito, se cree lo escrito.
  const explicita = partes.slice(1).map(fraccionExplicita).find(Boolean) ?? null;

  // El último trozo es el destino, salvo que la línea acabe en el propio
  // producto ("3/5 = (3*2)/(5*2)"), que también es un paso completo.
  const destino = fraccionSimple(partes[partes.length - 1]);
  if (!destino && !(partes.length === 2 && explicita)) return null;

  let factor: number;
  if (explicita) {
    // Multiplicar arriba por uno y abajo por otro NO conserva la fracción.
    if (explicita.kArriba !== explicita.kAbajo) return null;
    if (explicita.a !== origen.n || explicita.b !== origen.d) return null;
    factor = explicita.kArriba;
  } else {
    factor = (destino as { n: number; d: number }).d / origen.d;
  }

  if (!Number.isInteger(factor) || factor < 2) return null;

  const c = origen.n * factor;
  const d = origen.d * factor;

  // Si el paso dice a dónde llega, tiene que llegar ahí. Un "1/2 = (1*3)/(2*3)
  // = 3/7" está mal y se deja pasar sin adornar: la pizarra no firma cuentas
  // que no salen.
  if (destino && (destino.n !== c || destino.d !== d)) return null;

  return { a: origen.n, b: origen.d, c, d, factor };
}

// ── Suma de fracciones con el mismo denominador ──────────────────────────────

/**
 * Lee `6/10 + 5/10 = (6 + 5)/10 = 11/10`: el paso en el que ya se opera.
 *
 * Es la otra mitad de la lección de fracciones, y tampoco se animaba. Después
 * de igualar los denominadores queda sumar los de arriba y dejar el de abajo
 * quieto —que es LA regla—, y en pantalla eso era una línea más de la tarjeta
 * de desarrollo, sin un solo resaltado.
 *
 * Se admiten las mismas variantes: con el paréntesis explícito o sin él.
 */
export function leerSumaDeFracciones(texto: string): {
  n1: number;
  n2: number;
  d: number;
  operador: "+" | "-";
  total: number;
} | null {
  const partes = plana(texto).split("=");
  if (partes.length < 2 || partes.length > 3) return null;

  const m = partes[0].match(/^(\d{1,4})\/(\d{1,4})([+-])(\d{1,4})\/(\d{1,4})$/);
  if (!m) return null;

  const n1 = Number(m[1]);
  const d1 = Number(m[2]);
  const operador = m[3] as "+" | "-";
  const n2 = Number(m[4]);
  const d2 = Number(m[5]);
  // Con denominadores distintos no se puede sumar todavía: ése es otro paso, y
  // pintarlo como si estuviera hecho enseñaría justo lo contrario de la regla.
  if (!d1 || d1 !== d2) return null;

  const total = operador === "+" ? n1 + n2 : n1 - n2;
  if (total < 0) return null;

  // El paréntesis del medio, si viene, tiene que decir lo mismo.
  const medio = partes.length === 3 ? partes[1] : null;
  if (medio) {
    const e = medio.match(/^\((\d{1,4})([+-])(\d{1,4})\)\/(\d{1,4})$/);
    if (!e) return null;
    if (Number(e[1]) !== n1 || e[2] !== operador || Number(e[3]) !== n2 || Number(e[4]) !== d1) {
      return null;
    }
  }

  const ultima = fraccionSimple(partes[partes.length - 1]);
  if (!ultima) return null;
  if (ultima.n !== total || ultima.d !== d1) return null;

  return { n1, n2, d: d1, operador, total };
}
