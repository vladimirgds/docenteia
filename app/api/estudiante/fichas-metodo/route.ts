import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { leerFicha } from "@/lib/docente/fichas-metodo";
import { dondeFichasDelAlumno } from "@/lib/docente/fichas-servidor";
import { exigirEstudiante } from "@/lib/pizarra/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/estudiante/fichas-metodo` — los métodos PUBLICADOS que el alumno puede
 * usar: los del catálogo y los de los docentes de sus aulas. Se sirve la versión
 * PUBLICADA, no la de trabajo: si el docente edita una ficha, el alumno no ve el
 * cambio hasta que el docente la vuelve a aprobar.
 */
export async function GET() {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;
  try {
    const fichas = await prisma.fichaMetodo.findMany({
      where: dondeFichasDelAlumno(e.estudianteId),
      orderBy: { actualizadoEn: "desc" },
      select: {
        id: true,
        titulo: true,
        publicadaVersion: true,
        nodo: { select: { id: true, titulo: true } },
      },
      take: 100,
    });
    const versiones = await prisma.fichaMetodoVersion.findMany({
      where: { OR: fichas.map((f) => ({ fichaId: f.id, version: f.publicadaVersion ?? -1 })) },
      select: { fichaId: true, contenido: true },
    });
    const contenido = new Map(versiones.map((v) => [v.fichaId, leerFicha(v.contenido)]));
    return NextResponse.json({
      fichas: fichas.flatMap((f) => {
        const c = contenido.get(f.id);
        return c
          ? [{ id: f.id, titulo: f.titulo, descripcion: c.descripcion ?? null, patron: c.patron, ejemplos: c.ejemplos, version: f.publicadaVersion, tema: f.nodo?.titulo ?? null }]
          : [];
      }),
    });
  } catch (err) {
    const infra = explicarFalloDeBaseDeDatos(err);
    if (infra) return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    console.error("[estudiante/fichas-metodo]", err);
    return NextResponse.json({ error: "No se pudieron cargar los métodos." }, { status: 500 });
  }
}
