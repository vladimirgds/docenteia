import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { tareaSchema } from "@/lib/docente/aulas";

/**
 * ¿Es este tema (o este ejercicio, por el tema del que cuelga) legible desde
 * el colegio de ESTA aula? Deliberadamente no es `puedeLeerDeInstitucion`
 * (esa compara contra el colegio del DOCENTE): aquí lo que importa es el
 * colegio del AULA a la que se le asigna la tarea, que en la inmensa
 * mayoría de los casos coincide con el del docente titular, pero no tiene
 * por qué —un SUPERADMIN puede titular un aula con un docente de otro
 * colegio desde `/admin/aulas`—.
 */
function legibleEnElAula(institucionIdDelRecurso: string | null, institucionIdDelAula: string | null): boolean {
  return institucionIdDelRecurso === null || institucionIdDelRecurso === institucionIdDelAula;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tareas programadas (HITO 3): lo que el docente le asigna a un aula entera,
 * con su ventana de tiempo y su límite de reintentos.
 */

export async function GET(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const aulaId = new URL(req.url).searchParams.get("aulaId");

  try {
    const tareas = await prisma.tarea.findMany({
      where: {
        docenteId: permiso.quien.usuarioId,
        ...(aulaId ? { aulaId } : {}),
      },
      orderBy: { fechaVencimiento: "asc" },
      include: {
        aula: { select: { nombre: true, grado: true, seccion: true } },
        _count: { select: { entregas: true } },
      },
    });

    return NextResponse.json({ tareas });
  } catch (e) {
    return fallo(e, "docente/tareas:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, tareaSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    // El aula tiene que ser del docente en sesión: sin esto, cualquier docente
    // podría programar tareas en el aula de otro con sólo saber su id.
    const aula = await prisma.aula.findUnique({ where: { id: datos.aulaId } });
    if (!aula || aula.docenteId !== permiso.quien.usuarioId) {
      return noEncontrado("El aula");
    }

    // Aislamiento curricular (cierre HITO 4): un tema enlazado a la tarea —se
    // use o no para armar el banco— tiene que ser legible desde el colegio
    // del aula; si no, un docente podría asignar una tarea apuntando al tema
    // PRIVADO de otra institución con sólo saber su id.
    if (datos.nodoId) {
      const tema = await prisma.nodoConocimiento.findUnique({
        where: { id: datos.nodoId },
        select: { institucionId: true },
      });
      if (
        !tema ||
        (permiso.quien.rol !== "SUPERADMIN" && !legibleEnElAula(tema.institucionId, aula.institucionId))
      ) {
        return noEncontrado("El tema");
      }
    }

    // DEL BANCO DE EJERCICIOS (HITO 3 — corrección QA): "nivel de dificultad
    // en la asignación", automático o elegido a mano. `ejercicioIds` vacío
    // mantiene el comportamiento de siempre —el motor conversacional genera
    // sobre la marcha—, así que una tarea que no pide el banco no cambia en
    // nada.
    let ejercicioIds: string[] = [];
    if (datos.origenEjercicios === "banco") {
      if (datos.ejercicioIds && datos.ejercicioIds.length > 0) {
        // Elegidos a mano: se comprueba que sigan siendo ejercicios de
        // verdad —publicados, validados por el PRE Light, sin plantilla—.
        // Nada de esto lo decide el navegador; aquí es donde se confirma.
        const encontrados = await prisma.ejercicio.findMany({
          where: {
            id: { in: datos.ejercicioIds },
            estado: "PUBLICADO",
            validado: true,
            plantilla: false,
            // Aislamiento curricular (cierre HITO 4): sin esto, un docente
            // podría armar una tarea a mano citando ids de OTRA institución
            // —no se ven en /api/docente/ejercicios, pero nada impedía
            // escribirlos directamente en la petición—.
            ...(permiso.quien.rol === "SUPERADMIN"
              ? {}
              : { OR: [{ institucionId: null }, { institucionId: aula.institucionId }] }),
          },
          select: { id: true },
        });
        if (encontrados.length !== datos.ejercicioIds.length) {
          return NextResponse.json(
            { error: "Alguno de los ejercicios elegidos ya no está publicado o validado." },
            { status: 400 },
          );
        }
        ejercicioIds = datos.ejercicioIds;
      } else {
        // Automático: al azar, del tema y la dificultad pedidos.
        if (!datos.nodoId) {
          return NextResponse.json(
            { error: "Para armar la tarea desde el banco hace falta elegir un tema." },
            { status: 400 },
          );
        }
        const cantidad = datos.cantidadEjercicios ?? 5;
        const candidatos = await prisma.ejercicio.findMany({
          where: {
            nodoId: datos.nodoId,
            estado: "PUBLICADO",
            validado: true,
            plantilla: false,
            ...(datos.dificultad ? { nivel: datos.dificultad } : {}),
          },
          select: { id: true },
        });
        if (candidatos.length < cantidad) {
          return NextResponse.json(
            {
              error: `El banco sólo tiene ${candidatos.length} ejercicio${candidatos.length === 1 ? "" : "s"} publicado${candidatos.length === 1 ? "" : "s"} para ese tema y dificultad; hacen falta ${cantidad}.`,
            },
            { status: 400 },
          );
        }
        // Una baraja simple basta: el banco de un tema no es tan grande
        // como para que un sesgo de Fisher-Yates importe aquí.
        const barajados = [...candidatos].sort(() => Math.random() - 0.5);
        ejercicioIds = barajados.slice(0, cantidad).map((e) => e.id);
      }
    }

    const tarea = await prisma.tarea.create({
      data: {
        titulo: datos.titulo,
        descripcion: datos.descripcion ?? null,
        fechaInicio: datos.fechaInicio,
        fechaVencimiento: datos.fechaVencimiento,
        cantidadEjercicios: ejercicioIds.length > 0 ? ejercicioIds.length : (datos.cantidadEjercicios ?? 5),
        limiteReintentos: datos.limiteReintentos ?? 3,
        nodoId: datos.nodoId ?? null,
        dificultad: datos.origenEjercicios === "banco" ? (datos.dificultad ?? null) : null,
        ejercicioIds,
        aulaId: aula.id,
        docenteId: permiso.quien.usuarioId,
      },
    });

    return NextResponse.json({ tarea }, { status: 201 });
  } catch (e) {
    return fallo(e, "docente/tareas:crear");
  }
}
