import { z } from "zod";

import { TEMAS_LECCION } from "../leccion/temas.ts";

/**
 * El CURRÍCULO como dato: reglas de forma, validación y estructura de árbol.
 *
 * Aquí vive todo lo que hay que saber sobre un tema, una asignatura o una regla
 * pedagógica ANTES de tocar la base de datos, y nada que dependa de Prisma o de
 * Next.js. Esa frontera es deliberada: los esquemas de validación los usan las
 * rutas de API, la semilla y la batería de QA, y la batería tiene que poder
 * ejercitarlos sin levantar ni servidor ni base de datos.
 *
 * Nada de esto se duplica en el cliente. El formulario del panel envía lo que
 * el docente escribe y el servidor decide si es admisible; validar en el
 * navegador está bien para avisar antes, pero nunca es la comprobación buena.
 */

// ── Vocabulario cerrado ──────────────────────────────────────────────────────
// Se declaran como tuplas `as const` porque zod necesita literales para
// construir el enum, y porque así el compilador avisa si algún día el esquema
// de Prisma y esta lista dejan de coincidir.

export const NIVELES = ["BASICO", "INTERMEDIO", "AVANZADO"] as const;
export const ESTADOS = ["BORRADOR", "PUBLICADO", "ARCHIVADO"] as const;
export const TIPOS_REGLA = ["REGLA", "PROPIEDAD", "ESTRATEGIA", "ERROR_FRECUENTE"] as const;
export const MOTORES = [
  "ARITMETICA",
  "FRACCIONES",
  "ECUACIONES_LINEALES",
  "FACTORIZACION",
  "DERIVADAS",
] as const;

export type Nivel = (typeof NIVELES)[number];
export type Estado = (typeof ESTADOS)[number];
export type TipoRegla = (typeof TIPOS_REGLA)[number];
export type Motor = (typeof MOTORES)[number];

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  BORRADOR: "Borrador",
  PUBLICADO: "Publicado",
  ARCHIVADO: "Archivado",
};

export const DESCRIPCION_ESTADO: Record<Estado, string> = {
  BORRADOR: "Sólo lo ves tú. No llega a ningún alumno.",
  PUBLICADO: "Disponible para las lecciones y las prácticas.",
  ARCHIVADO: "Retirado de la vista, con su historial intacto.",
};

export const ETIQUETA_TIPO_REGLA: Record<TipoRegla, string> = {
  REGLA: "Regla",
  PROPIEDAD: "Propiedad",
  ESTRATEGIA: "Estrategia",
  ERROR_FRECUENTE: "Error frecuente",
};

export const ETIQUETA_NIVEL_CURRICULO: Record<Nivel, string> = {
  BASICO: "Básico",
  INTERMEDIO: "Intermedio",
  AVANZADO: "Avanzado",
};

/** Los motores, ya con el nombre que se le enseña al docente. */
export const MOTORES_DISPONIBLES = MOTORES.map((motor) => {
  const tema = TEMAS_LECCION.find((t) => t.tema === motor);
  return {
    motor,
    titulo: tema?.titulo ?? motor,
    descripcion: tema?.descripcion ?? "",
  };
});

/** Nombre legible de un motor, para las tablas y las tarjetas. */
export function etiquetaMotor(motor: string | null | undefined): string {
  if (!motor) return "Sin motor";
  return MOTORES_DISPONIBLES.find((m) => m.motor === motor)?.titulo ?? motor;
}

// ── Claves ───────────────────────────────────────────────────────────────────

/**
 * Convierte un título en clave estable: "Ecuaciones de 1.er grado" → "ecuaciones-de-1-er-grado".
 *
 * La clave es el identificador legible del tema y la citan la semilla, los
 * enlaces y el propio motor. Por eso se genera UNA VEZ, al crear, y renombrar
 * el tema después no la toca: cambiarla rompería lo que ya apunta a ella, y a
 * cambio no arregla nada.
 */
export function generarClave(texto: string, maximo = 60): string {
  const base = String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximo)
    .replace(/-+$/g, "");
  return base || "tema";
}

/**
 * Una clave que no choque con las que ya existen: "derivadas", "derivadas-2"…
 *
 * Dos docentes del mismo colegio llaman "Fracciones" a su tema con toda
 * naturalidad. Sin esto, el segundo se llevaría un error de restricción única
 * de PostgreSQL —"Unique constraint failed on the fields: (clave)"— que no le
 * dice nada a nadie.
 */
