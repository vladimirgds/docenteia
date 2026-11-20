"use client";

import { useRef, useState } from "react";

import { TextoMatematico } from "@/components/math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Modo = "PRACTICA_GUIADA" | "PRACTICA_LIBRE" | "EVALUACION" | "EXPLICACION";

interface Vista {
  id: string;
  enunciado: string;
  modo: Modo;
  pasos: string[];
  pasoActual: string;
  paso: { indice: number; total: number };
  resuelta: boolean;
  solucionMostrada: boolean;
}
interface Instruccion {
  tipo: "hablar" | "caja" | "resultado" | "preguntar";
  texto: string;
}
interface Respuesta {
  practica: Vista;
  valido?: boolean | null;
  causa?: string | null;
  decision: { accion: string; razon: string; motivo: string; revelaHasta: string; nivelAyuda: number };
  salida: { texto: string[]; audio: string | null; lsg: Instruccion[]; retenidas: number };
}

const ETIQUETA_MODO: Record<Modo, string> = {
  PRACTICA_GUIADA: "Práctica guiada",
  PRACTICA_LIBRE: "Práctica libre",
  EVALUACION: "Evaluación (sin ayudas)",
  EXPLICACION: "Explicación",
};

/** El nombre de la decisión del tutor, para el alumno. */
const ETIQUETA_ACCION: Record<string, string> = {
  EXPLICAR: "El tutor te explica",
  PREGUNTAR: "El tutor pregunta",
  PISTA: "Una pista",
  MOSTRAR_PASO: "El tutor te muestra el paso",
  MOSTRAR_SOLUCION: "La solución",
  CONTINUAR: "Bien",
  REGISTRAR: "Registrado",
  NEGAR: "No disponible ahora",
};

/** Siempre como fórmula: el detector automático no reconoce pasos como «-x=-9». */
const mate = (t: string) => "$" + t.split("$").join("") + "$";

async function llamar<T>(ruta: string, cuerpo?: unknown): Promise<{ ok: true; datos: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (datos as { error?: string }).error ?? "No se pudo completar la petición." };
    return { ok: true, datos: datos as T };
  } catch {
    return { ok: false, error: "No hay conexión con el servidor." };
  }
}

/**
 * La práctica guiada del alumno. Toda la pedagogía (validar el paso, decidir la
 * ayuda, filtrar lo que se revela) ocurre en el servidor; aquí sólo se escribe y
 * se muestra lo que el servidor entrega.
 */
