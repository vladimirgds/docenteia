"use client";

import katex from "katex";
import { Fragment, useMemo } from "react";

import { partirNota } from "@/lib/leccion/notas";
import { ROL, rol } from "@/lib/leccion/roles";
import { planoALatex, separarProsaYMatematicas } from "@/lib/matematicas";
import { cn } from "@/lib/utils";

/**
 * UNA NOTA ESCRITA EN LA PIZARRA, CON SU JERARQUÍA.
 *
 * El rótulo ("Fracciones equivalentes:", "MCM(2, 3):") y la prosa van en letra
 * de pizarra —rol BOARD_LABEL—; las fórmulas, compuestas por KaTeX —rol
 * MATH_EXPRESSION—; y cada idea en su renglón, ALINEADA A LA IZQUIERDA y con
 * aire entre una y otra: el cliente vio las propiedades "amontonadas al centro"
 * y pidió alinearlas a la izquierda con espaciado amplio.
 *
 * Los tamaños no se fijan aquí sino en la hoja de estilos (`.pz-nota`), que es
 * donde vive el tema de proyección.
 */
export function NotaDePizarra({ texto, className }: { texto: string; className?: string }) {
  const trozos = useMemo(() => partirNota(texto), [texto]);
  if (trozos.length === 0) return null;
  return (
    <div className={cn("pz-nota", className)} {...rol(ROL.PIZARRA)}>
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
 * en ESTILO DE BLOQUE (`\displaystyle`): en línea, KaTeX baja las fracciones a
 * tamaño de subíndice.
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
          <span key={i} {...rol(ROL.FORMULA)} dangerouslySetInnerHTML={{ __html: p.html }} />
        ) : (
          <Fragment key={i}>{p.contenido}</Fragment>
        ),
      )}
    </span>
  );
}

/**
 * Una fracción escrita con PALABRAS —Numerador sobre Denominador—, con su raya
 * horizontal. Las palabras son escritura de pizarra, así que van en su letra y a
 * su tamaño; antes las componía KaTeX en su tipografía de fórmula y en la
 * pizarra se leían en otra letra que las notas de al lado (el cliente:
 * "considerar el mismo tamaño y tipo de letra").
 */
function FraccionDePalabras({ arriba, abajo }: { arriba: string; abajo: string }) {
  return (
    <span
      className="pz-fraccion-palabras"
      {...rol(ROL.PIZARRA)}
      role="math"
      aria-label={`${arriba} partido por ${abajo}`}
    >
      <span className="pz-fraccion-palabras-arriba">{arriba}</span>
      <span className="pz-fraccion-palabras-abajo">{abajo}</span>
    </span>
  );
}

/**
 * La definición formal de la fracción del dibujo: Numerador sobre Denominador,
 * igual a 1 sobre 4, con las dos rayas horizontales.
 *
 * Las palabras, en letra de pizarra (son escritura); el igual y la fracción
 * numérica, en KaTeX (son fórmula). A la misma letra y tamaño que las notas: es
 * una nota más de la pizarra, no un recuadro aparte.
 */
export function FraccionFormal({
  numerador,
  denominador,
  className,
}: {
  numerador?: number;
  denominador?: number;
  className?: string;
}) {
  const n = Number.isInteger(numerador) ? (numerador as number) : 1;
  const d = Number.isInteger(denominador) && (denominador as number) > 0 ? (denominador as number) : 4;
  const html = useMemo(() => {
    try {
      return katex.renderToString(`= \\dfrac{${n}}{${d}}`, { displayMode: false, throwOnError: false, strict: false });
    } catch {
      return null;
    }
  }, [n, d]);
  return (
    <div
      className={cn("pz-nota pz-fraccion-formal", className)}
      {...rol(ROL.PIZARRA)}
      aria-label={`Numerador partido por denominador, igual a ${n} partido por ${d}`}
    >
      <p className="pz-nota-trozo">
        <FraccionDePalabras arriba="Numerador" abajo="Denominador" />{" "}
        {html ? <span {...rol(ROL.FORMULA)} dangerouslySetInnerHTML={{ __html: html }} /> : `= ${n} sobre ${d}`}
      </p>
    </div>
  );
}
