import type { NextAuthConfig } from "next-auth";

/**
 * Configuración compartida y APTA PARA EL RUNTIME EDGE.
 *
 * El middleware de Next.js corre en el edge, donde no existe el cliente de
 * Prisma ni bcrypt. Por eso la configuración se parte en dos: aquí queda todo
 * lo que el middleware necesita (páginas, callbacks de token) y en `auth.ts`
 * queda el proveedor Credentials, que sí toca la base de datos y sólo se
 * ejecuta en el runtime de Node.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  },
  trustHost: true,
  providers: [], // Se añaden en auth.ts (runtime de Node).
  callbacks: {
    // Se vuelca el rol y el perfil en el token la primera vez, y se refrescan
    // cuando la sesión se actualiza (p. ej. al terminar el diagnóstico, que
    // cambia el nivel del estudiante).
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.rol = user.rol;
        token.perfilId = user.perfilId;
        token.nivelActual = user.nivelActual;
        token.institucionId = user.institucionId;
      }
      if (trigger === "update" && session?.nivelActual !== undefined) {
        token.nivelActual = session.nivelActual;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.rol = token.rol;
        session.user.perfilId = token.perfilId;
        session.user.nivelActual = token.nivelActual;
        session.user.institucionId = token.institucionId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
