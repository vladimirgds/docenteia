import { prisma } from "@/lib/prisma";
import { dificultadesRecurrentes } from "@/lib/docente/metricas";
import { calcularResumen, type ResumenInstitucional } from "./resumen";

/**
 * Trae las filas en bruto de UNA institución y las resuelve con
 * `calcularResumen`.
 *
 * Única fuente de verdad: la usan `GET /api/director/resumen` y el panel
 * `/director` por igual, para no mantener la misma consulta escrita dos
 * veces y arriesgarse a que una de las dos cuente distinto.
 */
export async function obtenerResumenInstitucional(institucionId: string): Promise<ResumenInstitucional> {
  const [docentes, aulas, alumnosDistintos, erroresDelColegio] = await Promise.all([
    prisma.usuario.count({ where: { institucionId, rol: "DOCENTE" } }),
    prisma.aula.findMany({
      where: { institucionId },
      orderBy: [{ grado: "asc" }, { seccion: "asc" }],
      include: {
        docente: { select: { nombre: true } },
        _count: { select: { matriculas: true, tareas: true } },
        // Las entregas completas de cada tarea del aula: se agregan en JS
        // porque Prisma no sabe contar "entregas completas de las tareas de
        // esta aula" en una sola relación de agregado.
        tareas: { select: { entregas: { where: { completada: true }, select: { id: true } } } },
        // Lo mismo para los aciertos (HITO 4, 2.C): las prácticas calificadas
        // de cada alumno matriculado, para comparar el rendimiento del aula,
        // no sólo su tasa de entrega.
        matriculas: {
          select: {
            estudiante: {
              select: { perfilEstudiante: { select: { progreso: { select: { acierto: true } } } } },
            },
          },
        },
      },
    }),
    prisma.matricula.findMany({
      where: { aula: { institucionId } },
      select: { estudianteId: true },
      distinct: ["estudianteId"],
    }),
    // El catálogo de errores de TODO el colegio: de cualquier alumno
    // matriculado en cualquiera de sus aulas, sin importar en cuál.
    prisma.registroError.findMany({
      where: { perfil: { usuario: { matriculas: { some: { aula: { institucionId } } } } } },
      select: { tema: true, tipoError: true, ocurrencias: true },
    }),
  ]);

  return calcularResumen(
    aulas.map((a) => {
      const progresos = a.matriculas.flatMap((m) => m.estudiante.perfilEstudiante?.progreso ?? []);
      return {
        id: a.id,
        nombre: a.nombre,
        grado: a.grado,
        seccion: a.seccion,
        docenteNombre: a.docente?.nombre ?? "Sin asignar",
        matriculas: a._count.matriculas,
        tareasCreadas: a._count.tareas,
        entregasCompletadas: a.tareas.reduce((t, tarea) => t + tarea.entregas.length, 0),
        intentosRegistrados: progresos.length,
        aciertosRegistrados: progresos.filter((p) => p.acierto).length,
      };
    }),
    docentes,
    alumnosDistintos.length,
    dificultadesRecurrentes(erroresDelColegio),
  );
}
