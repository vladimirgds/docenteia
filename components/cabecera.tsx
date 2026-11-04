import Link from "next/link";

import { auth, signOut } from "@/auth";
import { VolverAdmin } from "@/components/admin/volver-admin";
import { Button } from "@/components/ui/button";
import { ETIQUETA_ROL, INICIO_POR_ROL } from "@/lib/rbac";

export async function Cabecera() {
  const sesion = await auth();
  if (!sesion?.user) return null;

  const { name, rol } = sesion.user;

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href={INICIO_POR_ROL[rol]} className="font-semibold tracking-tight">
          MentorIA Math
        </Link>

        <div className="flex items-center gap-4">
          {rol === "SUPERADMIN" && <VolverAdmin />}
          <div className="text-right text-sm leading-tight">
            <p className="font-medium">{name}</p>
            <p className="text-muted-foreground">{ETIQUETA_ROL[rol]}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
