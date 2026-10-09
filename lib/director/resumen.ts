/**
 * El resumen institucional del director (HITO 3).
 *
 * Misma frontera que `lib/docente/metricas.ts`: el cálculo vive separado de la
 * consulta, para poder comprobarlo con datos de mentira y sin base de datos.
 * `GET /api/director/resumen` sólo trae las filas en bruto y llama a
 * `calcularResumen`.
 */

/** Un aula del colegio, con lo que hace falta para su fila de la tabla. */
export interface AulaEnBruto {
  id: string;
  nombre: string;
  grado: number;
  seccion: string;
  docenteNombre: string;
  /** Alumnos matriculados en ella. */
  matriculas: number;
  /** Tareas que su docente ha programado. */
  tareasCreadas: number;
  /** Cuántas de las entregas esperadas (matrículas × tareas) ya están completas. */
  entregasCompletadas: number;
}

/** Una fila de la tabla del panel: el aula más su tasa de entrega. */
export interface FilaAula extends AulaEnBruto {
  /**
   * Porcentaje de entregas completas sobre las esperadas, o `null` si el aula
   * no tiene ni alumnos ni tareas —dividir 0 entre 0 no es "0 % de entrega",
   * es "todavía no hay nada que entregar", y confundir las dos cosas pondría
   * en rojo un aula que simplemente acaba de crearse.
   */
  tasaEntrega: number | null;
}

/** Las cifras macro de cabecera. */
export interface ResumenInstitucional {
  totalDocentes: number;
  totalAulas: number;
  totalAlumnos: number;
  /** Alumnos SIN repetir: uno matriculado en tres aulas cuenta una vez. */
  aulas: FilaAula[];
}

/**
 * Calcula la tasa de entrega de un aula.
 *
 * El "esperado" es matrículas × tareas: cada alumno matriculado debe una
 * entrega por cada tarea de su aula. Sin matrículas o sin tareas no hay
 * esperado, y por tanto no hay tasa —ver el comentario de `tasaEntrega`—.
 */
export function tasaDeEntrega(aula: AulaEnBruto): number | null {
  const esperadas = aula.matriculas * aula.tareasCreadas;
  if (esperadas === 0) return null;
  return Math.round((aula.entregasCompletadas / esperadas) * 1000) / 10;
}

/**
 * Arma el resumen completo a partir de las aulas del colegio y de cuántos
 * alumnos distintos hay en total (que no es la suma de matrículas por aula: un
 * mismo alumno puede estar en más de una).
 */
export function calcularResumen(
  aulas: readonly AulaEnBruto[],
  totalDocentes: number,
  totalAlumnosDistintos: number,
): ResumenInstitucional {
  return {
    totalDocentes,
    totalAulas: aulas.length,
    totalAlumnos: totalAlumnosDistintos,
    aulas: aulas.map((a) => ({ ...a, tasaEntrega: tasaDeEntrega(a) })),
  };
}
