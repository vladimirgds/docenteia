import { NextResponse } from "next/server";

import { exigirDocente, fallo } from "@/lib/docente/api";
import { resumenDeBancos } from "@/lib/docente/resumen-bancos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/docente/bancos` — el banco privado de quien pregunta, tema por tema,
 * junto a lo que hay en el catálogo maestro.
 *
 * Es de LECTURA para DOCENTE, DIRECTOR y SUPERADMIN, pero nunca devuelve el
 * banco de otro: el resumen siempre se calcula sobre la sesión, no sobre un
 * parámetro. No hay `?docenteId=`: no existe forma de pedir el banco ajeno.
 */
export async function GET() {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  try {
    const bancos = await resumenDeBancos(permiso.quien);
    return NextResponse.json({
      bancos,
      totales: {
        temas: bancos.length,
        catalogoPublicados: bancos.reduce((n, b) => n + b.catalogo.publicados, 0),
        propios: bancos.reduce((n, b) => n + b.propio.total, 0),
        borradoresIA: bancos.reduce((n, b) => n + b.propio.borradoresIA, 0),
      },
    });
  } catch (e) {
    return fallo(e, "docente/bancos:listar");
  }
}
