import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { TEMA_POR_CLAVE } from "@/lib/leccion/temas";
import { puedeAbrirTema } from "@/lib/leccion/disponibles";
import { cursoDelPerfil } from "@/lib/curriculo/etapas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sesiones de aprendizaje (Módulos 2, 6 y 11).
 *
 * Cada lección que abre un estudiante queda registrada en PostgreSQL. Es lo que
 * permite que el sistema reconozca por dónde va el alumno en lugar de arrancar
 * siempre con el mismo diálogo introductorio, y lo que alimentará las métricas
 * del panel docente.
 */
const inicioSchema = z.object({
  tema: z.string().min(1).max(60),
  /** Nivel de dificultad con el que se abre, si se está retomando. */
  nivel: z.enum(["BASICO", "INTERMEDIO", "AVANZADO"]).optional(),
});

/** POST: abre una sesión y devuelve su id. */
export async function POST(req: Request) {
  const sesion = await auth();
  const perfilId = sesion?.user?.perfilId;
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  // Un docente o un administrador pueden abrir la lección para verla; en ese
  // caso no hay perfil de estudiante y no se registra nada. No es un error.
  if (!perfilId) return NextResponse.json({ sesionId: null });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido." }, { status: 400 });
  }

  const parsed = inicioSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }

  const temaEnum = TEMA_POR_CLAVE[parsed.data.tema.toLowerCase()];
  if (!temaEnum) {
    return NextResponse.json({ error: "Tema desconocido." }, { status: 400 });
  }

  // ── El tema tiene que corresponderle ──────────────────────────────────────
  // La pantalla ya no le ofrece las tarjetas que no son de su curso, pero una
  // comprobación que sólo vive en la interfaz no es una comprobación: basta con
  // repetir la petición a mano para saltarla. Aquí se cierra de verdad.
  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { id: perfilId },
    select: { etapa: true, curso: true, ciclo: true, grado: true },
  });
  if (!(await puedeAbrirTema(cursoDelPerfil(perfil ?? {}), temaEnum))) {
    return NextResponse.json(
      {
        error:
          "Ese tema no corresponde a tu curso. Elige uno de los que aparecen en tu lección.",
      },
      { status: 403 },
    );
  }

  try {
    const creada = await prisma.sesionAprendizaje.create({
      data: {
        perfilId,
        tema: temaEnum,
        nivelEnSesion: parsed.data.nivel ?? null,
      },
      select: { id: true },
    });
    return NextResponse.json({ sesionId: creada.id });
  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    console.error(`[sesion] no se pudo abrir la sesión: ${infra?.registro ?? e}`);
    // Que no se pueda registrar el avance NO debe impedir dar la clase.
    return NextResponse.json({ sesionId: null });
  }
}

const cierreSchema = z.object({ sesionId: z.string().min(1).max(40) });

/** PATCH: cierra la sesión al terminar la lección. */
export async function PATCH(req: Request) {
  const sesion = await auth();
  const perfilId = sesion?.user?.perfilId;
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!perfilId) return NextResponse.json({ ok: true });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido." }, { status: 400 });
  }

  const parsed = cierreSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }

  try {
    // El filtro por perfil no es decorativo: sin él, cualquiera podría cerrar
    // la sesión de otro alumno enviando su identificador.
    await prisma.sesionAprendizaje.updateMany({
      where: { id: parsed.data.sesionId, perfilId },
      data: { finalizadaEn: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    console.error(`[sesion] no se pudo cerrar la sesión: ${infra?.registro ?? e}`);
    return NextResponse.json({ ok: true });
  }
}
