"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Math as Formula } from "@/components/math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pedir } from "@/lib/docente/cliente";
import { ETIQUETA_ESTADO, etiquetaMotor, type Estado } from "@/lib/docente/curriculo";
import type { Ficha } from "@/lib/docente/fichas-metodo";
import type { InformeFicha } from "@/lib/docente/fichas-verificar";
import { planoALatex } from "@/lib/matematicas";

/**
 * EDITOR DE FICHAS DE MÉTODO (PMV 3 · HITO 5A).
 *
 * El docente define aquí CUÁNDO se aplica un método (patrón de entrada), qué
 * variables extrae, bajo qué condiciones, qué pasos sigue, qué operaciones usa y
 * qué pistas ofrece —sin tocar código ni desplegar—. «Probar» verifica la ficha
 * con el motor (en los ejemplos y en casos que genera el servidor) y marca lo que
 * el motor no sabe comprobar como PENDIENTE. Publicar exige la aprobación
 * expresa del docente. Cada cambio de contenido crea una VERSIÓN.
 */

export interface TemaFicha {
  id: string;
  titulo: string;
  motor: string | null;
}

export interface FichaVista {
  id: string;
  nodoId: string | null;
  titulo: string;
  motor: string | null;
  contenido: Ficha;
  version: number;
  publicadaVersion: number | null;
  origen: string;
  estado: Estado;
  verificada: boolean;
  pendienteValidacion: boolean;
  validacion: InformeFicha | Record<string, never>;
  aprobadaEn: string | null;
  nodo: { titulo: string } | null;
}

interface Props {
  temas: TemaFicha[];
  fichas: FichaVista[];
  operaciones: Record<string, Record<string, string>>;
  puedeEditar: boolean;
}

interface VariableForm {
  nombre: string;
  tipo: "entero" | "natural" | "positivo";
  calculada: string;
  min: string;
  max: string;
  descripcion: string;
}
interface PasoForm {
  explica: string;
  escribe: string;
  tipo: "transformacion" | "definicion" | "resultado";
  regla: string;
  /** Un término por línea: «texto => explicación». */
  terminos: string;
}
interface Formulario {
  id: string | null;
  nodoId: string;
  titulo: string;
  descripcion: string;
  patron: string;
  variables: VariableForm[];
  condiciones: string;
  operaciones: string[];
  pasos: PasoForm[];
  ejemplos: string;
  pistas: string;
  pistasDeError: { texto: string; omiteFactor: string; respuestaErronea: string }[];
}

const VARIABLE_VACIA: VariableForm = { nombre: "", tipo: "entero", calculada: "", min: "", max: "", descripcion: "" };
const PASO_VACIO: PasoForm = { explica: "", escribe: "", tipo: "transformacion", regla: "", terminos: "" };
const nuevoFormulario = (nodoId: string): Formulario => ({
  id: null,
  nodoId,
  titulo: "",
  descripcion: "",
  patron: "",
  variables: [{ ...VARIABLE_VACIA }],
  condiciones: "",
  operaciones: [],
  pasos: [{ ...PASO_VACIO }],
  ejemplos: "",
  pistas: "",
  pistasDeError: [],
});

function deFicha(id: string, nodoId: string, f: Ficha): Formulario {
  return {
    id,
    nodoId,
    titulo: f.titulo,
    descripcion: f.descripcion ?? "",
    patron: f.patron,
    variables: f.variables.map((v) => ({
      nombre: v.nombre,
      tipo: v.tipo,
      calculada: v.calculada ?? "",
      min: v.min === undefined ? "" : String(v.min),
      max: v.max === undefined ? "" : String(v.max),
      descripcion: v.descripcion ?? "",
    })),
    condiciones: f.condiciones.join("\n"),
    operaciones: f.operaciones,
    pasos: f.pasos.map((p) => ({
      explica: p.explica,
      escribe: p.escribe,
      tipo: p.tipo,
      regla: p.regla ?? "",
      terminos: (p.terminos ?? []).map((t) => `${t.texto} => ${t.explica}`).join("\n"),
    })),
    ejemplos: f.ejemplos.join("\n"),
    pistas: f.pistas.join("\n"),
    pistasDeError: f.pistasDeError.map((p) => ({ texto: p.texto, omiteFactor: p.omiteFactor ?? "", respuestaErronea: p.respuestaErronea ?? "" })),
  };
}

