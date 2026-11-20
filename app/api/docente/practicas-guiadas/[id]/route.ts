import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, noEncontrado } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/docente/practicas-guiadas/[id]` — el detalle de una práctica con TODAS
 * las decisiones del orquestador, cada una con su motivo. 404 si el alumno no es
 * de un aula del docente.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;
  try {
    const practica = await prisma.practicaGuiada.findFirst({
      where: {
        id,
        ...(permiso.quien.rol === "SUPERADMIN"
          ? {}
          : { estudiante: { matriculas: { some: { aula: { docenteId: permiso.quien.usuarioId } } } } }),
      },
      select: {
        id: true,
        enunciado: true,
        modo: true,
        pasos: true,
        resuelta: true,
        solucionMostrada: true,
        pistasTotales: true,
        estudiante: { select: { id: true, nombre: true } },
        decisiones: {
          orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
          select: { evento: true, accion: true, razon: true, motivo: true, nivelAyuda: true, revelaHasta: true, pasoIndice: true, entrada: true, retenidas: true, creadoEn: true },
        },
      },
    });
    if (!practica) return noEncontrado("La práctica");
    return NextResponse.json({ practica });
  } catch (e) {
    return fallo(e, "docente/practicas-guiadas:detalle");
  }
}