export function PracticaGuiadaVista() {
  const [enunciado, setEnunciado] = useState("2(x+4)=3x-1");
  const [modo, setModo] = useState<Modo>("PRACTICA_GUIADA");
  const [practica, setPractica] = useState<Vista | null>(null);
  const [paso, setPaso] = useState("");
  const [ultima, setUltima] = useState<Respuesta | null>(null);
  const [rechazado, setRechazado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [historial, setHistorial] = useState<{ accion: string; texto: string; ok?: boolean | null }[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const aplicar = (r: Respuesta, intento?: string) => {
    setPractica(r.practica);
    setUltima(r);
    if (intento !== undefined) setRechazado(r.valido === false ? intento : null);
    setHistorial((h) => [
      ...h,
      ...(r.salida.texto.length > 0 ? [{ accion: r.decision.accion, texto: r.salida.texto.join(" "), ok: r.valido }] : []),
    ]);
  };

  const empezar = async () => {
    setOcupado(true);
    setAviso(null);
    const r = await llamar<Respuesta>("/api/estudiante/practica-guiada", { enunciado, modo });
    setOcupado(false);
    if (!r.ok) return setAviso(r.error);
    setHistorial([]);
    setRechazado(null);
    setPaso("");
    setUltima(null);
    aplicar(r.datos);
    setTimeout(() => entrada.current?.focus(), 0);
  };

  const comprobar = async () => {
    if (!practica || !paso.trim() || ocupado) return;
    setOcupado(true);
    setAviso(null);
    const texto = paso.trim();
    const r = await llamar<Respuesta>(`/api/estudiante/practica-guiada/${practica.id}/paso`, { paso: texto });
    setOcupado(false);
    if (!r.ok) return setAviso(r.error);
    aplicar(r.datos, texto);
    if (r.datos.valido !== false) setPaso("");
    entrada.current?.focus();
  };

  const pedir = async (tipo: "PISTA" | "SOLUCION" | "EXPLICACION") => {
    if (!practica || ocupado) return;
    setOcupado(true);
    setAviso(null);
    const r = await llamar<Respuesta>(`/api/estudiante/practica-guiada/${practica.id}/ayuda`, { tipo });
    setOcupado(false);
    if (!r.ok) return setAviso(r.error);
    aplicar(r.datos);
  };

  if (!practica) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>¿Qué ecuación quieres resolver?</CardTitle>
          <CardDescription>Una ecuación lineal con una incógnita, por ejemplo 2(x+4) = 3x-1.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            aria-label="Ecuación"
            value={enunciado}
            onChange={(e) => setEnunciado(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void empezar()}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-muted-foreground" htmlFor="modo">
              Modo
            </label>
            <select
              id="modo"
              aria-label="Modo"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={modo}
              onChange={(e) => setModo(e.target.value as Modo)}
            >
              {(Object.keys(ETIQUETA_MODO) as Modo[]).map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MODO[m]}
                </option>
              ))}
            </select>
            <Button onClick={() => void empezar()} disabled={ocupado || !enunciado.trim()}>
              Empezar
            </Button>
          </div>
          {aviso && (
            <p role="alert" className="text-sm text-destructive">
              {aviso}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const ayudasPermitidas = practica.modo !== "EVALUACION";
  const cajas = ultima?.salida.lsg.filter((i) => i.tipo === "caja" || i.tipo === "resultado") ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl">
              <span data-testid="enunciado">
                <TextoMatematico texto={mate(practica.enunciado)} />
              </span>
            </CardTitle>
            <Badge variant="contorno">{ETIQUETA_MODO[practica.modo]}</Badge>
            <Badge variant="neutro" data-testid="progreso">
              Paso {Math.min(practica.paso.indice + 1, practica.paso.total)} de {practica.paso.total}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="space-y-1" aria-label="Tus pasos" data-testid="pasos">
            {practica.pasos.map((p, i) => (
              <li key={i} className="flex items-center gap-2 text-lg">
                <span className="text-xs text-muted-foreground">{i + 1}.</span>
                <TextoMatematico texto={mate(p)} />
                <span aria-hidden className="text-green-600">
                  ✓
                </span>
              </li>
            ))}
            {rechazado && (
              <li className="flex items-center gap-2 text-lg text-destructive" data-testid="paso-rechazado">
                <span className="text-xs">✗</span>
                <TextoMatematico texto={mate(rechazado)} />
              </li>
            )}
          </ol>

          {cajas.length > 0 && (
            <div className="space-y-1 rounded-md border-2 border-primary/50 bg-primary/5 p-3" data-testid="pizarra-tutor">
              {cajas.map((c, i) => (
                <p key={i} className="text-lg font-medium">
                  <TextoMatematico texto={mate(c.texto)} />
                </p>
              ))}
            </div>
          )}

          {!practica.resuelta ? (
            <div className="flex flex-wrap gap-2">
              <Input
                ref={entrada}
                aria-label="Tu siguiente paso"
                placeholder="Escribe tu siguiente paso…"
                className="min-w-0 flex-1"
                value={paso}
                onChange={(e) => setPaso(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void comprobar()}
              />
              <Button onClick={() => void comprobar()} disabled={ocupado || !paso.trim()}>
                Comprobar paso
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Badge data-testid="resuelta">¡Resuelta!</Badge>
              <Button variant="outline" onClick={() => setPractica(null)}>
                Practicar otra
              </Button>
            </div>
          )}

          {!practica.resuelta && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={ocupado || !ayudasPermitidas} onClick={() => void pedir("PISTA")}>
                Pista
              </Button>
              <Button variant="outline" disabled={ocupado || !ayudasPermitidas} onClick={() => void pedir("EXPLICACION")}>
                Explícamelo
              </Button>
              <Button variant="outline" disabled={ocupado || !ayudasPermitidas} onClick={() => void pedir("SOLUCION")}>
                Quiero la solución
              </Button>
              {!ayudasPermitidas && (
                <span className="self-center text-xs text-muted-foreground">En una evaluación no hay ayudas.</span>
              )}
            </div>
          )}
          {aviso && (
            <p role="alert" className="text-sm text-destructive">
              {aviso}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">El tutor</CardTitle>
        </CardHeader>
        <CardContent aria-live="polite" data-testid="tutor" className="space-y-2">
          {historial.length === 0 && <p className="text-sm text-muted-foreground">Escribe tu primer paso cuando quieras.</p>}
          {[...historial].reverse().map((h, i) => (
            <div key={historial.length - i} className="rounded-md border p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {ETIQUETA_ACCION[h.accion] ?? h.accion}
              </p>
              <p data-testid={i === 0 ? "mensaje-tutor" : undefined}>{h.texto}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
