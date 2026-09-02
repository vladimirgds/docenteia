import type { Metadata } from "next";
import Link from "next/link";

import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ETIQUETA_NIVEL } from "@/lib/diagnostico/clasificar";
import {
  alumnosDelPanel,
  dificultadesRecurrentes,
  metricasDelGrupo,
  ETIQUETA_ESTADO,
} from "@/lib/docente/metricas";

export const metadata: Metadata = { title: "Panel docente" };

// El listado refleja los estudiantes existentes en cada visita, así que no se
// prerenderiza en el build.
export const dynamic = "force-dynamic";

/**
 * Panel docente.
 *
 * Lee la persistencia REAL: quién se ha registrado, en qué nivel lo situó el
 * diagnóstico, cuántas sesiones ha terminado, cómo va de aciertos y en qué se
 * atasca el grupo. Todo sale de las tablas que la lección lleva llenando:
 * sesiones_aprendizaje, registros_progreso y registros_error.
 *
 * Sirve además como comprobación visible de que el RBAC funciona: esta ruta la
 * abren DOCENTE, DIRECTOR y SUPERADMIN.
 *
 * MVP 2. El panel gana una portada de AUTORÍA: desde aquí se entra al currículo,
 * al alta de temas y al banco de ejercicios, con el recuento de lo que hay en
 * cada sitio. Es lo primero que ve el docente al entrar y responde a la pregunta
 * con la que llega: "¿qué tengo montado y qué me falta?".
 */
