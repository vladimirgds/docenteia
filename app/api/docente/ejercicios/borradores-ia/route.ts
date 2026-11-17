import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  exigirDocente,
  fallo,
  leerCuerpo,
  noEncontrado,
  puedeLeerDeInstitucion,
} from "@/lib/docente/api";
import { ambitoParaCrear } from "@/lib/docente/bancos";
import { NIVELES } from "@/lib/docente/curriculo";
import { SELECCION_EJERCICIO, camposDeValidacion, pasosJson } from "@/lib/docente/ejercicios";
import { ErrorDeIA, generarBorradores } from "@/lib/docente/borradores-ia";
import { validarEjercicio } from "@/lib/docente/validador";
import { ipDeLaPeticion, permiteIntento, segundosParaReintentar } from "@/lib/seguridad/limite-tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini puede tardar; el tope por intento está en `borradores-ia.ts`.
export const maxDuration = 60;

/**
 * BORRADORES DE EJERCICIOS CON IA — `POST /api/docente/ejercicios/borradores-ia`.
 *
 * El flujo, y el porqué de cada paso:
 *
 *   1. Sesión de docente con permiso de escritura. Sin sesión, 401; un alumno o
 *      un director, 403. Cada llamada a Gemini es PAGADA, así que además hay un
 *      tope por usuario y por IP (mismo criterio que `/api/voz`).
 *   2. El tema tiene que ser LEGIBLE para quien pide —no se genera sobre el tema
 *      privado de otro colegio—.
 *   3. Gemini propone. NADA de lo que propone se da por bueno: cada ejercicio
 *      pasa por `validarEjercicio`, el mismo validador que ya protege la
 *      creación a mano. Sólo se da por VERIFICADO un borrador cuando dos
 *      fuentes INDEPENDIENTES coinciden: la respuesta que propone Gemini y la
 *      que calcula el motor determinista. Si discrepan, se DESCARTA: no se
 *      "corrige" con la del motor, porque un motor que lee mal un enunciado
 *      daría una respuesta equivocada y la marcaría como comprobada (es lo que
 *      se vio con fracciones anidadas: `3/4 * (1/2 + 2/5)` → 9/10). Si el
 *      motor no sabe leer el enunciado, se guarda como borrador SIN verificar,
 *      y no se podrá publicar.
 *   4. Lo que sobrevive se guarda como BORRADOR (`origen: IA`) en el banco
 *      privado del docente. Nunca como publicado: la publicación es un acto
 *      humano posterior (ver PATCH de `[id]`).
 */

const esquema = z.object({
  nodoId: z.string().min(1, "Falta el tema").max(40),
  nivel: z.enum(NIVELES),
  cantidad: z.number().int().min(1, "Pide al menos 1 ejercicio").max(5, "Máximo 5 por petición").default(3),
  indicaciones: z.string().trim().max(300, "Las indicaciones admiten hasta 300 caracteres").optional(),
});

