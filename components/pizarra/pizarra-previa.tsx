"use client";

import { PizarraInteractiva, type VistaPizarra } from "@/components/pizarra/pizarra-interactiva";

/**
 * La vista previa del DOCENTE: la misma pizarra que verá el alumno, con la
 * comprobación hecha aquí mismo (el docente ve sus propias respuestas). No
 * registra nada. Sirve para PROBAR el procedimiento antes de publicarlo.
 */
export function PizarraPrevia({
  procedimiento,
  respuestas,
  pistas,
}: {
  procedimiento: VistaPizarra;
  /** Respuesta de cada pregunta, en el mismo orden. */
  respuestas: (string | null)[];
  /** Pistas de cada pregunta (o las generales si no tiene). */
  pistas: string[][];
}) {
  const limpio = (t: string) => t.toLowerCase().replace(/\s+/g, "").replace(/·|\*/g, "");
  return (
    <PizarraInteractiva
      procedimiento={procedimiento}
      modo="previa"
      onResponder={async (pregunta, texto) => {
        const esperada = respuestas[pregunta];
        if (!esperada) return { correcto: null };
        return { correcto: limpio(texto) === limpio(esperada), mensaje: undefined };
      }}
      onPista={async (pregunta, nivel) => {
        const lista = pregunta === undefined ? [] : (pistas[pregunta] ?? []);
        const pista = lista[nivel] ?? null;
        return pista
          ? { pista, quedan: lista.length - nivel - 1 }
          : { pista: null, quedan: 0, mensaje: "No hay más pistas." };
      }}
    />
  );
}
