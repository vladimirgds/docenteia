"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";

import { Profesor2D } from "./profesor-2d";
import type { PropsProfesor } from "./profesor-tipos";

export type { Gesto, ObjetivoLaser } from "./profesor-tipos";

/**
 * EL PROFESOR VIRTUAL (PMV 3 · H3B).
 *
 *  · 3D: personaje GLB con esqueleto y expresiones (`profesor-glb.tsx`), que se
 *    carga BAJO DEMANDA —ni three.js ni React Three Fiber entran en el paquete
 *    inicial de la página; se piden sólo si hay WebGL y el alumno no eligió 2D—.
 *  · 2D: el respaldo (`profesor-2d.tsx`): sin WebGL, si el modelo no carga, o si
 *    el alumno lo elige. Hace lo mismo: habla, señala, pregunta, espera, pista.
 */
const ProfesorGLB = dynamic(() => import("./profesor-glb"), {
  ssr: false,
  loading: () => <div className="h-72 rounded-lg border" data-profesor="cargando" />,
});

/** Si el modelo 3D falla (red, GPU…), la clase sigue con el profesor 2D. */
class SiFalla extends Component<{ respaldo: ReactNode; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  componentDidCatch(e: unknown) {
    console.warn("[profesor] el modelo 3D no se pudo mostrar; se usa el 2D:", e instanceof Error ? e.message : e);
  }
  render() {
    return this.state.fallo ? this.props.respaldo : this.props.children;
  }
}

function hayWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Profesor3D(props: PropsProfesor & { modo?: "3d" | "2d" | null }) {
  const { modo = "3d", ...resto } = props;
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(hayWebGL()), []);

  if (modo === "2d" || webgl === false) return <Profesor2D {...resto} />;
  // Todavía decidiendo (preferencia del alumno o comprobación de WebGL).
  if (modo === null || webgl === null) return <div className={resto.className} data-profesor="cargando" />;
  return (
    <SiFalla respaldo={<Profesor2D {...resto} />}>
      <ProfesorGLB {...resto} />
    </SiFalla>
  );
}
