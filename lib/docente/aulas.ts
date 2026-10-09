import { z } from "zod";

/**
 * Aulas y matrículas (HITO 3): forma, validación y los pequeños cálculos que
 * no necesitan la base de datos.
 *
 * Misma frontera que `curriculo.ts`: nada de esto depende de Prisma ni de
 * Next.js, así que la batería de QA lo ejercita sin levantar servidor ni base
 * de datos. Las rutas de `/api/docente/aulas` y `/api/estudiante/unirse` son
 * las que lo conectan con la persistencia.
 *
 * El GENERADOR del código de acceso NO vive aquí a propósito: usa
 * `node:crypto`, y este módulo lo importan también los formularios del
 * CLIENTE (para sus límites numéricos) — webpack no sabe empaquetar un módulo
 * de Node para el navegador, y lo averiguó fallando el build entero. Vive en
 * `lib/docente/codigo-acceso.ts`, que sólo tocan las rutas de servidor.
 */

// ── Vocabulario cerrado ──────────────────────────────────────────────────────

export const GRADO_MIN = 1;
export const GRADO_MAX = 12;

/** Cuántos ejercicios puede pedir una tarea. Fuera de este rango no es una tarea razonable. */
export const CANTIDAD_EJERCICIOS_MIN = 1;
export const CANTIDAD_EJERCICIOS_MAX = 50;

/** Reintentos permitidos tras el primer intento. 0 = sin tope. */
export const LIMITE_REINTENTOS_MIN = 0;
export const LIMITE_REINTENTOS_MAX = 20;

// ── Esquemas de validación ───────────────────────────────────────────────────

/**
 * Un aula nueva.
 *
 * `institucionId` NO se pide aquí: la agrega la ruta a partir de la sesión del
 * docente (`sesion.user.institucionId`), nunca de lo que mande el cliente —
 * aceptarlo del cuerpo de la petición dejaría que un docente creara aulas en
 * un colegio que no es el suyo con sólo adivinar o conocer su id—.
 */
export const aulaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre del aula no puede estar vacío.").max(120),
  grado: z.number().int().min(GRADO_MIN, `El grado debe estar entre ${GRADO_MIN} y ${GRADO_MAX}.`).max(GRADO_MAX),
  seccion: z.string().trim().min(1, "La sección no puede estar vacía.").max(10),
});
export type EntradaAula = z.infer<typeof aulaSchema>;

/** Con qué código quiere unirse un alumno. Se normaliza igual que se genera: mayúsculas, sin espacios. */
export const unirseSchema = z.object({
  codigoAcceso: z
    .string()
    .trim()
    .toUpperCase()
    .min(4, "Ese código es demasiado corto.")
    .max(12, "Ese código es demasiado largo."),
});

/**
 * Una tarea nueva.
 *
 * La comprobación de que `fechaVencimiento` sea posterior a `fechaInicio` vive
 * en el `.refine`: es una regla sobre las DOS fechas juntas, no sobre una por
 * separado, y zod sólo sabe dónde señalar el error si se lo dice el esquema.
 */
export const tareaSchema = z
  .object({
    aulaId: z.string().trim().min(1, "Falta el aula."),
    titulo: z.string().trim().min(1, "El título no puede estar vacío.").max(200),
    descripcion: z.string().trim().max(1000).optional().nullable(),
    fechaInicio: z.coerce.date(),
    fechaVencimiento: z.coerce.date(),
    cantidadEjercicios: z
      .number()
      .int()
      .min(CANTIDAD_EJERCICIOS_MIN)
      .max(CANTIDAD_EJERCICIOS_MAX)
      .optional(),
    limiteReintentos: z
      .number()
      .int()
      .min(LIMITE_REINTENTOS_MIN)
      .max(LIMITE_REINTENTOS_MAX)
      .optional(),
    nodoId: z.string().trim().min(1).optional().nullable(),
  })
  .refine((t) => t.fechaVencimiento.getTime() > t.fechaInicio.getTime(), {
    message: "La fecha de vencimiento tiene que ser posterior a la de inicio.",
    path: ["fechaVencimiento"],
  });
export type EntradaTarea = z.infer<typeof tareaSchema>;

/**
 * Con cuánta ejecución queda una entrega: lo que manda el alumno al terminar
 * su intento (o uno de sus reintentos).
 */
export const entregaSchema = z.object({
  puntaje: z.number().min(0).max(100).optional(),
  completada: z.boolean().optional(),
});
export type EntradaEntrega = z.infer<typeof entregaSchema>;

// ── Estado de una tarea, visto por el alumno ─────────────────────────────────

export type EstadoTarea = "pendiente" | "entregada" | "vencida";

/**
 * Pendiente, entregada o vencida: la misma regla con la que `GET
 * /api/estudiante/tareas` etiqueta cada tarjeta.
 *
 * Una tarea VENCIDA que ya se entregó sigue contando como ENTREGADA: lo que
 * importa de "vencida" es que ya no se puede intentar, no manchar un trabajo
 * que sí se hizo a tiempo o dentro de sus reintentos.
 */
export function estadoDeTarea(
  tarea: { fechaVencimiento: Date },
  entrega: { completada: boolean } | null,
  ahora: Date = new Date(),
): EstadoTarea {
  if (entrega?.completada) return "entregada";
  if (tarea.fechaVencimiento.getTime() < ahora.getTime()) return "vencida";
  return "pendiente";
}

/**
 * ¿Puede el alumno entregar (o reintentar) esta tarea ahora mismo?
 *
 * Tres puertas, en el orden en que de verdad se comprueban: que no haya
 * pasado la fecha, que no se hayan agotado los reintentos —0 es "sin
 * tope", así que esa puerta no se cierra nunca con 0— y que no esté ya dada
 * por completa. `null` significa "sí puede", y es el valor que se usa para no
 * repetir la frase en cada sitio que lo necesita.
 */
export function puedeEntregar(
  tarea: { fechaVencimiento: Date; limiteReintentos: number },
  entrega: { intentosUsados: number; completada: boolean } | null,
  ahora: Date = new Date(),
): string | null {
  if (tarea.fechaVencimiento.getTime() < ahora.getTime()) {
    return "Esta tarea ya venció.";
  }
  const usados = entrega?.intentosUsados ?? 0;
  // intentosUsados cuenta TODOS los intentos, incluido el primero: el límite
  // es de REINTENTOS, así que el tope real de intentos es limiteReintentos + 1.
  if (tarea.limiteReintentos > 0 && usados >= tarea.limiteReintentos + 1) {
    return "Ya no te quedan reintentos para esta tarea.";
  }
  if (entrega?.completada) {
    return "Esta tarea ya está entregada.";
  }
  return null;
}
