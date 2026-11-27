import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { COLUMNAS_ALUMNO, COLUMNAS_HABILIDADES, filaAlumno, filaHabilidad, obtenerReporteDocente } from "@/lib/docente/exportar";

export const metadata: Metadata = { title: "Tutoría · Panel docente" };
export const dynamic = "force-dynamic";

const ETIQUETA_EVENTO: Record<string, string> = {
  RESPUESTA_CORRECTA: "Respuesta correcta",
  RESPUESTA_INCORRECTA: "Respuesta incorrecta",
  PISTA: "Pista",
  REPASO_ABIERTO: "Repaso abierto",
  REPASO_CERRADO: "Repaso cerrado",
  EQUIVALENTE_PROPUESTO: "Ejercicio equivalente propuesto",
  EQUIVALENTE_RESPONDIDO: "Equivalente respondido",
};

/**
 * /docente/tutoria — el PROGRESO de los alumnos con el tutor adaptativo.
 *
 * Para cada aula del docente: cuánto ha costado avanzar a cada alumno (pistas,
 * repasos, ejercicios equivalentes, bloqueos) y, ejercicio por ejercicio, dónde
 * se atascó y qué hizo el tutor. Exportable a PDF y Excel con los mismos datos.
 */
export default async function PaginaTutoria({ searchParams }: { searchParams: Promise<{ aulaId?: string }> }) {
  const sesion = await auth();
  const docenteId = sesion?.user?.id ?? "";
  // PMV 3 · H4: el MISMO filtro (`?aulaId=`) en el panel y en las exportaciones.
  const { aulaId: aulaPedida } = await searchParams;
  const todasLasAulas = await prisma.aula.findMany({
    where: { docenteId },
    orderBy: [{ grado: "asc" }, { seccion: "asc" }],
    select: { id: true, nombre: true, grado: true, seccion: true },
  });
  const aulaId = todasLasAulas.some((a) => a.id === aulaPedida) ? aulaPedida! : null;
  const aulas = await obtenerReporteDocente(docenteId, { aulaId });
  const consulta = aulaId ? `?aulaId=${encodeURIComponent(aulaId)}` : "";

  // Los últimos eventos de cada sesión, para el detalle desplegable.
  const eventos = await prisma.eventoTutoria.findMany({
    where: { sesion: { tarea: { aula: { docenteId } } } },
    orderBy: { creadoEn: "asc" },
    take: 1500,
    select: { tipo: true, detalle: true, creadoEn: true, sesion: { select: { estudianteId: true, tarea: { select: { titulo: true } }, ejercicio: { select: { enunciado: true } } } } },
  });
  const eventosDe = (estudianteId: string, tarea: string, ejercicio: string) =>
    eventos.filter(
      (e) =>
        e.sesion.estudianteId === estudianteId &&
        e.sesion.tarea.titulo === tarea &&
        (e.sesion.ejercicio?.enunciado ?? "(ejercicio retirado)") === ejercicio,
    );

  const hayDatos = aulas.some((a) => a.tutoria.length > 0);

  // PRÁCTICAS GUIADAS (PMV 3 · HITO 2): las de los alumnos matriculados en SUS aulas,
  // con cada decisión del tutor y su motivo.
  const practicas = await prisma.practicaGuiada.findMany({
    where: { estudiante: { matriculas: { some: { aula: { docenteId } } } } },
    orderBy: { actualizadoEn: "desc" },
    take: 30,
    select: {
      id: true,
      enunciado: true,
      modo: true,
      resuelta: true,
      solucionMostrada: true,
      estudiante: { select: { nombre: true } },
      decisiones: {
        orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
        select: { evento: true, accion: true, motivo: true, pasoIndice: true },
      },
    },
  });

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Tutoría adaptativa</h1>
            <p className="text-muted-foreground">
              Cuándo se atascan tus alumnos y qué hizo el tutor: pistas, repasos breves y ejercicios equivalentes.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href={`/api/docente/exportar/pdf${consulta}`} data-testid="exportar-pdf">Exportar PDF</a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/docente/exportar/excel${consulta}`} data-testid="exportar-excel">Exportar Excel</a>
            </Button>
          </div>
        </div>

        <form method="get" className="flex flex-wrap items-center gap-2 text-sm" data-testid="filtro-aula">
          <label htmlFor="filtro-aula">Aula</label>
          <select id="filtro-aula" name="aulaId" defaultValue={aulaId ?? ""} className="h-9 rounded-md border bg-background px-2">
            <option value="">Todas mis aulas</option>
            {todasLasAulas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.grado}.º {a.seccion} — {a.nombre}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Filtrar
          </Button>
          <span className="text-xs text-muted-foreground">Las exportaciones usan este mismo filtro.</span>
        </form>

        {!hayDatos && (
          <Card>
            <CardHeader>
              <CardTitle>Todavía no hay actividad de tutoría</CardTitle>
              <CardDescription>
                Aparecerá aquí cuando tus alumnos resuelvan ejercicios de una tarea del banco y el tutor intervenga.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {aulas.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>
                {a.grado}.º {a.seccion} — {a.nombre}
              </CardTitle>
              <CardDescription>{a.estudiantes.length} alumno(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="resumen-alumnos">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      {COLUMNAS_ALUMNO.map((c) => (
                        <th key={c} className="pb-2 pr-3 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.estudiantes.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        {filaAlumno(a, e).map((v, k, fila) => (
                          <td key={k} className="py-2 pr-3">
                            {k === fila.length - 1 && Number(v) > 0 ? <Badge variant="aviso">{v}</Badge> : v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {a.habilidades.length > 0 && (
                <div className="overflow-x-auto">
                  <h3 className="pb-2 font-medium">Por habilidad</h3>
                  <table className="w-full text-sm" data-testid="resumen-habilidades">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        {COLUMNAS_HABILIDADES.map((c) => (
                          <th key={c} className="pb-2 pr-3 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {a.habilidades.map((h, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {filaHabilidad(h).map((v, k) => (
                            <td key={k} className="py-2 pr-3">
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {a.tutoria.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Por ejercicio</h3>
                  {a.tutoria.map((t, i) => (
                    <details key={i} className="rounded-md border px-3 py-2 text-sm" data-testid="sesion-tutoria">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                        <span className="font-medium">{t.estudiante}</span>
                        <span className="text-muted-foreground">
                          · {t.tema} · «{t.ejercicio}»
                        </span>
                        <Badge variant={t.resuelta ? "exito" : "aviso"}>{t.resuelta ? "Resuelto" : "Sin resolver"}</Badge>
                        {t.habilidad && <Badge variant="contorno">{t.habilidad}</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {t.errores} error(es) · {t.pistas} pista(s) · {t.repasos} repaso(s) · {t.equivalentes} equivalente(s)
                          {t.equivalenteResuelto !== null ? ` · equivalente ${t.equivalenteResuelto ? "resuelto" : "no resuelto"}` : ""}
                        </span>
                      </summary>
                      <ol className="list-decimal space-y-1 pl-6 pt-2 text-muted-foreground">
                        {eventosDe(t.estudianteId, t.tarea, t.ejercicio).map((ev, k) => (
                          <li key={k}>
                            {ETIQUETA_EVENTO[ev.tipo] ?? ev.tipo}
                            {ev.tipo === "PISTA" && (ev.detalle as { pista?: string }).pista
                              ? `: ${(ev.detalle as { pista?: string }).pista}`
                              : ""}
                            {ev.tipo === "REPASO_ABIERTO" && (ev.detalle as { habilidad?: string }).habilidad
                              ? ` (habilidad: ${(ev.detalle as { habilidad?: string }).habilidad})`
                              : ""}
                            {ev.tipo === "EQUIVALENTE_RESPONDIDO"
                              ? (ev.detalle as { correcto?: boolean }).correcto
                                ? ": correcto"
                                : ": incorrecto"
                              : ""}
                          </li>
                        ))}
                      </ol>
                    </details>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <Card data-testid="practicas-guiadas">
          <CardHeader>
            <CardTitle>Prácticas guiadas</CardTitle>
            <CardDescription>
              Qué decidió el tutor en cada paso y por qué: explicar, preguntar, dar una pista o mostrar el paso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {practicas.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía ningún alumno ha hecho una práctica guiada.</p>
            )}
            {practicas.map((p) => (
              <details key={p.id} className="rounded-md border px-3 py-2 text-sm" data-testid="practica-guiada">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{p.estudiante.nombre}</span>
                  <span className="text-muted-foreground">· {p.enunciado}</span>
                  <Badge variant="contorno">{p.modo.replace("_", " ").toLowerCase()}</Badge>
                  <Badge variant={p.resuelta ? "exito" : "aviso"}>{p.resuelta ? "Resuelta" : "En curso"}</Badge>
                  {p.solucionMostrada && <Badge variant="aviso">Se le mostró la solución</Badge>}
                  <span className="text-xs text-muted-foreground">{p.decisiones.length} decisión(es)</span>
                </summary>
                <ol className="list-decimal space-y-1 pl-6 pt-2 text-muted-foreground">
                  {p.decisiones.map((d, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{d.accion}</span> (paso {d.pasoIndice + 1}) — {d.motivo}
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
