import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  exigirDocente,
  fallo,
  leerCuerpo,
  noEncontrado,
  puedeLeerDeInstitucion,
} from "@/lib/docente/api";
import { ambitoParaCrear } from "@/lib/docente/bancos";
import { ESTADOS } from "@/lib/docente/curriculo";
import { TIPOS_PROCEDIMIENTO, procedimientoSchema } from "@/lib/docente/procedimientos";
import {
  SELECCION_PROCEDIMIENTO,
  camposDeVerificacion,
  dondeProcedimientosVisibles,
} from "@/lib/docente/procedimientos-servidor";
import { verificarPasos } from "@/lib/docente/verificar-pasos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PROCEDIMIENTOS DIDÁCTICOS — listado y alta.
 *
 * El docente define aquí reglas, métodos y procedimientos sin tocar código. La
 * regla que lo gobierna: TODO SE VERIFICA ANTES DE GUARDAR, pero guardar un
 * borrador a medias SIEMPRE se puede —un editor que no deja guardar mientras
 * hay un paso mal es un editor que pierde el trabajo—. Lo que no se puede es
 * PUBLICAR sin verificación (ver PATCH de `[id]`).
 */

export async function GET(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const url = new URL(req.url);
  const nodoId = url.searchParams.get("nodoId");
  const estado = url.searchParams.get("estado");
  const tipo = url.searchParams.get("tipo");
  const propios = url.searchParams.get("banco") === "propio";

  const where: Prisma.ProcedimientoWhereInput = {};
  if (nodoId) where.nodoId = nodoId;
  if (estado && (ESTADOS as readonly string[]).includes(estado)) where.estado = estado as (typeof ESTADOS)[number];
  if (tipo && (TIPOS_PROCEDIMIENTO as readonly string[]).includes(tipo)) {
    where.tipo = tipo as (typeof TIPOS_PROCEDIMIENTO)[number];
  }
  if (propios) {
    where.ambito = "DOCENTE";
    where.autorId = permiso.quien.usuarioId;
  }

  try {
    const procedimientos = await prisma.procedimiento.findMany({
      where: { AND: [where, dondeProcedimientosVisibles(permiso.quien)] },
      orderBy: { actualizadoEn: "desc" },
      select: SELECCION_PROCEDIMIENTO,
      take: 200,
    });
    return NextResponse.json({ procedimientos });
  } catch (e) {
    return fallo(e, "docente/procedimientos:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;

  const cuerpo = await leerCuerpo(req, procedimientoSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const tema = await prisma.nodoConocimiento.findUnique({
      where: { id: datos.nodoId },
      select: { id: true, motor: true, institucionId: true },
    });
    if (!tema || !puedeLeerDeInstitucion(quien, tema.institucionId)) return noEncontrado("El tema");

    const informe = verificarPasos({ motor: tema.motor, ejemplo: datos.ejemplo, pasos: datos.pasos });
    const campos = camposDeVerificacion(informe);

    // Un repaso enlazado tiene que ser legible por quien lo enlaza.
    if (datos.repasoId) {
      const repaso = await prisma.procedimiento.findFirst({
        where: { AND: [{ id: datos.repasoId }, dondeProcedimientosVisibles(quien)] },
        select: { id: true },
      });
      if (!repaso) return noEncontrado("El procedimiento de repaso");
    }

    const creado = await prisma.procedimiento.create({
      data: {
        nodoId: tema.id,
        institucionId: tema.institucionId,
        motor: tema.motor,
        tipo: datos.tipo,
        titulo: datos.titulo,
        descripcion: datos.descripcion ?? null,
        ejemplo: datos.ejemplo,
        pasos: datos.pasos as unknown as Prisma.InputJsonValue,
        preguntas: (datos.preguntas ?? []) as unknown as Prisma.InputJsonValue,
        pistas: datos.pistas ?? [],
        repasoId: datos.repasoId ?? null,
        origen: "DOCENTE",
        ambito: ambitoParaCrear(quien),
        // Siempre nace como borrador: publicar es una acción aparte, con su regla.
        estado: "BORRADOR",
        autorId: quien.usuarioId,
        ...campos,
      },
      select: SELECCION_PROCEDIMIENTO,
    });

    return NextResponse.json({ procedimiento: creado, informe }, { status: 201 });
  } catch (e) {
    return fallo(e, "docente/procedimientos:crear");
  }
}
