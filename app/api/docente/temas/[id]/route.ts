import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { conflicto, exigirDocente, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { puedeSerPadre, temaActualizacionSchema, type Estado, type Motor } from "@/lib/docente/curriculo";
import { SELECCION_TEMA, normalizarEtiquetas, reglasParaGuardar } from "@/lib/docente/temas";
import { normalizarLatex } from "@/lib/matematicas";
import { camposDeValidacion, pasosJson } from "@/lib/docente/ejercicios";
import { validarEjercicio } from "@/lib/docente/validador";
import type { Parametro } from "@/lib/docente/parametros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un tema concreto: consultarlo entero, editarlo o borrarlo. */

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const tema = await prisma.nodoConocimiento.findUnique({
      where: { id },
      select: {
        ...SELECCION_TEMA,
        reglas: { orderBy: { orden: "asc" } },
        ejercicios: {
          orderBy: { creadoEn: "desc" },
          select: {
            id: true,
            enunciado: true,
            respuestaCorrecta: true,
            nivel: true,
            estado: true,
            validado: true,
            plantilla: true,
          },
        },
      },
    });
    if (!tema) return noEncontrado("El tema");
    return NextResponse.json({ tema });
  } catch (e) {
    return fallo(e, "docente/temas:consultar");
  }
}

export async function PATCH(req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const cuerpo = await leerCuerpo(req, temaActualizacionSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const actual = await prisma.nodoConocimiento.findUnique({
      where: { id },
      select: { id: true, clave: true, motor: true, estado: true, etapa: true, cursoMin: true },
    });
    if (!actual) return noEncontrado("El tema");

    // ── Nunca un tema puede ser su propio antepasado ─────────────────────────
    // Es un error fácil de cometer al reorganizar el temario y muy difícil de
    // reparar después: el árbol se queda sin raíz, el listado entra en bucle y
    // la lección no encuentra por dónde empezar.
    if (datos.padreId !== undefined && datos.padreId) {
      const todos = await prisma.nodoConocimiento.findMany({ select: { id: true, padreId: true } });
      if (!todos.some((n) => n.id === datos.padreId)) return noEncontrado("El tema padre");
      if (!puedeSerPadre(todos, id, datos.padreId)) {
        return conflicto(
          "Ese tema no puede ser el padre: es el propio tema o uno de sus subtemas, y el temario quedaría en bucle.",
        );
      }
    }

    if (datos.materiaId) {
      const materia = await prisma.materia.findUnique({ where: { id: datos.materiaId } });
      if (!materia) return noEncontrado("La asignatura");
    }

    const motor = (datos.motor !== undefined ? (datos.motor ?? null) : actual.motor) as Motor | null;
    const estado: Estado = (datos.estado ?? actual.estado) as Estado;
    const cambiaMotor = motor !== actual.motor;

    const tema = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.nodoConocimiento.update({
        where: { id },
        data: {
          ...(datos.titulo !== undefined ? { titulo: datos.titulo } : {}),
          ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion ?? null } : {}),
          ...(datos.materiaId !== undefined ? { materiaId: datos.materiaId ?? null } : {}),
          ...(datos.padreId !== undefined ? { padreId: datos.padreId ?? null } : {}),
          ...(datos.motor !== undefined ? { motor } : {}),
          ...(datos.nivel !== undefined ? { nivel: datos.nivel ?? null } : {}),
          ...(datos.etapa !== undefined ? { etapa: datos.etapa ?? null } : {}),
          ...(datos.cursoMin !== undefined ? { cursoMin: datos.cursoMin ?? null } : {}),
          ...(datos.orden !== undefined ? { orden: datos.orden } : {}),
          ...(datos.estado !== undefined ? { estado } : {}),
          ...(datos.objetivos !== undefined ? { objetivos: datos.objetivos } : {}),
          ...(datos.etiquetas !== undefined
            ? { etiquetas: normalizarEtiquetas(datos.etiquetas) }
            : {}),
          // La clave NO se regenera al renombrar: es la referencia estable del
          // tema y hay contenido y enlaces que ya la citan.
        },
        select: SELECCION_TEMA,
      });

      // ── Reglas: el formulario manda el juego completo ───────────────────────
      // Se conserva la fila de las que ya existían (por su id) para no cambiarles
      // la clave, se crean las nuevas y se borran las que el docente ha quitado.
      if (datos.reglas !== undefined) {
        const enviadas = datos.reglas ?? [];
        const conservar = enviadas.map((r) => r.id).filter(Boolean) as string[];

        await tx.reglaMatematica.deleteMany({
          where: { nodoId: id, ...(conservar.length ? { id: { notIn: conservar } } : {}) },
        });

        for (const [indice, regla] of enviadas.entries()) {
          if (!regla.id) continue;
          await tx.reglaMatematica.update({
            where: { id: regla.id },
            data: {
              tipo: regla.tipo ?? "REGLA",
              nombre: regla.nombre,
              // Mismas garantías que al crear: la barra duplicada se corrige y
              // sin motor no queda ninguna regla marcada como practicable.
              enunciado: normalizarLatex(regla.enunciado),
              descripcion: regla.descripcion,
              ejemplo: regla.ejemplo ? normalizarLatex(regla.ejemplo) : null,
              nivel: regla.nivel ?? null,
              practicable: motor ? (regla.practicable ?? false) : false,
              orden: regla.orden ?? indice,
              tema: motor,
              estado,
            },
          });
        }

        const nuevas = enviadas.filter((r) => !r.id);
        if (nuevas.length > 0) {
          const ocupadas = (await tx.reglaMatematica.findMany({ select: { clave: true } })).map(
            (r) => r.clave,
          );
          await tx.reglaMatematica.createMany({
            data: reglasParaGuardar(nuevas, {
              clave: actual.clave,
              nodoId: id,
              motor,
              estado,
              autorId: permiso.quien.usuarioId,
              ocupadas,
            }),
          });
        }
      } else if (cambiaMotor || datos.estado !== undefined) {
        // Aunque no se toquen las reglas, siguen al tema: si cambia de motor o
        // se despublica, sus reglas no pueden quedarse apuntando al motor viejo
        // ni visibles en una lección de la que el tema ya no forma parte.
        await tx.reglaMatematica.updateMany({
          where: { nodoId: id },
          data: { tema: motor, estado },
        });

        // Y si el tema se quedó SIN motor, ninguna de sus reglas puede seguir
        // marcada como practicable: ya no hay quien califique esa práctica.
        if (!motor) {
          await tx.reglaMatematica.updateMany({
            where: { nodoId: id },
            data: { practicable: false },
          });
        }
      }

      return actualizado;
    });

    // ── El motor ha cambiado: hay que volver a verificar el banco ─────────────
    // Un ejercicio verificado con "ecuaciones lineales" no está verificado si
    // ahora el tema se corrige con "fracciones". Dejarlo marcado como validado
    // sería exactamente la mentira que el validador existe para impedir, así que
    // se revalida ejercicio a ejercicio con el motor nuevo.
    let revalidados = 0;
    if (cambiaMotor) {
      const ejercicios = await prisma.ejercicio.findMany({
        where: { nodoId: id },
        take: 300,
      });
      for (const e of ejercicios) {
        const informe = validarEjercicio({
          enunciado: e.enunciado,
          respuestaCorrecta: e.plantilla ? null : e.respuestaCorrecta,
          respuestaFormula: e.respuestaFormula,
          plantilla: e.plantilla,
          parametros: (e.parametros ?? []) as unknown as Parametro[],
          motor,
          pistas: e.pistas,
        });
        const campos = camposDeValidacion(informe);
        await prisma.ejercicio.update({
          where: { id: e.id },
          data: {
            motor,
            validado: campos.validado,
            validadoEn: campos.validadoEn,
            informeValidacion: campos.informeValidacion as unknown as object,
            pasos: pasosJson(informe.muestras[0]?.enunciado ?? e.enunciado, motor),
            // La respuesta sólo se reescribe cuando el motor nuevo la calcula:
            // en otro caso se conserva la que escribió el docente.
            ...(campos.respuestaCorrecta ? { respuestaCorrecta: campos.respuestaCorrecta } : {}),
          },
        });
        revalidados++;
      }
    }

    return NextResponse.json({ tema, revalidados });
  } catch (e) {
    return fallo(e, "docente/temas:editar");
  }
}

