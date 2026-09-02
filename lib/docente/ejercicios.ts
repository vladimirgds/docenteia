import type { Prisma, Tema } from "@prisma/client";

import { solveLinearSteps } from "../../src/preLight.js";
import type { InformeValidacion } from "./validador.ts";

/** Lo que se devuelve de cada ejercicio: el banco entero cabe en una tabla. */
export const SELECCION_EJERCICIO = {
  id: true,
  enunciado: true,
  respuestaCorrecta: true,
  respuestaFormula: true,
  plantilla: true,
  parametros: true,
  pistas: true,
  pasos: true,
  nivel: true,
  motor: true,
  estado: true,
  origen: true,
  validado: true,
  validadoEn: true,
  informeValidacion: true,
  creadoEn: true,
  actualizadoEn: true,
  nodoId: true,
  nodo: { select: { id: true, titulo: true, clave: true, motor: true } },
  autor: { select: { id: true, nombre: true } },
} satisfies Prisma.EjercicioSelect;

/**
 * De un informe de validación a lo que se guarda en la fila del ejercicio.
 *
 * Se aísla aquí porque lo usan tres rutas distintas —crear, editar y cambiar el
 * motor de un tema— y las tres tienen que escribir EXACTAMENTE lo mismo. Que
 * `validado` se ponga a mano en cada una es la forma más fácil de acabar con
 * ejercicios marcados como verificados que nadie verificó.
 */
export interface CamposValidacion {
  validado: boolean;
  validadoEn: Date | null;
  informeValidacion: InformeValidacion;
  respuestaCorrecta: string;
}

export function camposDeValidacion(informe: InformeValidacion): CamposValidacion {
  return {
    validado: informe.verificado,
    // Sólo se fecha lo que de verdad se comprobó: una fecha en un ejercicio sin
    // verificar diría que alguien lo revisó, y no es cierto.
    validadoEn: informe.verificado ? new Date() : null,
    informeValidacion: informe,
    respuestaCorrecta: informe.respuestaCorrecta ?? "",
  };
}

export interface PasoResolucion {
  explica: string;
  escribe: string;
}

/**
 * Los pasos de resolución que el motor sabe redactar, si sabe.
 *
 * Hoy sólo las ecuaciones lineales tienen una salida por pasos estable
 * (`solveLinearSteps`). Se guardan igualmente porque son el material con el que
 * la pizarra animada del HITO 2 va a construir la explicación paso a paso: si
 * el ejercicio ya llega con sus pasos verificados, la animación no tendrá que
 * pedírselos a la IA ni recalcularlos en el navegador.
 *
 * Devuelve lista vacía cuando el motor no los produce, que es lo honesto:
 * inventarlos aquí sería exactamente lo que el motor determinista evita.
 */
export function pasosJson(enunciado: string, motor: Tema | null): Prisma.InputJsonValue {
  // Prisma exige el tipo de entrada JSON explícito para una lista de objetos.
  return pasosDeterministas(enunciado, motor) as unknown as Prisma.InputJsonValue;
}

export function pasosDeterministas(enunciado: string, motor: Tema | null): PasoResolucion[] {
  if (motor !== "ECUACIONES_LINEALES") return [];
  try {
    const resuelto = solveLinearSteps(enunciado);
    const pasos = resuelto?.steps;
    if (!Array.isArray(pasos)) return [];
    return pasos
      .filter((p: unknown): p is PasoResolucion => {
        const paso = p as PasoResolucion;
        return Boolean(paso?.explica && paso?.escribe);
      })
      .map((p) => ({ explica: String(p.explica), escribe: String(p.escribe) }));
  } catch {
    return [];
  }
}
