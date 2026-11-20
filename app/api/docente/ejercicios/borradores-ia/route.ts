import { NextResponse } from "next/server";
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
import { guardarBorradoresDeEjercicios } from "@/lib/docente/guardar-borradores";
import { ErrorDeIA, generarBorradores } from "@/lib/docente/borradores-ia";
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

    // La regla de qué se guarda (y cómo) es la MISMA para todo borrador de IA y
    // vive en un solo sitio: ver `lib/docente/guardar-borradores.ts`.
    const { guardados, descartados } = await guardarBorradoresDeEjercicios({
      autorId: quien.usuarioId,
      ambito,
      tema,
      nivel: datos.nivel,
      borradores: generado.borradores,
      modelo: generado.modelo,
      modo: generado.modo,
      indicaciones: datos.indicaciones,
    });

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
