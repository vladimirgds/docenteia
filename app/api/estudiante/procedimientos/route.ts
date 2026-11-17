import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { dondeProcedimientosDelAlumno } from "@/lib/docente/procedimientos-servidor";
import { exigirEstudiante } from "@/lib/pizarra/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/estudiante/procedimientos` — lo que el alumno puede abrir en la
 * pizarra: el catálogo maestro publicado y lo que han publicado los docentes en
 * cuyas aulas está matriculado. Nada más.
 */
export async function GET() {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;

  const lista = await prisma.procedimiento.findMany({
    where: dondeProcedimientosDelAlumno(e.estudianteId),
    orderBy: [{ actualizadoEn: "desc" }],
    take: 100,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descripcion: true,
      verificado: true,
      pasos: true,
      nodo: { select: { titulo: true } },
    },
  });

  return NextResponse.json({
    procedimientos: lista.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      titulo: p.titulo,
      descripcion: p.descripcion,
      verificado: p.verificado,
      tema: p.nodo?.titulo ?? null,
      pasos: Array.isArray(p.pasos) ? p.pasos.length : 0,
    })),
  });
}
