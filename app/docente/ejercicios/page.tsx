import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import {
  GestorEjercicios,
  type EjercicioVista,
  type ParametroFormulario,
  type TemaOpcion,
} from "@/components/docente/gestor-ejercicios";
import { prisma } from "@/lib/prisma";
import { puedeEditarCurriculo } from "@/lib/rbac";
import { SELECCION_EJERCICIO } from "@/lib/docente/ejercicios";
import type { Estado } from "@/lib/docente/curriculo";

export const metadata: Metadata = { title: "Ejercicios · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * /docente/ejercicios — el banco de ejercicios y su validador.
 *
 * Se cargan los ejercicios recientes de todos los temas, no sólo los del tema
 * activo: el trabajo real del docente es "revisar lo que tengo y añadir lo que
 * falta", y para eso hace falta ver el banco entero con sus marcas de
 * verificación.
 */
export default async function PaginaEjercicios() {
  const sesion = await auth();
  const puedeEditar = puedeEditarCurriculo(sesion?.user?.rol);

  const [temas, ejercicios] = await Promise.all([
    prisma.nodoConocimiento.findMany({
      where: { estado: { not: "ARCHIVADO" } },
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: {
        id: true,
        titulo: true,
        motor: true,
        estado: true,
        nivel: true,
        etapa: true,
        cursoMin: true,
      },
      take: 500,
    }),
    prisma.ejercicio.findMany({
      orderBy: [{ actualizadoEn: "desc" }],
      select: SELECCION_EJERCICIO,
      take: 200,
    }),
  ]);

  const temasVista: TemaOpcion[] = temas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    motor: t.motor,
    estado: t.estado as Estado,
    nivel: t.nivel,
    etapa: t.etapa,
    cursoMin: t.cursoMin,
  }));

  const ejerciciosVista: EjercicioVista[] = ejercicios.map((e) => ({
    id: e.id,
    enunciado: e.enunciado,
    respuestaCorrecta: e.respuestaCorrecta,
    respuestaFormula: e.respuestaFormula,
    plantilla: e.plantilla,
    // `parametros` es JSON en la base: se normaliza aquí, una vez, en lugar de
    // dejar que cada punto de la interfaz adivine si es lista, objeto o null.
    parametros: Array.isArray(e.parametros) ? (e.parametros as unknown as ParametroFormulario[]) : [],
    pistas: e.pistas,
    nivel: e.nivel,
    motor: e.motor,
    etapa: e.etapa,
    cursoMin: e.cursoMin,
    estado: e.estado as Estado,
    origen: e.origen,
    validado: e.validado,
    nodoId: e.nodoId,
    nodo: e.nodo,
    autor: e.autor,
  }));

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Ejercicios</h1>
          <p className="text-muted-foreground">
            Escribe ejercicios sueltos o plantillas parametrizadas. El servidor comprueba la
            matemática contra el motor determinista antes de guardarlos.
          </p>
          <p className="text-sm text-muted-foreground">
            El <strong>nivel</strong> de cada ejercicio decide a qué alumnos les llega: la
            evaluación inicial de un alumno se compone con los ejercicios publicados y verificados
            que le corresponden. Y el <strong>alcance curricular</strong> del tema —etapa y curso a
            partir del cual se plantea— decide a qué alumnos les llega: una derivada marcada como
            Superior no le aparece a uno de secundaria por muy avanzado que vaya.
          </p>
        </div>

        <GestorEjercicios
          temas={temasVista}
          ejercicios={ejerciciosVista}
          puedeEditar={puedeEditar}
        />
      </main>
    </div>
  );
}
