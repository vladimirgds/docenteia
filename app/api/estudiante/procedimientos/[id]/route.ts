import { NextResponse } from "next/server";

import { exigirEstudiante, procedimientoParaAlumno, vistaParaAlumno } from "@/lib/pizarra/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/estudiante/procedimientos/[id]` — un procedimiento para proyectarlo.
 *
 * Un procedimiento al que el alumno no tiene acceso (el privado de un docente
 * cuya aula no pisa, o uno sin publicar) responde 404, igual que uno que no
 * existe. Las respuestas de las preguntas no viajan.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;
  const { id } = await params;

  const p = await procedimientoParaAlumno(id, e.estudianteId);
  if (!p) return NextResponse.json({ error: "Ese procedimiento no existe o no está disponible." }, { status: 404 });
  return NextResponse.json({ procedimiento: vistaParaAlumno(p) });
}
