"use client";

import katex from "katex";
import { Fragment, useMemo } from "react";

import {
  planoALatex,
  separarFormulas,
  separarProsaYMatematicas,
} from "@/lib/matematicas";
import { cn } from "@/lib/utils";

/**
 * Renderiza una expresión matemática AISLADA con KaTeX.
 *
 * El HTML que produce KaTeX se inyecta con dangerouslySetInnerHTML, que es el
 * modo previsto de uso de la librería. Es seguro aquí porque KaTeX escapa la
 * entrada y porque las expresiones provienen del banco de contenidos del
 * servidor, nunca de texto escrito por un alumno.
 */
export function Math({
  expresion,
  display = false,
  className,
}: {
  expresion: string;
  /** true = fórmula en bloque, centrada; false = en línea con el texto. */
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(() => renderKatex(expresion, display), [expresion, display]);

  return (
    <span
      className={cn(display && "block my-2", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderKatex(expresion: string, display: boolean): string {
  try {
    return katex.renderToString(expresion, {
      displayMode: display,
      throwOnError: false,
      // Una expresión mal escrita se muestra en rojo en lugar de tumbar la
      // página: un fallo de contenido no debe romper la lección.
      errorColor: "hsl(var(--destructive))",
      strict: false,
    });
  } catch {
    return escaparHtml(expresion);
  }
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Renderiza un texto MIXTO: prosa con fórmulas intercaladas.
 *
 * Funciona de dos maneras, según de dónde venga el texto:
 *
 *  · **Con delimitadores.** Si el texto trae `$…$` (o `$$…$$` para bloque), se
 *    respetan: es el caso del banco de preguntas, donde el contenido se escribe
 *    a mano y conviene decir explícitamente qué es fórmula.
 *
 *  · **Sin delimitadores.** Si no los trae, las fórmulas se detectan. Es el
 *    caso de las explicaciones del tutor, que el motor pedagógico produce con
 *    la matemática incrustada en la frase ("la derivada de x³ es 3x²") y sin
 *    marcarla, porque su suite de pruebas trabaja sobre ese texto plano.
 *
 * En ambos casos sólo se compone la matemática: la prosa se queda como prosa.
 */
export function TextoMatematico({
  texto,
  className,
}: {
  texto: string;
  className?: string;
}) {
  const partes = useMemo(() => {
    const conDelimitadores = /\$[^$\n]+\$/.test(String(texto ?? ""));
    if (conDelimitadores) return separarFormulas(texto);
    // La detección automática entrega la fórmula en notación plana ("3x²"),
    // así que hay que traducirla antes de componerla.
    return separarProsaYMatematicas(texto).map((p) =>
      p.tipo === "texto" ? p : { ...p, contenido: planoALatex(p.contenido) },
    );
  }, [texto]);

  return (
    <span className={className}>
      {partes.map((parte, i) =>
        parte.tipo === "texto" ? (
          <Fragment key={i}>{parte.contenido}</Fragment>
        ) : (
          // Cada fórmula lleva su rol: la frase que la rodea puede ser del
          // tutor (Segoe Print) o de la pizarra (Chalkboard SE), pero la fórmula
          // es siempre MATH_EXPRESSION y la compone KaTeX.
          <span
            key={i}
            data-rol="MATH_EXPRESSION"
            className={parte.tipo === "bloque" ? "block my-2" : undefined}
            dangerouslySetInnerHTML={{
              __html: renderKatex(parte.contenido, parte.tipo === "bloque"),
            }}
          />
        ),
      )}
    </span>
  );
}
