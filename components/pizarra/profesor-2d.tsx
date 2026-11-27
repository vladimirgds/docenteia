"use client";

import { useEffect, useRef } from "react";

import { EVENTO_MARCA_VOZ } from "@/lib/pizarra/voz-navegador";
import type { PropsProfesor } from "./profesor-tipos";

/**
 * PROFESOR 2D (PMV 3 · H3B) — el respaldo del 3D y el modo «2D» que el alumno
 * puede elegir. Hace lo mismo que el 3D: habla (la boca sigue las marcas de
 * la voz), señala el término con el brazo, pregunta, espera y da pistas.
 * Es un SVG: funciona sin WebGL y en cualquier móvil.
 */
export function Profesor2D({ hablando, objetivo, gesto, className, alMoverMano }: PropsProfesor) {
  const mano = useRef<SVGCircleElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const bocaRef = useRef<SVGEllipseElement>(null);
  const boca = useRef(0);
  const marcas = useRef(0);
  const ultimaMarca = useRef(0);

  // Boca: se abre con cada marca de la voz y se cierra sola. Si la voz no da
  // marcas (voz desactivada o un navegador que no las emite), se mueve a ritmo
  // mientras habla. Se escribe directamente en el SVG: nada de re-renderizar
  // React sesenta veces por segundo.
  useEffect(() => {
    const alMarca = () => {
      marcas.current++;
      ultimaMarca.current = performance.now();
      boca.current = 1;
      caja.current?.setAttribute("data-marcas", String(marcas.current));
    };
    window.addEventListener(EVENTO_MARCA_VOZ, alMarca);
    let raf = 0;
    const paso = () => {
      const sinMarcas = performance.now() - ultimaMarca.current > 450;
      boca.current = hablando && sinMarcas ? 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 110)) : boca.current * 0.82;
      bocaRef.current?.setAttribute("ry", (1.5 + boca.current * 7).toFixed(2));
      caja.current?.setAttribute("data-boca", boca.current.toFixed(2));
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => {
      window.removeEventListener(EVENTO_MARCA_VOZ, alMarca);
      cancelAnimationFrame(raf);
    };
  }, [hablando]);

  // El brazo apunta al término (el tablero está a la DERECHA del profesor).
  const senala = gesto === "senala" && objetivo;
  const angulo = senala ? -70 + Math.max(0, Math.min(1, objetivo.y)) * 90 : gesto === "pista" ? -140 : gesto === "pregunta" ? -150 : 20;

  useEffect(() => {
    if (!alMoverMano) return;
    let raf = 0;
    const informar = () => {
      const r = mano.current?.getBoundingClientRect();
      alMoverMano(r && senala ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
      raf = requestAnimationFrame(informar);
    };
    raf = requestAnimationFrame(informar);
    return () => {
      cancelAnimationFrame(raf);
      alMoverMano(null);
    };
  }, [alMoverMano, senala]);

  const mirada = gesto === "espera" || gesto === "pregunta" ? 0 : 3;
  return (
    <div
      ref={caja}
      className={className}
      role="img"
      aria-label="Profesor virtual"
      data-profesor="2d"
      data-hablando={hablando}
      data-gesto={gesto}
    >
      <svg viewBox="0 0 200 220" className="h-full w-full">
        {/* cuerpo */}
        <rect x="62" y="110" width="76" height="90" rx="18" className="fill-sky-600 dark:fill-sky-500" />
        {/* cabeza */}
        <circle cx="100" cy="72" r="38" className="fill-amber-200 dark:fill-amber-300" />
        {/* ojos: miran al tablero o al alumno */}
        <circle cx={86 + mirada} cy="66" r="4" className="fill-slate-800" />
        <circle cx={114 + mirada} cy="66" r="4" className="fill-slate-800" />
        {/* boca: se abre con la voz */}
        <ellipse ref={bocaRef} cx="100" cy="90" rx="10" ry="1.5" className="fill-rose-700" data-testid="boca-2d" />
        {/* brazo derecho: gira desde el hombro */}
        <g transform={`rotate(${angulo} 136 122)`} style={{ transition: "transform 300ms ease-out" }} data-testid="brazo-2d">
          <rect x="136" y="116" width="52" height="12" rx="6" className="fill-sky-700 dark:fill-sky-400" />
          <circle ref={mano} cx="190" cy="122" r="8" className="fill-amber-200 dark:fill-amber-300" />
        </g>
        {/* brazo izquierdo, quieto */}
        <rect x="40" y="118" width="26" height="12" rx="6" className="fill-sky-700 dark:fill-sky-400" />
        {gesto === "pregunta" && (
          <text x="150" y="40" fontSize="34" className="fill-primary" aria-hidden>
            ?
          </text>
        )}
        {gesto === "pista" && (
          <text x="146" y="44" fontSize="28" aria-hidden>
            💡
          </text>
        )}
        {gesto === "espera" && (
          <text x="146" y="44" fontSize="26" className="fill-muted-foreground" aria-hidden>
            …
          </text>
        )}
      </svg>
    </div>
  );
}
