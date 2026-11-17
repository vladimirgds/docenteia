import { NextResponse } from "next/server";

import { accesoATutoria } from "@/lib/tutoria/acceso";
import { pedirPista } from "@/lib/tutoria/servidor";
import { permiteIntento, segundosParaReintentar } from "@/lib/seguridad/limite-tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST …/ejercicios/[ejercicioId]/pista` — «dame una pista» en un ejercicio de
 * una tarea. Salen de una en una (la escalera la lleva el servidor: el alumno no
 * puede pedir «la 3» sin haber pasado por la 1 y la 2) y quedan registradas
 * para el informe del docente.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; ejercicioId: string }> }) {
  const { id, ejercicioId } = await params;
  const a = await accesoATutoria(id, ejercicioId);
  if (!a.ok) return a.respuesta;

  const limite = permiteIntento(`tutor-pista:${a.estudianteId}`, 40, 60_000);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "Vas muy deprisa. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(segundosParaReintentar(limite.reintentarEnMs)) } },
    );
  }
  return NextResponse.json({ tutor: await pedirPista(a.estudianteId, a.tarea, a.ejercicio) });
}
