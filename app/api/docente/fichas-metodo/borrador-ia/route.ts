import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado, puedeLeerDeInstitucion } from "@/lib/docente/api";
import { ambitoParaCrear } from "@/lib/docente/bancos";
import { ErrorDeIA } from "@/lib/docente/borradores-ia";
import { generarFicha } from "@/lib/docente/fichas-ia";
import { SELECCION_FICHA, camposDeInformeFicha } from "@/lib/docente/fichas-servidor";
import { verificarFicha } from "@/lib/docente/fichas-verificar";
import { ipDeLaPeticion, permiteIntento, segundosParaReintentar } from "@/lib/seguridad/limite-tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const peticionSchema = z.object({
  nodoId: z.string().min(1, "Falta el tema").max(40),
  /** Qué método quiere el docente: «suma de fracciones», «regla de la cadena». */
  titulo: z.string().trim().min(3, "Di qué método quieres").max(160),
  indicaciones: z.string().trim().max(300).optional(),
  ejemplo: z.string().trim().max(200).optional(),
});

/**
 * `POST /api/docente/fichas-metodo/borrador-ia` — el agente de Gemini del editor
 * de métodos (Hito 5A).
 *
 *   · Gemini propone la ficha con SALIDA ESTRUCTURADA; se valida con ZOD y, si no
 *     cumple, se le devuelven los errores para que corrija.
 *   · El servidor la VERIFICA con el motor matemático (ejemplos + casos generados)
 *     y, si el motor encuentra fallos, también se le devuelven.
 *   · Queda como BORRADOR del docente, marcada como de IA, con el informe y los
 *     casos pendientes de validación automática. Nada llega al alumno sin que el
 *     docente la revise y la APRUEBE.
 *
 * Mismo tope de consumo por usuario y por IP que el resto de agentes de Gemini.
 */
export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;

  const cuerpo = await leerCuerpo(req, peticionSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  const porUsuario = permiteIntento(`fichas-ia:${quien.usuarioId}`, 6, 10 * 60_000);
  const porIp = permiteIntento(`fichas-ia-ip:${ipDeLaPeticion(req)}`, 18, 10 * 60_000);
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
      generado = await generarFicha(
        {
          tema: { titulo: tema.titulo, descripcion: tema.descripcion, motor: tema.motor },
          titulo: datos.titulo,
          indicaciones: datos.indicaciones,
          ejemplo: datos.ejemplo,
        },
        {
          // AUTORREPARACIÓN guiada por el motor: lo que el verificador encuentra mal vuelve a Gemini.
          revisar: (f) => {
            const inf = verificarFicha({ motor: tema.motor, ficha: f }, { generados: 4 });
            return [...inf.errores, ...inf.pendientes.map((p) => p.detalle)];
          },
        },
      );
    } catch (e) {
      if (e instanceof ErrorDeIA) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    if (!generado.ficha) {
      return NextResponse.json(
        {
          error:
            generado.modo === "demo"
              ? (generado.errores[0] ?? "No hay clave de Gemini y el modo demostración no conoce ese método.")
              : "La IA no ha devuelto una ficha con el formato correcto. Inténtalo de nuevo o reformula lo que quieres.",
          detalles: generado.errores,
        },
        { status: 422 },
      );
    }
    const ficha = generado.ficha;

    const informe = verificarFicha({ motor: tema.motor, ficha });
    const campos = camposDeInformeFicha(informe);

    const creada = await prisma.$transaction(async (tx) => {
      const f = await tx.fichaMetodo.create({
        data: {
          nodoId: tema.id,
          institucionId: tema.institucionId,
          motor: tema.motor,
          titulo: ficha.titulo,
          contenido: ficha as unknown as Prisma.InputJsonValue,
          version: 1,
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
              reparaciones: generado.reparaciones,
            },
          } as unknown as Prisma.InputJsonValue,
          ...campos,
        },
        select: SELECCION_FICHA,
      });
      await tx.fichaMetodoVersion.create({
        data: {
          fichaId: f.id,
          version: 1,
          contenido: ficha as unknown as Prisma.InputJsonValue,
          nota: "Borrador de IA",
          autorId: quien.usuarioId,
          ...campos,
        },
      });
      await tx.logAuditoria.create({
        data: {
          usuarioId: quien.usuarioId,
          accion: "FICHA_METODO_IA_GENERADA",
          entidad: "FichaMetodo",
          entidadId: f.id,
          datosNuevos: {
            modelo: generado.modelo,
            modo: generado.modo,
            verificada: informe.verificada,
            errores: informe.errores.length,
            pendientes: informe.pendientes.length,
          },
        },
      });
      return f;
    });

    return NextResponse.json(
      {
        ficha: creada,
        informe,
        modo: generado.modo,
        modelo: generado.modelo,
        reparaciones: generado.reparaciones,
        aviso:
          generado.modo === "demo"
            ? "Modo demostración: no hay clave de Gemini configurada, el borrador es una ficha de referencia de la plataforma."
            : null,
      },
      { status: 201 },
    );
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:borrador-ia");
  }
}
