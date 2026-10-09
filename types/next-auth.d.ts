import type { Rol } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// El rol y el id del perfil viajan dentro del token de sesión, de modo que las
// comprobaciones de RBAC no necesitan ir a la base de datos en cada petición.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      rol: Rol;
      perfilId: string | null;
      nivelActual: string | null;
      /// A qué colegio pertenece (HITO 3). Sólo tiene sentido para DOCENTE y
      /// DIRECTOR; en los demás roles viaja en `null`.
      institucionId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    rol: Rol;
    perfilId: string | null;
    nivelActual: string | null;
    institucionId: string | null;
  }
}

// El callback `jwt` recibe `User | AdapterUser`, así que el tipo del adaptador
// necesita los mismos campos; sin esto, `user.rol` se ve como `unknown`.
declare module "next-auth/adapters" {
  interface AdapterUser {
    rol: Rol;
    perfilId: string | null;
    nivelActual: string | null;
    institucionId: string | null;
  }
}

// En NextAuth v5 el tipo del token que reciben los callbacks proviene de
// `@auth/core/jwt`; `next-auth/jwt` sólo lo reexporta. Hay que ampliar los dos:
// ampliar únicamente el reexport deja `token.id` como `unknown`.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    rol: Rol;
    perfilId: string | null;
    nivelActual: string | null;
    institucionId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    rol: Rol;
    perfilId: string | null;
    nivelActual: string | null;
    institucionId: string | null;
  }
}

export {};
