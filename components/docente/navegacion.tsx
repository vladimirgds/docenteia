"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Barra de secciones del panel docente.
 *
 * El PMV 1 tenía una sola pantalla y no necesitaba navegación. El HITO 1 añade
 * tres, y sin un sitio desde el que saltar entre ellas el docente tendría que
 * volver al panel cada vez o escribir la URL a mano.
 */
const SECCIONES = [
  { href: "/docente", titulo: "Panel", exacta: true },
  { href: "/docente/curriculo", titulo: "Currículo" },
  { href: "/docente/crear-tema", titulo: "Crear tema" },
  { href: "/docente/ejercicios", titulo: "Ejercicios" },
];

export function NavegacionDocente() {
  const ruta = usePathname();

  return (
    <nav className="border-b bg-muted/30">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6">
        {SECCIONES.map((s) => {
          const activa = s.exacta ? ruta === s.href : ruta.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              // El subrayado marca dónde está uno. Se usa `aria-current` además
              // del color porque el color solo no llega a un lector de pantalla.
              aria-current={activa ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                activa
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.titulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
