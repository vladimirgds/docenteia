"use client";

import { pedir } from "@/lib/docente/cliente";
import { PizarraInteractiva, type VistaPizarra } from "@/components/pizarra/pizarra-interactiva";

/**
 * La pizarra del ALUMNO: corrige y da las pistas en el SERVIDOR. El navegador
 * no recibe las respuestas; sólo el veredicto y cada pista cuando la pide.
 */
export function PizarraAlumno({ procedimiento }: { procedimiento: VistaPizarra }) {
  return (
    <PizarraInteractiva
      procedimiento={procedimiento}
      modo="alumno"
      onResponder={async (pregunta, texto) => {
        const r = await pedir<{ correcto: boolean | null }>(`/api/estudiante/procedimientos/${procedimiento.id}/responder`, {
          metodo: "POST",
          cuerpo: { pregunta, respuesta: texto },
        });
        if (!r.ok) return { correcto: null, mensaje: r.error };
        return { correcto: r.datos.correcto };
      }}
      onPista={async (pregunta, nivel) => {
        const r = await pedir<{ pista: string | null; quedan: number; mensaje?: string }>(
          `/api/estudiante/procedimientos/${procedimiento.id}/pista`,
          { metodo: "POST", cuerpo: { pregunta, nivel } },
        );
        if (!r.ok) return { pista: null, quedan: 0, mensaje: r.error };
        return r.datos;
      }}
    />
  );
}
