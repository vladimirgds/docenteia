"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TextoMatematico } from "@/components/math";
import { PizarraAlumno } from "@/components/pizarra/pizarra-alumno";
import type { VistaPizarra } from "@/components/pizarra/pizarra-interactiva";
import { pedir } from "@/lib/docente/cliente";
import { cn } from "@/lib/utils";

interface EjercicioDeBanco {
  id: string;
  enunciado: string;
  nivel: string | null;
}

interface Props {
  tareaId: string;
  titulo: string;
  ejercicios: EjercicioDeBanco[];
  limiteReintentos: number;
  intentosPrevios: number;
}

interface Resultado {
  correcto: boolean;
  respuestaDada: string;
}

/** Lo que el servidor dice que hace el tutor (ver `lib/tutoria/servidor.ts`). */
interface TutorVista {
  accion: "CONTINUAR" | "PISTA" | "ABRIR_REPASO" | "VOLVER_AL_PASO" | "PROPONER_EQUIVALENTE";
  pista?: string | null;
  quedanPistas?: number;
  repaso?: { id: string; titulo: string } | null;
  equivalente?: { id: string; enunciado: string } | null;
  mensaje: string;
}

interface EquivalenteVista {
  /** El ejercicio de la tarea al que acompaña (la sesión de tutoría es suya). */
  paraEjercicio: string;
  id: string;
  enunciado: string;
}

/**
 * UNA TAREA ARMADA DESDE EL BANCO DE EJERCICIOS (HITO 3 — corrección QA:
 * "nivel de dificultad en la asignación").
 *
 * Hermana de `<Aula tarea={...}>`, pero sin su complejidad: aquí los N
 * ejercicios YA están decididos —el docente los eligió, a mano o por
 * dificultad, al crear la tarea—, así que no hace falta un motor
 * conversacional que los genere sobre la marcha. Eso es justo lo que vuelve
 * la navegación libre TRIVIAL: no hay nada que "pedir" al saltar a un
 * ejercicio, está ahí desde que cargó la página.
 */
