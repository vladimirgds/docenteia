import { NextResponse } from "next/server";

import { fallo } from "@/lib/docente/api";
import { exigirDirector } from "@/lib/director/api";
import { obtenerResumenInstitucional } from "@/lib/director/datos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EL RESUMEN INSTITUCIONAL DEL DIRECTOR (HITO 3).
 *
 * «Retorna el listado de docentes de su institución, total de aulas creadas,
 * total de estudiantes matriculados y tasa de tareas entregadas.»
 *
 * La consulta vive en `lib/director/datos.ts` —la misma que usa el panel
 * `/director` para su primer render— y el cálculo, puro y comprobado aparte,
 * en `lib/director/resumen.ts`. Aquí sólo queda exigir la sesión y devolver
 * lo que ya resolvieron los dos, SIEMPRE acotado a `institucionId` —ver
 * `exigirDirector`—, nunca al colegio entero de la plataforma.
 */
export async function GET() {
  const permiso = await exigirDirector();
  if (!permiso.ok) return permiso.respuesta;

  try {
    const resumen = await obtenerResumenInstitucional(permiso.quien.institucionId);
    return NextResponse.json({ resumen });
  } catch (e) {
    return fallo(e, "director/resumen:leer");
  }
}
