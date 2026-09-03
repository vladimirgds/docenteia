import type { Escena } from "./animacion.ts";

/**
 * EL RELOJ DE LA LECCIÓN.
 *
 * Encadena las escenas del guion con la voz: mientras el sintetizador dice una
 * frase, el foco correspondiente está encendido; cuando calla, se apaga y entra
 * el siguiente. El alumno oye y ve lo mismo al mismo tiempo, que es todo el
 * asunto de una pizarra animada.
 *
 * SI LA VOZ FALLA, LA LECCIÓN SIGUE
 * El navegador puede no tener voz en español, el alumno puede haber silenciado
 * la pestaña, y `speechSynthesis` a veces sencillamente no resuelve. En
 * cualquiera de esos casos se pasa a TEMPORIZADOR: cada segmento dura lo que se
 * tardaría en leerlo en voz alta. Nunca se queda la pizarra congelada esperando
 * un evento que no va a llegar.
 *
 * POR QUÉ NO ES UN COMPONENTE
 * Porque una máquina de estados con temporizadores se comprueba mucho mejor sin
 * navegador: la suite le inyecta un reloj falso y un locutor falso y verifica
 * que pausar de verdad detiene, que repetir vuelve al principio DEL PASO y no
 * de la escena, y que un fallo de audio degrada a temporizador. El componente
 * `sincronizador-leccion.ts` sólo la envuelve en un hook de React.
 */

export type EstadoReproduccion = "inicio" | "reproduciendo" | "pausado" | "final";
export type ModoAvance = "voz" | "temporizador";

/**
 * El estado pedagógico que la escena sugiere para el avatar.
 *
 * Lo decide el sincronizador porque es quien sabe qué está pasando: explicando,
 * esperando, o celebrando el final de la lección.
 */
export type EstadoPedagogico = "IDLE" | "EXPLICANDO" | "CELEBRANDO" | "APOYO" | "PENSANDO";

export interface Locutor {
  /** ¿Hay voz utilizable ahora mismo? */
  disponible(): boolean;
  /** Resuelve cuando termina de decirlo; rechaza si no ha podido. */
  hablar(texto: string): Promise<void>;
  cancelar(): void;
  pausar?(): void;
  reanudar?(): void;
}

/** Un reloj inyectable: el real usa setTimeout; el de las pruebas, un contador. */
export interface Reloj {
  /** Programa `cb` dentro de `ms` y devuelve cómo cancelarlo. */
  programar(cb: () => void, ms: number): () => void;
}

export const RELOJ_REAL: Reloj = {
  programar(cb, ms) {
    const id = setTimeout(cb, ms);
    return () => clearTimeout(id);
  },
};

/** Lo que ve quien pinta: qué escena, qué foco encendido y en qué estado. */
export interface Instantanea {
  estado: EstadoReproduccion;
  /** Índice de la escena en curso. */
  escena: number;
  /** Foco encendido dentro de la escena; -1 mientras se lee la entrada. */
  foco: number;
  modo: ModoAvance;
  /** Total de escenas del guion. */
  escenas: number;
  /** Segmentos de la escena en curso (entrada + focos). */
  segmentos: number;
  avatar: EstadoPedagogico;
  /** La voz falló y se avisó de ello: la interfaz lo dice, no lo esconde. */
  vozCaida: boolean;
}

export interface OpcionesSincronizador {
  escenas: readonly Escena[];
  locutor?: Locutor | null;
  reloj?: Reloj;
  /** El alumno ha apagado el audio: se reproduce con temporizador, sin fallo. */
  audio?: boolean;
  alCambiar?: (estado: Instantanea) => void;
}

export interface Sincronizador {
  reproducir(): void;
  pausar(): void;
  reanudar(): void;
  /** Vuelve a decir el segmento en curso desde el principio. */
  repetirPaso(): void;
  /** Avance manual: corta lo que se esté diciendo y salta al siguiente. */
  avanzar(): void;
  retroceder(): void;
  irAEscena(indice: number): void;
  /** Enciende o apaga el audio en marcha, sin perder el sitio. */
  usarAudio(activo: boolean): void;
  detener(): void;
  instantanea(): Instantanea;
}

