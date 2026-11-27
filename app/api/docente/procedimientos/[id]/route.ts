import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  conflicto,
  exigirDocente,
  fallo,
  leerCuerpo,
  noEncontrado,
  puedeLeerDeInstitucion,
} from "@/lib/docente/api";
import { puedeEscribirEjercicio, puedeLeerEjercicio } from "@/lib/docente/bancos";
import {
  leerPasos,
  procedimientoActualizacionSchema,
} from "@/lib/docente/procedimientos";
import {
  SELECCION_PROCEDIMIENTO,
  camposDeVerificacion,
  dondeProcedimientosVisibles,
} from "@/lib/docente/procedimientos-servidor";
import { verificarPasos } from "@/lib/docente/verificar-pasos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

const edicionSchema = procedimientoActualizacionSchema.extend({
  /** Publicar algo que el servidor no ha podido verificar exige decirlo expresamente. */
  confirmarSinVerificar: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;
  try {
    const p = await prisma.procedimiento.findFirst({
      where: { AND: [{ id }, dondeProcedimientosVisibles(permiso.quien)] },
      select: SELECCION_PROCEDIMIENTO,
    });
    if (!p) return noEncontrado("El procedimiento");
    return NextResponse.json({ procedimiento: p });
  } catch (e) {
    return fallo(e, "docente/procedimientos:leer");
  }
}

export async function PATCH(req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;
  const { id } = await params;

  const cuerpo = await leerCuerpo(req, edicionSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const actual = await prisma.procedimiento.findUnique({ where: { id } });
    // 404, no 403: el procedimiento privado de otro docente no existe para ti.
    if (!actual || !puedeEscribirEjercicio(quien, actual)) return noEncontrado("El procedimiento");

    // El tema (y con él el motor) puede cambiar; se vuelve a leer y a comprobar.
    let motor = actual.motor;
    let institucionId = actual.institucionId;
    const nodoId = datos.nodoId ?? actual.nodoId;
    if (datos.nodoId && datos.nodoId !== actual.nodoId) {
      const tema = await prisma.nodoConocimiento.findUnique({
        where: { id: datos.nodoId },
        select: { motor: true, institucionId: true },
      });
      if (!tema || !puedeLeerDeInstitucion(quien, tema.institucionId)) return noEncontrado("El tema");
      motor = tema.motor;
      institucionId = tema.institucionId;
    }

    if (datos.repasoId) {
      if (datos.repasoId === id) return conflicto("Un procedimiento no puede ser su propio repaso.");
      const repaso = await prisma.procedimiento.findFirst({
        where: { AND: [{ id: datos.repasoId }, dondeProcedimientosVisibles(quien)] },
        select: { id: true },
      });
      if (!repaso) return noEncontrado("El procedimiento de repaso");
    }

    const ejemplo = datos.ejemplo ?? actual.ejemplo;
    const pasos = datos.pasos ?? leerPasos(actual.pasos);
    // SE VUELVE A VERIFICAR SIEMPRE: cambiar un solo paso puede invalidar todo.
    const informe = verificarPasos({ motor, ejemplo, pasos });
    const campos = camposDeVerificacion(informe);

    const estadoNuevo = datos.estado ?? actual.estado;
    const publica = estadoNuevo === "PUBLICADO" && actual.estado !== "PUBLICADO";
    if (estadoNuevo === "PUBLICADO") {
      if (!informe.valido) {
        return NextResponse.json(
          { error: informe.errores[0] ?? "El procedimiento tiene errores y no se puede publicar.", informe },
          { status: 422 },
        );
      }
      if (!informe.verificado) {
        // Un borrador de IA NUNCA se publica sin verificar; uno escrito a mano,
        // sólo si su autor lo confirma a sabiendas.
        const humano = actual.origen !== "IA";
        if (!humano || !datos.confirmarSinVerificar) {
          return NextResponse.json(
            {
              error: humano
                ? "El servidor no ha podido verificar todos los pasos. Revísalos, o publica confirmando expresamente que lo harás sin verificar."
                : "Este borrador lo generó la IA y el servidor no ha podido verificarlo: corrígelo hasta que quede verificado antes de publicarlo.",
              informe,
              requiereConfirmacion: humano,
            },
            { status: 422 },
          );
        }
      }
    }

    const actualizado = await prisma.procedimiento.update({
      where: { id },
      data: {
        nodoId,
        motor,
        institucionId,
        ...(datos.tipo ? { tipo: datos.tipo } : {}),
        ...(datos.titulo ? { titulo: datos.titulo } : {}),
        ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion } : {}),
        ejemplo,
        pasos: pasos as unknown as Prisma.InputJsonValue,
        ...(datos.preguntas !== undefined ? { preguntas: datos.preguntas as unknown as Prisma.InputJsonValue } : {}),
        ...(datos.pistas !== undefined ? { pistas: datos.pistas } : {}),
        ...(datos.repasoId !== undefined ? { repasoId: datos.repasoId } : {}),
        estado: estadoNuevo,
        ...campos,
        ...(publica && actual.origen === "IA"
          ? { revisadoPorId: quien.usuarioId, revisadoEn: new Date() }
          : {}),
      },
      select: SELECCION_PROCEDIMIENTO,
    });

    if (publica) {
      await prisma.logAuditoria.create({
        data: {
          usuarioId: quien.usuarioId,
          accion: "PROCEDIMIENTO_PUBLICADO",
          entidad: "Procedimiento",
          entidadId: id,
          datosNuevos: { verificado: informe.verificado, origen: actual.origen },
        },
      });
    }

    return NextResponse.json({ procedimiento: actualizado, informe });
  } catch (e) {
    return fallo(e, "docente/procedimientos:editar");
  }
}

export async function DELETE(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;
  try {
    const p = await prisma.procedimiento.findUnique({
      where: { id },
      select: { id: true, ambito: true, autorId: true, institucionId: true },
    });
    if (!p || !puedeLeerEjercicio(permiso.quien, p) || !puedeEscribirEjercicio(permiso.quien, p)) {
      return noEncontrado("El procedimiento");
    }
    await prisma.procedimiento.delete({ where: { id } });
    return NextResponse.json({ borrado: true });
  } catch (e) {
    return fallo(e, "docente/procedimientos:borrar");
  }
}
