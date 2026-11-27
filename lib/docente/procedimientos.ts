import { z } from "zod";

/**
 * PROCEDIMIENTOS DIDÁCTICOS (PMV 3 · HITO 2) — forma de los datos.
 *
 * Un procedimiento es un EJEMPLO RESUELTO PASO A PASO. Cada paso lleva lo que se
 * dice (`explica`), lo que se escribe en la pizarra (`escribe`, notación plana
 * como en el resto de la plataforma: "5(3x+1)^4 · 3") y, opcionalmente, los
 * TÉRMINOS que el alumno puede tocar para oír su explicación.
 *
 * Este módulo lo cargan la API, el verificador y las baterías de QA (Node en
 * modo `strip-types`), así que no usa alias "@/" ni sintaxis exclusiva de
 * TypeScript.
 */

export const TIPOS_PROCEDIMIENTO = ["REGLA", "METODO", "PROCEDIMIENTO"] as const;
export type TipoProcedimiento = (typeof TIPOS_PROCEDIMIENTO)[number];

export const ETIQUETA_TIPO: Record<TipoProcedimiento, string> = {
  REGLA: "Regla",
  METODO: "Método",
  PROCEDIMIENTO: "Procedimiento",
};

/**
 * Qué papel juega un paso:
 *   · `transformacion`: reescribe el problema o su resultado de otra forma. El
 *     servidor comprueba que sigue siendo LO MISMO.
 *   · `definicion`: introduce una pieza ("u = 3x + 1"). No se compara: define,
 *     no calcula.
 *   · `resultado`: el último paso; el servidor lo contrasta con lo que calcula
 *     el motor.
 */
export const TIPOS_PASO = ["transformacion", "definicion", "resultado"] as const;
export type TipoPaso = (typeof TIPOS_PASO)[number];

export const MAX_PASOS = 12;
export const MAX_TERMINOS_POR_PASO = 8;

export const terminoSchema = z.object({
  /** Fragmento EXACTO de `escribe` que el alumno puede tocar. */
  texto: z.string().trim().min(1, "El término no puede estar vacío").max(60),
  explica: z.string().trim().min(1, "Explica el término").max(300),
  /**
   * PMV 3 · H3A: si el fragmento se REPITE en el paso (el «2» de «2(x+4) = 2x+8»),
   * cuál de sus apariciones es (1 = la primera). Sin él, la primera.
   */
  aparicion: z.number().int().min(1).max(12).optional(),
  /** PMV 3 · H3A: una analogía que el alumno puede abrir tras oír la explicación. */
  analogia: z.string().trim().min(1).max(400).optional().nullable(),
});

export const pasoSchema = z.object({
  explica: z.string().trim().min(1, "Cada paso necesita una explicación").max(400),
  escribe: z.string().trim().min(1, "Cada paso necesita lo que se escribe en la pizarra").max(200),
  tipo: z.enum(TIPOS_PASO).default("transformacion"),
  /** La regla que se aplica en este paso, tal como la nombra el docente. */
  regla: z.string().trim().max(80).optional().nullable(),
  terminos: z.array(terminoSchema).max(MAX_TERMINOS_POR_PASO).optional(),
});
export type Paso = z.infer<typeof pasoSchema>;

export const preguntaSchema = z.object({
  enunciado: z.string().trim().min(1, "La pregunta no puede estar vacía").max(300),
  respuesta: z.string().trim().max(200).optional().nullable(),
  pistas: z.array(z.string().trim().min(1).max(240)).max(4).optional(),
});
export type Pregunta = z.infer<typeof preguntaSchema>;

const ESTADOS_PROC = ["BORRADOR", "PUBLICADO", "ARCHIVADO"] as const;

export const procedimientoSchema = z.object({
  nodoId: z.string().min(1, "Falta el tema").max(40),
  tipo: z.enum(TIPOS_PROCEDIMIENTO).default("PROCEDIMIENTO"),
  titulo: z.string().trim().min(3, "El título es demasiado corto").max(160),
  descripcion: z.string().trim().max(1000).optional().nullable(),
  ejemplo: z.string().trim().min(1, "Falta el ejemplo que se resuelve").max(200),
  pasos: z.array(pasoSchema).min(1, "Añade al menos un paso").max(MAX_PASOS),
  preguntas: z.array(preguntaSchema).max(6).optional(),
  pistas: z.array(z.string().trim().min(1).max(240)).max(5).optional(),
  repasoId: z.string().min(1).max(40).optional().nullable(),
  estado: z.enum(ESTADOS_PROC).optional(),
});
export type EntradaProcedimiento = z.infer<typeof procedimientoSchema>;

export const procedimientoActualizacionSchema = procedimientoSchema.partial();

/** Verificación sin guardar: el botón «Probar» del editor. */
export const pruebaSchema = z.object({
  nodoId: z.string().min(1).max(40).optional(),
  ejemplo: z.string().trim().min(1).max(200),
  pasos: z.array(pasoSchema).min(1).max(MAX_PASOS),
});

export const peticionIASchema = z.object({
  nodoId: z.string().min(1, "Falta el tema").max(40),
  tipo: z.enum(TIPOS_PROCEDIMIENTO).default("PROCEDIMIENTO"),
  /** Qué quiere enseñar el docente: "suma de fracciones", "regla de la cadena". */
  titulo: z.string().trim().min(3, "Di qué quieres enseñar").max(160),
  indicaciones: z.string().trim().max(300).optional(),
  nivel: z.enum(["BASICO", "INTERMEDIO", "AVANZADO"]).default("INTERMEDIO"),
  /** Cuántos ejercicios de práctica proponer además (0–5). */
  ejercicios: z.number().int().min(0).max(5).default(3),
});

/** Los pasos tal como se guardan en la base: JSON, no se confía en su forma. */
export function leerPasos(json: unknown): Paso[] {
  const r = z.array(pasoSchema).safeParse(json);
  return r.success ? r.data : [];
}

export function leerPreguntas(json: unknown): Pregunta[] {
  const r = z.array(preguntaSchema).safeParse(json);
  return r.success ? r.data : [];
}
