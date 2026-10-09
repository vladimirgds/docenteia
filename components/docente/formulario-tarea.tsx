"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pedir } from "@/lib/docente/cliente";
import {
  CANTIDAD_EJERCICIOS_MAX,
  CANTIDAD_EJERCICIOS_MIN,
  LIMITE_REINTENTOS_MAX,
  LIMITE_REINTENTOS_MIN,
} from "@/lib/docente/aulas";
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

/** A las 23:59 del día elegido, en hora local: lo que un docente quiere decir con "vence el día X". */
function finDelDia(fecha: string): string {
  return fecha ? `${fecha}T23:59` : "";
}

/**
 * ASIGNAR TAREA (HITO 3) — programar una tarea para un aula entera.
 *
 * Selector de aula, tema opcional, ventana de fechas y los dos controles
 * numéricos que pidió el pliego: cantidad de ejercicios y límite de
 * reintentos. El servidor vuelve a validar las fechas y la propiedad del
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
  });

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

    iniciar(async () => {
      const r = await pedir("/api/docente/tareas", {
        metodo: "POST",
        cuerpo: {
          aulaId: datos.aulaId,
          titulo: datos.titulo.trim(),
          descripcion: datos.descripcion.trim() || null,
          fechaInicio: new Date(finDelDia(datos.fechaInicio) || datos.fechaInicio).toISOString(),
          fechaVencimiento: new Date(finDelDia(datos.fechaVencimiento)).toISOString(),
          cantidadEjercicios: Number(datos.cantidadEjercicios) || 5,
          limiteReintentos: Number(datos.limiteReintentos) || 0,
          nodoId: datos.nodoId || null,
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
          <CardDescription>Programa una tarea para toda un aula, con su plazo y sus reintentos.</CardDescription>
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
                value={datos.cantidadEjercicios}
                onChange={(e) => setDatos({ ...datos, cantidadEjercicios: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tarea-reintentos">Límite de reintentos</Label>
              <Input
                id="tarea-reintentos"
                type="number"
                min={LIMITE_REINTENTOS_MIN}
                max={LIMITE_REINTENTOS_MAX}
                value={datos.limiteReintentos}
                onChange={(e) => setDatos({ ...datos, limiteReintentos: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">0 = sin límite de reintentos.</p>
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
