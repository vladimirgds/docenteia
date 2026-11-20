import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { ETIQUETA_TIPO, type TipoProcedimiento } from "@/lib/docente/procedimientos";
import { dondeProcedimientosDelAlumno } from "@/lib/docente/procedimientos-servidor";

export const metadata: Metadata = { title: "Explicaciones · MentorIA Math" };
export const dynamic = "force-dynamic";

/** /estudiante/pizarra — lo que el alumno puede abrir en la pizarra. */
export default async function PaginaExplicaciones() {
  const sesion = await auth();
  const lista = sesion?.user?.id
    ? await prisma.procedimiento.findMany({
        where: dondeProcedimientosDelAlumno(sesion.user.id),
        orderBy: { actualizadoEn: "desc" },
        take: 100,
        select: { id: true, tipo: true, titulo: true, descripcion: true, nodo: { select: { titulo: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Explicaciones en la pizarra</h1>
        <p className="text-muted-foreground">
          Un profesor virtual te explica cada ejemplo paso a paso. Toca un término para oír qué significa y pide una pista cuando
          la necesites.
        </p>
      </div>
      {lista.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay explicaciones</CardTitle>
            <CardDescription>Cuando tu profesor publique una, aparecerá aquí.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lista.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">{p.titulo}</CardTitle>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Badge variant="contorno">{ETIQUETA_TIPO[p.tipo as TipoProcedimiento]}</Badge>
                  {p.nodo && <Badge variant="neutro">{p.nodo.titulo}</Badge>}
                </div>
                {p.descripcion && <CardDescription>{p.descripcion}</CardDescription>}
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild>
                  <Link href={`/estudiante/pizarra/${p.id}`}>Abrir</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
