import type { Prisma } from "@prisma/client";

import type { Autorizacion } from "./api";
import type { InformeFicha } from "./fichas-verificar";

/**
 * Lo que comparten las rutas de /api/docente/fichas-metodo: qué se devuelve de
 * cada ficha, qué se guarda de una verificación y quién ve qué (mismo contrato
 * que los ejercicios y los procedimientos: privada de su autor, y sólo llega a
 * los alumnos matriculados en un aula de ese docente).
 */

export const SELECCION_FICHA = {
  id: true,
  nodoId: true,
  titulo: true,
  motor: true,
  contenido: true,
  version: true,
  publicadaVersion: true,
  origen: true,
  ambito: true,
  estado: true,
  validacion: true,
  verificada: true,
  pendienteValidacion: true,
  autorId: true,
  institucionId: true,
  aprobadaEn: true,
  metadatos: true,
  creadoEn: true,
  actualizadoEn: true,
  nodo: { select: { id: true, titulo: true, clave: true, motor: true } },
  autor: { select: { id: true, nombre: true } },
} satisfies Prisma.FichaMetodoSelect;

/** De un informe a lo que se guarda en la fila: nunca se pone `verificada` a mano. */
export function camposDeInformeFicha(informe: InformeFicha) {
  return {
    validacion: informe as unknown as Prisma.InputJsonValue,
    verificada: informe.verificada,
    pendienteValidacion: informe.pendientes.length > 0,
  };
}

export function dondeFichasVisibles(quien: Autorizacion): Prisma.FichaMetodoWhereInput {
  if (quien.rol === "SUPERADMIN") return {};
  return {
    OR: [
      { ambito: "MAESTRO", OR: [{ institucionId: null }, { institucionId: quien.institucionId }] },
      { ambito: "DOCENTE", autorId: quien.usuarioId },
    ],
  };
}

/**
 * Qué fichas PUBLICADAS puede usar un ALUMNO: las del catálogo maestro (de su
 * colegio o base) y las privadas de un docente sólo si el alumno está
 * matriculado en un aula de ese docente.
 */
export function dondeFichasDelAlumno(estudianteId: string): Prisma.FichaMetodoWhereInput {
  return {
    estado: "PUBLICADO",
    publicadaVersion: { not: null },
    OR: [
      {
        ambito: "MAESTRO",
        OR: [
          { institucionId: null },
          { institucion: { aulas: { some: { matriculas: { some: { estudianteId } } } } } },
        ],
      },
      { ambito: "DOCENTE", autor: { aulasComoDocente: { some: { matriculas: { some: { estudianteId } } } } } },
    ],
  };
}

/** Dos fichas son «el mismo contenido» si su JSON normalizado coincide. */
export function mismoContenido(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
