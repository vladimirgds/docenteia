import type { EtapaEducativa, Tema } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { clausulaInstitucional, type Autorizacion } from "./api";
import { dondeEjerciciosVisibles } from "./bancos";

/**
 * EL BANCO DE UN DOCENTE, TEMA POR TEMA (PMV 3 · HITO 1).
 *
 * "Entrega de un banco docente vacío para la carga inicial de contenido por
 * tema": un docente que entra por primera vez ve TODOS los temas del currículo
 * con su banco propio a cero, y el catálogo maestro al lado como referencia. No
 * hay nada que "aprovisionar" —no existe una tabla de bancos—: el banco de un
 * docente en un tema es, por definición, los ejercicios de ese tema cuyo ámbito
 * es DOCENTE y cuyo autor es él. Vacío al principio porque nadie ha escrito
 * todavía; lleno cuando escribe.
 */

export interface ResumenBancoDeTema {
  tema: {
    id: string;
    clave: string;
    titulo: string;
    motor: Tema | null;
    etapa: EtapaEducativa | null;
    cursoMin: number | null;
    materia: string | null;
    /** `true` si el tema es del catálogo base de la plataforma. */
    base: boolean;
  };
  /** El catálogo maestro: lo publicado, que es lo que ve el alumnado. */
  catalogo: { publicados: number };
  /** El banco privado de quien pregunta. */
  propio: {
    total: number;
    publicados: number;
    borradores: number;
    /** Borradores generados por IA que esperan revisión. */
    borradoresIA: number;
  };
}

export async function resumenDeBancos(quien: Autorizacion): Promise<ResumenBancoDeTema[]> {
  const clausula = clausulaInstitucional(quien);

  const [temas, catalogo, propios] = await Promise.all([
    prisma.nodoConocimiento.findMany({
      where: { estado: "PUBLICADO", ...(clausula ? { OR: clausula } : {}) },
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: {
        id: true,
        clave: true,
        titulo: true,
        motor: true,
        etapa: true,
        cursoMin: true,
        institucionId: true,
        materia: { select: { nombre: true } },
      },
    }),
    prisma.ejercicio.groupBy({
      by: ["nodoId"],
      where: { AND: [{ ambito: "MAESTRO", estado: "PUBLICADO" }, dondeEjerciciosVisibles(quien)] },
      _count: { _all: true },
    }),
    prisma.ejercicio.groupBy({
      by: ["nodoId", "estado", "origen"],
      where: { ambito: "DOCENTE", autorId: quien.usuarioId },
      _count: { _all: true },
    }),
  ]);

  const publicadosPorTema = new Map<string, number>();
  for (const fila of catalogo) {
    if (fila.nodoId) publicadosPorTema.set(fila.nodoId, fila._count._all);
  }

  const propioPorTema = new Map<string, ResumenBancoDeTema["propio"]>();
  for (const fila of propios) {
    if (!fila.nodoId) continue;
    const actual = propioPorTema.get(fila.nodoId) ?? {
      total: 0,
      publicados: 0,
      borradores: 0,
      borradoresIA: 0,
    };
    const n = fila._count._all;
    actual.total += n;
    if (fila.estado === "PUBLICADO") actual.publicados += n;
    if (fila.estado === "BORRADOR") {
      actual.borradores += n;
      if (fila.origen === "IA") actual.borradoresIA += n;
    }
    propioPorTema.set(fila.nodoId, actual);
  }

  return temas.map((t) => ({
    tema: {
      id: t.id,
      clave: t.clave,
      titulo: t.titulo,
      motor: t.motor,
      etapa: t.etapa,
      cursoMin: t.cursoMin,
      materia: t.materia?.nombre ?? null,
      base: t.institucionId === null,
    },
    catalogo: { publicados: publicadosPorTema.get(t.id) ?? 0 },
    propio: propioPorTema.get(t.id) ?? { total: 0, publicados: 0, borradores: 0, borradoresIA: 0 },
  }));
}
