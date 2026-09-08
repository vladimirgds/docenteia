/**
 * Temas que tienen diagrama en la fase de Concepto.
 *
 * Vive en `lib/` y no dentro del componente para que la suite pueda consultarlo
 * sin montar React: la comprobación de que ninguna fase queda en blanco cuenta
 * con el diagrama, y si la lista estuviera duplicada podrían desincronizarse y
 * la prueba daría por bueno un concepto vacío.
 */
export const TEMAS_CON_DIAGRAMA = [
  "ARITMETICA",
  "DERIVADAS",
  "FRACCIONES",
  "ECUACIONES_LINEALES",
] as const;

export function tieneDiagrama(tema: string): boolean {
  return (TEMAS_CON_DIAGRAMA as readonly string[]).includes(tema);
}

/**
 * Geometría de las etiquetas de los diagramas.
 *
 * Vive aquí, y no suelta dentro del SVG, por un motivo concreto: la etiqueta
 * "pendiente = 2" se escribía anclada por la izquierda a cuatro unidades del
 * borde derecho, así que el texto se salía del lienzo y el navegador lo
 * recortaba a "pendie". Un fallo invisible para cualquier prueba de
 * comportamiento —el componente monta, el SVG existe, no hay error— y que sólo
 * se ve mirando el dibujo.
 *
 * Con las posiciones como datos, la suite puede calcular la caja de cada texto
 * y exigir que quepa entera. El componente pinta exactamente estos números, de
 * modo que lo que se comprueba es lo que se dibuja.
 */
export type AnclajeEtiqueta = "start" | "middle" | "end";

/** Tono visual de la etiqueta; el componente lo traduce a clases de Tailwind. */
export type TonoEtiqueta = "acento" | "tenue" | "normal";

export interface EtiquetaDiagrama {
  texto: string;
  x: number;
  y: number;
  anclaje: AnclajeEtiqueta;
  /** Tamaño de fuente en unidades del viewBox. */
  tamano: number;
  tono: TonoEtiqueta;
}

export interface GeometriaDiagrama {
  ancho: number;
  alto: number;
  etiquetas: EtiquetaDiagrama[];
  /**
   * Medidas del dibujo de una fracción concreta, cuando el diagrama es ése.
   *
   * Se calculan junto a las etiquetas —y no dentro del componente— para que la
   * suite pueda comprobar sin navegador que las celdas caben en el lienzo sea
   * cual sea el denominador.
   */
  fraccion?: {
    tomadas: number;
    partes: number;
    margen: number;
    celda: number;
    centroPrimera: number;
  };
}

/**
 * Ancho de un carácter como proporción del tamaño de fuente.
 *
 * Generoso a propósito: la fuente real es de ancho variable y la mayoría de
 * letras ocupan menos, pero al estimar por lo alto una etiqueta que pasa la
 * comprobación cabe también con fuentes más anchas que la del navegador de
 * turno.
 */
export const ANCHO_CARACTER = 0.62;

/** Holgura mínima entre el texto y el borde del lienzo, en unidades del viewBox. */
export const MARGEN_ETIQUETA = 4;

/** Extremos horizontales que ocupará la etiqueta al dibujarse. */
export function cajaDeEtiqueta(e: EtiquetaDiagrama): { izquierda: number; derecha: number } {
  const ancho = e.texto.length * e.tamano * ANCHO_CARACTER;
  if (e.anclaje === "end") return { izquierda: e.x - ancho, derecha: e.x };
  if (e.anclaje === "middle") return { izquierda: e.x - ancho / 2, derecha: e.x + ancho / 2 };
  return { izquierda: e.x, derecha: e.x + ancho };
}

/** ¿La etiqueta cabe entera dentro del lienzo, con holgura? */
export function etiquetaCabe(e: EtiquetaDiagrama, g: GeometriaDiagrama): boolean {
  const { izquierda, derecha } = cajaDeEtiqueta(e);
  const dentroEnHorizontal = izquierda >= MARGEN_ETIQUETA && derecha <= g.ancho - MARGEN_ETIQUETA;
  // `y` es la línea base: por arriba sube el tamaño de la fuente y por abajo
  // baja el rasgo descendente de las letras con cola (p, g, q).
  const dentroEnVertical = e.y - e.tamano >= 0 && e.y + e.tamano * 0.25 <= g.alto;
  return dentroEnHorizontal && dentroEnVertical;
}

/**
 * El pie del diagrama de derivadas dice la pendiente con todas las letras, y
 * dice DÓNDE.
 *
 * La derivada de y = x² no vale 2: vale 2 EN x = 1. Sin nombrar el punto, el
 * número parece sacado de la nada, y en la fase que introduce el concepto eso
 * es justo lo contrario de lo que hay que enseñar. El punto se nombra dos
 * veces: junto al punto de tangencia, sobre el dibujo, y en el pie.
 *
 * El pie va centrado abajo, como en los otros dos diagramas: es la única banda
 * del lienzo libre de curva, tangente y ejes, así que la frase cabe entera sin
 * pisar el dibujo. A nueve unidades no cabía; a ocho, sí, y la suite lo
 * comprueba.
 */
export const GEOMETRIA_DERIVADAS: GeometriaDiagrama = {
  ancho: 240,
  alto: 155,
  etiquetas: [
    { texto: "En x = 1, la pendiente de la tangente es 2", x: 120, y: 148, anclaje: "middle", tamano: 8, tono: "acento" },
    { texto: "x = 1", x: 176, y: 116, anclaje: "start", tamano: 8, tono: "acento" },
    { texto: "y = x²", x: 126, y: 24, anclaje: "start", tamano: 9, tono: "tenue" },
  ],
};

