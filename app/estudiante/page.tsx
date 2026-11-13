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
import { rachaDeDiasConsecutivos } from "@/lib/estudiante/racha";

export const metadata: Metadata = { title: "Mi progreso" };

export default async function PanelEstudiante() {
  const sesion = await auth();
  if (!sesion?.user?.perfilId) redirect("/login");

  const [perfil, progreso, fechasSesiones, notas] = await Promise.all([
    prisma.perfilEstudiante.findUnique({
      where: { id: sesion.user.perfilId },
      include: {
        historialNivel: { orderBy: { creadoEn: "desc" }, take: 5 },
        intentosDiagnostico: {
          orderBy: { iniciadoEn: "desc" },
          take: 1,
          include: { respuestas: true },
        },
      },
    }),
    // Racha de días consecutivos (HITO 4, 2.A): cualquier rastro de práctica
    // calificada cuenta, sin importar en qué lección ni tarea haya sido. El
    // mismo intento sirve para el % global de aciertos acumulado.
    prisma.registroProgreso.findMany({
      where: { perfilId: sesion.user.perfilId },
      select: { creadoEn: true, acierto: true },
    }),
    prisma.sesionAprendizaje.findMany({
      where: { perfilId: sesion.user.perfilId, finalizadaEn: { not: null } },
      select: { finalizadaEn: true },
    }),
    // "Promedio de notas acumulado" (HITO 4, 2.A): el puntaje de sus tareas
    // entregadas, no la tasa de aciertos de la práctica libre —son dos
    // señales distintas, como en el panel docente (aciertos vs. entrega)—.
    prisma.entregaTarea.aggregate({
      where: { estudianteId: sesion.user.id, puntaje: { not: null } },
      _avg: { puntaje: true },
    }),
  ]);

  if (!perfil) redirect("/login");

  const racha = rachaDeDiasConsecutivos([
    ...progreso.map((p) => p.creadoEn),
    ...fechasSesiones.map((s) => s.finalizadaEn as Date),
  ]);
  const leccionesCompletadas = fechasSesiones.length;
  const tasaAciertosGlobal =
    progreso.length === 0 ? null : Math.round((progreso.filter((p) => p.acierto).length / progreso.length) * 1000) / 10;
  const promedioDeNotas = notas._avg.puntaje == null ? null : Math.round(notas._avg.puntaje * 10) / 10;

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

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Racha de práctica</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {racha} día{racha === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {racha === 0
                ? "Practica hoy para empezar una racha."
                : `${leccionesCompletadas} lección${leccionesCompletadas === 1 ? "" : "es"} completada${leccionesCompletadas === 1 ? "" : "s"} en total.`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Aciertos acumulados</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {tasaAciertosGlobal == null ? "—" : `${tasaAciertosGlobal}%`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {tasaAciertosGlobal == null ? "Todavía no has practicado." : "De toda tu práctica calificada."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Promedio de notas</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {promedioDeNotas == null ? "—" : `${promedioDeNotas}/100`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {promedioDeNotas == null ? "Aún no tienes tareas calificadas." : "De tus tareas entregadas."}
            </p>
          </CardContent>
        </Card>

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
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Lecciones</CardTitle>
            <CardDescription>
              El tutor te explica el tema paso a paso en la pizarra, con voz, y
              después practicas con corrección inmediata.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button asChild size="lg">
              <Link href="/estudiante/leccion">Empezar una lección</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Tareas asignadas</CardTitle>
            <CardDescription>
              Lo que tu profesor te dejó, con su plazo y cuántos ejercicios tiene.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button asChild size="lg">
              <Link href="/estudiante/tareas">Ver mis tareas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
