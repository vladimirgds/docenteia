import type { EtapaEducativa, NivelAcademico } from "@prisma/client";

/**
 * LA TAXONOMÍA CURRICULAR: ETAPA Y CURSO.
 *
 * POR QUÉ EXISTE, Y POR QUÉ NO BASTABA CON `nivel`
 *
 * El sistema tenía un solo eje —Básico, Intermedio, Avanzado— y lo usaba para
 * dos cosas incompatibles: graduar la dificultad y decidir qué contenidos le
 * tocan a cada alumno. Por eso un alumno de secundaria que respondía bien
 * acababa recibiendo derivadas: "avanzado" no significa "universitario",
 * significa "lo más difícil de lo tuyo".
 *
 * Aquí se separan los dos ejes:
 *
 *   · ETAPA + CURSO — dónde está el alumno en el sistema educativo. Es un hecho
 *     administrativo: Secundaria 3.er año, Superior 2.º ciclo. Decide QUÉ
 *     contenidos existen para él.
 *   · NIVEL — cuánto cuesta un contenido DENTRO de su etapa. Lo mide el
 *     diagnóstico y gradúa la dificultad.
 *
 * Con los dos ejes, "difícil para tercero de secundaria" y "de primer ciclo de
 * universidad" dejan de ser la misma casilla, que era el problema de raíz.
 */

export interface Etapa {
  valor: EtapaEducativa;
  /** Nombre en la interfaz. */
  nombre: string;
  /** Cómo se llama cada curso dentro de la etapa. */
  unidad: "Grado" | "Año" | "Ciclo";
  /** Cuántos cursos tiene, de 1 a `cursos`. */
  cursos: number;
  /** Resumen para la tarjeta de selección: "1.º a 6.º Grado". */
  rango: string;
  descripcion: string;
}

export const ETAPAS: readonly Etapa[] = [
  {
    valor: "PRIMARIA",
    nombre: "Primaria",
    unidad: "Grado",
    cursos: 6,
    rango: "1.º a 6.º Grado",
    descripcion: "Aritmética, fracciones y las primeras ecuaciones.",
  },
  {
    valor: "SECUNDARIA",
    nombre: "Secundaria",
    unidad: "Año",
    cursos: 5,
    rango: "1.º a 5.º Año",
    descripcion: "Álgebra, ecuaciones y factorización.",
  },
  {
    valor: "SUPERIOR",
    nombre: "Superior / Universitario",
    unidad: "Ciclo",
    cursos: 10,
    rango: "1.º a 10.º Ciclo",
    descripcion: "Cálculo: derivadas y funciones.",
  },
];

export function etapaPorValor(valor: string | null | undefined): Etapa | undefined {
  return ETAPAS.find((e) => e.valor === valor);
}

/** "3.er Año", "5.º Grado", "2.º Ciclo". */
export function etiquetaCurso(etapa: EtapaEducativa | null | undefined, curso: number | null | undefined): string {
  const datos = etapaPorValor(etapa ?? undefined);
  if (!datos || !curso) return "";
  // El ordinal español abrevia el 3 como "3.er" y el 1 como "1.er" cuando
  // acompaña a un masculino; el resto llevan "º".
  const ordinal = curso === 1 || curso === 3 ? `${curso}.er` : `${curso}.º`;
  return `${ordinal} ${datos.unidad}`;
}

/** "Secundaria · 3.er Año", o sólo la etapa si no hay curso. */
export function describirCurso(
  etapa: EtapaEducativa | null | undefined,
  curso: number | null | undefined,
): string {
  const datos = etapaPorValor(etapa ?? undefined);
  if (!datos) return "Sin etapa declarada";
  const detalle = etiquetaCurso(etapa, curso);
  return detalle ? `${datos.nombre} · ${detalle}` : datos.nombre;
}

/** ¿Es un curso posible dentro de la etapa? */
export function cursoValido(etapa: EtapaEducativa, curso: number): boolean {
  const datos = etapaPorValor(etapa);
  return Boolean(datos && Number.isInteger(curso) && curso >= 1 && curso <= datos.cursos);
}

// ── El alcance de un contenido ───────────────────────────────────────────────

/**
 * Alcance curricular de un tema, un ejercicio o una pregunta.
 *
 * Se lee como "A PARTIR DE": `{ etapa: SECUNDARIA, cursoMin: 3 }` es "desde 3.º
 * de secundaria". Con `etapa` a null es transversal, para cualquiera.
 */
export interface AlcanceCurricular {
  etapa: EtapaEducativa | null;
  cursoMin: number | null;
}

/** Las etapas están ordenadas: lo que se estudia antes sigue valiendo después. */
const ORDEN_ETAPA: Record<EtapaEducativa, number> = {
  PRIMARIA: 1,
  SECUNDARIA: 2,
  SUPERIOR: 3,
};

/** Dónde está el alumno. */
export interface CursoDelAlumno {
  etapa: EtapaEducativa | null;
  curso: number | null;
}

/**
 * ¿Le corresponde este contenido a este alumno?
 *
 * Tres reglas, y cada una responde a un caso real:
 *
 *   · Un contenido SIN etapa vale para cualquiera. Es lo transversal, y es lo
 *     que llevaba todo el catálogo del PMV 1: por eso la taxonomía se pudo
 *     introducir sin dejar a nadie sin temario mientras el profesorado clasifica.
 *   · Un contenido de una etapa POSTERIOR a la del alumno no le llega. Aquí está
 *     el arreglo de fondo: una derivada marcada como Superior no le aparece a un
 *     alumno de secundaria por muy bien que responda.
 *   · Un contenido de una etapa ANTERIOR sí le llega. Un universitario puede
 *     recibir una ecuación de secundaria —la tiene estudiada— y de hecho es lo
 *     que hace falta para repasar. Quien evita que le pregunten cosas triviales
 *     no es la etapa, es el nivel de dificultad.
 *
 * Cuando el alumno no ha declarado etapa se le sirve sólo lo transversal: una
 * prueba corta y correcta es mejor que una llena de contenido que no le toca.
 */
