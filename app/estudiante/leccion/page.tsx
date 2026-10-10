import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Aula, type ProgresoTema, type ReglaVista } from "@/components/leccion/aula";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cursoDelPerfil, describirCurso } from "@/lib/curriculo/etapas";
import { temasDisponiblesPara } from "@/lib/leccion/disponibles";
import { puedeEntregar } from "@/lib/docente/aulas";
import { temaPorMotor } from "@/lib/leccion/temas";

export const metadata: Metadata = { title: "Lección" };
export const dynamic = "force-dynamic";

/**
 * Pantalla de estado para una tarea que NO se puede (o ya no se puede)
 * practicar: vencida, sin reintentos, ya entregada, o que sencillamente no es
 * del alumno en sesión. Misma tarjeta que el "cierre" de la lección, para que
 * llegar aquí por cualquiera de los dos caminos —entrar ya tarde, o
 * terminarla ahora mismo— se sienta como la misma pantalla.
 */
function EstadoDeTarea({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{mensaje}</p>
        <Button asChild size="sm">
          <Link href="/estudiante/tareas">Volver a mis tareas</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function PaginaLeccion({
  searchParams,
}: {
  searchParams: Promise<{ tareaId?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // El diagnóstico decide el nivel de partida, así que se hace antes de la
  // primera lección.
  if (sesion.user.rol === "ESTUDIANTE" && !sesion.user.nivelActual) {
    redirect("/estudiante/diagnostico");
  }

  // ── Tarea asignada (HITO 3 — corrección QA) ───────────────────────────────
  // "Al ingresar con el código o seleccionar la tarea, la lección debe recibir
  // el parámetro de la tarea": si llega `tareaId`, ésta no es una lección
  // libre, es UN INTENTO DE LA TAREA, y antes de dejar entrar se comprueban
  // las mismas puertas que ya usa `POST /api/estudiante/tareas/[id]/entregar`
  // —`puedeEntregar`—: no hay una regla para dejar PRACTICAR y otra distinta
  // para dejar ENTREGAR, porque practicar sin poder entregar después sería
  // trabajo del alumno que no puede llegar a ningún lado.
  const { tareaId } = await searchParams;
  let tareaActiva: { id: string; cantidadEjercicios: number; temaClave: string | null } | null = null;

  if (tareaId) {
    const tarea = await prisma.tarea.findUnique({
      where: { id: tareaId },
      include: { nodo: { select: { motor: true } } },
    });
    const matricula = tarea
      ? await prisma.matricula.findUnique({
          where: { aulaId_estudianteId: { aulaId: tarea.aulaId, estudianteId: sesion.user.id } },
        })
      : null;

    if (!tarea || !matricula) {
      return (
        <EstadoDeTarea
          titulo="Esa tarea no existe"
          mensaje="No encontramos esa tarea, o no está asignada a ninguna de tus aulas."
        />
      );
    }

    const entrega = await prisma.entregaTarea.findUnique({
      where: { tareaId_estudianteId: { tareaId: tarea.id, estudianteId: sesion.user.id } },
    });

    const bloqueo = puedeEntregar(tarea, entrega);
    if (bloqueo) {
      return (
        <EstadoDeTarea
          titulo={tarea.titulo}
          mensaje={
            entrega?.puntaje != null ? `${bloqueo} Tu nota: ${entrega.puntaje}/100.` : bloqueo
          }
        />
      );
    }

    tareaActiva = {
      id: tarea.id,
      cantidadEjercicios: tarea.cantidadEjercicios,
      temaClave: tarea.nodo?.motor ? (temaPorMotor(tarea.nodo.motor)?.clave ?? null) : null,
    };
  }

  const perfilId = sesion.user.perfilId;

  // ── Qué temas le corresponden ─────────────────────────────────────────────
  // La lista de tarjetas ya no es la de los cinco motores escrita en el código:
  // sale del currículo, filtrada por la etapa y el curso del alumno. Un alumno
  // de 6.º de primaria no ve Ecuaciones lineales, Factorización ni Derivadas,
  // que el temario marca para Secundaria y Superior.
  const perfil = perfilId
    ? await prisma.perfilEstudiante.findUnique({
        where: { id: perfilId },
        select: { etapa: true, curso: true, ciclo: true, grado: true },
      })
    : null;

  const alumno = cursoDelPerfil(perfil ?? {});

  // Sin etapa declarada no se puede saber qué le toca: se le pide antes.
  if (sesion.user.rol === "ESTUDIANTE" && !alumno.etapa) {
    redirect("/estudiante/nivel-educativo");
  }

  const { temas } = await temasDisponiblesPara(alumno);
  const motoresPermitidos = temas.map((t) => t.tema);

  // El catálogo de reglas se carga entero (son unas pocas decenas) y la
  // interfaz filtra por tema. Si la tabla todavía no existe —base sin migrar—
  // la lección debe funcionar igual, sólo que sin el catálogo formal.
  let reglas: ReglaVista[] = [];
  let progreso: ProgresoTema[] = [];

  try {
    // MVP 2. El catálogo ya no es sólo el de fábrica: también trae las reglas que
    // escriben los docentes desde /docente/crear-tema. A la lección del alumno
    // sólo suben las que cumplen las dos condiciones que la hacen utilizable:
    //   · PUBLICADA — un borrador del profesor no se enseña a nadie.
    //   · con MOTOR — la lección agrupa por motor determinista; una regla de un
    //     tema sin motor no tiene lección en la que encajar todavía.
    const catalogo = await prisma.reglaMatematica.findMany({
      // Sólo las reglas de los temas que este alumno puede abrir: cargar las
      // demás sería mandarle al navegador el temario de cursos que no son suyos.
      where: { estado: "PUBLICADO", tema: { in: motoresPermitidos } },
      orderBy: [{ tema: "asc" }, { orden: "asc" }],
      select: {
        clave: true,
        tema: true,
        nombre: true,
        enunciado: true,
        descripcion: true,
        ejemplo: true,
        nivel: true,
        practicable: true,
      },
    });
    // El filtro ya deja fuera las reglas sin motor; este `flatMap` es lo que se
    // lo dice al compilador, que no puede deducirlo del `where`.
    reglas = catalogo.flatMap((r) => (r.tema ? [{ ...r, tema: r.tema }] : []));
  } catch (e) {
    console.error("[leccion] no se pudo cargar el catálogo de reglas:", e);
  }

  // Avance del alumno por tema (Módulos 2, 6 y 11). Es lo que permite retomar
  // donde lo dejó en vez de repetirle siempre el diálogo introductorio.
  if (perfilId) {
    try {
      const [sesiones, intentos] = await Promise.all([
        prisma.sesionAprendizaje.groupBy({
          by: ["tema"],
          where: { perfilId },
          _count: { _all: true },
          _max: { iniciadaEn: true },
        }),
        prisma.registroProgreso.groupBy({
          by: ["tema", "acierto"],
          where: { perfilId },
          _count: { _all: true },
        }),
      ]);

      const porTema = new Map<string, ProgresoTema>();
      for (const s of sesiones) {
        // El tema de una sesión es opcional en el esquema: una sesión sin tema
        // no cuenta para el avance de ninguno.
        if (!s.tema) continue;
        porTema.set(s.tema, {
          tema: s.tema,
          sesiones: s._count._all,
          ultima: s._max.iniciadaEn?.toISOString() ?? null,
          aciertos: 0,
          intentos: 0,
        });
      }
      for (const i of intentos) {
        const actual =
          porTema.get(i.tema) ??
          ({ tema: i.tema, sesiones: 0, ultima: null, aciertos: 0, intentos: 0 } as ProgresoTema);
        actual.intentos += i._count._all;
        if (i.acierto) actual.aciertos += i._count._all;
        porTema.set(i.tema, actual);
      }
      progreso = [...porTema.values()];
    } catch (e) {
      console.error("[leccion] no se pudo cargar el progreso:", e);
    }
  }

  if (temas.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Todavía no hay temas para tu curso</h1>
        <p className="text-muted-foreground">
          No hay ningún tema publicado para {describirCurso(alumno.etapa, alumno.curso)}. Tu
          profesorado puede publicarlos desde el panel docente; si acabas de instalar la
          aplicación, ejecuta la semilla:{" "}
          <code className="rounded bg-muted px-1 py-0.5">npm run db:seed</code>
        </p>
      </div>
    );
  }

  return (
    <Aula
      temas={temas}
      reglas={reglas}
      progreso={progreso}
      curso={describirCurso(alumno.etapa, alumno.curso)}
      tarea={tareaActiva}
    />
  );
}
