import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";

export const runtime = "nodejs";

/**
 * Alta de estudiantes.
 *
 * Decisión de seguridad: este endpoint es público y crea SIEMPRE usuarios con
 * rol ESTUDIANTE. El rol no se acepta desde el cuerpo de la petición, porque un
 * registro público que permita elegir "SUPERADMIN" es una escalada de privilegios
 * servida en bandeja. Los perfiles DOCENTE, DIRECTOR y SUPERADMIN los crea un administrador
 * (y el primero de todos, la semilla: `npm run db:seed`).
 */
const registroSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es demasiado corto").max(120),
  email: z.string().email("Correo electrónico no válido").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(200),
  ciclo: z.string().trim().max(80).optional().or(z.literal("")),
  grado: z.string().trim().max(80).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es JSON válido." },
      { status: 400 },
    );
  }

  const parsed = registroSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos de registro no válidos.",
        detalles: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { nombre, email, password, ciclo, grado } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    // El usuario y su perfil académico se crean en la misma operación: un
    // estudiante sin perfil no podría hacer el diagnóstico.
    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash,
        rol: "ESTUDIANTE",
        perfilEstudiante: {
          create: {
            ciclo: ciclo || null,
            grado: grado || null,
            metadatos: {},
          },
        },
      },
      select: { id: true, email: true, nombre: true, rol: true },
    });

    return NextResponse.json({ ok: true, usuario }, { status: 201 });
  } catch (e) {
    // P2002 = violación de índice único; aquí sólo puede ser el correo.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese correo electrónico." },
        { status: 409 },
      );
    }

    // Un fallo de infraestructura (tablas sin crear, base inalcanzable) NO es
    // un "inténtalo de nuevo": reintentar no lo arregla y deja a quien
    // despliega sin saber qué mirar. Se distingue y se dice qué falta.
    const infra = explicarFalloDeBaseDeDatos(e);
    if (infra) {
      console.error("[registro] problema de base de datos:", infra.registro, e);
      return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    }

    console.error("[registro] fallo al crear el usuario:", e);
    return NextResponse.json(
      { error: "No se pudo completar el registro. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
