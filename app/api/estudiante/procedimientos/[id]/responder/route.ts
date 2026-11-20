import { NextResponse } from "next/server";
import { z } from "zod";

import { compararRespuesta } from "@/lib/matematicas/equivalencia";
import { leerPreguntas } from "@/lib/docente/procedimientos";
import { exigirEstudiante, procedimientoParaAlumno } from "@/lib/pizarra/servidor";
import { permiteIntento, segundosParaReintentar } from "@/lib/seguridad/limite-tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({
  pregunta: z.number().int().min(0).max(20),
  respuesta: z.string().trim().min(1, "Escribe tu respuesta").max(200),
});

/**
 * `POST /api/estudiante/procedimientos/[id]/responder` — el alumno contesta una
 * pregunta de comprensión, escribiéndola o dictándola (el navegador convierte la
 * voz en texto; aquí llega siempre texto).
 *
 * El servidor corrige con el mismo comparador que el resto de la plataforma
 * (acepta formas equivalentes: `3x+1` y `1+3x`) y devuelve sólo el veredicto:
 * la respuesta correcta no sale nunca de aquí.
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
  if (!r.success) {
    return NextResponse.json({ error: r.error.issues[0]?.message ?? "Petición no válida." }, { status: 400 });
  }

  const limite = permiteIntento(`pizarra-responder:${e.estudianteId}`, 60, 60_000);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "Vas muy deprisa. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(segundosParaReintentar(limite.reintentarEnMs)) } },
    );
  }

  const p = await procedimientoParaAlumno(id, e.estudianteId);
  if (!p) return NextResponse.json({ error: "Ese procedimiento no existe o no está disponible." }, { status: 404 });

  const pregunta = leerPreguntas(p.preguntas)[r.data.pregunta];
  if (!pregunta) return NextResponse.json({ error: "Esa pregunta no existe." }, { status: 404 });
  if (!pregunta.respuesta || !pregunta.respuesta.trim()) {
    // Una pregunta sin respuesta de referencia no se puede corregir: se dice, no se inventa.
    return NextResponse.json({ correcto: null, verificable: false });
  }

  const cmp = compararRespuesta(r.data.respuesta, pregunta.respuesta);
  return NextResponse.json({ correcto: cmp.correcto, verificable: cmp.conocido !== false });
}
