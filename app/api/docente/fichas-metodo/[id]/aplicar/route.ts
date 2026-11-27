import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { ambitoParaCrear } from "@/lib/docente/bancos";
import { guardarBorradoresDeEjercicios } from "@/lib/docente/guardar-borradores";
import { leerFicha, resolverConFicha } from "@/lib/docente/fichas-metodo";
import { dondeFichasVisibles } from "@/lib/docente/fichas-servidor";
import { verificarPasos } from "@/lib/docente/verificar-pasos";
import { validarEjercicio } from "@/lib/docente/validador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

const aplicarSchema = z.object({
  /** El problema NUEVO al que se aplica el método: «(5x^3-2)^2». */
  problema: z.string().trim().min(1, "Escribe el problema").max(200),
  /** Guardarlo como ejercicio BORRADOR en tu banco privado (sólo si el motor lo valida). */
  crearEjercicio: z.boolean().optional(),
});

/**
 * `POST /api/docente/fichas-metodo/[id]/aplicar` — REUTILIZAR un método con un
 * problema nuevo.
 *
 * Es la prueba del Hito 5A: se define la ficha una vez (regla de la cadena con
 * `(3x^2+1)^4`) y se aplica a `(5x^3-2)^2` SIN tocar código. El motor valida el
 * ejercicio nuevo de dos maneras independientes: verifica cada paso que genera la
 * ficha y valida el ejercicio (enunciado + respuesta) con el validador del banco.
 */
export async function POST(req: Request, { params }: Contexto) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;
  const { id } = await params;

  const cuerpo = await leerCuerpo(req, aplicarSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const { problema, crearEjercicio } = cuerpo.datos;
  if (crearEjercicio) {
    const escribe = await exigirDocente({ escritura: true });
    if (!escribe.ok) return escribe.respuesta;
  }

  try {
    const f = await prisma.fichaMetodo.findFirst({
      where: { AND: [{ id }, dondeFichasVisibles(quien)] },
      select: { id: true, nodoId: true, motor: true, contenido: true, nodo: { select: { id: true, institucionId: true, motor: true } } },
    });
    if (!f) return noEncontrado("La ficha");
    const ficha = leerFicha(f.contenido);
    if (!ficha) return NextResponse.json({ error: "La ficha guardada no es legible." }, { status: 422 });

    const r = resolverConFicha(ficha, problema);
    if (!r.ok) {
      return NextResponse.json({ error: r.motivo, aplica: false }, { status: 422 });
    }
    const inst = r.instancia;

    // 1) Cada paso que genera la ficha, contra el motor.
    const verificacion = verificarPasos({ motor: f.motor, ejemplo: inst.problema, pasos: inst.pasos });
    // 2) El ejercicio completo (enunciado + respuesta), contra el validador del banco.
    const validacion = validarEjercicio({
      enunciado: inst.problema,
      respuestaCorrecta: inst.resultado,
      motor: f.motor,
      pistas: ficha.pistas,
    });

    let guardado: unknown = null;
    if (crearEjercicio) {
      if (!f.nodo) return NextResponse.json({ error: "La ficha no tiene tema: no se puede crear el ejercicio." }, { status: 422 });
      guardado = await guardarBorradoresDeEjercicios({
        autorId: quien.usuarioId,
        ambito: ambitoParaCrear(quien),
        tema: { id: f.nodo.id, motor: f.nodo.motor, institucionId: f.nodo.institucionId },
        nivel: "INTERMEDIO",
        borradores: [{ enunciado: inst.problema, respuestaCorrecta: inst.resultado, pistas: ficha.pistas }],
        modelo: "ficha-metodo",
        modo: "demo",
        indicaciones: null,
        origenExtra: { fichaMetodoId: f.id },
      });
    }

    return NextResponse.json({
      aplica: true,
      problema: inst.problema,
      variables: inst.variables,
      pasos: inst.pasos,
      resultado: inst.resultado,
      motor: {
        verificado: verificacion.verificado,
        valido: verificacion.valido,
        respuestaMotor: verificacion.respuestaEjemplo,
        pasos: verificacion.pasos,
        errores: verificacion.errores,
        avisos: verificacion.avisos,
      },
      ejercicio: {
        valido: validacion.valido,
        // «validado» = el motor calcula la misma respuesta que da la ficha.
        validado: validacion.valido && validacion.verificado,
        respuestaMotor: validacion.muestras[0]?.respuestaMotor ?? validacion.respuestaCorrecta,
        errores: validacion.errores,
        avisos: validacion.avisos,
      },
      guardado,
    });
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:aplicar");
  }
}
