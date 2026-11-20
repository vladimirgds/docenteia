import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/docente/practicas-guiadas` — las prácticas guiadas de los alumnos
 * matriculados en las aulas del docente, con cuántas decisiones tomó el tutor.
 * Un docente nunca ve las de alumnos que no son suyos.
 */
export async function GET() {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  try {
    const practicas = await prisma.practicaGuiada.findMany({
      where:
        permiso.quien.rol === "SUPERADMIN"
          ? {}
          : { estudiante: { matriculas: { some: { aula: { docenteId: permiso.quien.usuarioId } } } } },
      orderBy: { actualizadoEn: "desc" },
      take: 100,
      select: {
        id: true,
        enunciado: true,
        modo: true,
        resuelta: true,
        solucionMostrada: true,
        pistasTotales: true,
        actualizadoEn: true,
        estudiante: { select: { id: true, nombre: true } },
        _count: { select: { decisiones: true } },
      },
    });
    return NextResponse.json({ practicas });
  } catch (e) {
    return fallo(e, "docente/practicas-guiadas:listar");
  }
}
