import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { accesoATutoria } from "@/lib/tutoria/acceso";
import { cerrarRepaso } from "@/lib/tutoria/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST …/ejercicios/[ejercicioId]/repaso` — el alumno ha terminado el repaso
 * breve y vuelve al ejercicio original.
 *
 * Sólo tiene efecto si la sesión de tutoría TENÍA un repaso abierto: el
 * servidor lo comprueba (si no, responde «continuar» y no cambia nada). Así un
 * navegador no puede «cerrar» un repaso que no se abrió para reiniciar a su
 * antojo el contador de errores.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; ejercicioId: string }> }) {
  const { id, ejercicioId } = await params;
  const a = await accesoATutoria(id, ejercicioId);
  if (!a.ok) return a.respuesta;

  const sesion = await prisma.sesionTutoria.findUnique({
    where: { estudianteId_tareaId_ejercicioId: { estudianteId: a.estudianteId, tareaId: id, ejercicioId } },
    select: { fase: true },
  });
  if (sesion?.fase !== "REPASO") {
    return NextResponse.json({ tutor: { accion: "CONTINUAR", mensaje: "" } });
  }
  return NextResponse.json({ tutor: await cerrarRepaso(a.estudianteId, a.tarea, a.ejercicio) });
}
