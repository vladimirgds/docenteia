import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { aulaAdminSchema } from "@/lib/admin/aulas";
import { fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { generarCodigoAcceso } from "@/lib/docente/codigo-acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GESTIÓN CENTRALIZADA DE AULAS (checklist actualizado de HITO 4,
 * "/admin/aulas — vista maestra"): el SUPERADMIN ve las aulas de TODA la
 * plataforma —no las de un docente ni las de un colegio, que es lo que ya
 * ofrecen `GET /api/docente/aulas` y `GET /api/director/resumen`— y crea
 * aulas nuevas asignando explícitamente a qué colegio y a qué docente
 * pertenecen.
 */
export async function GET() {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  try {
    const aulas = await prisma.aula.findMany({
      orderBy: [{ institucion: { nombre: "asc" } }, { grado: "asc" }, { seccion: "asc" }],
      include: {
        institucion: { select: { nombre: true } },
        docente: { select: { nombre: true } },
        _count: { select: { matriculas: true, tareas: true } },
      },
      take: 2000,
    });

    return NextResponse.json({
      aulas: aulas.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        grado: a.grado,
        seccion: a.seccion,
        codigoAcceso: a.codigoAcceso,
        activa: a.activa,
        institucionId: a.institucionId,
        institucion: a.institucion.nombre,
        docenteId: a.docenteId,
        docente: a.docente?.nombre ?? null,
        matriculas: a._count.matriculas,
        tareas: a._count.tareas,
      })),
    });
  } catch (e) {
    return fallo(e, "admin/aulas:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, aulaAdminSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const institucion = await prisma.institucion.findUnique({ where: { id: datos.institucionId }, select: { id: true } });
    if (!institucion) return noEncontrado("Esa institución");

    // Mismo reintento por colisión de código que `POST /api/docente/aulas`:
    // rarísimo con 16.777.216 combinaciones, pero no imposible.
    let aula = null;
    for (let intento = 0; intento < 5 && !aula; intento++) {
      try {
        aula = await prisma.aula.create({
          data: {
            nombre: datos.nombre,
            grado: datos.grado,
            seccion: datos.seccion,
            codigoAcceso: generarCodigoAcceso(),
            institucionId: datos.institucionId,
            // SIN docenteId: el aula nace sin titular —se asigna después,
            // con PATCH /api/admin/aulas/[id]—.
          },
        });
      } catch (e: unknown) {
        const esColision =
          typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002";
        if (!esColision || intento === 4) throw e;
      }
    }

    return NextResponse.json({ aula }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return noEncontrado("Esa institución");
    }
    return fallo(e, "admin/aulas:crear");
  }
}
