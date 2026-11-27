import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { dondeHabilidadesVisibles } from "@/lib/docente/habilidades-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cuerpoSchema = z.object({ ejercicioId: z.string().trim().min(1), quitar: z.boolean().optional() });

/**
 * PMV 3 · H4 — Enlaza (o desenlaza, `quitar: true`) un ejercicio del banco
 * PROPIO del docente con una de SUS habilidades.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;
  const cuerpo = await leerCuerpo(req, cuerpoSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const quien = permiso.quien;

  try {
    const h = await prisma.habilidad.findFirst({ where: { AND: [{ id }, dondeHabilidadesVisibles(quien)] }, select: { id: true } });
    if (!h) return noEncontrado("La habilidad");
    const ej = await prisma.ejercicio.findFirst({
      where: { id: cuerpo.datos.ejercicioId, ...(quien.rol === "SUPERADMIN" ? {} : { autorId: quien.usuarioId }) },
      select: { id: true, habilidadId: true },
    });
    if (!ej) return noEncontrado("El ejercicio");
    if (cuerpo.datos.quitar && ej.habilidadId !== id) return NextResponse.json({ ejercicio: ej });
    const actualizado = await prisma.ejercicio.update({
      where: { id: ej.id },
      data: { habilidadId: cuerpo.datos.quitar ? null : id },
      select: { id: true, habilidadId: true },
    });
    return NextResponse.json({ ejercicio: actualizado });
  } catch (e) {
    return fallo(e, "docente/habilidades:ejercicios");
  }
}
