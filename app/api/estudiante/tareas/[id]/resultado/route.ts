import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LA RESPUESTA CORRECTA DE CADA EJERCICIO DE UNA TAREA DEL BANCO, PARA EL
 * DESGLOSE DE RESULTADOS (HITO 3 — corrección QA: "permitir que el
 * estudiante pueda... ver la respuesta correcta calculada por el motor").
 *
 * SÓLO se revela una vez que la tarea YA ESTÁ ENTREGADA (`completada:
 * true`) —antes de eso sería un atajo trivial: mandar cualquier respuesta,
 * leer aquí la correcta, reenviarla—. El candado no es de la interfaz, es
 * de esta ruta: aunque alguien la llame directo, sin la entrega completa no
 * suelta nada.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return NextResponse.json({ error: "Sólo un alumno tiene resultados de tarea." }, { status: 403 });
  }
  const { id: tareaId } = await params;

  try {
    const tarea = await prisma.tarea.findUnique({ where: { id: tareaId } });
    if (!tarea) {
      return NextResponse.json({ error: "Esa tarea no existe." }, { status: 404 });
    }

    const matricula = await prisma.matricula.findUnique({
      where: { aulaId_estudianteId: { aulaId: tarea.aulaId, estudianteId: sesion.user.id } },
    });
    if (!matricula) {
      return NextResponse.json(
        { error: "No estás matriculado en el aula de esta tarea." },
        { status: 403 },
      );
    }

    const entrega = await prisma.entregaTarea.findUnique({
      where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
    });
    if (!entrega?.completada) {
      return NextResponse.json(
        { error: "Todavía no entregaste esta tarea." },
        { status: 409 },
      );
    }

    // De la copia CONGELADA al asignar: la respuesta que se enseña es la contra la
    // que se corrigió, aunque el docente haya editado el ejercicio después.
    const congelados = await prisma.tareaEjercicio.findMany({
      where: { tareaId },
      orderBy: { orden: "asc" },
      select: { ejercicioId: true, respuestaCorrecta: true },
    });
    const ejercicios = congelados.flatMap((c) =>
      c.ejercicioId ? [{ id: c.ejercicioId, respuestaCorrecta: c.respuestaCorrecta }] : [],
    );
    return NextResponse.json({ ejercicios });
  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    if (infra) {
      console.error(`[estudiante/tareas/resultado] ${infra.registro}`);
      return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    }
    console.error("[estudiante/tareas/resultado] fallo al leer:", e);
    return NextResponse.json({ error: "No se pudo cargar el resultado." }, { status: 500 });
  }
}
