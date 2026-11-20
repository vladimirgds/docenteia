import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { REGLA_DEL_PILOTO, RUBRICA_DEL_PILOTO } from "./calificacion";

/**
 * EVALUACIÓN SEGURA EN SERVIDOR (PMV 3 · HITO 1): lo que comparten las rutas que
 * asignan, corrigen y entregan tareas. La parte sin base de datos (la nota) está
 * en `calificacion.ts`.
 */

export type Tx = Prisma.TransactionClient;

/** Margen para una transacción interactiva: la de entregar hace varias lecturas. */
export const OPCIONES_TX = { maxWait: 5000, timeout: 20000 } as const;

/**
 * Copia los ejercicios del banco a la tarea tal como están AHORA —enunciado,
 * respuesta, pasos, pistas, versión— junto con su rúbrica. Es el "congelado al
 * asignar": desde aquí, editar el ejercicio del banco no toca la tarea.
 * Se llama dentro de la misma transacción que crea la tarea.
 */
export async function congelarEjercicios(tx: Tx, tareaId: string, ejercicioIds: string[]) {
  if (ejercicioIds.length === 0) return;
  const ejercicios = await tx.ejercicio.findMany({
    where: { id: { in: ejercicioIds } },
    select: { id: true, version: true, enunciado: true, respuestaCorrecta: true, pasos: true, pistas: true },
  });
  const porId = new Map(ejercicios.map((e) => [e.id, e]));
  const filas = ejercicioIds.flatMap((id, orden) => {
    const e = porId.get(id);
    if (!e) return [];
    return [
      {
        tareaId,
        ejercicioId: e.id,
        version: e.version,
        orden,
        enunciado: e.enunciado,
        respuestaCorrecta: e.respuestaCorrecta,
        pasos: e.pasos as Prisma.InputJsonValue,
        pistas: e.pistas,
        rubrica: RUBRICA_DEL_PILOTO as unknown as Prisma.InputJsonValue,
      },
    ];
  });
  if (filas.length !== ejercicioIds.length) {
    throw new Error("Un ejercicio de la tarea desapareció mientras se asignaba.");
  }
  await tx.tareaEjercicio.createMany({ data: filas });
}

/** La regla con la que se crea una tarea nueva. */
export const REGLA_NUEVA = REGLA_DEL_PILOTO as unknown as Prisma.InputJsonValue;

/**
 * Serializa todo lo que le pasa a UN alumno en UNA tarea: dos peticiones
 * simultáneas (doble clic, dos pestañas, un script) esperan su turno, y la
 * segunda ve ya lo que dejó la primera. Es un cerrojo de la propia transacción:
 * se libera solo al confirmarla o deshacerla.
 */
export async function bloquearAlumnoTarea(tx: Tx, tareaId: string, estudianteId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tareaId}), hashtext(${estudianteId}))`;
}

/** El intento en curso del alumno, o uno nuevo (numerado tras el último). */
export async function intentoEnCurso(tx: Tx, tareaId: string, estudianteId: string) {
  const abierto = await tx.intentoTarea.findFirst({
    where: { tareaId, estudianteId, estado: "EN_CURSO" },
  });
  if (abierto) return abierto;
  const ultimo = await tx.intentoTarea.aggregate({
    where: { tareaId, estudianteId },
    _max: { numero: true },
  });
  return tx.intentoTarea.create({
    data: { tareaId, estudianteId, numero: (ultimo._max.numero ?? 0) + 1 },
  });
}

/** Los ejercicios congelados de una tarea, en su orden. */
export function ejerciciosDeLaTarea(tareaId: string) {
  return prisma.tareaEjercicio.findMany({ where: { tareaId }, orderBy: { orden: "asc" } });
}
