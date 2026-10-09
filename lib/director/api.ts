import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * Lo que comparten las rutas de /api/director: quién entra y a qué colegio
 * pertenece. Mismo papel que `exigirDocente` en `lib/docente/api.ts`, para el
 * panel institucional del HITO 3.
 */
export interface AutorizacionDirector {
  usuarioId: string;
  institucionId: string;
}

type Resultado =
  | { ok: true; quien: AutorizacionDirector }
  | { ok: false; respuesta: NextResponse };

/**
 * Exige sesión de DIRECTOR (o SUPERADMIN, que entra en toda zona) CON un
 * colegio asignado.
 *
 * Lo segundo no es un detalle: el resumen institucional no tiene sentido sin
 * institución, y devolverlo vacío en silencio —en vez de decir que falta
 * asignar el colegio— dejaría al director pensando que su colegio no tiene
 * ni un aula, que es una conclusión muy distinta de "tu cuenta todavía no
 * está vinculada a ningún colegio".
 */
export async function exigirDirector(): Promise<Resultado> {
  const sesion = await auth();
  const usuario = sesion?.user;

  if (!usuario) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: "No autenticado." }, { status: 401 }),
    };
  }

  if (usuario.rol !== "DIRECTOR" && usuario.rol !== "SUPERADMIN") {
    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: "Sólo un director puede ver el panel institucional." },
        { status: 403 },
      ),
    };
  }

  if (!usuario.institucionId) {
    return {
      ok: false,
      respuesta: NextResponse.json(
        {
          error:
            "Tu cuenta todavía no está asignada a ningún colegio. Pide al administrador que te vincule a uno.",
        },
        { status: 409 },
      ),
    };
  }

  return {
    ok: true,
    quien: { usuarioId: usuario.id, institucionId: usuario.institucionId },
  };
}
