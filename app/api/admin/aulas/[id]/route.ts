import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { asignarDocenteSchema } from "@/lib/admin/aulas";
import { conflicto, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/aulas/[id] (checklist actualizado de HITO 4, "Flujo de
 * Asignación Posterior"): asigna, cambia o quita el docente titular de un
 * aula YA creada. El aula misma se crea sin titular
 * (`POST /api/admin/aulas`); esta ruta es el segundo paso, separado a
 * propósito —desacoplar la estructura física/académica (el aula) de la
 * asignación de personas (quién la dirige)—.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;

  const cuerpo = await leerCuerpo(req, asignarDocenteSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const { docenteId } = cuerpo.datos;

  try {
    const aula = await prisma.aula.findUnique({ where: { id }, select: { id: true } });
    if (!aula) return noEncontrado("Esa aula");

    if (docenteId !== null) {
      const docente = await prisma.usuario.findUnique({ where: { id: docenteId }, select: { id: true, rol: true } });
      if (!docente) return noEncontrado("Ese docente");
      if (docente.rol !== "DOCENTE" && docente.rol !== "DIRECTOR" && docente.rol !== "SUPERADMIN") {
        return conflicto("El titular de un aula tiene que ser un docente, un director o el administrador.");
      }
    }

    const actualizada = await prisma.aula.update({
      where: { id },
      data: { docenteId },
      include: { docente: { select: { nombre: true } } },
    });

    return NextResponse.json({
      aula: {
        id: actualizada.id,
        docenteId: actualizada.docenteId,
        docente: actualizada.docente?.nombre ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return noEncontrado("Esa aula o ese docente");
    }
    return fallo(e, "admin/aulas:asignar-docente");
  }
}