const lineas = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
const numero = (t: string) => (t.trim() === "" || Number.isNaN(Number(t)) ? undefined : Number(t));

function aFicha(f: Formulario): unknown {
  return {
    titulo: f.titulo.trim(),
    descripcion: f.descripcion.trim() || null,
    patron: f.patron.trim(),
    variables: f.variables
      .filter((v) => v.nombre.trim())
      .map((v) => ({
        nombre: v.nombre.trim(),
        tipo: v.tipo,
        descripcion: v.descripcion.trim() || null,
        calculada: v.calculada.trim() || null,
        ...(numero(v.min) !== undefined ? { min: numero(v.min) } : {}),
        ...(numero(v.max) !== undefined ? { max: numero(v.max) } : {}),
      })),
    condiciones: lineas(f.condiciones),
    operaciones: f.operaciones,
    pasos: f.pasos.map((p) => ({
      explica: p.explica.trim(),
      escribe: p.escribe.trim(),
      tipo: p.tipo,
      regla: p.regla.trim() || null,
      terminos: lineas(p.terminos)
        .map((l) => {
          const i = l.indexOf("=>");
          return i < 0 ? null : { texto: l.slice(0, i).trim(), explica: l.slice(i + 2).trim() };
        })
        .filter((t): t is { texto: string; explica: string } => Boolean(t && t.texto && t.explica)),
    })),
    ejemplos: lineas(f.ejemplos),
    pistas: lineas(f.pistas),
    pistasDeError: f.pistasDeError
      .filter((p) => p.texto.trim())
      .map((p) => ({ texto: p.texto.trim(), omiteFactor: p.omiteFactor.trim() || null, respuestaErronea: p.respuestaErronea.trim() || null })),
  };
}

const COLOR_CASO: Record<string, string> = {
  verificado: "text-emerald-700 dark:text-emerald-300",
  incorrecto: "text-destructive",
  pendiente: "text-amber-700 dark:text-amber-300",
  no_encaja: "text-destructive",
};
const ROTULO_CASO: Record<string, string> = {
  verificado: "Verificado",
  incorrecto: "Incorrecto",
  pendiente: "Pendiente",
  no_encaja: "No encaja",
};

interface Aplicacion {
  problema: string;
  resultado: string;
  pasos: { escribe: string; explica: string; tipo: string }[];
  motor: { verificado: boolean; pasos: { indice: number; estado: string; detalle: string }[]; errores: string[] };
  ejercicio: { validado: boolean; errores: string[] };
  guardado: { guardados: unknown[] } | null;
}

interface VersionFila {
  version: number;
  nota: string | null;
  verificada: boolean;
  pendienteValidacion: boolean;
  creadoEn: string;
  autor: { nombre: string } | null;
}

