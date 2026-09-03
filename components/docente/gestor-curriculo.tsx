"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pedir } from "@/lib/docente/cliente";
import { ETAPAS, describirAlcance } from "@/lib/curriculo/etapas";
import {
  ESTADOS,
  ETIQUETA_ESTADO,
  ETIQUETA_NIVEL_CURRICULO,
  MOTORES_DISPONIBLES,
  aplanarArbol,
  etiquetaMotor,
  type Estado,
} from "@/lib/docente/curriculo";
import { cn } from "@/lib/utils";

/**
 * GESTIÓN CURRICULAR — la mesa de trabajo del docente.
 *
 * Dos bloques y una tabla:
 *
 *   · Las ASIGNATURAS, que son el primer nivel de categorización y se crean
 *     aquí mismo, sin salir de la pantalla: obligar a ir a otro sitio a crear
 *     "Álgebra" antes de poder crear su primer tema es la clase de fricción que
 *     hace que un profesor abandone la herramienta el primer día.
 *   · El ÁRBOL DE TEMAS, sangrado por profundidad, con lo que de verdad se
 *     necesita saber de un vistazo: en qué estado está, con qué motor se
 *     corrige, cuántas reglas y cuántos ejercicios tiene.
 *
 * El filtrado se hace en memoria a propósito. El currículo de un centro son
 * cientos de temas, no millones: filtrar aquí es instantáneo y no gasta un viaje
 * al servidor por cada tecla. La API acepta los mismos filtros para quien los
 * necesite desde fuera (la batería de QA, por ejemplo).
 */

export interface MateriaVista {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  color: string | null;
  orden: number;
  activa: boolean;
  temas: number;
}

export interface TemaVista {
  id: string;
  clave: string;
  titulo: string;
  descripcion: string | null;
  motor: string | null;
  nivel: string | null;
  etapa: string | null;
  cursoMin: number | null;
  orden: number;
  estado: Estado;
  etiquetas: string[];
  objetivos: string[];
  padreId: string | null;
  materiaId: string | null;
  materia: { id: string; nombre: string; color: string | null } | null;
  autor: { id: string; nombre: string } | null;
  reglas: number;
  ejercicios: number;
  hijos: number;
}

interface Props {
  materias: MateriaVista[];
  temas: TemaVista[];
  puedeEditar: boolean;
}