/**
 * Cuánto dura leer un texto en voz alta, en milisegundos.
 *
 * Unas 150 palabras por minuto, que es el ritmo de una explicación pausada, con
 * un suelo de segundo y medio para que un "El resultado es 41" no pase volando.
 */
export function duracionEstimada(texto: string): number {
  const palabras = String(texto ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.min(15000, Math.max(1500, Math.round((palabras / 150) * 60_000) + 400));
}

/** Los textos que se dicen en una escena: la entrada y luego cada foco. */
function segmentosDe(escena: Escena | undefined): string[] {
  if (!escena) return [];
  return [escena.narracion, ...escena.focos.map((f) => f.narracion)];
}

export function crearSincronizador(opciones: OpcionesSincronizador): Sincronizador {
  const escenas = opciones.escenas ?? [];
  const reloj = opciones.reloj ?? RELOJ_REAL;
  const locutor = opciones.locutor ?? null;

  let estado: EstadoReproduccion = "inicio";
  let escena = 0;
  /** Segmento dentro de la escena: 0 es la entrada, 1..n son los focos. */
  let segmento = 0;
  let audio = opciones.audio !== false;
  // El modo se conoce antes de empezar: la interfaz avisa de que va a leer con
  // temporizador ANTES de darle al play, no cuando ya está en marcha.
  let modo: ModoAvance = audio && locutor?.disponible() ? "voz" : "temporizador";
  let vozCaida = false;

  /** Cancela el temporizador en curso, si lo hay. */
  let cancelarEspera: (() => void) | null = null;
  /**
   * Cada segmento que arranca se lleva un número. Cuando la voz termina, sólo
   * avanza si su número sigue siendo el vigente: sin esto, una locución
   * cancelada al pulsar "siguiente" resolvería tarde y adelantaría un paso de
   * más, que es el error clásico de encadenar audio con promesas.
   */
  let ficha = 0;

  function instantanea(): Instantanea {
    return {
      estado,
      escena,
      foco: segmento - 1,
      modo,
      escenas: escenas.length,
      segmentos: segmentosDe(escenas[escena]).length,
      avatar: avatarDe(estado, escena, escenas.length),
      vozCaida,
    };
  }

  function avisar() {
    opciones.alCambiar?.(instantanea());
  }

  function limpiar() {
    ficha++;
    if (cancelarEspera) {
      cancelarEspera();
      cancelarEspera = null;
    }
    try {
      locutor?.cancelar();
    } catch {
      // Cancelar una voz que ya no está no es un error del que informar.
    }
  }

  /** Dice —o cronometra— el segmento en curso y encadena el siguiente. */
  function lanzar() {
    // Nunca se solapan dos esperas: la anterior se cierra aunque su segmento ya
    // no cuente, para no dejar temporizadores sueltos corriendo por detrás.
    if (cancelarEspera) {
      cancelarEspera();
      cancelarEspera = null;
    }
    const textos = segmentosDe(escenas[escena]);
    const texto = textos[segmento];
    if (texto === undefined) {
      terminar();
      return;
    }

    const mia = ++ficha;
    const seguir = () => {
      if (mia !== ficha || estado !== "reproduciendo") return;
      siguienteSegmento();
    };

    const porTemporizador = () => {
      modo = "temporizador";
      cancelarEspera = reloj.programar(seguir, duracionEstimada(texto));
    };

    if (!audio || !locutor || !locutor.disponible()) {
      porTemporizador();
      return;
    }

    modo = "voz";
    let resuelta = false;
    locutor
      .hablar(texto)
      .then(() => {
        resuelta = true;
        seguir();
      })
      .catch(() => {
        resuelta = true;
        if (mia !== ficha || estado !== "reproduciendo") return;
        // La voz ha fallado a mitad de lección: se sigue con temporizador y se
        // deja constancia, para que la interfaz pueda decirlo.
        vozCaida = true;
        modo = "temporizador";
        avisar();
        cancelarEspera = reloj.programar(seguir, duracionEstimada(texto));
      });

    // Red de seguridad: si el sintetizador ni resuelve ni rechaza —pasa en
    // Chrome cuando la pestaña pierde el foco— el temporizador rescata la
    // lección al doble de lo que debería haber tardado.
    const rescate = reloj.programar(() => {
      if (resuelta || mia !== ficha || estado !== "reproduciendo") return;
      vozCaida = true;
      modo = "temporizador";
      try {
        locutor.cancelar();
      } catch {
        /* la voz ya no responde: no hay nada que cancelar */
      }
      avisar();
      seguir();
    }, duracionEstimada(texto) * 2);
    cancelarEspera = rescate;
  }

  function siguienteSegmento() {
    const textos = segmentosDe(escenas[escena]);
    if (segmento + 1 < textos.length) {
      segmento++;
      avisar();
      lanzar();
      return;
    }
    if (escena + 1 < escenas.length) {
      escena++;
      segmento = 0;
      avisar();
      lanzar();
      return;
    }
    terminar();
  }

  function terminar() {
    limpiar();
    estado = "final";
    avisar();
  }

  return {
    reproducir() {
      if (estado === "reproduciendo") return;
      limpiar();
      if (estado === "final") {
        escena = 0;
        segmento = 0;
      }
      if (escenas.length === 0) {
        estado = "final";
        avisar();
        return;
      }
      estado = "reproduciendo";
      avisar();
      lanzar();
    },

    pausar() {
      if (estado !== "reproduciendo") return;
      // Si el locutor sabe pausar de verdad, se le pide; si no, se corta y al
      // reanudar se repite el segmento entero. Repetir una frase es aceptable;
      // perderla, no.
      if (modo === "voz" && locutor?.pausar) {
        if (cancelarEspera) {
          cancelarEspera();
          cancelarEspera = null;
        }
        try {
          locutor.pausar();
        } catch {
          limpiar();
        }
      } else {
        limpiar();
      }
      estado = "pausado";
      avisar();
    },

    reanudar() {
      if (estado !== "pausado") return;
      estado = "reproduciendo";
      avisar();
      if (modo === "voz" && locutor?.reanudar) {
        try {
          locutor.reanudar();
          return;
        } catch {
          // No ha podido reanudar: se repite el segmento desde el principio.
        }
      }
      lanzar();
    },

    repetirPaso() {
      limpiar();
      estado = "reproduciendo";
      avisar();
      lanzar();
    },

    avanzar() {
      limpiar();
      const textos = segmentosDe(escenas[escena]);
      if (segmento + 1 < textos.length) {
        segmento++;
      } else if (escena + 1 < escenas.length) {
        escena++;
        segmento = 0;
      } else {
        terminar();
        return;
      }
      // El avance manual deja la lección en marcha si lo estaba, y quieta si
      // el alumno la había parado para leer con calma.
      avisar();
      if (estado === "reproduciendo") lanzar();
    },

    retroceder() {
      limpiar();
      if (segmento > 0) {
        segmento--;
      } else if (escena > 0) {
        escena--;
        segmento = 0;
      }
      if (estado === "final") estado = "pausado";
      avisar();
      if (estado === "reproduciendo") lanzar();
    },

    irAEscena(indice: number) {
      if (indice < 0 || indice >= escenas.length) return;
      limpiar();
      escena = indice;
      segmento = 0;
      if (estado === "final") estado = "pausado";
      avisar();
      if (estado === "reproduciendo") lanzar();
    },

    usarAudio(activo: boolean) {
      if (audio === activo) return;
      audio = activo;
      if (activo) vozCaida = false;
      modo = audio && locutor?.disponible() ? "voz" : "temporizador";
      if (estado === "reproduciendo") {
        limpiar();
        avisar();
        lanzar();
        return;
      }
      limpiar();
      avisar();
    },

    detener() {
      limpiar();
      estado = "inicio";
      escena = 0;
      segmento = 0;
      avisar();
    },

    instantanea,
  };
}

/**
 * Qué cara pone el avatar en cada momento.
 *
 * Se decide aquí, y no en el componente, porque depende del punto de la
 * lección: la última escena terminada es una celebración; una lección pausada
 * es el tutor esperando, no el tutor callado.
 */
export function avatarDe(
  estado: EstadoReproduccion,
  escena: number,
  total: number,
): EstadoPedagogico {
  if (estado === "final") return total > 0 ? "CELEBRANDO" : "IDLE";
  if (estado === "pausado") return "PENSANDO";
  if (estado === "reproduciendo") return "EXPLICANDO";
  return "IDLE";
}
