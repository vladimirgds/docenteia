/**
 * PMV 3 · HITO 5A (ampliación) — La ficha de método dentro de una tarea evaluable.
 *
 * Al asignar, la ruta de tareas guarda una COPIA CONGELADA de la versión
 * publicada de la ficha (`Tarea.fichaContenido`). Al corregir, esa copia sirve
 * para dos cosas:
 *
 *  1. Elegir una PISTA DE ERROR concreta (factor omitido, respuesta errónea
 *     típica) cuando el alumno falla, sin revelar la respuesta.
 *  2. Dar el veredicto cuando el corrector general no sabe decidir y la ficha
 *     sí (el motor de la ficha ya verificó el método antes de publicarse).
 *
 * La nota la sigue calculando el servidor con las reglas de siempre: la ficha
 * nunca cambia un veredicto que el corrector general sí sabe dar.
 */
import { fichaSchema, type Ficha } from "./fichas-metodo.ts";
import { revisarRespuesta } from "./fichas-verificar.ts";

/** La copia congelada, validada otra vez: si no pasa Zod, la tarea se corrige sin ficha. */
export function fichaCongelada(contenido: unknown): Ficha | null {
  if (contenido === null || contenido === undefined) return null;
  const r = fichaSchema.safeParse(contenido);
  return r.success ? r.data : null;
}

/**
 * Las formas de leer el enunciado como «el problema»: tal cual, lo que va tras
 * los dos puntos, tras `f(x) =` / `y =`, o sin las palabras de la consigna
 * («Deriva (3x^2+1)^4»).
 */
export function candidatosDelEnunciado(enunciado: string): string[] {
  const t = enunciado.trim();
  const c = new Set<string>([t]);
  const dosPuntos = t.lastIndexOf(":");
  if (dosPuntos >= 0) c.add(t.slice(dosPuntos + 1).trim());
  const funcion = /(?:^|\s)(?:[a-z]\s*\(\s*x\s*\)|y)\s*=\s*(.+)$/i.exec(t);
  if (funcion) c.add(funcion[1].trim());
  const sinConsigna = /^[\p{L}\s,.¿?]+?\s+(?=[(\d\-x])(.+)$/u.exec(t);
  if (sinConsigna) c.add(sinConsigna[1].trim());
  return [...c].filter((x) => x.length > 0 && x.length <= 200);
}

export interface RevisionConFicha {
  aplica: boolean;
  /** `null` si la ficha no puede decidir. */
  correcta: boolean | null;
  /** Sólo pistas de ERROR concreto: las generales ya las da el tutor. Nunca la respuesta. */
  pista: string | null;
}

export function revisarConFichaDeTarea(ficha: Ficha, enunciado: string, respuesta: string): RevisionConFicha {
  for (const problema of candidatosDelEnunciado(enunciado)) {
    const r = revisarRespuesta(ficha, problema, respuesta);
    if (!r.aplica) continue;
    return { aplica: true, correcta: r.correcta, pista: r.pista?.tipo === "error" ? r.pista.texto : null };
  }
  return { aplica: false, correcta: null, pista: null };
}
