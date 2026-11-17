import ExcelJS from "exceljs";

import type { AulaDelReporte } from "@/lib/docente/exportar";
import type { ResumenInstitucional } from "@/lib/director/resumen";

/**
 * Los libros de Excel del HITO 4 (sección 4: "Generar archivos .xlsx
 * estructurados con pestañas separadas").
 *
 * Nada de lo que hay aquí es lógica de negocio nueva: las cifras ya salen
 * calculadas de `lib/docente/metricas.ts` / `lib/director/resumen.ts` (las
 * mismas que pintan los paneles); esto sólo las vuelca en hojas.
 */

const CABECERA = { bold: true } as const;

function anchoAutomatico(filas: unknown[][]): number[] {
  const anchos: number[] = [];
  for (const fila of filas) {
    fila.forEach((valor, i) => {
      const largo = String(valor ?? "").length;
      anchos[i] = Math.max(anchos[i] ?? 10, Math.min(40, largo + 2));
    });
  }
  return anchos;
}

function aplicarFilas(hoja: ExcelJS.Worksheet, filas: unknown[][]) {
  const anchos = anchoAutomatico(filas);
  hoja.columns = anchos.map((width) => ({ width }));
  for (const fila of filas) hoja.addRow(fila);
  hoja.getRow(1).font = CABECERA;
}

/**
 * El reporte del docente: una hoja por aula para "Estudiantes" y "Tareas", una
 * "Matriz de calificaciones" (estudiante × tarea) y "Sesiones" (lo más
 * parecido a asistencia que hay sin un registro de asistencia dedicado).
 */
export async function excelDocente(docenteNombre: string, aulas: readonly AulaDelReporte[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MentorIA Math";
  wb.created = new Date();

  const estudiantes = wb.addWorksheet("Estudiantes");
  aplicarFilas(estudiantes, [
    ["Aula", "Estudiante", "Correo", "Sesiones completadas", "Pistas usadas", "Repasos abiertos", "Ejercicios equivalentes", "Bloqueos"],
    ...aulas.flatMap((a) =>
      a.estudiantes.map((e) => [
        `${a.grado}.º ${a.seccion} — ${a.nombre}`,
        e.nombre,
        e.email,
        e.sesionesCompletadas,
        e.tutoria.pistas,
        e.tutoria.repasos,
        e.tutoria.equivalentes,
        e.tutoria.bloqueos,
      ]),
    ),
  ]);

  const tareas = wb.addWorksheet("Tareas");
  aplicarFilas(tareas, [
    ["Aula", "Tarea", "Vence", "Ejercicios"],
    ...aulas.flatMap((a) =>
      a.tareas.map((t) => [
        `${a.grado}.º ${a.seccion} — ${a.nombre}`,
        t.titulo,
        t.fechaVencimiento.toLocaleDateString("es"),
        t.cantidadEjercicios,
      ]),
    ),
  ]);

  const matriz = wb.addWorksheet("Matriz de calificaciones");
  const filasMatriz: unknown[][] = [["Aula", "Estudiante", "Tarea", "Estado", "Puntaje"]];
  for (const a of aulas) {
    const entregaPorPar = new Map(a.entregas.map((e) => [`${e.tareaId}\u0000${e.estudianteId}`, e]));
    for (const t of a.tareas) {
      for (const e of a.estudiantes) {
        const entrega = entregaPorPar.get(`${t.id}\u0000${e.id}`);
        filasMatriz.push([
          `${a.grado}.º ${a.seccion} — ${a.nombre}`,
          e.nombre,
          t.titulo,
          entrega?.completada ? "Entregada" : "Pendiente",
          entrega?.puntaje ?? "",
        ]);
      }
    }
  }
  aplicarFilas(matriz, filasMatriz);

  const sesiones = wb.addWorksheet("Sesiones");
  aplicarFilas(sesiones, [
    ["Aula", "Estudiante", "Sesiones de lección completadas"],
    ...aulas.flatMap((a) => a.estudiantes.map((e) => [`${a.grado}.º ${a.seccion} — ${a.nombre}`, e.nombre, e.sesionesCompletadas])),
  ]);

  // PMV 3 · HITO 4: el detalle de la tutoría adaptativa, ejercicio por ejercicio.
  const tutoria = wb.addWorksheet("Tutoría adaptativa");
  aplicarFilas(tutoria, [
    ["Aula", "Estudiante", "Tarea", "Tema", "Ejercicio", "Errores", "Pistas", "Repasos", "Equivalentes", "Resuelto"],
    ...aulas.flatMap((a) =>
      a.tutoria.map((t) => [
        `${a.grado}.º ${a.seccion} — ${a.nombre}`,
        t.estudiante,
        t.tarea,
        t.tema,
        t.ejercicio,
        t.errores,
        t.pistas,
        t.repasos,
        t.equivalentes,
        t.resuelta ? "Sí" : "No",
      ]),
    ),
  ]);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** El reporte del director: aulas con su rendimiento, y los temas con más error del colegio. */
export async function excelDirector(nombreInstitucion: string, resumen: ResumenInstitucional): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MentorIA Math";
  wb.created = new Date();

  const aulas = wb.addWorksheet("Aulas");
  aplicarFilas(aulas, [
    ["Aula", "Docente a cargo", "Alumnos", "Tareas", "Entregas", "Rendimiento"],
    ...resumen.aulas.map((a) => [
      `${a.grado}.º ${a.seccion} — ${a.nombre}`,
      a.docenteNombre,
      a.matriculas,
      a.tareasCreadas,
      a.tasaEntrega == null ? "Sin datos" : `${a.tasaEntrega}%`,
      a.tasaAciertos == null ? "Sin datos" : `${a.tasaAciertos}%`,
    ]),
  ]);

  const errores = wb.addWorksheet("Temas con más error");
  aplicarFilas(errores, [
    ["Tema", "Tipo de error", "Ocurrencias", "Peso"],
    ...resumen.temasConMasErrores.map((d) => [d.tema, d.tipoError, d.ocurrencias, `${d.peso}%`]),
  ]);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
