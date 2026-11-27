"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { pedir } from "@/lib/docente/cliente";

export interface HabilidadVista {
  id: string;
  clave: string;
  nombre: string;
  repasoId: string | null;
  requiere: string[];
  ejercicios: number;
}
export interface OpcionSimple {
  id: string;
  titulo: string;
}
export interface EjercicioOpcion {
  id: string;
  enunciado: string;
  habilidadId: string | null;
}

interface Props {
  habilidades: HabilidadVista[];
  repasos: OpcionSimple[];
  ejercicios: EjercicioOpcion[];
  puedeEditar: boolean;
}

/**
 * PMV 3 · H4 — Habilidades y prerrequisitos. El docente crea habilidades,
 * marca qué requiere cada una (el servidor rechaza los ciclos), elige el
 * procedimiento que sirve de REPASO y enlaza sus ejercicios.
 */
export function GestorHabilidades({ habilidades, repasos, ejercicios, puedeEditar }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);
  const [nueva, setNueva] = useState({ clave: "", nombre: "", repasoId: "", requiere: [] as string[] });
  const nombre = (id: string) => habilidades.find((h) => h.id === id)?.nombre ?? id;

  const ejecutar = (f: () => Promise<{ ok: boolean; error?: string }>, exito: string) =>
    iniciar(async () => {
      const r = await f();
      setAviso(r.ok ? { tono: "ok", texto: exito } : { tono: "mal", texto: r.error ?? "No se pudo guardar." });
      if (r.ok) router.refresh();
    });

  const crear = () =>
    ejecutar(async () => {
      const r = await pedir("/api/docente/habilidades", {
        metodo: "POST",
        cuerpo: { clave: nueva.clave.trim(), nombre: nueva.nombre.trim(), repasoId: nueva.repasoId || null, requiere: nueva.requiere },
      });
      if (r.ok) setNueva({ clave: "", nombre: "", repasoId: "", requiere: [] });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }, "Habilidad creada.");

  const editar = (id: string, cuerpo: Record<string, unknown>) =>
    ejecutar(async () => {
      const r = await pedir(`/api/docente/habilidades/${id}`, { metodo: "PATCH", cuerpo });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }, "Cambios guardados.");

  const enlazar = (habilidadId: string, ejercicioId: string, quitar = false) =>
    ejecutar(async () => {
      const r = await pedir(`/api/docente/habilidades/${habilidadId}/ejercicios`, { metodo: "POST", cuerpo: { ejercicioId, quitar } });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }, quitar ? "Ejercicio desenlazado." : "Ejercicio enlazado.");

  return (
    <div className="space-y-6">
      {aviso && (
        <p role="status" data-testid="aviso-habilidades" className={aviso.tono === "ok" ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-destructive"}>
          {aviso.texto}
        </p>
      )}

      {puedeEditar && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva habilidad</CardTitle>
            <CardDescription>Por ejemplo «Reducir términos semejantes», que requiere «Ley de los signos».</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="h-nombre">Nombre</Label>
              <Input id="h-nombre" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-clave">Clave</Label>
              <Input id="h-clave" className="font-mono" value={nueva.clave} placeholder="ley-de-signos" onChange={(e) => setNueva({ ...nueva, clave: e.target.value.toLowerCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-repaso">Repaso (procedimiento publicado)</Label>
              <Select id="h-repaso" value={nueva.repasoId} onChange={(e) => setNueva({ ...nueva, repasoId: e.target.value })}>
                <option value="">Sin repaso propio</option>
                {repasos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.titulo}
                  </option>
                ))}
              </Select>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Requiere</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                {habilidades.length === 0 && <span className="text-muted-foreground">Aún no hay otras habilidades.</span>}
                {habilidades.map((h) => (
                  <label key={h.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={nueva.requiere.includes(h.id)}
                      onChange={(e) =>
                        setNueva({ ...nueva, requiere: e.target.checked ? [...nueva.requiere, h.id] : nueva.requiere.filter((x) => x !== h.id) })
                      }
                    />
                    {h.nombre}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Button onClick={crear} disabled={pendiente || !nueva.nombre.trim() || !nueva.clave.trim()}>
                Crear habilidad
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {habilidades.length === 0 && <p className="text-sm text-muted-foreground">Todavía no has creado habilidades.</p>}

      {habilidades.map((h) => (
        <Card key={h.id} data-testid="habilidad">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {h.nombre} <Badge variant="contorno">{h.clave}</Badge>
            </CardTitle>
            <CardDescription>
              {h.requiere.length > 0 ? `Requiere: ${h.requiere.map(nombre).join(", ")}` : "Sin prerrequisitos"} · {h.ejercicios} ejercicio(s)
            </CardDescription>
          </CardHeader>
          {puedeEditar && (
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`rep-${h.id}`}>Repaso</Label>
                <Select id={`rep-${h.id}`} value={h.repasoId ?? ""} onChange={(e) => editar(h.id, { repasoId: e.target.value || null })} disabled={pendiente}>
                  <option value="">Sin repaso propio</option>
                  {repasos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.titulo}
                    </option>
                  ))}
                </Select>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Requiere</legend>
                <div className="flex flex-wrap gap-3 text-sm">
                  {habilidades
                    .filter((o) => o.id !== h.id)
                    .map((o) => (
                      <label key={o.id} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          disabled={pendiente}
                          checked={h.requiere.includes(o.id)}
                          onChange={(e) => editar(h.id, { requiere: e.target.checked ? [...h.requiere, o.id] : h.requiere.filter((x) => x !== o.id) })}
                        />
                        {o.nombre}
                      </label>
                    ))}
                </div>
              </fieldset>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`ej-${h.id}`}>Enlazar un ejercicio de tu banco</Label>
                <Select
                  id={`ej-${h.id}`}
                  value=""
                  disabled={pendiente}
                  onChange={(e) => e.target.value && enlazar(h.id, e.target.value)}
                >
                  <option value="">Elige un ejercicio…</option>
                  {ejercicios
                    .filter((e) => e.habilidadId !== h.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.enunciado}
                      </option>
                    ))}
                </Select>
                <div className="flex flex-wrap gap-2 pt-1">
                  {ejercicios
                    .filter((e) => e.habilidadId === h.id)
                    .map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="rounded border px-2 py-0.5 font-mono text-xs hover:bg-muted"
                        onClick={() => enlazar(h.id, e.id, true)}
                        title="Quitar de esta habilidad"
                      >
                        {e.enunciado} ✕
                      </button>
                    ))}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
