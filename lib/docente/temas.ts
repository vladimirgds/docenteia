import type { Prisma } from "@prisma/client";

import { claveUnica, generarClave, type Estado, type EntradaRegla, type Motor } from "./curriculo.ts";
import { normalizarLatex } from "../matematicas/index.ts";

/**
 * Piezas de persistencia del tema, compartidas por las rutas que lo escriben.
 *
 * Viven fuera de los `route.ts` por dos motivos: Next.js valida los exports de
 * un manejador de ruta y no admite ayudantes sueltos, y —más importante— crear
 * y editar un tema tienen que producir EXACTAMENTE la misma fila. Cuando esa
 * lógica se escribe dos veces, la edición y la creación divergen y aparecen
 * temas que se comportan distinto según por dónde se hayan guardado.
 */

/** Lo que se devuelve de un tema en el listado y tras guardarlo. */
export const SELECCION_TEMA = {
  id: true,
  clave: true,
  titulo: true,
  descripcion: true,
  motor: true,
  nivel: true,
  etapa: true,
  cursoMin: true,
  orden: true,
  estado: true,
  objetivos: true,
  etiquetas: true,
  padreId: true,
  materiaId: true,
  creadoEn: true,
  actualizadoEn: true,
  materia: { select: { id: true, nombre: true, color: true } },
  autor: { select: { id: true, nombre: true } },
  _count: { select: { reglas: true, ejercicios: true, hijos: true } },
} satisfies Prisma.NodoConocimientoSelect;

/**
 * Las etiquetas se guardan en minúsculas y sin repetir.
 *
 * Sin esto, "Álgebra" y "álgebra" son dos etiquetas distintas: el filtro
 * encuentra la mitad de los temas y el docente concluye, con razón, que el
 * buscador no funciona.
 */
export function normalizarEtiquetas(etiquetas: readonly string[] | undefined): string[] {
  return [...new Set((etiquetas ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export interface ContextoRegla {
  /** Clave del tema: prefija la de cada regla. */
  clave: string;
  nodoId: string;
  motor: Motor | null;
  estado: Estado;
  autorId: string;
  /** Claves ya ocupadas en la base, para no chocar entre temas distintos. */
  ocupadas?: readonly string[];
}

/**
 * Prepara las reglas pedagógicas de un tema para escribirlas.
 *
 * Tres decisiones van aquí, y las tres tienen consecuencias visibles:
 *
 *   · La regla HEREDA el motor del tema. Es lo que hace que una regla escrita
 *     por un profesor aparezca en la lección del alumno: la lección filtra el
 *     catálogo por motor, así que sin heredarlo la regla se guardaría bien y no
 *     la vería nadie.
 *   · La regla hereda también el ESTADO. Un tema en borrador no puede tener
 *     reglas publicadas, o saldrían en la lección antes de que el tema esté
 *     listo.
 *   · La clave se compone con la del tema, de modo que dos temas puedan tener
 *     cada uno su "regla-de-la-potencia" sin chocar en la restricción única.
 */
export function reglasParaGuardar(
  reglas: readonly EntradaRegla[],
  ctx: ContextoRegla,
): Prisma.ReglaMatematicaCreateManyInput[] {
  const usadas = new Set<string>(ctx.ocupadas ?? []);
  return reglas.map((regla, indice) => {
    const clave = claveUnica(`${ctx.clave}.${generarClave(regla.nombre, 40)}`, usadas);
    usadas.add(clave);
    return {
      clave,
      nodoId: ctx.nodoId,
      tema: ctx.motor,
      tipo: regla.tipo ?? "REGLA",
      orden: regla.orden ?? indice,
      nombre: regla.nombre,
      // La barra duplicada de un copiado desde código se corrige aquí también,
      // no sólo en el formulario: por la API entra contenido igual que por la
      // pantalla, y lo que se guarda es lo que acabará en la pizarra.
      enunciado: normalizarLatex(regla.enunciado),
      descripcion: regla.descripcion,
      ejemplo: regla.ejemplo ? normalizarLatex(regla.ejemplo) : null,
      // Vacío = hereda el nivel del tema. No se copia el valor del tema: si se
      // copiara, cambiar el nivel del tema dejaría las reglas con el viejo.
      nivel: regla.nivel ?? null,
      // Sin motor no hay quien califique la práctica de una regla, así que
      // "se puede practicar" no puede quedar marcado. La interfaz ya lo
      // deshabilita; esto lo garantiza venga de donde venga la petición.
      practicable: ctx.motor ? (regla.practicable ?? false) : false,
      estado: ctx.estado,
      autorId: ctx.autorId,
    };
  });
}
