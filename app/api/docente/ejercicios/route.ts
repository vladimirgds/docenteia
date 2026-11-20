import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  conflicto,
  exigirDocente,
  fallo,
  leerCuerpo,
  noEncontrado,
  puedeLeerDeInstitucion,
} from "@/lib/docente/api";
import {
  BANCOS,
  ambitoParaCrear,
  dondeEjerciciosVisibles,
  dondeFiltroBanco,
  esFiltroBanco,
} from "@/lib/docente/bancos";
import { ESTADOS, NIVELES, ejercicioSchema, type Estado, type Motor, type Nivel } from "@/lib/docente/curriculo";
import { resolverAlcancePropio } from "@/lib/docente/alcance";
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
  const nivel = url.searchParams.get("nivel");
  const busqueda = (url.searchParams.get("q") ?? "").trim();
  // "Ver ejercicios de la tarea" (HITO 3 — corrección QA) pide un conjunto
  // EXACTO y ya conocido —los `ejercicioIds` de una tarea—, no un filtro.
  const ids = url.searchParams.get("ids");
  // PMV 3 · HITO 1: `?banco=maestro|propio|borradores-ia`. Sin él se ven los
  // dos bancos a la vez (el catálogo y el propio), como hasta ahora.
  const banco = url.searchParams.get("banco");
  if (banco !== null && !esFiltroBanco(banco)) {
    return NextResponse.json(
      { error: `El parámetro "banco" admite: ${BANCOS.join(", ")}.` },
      { status: 400 },
    );
  }

  const where: Prisma.EjercicioWhereInput = {};
  if (ids) where.id = { in: ids.split(",").filter(Boolean) };
  if (nodoId) where.nodoId = nodoId;
  if (estado && (ESTADOS as readonly string[]).includes(estado)) where.estado = estado as Estado;
  if (validado === "true") where.validado = true;
  if (validado === "false") where.validado = false;
  // Para armar una tarea desde el banco, por dificultad —antes sólo se podía
  // filtrar en el navegador, después de traer TODO el banco—.
  if (nivel && (NIVELES as readonly string[]).includes(nivel)) where.nivel = nivel as Nivel;
  if (busqueda) where.enunciado = { contains: busqueda, mode: "insensitive" };

  // Visibilidad (aislamiento institucional del HITO 4 + bancos privados del
  // PMV 3): se combina con AND, nunca se mezcla con los filtros de arriba. La
  // regla completa está en `lib/docente/bancos.ts`.
  const condiciones: Prisma.EjercicioWhereInput[] = [where, dondeEjerciciosVisibles(permiso.quien)];
  if (banco) condiciones.push(dondeFiltroBanco(banco, permiso.quien));

  try {
    const ejercicios = await prisma.ejercicio.findMany({
      where: { AND: condiciones },
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
      select: { id: true, motor: true, titulo: true, etapa: true, cursoMin: true, institucionId: true },
    });
    if (!tema) return noEncontrado("El tema");
    // PMV 3 · HITO 1. El ámbito lo decide el SERVIDOR (`ambitoParaCrear`): un
    // docente escribe en SU banco privado, un SUPERADMIN en el catálogo.
    const ambito = ambitoParaCrear(permiso.quien);
    // Para escribir en el catálogo (SUPERADMIN) basta con poder verlo; para
    // escribir en el banco PRIVADO basta con poder LEER el tema —un docente no
    // necesita ser dueño del tema "Fracciones" del catálogo base para guardar
    // sus propios ejercicios de fracciones—. Antes (HITO 4) se exigía poder
    // ESCRIBIR el tema porque el ejercicio quedaba compartido con el colegio;
    // ahora es privado y esa exigencia ya no tiene sentido. Lo que sigue
    // vedado es el tema de OTRO colegio: ése responde 404.
    if (!puedeLeerDeInstitucion(permiso.quien, tema.institucionId)) {
      return noEncontrado("El tema");
    }
    const motor = tema.motor as Motor | null;

    // El duplicado se comprueba DENTRO del banco donde se va a escribir. Mirar
    // en los dos delataría el contenido privado de otro docente.
    const repetido = await prisma.ejercicio.findFirst({
      where: {
        nodoId: datos.nodoId,
        enunciado: datos.enunciado,
        ambito,
        ...(ambito === "DOCENTE" ? { autorId: permiso.quien.usuarioId } : {}),
      },
      select: { id: true },
    });
    if (repetido) {
      return conflicto(
        ambito === "DOCENTE"
          ? `Tu banco del tema "${tema.titulo}" ya tiene un ejercicio con ese mismo enunciado.`
          : `El tema "${tema.titulo}" ya tiene un ejercicio con ese mismo enunciado.`,
      );
    }

    // El alcance propio, si lo pide, se valida contra el del tema: misma etapa y
    // curso no inferior. Sin él, se hereda (se guarda a null).
    const alcance = resolverAlcancePropio(datos, tema);
    if (!alcance.ok) return conflicto(alcance.error);

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
        institucionId: tema.institucionId,
        motor,
        // El alcance se guarda SÓLO si el docente lo ha afinado; a null significa
        // "el de mi tema", de modo que al cambiar el tema sus ejercicios lo siguen
        // en lugar de quedarse con una copia vieja.
        etapa: alcance.etapa,
        cursoMin: alcance.cursoMin,
        nivel: datos.nivel,
        enunciado: datos.enunciado,
        respuestaCorrecta: campos.respuestaCorrecta,
        plantilla: datos.plantilla ?? false,
        parametros: (datos.parametros ?? []) as unknown as Prisma.InputJsonValue,
        respuestaFormula: datos.respuestaFormula ?? null,
        pistas: datos.pistas ?? [],
        pasos: pasosJson(informe.muestras[0]?.enunciado ?? datos.enunciado, motor),
        origen: "DOCENTE",
        ambito,
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
