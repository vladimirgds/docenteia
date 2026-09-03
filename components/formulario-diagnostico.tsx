"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { Math, TextoMatematico } from "@/components/math";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DESCRIPCION_NIVEL, ETIQUETA_NIVEL } from "@/lib/diagnostico/clasificar";

interface Pregunta {
  id: string;
  /**
   * De opción múltiple (catálogo) o de respuesta abierta (banco del docente).
   *
   * Las dos conviven en la misma prueba desde el MVP 2: el catálogo aporta las
   * preguntas calibradas por nivel y el banco, las que ha escrito el profesor
   * para ese nivel. Se corrigen igual de bien —las abiertas, con el mismo motor
   * determinista que la práctica—, pero no se responden igual.
   */
  tipo: "opcion_multiple" | "respuesta_abierta";
  tema: string | null;
  enunciado: string;
  expresion?: string | null;
  opciones?: Array<{ id: string; texto: string }>;
}

interface Resultado {
  aciertos: number;
  total: number;
  nivel: keyof typeof ETIQUETA_NIVEL;
}

/**
 * Evaluación diagnóstica: una pregunta por pantalla.
 *
 * La corrección NO ocurre aquí. Este componente sólo recoge las respuestas y
 * las envía; quién acierta y qué nivel sale de ello lo decide el servidor con
 * la regla de corte determinista. El navegador nunca recibe la clave.
 */
export function FormularioDiagnostico({
  preguntas,
  nivel,
  curso,
}: {
  preguntas: Pregunta[];
  /** Nivel con el que se ha compuesto la prueba. */
  nivel?: keyof typeof ETIQUETA_NIVEL;
  /** Curso declarado por el alumno, si lo hay. */
  curso?: string | null;
}) {
  const router = useRouter();
  const { update } = useSession();

  const [indice, setIndice] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Tiempo de respuesta por pregunta: alimenta la analítica del Paso 4.
  const inicioPregunta = useRef<number>(Date.now());
  const tiempos = useRef<Record<string, number>>({});

  const pregunta = preguntas[indice];
  const total = preguntas.length;
  const seleccion = pregunta ? respuestas[pregunta.id] : undefined;
  const respondida = Boolean(seleccion && seleccion.trim());
  const progreso = useMemo(
    () => (resultado ? 100 : (indice / total) * 100),
    [indice, total, resultado],
  );

  function registrarTiempo(id: string) {
    tiempos.current[id] = (tiempos.current[id] ?? 0) + (Date.now() - inicioPregunta.current);
    inicioPregunta.current = Date.now();
  }

  function avanzar() {
    if (!pregunta || !respondida) return;
    registrarTiempo(pregunta.id);
    if (indice < total - 1) setIndice(indice + 1);
  }

  function retroceder() {
    if (indice === 0) return;
    if (pregunta) registrarTiempo(pregunta.id);
    setIndice(indice - 1);
  }

  async function enviar() {
    if (!pregunta) return;
    registrarTiempo(pregunta.id);
    setEnviando(true);
    setError(null);

    const respuesta = await fetch("/api/diagnostico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        respuestas: preguntas.map((p) => ({
          preguntaId: p.id,
          respuestaDada: respuestas[p.id],
          tiempoMs: tiempos.current[p.id] ?? 0,
        })),
      }),
    });

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      setError(datos.error ?? "No se pudo enviar la evaluación.");
      setEnviando(false);
      return;
    }

    setResultado({ aciertos: datos.aciertos, total: datos.total, nivel: datos.nivel });
    // El nivel recién asignado se refresca en la sesión para que el resto de la
    // aplicación lo vea sin obligar a volver a entrar.
    await update({ nivelActual: datos.nivel });
    setEnviando(false);
  }

  const todasRespondidas = preguntas.every((p) => (respuestas[p.id] ?? "").trim());

  // ── Resultado ──────────────────────────────────────────────────────────────
  if (resultado) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto max-w-2xl space-y-6"
      >
        <Progress value={100} />
        <Card>
          <CardHeader className="text-center">
            <p className="text-sm text-muted-foreground">
              Has acertado {resultado.aciertos} de {resultado.total}
            </p>
            <CardTitle className="text-4xl">
              Nivel {ETIQUETA_NIVEL[resultado.nivel]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-muted-foreground">{DESCRIPCION_NIVEL[resultado.nivel]}</p>
            <Button
              size="lg"
              onClick={() => {
                router.push("/estudiante");
                router.refresh();
              }}
            >
              Ir a mi panel
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (!pregunta) return null;

  // ── Cuestionario ───────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Evaluación diagnóstica</h1>
          <span className="text-sm text-muted-foreground">
            {indice + 1} de {total}
          </span>
        </div>
        {nivel && (
          // Se dice con qué nivel se ha armado la prueba, y por qué. Un alumno
          // de 3.º de secundaria tiene que ver que las preguntas son de su
          // curso, no de un temario que aún no ha dado.
          <p className="text-sm text-muted-foreground">
            Preguntas de nivel <strong>{ETIQUETA_NIVEL[nivel]}</strong>
            {curso ? `, ajustadas a tu curso (${curso}).` : "."}
          </p>
        )}
        <Progress value={progreso} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={pregunta.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium leading-relaxed">
                {/* El enunciado es prosa con fórmulas intercaladas entre $…$:
                    sólo la matemática se compone con KaTeX. */}
                <TextoMatematico texto={pregunta.enunciado} />
              </CardTitle>
              {pregunta.expresion && (
                <div className="pt-2">
                  <Math expresion={pregunta.expresion} display />
                </div>
              )}
            </CardHeader>
            <CardContent>
              {pregunta.tipo === "respuesta_abierta" ? (
                <div className="space-y-2">
                  <Label htmlFor={`respuesta-${pregunta.id}`}>Tu respuesta</Label>
                  <Input
                    id={`respuesta-${pregunta.id}`}
                    value={seleccion ?? ""}
                    autoComplete="off"
                    placeholder="Escribe el resultado"
                    onChange={(e) =>
                      setRespuestas((prev) => ({ ...prev, [pregunta.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && respondida && indice < total - 1) avanzar();
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Se acepta cualquier forma equivalente: da igual el orden de los términos, y
                    7/2 vale lo mismo que 3,5.
                  </p>
                </div>
              ) : (
                <RadioGroup
                  value={seleccion ?? ""}
                  onValueChange={(valor) =>
                    setRespuestas((prev) => ({ ...prev, [pregunta.id]: valor }))
                  }
                  className="gap-3"
                >
                  {(pregunta.opciones ?? []).map((opcion) => (
                    <Label
                      key={opcion.id}
                      htmlFor={`${pregunta.id}-${opcion.id}`}
                      className="flex cursor-pointer items-center gap-3 rounded-md border p-4 transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent"
                    >
                      <RadioGroupItem
                        value={opcion.id}
                        id={`${pregunta.id}-${opcion.id}`}
                      />
                      <TextoMatematico texto={opcion.texto} />
                    </Label>
                  ))}
                </RadioGroup>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={retroceder} disabled={indice === 0 || enviando}>
          <ArrowLeft className="h-4 w-4" />
          Anterior
        </Button>

        {indice < total - 1 ? (
          <Button onClick={avanzar} disabled={!respondida}>
            Siguiente
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={enviar} disabled={!todasRespondidas || enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {enviando ? "Calculando tu nivel…" : "Terminar evaluación"}
          </Button>
        )}
      </div>
    </div>
  );
}
