import type { ModoAprendizaje, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  esSolucionFinal,
  leer,
  resolverPorPasos,
  validarTransformacion,
  type VeredictoPaso,
} from "@/lib/matematicas/pasos-alumno";
import { aplicarPoliticaRevelacion, decidir, type Decision, type Entrada, type Evento, type Salida } from "./orquestador";
import { armarPiezas } from "./piezas-guiadas";

/**
 * PRÁCTICA GUIADA EN SERVIDOR (PMV 3 · HITO 2).
 *
 * El servidor lee el modo de aprendizaje, el paso activo y los intentos; valida
 * el paso del alumno; pide una decisión al orquestador; aplica la política de
 * revelación a lo que va a entregar; y REGISTRA la decisión con su motivo. El
 * navegador sólo escribe pasos y pide ayuda: nunca decide qué se le revela.
 */

type Tx = Prisma.TransactionClient;

export interface VistaPractica {
  id: string;
  enunciado: string;
  modo: ModoAprendizaje;
  /** Los pasos del alumno ya aceptados. */
  pasos: string[];
  pasoActual: string;
  /** El paso que está resolviendo (0-based) y cuántos prevé el modelo. */
  paso: { indice: number; total: number };
  resuelta: boolean;
  solucionMostrada: boolean;
}

export interface Respuesta {
  practica: VistaPractica;
  /** `null` si el motor no sabe juzgar el paso; ausente en una evaluación. */
  valido?: boolean | null;
  causa?: string | null;
  decision: Pick<Decision, "accion" | "razon" | "motivo" | "revelaHasta" | "nivelAyuda">;
  salida: Salida;
}

const MAX_TEXTO = 200;

export const MODOS_ELEGIBLES: ModoAprendizaje[] = ["PRACTICA_GUIADA", "PRACTICA_LIBRE", "EVALUACION", "EXPLICACION"];

