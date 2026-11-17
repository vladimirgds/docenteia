import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { PizarraAlumno } from "@/components/pizarra/pizarra-alumno";
import { Badge } from "@/components/ui/badge";
import { procedimientoParaAlumno, vistaParaAlumno } from "@/lib/pizarra/servidor";

export const metadata: Metadata = { title: "Pizarra · MentorIA Math" };
export const dynamic = "force-dynamic";

/**
 * /estudiante/pizarra/[id] — la pizarra conversacional. Un procedimiento al que
 * el alumno no tiene acceso (privado de un docente cuya aula no pisa, o sin
 * publicar) da 404, igual que uno que no existe.
 */
export default async function PaginaPizarra({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  const { id } = await params;
  if (!sesion?.user?.id) notFound();

  const p = await procedimientoParaAlumno(id, sesion.user.id);
  if (!p) notFound();
  const vista = vistaParaAlumno(p);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/estudiante/pizarra" className="text-sm text-muted-foreground hover:underline">
            ← Todas las explicaciones
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{vista.titulo}</h1>
          {vista.descripcion && <p className="text-muted-foreground">{vista.descripcion}</p>}
        </div>
        {vista.verificado && <Badge variant="exito">Comprobado por el motor</Badge>}
      </div>
      <PizarraAlumno procedimiento={vista} />
    </div>
  );
}
