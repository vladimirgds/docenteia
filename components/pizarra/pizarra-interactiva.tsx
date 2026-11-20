"use client";

import katex from "katex";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Profesor3D, type ObjetivoLaser } from "@/components/pizarra/profesor-3d";
import { planoALatex } from "@/lib/matematicas";
import { dictadoAMatematica } from "@/lib/pizarra/dictado";
import { OPCIONES_KATEX, PREFIJO_TERMINO, latexConTerminos } from "@/lib/pizarra/latex-terminos";
import { Secuenciador, construirSegmentos, type Instantanea } from "@/lib/pizarra/secuenciador";
import { crearLocutorNavegador, decirFrase } from "@/lib/pizarra/voz-navegador";
import type { Paso } from "@/lib/docente/procedimientos";

/**
 * PIZARRA CONVERSACIONAL INTERACTIVA (PMV 3 · HITO 3).
 *
 * Proyecta un procedimiento paso a paso con KaTeX, narrado por un profesor
 * virtual 3D. Lo que el alumno puede hacer:
 *
 *   · TOCAR un término de la expresión para oír su explicación;
 *   · PEDIR UNA PISTA (salen de una en una);
 *   · RESPONDER las preguntas escribiendo o HABLANDO.
 *
 * El PUNTERO LÁSER señala el término exacto que se está nombrando y se mueve
 * cuando EMPIEZA su audio. Pausar, repetir y reanudar los mantienen juntos: la
 * lógica de esa sincronía vive en `lib/pizarra/secuenciador.ts`, que es una
 * máquina de estados pura y está probada aparte; este componente sólo la dibuja.
 */

export interface VistaPizarra {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  ejemplo: string;
  tema: { id: string; titulo: string } | null;
  pasos: Paso[];
  preguntas: { enunciado: string; verificable: boolean; pistas: number }[];
  pistas: number;
}

export interface RespuestaCorreccion {
  correcto: boolean | null;
  mensaje?: string;
}
export interface RespuestaPista {
  pista: string | null;
  quedan: number;
  mensaje?: string;
}

interface Props {
  procedimiento: VistaPizarra;
  /** «alumno» registra y corrige en el servidor; «previa» es la vista del docente. */
  modo: "alumno" | "previa";
  onResponder: (pregunta: number, texto: string) => Promise<RespuestaCorreccion>;
  onPista: (pregunta: number | undefined, nivel: number) => Promise<RespuestaPista>;
}

interface Laser {
  left: number;
  top: number;
  visible: boolean;
  objetivo: string | null;
}

const RECONOCIMIENTO = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
};

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}

