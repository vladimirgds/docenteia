import { crearLocutorTemporizado, type Locutor } from "./secuenciador.ts";

/**
 * VOZ DEL NAVEGADOR PARA LA PIZARRA (PMV 3 · HITO 3).
 *
 * Adapta `speechSynthesis` a la interfaz `Locutor` del secuenciador. Dos
 * peculiaridades del sintetizador real que este adaptador absorbe, porque si no
 * llegarían hasta el puntero láser:
 *
 *   · Chrome a veces NO dispara `onstart` (sin voces cargadas, o sin gesto
 *     previo del usuario). Sin esto, el puntero no se movería nunca: un
 *     temporizador de cortesía da el audio por empezado.
 *   · A veces tampoco dispara `onend`, y la narración se quedaría colgada en
 *     mitad de un paso: un vigilante lo da por terminado pasado el tiempo que
 *     razonablemente dura la frase.
 *
 * Sin voz (o con la voz desactivada) se usa el locutor temporizado: nada suena,
 * pero el puntero y los pasos avanzan igual.
 */

export interface AjustesVoz {
  velocidad: number;
  conVoz: boolean;
}

export function crearLocutorNavegador(obtener: () => AjustesVoz): Locutor {
  const temporizado = crearLocutorTemporizado();
  return {
    hablar(texto, eventos) {
      const { velocidad, conVoz } = obtener();
      const sint = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!conVoz || !sint || typeof SpeechSynthesisUtterance === "undefined") {
        return temporizado.hablar(texto, eventos);
      }

      let empezo = false;
      let termino = false;
      const empezar = () => {
        if (empezo || termino) return;
        empezo = true;
        eventos.alEmpezar();
      };
      const limpiar = () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
      const terminar = () => {
        if (termino) return;
        empezar();
        termino = true;
        limpiar();
        eventos.alTerminar();
      };

      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "es-ES";
      u.rate = velocidad;
      const voz = sint.getVoices().find((v) => /^es/i.test(v.lang));
      if (voz) u.voice = voz;
      u.onstart = empezar;
      u.onend = terminar;
      u.onerror = (e) => {
        // «canceled»/«interrupted» son el efecto de cancelar a propósito: no avanzan.
        if (e.error === "canceled" || e.error === "interrupted") return;
        terminar();
      };

      // Los tiempos de cortesía se pueden alargar desde fuera (`__pzVigilanciaMs`):
      // la batería de QA dispara `onstart`/`onend` a mano y no quiere que el
      // vigilante se le adelante en una máquina lenta.
      const vigilancia = (window as unknown as { __pzVigilanciaMs?: number }).__pzVigilanciaMs;
      const t1 = setTimeout(empezar, vigilancia ?? 1200);
      const t2 = setTimeout(terminar, vigilancia ?? Math.max(4000, (texto.length * 140) / velocidad) + 2500);

      sint.cancel();
      sint.speak(u);
      return () => {
        termino = true;
        limpiar();
        sint.cancel();
      };
    },
  };
}

/** Dice una frase suelta (el veredicto de una respuesta, una pista). Devuelve cómo callarla. */
export function decirFrase(
  texto: string,
  ajustes: AjustesVoz,
  alEmpezar: () => void,
  alTerminar: () => void,
): () => void {
  return crearLocutorNavegador(() => ajustes).hablar(texto, { alEmpezar, alTerminar });
}
