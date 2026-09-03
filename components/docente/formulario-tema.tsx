"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Math } from "@/components/math";
import { normalizarLatex } from "@/lib/matematicas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pedir } from "@/lib/docente/cliente";
import {
  ETAPAS,
  describirAlcance,
  etapaPorValor,
  etiquetaCurso,
} from "@/lib/curriculo/etapas";
import {
  DESCRIPCION_ESTADO,
  ESTADOS,
  ETIQUETA_ESTADO,
  ETIQUETA_NIVEL_CURRICULO,
  ETIQUETA_TIPO_REGLA,
  MOTORES_DISPONIBLES,
  NIVELES,
  TIPOS_REGLA,
  type Estado,
  type Nivel,
  type TipoRegla,
} from "@/lib/docente/curriculo";
import { cn } from "@/lib/utils";

/**
 * FORMULARIO ESTRUCTURADO DE TEMA Y REGLAS PEDAGÓGICAS.
 *
 * Es el entregable /docente/crear-tema del HITO 1, y sirve igual para crear que
 * para editar: la única diferencia es si hay `tema` de partida.
 *
 * Dos cosas merecen explicación:
 *
 *   · LAS REGLAS VIAJAN CON EL TEMA. El formulario envía el tema y su juego
 *     completo de reglas en UNA petición, que el servidor escribe en una
 *     transacción. Guardarlas por separado permitiría dejar un tema guardado
 *     con las reglas perdidas, que es el estado más molesto de todos: parece
 *     que se guardó y falta la mitad.
 *
 *   · LA NOTACIÓN SE VE MIENTRAS SE ESCRIBE. El enunciado formal es LaTeX, y un
 *     profesor no tiene por qué leer LaTeX de cabeza. Debajo de cada campo se
 *     compone con KaTeX lo que está escribiendo, que es exactamente lo que verá
 *     el alumno en la pizarra.
 */

export interface ReglaFormulario {
  id?: string;
  tipo: TipoRegla;
  nombre: string;
  enunciado: string;
  descripcion: string;
  ejemplo: string;
  nivel: string;
  practicable: boolean;
}

export interface TemaEdicion {
  id: string;
  clave: string;
  titulo: string;
  descripcion: string | null;
  materiaId: string | null;
  padreId: string | null;
  motor: string | null;
  nivel: string | null;
  etapa: string | null;
  cursoMin: number | null;
  orden: number;
  estado: Estado;
  objetivos: string[];
  etiquetas: string[];
  reglas: ReglaFormulario[];
}

interface Props {
  materias: Array<{ id: string; nombre: string }>;
  /** Candidatos a tema padre; al editar ya vienen sin el propio tema ni sus hijos. */
  posiblesPadres: Array<{ id: string; titulo: string }>;
  tema?: TemaEdicion | null;
  puedeEditar: boolean;
}

const REGLA_VACIA: ReglaFormulario = {
  tipo: "REGLA",
  nombre: "",
  enunciado: "",
  descripcion: "",
  ejemplo: "",
  nivel: "",
  practicable: false,
};

