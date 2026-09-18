/**
 * Tipos del módulo de voz del prototipo (Web Speech API).
 *
 * Se conserva en JavaScript por la misma razón que el resto del núcleo: ya
 * resuelve la selección de voz en español, la normalización de la lectura
 * ("x²" se dice "equis al cuadrado") y el troceado de textos largos, y `qa/`
 * lo importa tal cual.
 */

/** Convierte el texto a cómo debe SONAR (símbolos y variables → palabras). */
export function normalizeForSpeech(texto: string): string;

/** Trocea un texto largo en fragmentos que el sintetizador pronuncia sin cortes. */
export function chunkForSpeech(texto: string): string[];

export class TTS {
  constructor();
  /** false cuando el navegador no soporta síntesis de voz. */
  enabled: boolean;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  /** `true` si hay voz neuronal en el servidor; `null` mientras no se sabe. */
  neural: boolean | null;
  /** Qué proveedor sirve la voz neuronal ("google", "elevenlabs") o `null`. */
  proveedor: string | null;
  /** ¿Puede hablar? Una voz española instalada, o la neuronal del servidor. */
  hasSpanishVoice(): boolean;
  /** Pregunta UNA vez al servidor si hay voz neuronal configurada. */
  listaLaVoz(): Promise<boolean>;
  /** Autoriza el reproductor de audio con el primer gesto del alumno. */
  desbloquear(): void;
  /** ¿Está sonando la voz neuronal del servidor, y no la del navegador? */
  usandoNeural(): boolean;
  /** Descripción legible del estado de la voz, para la interfaz. */
  describe(): string;
  speak(texto: string, opciones?: { signal?: AbortSignal }): Promise<void>;
  cancel(): void;
}
