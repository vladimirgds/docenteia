/**
 * Carga y adaptación del banco oficial de preguntas del diagnóstico.
 *
 * El fichero `prisma/seed-data/preguntas-diagnostico.json` se conserva con el
 * formato ORIGINAL en que lo entrega el cliente, sin reescribirlo, para que
 * sustituirlo por una versión nueva sea copiar y pegar. Toda la adaptación al
 * esquema de la base de datos ocurre aquí.
 *
 * Este módulo lo usan tanto la semilla (prisma/seed.ts) como la batería de
 * validación (qa/diagnostico.mjs). Que sea el mismo código en ambos sitios es
 * deliberado: si la comprobación validara una copia de la transformación en
 * lugar de la transformación real, podría dar por bueno un banco que la semilla
 * carga de otra manera.
 */

export type TemaEnum =
  | "ECUACIONES_LINEALES"
  | "DERIVADAS"
  | "FACTORIZACION"
  | "FRACCIONES"
  | "ARITMETICA";

export const TEMAS: readonly TemaEnum[] = [
  "ECUACIONES_LINEALES",
  "DERIVADAS",
  "FACTORIZACION",
  "FRACCIONES",
  "ARITMETICA",
];

/** Estructura de cada pregunta tal como llega en el JSON oficial. */
export interface PreguntaOficial {
  id: string;
  tema: string;
  /** Nivel de dificultad: BASICO, INTERMEDIO o AVANZADO. */
  nivel?: string;
  /** Etapa educativa A PARTIR DE la cual se plantea: PRIMARIA, SECUNDARIA, SUPERIOR. */
  etapa?: string;
  /** Curso mínimo dentro de esa etapa. */
  curso_min?: number;
  pregunta: string;
  opciones: string[];
  respuesta_correcta: string;
  tipo?: string;
}

export type NivelPregunta = "BASICO" | "INTERMEDIO" | "AVANZADO";

const NIVELES_PREGUNTA: readonly NivelPregunta[] = ["BASICO", "INTERMEDIO", "AVANZADO"];

export type EtapaPregunta = "PRIMARIA" | "SECUNDARIA" | "SUPERIOR";

const ETAPAS_PREGUNTA: readonly EtapaPregunta[] = ["PRIMARIA", "SECUNDARIA", "SUPERIOR"];

/** Pregunta ya adaptada al esquema de `preguntas_diagnostico`. */
export interface PreguntaAdaptada {
  clave: string;
  orden: number;
  tema: TemaEnum;
  enunciado: string;
  opciones: Array<{ id: string; texto: string }>;
  /** Identificador de la opción correcta, no su texto. */
  respuestaCorrecta: string;
  /**
   * Nivel al que se plantea la pregunta. `null` = vale para cualquiera.
   *
   * Es lo que evita que a un alumno de 3.º de secundaria se le pregunte por
   * derivadas: el diagnóstico sirve las preguntas de SU nivel, no el banco
   * entero.
   */
  nivel: NivelPregunta | null;
  /**
   * Desde qué punto del sistema educativo se plantea. Es el otro eje: `nivel`
   * dice cuánto cuesta, esto dice a quién le toca. Una derivada es de Superior
   * aunque su dificultad relativa sea la misma que la de una factorización.
   */
  etapa: EtapaPregunta | null;
  cursoMin: number | null;
}

/**
 * Convierte una expresión escrita en LaTeX a la notación plana que entiende el
 * motor determinista (`src/preLight.js`).
 *
 * Por qué hace falta: el banco muestra la matemática con KaTeX —de otro modo
 * "2/3 + 5/6" se leería como texto corrido en lugar de como fracciones—, pero
 * el motor que verifica esas respuestas espera notación plana. En vez de
 * guardar el enunciado dos veces (una para mostrar y otra para validar, con el
 * riesgo de que se desincronicen), se guarda sólo la versión LaTeX y aquí se
 * traduce cuando hay que calcular.
 */
