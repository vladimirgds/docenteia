import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { puedeEscribirEjercicio } from "@/lib/docente/bancos";
import { leerFicha } from "@/lib/docente/fichas-metodo";
import { SELECCION_FICHA, camposDeInformeFicha, dondeFichasVisibles } from "@/lib/docente/fichas-servidor";
import { verificarFicha } from "@/lib/docente/fichas-verificar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/**
 * HISTORIAL DE VERSIONES de una ficha.
 *
 *   · GET            → la lista (versión, nota, quién, cuándo, si estaba verificada).
 *   · GET ?version=N → el contenido completo de esa versión.
 *   · POST {version} → RESTAURA una versión antigua: no se reescribe el pasado, se
 *     crea una versión NUEVA con ese contenido (y se vuelve a verificar).
 */

export async function GET(req: Request, { params }: Contexto) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;
  const version = Number(new URL(req.url).searchParams.get("version"));
  try {
    const ficha = await prisma.fichaMetodo.findFirst({
      where: { AND: [{ id }, dondeFichasVisibles(permiso.quien)] },
      select: { id: true, version: true, publicadaVersion: true },
    });
    if (!ficha) return noEncontrado("La ficha");

    if (Number.isInteger(version) && version > 0) {
      const v = await prisma.fichaMetodoVersion.findUnique({
        where: { fichaId_version: { fichaId: id, version } },
        include: { autor: { select: { id: true, nombre: true } } },
      });
      if (!v) return noEncontrado("La versión");
      return NextResponse.json({ version: v });
    }

    const versiones = await prisma.fichaMetodoVersion.findMany({
      where: { fichaId: id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        nota: true,
        verificada: true,
        pendienteValidacion: true,
        creadoEn: true,
        autor: { select: { id: true, nombre: true } },
      },
    });
    return NextResponse.json({ actual: ficha.version, publicada: ficha.publicadaVersion, versiones });
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:versiones");
  }
}

const restaurarSchema = z.object({ version: z.number().int().min(1) });

export async function POST(req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;
  const { id } = await params;

  const cuerpo = await leerCuerpo(req, restaurarSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ficha-metodo'), hashtext(${id}))`;
      const actual = await tx.fichaMetodo.findUnique({ where: { id } });
      if (!actual || !puedeEscribirEjercicio(quien, actual)) return null;
      const antigua = await tx.fichaMetodoVersion.findUnique({
        where: { fichaId_version: { fichaId: id, version: cuerpo.datos.version } },
      });
      if (!antigua) return "sin-version" as const;
      const ficha = leerFicha(antigua.contenido);
      if (!ficha) return "ilegible" as const;

      const informe = verificarFicha({ motor: actual.motor, ficha });
      const campos = camposDeInformeFicha(informe);
      const version = actual.version + 1;
      const f = await tx.fichaMetodo.update({
        where: { id },
        data: { titulo: ficha.titulo, contenido: ficha as unknown as Prisma.InputJsonValue, version, ...campos },
        select: SELECCION_FICHA,
      });
      await tx.fichaMetodoVersion.create({
        data: {
          fichaId: id,
          version,
          contenido: ficha as unknown as Prisma.InputJsonValue,
          nota: `Restaurada de la versión ${cuerpo.datos.version}`,
          autorId: quien.usuarioId,
          ...campos,
        },
      });
      return { ficha: f, informe };
    });
    if (resultado === null) return noEncontrado("La ficha");
    if (resultado === "sin-version") return noEncontrado("La versión");
    if (resultado === "ilegible") return NextResponse.json({ error: "Esa versión no se puede leer." }, { status: 422 });
    return NextResponse.json(resultado, { status: 201 });
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:restaurar");
  }
}
