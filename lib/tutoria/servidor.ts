import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { compararRespuesta } from "@/lib/matematicas/equivalencia";
import { dondeEjerciciosAsignables } from "@/lib/docente/bancos";
import { dondeProcedimientosDelAlumno } from "@/lib/docente/procedimientos-servidor";
import { prerrequisitosEnOrden } from "@/lib/docente/habilidades";
import {
  ESTADO_INICIAL,
  decidir,
  type AccionTutor,
  type EstadoTutor,
  type EventoTutor,
  type Fase,
} from "@/lib/tutoria/motor";

/**
 * LA TUTORÍA ADAPTATIVA EN EL SERVIDOR (PMV 3 · HITO 4).
 *
 * `motor.ts` decide QUÉ hace el tutor; este módulo hace que ocurra: guarda el
 * estado del alumno con cada ejercicio, aplica la decisión y elige el material
 * —la pista, el repaso, el ejercicio equivalente—. Todo en el servidor: el
 * navegador sólo recibe lo que debe enseñar y nunca puede saltarse un paso
 * (por ejemplo, declarar que ya hizo el repaso).
 */

export interface Tutor {
  accion: AccionTutor["tipo"];
  /** Texto de la pista (sólo con `PISTA`), o `null` si ya no quedan. */
  pista?: string | null;
  quedanPistas?: number;
  /** El repaso breve que se abre (sólo con `ABRIR_REPASO`); `null` si no hay ninguno publicado. */
  repaso?: { id: string; titulo: string; habilidad?: string | null } | null;
  /** El ejercicio equivalente propuesto; `null` si no hay ninguno disponible. */
  equivalente?: { id: string; enunciado: string } | null;
  /** Mensaje para el alumno, ya redactado. */
  mensaje: string;
}

interface TareaParaTutor {
  id: string;
  docenteId: string;
  ejercicioIds: string[];
  aula: { institucionId: string | null };
}

interface EjercicioParaTutor {
  id: string;
  nodoId: string | null;
  nivel: "BASICO" | "INTERMEDIO" | "AVANZADO";
  motor: string | null;
  pistas: string[];
  enunciado: string;
  nodo: { titulo: string } | null;
  /** PMV 3 · H4: la habilidad que ejercita, si el docente la enlazó. */
  habilidadId?: string | null;
}

type Sesion = Awaited<ReturnType<typeof obtenerSesion>>;

const aEstado = (s: { fase: Fase; erroresSeguidos: number; pistasDadas: number; repasos: number; equivalentes: number }): EstadoTutor => ({
  fase: s.fase,
  erroresSeguidos: s.erroresSeguidos,
  pistasDadas: s.pistasDadas,
  repasos: s.repasos,
  equivalentes: s.equivalentes,
});

async function obtenerSesion(estudianteId: string, tarea: TareaParaTutor, ejercicio: EjercicioParaTutor) {
  return prisma.sesionTutoria.upsert({
    where: { estudianteId_tareaId_ejercicioId: { estudianteId, tareaId: tarea.id, ejercicioId: ejercicio.id } },
    update: {},
    create: {
      estudianteId,
      tareaId: tarea.id,
      ejercicioId: ejercicio.id,
      nodoId: ejercicio.nodoId,
      tema: ejercicio.nodo?.titulo ?? null,
      habilidadId: ejercicio.habilidadId ?? null,
      ...ESTADO_INICIAL,
    },
  });
}

// ── Material ─────────────────────────────────────────────────────────────────

/**
 * La pista número `nivel`. Primero las que escribió el docente en el ejercicio;
 * si no hay (o se acaban), las generales de un procedimiento del tema al que el
 * alumno tiene acceso. Si tampoco hay, `null`: se dice, no se inventa.
 */
