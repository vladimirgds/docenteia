import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { habilidadActualizacionSchema } from "@/lib/docente/habilidades";
import {
  SELECCION_HABILIDAD,
  dondeHabilidadesVisibles,
  guardarPrerrequisitos,
  repasoValido,
} from "@/lib/docente/habilidades-servidor";
import { OPCIONES_TX } from "@/lib/docente/evaluacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PMV 3 · H4 — Editar una habilidad: nombre, repaso y PRERREQUISITOS (sin ciclos: 409). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;
  const cuerpo = await leerCuerpo(req, habilidadActualizacionSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const d = cuerpo.datos;
  const quien = permiso.quien;

  try {
    const h = await prisma.habilidad.findFirst({ where: { AND: [{ id }, dondeHabilidadesVisibles(quien)] }, select: { id: true } });
    if (!h) return noEncontrado("La habilidad");
    if (!(await repasoValido(quien, d.repasoId))) {
      return NextResponse.json({ error: "El repaso tiene que ser un procedimiento publicado que puedas ver." }, { status: 400 });
    }
    const r = await prisma.$transaction(async (tx) => {
      await tx.habilidad.update({
        where: { id },
        data: {
          ...(d.nombre !== undefined ? { nombre: d.nombre } : {}),
          ...(d.descripcion !== undefined ? { descripcion: d.descripcion } : {}),
          ...(d.nodoId !== undefined ? { nodoId: d.nodoId } : {}),
          ...(d.repasoId !== undefined ? { repasoId: d.repasoId } : {}),
        },
      });
      if (d.requiere !== undefined) {
        const p = await guardarPrerrequisitos(tx, quien, id, d.requiere);
        if (!p.ok) throw Object.assign(new Error(p.error), { http: p });
      }
      return tx.habilidad.findUniqueOrThrow({ where: { id }, select: SELECCION_HABILIDAD });
    }, OPCIONES_TX);
    return NextResponse.json({ habilidad: r });
  } catch (e) {
    const http = (e as { http?: { status: number; error: string; ciclo?: string[] } }).http;
    if (http) return NextResponse.json({ error: http.error, ciclo: http.ciclo }, { status: http.status });
    return fallo(e, "docente/habilidades:editar");
  }
}
