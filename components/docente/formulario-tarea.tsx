"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TextoMatematico } from "@/components/math";
import { pedir } from "@/lib/docente/cliente";
import {
  CANTIDAD_EJERCICIOS_MAX,
  CANTIDAD_EJERCICIOS_MIN,
  LIMITE_REINTENTOS_MAX,
  LIMITE_REINTENTOS_MIN,
} from "@/lib/docente/aulas";
import { ETIQUETA_NIVEL_CURRICULO, NIVELES, type Nivel } from "@/lib/docente/curriculo";
import { cn } from "@/lib/utils";

export interface AulaOpcion {
  id: string;
  nombre: string;
  grado: number;
  seccion: string;
}

export interface TemaOpcion {
  id: string;
  titulo: string;
}

interface Props {
  aulas: AulaOpcion[];
  temas: TemaOpcion[];
  aulaIdInicial?: string;
}

interface EjercicioOpcion {
  id: string;
  enunciado: string;
  nivel: Nivel | null;
  plantilla: boolean;
}

/** "Generación en vivo (IA)" es el único valor que NO usa el banco. */
type OrigenEjercicios = "ia" | "todos" | Nivel;

/**
 * ASIGNAR TAREA (HITO 3) — programar una tarea para un aula entera.
 *
 * Selector de aula, tema opcional, ventana de fechas y los dos controles
 * numéricos que pidió el pliego: cantidad de ejercicios y límite de
 * intentos. El servidor vuelve a validar las fechas y la propiedad del
 * aula —ver `POST /api/docente/tareas`—; aquí sólo se evita el viaje de ida y
 * vuelta por un error que se ve a simple vista.
 */
