import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  exigirDocente,
  fallo,
  leerCuerpo,
  noEncontrado,
  puedeLeerDeInstitucion,
} from "@/lib/docente/api";
import { ambitoParaCrear } from "@/lib/docente/bancos";
import { ErrorDeIA } from "@/lib/docente/borradores-ia";
import { guardarBorradoresDeEjercicios } from "@/lib/docente/guardar-borradores";
import { peticionIASchema } from "@/lib/docente/procedimientos";
import { generarProcedimiento } from "@/lib/docente/procedimientos-ia";
import { SELECCION_PROCEDIMIENTO, camposDeVerificacion } from "@/lib/docente/procedimientos-servidor";
import { verificarPasos } from "@/lib/docente/verificar-pasos";
import { ipDeLaPeticion, permiteIntento, segundosParaReintentar } from "@/lib/seguridad/limite-tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * `POST /api/docente/procedimientos/borrador-ia` — el agente de Gemini del
 * editor.
 *
 * Gemini redacta un borrador COMPLETO y editable: pasos con su explicación y lo
 * que se escribe en la pizarra, términos tocables, preguntas de comprensión,
 * pistas y ejercicios de práctica. Después:
 *
 *   · el servidor VERIFICA los pasos con el motor (`verificarPasos`) y guarda el
 *     informe junto al borrador —aunque haya fallos: un borrador con un paso mal
 *     es justo lo que el docente tiene que poder editar—;
 *   · los ejercicios pasan por el validador de ejercicios del Hito 1;
 *   · todo queda como BORRADOR del docente; nada llega a un alumno sin que él lo
 *     revise y lo publique, y un borrador de IA sin verificar NO se publica.
 *
 * Mismo tope de consumo por usuario y por IP que el resto de endpoints que
 * llaman a Gemini.
 */
export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;

  const cuerpo = await leerCuerpo(req, peticionIASchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  const porUsuario = permiteIntento(`procedimientos-ia:${quien.usuarioId}`, 6, 10 * 60_000);
  const porIp = permiteIntento(`procedimientos-ia-ip:${ipDeLaPeticion(req)}`, 18, 10 * 60_000);
  const limite = porUsuario.permitido ? porIp : porUsuario;
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "Has pedido muchos borradores seguidos. Espera un momento antes de generar más." },
      { status: 429, headers: { "Retry-After": String(segundosParaReintentar(limite.reintentarEnMs)) } },
    );
  }

  try {
    const tema = await prisma.nodoConocimiento.findUnique({
      where: { id: datos.nodoId },
      select: { id: true, titulo: true, descripcion: true, motor: true, institucionId: true },
    });
    if (!tema || !puedeLeerDeInstitucion(quien, tema.institucionId)) return noEncontrado("El tema");

    let generado;
    try {
      generado = await generarProcedimiento({
        tema: { titulo: tema.titulo, descripcion: tema.descripcion, motor: tema.motor },
        tipo: datos.tipo,
        titulo: datos.titulo,
        nivel: datos.nivel,
        indicaciones: datos.indicaciones,
        ejercicios: datos.ejercicios,
      }, {
        // AUTORREPARACIÓN: si el verificador encuentra fallos, Gemini recibe sus
        // mensajes y lo intenta de nuevo (hasta 2 veces). El veredicto sigue
        // siendo del servidor: aquí sólo se le da otra oportunidad al modelo.
        revisar: (p) => {
          const inf = verificarPasos({ motor: tema.motor, ejemplo: p.ejemplo, pasos: p.pasos });
          const sinComprobar = inf.pasos
            .filter((x) => x.estado === "no_verificable")
            .map((x) => `Paso ${x.indice + 1}: ${x.detalle}`);
          return { ok: !tema.motor || inf.verificado, problemas: [...inf.errores, ...sinComprobar] };
        },
      });
    } catch (e) {
      if (e instanceof ErrorDeIA) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    if (!generado.procedimiento) {
      return NextResponse.json(
        {
          error: tema.motor
            ? "La IA no ha devuelto un procedimiento utilizable. Inténtalo de nuevo o reformula lo que quieres enseñar."
            : "Este tema no tiene motor y no hay clave de Gemini configurada: en modo demostración no se genera contenido sin garantía.",
        },
        { status: 422 },
      );
    }
    const p = generado.procedimiento;

    const informe = verificarPasos({ motor: tema.motor, ejemplo: p.ejemplo, pasos: p.pasos });
    const campos = camposDeVerificacion(informe);

    const creado = await prisma.procedimiento.create({
      data: {
        nodoId: tema.id,
        institucionId: tema.institucionId,
        motor: tema.motor,
        tipo: datos.tipo,
        titulo: p.titulo,
        descripcion: p.descripcion,
        ejemplo: p.ejemplo,
        pasos: p.pasos as unknown as Prisma.InputJsonValue,
        preguntas: p.preguntas as unknown as Prisma.InputJsonValue,
        pistas: p.pistas,
        origen: "IA",
        ambito: ambitoParaCrear(quien),
        estado: "BORRADOR",
        autorId: quien.usuarioId,
        metadatos: {
          ia: {
            modelo: generado.modelo,
            modo: generado.modo,
            generadoEn: new Date().toISOString(),
            peticion: datos.titulo,
            indicaciones: datos.indicaciones ?? null,
          },
        } as unknown as Prisma.InputJsonValue,
        ...campos,
      },
      select: SELECCION_PROCEDIMIENTO,
    });

    // Los ejercicios de práctica: mismo camino y mismas garantías que el Hito 1.
    const ejercicios =
      generado.ejercicios.length > 0
        ? await guardarBorradoresDeEjercicios({
            autorId: quien.usuarioId,
            ambito: ambitoParaCrear(quien),
            tema,
            nivel: datos.nivel,
            borradores: generado.ejercicios,
            modelo: generado.modelo,
            modo: generado.modo,
            indicaciones: datos.indicaciones,
            origenExtra: { procedimientoId: creado.id },
          })
        : { guardados: [], descartados: [] };

    await prisma.logAuditoria.create({
      data: {
        usuarioId: quien.usuarioId,
        accion: "PROCEDIMIENTO_IA_GENERADO",
        entidad: "Procedimiento",
        entidadId: creado.id,
        datosNuevos: {
          modelo: generado.modelo,
          modo: generado.modo,
          verificado: informe.verificado,
          errores: informe.errores.length,
          ejercicios: ejercicios.guardados.length,
        },
      },
    });

    return NextResponse.json(
      {
        procedimiento: creado,
        informe,
        ejercicios: { borradores: ejercicios.guardados, descartados: ejercicios.descartados },
        modo: generado.modo,
        modelo: generado.modelo,
        reparaciones: generado.reparaciones,
        aviso:
          generado.modo === "demo"
            ? "Modo demostración: no hay clave de Gemini configurada, el borrador lo arma el motor de la plataforma."
            : null,
      },
      { status: 201 },
    );
  } catch (e) {
    return fallo(e, "docente/procedimientos:borrador-ia");
  }
}
