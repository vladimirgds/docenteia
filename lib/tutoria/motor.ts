/**
 * TUTOR ADAPTATIVO (PMV 3 · HITO 4) — la decisión.
 *
 * Este módulo es PURO: dado en qué punto está un alumno con un ejercicio y lo que
 * acaba de pasar, decide QUÉ HACE EL TUTOR a continuación. No toca la base de
 * datos ni la red; por eso se puede probar entero y por eso la regla pedagógica
 * vive en un solo sitio, en vez de repartida entre rutas y pantallas.
 *
 * LA REGLA (del pliego del hito)
 *
 *   1. Ante un ERROR, el tutor da una PISTA —la siguiente de la escalera, de la
 *      más suave a la más concreta—.
 *   2. Si el alumno se BLOQUEA —`UMBRAL_BLOQUEO` errores seguidos en el mismo
 *      punto—, el tutor ABRE UN REPASO BREVE del concepto.
 *   3. Al cerrar el repaso, el alumno VUELVE AL PASO ORIGINAL, con el contador de
 *      errores a cero: tiene una oportunidad limpia.
 *   4. Y el tutor PROPONE UN EJERCICIO EQUIVALENTE para consolidar: después de
 *      resolver el original, o —si en el regreso vuelve a atascarse
 *      `UMBRAL_REGRESO` veces— en lugar de seguir insistiendo con el mismo.
 *
 * Nada de esto lo decide la IA: es una máquina de estados determinista.
 */

/** Errores seguidos en el mismo punto a partir de los cuales se considera un bloqueo. */
export const UMBRAL_BLOQUEO = 3;
/** Tras volver de un repaso, errores seguidos que mandan a un ejercicio equivalente. */
export const UMBRAL_REGRESO = 2;

export type Fase = "INICIAL" | "AYUDA" | "REPASO" | "REGRESO" | "EQUIVALENTE" | "RESUELTO";

export interface EstadoTutor {
  fase: Fase;
  /** Errores seguidos desde el último acierto, repaso o inicio. */
  erroresSeguidos: number;
  /** Pistas dadas hasta ahora (decide cuál es la siguiente). */
  pistasDadas: number;
  repasos: number;
  equivalentes: number;
}

export const ESTADO_INICIAL: EstadoTutor = {
  fase: "INICIAL",
  erroresSeguidos: 0,
  pistasDadas: 0,
  repasos: 0,
  equivalentes: 0,
};

export type EventoTutor =
  | { tipo: "RESPUESTA"; correcta: boolean }
  | { tipo: "PISTA_PEDIDA" }
  | { tipo: "REPASO_CERRADO" };

export type AccionTutor =
  /** Todo bien: sigue. */
  | { tipo: "CONTINUAR" }
  /** Da la pista número `nivel` (0 = la más suave). */
  | { tipo: "PISTA"; nivel: number }
  /** Se ha bloqueado: abre un repaso breve. */
  | { tipo: "ABRIR_REPASO" }
  /** Repaso cerrado: vuelve al paso original. */
  | { tipo: "VOLVER_AL_PASO" }
  /** Propón un ejercicio equivalente. */
  | { tipo: "PROPONER_EQUIVALENTE" };

export interface Decision {
  estado: EstadoTutor;
  accion: AccionTutor;
}

export function decidir(actual: EstadoTutor, evento: EventoTutor): Decision {
  const e: EstadoTutor = { ...actual };

  switch (evento.tipo) {
    case "PISTA_PEDIDA": {
      const nivel = e.pistasDadas;
      e.pistasDadas++;
      if (e.fase === "INICIAL") e.fase = "AYUDA";
      return { estado: e, accion: { tipo: "PISTA", nivel } };
    }

    case "REPASO_CERRADO": {
      // Sólo tiene sentido si había un repaso abierto; si no, no cambia nada.
      if (e.fase !== "REPASO") return { estado: e, accion: { tipo: "CONTINUAR" } };
      e.fase = "REGRESO";
      e.erroresSeguidos = 0; // oportunidad limpia
      return { estado: e, accion: { tipo: "VOLVER_AL_PASO" } };
    }

    case "RESPUESTA": {
      if (evento.correcta) {
        const veniaDeRepaso = e.fase === "REGRESO";
        e.erroresSeguidos = 0;
        e.fase = "RESUELTO";
        if (veniaDeRepaso) {
          e.equivalentes++;
          return { estado: e, accion: { tipo: "PROPONER_EQUIVALENTE" } };
        }
        return { estado: e, accion: { tipo: "CONTINUAR" } };
      }

      // Respuesta incorrecta.
      e.erroresSeguidos++;

      if (e.fase === "REGRESO") {
        if (e.erroresSeguidos >= UMBRAL_REGRESO) {
          e.fase = "EQUIVALENTE";
          e.equivalentes++;
          return { estado: e, accion: { tipo: "PROPONER_EQUIVALENTE" } };
        }
        const nivel = e.pistasDadas;
        e.pistasDadas++;
        return { estado: e, accion: { tipo: "PISTA", nivel } };
      }

      if (e.erroresSeguidos >= UMBRAL_BLOQUEO && e.fase !== "REPASO") {
        e.fase = "REPASO";
        e.repasos++;
        return { estado: e, accion: { tipo: "ABRIR_REPASO" } };
      }

      if (e.fase === "INICIAL" || e.fase === "RESUELTO") e.fase = "AYUDA";
      const nivel = e.pistasDadas;
      e.pistasDadas++;
      return { estado: e, accion: { tipo: "PISTA", nivel } };
    }
  }
}