/**
 * Borrado de un tema.
 *
 * Se niega en los dos casos en que borrar destruiría información que no es del
 * docente: cuando cuelgan subtemas (se perderían de vista) y cuando algún
 * alumno ya ha practicado sus ejercicios (se perdería su historial). Para eso
 * está ARCHIVADO, que retira el tema sin romper nada, y así se le dice.
 */
export async function DELETE(_req: Request, { params }: Contexto) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;

  try {
    const tema = await prisma.nodoConocimiento.findUnique({
      where: { id },
      select: {
        id: true,
        titulo: true,
        _count: { select: { hijos: true, ejercicios: true } },
      },
    });
    if (!tema) return noEncontrado("El tema");

    if (tema._count.hijos > 0) {
      return conflicto(
        `"${tema.titulo}" tiene ${tema._count.hijos} subtema(s). Muévelos o bórralos antes, o archiva el tema.`,
      );
    }

    const conHistorial = await prisma.registroProgreso.count({ where: { nodoId: id } });
    if (conHistorial > 0) {
      return conflicto(
        `"${tema.titulo}" ya tiene ${conHistorial} intento(s) de alumnos registrados. Archívalo en lugar de borrarlo: así se retira del temario y el historial se conserva.`,
      );
    }

    await prisma.$transaction([
      // Los ejercicios se borran explícitamente: la relación es SetNull, así que
      // sin esto se quedarían en el banco huérfanos y sin tema.
      prisma.ejercicio.deleteMany({ where: { nodoId: id } }),
      prisma.nodoConocimiento.delete({ where: { id } }),
    ]);

    return NextResponse.json({ borrado: true, ejercicios: tema._count.ejercicios });
  } catch (e) {
    return fallo(e, "docente/temas:borrar");
  }
}
