import { NextResponse } from "next/server";

import { exigirDocente } from "@/lib/docente/api";
import { MAX_PASOS, MAX_TERMINOS_POR_PASO, TIPOS_PASO } from "@/lib/docente/procedimientos";
import { SOPORTE_VERIFICACION } from "@/lib/docente/verificar-pasos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/docente/procedimientos/soporte` — qué pasos matemáticos sabe
 * verificar el servidor, para que el editor se lo diga al docente ANTES de que
 * escriba. Lo que no está aquí se guarda, pero «sin verificar» y sin poder
 * publicarse (salvo que el autor lo confirme expresamente).
 */
export async function GET() {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  return NextResponse.json({
    motores: SOPORTE_VERIFICACION,
    tiposDePaso: TIPOS_PASO,
    limites: { pasos: MAX_PASOS, terminosPorPaso: MAX_TERMINOS_POR_PASO },
  });
}
