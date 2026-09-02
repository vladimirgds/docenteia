import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import {
  FormularioTema,
  type ReglaFormulario,
  type TemaEdicion,
} from "@/components/docente/formulario-tema";
import { prisma } from "@/lib/prisma";
import { puedeEditarCurriculo } from "@/lib/rbac";
import { descendientesDe, type Estado, type TipoRegla } from "@/lib/docente/curriculo";

export const metadata: Metadata = { title: "Crear tema · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * /docente/crear-tema — alta y edición de un tema con sus reglas.
 *
 * La misma ruta sirve para las dos cosas: con `?id=` edita y sin él crea. Es
 * deliberado, porque el formulario es idéntico y mantener dos pantallas gemelas
 * garantiza que una de las dos se quede atrás.
 *
 * Aquí se calcula además qué temas pueden ser padre del que se edita: ni él
 * mismo ni ninguno de sus descendientes, o el árbol quedaría en bucle. El
 * servidor vuelve a comprobarlo al guardar —la interfaz puede saltarse— pero
 * ofrecer una opción imposible es un fallo de diseño por sí mismo.
 */
export default async function PaginaCrearTema({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const sesion = await auth();
  const puedeEditar = puedeEditarCurriculo(sesion?.user?.rol);

  const [materias, todos, tema] = await Promise.all([
    prisma.materia.findMany({
      where: { activa: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true },
    }),
    prisma.nodoConocimiento.findMany({
      where: { estado: { not: "ARCHIVADO" } },
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: { id: true, titulo: true, padreId: true },
      take: 500,
    }),
    id
      ? prisma.nodoConocimiento.findUnique({
          where: { id },
          include: { reglas: { orderBy: { orden: "asc" } } },
        })
      : null,
  ]);

  const prohibidos = tema ? new Set([tema.id, ...descendientesDe(todos, tema.id)]) : new Set<string>();
  const posiblesPadres = todos
    .filter((t) => !prohibidos.has(t.id))
    .map((t) => ({ id: t.id, titulo: t.titulo }));

  const temaVista: TemaEdicion | null = tema
    ? {
        id: tema.id,
        clave: tema.clave,
        titulo: tema.titulo,
        descripcion: tema.descripcion,
        materiaId: tema.materiaId,
        padreId: tema.padreId,
        motor: tema.motor,
        nivel: tema.nivel,
        orden: tema.orden,
        estado: tema.estado as Estado,
        objetivos: tema.objetivos,
        etiquetas: tema.etiquetas,
        reglas: tema.reglas.map(
          (r): ReglaFormulario => ({
            id: r.id,
            tipo: r.tipo as TipoRegla,
            nombre: r.nombre,
            enunciado: r.enunciado,
            descripcion: r.descripcion,
            ejemplo: r.ejemplo ?? "",
            nivel: r.nivel ?? "",
            practicable: r.practicable,
          }),
        ),
      }
    : null;

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {temaVista ? "Editar tema" : "Crear tema"}
          </h1>
          <p className="text-muted-foreground">
            Define el tema, su lugar en el temario y las reglas que el tutor explicará antes de
            practicar.
          </p>
        </div>

        {id && !temaVista ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Ese tema no existe o ya se ha borrado.
          </div>
        ) : (
          <FormularioTema
            materias={materias}
            posiblesPadres={posiblesPadres}
            tema={temaVista}
            puedeEditar={puedeEditar}
          />
        )}
      </main>
    </div>
  );
}
