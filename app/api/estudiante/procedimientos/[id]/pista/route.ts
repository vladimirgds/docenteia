import { NextResponse } from "next/server";
import { z } from "zod";

import { leerPreguntas } from "@/lib/docente/procedimientos";
import { exigirEstudiante, procedimientoParaAlumno } from "@/lib/pizarra/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({
  /** Pregunta a la que se pide ayuda; sin ella, se piden las pistas generales. */
  pregunta: z.number().int().min(0).max(20).optional(),
  /** Qué pista, empezando en 0 (de la más suave a la más concreta). */
  nivel: z.number().int().min(0).max(10),
});

/**
 * `POST /api/estudiante/procedimientos/[id]/pista` — «dame una pista».
 *
 * Las pistas salen de UNA EN UNA, de la más suave a la más concreta, y el
 * servidor es quien las guarda: el navegador nunca recibe la lista entera.
 * Si se acaban, se dice (`quedan: 0`) en lugar de repetir la última.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;
  const { id } = await params;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  const r = esquema.safeParse(cuerpo);
  if (!r.success) return NextResponse.json({ error: "Petición no válida." }, { status: 400 });

  const p = await procedimientoParaAlumno(id, e.estudianteId);
  if (!p) return NextResponse.json({ error: "Ese procedimiento no existe o no está disponible." }, { status: 404 });

  let pistas = p.pistas;
  if (r.data.pregunta !== undefined) {
    const q = leerPreguntas(p.preguntas)[r.data.pregunta];
    if (!q) return NextResponse.json({ error: "Esa pregunta no existe." }, { status: 404 });
    // Las de la pregunta primero; si no tiene, las generales del procedimiento.
    pistas = q.pistas && q.pistas.length > 0 ? q.pistas : p.pistas;
  }

  const pista = pistas[r.data.nivel];
  if (pista === undefined) {
    return NextResponse.json({ pista: null, quedan: 0, mensaje: "No hay más pistas. Prueba a repetir la explicación." });
  }
  return NextResponse.json({ pista, quedan: pistas.length - r.data.nivel - 1 });
}
