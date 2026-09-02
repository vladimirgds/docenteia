import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { validacionSchema, type Motor } from "@/lib/docente/curriculo";
import type { Parametro } from "@/lib/docente/parametros";
import { validarEjercicio } from "@/lib/docente/validador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * VALIDACIÓN EN SECO: comprobar sin guardar.
 *
 * El alta ya valida, así que este endpoint no añade seguridad; añade otra cosa,
 * que es igual de importante: permite al docente PROBAR el ejercicio mientras lo
 * escribe y ver, antes de guardar nada, con qué números cuadra y con cuáles no.
 *
 * Es lo que convierte el validador de un portero en una herramienta: sin esto,
 * la única forma de saber si una plantilla está bien es intentar guardarla y
 * leer el error.
 *
 * Responde 200 aunque el ejercicio esté mal. El veredicto va DENTRO del informe
 * (`valido`), porque aquí no ha fallado ninguna petición: se ha preguntado algo
 * y se ha contestado.
 */
export async function POST(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, validacionSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    // El motor sale del tema cuando hay tema. El del cuerpo sólo se usa para
    // probar un ejercicio antes de haber creado el tema, que es lo que hace el
    // formulario mientras se escribe.
    let motor = (datos.motor ?? null) as Motor | null;
    if (datos.nodoId) {
      const tema = await prisma.nodoConocimiento.findUnique({
        where: { id: datos.nodoId },
        select: { motor: true },
      });
      if (!tema) return noEncontrado("El tema");
      motor = tema.motor as Motor | null;
    }

    const informe = validarEjercicio({
      enunciado: datos.enunciado ?? "",
      respuestaCorrecta: datos.respuestaCorrecta,
      respuestaFormula: datos.respuestaFormula,
      plantilla: datos.plantilla,
      parametros: (datos.parametros ?? []) as Parametro[],
      motor,
      pistas: datos.pistas,
    });

    return NextResponse.json({ informe });
  } catch (e) {
    return fallo(e, "docente/ejercicios:validar");
  }
}
