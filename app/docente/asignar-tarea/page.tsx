import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { FormularioTarea } from "@/components/docente/formulario-tarea";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Asignar tarea · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * /docente/asignar-tarea — programar una tarea para un aula (HITO 3).
 *
 * Se abre desde la tarjeta de un aula concreta (`?aulaId=…`) o, en frío, lo
 * mismo con la primera de la lista: el docente que llega aquí tiene al menos
 * una, o la pantalla se lo dice y le lleva a crear una.
 */
export default async function PaginaAsignarTarea({
  searchParams,
}: {
  searchParams: Promise<{ aulaId?: string }>;
}) {
  const { aulaId } = await searchParams;
  const sesion = await auth();

  const [aulas, temas] = await Promise.all([
    sesion?.user
      ? prisma.aula.findMany({
          where: { docenteId: sesion.user.id, activa: true },
          orderBy: [{ grado: "asc" }, { seccion: "asc" }],
          select: { id: true, nombre: true, grado: true, seccion: true },
        })
      : Promise.resolve([]),
    prisma.nodoConocimiento.findMany({
      where: { estado: "PUBLICADO" },
      orderBy: { titulo: "asc" },
      select: { id: true, titulo: true },
      take: 300,
    }),
  ]);

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Asignar tarea</h1>
          <p className="text-muted-foreground">
            Programa una tarea para un aula entera, con su plazo y cuántas veces se puede
            reintentar.
          </p>
        </div>

        <FormularioTarea aulas={aulas} temas={temas} aulaIdInicial={aulaId} />
      </main>
    </div>
  );
}
