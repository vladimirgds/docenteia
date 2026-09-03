"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioRegistro() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const datos = new FormData(e.currentTarget);
    // El curso NO se pide aquí. Se elige en la pantalla siguiente, que es la de
    // configuración de nivel educativo: es el dato que decide qué contenidos
    // recibe el alumno y merece su propio paso, no un desplegable al final de
    // un formulario de alta.
    const cuerpo = {
      nombre: String(datos.get("nombre") ?? ""),
      email: String(datos.get("email") ?? ""),
      password: String(datos.get("password") ?? ""),
    };

    const respuesta = await fetch("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });

    if (!respuesta.ok) {
      const datosError = await respuesta.json().catch(() => ({}));
      setError(datosError.error ?? "No se pudo completar el registro.");
      setEnviando(false);
      return;
    }

    // Se entra directamente: pedirle al alumno que vuelva a escribir lo que
    // acaba de escribir no aporta nada.
    const acceso = await signIn("credentials", {
      email: cuerpo.email,
      password: cuerpo.password,
      redirect: false,
    });

    if (!acceso || acceso.error) {
      router.push("/login");
      return;
    }

    // A configurar la etapa y el curso: sin ese dato no se puede componer una
    // prueba que le corresponda.
    router.push("/estudiante/nivel-educativo");
    router.refresh();
  }

  return (
    <form onSubmit={alEnviar} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre completo</Label>
        <Input id="nombre" name="nombre" required minLength={2} maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@correo.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>

      <p className="text-xs text-muted-foreground">
        En el siguiente paso elegirás tu etapa educativa y tu curso, para que la evaluación
        inicial y los contenidos sean los de tu nivel.
      </p>

      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        {enviando ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
