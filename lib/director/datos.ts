import { prisma } from "@/lib/prisma";
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
  const [docentes, aulas, alumnosDistintos] = await Promise.all([
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
      },
    }),
    prisma.matricula.findMany({
      where: { aula: { institucionId } },
      select: { estudianteId: true },
      distinct: ["estudianteId"],
    }),
  ]);

  return calcularResumen(
    aulas.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      grado: a.grado,
      seccion: a.seccion,
      docenteNombre: a.docente.nombre,
      matriculas: a._count.matriculas,
      tareasCreadas: a._count.tareas,
      entregasCompletadas: a.tareas.reduce((t, tarea) => t + tarea.entregas.length, 0),
    })),
    docentes,
    alumnosDistintos.length,
  );
}
