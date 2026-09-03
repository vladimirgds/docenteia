import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import {
  cursoValido,
  describirCurso,
  etapaPorValor,
  etiquetaCurso,
} from "@/lib/curriculo/etapas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El alumno declara su etapa educativa y su curso.
 *
 * Es el dato del que cuelga todo lo demás: qué contenidos existen para él y con
 * qué preguntas se le mide. Por eso se valida contra el catálogo de etapas y no
 * se acepta un curso cualquiera —un "7.º año de secundaria" no existe—, y por
 * eso se guarda también en texto legible: el panel docente enseña "Secundaria ·
 * 3.er Año" y no un enum con un número al lado.
 */
const peticionSchema = z.object({
  etapa: z.enum(["PRIMARIA", "SECUNDARIA", "SUPERIOR"]),
  curso: z.number().int().min(1).max(10),
});

export async function PUT(req: Request) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const perfilId = sesion.user.perfilId;
  if (!perfilId) {
    return NextResponse.json(
      { error: "Sólo un estudiante tiene nivel educativo que configurar." },
      { status: 403 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es JSON válido." },
      { status: 400 },
    );
  }

  const parsed = peticionSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Etapa o curso no válidos." }, { status: 400 });
  }
  const { etapa, curso } = parsed.data;

  // El rango depende de la etapa: primaria llega a 6.º, secundaria a 5.º y
  // superior a 10.º ciclo. Aceptar un 8.º de secundaria sería guardar un alumno
  // que no existe y dejarlo sin contenidos que le correspondan.
  if (!cursoValido(etapa, curso)) {
    const datos = etapaPorValor(etapa);
    return NextResponse.json(
      {
        error: `${datos?.nombre ?? "Esa etapa"} llega hasta ${datos?.cursos ?? "?"}.º ${datos?.unidad.toLowerCase() ?? "curso"}.`,
      },
      { status: 400 },
    );
  }

  try {
    const perfil = await prisma.perfilEstudiante.update({
      where: { id: perfilId },
      data: {
        etapa,
        curso,
        // Se conserva la versión legible para el panel docente y los informes.
        ciclo: etapaPorValor(etapa)?.nombre ?? null,
        grado: etiquetaCurso(etapa, curso) || null,
      },
      select: { etapa: true, curso: true },
    });

    return NextResponse.json({
      ok: true,
      etapa: perfil.etapa,
      curso: perfil.curso,
      descripcion: describirCurso(perfil.etapa, perfil.curso),
    });
  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    if (infra) {
      console.error(`[nivel-educativo] ${infra.registro}`);
      return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    }
    console.error("[nivel-educativo] fallo al guardar:", e);
    return NextResponse.json({ error: "No se pudo guardar tu nivel educativo." }, { status: 500 });
  }
}
