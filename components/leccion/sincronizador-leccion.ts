"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Escena } from "@/lib/leccion/animacion";
import {
  crearSincronizador,
  type Instantanea,
  type Locutor,
  type Sincronizador,
} from "@/lib/leccion/sincronizacion";
import type { TTS } from "@/public/tts.js";

/**
 * EL SINCRONIZADOR DE LA LECCIÓN, VISTO DESDE REACT.
 *
 * La máquina de estados vive en `lib/leccion/sincronizacion.ts` —sin React, y
 * por tanto comprobable en la suite—. Aquí sólo se la envuelve: se le da una
 * voz de verdad, se traduce su estado a algo que el componente pueda pintar y
 * se recogen los cabos al desmontar.
 *
 * Los mandos que expone son los cuatro del pliego —pausar, reanudar, repetir
 * paso y avanzar a mano— más el interruptor del audio, que es el que activa la
 * degradación a temporizador sin que se note un salto.
 */

export interface MandosLeccion {
  reproducir(): void;
  pausar(): void;
  reanudar(): void;
  repetirPaso(): void;
  avanzar(): void;
  retroceder(): void;
  irAEscena(indice: number): void;
  detener(): void;
}

/**
 * Un locutor sobre el TTS del proyecto.
 *
 * Dos detalles que no son adorno:
 *
 *   · Se considera DISPONIBLE sólo si hay voz real. Sin ella, `speak()` del TTS
 *     resuelve tras un retardo estimado —subtítulos temporizados—, y entonces
 *     prefiero que el temporizador lo lleve el sincronizador: así la interfaz
 *     puede decir la verdad ("modo temporizador") en lugar de fingir audio.
 *   · Cancelar aborta con `AbortSignal`, no sólo con `synth.cancel()`. La
 *     promesa de `speak()` se cierra por el abort; sin él quedaría colgada y el
 *     paso siguiente entraría tarde.
 */
export function locutorDeTTS(tts: TTS | null | undefined): Locutor {
  let corte: AbortController | null = null;

  return {
    disponible() {
      return Boolean(tts && tts.enabled && tts.voice);
    },
    hablar(texto) {
      if (!tts) return Promise.reject(new Error("sin sintetizador"));
      corte?.abort();
      corte = new AbortController();
      return tts.speak(texto, { signal: corte.signal });
    },
    cancelar() {
      corte?.abort();
      corte = null;
      try {
        tts?.cancel();
      } catch {
        // El sintetizador ya no está: no hay nada que cortar.
      }
    },
  };
}

export function useSincronizadorLeccion({
  escenas,
  tts,
  audio = true,
  alTerminar,
}: {
  escenas: readonly Escena[];
  tts: TTS | null | undefined;
  audio?: boolean;
  alTerminar?: () => void;
}): { estado: Instantanea; mandos: MandosLeccion } {
  const maquina = useRef<Sincronizador | null>(null);
  const [estado, setEstado] = useState<Instantanea>(() => reposo(escenas.length));

  // El locutor se crea una vez por sintetizador: rehacerlo en cada pintado
  // dejaría un `AbortController` distinto del que está hablando, y cancelar no
  // cancelaría nada.
  const locutor = useMemo(() => locutorDeTTS(tts), [tts]);

  useEffect(() => {
    const sinc = crearSincronizador({ escenas, locutor, audio, alCambiar: setEstado });
    maquina.current = sinc;
    setEstado(sinc.instantanea());
    return () => {
      sinc.detener();
      maquina.current = null;
    };
    // `audio` no va en las dependencias a propósito: cambiarlo NO rehace la
    // máquina —eso perdería el punto de la lección— sino que se le comunica en
    // el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escenas, locutor]);

  useEffect(() => {
    maquina.current?.usarAudio(audio);
  }, [audio]);

  // El final se avisa una sola vez: el aula lo usa para poner al avatar a
  // celebrar, y celebrar dos veces seguidas es un tic.
  const yaAvisado = useRef(false);
  useEffect(() => {
    if (estado.estado !== "final") {
      yaAvisado.current = false;
      return;
    }
    if (yaAvisado.current) return;
    yaAvisado.current = true;
    alTerminar?.();
  }, [estado.estado, alTerminar]);

  const mandos = useMemo<MandosLeccion>(
    () => ({
      reproducir: () => maquina.current?.reproducir(),
      pausar: () => maquina.current?.pausar(),
      reanudar: () => maquina.current?.reanudar(),
      repetirPaso: () => maquina.current?.repetirPaso(),
      avanzar: () => maquina.current?.avanzar(),
      retroceder: () => maquina.current?.retroceder(),
      irAEscena: (i: number) => maquina.current?.irAEscena(i),
      detener: () => maquina.current?.detener(),
    }),
    [],
  );

  return { estado, mandos };
}

/** El estado antes de que exista la máquina: lección cargada y quieta. */
function reposo(escenas: number): Instantanea {
  return {
    estado: "inicio",
    escena: 0,
    foco: -1,
    modo: "temporizador",
    escenas,
    segmentos: 0,
    avatar: "IDLE",
    vozCaida: false,
  };
}

/** Vuelve a montar el guion sólo cuando cambia de verdad. */
export function useGuionEstable(escenas: readonly Escena[]): readonly Escena[] {
  const previo = useRef<readonly Escena[]>(escenas);
  const firma = escenas.map((e) => e.id + "·" + e.latex).join("|");
  const firmaPrevia = useRef(firma);

  if (firma !== firmaPrevia.current) {
    firmaPrevia.current = firma;
    previo.current = escenas;
  }
  return previo.current;
}
