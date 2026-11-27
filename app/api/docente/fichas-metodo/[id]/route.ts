import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado, puedeLeerDeInstitucion } from "@/lib/docente/api";
import { puedeEscribirEjercicio } from "@/lib/docente/bancos";
import { fichaSchema, leerFicha } from "@/lib/docente/fichas-metodo";
import {
  SELECCION_FICHA,
  camposDeInformeFicha,
  dondeFichasVisibles,
  mismoContenido,
} from "@/lib/docente/fichas-servidor";
import { verificarFicha } from "@/lib/docente/fichas-verificar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

const edicionSchema = z.object({
  ficha: fichaSchema.optional(),
  nodoId: z.string().min(1).max(40).optional(),
  estado: z.enum(["BORRADOR", "PUBLICADO", "ARCHIVADO"]).optional(),
  /** La APROBACIÓN DOCENTE: sin ella no se publica nada. */
  aprobar: z.boolean().optional(),
  /** Publicar algo que el motor no ha podido comprobar del todo exige decirlo expresamente. */
  confirmarPendientes: z.boolean().optional(),
  /** Qué cambió, para el historial de versiones. */
  nota: z.string().trim().max(200).optional(),
});

/** Una respuesta de error que se lanza desde dentro de la transacción. */
class Rechazo extends Error {
  constructor(
    public readonly estado: number,
    public readonly cuerpo: Record<string, unknown>,
  ) {
    super(String(cuerpo.error ?? "rechazado"));
  }
}

export async function GET(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;
  try {
    const ficha = await prisma.fichaMetodo.findFirst({
      where: { AND: [{ id }, dondeFichasVisibles(permiso.quien)] },
      select: SELECCION_FICHA,
    });
    if (!ficha) return noEncontrado("La ficha");
    return NextResponse.json({ ficha });
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:leer");
  }
}

export async function PATCH(req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const quien = permiso.quien;
  const { id } = await params;

  const cuerpo = await leerCuerpo(req, edicionSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const resultado = await prisma.$transaction(
      async (tx) => {
        // Dos ediciones a la vez de la misma ficha no pueden repartirse el mismo número de versión.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ficha-metodo'), hashtext(${id}))`;

        const actual = await tx.fichaMetodo.findUnique({ where: { id } });
        // 404, no 403: la ficha privada de otro docente no existe para ti.
        if (!actual || !puedeEscribirEjercicio(quien, actual)) throw new Rechazo(404, { error: "La ficha no existe o ya se ha eliminado." });

        let motor = actual.motor;
        let institucionId = actual.institucionId;
        const nodoId = datos.nodoId ?? actual.nodoId;
        if (datos.nodoId && datos.nodoId !== actual.nodoId) {
          const tema = await tx.nodoConocimiento.findUnique({
            where: { id: datos.nodoId },
            select: { motor: true, institucionId: true },
          });
          if (!tema || !puedeLeerDeInstitucion(quien, tema.institucionId)) throw new Rechazo(404, { error: "El tema no existe o ya se ha eliminado." });
          motor = tema.motor;
          institucionId = tema.institucionId;
        }

        const fichaActual = leerFicha(actual.contenido);
        const ficha = datos.ficha ?? fichaActual;
        if (!ficha) throw new Rechazo(422, { error: "El contenido guardado de la ficha no es legible: envíala completa." });

        const cambioContenido = datos.ficha !== undefined && !mismoContenido(datos.ficha, fichaActual);
        const version = cambioContenido ? actual.version + 1 : actual.version;

        // SE VUELVE A VERIFICAR SIEMPRE: cambiar una sola variable puede invalidar todo.
        const informe = verificarFicha({ motor, ficha });
        const campos = camposDeInformeFicha(informe);

        const estadoNuevo = datos.estado ?? actual.estado;
        const publica = estadoNuevo === "PUBLICADO" && (actual.estado !== "PUBLICADO" || datos.aprobar === true);
        if (publica) {
          if (datos.aprobar !== true) {
            throw new Rechazo(422, {
              error: "Publicar necesita tu aprobación expresa: revisa la ficha y confirma que la apruebas.",
              requiereAprobacion: true,
              informe,
            });
          }
          if (!informe.valido) {
            throw new Rechazo(422, { error: informe.errores[0] ?? "La ficha tiene errores y no se puede publicar.", informe });
          }
          if (!informe.verificada) {
            // Un borrador de IA NUNCA se publica con casos sin validar; uno escrito a mano, sólo si su autor lo confirma.
            const humano = actual.origen !== "IA";
            if (!humano || !datos.confirmarPendientes) {
              throw new Rechazo(422, {
                error: humano
                  ? "El motor no ha podido validar automáticamente todos los casos. Revísalos, o publica confirmando expresamente que lo harás con casos pendientes."
                  : "Este borrador lo generó la IA y quedan casos sin validar: corrígelo hasta que el motor lo verifique antes de publicarlo.",
                informe,
                requiereConfirmacion: humano,
              });
            }
          }
        }

        const actualizada = await tx.fichaMetodo.update({
          where: { id },
          data: {
            nodoId,
            motor,
            institucionId,
            titulo: ficha.titulo,
            contenido: ficha as unknown as Prisma.InputJsonValue,
            version,
            estado: estadoNuevo,
            ...campos,
            ...(publica ? { publicadaVersion: version, aprobadaPorId: quien.usuarioId, aprobadaEn: new Date() } : {}),
          },
          select: SELECCION_FICHA,
        });

        if (cambioContenido) {
          await tx.fichaMetodoVersion.create({
            data: {
              fichaId: id,
              version,
              contenido: ficha as unknown as Prisma.InputJsonValue,
              nota: datos.nota ?? "Editada",
              autorId: quien.usuarioId,
              ...campos,
            },
          });
        }

        if (publica) {
          await tx.logAuditoria.create({
            data: {
              usuarioId: quien.usuarioId,
              accion: "FICHA_METODO_PUBLICADA",
              entidad: "FichaMetodo",
              entidadId: id,
              datosNuevos: { version, verificada: informe.verificada, pendientes: informe.pendientes.length, origen: actual.origen },
            },
          });
        }

        return { ficha: actualizada, informe, versionNueva: cambioContenido };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof Rechazo) return NextResponse.json(e.cuerpo, { status: e.estado });
    return fallo(e, "docente/fichas-metodo:editar");
  }
}

export async function DELETE(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;
  try {
    const f = await prisma.fichaMetodo.findUnique({
      where: { id },
      select: { id: true, ambito: true, autorId: true, institucionId: true, publicadaVersion: true },
    });
    if (!f || !puedeEscribirEjercicio(permiso.quien, f)) return noEncontrado("La ficha");
    if (f.publicadaVersion !== null) {
      return NextResponse.json(
        { error: "Esta ficha ya se publicó y puede tener historial de alumnos: archívala en lugar de borrarla." },
        { status: 409 },
      );
    }
    await prisma.fichaMetodo.delete({ where: { id } });
    return NextResponse.json({ borrada: true });
  } catch (e) {
    return fallo(e, "docente/fichas-metodo:borrar");
  }
}
