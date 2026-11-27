import { NextResponse } from "next/server";
import { z } from "zod";

import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { exigirEstudiante } from "@/lib/pizarra/servidor";
import { permiteIntento } from "@/lib/seguridad/limite-tasa";
import { enviarPaso } from "@/lib/tutoria/practica-guiada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({ paso: z.string().min(1).max(200) });

/**
 * `POST /api/estudiante/practica-guiada/[id]/paso` — el alumno escribe su
 * siguiente paso. El servidor lo valida contra el anterior, decide la ayuda y la
 * devuelve ya filtrada por la política de revelación.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;
  const { id } = await params;

  const tasa = permiteIntento(`practica-guiada:paso:${e.estudianteId}`, 120, 60_000);
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
  if (!r.success) return NextResponse.json({ error: "Escribe tu paso." }, { status: 400 });

  try {
    const res = await enviarPaso(e.estudianteId, id, r.data.paso);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res.respuesta);
  } catch (err) {
    const infra = explicarFalloDeBaseDeDatos(err);
    if (infra) return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    console.error("[practica-guiada:paso]", err);
    return NextResponse.json({ error: "No se pudo comprobar el paso." }, { status: 500 });
  }
}
