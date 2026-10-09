import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, exigirDocenteConInstitucion, fallo, leerCuerpo } from "@/lib/docente/api";
import { aulaSchema } from "@/lib/docente/aulas";
import { generarCodigoAcceso } from "@/lib/docente/codigo-acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aulas del docente (HITO 3): el salón donde matricula a sus alumnos y les
 * programa tareas.
 *
 * Como `/api/docente/materias`: el GET lista lo que ya existe —con el
 * recuento de matrículas y tareas que alimenta la tarjeta—, el POST crea una
 * aula nueva bajo el colegio del docente en sesión.
 */

export async function GET() {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  try {
    // Un DOCENTE ve SÓLO sus aulas; un DIRECTOR o SUPERADMIN que llegue aquí
    // ve las suyas propias igual —esta ruta es "mis aulas", no "las del
    // colegio": eso es /api/director/resumen—.
    const aulas = await prisma.aula.findMany({
      where: { docenteId: permiso.quien.usuarioId },
      orderBy: [{ grado: "asc" }, { seccion: "asc" }],
      include: {
        _count: { select: { matriculas: true, tareas: true } },
      },
    });

    return NextResponse.json({
      aulas: aulas.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        grado: a.grado,
        seccion: a.seccion,
        codigoAcceso: a.codigoAcceso,
        activa: a.activa,
        creadoEn: a.creadoEn,
        matriculas: a._count.matriculas,
        tareas: a._count.tareas,
      })),
    });
  } catch (e) {
    return fallo(e, "docente/aulas:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocenteConInstitucion();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, aulaSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    // El código se genera y se reintenta sólo si choca: con 16.777.216
    // combinaciones la colisión es rarísima, pero "rarísima" no es "nunca", y
    // un 500 por una coincidencia de seis caracteres sería un fallo absurdo
    // de explicar.
    let aula = null;
    for (let intento = 0; intento < 5 && !aula; intento++) {
      try {
        aula = await prisma.aula.create({
          data: {
            nombre: datos.nombre,
            grado: datos.grado,
            seccion: datos.seccion,
            codigoAcceso: generarCodigoAcceso(),
            institucionId: permiso.quien.institucionId,
            docenteId: permiso.quien.usuarioId,
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
    return fallo(e, "docente/aulas:crear");
  }
}
