import type { Prisma } from "@prisma/client";

import type { Autorizacion } from "./api";
import type { InformeVerificacion } from "./verificar-pasos";

/**
 * Lo que comparten las rutas de /api/docente/procedimientos: qué se devuelve de
 * cada procedimiento, qué se guarda de una verificación y quién ve qué.
 */

export const SELECCION_PROCEDIMIENTO = {
  id: true,
  nodoId: true,
  tipo: true,
  titulo: true,
  descripcion: true,
  motor: true,
  ejemplo: true,
  respuestaEjemplo: true,
  pasos: true,
  preguntas: true,
  pistas: true,
  origen: true,
  ambito: true,
  estado: true,
  verificado: true,
  informeVerificacion: true,
  verificadoEn: true,
  repasoId: true,
  autorId: true,
  institucionId: true,
  revisadoEn: true,
  metadatos: true,
  creadoEn: true,
  actualizadoEn: true,
  nodo: { select: { id: true, titulo: true, clave: true, motor: true } },
  autor: { select: { id: true, nombre: true } },
} satisfies Prisma.ProcedimientoSelect;

/** De un informe de verificación a lo que se guarda en la fila. */
export function camposDeVerificacion(informe: InformeVerificacion) {
  return {
    verificado: informe.verificado,
    verificadoEn: informe.verificado ? new Date() : null,
    informeVerificacion: informe as unknown as Prisma.InputJsonValue,
    respuestaEjemplo: informe.respuestaEjemplo,
  };
}

/**
 * La parte de `where` que deja pasar SÓLO los procedimientos que `quien` puede
 * leer: el mismo contrato que los ejercicios (ver `bancos.ts`). Se combina con
 * `AND`, nunca con `OR`.
 */
export function dondeProcedimientosVisibles(quien: Autorizacion): Prisma.ProcedimientoWhereInput {
  if (quien.rol === "SUPERADMIN") return {};
  return {
    OR: [
      {
        ambito: "MAESTRO",
        OR: [{ institucionId: null }, { institucionId: quien.institucionId }],
      },
      { ambito: "DOCENTE", autorId: quien.usuarioId },
    ],
  };
}

/**
 * Qué procedimientos PUBLICADOS puede abrir un ALUMNO:
 *   · los del catálogo maestro (de su colegio o base), y
 *   · los privados de un docente SÓLO si el alumno está matriculado en un aula de
 *     ese docente.
 * El banco privado de un docente cuyo aula no pisa el alumno no existe para él.
 */
export function dondeProcedimientosDelAlumno(estudianteId: string): Prisma.ProcedimientoWhereInput {
  return {
    estado: "PUBLICADO",
    OR: [
      // El catálogo: el BASE, o el de un colegio en cuyas aulas está el alumno. El
      // de otro colegio no existe para él, aunque lo haya publicado un SUPERADMIN.
      {
        ambito: "MAESTRO",
        OR: [
          { institucionId: null },
          { institucion: { aulas: { some: { matriculas: { some: { estudianteId } } } } } },
        ],
      },
      {
        ambito: "DOCENTE",
        autor: { aulasComoDocente: { some: { matriculas: { some: { estudianteId } } } } },
      },
    ],
  };
}
