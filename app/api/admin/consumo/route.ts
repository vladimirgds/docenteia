import { NextResponse } from "next/server";

import { exigirSuperadmin } from "@/lib/admin/api";
import { fallo } from "@/lib/docente/api";
import { resumenConsumo } from "@/lib/consumo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/consumo?dias=30 — PMV 3 · H5B: cuánto se ha gastado en IA
 * (tokens de entrada y salida por modelo) y en voz (caracteres sintetizados),
 * por parte de la aplicación. Sólo SUPERADMIN.
 */
export async function GET(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;
  const dias = Math.min(366, Math.max(1, Number(new URL(req.url).searchParams.get("dias")) || 30));
  try {
    return NextResponse.json({ dias, ...(await resumenConsumo(new Date(Date.now() - dias * 86_400_000))) });
  } catch (e) {
    return fallo(e, "admin/consumo");
  }
}