export function FormularioTarea({ aulas, temas, aulaIdInicial }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);

  const hoy = new Date().toISOString().slice(0, 10);
  const [datos, setDatos] = useState({
    aulaId: aulaIdInicial ?? aulas[0]?.id ?? "",
    nodoId: "",
    titulo: "",
    descripcion: "",
    fechaInicio: hoy,
    fechaVencimiento: "",
    cantidadEjercicios: "5",
    limiteReintentos: "3",
    dificultad: "ia" as OrigenEjercicios,
  });
  const usaBanco = datos.dificultad !== "ia";

  // "Elegir ejercicios manualmente" (corrección QA: "Modo Selección Manual
  // (Opcional)"): sólo tiene sentido con el banco, y sólo con un tema —el
  // banco se organiza por `nodoId`—.
  const [manual, setManual] = useState(false);
  const [disponibles, setDisponibles] = useState<EjercicioOpcion[] | "cargando" | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  // PMV 3 · Hito 5A (ampliación): ficha de método PUBLICADA que guía la corrección (pistas
  // de error concretas). Sólo con el banco: es donde el servidor corrige
  // ejercicio a ejercicio.
  const [fichas, setFichas] = useState<{ id: string; titulo: string }[]>([]);
  const [fichaId, setFichaId] = useState("");
  useEffect(() => {
    if (!usaBanco) {
      setFichas([]);
      setFichaId("");
      return;
    }
    const params = new URLSearchParams({ estado: "PUBLICADO" });
    if (datos.nodoId) params.set("nodoId", datos.nodoId);
    void pedir<{ fichas: { id: string; titulo: string }[] }>(`/api/docente/fichas-metodo?${params}`).then((r) => {
      const lista = r.ok ? r.datos.fichas : [];
      setFichas(lista);
      setFichaId((actual) => (lista.some((f) => f.id === actual) ? actual : ""));
    });
  }, [usaBanco, datos.nodoId]);

  useEffect(() => {
    if (!manual || !usaBanco || !datos.nodoId) {
      setDisponibles(null);
      return;
    }
    setDisponibles("cargando");
    const params = new URLSearchParams({ nodoId: datos.nodoId, estado: "PUBLICADO", validado: "true" });
    if (datos.dificultad !== "todos") params.set("nivel", datos.dificultad);
    void pedir<{ ejercicios: EjercicioOpcion[] }>(`/api/docente/ejercicios?${params}`).then((r) => {
      // Las plantillas no tienen todavía un camino de resolución para el
      // alumno (ver lib/docente/parametros.ts): no se ofrecen aquí.
      setDisponibles(r.ok ? r.datos.ejercicios.filter((e) => !e.plantilla) : []);
    });
  }, [manual, usaBanco, datos.nodoId, datos.dificultad]);

  const alternarElegido = (id: string) => {
    setElegidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const asignar = () => {
    if (!datos.aulaId) {
      setAviso({ tono: "mal", texto: "Elige un aula." });
      return;
    }
    if (!datos.titulo.trim()) {
      setAviso({ tono: "mal", texto: "La tarea necesita un título." });
      return;
    }
    if (!datos.fechaVencimiento) {
      setAviso({ tono: "mal", texto: "Elige una fecha de vencimiento." });
      return;
    }
    if (usaBanco && !manual && !datos.nodoId) {
      setAviso({ tono: "mal", texto: "Para armar la tarea desde el banco, elige un tema." });
      return;
    }
    if (usaBanco && manual && elegidos.size === 0) {
      setAviso({ tono: "mal", texto: "Elige al menos un ejercicio del banco." });
      return;
    }

    iniciar(async () => {
      const r = await pedir("/api/docente/tareas", {
        metodo: "POST",
        cuerpo: {
          aulaId: datos.aulaId,
          titulo: datos.titulo.trim(),
          descripcion: datos.descripcion.trim() || null,
          // Fechas sin hora ("2026-10-10"): el navegador las interpreta como
          // medianoche UTC, y el servidor normaliza cada una al límite de su
          // propio día (inicio al primero, vencimiento al último) antes de
          // comparar. Fijarles aquí una hora local —como hacía antes
          // `finDelDia`, y encima se la ponía también a INICIO— es lo que
          // hacía que una tarea "del mismo día" comparase dos medianoches
          // locales corridas de zona horaria y pareciera vencer antes de
          // empezar.
          fechaInicio: new Date(datos.fechaInicio).toISOString(),
          fechaVencimiento: new Date(datos.fechaVencimiento).toISOString(),
          cantidadEjercicios: Number(datos.cantidadEjercicios) || 5,
          limiteReintentos: Number(datos.limiteReintentos) || 0,
          nodoId: datos.nodoId || null,
          ...(usaBanco
            ? {
                origenEjercicios: "banco" as const,
                dificultad: datos.dificultad === "todos" ? null : datos.dificultad,
                ...(manual ? { ejercicioIds: [...elegidos] } : {}),
                ...(fichaId ? { fichaId } : {}),
              }
            : {}),
        },
      });
      if (r.ok) {
        setAviso({ tono: "ok", texto: `Tarea "${datos.titulo.trim()}" asignada.` });
        router.push("/docente/aulas");
        router.refresh();
      } else {
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  if (aulas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no tienes ningún aula. Crea una primero en{" "}
        <a href="/docente/aulas" className="underline underline-offset-2">
          Aulas
        </a>
        .
      </p>
    );
  }

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

      <Card>
        <CardHeader>
          <CardTitle>Nueva tarea</CardTitle>
          <CardDescription>Programa una tarea para toda un aula, con su plazo y su límite de intentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tarea-aula">Aula</Label>
              <Select
                id="tarea-aula"
                value={datos.aulaId}
                onChange={(e) => setDatos({ ...datos, aulaId: e.target.value })}
              >
                {aulas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.grado}.º {a.seccion} — {a.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tarea-tema">Tema (opcional)</Label>
              <Select
                id="tarea-tema"
                value={datos.nodoId}
                onChange={(e) => setDatos({ ...datos, nodoId: e.target.value })}
              >
                <option value="">Sin tema asociado</option>
                {temas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.titulo}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tarea-dificultad">Dificultad de los ejercicios</Label>
            <Select
              id="tarea-dificultad"
              value={datos.dificultad}
              onChange={(e) => {
                const dificultad = e.target.value as OrigenEjercicios;
                setDatos({ ...datos, dificultad });
                if (dificultad === "ia") setManual(false);
              }}
            >
              <option value="ia">Generación en vivo (IA) — como antes</option>
              <option value="todos">Todos (banco de ejercicios, mixto)</option>
              {NIVELES.map((n) => (
                <option key={n} value={n}>
                  {ETIQUETA_NIVEL_CURRICULO[n]} (banco de ejercicios)
                </option>
              ))}
            </Select>
            {usaBanco && (
              <>
                <p className="text-xs text-muted-foreground">
                  Los ejercicios salen de tu banco (<code>/docente/ejercicios</code>), no de la IA. Hace
                  falta elegir un tema arriba para que sepa de dónde tomarlos.
                </p>
                <label className="flex items-center gap-2 pt-1 text-sm">
                  <input
                    type="checkbox"
                    checked={manual}
                    onChange={(e) => setManual(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  Elegir ejercicios manualmente
                </label>
                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="tarea-ficha">Ficha de método (opcional)</Label>
                  <Select id="tarea-ficha" value={fichaId} onChange={(e) => setFichaId(e.target.value)}>
                    <option value="">Sin ficha de método</option>
                    {fichas.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.titulo}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Si el alumno se equivoca en un ejercicio que encaja con el método, recibe la pista de error de la
                    ficha. Se usa la versión publicada hoy: editarla después no cambia esta tarea.
                  </p>
                </div>
              </>
            )}
          </div>

          {usaBanco && manual && (
            <div className="space-y-1.5 rounded-md border p-3">
              <Label>Ejercicios disponibles{datos.nodoId ? "" : " (elige un tema primero)"}</Label>
              {disponibles === "cargando" ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : !disponibles || disponibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {datos.nodoId
                    ? "No hay ejercicios publicados de ese tema y dificultad."
                    : "Elige un tema para ver sus ejercicios."}
                </p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {disponibles.map((e) => (
                    <li key={e.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={elegidos.has(e.id)}
                        onChange={() => alternarElegido(e.id)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-input"
                      />
                      <span className="leading-snug">
                        <TextoMatematico texto={e.enunciado} />
                        {e.nivel && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({ETIQUETA_NIVEL_CURRICULO[e.nivel]})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{elegidos.size} elegido(s).</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tarea-titulo">Título</Label>
            <Input
              id="tarea-titulo"
              placeholder='p. ej. "Ecuaciones lineales — práctica 1"'
              value={datos.titulo}
              onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tarea-descripcion">Descripción (opcional)</Label>
            <Textarea
              id="tarea-descripcion"
              rows={2}
              placeholder="Instrucciones para el alumno."
              value={datos.descripcion}
              onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tarea-inicio">Inicio</Label>
              <Input
                id="tarea-inicio"
                type="date"
                value={datos.fechaInicio}
                onChange={(e) => setDatos({ ...datos, fechaInicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tarea-vencimiento">Vencimiento</Label>
              <Input
                id="tarea-vencimiento"
                type="date"
                min={datos.fechaInicio}
                value={datos.fechaVencimiento}
                onChange={(e) => setDatos({ ...datos, fechaVencimiento: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tarea-cantidad">Cantidad de ejercicios</Label>
              <Input
                id="tarea-cantidad"
                type="number"
                min={CANTIDAD_EJERCICIOS_MIN}
                max={CANTIDAD_EJERCICIOS_MAX}
                value={usaBanco && manual ? elegidos.size : datos.cantidadEjercicios}
                disabled={usaBanco && manual}
                onChange={(e) => setDatos({ ...datos, cantidadEjercicios: e.target.value })}
              />
              {usaBanco && manual && (
                <p className="text-xs text-muted-foreground">La decide cuántos elegiste arriba.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tarea-intentos">Límite de intentos</Label>
              <Input
                id="tarea-intentos"
                type="number"
                min={LIMITE_REINTENTOS_MIN}
                max={LIMITE_REINTENTOS_MAX}
                value={datos.limiteReintentos}
                onChange={(e) => setDatos({ ...datos, limiteReintentos: e.target.value })}
              />
              {/* "Reintentos" sugería intentos ADICIONALES al primero; el
                  número es el TOTAL (corrección QA: "si el docente
                  configura 2 intentos, el alumno debe tener exactamente 2
                  en total"), así que la etiqueta lo dice con esa palabra. */}
              <p className="text-xs text-muted-foreground">0 = sin límite de intentos.</p>
            </div>
          </div>

          <Button onClick={asignar} disabled={pendiente} className="w-full sm:w-auto">
            Asignar tarea
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