async function elegirPista(estudianteId: string, ejercicio: EjercicioParaTutor, nivel: number) {
  const propias = ejercicio.pistas;
  if (nivel < propias.length) return { pista: propias[nivel], quedan: propias.length - nivel - 1 };

  if (ejercicio.nodoId) {
    const proc = await prisma.procedimiento.findFirst({
      where: { AND: [{ nodoId: ejercicio.nodoId }, dondeProcedimientosDelAlumno(estudianteId)] },
      orderBy: { actualizadoEn: "desc" },
      select: { pistas: true },
    });
    const generales = proc?.pistas ?? [];
    const i = nivel - propias.length;
    if (i < generales.length) return { pista: generales[i], quedan: generales.length - i - 1 };
  }
  return { pista: null, quedan: 0 };
}

/**
 * El repaso breve: el que el docente enlazó (`repasoId`) a un procedimiento del
 * tema; si no hay, el procedimiento publicado MÁS CORTO del tema. Siempre uno al
 * que el alumno tiene acceso (publicado y del catálogo o de un aula suya).
 */
async function elegirRepaso(estudianteId: string, nodoId: string | null, habilidadId?: string | null) {
  const accesible = dondeProcedimientosDelAlumno(estudianteId);
  // PMV 3 · H4: si el ejercicio ejercita una HABILIDAD, se repasa primero lo que
  // falla JUSTO DEBAJO: el repaso del prerrequisito más cercano que tenga uno
  // publicado y accesible (y, si ninguno lo tiene, el de la propia habilidad).
  if (habilidadId) {
    const aristas = (await prisma.prerrequisitoHabilidad.findMany({ select: { habilidadId: true, requiereId: true } })).map((x) => ({
      de: x.habilidadId,
      a: x.requiereId,
    }));
    const candidatas = [...prerrequisitosEnOrden(aristas, habilidadId), habilidadId];
    const habilidades = await prisma.habilidad.findMany({
      where: { id: { in: candidatas }, repasoId: { not: null } },
      select: { id: true, nombre: true, repasoId: true },
    });
    for (const id of candidatas) {
      const h = habilidades.find((x) => x.id === id);
      if (!h?.repasoId) continue;
      const repaso = await prisma.procedimiento.findFirst({
        where: { AND: [{ id: h.repasoId }, accesible] },
        select: { id: true, titulo: true },
      });
      if (repaso) return { ...repaso, habilidad: h.nombre };
    }
  }
  if (!nodoId) return null;
  const delTema = await prisma.procedimiento.findMany({
    where: { AND: [{ nodoId }, accesible] },
    select: { id: true, titulo: true, pasos: true, repasoId: true },
    take: 20,
  });
  if (delTema.length === 0) return null;

  const conRepaso = delTema.find((p) => p.repasoId);
  if (conRepaso?.repasoId) {
    const repaso = await prisma.procedimiento.findFirst({
      where: { AND: [{ id: conRepaso.repasoId }, accesible] },
      select: { id: true, titulo: true },
    });
    if (repaso) return repaso;
  }
  const largo = (p: { pasos: unknown }) => (Array.isArray(p.pasos) ? p.pasos.length : 99);
  const corto = [...delTema].sort((a, b) => largo(a) - largo(b))[0];
  return { id: corto.id, titulo: corto.titulo };
}

/**
 * Un ejercicio EQUIVALENTE: mismo tema, misma dificultad y mismo motor, publicado
 * y verificado, que el alumno no tenga ya en la tarea ni se le haya propuesto
 * antes. Sale del catálogo del colegio del aula o del banco PRIVADO del docente
 * que asignó la tarea —nunca del de otro docente—.
 */
