/**
 * Lo que comparten el profesor 3D (GLB) y el 2D de respaldo (PMV 3 · H3B).
 */

/** Hacia dónde mira y señala el profesor: coordenadas RELATIVAS al tablero (0–1). */
export interface ObjetivoLaser {
  x: number;
  y: number;
}

/**
 * Lo que está haciendo el profesor:
 *  · explica  — habla de un paso;
 *  · senala   — habla de un término y lo señala con el brazo (y el rayo);
 *  · pregunta — le hace una pregunta al alumno (gesto de llamar la atención);
 *  · espera   — espera la respuesta, mirando al alumno;
 *  · pista    — da una pista (gesto de ánimo).
 */
export type Gesto = "explica" | "senala" | "pregunta" | "espera" | "pista";

export interface PropsProfesor {
  hablando: boolean;
  objetivo: ObjetivoLaser | null;
  gesto: Gesto;
  className?: string;
  /** Posición de la MANO en coordenadas de la página (para dibujar el rayo hasta el término). */
  alMoverMano?: (p: { x: number; y: number } | null) => void;
}
