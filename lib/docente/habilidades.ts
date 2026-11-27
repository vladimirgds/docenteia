/**
 * PMV 3 · H4 — HABILIDADES Y PRERREQUISITOS.
 *
 * Las habilidades forman un grafo dirigido «A requiere B». Tiene que ser
 * ACÍCLICO: si «semejantes» requiere «signos» y «signos» requiriera
 * «semejantes», el tutor no sabría por dónde empezar un repaso. El servidor lo
 * comprueba con `creariaCiclo` ANTES de guardar cada arista.
 *
 * Funciones puras (sin Prisma) para poder probarlas sin base de datos.
 */
import { z } from "zod";

export const CLAVE_HABILIDAD = /^[a-z0-9][a-z0-9-]{1,59}$/;

export const habilidadSchema = z.object({
  clave: z.string().trim().regex(CLAVE_HABILIDAD, "Clave: minúsculas, cifras y guiones (2–60)."),
  nombre: z.string().trim().min(1, "Falta el nombre.").max(120),
  descripcion: z.string().trim().max(500).optional().nullable(),
  nodoId: z.string().trim().min(1).optional().nullable(),
  /** Procedimiento PUBLICADO que sirve de repaso de esta habilidad. */
  repasoId: z.string().trim().min(1).optional().nullable(),
  /** Ids de las habilidades que REQUIERE (sus prerrequisitos directos). */
  requiere: z.array(z.string().trim().min(1)).max(20).optional(),
});

export const habilidadActualizacionSchema = habilidadSchema.partial().omit({ clave: true });

/** Aristas del grafo: `de` requiere `a`. */
export interface Arista {
  de: string;
  a: string;
}

function vecinos(aristas: readonly Arista[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const { de, a } of aristas) m.set(de, [...(m.get(de) ?? []), a]);
  return m;
}

/**
 * ¿Añadir «`de` requiere `a`» cerraría un ciclo? Sí si `de === a` o si, desde
 * `a`, siguiendo prerrequisitos, ya se llega a `de`. Devuelve el ciclo
 * encontrado (para explicárselo al docente) o `null`.
 */
export function creariaCiclo(aristas: readonly Arista[], de: string, a: string): string[] | null {
  if (de === a) return [de, a];
  const g = vecinos(aristas);
  const previo = new Map<string, string>();
  const pila = [a];
  const visto = new Set([a]);
  while (pila.length > 0) {
    const n = pila.pop()!;
    if (n === de) {
      const camino = [de];
      let x = de;
      while (x !== a) {
        x = previo.get(x)!;
        camino.unshift(x);
      }
      return [de, ...camino];
    }
    for (const v of g.get(n) ?? []) {
      if (!visto.has(v)) {
        visto.add(v);
        previo.set(v, n);
        pila.push(v);
      }
    }
  }
  return null;
}

/**
 * Comprueba un conjunto de prerrequisitos NUEVOS para `de` contra el grafo
 * actual (sin las aristas viejas de `de`, que se sustituyen). Devuelve el
 * primer ciclo o `null`.
 */
export function cicloAlSustituir(aristas: readonly Arista[], de: string, nuevos: readonly string[]): string[] | null {
  const base = aristas.filter((x) => x.de !== de);
  const acumuladas = [...base];
  for (const a of nuevos) {
    const c = creariaCiclo(acumuladas, de, a);
    if (c) return c;
    acumuladas.push({ de, a });
  }
  return null;
}

/**
 * Los prerrequisitos de `id`, del más CERCANO al más lejano (búsqueda en
 * anchura): el tutor repasa primero lo que falla justo debajo.
 */
export function prerrequisitosEnOrden(aristas: readonly Arista[], id: string): string[] {
  const g = vecinos(aristas);
  const orden: string[] = [];
  const visto = new Set([id]);
  const cola = [...(g.get(id) ?? [])];
  while (cola.length > 0) {
    const n = cola.shift()!;
    if (visto.has(n)) continue;
    visto.add(n);
    orden.push(n);
    cola.push(...(g.get(n) ?? []));
  }
  return orden;
}
