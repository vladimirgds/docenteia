import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import {
  GestorCurriculo,
  type MateriaVista,
  type TemaVista,
} from "@/components/docente/gestor-curriculo";
import { prisma } from "@/lib/prisma";
import { puedeEditarCurriculo } from "@/lib/rbac";
import { SELECCION_TEMA } from "@/lib/docente/temas";
import type { Estado } from "@/lib/docente/curriculo";

export const metadata: Metadata = { title: "Currículo · Panel docente" };

// El temario cambia con cada edición, así que no se prerenderiza en el build.
export const dynamic = "force-dynamic";

/**
 * /docente/curriculo — administración del currículo (HITO 1).
 *
 * La página es un componente de servidor y lee la base directamente: el listado
 * inicial llega ya renderizado, sin un "cargando…" y sin una llamada de ida y
 * vuelta al montar. Las MODIFICACIONES sí van por /api/docente/*, que es la
 * superficie que el pliego pide y la que la batería de QA ejercita.
 *
 * Se muestran también los temas archivados: aquí es donde se decide qué se
 * recupera y qué no, y para eso hay que poder verlos.
 */
export default async function PaginaCurriculo() {
  const sesion = await auth();
  const puedeEditar = puedeEditarCurriculo(sesion?.user?.rol);

  const [materias, temas] = await Promise.all([
    prisma.materia.findMany({
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      include: { _count: { select: { temas: true } } },
    }),
    prisma.nodoConocimiento.findMany({
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: SELECCION_TEMA,
      take: 500,
    }),
  ]);

  const materiasVista: MateriaVista[] = materias.map((m) => ({
    id: m.id,
    codigo: m.codigo,
    nombre: m.nombre,
    descripcion: m.descripcion,
    color: m.color,
    orden: m.orden,
    activa: m.activa,
    temas: m._count.temas,
  }));

  const temasVista: TemaVista[] = temas.map((t) => ({
    id: t.id,
    clave: t.clave,
    titulo: t.titulo,
    descripcion: t.descripcion,
    motor: t.motor,
    nivel: t.nivel,
    etapa: t.etapa,
    cursoMin: t.cursoMin,
    orden: t.orden,
    estado: t.estado as Estado,
    etiquetas: t.etiquetas,
    objetivos: t.objetivos,
    padreId: t.padreId,
    materiaId: t.materiaId,
    materia: t.materia,
    autor: t.autor,
    reglas: t._count.reglas,
    ejercicios: t._count.ejercicios,
    hijos: t._count.hijos,
  }));

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Currículo</h1>
          <p className="text-muted-foreground">
            Asignaturas, temas y subtemas. Lo que publiques aquí es lo que verán tus alumnos en la
            lección.
          </p>
        </div>

        <GestorCurriculo
          materias={materiasVista}
          temas={temasVista}
          puedeEditar={puedeEditar}
        />
      </main>
    </div>
  );
}
