import type { AmbitoContenido, Prisma } from "@prisma/client";

import { puedeEscribirEnInstitucion, type Autorizacion } from "./api";

/**
 * CATÁLOGO MAESTRO Y BANCOS PRIVADOS POR DOCENTE (PMV 3 · HITO 1).
 *
 * Las reglas de quién ve y quién toca qué ejercicio viven AQUÍ y sólo aquí, por
 * la misma razón que las del aislamiento institucional viven en `api.ts`: si
 * cada ruta las reescribe, basta una que se olvide para abrir un IDOR. Ninguna
 * ruta decide por su cuenta; todas preguntan a este módulo.
 *
 * El contrato:
 *
 *   MAESTRO  → el catálogo. Lo ve quien ya lo veía (el propio colegio más el
 *              catálogo base). Lo edita SUPERADMIN —o, si es contenido de un
 *              colegio, los docentes de ese colegio, como en el HITO 4—.
 *   DOCENTE  → el banco privado. SÓLO su autor y SUPERADMIN lo ven y lo editan.
 *              Un DIRECTOR supervisa aulas y tareas, no el cuaderno de borradores
 *              de cada docente: tampoco lo ve.
 */

/**
 * El `Autorizacion` de quien tiene la sesión abierta, para las PÁGINAS del
 * servidor que consultan Prisma directamente (las rutas de API ya lo reciben de
 * `exigirDocente`). Existe para que una página no tenga que reescribir la
 * regla de visibilidad: la pide a este módulo igual que una ruta.
 */
export function autorizacionDeSesion(
  usuario: { id: string; rol: Autorizacion["rol"]; name?: string | null; institucionId?: string | null } | undefined | null,
): Autorizacion {
  return {
    usuarioId: usuario?.id ?? "",
    rol: usuario?.rol ?? "ESTUDIANTE",
    nombre: usuario?.name ?? "",
    institucionId: usuario?.institucionId ?? null,
  };
}

/** Los tres cortes del banco que ofrece la interfaz y la API (`?banco=`). */
export const BANCOS = ["maestro", "propio", "borradores-ia"] as const;
export type FiltroBanco = (typeof BANCOS)[number];

export function esFiltroBanco(valor: string | null): valor is FiltroBanco {
  return valor !== null && (BANCOS as readonly string[]).includes(valor);
}

/**
 * La parte de `where` que deja pasar SÓLO los ejercicios que `quien` puede
 * LEER. Se combina con `AND` en la ruta, nunca con `OR`: un `OR` suelto en la
 * consulta se comería este filtro, que es justo lo que ya pasó con la cláusula
 * institucional.
 */
export function dondeEjerciciosVisibles(quien: Autorizacion): Prisma.EjercicioWhereInput {
  if (quien.rol === "SUPERADMIN") return {};
  return {
    OR: [
      {
        ambito: "MAESTRO",
        OR: [{ institucionId: null }, { institucionId: quien.institucionId }],
      },
      { ambito: "DOCENTE", autorId: quien.usuarioId },
    ],
  };
}

/**
 * Lo que un docente puede ENTREGAR a un aula en una tarea: el catálogo que
 * alcanza al colegio del aula más SU banco privado. El banco privado de otro
 * docente nunca entra, aunque se conozca el id.
 *
 * `institucionDelAula` es la del aula, no la del docente: así una tarea
 * asignada en un colegio sólo lleva contenido legible desde ese colegio.
 */
export function dondeEjerciciosAsignables(
  quien: Autorizacion,
  institucionDelAula: string | null,
): Prisma.EjercicioWhereInput {
  const catalogo: Prisma.EjercicioWhereInput = {
    ambito: "MAESTRO",
    ...(quien.rol === "SUPERADMIN"
      ? {}
      : { OR: [{ institucionId: null }, { institucionId: institucionDelAula }] }),
  };
  const propio: Prisma.EjercicioWhereInput = { ambito: "DOCENTE", autorId: quien.usuarioId };
  return { OR: [catalogo, propio] };
}

/** El corte pedido por `?banco=`, como condición adicional. */
export function dondeFiltroBanco(
  filtro: FiltroBanco,
  quien: Autorizacion,
): Prisma.EjercicioWhereInput {
  switch (filtro) {
    case "maestro":
      return { ambito: "MAESTRO" };
    case "propio":
      // "Mi banco": el del que firma. Un SUPERADMIN que pide "propio" ve el
      // suyo, no todos los de la plataforma —para eso está no filtrar—.
      return { ambito: "DOCENTE", autorId: quien.usuarioId };
    case "borradores-ia":
      return { ambito: "DOCENTE", autorId: quien.usuarioId, origen: "IA", estado: "BORRADOR" };
  }
}

interface EjercicioParaPermiso {
  ambito: AmbitoContenido;
  autorId: string | null;
  institucionId: string | null;
}

/** ¿Puede `quien` VER este ejercicio concreto? (lectura de uno solo) */
export function puedeLeerEjercicio(quien: Autorizacion, e: EjercicioParaPermiso): boolean {
  if (quien.rol === "SUPERADMIN") return true;
  if (e.ambito === "DOCENTE") return e.autorId === quien.usuarioId;
  return e.institucionId === null || e.institucionId === quien.institucionId;
}

/**
 * ¿Puede `quien` MODIFICAR o BORRAR este ejercicio?
 *
 * Un ejercicio ajeno responde igual que uno inexistente (las rutas devuelven
 * 404, no 403): confirmarle a un docente que el id de otro docente existe ya
 * es información.
 */
export function puedeEscribirEjercicio(quien: Autorizacion, e: EjercicioParaPermiso): boolean {
  if (quien.rol === "SUPERADMIN") return true;
  if (e.ambito === "DOCENTE") return e.autorId === quien.usuarioId;
  return puedeEscribirEnInstitucion(quien, e.institucionId);
}

/**
 * En qué ámbito nace un ejercicio nuevo: el catálogo MAESTRO si lo crea un
 * SUPERADMIN, el banco privado en cualquier otro caso. El cliente NO lo elige:
 * un campo `ambito` en el cuerpo de la petición permitiría a cualquier docente
 * escribir directamente en el catálogo que ve todo el alumnado.
 */
export function ambitoParaCrear(quien: Autorizacion): AmbitoContenido {
  return quien.rol === "SUPERADMIN" ? "MAESTRO" : "DOCENTE";
}
