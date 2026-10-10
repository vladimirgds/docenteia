import { headers } from "next/headers";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { GestorAulas, type AulaVista } from "@/components/docente/gestor-aulas";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Aulas · Panel docente" };

// Las matrículas cambian con cada alumno que se une, así que no se prerenderiza.
export const dynamic = "force-dynamic";

/**
 * /docente/aulas — Arquitectura multi-tenant (HITO 3).
 *
 * Cada aula es un grado y una sección con su código de matrícula propio: desde
 * aquí el docente las crea, reparte el código y entra a programarles tareas.
 * Mismo patrón que `/docente/curriculo`: el listado inicial llega ya
 * renderizado desde el servidor, y las modificaciones van por
 * `/api/docente/aulas`, que es la superficie que ejercita la batería de QA.
 */
export default async function PaginaAulas() {
  const sesion = await auth();

  const aulas = sesion?.user
    ? await prisma.aula.findMany({
        where: { docenteId: sesion.user.id },
        orderBy: [{ grado: "asc" }, { seccion: "asc" }],
        include: { _count: { select: { matriculas: true, tareas: true } } },
      })
    : [];

  const aulasVista: AulaVista[] = aulas.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    grado: a.grado,
    seccion: a.seccion,
    codigoAcceso: a.codigoAcceso,
    activa: a.activa,
    matriculas: a._count.matriculas,
    tareas: a._count.tareas,
  }));

  // El enlace de matrícula necesita el origen absoluto: `/estudiante/unirse`
  // se comparte por WhatsApp o correo, fuera del navegador del docente, así
  // que una ruta relativa no sirve.
  const cabeceras = await headers();
  const protocolo = cabeceras.get("x-forwarded-proto") ?? "http";
  const host = cabeceras.get("host") ?? "localhost:3000";
  const baseUrl = `${protocolo}://${host}`;

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Aulas</h1>
          <p className="text-muted-foreground">
            Organiza a tus alumnos por grado y sección, y comparte el código con el que se
            matriculan.
          </p>
        </div>

        <GestorAulas aulas={aulasVista} baseUrl={baseUrl} />
      </main>
    </div>
  );
}
