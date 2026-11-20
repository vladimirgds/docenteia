import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { PizarraPrevia } from "@/components/pizarra/pizarra-previa";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { autorizacionDeSesion } from "@/lib/docente/bancos";
import { leerPasos, leerPreguntas } from "@/lib/docente/procedimientos";
import { SELECCION_PROCEDIMIENTO, dondeProcedimientosVisibles } from "@/lib/docente/procedimientos-servidor";

export const metadata: Metadata = { title: "Vista previa · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * /docente/procedimientos/[id]/previa — el docente PRUEBA su procedimiento tal
 * como lo verá el alumno, antes de publicarlo: pizarra, profesor 3D, láser,
 * términos tocables y preguntas. No registra nada.
 */
export default async function PaginaPrevia({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  const { id } = await params;
  const quien = autorizacionDeSesion(sesion?.user);
  const p = await prisma.procedimiento.findFirst({
    where: { AND: [{ id }, dondeProcedimientosVisibles(quien)] },
    select: SELECCION_PROCEDIMIENTO,
  });
  if (!p) notFound();

  const preguntas = leerPreguntas(p.preguntas);
  const vista = {
    id: p.id,
    tipo: p.tipo,
    titulo: p.titulo,
    descripcion: p.descripcion,
    ejemplo: p.ejemplo,
    tema: p.nodo ? { id: p.nodo.id, titulo: p.nodo.titulo } : null,
    pasos: leerPasos(p.pasos),
    preguntas: preguntas.map((q) => ({
      enunciado: q.enunciado,
      verificable: Boolean(q.respuesta?.trim()),
      pistas: (q.pistas ?? []).length,
    })),
    pistas: p.pistas.length,
  };

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-4 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href="/docente/procedimientos" className="text-sm text-muted-foreground hover:underline">
              ← Volver al editor
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Vista previa: {p.titulo}</h1>
            <p className="text-muted-foreground">Así lo verá el alumno. Aquí no se registra nada.</p>
          </div>
          <div className="flex gap-1">
            <Badge variant={p.verificado ? "exito" : "aviso"}>{p.verificado ? "Verificado" : "Sin verificar"}</Badge>
            <Badge variant="neutro">{p.estado === "PUBLICADO" ? "Publicado" : "Borrador"}</Badge>
          </div>
        </div>
        <PizarraPrevia
          procedimiento={vista}
          respuestas={preguntas.map((q) => q.respuesta ?? null)}
          pistas={preguntas.map((q) => (q.pistas && q.pistas.length > 0 ? q.pistas : p.pistas))}
        />
      </main>
    </div>
  );
}