export function latexAPlano(texto: string): string {
  return String(texto ?? "")
    // Delimitadores de fórmula.
    .replace(/\$\$?/g, " ")
    // Fracciones: \frac{2}{3} → (2)/(3). Los paréntesis evitan que
    // "\frac{a+b}{c}" se convierta en "a+b/c", que significa otra cosa.
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
    // Operadores.
    .replace(/\\times|\\cdot/g, "*")
    .replace(/\\div/g, "/")
    // Paréntesis escalables.
    .replace(/\\left\s*|\\right\s*/g, "")
    // Exponentes: x^{2} → x^2.
    .replace(/\^\s*\{\s*([^{}]*)\s*\}/g, "^$1")
    // Espaciado tipográfico de LaTeX.
    .replace(/\\[,;!:> ]/g, " ")
    // Un paréntesis que sólo envuelve un número no aporta nada y estorba a los
    // analizadores del motor: "(2)/(3)" → "2/3".
    .replace(/\((\s*-?\d+(?:\.\d+)?\s*)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** "ecuaciones_lineales" → "ECUACIONES_LINEALES", validando contra el enum. */
export function temaAEnum(tema: string): TemaEnum {
  const valor = String(tema).trim().toUpperCase();
  if (!(TEMAS as readonly string[]).includes(valor)) {
    throw new Error(
      `Tema desconocido en el banco de preguntas: "${tema}". Los válidos son: ${TEMAS.join(", ")}`,
    );
  }
  return valor as TemaEnum;
}

export const IDS_OPCION = ["a", "b", "c", "d", "e", "f"];

/**
 * Cuántas preguntas del mismo tema se toleran dentro de un mismo nivel.
 *
 * Eran dos cuando el banco sólo se dividía por dificultad. Con la taxonomía
 * curricular, un mismo nivel reparte sus preguntas entre varios cursos —lo
 * básico empieza en 1.º de primaria y llega hasta 1.º de secundaria— y dos por
 * tema no alcanzan a cubrirlos. Tres siguen dejando sitio a otros temas, que es
 * lo que este tope protege.
 */
export const MAX_PREGUNTAS_POR_TEMA = 3;

/**
 * Convierte una pregunta del formato oficial al del esquema.
 *
 * Las opciones pasan de ser una lista de textos a pares { id, texto }, y la
 * respuesta correcta pasa de ser el TEXTO a ser el ID de esa opción. Así, lo
 * que el navegador envía al corregir es un identificador opaco y no la propia
 * respuesta: la comparación deja de depender de espacios, de mayúsculas o de
 * cómo esté escrita la fórmula.
 */
export function adaptar(p: PreguntaOficial, indice: number): PreguntaAdaptada {
  if (!p || typeof p.id !== "string" || !p.id.trim()) {
    throw new Error(`La pregunta en la posición ${indice} no tiene identificador.`);
  }
  if (typeof p.pregunta !== "string" || !p.pregunta.trim()) {
    throw new Error(`La pregunta "${p.id}" no tiene enunciado.`);
  }
  if (!Array.isArray(p.opciones) || p.opciones.length < 2) {
    throw new Error(`La pregunta "${p.id}" no tiene al menos dos opciones.`);
  }
  if (p.opciones.length > IDS_OPCION.length) {
    throw new Error(
      `La pregunta "${p.id}" tiene ${p.opciones.length} opciones; el máximo contemplado es ${IDS_OPCION.length}.`,
    );
  }
  if (new Set(p.opciones).size !== p.opciones.length) {
    throw new Error(`La pregunta "${p.id}" tiene opciones repetidas.`);
  }

  const opciones = p.opciones.map((texto, i) => ({ id: IDS_OPCION[i], texto }));
  const correcta = opciones.find((o) => o.texto === p.respuesta_correcta);

  // Un banco cuya respuesta correcta no figura entre las opciones clasificaría
  // mal a TODOS los alumnos y no daría ningún síntoma visible. Se para aquí.
  if (!correcta) {
    throw new Error(
      `La respuesta correcta de "${p.id}" ("${p.respuesta_correcta}") no coincide con ninguna de sus opciones: ${p.opciones.join(" | ")}`,
    );
  }

  const nivel = p.nivel ? String(p.nivel).toUpperCase() : null;
  if (nivel && !(NIVELES_PREGUNTA as readonly string[]).includes(nivel)) {
    throw new Error(
      `Nivel desconocido en la pregunta "${p.id}": ${p.nivel}. Los válidos son: ${NIVELES_PREGUNTA.join(", ")}`,
    );
  }

  const etapa = p.etapa ? String(p.etapa).toUpperCase() : null;
  if (etapa && !(ETAPAS_PREGUNTA as readonly string[]).includes(etapa)) {
    throw new Error(
      `Etapa desconocida en la pregunta "${p.id}": ${p.etapa}. Las válidas son: ${ETAPAS_PREGUNTA.join(", ")}`,
    );
  }
  if (p.curso_min != null && (!Number.isInteger(p.curso_min) || p.curso_min < 1 || p.curso_min > 10)) {
    throw new Error(`El curso mínimo de "${p.id}" no es un curso posible: ${p.curso_min}`);
  }

  return {
    clave: p.id,
    orden: indice + 1,
    tema: temaAEnum(p.tema),
    enunciado: p.pregunta,
    opciones,
    respuestaCorrecta: correcta.id,
    nivel: (nivel as NivelPregunta | null) ?? null,
    etapa: (etapa as EtapaPregunta | null) ?? null,
    cursoMin: p.curso_min ?? null,
  };
}

/**
 * Adapta el banco completo, comprobando además lo que sólo se puede ver mirando
 * el conjunto: que no haya identificadores repetidos ni dos preguntas activas
 * para el mismo tema.
 */
export function adaptarBanco(oficial: PreguntaOficial[]): PreguntaAdaptada[] {
  if (!Array.isArray(oficial) || oficial.length === 0) {
    throw new Error("El banco de preguntas está vacío o no es una lista.");
  }

  const preguntas = oficial.map(adaptar);

  const claves = preguntas.map((p) => p.clave);
  if (new Set(claves).size !== claves.length) {
    throw new Error("Hay identificadores de pregunta repetidos en el banco.");
  }

  // ── Equilibrio DENTRO de cada nivel ────────────────────────────────────────
  // La regla del PMV 1 era "una pregunta por tema", porque el banco era uno
  // solo y cubría los cinco temas del motor. Con el banco partido por niveles
  // esa regla deja de valer: en BÁSICO no se pregunta por derivadas, así que
  // sus cinco preguntas salen de tres temas. Lo que sí hay que seguir evitando
  // es que un nivel se apoye en un único tema, porque entonces el diagnóstico
  // mediría ese tema y no el nivel del alumno.
  const porNivel = new Map<string, PreguntaAdaptada[]>();
  for (const p of preguntas) {
    const clave = p.nivel ?? "SIN_NIVEL";
    porNivel.set(clave, [...(porNivel.get(clave) ?? []), p]);
  }

  for (const [nivel, delNivel] of porNivel) {
    const cuenta = new Map<string, number>();
    for (const p of delNivel) cuenta.set(p.tema, (cuenta.get(p.tema) ?? 0) + 1);

    for (const [tema, veces] of cuenta) {
      if (veces > MAX_PREGUNTAS_POR_TEMA) {
        throw new Error(
          `El nivel ${nivel} tiene ${veces} preguntas de ${tema}; el máximo son ${MAX_PREGUNTAS_POR_TEMA}, o el diagnóstico mediría un solo tema.`,
        );
      }
    }

    if (delNivel.length >= 3 && cuenta.size < 2) {
      throw new Error(`El nivel ${nivel} sólo pregunta por un tema (${[...cuenta.keys()][0]}).`);
    }
  }

  // Lo que motivó toda la taxonomía: una derivada no se le plantea a un alumno
  // de secundaria, por muy avanzado que vaya en lo suyo.
  for (const p of preguntas) {
    if (p.tema === "DERIVADAS" && p.etapa !== "SUPERIOR") {
      throw new Error(
        `La pregunta "${p.clave}" es de derivadas y su etapa es ${p.etapa ?? "ninguna"}: las derivadas son de Superior.`,
      );
    }
  }

  return preguntas;
}