export function cubreAlAlumno(alcance: AlcanceCurricular, alumno: CursoDelAlumno): boolean {
  if (alcance.etapa === null) return true;
  if (!alumno.etapa) return false;

  const suya = ORDEN_ETAPA[alumno.etapa];
  const delContenido = ORDEN_ETAPA[alcance.etapa];
  if (suya < delContenido) return false;
  if (suya > delContenido) return true;

  // Misma etapa: manda el curso. Sin curso declarado se acepta, porque la etapa
  // ya acota lo esencial y afinar sin el dato sería inventárselo.
  if (alumno.curso == null) return true;
  return alcance.cursoMin == null || alumno.curso >= alcance.cursoMin;
}

/** "Desde Secundaria · 3.er Año", "Desde Superior", "Cualquier etapa". */
export function describirAlcance(alcance: AlcanceCurricular): string {
  const datos = etapaPorValor(alcance.etapa ?? undefined);
  if (!datos) return "Cualquier etapa";
  const detalle = etiquetaCurso(alcance.etapa, alcance.cursoMin);
  return detalle ? `Desde ${datos.nombre} · ${detalle}` : `Desde ${datos.nombre}`;
}

// ── Puente con el eje de dificultad ──────────────────────────────────────────

/**
 * Nivel de dificultad con el que EMPEZAR a preguntar en un curso dado.
 *
 * No es una equivalencia —los dos ejes son independientes— sino un punto de
 * partida razonable para el diagnóstico cuando el alumno todavía no tiene nivel
 * medido. Lo que decide qué contenidos existen sigue siendo la etapa.
 */
export function nivelSugerido(etapa: EtapaEducativa | null, curso: number | null): NivelAcademico {
  if (etapa === "SUPERIOR") return "AVANZADO";
  if (etapa === "PRIMARIA") return "BASICO";
  if (etapa === "SECUNDARIA") return (curso ?? 1) <= 2 ? "BASICO" : "INTERMEDIO";
  return "BASICO";
}

/**
 * Traduce el ciclo y el grado en texto libre del PMV 1 a la taxonomía nueva.
 *
 * Existe para las cuentas que ya estaban creadas, que llevan "Secundaria" y
 * "3º" escritos a mano. Devuelve lo que reconoce y `null` en lo que no: adivinar
 * la etapa de un "3º" suelto sería inventarse el dato del alumno.
 */
export function interpretarCursoEscrito(
  ciclo: string | null | undefined,
  grado: string | null | undefined,
): CursoDelAlumno {
  const texto = `${ciclo ?? ""} ${grado ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  if (!texto) return { etapa: null, curso: null };

  const etapa: EtapaEducativa | null = /bachiller|universi|superior|preuniv|ciclo\s*[ivx]/.test(texto)
    ? "SUPERIOR"
    : /secundaria|secundario|\beso\b/.test(texto)
      ? "SECUNDARIA"
      : /primaria|primario/.test(texto)
        ? "PRIMARIA"
        : null;

  if (!etapa) return { etapa: null, curso: null };

  const ORDINALES: Record<string, number> = {
    primero: 1, primer: 1, segundo: 2, tercero: 3, tercer: 3,
    cuarto: 4, quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10,
  };
  const cifra = texto.match(/\b(10|[1-9])\s*(?:\.?[ºo°]|er|ro|do|to|mo|vo)?\b/);
  let curso = cifra ? Number(cifra[1]) : null;
  if (curso === null) {
    for (const [palabra, valor] of Object.entries(ORDINALES)) {
      if (new RegExp(`\\b${palabra}\\b`).test(texto)) {
        curso = valor;
        break;
      }
    }
  }

  return { etapa, curso: curso !== null && cursoValido(etapa, curso) ? curso : null };
}

/**
 * El curso del alumno, mirando primero lo estructurado y después el texto.
 *
 * Los perfiles nuevos traen `etapa` y `curso` porque el alumno los elige en una
 * pantalla; los del PMV 1 sólo tienen texto. Esta función deja de importar de
 * dónde viene el dato.
 */
export function cursoDelPerfil(perfil: {
  etapa?: EtapaEducativa | null;
  curso?: number | null;
  ciclo?: string | null;
  grado?: string | null;
}): CursoDelAlumno {
  if (perfil.etapa) return { etapa: perfil.etapa, curso: perfil.curso ?? null };
  return interpretarCursoEscrito(perfil.ciclo, perfil.grado);
}

/**
 * Nivel de dificultad con el que se le empieza a preguntar a este alumno.
 *
 * Manda el nivel YA MEDIDO por un diagnóstico anterior; si no lo hay, se parte
 * del que sugiere su curso. Los dos ejes trabajando juntos: la etapa decide qué
 * contenidos existen para él, y el nivel, por cuál de ellos se empieza.
 */
export function nivelDePartida(perfil: {
  nivelActual?: NivelAcademico | null;
  etapa?: EtapaEducativa | null;
  curso?: number | null;
  ciclo?: string | null;
  grado?: string | null;
}): NivelAcademico {
  if (perfil.nivelActual) return perfil.nivelActual;
  const { etapa, curso } = cursoDelPerfil(perfil);
  return nivelSugerido(etapa, curso);
}
