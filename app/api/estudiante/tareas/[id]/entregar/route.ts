import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { entregaSchema, puedeEntregar } from "@/lib/docente/aulas";
import { calcularNota, REGLA_DEL_PILOTO } from "@/lib/docente/calificacion";
import { OPCIONES_TX, bloquearAlumnoTarea } from "@/lib/docente/evaluacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EL ALUMNO ENTREGA (O REINTENTA) UNA TAREA (HITO 3).
 *
 * «Registra o actualiza la EntregaTarea, validando que no se exceda
 * limiteReintentos ni se intente entregar pasada la fechaVencimiento.» Las
 * dos puertas las decide `puedeEntregar`, la misma función que calcula el
 * estado que ve el alumno en `GET /api/estudiante/tareas`: no hay una regla
 * para mostrar el botón y otra distinta para aceptar el clic.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return NextResponse.json({ error: "Sólo un alumno puede entregar una tarea." }, { status: 403 });
  }
  const { id: tareaId } = await params;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  const parsed = entregaSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Entrega no válida." },
      { status: 400 },
    );
  }

  try {
    const tarea = await prisma.tarea.findUnique({ where: { id: tareaId } });
    if (!tarea) {
      return NextResponse.json({ error: "Esa tarea no existe." }, { status: 404 });
    }

    // El alumno tiene que estar matriculado en el aula de la tarea: sin esto,
    // cualquier alumno podría entregar una tarea de un aula ajena con sólo
    // saber su id.
    const matricula = await prisma.matricula.findUnique({
      where: { aulaId_estudianteId: { aulaId: tarea.aulaId, estudianteId: sesion.user.id } },
    });
    if (!matricula) {
      return NextResponse.json(
        { error: "No estás matriculado en el aula de esta tarea." },
        { status: 403 },
      );
    }

    // TODO LO QUE DECIDE LA NOTA OCURRE DENTRO DE UNA TRANSACCIÓN, con el cerrojo del
    // alumno y la tarea: dos entregas simultáneas se ponen en fila, y la segunda
    // ve ya el intento cerrado por la primera (no cuenta dos veces ni pisa la nota).
    const resultado = await prisma.$transaction(async (tx) => {
      await bloquearAlumnoTarea(tx, tareaId, sesion.user.id);

      const existente = await tx.entregaTarea.findUnique({
        where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
      });
      const bloqueo = puedeEntregar(tarea, existente);
      if (bloqueo) return { error: bloqueo, status: 409 as const };

      const congelados = await tx.tareaEjercicio.findMany({
        where: { tareaId },
        orderBy: { orden: "asc" },
      });

      // Una tarea del banco sin su copia congelada no se califica con lo que diga
      // el navegador: se rechaza (no debería ocurrir; la migración rellena las históricas).
      if (tarea.ejercicioIds.length > 0 && congelados.length === 0) {
        return { error: "Esta tarea no tiene sus ejercicios congelados.", status: 409 as const };
      }

      // ── TAREA DEL BANCO: la nota la calcula el servidor ───────────────────
      // Con los ejercicios y rúbricas CONGELADOS al asignar y las respuestas que
      // el propio servidor corrigió. Lo que mande el navegador (`puntaje`,
      // `detalle`, `completada`) se IGNORA: no hay nota que se pueda falsear.
      if (congelados.length > 0) {
        const intento = await tx.intentoTarea.findFirst({
          where: { tareaId, estudianteId: sesion.user.id, estado: "EN_CURSO" },
          include: { respuestas: true },
        });
        if (!intento || intento.respuestas.length === 0) {
          return {
            error: "No hay un intento en curso con respuestas que entregar (¿ya se entregó?).",
            status: 409 as const,
          };
        }
        const nota = calcularNota(
          congelados,
          intento.respuestas,
          REGLA_DEL_PILOTO.escala,
        );
        const respuestaPorId = new Map(intento.respuestas.map((r) => [r.tareaEjercicioId, r]));
        const detalle = congelados.map((c) => {
          const r = respuestaPorId.get(c.id);
          return {
            ejercicioId: c.ejercicioId,
            version: c.version,
            enunciado: c.enunciado,
            respuestaDada: r?.respuesta ?? null,
            respuestaCorrecta: c.respuestaCorrecta,
            correcto: r?.correcto === true,
          };
        });
        const completada = intento.respuestas.length >= congelados.length;
        const ahora = new Date();
        await tx.intentoTarea.update({
          where: { id: intento.id },
          data: { estado: "ENTREGADO", puntaje: nota.puntaje, entregadoEn: ahora },
        });
        const entrega = await tx.entregaTarea.upsert({
          where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
          create: {
            tareaId,
            estudianteId: sesion.user.id,
            intentosUsados: 1,
            puntaje: nota.puntaje,
            completada,
            fechaEntrega: completada ? ahora : null,
            detalle,
            modoNota: "SERVIDOR",
          },
          update: {
            intentosUsados: { increment: 1 },
            // La nota de la tarea es la del ÚLTIMO intento (regla acordada).
            puntaje: nota.puntaje,
            completada,
            fechaEntrega: completada ? ahora : (existente?.fechaEntrega ?? null),
            detalle,
            modoNota: "SERVIDOR",
          },
        });
        return { entrega, nota, status: 200 as const };
      }

      // ── TAREA DEL MOTOR CONVERSACIONAL (sin ejercicios en la BD) ──────────
      // Sus ejercicios se generan en el navegador y no existe nada que congelar,
      // así que la nota sigue viniendo del cliente (se marca `modoNota: CLIENTE`).
      // Lo que sí queda blindado es el reintento: dentro del cerrojo.
      const detalle =
        parsed.data.detalle ?? (existente?.detalle as Prisma.InputJsonValue | undefined) ?? [];
      const entrega = await tx.entregaTarea.upsert({
        where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
        create: {
          tareaId,
          estudianteId: sesion.user.id,
          intentosUsados: 1,
          puntaje: parsed.data.puntaje ?? null,
          completada: parsed.data.completada ?? false,
          fechaEntrega: parsed.data.completada ? new Date() : null,
          detalle,
          modoNota: "CLIENTE",
        },
        update: {
          intentosUsados: { increment: 1 },
          puntaje: parsed.data.puntaje ?? existente?.puntaje ?? null,
          completada: parsed.data.completada ?? existente?.completada ?? false,
          fechaEntrega: parsed.data.completada ? new Date() : (existente?.fechaEntrega ?? null),
          detalle,
          modoNota: "CLIENTE",
        },
      });
      return { entrega, nota: null, status: 200 as const };
    }, OPCIONES_TX);

    if ("error" in resultado) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    const { entrega, nota } = resultado;
    return NextResponse.json({ entrega, nota });

  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    if (infra) {
      console.error(`[estudiante/tareas/entregar] ${infra.registro}`);
      return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    }
    console.error("[estudiante/tareas/entregar] fallo al registrar:", e);
    return NextResponse.json({ error: "No se pudo registrar la entrega." }, { status: 500 });
  }
}
