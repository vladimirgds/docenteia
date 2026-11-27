import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { leerPasos, leerPreguntas } from "@/lib/docente/procedimientos";
import { dondeProcedimientosDelAlumno } from "@/lib/docente/procedimientos-servidor";

/**
 * Lo que comparten las rutas de /api/estudiante/procedimientos (PMV 3 · HITO 3):
 * quién entra, qué procedimiento puede abrir y qué se le enseña de él.
 *
 * LA REGLA QUE IMPORTA: las RESPUESTAS no viajan al navegador. El alumno ve los
 * pasos que se proyectan en la pizarra (eso es el contenido) y el enunciado de
 * las preguntas de comprensión, pero la respuesta de cada pregunta se queda en
 * el servidor y sólo sale un veredicto.
 */

export async function exigirEstudiante(): Promise<
  | { ok: true; estudianteId: string }
  | { ok: false; respuesta: NextResponse }
> {
  const sesion = await auth();
  if (!sesion?.user) {
    return { ok: false, respuesta: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: "Sólo un alumno puede abrir la pizarra." }, { status: 403 }),
    };
  }
  return { ok: true, estudianteId: sesion.user.id };
}

const SELECCION = {
  id: true,
  nodoId: true,
  tipo: true,
  titulo: true,
  descripcion: true,
  motor: true,
  ejemplo: true,
  pasos: true,
  preguntas: true,
  pistas: true,
  repasoId: true,
  verificado: true,
  nodo: { select: { id: true, titulo: true } },
} satisfies Prisma.ProcedimientoSelect;

export type ProcedimientoCompleto = Prisma.ProcedimientoGetPayload<{ select: typeof SELECCION }>;

/** El procedimiento, SÓLO si este alumno puede abrirlo (si no, `null`: 404). */
export async function procedimientoParaAlumno(
  id: string,
  estudianteId: string,
): Promise<ProcedimientoCompleto | null> {
  return prisma.procedimiento.findFirst({
    where: { AND: [{ id }, dondeProcedimientosDelAlumno(estudianteId)] },
    select: SELECCION,
  });
}

export const SELECCION_PROCEDIMIENTO_ALUMNO = SELECCION;

/** Lo que se le enseña al alumno: sin las respuestas ni las pistas (éstas salen de una en una). */
export function vistaParaAlumno(p: ProcedimientoCompleto) {
  const preguntas = leerPreguntas(p.preguntas);
  return {
    id: p.id,
    tipo: p.tipo,
    titulo: p.titulo,
    descripcion: p.descripcion,
    ejemplo: p.ejemplo,
    tema: p.nodo ? { id: p.nodo.id, titulo: p.nodo.titulo } : null,
    verificado: p.verificado,
    tieneRepaso: Boolean(p.repasoId),
    pasos: leerPasos(p.pasos),
    preguntas: preguntas.map((q) => ({
      enunciado: q.enunciado,
      verificable: Boolean(q.respuesta && q.respuesta.trim()),
      pistas: (q.pistas ?? []).length,
    })),
    pistas: p.pistas.length,
  };
}
