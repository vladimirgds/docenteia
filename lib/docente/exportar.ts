import { prisma } from "@/lib/prisma";

/**
 * Datos en bruto para los reportes del docente (HITO 4, sección 4:
 * "Generación PDF/Excel… listado consolidado de notas", "pestañas separadas:
 * Estudiantes, Tareas, Matriz de Calificaciones y Sesiones/Asistencia").
 *
 * UNA sola consulta, reutilizada por el generador de PDF y el de Excel —los
 * dos arman el mismo reporte en dos formatos, no dos reportes distintos—.
 * Alcance: las aulas de ESTE docente (HITO 3), no el listado libre de
 * `app/docente/page.tsx` (que es anterior al multi-tenant y no distingue de
 * quién es cada alumno).
 */
export interface AulaDelReporte {
  id: string;
  nombre: string;
  grado: number;
  seccion: string;
  estudiantes: Array<{
    id: string;
    nombre: string;
    email: string;
    /** Sesiones de lección TERMINADAS —lo más parecido a "asistencia" que hay: no existe un registro de asistencia como tal. */
    sesionesCompletadas: number;
    /** Tutoría adaptativa (PMV 3 · HITO 4): lo que le ha costado avanzar. */
    tutoria: { pistas: number; repasos: number; equivalentes: number; bloqueos: number };
  }>;
  /** Una fila por (alumno, ejercicio) con tutoría: dónde se atascó y qué hizo el tutor. */
  tutoria: Array<{
    estudianteId: string;
    estudiante: string;
    tarea: string;
    tema: string;
    ejercicio: string;
    errores: number;
    pistas: number;
    repasos: number;
    equivalentes: number;
    resuelta: boolean;
  }>;
  tareas: Array<{
    id: string;
    titulo: string;
    fechaVencimiento: Date;
    cantidadEjercicios: number;
  }>;
  /** Una fila por (tarea, estudiante) con entrega: la matriz de calificaciones sale de cruzar esto con `tareas` × `estudiantes`. */
  entregas: Array<{
    tareaId: string;
    estudianteId: string;
    completada: boolean;
    puntaje: number | null;
    fechaEntrega: Date | null;
  }>;
}

/** Los totales de un alumno: lo que se ve de un vistazo en el informe. */
function resumenDeTutoria(
  sesiones: { pistasDadas: number; repasos: number; equivalentes: number; erroresTotales: number }[],
) {
  return {
    pistas: sesiones.reduce((n, s) => n + s.pistasDadas, 0),
    repasos: sesiones.reduce((n, s) => n + s.repasos, 0),
    equivalentes: sesiones.reduce((n, s) => n + s.equivalentes, 0),
    // Un «bloqueo» es un ejercicio en el que el tutor tuvo que abrir un repaso.
    bloqueos: sesiones.filter((s) => s.repasos > 0).length,
  };
}

export async function obtenerReporteDocente(docenteId: string): Promise<AulaDelReporte[]> {
  const aulas = await prisma.aula.findMany({
    where: { docenteId },
    orderBy: [{ grado: "asc" }, { seccion: "asc" }],
    include: {
      matriculas: {
        include: {
          estudiante: {
            select: {
              id: true,
              nombre: true,
              email: true,
              perfilEstudiante: {
                select: { sesiones: { where: { finalizadaEn: { not: null } }, select: { id: true } } },
              },
            },
          },
        },
      },
      tareas: {
        orderBy: { fechaVencimiento: "asc" },
        include: { entregas: { select: { estudianteId: true, completada: true, puntaje: true, fechaEntrega: true } } },
      },
    },
  });

  // TUTORÍA ADAPTATIVA (PMV 3 · HITO 4): todo lo que el tutor hizo con los alumnos
  // de las aulas de ESTE docente. Se filtra por la tarea (y su aula), no por el
  // alumno: un alumno puede estar en aulas de varios docentes.
  const sesionesTutoria = await prisma.sesionTutoria.findMany({
    where: { tarea: { aula: { docenteId } } },
    orderBy: { actualizadoEn: "desc" },
    select: {
      estudianteId: true,
      tema: true,
      erroresTotales: true,
      pistasDadas: true,
      repasos: true,
      equivalentes: true,
      resuelta: true,
      estudiante: { select: { nombre: true } },
      tarea: { select: { titulo: true, aulaId: true } },
      ejercicio: { select: { enunciado: true } },
    },
  });

  return aulas.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    grado: a.grado,
    seccion: a.seccion,
    estudiantes: a.matriculas.map((m) => ({
      id: m.estudiante.id,
      nombre: m.estudiante.nombre,
      email: m.estudiante.email,
      sesionesCompletadas: m.estudiante.perfilEstudiante?.sesiones.length ?? 0,
      tutoria: resumenDeTutoria(
        sesionesTutoria.filter((s) => s.tarea.aulaId === a.id && s.estudianteId === m.estudiante.id),
      ),
    })),
    tutoria: sesionesTutoria
      .filter((s) => s.tarea.aulaId === a.id)
      .map((s) => ({
        estudianteId: s.estudianteId,
        estudiante: s.estudiante.nombre,
        tarea: s.tarea.titulo,
        tema: s.tema ?? "—",
        ejercicio: s.ejercicio?.enunciado ?? "(ejercicio retirado)",
        errores: s.erroresTotales,
        pistas: s.pistasDadas,
        repasos: s.repasos,
        equivalentes: s.equivalentes,
        resuelta: s.resuelta,
      })),
    tareas: a.tareas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      fechaVencimiento: t.fechaVencimiento,
      cantidadEjercicios: t.cantidadEjercicios,
    })),
    entregas: a.tareas.flatMap((t) =>
      t.entregas.map((e) => ({
        tareaId: t.id,
        estudianteId: e.estudianteId,
        completada: e.completada,
        puntaje: e.puntaje,
        fechaEntrega: e.fechaEntrega,
      })),
    ),
  }));
}
