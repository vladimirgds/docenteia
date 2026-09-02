import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { conflicto, exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { ESTADOS, ejercicioSchema, type Estado, type Motor } from "@/lib/docente/curriculo";
import {
  SELECCION_EJERCICIO,
  camposDeValidacion,
  pasosJson,
} from "@/lib/docente/ejercicios";
import type { Parametro } from "@/lib/docente/parametros";
import { validarEjercicio } from "@/lib/docente/validador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BANCO DE EJERCICIOS — alta y consulta.
 *
 * Es el segundo endpoint que nombra el pliego (`/api/docente/ejercicios`). La
 * regla que lo gobierna es una sola y no admite excepciones:
 *
 *   NADA SE GUARDA SIN PASAR POR EL VALIDADOR.
 *
 * No hay un camino alternativo, ni un parámetro para saltárselo, ni una rama
 * "sólo esta vez". Si el validador dice que la respuesta no cuadra con lo que
 * calcula el motor, la petición se rechaza con un 422 y el informe entero, para
 * que el docente vea la combinación exacta que falla.
 */

export async function GET(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const url = new URL(req.url);
  const nodoId = url.searchParams.get("nodoId");
  const estado = url.searchParams.get("estado");
  const validado = url.searchParams.get("validado");
  const busqueda = (url.searchParams.get("q") ?? "").trim();

  const where: Prisma.EjercicioWhereInput = {};
  if (nodoId) where.nodoId = nodoId;
  if (estado && (ESTADOS as readonly string[]).includes(estado)) where.estado = estado as Estado;
  if (validado === "true") where.validado = true;
  if (validado === "false") where.validado = false;
  if (busqueda) where.enunciado = { contains: busqueda, mode: "insensitive" };

  try {
    const ejercicios = await prisma.ejercicio.findMany({
      where,
      orderBy: [{ actualizadoEn: "desc" }],
      select: SELECCION_EJERCICIO,
      take: 300,
    });
    return NextResponse.json({ ejercicios });
  } catch (e) {
    return fallo(e, "docente/ejercicios:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, ejercicioSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    // El ejercicio hereda el motor DE SU TEMA. No se acepta un motor enviado
    // desde el formulario: si se aceptara, bastaría con declarar el motor "más
    // conveniente" para que un ejercicio pasara por verificado en un tema que
    // no lo corrige.
    const tema = await prisma.nodoConocimiento.findUnique({
      where: { id: datos.nodoId },
      select: { id: true, motor: true, titulo: true },
    });
    if (!tema) return noEncontrado("El tema");
    const motor = tema.motor as Motor | null;

    const repetido = await prisma.ejercicio.findFirst({
      where: { nodoId: datos.nodoId, enunciado: datos.enunciado },
      select: { id: true },
    });
    if (repetido) {
      return conflicto(`El tema "${tema.titulo}" ya tiene un ejercicio con ese mismo enunciado.`);
    }

    const informe = validarEjercicio({
      enunciado: datos.enunciado,
      respuestaCorrecta: datos.respuestaCorrecta,
      respuestaFormula: datos.respuestaFormula,
      plantilla: datos.plantilla,
      parametros: (datos.parametros ?? []) as Parametro[],
      motor,
      pistas: datos.pistas,
    });

    if (!informe.valido) {
      // 422 y no 400: la petición está bien formada, lo que no cuadra es la
      // matemática. El informe entero viaja de vuelta porque es lo que la
      // pantalla necesita para explicar QUÉ falla y con qué números.
      return NextResponse.json(
        { error: informe.errores[0] ?? "El ejercicio no supera la validación.", informe },
        { status: 422 },
      );
    }

    const campos = camposDeValidacion(informe);
    const ejercicio = await prisma.ejercicio.create({
      data: {
        nodoId: datos.nodoId,
        motor,
        nivel: datos.nivel,
        enunciado: datos.enunciado,
        respuestaCorrecta: campos.respuestaCorrecta,
        plantilla: datos.plantilla ?? false,
        parametros: (datos.parametros ?? []) as unknown as Prisma.InputJsonValue,
        respuestaFormula: datos.respuestaFormula ?? null,
        pistas: datos.pistas ?? [],
        pasos: pasosJson(informe.muestras[0]?.enunciado ?? datos.enunciado, motor),
        origen: "DOCENTE",
        validado: campos.validado,
        validadoEn: campos.validadoEn,
        informeValidacion: campos.informeValidacion as unknown as Prisma.InputJsonValue,
        estado: datos.estado ?? "BORRADOR",
        autorId: permiso.quien.usuarioId,
      },
      select: SELECCION_EJERCICIO,
    });

    return NextResponse.json({ ejercicio, informe }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return conflicto(
        "Ya existe en el banco un ejercicio con ese enunciado para el mismo motor y nivel.",
      );
    }
    return fallo(e, "docente/ejercicios:crear");
  }
}
