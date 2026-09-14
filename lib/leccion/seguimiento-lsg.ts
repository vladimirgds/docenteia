// Con extensión explícita: este módulo lo importa también la suite de qa/, que
// se ejecuta con Node a secas y exige la extensión en los imports relativos.
import { esFaseDeConcepto, esFaseDeReglas } from "./fases.ts";
import { expresionPrincipal } from "../matematicas/index.ts";

/**
 * Cómo hay que presentar la respuesta a un seguimiento.
 *
 * El servidor responde tres cosas distintas según lo que pulse el alumno, y
 * confundirlas fue lo que dejó la pizarra descuadrada:
 *
 *   ACLARACIÓN      · unas pocas directivas sueltas. Se añade a lo que hay,
 *                     sin tocar la fase: el alumno sigue con su ejercicio.
 *   EJERCICIO NUEVO · sin módulos ("más difícil"). Es otro ejercicio dentro de
 *                     la MISMA fase: hay que sustituir lo que hubiera, o el
 *                     enunciado anterior se queda arriba y el nuevo aparece
 *                     abajo, como si fueran el mismo.
 *   LECCIÓN NUEVA   · con módulos ("dame otro ejemplo"). Es una lección
 *                     completa: se reinicia la pizarra, pero empezando por el
 *                     ejemplo y no por el concepto, que el alumno ya vio.
 */
export type PresentacionSeguimiento = "anexar" | "sustituir" | "reiniciar";

export interface Modulo {
  id?: string;
  directivas?: unknown[];
}

export interface LSGConModulos {
  modulos?: Modulo[];
  directivas?: unknown[];
  [clave: string]: unknown;
}

/**
 * Enunciado de cada fase, leído de la lección antes de reproducirla.
 *
 * El motor narra primero y escribe después: en la práctica dice "Vamos a
 * derivar 3x⁴ - 2x²" durante varios segundos y sólo al terminar emite la
 * directiva que lo escribe en la pizarra. Como la locución ya no se vuelca al
 * lienzo, éste se quedaba en blanco todo ese rato.
 *
 * El enunciado es la PRIMERA expresión que la fase escribe, y se conoce desde
 * que llega la lección: adelantarlo permite pintar la tarjeta en cuanto se
 * entra en la fase, sin depender de la cola de voz.
 */
export function enunciadosDeLeccion(lsg: LSGConModulos | null | undefined): Map<string, string> {
  const porFase = new Map<string, string>();
  if (!Array.isArray(lsg?.modulos)) return porFase;

  for (const modulo of lsg.modulos) {
    const id = String(modulo?.id ?? "");
    if (!id) continue;
    const directivas = (
      Array.isArray(modulo?.directivas) ? modulo.directivas : []
    ) as Array<{ tipo?: string; contenido?: string }>;

    // Lo normal: el enunciado es la primera pizarra de la fase.
    const escrita = directivas.find(
      (d) => d?.tipo === "pizarra" && String(d.contenido ?? "").trim(),
    );
    if (escrita) {
      porFase.set(id, String(escrita.contenido).trim());
      continue;
    }

    // Pero el motor no siempre lo escribe. Cuando la lección la redacta el
    // modelo en vivo, hay fases que sólo lo NARRAN ("vamos a derivar
    // 3x⁴ - 2x²") o lo dejan dentro de la pregunta al alumno. Como la prosa
    // no sube al lienzo, la pizarra se quedaba vacía toda la fase teniendo el
    // ejercicio delante. Se rescata la expresión y se descarta la prosa.
    for (const d of directivas) {
      if (d?.tipo !== "hablar" && d?.tipo !== "preguntar") continue;
      const formula = expresionPrincipal(String(d.contenido ?? ""));
      if (formula) {
        porFase.set(id, formula);
        break;
      }
    }
  }
  return porFase;
}

/**
 * ¿Es una línea que se le PIDE resolver al alumno?
 *
 * El motor escribe así el ejercicio de práctica —"19 + 45 = ?", "3/5 + 1/2 =
 * ?"—, distinto de los pasos de un desarrollo, que llevan su resultado. Es la
 * marca de que empieza OTRO ejercicio, y la tarjeta tiene que pasar a él.
 */
