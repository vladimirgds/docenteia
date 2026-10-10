import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { obtenerResumenInstitucional } from "@/lib/director/datos";

export const metadata: Metadata = { title: "Panel institucional" };
export const dynamic = "force-dynamic";

/**
 * /director — PANEL INSTITUCIONAL (HITO 3).
 *
 * «Vista protegida exclusiva para usuarios con role === DIRECTOR.» El
 * middleware ya corta el acceso por zona (`lib/rbac.ts`); aquí además se
 * comprueba que la cuenta tenga un colegio asignado, porque sin institución
 * no hay nada que resumir —y decirlo es mejor que enseñar una tabla vacía
 * que parece un colegio sin una sola aula—.
 *
 * El cálculo en sí —qué cuenta como "esperado" y cómo sale la tasa de
 * entrega— vive en `lib/director/resumen.ts`, separado de esta consulta y
 * comprobado aparte con datos de mentira (ver qa/hito3.mjs).
 */
export default async function PaginaDirector() {
  const sesion = await auth();
  const institucionId = sesion?.user?.institucionId ?? null;

  if (!institucionId) {
    return (
      <div className="min-h-screen">
        <Cabecera />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <Card>
            <CardHeader>
              <CardTitle>Sin colegio asignado</CardTitle>
              <CardDescription>
                Tu cuenta de director todavía no está vinculada a ningún colegio. Pide al
                administrador de la plataforma que te asigne uno para ver aquí sus cifras.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const [institucion, resumen] = await Promise.all([
    prisma.institucion.findUnique({ where: { id: institucionId }, select: { nombre: true } }),
    obtenerResumenInstitucional(institucionId),
  ]);

  return (
    <div className="min-h-screen">
      <Cabecera />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Panel institucional</h1>
          <p className="text-muted-foreground">{institucion?.nombre ?? "Tu colegio"}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total alumnos</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{resumen.totalAlumnos}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total aulas</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{resumen.totalAulas}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Docentes activos</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{resumen.totalDocentes}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Aulas del colegio</CardTitle>
            <CardDescription>
              Grado y sección, docente a cargo, alumnos matriculados y tareas entregadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resumen.aulas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay aulas en este colegio. Un docente las crea desde su panel.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Aula</th>
                      <th className="py-2 pr-4 font-medium">Docente a cargo</th>
                      <th className="py-2 pr-4 font-medium">Alumnos</th>
                      <th className="py-2 pr-4 font-medium">Tareas</th>
                      <th className="py-2 pr-4 font-medium">Entregas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.aulas.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4">
                          <span className="font-medium">
                            {a.grado}.º {a.seccion}
                          </span>{" "}
                          <span className="text-muted-foreground">— {a.nombre}</span>
                        </td>
                        <td className="py-2.5 pr-4">{a.docenteNombre}</td>
                        <td className="py-2.5 pr-4">{a.matriculas}</td>
                        <td className="py-2.5 pr-4">{a.tareasCreadas}</td>
                        <td className="py-2.5 pr-4">
                          {a.tasaEntrega === null ? (
                            <Badge variant="contorno">Sin datos</Badge>
                          ) : (
                            <Badge variant={a.tasaEntrega >= 70 ? "exito" : "aviso"}>
                              {a.tasaEntrega}%
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
