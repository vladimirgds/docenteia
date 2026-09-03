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
