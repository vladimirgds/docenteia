import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { conflicto, exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { materiaSchema } from "@/lib/docente/curriculo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Asignaturas del currículo (CRUD, segunda mitad): editar y retirar. */

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const cuerpo = await leerCuerpo(req, materiaSchema.partial());
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const existente = await prisma.materia.findUnique({ where: { id } });
    if (!existente) return noEncontrado("La asignatura");

    const materia = await prisma.materia.update({
      where: { id },
      data: {
        ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
        ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion ?? null } : {}),
        ...(datos.color !== undefined ? { color: datos.color ?? null } : {}),
        ...(datos.orden !== undefined ? { orden: datos.orden } : {}),
        ...(datos.activa !== undefined ? { activa: datos.activa } : {}),
        // El código NO se toca al editar: es la referencia estable de la
        // asignatura y hay contenido que ya la cita.
      },
    });

    return NextResponse.json({ materia });
  } catch (e) {
    return fallo(e, "docente/materias:editar");
  }
}

/**
 * Borrado de una asignatura.
 *
 * Sólo se borra la que está vacía. Una asignatura con temas dentro no se
 * elimina en cascada: la relación es SetNull, así que el borrado no perdería
 * los temas, pero los dejaría sueltos y sin categoría, que es una forma
 * silenciosa de perderlos igual. Para retirarla del uso está `activa`.
 */
export async function DELETE(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;

  try {
    const materia = await prisma.materia.findUnique({
      where: { id },
      include: { _count: { select: { temas: true, perfiles: true } } },
    });
    if (!materia) return noEncontrado("La asignatura");

    if (materia._count.temas > 0) {
      return conflicto(
        `La asignatura "${materia.nombre}" tiene ${materia._count.temas} tema(s). Muévelos a otra asignatura o desactívala en lugar de borrarla.`,
      );
    }
    if (materia._count.perfiles > 0) {
      return conflicto(
        `La asignatura "${materia.nombre}" está asignada a ${materia._count.perfiles} estudiante(s). Desactívala en lugar de borrarla.`,
      );
    }

    await prisma.materia.delete({ where: { id } });
    return NextResponse.json({ borrada: true });
  } catch (e) {
    return fallo(e, "docente/materias:borrar");
  }
}
