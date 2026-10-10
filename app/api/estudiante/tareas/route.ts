import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { estadoDeTarea } from "@/lib/docente/aulas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Las tareas del alumno (HITO 3): todas las de las aulas en las que está
 * matriculado, con su estado —pendiente, entregada o vencida—.
 */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return NextResponse.json({ error: "Sólo un alumno tiene tareas." }, { status: 403 });
  }

  try {
    const matriculas = await prisma.matricula.findMany({
      where: { estudianteId: sesion.user.id },
      select: { aulaId: true },
    });
    const aulaIds = matriculas.map((m) => m.aulaId);

    if (aulaIds.length === 0) {
      return NextResponse.json({ tareas: [] });
    }

    const tareas = await prisma.tarea.findMany({
      where: { aulaId: { in: aulaIds } },
      orderBy: { fechaVencimiento: "asc" },
      include: {
        aula: { select: { nombre: true, grado: true, seccion: true } },
        entregas: { where: { estudianteId: sesion.user.id }, take: 1 },
      },
    });

    const ahora = new Date();
    return NextResponse.json({
      tareas: tareas.map((t) => {
        const entrega = t.entregas[0] ?? null;
        return {
          id: t.id,
          titulo: t.titulo,
          descripcion: t.descripcion,
          fechaInicio: t.fechaInicio,
          fechaVencimiento: t.fechaVencimiento,
          cantidadEjercicios: t.cantidadEjercicios,
          limiteReintentos: t.limiteReintentos,
          aula: t.aula,
          estado: estadoDeTarea(t, entrega, ahora),
          intentosUsados: entrega?.intentosUsados ?? 0,
          puntaje: entrega?.puntaje ?? null,
        };
      }),
    });
  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    if (infra) {
      console.error(`[estudiante/tareas] ${infra.registro}`);
      return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    }
    console.error("[estudiante/tareas] fallo al listar:", e);
    return NextResponse.json({ error: "No se pudieron cargar tus tareas." }, { status: 500 });
  }
}
