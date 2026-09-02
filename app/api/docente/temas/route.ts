import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import {
  ESTADOS,
  MOTORES,
  claveUnica,
  generarClave,
  temaSchema,
  type Estado,
  type Motor,
} from "@/lib/docente/curriculo";
import { SELECCION_TEMA, normalizarEtiquetas, reglasParaGuardar } from "@/lib/docente/temas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GESTIÓN CURRICULAR — temas y sus reglas pedagógicas.
 *
 * Es el endpoint que nombra el pliego del HITO 1 (`/api/docente/temas`) y el
 * corazón de la autoría docente: aquí se crea el temario que antes venía escrito
 * en el código.
 *
 * Un tema llega SIEMPRE con sus reglas dentro. No hay un endpoint aparte para
 * reglas, y es deliberado: una regla suelta, sin el tema al que pertenece, no
 * significa nada, y separarlos obligaría al formulario a hacer dos escrituras
 * que pueden fallar por separado y dejar el tema a medio guardar. Aquí entran
 * las dos cosas en una transacción, o no entra ninguna.
 */

export async function GET(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const url = new URL(req.url);
  const materiaId = url.searchParams.get("materiaId");
  const estado = url.searchParams.get("estado");
  const motor = url.searchParams.get("motor");
  const busqueda = (url.searchParams.get("q") ?? "").trim();

  const where: Prisma.NodoConocimientoWhereInput = {};
  if (materiaId) where.materiaId = materiaId;
  if (estado && (ESTADOS as readonly string[]).includes(estado)) {
    where.estado = estado as Estado;
  } else {
    // Sin filtro explícito, lo archivado no aparece: el listado es la mesa de
    // trabajo del docente, no el histórico. Se ve pidiéndolo (`estado=ARCHIVADO`).
    where.estado = { not: "ARCHIVADO" };
  }
  if (motor === "SIN_MOTOR") where.motor = null;
  else if (motor && (MOTORES as readonly string[]).includes(motor)) where.motor = motor as Motor;

  if (busqueda) {
    where.OR = [
      { titulo: { contains: busqueda, mode: "insensitive" } },
      { clave: { contains: busqueda, mode: "insensitive" } },
      { descripcion: { contains: busqueda, mode: "insensitive" } },
      { etiquetas: { has: busqueda.toLowerCase() } },
    ];
  }

  try {
    const temas = await prisma.nodoConocimiento.findMany({
      where,
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: SELECCION_TEMA,
      take: 500,
    });
    return NextResponse.json({ temas });
  } catch (e) {
    return fallo(e, "docente/temas:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, temaSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    // ── El padre decide lo que no se ha dicho ────────────────────────────────
    // Un subtema de "Derivadas" es de la misma asignatura y se corrige con el
    // mismo motor, salvo que el docente diga otra cosa. Heredarlo evita el error
    // más común al crear subtemas: dejarlos sin motor y descubrir después que
    // sus ejercicios no se pueden calificar.
    const padre = datos.padreId
      ? await prisma.nodoConocimiento.findUnique({
          where: { id: datos.padreId },
          select: { id: true, materiaId: true, motor: true },
        })
      : null;
    if (datos.padreId && !padre) return noEncontrado("El tema padre");

    const materiaId = datos.materiaId ?? padre?.materiaId ?? null;
    if (materiaId) {
      const materia = await prisma.materia.findUnique({ where: { id: materiaId } });
      if (!materia) return noEncontrado("La asignatura");
    }
    const motor = datos.motor !== undefined ? (datos.motor ?? null) : (padre?.motor ?? null);
    const estado: Estado = datos.estado ?? "BORRADOR";

    const claves = (await prisma.nodoConocimiento.findMany({ select: { clave: true } })).map(
      (n) => n.clave,
    );
    const clave = claveUnica(generarClave(datos.titulo), claves);

    const tema = await prisma.$transaction(async (tx) => {
      const creado = await tx.nodoConocimiento.create({
        data: {
          clave,
          titulo: datos.titulo,
          descripcion: datos.descripcion ?? null,
          materiaId,
          padreId: padre?.id ?? null,
          motor,
          nivel: datos.nivel ?? null,
          orden: datos.orden ?? 0,
          estado,
          objetivos: datos.objetivos ?? [],
          etiquetas: normalizarEtiquetas(datos.etiquetas),
          autorId: permiso.quien.usuarioId,
        },
        select: SELECCION_TEMA,
      });

      if (!datos.reglas?.length) return creado;

      await tx.reglaMatematica.createMany({
        data: reglasParaGuardar(datos.reglas, {
          clave,
          nodoId: creado.id,
          motor,
          estado,
          autorId: permiso.quien.usuarioId,
        }),
      });

      // Se relee: el `create` devolvió el recuento de reglas ANTES de
      // escribirlas, y responder "0 reglas" a quien acaba de guardar tres es
      // decirle que se han perdido.
      return tx.nodoConocimiento.findUniqueOrThrow({
        where: { id: creado.id },
        select: SELECCION_TEMA,
      });
    });

    return NextResponse.json({ tema }, { status: 201 });
  } catch (e) {
    return fallo(e, "docente/temas:crear");
  }
}
