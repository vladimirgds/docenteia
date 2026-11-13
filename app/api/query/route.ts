import { NextResponse } from "next/server";
import type { Session } from "next-auth";

// Núcleo pedagógico heredado, en JavaScript. Se importa tal cual, a propósito:
// es la lógica matemática validada del prototipo y reescribirla en TypeScript
// significaría reescribir la pedagogía. Sus tipos se declaran en
// src/queryCore.d.ts, así que desde aquí se consume con tipos estrictos.
import { salud, limiteGeneral, manejarConsulta } from "@/src/queryCore.js";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  contextoDeAlumno,
  contextoParaElModelo,
  type ContextoAlumno,
} from "@/lib/perfil/contexto";
import { permiteIntento, segundosParaReintentar } from "@/lib/seguridad/limite-tasa";

// Node, no edge: el núcleo usa temporizadores y estado en memoria (caché LRU y
// ventanas del limitador) que el runtime edge no conserva entre invocaciones.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** IP del solicitante, respetando la cabecera del proxy (Vercel/Render). */
function ipDe(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "desconocida";
}

export async function POST(req: Request) {
  const ip = ipDe(req);

  // Capa 1: tope general por IP, idéntico al del prototipo.
  const limite = limiteGeneral(ip);
  if (!limite.ok) {
    return NextResponse.json(limite.json, {
      status: limite.status,
      headers: limite.headers,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Falta la consulta ('query')." }, { status: 400 });
  }

  // Capa 2: tope por USUARIO autenticado (observación del cliente, cierre
  // HITO 4: "límites por usuario y por IP según corresponda"). La capa 1
  // (arriba) ya protege por IP contra el consumo de Gemini —incluye tráfico
  // anónimo, que no tiene usuario del que tirar—; ésta añade lo que faltaba:
  // una cuenta concreta no puede agotar su propio cupo aunque cambie de IP, y
  // varias cuentas detrás del mismo NAT de colegio no se castigan entre sí.
  // Sin sesión no hay nada que limitar aquí —ya lo cubre la capa 1—.
  const sesion = await auth();
  if (sesion?.user?.id) {
    const limiteUsuario = permiteIntento(`query:${sesion.user.id}`, 60, 60_000);
    if (!limiteUsuario.permitido) {
      return NextResponse.json(
        { error: "Demasiadas consultas. Espera un momento." },
        {
          status: 429,
          headers: { "Retry-After": String(segundosParaReintentar(limiteUsuario.reintentarEnMs)) },
        },
      );
    }
  }

  // Los metadatos académicos del alumno viajan con la consulta: el ciclo, el
  // nivel que le asignó el diagnóstico y sus debilidades. Sin ellos, el motor
  // generaba la misma lección para un alumno de Básico recién diagnosticado que
  // para uno Avanzado con veinte fallos de factorización a la espalda.
  //
  // Sin sesión no se añade nada y la consulta se comporta igual que siempre: la
  // lección determinista no puede depender de quién la pida, o dejaría de ser
  // reproducible.
  const alumno = await contextoDelSolicitante(sesion);
  const cuerpo =
    alumno && body && typeof body === "object"
      ? {
          ...(body as Record<string, unknown>),
          alumno: { ...alumno, resumen: contextoParaElModelo(alumno) },
        }
      : body;

  const r = await manejarConsulta(cuerpo, ip);
  return NextResponse.json(r.json, { status: r.status, headers: r.headers });
}

/**
 * El contexto académico de quien consulta, o `null` si no hay sesión.
 *
 * Un fallo al leerlo no puede tumbar la consulta: la lección es lo importante y
 * el contexto sólo la afina. Si la base no responde, se sigue sin él.
 *
 * Recibe la sesión ya resuelta (la capa 2 de arriba la necesita de todos
 * modos) en vez de volver a llamar a `auth()`.
 */
async function contextoDelSolicitante(sesion: Session | null): Promise<ContextoAlumno | null> {
  try {
    const perfilId = sesion?.user?.perfilId;
    if (!perfilId) return null;

    const [perfil, errores] = await Promise.all([
      prisma.perfilEstudiante.findUnique({
        where: { id: perfilId },
        select: { ciclo: true, grado: true, nivelActual: true, nivelAsignadoEn: true },
      }),
      prisma.registroError.findMany({
        where: { perfilId },
        orderBy: { ocurrencias: "desc" },
        take: 5,
        select: { tema: true, tipoError: true, ocurrencias: true },
      }),
    ]);

    return contextoDeAlumno(perfil, errores);
  } catch {
    return null;
  }
}

export async function GET() {
  // Cómodo para comprobar desde el navegador que la ruta está viva.
  return NextResponse.json(salud());
}
