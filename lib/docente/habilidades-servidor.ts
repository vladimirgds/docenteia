import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { Autorizacion } from "@/lib/docente/api";
import { dondeProcedimientosVisibles } from "@/lib/docente/procedimientos-servidor";
import { cicloAlSustituir } from "@/lib/docente/habilidades";

/** Las habilidades son del docente que las crea (un SUPERADMIN las ve todas). */
export function dondeHabilidadesVisibles(quien: Autorizacion): Prisma.HabilidadWhereInput {
  return quien.rol === "SUPERADMIN" ? {} : { autorId: quien.usuarioId };
}

export const SELECCION_HABILIDAD = {
  id: true,
  clave: true,
  nombre: true,
  descripcion: true,
  nodoId: true,
  repasoId: true,
  autorId: true,
  creadoEn: true,
  requiere: { select: { requiereId: true } },
  _count: { select: { ejercicios: true } },
} satisfies Prisma.HabilidadSelect;

/** El repaso tiene que ser un procedimiento PUBLICADO que quien guarda pueda ver. */
export async function repasoValido(quien: Autorizacion, repasoId: string | null | undefined): Promise<boolean> {
  if (!repasoId) return true;
  const p = await prisma.procedimiento.findFirst({
    where: { AND: [{ id: repasoId, estado: "PUBLICADO" }, dondeProcedimientosVisibles(quien)] },
    select: { id: true },
  });
  return Boolean(p);
}

export type ResultadoPrerrequisitos = { ok: true } | { ok: false; status: 404 | 409; error: string; ciclo?: string[] };

/**
 * Sustituye los prerrequisitos de `habilidadId` por `requiere`, dentro de la
 * transacción y con un CERROJO global: dos docentes que guardan a la vez no
 * pueden cerrar un ciclo entre los dos (cada uno lo comprobaría sin ver la
 * arista del otro).
 */
export async function guardarPrerrequisitos(
  tx: Prisma.TransactionClient,
  quien: Autorizacion,
  habilidadId: string,
  requiere: readonly string[],
): Promise<ResultadoPrerrequisitos> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('habilidades-prerrequisitos'))`;
  const unicos = [...new Set(requiere)];
  if (unicos.length > 0) {
    const visibles = await tx.habilidad.findMany({
      where: { AND: [{ id: { in: unicos } }, dondeHabilidadesVisibles(quien)] },
      select: { id: true },
    });
    if (visibles.length !== unicos.length) return { ok: false, status: 404, error: "Algún prerrequisito no existe o no es tuyo." };
  }
  const aristas = (await tx.prerrequisitoHabilidad.findMany({ select: { habilidadId: true, requiereId: true } })).map((x) => ({
    de: x.habilidadId,
    a: x.requiereId,
  }));
  const ciclo = cicloAlSustituir(aristas, habilidadId, unicos);
  if (ciclo) {
    const nombres = new Map(
      (await tx.habilidad.findMany({ where: { id: { in: ciclo } }, select: { id: true, nombre: true } })).map((h) => [h.id, h.nombre]),
    );
    const texto = ciclo.map((id) => `«${nombres.get(id) ?? id}»`).join(" → ");
    return { ok: false, status: 409, error: `Ese prerrequisito crearía un ciclo: ${texto}.`, ciclo };
  }
  await tx.prerrequisitoHabilidad.deleteMany({ where: { habilidadId } });
  if (unicos.length > 0) {
    await tx.prerrequisitoHabilidad.createMany({ data: unicos.map((requiereId) => ({ habilidadId, requiereId })) });
  }
  return { ok: true };
}