export function FormularioTema({ materias, posiblesPadres, tema, puedeEditar }: Props) {
  const router = useRouter();
  const [guardando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const [titulo, setTitulo] = useState(tema?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(tema?.descripcion ?? "");
  const [materiaId, setMateriaId] = useState(tema?.materiaId ?? "");
  const [padreId, setPadreId] = useState(tema?.padreId ?? "");
  const [motor, setMotor] = useState(tema?.motor ?? "");
  const [nivel, setNivel] = useState(tema?.nivel ?? "");
  const [etapa, setEtapa] = useState(tema?.etapa ?? "");
  const [cursoMin, setCursoMin] = useState(tema?.cursoMin ? String(tema.cursoMin) : "");
  const [orden, setOrden] = useState(String(tema?.orden ?? 0));
  const [estado, setEstado] = useState<Estado>(tema?.estado ?? "BORRADOR");
  const [objetivos, setObjetivos] = useState<string[]>(tema?.objetivos ?? [""]);
  const [etiquetas, setEtiquetas] = useState((tema?.etiquetas ?? []).join(", "));
  const [reglas, setReglas] = useState<ReglaFormulario[]>(tema?.reglas ?? []);

  const editando = Boolean(tema);
  const etapaElegida = etapaPorValor(etapa || undefined);

  const actualizarRegla = (indice: number, cambio: Partial<ReglaFormulario>) =>
    setReglas((actuales) => actuales.map((r, i) => (i === indice ? { ...r, ...cambio } : r)));

  const moverRegla = (indice: number, salto: number) =>
    setReglas((actuales) => {
      const destino = indice + salto;
      if (destino < 0 || destino >= actuales.length) return actuales;
      const copia = [...actuales];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });

  const guardar = () => {
    setError(null);
    setExito(null);

    if (titulo.trim().length < 3) {
      setError("El título del tema es obligatorio.");
      return;
    }
    const incompleta = reglas.findIndex(
      (r) => !r.nombre.trim() || !r.enunciado.trim() || !r.descripcion.trim(),
    );
    if (incompleta >= 0) {
      setError(
        `La regla ${incompleta + 1} está incompleta: necesita nombre, enunciado formal y explicación.`,
      );
      return;
    }

    const cuerpo = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      materiaId: materiaId || null,
      padreId: padreId || null,
      motor: motor || null,
      nivel: nivel || null,
      etapa: etapa || null,
      cursoMin: cursoMin ? Number(cursoMin) : null,
      orden: Number(orden) || 0,
      estado,
      objetivos: objetivos.map((o) => o.trim()).filter(Boolean),
      etiquetas: etiquetas
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
      reglas: reglas.map((r, i) => ({
        ...(r.id ? { id: r.id } : {}),
        tipo: r.tipo,
        nombre: r.nombre.trim(),
        // La barra duplicada que deja un copiado desde código se corrige antes
        // de guardar, no sólo en la vista previa: lo que se almacena es lo que
        // verá el alumno en la pizarra.
        enunciado: normalizarLatex(r.enunciado.trim()),
        descripcion: r.descripcion.trim(),
        ejemplo: normalizarLatex(r.ejemplo.trim()) || null,
        // Vacío significa "hereda el nivel del tema", no "sin nivel".
        nivel: r.nivel || null,
        practicable: motor ? r.practicable : false,
        orden: i,
      })),
    };

    iniciar(async () => {
      const r = tema
        ? await pedir(`/api/docente/temas/${tema.id}`, { metodo: "PATCH", cuerpo })
        : await pedir("/api/docente/temas", { metodo: "POST", cuerpo });

      if (!r.ok) {
        setError(r.error);
        return;
      }
      setExito(
        editando
          ? "Tema actualizado."
          : "Tema creado. Ya puedes añadirle ejercicios desde el banco.",
      );
      router.refresh();
      // Al crear se vuelve al listado, que es donde el docente decide el
      // siguiente paso; al editar se permanece, porque lo normal es seguir
      // ajustando el mismo tema.
      if (!editando) router.push("/docente/curriculo");
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {exito && (
        <div role="status" className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          {exito}
        </div>
      )}

      {/* ── Identidad del tema ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{editando ? "Editar tema" : "Nuevo tema"}</CardTitle>
          <CardDescription>
            {editando
              ? `Clave: ${tema?.clave} — no cambia al renombrar el tema, porque hay contenido que la cita.`
              : "La clave se genera automáticamente a partir del título."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              value={titulo}
              placeholder="Ecuaciones de primer grado"
              onChange={(e) => setTitulo(e.target.value)}
              disabled={!puedeEditar}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              value={descripcion}
              placeholder="Qué se aprende en este tema y para qué sirve."
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={!puedeEditar}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="materia">Asignatura</Label>
            <Select
              id="materia"
              value={materiaId}
              onChange={(e) => setMateriaId(e.target.value)}
              disabled={!puedeEditar}
            >
              <option value="">Sin asignatura</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="padre">Tema padre</Label>
            <Select
              id="padre"
              value={padreId}
              onChange={(e) => setPadreId(e.target.value)}
              disabled={!puedeEditar}
            >
              <option value="">Ninguno (tema principal)</option>
              {posiblesPadres.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titulo}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Si eliges un padre, este tema aparece como subtema suyo.
            </p>
          </div>

          <div className="space-y-2">
            {/* Dificultad, no nivel educativo: eso es la etapa, y se decide en
                el bloque de alcance curricular. */}
            <Label htmlFor="nivel">Dificultad</Label>
            <Select
              id="nivel"
              value={nivel}
              onChange={(e) => setNivel(e.target.value)}
              disabled={!puedeEditar}
            >
              <option value="">Sin dificultad asignada</option>
              {NIVELES.map((n) => (
                <option key={n} value={n}>
                  {ETIQUETA_NIVEL_CURRICULO[n as Nivel]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orden">Orden</Label>
            <Input
              id="orden"
              type="number"
              min={0}
              max={999}
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              disabled={!puedeEditar}
            />
            <p className="text-xs text-muted-foreground">Menor número, más arriba en el listado.</p>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              La <strong>dificultad</strong> gradúa lo que cuesta el tema dentro de su etapa; a qué
              alumnos les llega lo decide el <strong>alcance curricular</strong>, más abajo.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Alcance curricular ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Alcance curricular</CardTitle>
          <CardDescription>
            A partir de qué punto del sistema educativo se plantea este tema. Es distinto del
            nivel: el nivel dice <em>cuánto cuesta</em> dentro de su etapa, y esto dice{" "}
            <em>a qué alumnos les toca</em>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="etapa">Etapa educativa</Label>
            <Select
              id="etapa"
              value={etapa}
              onChange={(e) => {
                setEtapa(e.target.value);
                // El curso se reinicia: un 5.º de secundaria no es un 5.º ciclo
                // de superior, y arrastrarlo dejaría un alcance que nadie eligió.
                setCursoMin("");
              }}
              disabled={!puedeEditar}
            >
              <option value="">Cualquier etapa (transversal)</option>
              {ETAPAS.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.nombre} — {e.rango}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cursoMin">
              A partir de{etapaElegida ? ` (${etapaElegida.unidad.toLowerCase()})` : ""}
            </Label>
            <Select
              id="cursoMin"
              value={cursoMin}
              onChange={(e) => setCursoMin(e.target.value)}
              disabled={!puedeEditar || !etapaElegida}
            >
              <option value="">Desde el principio de la etapa</option>
              {Array.from({ length: etapaElegida?.cursos ?? 0 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {etiquetaCurso(etapaElegida!.valor, n)}
                </option>
              ))}
            </Select>
          </div>

          <p className="text-sm text-muted-foreground sm:col-span-2">
            {etapa ? (
              <>
                Se plantea <strong>{describirAlcance({ etapa: etapa as never, cursoMin: cursoMin ? Number(cursoMin) : null })}</strong>{" "}
                en adelante. Los alumnos de etapas anteriores no lo verán.
              </>
            ) : (
              "Sin etapa, el tema se considera transversal y puede llegarle a cualquier alumno."
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── Objetivos y etiquetas ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Objetivos de aprendizaje</CardTitle>
          <CardDescription>Qué debe saber hacer el alumno al terminar el tema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {objetivos.map((objetivo, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={objetivo}
                placeholder={`Objetivo ${i + 1}`}
                onChange={(e) =>
                  setObjetivos((actuales) =>
                    actuales.map((o, j) => (j === i ? e.target.value : o)),
                  )
                }
                disabled={!puedeEditar}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar objetivo ${i + 1}`}
                disabled={!puedeEditar}
                onClick={() => setObjetivos((actuales) => actuales.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!puedeEditar}
            onClick={() => setObjetivos((actuales) => [...actuales, ""])}
          >
            Añadir objetivo
          </Button>

          <div className="space-y-2 pt-2">
            <Label htmlFor="etiquetas">Etiquetas</Label>
            <Input
              id="etiquetas"
              value={etiquetas}
              placeholder="unidad 3, refuerzo, selectividad"
              onChange={(e) => setEtiquetas(e.target.value)}
              disabled={!puedeEditar}
            />
            <p className="text-xs text-muted-foreground">
              Separadas por comas. Sirven para buscar y agrupar temas de asignaturas distintas.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Reglas pedagógicas ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Reglas y propiedades</CardTitle>
            <CardDescription>
              Lo que el tutor explica antes de practicar. Las reglas publicadas de un tema con motor
              aparecen en la lección del alumno.
              <span className="mt-1 block">
                El <strong>nivel de cada regla es opcional</strong>: si lo dejas en "Hereda del
                tema", la regla usa el nivel del tema y lo sigue si mañana lo cambias. Sólo se
                indica uno propio para marcar una regla más difícil —o más fácil— que el resto del
                tema; eso afecta a cómo se gradúan sus ejercicios, no a quién los recibe, que lo
                decide el alcance curricular.
              </span>
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!puedeEditar}
            onClick={() => setReglas((actuales) => [...actuales, { ...REGLA_VACIA }])}
          >
            Añadir regla
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {reglas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Este tema todavía no tiene reglas. Puedes guardarlo así y añadirlas más adelante.
            </p>
          )}

          {reglas.map((regla, i) => (
            <div key={regla.id ?? `nueva-${i}`} className="space-y-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="contorno">#{i + 1}</Badge>
                <Select
                  aria-label={`Tipo de la regla ${i + 1}`}
                  className="h-9 w-auto"
                  value={regla.tipo}
                  onChange={(e) => actualizarRegla(i, { tipo: e.target.value as TipoRegla })}
                  disabled={!puedeEditar}
                >
                  {TIPOS_REGLA.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA_TIPO_REGLA[t as TipoRegla]}
                    </option>
                  ))}
                </Select>
                <div className="ml-auto flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Subir regla"
                    disabled={!puedeEditar || i === 0}
                    onClick={() => moverRegla(i, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Bajar regla"
                    disabled={!puedeEditar || i === reglas.length - 1}
                    onClick={() => moverRegla(i, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!puedeEditar}
                    onClick={() => setReglas((actuales) => actuales.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`nombre-${i}`}>Nombre</Label>
                  <Input
                    id={`nombre-${i}`}
                    value={regla.nombre}
                    placeholder="Regla de la potencia"
                    onChange={(e) => actualizarRegla(i, { nombre: e.target.value })}
                    disabled={!puedeEditar}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`enunciado-${i}`}>Enunciado formal (LaTeX)</Label>
                  <Input
                    id={`enunciado-${i}`}
                    value={regla.enunciado}
                    placeholder={"\\frac{d}{dx}(x^n) = n x^{n-1}"}
                    onChange={(e) => actualizarRegla(i, { enunciado: e.target.value })}
                    disabled={!puedeEditar}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sintaxis KaTeX, con UNA barra invertida:{" "}
                    <code>{"\\frac{a}{b}"}</code>, <code>{"x^{2}"}</code>,{" "}
                    <code>{"\\sqrt{x}"}</code>. Si pegas la fórmula desde código y llega con la
                    barra duplicada, se corrige sola.
                  </p>
                  {regla.enunciado.trim() && (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                      <Math expresion={normalizarLatex(regla.enunciado)} display />
                    </div>
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`explicacion-${i}`}>Explicación en castellano</Label>
                  <Textarea
                    id={`explicacion-${i}`}
                    value={regla.descripcion}
                    placeholder="Se baja el exponente como coeficiente y se resta uno al exponente."
                    onChange={(e) => actualizarRegla(i, { descripcion: e.target.value })}
                    disabled={!puedeEditar}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`ejemplo-${i}`}>Ejemplo (LaTeX, opcional)</Label>
                  <Input
                    id={`ejemplo-${i}`}
                    value={regla.ejemplo}
                    placeholder={"\\frac{d}{dx}(3x^4) = 12x^3"}
                    onChange={(e) => actualizarRegla(i, { ejemplo: e.target.value })}
                    disabled={!puedeEditar}
                  />
                  {regla.ejemplo.trim() && (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                      <Math expresion={normalizarLatex(regla.ejemplo)} display />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`nivel-regla-${i}`}>Dificultad</Label>
                  <Select
                    id={`nivel-regla-${i}`}
                    value={regla.nivel}
                    onChange={(e) => actualizarRegla(i, { nivel: e.target.value })}
                    disabled={!puedeEditar}
                  >
                    {/* El vacío no es "sin nivel": es HEREDAR el del tema. Dejarlo
                        así mantiene la regla en su sitio cuando el tema cambia de
                        nivel, en vez de congelar una copia que se queda vieja. */}
                    <option value="">
                      Hereda del tema
                      {nivel ? ` (${ETIQUETA_NIVEL_CURRICULO[nivel as Nivel]})` : " (sin nivel)"}
                    </option>
                    {NIVELES.map((n) => (
                      <option key={n} value={n}>
                        {ETIQUETA_NIVEL_CURRICULO[n as Nivel]}
                      </option>
                    ))}
                  </Select>
                </div>

                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={regla.practicable && Boolean(motor)}
                    onChange={(e) => actualizarRegla(i, { practicable: e.target.checked })}
                    // Sin motor no hay nada que pueda calificar la práctica de
                    // esta regla: marcarlo dejaría guardada una promesa que el
                    // sistema no puede cumplir.
                    disabled={!puedeEditar || !motor}
                  />
                  <span>
                    Se puede practicar
                    <span className="block text-xs text-muted-foreground">
                      {motor
                        ? `El motor "${MOTORES_DISPONIBLES.find((m) => m.motor === motor)?.titulo ?? motor}" calificará los ejercicios de esta regla.`
                        : "No disponible: elige antes un motor de corrección, en el bloque de más abajo; sin él nadie puede calificar esta práctica."}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Motor de corrección ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Motor de corrección</CardTitle>
          <CardDescription>
            Decide si los ejercicios de este tema se pueden calificar solos, con matemática
            garantizada y sin intervención de la IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={motor}
            onChange={(e) => {
              const elegido = e.target.value;
              setMotor(elegido);
              // Al quitar el motor, ninguna regla puede seguir marcada como
              // practicable: sin motor no hay quien califique esa práctica, y
              // dejarlo marcado guardaría una incoherencia.
              if (!elegido) {
                setReglas((actuales) => actuales.map((r) => ({ ...r, practicable: false })));
              }
            }}
            disabled={!puedeEditar}
          >
            <option value="">Sin motor (corrección manual)</option>
            {MOTORES_DISPONIBLES.map((m) => (
              <option key={m.motor} value={m.motor}>
                {m.titulo} — {m.descripcion}
              </option>
            ))}
          </Select>

          {motor ? (
            <p className="text-sm text-muted-foreground">
              Los ejercicios de este tema se validarán contra el motor antes de guardarse, y el
              alumno recibirá corrección automática.
            </p>
          ) : (
            <div className="rounded-md border border-amber-600/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
              Sin motor, los ejercicios de este tema se guardan <strong>sin verificar</strong> y no
              se pueden autocorregir: tendrás que indicar tú la respuesta correcta y calificarlos a
              mano.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Publicación ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Publicación</CardTitle>
          <CardDescription>{DESCRIPCION_ESTADO[estado]}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select
            className="w-auto"
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado)}
            disabled={!puedeEditar}
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e as Estado]}
              </option>
            ))}
          </Select>

          <Button onClick={guardar} disabled={!puedeEditar || guardando} className={cn("ml-auto")}>
            {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear tema"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/docente/curriculo")}
            disabled={guardando}
          >
            Volver al currículo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