export function PizarraInteractiva({ procedimiento, modo, onResponder, onPista }: Props) {
  const { pasos, preguntas } = procedimiento;

  // ── La narración ──────────────────────────────────────────────────────────
  const segmentos = useMemo(() => construirSegmentos(pasos), [pasos]);
  const [inst, setInst] = useState<Instantanea>({ indice: 0, estado: "detenido", objetivo: null, paso: 0, explicandoTermino: false });
  const [conVoz, setConVoz] = useState(true);
  const [velocidad, setVelocidad] = useState(1);
  const ajustes = useRef({ conVoz, velocidad });
  ajustes.current = { conVoz, velocidad };
  const [leyendaTermino, setLeyendaTermino] = useState<string | null>(null);
  const [hablandoExtra, setHablandoExtra] = useState(false);
  const callarExtra = useRef<(() => void) | null>(null);

  const secuenciador = useRef<Secuenciador | null>(null);
  useEffect(() => {
    const s = new Secuenciador(segmentos, crearLocutorNavegador(() => ajustes.current), setInst);
    secuenciador.current = s;
    setInst(s.instantanea());
    return () => {
      s.detener();
      secuenciador.current = null;
    };
  }, [segmentos]);

  // ── El tablero y el láser ─────────────────────────────────────────────────
  const tablero = useRef<HTMLDivElement>(null);
  const [laser, setLaser] = useState<Laser>({ left: 0, top: 0, visible: false, objetivo: null });
  const [objetivoProfe, setObjetivoProfe] = useState<ObjetivoLaser | null>(null);

  const pasoVisible = inst.estado === "detenido" ? -1 : inst.paso;
  // OJO: se memorizan los OBJETOS `{ __html }`, no sólo las cadenas. En esta
  // versión de React, un objeto nuevo en cada render cuenta como un cambio y
  // REEMPLAZA el contenido del bloque: se perdería el resaltado del término
  // (una clase que se añade a mano sobre el DOM de KaTeX) en el render siguiente.
  const html = useMemo(
    () =>
      pasos.map((p) => {
        const compuesto = latexConTerminos(p.escribe, p.terminos ?? []);
        try {
          return { __html: katex.renderToString(compuesto.latex, OPCIONES_KATEX) };
        } catch {
          return { __html: katex.renderToString(planoALatex(p.escribe), OPCIONES_KATEX) };
        }
      }),
    [pasos],
  );
  const htmlEjemplo = useMemo(
    () => ({ __html: katex.renderToString(planoALatex(procedimiento.ejemplo), { ...OPCIONES_KATEX, throwOnError: false }) }),
    [procedimiento.ejemplo],
  );

  // El objetivo se lee de una referencia: `colocarLaser` lo llaman también
  // observadores y promesas creados con un objetivo ANTERIOR, y una copia vieja
  // del objetivo les haría borrar el resaltado del término actual.
  const objetivoActual = useRef<string | null>(inst.objetivo);
  objetivoActual.current = inst.objetivo;

  const colocarLaser = useCallback(() => {
    const t = tablero.current;
    if (!t) return;
    t.querySelectorAll(".pz-activo").forEach((e) => e.classList.remove("pz-activo"));
    const o = objetivoActual.current;
    if (!o) {
      setLaser((l) => (l.visible ? { ...l, visible: false } : l));
      return;
    }
    const [tipo, i, k] = o.split(":");
    const base = t.querySelector(`[data-paso-expr="${i}"] .katex-html`);
    // La expresión entera se señala en el centro de la FÓRMULA (el bloque `.base`
    // de KaTeX), no del contenedor, que ocupa todo el ancho de la pizarra.
    const el = tipo === "termino" ? base?.querySelector(`.${PREFIJO_TERMINO}${k}`) : (base?.querySelector(".base") ?? base);
    if (!el) {
      setLaser((l) => (l.visible ? { ...l, visible: false } : l));
      return;
    }
    if (tipo === "termino") el.classList.add("pz-activo");
    const r = el.getBoundingClientRect();
    const rt = t.getBoundingClientRect();
    // Siempre el CENTRO de lo señalado (término o fórmula).
    const left = r.left - rt.left + r.width / 2;
    const top = r.top - rt.top + r.height / 2;
    setLaser({ left, top, visible: true, objetivo: o });
    setObjetivoProfe({
      x: Math.min(1, Math.max(0, left / Math.max(1, rt.width))),
      y: Math.min(1, Math.max(0, top / Math.max(1, rt.height))),
    });
  }, []);

  useLayoutEffect(() => {
    colocarLaser();
  }, [colocarLaser, inst.objetivo, pasoVisible, html]);

  // El láser se vuelve a medir cuando CAMBIA EL TAMAÑO de lo que señala, no sólo
  // cuando cambia el objetivo: las tipografías de KaTeX se cargan después del
  // primer pintado y, al llegar, mueven y reescalan cada término. Sin esto el
  // láser se quedaría apuntando a donde ESTABA el término.
  useEffect(() => {
    const t = tablero.current;
    if (!t) return;
    const ro = new ResizeObserver(colocarLaser);
    ro.observe(t);
    t.querySelectorAll("[data-paso-expr], .katex-html").forEach((e) => ro.observe(e));
    const reintento = window.setTimeout(colocarLaser, 350);
    void document.fonts?.ready.then(colocarLaser);
    return () => {
      ro.disconnect();
      window.clearTimeout(reintento);
    };
  }, [colocarLaser, pasoVisible]);

  // ── Tocar un término ──────────────────────────────────────────────────────
  const tocarTermino = useCallback(
    (paso: number, k: number) => {
      const t = pasos[paso]?.terminos?.[k];
      if (!t) return;
      setLeyendaTermino(t.explica);
      secuenciador.current?.explicarTermino(paso, k, t.explica);
    },
    [pasos],
  );
  useEffect(() => {
    if (!inst.explicandoTermino) setLeyendaTermino(null);
  }, [inst.explicandoTermino]);

  const alClicTablero = (ev: React.MouseEvent) => {
    const el = (ev.target as HTMLElement).closest(`[class*="${PREFIJO_TERMINO}"]`);
    const bloque = (ev.target as HTMLElement).closest("[data-paso-expr]");
    if (!el || !bloque) return;
    const m = Array.from(el.classList)
      .map((c) => new RegExp(`^${PREFIJO_TERMINO}(\\d+)$`).exec(c))
      .find(Boolean);
    if (!m) return;
    tocarTermino(Number(bloque.getAttribute("data-paso-expr")), Number(m[1]));
  };

  // ── Preguntas, pistas y respuestas (texto o voz) ──────────────────────────
  const [pregunta, setPregunta] = useState(0);
  const [respuesta, setRespuesta] = useState("");
  const [veredicto, setVeredicto] = useState<{ tipo: "ok" | "mal" | "info"; texto: string } | null>(null);
  const [pistasDadas, setPistasDadas] = useState<Record<number, string[]>>({});
  const [ocupado, setOcupado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [hayMicro, setHayMicro] = useState(false);
  useEffect(() => setHayMicro(RECONOCIMIENTO() !== null), []);

  const decir = useCallback((texto: string) => {
    callarExtra.current?.();
    secuenciador.current?.pausar();
    callarExtra.current = decirFrase(
      texto,
      ajustes.current,
      () => setHablandoExtra(true),
      () => setHablandoExtra(false),
    );
  }, []);
  useEffect(
    () => () => {
      callarExtra.current?.();
    },
    [],
  );

  const enviar = async (texto: string) => {
    if (!texto.trim() || ocupado) return;
    setOcupado(true);
    setVeredicto(null);
    try {
      const r = await onResponder(pregunta, texto.trim());
      const aviso =
        r.mensaje ??
        (r.correcto === true
          ? "¡Correcto!"
          : r.correcto === false
            ? "Todavía no. Prueba otra vez o pide una pista."
            : "Esta pregunta no se puede corregir automáticamente.");
      setVeredicto({ tipo: r.correcto === true ? "ok" : r.correcto === false ? "mal" : "info", texto: aviso });
      decir(aviso);
    } catch {
      setVeredicto({ tipo: "info", texto: "No se ha podido comprobar la respuesta. Vuelve a intentarlo." });
    } finally {
      setOcupado(false);
    }
  };

  const pedirPista = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const dadas = pistasDadas[pregunta] ?? [];
      const r = await onPista(preguntas.length > 0 ? pregunta : undefined, dadas.length);
      if (r.pista) {
        setPistasDadas((p) => ({ ...p, [pregunta]: [...dadas, r.pista!] }));
        decir(r.pista);
      } else {
        const m = r.mensaje ?? "No hay más pistas.";
        setVeredicto({ tipo: "info", texto: m });
        decir(m);
      }
    } finally {
      setOcupado(false);
    }
  };

  const escuchar = () => {
    const SR = RECONOCIMIENTO();
    if (!SR || escuchando) return;
    secuenciador.current?.pausar();
    const rec = new SR();
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const dicho = e.results[0]?.[0]?.transcript ?? "";
      const notacion = dictadoAMatematica(dicho);
      setRespuesta(notacion);
      void enviar(notacion);
    };
    rec.onerror = () => setEscuchando(false);
    rec.onend = () => setEscuchando(false);
    setEscuchando(true);
    rec.start();
  };

  const s = secuenciador.current;
  const sonando = inst.estado === "hablando" || hablandoExtra;
  const leyenda = leyendaTermino ?? (inst.estado === "hablando" || inst.estado === "pausado" ? segmentos[inst.indice]?.texto : null);
  const pasosMostrados = pasoVisible >= 0 ? pasos.slice(0, pasoVisible + 1) : [];

  return (
    <div className="pizarra-interactiva space-y-4" data-modo={modo}>
      <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
        <aside className="space-y-3">
          <Profesor3D hablando={sonando} objetivo={laser.visible ? objetivoProfe : null} className="h-72 overflow-hidden rounded-lg border bg-gradient-to-b from-sky-50 to-white dark:from-slate-800 dark:to-slate-900" />
          <p
            className="min-h-16 rounded-md border bg-muted/40 px-3 py-2 text-sm"
            aria-live="polite"
            data-testid="leyenda"
          >
            {leyenda ?? "Pulsa «Empezar» para que el profesor te explique el ejemplo."}
          </p>
        </aside>

        <section className="space-y-3">
          <div
            ref={tablero}
            onClick={alClicTablero}
            data-testid="tablero"
            className="relative min-h-72 overflow-hidden rounded-lg border-2 border-slate-700 bg-white p-4 dark:bg-slate-900"
          >
            {/* El contenido va en su propio bloque con separación: el láser NO puede
                ser hijo de un contenedor «space-y», que le añadiría un margen. */}
            <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {procedimiento.titulo} · ejemplo
            </div>
            <div aria-label="Ejemplo" dangerouslySetInnerHTML={htmlEjemplo} />

            {pasosMostrados.map((p, i) => (
              <div
                key={i}
                data-paso-expr={i}
                aria-current={i === inst.paso ? "step" : undefined}
                className={`rounded-md border p-3 transition-colors ${i === inst.paso ? "border-primary bg-primary/5" : "opacity-80"}`}
              >
                <div className="text-xs text-muted-foreground">
                  Paso {i + 1}
                  {p.regla ? ` · ${p.regla}` : ""}
                </div>
                <div dangerouslySetInnerHTML={html[i]} />
                {(p.terminos ?? []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-1 text-xs text-muted-foreground">
                    Toca para oír:
                    {(p.terminos ?? []).map((t, k) => (
                      <button
                        key={k}
                        type="button"
                        data-termino-boton={`${i}:${k}`}
                        onClick={() => tocarTermino(i, k)}
                        className="rounded border px-2 py-0.5 font-mono text-foreground hover:bg-muted"
                      >
                        {t.texto}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {pasoVisible < 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                La pizarra está vacía. Pulsa «Empezar».
              </div>
            )}
            </div>

            <div
              className="pz-laser"
              data-testid="laser"
              data-laser-objetivo={laser.objetivo ?? ""}
              style={{ left: laser.left, top: laser.top, opacity: laser.visible ? 1 : 0 }}
              aria-hidden
            />
          </div>

          {/* Mandos de la narración */}
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Mandos de la explicación">
            <Button variant="outline" size="sm" onClick={() => s?.anterior()}>
              ⏮ Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => s?.repetirPaso()} disabled={inst.estado === "detenido"}>
              ↺ Repetir paso
            </Button>
            <Button size="sm" onClick={() => s?.alternar()} data-testid="alternar">
              {inst.estado === "hablando" ? "⏸ Pausar" : inst.estado === "pausado" ? "▶ Reanudar" : inst.estado === "fin" ? "↻ Otra vez" : "▶ Empezar"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => s?.repetir()} disabled={inst.estado === "detenido"}>
              ⟲ Repetir
            </Button>
            <Button variant="outline" size="sm" onClick={() => s?.siguiente()}>
              Siguiente ⏭
            </Button>
            <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={conVoz} onChange={(e) => setConVoz(e.target.checked)} />
              Voz
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Velocidad
              <select className="rounded border bg-background px-1 py-0.5" value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value))}>
                <option value={0.8}>0,8×</option>
                <option value={1}>1×</option>
                <option value={1.25}>1,25×</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="estado" data-estado={inst.estado} data-indice={inst.indice}>
            {inst.estado === "fin" ? "Fin de la explicación." : `Paso ${Math.min(inst.paso + 1, pasos.length)} de ${pasos.length}`}
            {inst.explicandoTermino ? " · explicando un término" : ""}
          </p>
        </section>
      </div>

      {/* Preguntas */}
      <Card>
        <CardHeader>
          <CardTitle>Ahora tú</CardTitle>
          <CardDescription>
            {preguntas.length === 0
              ? "Este procedimiento no tiene preguntas. Puedes pedir una pista si algo no te ha quedado claro."
              : "Responde escribiendo o hablando. Si te atascas, pide una pista."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {preguntas.length > 0 && (
            <>
              <p className="font-medium" data-testid="pregunta">
                {pregunta + 1}. {preguntas[pregunta]?.enunciado}
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="max-w-sm font-mono"
                  aria-label="Tu respuesta"
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void enviar(respuesta)}
                  placeholder="Tu respuesta"
                />
                <Button onClick={() => void enviar(respuesta)} disabled={ocupado || !respuesta.trim()}>
                  Responder
                </Button>
                {hayMicro && (
                  <Button variant="outline" onClick={escuchar} disabled={ocupado || escuchando} data-testid="hablar">
                    {escuchando ? "Escuchando…" : "🎤 Responder hablando"}
                  </Button>
                )}
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={pedirPista} disabled={ocupado} data-testid="pista">
              💡 Pedir una pista
            </Button>
            {preguntas.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPregunta((p) => (p + 1) % preguntas.length);
                  setRespuesta("");
                  setVeredicto(null);
                }}
              >
                Otra pregunta
              </Button>
            )}
          </div>
          {veredicto && (
            <p
              role="status"
              data-testid="veredicto"
              data-tipo={veredicto.tipo}
              className={`rounded-md border px-3 py-2 text-sm ${
                veredicto.tipo === "ok"
                  ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                  : veredicto.tipo === "mal"
                    ? "border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    : "bg-muted/40"
              }`}
            >
              {veredicto.texto}
            </p>
          )}
          {(pistasDadas[pregunta] ?? []).length > 0 && (
            <ol className="list-decimal space-y-1 pl-5 text-sm" data-testid="pistas">
              {(pistasDadas[pregunta] ?? []).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
