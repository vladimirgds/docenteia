import { NextResponse } from "next/server";

import { salud } from "@/src/queryCore.js";
import { configuracionDeVoz } from "@/lib/voz/config";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import catalogoOficial from "@/prisma/seed-data/reglas-matematicas.json";
import { MODELOS_DEL_PLIEGO } from "@/src/geminiClient.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salud del servicio.
 *
 * Amplía la del prototipo con el estado real de la persistencia, que en el PMV
 * 1 es una dependencia dura: sin ella no hay login, ni diagnóstico, ni
 * progreso. Distingue tres situaciones que desde fuera se ven igual —"la app
 * falla"— pero se arreglan de forma muy distinta:
 *
 *   sin_configurar → faltan las variables de entorno
 *   sin_migrar     → la base responde, pero no tiene las tablas
 *   sin_sembrar    → hay tablas, pero el banco de preguntas está vacío
 *   ok             → todo listo
 *
 * Informa además de si el CATÁLOGO DE REGLAS está al día. Ese catálogo viaja
 * en la semilla, así que un despliegue con código nuevo y semilla vieja se ve
 * perfecto por fuera y enseña la regla equivocada por dentro. Compararlo aquí
 * permite comprobarlo desde el navegador, sin consola ni acceso a la base.
 *
 * No revela la cadena de conexión ni la API key, sólo si están en su sitio.
 */
export async function GET() {
  const base = salud();
  const vozConfigurada = configuracionDeVoz();

  let estado:
    | "ok"
    | "sin_configurar"
    | "sin_migrar"
    | "sin_sembrar"
    | "error" = "sin_configurar";
  let detalle: string | null = null;
  let preguntasActivas: number | null = null;
  let reglasEnBase: number | null = null;
  const reglasEsperadas = Array.isArray(catalogoOficial) ? catalogoOficial.length : 0;

  if (!process.env.DATABASE_URL) {
    detalle = "Falta la variable de entorno DATABASE_URL.";
  } else {
    try {
      // Contar preguntas toca una tabla real: si no existe, Prisma lanza P2021
      // y sabemos que faltan las migraciones. Un simple "SELECT 1" habría
      // pasado y el problema seguiría escondido.
      preguntasActivas = await prisma.preguntaDiagnostico.count({
        where: { activa: true },
      });
      reglasEnBase = await prisma.reglaMatematica.count();
      if (preguntasActivas === 0) {
        estado = "sin_sembrar";
        detalle = "No hay preguntas de diagnóstico. Ejecuta: npm run db:seed";
      } else if (reglasEnBase < reglasEsperadas) {
        // El código trae reglas que la base aún no tiene: la fase de "Reglas y
        // propiedades" mostraría una tarjeta que no es la que se está narrando.
        estado = "sin_sembrar";
        detalle = `El catálogo de reglas está desfasado: ${reglasEnBase} en la base y ${reglasEsperadas} en el código. Ejecuta: npm run db:seed`;
      } else {
        estado = "ok";
      }
    } catch (e) {
      const infra = explicarFalloDeBaseDeDatos(e);
      detalle = infra?.mensaje ?? "No se pudo consultar la base de datos.";
      estado = infra?.registro === "tablas_inexistentes" ? "sin_migrar" : "error";
    }
  }

  // El modelo configurado, contrastado con el que fija el pliego. `GEMINI_MODEL`
  // manda sobre el que trae el código, y un despliegue apuntando a otro modelo
  // funciona igual de bien pero deja de cumplir lo acordado. Desde fuera no se
  // nota, así que se dice aquí en lugar de descubrirlo en la aceptación.
  const modeloConfigurado = String((base as { modelo?: string }).modelo ?? "");
  const modeloDelPliego = MODELOS_DEL_PLIEGO.includes(modeloConfigurado);

  return NextResponse.json(
    {
      ...base,
      modelo_del_pliego: modeloDelPliego,
      aviso: modeloDelPliego
        ? null
        : `El modelo configurado (${modeloConfigurado}) no es uno de los del pliego: ${MODELOS_DEL_PLIEGO.join(" o ")}. Revísalo en la variable GEMINI_MODEL.`,
      app: "docenteia",
      paso: 1,
      base_datos: estado,
      preguntas_activas: preguntasActivas,
      reglas_en_base: reglasEnBase,
      reglas_esperadas: reglasEsperadas,
      detalle,
      // LA VOZ, EN LA MISMA MIRADA. Sin esto, saber por qué el tutor suena a
      // sintetizador del navegador obligaba a abrir otro endpoint —o a leer el
      // código en producción, que es lo que acabó haciendo el cliente—.
      voz: vozConfigurada
        ? { disponible: true, proveedor: vozConfigurada.proveedor, variable: vozConfigurada.variable }
        : {
            disponible: false,
            proveedor: null,
            variable: null,
            detalle: "Sin GOOGLE_TTS_API_KEY ni ELEVENLABS_API_KEY: el tutor habla con la voz del navegador.",
          },
    },
    { status: estado === "ok" ? 200 : 503 },
  );
}
