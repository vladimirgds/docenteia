import { NextResponse } from "next/server";
import { z } from "zod";

import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { exigirEstudiante } from "@/lib/pizarra/servidor";
import { permiteIntento } from "@/lib/seguridad/limite-tasa";
import { MODOS_ELEGIBLES, crearPractica } from "@/lib/tutoria/practica-guiada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({
  enunciado: z.string().min(1).max(200),
  modo: z.enum(MODOS_ELEGIBLES as [string, ...string[]]).optional(),
});

/**
 * `POST /api/estudiante/practica-guiada` — abre una práctica guiada sobre una
 * ecuación. El servidor lee el modo (por defecto, práctica guiada) y desde aquí
 * decide qué ayuda se entrega en cada paso.
 */
export async function POST(req: Request) {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;

  const tasa = permiteIntento(`practica-guiada:crear:${e.estudianteId}`, 30, 10 * 60_000);
  if (!tasa.permitido) {
    return NextResponse.json({ error: "Demasiadas prácticas seguidas. Espera un momento." }, { status: 429 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  const r = esquema.safeParse(cuerpo);
  if (!r.success) return NextResponse.json({ error: "Escribe la ecuación que quieres practicar." }, { status: 400 });

  try {
    const res = await crearPractica(e.estudianteId, r.data.enunciado, (r.data.modo ?? "PRACTICA_GUIADA") as never);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });
    return NextResponse.json(res.respuesta, { status: 201 });
  } catch (err) {
    const infra = explicarFalloDeBaseDeDatos(err);
    if (infra) return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    console.error("[practica-guiada:crear]", err);
    return NextResponse.json({ error: "No se pudo abrir la práctica." }, { status: 500 });
  }
}
