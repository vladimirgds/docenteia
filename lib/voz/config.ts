/**
 * QUÉ VOZ NEURONAL HAY CONFIGURADA.
 *
 * Vive aparte de la ruta —y no dentro de ella— porque las baterías de QA lo
 * comprueban sin levantar Next: una ruta importa `next/server`, y esto no
 * importa nada.
 */

type Proveedor = "google" | "elevenlabs";

export type Config = {
  proveedor: Proveedor;
  clave: string;
  /** Con qué nombre de variable se encontró la clave (para poder decirlo). */
  variable: string;
  voz: string;
  modelo: string;
  velocidad: number;
  tono: number;
};

/**
 * Qué proveedor hay configurado. Manda `VOZ_PROVEEDOR` si está puesto; si no,
 * se usa el que tenga clave (Google primero, por precio).
 */
/**
 * LOS NOMBRES QUE SE ACEPTAN PARA CADA CLAVE.
 *
 * El primero de cada lista es el nombre oficial —el que está documentado en
 * `.env.example` y el que devuelve `/api/voz`—; los demás son los nombres que
 * uno escribe de memoria. Una clave puesta como `GOOGLE_TTS_KEY` funcionaba
 * igual que no ponerla: el servidor respondía "sin configurar" y la clase se
 * quedaba con la voz del navegador, sin que nada dijera por qué.
 */
export const CLAVES_DE_VOZ = {
  google: ["GOOGLE_TTS_API_KEY", "GOOGLE_TTS_KEY", "GOOGLE_CLOUD_TTS_API_KEY", "GCP_TTS_API_KEY"],
  elevenlabs: ["ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY", "ELEVENLABS_KEY", "XI_API_KEY"],
} as const;

/**
 * LA RECETA, NO SÓLO EL NOMBRE DE LA VARIABLE.
 *
 * El cliente preguntó «confírmame qué clave exacta debo registrar en Vercel», y
 * decir «GOOGLE_TTS_API_KEY» no basta: las dos formas de equivocarse aquí son
 * pegar el JSON de una cuenta de servicio en vez de una clave de API, y crear la
 * clave sin habilitar la API de Text-to-Speech en ese proyecto. En los dos casos
 * la variable ESTÁ puesta y la voz sigue sin sonar. Así que el endpoint contesta
 * los dos nombres, qué clase de credencial es cada uno y dónde se comprueba.
 */
export const AYUDA_DE_VOZ =
  "Defina UNA de estas dos en Vercel → Settings → Environment Variables → Production, y vuelva a desplegar: " +
  "GOOGLE_TTS_API_KEY = clave de API de Google Cloud (empieza por «AIza…», NO es el JSON de una cuenta de " +
  "servicio) del proyecto que tenga habilitada la API «Cloud Text-to-Speech»; o ELEVENLABS_API_KEY = clave " +
  "de ElevenLabs. Después compruebe que FUNCIONA en /api/voz?probar=1: responde {prueba:\"ok\"} o el error " +
  "exacto del proveedor. Sin ninguna de las dos, la clase habla con la voz del navegador.";

/** El primer valor no vacío de una lista de nombres, y cuál de ellos era. */
function primeraClave(entorno: NodeJS.ProcessEnv, nombres: readonly string[]) {
  for (const nombre of nombres) {
    const valor = String(entorno[nombre] ?? "").trim();
    if (valor) return { valor, nombre };
  }
  return { valor: "", nombre: "" };
}

export function configuracionDeVoz(entorno: NodeJS.ProcessEnv = process.env): Config | null {
  const pedido = String(entorno.VOZ_PROVEEDOR ?? "").trim().toLowerCase();
  const { valor: google, nombre: nombreGoogle } = primeraClave(entorno, CLAVES_DE_VOZ.google);
  const { valor: eleven, nombre: nombreEleven } = primeraClave(entorno, CLAVES_DE_VOZ.elevenlabs);
  const numero = (v: string | undefined, porDefecto: number) => {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : porDefecto;
  };

  const usarGoogle = pedido === "google" || (!pedido && google) || (pedido === "elevenlabs" && !eleven && google);
  if (usarGoogle && google) {
    return {
      proveedor: "google",
      clave: google,
      variable: nombreGoogle,
      // Neural2 masculina: la voz del tutor es masculina y estable desde la
      // primera ronda, y cambiarla ahora sería cambiarle la persona al avatar.
      voz: String(entorno.GOOGLE_TTS_VOZ ?? "").trim() || "es-US-Neural2-B",
      modelo: "",
      velocidad: numero(entorno.GOOGLE_TTS_VELOCIDAD, 0.96),
      tono: numero(entorno.GOOGLE_TTS_TONO, -1),
    };
  }
  if (eleven) {
    return {
      proveedor: "elevenlabs",
      clave: eleven,
      variable: nombreEleven,
      voz: String(entorno.ELEVENLABS_VOICE_ID ?? "").trim() || "onwK4e9ZLuTAKqWW03F9",
      modelo: String(entorno.ELEVENLABS_MODELO ?? "").trim() || "eleven_multilingual_v2",
      velocidad: numero(entorno.ELEVENLABS_VELOCIDAD, 1),
      tono: 0,
    };
  }
  return null;
}

