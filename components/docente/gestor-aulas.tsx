"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pedir } from "@/lib/docente/cliente";
import { GRADO_MAX, GRADO_MIN } from "@/lib/docente/aulas";
import { cn } from "@/lib/utils";

/**
 * MIS AULAS (HITO 3) — la mesa de trabajo del docente para organizar a sus
 * alumnos por grado y sección.
 *
 * Misma forma que `GestorCurriculo`: un formulario de alta que se despliega
 * sin salir de la pantalla —aquí en vez de un modal, para no introducir un
 * patrón de interfaz (overlay, foco atrapado, cierre con Escape) que el resto
 * del panel no usa en ningún otro sitio—, una rejilla de tarjetas, y el mismo
 * aviso de éxito/error que ya conoce el docente.
 */

export interface AulaVista {
  id: string;
  nombre: string;
  grado: number;
  seccion: string;
  codigoAcceso: string;
  activa: boolean;
  matriculas: number;
  tareas: number;
}

interface Props {
  aulas: AulaVista[];
  baseUrl: string;
}

export function GestorAulas({ aulas, baseUrl }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState({ nombre: "", grado: "", seccion: "" });
  const [copiado, setCopiado] = useState<{ aulaId: string; que: "codigo" | "enlace" } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [estudiantes, setEstudiantes] = useState<
    Record<string, { nombre: string; email: string }[] | "cargando">
  >({});

  const crear = () => {
    const grado = Number(nueva.grado);
    if (!nueva.nombre.trim()) {
      setAviso({ tono: "mal", texto: "El aula necesita un nombre." });
      return;
    }
    if (!Number.isInteger(grado) || grado < GRADO_MIN || grado > GRADO_MAX) {
      setAviso({ tono: "mal", texto: `El grado debe estar entre ${GRADO_MIN} y ${GRADO_MAX}.` });
      return;
    }
    if (!nueva.seccion.trim()) {
      setAviso({ tono: "mal", texto: "La sección no puede estar vacía." });
      return;
    }
    iniciar(async () => {
      const r = await pedir("/api/docente/aulas", {
        metodo: "POST",
        cuerpo: { nombre: nueva.nombre.trim(), grado, seccion: nueva.seccion.trim() },
      });
      if (r.ok) {
        setNueva({ nombre: "", grado: "", seccion: "" });
        setCreando(false);
        setAviso({ tono: "ok", texto: `Aula "${nueva.nombre.trim()}" creada.` });
        router.refresh();
      } else {
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  const verEstudiantes = (aulaId: string) => {
    if (abierta === aulaId) {
      setAbierta(null);
      return;
    }
    setAbierta(aulaId);
    if (!estudiantes[aulaId]) {
      setEstudiantes((e) => ({ ...e, [aulaId]: "cargando" }));
      iniciar(async () => {
        const r = await pedir<{ estudiantes: { nombre: string; email: string }[] }>(
          `/api/docente/aulas/${aulaId}`,
        );
        setEstudiantes((e) => ({
          ...e,
          [aulaId]: r.ok ? r.datos.estudiantes : [],
        }));
        if (!r.ok) setAviso({ tono: "mal", texto: r.error });
      });
    }
  };

  const copiar = async (aulaId: string, que: "codigo" | "enlace", texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado({ aulaId, que });
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setAviso({ tono: "mal", texto: "No se pudo copiar. Cópialo a mano: " + texto });
    }
  };

  return (
    <div className="space-y-6">
      {aviso && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            aviso.tono === "ok"
              ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {aviso.texto}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">Mis aulas</h2>
          <p className="text-sm text-muted-foreground">
            Un aula es un grado y una sección: reparte su código a tus alumnos para que se
            matriculen.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreando((v) => !v)}>
          {creando ? "Cancelar" : "Crear nueva aula"}
        </Button>
      </div>

      {creando && (
        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="aula-nombre">Nombre del salón</Label>
              <Input
                id="aula-nombre"
                placeholder='p. ej. "3ro B - Secundaria"'
                value={nueva.nombre}
                onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aula-grado">Grado</Label>
              <Input
                id="aula-grado"
                type="number"
                min={GRADO_MIN}
                max={GRADO_MAX}
                placeholder="3"
                value={nueva.grado}
                onChange={(e) => setNueva({ ...nueva, grado: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aula-seccion">Sección</Label>
              <Input
                id="aula-seccion"
                placeholder="B"
                value={nueva.seccion}
                onChange={(e) => setNueva({ ...nueva, seccion: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={crear} disabled={pendiente} className="w-full">
                Crear aula
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {aulas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no has creado ningún aula. Crea la primera para empezar a matricular alumnos.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {aulas.map((a) => {
            const enlace = `${baseUrl}/estudiante/unirse?codigo=${a.codigoAcceso}`;
            return (
              <Card key={a.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {a.grado}.º {a.seccion}
                    </CardTitle>
                    {!a.activa && <Badge variant="contorno">Inactiva</Badge>}
                  </div>
                  <CardDescription>{a.nombre}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-lg font-semibold tracking-widest">
                      {a.codigoAcceso}
                    </code>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copiar(a.id, "codigo", a.codigoAcceso)}
                    >
                      {copiado?.aulaId === a.id && copiado.que === "codigo" ? "¡Copiado!" : "Copiar código"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copiar(a.id, "enlace", enlace)}
                    >
                      {copiado?.aulaId === a.id && copiado.que === "enlace" ? "¡Copiado!" : "Copiar enlace"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-sm">
                    <Badge variant="neutro">
                      {a.matriculas} alumno{a.matriculas === 1 ? "" : "s"}
                    </Badge>
                    <span className="text-muted-foreground">
                      {a.tareas} tarea{a.tareas === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => verEstudiantes(a.id)}
                    >
                      {abierta === a.id ? "Ocultar alumnos" : "Ver estudiantes"}
                    </Button>
                    <Link href={`/docente/asignar-tarea?aulaId=${a.id}`} className="flex-1">
                      <Button size="sm" className="w-full">
                        Asignar tarea
                      </Button>
                    </Link>
                  </div>
                  {abierta === a.id && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      {estudiantes[a.id] === "cargando" ? (
                        <p className="text-muted-foreground">Cargando…</p>
                      ) : !estudiantes[a.id] || (estudiantes[a.id] as unknown[]).length === 0 ? (
                        <p className="text-muted-foreground">
                          Todavía no hay alumnos matriculados en esta aula.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {(estudiantes[a.id] as { nombre: string; email: string }[]).map((al) => (
                            <li key={al.email} className="flex items-baseline justify-between gap-2">
                              <span className="font-medium">{al.nombre}</span>
                              <span className="truncate text-xs text-muted-foreground">{al.email}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
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
