import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clasificarNivel } from "@/lib/diagnostico/clasificar";
import { armarPrueba, perfilParaPrueba } from "@/lib/diagnostico/prueba";
import { partirId } from "@/lib/diagnostico/seleccion";
import { compararRespuesta } from "@/lib/matematicas/equivalencia";
import { describirCurso } from "@/lib/curriculo/etapas";

/**
 * Cómo se etiqueta una debilidad detectada por el diagnóstico.
 *
 * Se distingue de las que salen de la práctica ("respuesta_incorrecta") para
 * poder leer de dónde viene cada una: una del diagnóstico dice que el alumno
 * llegó flojo en ese tema; una de la práctica, que sigue fallando después de
 * que se lo expliquen.
 */
const TIPO_ERROR_DIAGNOSTICO = "diagnostico_inicial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/diagnostico
 *
 * Devuelve la prueba compuesta para ESTE alumno.
 *
 * IMPORTANTE: `respuestaCorrecta` NO se incluye en la respuesta. La corrección
 * es competencia exclusiva del servidor; si la clave viajara al navegador, el
 * diagnóstico sería trivial de falsear abriendo las herramientas de desarrollo.
 */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const perfil = await perfilParaPrueba(sesion.user.perfilId);
  const { nivel, items, origen, alumno } = await armarPrueba({
    nivelActual: perfil?.nivelActual ?? null,
    etapa: perfil?.etapa ?? null,
    curso: perfil?.curso ?? null,
    ciclo: perfil?.ciclo ?? null,
    grado: perfil?.grado ?? null,
  });

  if (items.length === 0) {
    return NextResponse.json(
      {
        error: alumno.etapa
          ? `Todavía no hay preguntas para ${describirCurso(alumno.etapa, alumno.curso)}. Publica ejercicios de esa etapa desde el panel docente, o ejecuta la semilla: npm run db:seed`
          : "Configura antes tu etapa educativa para poder componer tu evaluación.",
        etapaSinConfigurar: !alumno.etapa,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    // Se mantiene el nombre `preguntas` para no romper a quien ya consuma la
    // API; lo que cambia es que cada una trae su `tipo`.
    preguntas: items,
    total: items.length,
    /** Nivel de dificultad con el que se ha armado la prueba, y de dónde sale. */
    nivelDePartida: nivel,
    origenDelNivel: origen,
    /** Taxonomía curricular del alumno: lo que acota qué contenidos entran. */
    etapa: alumno.etapa,
    cursoEscolar: alumno.curso,
    curso: alumno.etapa ? describirCurso(alumno.etapa, alumno.curso) : null,
    yaCompletado: Boolean(perfil?.nivelActual),
    nivelActual: perfil?.nivelActual ?? null,
    nivelAsignadoEn: perfil?.nivelAsignadoEn ?? null,
  });
}

