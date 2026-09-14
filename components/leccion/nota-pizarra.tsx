"use client";

import katex from "katex";
import { Fragment, useMemo } from "react";

import { partirNota } from "@/lib/leccion/notas";
import { planoALatex, separarProsaYMatematicas } from "@/lib/matematicas";
import { cn } from "@/lib/utils";

/**
 * UNA NOTA ESCRITA EN LA PIZARRA, CON SU JERARQUÍA.
 *
 * El rótulo ("Fracciones equivalentes:", "MCM(2, 3):") va en la letra de
 * pizarra y a tamaño de aula; lo que dice, con sus fórmulas compuestas por
 * KaTeX; y cada idea en su renglón. Es lo que el cliente pidió para la
 * proyección: antes el rótulo salía a tamaño de párrafo junto a una fórmula a
 * tamaño de proyección, y en el aula no se leía.
 *
 * Los tamaños no se fijan aquí sino en la hoja de estilos (`.pz-nota`), que es
 * donde vive el tema de proyección: fuera de él la nota se lee a tamaño normal.
 */
export function NotaDePizarra({ texto, className }: { texto: string; className?: string }) {
  const trozos = useMemo(() => partirNota(texto), [texto]);
  if (trozos.length === 0) return null;
  return (
    <div className={cn("pz-nota pz-tiza", className)}>
      {trozos.map((t, i) => (
        <p key={i} className="pz-nota-trozo">
          {t.rotulo ? <span className="pz-nota-rotulo">{t.rotulo}</span> : null}
          {t.rotulo ? " " : null}
          {t.fraccion ? (
            <FraccionDePalabras arriba={t.fraccion.arriba} abajo={t.fraccion.abajo} />
          ) : (
            <CuerpoDeNota texto={t.cuerpo} />
          )}
        </p>
      ))}
    </div>
  );
}

/**
 * Lo que dice la nota: la prosa en letra de pizarra y cada fórmula compuesta
 * en ESTILO DE BLOQUE (`\displaystyle`). En línea, KaTeX baja las fracciones a
 * tamaño de subíndice: proyectadas, "2/4 = 1/2" quedaba con los números más
 * pequeños que el propio rótulo.
 */
function CuerpoDeNota({ texto }: { texto: string }) {
  const partes = useMemo(
    () =>
      separarProsaYMatematicas(texto).map((p) => {
        if (p.tipo === "texto") return p;
        try {
          return {
            ...p,
            html: katex.renderToString(`\\displaystyle ${planoALatex(p.contenido)}`, {
              throwOnError: false,
              strict: false,
            }),
          };
        } catch {
          return { tipo: "texto" as const, contenido: p.contenido };
        }
      }),
    [texto],
  );
  return (
    <span className="pz-nota-cuerpo">
      {partes.map((p, i) =>
        "html" in p && p.html ? (
          <span key={i} dangerouslySetInnerHTML={{ __html: p.html }} />
        ) : (
          <Fragment key={i}>{p.contenido}</Fragment>
        ),
      )}
    </span>
  );
}

/** "Numerador / Denominador" como fracción de verdad, con su raya. */
function FraccionDePalabras({ arriba, abajo }: { arriba: string; abajo: string }) {
  const html = useMemo(() => {
    const limpio = (s: string) => s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, "");
    try {
      return katex.renderToString(`\\dfrac{\\text{${limpio(arriba)}}}{\\text{${limpio(abajo)}}}`, {
        throwOnError: false,
        strict: false,
      });
    } catch {
      return null;
    }
  }, [arriba, abajo]);
  if (!html) return <span>{`${arriba} / ${abajo}`}</span>;
  return <span className="pz-nota-fraccion" dangerouslySetInnerHTML={{ __html: html }} />;
}