export function GestorFichas({ temas, fichas, operaciones, puedeEditar }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [form, setForm] = useState<Formulario>(nuevoFormulario(temas[0]?.id ?? ""));
  const [informe, setInforme] = useState<InformeFicha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [aprobada, setAprobada] = useState(false);
  const [seleccionada, setSeleccionada] = useState<FichaVista | null>(null);

  const [iaTitulo, setIaTitulo] = useState("");
  const [iaEjemplo, setIaEjemplo] = useState("");
  const [iaIndicaciones, setIaIndicaciones] = useState("");
  const [iaAviso, setIaAviso] = useState<string | null>(null);

  const [problemaNuevo, setProblemaNuevo] = useState("");
  const [aplicacion, setAplicacion] = useState<Aplicacion | null>(null);
  const [versiones, setVersiones] = useState<VersionFila[]>([]);

  const tema = temas.find((t) => t.id === form.nodoId) ?? null;
  const catalogo = tema?.motor ? (operaciones[tema.motor] ?? {}) : {};

  const cambiar = (c: Partial<Formulario>) => {
    setForm((f) => ({ ...f, ...c }));
    setInforme(null);
    setExito(null);
  };
  const cambiarVariable = (i: number, c: Partial<VariableForm>) => cambiar({ variables: form.variables.map((v, j) => (j === i ? { ...v, ...c } : v)) });
  const cambiarPaso = (i: number, c: Partial<PasoForm>) => cambiar({ pasos: form.pasos.map((p, j) => (j === i ? { ...p, ...c } : p)) });
  const mover = (i: number, d: -1 | 1) => {
    const pasos = [...form.pasos];
    [pasos[i], pasos[i + d]] = [pasos[i + d], pasos[i]];
    cambiar({ pasos });
  };

  const cargarVersiones = async (id: string) => {
    const r = await pedir<{ versiones: VersionFila[] }>(`/api/docente/fichas-metodo/${id}/versiones`);
    setVersiones(r.ok ? r.datos.versiones : []);
  };

  const abrir = (f: FichaVista) => {
    setSeleccionada(f);
    setForm(deFicha(f.id, f.nodoId ?? "", f.contenido));
    setInforme(Object.keys(f.validacion).length ? (f.validacion as InformeFicha) : null);
    setError(null);
    setExito(null);
    setAprobada(false);
    setAplicacion(null);
    void cargarVersiones(f.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const nueva = () => {
    setSeleccionada(null);
    setForm(nuevoFormulario(temas[0]?.id ?? ""));
    setInforme(null);
    setVersiones([]);
    setAplicacion(null);
    setAprobada(false);
  };

  const probar = () => {
    setError(null);
    iniciar(async () => {
      const r = await pedir<{ informe: InformeFicha }>("/api/docente/fichas-metodo/probar", {
        metodo: "POST",
        cuerpo: { nodoId: form.nodoId, ficha: aFicha(form) },
      });
      if (r.ok) setInforme(r.datos.informe);
      else setError(r.error);
    });
  };

  const guardar = () => {
    setError(null);
    setExito(null);
    iniciar(async () => {
      const r = form.id
        ? await pedir<{ ficha: FichaVista; informe: InformeFicha; versionNueva?: boolean }>(`/api/docente/fichas-metodo/${form.id}`, {
            metodo: "PATCH",
            cuerpo: { ficha: aFicha(form), nodoId: form.nodoId },
          })
        : await pedir<{ ficha: FichaVista; informe: InformeFicha }>("/api/docente/fichas-metodo", {
            metodo: "POST",
            cuerpo: { nodoId: form.nodoId, ficha: aFicha(form) },
          });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setInforme(r.datos.informe);
      setExito(form.id ? `Guardado: versión ${r.datos.ficha.version}.` : "Borrador guardado (versión 1).");
      setForm((f) => ({ ...f, id: r.datos.ficha.id }));
      // La ficha guardada (nueva o editada) pasa a ser la seleccionada: de ella cuelgan
      // «Reutilizar», «Aprobar y publicar» y el historial de versiones.
      setSeleccionada(r.datos.ficha);
      void cargarVersiones(r.datos.ficha.id);
      router.refresh();
    });
  };

  const publicar = (confirmar = false) => {
    if (!form.id) return;
    setError(null);
    setExito(null);
    iniciar(async () => {
      const r = await pedir<{ ficha: FichaVista }>(`/api/docente/fichas-metodo/${form.id}`, {
        metodo: "PATCH",
        cuerpo: { estado: "PUBLICADO", aprobar: true, ...(confirmar ? { confirmarPendientes: true } : {}) },
      });
      if (r.ok) {
        setExito(`Publicada la versión ${r.datos.ficha.publicadaVersion}: ya la ven los alumnos de tus aulas.`);
        setAprobada(false);
        void cargarVersiones(form.id!);
        router.refresh();
      } else if (r.estado === 422 && /confirmando expresamente/.test(r.error) && window.confirm(`${r.error}\n\n¿Publicarla con casos pendientes de validación automática?`)) {
        publicar(true);
      } else {
        setError(r.error);
      }
    });
  };

  const cambiarEstado = (f: FichaVista, estado: Estado) =>
    iniciar(async () => {
      setError(null);
      const r = await pedir(`/api/docente/fichas-metodo/${f.id}`, { metodo: "PATCH", cuerpo: { estado } });
      if (r.ok) {
        setExito("Cambio guardado.");
        router.refresh();
      } else setError(r.error);
    });

  const borrar = (f: FichaVista) => {
    if (!window.confirm("¿Borrar esta ficha?")) return;
    iniciar(async () => {
      const r = await pedir(`/api/docente/fichas-metodo/${f.id}`, { metodo: "DELETE" });
      if (r.ok) {
        if (form.id === f.id) nueva();
        setExito("Ficha borrada.");
        router.refresh();
      } else setError(r.error);
    });
  };

  const generarConIA = () => {
    setError(null);
    setExito(null);
    setIaAviso(null);
    if (!iaTitulo.trim()) {
      setError("Escribe qué método quieres (por ejemplo «suma de fracciones»).");
      return;
    }
    iniciar(async () => {
      const r = await pedir<{ ficha: FichaVista; informe: InformeFicha; aviso: string | null }>("/api/docente/fichas-metodo/borrador-ia", {
        metodo: "POST",
        cuerpo: { nodoId: form.nodoId, titulo: iaTitulo.trim(), ejemplo: iaEjemplo.trim() || undefined, indicaciones: iaIndicaciones.trim() || undefined },
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setIaAviso(r.datos.aviso);
      abrir({ ...r.datos.ficha, validacion: r.datos.informe });
      setExito(
        `Borrador generado${r.datos.informe.verificada ? " y verificado por el motor" : ", con casos por revisar"}. Revísalo, pruébalo y apruébalo para publicarlo.`,
      );
      router.refresh();
    });
  };

  const aplicar = (crear: boolean) => {
    if (!form.id) return;
    setError(null);
    iniciar(async () => {
      const r = await pedir<Aplicacion>(`/api/docente/fichas-metodo/${form.id}/aplicar`, {
        metodo: "POST",
        cuerpo: { problema: problemaNuevo.trim(), crearEjercicio: crear || undefined },
      });
      if (r.ok) {
        setAplicacion(r.datos);
        if (crear) router.refresh();
      } else {
        setAplicacion(null);
        setError(r.error);
      }
    });
  };

  const restaurar = (v: number) =>
    iniciar(async () => {
      if (!form.id) return;
      const r = await pedir<{ ficha: FichaVista; informe: InformeFicha }>(`/api/docente/fichas-metodo/${form.id}/versiones`, {
        metodo: "POST",
        cuerpo: { version: v },
      });
      if (r.ok) {
        setForm(deFicha(form.id, form.nodoId, r.datos.ficha.contenido));
        setInforme(r.datos.informe);
        setExito(`Restaurada la versión ${v} como versión ${r.datos.ficha.version}.`);
        void cargarVersiones(form.id);
        router.refresh();
      } else setError(r.error);
    });

  const plano = (t: string) => {
    try {
      return planoALatex(t);
    } catch {
      return t;
    }
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

      {temas.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay temas</CardTitle>
            <CardDescription>Una ficha pertenece a un tema, de donde hereda el motor de verificación.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        puedeEditar && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Pedir un borrador a la IA</CardTitle>
                <CardDescription>
                  Gemini propone la ficha con un formato estructurado que el servidor valida; después el motor la prueba con tus ejemplos y con casos
                  generados. Tú la revisas, la editas y la apruebas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="ia-tema">Tema</Label>
                    <Select id="ia-tema" value={form.nodoId} onChange={(e) => cambiar({ nodoId: e.target.value })}>
                      {temas.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.titulo}
                          {t.motor ? ` · ${etiquetaMotor(t.motor)}` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ia-metodo">Qué método quieres</Label>
                    <Input id="ia-metodo" value={iaTitulo} onChange={(e) => setIaTitulo(e.target.value)} placeholder="p. ej. suma de fracciones, regla de la cadena" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ia-ejemplo">Un problema de muestra (opcional)</Label>
                    <Input id="ia-ejemplo" className="font-mono" value={iaEjemplo} onChange={(e) => setIaEjemplo(e.target.value)} placeholder="(3x^2+1)^4" />
                  </div>
                </div>
                <Input aria-label="Indicaciones" maxLength={300} value={iaIndicaciones} onChange={(e) => setIaIndicaciones(e.target.value)} placeholder="Indicaciones (opcional)" />
                <div className="flex items-center gap-3">
                  <Button onClick={generarConIA} disabled={ocupado}>
                    {ocupado ? "Trabajando…" : "Pedir borrador"}
                  </Button>
                </div>
                {iaAviso && <p className="text-sm text-muted-foreground">{iaAviso}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{form.id ? `Editar ficha${seleccionada ? ` · versión ${seleccionada.version}` : ""}` : "Nueva ficha de método"}</CardTitle>
                  {form.id && (
                    <Button variant="outline" size="sm" onClick={nueva}>
                      Nueva ficha
                    </Button>
                  )}
                </div>
                <CardDescription>
                  {tema?.motor
                    ? `Se verificará con el motor «${etiquetaMotor(tema.motor)}», que hereda del tema.`
                    : "Este tema no tiene motor: todo quedará pendiente de validación automática."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="f-tema">Tema</Label>
                    <Select id="f-tema" value={form.nodoId} onChange={(e) => cambiar({ nodoId: e.target.value })}>
                      {temas.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.titulo}
                          {t.motor ? ` · ${etiquetaMotor(t.motor)}` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="f-titulo">Título</Label>
                    <Input id="f-titulo" value={form.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="f-desc">Descripción</Label>
                  <Textarea id="f-desc" value={form.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} className="min-h-16" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="f-patron">Patrón de entrada (cuándo se aplica)</Label>
                  <Input id="f-patron" className="font-mono" value={form.patron} onChange={(e) => cambiar({ patron: e.target.value })} placeholder="({~a}x^{m}{+b})^{n}" />
                  <p className="text-xs text-muted-foreground">
                    Cada <code>{"{nombre}"}</code> es una variable: <code>{"{a}"}</code> un entero, <code>{"{+b}"}</code> un entero con signo, <code>{"{~a}"}</code> un coeficiente (el 1 no se
                    escribe).
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Variables</Label>
                  {form.variables.map((v, i) => (
                    <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12" data-testid="variable">
                      <Input aria-label={`Nombre de la variable ${i + 1}`} className="font-mono sm:col-span-2" value={v.nombre} onChange={(e) => cambiarVariable(i, { nombre: e.target.value })} placeholder="a" />
                      <Select aria-label={`Tipo de la variable ${i + 1}`} className="sm:col-span-2" value={v.tipo} onChange={(e) => cambiarVariable(i, { tipo: e.target.value as VariableForm["tipo"] })}>
                        <option value="entero">entero</option>
                        <option value="natural">natural (≥ 0)</option>
                        <option value="positivo">positivo (≥ 1)</option>
                      </Select>
                      <Input aria-label={`Cálculo de la variable ${i + 1}`} className="font-mono sm:col-span-3" value={v.calculada} onChange={(e) => cambiarVariable(i, { calculada: e.target.value })} placeholder="se calcula: mcm(b, d)" />
                      <Input aria-label={`Mínimo de la variable ${i + 1}`} className="sm:col-span-1" value={v.min} onChange={(e) => cambiarVariable(i, { min: e.target.value })} placeholder="mín" />
                      <Input aria-label={`Máximo de la variable ${i + 1}`} className="sm:col-span-1" value={v.max} onChange={(e) => cambiarVariable(i, { max: e.target.value })} placeholder="máx" />
                      <Input aria-label={`Descripción de la variable ${i + 1}`} className="sm:col-span-2" value={v.descripcion} onChange={(e) => cambiarVariable(i, { descripcion: e.target.value })} placeholder="qué es" />
                      <Button variant="ghost" size="sm" className="sm:col-span-1" disabled={form.variables.length === 1} onClick={() => cambiar({ variables: form.variables.filter((_, j) => j !== i) })}>
                        Quitar
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => cambiar({ variables: [...form.variables, { ...VARIABLE_VACIA }] })}>
                    Añadir variable
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="f-cond">Condiciones (una por línea)</Label>
                    <Textarea id="f-cond" className="min-h-20 font-mono" value={form.condiciones} onChange={(e) => cambiar({ condiciones: e.target.value })} placeholder={"n >= 2\nb != d"} />
                  </div>
                  <div className="space-y-1">
                    <Label>Operaciones admitidas</Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(catalogo).map(([id, descripcion]) => {
                        const activa = form.operaciones.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            title={descripcion}
                            aria-pressed={activa}
                            onClick={() => cambiar({ operaciones: activa ? form.operaciones.filter((x) => x !== id) : [...form.operaciones, id] })}
                            className={`rounded-full border px-2.5 py-0.5 text-xs ${activa ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground"}`}
                          >
                            {id}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      aria-label="Otras operaciones"
                      value={form.operaciones.filter((o) => !(o in catalogo)).join(", ")}
                      onChange={(e) =>
                        cambiar({ operaciones: [...form.operaciones.filter((o) => o in catalogo), ...e.target.value.split(",").map((x) => x.trim()).filter(Boolean)] })
                      }
                      placeholder="Otras (el motor no las comprueba → pendientes)"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Pasos ordenados</Label>
                  {form.pasos.map((p, i) => (
                    <div key={i} className="space-y-2 rounded-md border p-3" data-testid="paso-ficha">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">Paso {i + 1}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => mover(i, -1)}>
                            ↑
                          </Button>
                          <Button variant="ghost" size="sm" disabled={i === form.pasos.length - 1} onClick={() => mover(i, 1)}>
                            ↓
                          </Button>
                          <Button variant="ghost" size="sm" disabled={form.pasos.length === 1} onClick={() => cambiar({ pasos: form.pasos.filter((_, j) => j !== i) })}>
                            Quitar
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Select aria-label={`Tipo del paso ${i + 1}`} value={p.tipo} onChange={(e) => cambiarPaso(i, { tipo: e.target.value as PasoForm["tipo"] })}>
                          <option value="transformacion">Transformación</option>
                          <option value="definicion">Definición</option>
                          <option value="resultado">Resultado</option>
                        </Select>
                        <Input aria-label={`Regla del paso ${i + 1}`} className="sm:col-span-2" value={p.regla} onChange={(e) => cambiarPaso(i, { regla: e.target.value })} placeholder="Regla que se aplica (opcional)" />
                      </div>
                      <Textarea aria-label={`Explicación del paso ${i + 1}`} className="min-h-14" value={p.explica} onChange={(e) => cambiarPaso(i, { explica: e.target.value })} placeholder="Lo que dice el profesor (admite {variables})" />
                      <Input aria-label={`Pizarra del paso ${i + 1}`} className="font-mono" value={p.escribe} onChange={(e) => cambiarPaso(i, { escribe: e.target.value })} placeholder="Lo que se escribe: {n}({~a}x^{m}{+b})^{n-1}" />
                      <Textarea aria-label={`Términos del paso ${i + 1}`} className="min-h-14 font-mono text-xs" value={p.terminos} onChange={(e) => cambiarPaso(i, { terminos: e.target.value })} placeholder={"Términos tocables, uno por línea:\n{n}({~a}x^{m}{+b})^{n-1} => La derivada de la exterior"} />
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => cambiar({ pasos: [...form.pasos, { ...PASO_VACIO }] })}>
                    Añadir paso
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="f-ej">Ejemplos (uno por línea)</Label>
                    <Textarea id="f-ej" className="min-h-20 font-mono" value={form.ejemplos} onChange={(e) => cambiar({ ejemplos: e.target.value })} placeholder={"(3x^2+1)^4\n(5x^3-2)^2"} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="f-pistas">Pistas generales (de la más suave a la más concreta)</Label>
                    <Textarea id="f-pistas" className="min-h-20" value={form.pistas} onChange={(e) => cambiar({ pistas: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pistas de error</Label>
                  <p className="text-xs text-muted-foreground">
                    Dos formas de reconocer un error: si (la respuesta del alumno) × (el factor omitido) equivale a la correcta, se le olvidó ese factor; o, si su respuesta equivale a la «respuesta errónea típica» (error de signo, de exponente…), se le muestra la pista.
                  </p>
                  {form.pistasDeError.map((p, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-12" data-testid="pista-error">
                      <Input aria-label={`Pista de error ${i + 1}`} className="sm:col-span-6" value={p.texto} onChange={(e) => cambiar({ pistasDeError: form.pistasDeError.map((q, j) => (j === i ? { ...q, texto: e.target.value } : q)) })} placeholder="Te falta la derivada de la función interior…" />
                      <Input aria-label={`Factor omitido ${i + 1}`} className="font-mono sm:col-span-5" value={p.omiteFactor} onChange={(e) => cambiar({ pistasDeError: form.pistasDeError.map((q, j) => (j === i ? { ...q, omiteFactor: e.target.value } : q)) })} placeholder="{~a*m}x^{m-1}" />
                      <Input aria-label={`Respuesta errónea típica ${i + 1}`} className="font-mono sm:col-span-11" value={p.respuestaErronea} onChange={(e) => cambiar({ pistasDeError: form.pistasDeError.map((q, j) => (j === i ? { ...q, respuestaErronea: e.target.value } : q)) })} placeholder="Opcional · respuesta errónea típica, p. ej. con el signo cambiado" />
                      <Button variant="ghost" size="sm" className="sm:col-span-1" onClick={() => cambiar({ pistasDeError: form.pistasDeError.filter((_, j) => j !== i) })}>
                        Quitar
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => cambiar({ pistasDeError: [...form.pistasDeError, { texto: "", omiteFactor: "", respuestaErronea: "" }] })}>
                    Añadir pista de error
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={probar} disabled={ocupado}>
                    {ocupado ? "Probando…" : "Probar con el motor"}
                  </Button>
                  <Button onClick={guardar} disabled={ocupado || !form.titulo.trim()}>
                    {form.id ? "Guardar (nueva versión)" : "Guardar borrador"}
                  </Button>
                </div>

                {informe && <InformeVista informe={informe} plano={plano} />}
              </CardContent>
            </Card>

            {form.id && seleccionada && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Reutilizar el método con otro problema</CardTitle>
                    <CardDescription>
                      Aplica la ficha a un problema nuevo sin tocar código: el motor valida cada paso y el ejercicio resultante.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-48 flex-1 space-y-1">
                        <Label htmlFor="f-nuevo">Problema</Label>
                        <Input id="f-nuevo" className="font-mono" value={problemaNuevo} onChange={(e) => setProblemaNuevo(e.target.value)} placeholder="(5x^3-2)^2" />
                      </div>
                      <Button onClick={() => aplicar(false)} disabled={ocupado || !problemaNuevo.trim()}>
                        Aplicar y validar
                      </Button>
                    </div>
                    {aplicacion && (
                      <div className="space-y-2 rounded-md border p-3" data-testid="aplicacion">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{aplicacion.problema}</span>
                          <Badge variant={aplicacion.motor.verificado ? "exito" : "aviso"}>{aplicacion.motor.verificado ? "Pasos verificados por el motor" : "Pasos sin verificar"}</Badge>
                          <Badge variant={aplicacion.ejercicio.validado ? "exito" : "aviso"}>{aplicacion.ejercicio.validado ? "Ejercicio validado" : "Ejercicio sin validar"}</Badge>
                        </div>
                        <ol className="space-y-1">
                          {aplicacion.pasos.map((p, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-3 text-sm">
                              <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                              <Formula expresion={plano(p.escribe)} />
                              <span className="text-xs text-muted-foreground">{aplicacion.motor.pasos[i]?.estado === "verificado" ? "✓ verificado" : aplicacion.motor.pasos[i]?.estado === "definicion" ? "definición" : aplicacion.motor.pasos[i]?.estado}</span>
                            </li>
                          ))}
                        </ol>
                        {aplicacion.guardado ? (
                          <p className="text-sm text-emerald-700 dark:text-emerald-300">Guardado como ejercicio borrador en tu banco privado.</p>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => aplicar(true)} disabled={ocupado || !aplicacion.ejercicio.validado}>
                            Guardar como ejercicio borrador
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Aprobar y publicar</CardTitle>
                    <CardDescription>
                      A los alumnos sólo les llega la versión que apruebas. Versión de trabajo: {seleccionada.version} · publicada:{" "}
                      {seleccionada.publicadaVersion ?? "ninguna"}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={aprobada} onChange={(e) => setAprobada(e.target.checked)} />
                      <span>He revisado la ficha (patrón, pasos, pistas y el informe del motor) y la apruebo para mi banco privado.</span>
                    </label>
                    <Button onClick={() => publicar()} disabled={ocupado || !aprobada}>
                      Publicar la versión {seleccionada.version}
                    </Button>
                    {versiones.length > 0 && (
                      <div className="space-y-1">
                        <Label>Historial de versiones</Label>
                        <ul className="divide-y rounded-md border text-sm" data-testid="versiones">
                          {versiones.map((v) => (
                            <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                              <span>
                                <strong>v{v.version}</strong> · {v.nota ?? "—"} · {v.autor?.nombre ?? "—"} · {new Date(v.creadoEn).toLocaleString("es")}{" "}
                                {v.verificada ? <Badge variant="exito">verificada</Badge> : v.pendienteValidacion ? <Badge variant="aviso">pendiente</Badge> : <Badge variant="error">con fallos</Badge>}
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => restaurar(v.version)} disabled={ocupado}>
                                Restaurar
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tus fichas</CardTitle>
          <CardDescription>El banco privado de métodos: lo publicado lo usan los alumnos de tus aulas.</CardDescription>
        </CardHeader>
        <CardContent>
          {fichas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay fichas. Crea una o pide un borrador a la IA.</p>
          ) : (
            <ul className="divide-y" data-testid="lista-fichas">
              {fichas.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="ficha-fila">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.titulo}</span>
                      <Badge variant={f.estado === "PUBLICADO" ? "exito" : f.estado === "ARCHIVADO" ? "contorno" : "neutro"}>{ETIQUETA_ESTADO[f.estado]}</Badge>
                      {f.verificada ? <Badge variant="exito">Verificada</Badge> : f.pendienteValidacion ? <Badge variant="aviso">Pendiente de validación</Badge> : <Badge variant="error">Con fallos</Badge>}
                      {f.origen === "IA" && <Badge variant="contorno">IA</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {f.nodo?.titulo ?? "Sin tema"} · versión {f.version}
                      {f.publicadaVersion !== null ? ` · publicada la ${f.publicadaVersion}` : ""} · patrón <code>{f.contenido.patron}</code>
                    </p>
                  </div>
                  {puedeEditar && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => abrir(f)}>
                        Abrir
                      </Button>
                      {f.estado === "PUBLICADO" && (
                        <Button variant="ghost" size="sm" onClick={() => cambiarEstado(f, "ARCHIVADO")} disabled={ocupado}>
                          Archivar
                        </Button>
                      )}
                      {f.publicadaVersion === null && (
                        <Button variant="ghost" size="sm" onClick={() => borrar(f)} disabled={ocupado}>
                          Borrar
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InformeVista({ informe, plano }: { informe: InformeFicha; plano: (t: string) => string }) {
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="informe-ficha">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Informe del motor</span>
        {informe.verificada ? (
          <Badge variant="exito">Verificada</Badge>
        ) : informe.valido ? (
          <Badge variant="aviso">Con casos pendientes</Badge>
        ) : (
          <Badge variant="error">Con errores</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {informe.casos.filter((c) => c.origen === "ejemplo").length} ejemplo(s) · {informe.generados} caso(s) generado(s) por el servidor
        </span>
      </div>
      {informe.errores.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive" data-testid="errores-ficha">
          {informe.errores.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {informe.pendientes.length > 0 && (
        <div className="space-y-1" data-testid="pendientes-ficha">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Pendiente de validación automática</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
            {informe.pendientes.map((p, i) => (
              <li key={i}>{p.detalle}</li>
            ))}
          </ul>
        </div>
      )}
      {informe.operaciones.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {informe.operaciones.map((o) => (
            <Badge key={o.id} variant={o.soportada ? "exito" : "aviso"} title={o.descripcion ?? "El motor no la comprueba"}>
              {o.id}: {o.soportada ? "el motor la comprueba" : "sin comprobar"}
            </Badge>
          ))}
        </div>
      )}
      {informe.casos.length > 0 && (
        <ul className="space-y-1" data-testid="casos-ficha">
          {informe.casos.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-20 text-xs text-muted-foreground">{c.origen === "ejemplo" ? "Ejemplo" : "Generado"}</span>
              <Formula expresion={plano(c.problema)} />
              {c.resultado && (
                <>
                  <span aria-hidden>→</span>
                  <Formula expresion={plano(c.resultado)} />
                </>
              )}
              <span className={`text-xs font-medium ${COLOR_CASO[c.estado]}`}>{ROTULO_CASO[c.estado]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
