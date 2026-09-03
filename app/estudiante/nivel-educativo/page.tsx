import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConfiguradorNivelEducativo } from "@/components/configurador-nivel-educativo";
import { interpretarCursoEscrito } from "@/lib/curriculo/etapas";

export const metadata: Metadata = { title: "Nivel educativo" };
export const dynamic = "force-dynamic";

/**
 * /estudiante/nivel-educativo — dónde estudia el alumno.
 *
 * Se pregunta una vez, después del registro y antes de la evaluación inicial,
 * porque de la respuesta depende qué contenidos existen para él. Un alumno que
 * ya lo tenga configurado puede volver aquí a cambiarlo —cambia de curso todos
 * los años—, y en ese caso llega con lo suyo ya seleccionado.
 *
 * A las cuentas del PMV 1, que declararon su curso en texto libre, se les
 * ofrece precargado lo que se pueda reconocer de aquello.
 */
export default async function PaginaNivelEducativo() {
  const sesion = await auth();
  if (!sesion?.user?.perfilId) redirect("/login");

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { id: sesion.user.perfilId },
    select: { etapa: true, curso: true, ciclo: true, grado: true, nivelActual: true },
  });

  const heredado = interpretarCursoEscrito(perfil?.ciclo, perfil?.grado);

  return (
    <ConfiguradorNivelEducativo
      etapaInicial={perfil?.etapa ?? heredado.etapa}
      cursoInicial={perfil?.curso ?? heredado.curso}
      // Quien ya hizo el diagnóstico vuelve a su panel; quien no, sigue a la
      // evaluación inicial, que es el paso siguiente natural.
      destino={perfil?.nivelActual ? "/estudiante" : "/estudiante/diagnostico"}
    />
  );
}
