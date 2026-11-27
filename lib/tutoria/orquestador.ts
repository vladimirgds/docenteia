/**
 * ORQUESTADOR PEDAGÓGICO (PMV 3 · HITO 2).
 *
 * «Hacer que el tutor decida cuándo explicar, preguntar, dar una pista o mostrar
 * una solución» a partir de tres cosas que lee el servidor: el MODO DE APRENDIZAJE,
 * el PASO ACTIVO y los INTENTOS. Todo lo que sale hacia el alumno —texto, audio o
 * instrucciones del LSG— pasa antes por la POLÍTICA DE REVELACIÓN, y cada
 * decisión lleva su motivo para poder registrarla y auditarla.
 *
 * Funciones puras: sin Prisma, sin red. Las rutas leen el estado, llaman aquí y
 * guardan la decisión; la lógica pedagógica se puede probar sola.
 *
 * LOS MODOS (propuesta del proyecto, a confirmar con el cliente):
 *
 *   EXPLICACION      el tutor presenta el procedimiento: se puede revelar todo.
 *   PRACTICA_GUIADA  el alumno resuelve paso a paso con ayuda graduada. NUNCA se
 *                    entrega la solución completa de golpe: a lo sumo el paso
 *                    siguiente, y sólo tras intentar y recibir pistas.
 *   PRACTICA_LIBRE   el alumno resuelve a su ritmo; la solución completa llega
 *                    tras agotar las pistas.
 *   EVALUACION       sin ayudas ni explicaciones: sólo se registra.
 */

export type ModoAprendizaje = "EXPLICACION" | "PRACTICA_GUIADA" | "PRACTICA_LIBRE" | "EVALUACION";

export type Evento =
  | "INICIO_PASO"
  | "PASO_CORRECTO"
  | "PASO_INCORRECTO"
  | "PIDE_PISTA"
  | "PIDE_SOLUCION"
  | "PIDE_EXPLICACION";

export type Accion =
  | "EXPLICAR"
  | "PREGUNTAR"
  | "PISTA"
  | "MOSTRAR_PASO"
  | "MOSTRAR_SOLUCION"
  | "CONTINUAR"
  | "REGISTRAR"
  | "NEGAR";

/** Cuánto se puede revelar, de menos a más. */
export type Revela = "nada" | "pista" | "paso" | "solucion";
const ORDEN_REVELA: Record<Revela, number> = { nada: 0, pista: 1, paso: 2, solucion: 3 };

export type Razon =
  | "MODO_EXPLICACION_REVELA_TODO"
  | "INICIO_DE_PASO_SE_PREGUNTA"
  | "PASO_CORRECTO_SE_AVANZA"
  | "PRIMER_FALLO_SE_EXPLICA_EL_ERROR"
  | "FALLO_REPETIDO_PISTA_ORIENTADORA"
  | "FALLO_REPETIDO_PISTA_CONCRETA"
  | "FALLOS_AGOTADOS_SE_MUESTRA_EL_PASO"
  | "PISTA_SOLICITADA"
  | "PISTAS_AGOTADAS_SE_MUESTRA_EL_PASO"
  | "SOLUCION_NO_PERMITIDA_AUN_SE_DA_PISTA"
  | "SOLUCION_COMPLETA_PROHIBIDA_EN_GUIADA"
  | "SOLUCION_TRAS_INTENTAR_Y_PISTAS"
  | "EVALUACION_SIN_AYUDAS"
  | "EVALUACION_SE_REGISTRA"
  | "EXPLICACION_SOLICITADA";

export interface Entrada {
  modo: ModoAprendizaje;
  evento: Evento;
  /** El paso que el alumno tiene delante: `indice` 0-based, de `total` previstos. */
  paso: { indice: number; total: number };
  intentos: {
    /** Respuestas incorrectas SEGUIDAS en este paso. */
    fallosEnPaso: number;
    /** Pistas ya dadas en este paso. */
    pistasEnPaso: number;
    /** Pistas dadas en toda la práctica. */
    pistasTotales: number;
  };
}

export interface Decision {
  accion: Accion;
  /** Nivel de pista a entregar (1 orientadora, 2 concreta); 0 si no es una pista. */
  nivelAyuda: 0 | 1 | 2;
  /** Lo máximo que esta decisión permite revelar al alumno. */
  revelaHasta: Revela;
  razon: Razon;
  /** La razón en palabras, para el registro y para el docente. */
  motivo: string;
}