export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;

  const cuerpo = await leerCuerpo(req, esquema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  // Tope de consumo: por usuario y, además, por IP como red de seguridad.
  const porUsuario = permiteIntento(`borradores-ia:${quien.usuarioId}`, 8, 10 * 60_000);
  const porIp = permiteIntento(`borradores-ia-ip:${ipDeLaPeticion(req)}`, 24, 10 * 60_000);
  const limite = porUsuario.permitido ? porIp : porUsuario;
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "Has pedido muchos borradores seguidos. Espera un momento antes de generar más." },
      {
        status: 429,
        headers: { "Retry-After": String(segundosParaReintentar(limite.reintentarEnMs)) },
      },
    );
  }

  try {
    const tema = await prisma.nodoConocimiento.findUnique({
      where: { id: datos.nodoId },
      select: { id: true, titulo: true, descripcion: true, motor: true, institucionId: true },
    });
    if (!tema || !puedeLeerDeInstitucion(quien, tema.institucionId)) {
      return noEncontrado("El tema");
    }

    const ambito = ambitoParaCrear(quien);

    // Modelo de formato para Gemini: ejercicios REALES del catálogo maestro.
    const ejemplos = tema.motor
      ? await prisma.ejercicio.findMany({
          where: {
            motor: tema.motor,
            nivel: datos.nivel,
            ambito: "MAESTRO",
            estado: "PUBLICADO",
            validado: true,
            plantilla: false,
          },
          orderBy: { id: "asc" },
          take: 3,
          select: { enunciado: true, respuestaCorrecta: true },
        })
      : [];

    let generado;
    try {
      generado = await generarBorradores({
        tema: { titulo: tema.titulo, descripcion: tema.descripcion, motor: tema.motor },
        nivel: datos.nivel,
        cantidad: datos.cantidad,
        indicaciones: datos.indicaciones,
        ejemplos,
      });
    } catch (e) {
      if (e instanceof ErrorDeIA) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    // Lo que ya hay en el banco de destino, para no duplicar.
    const existentes = new Set(
      (
        await prisma.ejercicio.findMany({
          where: {
            nodoId: tema.id,
            ambito,
            ...(ambito === "DOCENTE" ? { autorId: quien.usuarioId } : {}),
          },
          select: { enunciado: true },
        })
      ).map((e) => e.enunciado),
    );

    const guardados = [];
    const descartados: { enunciado: string; motivo: string }[] = [];

    for (const b of generado.borradores) {
      if (existentes.has(b.enunciado)) {
        descartados.push({ enunciado: b.enunciado, motivo: "Ya está en tu banco de este tema." });
        continue;
      }

      // Se valida con la respuesta que dio la IA: si el motor calcula otra
      // cosa, el validador lo rechaza y el borrador se descarta (ver arriba).
      const informe = validarEjercicio({
        enunciado: b.enunciado,
        respuestaCorrecta: b.respuestaCorrecta,
        motor: tema.motor,
        pistas: b.pistas,
      });
      if (!informe.valido) {
        descartados.push({
          enunciado: b.enunciado,
          motivo: `La IA y el motor no coinciden, o el ejercicio no es válido: ${informe.errores[0] ?? "no supera la validación del servidor."}`,
        });
        continue;
      }

      const campos = camposDeValidacion(informe);
      try {
        const creado = await prisma.ejercicio.create({
          data: {
            nodoId: tema.id,
            institucionId: tema.institucionId,
            motor: tema.motor,
            nivel: datos.nivel,
            enunciado: b.enunciado,
            respuestaCorrecta: campos.respuestaCorrecta,
            pistas: b.pistas,
            pasos: pasosJson(informe.muestras[0]?.enunciado ?? b.enunciado, tema.motor),
            origen: "IA",
            ambito,
            validado: campos.validado,
            validadoEn: campos.validadoEn,
            informeValidacion: campos.informeValidacion as unknown as Prisma.InputJsonValue,
            // SIEMPRE borrador: publicar es un acto humano posterior.
            estado: "BORRADOR",
            autorId: quien.usuarioId,
            metadatos: {
              ia: {
                modelo: generado.modelo,
                modo: generado.modo,
                generadoEn: new Date().toISOString(),
                indicaciones: datos.indicaciones ?? null,
                respuestaIA: b.respuestaCorrecta,
              },
            } as unknown as Prisma.InputJsonValue,
          },
          select: SELECCION_EJERCICIO,
        });
        existentes.add(b.enunciado);
        guardados.push(creado);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          descartados.push({ enunciado: b.enunciado, motivo: "Ya existe un ejercicio igual." });
          continue;
        }
        throw e;
      }
    }

    await prisma.logAuditoria.create({
      data: {
        usuarioId: quien.usuarioId,
        accion: "BORRADORES_IA_GENERADOS",
        entidad: "NodoConocimiento",
        entidadId: tema.id,
        datosNuevos: {
          modelo: generado.modelo,
          modo: generado.modo,
          pedidos: datos.cantidad,
          guardados: guardados.length,
          descartados: descartados.length,
        },
      },
    });

    return NextResponse.json(
      {
        borradores: guardados,
        descartados,
        modo: generado.modo,
        modelo: generado.modelo,
        aviso:
          generado.modo === "demo"
            ? "Modo demostración: no hay clave de Gemini configurada, los borradores los genera el motor de la plataforma."
            : null,
      },
      { status: 201 },
    );
  } catch (e) {
    return fallo(e, "docente/ejercicios:borradores-ia");
  }
}