export default async function PanelDocente() {
  const [perfiles, intentos, errores, temasPublicados, temasBorrador, ejerciciosValidados, ejerciciosTotales, reglas] = await Promise.all([
    prisma.perfilEstudiante.findMany({
      orderBy: { creadoEn: "desc" },
      take: 50,
      include: {
        usuario: { select: { nombre: true, email: true } },
        intentosDiagnostico: {
          orderBy: { iniciadoEn: "desc" },
          take: 1,
          select: { aciertos: true, totalPreguntas: true },
        },
        // Sesiones TERMINADAS: una empezada y abandonada no es trabajo hecho.
        sesiones: {
          where: { finalizadaEn: { not: null } },
          orderBy: { finalizadaEn: "desc" },
          select: { finalizadaEn: true },
        },
      },
    }),
    // Un registro por intento de práctica calificado.
    prisma.registroProgreso.findMany({
      select: { perfilId: true, tema: true, acierto: true },
    }),
    // El catálogo de debilidades acumuladas del grupo.
    prisma.registroError.findMany({
      select: { tema: true, tipoError: true, ocurrencias: true },
    }),
    prisma.nodoConocimiento.count({ where: { estado: "PUBLICADO" } }),
    prisma.nodoConocimiento.count({ where: { estado: "BORRADOR" } }),
    prisma.ejercicio.count({ where: { validado: true } }),
    prisma.ejercicio.count(),
    prisma.reglaMatematica.count(),
  ]);

  const autoria = [
    {
      href: "/docente/curriculo",
      titulo: "Currículo",
      descripcion: "Asignaturas, temas y subtemas.",
      cifra: `${temasPublicados} publicado(s)`,
      pie: `${temasBorrador} en borrador`,
    },
    {
      href: "/docente/crear-tema",
      titulo: "Crear tema",
      descripcion: "Nuevo tema con sus reglas pedagógicas.",
      cifra: `${reglas} regla(s)`,
      pie: "en todo el temario",
    },
    {
      href: "/docente/ejercicios",
      titulo: "Ejercicios",
      descripcion: "Banco con validación matemática en servidor.",
      cifra: `${ejerciciosValidados} de ${ejerciciosTotales}`,
      pie: "verificados por el motor",
    },
  ];

  const enBruto = perfiles.map((p) => ({
    perfilId: p.id,
    nombre: p.usuario.nombre,
    email: p.usuario.email,
    nivel: p.nivelActual as string | null,
    sesionesCompletadas: p.sesiones.length,
    ultimaSesion: p.sesiones[0]?.finalizadaEn ?? null,
  }));

  const alumnos = alumnosDelPanel(enBruto, intentos);
  const metricas = metricasDelGrupo(enBruto, intentos, errores);
  const dificultades = dificultadesRecurrentes(errores);
  const cifraDe = (perfilId: string) => alumnos.find((a) => a.perfilId === perfilId);

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Panel docente</h1>
          <p className="text-muted-foreground">
            Estudiantes registrados y nivel asignado por el diagnóstico inicial.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {autoria.map((a) => (
            <Card key={a.href} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{a.titulo}</CardTitle>
                <CardDescription>{a.descripcion}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{a.cifra}</p>
                  <p className="text-xs text-muted-foreground">{a.pie}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={a.href}>Abrir</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { rotulo: "Estudiantes", valor: String(metricas.totalAlumnos) },
            {
              rotulo: "Diagnóstico completado",
              valor:
                metricas.diagnosticoCompletado == null
                  ? "—"
                  : `${metricas.diagnosticoCompletado}%`,
              pie: `${metricas.conDiagnostico} de ${metricas.totalAlumnos}`,
            },
            {
              rotulo: "Aciertos del grupo",
              valor:
                metricas.tasaAciertosGlobal == null ? "—" : `${metricas.tasaAciertosGlobal}%`,
              pie: "sobre las prácticas calificadas",
            },
            {
              rotulo: "Sesiones completadas",
              valor: String(metricas.sesionesCompletadas),
              pie: metricas.temaMasDificil
                ? `más difícil: ${metricas.temaMasDificil.toLowerCase().replace(/_/g, " ")}`
                : undefined,
            },
          ].map((m) => (
            <Card key={m.rotulo}>
              <CardHeader className="pb-2">
                <CardDescription>{m.rotulo}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{m.valor}</CardTitle>
              </CardHeader>
              {m.pie && (
                <CardContent className="pt-0 text-xs text-muted-foreground">{m.pie}</CardContent>
              )}
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Estudiantes</CardTitle>
            <CardDescription>
              {perfiles.length === 0
                ? "Todavía no hay estudiantes registrados."
                : `${perfiles.length} estudiante(s).`}
            </CardDescription>
          </CardHeader>
          {perfiles.length > 0 && (
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Nombre</th>
                    <th className="pb-2 font-medium">Ciclo / grado</th>
                    <th className="pb-2 font-medium">Nivel</th>
                    <th className="pb-2 font-medium">Diagnóstico</th>
                    <th className="pb-2 font-medium">Sesiones</th>
                    <th className="pb-2 font-medium">Aciertos</th>
                    <th className="pb-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {perfiles.map((p) => {
                    const intento = p.intentosDiagnostico[0];
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="font-medium">{p.usuario.nombre}</div>
                          <div className="text-muted-foreground">{p.usuario.email}</div>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {[p.ciclo, p.grado].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="py-3">
                          {p.nivelActual ? (
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                              {ETIQUETA_NIVEL[p.nivelActual]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Sin diagnosticar</span>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {intento
                            ? `${intento.aciertos} / ${intento.totalPreguntas}`
                            : "—"}
                        </td>
                        <td className="py-3 tabular-nums text-muted-foreground">
                          {cifraDe(p.id)?.sesionesCompletadas ?? 0}
                        </td>
                        <td className="py-3 tabular-nums text-muted-foreground">
                          {cifraDe(p.id)?.tasaAciertos == null
                            ? "—"
                            : `${cifraDe(p.id)!.tasaAciertos}% (${cifraDe(p.id)!.aciertos}/${cifraDe(p.id)!.intentos})`}
                        </td>
                        <td className="py-3">
                          <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
                            {ETIQUETA_ESTADO[cifraDe(p.id)?.estado ?? "sin_empezar"]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dificultades recurrentes</CardTitle>
            <CardDescription>
              {dificultades.length === 0
                ? "Aún no hay errores registrados: aparecerán en cuanto los estudiantes practiquen."
                : "En qué se atasca el grupo, de lo más frecuente a lo menos."}
            </CardDescription>
          </CardHeader>
          {dificultades.length > 0 && (
            <CardContent className="space-y-3">
              {dificultades.map((d) => (
                <div key={`${d.tema}-${d.tipoError}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      {d.tema.toLowerCase().replace(/_/g, " ")}
                      <span className="text-muted-foreground">
                        {" · "}
                        {d.tipoError.replace(/_/g, " ")}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {d.peso}% ({d.ocurrencias})
                    </span>
                  </div>
                  {/* La barra es una lectura de un vistazo; la cifra de al lado
                      es la que manda, porque la barra se satura al 100%. */}
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(2, Math.min(100, d.peso))}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </main>
    </div>
  );
}
