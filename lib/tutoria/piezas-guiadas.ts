import type { PasoModelo, VeredictoPaso } from "../matematicas/pasos-alumno.ts";
import type { Decision, Pieza } from "./orquestador.ts";

/**
 * Del veredicto y de la decisión a las PIEZAS que se le pueden dar al alumno
 * (texto, audio e instrucciones del LSG), cada una etiquetada con lo que revela.
 * Es la parte pura de `practica-guiada.ts`: se prueba sin base de datos.
 *
 * Aquí sólo se elige qué piezas corresponden a la decisión; la política de
 * revelación (`aplicarPoliticaRevelacion`) las vuelve a filtrar después, de modo
 * que un fallo de este módulo no puede filtrar una solución.
 */

export interface ContextoPiezas {
  /** El veredicto del paso que acaba de escribir el alumno, si lo hubo. */
  veredicto?: VeredictoPaso | null;
  /** El paso modelo que toca ahora (el siguiente correcto desde donde está). */
  siguiente?: PasoModelo | null;
  /** Todo lo que falta hasta la solución, en orden. */
  restantes: PasoModelo[];
}

const habla = (texto: string) => ({ tipo: "hablar" as const, texto });

export function armarPiezas(d: Decision, c: ContextoPiezas): Pieza[] {
  switch (d.accion) {
    case "PREGUNTAR":
      return [
        {
          revela: "nada",
          texto: "¿Cuál sería el siguiente paso? Escríbelo.",
          audio: "¿Cuál sería el siguiente paso? Escríbelo.",
          lsg: [{ tipo: "preguntar", texto: "¿Cuál sería el siguiente paso?" }],
        },
      ];
    case "EXPLICAR": {
      const t = c.veredicto?.explicacion;
      if (!t) {
        return [
          {
            revela: "pista",
            texto: c.siguiente ? c.siguiente.pistas[0] : "Piensa qué operación te acerca a despejar la incógnita.",
            audio: c.siguiente?.pistas[0],
          },
        ];
      }
      return [{ revela: "pista", texto: t, audio: t, lsg: [habla(t)] }];
    }
    case "PISTA": {
      if (!c.siguiente) return [];
      const t = c.siguiente.pistas[(d.nivelAyuda || 1) - 1];
      return [{ revela: "pista", texto: t, audio: t, lsg: [habla(t)] }];
    }
    case "MOSTRAR_PASO": {
      if (!c.siguiente) return [];
      const t = `El paso siguiente es: ${c.siguiente.texto}. ${c.siguiente.explicacion}`;
      return [
        {
          revela: "paso",
          texto: t,
          audio: t,
          lsg: [habla(c.siguiente.explicacion), { tipo: "caja", texto: c.siguiente.texto }],
        },
      ];
    }
    case "MOSTRAR_SOLUCION": {
      if (c.restantes.length === 0) return [];
      const ultimo = c.restantes[c.restantes.length - 1];
      const t = `Solución paso a paso: ${c.restantes.map((p) => p.texto).join("  →  ")}.`;
      return [
        {
          revela: "solucion",
          texto: t,
          audio: c.restantes.map((p) => p.explicacion).join(" "),
          lsg: [...c.restantes.map((p) => ({ tipo: "caja" as const, texto: p.texto })), { tipo: "resultado" as const, texto: ultimo.texto }],
        },
      ];
    }
    case "NEGAR": {
      const t = "En una evaluación no hay pistas ni soluciones. Escribe tu mejor intento.";
      return [{ revela: "nada", texto: t, audio: t }];
    }
    case "REGISTRAR":
      return [{ revela: "nada", texto: "Respuesta registrada." }];
    case "CONTINUAR":
      return [{ revela: "nada", texto: "Correcto. Sigue con el siguiente paso.", audio: "Correcto. Sigue con el siguiente paso." }];
    default:
      return [];
  }
}