async function elegirEquivalente(tarea: TareaParaTutor, ejercicio: EjercicioParaTutor, yaPropuestos: string[]) {
  if (!ejercicio.nodoId) return null;
  const candidatos = await prisma.ejercicio.findMany({
    where: {
      AND: [
        {
          nodoId: ejercicio.nodoId,
          nivel: ejercicio.nivel,
          estado: "PUBLICADO",
          validado: true,
          plantilla: false,
          id: { notIn: [ejercicio.id, ...tarea.ejercicioIds, ...yaPropuestos] },
          enunciado: { not: ejercicio.enunciado },
          ...(ejercicio.motor ? { motor: ejercicio.motor as never } : {}),
        },
        dondeEjerciciosAsignables(
          { usuarioId: tarea.docenteId, rol: "DOCENTE", nombre: "", institucionId: tarea.aula.institucionId },
          tarea.aula.institucionId,
        ),
      ],
    },
    select: { id: true, enunciado: true, habilidadId: true },
    take: 50,
  });
  if (candidatos.length === 0) return null;
  // PMV 3 · H4: un equivalente de LA MISMA HABILIDAD, si lo hay: es lo que
  // demuestra que la recuperación funcionó.
  const mismaHabilidad = ejercicio.habilidadId ? candidatos.filter((c) => c.habilidadId === ejercicio.habilidadId) : [];
  const pool = mismaHabilidad.length > 0 ? mismaHabilidad : candidatos;
  const elegido = pool[Math.floor(Math.random() * pool.length)];
  return { id: elegido.id, enunciado: elegido.enunciado };
}

// ── Las tres operaciones ─────────────────────────────────────────────────────

async function persistir(
  sesion: NonNullable<Sesion>,
  nuevo: EstadoTutor,
  eventos: { tipo: Prisma.EventoTutoriaCreateWithoutSesionInput["tipo"]; detalle?: Prisma.InputJsonValue }[],
  extra: { errorTotal?: boolean } = {},
) {
  const ahora = Date.now();
  await prisma.$transaction([
    prisma.sesionTutoria.update({
      where: { id: sesion.id },
      data: {
        fase: nuevo.fase,
        erroresSeguidos: nuevo.erroresSeguidos,
        pistasDadas: nuevo.pistasDadas,
        repasos: nuevo.repasos,
        equivalentes: nuevo.equivalentes,
        resuelta: nuevo.fase === "RESUELTO",
        ...(extra.errorTotal ? { erroresTotales: { increment: 1 } } : {}),
      },
    }),
    // La hora se pone AQUÍ, y distinta en cada evento: `now()` de Postgres es la
    // del INICIO de la transacción, así que los eventos de una misma respuesta
    // (la respuesta, la pista, el repaso…) saldrían con la misma hora y el informe
    // los contaría en cualquier orden.
    ...eventos.map((e, i) =>
      prisma.eventoTutoria.create({
        data: { sesionId: sesion.id, tipo: e.tipo, detalle: e.detalle ?? {}, creadoEn: new Date(ahora + i) },
      }),
    ),
  ]);
}

async function equivalentesPropuestos(sesionId: string): Promise<string[]> {
  const ev = await prisma.eventoTutoria.findMany({
    where: { sesionId, tipo: "EQUIVALENTE_PROPUESTO" },
    select: { detalle: true },
  });
  return ev.flatMap((e) => {
    const id = (e.detalle as { equivalenteId?: unknown } | null)?.equivalenteId;
    return typeof id === "string" ? [id] : [];
  });
}

/** Un material que el motor pidió y no se pudo dar: se le dice al alumno con claridad. */
const SIN_PISTA = "No tengo más pistas para este ejercicio. Repasa el enunciado y comprueba cada paso con calma.";