/**
 * El todo dividido en partes, con las dos palabras señaladas.
 *
 * Lo pidió el cliente: mientras el tutor explica qué es el numerador y qué el
 * denominador, la pizarra enseñaba una barra con una celda azul y ninguna
 * indicación de cuál es cuál. Un dibujo que no dice qué señala no enseña; el
 * alumno tiene que atar cada palabra a una parte del dibujo.
 */
export const GEOMETRIA_FRACCIONES: GeometriaDiagrama = geometriaDeFraccion(1, 4);

/**
 * La geometría del dibujo de una fracción CONCRETA.
 *
 * Antes el dibujo era fijo: cuatro barras con una sombreada, dijera lo que
 * dijera el tutor. Si la lección explicaba 2/6, el alumno oía una cosa y veía
 * otra. Ahora el dibujo se construye con el numerador y el denominador de los
 * que se está hablando, y las leyendas dicen sus números.
 *
 * El ancho del lienzo es fijo (240) y las celdas se reparten dentro, así que
 * vale para 2 partes o para 10 sin salirse ni deformarse.
 */
export function geometriaDeFraccion(
  numerador: number,
  denominador: number,
  etiquetas?: { numerador?: string; denominador?: string },
): GeometriaDiagrama {
  const partes = Math.min(12, Math.max(1, Math.round(denominador) || 1));
  const tomadas = Math.min(partes, Math.max(0, Math.round(numerador) || 0));
  const ancho = 240;
  const margen = 20;
  const celda = (ancho - margen * 2) / partes;

  // La flecha del numerador cae sobre la primera celda tomada; si no se toma
  // ninguna, sobre la primera, que es donde el tutor señalaría.
  const centroPrimera = margen + celda / 2;

  return {
    ancho,
    alto: 132,
    etiquetas: [
      {
        texto: etiquetas?.numerador ?? `numerador: ${tomadas} (lo que tomamos)`,
        x: margen,
        y: 12,
        anclaje: "start",
        tamano: 9,
        tono: "acento",
      },
      {
        texto: etiquetas?.denominador ?? `denominador: ${partes} (partes iguales del todo)`,
        x: ancho / 2,
        y: 104,
        anclaje: "middle",
        tamano: 9,
        tono: "acento",
      },
      {
        texto: `${tomadas} de ${partes} partes iguales`,
        x: ancho / 2,
        y: 124,
        anclaje: "middle",
        tamano: 10,
        tono: "tenue",
      },
    ],
    // Lo que el componente necesita para dibujar, ya calculado aquí: la suite
    // comprueba que ninguna celda se sale del lienzo sin montar React.
    fraccion: { tomadas, partes, margen, celda, centroPrimera },
  };
}

/**
 * La fracción de la que habla una línea de la lección: "2/6", "1/4"...
 *
 * Se lee la PRIMERA que aparezca y sólo si es representable —hasta doce partes,
 * y sin pasarse del todo—; con "18/45" el dibujo no enseñaría nada.
 */
export function fraccionEnTexto(texto: string): { numerador: number; denominador: number } | null {
  for (const [, a, b] of String(texto ?? "").matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})/g)) {
    const numerador = Number(a);
    const denominador = Number(b);
    if (denominador >= 2 && denominador <= 12 && numerador >= 0 && numerador <= denominador) {
      return { numerador, denominador };
    }
  }
  return null;
}

export const GEOMETRIA_LINEALES: GeometriaDiagrama = {
  ancho: 240,
  alto: 110,
  etiquetas: [
    { texto: "2x + 5", x: 40, y: 47, anclaje: "middle", tamano: 10, tono: "normal" },
    { texto: "15", x: 200, y: 47, anclaje: "middle", tamano: 10, tono: "normal" },
    { texto: "lo que hagas a un lado, hazlo al otro", x: 120, y: 106, anclaje: "middle", tamano: 9, tono: "tenue" },
  ],
};

/**
 * Juntar dos grupos: la idea de suma, y de dónde sale la llevada.
 *
 * Aritmética era el único tema sin dibujo, y su fase de Concepto se quedaba con
 * una línea de texto en medio del lienzo: es el "recuadro en blanco" que
 * reportó el cliente. Aquí el alumno ve lo que significa sumar antes de que le
 * expliquen cómo se coloca en columna.
 */
export const GEOMETRIA_ARITMETICA: GeometriaDiagrama = {
  ancho: 240,
  alto: 118,
  etiquetas: [
    { texto: "3", x: 46, y: 20, anclaje: "middle", tamano: 11, tono: "normal" },
    { texto: "+", x: 96, y: 52, anclaje: "middle", tamano: 13, tono: "tenue" },
    { texto: "2", x: 140, y: 20, anclaje: "middle", tamano: 11, tono: "normal" },
    { texto: "5", x: 210, y: 20, anclaje: "middle", tamano: 11, tono: "acento" },
    { texto: "juntar dos cantidades da el total", x: 120, y: 110, anclaje: "middle", tamano: 9, tono: "tenue" },
  ],
};

export const GEOMETRIAS: Record<string, GeometriaDiagrama> = {
  ARITMETICA: GEOMETRIA_ARITMETICA,
  DERIVADAS: GEOMETRIA_DERIVADAS,
  FRACCIONES: GEOMETRIA_FRACCIONES,
  ECUACIONES_LINEALES: GEOMETRIA_LINEALES,
};