export function esEnunciadoParaResolver(texto: string): boolean {
  return /=\s*[?¿]\s*$/.test(String(texto ?? "").trim());
}

/** Decide cómo presentar una respuesta del servidor. */
export function presentacionDe(
  lsg: LSGConModulos | null | undefined,
  opciones: { esSeguimiento: boolean; soloExplicacion?: boolean },
): PresentacionSeguimiento {
  if (!opciones.esSeguimiento) return "reiniciar";
  if (opciones.soloExplicacion) return "anexar";
  return Array.isArray(lsg?.modulos) && lsg.modulos.length > 0 ? "reiniciar" : "sustituir";
}

/**
 * Recorta una lección de seguimiento para que empiece por el ejemplo.
 *
 * Cuando el alumno pide "otro ejemplo", el motor devuelve la lección entera:
 * concepto, reglas, ejemplo y práctica, con el concepto y las reglas
 * IDÉNTICOS a los que acaba de ver. Reproducirlos otra vez lo devuelve al
 * principio y le hace oír dos veces lo mismo.
 *
 * Se quedan fuera las fases de concepto y reglas, y sólo cuando queda algo
 * después: si el recorte dejara la lección vacía, se devuelve entera, porque
 * es preferible repetir una fase que no mostrar nada.
 */
export function recortarParaSeguimiento<T extends LSGConModulos>(lsg: T): T {
  if (!Array.isArray(lsg?.modulos) || lsg.modulos.length === 0) return lsg;

  const utiles = lsg.modulos.filter((m) => {
    const id = String(m?.id ?? "");
    return !esFaseDeConcepto(id) && !esFaseDeReglas(id);
  });

  if (utiles.length === 0) return lsg;
  return { ...lsg, modulos: utiles };
}

/**
 * Qué enunciado debe quedar en la tarjeta de EJERCICIO tras una petición.
 *
 * Toda petición vacía el desarrollo, y ahí es donde la pizarra se quedaba en
 * blanco al pulsar "Explicar regla": si la tarjeta de arriba todavía no tenía
 * enunciado —porque el alumno pulsó mientras el tutor narraba—, el vaciado
 * dejaba la escena sin nada y la aclaración, que es prosa, va al subtítulo y no
 * al lienzo. Resultado: fase abierta, pizarra vacía y nada que la rellenara.
 *
 * El orden de preferencia importa. Manda el enunciado DE ESTA FASE, no el
 * ejercicio activo de la conversación: el activo es el de la práctica, y usarlo
 * en la fase de ejemplo cambiaría el enunciado por otro que el alumno no está
 * viendo. Sólo cuando la fase no declara el suyo se recurre al activo, y si no
 * hay ninguno se conserva el que hubiera.
 */
export function enunciadoTrasPeticion(opciones: {
  /** El que está pintado ahora mismo, si lo hay. */
  enTarjeta: string | null;
  /** El que declara esta fase, leído de la lección al recibirla. */
  deLaFase?: string | null;
  /** El que el alumno tiene entre manos según la conversación. */
  activo?: string | null;
  /** Falso en Concepto y Reglas, que no plantean ejercicio. */
  planteaEjercicio: boolean;
}): string | null {
  if (!opciones.planteaEjercicio) return opciones.enTarjeta;
  const objetivo = opciones.deLaFase || opciones.activo || null;
  return objetivo ?? opciones.enTarjeta;
}

/**
 * DESPUÉS DE EXPLICAR, SE VUELVE AL EJERCICIO.
 *
 * El alumno está ante "¿Cuánto es 3/5 + 1/2?" y pulsa "No entendí este paso".
 * La explicación sustituye a la lección, y la pregunta se perdía con ella: el
 * tutor explicaba —deteniéndose antes del resultado, para no resolverle el
 * ejercicio— y terminaba con "¡Lección completada!". El cliente lo vio así: el
 * desarrollo cortado en "6/10 + 5/10" y la lección dada por acabada sin que el
 * alumno hubiera contestado.
 *
 * Aquí la explicación se cierra devolviéndole la pregunta pendiente, con su
 * respuesta esperada: se corrige igual que antes, y sólo al acertarla termina
 * la lección —y entonces se completa el desarrollo—.
 */
