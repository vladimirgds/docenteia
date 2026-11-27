import { prisma } from "@/lib/prisma";
import { escucharConsumo, type Consumo } from "@/lib/consumo-eventos";

/**
 * PMV 3 · H5B — Guarda cada consumo de IA y voz y lo resume para el administrador.
 */
export async function registrarConsumo(c: Consumo): Promise<void> {
  try {
    await prisma.consumoServicio.create({
      data: {
        servicio: c.servicio,
        origen: c.origen.slice(0, 60),
        proveedor: c.proveedor.slice(0, 60),
        modelo: c.modelo?.slice(0, 80) ?? null,
        tokensEntrada: Math.max(0, Math.round(c.tokensEntrada ?? 0)),
        tokensSalida: Math.max(0, Math.round(c.tokensSalida ?? 0)),
        tokensTotales: Math.max(0, Math.round(c.tokensTotales ?? 0)),
        caracteres: Math.max(0, Math.round(c.caracteres ?? 0)),
        cacheado: c.cacheado ?? false,
        ok: c.ok ?? true,
        usuarioId: c.usuarioId ?? null,
      },
    });
  } catch (e) {
    console.error("[consumo] no se pudo registrar:", e instanceof Error ? e.message : e);
  }
}

const g = globalThis as unknown as { __registroConsumoActivo?: boolean };
/** Lo llama `instrumentation.ts` una vez al arrancar el servidor. */
export function activarRegistroDeConsumo(): void {
  if (g.__registroConsumoActivo) return;
  g.__registroConsumoActivo = true;
  escucharConsumo((c) => void registrarConsumo(c));
}

export interface FilaConsumo {
  servicio: string;
  origen: string;
  proveedor: string;
  modelo: string | null;
  llamadas: number;
  cacheadas: number;
  fallidas: number;
  tokensEntrada: number;
  tokensSalida: number;
  tokensTotales: number;
  caracteres: number;
}
type Totales = Omit<FilaConsumo, "servicio" | "origen" | "proveedor" | "modelo">;

export async function resumenConsumo(desde: Date): Promise<{ desde: string; filas: FilaConsumo[]; totales: Totales }> {
  const grupos = await prisma.consumoServicio.groupBy({
    by: ["servicio", "origen", "proveedor", "modelo", "cacheado", "ok"],
    where: { creadoEn: { gte: desde } },
    _count: { _all: true },
    _sum: { tokensEntrada: true, tokensSalida: true, tokensTotales: true, caracteres: true },
  });
  const mapa = new Map<string, FilaConsumo>();
  for (const gr of grupos) {
    const k = [gr.servicio, gr.origen, gr.proveedor, gr.modelo ?? ""].join("|");
    const f = mapa.get(k) ?? {
      servicio: gr.servicio,
      origen: gr.origen,
      proveedor: gr.proveedor,
      modelo: gr.modelo,
      llamadas: 0,
      cacheadas: 0,
      fallidas: 0,
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensTotales: 0,
      caracteres: 0,
    };
    f.llamadas += gr._count._all;
    if (gr.cacheado) f.cacheadas += gr._count._all;
    if (!gr.ok) f.fallidas += gr._count._all;
    f.tokensEntrada += gr._sum.tokensEntrada ?? 0;
    f.tokensSalida += gr._sum.tokensSalida ?? 0;
    f.tokensTotales += gr._sum.tokensTotales ?? 0;
    f.caracteres += gr._sum.caracteres ?? 0;
    mapa.set(k, f);
  }
  const filas = [...mapa.values()].sort((a, b) => b.tokensTotales + b.caracteres - (a.tokensTotales + a.caracteres));
  const totales = filas.reduce<Totales>(
    (t, f) => ({
      llamadas: t.llamadas + f.llamadas,
      cacheadas: t.cacheadas + f.cacheadas,
      fallidas: t.fallidas + f.fallidas,
      tokensEntrada: t.tokensEntrada + f.tokensEntrada,
      tokensSalida: t.tokensSalida + f.tokensSalida,
      tokensTotales: t.tokensTotales + f.tokensTotales,
      caracteres: t.caracteres + f.caracteres,
    }),
    { llamadas: 0, cacheadas: 0, fallidas: 0, tokensEntrada: 0, tokensSalida: 0, tokensTotales: 0, caracteres: 0 },
  );
  return { desde: desde.toISOString(), filas, totales };
}
