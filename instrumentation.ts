/**
 * Se ejecuta una vez al arrancar el servidor de Next.js. PMV 3 · H5B: activa el
 * registro del consumo de IA y voz (sólo en el runtime de Node, donde está Prisma).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { activarRegistroDeConsumo } = await import("./lib/consumo");
    activarRegistroDeConsumo();
  }
}
