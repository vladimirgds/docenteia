import type { EtapaEducativa } from "@prisma/client";

import { cursoValido, describirAlcance, etapaPorValor } from "../curriculo/etapas.ts";

/**
 * EL ALCANCE PROPIO DE UN EJERCICIO, VALIDADO CONTRA EL DE SU TEMA.
 *
 * POR QUÉ EXISTE
 * Heredar el alcance del tema es lo correcto casi siempre, pero heredarlo SIEMPRE
 * obliga a partir el temario: un tema "Perímetros" que empieza en 3.º de primaria
 * no admitía dentro un ejercicio con decimales pensado para 5.º, y la única
 * salida era crear "Perímetros 3.º" y "Perímetros 5.º" para lo que es un solo
 * tema. El catálogo se fragmenta por una limitación del formulario.
 *
 * Con el alcance propio, el ejercicio puede AFINAR el de su tema. Dentro de dos
 * límites, y los dos importan:
 *
 *   · LA MISMA ETAPA. Un ejercicio no se muda de etapa: si su tema es de
 *     primaria, él es de primaria. Cambiar de etapa es cambiar de tema.
 *   · NUNCA POR DEBAJO del curso del tema. Puede pedir más madurez que su tema
 *     —del 3.º del tema al 5.º del ejercicio— pero no menos, porque entonces
 *     llegaría a alumnos a los que el tema entero no les corresponde.
 *
 * Y a null significa heredar. No se guarda una copia del alcance del tema: si se
 * copiara, cambiar el tema dejaría a sus ejercicios con el valor viejo, que es
 * exactamente el problema que la herencia venía a resolver.
 */

export interface AlcancePedido {
  etapa?: EtapaEducativa | string | null;
  cursoMin?: number | null;
}

export interface AlcanceDelTema {
  etapa: EtapaEducativa | null;
  cursoMin: number | null;
}

export type ResolucionAlcance =
  | { ok: true; etapa: EtapaEducativa | null; cursoMin: number | null; propio: boolean }
  | { ok: false; error: string };

export function resolverAlcancePropio(
  pedido: AlcancePedido | null | undefined,
  tema: AlcanceDelTema,
): ResolucionAlcance {
  const etapa = (pedido?.etapa ?? null) as EtapaEducativa | null;

  // Sin etapa propia: hereda. El curso suelto sin etapa no significa nada, así
  // que se descarta en lugar de guardarlo a medias.
  if (!etapa) return { ok: true, etapa: null, cursoMin: null, propio: false };

  if (!tema.etapa) {
    return {
      ok: false,
      error:
        "Este tema no tiene etapa educativa, así que sus ejercicios no pueden fijar un grado propio. Asigna primero el alcance del tema.",
    };
  }

  if (etapa !== tema.etapa) {
    const suya = etapaPorValor(tema.etapa)?.nombre ?? tema.etapa;
    return {
      ok: false,
      error: `El ejercicio no puede cambiar de etapa: su tema es de ${suya}. Para otra etapa, crea el ejercicio en un tema de esa etapa.`,
    };
  }

  const curso = pedido?.cursoMin ?? null;
  if (curso === null) {
    // Etapa propia sin curso equivale a la del tema: se guarda como heredado
    // para no dejar dos formas de decir lo mismo.
    return { ok: true, etapa: null, cursoMin: null, propio: false };
  }

  if (!cursoValido(etapa, curso)) {
    const datos = etapaPorValor(etapa);
    return {
      ok: false,
      error: `${datos?.nombre ?? "Esa etapa"} llega hasta ${datos?.cursos ?? "?"}.º ${datos?.unidad.toLowerCase() ?? "curso"}.`,
    };
  }

  const minimoDelTema = tema.cursoMin ?? 1;
  if (curso < minimoDelTema) {
    return {
      ok: false,
      error: `El tema se plantea ${describirAlcance(tema).toLowerCase()}; un ejercicio suyo no puede dirigirse a un curso anterior.`,
    };
  }

  // Igual que el tema es heredar, aunque venga escrito: una copia del valor del
  // tema se quedaría vieja en cuanto el tema cambiara.
  if (curso === minimoDelTema) {
    return { ok: true, etapa: null, cursoMin: null, propio: false };
  }

  return { ok: true, etapa, cursoMin: curso, propio: true };
}
