import type { EtapaEducativa, NivelAcademico, Tema } from "@prisma/client";

import { cubreAlAlumno, type CursoDelAlumno } from "../curriculo/etapas.ts";

/**
 * QUÉ PREGUNTAS VE CADA ALUMNO EN EL DIAGNÓSTICO.
 *
 * En el PMV 1 el diagnóstico era una lista fija: cinco preguntas, una por cada
 * tema del motor, iguales para todo el mundo. Como una de ellas era de
 * derivadas, un alumno de 3.º de secundaria abría su primera pantalla y se
 * encontraba con cálculo diferencial. La prueba no medía su nivel: lo expulsaba.
 *
 * Aquí se compone la prueba a partir de dos fuentes, en este orden:
 *
 *   1. EL CATÁLOGO (`preguntas_diagnostico`), que trae preguntas de opción
 *      múltiple calibradas para cada nivel. Es la base sembrada, la que hace
 *      que el diagnóstico funcione desde el primer despliegue.
 *   2. EL BANCO DEL DOCENTE (`ejercicios`), con lo que el profesorado ha
 *      escrito y publicado para ese nivel. Son de respuesta abierta y se
 *      corrigen con el mismo motor determinista que la práctica.
 *
 * El orden no es casual: se empieza por opción múltiple, que arranca sin
 * fricción, y se cierra con las preguntas del profesor, que son las que de
 * verdad reflejan su temario.
 *
 * Esta función es PURA —recibe las filas ya leídas— para que la batería de QA
 * pueda comprobar la composición sin levantar base de datos.
 */

/** Cuántas preguntas tiene un diagnóstico completo. */
export const PREGUNTAS_POR_DIAGNOSTICO = 5;

/**
 * Cuántas pueden venir del banco del docente.
 *
 * No todas: las del catálogo están calibradas por nivel y son de opción
 * múltiple, y un diagnóstico entero de respuesta abierta mide tanto la
 * capacidad de escribir la respuesta como la de resolverla.
 */
export const MAX_DEL_BANCO = 3;

export interface ItemDiagnostico {
  /** Identificador con su origen dentro: "catalogo:<id>" o "banco:<id>". */
  id: string;
  origen: "catalogo" | "banco";
  tipo: "opcion_multiple" | "respuesta_abierta";
  tema: Tema | null;
  nivel: NivelAcademico | null;
  enunciado: string;
  expresion?: string | null;
  /** Sólo en las de opción múltiple. */
  opciones?: Array<{ id: string; texto: string }>;
}

/** Una pregunta del catálogo, tal como se lee de la base. */
export interface PreguntaCatalogo {
  id: string;
  tema: Tema;
  nivel: NivelAcademico | null;
  etapa: EtapaEducativa | null;
  cursoMin: number | null;
  enunciado: string;
  expresion: string | null;
  opciones: unknown;
  orden: number;
}

/** Un ejercicio del banco del docente, tal como se lee de la base. */
export interface EjercicioBanco {
  id: string;
  enunciado: string;
  nivel: NivelAcademico;
  motor: Tema | null;
  respuestaCorrecta: string;
  plantilla: boolean;
  etapa: EtapaEducativa | null;
  cursoMin: number | null;
}

/**
 * ¿Sirve este ejercicio del banco como pregunta de diagnóstico?
 *
 * Tres condiciones, y las tres por el mismo motivo: el diagnóstico se corrige
 * solo y sin margen de duda.
 *
 *   · Tiene MOTOR, así que su respuesta se puede recalcular en el servidor.
 *   · Tiene RESPUESTA guardada, verificada al crearlo.
 *   · NO es una plantilla: su enunciado lleva huecos ("{a}x + {b}") y
 *     enseñárselos a un alumno sería enseñarle el andamio.
 */
export function sirveParaDiagnostico(ejercicio: EjercicioBanco): boolean {
  return (
    !ejercicio.plantilla &&
    ejercicio.motor !== null &&
    typeof ejercicio.respuestaCorrecta === "string" &&
    ejercicio.respuestaCorrecta.trim() !== ""
  );
}

/**
 * Reparte por TEMA, en lugar de cortar la lista por donde caiga.
 *
 * Sin esto, coger "las tres primeras" del catálogo avanzado devolvía dos
 * preguntas de factorización y ninguna de derivadas: el diagnóstico medía un
 * tema y no el nivel. Se van tomando por turnos —una de cada tema, y vuelta a
 * empezar—, conservando el orden dentro de cada tema. Es la propiedad que tenía
 * el banco del PMV 1 ("una pregunta por tema") trasladada a un banco que ahora
 * está partido por niveles.
 */
