import { NextResponse } from "next/server";

import { fallo } from "@/lib/docente/api";
import { exigirDirector } from "@/lib/director/api";
import { obtenerResumenInstitucional } from "@/lib/director/datos";
import { prisma } from "@/lib/prisma";
import { pdfDirector } from "@/lib/reportes/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/director/exportar/pdf (HITO 4, sección 4): el reporte institucional, SIEMPRE acotado a `institucionId` —ver `exigirDirector`—. */
export async function GET() {
  const permiso = await exigirDirector();
  if (!permiso.ok) return permiso.respuesta;

  try {
    const [institucion, resumen] = await Promise.all([
      prisma.institucion.findUnique({ where: { id: permiso.quien.institucionId }, select: { nombre: true } }),
      obtenerResumenInstitucional(permiso.quien.institucionId),
    ]);
    const buffer = await pdfDirector(institucion?.nombre ?? "Tu colegio", resumen);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="reporte-institucional.pdf"',
      },
    });
  } catch (e) {
    return fallo(e, "GET /api/director/exportar/pdf");
  }
}