/** Umbrales de la política (modificables sin tocar la lógica). */
export const UMBRALES = {
  /** Guiada: fallos seguidos en un paso antes de mostrarlo. */
  fallosParaMostrarPaso: 4,
  /** Guiada: pistas dadas en un paso antes de que pedir ayuda muestre el paso. */
  pistasParaMostrarPaso: 2,
  /** Guiada/libre: fallos+pistas necesarios en el paso para que «quiero la solución» muestre algo más que una pista. */
  intentosParaSolucion: 3,
  /** Libre: pistas totales para dar la solución completa. */
  pistasParaSolucionLibre: 2,
} as const;

const decision = (accion: Accion, revelaHasta: Revela, razon: Razon, motivo: string, nivelAyuda: 0 | 1 | 2 = 0): Decision => ({
  accion,
  nivelAyuda,
  revelaHasta,
  razon,
  motivo,
});

/** La pista que toca dar a continuación (1 orientadora, 2 concreta). */
const siguienteNivel = (pistasEnPaso: number): 1 | 2 => (pistasEnPaso >= 1 ? 2 : 1);

/**
 * LA DECISIÓN PEDAGÓGICA. Cada rama deja escrito POR QUÉ: el motivo se guarda
 * junto con la entrada que lo provocó.
 */
export function decidir(e: Entrada): Decision {
  const { modo, evento } = e;
  const { fallosEnPaso, pistasEnPaso, pistasTotales } = e.intentos;

  // ── EXPLICACION: el tutor explica; se puede revelar todo ─────────────────
  if (modo === "EXPLICACION") {
    if (evento === "PASO_CORRECTO") {
      return decision("CONTINUAR", "nada", "PASO_CORRECTO_SE_AVANZA", "El paso es correcto: se continúa con el siguiente.");
    }
    return decision("MOSTRAR_SOLUCION", "solucion", "MODO_EXPLICACION_REVELA_TODO", "En modo explicación el tutor presenta el procedimiento completo.");
  }

  // ── EVALUACION: sin ayudas ───────────────────────────────────────────────
  if (modo === "EVALUACION") {
    if (evento === "PIDE_PISTA" || evento === "PIDE_SOLUCION" || evento === "PIDE_EXPLICACION") {
      return decision("NEGAR", "nada", "EVALUACION_SIN_AYUDAS", "En una evaluación no se dan pistas, explicaciones ni soluciones.");
    }
    return decision("REGISTRAR", "nada", "EVALUACION_SE_REGISTRA", "En una evaluación sólo se registra la respuesta, sin explicarla.");
  }

  // ── Comunes a las dos prácticas ──────────────────────────────────────────
  if (evento === "INICIO_PASO") {
    return decision("PREGUNTAR", "nada", "INICIO_DE_PASO_SE_PREGUNTA", "Se plantea el paso y se pregunta al alumno cuál sería el siguiente.");
  }
  if (evento === "PASO_CORRECTO") {
    return decision("CONTINUAR", "nada", "PASO_CORRECTO_SE_AVANZA", "El paso es correcto: se continúa con el siguiente.");
  }
  if (evento === "PIDE_EXPLICACION") {
    return decision("EXPLICAR", "pista", "EXPLICACION_SOLICITADA", "El alumno pide una explicación: se explica el concepto sin dar el paso.");
  }

  const guiada = modo === "PRACTICA_GUIADA";

  if (evento === "PASO_INCORRECTO") {
    if (fallosEnPaso <= 1) {
      return decision("EXPLICAR", "pista", "PRIMER_FALLO_SE_EXPLICA_EL_ERROR", "Primer fallo en el paso: se explica el error sin dar el paso correcto.");
    }
    if (fallosEnPaso === 2) {
      return decision("PISTA", "pista", "FALLO_REPETIDO_PISTA_ORIENTADORA", "Segundo fallo seguido: pista orientadora.", 1);
    }
    if (fallosEnPaso === 3) {
      return decision("PISTA", "pista", "FALLO_REPETIDO_PISTA_CONCRETA", "Tercer fallo seguido: pista concreta.", 2);
    }
    // Cuarto fallo en adelante.
    return decision("MOSTRAR_PASO", "paso", "FALLOS_AGOTADOS_SE_MUESTRA_EL_PASO", `${fallosEnPaso} fallos seguidos en el paso: se muestra el paso (no la solución completa).`);
  }

  if (evento === "PIDE_PISTA") {
    if (pistasEnPaso >= UMBRALES.pistasParaMostrarPaso) {
      return decision("MOSTRAR_PASO", "paso", "PISTAS_AGOTADAS_SE_MUESTRA_EL_PASO", "Las pistas de este paso ya se dieron: se muestra el paso.");
    }
    const nivel = siguienteNivel(pistasEnPaso);
    return decision("PISTA", "pista", "PISTA_SOLICITADA", `El alumno pide ayuda: pista de nivel ${nivel}.`, nivel);
  }

  // PIDE_SOLUCION
  const esfuerzo = fallosEnPaso + pistasEnPaso;
  if (guiada) {
    if (esfuerzo < UMBRALES.intentosParaSolucion) {
      // La «ayuda prevista por la política»: no se da la solución, se da la
      // siguiente pista de la escalera.
      if (pistasEnPaso >= UMBRALES.pistasParaMostrarPaso) {
        return decision("MOSTRAR_PASO", "paso", "SOLUCION_COMPLETA_PROHIBIDA_EN_GUIADA", "Práctica guiada: no se entrega la solución completa; se muestra sólo el paso.");
      }
      const nivel = siguienteNivel(pistasEnPaso);
      return decision(
        "PISTA",
        "pista",
        "SOLUCION_NO_PERMITIDA_AUN_SE_DA_PISTA",
        `Pidió la solución en práctica guiada con ${fallosEnPaso} fallo(s) y ${pistasEnPaso} pista(s): aún no corresponde; se da la pista de nivel ${nivel}.`,
        nivel,
      );
    }
    return decision("MOSTRAR_PASO", "paso", "SOLUCION_COMPLETA_PROHIBIDA_EN_GUIADA", "Práctica guiada: tras intentar y recibir pistas se muestra el paso siguiente, nunca la solución completa.");
  }

  // PRACTICA_LIBRE
  if (pistasTotales >= UMBRALES.pistasParaSolucionLibre || fallosEnPaso >= UMBRALES.intentosParaSolucion) {
    return decision("MOSTRAR_SOLUCION", "solucion", "SOLUCION_TRAS_INTENTAR_Y_PISTAS", "Práctica libre: tras intentarlo y agotar las pistas se muestra la solución.");
  }
  const nivel = siguienteNivel(pistasEnPaso);
  return decision("PISTA", "pista", "SOLUCION_NO_PERMITIDA_AUN_SE_DA_PISTA", "Pidió la solución sin haber agotado las pistas: se da una pista.", nivel);
}

