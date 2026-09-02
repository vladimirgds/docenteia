"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Math } from "@/components/math";
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
import { planoALatex } from "@/lib/matematicas";
import { pedir } from "@/lib/docente/cliente";
import {
  ESTADOS,
  ETIQUETA_ESTADO,
  ETIQUETA_NIVEL_CURRICULO,
  NIVELES,
  etiquetaMotor,
  type Estado,
  type Nivel,
} from "@/lib/docente/curriculo";
import type { InformeValidacion } from "@/lib/docente/validador";

/**
 * BANCO DE EJERCICIOS — alta, validación y gestión.
 *
 * La pantalla está construida alrededor de una idea: el docente tiene que poder
 * VER la comprobación antes de guardar. Por eso el botón "Validar" no guarda
 * nada y devuelve el informe completo —las combinaciones probadas, lo que
 * calcula el motor, lo que falla y con qué números—, y sólo después aparece
 * "Guardar".
 *
 * La alternativa (guardar y leer el error) convierte cada ejercicio en un
 * intento a ciegas, y con plantillas parametrizadas es peor todavía: el error
 * puede estar en 3 de 200 combinaciones que nadie va a encontrar a ojo.
 */

export interface TemaOpcion {
  id: string;
  titulo: string;
  motor: string | null;
  estado: Estado;
}

export interface EjercicioVista {
  id: string;
  enunciado: string;
  respuestaCorrecta: string;
  respuestaFormula: string | null;
  plantilla: boolean;
  parametros: ParametroFormulario[];
  pistas: string[];
  nivel: string;
  motor: string | null;
  estado: Estado;
  origen: string;
  validado: boolean;
  nodoId: string | null;
  nodo: { id: string; titulo: string; motor: string | null } | null;
  autor: { nombre: string } | null;
}

export interface ParametroFormulario {
  nombre: string;
  min: number;
  max: number;
  paso?: number;
  excluir?: number[];
}

interface Props {
  temas: TemaOpcion[];
  ejercicios: EjercicioVista[];
  puedeEditar: boolean;
}

interface Formulario {
  id: string | null;
  nodoId: string;
  nivel: Nivel;
  enunciado: string;
  respuestaCorrecta: string;
  plantilla: boolean;
  parametros: ParametroFormulario[];
  respuestaFormula: string;
  pistas: string[];
  estado: Estado;
}

const VACIO: Formulario = {
  id: null,
  nodoId: "",
  nivel: "BASICO",
  enunciado: "",
  respuestaCorrecta: "",
  plantilla: false,
  parametros: [],
  respuestaFormula: "",
  pistas: [],
  estado: "BORRADOR",
};

