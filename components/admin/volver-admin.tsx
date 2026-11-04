"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "Problema de navegación y consistencia en el Administrador" (observación
 * del cliente, cierre HITO 4): un SUPERADMIN que entra a /docente o /director
 * a PREVISUALIZAR esos paneles (desde "Panel Docente"/"Panel Directivo" en
 * `NavegacionAdmin`) pierde la barra de administración —esas pantallas usan
 * `NavegacionDocente`, pensada para quien de verdad es docente/director— y,
 * sin esto, no quedaba ningún acceso visible de vuelta salvo editar la URL.
 *
 * Se oculta sola dentro de `/admin` (ahí ya sobra: `NavegacionAdmin` cubre
 * lo mismo) y nunca aparece para un DOCENTE/DIRECTOR real, porque `Cabecera`
 * sólo la monta cuando `rol === "SUPERADMIN"`.
 */
export function VolverAdmin() {
  const ruta = usePathname();
  if (ruta.startsWith("/admin")) return null;

  return (
    <Link
      href="/admin"
      className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      ← Volver a Administración
    </Link>
  );
}
