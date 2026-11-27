import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo } from "@/lib/docente/api";
import { habilidadSchema } from "@/lib/docente/habilidades";
import {
  SELECCION_HABILIDAD,
  dondeHabilidadesVisibles,
  guardarPrerrequisitos,
  repasoValido,
} from "@/lib/docente/habilidades-servidor";
import { OPCIONES_TX } from "@/lib/docente/evaluacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PMV 3 · H4 — Habilidades del docente, con sus prerrequisitos. */
export async function GET() {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  try {
    const habilidades = await prisma.habilidad.findMany({
      where: dondeHabilidadesVisibles(permiso.quien),
      orderBy: { nombre: "asc" },
      select: SELECCION_HABILIDAD,
      take: 500,
    });
    return NextResponse.json({ habilidades });
  } catch (e) {
    return fallo(e, "docente/habilidades:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const cuerpo = await leerCuerpo(req, habilidadSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const d = cuerpo.datos;
  const quien = permiso.quien;

  try {
    if (!(await repasoValido(quien, d.repasoId))) {
      return NextResponse.json({ error: "El repaso tiene que ser un procedimiento publicado que puedas ver." }, { status: 400 });
    }
    if (await prisma.habilidad.findUnique({ where: { autorId_clave: { autorId: quien.usuarioId, clave: d.clave } } })) {
      return NextResponse.json({ error: `Ya tienes una habilidad con la clave «${d.clave}».` }, { status: 409 });
    }
    const r = await prisma.$transaction(async (tx) => {
      const h = await tx.habilidad.create({
        data: {
          clave: d.clave,
          nombre: d.nombre,
          descripcion: d.descripcion ?? null,
          nodoId: d.nodoId ?? null,
          repasoId: d.repasoId ?? null,
          autorId: quien.usuarioId,
          institucionId: quien.institucionId,
        },
      });
      const p = await guardarPrerrequisitos(tx, quien, h.id, d.requiere ?? []);
      if (!p.ok) throw Object.assign(new Error(p.error), { http: p });
      return tx.habilidad.findUniqueOrThrow({ where: { id: h.id }, select: SELECCION_HABILIDAD });
    }, OPCIONES_TX);
    return NextResponse.json({ habilidad: r }, { status: 201 });
  } catch (e) {
    const http = (e as { http?: { status: number; error: string; ciclo?: string[] } }).http;
    if (http) return NextResponse.json({ error: http.error, ciclo: http.ciclo }, { status: http.status });
    return fallo(e, "docente/habilidades:crear");
  }
}
