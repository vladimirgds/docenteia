import { z } from "zod";

import { NIVELES } from "./curriculo.ts";

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

/**
 * Intentos totales permitidos para una tarea (no "reintentos además del
 * primero": corrección QA, "si el docente configura 2 intentos, el alumno
 * debe tener exactamente 2 intentos en total"). 0 = sin tope.
 */
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
 * `fechaInicio` y `fechaVencimiento` llegan como fecha sin hora (el campo del
 * formulario es `<input type="date">`), así que las dos se normalizan al
 * límite de su propio día antes de comparar: INICIO al primer instante, 00:00,
 * y VENCIMIENTO al último, 23:59:59.999. Sin esto, una tarea "del 10/10 al
 * 10/10" —una tarea de clase, de un solo día— comparaba dos medianoches
 * IDÉNTICAS con `>` estricto y el formulario la rechazaba siempre, aunque el
 * propio aviso de error ("tiene que ser posterior") no tenía sentido para ese
 * caso: un día no puede vencer ANTES de empezar, pero sí puede vencer EN el
 * mismo día en que empieza.
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
    /**
     * Dificultad de los ejercicios, para armar la tarea desde el banco
     * docente. `null`/ausente es "Todos" (mixto): no filtra por nivel. Sin
     * `nodoId` no tiene con qué cruzarse, así que no hace nada por sí sola.
     */
    dificultad: z.enum(NIVELES).optional().nullable(),
    /**
     * Elegidos A MANO por el docente, del banco: cuando llega con elementos,
     * ES la tarea —ni `cantidadEjercicios` ni `dificultad` deciden nada más,
     * la ruta los toma tal cual—. Vacío o ausente, con `origenEjercicios:
     * "banco"`, es "automático": la ruta elige al azar del banco.
     */
    ejercicioIds: z.array(z.string().trim().min(1)).max(CANTIDAD_EJERCICIOS_MAX).optional(),
    /**
     * De dónde salen los ejercicios de la tarea. `"ia"` (el valor por
     * defecto, y el único que existía antes de esta corrección) es el motor
     * conversacional generando sobre la marcha; `"banco"` es el banco de
     * ejercicios del docente —automático por tema/dificultad, o manual con
     * `ejercicioIds`—. Explícito, y no deducido de si `dificultad` llegó o
     * no, porque `dificultad: null` ("Todos") es un valor legítimo del modo
     * banco, y confundirlo con "no mandaron nada" habría hecho caer en modo
     * IA a una tarea que sí quería el banco, mixto.
     */
    origenEjercicios: z.enum(["ia", "banco"]).optional(),
    /**
     * PMV 3 · Hito 5A (ampliación): una ficha de método PUBLICADA que guía la corrección
     * (pistas de error concretas). Se congela al asignar.
     */
    fichaId: z.string().trim().min(1).optional().nullable(),
  })
  .transform((t) => {
    const fechaInicio = new Date(t.fechaInicio);
    fechaInicio.setUTCHours(0, 0, 0, 0);
    const fechaVencimiento = new Date(t.fechaVencimiento);
    fechaVencimiento.setUTCHours(23, 59, 59, 999);
    return { ...t, fechaInicio, fechaVencimiento };
  })
  .refine((t) => t.fechaVencimiento.getTime() >= t.fechaInicio.getTime(), {
    message: "La fecha de vencimiento no puede ser anterior a la de inicio.",
    path: ["fechaVencimiento"],
  });
export type EntradaTarea = z.infer<typeof tareaSchema>;

/**
 * Con cuánta ejecución queda una entrega: lo que manda el alumno al terminar
 * su intento (o uno de sus reintentos).
 */
/**
 * Un ejercicio resuelto, para el desglose que "Ver resultado" vuelve a
 * mostrar más tarde.
 *
 * `ejercicioId`, cuando viene de una tarea del banco, es lo que deja que el
 * SERVIDOR rellene `respuestaCorrecta` él mismo al entregar —nunca lo que
 * mande el navegador—: revelarla antes de ese momento sería el mismo atajo
 * que ya cierra `GET .../resultado`.
 */
export const detalleEjercicioSchema = z.object({
  ejercicioId: z.string().optional().nullable(),
  enunciado: z.string(),
  respuestaDada: z.string().nullable(),
  respuestaCorrecta: z.string().nullable(),
  correcto: z.boolean(),
});
export type DetalleEjercicio = z.infer<typeof detalleEjercicioSchema>;