export function repartirPorTema<T>(
  elementos: readonly T[],
  cuantos: number,
  temaDe: (elemento: T) => string | null,
): T[] {
  const porTema = new Map<string, T[]>();
  for (const elemento of elementos) {
    const clave = temaDe(elemento) ?? "SIN_TEMA";
    porTema.set(clave, [...(porTema.get(clave) ?? []), elemento]);
  }

  const colas = [...porTema.values()];
  const salida: T[] = [];
  let vueltas = 0;
  while (salida.length < cuantos && vueltas < elementos.length + 1) {
    let sirvioAlguna = false;
    for (const cola of colas) {
      if (salida.length >= cuantos) break;
      const siguiente = cola.shift();
      if (siguiente === undefined) continue;
      salida.push(siguiente);
      sirvioAlguna = true;
    }
    if (!sirvioAlguna) break;
    vueltas++;
  }
  return salida;
}

function opcionesDe(valor: unknown): Array<{ id: string; texto: string }> {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((o) => {
    const opcion = o as { id?: unknown; texto?: unknown };
    return typeof opcion?.id === "string" && typeof opcion?.texto === "string"
      ? [{ id: opcion.id, texto: opcion.texto }]
      : [];
  });
}

/**
 * Compone la prueba para un nivel concreto.
 *
 * `catalogo` y `banco` llegan YA filtrados por nivel; los comodines del
 * catálogo —los que no declaran nivel— entran al final, y sólo si hacen falta
 * para completar la prueba. Un diagnóstico corto es preferible a un
 * diagnóstico rellenado con preguntas de otro nivel: eso es justo lo que se
 * está arreglando.
 */
export function componerDiagnostico({
  catalogo,
  banco,
  comodines = [],
  objetivo = PREGUNTAS_POR_DIAGNOSTICO,
  alumno,
}: {
  catalogo: readonly PreguntaCatalogo[];
  banco: readonly EjercicioBanco[];
  comodines?: readonly PreguntaCatalogo[];
  objetivo?: number;
  /**
   * Dónde está el alumno. Es el filtro de fondo: por muy bien que responda, a
   * un alumno de secundaria no le puede llegar contenido marcado como Superior.
   * Sin este dato sólo se le sirve lo transversal.
   */
  alumno?: CursoDelAlumno;
}): ItemDiagnostico[] {
  const delAlumno = alumno ?? { etapa: null, curso: null };
  const leCorresponde = (c: { etapa: EtapaEducativa | null; cursoMin: number | null }) =>
    cubreAlAlumno(c, delAlumno);

  catalogo = catalogo.filter(leCorresponde);
  banco = banco.filter(leCorresponde);
  comodines = comodines.filter(leCorresponde);

  // Los dos repartos se hacen por tema, para que la prueba no acabe midiendo
  // un solo asunto por el orden en que se sembró el contenido.
  const delBanco = repartirPorTema(
    banco.filter(sirveParaDiagnostico),
    MAX_DEL_BANCO,
    (e) => e.motor,
  );
  const huecoParaCatalogo = Math.max(objetivo - delBanco.length, 0);

  const delCatalogo = repartirPorTema(
    [...catalogo].sort((a, b) => a.orden - b.orden),
    huecoParaCatalogo,
    (p) => p.tema,
  );

  const items: ItemDiagnostico[] = delCatalogo.map((p) => ({
    id: `catalogo:${p.id}`,
    origen: "catalogo",
    tipo: "opcion_multiple",
    tema: p.tema,
    nivel: p.nivel,
    enunciado: p.enunciado,
    expresion: p.expresion,
    opciones: opcionesDe(p.opciones),
  }));

  for (const e of delBanco) {
    items.push({
      id: `banco:${e.id}`,
      origen: "banco",
      tipo: "respuesta_abierta",
      tema: e.motor,
      nivel: e.nivel,
      enunciado: e.enunciado,
    });
  }

  // Si entre las dos fuentes no se llega, se completa con los comodines: son
  // preguntas del catálogo sin nivel declarado, válidas para cualquiera.
  if (items.length < objetivo) {
    const yaPuestas = new Set(items.map((i) => i.id));
    for (const p of [...comodines].sort((a, b) => a.orden - b.orden)) {
      if (items.length >= objetivo) break;
      const id = `catalogo:${p.id}`;
      if (yaPuestas.has(id)) continue;
      items.push({
        id,
        origen: "catalogo",
        tipo: "opcion_multiple",
        tema: p.tema,
        nivel: p.nivel,
        enunciado: p.enunciado,
        expresion: p.expresion,
        opciones: opcionesDe(p.opciones),
      });
    }
  }

  return items;
}

/** Parte un identificador compuesto en su origen y su id de base de datos. */
export function partirId(id: string): { origen: "catalogo" | "banco"; id: string } | null {
  const [origen, ...resto] = String(id ?? "").split(":");
  const real = resto.join(":");
  if (!real) return null;
  if (origen !== "catalogo" && origen !== "banco") return null;
  return { origen, id: real };
}
