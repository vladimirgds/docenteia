import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import {
  GestorProcedimientos,
  type ProcedimientoVista,
  type TemaProcedimiento,
} from "@/components/docente/gestor-procedimientos";
import { prisma } from "@/lib/prisma";
import { clausulaInstitucional } from "@/lib/docente/api";
import { autorizacionDeSesion } from "@/lib/docente/bancos";
import { puedeEditarCurriculo } from "@/lib/rbac";
import { leerPasos, leerPreguntas } from "@/lib/docente/procedimientos";
import { SELECCION_PROCEDIMIENTO, dondeProcedimientosVisibles } from "@/lib/docente/procedimientos-servidor";
import { SOPORTE_VERIFICACION } from "@/lib/docente/verificar-pasos";

export const metadata: Metadata = { title: "Procedimientos · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * /docente/procedimientos — reglas, métodos y procedimientos.
 *
 * El docente los define, los prueba contra el motor y los publica sin tocar
 * código; el agente de Gemini redacta borradores editables. Lo que se publica
 * lo proyecta la pizarra interactiva a los alumnos de sus aulas.
 */
export default async function PaginaProcedimientos() {
  const sesion = await auth();
  const quien = autorizacionDeSesion(sesion?.user);
  const clausula = clausulaInstitucional(quien);

  const [temas, procedimientos] = await Promise.all([
    prisma.nodoConocimiento.findMany({
      where: { estado: { not: "ARCHIVADO" }, ...(clausula ? { OR: clausula } : {}) },
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: { id: true, titulo: true, motor: true },
      take: 500,
    }),
    prisma.procedimiento.findMany({
      where: dondeProcedimientosVisibles(quien),
      orderBy: { actualizadoEn: "desc" },
      select: SELECCION_PROCEDIMIENTO,
      take: 200,
    }),
  ]);

  const temasVista: TemaProcedimiento[] = temas;
  const vista: ProcedimientoVista[] = procedimientos.map((p) => ({
    id: p.id,
    nodoId: p.nodoId,
    tipo: p.tipo,
    titulo: p.titulo,
    descripcion: p.descripcion,
    motor: p.motor,
    ejemplo: p.ejemplo,
    pasos: leerPasos(p.pasos),
    preguntas: leerPreguntas(p.preguntas),
    pistas: p.pistas,
    origen: p.origen,
    estado: p.estado,
    verificado: p.verificado,
    revisadoEn: p.revisadoEn ? p.revisadoEn.toISOString() : null,
    nodo: p.nodo ? { titulo: p.nodo.titulo } : null,
    informeVerificacion: (p.informeVerificacion ?? {}) as ProcedimientoVista["informeVerificacion"],
  }));

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Procedimientos</h1>
          <p className="text-muted-foreground">
            Define reglas, métodos y procedimientos como ejemplos resueltos paso a paso. El servidor comprueba cada paso contra
            el motor determinista; lo que publiques lo proyecta la pizarra a los alumnos de tus aulas.
          </p>
        </div>
        <GestorProcedimientos
          temas={temasVista}
          procedimientos={vista}
          soporte={SOPORTE_VERIFICACION}
          puedeEditar={puedeEditarCurriculo(sesion?.user?.rol)}
        />
      </main>
    </div>
  );
}