// ── La política de revelación ────────────────────────────────────────────────

/** Una instrucción del LSG de la práctica (lo que el cliente dibuja o dice). */
export interface InstruccionLSG {
  tipo: "hablar" | "caja" | "resultado" | "preguntar";
  texto: string;
}

/**
 * Un trozo de la respuesta del tutor, etiquetado con lo que REVELA. El mismo
 * trozo puede viajar como texto, como audio o como instrucciones del LSG: se
 * decide por el trozo, no por el canal, para que ninguno se escape.
 */
export interface Pieza {
  revela: Revela;
  texto?: string;
  audio?: string;
  lsg?: InstruccionLSG[];
}

export interface Salida {
  texto: string[];
  audio: string | null;
  lsg: InstruccionLSG[];
  /** Cuántas piezas retuvo la política (no llegaron al alumno). */
  retenidas: number;
}

/**
 * APLICA LA POLÍTICA ANTES DE ENTREGAR NADA. Descarta toda pieza que revele más
 * de lo que la decisión permite y junta el resto por canal. Es la última puerta:
 * aunque quien monta las piezas incluya por error la solución, no sale.
 */
export function aplicarPoliticaRevelacion(d: Pick<Decision, "revelaHasta">, piezas: Pieza[]): Salida {
  const limite = ORDEN_REVELA[d.revelaHasta];
  const permitidas = piezas.filter((p) => ORDEN_REVELA[p.revela] <= limite);
  const audio = permitidas.map((p) => p.audio).filter((a): a is string => Boolean(a));
  return {
    texto: permitidas.map((p) => p.texto).filter((t): t is string => Boolean(t)),
    audio: audio.length > 0 ? audio.join(" ") : null,
    lsg: permitidas.flatMap((p) => p.lsg ?? []),
    retenidas: piezas.length - permitidas.length,
  };
}
