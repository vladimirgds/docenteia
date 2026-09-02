import { NextResponse } from "next/server";
import type { Rol } from "@prisma/client";
import type { z, ZodTypeAny } from "zod";

import { auth } from "@/auth";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { puedeEditarCurriculo } from "@/lib/rbac";

/**
 * Lo que comparten todas las rutas de /api/docente: quién entra, qué llega y
 * qué se responde cuando algo falla.
 *
 * Existe para que las siete rutas del HITO 1 no repitan siete veces las mismas
 * quince líneas de sesión, parseo y traducción de errores. La repetición no es
 * sólo fea: es donde aparecen los agujeros. Basta con que UNA ruta olvide
 * comprobar el rol para que el control de acceso deje de existir en la
 * práctica, y revisar eso en siete sitios es peor que revisarlo en uno.
 */

export interface Autorizacion {
  usuarioId: string;
  rol: Rol;
  nombre: string;
}

type Resultado =
  | { ok: true; quien: Autorizacion }
  | { ok: false; respuesta: NextResponse };

/**
 * Exige sesión y, opcionalmente, permiso de ESCRITURA sobre el currículo.
 *
 * La distinción importa: el middleware ya deja entrar a DIRECTOR en la zona
 * /docente para que pueda supervisar, así que sin esta segunda comprobación un
 * director podría editar el currículo llamando a la API directamente, saltándose
 * la interfaz que no le ofrece el botón. La regla de negocio no puede vivir en
 * un botón.
 */
export async function exigirDocente({ escritura = false } = {}): Promise<Resultado> {
  const sesion = await auth();
  const usuario = sesion?.user;

  if (!usuario) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: "No autenticado." }, { status: 401 }),
    };
  }

  const permitido = escritura
    ? puedeEditarCurriculo(usuario.rol)
    : usuario.rol === "DOCENTE" || usuario.rol === "DIRECTOR" || usuario.rol === "SUPERADMIN";

  if (!permitido) {
    return {
      ok: false,
      respuesta: NextResponse.json(
        {
          error: escritura
            ? "Tu perfil puede consultar el currículo, pero no modificarlo."
            : "Tu perfil no tiene acceso al currículo.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    quien: { usuarioId: usuario.id, rol: usuario.rol, nombre: usuario.name ?? "" },
  };
}

type Cuerpo<T> = { ok: true; datos: T } | { ok: false; respuesta: NextResponse };

/**
 * Lee el cuerpo JSON y lo valida con su esquema.
 *
 * Los fallos de forma se devuelven con el detalle de zod por campo, que es lo
 * que el formulario necesita para señalar DÓNDE está el problema. Un 400 con
 * "petición no válida" y nada más obliga al docente a adivinar.
 */
export async function leerCuerpo<E extends ZodTypeAny>(
  req: Request,
  esquema: E,
): Promise<Cuerpo<z.infer<E>>> {
  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: "El cuerpo de la petición no es JSON válido." },
        { status: 400 },
      ),
    };
  }

  const parsed = esquema.safeParse(crudo);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    // El primer mensaje concreto va en `error` para poder enseñarlo tal cual;
    // el desglose completo viaja aparte, para marcar los campos.
    const primero =
      Object.values(flat.fieldErrors).flat().find(Boolean) ??
      flat.formErrors[0] ??
      "Revisa los datos del formulario.";
    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: primero, detalles: flat },
        { status: 400 },
      ),
    };
  }

  return { ok: true, datos: parsed.data };
}

/**
 * Traduce un fallo inesperado a una respuesta HTTP honesta.
 *
 * Los fallos de infraestructura ya los explica `explicarFalloDeBaseDeDatos` con
 * el paso que falta (migraciones sin aplicar, credenciales, base inalcanzable).
 * Lo que no se reconoce se devuelve como 500 genérico —sin filtrar la excepción
 * al cliente— pero se registra entero en el log del servidor, que es donde hace
 * falta para diagnosticarlo.
 */
export function fallo(e: unknown, contexto: string): NextResponse {
  const infra = explicarFalloDeBaseDeDatos(e);
  if (infra) {
    console.error(`[${contexto}] ${infra.registro}`);
    return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
  }
  console.error(`[${contexto}] fallo no previsto:`, e);
  return NextResponse.json(
    { error: "No se pudo completar la operación. Vuelve a intentarlo." },
    { status: 500 },
  );
}

/** Un 404 con el mismo texto en todas las rutas. */
export function noEncontrado(que: string): NextResponse {
  return NextResponse.json({ error: `${que} no existe o ya se ha eliminado.` }, { status: 404 });
}

/** Un 409: el conflicto que sí tiene arreglo por parte de quien llama. */
export function conflicto(mensaje: string): NextResponse {
  return NextResponse.json({ error: mensaje }, { status: 409 });
}
