import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { puedeEntregar } from "@/lib/docente/aulas";
import { compararRespuesta } from "@/lib/matematicas/equivalencia";
import { cargarContexto, procesarRespuesta } from "@/lib/tutoria/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CORRIGE LA RESPUESTA DE UN EJERCICIO DEL BANCO, DENTRO DE UNA TAREA (HITO 3
 * — corrección QA: "nivel de dificultad en la asignación").
 *
 * Una tarea armada desde el banco de ejercicios (`Tarea.ejercicioIds`) no
 * pasa por el motor conversacional: cada ejercicio es un `Ejercicio` ya
 * guardado, con su `respuestaCorrecta` fija. Corregirlo es, literalmente,
 * `compararRespuesta` —la misma función que usa el diagnóstico para
 * exámenes del banco—, sin inventar un corrector nuevo.
 *
 * `respuestaCorrecta` NUNCA viaja al navegador: se lee aquí, se compara aquí,
 * y sólo sale el veredicto.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; ejercicioId: string }> },
) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return NextResponse.json({ error: "Sólo un alumno puede resolver un ejercicio." }, { status: 403 });
  }
  const { id: tareaId, ejercicioId } = await params;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  const respuesta = (cuerpo as { respuesta?: unknown } | null)?.respuesta;
  if (typeof respuesta !== "string" || !respuesta.trim()) {
    return NextResponse.json({ error: "Falta la respuesta." }, { status: 400 });
  }

  try {
    const tarea = await prisma.tarea.findUnique({ where: { id: tareaId } });
    if (!tarea) {
      return NextResponse.json({ error: "Esa tarea no existe." }, { status: 404 });
    }
    // El ejercicio tiene que ser UNO DE LOS QUE EL DOCENTE ASIGNÓ A ESTA
    // TAREA —no cualquier ejercicio del banco con sólo saber su id—.
    if (!tarea.ejercicioIds.includes(ejercicioId)) {
      return NextResponse.json({ error: "Ese ejercicio no es parte de esta tarea." }, { status: 404 });
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

    // Mismas puertas que al entregar: no tiene sentido dejar resolver
    // ejercicios de una tarea que ya no se puede entregar.
    const entrega = await prisma.entregaTarea.findUnique({
      where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
    });
    const bloqueo = puedeEntregar(tarea, entrega);
    if (bloqueo) {
      return NextResponse.json({ error: bloqueo }, { status: 409 });
    }

    const ejercicio = await prisma.ejercicio.findUnique({
      where: { id: ejercicioId },
      select: { respuestaCorrecta: true },
    });
    if (!ejercicio) {
      return NextResponse.json({ error: "Ese ejercicio ya no existe." }, { status: 404 });
    }

    const resultado = compararRespuesta(respuesta.trim(), ejercicio.respuestaCorrecta);

    // TUTORÍA ADAPTATIVA (PMV 3 · HITO 4): el servidor registra la respuesta y
    // decide qué hace el tutor —una pista, abrir un repaso, un equivalente—. Sólo
    // si el ejercicio se puede CORREGIR: un veredicto que el motor no sabe dar no
    // cuenta como error del alumno.
    let tutor = null;
    if (resultado.conocido !== false) {
      const ctx = await cargarContexto(tareaId, ejercicioId);
      if (ctx.tarea && ctx.ejercicio) {
        tutor = await procesarRespuesta(sesion.user.id, ctx.tarea, ctx.ejercicio, resultado.correcto);
      }
    }
    return NextResponse.json({ correcto: resultado.correcto, verificable: resultado.conocido, tutor });
  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    if (infra) {
      console.error(`[estudiante/tareas/ejercicios/corregir] ${infra.registro}`);
      return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    }
    console.error("[estudiante/tareas/ejercicios/corregir] fallo al corregir:", e);
    return NextResponse.json({ error: "No se pudo corregir la respuesta." }, { status: 500 });
  }
}