export function conPreguntaPendiente<T extends LSGConModulos>(
  lsg: T,
  pregunta: { tipo?: string; texto?: string } | null | undefined,
): T {
  if (!lsg || typeof lsg !== "object" || !pregunta?.texto) return lsg;
  const vuelta = [{ tipo: "hablar", texto: "Ahora inténtalo tú." }, { ...pregunta, tipo: "preguntar" }];

  if (Array.isArray(lsg.modulos) && lsg.modulos.length > 0) {
    const modulos = lsg.modulos.map((m) => ({ ...m, directivas: [...(m?.directivas ?? [])] }));
    const ultimo = modulos[modulos.length - 1];
    ultimo.directivas = [...(ultimo.directivas ?? []), ...vuelta];
    return { ...lsg, modulos } as T;
  }
  return { ...lsg, directivas: [...(Array.isArray(lsg.directivas) ? lsg.directivas : []), ...vuelta] } as T;
}

/**
 * LO QUE QUEDABA DE LA LECCIÓN cuando el alumno pidió ayuda.
 *
 * El reproductor aplana la lección en una línea de tiempo con un marcador
 * `{ tipo: "modulo", id }` al empezar cada fase. A partir de la posición en la
 * que se pulsó el botón se separan dos cosas:
 *
 *   · `mismaFase`: lo que venía DESPUÉS de la posición actual sin salir de la
 *     fase. Sólo se usa cuando el alumno estaba ante una pregunta —se le
 *     devuelve la pregunta y luego sigue lo que hubiera detrás—; si estaba en
 *     mitad de un ejemplo, el desglose ya lo cuenta entero y no se repite.
 *   · `siguientes`: las fases que aún no se habían abierto, enteras.
 */
export function restoDeLeccion(
  timeline: ReadonlyArray<{ tipo?: string; id?: string } & Record<string, unknown>>,
  indice: number,
): { mismaFase: unknown[]; siguientes: Modulo[] } {
  const lista = Array.isArray(timeline) ? timeline : [];
  const desde = Math.max(0, Math.min(Math.round(Number(indice) || 0), lista.length));
  const mismaFase: unknown[] = [];
  const siguientes: Modulo[] = [];
  let k = desde + 1;
  for (; k < lista.length && lista[k]?.tipo !== "modulo"; k++) mismaFase.push(lista[k]);
  for (; k < lista.length; k++) {
    const d = lista[k];
    if (d?.tipo === "modulo") siguientes.push({ id: String(d.id ?? ""), directivas: [] });
    else siguientes[siguientes.length - 1]?.directivas?.push(d);
  }
  return { mismaFase, siguientes: siguientes.filter((m) => m.id && (m.directivas?.length ?? 0) > 0) };
}

/**
 * «NO ENTENDÍ ESTE PASO» Y DESPUÉS, DE VUELTA AL EJERCICIO.
 *
 * El cliente lo pidió con estas palabras: el botón debe "ofrecer un andamiaje
 * auxiliar o explicación desglosada del paso exacto donde el alumno tuvo la
 * duda, y luego retomar el ejercicio original, no reiniciar la sesión con otra
 * cuenta sin permitirle terminar la que estaba trabajando". Antes la explicación
 * SUSTITUÍA a la lección: al acabar decía "¡Lección completada!" aunque faltara
 * la práctica entera.
 *
 * Aquí la explicación ocupa la fase en la que está el alumno y detrás se vuelve
 * a poner lo que quedaba: la pregunta que tenía delante —si la había— con lo que
 * viniera después en esa fase, y las fases que aún no se habían abierto. La
 * aclaración pierde su propia estructura de módulos: es una explicación dentro
 * de la fase, no una lección nueva que abra otras.
 */