async function aplicar(
  estudianteId: string,
  tarea: TareaParaTutor,
  ejercicio: EjercicioParaTutor,
  evento: EventoTutor,
): Promise<Tutor> {
  const sesion = await obtenerSesion(estudianteId, tarea, ejercicio);
  const decision = decidir(aEstado(sesion), evento);
  const accion = decision.accion;
  let estado = decision.estado;
  const eventos: Parameters<typeof persistir>[2] = [];

  if (evento.tipo === "RESPUESTA") {
    eventos.push({ tipo: evento.correcta ? "RESPUESTA_CORRECTA" : "RESPUESTA_INCORRECTA" });
  }

  let tutor: Tutor;
  switch (accion.tipo) {
    case "PISTA": {
      const p = await elegirPista(estudianteId, ejercicio, accion.nivel);
      eventos.push({ tipo: "PISTA", detalle: { nivel: accion.nivel, pista: p.pista } });
      tutor = {
        accion: "PISTA",
        pista: p.pista,
        quedanPistas: p.quedan,
        mensaje: p.pista ? `Una pista: ${p.pista}` : SIN_PISTA,
      };
      break;
    }
    case "ABRIR_REPASO": {
      const repaso = await elegirRepaso(estudianteId, ejercicio.nodoId, ejercicio.habilidadId);
      eventos.push({
        tipo: "REPASO_ABIERTO",
        detalle: { procedimientoId: repaso?.id ?? null, habilidad: (repaso && "habilidad" in repaso ? repaso.habilidad : null) ?? null },
      });
      if (!repaso) {
        // Sin repaso publicado no hay nada que cerrar: si la sesión se quedara en
        // REPASO, nunca saldría de ahí. Se da por saltado y se pasa a REGRESO, de
        // modo que el resto del itinerario (pista, equivalente) sigue funcionando.
        estado = decidir(estado, { tipo: "REPASO_CERRADO" }).estado;
        eventos.push({ tipo: "REPASO_CERRADO", detalle: { saltado: true } });
      }
      tutor = {
        accion: "ABRIR_REPASO",
        repaso,
        mensaje: repaso
          ? `Parece que este punto se te resiste. Vamos a repasarlo un momento: «${repaso.titulo}»${"habilidad" in repaso && repaso.habilidad ? ` (${repaso.habilidad})` : ""}.`
          : "Parece que este punto se te resiste. Todavía no hay un repaso publicado para este tema: pídele ayuda a tu profesor y vuelve a intentarlo.",
      };
      break;
    }
    case "PROPONER_EQUIVALENTE": {
      const eq = await elegirEquivalente(tarea, ejercicio, await equivalentesPropuestos(sesion.id));
      if (eq) eventos.push({ tipo: "EQUIVALENTE_PROPUESTO", detalle: { equivalenteId: eq.id } });
      tutor = {
        accion: "PROPONER_EQUIVALENTE",
        equivalente: eq,
        mensaje: eq
          ? "Para afianzarlo, prueba con un ejercicio parecido."
          : "No hay un ejercicio parecido disponible ahora mismo. ¡Sigue así!",
      };
      break;
    }
    case "VOLVER_AL_PASO":
      eventos.push({ tipo: "REPASO_CERRADO" });
      tutor = { accion: "VOLVER_AL_PASO", mensaje: "Repaso terminado. Vuelve al ejercicio y vuelve a intentarlo." };
      break;
    default:
      tutor = { accion: "CONTINUAR", mensaje: "" };
  }

  await persistir(sesion, estado, eventos, {
    errorTotal: evento.tipo === "RESPUESTA" && !evento.correcta,
  });
  await registrarHabilidad(estudianteId, ejercicio.habilidadId ?? null, evento, tutor);
  return tutor;
}

/**
 * PMV 3 · H4: errores, pistas, intentos, aciertos y repasos POR HABILIDAD.
 * Un fallo aquí no debe tumbar la tutoría: se registra en el log y se sigue.
 */
async function registrarHabilidad(estudianteId: string, habilidadId: string | null, evento: EventoTutor, tutor: Tutor) {
  if (!habilidadId) return;
  const inc = {
    intentos: evento.tipo === "RESPUESTA" ? 1 : 0,
    errores: evento.tipo === "RESPUESTA" && !evento.correcta ? 1 : 0,
    aciertos: evento.tipo === "RESPUESTA" && evento.correcta ? 1 : 0,
    pistas: tutor.accion === "PISTA" && tutor.pista ? 1 : 0,
    repasos: tutor.accion === "ABRIR_REPASO" && tutor.repaso ? 1 : 0,
  };
  if (Object.values(inc).every((v) => v === 0)) return;
  try {
    await prisma.registroHabilidad.upsert({
      where: { estudianteId_habilidadId: { estudianteId, habilidadId } },
      create: { estudianteId, habilidadId, ...inc },
      update: Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, { increment: v }])),
    });
  } catch (e) {
    console.error("[tutoria] no se pudo registrar la habilidad:", e);
  }
}

