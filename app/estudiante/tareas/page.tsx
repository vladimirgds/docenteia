import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { estadoDeTarea, type EstadoTarea } from "@/lib/docente/aulas";

export const metadata: Metadata = { title: "Mis tareas" };
export const dynamic = "force-dynamic";

const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  pendiente: "Pendiente",
  entregada: "Entregada",
  vencida: "Vencida",
};

const VARIANTE_ESTADO: Record<EstadoTarea, "aviso" | "exito" | "error"> = {
  pendiente: "aviso",
  entregada: "exito",
  vencida: "error",
};

/**
 * /estudiante/tareas (HITO 3 — corrección QA): la lista que le faltaba al
 * alumno.
 *
 * Existía la ruta que las ASIGNA (`/docente/asignar-tarea`) y la que las
 * ENTREGA (`POST /api/estudiante/tareas/[id]/entregar`), pero ninguna
 * pantalla intermedia donde el alumno pudiera VERLAS: entraba directo a
 * `/estudiante/leccion` y ahí no hay ningún rastro de que el profesor le dejó
 * "5 ejercicios" en concreto —el QA del cliente lo capturó con la lección
 * mostrando el catálogo entero—. Esta pantalla es el punto de entrada: cada
 * tarjeta abre `/estudiante/leccion?tareaId=…`, que es quien de verdad acota
 * la práctica al cupo de la tarea.
 */
export default async function PaginaMisTareas() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const matriculas = await prisma.matricula.findMany({
    where: { estudianteId: sesion.user.id },
    select: { aulaId: true },
  });
  const aulaIds = matriculas.map((m) => m.aulaId);

  const tareas = aulaIds.length
    ? await prisma.tarea.findMany({
        where: { aulaId: { in: aulaIds } },
        orderBy: { fechaVencimiento: "asc" },
        include: {
          aula: { select: { nombre: true, grado: true, seccion: true } },
          entregas: { where: { estudianteId: sesion.user.id }, take: 1 },
        },
      })
    : [];

  const ahora = new Date();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mis tareas</h1>
        <p className="text-muted-foreground">
          Lo que tus profesores te asignaron, con su plazo y cuántos ejercicios tiene cada una.
        </p>
      </div>

      {tareas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no tienes ninguna tarea asignada. Cuando tu profesor te programe una, aparecerá
          aquí.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tareas.map((t) => {
            const entrega = t.entregas[0] ?? null;
            const estado = estadoDeTarea(t, entrega, ahora);
            return (
              <Card key={t.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{t.titulo}</CardTitle>
                    <Badge variant={VARIANTE_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>
                  </div>
                  <CardDescription>
                    {t.aula.grado}.º {t.aula.seccion} — {t.aula.nombre}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {t.descripcion && <p className="text-sm">{t.descripcion}</p>}
                  <p className="text-sm text-muted-foreground">
                    Vence el {t.fechaVencimiento.toLocaleDateString("es")} ·{" "}
                    {t.cantidadEjercicios} ejercicio{t.cantidadEjercicios === 1 ? "" : "s"}
                  </p>
                  {entrega?.puntaje != null && (
                    <p className="text-sm font-medium">Nota: {entrega.puntaje}/100</p>
                  )}
                  {estado === "vencida" ? (
                    <Button size="sm" disabled className="w-full">
                      Ya venció
                    </Button>
                  ) : estado === "entregada" ? (
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link href={`/estudiante/leccion?tareaId=${t.id}`}>Ver resultado</Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" className="w-full">
                      <Link href={`/estudiante/leccion?tareaId=${t.id}`}>
                        {(entrega?.intentosUsados ?? 0) > 0 ? "Continuar" : "Empezar"}
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
