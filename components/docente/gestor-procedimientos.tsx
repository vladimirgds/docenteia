"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Math } from "@/components/math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { planoALatex } from "@/lib/matematicas";
import { pedir } from "@/lib/docente/cliente";
import { ETIQUETA_ESTADO, NIVELES, ETIQUETA_NIVEL_CURRICULO, etiquetaMotor, type Estado, type Nivel } from "@/lib/docente/curriculo";
import { ETIQUETA_TIPO, TIPOS_PASO, TIPOS_PROCEDIMIENTO } from "@/lib/docente/procedimientos";
import type { InformeVerificacion } from "@/lib/docente/verificar-pasos";

/**
 * EDITOR DE PROCEDIMIENTOS (PMV 3 · HITO 2).
 *
 * El docente define, prueba y publica reglas, métodos y procedimientos desde
 * aquí, sin tocar código. El eje de la pantalla es el botón «Probar»: devuelve,
 * paso por paso, qué comprueba el servidor contra el motor —verificado, mal, o
 * «el motor no sabe juzgarlo»— ANTES de guardar. El agente de Gemini rellena el
 * formulario entero como borrador editable.
 */

export interface TemaProcedimiento {
  id: string;
  titulo: string;
  motor: string | null;
}

export interface PasoVista {
  explica: string;
  escribe: string;
  tipo: (typeof TIPOS_PASO)[number];
  regla?: string | null;
  terminos?: { texto: string; explica: string }[];
}

export interface PreguntaVista {
  enunciado: string;
  respuesta?: string | null;
  pistas?: string[];
}

export interface ProcedimientoVista {
  id: string;
  nodoId: string | null;
  tipo: (typeof TIPOS_PROCEDIMIENTO)[number];
  titulo: string;
  descripcion: string | null;
  motor: string | null;
  ejemplo: string;
  pasos: PasoVista[];
  preguntas: PreguntaVista[];
  pistas: string[];
  origen: string;
  estado: Estado;
  verificado: boolean;
  revisadoEn: string | null;
  nodo: { titulo: string } | null;
  informeVerificacion: InformeVerificacion | Record<string, never>;
}

export interface SoporteVista {
  motor: string;
  comprueba: string;
  ejemplos: string[];
}

interface Props {
  temas: TemaProcedimiento[];
  procedimientos: ProcedimientoVista[];
  soporte: Record<string, SoporteVista>;
  puedeEditar: boolean;
}

interface Formulario {
  id: string | null;
  nodoId: string;
  tipo: (typeof TIPOS_PROCEDIMIENTO)[number];
  titulo: string;
  descripcion: string;
  ejemplo: string;
  pasos: PasoVista[];
  preguntas: PreguntaVista[];
  pistas: string[];
  origen: string;
}

const PASO_VACIO: PasoVista = { explica: "", escribe: "", tipo: "transformacion" };
const nuevoFormulario = (nodoId: string): Formulario => ({
  id: null,
  nodoId,
  tipo: "PROCEDIMIENTO",
  titulo: "",
  descripcion: "",
  ejemplo: "",
  pasos: [{ ...PASO_VACIO }],
  preguntas: [],
  pistas: [],
  origen: "DOCENTE",
});

const COLOR_ESTADO: Record<string, string> = {
  verificado: "text-emerald-700 dark:text-emerald-300",
  incorrecto: "text-destructive",
  no_verificable: "text-amber-700 dark:text-amber-300",
  definicion: "text-muted-foreground",
};
const ROTULO_ESTADO: Record<string, string> = {
  verificado: "Verificado",
  incorrecto: "Incorrecto",
  no_verificable: "Sin verificar",
  definicion: "Definición",
};

