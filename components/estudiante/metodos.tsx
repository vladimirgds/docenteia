"use client";

import { useEffect, useState } from "react";

import { TextoMatematico } from "@/components/math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Metodo {
  id: string;
  titulo: string;
  descripcion: string | null;
  patron: string;
  ejemplos: string[];
  version: number;
  tema: string | null;
}
interface Revision {
  aplica: boolean;
  mensaje?: string;
  correcta?: boolean | null;
  pista?: { tipo: "error" | "general"; texto: string } | null;
}

const mate = (t: string) => "$" + t.split("$").join("") + "$";

/**
 * Los métodos que publican los docentes (fichas de método, PMV 3 · Hito 5A). El
 * alumno elige un método, escribe un problema que encaja y su respuesta; el
 * servidor la compara con lo que da la ficha y, si falla, le da la pista —la de un
 * error concreto que reconozca («te falta la derivada de la función interior») o
 * la siguiente pista general—. Nunca se le entrega la solución.
 */
export function MetodosVista() {
  const [metodos, setMetodos] = useState<Metodo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Metodo | null>(null);
  const [problema, setProblema] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [intentos, setIntentos] = useState(0);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/estudiante/fichas-metodo")
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { fichas?: Metodo[]; error?: string };
        if (!vivo) return;
        if (!r.ok) setError(d.error ?? "No se pudieron cargar los métodos.");
        else setMetodos(d.fichas ?? []);
      })
      .catch(() => vivo && setError("No hay conexión con el servidor."));
    return () => {
      vivo = false;
    };
  }, []);

  const elegir = (m: Metodo) => {
    setElegido(m);
    setProblema(m.ejemplos[0] ?? "");
    setRespuesta("");
    setIntentos(0);
    setRevision(null);
  };

  const comprobar = async () => {
    if (!elegido || !problema.trim() || !respuesta.trim() || ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/estudiante/fichas-metodo/${elegido.id}/comprobar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problema: problema.trim(), respuesta: respuesta.trim(), intentos }),
      });
      const d = (await r.json().catch(() => ({}))) as Revision & { error?: string };
      if (!r.ok) setError(d.error ?? "No se pudo comprobar la respuesta.");
      else {
        setRevision(d);
        if (d.aplica && d.correcta === false) setIntentos((n) => n + 1);
      }
    } catch {
      setError("No hay conexión con el servidor.");
    }
    setOcupado(false);
  };

  if (metodos === null && !error) return <p className="text-sm text-muted-foreground">Cargando métodos…</p>;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {metodos && metodos.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay métodos</CardTitle>
            <CardDescription>Cuando tu profesor publique un método, lo verás aquí.</CardDescription>
          </CardHeader>
        </Card>
      )}
      {metodos && metodos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="metodos">
          {metodos.map((m) => (
            <Card key={m.id} className={elegido?.id === m.id ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="text-base">{m.titulo}</CardTitle>
                {m.tema && <CardDescription>{m.tema}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-2">
                {m.descripcion && <p className="text-sm text-muted-foreground">{m.descripcion}</p>}
                <Button size="sm" variant={elegido?.id === m.id ? "default" : "outline"} onClick={() => elegir(m)}>
                  Practicar este método
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {elegido && (
        <Card>
          <CardHeader>
            <CardTitle>{elegido.titulo}</CardTitle>
            <CardDescription>Escribe un problema de este tipo y tu respuesta; el tutor la comprueba y te da pistas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Ejemplos:</span>
              {elegido.ejemplos.map((e) => (
                <Button
                  key={e}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setProblema(e);
                    setRespuesta("");
                    setIntentos(0);
                    setRevision(null);
                  }}
                >
                  {e}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="m-problema">
                Problema
              </label>
              <Input id="m-problema" className="font-mono" value={problema} onChange={(e) => setProblema(e.target.value)} />
              {problema.trim() && (
                <div data-testid="problema-metodo">
                  <TextoMatematico texto={mate(problema.trim())} />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="m-respuesta">
                Tu respuesta
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="m-respuesta"
                  className="min-w-0 flex-1 font-mono"
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void comprobar()}
                  placeholder="Escribe la derivada o el resultado"
                />
                <Button onClick={() => void comprobar()} disabled={ocupado || !respuesta.trim() || !problema.trim()}>
                  Comprobar
                </Button>
              </div>
            </div>
            {revision && (
              <div className="space-y-2 rounded-md border p-3" aria-live="polite" data-testid="resultado-metodo">
                {!revision.aplica ? (
                  <p className="text-sm">{revision.mensaje ?? "Este método no se aplica a ese problema."}</p>
                ) : revision.correcta === true ? (
                  <Badge variant="exito">¡Correcto!</Badge>
                ) : revision.correcta === false ? (
                  <>
                    <Badge variant="error">Todavía no</Badge>
                    {revision.pista && (
                      <p className="text-sm" data-testid="pista-metodo" data-tipo={revision.pista.tipo}>
                        {revision.pista.texto}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm">No he podido comprobar tu respuesta: pregúntale a tu profesor.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
