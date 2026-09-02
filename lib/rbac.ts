import type { Rol } from "@prisma/client";

/**
 * Control de acceso basado en roles (RBAC).
 *
 * Cada usuario tiene exactamente un rol y ese rol decide a qué zona de la
 * aplicación entra. Esta tabla es la única fuente de verdad: la usa el
 * middleware para cortar la navegación y la usan las rutas de API para cortar
 * las peticiones. No se debe duplicar la lógica en ningún otro sitio.
 *
 * MVP 2. La jerarquía crece de tres perfiles a cuatro, porque la plataforma
 * pasa a venderse a colegios y aparece un mando intermedio:
 *
 *   ESTUDIANTE → aprende.
 *   DOCENTE    → escribe el currículo y sigue a sus alumnos.
 *   DIRECTOR   → supervisa el colegio: VE el currículo y los resultados, pero
 *                no los edita. Un director que pueda reescribir los temas de
 *                sus profesores convierte la autoría docente en una promesa
 *                condicional, que es justo lo contrario del HITO 1.
 *   SUPERADMIN → administra la plataforma, por encima de las instituciones.
 *                Es el ADMIN del PMV 1, con su nombre verdadero.
 */
export const ROLES = ["ESTUDIANTE", "DOCENTE", "DIRECTOR", "SUPERADMIN"] as const;

/** Zonas protegidas y roles admitidos en cada una. */
export const ZONAS: ReadonlyArray<{ prefijo: string; permite: readonly Rol[] }> = [
  { prefijo: "/estudiante", permite: ["ESTUDIANTE", "SUPERADMIN"] },
  // El director entra en la zona docente para SUPERVISAR: ve el currículo y el
  // panel, y lo que no puede hacer se lo impide `puedeEditarCurriculo`, no el
  // middleware. Cortarle la zona entera le dejaría sin nada que supervisar.
  { prefijo: "/docente", permite: ["DOCENTE", "DIRECTOR", "SUPERADMIN"] },
  { prefijo: "/admin", permite: ["SUPERADMIN"] },
];

/** Página de inicio de cada rol tras iniciar sesión. */
export const INICIO_POR_ROL: Record<Rol, string> = {
  ESTUDIANTE: "/estudiante",
  DOCENTE: "/docente",
  // El panel propio del director llega en el HITO 3 (supervisión institucional).
  // Hasta entonces aterriza en el panel docente, que es lo que puede supervisar.
  DIRECTOR: "/docente",
  SUPERADMIN: "/admin",
};

/** Devuelve la zona que cubre una ruta, o null si la ruta es pública. */
export function zonaDe(pathname: string) {
  return ZONAS.find(
    (z) => pathname === z.prefijo || pathname.startsWith(z.prefijo + "/"),
  );
}

/** ¿Puede este rol entrar en esta ruta? Las rutas públicas devuelven true. */
export function puedeAcceder(rol: Rol | undefined, pathname: string): boolean {
  const zona = zonaDe(pathname);
  if (!zona) return true;
  if (!rol) return false;
  return zona.permite.includes(rol);
}

/**
 * ¿Puede este rol CREAR o MODIFICAR contenido del currículo?
 *
 * Se separa de `puedeAcceder` a propósito: la lectura y la escritura del
 * currículo no coinciden en ningún rol salvo en los dos que lo escriben. Las
 * rutas de escritura de /api/docente/* la consultan antes de tocar la base de
 * datos, de modo que un DIRECTOR que fabrique la petición a mano se lleva un
 * 403 y no un currículo modificado.
 */
export function puedeEditarCurriculo(rol: Rol | undefined): boolean {
  return rol === "DOCENTE" || rol === "SUPERADMIN";
}

export function esRolValido(valor: unknown): valor is Rol {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor);
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  ESTUDIANTE: "Estudiante",
  DOCENTE: "Docente",
  DIRECTOR: "Director",
  SUPERADMIN: "Administrador de la plataforma",
};
