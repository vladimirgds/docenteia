/**
 * Tipos del PSE Light, el motor de sincronización pedagógica del prototipo.
 *
 * Igual que con `src/`, el módulo se conserva en JavaScript a propósito: es
 * lógica ya validada en producción y respaldada por `qa/qa.mjs`, que la importa
 * directamente. Aquí sólo se declara su superficie para que el código nuevo del
 * PMV 1 la consuma con tipos estrictos.
 */

export interface Directiva {
  tipo: "modulo" | "avatar" | "hablar" | "esperar" | "pizarra" | "puntero" | "preguntar";
  id?: string;
  texto?: string;
  accion?: string;
  contenido?: string;
  objetivo?: string | null;
  segundos?: number;
  respuesta?: string;
  otro_ejemplo?: unknown;
  si_correcto?: string;
  si_incorrecto?: string;
  esperar_respuesta?: boolean;
  [clave: string]: unknown;
}

export interface LSG {
  escena?: string;
  intencion?: string;
  duracion_estimada?: number;
  directivas?: Directiva[];
  modulos?: Array<{ id: string; directivas: Directiva[] }>;
  [clave: string]: unknown;
}

/** Estados visuales del avatar tal como los nombra el motor. */
export type EstadoAvatar =
  | "neutral"
  | "hablando"
  | "sonriendo"
  | "preguntando"
  | "pensando";

export interface AvatarAdaptador {
  setState(estado: EstadoAvatar): void;
  setSpeaking(hablando: boolean): void;
}

export interface TTSAdaptador {
  speak(texto: string, opciones?: { signal?: AbortSignal }): Promise<void>;
  cancel(): void;
}

export interface EstadoControles {
  playing: boolean;
  paused: boolean;
  hasLesson: boolean;
  index: number;
  total: number;
}

/** Callbacks con los que el reproductor habla con la interfaz. */
/** La instrucción de foco abstracta que puede acompañar a un paso. */
export interface OperacionPaso {
  tipo: "amplificacion" | "distributiva" | "columna" | "cancelacion";
  terminosFoco: string[];
  etiqueta?: string;
}

export interface UIPSELight {
  setModule(etiqueta: string): void;
  /**
   * Escribe en la pizarra. `operacion` es la instrucción de foco del paso
   * —qué se opera y sobre qué términos— y `narracion` lo que el tutor dice
   * mientras se marca, cuando el generador los envía.
   */
  writeBoard(texto: string, operacion?: OperacionPaso | null, narracion?: string | null): unknown;
  writeBoardExplain?(texto: string): unknown;
  highlightBoard(objetivo: string | null): void;
  clearBoard(): void;
  setCaption(texto: string): void;
  onStep(indice: number | null): void;
  askAnswer(pregunta: string, opciones?: { signal?: AbortSignal }): Promise<string | null>;
  showFeedback(correcto: boolean, mensaje: string): void;
  setControls?(estado: EstadoControles): void;
  onProgress?(indice: number, total: number): void;
  /**
   * La lección terminó. `respuesta` es la respuesta esperada del último
   * ejercicio, sólo si el alumno lo acertó: con ella la pizarra cierra el
   * desarrollo en vez de dejarlo a medias.
   */
  onLessonEnd?(resultado: { respondio: boolean; acerto: boolean; respuesta?: string | null }): void;
}

export function flattenLSG(lsg: LSG): Directiva[];
export function extractExpectedAnswer(timeline: Directiva[], indicePregunta: number): string | null;
export function normalizeAnswer(s: string): string;
export function checkAnswer(
  alumno: string,
  esperada: string,
): { correct: boolean; [clave: string]: unknown };
export function buildHint(pregunta: string, pizarra: string, nivel: number): string;

export class PSELight {
  constructor(deps: { avatar: AvatarAdaptador; tts: TTSAdaptador; ui: UIPSELight });
  lsg: LSG | null;
  timeline: Directiva[];
  index: number;
  playing: boolean;
  paused: boolean;
  load(lsg: LSG): void;
  play(lsg?: LSG): Promise<void>;
  pause(): void;
  stop(): void;
  seek(indice: number): void;
  /**
   * La pregunta que el alumno tiene delante sin haberla contestado, o null.
   * La interfaz la vuelve a plantear al terminar una explicación pedida en
   * mitad de ella, en lugar de dar la lección por completada.
   */
  preguntaPendiente(): Directiva | null;
}
