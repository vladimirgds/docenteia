import { NextResponse } from "next/server";

import { exigirDocente, fallo } from "@/lib/docente/api";
import { filtroDesdeUrl, obtenerReporteDocente } from "@/lib/docente/exportar";
import { excelDocente } from "@/lib/reportes/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/docente/exportar/excel (HITO 4, sección 4): mismo reporte que el PDF, en .xlsx con pestañas. */
export async function GET(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  try {
    const aulas = await obtenerReporteDocente(permiso.quien.usuarioId, filtroDesdeUrl(req.url));
    const buffer = await excelDocente(permiso.quien.nombre, aulas);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetsml.sheet",
        "Content-Disposition": 'attachment; filename="reporte-docente.xlsx"',
      },
    });
  } catch (e) {
    return fallo(e, "GET /api/docente/exportar/excel");
  }
}
