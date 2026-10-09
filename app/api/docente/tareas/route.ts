import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { tareaSchema } from "@/lib/docente/aulas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tareas programadas (HITO 3): lo que el docente le asigna a un aula entera,
 * con su ventana de tiempo y su límite de reintentos.
 */

export async function GET(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const aulaId = new URL(req.url).searchParams.get("aulaId");

  try {
    const tareas = await prisma.tarea.findMany({
      where: {
        docenteId: permiso.quien.usuarioId,
        ...(aulaId ? { aulaId } : {}),
      },
      orderBy: { fechaVencimiento: "asc" },
      include: {
        aula: { select: { nombre: true, grado: true, seccion: true } },
        _count: { select: { entregas: true } },
      },
    });

    return NextResponse.json({ tareas });
  } catch (e) {
    return fallo(e, "docente/tareas:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, tareaSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    // El aula tiene que ser del docente en sesión: sin esto, cualquier docente
    // podría programar tareas en el aula de otro con sólo saber su id.
    const aula = await prisma.aula.findUnique({ where: { id: datos.aulaId } });
    if (!aula || aula.docenteId !== permiso.quien.usuarioId) {
      return noEncontrado("El aula");
    }

    const tarea = await prisma.tarea.create({
      data: {
        titulo: datos.titulo,
        descripcion: datos.descripcion ?? null,
        fechaInicio: datos.fechaInicio,
        fechaVencimiento: datos.fechaVencimiento,
        cantidadEjercicios: datos.cantidadEjercicios ?? 5,
        limiteReintentos: datos.limiteReintentos ?? 3,
        nodoId: datos.nodoId ?? null,
        aulaId: aula.id,
        docenteId: permiso.quien.usuarioId,
      },
    });

    return NextResponse.json({ tarea }, { status: 201 });
  } catch (e) {
    return fallo(e, "docente/tareas:crear");
  }
}
