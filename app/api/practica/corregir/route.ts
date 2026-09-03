import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { buildHint } from "@/public/pseLight.js";
import { compararRespuesta } from "@/lib/matematicas/equivalencia";
import { resolverEjercicio } from "@/lib/leccion/correccion";
import { TEMA_POR_CLAVE } from "@/lib/leccion/temas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Motor de corrección automática (Módulo 9).
 *
 * La respuesta del alumno se evalúa contra la solución que **recalcula el
 * servidor** con el motor determinista, no contra un valor que venga del
 * navegador. Esa distinción es el punto entero del módulo: si la verdad-base
 * viajara con la lección, bastaría con abrir las herramientas de desarrollo
 * para leerla, y bastaría con manipular la petición para darse por aprobado.
 *
 * La IA no interviene en ningún punto de la corrección.
 */
const peticionSchema = z.object({
  /** El ejercicio tal como está en la pizarra. */
  ejercicio: z.string().min(1).max(300),
  /** Lo que ha escrito el alumno. */
  respuesta: z.string().min(1).max(200),
  /** Tema activo: decide cómo leer una expresión ambigua. */
  tema: z.string().max(60).optional(),
  /** Nº de intentos ya realizados sobre este ejercicio (para graduar la pista). */
  intento: z.number().int().min(1).max(10).optional(),
  /** Contenido de la pizarra, del que se extrae la pista metodológica. */
  pizarra: z.string().max(2000).optional(),
  /** Sesión de aprendizaje a la que pertenece este intento. */
  sesionId: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es JSON válido." },
      { status: 400 },
    );
  }

  const parsed = peticionSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Petición no válida.", detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { ejercicio, respuesta, tema, intento = 1, pizarra = "", sesionId } = parsed.data;

  // ── Solución determinista, recalculada aquí ────────────────────────────────
  const esperada = resolverEjercicio(ejercicio, tema);

  // El motor no cubre este enunciado. Se dice, en lugar de inventar un
  // veredicto: dar por buena —o por mala— una respuesta que no se ha podido
  // calcular es exactamente la alucinación que este módulo existe para evitar.
  if (esperada == null) {
    return NextResponse.json({
      verificable: false,
      correcto: null,
      mensaje:
        "Este ejercicio queda fuera de lo que el motor puede calcular con garantía, así que no voy a calificarlo. Compara tu resultado con lo explicado en la pizarra.",
    });
  }

  // La respuesta se juzga como FUNCIÓN, no como texto: "e^x + 2x" y "2x + e^x"
  // son la misma, y con la comparación de cadenas del PMV 1 la segunda se daba
  // por incorrecta. Lo que no se deja leer como expresión —una frase, una
  // respuesta con unidades— lo sigue juzgando el corrector heredado.
  const { correcto: correct } = compararRespuesta(respuesta, esperada);

  // ── Registro de progreso ───────────────────────────────────────────────────
  // Alimenta la analítica del Paso 4. Un fallo al registrar no debe impedir que
  // el alumno reciba su corrección, así que se aísla.
  const perfilId = sesion.user.perfilId;
  const temaEnum = tema ? TEMA_POR_CLAVE[tema.toLowerCase()] : undefined;
  if (perfilId && temaEnum) {
    try {
      await prisma.registroProgreso.create({
        data: {
          perfilId,
          tema: temaEnum,
          sesionId: sesionId ?? null,
          acierto: correct,
          intentos: intento,
          respuestaDada: respuesta.slice(0, 200),
        },
      });
      if (!correct) {
        // El catálogo de debilidades se acumula por tipo, de modo que "cuántas
        // veces falla el alumno en esto" sea una consulta directa.
        await prisma.registroError.upsert({
          where: {
            perfilId_tema_tipoError: { perfilId, tema: temaEnum, tipoError: "respuesta_incorrecta" },
          },
          update: { ocurrencias: { increment: 1 }, detalle: ejercicio.slice(0, 200) },
          create: {
            perfilId,
            tema: temaEnum,
            tipoError: "respuesta_incorrecta",
            detalle: ejercicio.slice(0, 200),
          },
        });
      }
    } catch (e) {
      const infra = explicarFalloDeBaseDeDatos(e);
      console.error(`[corregir] no se pudo registrar el progreso: ${infra?.registro ?? e}`);
    }
  }

  if (correct) {
    return NextResponse.json({ verificable: true, correcto: true });
  }

  // ── Error: pista metodológica, nunca la respuesta ──────────────────────────
  // Se devuelve una pista del MÉTODO, cada vez más concreta, y nunca el
  // resultado: revelarlo convertiría la práctica en una lectura.
  return NextResponse.json({
    verificable: true,
    correcto: false,
    pista: buildHint(ejercicio, pizarra, intento),
  });
}