export function reanudarTrasAclaracion<T extends LSGConModulos>(
  aclaracion: T,
  opciones: {
    faseActual: string;
    pregunta?: { tipo?: string; texto?: string } | null;
    mismaFase?: unknown[];
    siguientes?: Modulo[];
  },
): T {
  const propias = [
    ...(Array.isArray(aclaracion?.directivas) ? aclaracion.directivas : []),
    ...(Array.isArray(aclaracion?.modulos) ? aclaracion.modulos.flatMap((m) => m?.directivas ?? []) : []),
  ].filter((d) => (d as { tipo?: string })?.tipo !== "preguntar");
  const siguientes = (opciones.siguientes ?? []).filter((m) => (m?.directivas?.length ?? 0) > 0);
  const vuelta: unknown[] = opciones.pregunta?.texto
    ? [
        { tipo: "hablar", texto: "Ahora inténtalo tú." },
        { ...opciones.pregunta, tipo: "preguntar" },
        ...(opciones.mismaFase ?? []),
      ]
    : siguientes.length > 0
      ? [{ tipo: "hablar", texto: "Ahora que lo tienes claro, seguimos con la clase." }]
      : [];
  const copia: LSGConModulos = { ...(aclaracion ?? {}) };
  delete copia.directivas;
  copia.modulos = [
    { id: opciones.faseActual || "leccion", directivas: [...propias, ...vuelta] },
    ...siguientes,
  ];
  return copia as T;
}

/**
 * LOS ENUNCIADOS QUE SE LE PIDEN AL ALUMNO: la última línea escrita antes de
 * cada pregunta de la lección.
 *
 * Sirven para no animarlos. La pizarra animada deduce el gesto de cualquier
 * línea, y el enunciado de la práctica —"2(x + 4) = 3x − 1"— se dejaba repartir
 * solo: la propia pregunta del tutor ("¿cuánto vale x en 2(x + 4) = 3x − 1?")
 * comparte cifras con el primer foco y lo encendía, así que la pizarra hacía el
 * primer paso del ejercicio que tenía que resolver el alumno —y la tarjeta de
 * arriba ya enseñaba "= 2x + 8"—. El cliente lo fotografió en Ecuaciones.
 */
export function enunciadosParaResolver(lsg: LSGConModulos | null | undefined): Set<string> {
  const conjunto = new Set<string>();
  const listas = Array.isArray(lsg?.modulos)
    ? lsg.modulos.map((m) => (Array.isArray(m?.directivas) ? m.directivas : []))
    : [Array.isArray(lsg?.directivas) ? lsg.directivas : []];
  for (const lista of listas) {
    let ultima: string | null = null;
    for (const d of lista as Array<{ tipo?: string; contenido?: string }>) {
      if (d?.tipo === "pizarra" && String(d.contenido ?? "").trim()) ultima = String(d.contenido).trim();
      else if (d?.tipo === "preguntar" && ultima) conjunto.add(ultima);
    }
  }
  return conjunto;
}

/**
 * Quita las preguntas de una ACLARACIÓN.
 *
 * El alumno está resolviendo un ejercicio y pulsa "Explicar regla": quiere que
 * le expliquen, no que le pregunten otra cosa. La aclaración llegaba con su
 * propia pregunta —"¿Entendiste la explicación?"— que ocupaba la caja de
 * respuesta y le quitaba de delante el ejercicio que estaba haciendo.
 *
 * La explicación se cuenta con la voz y con la pizarra, y el alumno sigue con
 * lo suyo. Se recorren también los módulos, porque una aclaración puede venir
 * con ellos.
 */
export function sinPreguntas<T extends LSGConModulos>(lsg: T): T {
  if (!lsg || typeof lsg !== "object") return lsg;

  const limpiar = (directivas: unknown): unknown[] =>
    Array.isArray(directivas)
      ? directivas.filter((d) => (d as { tipo?: string })?.tipo !== "preguntar")
      : [];

  const copia: LSGConModulos = { ...lsg };
  if (Array.isArray(lsg.directivas)) copia.directivas = limpiar(lsg.directivas);
  if (Array.isArray(lsg.modulos)) {
    copia.modulos = lsg.modulos.map((m) => ({ ...m, directivas: limpiar(m?.directivas) }));
  }
  return copia as T;
}
