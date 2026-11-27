/**
 * SECUENCIADOR DE LA PIZARRA (PMV 3 · HITO 3).
 *
 * Es el sitio donde se decide que el PUNTERO LÁSER y el AUDIO no se separen. La
 * pizarra narra un procedimiento como una lista de SEGMENTOS: cada uno es una
 * frase del profesor y el término al que señala. Este módulo es la máquina de
 * estados que los recorre.
 *
 * Por qué es un módulo aparte y puro (sin React, sin navegador): es la parte
 * delicada del hito —«que el puntero se mantenga sincronizado con el audio al
 * pausar, repetir o reanudar»— y la única forma de probarla de verdad es poder
 * ejecutarla contra un locutor falso que dispare los eventos en el orden y a la
 * hora que uno quiera, incluidos los malos.
 *
 * LAS REGLAS QUE SOSTIENEN LA SINCRONÍA
 *
 *   1. El puntero se MUEVE cuando EMPIEZA EL AUDIO del segmento (`alEmpezar`),
 *      no cuando se encola: así nunca señala un término que todavía no se ha
 *      nombrado.
 *   2. PAUSAR cancela el audio y deja el puntero DONDE ESTÁ: sigue señalando lo
 *      que se estaba diciendo.
 *   3. REANUDAR vuelve a decir el segmento en curso DESDE EL PRINCIPIO (un audio
 *      de voz sintética no se puede continuar a mitad de frase de forma fiable)
 *      y el puntero vuelve a su término: audio y puntero reempiezan juntos.
 *   4. REPETIR reempieza el segmento en curso; REPETIR PASO, el primero del paso.
 *   5. Un evento de un audio CANCELADO no puede avanzar nada. Cada locución lleva
 *      un número de generación; los eventos de una generación vieja se ignoran.
 *      Es el fallo clásico de los sintetizadores: `cancel()` dispara `onend` y,
 *      sin este candado, «pausar» acabaría saltando al segmento siguiente.
 *   6. TOCAR UN TÉRMINO interrumpe la narración, dice su explicación señalándolo y
 *      se queda en pausa, SIN mover la posición: reanudar continúa por donde iba.
 *
 * Este módulo lo cargan el navegador y las baterías de QA (Node en modo
 * `strip-types`): sin alias «@/» y sin sintaxis exclusiva de TypeScript.
 */

export interface Segmento {
  texto: string;
  /** `paso:N` (la expresión entera) o `termino:N:K` (un término concreto). */
  objetivo: string;
  /** Índice del paso al que pertenece. */
  paso: number;
}

export interface EventosLocucion {
  alEmpezar: () => void;
  alTerminar: () => void;
}

/**
 * Quien dice las frases. En el navegador es la voz sintética; en las pruebas, un
 * guion. Devuelve la función que cancela la locución.
 */
export interface Locutor {
  hablar(texto: string, eventos: EventosLocucion): () => void;
}

export type EstadoReproduccion = "detenido" | "hablando" | "pausado" | "fin";

export interface Instantanea {
  /** Segmento en curso. */
  indice: number;
  estado: EstadoReproduccion;
  /** Hacia dónde apunta el láser ahora (puede ser `null` antes de empezar). */
  objetivo: string | null;
  /** Paso al que pertenece el segmento en curso. */
  paso: number;
  /** ¿Está sonando la explicación de un término tocado por el alumno? */
  explicandoTermino: boolean;
  /**
   * Instante (reloj `performance.now()`) en que EMPEZÓ el audio del objetivo
   * actual. Sirve para medir el DESFASE audio → láser (PMV 3 · H3A).
   */
  audioEmpezoEn: number | null;
}

const ahora = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export interface PasoNarrable {
  explica: string;
  terminos?: readonly { texto: string; explica: string }[];
}

/** De los pasos de un procedimiento a la lista de segmentos que se narran. */
export function construirSegmentos(pasos: readonly PasoNarrable[]): Segmento[] {
  const segmentos: Segmento[] = [];
  pasos.forEach((p, i) => {
    segmentos.push({ texto: p.explica, objetivo: `paso:${i}`, paso: i });
    (p.terminos ?? []).forEach((t, k) => {
      segmentos.push({ texto: t.explica, objetivo: `termino:${i}:${k}`, paso: i });
    });
  });
  return segmentos;
}

export class Secuenciador {
  private readonly segmentos: readonly Segmento[];
  private readonly locutor: Locutor;
  private readonly alCambiar: (s: Instantanea) => void;

  private indice = 0;
  private estado: EstadoReproduccion = "detenido";
  private objetivo: string | null = null;
  private explicandoTermino = false;
  private audioEmpezoEn: number | null = null;
  /** Generación de la locución vigente: la que no coincide, se ignora. */
  private generacion = 0;
  private cancelarLocucion: (() => void) | null = null;

  constructor(
    segmentos: readonly Segmento[],
    locutor: Locutor,
    alCambiar: (s: Instantanea) => void = () => {},
  ) {
    this.segmentos = segmentos;
    this.locutor = locutor;
    this.alCambiar = alCambiar;
  }

  instantanea(): Instantanea {
    const seg = this.segmentos[this.indice];
    return {
      indice: this.indice,
      estado: this.estado,
      objetivo: this.objetivo,
      paso: seg ? seg.paso : 0,
      explicandoTermino: this.explicandoTermino,
      audioEmpezoEn: this.audioEmpezoEn,
    };
  }

  // ── Mandos ─────────────────────────────────────────────────────────────────