export const entregaSchema = z.object({
  puntaje: z.number().min(0).max(100).optional(),
  completada: z.boolean().optional(),
  /**
   * El desglose del intento: opcional —una entrega manual, de otra vía,
   * puede no traerlo—, y cuando llega REEMPLAZA al anterior entero: es del
   * último intento, no se acumula entre reintentos.
   */
  detalle: z.array(detalleEjercicioSchema).optional(),
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
 * Dos puertas: que no haya pasado la fecha, y que no se hayan agotado los
 * intentos —0 es "sin tope", así que esa puerta no se cierra nunca con
 * 0—. `null` significa "sí puede", y es el valor que se usa para no repetir
 * la frase en cada sitio que lo necesita.
 *
 * ESTAR YA "completada" NO cierra esta puerta (cambio pedido por el
 * cliente, HITO 3 — corrección QA: "el alumno pueda rehacer la tarea
 * después para mejorar su nota"). Antes sí lo hacía —una entrega marcaba la
 * tarea como terminada para siempre, sin importar cuántos reintentos le
 * quedaran—, y eso es justo lo que volvía inútil a `limiteReintentos`: con
 * el primer intento ya bastaba para bloquear cualquier otro. Ahora el único
 * tope de cuántas veces se puede entregar es `limiteReintentos`; qué nota
 * queda guardada la decide `POST /api/estudiante/tareas/[id]/entregar`
 * (la del último intento aceptado).
 */
export function puedeEntregar(
  tarea: { fechaVencimiento: Date; limiteReintentos: number },
  entrega: { intentosUsados: number } | null,
  ahora: Date = new Date(),
): string | null {
  if (tarea.fechaVencimiento.getTime() < ahora.getTime()) {
    return "Esta tarea ya venció.";
  }
  const usados = entrega?.intentosUsados ?? 0;
  // `limiteReintentos` es el TOTAL de intentos permitidos, no "intentos
  // adicionales al primero" (corrección QA: "si el docente configura 2
  // intentos, el alumno debe tener EXACTAMENTE 2 intentos en total, no
  // sumarle 1 adicional como intento inicial" —la contradicción exacta que
  // reportó entre lo que mostraba la vista del docente, "2 reintentos", y
  // lo que veía el alumno, "0 de 3 intentos disponibles"—. `intentosUsados`
  // ya cuenta TODOS los intentos, incluido el primero, así que se compara
  // directo contra `limiteReintentos`, sin sumarle nada.
  if (tarea.limiteReintentos > 0 && usados >= tarea.limiteReintentos) {
    return "Ya no te quedan intentos para esta tarea.";
  }
  return null;
}

/**
 * ¿Se acertó este ejercicio? Para "Ver ejercicios de la tarea" del docente
 * (corrección QA: "a la derecha de cada ejercicio se repite el texto
 * 'AVANZADO' en cada fila"; en su lugar, el indicador de acierto —el dato
 * que de verdad cambia ejercicio a ejercicio, la dificultad es de toda la
 * tarea—).
 *
 * Cruza el desglose de cada entrega YA completada por su `ejercicioId`. Con
 * un solo alumno matriculado —el caso típico de un aula de prueba— esto es
 * sencillamente "¿lo acertó?". Con varios, es "¿lo acertaron TODOS los que
 * lo intentaron?": un solo fallo basta para marcarlo en rojo, porque la
 * pregunta que le importa al docente es "¿hay alguien que necesite
 * repasar esto?", no un promedio. `null` es "todavía nadie lo ha
 * contestado": ni verde ni rojo, sin inventar un dato que no existe.
 */
export function seAcertoElEjercicio(
  entregas: { detalle: unknown }[],
  ejercicioId: string,
): boolean | null {
  let alguienLoContestó = false;
  let alguienFalló = false;
  for (const entrega of entregas) {
    const detalle = Array.isArray(entrega.detalle) ? entrega.detalle : [];
    const fila = (detalle as { ejercicioId?: string; correcto?: boolean }[]).find(
      (d) => d.ejercicioId === ejercicioId,
    );
    if (!fila) continue;
    alguienLoContestó = true;
    if (!fila.correcto) alguienFalló = true;
  }
  if (!alguienLoContestó) return null;
  return !alguienFalló;
}
