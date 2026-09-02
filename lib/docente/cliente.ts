import type { InformeValidacion } from "./validador.ts";

/**
 * El puente entre los formularios del panel y la API de /api/docente.
 *
 * Existe para que las pantallas no repitan el mismo bloque de `fetch`, y sobre
 * todo para que traten los errores IGUAL. El caso que lo justifica es el 422 del
 * validador: la respuesta trae el informe con las combinaciones que fallan, y si
 * cada pantalla lo desempaqueta a su manera acaba habiendo formularios que
 * enseñan el detalle y formularios que sólo dicen "no se pudo guardar".
 */
export type Respuesta<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string; informe?: InformeValidacion; estado: number };

export async function pedir<T>(
  url: string,
  opciones: { metodo?: string; cuerpo?: unknown } = {},
): Promise<Respuesta<T>> {
  const { metodo = "GET", cuerpo } = opciones;

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    // Sin red no hay respuesta que interpretar, y el mensaje del navegador
    // ("Failed to fetch") no le dice nada a un profesor.
    return {
      ok: false,
      error: "No se ha podido contactar con el servidor. Comprueba tu conexión.",
      estado: 0,
    };
  }

  let cuerpoRespuesta: Record<string, unknown> = {};
  try {
    cuerpoRespuesta = (await respuesta.json()) as Record<string, unknown>;
  } catch {
    // Una respuesta sin JSON (un 500 del proxy, por ejemplo) no debe tumbar la
    // pantalla: se trata como error con el código que haya llegado.
  }

  if (!respuesta.ok) {
    return {
      ok: false,
      error:
        typeof cuerpoRespuesta.error === "string"
          ? cuerpoRespuesta.error
          : `La operación falló (${respuesta.status}).`,
      informe: cuerpoRespuesta.informe as InformeValidacion | undefined,
      estado: respuesta.status,
    };
  }

  return { ok: true, datos: cuerpoRespuesta as T };
}
