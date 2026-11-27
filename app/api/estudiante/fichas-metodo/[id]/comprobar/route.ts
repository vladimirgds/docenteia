import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { leerFicha } from "@/lib/docente/fichas-metodo";
import { dondeFichasDelAlumno } from "@/lib/docente/fichas-servidor";
import { revisarRespuesta } from "@/lib/docente/fichas-verificar";
import { exigirEstudiante } from "@/lib/pizarra/servidor";
import { permiteIntento } from "@/lib/seguridad/limite-tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

const esquema = z.object({
  problema: z.string().trim().min(1).max(200),
  respuesta: z.string().trim().max(300),
  /** Cuántos intentos fallidos lleva en este problema: elige la pista general. */
  intentos: z.number().int().min(0).max(20).optional(),
});

/**
 * `POST /api/estudiante/fichas-metodo/[id]/comprobar` — el alumno responde un
 * problema que encaja con una ficha publicada. El servidor compara con lo que da
 * la ficha (el motor decide si son equivalentes) y, si falla, elige la pista:
 * primero la de un error concreto que reconozca (p. ej. «omitiste el factor de la
 * derivada interior») y si no, la siguiente pista general.
 *
 * NUNCA devuelve la respuesta correcta: eso es la política de revelación.
 */
export async function POST(req: Request, { params }: Contexto) {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;
  const { id } = await params;

  const tasa = permiteIntento(`fichas-comprobar:${e.estudianteId}`, 120, 10 * 60_000);
  if (!tasa.permitido) return NextResponse.json({ error: "Demasiados intentos seguidos. Espera un momento." }, { status: 429 });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  const r = esquema.safeParse(cuerpo);
  if (!r.success) return NextResponse.json({ error: "Escribe el problema y tu respuesta." }, { status: 400 });

  try {
    // 404 para lo que no es suyo: la ficha privada de un docente ajeno no existe para él.
    const ficha = await prisma.fichaMetodo.findFirst({
      where: { AND: [{ id }, dondeFichasDelAlumno(e.estudianteId)] },
      select: { id: true, publicadaVersion: true },
    });
    if (!ficha || ficha.publicadaVersion === null) return NextResponse.json({ error: "El método no existe o no está disponible." }, { status: 404 });
    const v = await prisma.fichaMetodoVersion.findUnique({
      where: { fichaId_version: { fichaId: id, version: ficha.publicadaVersion } },
      select: { contenido: true },
    });
    const contenido = v ? leerFicha(v.contenido) : null;
    if (!contenido) return NextResponse.json({ error: "El método no se puede leer ahora." }, { status: 422 });

    const rev = revisarRespuesta(contenido, r.data.problema, r.data.respuesta, r.data.intentos ?? 0);
    if (!rev.aplica) {
      return NextResponse.json({ aplica: false, mensaje: "Este método no se aplica a ese problema." }, { status: 200 });
    }
    return NextResponse.json({
      aplica: true,
      correcta: rev.correcta,
      pista: rev.pista ? { tipo: rev.pista.tipo, texto: rev.pista.texto } : null,
      version: ficha.publicadaVersion,
    });
  } catch (err) {
    const infra = explicarFalloDeBaseDeDatos(err);
    if (infra) return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    console.error("[estudiante/fichas-metodo:comprobar]", err);
    return NextResponse.json({ error: "No se pudo comprobar la respuesta." }, { status: 500 });
  }
}
