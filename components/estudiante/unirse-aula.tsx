"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pedir } from "@/lib/docente/cliente";
import { cn } from "@/lib/utils";

interface AulaUnida {
  nombre: string;
  grado: number;
  seccion: string;
  institucion: string;
  docente: string;
}

/**
 * UNIRSE A UN AULA (HITO 3) — lo que ve el alumno con el código de su
 * profesor.
 *
 * El campo se precarga solo si llega `?codigo=` en la URL (el enlace que
 * copia el docente), y si llega se envía de una, sin que el alumno tenga que
 * tocar nada más que "Confirmar". El código se escribe tal como lo generó
 * `generarCodigoAcceso`: mayúsculas, ancho de fuente monoespaciado, para que
 * no se confunda una letra con un número al copiarlo de la pizarra.
 */
export function UnirseAula({ codigoInicial }: { codigoInicial?: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [codigo, setCodigo] = useState(codigoInicial ?? "");
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);
  const [unida, setUnida] = useState<AulaUnida | null>(null);

  const confirmar = () => {
    if (codigo.trim().length < 4) {
      setAviso({ tono: "mal", texto: "Ese código es demasiado corto." });
      return;
    }
    iniciar(async () => {
      const r = await pedir<{ aula: AulaUnida }>("/api/estudiante/unirse", {
        metodo: "POST",
        cuerpo: { codigoAcceso: codigo.trim() },
      });
      if (r.ok) {
        setUnida(r.datos.aula);
        setAviso(null);
      } else {
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  if (unida) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>¡Ya estás en la clase!</CardTitle>
          <CardDescription>
            {unida.institucion} · {unida.grado}.º {unida.seccion}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">{unida.nombre}</span>, con el profesor{" "}
            <span className="font-medium">{unida.docente}</span>.
          </p>
          <Button className="w-full" onClick={() => router.push("/estudiante")}>
            Ir a mis tareas
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Unirme a mi clase</CardTitle>
        <CardDescription>Escribe el código que te dio tu profesor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {aviso && (
          <div
            role="status"
            className={cn(
              "rounded-md border px-4 py-3 text-sm",
              "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {aviso.texto}
          </div>
        )}
        <Input
          autoFocus
          placeholder="XXXXXX"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && confirmar()}
          maxLength={12}
          className="h-14 text-center font-mono text-xl uppercase tracking-widest"
        />
        <Button className="w-full" onClick={confirmar} disabled={pendiente}>
          Confirmar
        </Button>
      </CardContent>
    </Card>
  );
}
