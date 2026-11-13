import { z } from "zod";

/**
 * Alta de un colegio nuevo (cierre HITO 4, observación del cliente:
 * "garantizar que cada institución tenga su propio currículo
 * independiente"). Hasta esta corrección NO existía ningún camino para dar
 * de alta un segundo colegio —la semilla crea uno solo, y `/admin/aulas`
 * y `/admin/usuarios` sólo pueden ELEGIR entre las instituciones que ya
 * existen—, así que el aislamiento curricular por institución no tenía
 * forma de probarse (ni de usarse de verdad) más allá del único colegio
 * de la semilla.
 *
 * Separado de la ruta por el mismo motivo que `lib/admin/aulas.ts`: forma y
 * validación sin Prisma ni Next.js, para que la QA lo ejercite sin servidor.
 */
export const institucionSchema = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre del colegio."),
  /// Optativo, igual que en el esquema: una academia privada puede no tener
  /// código oficial. `""` se normaliza a `undefined` para no chocar con la
  /// restricción `@unique` del esquema guardando cadenas vacías repetidas.
  codigoModular: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type EntradaInstitucion = z.infer<typeof institucionSchema>;
