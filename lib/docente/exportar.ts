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
    /** ¿Resolvió el ejercicio EQUIVALENTE que le propuso el tutor? `null` si no lo intentó. */
    equivalenteResuelto: boolean | null;
    /** PMV 3 · H4: habilidad del ejercicio, si la tiene. */
    habilidad: string | null;
    resuelta: boolean;
  }>;
  /** PMV 3 · H4: una fila por (alumno, habilidad del docente) con actividad. */
  habilidades: Array<{
    estudianteId: string;
    estudiante: string;
    habilidad: string;
    intentos: number;
    errores: number;
    aciertos: number;
    pistas: number;
    repasos: number;
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

/**
 * LAS MISMAS MÉTRICAS EN EL PANEL, EL PDF Y EL EXCEL (PMV 3 · H4): las
 * cabeceras se definen aquí una vez y las tres vistas las usan tal cual.
 */
export const COLUMNAS_ALUMNO = ["Estudiante", "Correo", "Sesiones", "Tareas", "Pistas", "Repasos", "Equivalentes", "Bloqueos"] as const;
export const COLUMNAS_TUTORIA = ["Estudiante", "Tarea", "Tema", "Habilidad", "Ejercicio", "Errores", "Pistas", "Repasos", "Equivalentes", "Equivalente resuelto", "Resuelto"] as const;
export const COLUMNAS_HABILIDADES = ["Estudiante", "Habilidad", "Intentos", "Errores", "Aciertos", "Pistas", "Repasos"] as const;

const siNo = (v: boolean | null) => (v === null ? "—" : v ? "Sí" : "No");

export function filaAlumno(a: AulaDelReporte, e: AulaDelReporte["estudiantes"][number]): (string | number)[] {
  return [e.nombre, e.email, e.sesionesCompletadas, a.tareas.length, e.tutoria.pistas, e.tutoria.repasos, e.tutoria.equivalentes, e.tutoria.bloqueos];
}
export function filaTutoria(t: AulaDelReporte["tutoria"][number]): (string | number)[] {
  return [t.estudiante, t.tarea, t.tema, t.habilidad ?? "—", t.ejercicio, t.errores, t.pistas, t.repasos, t.equivalentes, siNo(t.equivalenteResuelto), siNo(t.resuelta)];
}
export function filaHabilidad(h: AulaDelReporte["habilidades"][number]): (string | number)[] {
  return [h.estudiante, h.habilidad, h.intentos, h.errores, h.aciertos, h.pistas, h.repasos];
}

/** Filtros comunes del panel y de las exportaciones (`?aulaId=`). */
export interface FiltroReporte {
  aulaId?: string | null;
}

export function filtroDesdeUrl(url: string | URL): FiltroReporte {
  const aulaId = new URL(url).searchParams.get("aulaId");
  return { aulaId: aulaId && aulaId.length <= 64 ? aulaId : null };
}

export async function obtenerReporteDocente(docenteId: string, filtro: FiltroReporte = {}): Promise<AulaDelReporte[]> {
  const aulas = await prisma.aula.findMany({
    where: { docenteId, ...(filtro.aulaId ? { id: filtro.aulaId } : {}) },
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
      id: true,
      habilidadId: true,
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

  // ¿Resolvió el equivalente? La ÚLTIMA respuesta a un equivalente de cada sesión.
  const respuestasEq = await prisma.eventoTutoria.findMany({
    where: { tipo: "EQUIVALENTE_RESPONDIDO", sesionId: { in: sesionesTutoria.map((s) => s.id) } },
    orderBy: { creadoEn: "asc" },
    select: { sesionId: true, detalle: true },
  });
  const equivalenteOk = new Map<string, boolean>();
  for (const r of respuestasEq) equivalenteOk.set(r.sesionId, (r.detalle as { correcto?: unknown })?.correcto === true);

  // PMV 3 · H4: el registro por habilidad, de las habilidades de ESTE docente.
  const registros = await prisma.registroHabilidad.findMany({
    where: { habilidad: { autorId: docenteId } },
    select: {
      estudianteId: true,
      intentos: true,
      errores: true,
      aciertos: true,
      pistas: true,
      repasos: true,
      habilidad: { select: { id: true, nombre: true } },
    },
    orderBy: { actualizadoEn: "desc" },
  });
  const nombreHabilidad = new Map(registros.map((r) => [r.habilidad.id, r.habilidad.nombre]));
  const faltan = [...new Set(sesionesTutoria.map((s) => s.habilidadId).filter((x): x is string => Boolean(x) && !nombreHabilidad.has(x!)))];
  if (faltan.length > 0) {
    for (const h of await prisma.habilidad.findMany({ where: { id: { in: faltan } }, select: { id: true, nombre: true } })) {
      nombreHabilidad.set(h.id, h.nombre);
    }
  }

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
        equivalenteResuelto: equivalenteOk.has(s.id) ? equivalenteOk.get(s.id)! : null,
        habilidad: s.habilidadId ? (nombreHabilidad.get(s.habilidadId) ?? null) : null,
        resuelta: s.resuelta,
      })),
    habilidades: registros
      .filter((r) => a.matriculas.some((m) => m.estudiante.id === r.estudianteId))
      .map((r) => ({
        estudianteId: r.estudianteId,
        estudiante: a.matriculas.find((m) => m.estudiante.id === r.estudianteId)!.estudiante.nombre,
        habilidad: r.habilidad.nombre,
        intentos: r.intentos,
        errores: r.errores,
        aciertos: r.aciertos,
        pistas: r.pistas,
        repasos: r.repasos,
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
