import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, noEncontrado } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Un aula concreta, con sus alumnos: lo que abre el botón "Ver estudiantes"
 * de la tarjeta de aula.
 *
 * Sólo el docente TITULAR del aula puede verla —no "cualquier docente del
 * colegio"—: la lista de alumnos de un aula ajena no es asunto suyo, y para
 * eso está el panel del director, que sí ve el colegio entero.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;

  try {
    const aula = await prisma.aula.findUnique({
      where: { id },
      include: {
        matriculas: {
          orderBy: { creadoEn: "asc" },
          include: { estudiante: { select: { id: true, nombre: true, email: true } } },
        },
      },
    });

    if (!aula || aula.docenteId !== permiso.quien.usuarioId) return noEncontrado("El aula");

    return NextResponse.json({
      aula: {
        id: aula.id,
        nombre: aula.nombre,
        grado: aula.grado,
        seccion: aula.seccion,
        codigoAcceso: aula.codigoAcceso,
        activa: aula.activa,
      },
      estudiantes: aula.matriculas.map((m) => ({
        matriculaId: m.id,
        id: m.estudiante.id,
        nombre: m.estudiante.nombre,
        email: m.estudiante.email,
        matriculadoEn: m.creadoEn,
      })),
    });
  } catch (e) {
    return fallo(e, "docente/aulas/[id]:leer");
  }
}
