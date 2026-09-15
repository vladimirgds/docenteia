"use client";

import { TextoMatematico } from "@/components/math";
import { ROL, rol } from "@/lib/leccion/roles";
import { cn } from "@/lib/utils";

/**
 * LO QUE DICE EL TUTOR, ESCRITO: rol TUTOR_DIALOG.
 *
 * Subtítulos, la frase bajo el paso animado y la retroalimentación. La prosa va
 * en la fuente del tutor (Segoe Print, la decide la hoja de estilos por el rol)
 * y cada fórmula de la frase la compone KaTeX: "Resultado final: 11/10" sale con
 * la fracción vertical, nunca con la barra inclinada que el cliente fotografió.
 */
export function TextoTutor({
  texto,
  className,
  como: Etiqueta = "p",
  ...resto
}: {
  texto: string;
  className?: string;
  como?: "p" | "span" | "div";
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  return (
    <Etiqueta {...resto} {...rol(ROL.TUTOR)} className={cn(className)}>
      <TextoMatematico texto={texto} />
    </Etiqueta>
  );
}
