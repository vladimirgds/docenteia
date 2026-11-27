import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado, puedeLeerDeInstitucion } from "@/lib/docente/api";
import { ambitoParaCrear } from "@/lib/docente/bancos";
import { ESTADOS } from "@/lib/docente/curriculo";
import { fichaSchema } from "@/lib/docente/fichas-metodo";
import { SELECCION_FICHA, camposDeInformeFicha, dondeFichasVisibles } from "@/lib/docente/fichas-servidor";
import { verificarFicha } from "@/lib/docente/fichas-verificar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FICHAS DE MÉTODO — listado y alta (PMV 3 · Hito 5A).
 *
 * El docente define aquí cuándo se aplica un método, qué pasos sigue y qué pistas
 * ofrece, sin tocar código ni desplegar. Guardar un borrador a medias SIEMPRE se
 * puede (el informe señala los fallos); lo que no se puede es PUBLICAR sin
 * verificación y sin la aprobación expresa del docente (ver PATCH de `[id]`).
 */

const altaSchema = z.object({
  nodoId: z.string().min(1, "Falta el tema").max(40),
  ficha: fichaSchema,
});

export async function GET(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const url = new URL(req.url);
  const nodoId = url.searchParams.get("nodoId");
  const estado = url.searchParams.get("estado");

  const where: Prisma.FichaMetodoWhereInput = {};
  if (nodoId) where.nodoId = nodoId;
  if (estado && (ESTADOS as readonly string[]).includes(estado)) where.estado = estado as (typeof ESTADOS)[number];
  if (url.searchParams.get("banco") === "propio") {
    where.ambito = "DOCENTE";
    where.autorId = permiso.quien.usuarioId;
  }

  try {
    const fichas = await prisma.fichaMetodo.findMany({
      where: { AND: [where, dondeFichasVisibles(permiso.quien)] },
      orderBy: { actualizadoEn: "desc" },
      select: SELECCION_FICHA,
      take: 200,
    });
    return NextResponse.json({ fichas });
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;

  const cuerpo = await leerCuerpo(req, altaSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const { nodoId, ficha } = cuerpo.datos;

  try {
    const tema = await prisma.nodoConocimiento.findUnique({
      where: { id: nodoId },
      select: { id: true, motor: true, institucionId: true },
    });
    if (!tema || !puedeLeerDeInstitucion(quien, tema.institucionId)) return noEncontrado("El tema");

    const informe = verificarFicha({ motor: tema.motor, ficha });
    const campos = camposDeInformeFicha(informe);

    const creada = await prisma.$transaction(async (tx) => {
      const f = await tx.fichaMetodo.create({
        data: {
          nodoId: tema.id,
          institucionId: tema.institucionId,
          motor: tema.motor,
          titulo: ficha.titulo,
          contenido: ficha as unknown as Prisma.InputJsonValue,
          version: 1,
          origen: "DOCENTE",
          ambito: ambitoParaCrear(quien),
          // Siempre nace como borrador: publicar es una acción aparte, con su regla.
          estado: "BORRADOR",
          autorId: quien.usuarioId,
          ...campos,
        },
        select: SELECCION_FICHA,
      });
      await tx.fichaMetodoVersion.create({
        data: {
          fichaId: f.id,
          version: 1,
          contenido: ficha as unknown as Prisma.InputJsonValue,
          nota: "Creada",
          autorId: quien.usuarioId,
          ...campos,
        },
      });
      return f;
    });

    return NextResponse.json({ ficha: creada, informe }, { status: 201 });
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:crear");
  }
}