export function claveUnica(base: string, ocupadas: Iterable<string>): string {
  const tomadas = new Set(ocupadas);
  if (!tomadas.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const intento = `${base}-${n}`;
    if (!tomadas.has(intento)) return intento;
  }
  // Con 500 temas homónimos, el sufijo aleatorio es preferible a fallar.
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Esquemas de validación ───────────────────────────────────────────────────

const textoCorto = (max: number) => z.string().trim().max(max);

export const parametroSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_]{0,15}$/, "El nombre del parámetro debe empezar por letra."),
    min: z.number().finite(),
    max: z.number().finite(),
    paso: z.number().finite().positive().max(1000).optional(),
    excluir: z.array(z.number().finite()).max(50).optional(),
  })
  .refine((p) => p.max >= p.min, {
    message: "El máximo de un parámetro no puede ser menor que su mínimo.",
  });

export const materiaSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es demasiado corto").max(120),
  /** Se genera del nombre cuando no se envía: el docente no debería pensar en códigos. */
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, "El código sólo admite letras, números, guion y guion bajo.")
    .optional(),
  descripcion: textoCorto(500).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "El color debe ir en formato #rrggbb.")
    .optional()
    .nullable(),
  orden: z.number().int().min(0).max(999).optional(),
  activa: z.boolean().optional(),
});

export const reglaSchema = z.object({
  /** Presente al editar: permite conservar la fila en lugar de recrearla. */
  id: z.string().max(40).optional(),
  tipo: z.enum(TIPOS_REGLA).default("REGLA"),
  nombre: z.string().trim().min(3, "El nombre de la regla es demasiado corto").max(160),
  /** Enunciado formal en LaTeX; es lo que compone KaTeX en la pizarra. */
  enunciado: z.string().trim().min(1, "Falta el enunciado formal").max(400),
  descripcion: z.string().trim().min(3, "Falta la explicación en castellano").max(800),
  ejemplo: textoCorto(400).optional().nullable(),
  nivel: z.enum(NIVELES).optional().nullable(),
  practicable: z.boolean().optional(),
  orden: z.number().int().min(0).max(200).optional(),
});

/** Etapas educativas, para los desplegables del panel. */
export const ETAPAS_CURRICULO = ["PRIMARIA", "SECUNDARIA", "SUPERIOR"] as const;
export type EtapaCurriculo = (typeof ETAPAS_CURRICULO)[number];

export const temaSchema = z.object({
  titulo: z.string().trim().min(3, "El título es demasiado corto").max(160),
  descripcion: textoCorto(1000).optional().nullable(),
  materiaId: z.string().min(1).max(40).optional().nullable(),
  padreId: z.string().min(1).max(40).optional().nullable(),
  motor: z.enum(MOTORES).optional().nullable(),
  nivel: z.enum(NIVELES).optional().nullable(),
  /**
   * A partir de qué punto del sistema educativo se plantea el tema.
   *
   * Es el otro eje, y no es el mismo que `nivel`: `nivel` dice cuánto cuesta
   * dentro de su etapa, y esto dice a qué alumnos les toca. Sin él, "avanzado"
   * acababa significando "universitario" y a un alumno de secundaria le
   * llegaban derivadas.
   */
  etapa: z.enum(ETAPAS_CURRICULO).optional().nullable(),
  cursoMin: z.number().int().min(1).max(10).optional().nullable(),
  orden: z.number().int().min(0).max(999).optional(),
  estado: z.enum(ESTADOS).optional(),
  objetivos: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
  etiquetas: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  /** Las reglas viajan con el tema: es el "formulario estructurado" del pliego. */
  reglas: z.array(reglaSchema).max(30).optional(),
});

/** En la edición todo es opcional: se envía sólo lo que cambia. */
export const temaActualizacionSchema = temaSchema.partial();

/** Los tipos de entrada salen del esquema, no de una interfaz paralela: así no
 *  pueden desincronizarse de lo que de verdad se valida. */
export type EntradaRegla = z.infer<typeof reglaSchema>;
export type EntradaTema = z.infer<typeof temaSchema>;

export const ejercicioSchema = z.object({
  /** Un ejercicio siempre pertenece a un tema: es lo que le da motor y alcance. */
  nodoId: z.string().min(1, "Falta el tema al que pertenece el ejercicio").max(40),
  /**
   * DIFICULTAD del ejercicio dentro de su tema.
   *
   * En la base sigue llamándose `nivel`; en la interfaz se llama Dificultad
   * desde que quedó claro que "Nivel" se confundía con el nivel educativo del
   * alumno, que es otra cosa y vive en el alcance curricular.
   */
  nivel: z.enum(NIVELES),
  /**
   * Alcance PROPIO del ejercicio, opcional.
   *
   * A null hereda el de su tema, que es lo que quiere casi siempre. Con valor
   * manda el suyo, para el ejercicio que dentro de un tema de 3.º está pensado
   * para 5.º y no debería bajar. Se valida contra el tema: misma etapa y curso
   * no inferior al suyo.
   */
  etapa: z.enum(ETAPAS_CURRICULO).optional().nullable(),
  cursoMin: z.number().int().min(1).max(10).optional().nullable(),
  enunciado: z.string().trim().min(1, "Falta el enunciado").max(300),
  respuestaCorrecta: textoCorto(200).optional().nullable(),
  plantilla: z.boolean().optional(),
  parametros: z.array(parametroSchema).max(6).optional(),
  respuestaFormula: textoCorto(200).optional().nullable(),
  pistas: z.array(z.string().trim().min(1).max(240)).max(5).optional(),
  estado: z.enum(ESTADOS).optional(),
});

