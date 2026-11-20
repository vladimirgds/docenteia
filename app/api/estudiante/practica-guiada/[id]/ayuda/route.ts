import { NextResponse } from "next/server";
import { z } from "zod";

import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { exigirEstudiante } from "@/lib/pizarra/servidor";
import { permiteIntento } from "@/lib/seguridad/limite-tasa";
import { pedirAyuda } from "@/lib/tutoria/practica-guiada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({ tipo: z.enum(["PISTA", "SOLUCION", "EXPLICACION"]) });

/**
 * `POST /api/estudiante/practica-guiada/[id]/ayuda` — «una pista», «la solución»
 * o «explícamelo». El alumno pide; el orquestador decide qué recibe según el modo,
 * el paso y los intentos. Pedir la solución en práctica guiada NO la entrega.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;
  const { id } = await params;

  const tasa = permiteIntento(`practica-guiada:ayuda:${e.estudianteId}`, 120, 60_000);
  if (!tasa.permitido) {
    return NextResponse.json({ error: "Vas demasiado rápido. Respira un momento." }, { status: 429 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  const r = esquema.safeParse(cuerpo);
  if (!r.success) return NextResponse.json({ error: "Pide una pista, la solución o una explicación." }, { status: 400 });

  try {
    const res = await pedirAyuda(e.estudianteId, id, r.data.tipo);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res.respuesta);
  } catch (err) {
    const infra = explicarFalloDeBaseDeDatos(err);
    if (infra) return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    console.error("[practica-guiada:ayuda]", err);
    return NextResponse.json({ error: "No se pudo dar la ayuda." }, { status: 500 });
  }
}
