import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DESCRIPCION_NIVEL, ETIQUETA_NIVEL } from "@/lib/diagnostico/clasificar";

export const metadata: Metadata = { title: "Mi progreso" };

export default async function PanelEstudiante() {
  const sesion = await auth();
  if (!sesion?.user?.perfilId) redirect("/login");

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { id: sesion.user.perfilId },
    include: {
      historialNivel: { orderBy: { creadoEn: "desc" }, take: 5 },
      intentosDiagnostico: {
        orderBy: { iniciadoEn: "desc" },
        take: 1,
        include: { respuestas: true },
      },
    },
  });

  if (!perfil) redirect("/login");

  // Sin nivel asignado, lo único que toca es el diagnóstico.
  if (!perfil.nivelActual) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Hola, {sesion.user.name?.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground">
            Antes de empezar necesitamos saber de dónde partes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Evaluación diagnóstica</CardTitle>
            <CardDescription>
              Cinco preguntas, una por cada tema. No se puntúa para aprobar: sirve
              para ajustar las lecciones a tu nivel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg">
              <Link href="/estudiante/diagnostico">Empezar la evaluación</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ultimo = perfil.intentosDiagnostico[0];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Hola, {sesion.user.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          {perfil.ciclo || perfil.grado
            ? [perfil.ciclo, perfil.grado].filter(Boolean).join(" · ")
            : "Perfil académico sin ciclo ni grado indicados."}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Nivel asignado</CardDescription>
            <CardTitle className="text-3xl">
              {ETIQUETA_NIVEL[perfil.nivelActual]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {DESCRIPCION_NIVEL[perfil.nivelActual]}
            </p>
            {ultimo && (
              <p className="text-sm">
                Diagnóstico:{" "}
                <span className="font-medium">
                  {ultimo.aciertos} de {ultimo.totalPreguntas}
                </span>{" "}
                aciertos.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial de nivel</CardTitle>
            <CardDescription>
              Cada cambio queda registrado con su motivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {perfil.historialNivel.map((h) => (
                <li key={h.id} className="flex justify-between gap-4">
                  <span>
                    {h.nivelAnterior
                      ? `${ETIQUETA_NIVEL[h.nivelAnterior]} → ${ETIQUETA_NIVEL[h.nivelNuevo]}`
                      : ETIQUETA_NIVEL[h.nivelNuevo]}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {h.creadoEn.toLocaleDateString("es")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lecciones</CardTitle>
            <CardDescription>
              El tutor te explica el tema paso a paso en la pizarra, con voz, y
              después practicas con corrección inmediata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg">
              <Link href="/estudiante/leccion">Empezar una lección</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tareas asignadas</CardTitle>
            <CardDescription>
              Lo que tu profesor te dejó, con su plazo y cuántos ejercicios tiene.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg" variant="outline">
              <Link href="/estudiante/tareas">Ver mis tareas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
