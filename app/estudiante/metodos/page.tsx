import type { Metadata } from "next";

import { MetodosVista } from "@/components/estudiante/metodos";

export const metadata: Metadata = { title: "Métodos · MentorIA Math" };
export const dynamic = "force-dynamic";

/** /estudiante/metodos — practicar los métodos que publica el profesor. */
export default function PaginaMetodos() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Métodos</h1>
        <p className="text-muted-foreground">
          Los métodos que ha publicado tu profesor. Elige uno, resuelve un problema de ese tipo y el tutor te dirá si va bien y te dará pistas si te
          atascas.
        </p>
      </div>
      <MetodosVista />
    </div>
  );
}
