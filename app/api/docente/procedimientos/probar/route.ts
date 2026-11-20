import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  exigirDocente,
  fallo,
  leerCuerpo,
  noEncontrado,
  puedeLeerDeInstitucion,
} from "@/lib/docente/api";
import { pruebaSchema } from "@/lib/docente/procedimientos";
import { verificarPasos } from "@/lib/docente/verificar-pasos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/docente/procedimientos/probar` — el botón «Probar» del editor.
 *
 * Verifica el ejemplo y los pasos contra el motor SIN guardar nada, y devuelve
 * el informe paso por paso. Es la forma de que el docente vea qué comprueba el
 * servidor antes de comprometerse a un borrador.
 */
export async function POST(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, pruebaSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const { nodoId, ejemplo, pasos } = cuerpo.datos;

  try {
    let motor = null;
    if (nodoId) {
      const tema = await prisma.nodoConocimiento.findUnique({
        where: { id: nodoId },
        select: { motor: true, institucionId: true },
      });
      if (!tema || !puedeLeerDeInstitucion(permiso.quien, tema.institucionId)) return noEncontrado("El tema");
      motor = tema.motor;
    }
    return NextResponse.json({ informe: verificarPasos({ motor, ejemplo, pasos }) });
  } catch (e) {
    return fallo(e, "docente/procedimientos:probar");
  }
}
