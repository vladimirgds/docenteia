import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { conflicto, exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { ejercicioActualizacionSchema, type Motor } from "@/lib/docente/curriculo";
import {
  SELECCION_EJERCICIO,
  camposDeValidacion,
  pasosJson,
} from "@/lib/docente/ejercicios";
import type { Parametro } from "@/lib/docente/parametros";
import { validarEjercicio } from "@/lib/docente/validador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un ejercicio del banco: editarlo o retirarlo. */

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const cuerpo = await leerCuerpo(req, ejercicioActualizacionSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const actual = await prisma.ejercicio.findUnique({ where: { id } });
    if (!actual) return noEncontrado("El ejercicio");

    // Si el ejercicio cambia de tema, cambia de motor con él.
    const nodoId = datos.nodoId ?? actual.nodoId;
    let motor = actual.motor as Motor | null;
    if (nodoId) {
      const tema = await prisma.nodoConocimiento.findUnique({
        where: { id: nodoId },
        select: { motor: true },
      });
      if (!tema) return noEncontrado("El tema");
      motor = tema.motor as Motor | null;
    }

    // ── Se revalida SIEMPRE, aunque el cambio parezca inocente ───────────────
    // Tocar sólo el rango de un parámetro basta para que una plantilla que
    // cuadraba deje de cuadrar. Revalidar únicamente cuando cambia el enunciado
    // dejaría ejercicios marcados como verificados que ya no lo están.
    //
    // Y hay un caso que merece su propia regla: si CAMBIA EL ENUNCIADO y quien
    // edita no manda respuesta, la guardada ya no es la respuesta de este
    // ejercicio, sino la del anterior. Compararla sería rechazar la edición por
    // un dato que el propio servidor sabe caduco. Con motor se recalcula; sin
    // motor se conserva, porque no hay nada con qué recalcularla.
    const fusionado = {
      enunciado: datos.enunciado ?? actual.enunciado,
      plantilla: datos.plantilla ?? actual.plantilla,
      respuestaFormula:
        datos.respuestaFormula !== undefined ? datos.respuestaFormula : actual.respuestaFormula,
      parametros: (datos.parametros ?? (actual.parametros as unknown)) as Parametro[],
      pistas: datos.pistas ?? actual.pistas,
      nivel: datos.nivel ?? actual.nivel,
      estado: datos.estado ?? actual.estado,
    };

    const cambiaEnunciado =
      datos.enunciado !== undefined && datos.enunciado.trim() !== actual.enunciado;

    const respuestaDeclarada =
      datos.respuestaCorrecta !== undefined
        ? datos.respuestaCorrecta
        : cambiaEnunciado && motor
          ? null
          : actual.respuestaCorrecta;

    const informe = validarEjercicio({
      enunciado: fusionado.enunciado,
      // En una plantilla la verdad la da la fórmula, no la respuesta guardada:
      // pasarla haría comparar la respuesta de una combinación contra otra.
      respuestaCorrecta: fusionado.plantilla ? null : respuestaDeclarada,
      respuestaFormula: fusionado.respuestaFormula,
      plantilla: fusionado.plantilla,
      parametros: fusionado.parametros ?? [],
      motor,
      pistas: fusionado.pistas,
    });

    if (!informe.valido) {
      return NextResponse.json(
        { error: informe.errores[0] ?? "El ejercicio no supera la validación.", informe },
        { status: 422 },
      );
    }

    const campos = camposDeValidacion(informe);
    const ejercicio = await prisma.ejercicio.update({
      where: { id },
      data: {
        ...(datos.nodoId !== undefined ? { nodoId: datos.nodoId } : {}),
        motor,
        nivel: fusionado.nivel,
        enunciado: fusionado.enunciado,
        respuestaCorrecta: campos.respuestaCorrecta,
        plantilla: fusionado.plantilla,
        ...(datos.parametros !== undefined
          ? { parametros: datos.parametros as unknown as Prisma.InputJsonValue }
          : {}),
        ...(datos.respuestaFormula !== undefined
          ? { respuestaFormula: datos.respuestaFormula ?? null }
          : {}),
        ...(datos.pistas !== undefined ? { pistas: datos.pistas } : {}),
        ...(datos.estado !== undefined ? { estado: datos.estado } : {}),
        pasos: pasosJson(informe.muestras[0]?.enunciado ?? fusionado.enunciado, motor),
        validado: campos.validado,
        validadoEn: campos.validadoEn,
        informeValidacion: campos.informeValidacion as unknown as Prisma.InputJsonValue,
      },
      select: SELECCION_EJERCICIO,
    });

    return NextResponse.json({ ejercicio, informe });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return conflicto(
        "Ya existe en el banco un ejercicio con ese enunciado para el mismo motor y nivel.",
      );
    }
    return fallo(e, "docente/ejercicios:editar");
  }
}

/**
 * Borrado de un ejercicio.
 *
 * Si algún alumno ya lo ha respondido, no se borra: su historial de progreso
 * quedaría apuntando a un ejercicio que nadie puede leer, y el informe del
 * HITO 4 tendría filas sin enunciado. Se le ofrece archivarlo, que lo retira
 * del banco activo sin tocar el pasado.
 */
export async function DELETE(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;

  try {
    const ejercicio = await prisma.ejercicio.findUnique({
      where: { id },
      select: { id: true, _count: { select: { progreso: true } } },
    });
    if (!ejercicio) return noEncontrado("El ejercicio");

    if (ejercicio._count.progreso > 0) {
      return conflicto(
        `Este ejercicio ya lo han respondido ${ejercicio._count.progreso} vez/veces. Archívalo en lugar de borrarlo para no romper el historial de los alumnos.`,
      );
    }

    await prisma.ejercicio.delete({ where: { id } });
    return NextResponse.json({ borrado: true });
  } catch (e) {
    return fallo(e, "docente/ejercicios:borrar");
  }
}
