import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado, puedeLeerDeInstitucion } from "@/lib/docente/api";
import { fichaSchema } from "@/lib/docente/fichas-metodo";
import { OPERACIONES_SOPORTADAS, verificarFicha } from "@/lib/docente/fichas-verificar";
import { permiteIntento } from "@/lib/seguridad/limite-tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pruebaSchema = z.object({
  nodoId: z.string().min(1, "Falta el tema").max(40),
  ficha: fichaSchema,
  /** Cuántos casos adicionales genera el servidor (0–20). */
  generados: z.number().int().min(0).max(20).optional(),
});

/**
 * `POST /api/docente/fichas-metodo/probar` — el botón «Probar» del editor: verifica
 * una ficha SIN guardarla (ejemplos, casos generados, operaciones y pendientes).
 */
export async function POST(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const tasa = permiteIntento(`fichas-probar:${permiso.quien.usuarioId}`, 60, 10 * 60_000);
  if (!tasa.permitido) {
    return NextResponse.json({ error: "Demasiadas pruebas seguidas. Espera un momento." }, { status: 429 });
  }

  const cuerpo = await leerCuerpo(req, pruebaSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  try {
    const tema = await prisma.nodoConocimiento.findUnique({
      where: { id: cuerpo.datos.nodoId },
      select: { id: true, motor: true, institucionId: true },
    });
    if (!tema || !puedeLeerDeInstitucion(permiso.quien, tema.institucionId)) return noEncontrado("El tema");
    const informe = verificarFicha({ motor: tema.motor, ficha: cuerpo.datos.ficha }, { generados: cuerpo.datos.generados });
    return NextResponse.json({ informe });
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:probar");
  }
}

/** Catálogo de operaciones que el motor de cada tema sabe comprobar (para el editor). */
export async function GET() {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  return NextResponse.json({ operaciones: OPERACIONES_SOPORTADAS });
}
