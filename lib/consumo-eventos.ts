/**
 * PMV 3 · H5B — Aviso de CONSUMO de un servicio de pago (IA o voz).
 *
 * Sin Prisma ni alias «@/»: lo importan módulos que también cargan las
 * baterías de QA directamente con Node. Quien escucha (lib/consumo.ts, activado
 * desde instrumentation.ts) lo guarda en la base de datos. Los oyentes viven en
 * `globalThis` para que todos los bundles del servidor compartan la misma lista.
 */
export interface Consumo {
  servicio: "IA" | "VOZ";
  origen: string;
  proveedor: string;
  modelo?: string | null;
  tokensEntrada?: number;
  tokensSalida?: number;
  tokensTotales?: number;
  caracteres?: number;
  cacheado?: boolean;
  ok?: boolean;
  usuarioId?: string | null;
}

type Oyente = (c: Consumo) => void;
const g = globalThis as unknown as { __oyentesConsumo?: Set<Oyente> };
const oyentes = (g.__oyentesConsumo ??= new Set<Oyente>());

export function escucharConsumo(fn: Oyente): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Nunca lanza: medir el consumo no puede romper la petición que lo produce. */
export function notificarConsumo(c: Consumo): void {
  for (const fn of oyentes) {
    try {
      fn(c);
    } catch {
      // Se ignora: un oyente roto no afecta al servicio.
    }
  }
}

/** Los contadores de `usageMetadata` de Gemini, en nuestro formato. */
export function tokensDeGemini(u: unknown): Pick<Consumo, "tokensEntrada" | "tokensSalida" | "tokensTotales"> {
  const x = (u ?? {}) as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
  const entrada = Number(x.promptTokenCount) || 0;
  const salida = (Number(x.candidatesTokenCount) || 0) + (Number(x.thoughtsTokenCount) || 0);
  return { tokensEntrada: entrada, tokensSalida: salida, tokensTotales: Number(x.totalTokenCount) || entrada + salida };
}
