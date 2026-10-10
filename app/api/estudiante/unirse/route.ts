import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { unirseSchema } from "@/lib/docente/aulas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EL ALUMNO SE MATRICULA CON UN CÓDIGO (HITO 3).
 *
 * El código lo reparte el docente —de la pizarra del aula física, o por
 * enlace `/estudiante/unirse?codigo=…`—. Aquí sólo se valida y se crea la
 * matrícula; la jerarquía entera (colegio, aula, docente) ya existe, el
 * alumno se limita a engancharse a ella.
 */
export async function POST(req: Request) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return NextResponse.json(
      { error: "Sólo un alumno puede matricularse en un aula." },
      { status: 403 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }

  const parsed = unirseSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Código no válido." },
      { status: 400 },
    );
  }

  try {
    const aula = await prisma.aula.findUnique({
      where: { codigoAcceso: parsed.data.codigoAcceso },
      include: { institucion: { select: { nombre: true } }, docente: { select: { nombre: true } } },
    });

    if (!aula || !aula.activa) {
      return NextResponse.json(
        { error: "Ese código no corresponde a ningún aula activa. Revísalo con tu profesor." },
        { status: 404 },
      );
    }

    const yaMatriculado = await prisma.matricula.findUnique({
      where: { aulaId_estudianteId: { aulaId: aula.id, estudianteId: sesion.user.id } },
    });
    if (yaMatriculado) {
      return NextResponse.json(
        { error: "Ya estás matriculado en esta aula." },
        { status: 409 },
      );
    }

    await prisma.matricula.create({
      data: { aulaId: aula.id, estudianteId: sesion.user.id },
    });

    return NextResponse.json(
      {
        ok: true,
        aula: {
          nombre: aula.nombre,
          grado: aula.grado,
          seccion: aula.seccion,
          institucion: aula.institucion.nombre,
          docente: aula.docente.nombre,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    if (infra) {
      console.error(`[estudiante/unirse] ${infra.registro}`);
      return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    }
    console.error("[estudiante/unirse] fallo al matricular:", e);
    return NextResponse.json({ error: "No se pudo completar la matrícula." }, { status: 500 });
  }
}