export function TareaDeBanco({ tareaId, titulo, ejercicios, limiteReintentos, intentosPrevios }: Props) {
  const [slotActivo, setSlotActivo] = useState(0);
  const [resultados, setResultados] = useState<Record<number, Resultado>>({});
  const [revisando, setRevisando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState("");
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [envioTarea, setEnvioTarea] = useState<"pendiente" | "enviando" | "lista" | "error">(
    "pendiente",
  );
  const [intentosHechos, setIntentosHechos] = useState(intentosPrevios);
  /** Respuesta correcta por ejercicio: sólo llega una vez entregada la tarea. */
  const [respuestasCorrectas, setRespuestasCorrectas] = useState<Record<string, string>>({});

  // ── Tutoría adaptativa (PMV 3 · HITO 4) ──────────────────────────────────
  const [pistas, setPistas] = useState<string[]>([]);
  const [mensajeTutor, setMensajeTutor] = useState<string | null>(null);
  const [repaso, setRepaso] = useState<{ ejercicioId: string; titulo: string; vista: VistaPizarra } | null>(null);
  const [equivalente, setEquivalente] = useState<EquivalenteVista | null>(null);
  const [respEq, setRespEq] = useState("");
  const [veredictoEq, setVeredictoEq] = useState<"ok" | "mal" | null>(null);
  const [ocupadoTutor, setOcupadoTutor] = useState(false);

  const limpiarTutor = () => {
    setPistas([]);
    setMensajeTutor(null);
    setRepaso(null);
  };

  const total = ejercicios.length;
  const hechos = Object.keys(resultados).length;
  const aciertos = Object.values(resultados).filter((r) => r.correcto).length;
  const tareaCompleta = hechos >= total;
  // `limiteReintentos` es el TOTAL de intentos, no "adicionales al primero"
  // (corrección QA: "si el docente configura 2 intentos, el alumno debe
  // tener exactamente 2 en total").
  const puedenQuedarReintentos = limiteReintentos === 0 || intentosHechos < limiteReintentos;

  const activo = ejercicios[slotActivo];

  /** Da el ejercicio por resuelto (bien o mal) y pasa al siguiente sin resolver. */
  const registrar = useCallback(
    (slot: number, correcto: boolean, respuesta: string) => {
      setRevisando(null);
      setResultados((prev) => {
        if (prev[slot]) return prev;
        const siguiente = { ...prev, [slot]: { correcto, respuestaDada: respuesta } };
        for (let i = 0; i < total; i++) {
          if (!siguiente[i]) {
            setSlotActivo(i);
            break;
          }
        }
        return siguiente;
      });
      limpiarTutor();
    },
    [total],
  );

  const abrirRepaso = async (ejercicioId: string, repasoId: string, titulo: string) => {
    const r = await pedir<{ procedimiento: VistaPizarra }>(`/api/estudiante/procedimientos/${repasoId}`);
    if (r.ok) setRepaso({ ejercicioId, titulo, vista: r.datos.procedimiento });
  };

  const responder = useCallback(async () => {
    const respuesta = borrador.trim();
    if (!respuesta || !activo || corrigiendo) return;
    setCorrigiendo(true);
    setAviso(null);
    const r = await pedir<{ correcto: boolean; verificable: boolean | null; tutor: TutorVista | null }>(
      `/api/estudiante/tareas/${tareaId}/ejercicios/${activo.id}/corregir`,
      { metodo: "POST", cuerpo: { respuesta } },
    );
    setCorrigiendo(false);
    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setBorrador("");
    const tutor = r.datos.tutor;

    // Acierto (o un ejercicio que el motor no sabe corregir): se registra y se
    // pasa al siguiente. Si el tutor propone un equivalente, queda a la vista.
    if (r.datos.correcto || !tutor) {
      registrar(slotActivo, r.datos.correcto, respuesta);
      if (tutor?.accion === "PROPONER_EQUIVALENTE" && tutor.equivalente) {
        setEquivalente({ paraEjercicio: activo.id, ...tutor.equivalente });
        setRespEq("");
        setVeredictoEq(null);
      }
      return;
    }

    // Error: el alumno SE QUEDA en el ejercicio y el tutor le ayuda.
    setMensajeTutor(tutor.mensaje);
    if (tutor.accion === "PISTA" && tutor.pista) setPistas((p) => [...p, tutor.pista!]);
    if (tutor.accion === "ABRIR_REPASO" && tutor.repaso) {
      await abrirRepaso(activo.id, tutor.repaso.id, tutor.repaso.titulo);
    }
    if (tutor.accion === "PROPONER_EQUIVALENTE") {
      // Sigue atascado tras el repaso: este ejercicio se da por no resuelto y se
      // le propone uno parecido en lugar de insistir con el mismo.
      registrar(slotActivo, false, respuesta);
      if (tutor.equivalente) {
        setEquivalente({ paraEjercicio: activo.id, ...tutor.equivalente });
        setRespEq("");
        setVeredictoEq(null);
      }
    }
  }, [borrador, activo, corrigiendo, slotActivo, tareaId, registrar]);

  const pedirPistaTutor = async () => {
    if (!activo || ocupadoTutor) return;
    setOcupadoTutor(true);
    const r = await pedir<{ tutor: TutorVista }>(`/api/estudiante/tareas/${tareaId}/ejercicios/${activo.id}/pista`, {
      metodo: "POST",
    });
    setOcupadoTutor(false);
    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setMensajeTutor(r.datos.tutor.mensaje);
    if (r.datos.tutor.pista) setPistas((p) => [...p, r.datos.tutor.pista!]);
  };

  const terminarRepaso = async () => {
    if (!repaso || ocupadoTutor) return;
    setOcupadoTutor(true);
    const r = await pedir<{ tutor: TutorVista }>(`/api/estudiante/tareas/${tareaId}/ejercicios/${repaso.ejercicioId}/repaso`, {
      metodo: "POST",
    });
    setOcupadoTutor(false);
    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setRepaso(null);
    setMensajeTutor(r.datos.tutor.mensaje || "Vuelve al ejercicio y vuelve a intentarlo.");
  };

  const comprobarEquivalente = async () => {
    if (!equivalente || !respEq.trim() || ocupadoTutor) return;
    setOcupadoTutor(true);
    const r = await pedir<{ correcto: boolean }>(
      `/api/estudiante/tareas/${tareaId}/ejercicios/${equivalente.paraEjercicio}/equivalente`,
      { metodo: "POST", cuerpo: { equivalenteId: equivalente.id, respuesta: respEq.trim() } },
    );
    setOcupadoTutor(false);
    if (r.ok) setVeredictoEq(r.datos.correcto ? "ok" : "mal");
    else setAviso(r.error);
  };

  const irAlEjercicio = (i: number) => {
    if (resultados[i]) {
      setRevisando((actual) => (actual === i ? null : i));
      return;
    }
    setRevisando(null);
    setSlotActivo(i);
    setBorrador("");
    setAviso(null);
    limpiarTutor();
  };

  const reintentar = () => {
    setResultados({});
    setSlotActivo(0);
    setRevisando(null);
    setBorrador("");
    setAviso(null);
    setEnvioTarea("pendiente");
    setRespuestasCorrectas({});
  };

  // Al llegar al cupo, se entrega sola — mismo contrato que la tarea
  // conversacional: una POST con la nota, y la pantalla de cierre.
  useEffect(() => {
    if (!tareaCompleta || envioTarea !== "pendiente") return;
    setEnvioTarea("enviando");
    const puntaje = Math.round((aciertos / total) * 100);
    // `respuestaCorrecta` va en null a propósito: el navegador nunca la supo
    // —ver `GET .../corregir`, que nunca la devuelve—, así que no hay nada
    // que pueda mandar. El servidor la rellena él mismo al entregar, con
    // `ejercicioId` como la llave.
    const detalle = ejercicios.map((e, i) => ({
      ejercicioId: e.id,
      enunciado: e.enunciado,
      respuestaDada: resultados[i]?.respuestaDada ?? null,
      respuestaCorrecta: null,
      correcto: resultados[i]?.correcto ?? false,
    }));
    void pedir(`/api/estudiante/tareas/${tareaId}/entregar`, {
      metodo: "POST",
      cuerpo: { puntaje, completada: true, detalle },
    }).then((r) => {
      setIntentosHechos((n) => n + 1);
      setEnvioTarea(r.ok ? "lista" : "error");
    });
  }, [tareaCompleta, envioTarea, aciertos, total, tareaId, ejercicios, resultados]);

  // El desglose de resultados pide la respuesta correcta SÓLO una vez
  // entregada —el servidor hace cumplir esto igual, por si acaso—: antes
  // sería un atajo para adivinar la respuesta a fuerza de intentos.
  useEffect(() => {
    if (envioTarea !== "lista") return;
    void pedir<{ ejercicios: { id: string; respuestaCorrecta: string }[] }>(
      `/api/estudiante/tareas/${tareaId}/resultado`,
    ).then((r) => {
      if (r.ok) {
        setRespuestasCorrectas(Object.fromEntries(r.datos.ejercicios.map((e) => [e.id, e.respuestaCorrecta])));
      }
    });
  }, [envioTarea, tareaId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {!tareaCompleta && (
          <div className="mt-1.5 space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">
              Ejercicio {slotActivo + 1} de {total}
            </p>
            {/* "El estudiante no puede saber cuántos intentos tiene
                permitidos ni cuántos le quedan" (corrección QA). */}
            <p className="text-xs text-muted-foreground">
              {limiteReintentos === 0
                ? `Intento ${intentosHechos + 1} (sin límite de intentos)`
                : `Intento ${intentosHechos + 1} de ${limiteReintentos}`}
            </p>
            <div className="flex items-center gap-1.5">
              {ejercicios.map((_, i) => {
                const estado = i === slotActivo ? "actual" : resultados[i] ? "completado" : "pendiente";
                return (
                  <button
                    key={i}
                    type="button"
                    title={`Ejercicio ${i + 1}: ${estado}`}
                    aria-pressed={revisando === i}
                    onClick={() => irAlEjercicio(i)}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors",
                      // Neutral mientras la tarea sigue en curso: verde aquí
                      // era el sesgo que reportó el cliente —el alumno
                      // asumía que había acertado con sólo ver el color—. El
                      // veredicto de verdad vive en la pantalla de cierre.
                      estado === "completado" &&
                        cn(
                          "bg-primary/20 text-primary hover:bg-primary/30",
                          revisando === i && "ring-2 ring-primary",
                        ),
                      estado === "actual" && "bg-primary text-primary-foreground",
                      estado === "pendiente" && "border bg-muted text-muted-foreground hover:bg-muted/70",
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            {revisando != null && resultados[revisando] && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Ejercicio {revisando + 1}</p>
                <p className="text-muted-foreground">
                  <TextoMatematico texto={ejercicios[revisando].enunciado} />
                </p>
                <p className="mt-1 font-medium">
                  Tu respuesta: <TextoMatematico texto={resultados[revisando].respuestaDada} />
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {tareaCompleta ? (
        <Card className="mx-auto max-w-lg border-2 border-primary">
          <CardHeader>
            <CardTitle>Tarea completada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {envioTarea === "enviando" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Registrando tu entrega…
              </p>
            )}
            {envioTarea === "lista" && (
              <>
                <p className="text-lg font-semibold">Nota: {Math.round((aciertos / total) * 100)}/100</p>
                <p className="text-sm text-muted-foreground">
                  {aciertos} de {total} ejercicios correctos.
                </p>
                {/* "El estudiante no tiene forma de saber en qué preguntas
                    acertó y en cuáles se equivocó" (corrección QA). */}
                <div className="flex flex-wrap gap-1.5">
                  {ejercicios.map((_, i) => {
                    const r = resultados[i];
                    if (!r) return null;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setRevisando((actual) => (actual === i ? null : i))}
                        aria-pressed={revisando === i}
                        title={`Ejercicio ${i + 1}: ${r.correcto ? "correcto" : "incorrecto"}`}
                        className={cn(
                          "flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold",
                          r.correcto
                            ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400"
                            : "bg-destructive/15 text-destructive hover:bg-destructive/25",
                          revisando === i && "ring-2 ring-offset-1",
                        )}
                      >
                        {i + 1} {r.correcto ? "✓" : "✗"}
                      </button>
                    );
                  })}
                </div>
                {revisando != null && resultados[revisando] && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">Ejercicio {revisando + 1}</p>
                    <p className="text-muted-foreground">
                      <TextoMatematico texto={ejercicios[revisando].enunciado} />
                    </p>
                    <p className="mt-1">
                      Tu respuesta: <TextoMatematico texto={resultados[revisando].respuestaDada} />
                    </p>
                    {!resultados[revisando].correcto && (
                      <p className="text-emerald-700 dark:text-emerald-400">
                        Respuesta correcta:{" "}
                        <TextoMatematico texto={respuestasCorrectas[ejercicios[revisando].id] ?? "…"} />
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href="/estudiante/tareas">Volver a mis tareas</Link>
                  </Button>
                  {puedenQuedarReintentos && (
                    <Button size="sm" variant="outline" onClick={reintentar}>
                      <RotateCcw className="h-4 w-4" />
                      Reintentar para mejorar la nota
                    </Button>
                  )}
                </div>
              </>
            )}
            {envioTarea === "error" && (
              <p className="text-sm text-destructive">
                No se pudo registrar la entrega. Vuelve a intentarlo desde{" "}
                <Link href="/estudiante/tareas" className="underline">
                  Mis tareas
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        activo && (
          // `key={activo.id}` por si acaso: fuerza un remontaje limpio del
          // formulario al cambiar de ejercicio, en vez de depender de que
          // cada pieza de estado se reinicie a mano una por una.
          <Card key={activo.id} className="mx-auto max-w-2xl">
            <CardContent className="space-y-4 pt-6">
              <div className="text-base">
                <TextoMatematico texto={activo.enunciado} />
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void responder();
                }}
              >
                <Input
                  autoFocus
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  placeholder="Tu respuesta"
                  aria-label="Tu respuesta"
                  disabled={corrigiendo}
                />
                <Button type="submit" disabled={!borrador.trim() || corrigiendo}>
                  {corrigiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Responder"}
                </Button>
              </form>
              {aviso && <p className="text-sm text-destructive">{aviso}</p>}

              {/* ── El tutor ───────────────────────────────────────────── */}
              {mensajeTutor && (
                <p role="status" data-testid="mensaje-tutor" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {mensajeTutor}
                </p>
              )}
              {pistas.length > 0 && (
                <ol data-testid="pistas-tutor" className="list-decimal space-y-1 pl-5 text-sm">
                  {pistas.map((p, i) => (
                    <li key={i}>
                      <TextoMatematico texto={p} />
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={pedirPistaTutor} disabled={ocupadoTutor} data-testid="pedir-pista">
                  💡 Pedir una pista
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => registrar(slotActivo, false, "(sin resolver)")}
                  data-testid="no-se"
                >
                  No sé: pasar al siguiente
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* Repaso breve: la pizarra con el procedimiento del tema, dentro de la tarea. */}
      {repaso && (
        <Card data-testid="repaso" className="border-2 border-amber-500/60">
          <CardHeader>
            <CardTitle>Repaso breve: {repaso.titulo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PizarraAlumno procedimiento={repaso.vista} />
            <Button onClick={terminarRepaso} disabled={ocupadoTutor} data-testid="terminar-repaso">
              He terminado el repaso: volver al ejercicio
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Ejercicio equivalente propuesto por el tutor. */}
      {equivalente && (
        <Card data-testid="equivalente" className="border-2 border-primary/50">
          <CardHeader>
            <CardTitle>Para afianzarlo: un ejercicio parecido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-base">
              <TextoMatematico texto={equivalente.enunciado} />
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void comprobarEquivalente();
              }}
            >
              <Input
                value={respEq}
                onChange={(e) => setRespEq(e.target.value)}
                placeholder="Tu respuesta"
                aria-label="Respuesta al ejercicio parecido"
                disabled={ocupadoTutor}
              />
              <Button type="submit" disabled={!respEq.trim() || ocupadoTutor}>
                Comprobar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEquivalente(null)}>
                Cerrar
              </Button>
            </form>
            {veredictoEq && (
              <p data-testid="veredicto-equivalente" data-tipo={veredictoEq} className="text-sm">
                {veredictoEq === "ok" ? "¡Muy bien! Lo has resuelto." : "Todavía no. Inténtalo otra vez o ciérralo y sigue."}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
