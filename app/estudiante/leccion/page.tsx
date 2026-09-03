import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Aula, type ProgresoTema, type ReglaVista } from "@/components/leccion/aula";
import { cursoDelPerfil, describirCurso } from "@/lib/curriculo/etapas";
import { temasDisponiblesPara } from "@/lib/leccion/disponibles";

export const metadata: Metadata = { title: "Lección" };
export const dynamic = "force-dynamic";

export default async function PaginaLeccion() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // El diagnóstico decide el nivel de partida, así que se hace antes de la
  // primera lección.
  if (sesion.user.rol === "ESTUDIANTE" && !sesion.user.nivelActual) {
    redirect("/estudiante/diagnostico");
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
    />
  );
}
