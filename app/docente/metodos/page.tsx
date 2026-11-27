import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { GestorFichas, type FichaVista, type TemaFicha } from "@/components/docente/gestor-fichas";
import { prisma } from "@/lib/prisma";
import { clausulaInstitucional } from "@/lib/docente/api";
import { autorizacionDeSesion } from "@/lib/docente/bancos";
import { leerFicha } from "@/lib/docente/fichas-metodo";
import { SELECCION_FICHA, dondeFichasVisibles } from "@/lib/docente/fichas-servidor";
import { OPERACIONES_SOPORTADAS } from "@/lib/docente/fichas-verificar";
import { puedeEditarCurriculo } from "@/lib/rbac";

export const metadata: Metadata = { title: "Métodos · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * /docente/metodos — fichas de método versionadas (PMV 3 · Hito 5A).
 *
 * El docente define cuándo se aplica un método, qué pasos sigue y qué pistas
 * ofrece, a mano o pidiéndole un borrador a la IA; el motor lo verifica, el
 * docente lo aprueba y se publica en su banco privado SIN cambios de código ni
 * nuevo despliegue.
 */
export default async function PaginaMetodos() {
  const sesion = await auth();
  const quien = autorizacionDeSesion(sesion?.user);
  const clausula = clausulaInstitucional(quien);

  const [temas, fichas] = await Promise.all([
    prisma.nodoConocimiento.findMany({
      where: { estado: { not: "ARCHIVADO" }, ...(clausula ? { OR: clausula } : {}) },
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: { id: true, titulo: true, motor: true },
      take: 500,
    }),
    prisma.fichaMetodo.findMany({
      where: dondeFichasVisibles(quien),
      orderBy: { actualizadoEn: "desc" },
      select: SELECCION_FICHA,
      take: 200,
    }),
  ]);

  const temasVista: TemaFicha[] = temas;
  const vista: FichaVista[] = fichas.flatMap((f) => {
    const contenido = leerFicha(f.contenido);
    if (!contenido) return [];
    return [
      {
        id: f.id,
        nodoId: f.nodoId,
        titulo: f.titulo,
        motor: f.motor,
        contenido,
        version: f.version,
        publicadaVersion: f.publicadaVersion,
        origen: f.origen,
        estado: f.estado,
        verificada: f.verificada,
        pendienteValidacion: f.pendienteValidacion,
        validacion: (f.validacion ?? {}) as FichaVista["validacion"],
        aprobadaEn: f.aprobadaEn ? f.aprobadaEn.toISOString() : null,
        nodo: f.nodo ? { titulo: f.nodo.titulo } : null,
      },
    ];
  });

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Métodos</h1>
          <p className="text-muted-foreground">
            Define fichas de método: cuándo se aplica cada una (patrón de entrada), qué variables y condiciones tiene, qué pasos sigue y qué pistas ofrece.
            Puedes escribirla tú o pedirle un borrador a la IA; el motor matemático la verifica y, cuando tú la apruebas, queda publicada en tu banco privado sin
            tocar código ni desplegar.
          </p>
        </div>
        <GestorFichas temas={temasVista} fichas={vista} operaciones={OPERACIONES_SOPORTADAS} puedeEditar={puedeEditarCurriculo(sesion?.user?.rol)} />
      </main>
    </div>
  );
}
