import { NextResponse } from "next/server";

import { exigirEstudiante } from "@/lib/pizarra/servidor";
import { leerPractica } from "@/lib/tutoria/practica-guiada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/estudiante/practica-guiada/[id]` — el estado de SU práctica (404 si es de otro). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await exigirEstudiante();
  if (!e.ok) return e.respuesta;
  const { id } = await params;
  const p = await leerPractica(e.estudianteId, id);
  if (!p) return NextResponse.json({ error: "Esa práctica no existe." }, { status: 404 });
  return NextResponse.json({ practica: p });
}
