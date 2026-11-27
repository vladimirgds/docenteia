import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { GestorHabilidades, type HabilidadVista } from "@/components/docente/gestor-habilidades";
import { prisma } from "@/lib/prisma";
import { autorizacionDeSesion } from "@/lib/docente/bancos";
import { SELECCION_HABILIDAD, dondeHabilidadesVisibles } from "@/lib/docente/habilidades-servidor";
import { dondeProcedimientosVisibles } from "@/lib/docente/procedimientos-servidor";
import { puedeEditarCurriculo } from "@/lib/rbac";

export const metadata: Metadata = { title: "Habilidades · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * /docente/habilidades — PMV 3 · H4: habilidades, prerrequisitos (sin ciclos),
 * el repaso de cada una y los ejercicios que la ejercitan.
 */
export default async function PaginaHabilidades() {
  const sesion = await auth();
  const quien = autorizacionDeSesion(sesion?.user);

  const [habilidades, repasos, ejercicios] = await Promise.all([
    prisma.habilidad.findMany({ where: dondeHabilidadesVisibles(quien), orderBy: { nombre: "asc" }, select: SELECCION_HABILIDAD, take: 500 }),
    prisma.procedimiento.findMany({
      where: { AND: [{ estado: "PUBLICADO" }, dondeProcedimientosVisibles(quien)] },
      orderBy: { titulo: "asc" },
      select: { id: true, titulo: true },
      take: 300,
    }),
    prisma.ejercicio.findMany({
      where: quien.rol === "SUPERADMIN" ? {} : { autorId: quien.usuarioId },
      orderBy: { creadoEn: "desc" },
      select: { id: true, enunciado: true, habilidadId: true },
      take: 300,
    }),
  ]);

  const vista: HabilidadVista[] = habilidades.map((h) => ({
    id: h.id,
    clave: h.clave,
    nombre: h.nombre,
    repasoId: h.repasoId,
    requiere: h.requiere.map((r) => r.requiereId),
    ejercicios: h._count.ejercicios,
  }));

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Habilidades</h1>
          <p className="text-muted-foreground">
            Qué habilidad ejercita cada ejercicio y qué necesita saberse antes. Cuando un alumno se bloquea, el tutor abre el repaso del
            prerrequisito más cercano y luego le devuelve al ejercicio. Un prerrequisito que cerrase un ciclo se rechaza.
          </p>
        </div>
        <GestorHabilidades habilidades={vista} repasos={repasos} ejercicios={ejercicios} puedeEditar={puedeEditarCurriculo(quien.rol)} />
      </main>
    </div>
  );
}