export function GestorEjercicios({ temas, ejercicios, puedeEditar }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();

  const [form, setForm] = useState<Formulario>({ ...VACIO, nodoId: temas[0]?.id ?? "" });
  const [informe, setInforme] = useState<InformeValidacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const [filtroTema, setFiltroTema] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroValidado, setFiltroValidado] = useState("");

  const temaActual = temas.find((t) => t.id === form.nodoId) ?? null;

  const listados = useMemo(
    () =>
      ejercicios.filter((e) => {
        if (filtroTema && e.nodoId !== filtroTema) return false;
        if (filtroEstado && e.estado !== filtroEstado) return false;
        if (filtroValidado === "si" && !e.validado) return false;
        if (filtroValidado === "no" && e.validado) return false;
        return true;
      }),
    [ejercicios, filtroTema, filtroEstado, filtroValidado],
  );

  const cambiar = (cambio: Partial<Formulario>) => {
    setForm((f) => ({ ...f, ...cambio }));
    // Cualquier cambio invalida el informe anterior: enseñar un "verificado" que
    // corresponde al texto de hace tres teclas es peor que no enseñar nada.
    setInforme(null);
    setExito(null);
  };

  const cuerpoActual = () => ({
    nodoId: form.nodoId,
    nivel: form.nivel,
    enunciado: form.enunciado.trim(),
    respuestaCorrecta: form.plantilla ? null : form.respuestaCorrecta.trim() || null,
    plantilla: form.plantilla,
    parametros: form.plantilla ? form.parametros : [],
    respuestaFormula: form.plantilla ? form.respuestaFormula.trim() || null : null,
    pistas: form.pistas.map((p) => p.trim()).filter(Boolean),
    estado: form.estado,
  });

  const validar = () => {
    setError(null);
    setExito(null);
    if (!form.enunciado.trim()) {
      setError("Escribe el enunciado antes de validar.");
      return;
    }
    iniciar(async () => {
      const r = await pedir<{ informe: InformeValidacion }>("/api/docente/ejercicios/validar", {
        metodo: "POST",
        cuerpo: cuerpoActual(),
      });
      if (r.ok) setInforme(r.datos.informe);
      else setError(r.error);
    });
  };

  const guardar = () => {
    setError(null);
    setExito(null);
    if (!form.nodoId) {
      setError("Elige el tema al que pertenece el ejercicio.");
      return;
    }
    iniciar(async () => {
      const r = form.id
        ? await pedir<{ informe: InformeValidacion }>(`/api/docente/ejercicios/${form.id}`, {
            metodo: "PATCH",
            cuerpo: cuerpoActual(),
          })
        : await pedir<{ informe: InformeValidacion }>("/api/docente/ejercicios", {
            metodo: "POST",
            cuerpo: cuerpoActual(),
          });

      if (!r.ok) {
        setError(r.error);
        // El 422 del validador trae el informe: es justo lo que hay que enseñar.
        if (r.informe) setInforme(r.informe);
        return;
      }
      setInforme(r.datos.informe);
      setExito(form.id ? "Ejercicio actualizado." : "Ejercicio guardado en el banco.");
      setForm({ ...VACIO, nodoId: form.nodoId, nivel: form.nivel });
      router.refresh();
    });
  };

  const editar = (e: EjercicioVista) => {
    setInforme(null);
    setError(null);
    setExito(null);
    setForm({
      id: e.id,
      nodoId: e.nodoId ?? "",
      nivel: (e.nivel as Nivel) ?? "BASICO",
      enunciado: e.enunciado,
      respuestaCorrecta: e.respuestaCorrecta,
      plantilla: e.plantilla,
      parametros: e.parametros ?? [],
      respuestaFormula: e.respuestaFormula ?? "",
      pistas: e.pistas ?? [],
      estado: e.estado,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const accion = (promesa: Promise<{ ok: boolean; error?: string }>, mensaje: string) =>
    iniciar(async () => {
      const r = await promesa;
      if (r.ok) {
        setExito(mensaje);
        router.refresh();
      } else {
        setError(r.error ?? "No se pudo completar la operación.");
      }
    });

  const publicar = (e: EjercicioVista) =>
    accion(
      pedir(`/api/docente/ejercicios/${e.id}`, {
        metodo: "PATCH",
        cuerpo: { estado: e.estado === "PUBLICADO" ? "ARCHIVADO" : "PUBLICADO" },
      }),
      e.estado === "PUBLICADO" ? "Ejercicio archivado." : "Ejercicio publicado.",
    );

  const borrar = (e: EjercicioVista) => {
    if (!window.confirm("¿Borrar este ejercicio del banco?")) return;
    accion(
      pedir(`/api/docente/ejercicios/${e.id}`, { metodo: "DELETE" }),
      "Ejercicio borrado.",
    );
  };

  // Lo que se compone en la vista previa: la primera muestra si es plantilla ya
  // validada, y el enunciado tal cual en cualquier otro caso.
  const vistaPrevia = form.plantilla
    ? informe?.muestras[0]?.enunciado ?? ""
    : form.enunciado.trim();

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
            <CardDescription>
              Un ejercicio pertenece siempre a un tema, que es de donde hereda el motor de
              corrección. Crea primero un tema en el currículo.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Editar ejercicio" : "Nuevo ejercicio"}</CardTitle>
            <CardDescription>
              {temaActual?.motor
                ? `Se validará con el motor "${etiquetaMotor(temaActual.motor)}", que hereda del tema.`
                : "El tema elegido no tiene motor: tendrás que escribir tú la respuesta y el ejercicio se guardará sin verificar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tema">Tema</Label>
              <Select
                id="tema"
                value={form.nodoId}
                onChange={(e) => cambiar({ nodoId: e.target.value })}
                disabled={!puedeEditar}
              >
                {temas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.titulo}
                    {t.motor ? ` · ${etiquetaMotor(t.motor)}` : " · sin motor"}
                    {t.estado === "BORRADOR" ? " (borrador)" : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nivel-ej">Nivel</Label>
              <Select
                id="nivel-ej"
                value={form.nivel}
                onChange={(e) => cambiar({ nivel: e.target.value as Nivel })}
                disabled={!puedeEditar}
              >
                {NIVELES.map((n) => (
                  <option key={n} value={n}>
                    {ETIQUETA_NIVEL_CURRICULO[n as Nivel]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="enunciado-ej">
                Enunciado {form.plantilla && <span className="text-muted-foreground">(con huecos: {"{a}"}, {"{b}"}…)</span>}
              </Label>
              <Input
                id="enunciado-ej"
                value={form.enunciado}
                placeholder={form.plantilla ? "{a}x + {b} = {c}" : "3x + 5 = 20"}
                onChange={(e) => cambiar({ enunciado: e.target.value })}
                disabled={!puedeEditar}
              />
              {vistaPrevia && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                  <Math expresion={planoALatex(vistaPrevia)} display />
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.plantilla}
                onChange={(e) =>
                  cambiar({
                    plantilla: e.target.checked,
                    parametros: e.target.checked && form.parametros.length === 0
                      ? [{ nombre: "a", min: 2, max: 9 }]
                      : form.parametros,
                  })
                }
                disabled={!puedeEditar}
              />
              <span>
                Es una plantilla parametrizada
                <span className="block text-xs text-muted-foreground">
                  De un enunciado con huecos salen muchos ejercicios distintos, uno por combinación.
                </span>
              </span>
            </label>

            {form.plantilla ? (
              <div className="space-y-3 sm:col-span-2">
                <div className="space-y-2">
                  <Label htmlFor="formula">Fórmula de la respuesta</Label>
                  <Input
                    id="formula"
                    value={form.respuestaFormula}
                    placeholder="({c} - {b}) / {a}"
                    onChange={(e) => cambiar({ respuestaFormula: e.target.value })}
                    disabled={!puedeEditar}
                  />
                  <p className="text-xs text-muted-foreground">
                    En función de los parámetros. Se evalúa con aritmética exacta: 7/2 es 7/2, no
                    3,4999.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Parámetros</Label>
                  {form.parametros.map((p, i) => (
                    <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[auto_1fr_1fr_1fr_1fr_auto]">
                      <Input
                        aria-label="Nombre"
                        className="w-20"
                        value={p.nombre}
                        onChange={(e) =>
                          cambiar({
                            parametros: form.parametros.map((q, j) =>
                              j === i ? { ...q, nombre: e.target.value } : q,
                            ),
                          })
                        }
                        disabled={!puedeEditar}
                      />
                      <Input
                        aria-label="Mínimo"
                        type="number"
                        value={p.min}
                        onChange={(e) =>
                          cambiar({
                            parametros: form.parametros.map((q, j) =>
                              j === i ? { ...q, min: Number(e.target.value) } : q,
                            ),
                          })
                        }
                        disabled={!puedeEditar}
                      />
                      <Input
                        aria-label="Máximo"
                        type="number"
                        value={p.max}
                        onChange={(e) =>
                          cambiar({
                            parametros: form.parametros.map((q, j) =>
                              j === i ? { ...q, max: Number(e.target.value) } : q,
                            ),
                          })
                        }
                        disabled={!puedeEditar}
                      />
                      <Input
                        aria-label="Paso"
                        type="number"
                        step="0.5"
                        min="0"
                        value={p.paso ?? 1}
                        onChange={(e) =>
                          cambiar({
                            parametros: form.parametros.map((q, j) =>
                              j === i ? { ...q, paso: Number(e.target.value) || 1 } : q,
                            ),
                          })
                        }
                        disabled={!puedeEditar}
                      />
                      <Input
                        aria-label="Excluir"
                        placeholder="excluir: 0, 1"
                        value={(p.excluir ?? []).join(", ")}
                        onChange={(e) =>
                          cambiar({
                            parametros: form.parametros.map((q, j) =>
                              j === i
                                ? {
                                    ...q,
                                    excluir: e.target.value
                                      .split(",")
                                      .map((v) => Number(v.trim()))
                                      .filter((v) => Number.isFinite(v)),
                                  }
                                : q,
                            ),
                          })
                        }
                        disabled={!puedeEditar}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar parámetro ${p.nombre}`}
                        disabled={!puedeEditar}
                        onClick={() =>
                          cambiar({ parametros: form.parametros.filter((_, j) => j !== i) })
                        }
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
                    onClick={() =>
                      cambiar({
                        parametros: [
                          ...form.parametros,
                          {
                            nombre: String.fromCharCode(97 + form.parametros.length),
                            min: 1,
                            max: 9,
                          },
                        ],
                      })
                    }
                  >
                    Añadir parámetro
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="respuesta">Respuesta correcta</Label>
                <Input
                  id="respuesta"
                  value={form.respuestaCorrecta}
                  placeholder={temaActual?.motor ? "Déjalo vacío y lo calcula el motor" : "5"}
                  onChange={(e) => cambiar({ respuestaCorrecta: e.target.value })}
                  disabled={!puedeEditar}
                />
                <p className="text-xs text-muted-foreground">
                  {temaActual?.motor
                    ? "Si la escribes, se comprobará contra lo que calcula el motor: si no coinciden, el ejercicio no se guarda."
                    : "Obligatoria: sin motor no hay nada que la compruebe."}
                </p>
              </div>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label>Pistas (opcional)</Label>
              {form.pistas.map((pista, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={pista}
                    placeholder={`Pista ${i + 1}: el método, nunca el resultado`}
                    onChange={(e) =>
                      cambiar({
                        pistas: form.pistas.map((p, j) => (j === i ? e.target.value : p)),
                      })
                    }
                    disabled={!puedeEditar}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar pista ${i + 1}`}
                    disabled={!puedeEditar}
                    onClick={() => cambiar({ pistas: form.pistas.filter((_, j) => j !== i) })}
                  >
                    ×
                  </Button>
                </div>
              ))}
              {form.pistas.length < 5 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!puedeEditar}
                  onClick={() => cambiar({ pistas: [...form.pistas, ""] })}
                >
                  Añadir pista
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="estado-ej">Estado</Label>
              <Select
                id="estado-ej"
                value={form.estado}
                onChange={(e) => cambiar({ estado: e.target.value as Estado })}
                disabled={!puedeEditar}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_ESTADO[e as Estado]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={validar} disabled={!puedeEditar || ocupado}>
                {ocupado ? "Comprobando…" : "Validar"}
              </Button>
              <Button onClick={guardar} disabled={!puedeEditar || ocupado}>
                {form.id ? "Guardar cambios" : "Guardar en el banco"}
              </Button>
              {form.id && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setForm({ ...VACIO, nodoId: form.nodoId });
                    setInforme(null);
                  }}
                  disabled={ocupado}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {informe && <PanelInforme informe={informe} />}

      {/* ── Banco ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Banco de ejercicios</CardTitle>
          <CardDescription>
            {ejercicios.length === 0
              ? "El banco está vacío."
              : `${listados.length} de ${ejercicios.length} ejercicio(s).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={filtroTema} onChange={(e) => setFiltroTema(e.target.value)}>
              <option value="">Todos los temas</option>
              {temas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titulo}
                </option>
              ))}
            </Select>
            <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Cualquier estado</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e as Estado]}
                </option>
              ))}
            </Select>
            <Select value={filtroValidado} onChange={(e) => setFiltroValidado(e.target.value)}>
              <option value="">Verificados y sin verificar</option>
              <option value="si">Sólo verificados por el motor</option>
              <option value="no">Sólo sin verificar</option>
            </Select>
          </div>

          {listados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ningún ejercicio coincide con los filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Enunciado</th>
                    <th className="pb-2 font-medium">Tema</th>
                    <th className="pb-2 font-medium">Nivel</th>
                    <th className="pb-2 font-medium">Respuesta</th>
                    <th className="pb-2 font-medium">Verificación</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium sr-only">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {listados.map((e) => (
                    <tr key={e.id} className="border-b align-top last:border-0">
                      <td className="py-3">
                        <div className="font-medium">{e.enunciado}</div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {e.plantilla && <Badge variant="contorno">Plantilla</Badge>}
                          {e.origen === "DOCENTE" && <Badge variant="contorno">Autoría docente</Badge>}
                          {e.autor && (
                            <span className="text-xs text-muted-foreground">{e.autor.nombre}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-muted-foreground">{e.nodo?.titulo ?? "—"}</td>
                      <td className="py-3 text-muted-foreground">
                        {ETIQUETA_NIVEL_CURRICULO[e.nivel as Nivel] ?? e.nivel}
                      </td>
                      <td className="py-3 font-mono text-xs">
                        {e.plantilla ? e.respuestaFormula : e.respuestaCorrecta}
                      </td>
                      <td className="py-3">
                        {e.validado ? (
                          <Badge variant="exito">Verificado</Badge>
                        ) : (
                          <Badge variant="aviso">Sin verificar</Badge>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge variant={e.estado === "PUBLICADO" ? "exito" : "neutro"}>
                          {ETIQUETA_ESTADO[e.estado]}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {puedeEditar && (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => editar(e)}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={ocupado}
                              onClick={() => publicar(e)}
                            >
                              {e.estado === "PUBLICADO" ? "Archivar" : "Publicar"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={ocupado}
                              onClick={() => borrar(e)}
                            >
                              Borrar
                            </Button>
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

/**
 * El informe del validador, tal como lo devuelve el servidor.
 *
 * Se enseña entero —incluidas las muestras que SÍ cuadran— porque el valor de
 * la comprobación está en verla: un profesor que lee "24 de 24 combinaciones
 * verificadas contra el motor" sabe qué acaba de pasar; uno que sólo ve un
 * tick verde, no.
 */
function PanelInforme({ informe }: { informe: InformeValidacion }) {
  const tono = !informe.valido ? "error" : informe.verificado ? "exito" : "aviso";
  const titulo = !informe.valido
    ? "El ejercicio no se puede guardar todavía"
    : informe.verificado
      ? "Verificado por el motor determinista"
      : "Se puede guardar, pero sin verificación automática";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={tono}>{titulo}</Badge>
          {informe.motor && <Badge variant="contorno">{etiquetaMotor(informe.motor)}</Badge>}
          {informe.totalCombinaciones > 1 && (
            <span className="text-sm text-muted-foreground">
              {informe.comprobadas} comprobada(s) ·{" "}
              {informe.exhaustivo
                ? `todas las ${informe.totalCombinaciones} combinaciones`
                : `muestra de ${informe.totalCombinaciones} combinaciones posibles`}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {informe.errores.length > 0 && (
          <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {informe.errores.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {informe.avisos.length > 0 && (
          <ul className="space-y-1 rounded-md border border-amber-600/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
            {informe.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}

        {informe.muestras.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Enunciado generado</th>
                  <th className="pb-2 font-medium">Respuesta esperada</th>
                  <th className="pb-2 font-medium">Motor</th>
                  <th className="pb-2 font-medium">Coincide</th>
                </tr>
              </thead>
              <tbody>
                {informe.muestras.map((m, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{m.enunciado}</td>
                    <td className="py-2 font-mono text-xs">
                      {m.respuestaEsperada ?? "—"}
                      {m.adoptada && (
                        <span className="ml-1 text-muted-foreground">(la calcula el motor)</span>
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs">{m.respuestaMotor ?? "—"}</td>
                    <td className="py-2">
                      {m.coincide === true ? (
                        <Badge variant="exito">Sí</Badge>
                      ) : m.coincide === false ? (
                        <Badge variant="error">No</Badge>
                      ) : (
                        <Badge variant="contorno">No comprobable</Badge>
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
  );
}
