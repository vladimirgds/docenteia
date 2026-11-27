import { Prisma } from "@prisma/client";
import type { AmbitoContenido, NivelAcademico, Tema } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { SELECCION_EJERCICIO, camposDeValidacion, pasosJson } from "@/lib/docente/ejercicios";
import { validarEjercicio } from "@/lib/docente/validador";
import type { BorradorCrudo } from "@/lib/docente/borradores-ia";

/**
 * Guarda borradores de ejercicios propuestos por la IA, aplicando SIEMPRE la
 * misma regla (PMV 3, Hitos 1 y 2): cada uno pasa por el validador del servidor,
 * sólo se da por verificado lo que Gemini y el motor confirman, y todo queda
 * como BORRADOR del autor. Lo usan `borradores-ia` (Hito 1) y el agente de
 * procedimientos (Hito 2), para que no haya dos versiones de la regla.
 */
export async function guardarBorradoresDeEjercicios(args: {
  autorId: string;
  ambito: AmbitoContenido;
  tema: { id: string; motor: Tema | null; institucionId: string | null };
  nivel: NivelAcademico;
  borradores: readonly BorradorCrudo[];
  modelo: string;
  modo: "gemini" | "demo";
  indicaciones?: string | null;
  /** Ficha de origen que se anota en los metadatos (p. ej. el procedimiento del que sale). */
  origenExtra?: Record<string, unknown>;
}) {
  const { autorId, ambito, tema, nivel, borradores } = args;

  const existentes = new Set(
    (
      await prisma.ejercicio.findMany({
        where: {
          nodoId: tema.id,
          ambito,
          ...(ambito === "DOCENTE" ? { autorId } : {}),
        },
        select: { enunciado: true },
      })
    ).map((e) => e.enunciado),
  );

  const guardados = [];
  const descartados: { enunciado: string; motivo: string }[] = [];

  for (const b of borradores) {
    if (existentes.has(b.enunciado)) {
      descartados.push({ enunciado: b.enunciado, motivo: "Ya está en tu banco de este tema." });
      continue;
    }

    // Se valida con la respuesta que dio la IA: si el motor calcula otra cosa, el
    // validador lo rechaza y el borrador se descarta (no se "corrige" con la del
    // motor: un motor que lee mal un enunciado daría una respuesta equivocada y
    // la marcaría como comprobada).
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
          nivel,
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
          autorId,
          metadatos: {
            ia: {
              modelo: args.modelo,
              modo: args.modo,
              generadoEn: new Date().toISOString(),
              indicaciones: args.indicaciones ?? null,
              respuestaIA: b.respuestaCorrecta,
              ...(args.origenExtra ?? {}),
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

  return { guardados, descartados };
}
