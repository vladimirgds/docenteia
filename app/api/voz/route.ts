import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { CLAVES_DE_VOZ, configuracionDeVoz, type Config } from "@/lib/voz/config";

/**
 * LA VOZ DEL TUTOR, SINTETIZADA FUERA DEL NAVEGADOR.
 *
 * El cliente lo pidió así: «el audio proviene de window.speechSynthesis, cuya
 * calidad es robótica y metálica… conectar la síntesis a un endpoint que
 * devuelva una voz neuronal fluida en español (Google Cloud Text-to-Speech
 * Neural2/Journey o ElevenLabs), conservando los eventos de callback que
 * sincronizan la pizarra».
 *
 * Este endpoint es ese sitio. Recibe una frase, devuelve un MP3, y el
 * reproductor (`public/tts.js`) avisa del arranque REAL del audio con el mismo
 * `onStart` de siempre: la pizarra sigue encendiendo su foco cuando la palabra
 * empieza a sonar, no cuando se encola. Si no hay clave configurada responde
 * 503 y el reproductor vuelve a la voz del navegador, que es lo que había: la
 * lección nunca se queda muda por esto.
 *
 * QUÉ HACE FALTA PARA QUE SUENE LA VOZ NEURONAL (una de las dos):
 *
 *   GOOGLE_TTS_API_KEY=...        # Google Cloud Text-to-Speech
 *   GOOGLE_TTS_VOZ=es-US-Neural2-B
 *
 *   ELEVENLABS_API_KEY=...        # ElevenLabs
 *   ELEVENLABS_VOICE_ID=...
 *
 * La clave vive SÓLO en el servidor: nunca se envía al navegador ni aparece en
 * la respuesta, y por eso la síntesis pasa por aquí en vez de llamar el cliente
 * directamente al proveedor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lo más largo que se acepta en una petición: el reproductor trocea antes. */
const LIMITE = 600;

/** Caché en memoria: una lección repite muchas frases, y cada una se paga. */
const CACHE = new Map<string, Buffer>();
const CACHE_MAX = 300;

/** El idioma que se le pide a Google, deducido del nombre de la voz. */
const idiomaDe = (voz: string) => {
  const m = /^([a-z]{2}-[A-Z]{2})/.exec(voz);
  return m ? m[1] : "es-ES";
};

/** Pide el audio al proveedor. Devuelve el MP3 o lanza con el motivo. */
async function sintetizar(texto: string, cfg: Config): Promise<Buffer> {
  if (cfg.proveedor === "google") {
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(cfg.clave)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: texto },
        voice: { languageCode: idiomaDe(cfg.voz), name: cfg.voz },
        audioConfig: { audioEncoding: "MP3", speakingRate: cfg.velocidad, pitch: cfg.tono },
      }),
    });
    if (!r.ok) throw new Error(`google ${r.status}`);
    const datos = (await r.json()) as { audioContent?: string };
    if (!datos.audioContent) throw new Error("google sin audio");
    return Buffer.from(datos.audioContent, "base64");
  }

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voz)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": cfg.clave, accept: "audio/mpeg" },
      body: JSON.stringify({
        text: texto,
        model_id: cfg.modelo,
        voice_settings: { stability: 0.45, similarity_boost: 0.75, speed: cfg.velocidad },
      }),
    },
  );
  if (!r.ok) throw new Error(`elevenlabs ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * ¿Hay voz neuronal? El navegador lo pregunta una vez, al empezar la clase.
 *
 * Y lo pregunta también quien audita la instalación, así que la respuesta DICE
 * QUÉ FALTA con nombre y apellidos: el cliente revisó el código en producción
 * para averiguar qué variable había que definir, y eso es algo que el propio
 * endpoint tiene que contestar.
 *
 * Con `?probar=1` se sintetiza una palabra de verdad y se devuelve lo que
 * conteste el proveedor: sirve para saber si la clave puesta FUNCIONA, que no
 * es lo mismo que estar puesta.
 */
export async function GET(peticion: Request) {
  const cfg = configuracionDeVoz();
  if (!cfg) {
    // Sin clave no es un error: es una instalación sin voz neuronal contratada.
    // El reproductor lo entiende y se queda con la del navegador.
    return NextResponse.json(
      {
        disponible: false,
        proveedor: null,
        voz: null,
        motivo: "sin_configurar",
        variables: CLAVES_DE_VOZ,
        ayuda:
          "Defina en el servidor GOOGLE_TTS_API_KEY (Google Cloud Text-to-Speech) o ELEVENLABS_API_KEY (ElevenLabs). " +
          "Sin ninguna de las dos, la clase habla con la voz del navegador.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const base = { disponible: true, proveedor: cfg.proveedor, voz: cfg.voz, variable: cfg.variable };
  if (new URL(peticion.url).searchParams.get("probar") !== "1") {
    return NextResponse.json(base, { headers: { "cache-control": "no-store" } });
  }
  try {
    const audio = await sintetizar("Prueba de voz.", cfg);
    return NextResponse.json(
      { ...base, prueba: "ok", bytes: audio.length },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    // La clave está puesta pero el proveedor no la acepta: es el caso que deja
    // la clase con la voz del navegador sin que nadie sepa por qué.
    return NextResponse.json(
      { ...base, prueba: "falla", detalle: e instanceof Error ? e.message : "desconocido" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(peticion: Request) {
  const cfg = configuracionDeVoz();
  if (!cfg) {
    return NextResponse.json(
      {
        disponible: false,
        motivo: "sin_configurar",
        variables: CLAVES_DE_VOZ,
        ayuda: "Defina GOOGLE_TTS_API_KEY o ELEVENLABS_API_KEY en el servidor. Mientras tanto, la clase usa la voz del navegador.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let texto = "";
  try {
    const cuerpo = (await peticion.json()) as { texto?: unknown };
    texto = String(cuerpo?.texto ?? "").trim();
  } catch {
    texto = "";
  }
  if (!texto) return NextResponse.json({ error: "falta el texto" }, { status: 400 });
  if (texto.length > LIMITE) texto = texto.slice(0, LIMITE);

  // La clave entra en la huella para que al cambiar de proveedor o de voz no se
  // sirva el audio del anterior; no se guarda en ningún sitio ni se devuelve.
  const huella = createHash("sha1").update(`${cfg.proveedor}|${cfg.voz}|${cfg.velocidad}|${texto}`).digest("hex");
  const guardado = CACHE.get(huella);
  if (guardado) {
    return new NextResponse(new Uint8Array(guardado), {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "private, max-age=86400",
        etag: `"${huella}"`,
        "x-voz-cache": "hit",
      },
    });
  }

  let audio: Buffer;
  try {
    audio = await sintetizar(texto, cfg);
  } catch (e) {
    // El proveedor caído no puede dejar muda la clase: 502 y el reproductor
    // termina la frase con la voz del navegador.
    return NextResponse.json(
      { error: "sintesis_fallida", detalle: e instanceof Error ? e.message : "desconocido" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  CACHE.set(huella, audio);
  // Se tira la más antigua: son frases de una clase, no un archivo.
  while (CACHE.size > CACHE_MAX) {
    const primera = CACHE.keys().next().value;
    if (primera === undefined) break;
    CACHE.delete(primera);
  }

  return new NextResponse(new Uint8Array(audio), {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "private, max-age=86400",
      etag: `"${huella}"`,
      "x-voz-cache": "miss",
    },
  });
}
