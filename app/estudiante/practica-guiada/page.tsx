import type { Metadata } from "next";

import { PracticaGuiadaVista } from "@/components/estudiante/practica-guiada";

export const metadata: Metadata = { title: "Práctica guiada · MentorIA Math" };
export const dynamic = "force-dynamic";

/** /estudiante/practica-guiada — resolver una ecuación paso a paso con un tutor que valida cada paso. */
export default function PaginaPracticaGuiada() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Práctica guiada</h1>
        <p className="text-muted-foreground">
          Resuelve una ecuación paso a paso. El tutor comprueba cada paso, te explica los errores y te da pistas cuando las
          necesitas.
        </p>
      </div>
      <PracticaGuiadaVista />
    </div>
  );
}
