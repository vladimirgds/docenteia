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
  voz: string;
  modelo: string;
  velocidad: number;
  tono: number;
};

/**
 * Qué proveedor hay configurado. Manda `VOZ_PROVEEDOR` si está puesto; si no,
 * se usa el que tenga clave (Google primero, por precio).
 */
export function configuracionDeVoz(entorno: NodeJS.ProcessEnv = process.env): Config | null {
  const pedido = String(entorno.VOZ_PROVEEDOR ?? "").trim().toLowerCase();
  const google = String(entorno.GOOGLE_TTS_API_KEY ?? "").trim();
  const eleven = String(entorno.ELEVENLABS_API_KEY ?? "").trim();
  const numero = (v: string | undefined, porDefecto: number) => {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : porDefecto;
  };

  const usarGoogle = pedido === "google" || (!pedido && google) || (pedido === "elevenlabs" && !eleven && google);
  if (usarGoogle && google) {
    return {
      proveedor: "google",
      clave: google,
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
      voz: String(entorno.ELEVENLABS_VOICE_ID ?? "").trim() || "onwK4e9ZLuTAKqWW03F9",
      modelo: String(entorno.ELEVENLABS_MODELO ?? "").trim() || "eleven_multilingual_v2",
      velocidad: numero(entorno.ELEVENLABS_VELOCIDAD, 1),
      tono: 0,
    };
  }
  return null;
}