export function GestorCurriculo({ materias, temas, puedeEditar }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroMateria, setFiltroMateria] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroMotor, setFiltroMotor] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("");

  const [nuevaMateria, setNuevaMateria] = useState({ nombre: "", descripcion: "", color: "#2563eb" });
  const [creandoMateria, setCreandoMateria] = useState(false);

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return temas.filter((t) => {
      if (filtroMateria && t.materiaId !== filtroMateria) return false;
      if (filtroEstado && t.estado !== filtroEstado) return false;
      if (filtroMotor === "SIN_MOTOR" && t.motor) return false;
      if (filtroMotor && filtroMotor !== "SIN_MOTOR" && t.motor !== filtroMotor) return false;
      if (filtroEtapa === "SIN_ETAPA" && t.etapa) return false;
      if (filtroEtapa && filtroEtapa !== "SIN_ETAPA" && t.etapa !== filtroEtapa) return false;
      if (!texto) return true;
      return (
        t.titulo.toLowerCase().includes(texto) ||
        t.clave.toLowerCase().includes(texto) ||
        (t.descripcion ?? "").toLowerCase().includes(texto) ||
        t.etiquetas.some((e) => e.includes(texto))
      );
    });
  }, [temas, busqueda, filtroMateria, filtroEstado, filtroMotor, filtroEtapa]);

  // Con filtros activos el árbol pierde padres, y sangrar respecto a un padre
  // que no está en pantalla despista más que ayuda: en ese caso se lista plano.
  const hayFiltros = Boolean(busqueda || filtroMateria || filtroEstado || filtroMotor || filtroEtapa);
  const filas = hayFiltros
    ? filtrados.map((nodo) => ({ nodo, profundidad: 0 }))
    : aplanarArbol(filtrados);

  const metricas = useMemo(() => {
    const publicados = temas.filter((t) => t.estado === "PUBLICADO").length;
    const borradores = temas.filter((t) => t.estado === "BORRADOR").length;
    const sinMotor = temas.filter((t) => !t.motor).length;
    const sinNivel = temas.filter((t) => !t.nivel).length;
    const ejercicios = temas.reduce((n, t) => n + t.ejercicios, 0);
    return { publicados, borradores, sinMotor, sinNivel, ejercicios };
  }, [temas]);

  // ── Acciones ───────────────────────────────────────────────────────────────
  const ejecutar = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
    iniciar(async () => {
      const r = await accion();
      if (r.ok) {
        setAviso({ tono: "ok", texto: exito });
        router.refresh();
      } else {
        setAviso({ tono: "mal", texto: r.error ?? "No se pudo completar la operación." });
      }
    });
  };

  const cambiarEstado = (tema: TemaVista, estado: Estado) =>
    ejecutar(
      () => pedir(`/api/docente/temas/${tema.id}`, { metodo: "PATCH", cuerpo: { estado } }),
      `"${tema.titulo}" ahora está en ${ETIQUETA_ESTADO[estado].toLowerCase()}.`,
    );

  const borrarTema = (tema: TemaVista) => {
    // Confirmación nativa: es un panel de administración, no una pantalla de
    // alumno, y el diálogo del navegador es inequívoco y accesible sin esfuerzo.
    if (!window.confirm(`¿Borrar el tema "${tema.titulo}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    ejecutar(
      () => pedir(`/api/docente/temas/${tema.id}`, { metodo: "DELETE" }),
      `Tema "${tema.titulo}" borrado.`,
    );
  };

  const crearMateria = () => {
    if (nuevaMateria.nombre.trim().length < 2) {
      setAviso({ tono: "mal", texto: "La asignatura necesita un nombre." });
      return;
    }
    ejecutar(async () => {
      const r = await pedir("/api/docente/materias", {
        metodo: "POST",
        cuerpo: {
          nombre: nuevaMateria.nombre.trim(),
          descripcion: nuevaMateria.descripcion.trim() || null,
          color: nuevaMateria.color || null,
        },
      });
      if (r.ok) {
        setNuevaMateria({ nombre: "", descripcion: "", color: "#2563eb" });
        setCreandoMateria(false);
      }
      return r;
    }, "Asignatura creada.");
  };

  const borrarMateria = (materia: MateriaVista) => {
    if (!window.confirm(`¿Borrar la asignatura "${materia.nombre}"?`)) return;
    ejecutar(
      () => pedir(`/api/docente/materias/${materia.id}`, { metodo: "DELETE" }),
      `Asignatura "${materia.nombre}" borrada.`,
    );
  };

  const alternarActiva = (materia: MateriaVista) =>
    ejecutar(
      () =>
        pedir(`/api/docente/materias/${materia.id}`, {
          metodo: "PATCH",
          cuerpo: { activa: !materia.activa },
        }),
      materia.activa ? "Asignatura desactivada." : "Asignatura activada.",
    );

  return (
    <div className="space-y-6">
      {aviso && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            aviso.tono === "ok"
              ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {aviso.texto}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { rotulo: "Temas publicados", valor: metricas.publicados, pie: "visibles para el alumno" },
          { rotulo: "En borrador", valor: metricas.borradores, pie: "sólo los ves tú" },
          { rotulo: "Sin motor", valor: metricas.sinMotor, pie: "sin corrección automática" },
          // Un tema sin nivel no le llega a ningún alumno por la evaluación
          // inicial, que se compone por niveles. Conviene verlo de un vistazo.
          { rotulo: "Sin nivel", valor: metricas.sinNivel, pie: "no entran en la evaluación inicial" },
          { rotulo: "Ejercicios en el banco", valor: metricas.ejercicios, pie: "en todos los temas" },
        ].map((m) => (
          <Card key={m.rotulo}>
            <CardHeader className="pb-2">
              <CardDescription>{m.rotulo}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{m.valor}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">{m.pie}</CardContent>
          </Card>
        ))}
      </div>

      {/* ── Asignaturas ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Asignaturas</CardTitle>
            <CardDescription>
              El primer nivel del currículo. Cada tema pertenece a una asignatura.
            </CardDescription>
          </div>
          {puedeEditar && (
            <Button variant="outline" size="sm" onClick={() => setCreandoMateria((v) => !v)}>
              {creandoMateria ? "Cancelar" : "Nueva asignatura"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {creandoMateria && puedeEditar && (
            <div className="grid gap-3 rounded-md border bg-muted/30 p-4 sm:grid-cols-[1fr_1fr_auto_auto]">
              <Input
                placeholder="Nombre (p. ej. Álgebra)"
                value={nuevaMateria.nombre}
                onChange={(e) => setNuevaMateria({ ...nuevaMateria, nombre: e.target.value })}
              />
              <Input
                placeholder="Descripción (opcional)"
                value={nuevaMateria.descripcion}
                onChange={(e) => setNuevaMateria({ ...nuevaMateria, descripcion: e.target.value })}
              />
              <input
                type="color"
                aria-label="Color de la asignatura"
                className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background"
                value={nuevaMateria.color}
                onChange={(e) => setNuevaMateria({ ...nuevaMateria, color: e.target.value })}
              />
              <Button onClick={crearMateria} disabled={pendiente}>
                Crear
              </Button>
            </div>
          )}

          {materias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay asignaturas. Crea la primera para empezar a colgar temas de ella.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {materias.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full border"
                    style={{ backgroundColor: m.color ?? "transparent" }}
                  />
                  <span className="font-medium">{m.nombre}</span>
                  <span className="text-xs text-muted-foreground">{m.codigo}</span>
                  {!m.activa && <Badge variant="contorno">Inactiva</Badge>}
                  <span className="text-muted-foreground">
                    {m.temas} tema{m.temas === 1 ? "" : "s"}
                  </span>
                  {m.descripcion && (
                    <span className="hidden text-muted-foreground md:inline">· {m.descripcion}</span>
                  )}
                  {puedeEditar && (
                    <span className="ml-auto flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendiente}
                        onClick={() => alternarActiva(m)}
                      >
                        {m.activa ? "Desactivar" : "Activar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendiente}
                        onClick={() => borrarMateria(m)}
                      >
                        Borrar
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Temas ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Temas</CardTitle>
            <CardDescription>
              {temas.length === 0
                ? "El temario está vacío."
                : `${filas.length} de ${temas.length} tema(s).`}
            </CardDescription>
          </div>
          {puedeEditar && (
            <Button asChild size="sm">
              <Link href="/docente/crear-tema">Crear tema</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              placeholder="Buscar por título, clave o etiqueta"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <Select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)}>
              <option value="">Todas las asignaturas</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Select>
            <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Cualquier estado</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </Select>
            <Select value={filtroMotor} onChange={(e) => setFiltroMotor(e.target.value)}>
              <option value="">Cualquier motor</option>
              <option value="SIN_MOTOR">Sin motor</option>
              {MOTORES_DISPONIBLES.map((m) => (
                <option key={m.motor} value={m.motor}>
                  {m.titulo}
                </option>
              ))}
            </Select>
            <Select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
              <option value="">Cualquier etapa</option>
              <option value="SIN_ETAPA">Sin etapa (transversal)</option>
              {ETAPAS.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.nombre}
                </option>
              ))}
            </Select>
          </div>

          {filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ningún tema coincide con los filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Tema</th>
                    <th className="pb-2 font-medium">Asignatura</th>
                    <th className="pb-2 font-medium">Motor</th>
                    <th className="pb-2 font-medium">Alcance</th>
                    <th className="pb-2 font-medium">Nivel</th>
                    <th className="pb-2 font-medium">Contenido</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium sr-only">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(({ nodo, profundidad }) => (
                    <tr key={nodo.id} className="border-b last:border-0 align-top">
                      <td className="py-3" style={{ paddingLeft: profundidad * 20 }}>
                        <div className="font-medium">
                          {profundidad > 0 && (
                            <span aria-hidden className="mr-1 text-muted-foreground">
                              ↳
                            </span>
                          )}
                          {nodo.titulo}
                        </div>
                        <div className="text-xs text-muted-foreground">{nodo.clave}</div>
                        {nodo.etiquetas.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {nodo.etiquetas.map((e) => (
                              <Badge key={e} variant="contorno">
                                {e}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">{nodo.materia?.nombre ?? "—"}</td>
                      <td className="py-3">
                        {nodo.motor ? (
                          <Badge variant="exito">{etiquetaMotor(nodo.motor)}</Badge>
                        ) : (
                          <Badge variant="aviso" title="Sus ejercicios no se corrigen solos">
                            Sin motor
                          </Badge>
                        )}
                      </td>
                      <td className="py-3">
                        {nodo.etapa ? (
                          <span className="text-muted-foreground">
                            {describirAlcance({
                              etapa: nodo.etapa as never,
                              cursoMin: nodo.cursoMin,
                            })}
                          </span>
                        ) : (
                          <Badge variant="contorno" title="Puede llegarle a cualquier alumno">
                            Transversal
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {nodo.nivel
                          ? ETIQUETA_NIVEL_CURRICULO[
                              nodo.nivel as keyof typeof ETIQUETA_NIVEL_CURRICULO
                            ]
                          : "—"}
                      </td>
                      <td className="py-3 tabular-nums text-muted-foreground">
                        {nodo.reglas} regla{nodo.reglas === 1 ? "" : "s"} · {nodo.ejercicios} ej.
                      </td>
                      <td className="py-3">
                        <Badge variant={nodo.estado === "PUBLICADO" ? "exito" : "neutro"}>
                          {ETIQUETA_ESTADO[nodo.estado]}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {puedeEditar && (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/docente/crear-tema?id=${nodo.id}`}>Editar</Link>
                            </Button>
                            {nodo.estado !== "PUBLICADO" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={pendiente}
                                onClick={() => cambiarEstado(nodo, "PUBLICADO")}
                              >
                                Publicar
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={pendiente}
                                onClick={() => cambiarEstado(nodo, "ARCHIVADO")}
                              >
                                Archivar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pendiente}
                              onClick={() => borrarTema(nodo)}
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

      {!puedeEditar && (
        <p className="text-sm text-muted-foreground">
          Tu perfil puede consultar el currículo, pero no modificarlo. La autoría corresponde al
          profesorado.
        </p>
      )}
    </div>
  );
}
