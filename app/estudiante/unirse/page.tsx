import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { UnirseAula } from "@/components/estudiante/unirse-aula";

export const metadata: Metadata = { title: "Unirme a mi clase" };
export const dynamic = "force-dynamic";

/**
 * /estudiante/unirse — matricularse en el aula de un docente (HITO 3).
 *
 * Sin Cabecera propia: `app/estudiante/layout.tsx` ya envuelve toda la zona
 * /estudiante con la suya. Ponerla aquí también la duplicaba en pantalla —dos
 * "MentorIA Math", dos "Salir"—, que es justo lo que capturó la revisión
 * visual antes de salir a producción.
 *
 * Entrada natural: un enlace que el docente comparte
 * (`/estudiante/unirse?codigo=XXXXXX`), con el código ya en la URL.
 */
export default async function PaginaUnirse({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const { codigo } = await searchParams;

  return (
    <div className="flex justify-center py-6">
      <UnirseAula codigoInicial={codigo} />
    </div>
  );
}
