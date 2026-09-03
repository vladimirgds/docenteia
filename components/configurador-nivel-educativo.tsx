"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, GraduationCap, Library, School } from "lucide-react";
import type { EtapaEducativa } from "@prisma/client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ETAPAS, describirCurso, etapaPorValor, etiquetaCurso } from "@/lib/curriculo/etapas";
import { cn } from "@/lib/utils";

/**
 * CONFIGURACIÓN DE NIVEL EDUCATIVO.
 *
 * Dos pasos —etapa y curso— antes de la evaluación inicial.
 *
 * POR QUÉ ES UNA PANTALLA PROPIA Y NO DOS CAMPOS DEL REGISTRO
 * De este dato depende TODO lo que el alumno va a recibir: los contenidos que
 * existen para él y las preguntas con las que se le mide. Escondido al final de
 * un formulario de alta se rellenaba a la ligera —o no se rellenaba— y el
 * sistema acababa sirviéndole derivadas a un chico de secundaria. Aquí se le
 * pregunta una vez, con las opciones a la vista y sin poder equivocarse de
 * rango: cada etapa sólo ofrece los cursos que tiene.
 */

const ICONO: Record<EtapaEducativa, typeof School> = {
  PRIMARIA: School,
  SECUNDARIA: Library,
  SUPERIOR: GraduationCap,
};

export function ConfiguradorNivelEducativo({
  etapaInicial = null,
  cursoInicial = null,
  /** A dónde ir al terminar. */
  destino = "/estudiante/diagnostico",
}: {
  etapaInicial?: EtapaEducativa | null;
  cursoInicial?: number | null;
  destino?: string;
}) {
  const router = useRouter();
  const [guardando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<EtapaEducativa | null>(etapaInicial);
  const [curso, setCurso] = useState<number | null>(cursoInicial);

  const datosEtapa = etapaPorValor(etapa ?? undefined);
  const listo = Boolean(etapa && curso);
  // El avance refleja los dos pasos: elegir etapa y elegir curso.
  const avance = etapa ? (curso ? 100 : 60) : 20;

  function elegirEtapa(valor: EtapaEducativa) {
    setEtapa(valor);
    // El curso se reinicia al cambiar de etapa: un "5.º" de secundaria no es un
    // "5.º" de superior, y arrastrarlo dejaría configurado un curso que el
    // alumno no ha elegido.
    setCurso(null);
    setError(null);
  }

  function guardar() {
    if (!etapa || !curso) return;
    setError(null);
    iniciar(async () => {
      const respuesta = await fetch("/api/estudiante/nivel-educativo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa, curso }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        setError(datos.error ?? "No se pudo guardar tu nivel educativo.");
        return;
      }
      router.push(destino);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Configuración de nivel educativo</h1>
        <p className="text-muted-foreground">
          Para que recibas contenidos y preguntas acordes a tu nivel curricular, define tu grado
          escolar actual.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Paso 1: la etapa ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Paso 1: selecciona tu etapa educativa</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {ETAPAS.map((e) => {
            const Icono = ICONO[e.valor];
            const activa = etapa === e.valor;
            return (
              <button
                key={e.valor}
                type="button"
                aria-pressed={activa}
                onClick={() => elegirEtapa(e.valor)}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  activa
                    ? "border-primary bg-accent"
                    : "hover:border-primary/40 hover:bg-accent/50",
                )}
              >
                <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
                  {e.rango}
                </span>
                <Icono className="h-10 w-10 text-primary" aria-hidden />
                <span className="text-sm font-semibold uppercase tracking-wide">{e.nombre}</span>
                <span className="text-xs text-muted-foreground">{e.descripcion}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Paso 2: el curso ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Paso 2: define tu {datosEtapa ? datosEtapa.unidad.toLowerCase() : "grado"} actual
        </h2>

        {!datosEtapa ? (
          <p className="text-sm text-muted-foreground">
            Elige antes tu etapa educativa: cada una tiene sus propios cursos.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: datosEtapa.cursos }, (_, i) => i + 1).map((n) => {
                const activo = curso === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setCurso(n)}
                    className={cn(
                      "flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-lg border transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      activo
                        ? "border-primary bg-accent"
                        : "hover:border-primary/40 hover:bg-accent/50",
                    )}
                  >
                    <span className="text-2xl font-semibold tabular-nums">{n}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {etiquetaCurso(datosEtapa.valor, n)}
                    </span>
                  </button>
                );
              })}
            </div>

            {listo && (
              <Card>
                <CardContent className="py-3 text-center text-sm">
                  Estás configurando tu nivel como:{" "}
                  <strong>{describirCurso(etapa, curso)}</strong>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>

      <div className="space-y-3">
        <Progress value={avance} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Configuración de perfil · {avance}%</span>
          <Button size="lg" onClick={guardar} disabled={!listo || guardando}>
            {guardando ? "Guardando…" : "Finalizar configuración y empezar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
