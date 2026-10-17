import { NextResponse } from "next/server";

import { exigirDocente, fallo } from "@/lib/docente/api";
import { obtenerReporteDocente } from "@/lib/docente/exportar";
import { pdfDocente } from "@/lib/reportes/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/docente/exportar/pdf (HITO 4, sección 4): la libreta de
 * calificaciones del docente en sesión, SUS aulas únicamente —mismo filtro
 * por `docenteId` que `GET /api/docente/aulas`—.
 */
export async function GET() {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  try {
    const aulas = await obtenerReporteDocente(permiso.quien.usuarioId);
    const buffer = await pdfDocente(permiso.quien.nombre, aulas);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="libreta-de-calificaciones.pdf"',
      },
    });
  } catch (e) {
    console.error("[GET /api/docente/exportar/pdf] fallo no previsto:", e);
    return NextResponse.json(
      { error: "diagnóstico temporal", detalle: String(e), stack: e instanceof Error ? e.stack : null },
      { status: 500 },
    );
  }
}