/** Serializa las peticiones sobre una misma práctica (doble clic, dos pestañas). */
async function bloquear(tx: Tx, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('practica-guiada'), hashtext(${id}))`;
}

type Practica = NonNullable<Awaited<ReturnType<typeof prisma.practicaGuiada.findUnique>>>;

const pasosDe = (p: Practica): string[] => (Array.isArray(p.pasos) ? (p.pasos as string[]) : []);

function vista(p: Practica): VistaPractica {
  const restantes = resolverPorPasos(p.pasoActual) ?? [];
  const aceptados = pasosDe(p);
  return {
    id: p.id,
    enunciado: p.enunciado,
    modo: p.modo,
    pasos: aceptados,
    pasoActual: p.pasoActual,
    paso: { indice: aceptados.length, total: aceptados.length + restantes.length },
    resuelta: p.resuelta,
    solucionMostrada: p.solucionMostrada,
  };
}

/** La entrada del orquestador, leída del estado guardado. */
function entradaDe(p: Practica, evento: Evento): Entrada {
  const restantes = resolverPorPasos(p.pasoActual) ?? [];
  const aceptados = pasosDe(p);
  return {
    modo: p.modo,
    evento,
    paso: { indice: aceptados.length, total: aceptados.length + restantes.length },
    intentos: { fallosEnPaso: p.fallosEnPaso, pistasEnPaso: p.pistasEnPaso, pistasTotales: p.pistasTotales },
  };
}

/** Decide, filtra lo que se entrega y registra la decisión. No toca los contadores. */
async function resolverDecision(
  tx: Tx,
  p: Practica,
  evento: Evento,
  veredicto: VeredictoPaso | null,
): Promise<{ decision: Decision; salida: Salida }> {
  const entrada = entradaDe(p, evento);
  const decision = decidir(entrada);
  const restantes = resolverPorPasos(p.pasoActual) ?? [];
  const piezas = armarPiezas(decision, { veredicto, siguiente: restantes[0] ?? null, restantes });
  const salida = aplicarPoliticaRevelacion(decision, piezas);
  await tx.decisionPedagogica.create({
    data: {
      practicaId: p.id,
      estudianteId: p.estudianteId,
      modo: p.modo,
      evento,
      accion: decision.accion,
      razon: decision.razon,
      motivo: decision.motivo,
      nivelAyuda: decision.nivelAyuda,
      revelaHasta: decision.revelaHasta,
      pasoIndice: entrada.paso.indice,
      entrada: { ...entrada, causaDelError: veredicto?.causa ?? null } as unknown as Prisma.InputJsonValue,
      retenidas: salida.retenidas,
    },
  });
  return { decision, salida };
}

const resumenDecision = (d: Decision) => ({
  accion: d.accion,
  razon: d.razon,
  motivo: d.motivo,
  revelaHasta: d.revelaHasta,
  nivelAyuda: d.nivelAyuda,
});

// ── Crear ────────────────────────────────────────────────────────────────────

export type ResultadoCrear =
  | { ok: true; respuesta: Respuesta }
  | { ok: false; error: string };

export async function crearPractica(estudianteId: string, enunciado: string, modo: ModoAprendizaje): Promise<ResultadoCrear> {
  const texto = enunciado.trim();
  if (!texto || texto.length > MAX_TEXTO) return { ok: false, error: `Escribe una ecuación de hasta ${MAX_TEXTO} caracteres.` };
  const l = leer(texto);
  if (!l || l.tipo !== "ecuacion") return { ok: false, error: "El enunciado tiene que ser una ecuación, por ejemplo 2(x+4) = 3x-1." };
  if (!resolverPorPasos(texto)) {
    return { ok: false, error: "Por ahora el tutor guía ecuaciones lineales de una incógnita (como 2(x+4) = 3x-1)." };
  }

  return prisma.$transaction(async (tx) => {
    const p = await tx.practicaGuiada.create({ data: { estudianteId, enunciado: texto, modo, pasoActual: texto } });
    const { decision, salida } = await resolverDecision(tx, p, "INICIO_PASO", null);
    return { ok: true as const, respuesta: { practica: vista(p), decision: resumenDecision(decision), salida } };
  });
}

// ── Enviar un paso ───────────────────────────────────────────────────────────

export type ResultadoAccion =
  | { ok: true; respuesta: Respuesta }
  | { ok: false; error: string; status: 400 | 404 | 409 };

export async function enviarPaso(estudianteId: string, id: string, pasoDelAlumno: string): Promise<ResultadoAccion> {
  const paso = pasoDelAlumno.trim();
  if (!paso || paso.length > MAX_TEXTO) return { ok: false, status: 400, error: `Escribe un paso de hasta ${MAX_TEXTO} caracteres.` };

  return prisma.$transaction(async (tx) => {
    await bloquear(tx, id);
    const p = await tx.practicaGuiada.findFirst({ where: { id, estudianteId } });
    if (!p) return { ok: false as const, status: 404 as const, error: "Esa práctica no existe." };
    if (p.resuelta) return { ok: false as const, status: 409 as const, error: "Esta práctica ya está resuelta." };

    const veredicto = validarTransformacion(p.pasoActual, paso);

    // No se pudo juzgar: no cuenta ni como acierto ni como error, y no hay decisión
    // pedagógica que tomar —se pide reescribirlo—.
    if (veredicto.ok === null) {
      return {
        ok: true as const,
        respuesta: {
          practica: vista(p),
          valido: null,
          causa: veredicto.causa,
          decision: { accion: "PREGUNTAR" as const, razon: "INICIO_DE_PASO_SE_PREGUNTA" as const, motivo: "El paso no se pudo leer: se pide reescribirlo.", revelaHasta: "nada" as const, nivelAyuda: 0 as const },
          salida: { texto: [veredicto.explicacion], audio: null, lsg: [], retenidas: 0 },
        },
      };
    }
    // Un paso idéntico al anterior no avanza: se avisa, sin contarlo.
    if (veredicto.ok && veredicto.sinAvance) {
      return {
        ok: true as const,
        respuesta: {
          practica: vista(p),
          valido: true,
          causa: null,
          decision: { accion: "PREGUNTAR" as const, razon: "INICIO_DE_PASO_SE_PREGUNTA" as const, motivo: "El paso repite el anterior: se pide avanzar.", revelaHasta: "nada" as const, nivelAyuda: 0 as const },
          salida: { texto: [veredicto.explicacion], audio: null, lsg: [], retenidas: 0 },
        },
      };
    }

    // ── EVALUACIÓN: se registra, sin decir si estaba bien ────────────────────
    if (p.modo === "EVALUACION") {
      const acertado = veredicto.ok === true;
      const actualizada = await tx.practicaGuiada.update({
        where: { id },
        data: acertado
          ? { pasos: [...pasosDe(p), paso], pasoActual: paso, resuelta: esSolucionFinal(p.enunciado, paso) }
          : {},
      });
      const { decision, salida } = await resolverDecision(tx, p, acertado ? "PASO_CORRECTO" : "PASO_INCORRECTO", veredicto);
      return { ok: true as const, respuesta: { practica: vista(actualizada), decision: resumenDecision(decision), salida } };
    }

    // ── Paso correcto: se acepta y se avanza ─────────────────────────────────
    if (veredicto.ok) {
      const solucion = esSolucionFinal(p.enunciado, paso);
      const actualizada = await tx.practicaGuiada.update({
        where: { id },
        data: { pasos: [...pasosDe(p), paso], pasoActual: paso, fallosEnPaso: 0, pistasEnPaso: 0, resuelta: solucion },
      });
      const { decision, salida } = await resolverDecision(tx, actualizada, "PASO_CORRECTO", veredicto);
      const final: Salida = solucion
        ? { ...salida, texto: ["¡Resuelto! Has llegado a la solución paso a paso."], audio: "¡Resuelto! Has llegado a la solución paso a paso." }
        : salida;
      return { ok: true as const, respuesta: { practica: vista(actualizada), valido: true, causa: null, decision: resumenDecision(decision), salida: final } };
    }

    // ── Paso incorrecto: un fallo más, y el orquestador decide la ayuda ──────
    const conFallo = await tx.practicaGuiada.update({ where: { id }, data: { fallosEnPaso: { increment: 1 } } });
    const { decision, salida } = await resolverDecision(tx, conFallo, "PASO_INCORRECTO", veredicto);
    const actualizada = await aplicarEfectos(tx, conFallo, decision);
    return {
      ok: true as const,
      respuesta: { practica: vista(actualizada), valido: false, causa: veredicto.causa, decision: resumenDecision(decision), salida },
    };
  });
}

/** Lo que una decisión deja en el estado: una pista dada, una solución mostrada. */
async function aplicarEfectos(tx: Tx, p: Practica, d: Decision): Promise<Practica> {
  if (d.accion === "PISTA") {
    return tx.practicaGuiada.update({ where: { id: p.id }, data: { pistasEnPaso: { increment: 1 }, pistasTotales: { increment: 1 } } });
  }
  if (d.accion === "MOSTRAR_SOLUCION") {
    return tx.practicaGuiada.update({ where: { id: p.id }, data: { solucionMostrada: true } });
  }
  return p;
}

// ── Pedir ayuda ──────────────────────────────────────────────────────────────

export type TipoAyuda = "PISTA" | "SOLUCION" | "EXPLICACION";
const EVENTO_DE_AYUDA: Record<TipoAyuda, Evento> = {
  PISTA: "PIDE_PISTA",
  SOLUCION: "PIDE_SOLUCION",
  EXPLICACION: "PIDE_EXPLICACION",
};

export async function pedirAyuda(estudianteId: string, id: string, tipo: TipoAyuda): Promise<ResultadoAccion> {
  return prisma.$transaction(async (tx) => {
    await bloquear(tx, id);
    const p = await tx.practicaGuiada.findFirst({ where: { id, estudianteId } });
    if (!p) return { ok: false as const, status: 404 as const, error: "Esa práctica no existe." };
    if (p.resuelta) return { ok: false as const, status: 409 as const, error: "Esta práctica ya está resuelta." };

    const { decision, salida } = await resolverDecision(tx, p, EVENTO_DE_AYUDA[tipo], null);
    const actualizada = await aplicarEfectos(tx, p, decision);
    return { ok: true as const, respuesta: { practica: vista(actualizada), decision: resumenDecision(decision), salida } };
  });
}

export async function leerPractica(estudianteId: string, id: string): Promise<VistaPractica | null> {
  const p = await prisma.practicaGuiada.findFirst({ where: { id, estudianteId } });
  return p ? vista(p) : null;
}
