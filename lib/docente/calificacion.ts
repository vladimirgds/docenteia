/**
 * CALIFICACIÓN EN SERVIDOR (PMV 3 · HITO 1).
 *
 * Funciones PURAS —sin base de datos ni red— para que se puedan probar solas y
 * para que Node las cargue tal cual en las baterías de `qa/`. Aquí vive la regla
 * de la nota: el navegador no interviene en ella.
 *
 * Regla del piloto (acordada con el cliente): todos los ejercicios pesan lo
 * mismo, no hay crédito parcial, y la nota de la tarea es la del ÚLTIMO intento.
 * `Tarea.reglaCalificacion` la deja escrita al asignar; hoy sólo se admite esa.
 */

/** Una regla de calificación tal como se guarda en `Tarea.reglaCalificacion`. */
export interface ReglaCalificacion {
  pesos: "IGUALES";
  creditoParcial: false;
  nota: "ULTIMO_INTENTO";
  escala: number;
}

/** La rúbrica de un ejercicio congelado (`TareaEjercicio.rubrica`). */
export interface Rubrica {
  puntos: number;
  creditoParcial: false;
  criterio: "EQUIVALENCIA";
}

export const REGLA_DEL_PILOTO: ReglaCalificacion = {
  pesos: "IGUALES",
  creditoParcial: false,
  nota: "ULTIMO_INTENTO",
  escala: 100,
};

export const RUBRICA_DEL_PILOTO: Rubrica = {
  puntos: 1,
  creditoParcial: false,
  criterio: "EQUIVALENCIA",
};

/** Un ejercicio congelado con lo mínimo que hace falta para puntuarlo. */
export interface EjercicioPuntuable {
  id: string;
  rubrica: unknown;
}

/** El veredicto del servidor sobre la última respuesta a un ejercicio congelado. */
export interface RespuestaCorregida {
  tareaEjercicioId: string;
  /** `null`: el motor no supo corregirla. */
  correcto: boolean | null;
}

/** Los puntos de la rúbrica, saneados: un valor raro nunca da una nota rara. */
export function puntosDe(rubrica: unknown): number {
  const p = (rubrica as { puntos?: unknown } | null)?.puntos;
  return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : 1;
}

export interface Nota {
  /** Sobre la escala de la regla (100), redondeada al entero. */
  puntaje: number;
  aciertos: number;
  total: number;
  /** Ejercicios sin respuesta o que el motor no supo corregir: cuentan 0. */
  sinResolver: number;
}

/**
 * La nota de UN intento: Σ puntos de los ejercicios acertados ÷ Σ puntos de
 * todos, sobre la escala. Sin crédito parcial: acierta o no acierta. Lo que no
 * se respondió, o que el motor no supo corregir, no suma.
 *
 * Con una tarea sin ejercicios la nota es 0 (no hay nada que acertar).
 */
export function calcularNota(
  ejercicios: EjercicioPuntuable[],
  respuestas: RespuestaCorregida[],
  escala = REGLA_DEL_PILOTO.escala,
): Nota {
  const porEjercicio = new Map(respuestas.map((r) => [r.tareaEjercicioId, r.correcto]));
  let obtenidos = 0;
  let posibles = 0;
  let aciertos = 0;
  let sinResolver = 0;
  for (const e of ejercicios) {
    const puntos = puntosDe(e.rubrica);
    posibles += puntos;
    if (porEjercicio.get(e.id) === true) {
      obtenidos += puntos;
      aciertos += 1;
    } else if (!porEjercicio.has(e.id) || porEjercicio.get(e.id) === null) {
      sinResolver += 1;
    }
  }
  const puntaje = posibles > 0 ? Math.round((obtenidos / posibles) * escala) : 0;
  return { puntaje, aciertos, total: ejercicios.length, sinResolver };
}

/** ¿Cambió el CONTENIDO de un ejercicio? Es lo que decide si sube su versión. */
export function cambioDeContenido(
  antes: { enunciado: string; respuestaCorrecta: string; pistas: string[] },
  despues: { enunciado: string; respuestaCorrecta: string; pistas: string[] },
): boolean {
  return (
    antes.enunciado !== despues.enunciado ||
    antes.respuestaCorrecta !== despues.respuestaCorrecta ||
    antes.pistas.length !== despues.pistas.length ||
    antes.pistas.some((p, i) => p !== despues.pistas[i])
  );
}