const envioSchema = z.object({
  respuestas: z
    .array(
      z.object({
        preguntaId: z.string().min(1),
        respuestaDada: z.string().min(1).max(200),
        tiempoMs: z.number().int().nonnegative().max(3_600_000).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * POST /api/diagnostico
 *
 * Corrige el intento, clasifica el nivel con la regla de corte determinista
 * (0–2 BÁSICO · 3–4 INTERMEDIO · 5 AVANZADO) y lo persiste en el perfil.
 * En ningún punto interviene la IA.
 *
 * La prueba se RECOMPONE aquí, en el servidor, y sólo se admiten las respuestas
 * de las preguntas que esa composición produce. No se acepta la lista que envía
 * el navegador: si se aceptara, bastaría con mandar sólo las fáciles.
 */
export async function POST(req: Request) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return NextResponse.json(
      { error: "Sólo un estudiante realiza el diagnóstico inicial." },
      { status: 403 },
    );
  }

  const perfilId = sesion.user.perfilId;
  if (!perfilId) {
    return NextResponse.json(
      { error: "La cuenta no tiene perfil académico asociado." },
      { status: 409 },
    );
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

  const parsed = envioSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Respuestas no válidas.", detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { respuestas } = parsed.data;

  const perfil = await perfilParaPrueba(perfilId);
  if (!perfil) {
    return NextResponse.json({ error: "El perfil académico ya no existe." }, { status: 409 });
  }

  const { items } = await armarPrueba({
    nivelActual: perfil.nivelActual,
    etapa: perfil.etapa,
    curso: perfil.curso,
    ciclo: perfil.ciclo,
    grado: perfil.grado,
  });
  if (items.length === 0) {
    return NextResponse.json({ error: "No hay preguntas para tu nivel." }, { status: 503 });
  }

  const porId = new Map(items.map((i) => [i.id, i]));

  // Se exige que el envío cubra exactamente la prueba compuesta: ni preguntas
  // desconocidas, ni respuestas repetidas, ni un diagnóstico a medias que
  // luego se clasificaría con un recuento que no significa nada.
  const idsEnviados = new Set(respuestas.map((r) => r.preguntaId));
  if (idsEnviados.size !== respuestas.length) {
    return NextResponse.json(
      { error: "Hay respuestas duplicadas para la misma pregunta." },
      { status: 400 },
    );
  }
  const desconocida = respuestas.find((r) => !porId.has(r.preguntaId));
  if (desconocida) {
    return NextResponse.json(
      { error: `Pregunta no reconocida: ${desconocida.preguntaId}` },
      { status: 400 },
    );
  }
  if (idsEnviados.size !== items.length) {
    return NextResponse.json(
      {
        error: `El diagnóstico está incompleto: se esperaban ${items.length} respuestas y llegaron ${idsEnviados.size}.`,
      },
      { status: 400 },
    );
  }

  // ── Las claves, del lado del servidor ─────────────────────────────────────
  const idsCatalogo = items.flatMap((i) => (i.origen === "catalogo" ? [partirId(i.id)!.id] : []));
  const idsBanco = items.flatMap((i) => (i.origen === "banco" ? [partirId(i.id)!.id] : []));

  const [clavesCatalogo, clavesBanco] = await Promise.all([
    idsCatalogo.length
      ? prisma.preguntaDiagnostico.findMany({
          where: { id: { in: idsCatalogo } },
          select: { id: true, respuestaCorrecta: true },
        })
      : Promise.resolve([]),
    idsBanco.length
      ? prisma.ejercicio.findMany({
          where: { id: { in: idsBanco } },
          select: { id: true, respuestaCorrecta: true },
        })
      : Promise.resolve([]),
  ]);

  const claveDe = new Map<string, string>();
  for (const p of clavesCatalogo) claveDe.set(`catalogo:${p.id}`, p.respuestaCorrecta);
  for (const e of clavesBanco) claveDe.set(`banco:${e.id}`, e.respuestaCorrecta);

  // ── Corrección determinista ───────────────────────────────────────────────
  const corregidas = respuestas.map((r) => {
    const item = porId.get(r.preguntaId)!;
    const esperada = claveDe.get(r.preguntaId) ?? "";

    // Opción múltiple: se compara el IDENTIFICADOR de la opción elegida.
    // Respuesta abierta: se compara como en la práctica, aceptando formas
    // equivalentes —"e^x + 2x" y "2x + e^x" son la misma respuesta—.
    const correcta =
      item.tipo === "opcion_multiple"
        ? r.respuestaDada.trim().toLowerCase() === esperada.trim().toLowerCase()
        : compararRespuesta(r.respuestaDada, esperada).correcto;

    return { ...r, item, correcta };
  });

  const aciertos = corregidas.filter((r) => r.correcta).length;
  const nivel = clasificarNivel(aciertos, items.length);

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const intento = await tx.intentoDiagnostico.create({
        data: {
          perfilId,
          aciertos,
          totalPreguntas: items.length,
          nivelResultante: nivel,
          completado: true,
          finalizadoEn: new Date(),
          respuestas: {
            create: corregidas.map((r) => {
              const partes = partirId(r.item.id)!;
              return {
                // Cada respuesta apunta a su origen: la pregunta del catálogo o
                // el ejercicio del banco del que salió.
                preguntaId: partes.origen === "catalogo" ? partes.id : null,
                ejercicioId: partes.origen === "banco" ? partes.id : null,
                respuestaDada: r.respuestaDada,
                correcta: r.correcta,
                tiempoMs: r.tiempoMs ?? null,
              };
            }),
          },
        },
        select: { id: true },
      });

      await tx.perfilEstudiante.update({
        where: { id: perfilId },
        data: { nivelActual: nivel, nivelAsignadoEn: new Date() },
      });

      // CATÁLOGO DE DEBILIDADES. Cada fallo del diagnóstico deja constancia en su
      // tema: es lo primero que se sabe del alumno, y hasta ahora se perdía.
      // Sin esto, un alumno recién diagnosticado llegaba a su primera lección
      // sin ninguna debilidad registrada, y el motor no tenía en qué insistir
      // aunque acabara de fallar justo ese tema.
      //
      // Se acumulan por tema: si vuelve a fallar lo mismo en la práctica, sube
      // la cuenta en lugar de abrir otra entrada.
      for (const fallo of corregidas.filter((r) => !r.correcta)) {
        // Un ejercicio del banco sin motor no tiene tema del motor al que
        // atribuir la debilidad; se cuenta en el recuento, pero no se inventa
        // una etiqueta para él.
        if (!fallo.item.tema) continue;
        await tx.registroError.upsert({
          where: {
            perfilId_tema_tipoError: {
              perfilId,
              tema: fallo.item.tema,
              tipoError: TIPO_ERROR_DIAGNOSTICO,
            },
          },
          update: { ocurrencias: { increment: 1 }, detalle: fallo.respuestaDada.slice(0, 200) },
          create: {
            perfilId,
            tema: fallo.item.tema,
            tipoError: TIPO_ERROR_DIAGNOSTICO,
            detalle: fallo.respuestaDada.slice(0, 200),
          },
        });
      }

      await tx.historialNivel.create({
        data: {
          perfilId,
          nivelAnterior: perfil.nivelActual,
          nivelNuevo: nivel,
          motivo: "DIAGNOSTICO_INICIAL",
          detalle: `${aciertos} de ${items.length} aciertos en el diagnóstico inicial.`,
        },
      });

      return intento;
    });

    return NextResponse.json({
      ok: true,
      intentoId: resultado.id,
      aciertos,
      total: items.length,
      nivel,
      // Se devuelve qué temas falló, no cuál era la respuesta correcta: el
      // alumno debe aprenderlas, no copiarlas.
      temasFallados: corregidas.filter((r) => !r.correcta && r.item.tema).map((r) => r.item.tema),
    });
  } catch (e) {
    console.error("[diagnostico] fallo al guardar el intento:", e);
    return NextResponse.json({ error: "No se pudo guardar el diagnóstico." }, { status: 500 });
  }
}