/** El alumno responde un ejercicio de una tarea: se registra y el tutor decide. */
export function procesarRespuesta(
  estudianteId: string,
  tarea: TareaParaTutor,
  ejercicio: EjercicioParaTutor,
  correcta: boolean,
): Promise<Tutor> {
  return aplicar(estudianteId, tarea, ejercicio, { tipo: "RESPUESTA", correcta });
}

/** El alumno pide una pista a voluntad. */
export function pedirPista(estudianteId: string, tarea: TareaParaTutor, ejercicio: EjercicioParaTutor): Promise<Tutor> {
  return aplicar(estudianteId, tarea, ejercicio, { tipo: "PISTA_PEDIDA" });
}

/** El alumno termina el repaso: vuelve al paso original con los errores a cero. */
export function cerrarRepaso(estudianteId: string, tarea: TareaParaTutor, ejercicio: EjercicioParaTutor): Promise<Tutor> {
  return aplicar(estudianteId, tarea, ejercicio, { tipo: "REPASO_CERRADO" });
}

/**
 * El alumno responde el ejercicio equivalente. Sólo vale si ESE ejercicio se le
 * propuso en ESTA sesión de tutoría: el endpoint no corrige ejercicios al azar.
 * No cuenta para la nota de la tarea; queda como evidencia de consolidación.
 */
export async function responderEquivalente(
  estudianteId: string,
  tarea: TareaParaTutor,
  ejercicio: EjercicioParaTutor,
  equivalenteId: string,
  respuesta: string,
): Promise<{ correcto: boolean } | null> {
  const sesion = await obtenerSesion(estudianteId, tarea, ejercicio);
  if (!(await equivalentesPropuestos(sesion.id)).includes(equivalenteId)) return null;
  const eq = await prisma.ejercicio.findUnique({ where: { id: equivalenteId }, select: { respuestaCorrecta: true } });
  if (!eq) return null;
  const correcto = compararRespuesta(respuesta.trim(), eq.respuestaCorrecta).correcto;
  await prisma.eventoTutoria.create({
    data: { sesionId: sesion.id, tipo: "EQUIVALENTE_RESPONDIDO", detalle: { equivalenteId, correcto } },
  });
  return { correcto };
}

/** Lo que hace falta saber de la tarea y del ejercicio, cargado una sola vez. */
export async function cargarContexto(tareaId: string, ejercicioId: string) {
  const [tarea, ejercicio] = await Promise.all([
    prisma.tarea.findUnique({
      where: { id: tareaId },
      select: { id: true, docenteId: true, aulaId: true, ejercicioIds: true, aula: { select: { institucionId: true } } },
    }),
    prisma.ejercicio.findUnique({
      where: { id: ejercicioId },
      select: { id: true, nodoId: true, nivel: true, motor: true, pistas: true, enunciado: true, habilidadId: true, nodo: { select: { titulo: true } } },
    }),
  ]);
  // El enunciado y las pistas que ve el alumno son los CONGELADOS al asignar la
  // tarea (PMV 3 · HITO 1); el resto (tema, nivel, motor) sigue siendo el del banco.
  const congelado = ejercicio
    ? await prisma.tareaEjercicio.findFirst({ where: { tareaId, ejercicioId }, select: { enunciado: true, pistas: true } })
    : null;
  return { tarea, ejercicio: ejercicio && congelado ? { ...ejercicio, ...congelado } : ejercicio };
}
