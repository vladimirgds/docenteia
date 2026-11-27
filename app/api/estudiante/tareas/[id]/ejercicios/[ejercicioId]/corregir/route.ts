import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { puedeEntregar } from "@/lib/docente/aulas";
import { compararRespuesta } from "@/lib/matematicas/equivalencia";
import { fichaCongelada, revisarConFichaDeTarea } from "@/lib/docente/fichas-tarea";
import { cargarContexto, procesarRespuesta } from "@/lib/tutoria/servidor";
import {
  OPCIONES_TX,
  bloquearAlumnoTarea,
  intentoEnCurso,
} from "@/lib/docente/evaluacion-servidor";

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

    // LA COPIA CONGELADA al asignar, no el ejercicio vivo del banco: si el docente
    // lo editó después, esta tarea se sigue corrigiendo con lo que valía al asignar.
    const ejercicio = await prisma.tareaEjercicio.findFirst({
      where: { tareaId, ejercicioId },
      select: { id: true, respuestaCorrecta: true, enunciado: true },
    });
    if (!ejercicio) {
      return NextResponse.json({ error: "Ese ejercicio ya no existe." }, { status: 404 });
    }

    const general = compararRespuesta(respuesta.trim(), ejercicio.respuestaCorrecta);

    // PMV 3 · HITO 5A (ampliación): la FICHA DE MÉTODO congelada en la tarea. Aporta la pista
    // de error concreta y, SÓLO si el corrector general no sabe decidir, su
    // veredicto (el motor ya verificó el método antes de publicarse). Nunca
    // contradice un veredicto que el corrector general sí sabe dar.
    const ficha = fichaCongelada(tarea.fichaContenido);
    const porFicha = ficha ? revisarConFichaDeTarea(ficha, ejercicio.enunciado, respuesta.trim()) : null;
    const resultado =
      general.conocido === false && porFicha?.aplica && porFicha.correcta !== null
        ? { ...general, conocido: true, correcto: porFicha.correcta }
        : general;
    const metodo =
      ficha && porFicha?.aplica
        ? { titulo: tarea.fichaTitulo, pista: resultado.correcto ? null : porFicha.pista }
        : null;

    // El veredicto lo deja el SERVIDOR en el intento en curso (la última
    // respuesta a cada ejercicio es la que cuenta). Con el cerrojo del alumno y la
    // tarea, y comprobando otra vez el tope de intentos DENTRO de la transacción.
    const rechazo = await prisma.$transaction(async (tx) => {
      await bloquearAlumnoTarea(tx, tareaId, sesion.user.id);
      const actual = await tx.entregaTarea.findUnique({
        where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
      });
      const motivo = puedeEntregar(tarea, actual);
      if (motivo) return motivo;
      const intento = await intentoEnCurso(tx, tareaId, sesion.user.id);
      await tx.respuestaIntento.upsert({
        where: { intentoId_tareaEjercicioId: { intentoId: intento.id, tareaEjercicioId: ejercicio.id } },
        create: {
          intentoId: intento.id,
          tareaEjercicioId: ejercicio.id,
          respuesta: respuesta.trim(),
          correcto: resultado.conocido === false ? null : resultado.correcto,
        },
        update: {
          respuesta: respuesta.trim(),
          correcto: resultado.conocido === false ? null : resultado.correcto,
        },
      });
      return null;
    }, OPCIONES_TX);
    if (rechazo) {
      return NextResponse.json({ error: rechazo }, { status: 409 });
    }

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
    return NextResponse.json({ correcto: resultado.correcto, verificable: resultado.conocido, tutor, metodo });
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