  /** Empieza (o, si estaba terminado, vuelve a empezar; si estaba en pausa, reanuda). */
  reproducir(): void {
    if (this.segmentos.length === 0) return;
    if (this.estado === "fin") this.indice = 0;
    this.explicandoTermino = false;
    this.hablarActual();
  }

  pausar(): void {
    if (this.estado !== "hablando") return;
    this.cortar();
    this.estado = "pausado";
    // El puntero NO se toca: sigue en lo que se estaba diciendo.
    this.explicandoTermino = false;
    this.emitir();
  }

  /** Vuelve a decir el segmento en curso desde su principio. */
  reanudar(): void {
    if (this.estado !== "pausado" && this.estado !== "detenido") return;
    this.explicandoTermino = false;
    this.hablarActual();
  }

  alternar(): void {
    if (this.estado === "hablando") this.pausar();
    else if (this.estado === "pausado") this.reanudar();
    else this.reproducir();
  }

  repetir(): void {
    if (this.segmentos.length === 0) return;
    this.explicandoTermino = false;
    this.hablarActual();
  }

  repetirPaso(): void {
    if (this.segmentos.length === 0) return;
    this.indice = this.primerSegmentoDelPaso(this.segmentos[this.indice]?.paso ?? 0);
    this.explicandoTermino = false;
    this.hablarActual();
  }

  siguiente(): void {
    const paso = this.segmentos[this.indice]?.paso ?? 0;
    this.irAPaso(paso + 1);
  }

  anterior(): void {
    const paso = this.segmentos[this.indice]?.paso ?? 0;
    this.irAPaso(Math.max(0, paso - 1));
  }

  /**
   * Salta al principio de un paso y SIGUE NARRANDO desde ahí. «Siguiente» y
   * «Anterior» significan «sigue por aquí»: un alumno que los pulsa tras una
   * pausa, o tras tocar un término, espera oír el paso al que ha saltado.
   */
  irAPaso(paso: number): void {
    const ultimo = this.segmentos.length > 0 ? this.segmentos[this.segmentos.length - 1].paso : 0;
    if (paso > ultimo) {
      this.cortar();
      this.estado = "fin";
      this.explicandoTermino = false;
      this.emitir();
      return;
    }
    this.cortar();
    this.indice = this.primerSegmentoDelPaso(paso);
    this.explicandoTermino = false;
    this.hablarActual();
  }

  /**
   * El alumno toca un término: se interrumpe la narración, se dice la explicación
   * del término señalándolo y se queda en pausa SIN mover la posición.
   */
  explicarTermino(paso: number, termino: number, texto: string): void {
    this.cortar();
    const mia = this.generacion;
    this.explicandoTermino = true;
    this.estado = "hablando";
    this.cancelarLocucion = this.locutor.hablar(texto, {
      alEmpezar: () => {
        if (mia !== this.generacion) return;
        this.objetivo = `termino:${paso}:${termino}`;
        this.audioEmpezoEn = ahora();
        this.emitir();
      },
      alTerminar: () => {
        if (mia !== this.generacion) return;
        this.cancelarLocucion = null;
        this.explicandoTermino = false;
        this.estado = "pausado";
        this.emitir();
      },
    });
    this.emitir();
  }

  detener(): void {
    this.cortar();
    this.estado = "detenido";
    this.explicandoTermino = false;
    this.emitir();
  }

  // ── Interior ───────────────────────────────────────────────────────────────

  private primerSegmentoDelPaso(paso: number): number {
    const i = this.segmentos.findIndex((s) => s.paso === paso);
    return i < 0 ? 0 : i;
  }

  /** Invalida la locución en curso: sus eventos pendientes dejan de contar. */
  private cortar(): void {
    this.generacion++;
    if (this.cancelarLocucion) {
      const c = this.cancelarLocucion;
      this.cancelarLocucion = null;
      c();
    }
  }

  private hablarActual(): void {
    this.cortar();
    const mia = this.generacion;
    const seg = this.segmentos[this.indice];
    if (!seg) {
      this.estado = "fin";
      this.emitir();
      return;
    }
    this.estado = "hablando";
    this.cancelarLocucion = this.locutor.hablar(seg.texto, {
      // El puntero se mueve cuando EMPIEZA el audio, no antes.
      alEmpezar: () => {
        if (mia !== this.generacion) return;
        this.objetivo = seg.objetivo;
        this.audioEmpezoEn = ahora();
        this.emitir();
      },
      alTerminar: () => {
        if (mia !== this.generacion) return;
        this.cancelarLocucion = null;
        if (this.indice + 1 >= this.segmentos.length) {
          this.estado = "fin";
          this.emitir();
          return;
        }
        this.indice++;
        this.hablarActual();
      },
    });
    this.emitir();
  }

  private emitir(): void {
    this.alCambiar(this.instantanea());
  }
}

// ── Locutores ────────────────────────────────────────────────────────────────

/**
 * Locutor «mudo»: no suena nada y simula el tiempo de habla (según la longitud
 * del texto). Es el que usa la pizarra cuando el navegador no tiene voz: la
 * narración, el puntero y los pasos siguen funcionando.
 */
export function crearLocutorTemporizado(
  msPorCaracter = 55,
  programar: (f: () => void, ms: number) => unknown = (f, ms) => setTimeout(f, ms),
  anular: (id: unknown) => void = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
): Locutor {
  return {
    hablar(texto, eventos) {
      eventos.alEmpezar();
      const id = programar(() => eventos.alTerminar(), Math.max(400, texto.length * msPorCaracter));
      return () => anular(id);
    },
  };
}