export type EntradaEjercicio = z.infer<typeof ejercicioSchema>;

export const ejercicioActualizacionSchema = ejercicioSchema.partial().extend({
  // El tema puede cambiar, pero no desaparecer.
  nodoId: z.string().min(1).max(40).optional(),
});

/** Validación previa sin guardar: la que alimenta el botón "Validar". */
export const validacionSchema = ejercicioSchema.partial({ nodoId: true, nivel: true }).extend({
  /** Cuando no hay tema todavía, el motor se envía suelto desde el formulario. */
  motor: z.enum(MOTORES).optional().nullable(),
});

// ── El árbol ─────────────────────────────────────────────────────────────────

export interface NodoPlano {
  id: string;
  padreId: string | null;
}

/**
 * Los descendientes de un nodo, a cualquier profundidad.
 *
 * Se calcula sobre la lista ya cargada en memoria en lugar de con una consulta
 * recursiva: el currículo de un colegio son cientos de nodos, no millones, y a
 * cambio la comprobación de ciclos funciona igual en la API, en la interfaz y
 * en la batería de QA sin depender de la base de datos.
 */
export function descendientesDe(nodos: readonly NodoPlano[], id: string): Set<string> {
  const hijosPorPadre = new Map<string, string[]>();
  for (const n of nodos) {
    if (!n.padreId) continue;
    const lista = hijosPorPadre.get(n.padreId) ?? [];
    lista.push(n.id);
    hijosPorPadre.set(n.padreId, lista);
  }

  const encontrados = new Set<string>();
  const pendientes = [...(hijosPorPadre.get(id) ?? [])];
  while (pendientes.length > 0) {
    const actual = pendientes.pop()!;
    if (encontrados.has(actual)) continue; // Corta cualquier ciclo preexistente.
    encontrados.add(actual);
    pendientes.push(...(hijosPorPadre.get(actual) ?? []));
  }
  return encontrados;
}

/**
 * ¿Se puede colgar `id` de `padreId` sin crear un ciclo?
 *
 * Un tema que sea su propio abuelo deja el árbol sin raíz: el listado entra en
 * un bucle infinito y la lección no encuentra por dónde empezar. Es un error
 * fácil de cometer arrastrando temas en la interfaz, y muy difícil de reparar
 * después, así que se corta en el servidor antes de escribir.
 */
export function puedeSerPadre(
  nodos: readonly NodoPlano[],
  id: string,
  padreId: string | null | undefined,
): boolean {
  if (!padreId) return true;
  if (padreId === id) return false;
  return !descendientesDe(nodos, id).has(padreId);
}

export interface NodoConHijos<T> {
  nodo: T;
  profundidad: number;
}

/**
 * Aplana el árbol en el orden en que se lee: cada padre seguido de sus hijos.
 *
 * Devuelve además la profundidad, que es lo que la tabla usa para sangrar. Los
 * nodos huérfanos —cuyo padre se archivó o se filtró— se emiten al final en
 * lugar de desaparecer: un tema invisible en el listado es un tema que el
 * docente da por perdido.
 */
export function aplanarArbol<T extends NodoPlano>(nodos: readonly T[]): Array<NodoConHijos<T>> {
  const porPadre = new Map<string | null, T[]>();
  for (const n of nodos) {
    const clave = n.padreId ?? null;
    const lista = porPadre.get(clave) ?? [];
    lista.push(n);
    porPadre.set(clave, lista);
  }

  const salida: Array<NodoConHijos<T>> = [];
  const visitados = new Set<string>();

  const bajar = (padre: string | null, profundidad: number) => {
    for (const nodo of porPadre.get(padre) ?? []) {
      if (visitados.has(nodo.id)) continue;
      visitados.add(nodo.id);
      salida.push({ nodo, profundidad });
      bajar(nodo.id, profundidad + 1);
    }
  };

  bajar(null, 0);
  for (const nodo of nodos) {
    if (!visitados.has(nodo.id)) salida.push({ nodo, profundidad: 0 });
  }
  return salida;
}
