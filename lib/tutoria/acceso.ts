import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { puedeEntregar } from "@/lib/docente/aulas";
import { cargarContexto } from "@/lib/tutoria/servidor";

/**
 * La puerta de las rutas de tutoría de /api/estudiante/tareas/[id]/ejercicios/
 * [ejercicioId]/…: las mismas condiciones que la corrección —alumno,
 * matriculado, tarea abierta, y el ejercicio es UNO DE LOS DE ESA TAREA—.
 *
 * Sin la última, un alumno podría abrir una sesión de tutoría sobre cualquier
 * ejercicio del banco con sólo saber su id y sacarle pistas.
 */
export async function accesoATutoria(tareaId: string, ejercicioId: string) {
  const sesion = await auth();
  if (!sesion?.user) {
    return { ok: false as const, respuesta: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return {
      ok: false as const,
      respuesta: NextResponse.json({ error: "Sólo un alumno puede usar el tutor." }, { status: 403 }),
    };
  }

  const tarea = await prisma.tarea.findUnique({ where: { id: tareaId } });
  if (!tarea) {
    return { ok: false as const, respuesta: NextResponse.json({ error: "Esa tarea no existe." }, { status: 404 }) };
  }
  if (!tarea.ejercicioIds.includes(ejercicioId)) {
    return {
      ok: false as const,
      respuesta: NextResponse.json({ error: "Ese ejercicio no es parte de esta tarea." }, { status: 404 }),
    };
  }
  const matricula = await prisma.matricula.findUnique({
    where: { aulaId_estudianteId: { aulaId: tarea.aulaId, estudianteId: sesion.user.id } },
  });
  if (!matricula) {
    return {
      ok: false as const,
      respuesta: NextResponse.json({ error: "No estás matriculado en el aula de esta tarea." }, { status: 403 }),
    };
  }
  const entrega = await prisma.entregaTarea.findUnique({
    where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
  });
  const bloqueo = puedeEntregar(tarea, entrega);
  if (bloqueo) {
    return { ok: false as const, respuesta: NextResponse.json({ error: bloqueo }, { status: 409 }) };
  }

  const ctx = await cargarContexto(tareaId, ejercicioId);
  if (!ctx.tarea || !ctx.ejercicio) {
    return { ok: false as const, respuesta: NextResponse.json({ error: "Ese ejercicio ya no existe." }, { status: 404 }) };
  }
  return { ok: true as const, estudianteId: sesion.user.id, tarea: ctx.tarea, ejercicio: ctx.ejercicio };
}
