/**
 * ANOTACIONES QUE NO TAPAN NINGUNA CIFRA (SUB-NOT-04 del informe del cliente).
 *
 * "Todo elemento flotante debe contar con un margen de separación mínimo de 8 px
 * respecto a la caja del glifo numérico" y "ningún elemento superpuesto puede
 * intersectar el área de un dígito KaTeX". El cliente lo fotografió con "entre
 * 6": el rótulo del denominador iba ENCIMA de su recuadro, y encima del
 * denominador de una fracción está... su numerador. El 3 quedaba debajo de la
 * palabra.
 *
 * Aquí no hay un sitio fijo para el rótulo: se prueban, por orden, encima de su
 * recuadro, debajo, a la derecha y a la izquierda, y se queda en el primero en
 * el que, con 8 px de aire alrededor, no pisa ninguna cifra de la fórmula ni el
 * propio recuadro. Es geometría pura —las cajas ya medidas en el navegador— y
 * por eso vive aquí, donde la suite la comprueba sin montar nada.
 */

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** El margen mínimo que exige el informe entre una anotación y una cifra. */
export const MARGEN_ANOTACION = 8;

export type LadoEtiqueta = "arriba" | "abajo" | "derecha" | "izquierda";

/** ¿Se tocan dos rectángulos, dejando `aire` alrededor del primero? */
export function seSolapan(a: Rect, b: Rect, aire = 0): boolean {
  return (
    a.x - aire < b.x + b.ancho &&
    a.x + a.ancho + aire > b.x &&
    a.y - aire < b.y + b.alto &&
    a.y + a.alto + aire > b.y
  );
}

/**
 * Dónde va el rótulo de un recuadro.
 *
 * Devuelve el rectángulo que ocupará el texto (su esquina superior izquierda y
 * su tamaño) y de qué lado quedó. Si ningún lado está limpio —no pasa con las
 * fórmulas de la lección, pero una fórmula ajena podría ser muy densa—, se
 * queda con el que menos cifras pisa.
 */
export function colocarEtiqueta(opciones: {
  caja: Rect;
  ancho: number;
  alto: number;
  /** Las cajas de las cifras de la fórmula, medidas en el mismo sistema. */
  obstaculos: readonly Rect[];
  preferidos?: readonly LadoEtiqueta[];
  margen?: number;
  /**
   * Entre qué x puede ir el rótulo: el ancho de su ambiente. Un rótulo más
   * ancho que su caja —"numeradores" sobre un 3— se salía por la izquierda y
   * cruzaba la raya que separa los dos ambientes. Se desliza hacia dentro ANTES
   * de comprobar que no pisa nada.
   */
  limites?: { x0: number; x1: number };
}): { rect: Rect; lado: LadoEtiqueta } {
  const { caja, ancho, alto, obstaculos, limites } = opciones;
  const margen = opciones.margen ?? MARGEN_ANOTACION;
  const orden = opciones.preferidos ?? ["arriba", "abajo", "derecha", "izquierda"];
  const dentro = (x: number) =>
    limites && limites.x1 - limites.x0 >= ancho ? Math.min(Math.max(x, limites.x0), limites.x1 - ancho) : x;
  const centroX = dentro(caja.x + caja.ancho / 2 - ancho / 2);
  const centroY = caja.y + caja.alto / 2 - alto / 2;
  const candidatos: Record<LadoEtiqueta, Rect> = {
    arriba: { x: centroX, y: caja.y - margen - alto, ancho, alto },
    abajo: { x: centroX, y: caja.y + caja.alto + margen, ancho, alto },
    derecha: { x: dentro(caja.x + caja.ancho + margen), y: centroY, ancho, alto },
    izquierda: { x: dentro(caja.x - margen - ancho), y: centroY, ancho, alto },
  };
  const pisadas = (r: Rect) =>
    obstaculos.filter((o) => seSolapan(r, o, margen)).length + (seSolapan(r, caja, margen - 0.5) ? 1 : 0);

  let mejor: { rect: Rect; lado: LadoEtiqueta; pisa: number } | null = null;
  for (const lado of orden) {
    const rect = candidatos[lado];
    const pisa = pisadas(rect);
    if (pisa === 0) return { rect, lado };
    if (!mejor || pisa < mejor.pisa) mejor = { rect, lado, pisa };
  }
  return { rect: mejor!.rect, lado: mejor!.lado };
}
