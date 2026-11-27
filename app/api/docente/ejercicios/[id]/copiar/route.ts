import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { conflicto, exigirDocente, fallo, noEncontrado } from "@/lib/docente/api";
import { puedeLeerEjercicio } from "@/lib/docente/bancos";
import { SELECCION_EJERCICIO } from "@/lib/docente/ejercicios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/**
 * `POST /api/docente/ejercicios/[id]/copiar` — copia un ejercicio del CATÁLOGO
 * MAESTRO al banco privado del docente, como BORRADOR.
 *
 * Es la forma natural de "cargar contenido inicial por tema" partiendo de algo
 * ya verificado: el docente copia, adapta (cambia números, añade pistas) y
 * publica. La copia es SUYA —editarla no toca el original, que lo ve todo el
 * alumnado—, y nace en borrador para que pase por su revisión antes de llegar a
 * nadie. Conserva la verificación del motor, porque el enunciado es el mismo.
 */
export async function POST(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;
  if (quien.rol !== "DOCENTE") {
    return NextResponse.json(
      { error: "Sólo un docente tiene banco propio al que copiar ejercicios." },
      { status: 403 },
    );
  }

  const { id } = await params;
  try {
    const origen = await prisma.ejercicio.findUnique({ where: { id } });
    // Sólo se copia lo que se puede VER y es del catálogo: el banco privado de
    // otro docente responde 404, igual que un id inexistente.
    if (!origen || origen.ambito !== "MAESTRO" || !puedeLeerEjercicio(quien, origen)) {
      return noEncontrado("El ejercicio");
    }
    if (origen.estado !== "PUBLICADO") {
      return conflicto("Sólo se pueden copiar ejercicios publicados del catálogo.");
    }

    const yaTiene = await prisma.ejercicio.findFirst({
      where: {
        ambito: "DOCENTE",
        autorId: quien.usuarioId,
        nodoId: origen.nodoId,
        enunciado: origen.enunciado,
      },
      select: { id: true },
    });
    if (yaTiene) return conflicto("Ya tienes una copia de este ejercicio en tu banco.");

    const copia = await prisma.ejercicio.create({
      data: {
        nodoId: origen.nodoId,
        institucionId: origen.institucionId,
        motor: origen.motor,
        etapa: origen.etapa,
        cursoMin: origen.cursoMin,
        nivel: origen.nivel,
        enunciado: origen.enunciado,
        respuestaCorrecta: origen.respuestaCorrecta,
        pasos: origen.pasos as Prisma.InputJsonValue,
        plantilla: origen.plantilla,
        parametros: origen.parametros as Prisma.InputJsonValue,
        respuestaFormula: origen.respuestaFormula,
        pistas: origen.pistas,
        origen: "DOCENTE",
        ambito: "DOCENTE",
        validado: origen.validado,
        validadoEn: origen.validadoEn,
        informeValidacion: origen.informeValidacion as Prisma.InputJsonValue,
        estado: "BORRADOR",
        autorId: quien.usuarioId,
        metadatos: { copiadoDe: origen.id } as Prisma.InputJsonValue,
      },
      select: SELECCION_EJERCICIO,
    });
    return NextResponse.json({ ejercicio: copia }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return conflicto("Ya tienes una copia de este ejercicio en tu banco.");
    }
    return fallo(e, "docente/ejercicios:copiar");
  }
}
