import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionAdmin } from "@/components/admin/navegacion";
import { GestorAulasAdmin, type AulaAdminVista } from "@/components/admin/gestor-aulas";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Aulas · Administración" };
export const dynamic = "force-dynamic";

/**
 * "/admin/aulas — vista maestra" (checklist actualizado de HITO 4): crear
 * aulas —sólo nombre, grado, sección e institución; el aula nace SIN
 * titular— y, por separado, asignar o cambiar el docente titular y
 * matricular alumnos directamente —ya no es el docente quien las crea, ver
 * `/docente/aulas`—.
 */
export default async function PaginaAulasAdmin() {
  const sesion = await auth();
  if (!sesion?.user || sesion.user.rol !== "SUPERADMIN") redirect("/login");

  const [aulas, instituciones, docentes] = await Promise.all([
    prisma.aula.findMany({
      orderBy: [{ institucion: { nombre: "asc" } }, { grado: "asc" }, { seccion: "asc" }],
      include: {
        institucion: { select: { nombre: true } },
        docente: { select: { nombre: true } },
        _count: { select: { matriculas: true, tareas: true } },
      },
      take: 2000,
    }),
    prisma.institucion.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    prisma.usuario.findMany({
      where: { rol: { in: ["DOCENTE", "DIRECTOR", "SUPERADMIN"] } },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  const aulasVista: AulaAdminVista[] = aulas.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    grado: a.grado,
    seccion: a.seccion,
    codigoAcceso: a.codigoAcceso,
    activa: a.activa,
    institucionId: a.institucionId,
    institucion: a.institucion.nombre,
    docenteId: a.docenteId,
    docente: a.docente?.nombre ?? null,
    matriculas: a._count.matriculas,
    tareas: a._count.tareas,
  }));

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionAdmin />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Aulas</h1>
          <p className="text-muted-foreground">
            Las aulas de TODA la plataforma, de cualquier colegio. Crear una y matricular alumnos es
            cosa del administrador; el docente titular sólo las visualiza.
          </p>
        </div>

        <GestorAulasAdmin aulas={aulasVista} instituciones={instituciones} docentes={docentes} />
      </main>
    </div>
  );
}