export function GestorProcedimientos({ temas, procedimientos, soporte, puedeEditar }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [form, setForm] = useState<Formulario>(nuevoFormulario(temas[0]?.id ?? ""));
  const [informe, setInforme] = useState<InformeVerificacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Agente de IA
  const [iaTitulo, setIaTitulo] = useState("");
  const [iaNivel, setIaNivel] = useState<Nivel>("INTERMEDIO");
  const [iaEjercicios, setIaEjercicios] = useState(3);
  const [iaIndicaciones, setIaIndicaciones] = useState("");
  const [iaAviso, setIaAviso] = useState<string | null>(null);

  const tema = temas.find((t) => t.id === form.nodoId) ?? null;
  const ayuda = tema?.motor ? soporte[tema.motor] : null;

  const cambiar = (c: Partial<Formulario>) => {
    setForm((f) => ({ ...f, ...c }));
    // Cualquier cambio invalida el informe anterior.
    setInforme(null);
    setExito(null);
  };
  const cambiarPaso = (i: number, c: Partial<PasoVista>) =>
    cambiar({ pasos: form.pasos.map((p, j) => (j === i ? { ...p, ...c } : p)) });

  const cuerpo = () => ({
    nodoId: form.nodoId,
    tipo: form.tipo,
    titulo: form.titulo.trim(),
    descripcion: form.descripcion.trim() || null,
    ejemplo: form.ejemplo.trim(),
    pasos: form.pasos.map((p) => ({
      explica: p.explica.trim(),
      escribe: p.escribe.trim(),
      tipo: p.tipo,
      regla: p.regla?.trim() || null,
      terminos: (p.terminos ?? []).filter((t) => t.texto.trim() && t.explica.trim()),
    })),
    preguntas: form.preguntas.filter((q) => q.enunciado.trim()),
    pistas: form.pistas.map((p) => p.trim()).filter(Boolean),
  });

  const probar = () => {
    setError(null);
    iniciar(async () => {
      const c = cuerpo();
      const r = await pedir<{ informe: InformeVerificacion }>("/api/docente/procedimientos/probar", {
        metodo: "POST",
        cuerpo: { nodoId: c.nodoId || undefined, ejemplo: c.ejemplo, pasos: c.pasos },
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
        ? await pedir<{ informe: InformeVerificacion }>(`/api/docente/procedimientos/${form.id}`, { metodo: "PATCH", cuerpo: cuerpo() })
        : await pedir<{ informe: InformeVerificacion }>("/api/docente/procedimientos", { metodo: "POST", cuerpo: cuerpo() });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setInforme(r.datos.informe);
      setExito(form.id ? "Borrador actualizado." : "Borrador guardado.");
      if (!form.id) setForm(nuevoFormulario(form.nodoId));
      router.refresh();
    });
  };

  const cambiarEstado = (p: ProcedimientoVista, estado: Estado, confirmar = false) =>
    iniciar(async () => {
      setError(null);
      setExito(null);
      const r = await pedir(`/api/docente/procedimientos/${p.id}`, {
        metodo: "PATCH",
        cuerpo: { estado, ...(confirmar ? { confirmarSinVerificar: true } : {}) },
      });
      if (r.ok) {
        setExito(estado === "PUBLICADO" ? "Publicado: ya lo ven los alumnos de tus aulas." : "Cambio guardado.");
        router.refresh();
      } else if (r.estado === 422 && /confirmando expresamente/.test(r.error) && window.confirm(`${r.error}\n\n¿Publicarlo sin verificar?`)) {
        cambiarEstado(p, estado, true);
      } else {
        setError(r.error);
        if (r.informe) setInforme(r.informe as unknown as InformeVerificacion);
      }
    });

  const borrar = (p: ProcedimientoVista) => {
    if (!window.confirm("¿Borrar este procedimiento?")) return;
    iniciar(async () => {
      const r = await pedir(`/api/docente/procedimientos/${p.id}`, { metodo: "DELETE" });
      if (r.ok) {
        setExito("Procedimiento borrado.");
        router.refresh();
      } else setError(r.error);
    });
  };

  const editar = (p: ProcedimientoVista) => {
    setInforme(Object.keys(p.informeVerificacion).length ? (p.informeVerificacion as InformeVerificacion) : null);
    setError(null);
    setExito(null);
    setForm({
      id: p.id,
      nodoId: p.nodoId ?? "",
      tipo: p.tipo,
      titulo: p.titulo,
      descripcion: p.descripcion ?? "",
      ejemplo: p.ejemplo,
      pasos: p.pasos.length ? p.pasos : [{ ...PASO_VACIO }],
      preguntas: p.preguntas,
      pistas: p.pistas,
      origen: p.origen,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const generarConIA = () => {
    setError(null);
    setExito(null);
    setIaAviso(null);
    if (!iaTitulo.trim()) {
      setError("Escribe qué quieres enseñar (por ejemplo «suma de fracciones»).");
      return;
    }
    iniciar(async () => {
      const r = await pedir<{
        procedimiento: ProcedimientoVista;
        informe: InformeVerificacion;
        ejercicios: { borradores: unknown[]; descartados: { enunciado: string; motivo: string }[] };
        aviso: string | null;
      }>("/api/docente/procedimientos/borrador-ia", {
        metodo: "POST",
        cuerpo: {
          nodoId: form.nodoId,
          tipo: form.tipo,
          titulo: iaTitulo.trim(),
          nivel: iaNivel,
          ejercicios: iaEjercicios,
          indicaciones: iaIndicaciones.trim() || undefined,
        },
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setIaAviso(r.datos.aviso);
      // `editar` limpia los avisos, así que el mensaje va DESPUÉS.
      editar(r.datos.procedimiento);
      setExito(
        `Borrador generado${r.datos.informe.verificado ? " y verificado" : ", con pasos por revisar"}. ` +
          `${r.datos.ejercicios.borradores.length} ejercicio(s) de práctica guardado(s) en tu banco como borrador.`,
      );
      router.refresh();
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

      {temas.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay temas</CardTitle>
            <CardDescription>Un procedimiento pertenece a un tema, de donde hereda el motor de verificación.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        puedeEditar && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Generar un borrador con IA</CardTitle>
                <CardDescription>
                  Gemini redacta los pasos, los términos tocables, las preguntas, las pistas y unos ejercicios de práctica. El
                  servidor verifica cada paso con el motor; tú lo editas, lo pruebas y lo publicas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1 lg:col-span-2">
                    <Label htmlFor="ia-titulo">Qué quieres enseñar</Label>
                    <Input id="ia-titulo" value={iaTitulo} onChange={(e) => setIaTitulo(e.target.value)} placeholder="p. ej. suma de fracciones, regla de la cadena" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ia-nivel">Dificultad</Label>
                    <Select id="ia-nivel" value={iaNivel} onChange={(e) => setIaNivel(e.target.value as Nivel)}>
                      {NIVELES.map((n) => (
                        <option key={n} value={n}>
                          {ETIQUETA_NIVEL_CURRICULO[n as Nivel]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ia-ej">Ejercicios (0–5)</Label>
                    <Input id="ia-ej" type="number" min={0} max={5} value={iaEjercicios} onChange={(e) => setIaEjercicios(globalThis.Math.min(5, globalThis.Math.max(0, Number(e.target.value) || 0)))} />
                  </div>
                </div>
                <Input aria-label="Indicaciones" maxLength={300} value={iaIndicaciones} onChange={(e) => setIaIndicaciones(e.target.value)} placeholder="Indicaciones (opcional)" />
                <div className="flex items-center gap-3">
                  <Button onClick={generarConIA} disabled={ocupado}>
                    {ocupado ? "Generando…" : "Generar borrador"}
                  </Button>
                  <span className="text-xs text-muted-foreground">Se genera en el tema y el tipo elegidos abajo.</span>
                </div>
                {iaAviso && <p className="text-sm text-muted-foreground">{iaAviso}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{form.id ? "Editar procedimiento" : "Nuevo procedimiento"}</CardTitle>
                <CardDescription>
                  {tema?.motor
                    ? `Se verificará con el motor «${etiquetaMotor(tema.motor)}», que hereda del tema.`
                    : "Este tema no tiene motor: se guardará SIN verificar."}
                </CardDescription>
                {ayuda && (
                  <p className="text-xs text-muted-foreground">
                    <strong>Qué comprueba el servidor:</strong> {ayuda.comprueba} Ejemplos: {ayuda.ejemplos.join(" · ")}.
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="pr-tema">Tema</Label>
                    <Select id="pr-tema" value={form.nodoId} onChange={(e) => cambiar({ nodoId: e.target.value })}>
                      {temas.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.titulo}
                          {t.motor ? ` · ${etiquetaMotor(t.motor)}` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pr-tipo">Tipo</Label>
                    <Select id="pr-tipo" value={form.tipo} onChange={(e) => cambiar({ tipo: e.target.value as Formulario["tipo"] })}>
                      {TIPOS_PROCEDIMIENTO.map((t) => (
                        <option key={t} value={t}>
                          {ETIQUETA_TIPO[t]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pr-titulo">Título</Label>
                    <Input id="pr-titulo" value={form.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pr-desc">Descripción</Label>
                  <Textarea id="pr-desc" value={form.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} className="min-h-16" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pr-ejemplo">Ejemplo que se resuelve</Label>
                  <Input id="pr-ejemplo" className="font-mono" value={form.ejemplo} onChange={(e) => cambiar({ ejemplo: e.target.value })} placeholder="1/2 + 1/3" />
                  {form.ejemplo.trim() && <Math expresion={planoALatex(form.ejemplo)} display />}
                </div>

                <div className="space-y-3">
                  <Label>Pasos</Label>
                  {form.pasos.map((p, i) => {
                    const res = informe?.pasos?.find((x) => x.indice === i);
                    return (
                      <div key={i} className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">Paso {i + 1}</span>
                          <div className="flex items-center gap-1">
                            {res && (
                              <span className={`text-xs font-medium ${COLOR_ESTADO[res.estado]}`}>{ROTULO_ESTADO[res.estado]}</span>
                            )}
                            <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => cambiar({ pasos: moverPaso(form.pasos, i, -1) })}>
                              ↑
                            </Button>
                            <Button variant="ghost" size="sm" disabled={i === form.pasos.length - 1} onClick={() => cambiar({ pasos: moverPaso(form.pasos, i, 1) })}>
                              ↓
                            </Button>
                            <Button variant="ghost" size="sm" disabled={form.pasos.length === 1} onClick={() => cambiar({ pasos: form.pasos.filter((_, j) => j !== i) })}>
                              Quitar
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
                          <Input aria-label={`Qué se escribe en el paso ${i + 1}`} className="font-mono" value={p.escribe} onChange={(e) => cambiarPaso(i, { escribe: e.target.value })} placeholder="3/6 + 2/6" />
                          <Select aria-label={`Tipo del paso ${i + 1}`} value={p.tipo} onChange={(e) => cambiarPaso(i, { tipo: e.target.value as PasoVista["tipo"] })}>
                            {TIPOS_PASO.map((t) => (
                              <option key={t} value={t}>
                                {t === "transformacion" ? "Transformación" : t === "definicion" ? "Definición" : "Resultado"}
                              </option>
                            ))}
                          </Select>
                          <Input aria-label={`Regla del paso ${i + 1}`} value={p.regla ?? ""} onChange={(e) => cambiarPaso(i, { regla: e.target.value })} placeholder="Regla (opcional)" />
                        </div>
                        {p.escribe.trim() && <Math expresion={planoALatex(p.escribe)} display />}
                        <Textarea aria-label={`Explicación del paso ${i + 1}`} className="min-h-14" value={p.explica} onChange={(e) => cambiarPaso(i, { explica: e.target.value })} placeholder="Lo que dice el profesor en este paso" />
                        <div className="space-y-1">
                          {(p.terminos ?? []).map((t, k) => (
                            <div key={k} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
                              <Input aria-label="Término" className="font-mono" value={t.texto} onChange={(e) => cambiarPaso(i, { terminos: (p.terminos ?? []).map((x, m) => (m === k ? { ...x, texto: e.target.value } : x)) })} placeholder="Término (fragmento exacto)" />
                              <Input aria-label="Explicación del término" value={t.explica} onChange={(e) => cambiarPaso(i, { terminos: (p.terminos ?? []).map((x, m) => (m === k ? { ...x, explica: e.target.value } : x)) })} placeholder="Qué se oye al tocarlo" />
                              <Button variant="ghost" size="sm" onClick={() => cambiarPaso(i, { terminos: (p.terminos ?? []).filter((_, m) => m !== k) })}>
                                Quitar
                              </Button>
                            </div>
                          ))}
                          {(p.terminos ?? []).length < 8 && (
                            <Button variant="outline" size="sm" onClick={() => cambiarPaso(i, { terminos: [...(p.terminos ?? []), { texto: "", explica: "" }] })}>
                              Añadir término tocable
                            </Button>
                          )}
                        </div>
                        {res && res.estado !== "verificado" && res.estado !== "definicion" && (
                          <p className={`text-xs ${COLOR_ESTADO[res.estado]}`}>{res.detalle}</p>
                        )}
                      </div>
                    );
                  })}
                  {form.pasos.length < 12 && (
                    <Button variant="outline" size="sm" onClick={() => cambiar({ pasos: [...form.pasos, { ...PASO_VACIO }] })}>
                      Añadir paso
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Preguntas de comprensión</Label>
                  {form.preguntas.map((q, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                      <Input aria-label={`Pregunta ${i + 1}`} value={q.enunciado} onChange={(e) => cambiar({ preguntas: form.preguntas.map((x, j) => (j === i ? { ...x, enunciado: e.target.value } : x)) })} />
                      <Input aria-label={`Respuesta de la pregunta ${i + 1}`} value={q.respuesta ?? ""} onChange={(e) => cambiar({ preguntas: form.preguntas.map((x, j) => (j === i ? { ...x, respuesta: e.target.value } : x)) })} placeholder="Respuesta" />
                      <Button variant="ghost" size="sm" onClick={() => cambiar({ preguntas: form.preguntas.filter((_, j) => j !== i) })}>
                        Quitar
                      </Button>
                    </div>
                  ))}
                  {form.preguntas.length < 6 && (
                    <Button variant="outline" size="sm" onClick={() => cambiar({ preguntas: [...form.preguntas, { enunciado: "", respuesta: "" }] })}>
                      Añadir pregunta
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Pistas generales (de la más suave a la más concreta)</Label>
                  {form.pistas.map((p, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input aria-label={`Pista ${i + 1}`} value={p} onChange={(e) => cambiar({ pistas: form.pistas.map((x, j) => (j === i ? e.target.value : x)) })} />
                      <Button variant="ghost" size="sm" onClick={() => cambiar({ pistas: form.pistas.filter((_, j) => j !== i) })}>
                        Quitar
                      </Button>
                    </div>
                  ))}
                  {form.pistas.length < 5 && (
                    <Button variant="outline" size="sm" onClick={() => cambiar({ pistas: [...form.pistas, ""] })}>
                      Añadir pista
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={probar} disabled={ocupado}>
                    Probar
                  </Button>
                  <Button onClick={guardar} disabled={ocupado}>
                    {form.id ? "Guardar cambios" : "Guardar borrador"}
                  </Button>
                  {form.id && (
                    <Button variant="ghost" onClick={() => { setForm(nuevoFormulario(form.nodoId)); setInforme(null); }} disabled={ocupado}>
                      Cancelar
                    </Button>
                  )}
                </div>

                {informe && (
                  <div className="rounded-md border px-4 py-3 text-sm">
                    <p className="font-medium">
                      {!informe.valido
                        ? "Hay pasos incorrectos: corrígelos antes de publicar."
                        : informe.verificado
                          ? `Verificado por el motor${informe.respuestaEjemplo ? ` · resultado del ejemplo: ${informe.respuestaEjemplo}` : ""}.`
                          : "Sin verificar del todo: hay pasos que el motor no sabe comprobar."}
                    </p>
                    {[...informe.errores, ...informe.avisos].length > 0 && (
                      <ul className="list-disc space-y-1 pl-5 pt-1 text-muted-foreground">
                        {informe.errores.map((e, i) => (
                          <li key={`e${i}`} className="text-destructive">{e}</li>
                        ))}
                        {informe.avisos.map((a, i) => (
                          <li key={`a${i}`}>{a}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mis procedimientos</CardTitle>
          <CardDescription>
            {procedimientos.length === 0 ? "Todavía no has creado ninguno." : `${procedimientos.length} procedimiento(s).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {procedimientos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Título</th>
                    <th className="pb-2 font-medium">Tema</th>
                    <th className="pb-2 font-medium">Pasos</th>
                    <th className="pb-2 font-medium">Verificación</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium sr-only">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {procedimientos.map((p) => (
                    <tr key={p.id} className="border-b align-top last:border-0">
                      <td className="py-3">
                        <div className="font-medium">{p.titulo}</div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          <Badge variant="contorno">{ETIQUETA_TIPO[p.tipo]}</Badge>
                          {p.origen === "IA" && <Badge variant={p.revisadoEn ? "exito" : "aviso"}>{p.revisadoEn ? "IA · revisado" : "Borrador IA"}</Badge>}
                        </div>
                      </td>
                      <td className="py-3 text-muted-foreground">{p.nodo?.titulo ?? "—"}</td>
                      <td className="py-3">{p.pasos.length}</td>
                      <td className="py-3">{p.verificado ? <Badge variant="exito">Verificado</Badge> : <Badge variant="aviso">Sin verificar</Badge>}</td>
                      <td className="py-3">
                        <Badge variant={p.estado === "PUBLICADO" ? "exito" : "neutro"}>{ETIQUETA_ESTADO[p.estado]}</Badge>
                      </td>
                      <td className="py-3">
                        {puedeEditar && (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => editar(p)}>Editar</Button>
                            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => cambiarEstado(p, p.estado === "PUBLICADO" ? "ARCHIVADO" : "PUBLICADO")}>
                              {p.estado === "PUBLICADO" ? "Archivar" : p.origen === "IA" && !p.revisadoEn ? "Revisar y publicar" : "Publicar"}
                            </Button>
                            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => borrar(p)}>Borrar</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function moverPaso(pasos: PasoVista[], i: number, delta: number): PasoVista[] {
  const copia = [...pasos];
  const j = i + delta;
  if (j < 0 || j >= copia.length) return pasos;
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}
