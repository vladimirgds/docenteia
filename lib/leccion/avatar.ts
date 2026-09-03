import type { EstadoPedagogico } from "./sincronizacion.ts";

/**
 * LA MÁQUINA DE ESTADOS DEL AVATAR.
 *
 * Los cinco estados pedagógicos y la traducción desde los que emite el motor.
 * Vive en `lib/` —y no dentro del componente— para que la suite pueda recorrer
 * la tabla entera sin montar React: que ningún estado del motor se quede sin
 * traducir es justo el tipo de cosa que se rompe en silencio al añadir uno.
 *
 * Los gestos (las curvas de la boca, las cejas) sí viven en el componente:
 * aquello es dibujo, y esto es comportamiento.
 */

export type { EstadoPedagogico };

export const ESTADOS_PEDAGOGICOS = [
  "IDLE",
  "EXPLICANDO",
  "CELEBRANDO",
  "APOYO",
  "PENSANDO",
] as const satisfies readonly EstadoPedagogico[];

/** Los estados que emite PSE Light, tal como los nombra el motor. */
export const ESTADOS_MOTOR = [
  "neutral",
  "hablando",
  "sonriendo",
  "preguntando",
  "pensando",
] as const;

export type EstadoMotor = (typeof ESTADOS_MOTOR)[number];

/**
 * Traducción desde los estados del motor.
 *
 * `sonriendo` es celebración y `preguntando` es apoyo: cuando el motor
 * pregunta, es porque el alumno se ha atascado y toca acompañarlo, no
 * examinarlo.
 */
export const DESDE_MOTOR: Record<EstadoMotor, EstadoPedagogico> = {
  neutral: "IDLE",
  hablando: "EXPLICANDO",
  sonriendo: "CELEBRANDO",
  preguntando: "APOYO",
  pensando: "PENSANDO",
};

/** Cómo se le llama a cada estado de cara al alumno y al docente. */
export const ETIQUETA_ESTADO: Record<EstadoPedagogico, string> = {
  IDLE: "Esperando",
  EXPLICANDO: "Explicando",
  CELEBRANDO: "¡Muy bien!",
  APOYO: "Te acompaño",
  PENSANDO: "Pensando",
};

/**
 * El estado pedagógico de cualquiera de los dos vocabularios.
 *
 * Acepta tanto los nombres del motor como los pedagógicos, de modo que el
 * componente pueda recibir indistintamente lo que emite PSE Light y lo que
 * emite el sincronizador de la pizarra.
 */
export function estadoPedagogico(estado: string): EstadoPedagogico {
  if ((ESTADOS_PEDAGOGICOS as readonly string[]).includes(estado)) {
    return estado as EstadoPedagogico;
  }
  return DESDE_MOTOR[estado as EstadoMotor] ?? "IDLE";
}
