import { NextResponse } from "next/server";
import { z } from "zod";

import { accesoATutoria } from "@/lib/tutoria/acceso";
import { responderEquivalente } from "@/lib/tutoria/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({
  equivalenteId: z.string().min(1).max(40),
  respuesta: z.string().trim().min(1, "Escribe tu respuesta").max(200),
});

/**
 * `POST …/ejercicios/[ejercicioId]/equivalente` — corrige el ejercicio
 * EQUIVALENTE que el tutor propuso. Sólo corrige el que se le propuso a este
 * alumno en esta sesión: no es una puerta para comprobar respuestas de
 * ejercicios cualesquiera. No cuenta para la nota de la tarea.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; ejercicioId: string }> }) {
  const { id, ejercicioId } = await params;
  const a = await accesoATutoria(id, ejercicioId);
  if (!a.ok) return a.respuesta;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  const r = esquema.safeParse(cuerpo);
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? "Petición no válida." }, { status: 400 });

  const resultado = await responderEquivalente(a.estudianteId, a.tarea, a.ejercicio, r.data.equivalenteId, r.data.respuesta);
  if (!resultado) {
    return NextResponse.json({ error: "Ese ejercicio no se te ha propuesto." }, { status: 404 });
  }
  return NextResponse.json(resultado);
}
