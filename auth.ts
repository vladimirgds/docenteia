import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";

/** Esquema de las credenciales. Se valida antes de tocar la base de datos. */
const credencialesSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credenciales",
      credentials: {
        email: { label: "Correo electrónico", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(raw) {
        const parsed = credencialesSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Un fallo de infraestructura aquí acabaría mostrándose al usuario como
        // "correo o contraseña incorrectos", que es justo la pista equivocada.
        // No se puede cambiar lo que ve el usuario sin revelar si la cuenta
        // existe, pero sí se deja constancia inequívoca en el log del servidor.
        let usuario;
        try {
          usuario = await prisma.usuario.findUnique({
            where: { email },
            include: {
              perfilEstudiante: {
                select: { id: true, nivelActual: true },
              },
            },
          });
        } catch (e) {
          const infra = explicarFalloDeBaseDeDatos(e);
          console.error(
            `[auth] el inicio de sesión falló por la base de datos (${infra?.registro ?? "desconocido"}): ${infra?.mensaje ?? String(e)}`,
          );
          throw e;
        }

        // Se compara siempre contra un hash, exista el usuario o no, para que
        // el tiempo de respuesta no revele qué correos están registrados.
        const hash =
          usuario?.passwordHash ??
          "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduO";
        const coincide = await bcrypt.compare(password, hash);

        if (!usuario || !coincide || !usuario.activo) return null;

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.nombre,
          rol: usuario.rol,
          perfilId: usuario.perfilEstudiante?.id ?? null,
          nivelActual: usuario.perfilEstudiante?.nivelActual ?? null,
          // HITO 3: a qué colegio pertenece, si es DOCENTE o DIRECTOR. Viaja en
          // la sesión por la misma razón que `perfilId` —las rutas de
          // /api/docente/aulas y /api/director/resumen lo necesitan en cada
          // petición, y leerlo de la base en cada una sería una consulta de
          // más por petición que el token ya puede ahorrarse—.
          institucionId: usuario.institucionId ?? null,
        };
      },
    }),
  ],
});
