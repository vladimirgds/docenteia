/**
 * EL TURNO DE PALABRA.
 *
 * En la lección hay dos que pueden hablar —el tutor de la clase y el repaso
 * animado de la pizarra— y un solo sintetizador en el navegador. Este módulo es
 * el único sitio donde se decide quién lo tiene.
 *
 * POR QUÉ NO BASTA CON "TENER CUIDADO"
 * Porque el descuido no se ve: cada locución del navegador empieza cancelando la
 * anterior, y una cancelación dispara el `onend` de la que corta. Cuando la
 * pizarra cancelaba para recolocarse —cosa razonable si hablara ella— el motor
 * de la lección daba su frase por terminada y saltaba a la siguiente. La lección
 * se iba de carrera con el audio recién empezado, y en el código no había nada
 * que se leyera como un error: sólo un `cancel()` en un sitio y un `speak()` en
 * otro. Con las reglas repartidas por tres ficheros, ese fallo vuelve en cuanto
 * alguien añade un cuarto.
 *
 * LA REGLA, ENTERA, EN UNA FRASE
 * Hablar te da el turno; callar sólo te calla a ti. Quien no tiene el turno no
 * puede cancelar la voz de quien lo tiene.
 *
 * Cada interlocutor recibe su propia vista del sintetizador —misma superficie
 * que `TTS`, para que ni el motor de la lección ni la pizarra tengan que saber
 * que existe este reparto— y el turno se lleva aquí dentro.
 */

/** Quién puede hablar en la lección. */
export type Interlocutor = "tutor" | "pizarra";

/** Lo que ambos consumidores usan del sintetizador. */
export interface VozUtilizable {
  enabled: boolean;
  voice: unknown;
  describe(): string;
  speak(texto: string, opciones?: { signal?: AbortSignal; onStart?: () => void }): Promise<void>;
  cancel(): void;
}

export interface VozCompartida {
  /** La vista del sintetizador para uno de los dos, con el turno vigilado. */
  para(quien: Interlocutor): VozUtilizable;
  /** Quién tiene la palabra ahora mismo, si es que la tiene alguien. */
  quienHabla(): Interlocutor | null;
  /** Corta lo que suene, venga de quien venga: al cambiar de tema o al salir. */
  callarATodos(): void;
}

export function crearVozCompartida(tts: VozUtilizable | null | undefined): VozCompartida {
  let turno: Interlocutor | null = null;

  const cancelarDeVerdad = () => {
    turno = null;
    try {
      tts?.cancel();
    } catch {
      // Cancelar una voz que ya no está no es un error del que informar.
    }
  };

  return {
    quienHabla: () => turno,

    callarATodos: cancelarDeVerdad,

    para(quien) {
      return {
        get enabled() {
          return Boolean(tts?.enabled);
        },
        set enabled(valor: boolean) {
          if (tts) tts.enabled = valor;
        },
        get voice() {
          return tts?.voice ?? null;
        },
        describe: () => tts?.describe() ?? "",

        speak(texto, opciones) {
          if (!tts) return Promise.reject(new Error("sin sintetizador"));
          // Hablar toma el turno. Si lo tenía el otro, se le corta aquí y una
          // sola vez, en lugar de que cada uno cancele por su cuenta.
          if (turno && turno !== quien) cancelarDeVerdad();
          turno = quien;
          return tts.speak(texto, opciones).finally(() => {
            if (turno === quien) turno = null;
          });
        },

        cancel() {
          // Callar sólo te calla a ti. Ésta es la línea que evita que la pizarra
          // deje mudo al tutor al recolocarse siguiéndole.
          if (turno !== quien) return;
          cancelarDeVerdad();
        },
      };
    },
  };
}
