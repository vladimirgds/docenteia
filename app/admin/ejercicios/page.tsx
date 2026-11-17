import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionAdmin } from "@/components/admin/navegacion";
import {
  GestorEjercicios,
  type EjercicioVista,
  type ParametroFormulario,
  type TemaOpcion,
} from "@/components/docente/gestor-ejercicios";
import { prisma } from "@/lib/prisma";
import { SELECCION_EJERCICIO } from "@/lib/docente/ejercicios";
import type { Estado } from "@/lib/docente/curriculo";

export const metadata: Metadata = { title: "Ejercicios · Administración" };
export const dynamic = "force-dynamic";

/**
 * "3.A Mantenimiento de Ejercicios" (HITO 4 — cierre PMV2): "tabla con
 * buscador por enunciado, tema y nivel de dificultad… ver detalle, desactivar
 * y eliminación controlada".
 *
 * Reutiliza `GestorEjercicios` —el mismo componente de `/docente/ejercicios`,
 * 970 líneas ya probadas— tal cual: el banco de ejercicios es UN banco
 * compartido por toda la plataforma, no uno por docente —ni esa página ni
 * `GET /api/docente/ejercicios` filtran por autor—, así que no hay nada que
 * construir de nuevo aparte de la propia pantalla. `SUPERADMIN` ya tenía
 * permiso de lectura y escritura sobre esas rutas desde antes de este hito
 * (`exigirDocente`/`puedeEditarCurriculo`, en `lib/docente/api.ts` /
 * `lib/rbac.ts`); lo que faltaba era un sitio desde el que llegar a ellas sin
 * pasar por la zona /docente.
 */
export default async function PaginaEjerciciosAdmin() {
  const sesion = await auth();
  if (!sesion?.user || sesion.user.rol !== "SUPERADMIN") redirect("/login");

  const [temas, ejercicios] = await Promise.all([
    prisma.nodoConocimiento.findMany({
      where: { estado: { not: "ARCHIVADO" } },
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: {
        id: true,
        titulo: true,
        motor: true,
        estado: true,
        nivel: true,
        etapa: true,
        cursoMin: true,
      },
      take: 500,
    }),
    prisma.ejercicio.findMany({
      orderBy: [{ actualizadoEn: "desc" }],
      select: SELECCION_EJERCICIO,
      take: 500,
    }),
  ]);

  const temasVista: TemaOpcion[] = temas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    motor: t.motor,
    estado: t.estado as Estado,
    nivel: t.nivel,
    etapa: t.etapa,
    cursoMin: t.cursoMin,
  }));

  const ejerciciosVista: EjercicioVista[] = ejercicios.map((e) => ({
    id: e.id,
    enunciado: e.enunciado,
    respuestaCorrecta: e.respuestaCorrecta,
    respuestaFormula: e.respuestaFormula,
    plantilla: e.plantilla,
    parametros: Array.isArray(e.parametros) ? (e.parametros as unknown as ParametroFormulario[]) : [],
    pistas: e.pistas,
    nivel: e.nivel,
    motor: e.motor,
    etapa: e.etapa,
    cursoMin: e.cursoMin,
    estado: e.estado as Estado,
    origen: e.origen,
    validado: e.validado,
    nodoId: e.nodoId,
    nodo: e.nodo,
    autor: e.autor,
    institucionId: e.institucionId,
    ambito: e.ambito,
    revisadoEn: e.revisadoEn ? e.revisadoEn.toISOString() : null,
  }));

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionAdmin />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Ejercicios</h1>
          <p className="text-muted-foreground">
            El banco de ejercicios de TODA la plataforma, de cualquier docente e institución.
            Desactivar o eliminar un ejercicio aquí lo afecta en todas las aulas donde esté en uso.
          </p>
        </div>

        <GestorEjercicios temas={temasVista} ejercicios={ejerciciosVista} puedeEditar rol="SUPERADMIN" />
      </main>
    </div>
  );
}
