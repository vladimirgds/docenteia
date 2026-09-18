/**
 * LA PIZARRA EN DOS AMBIENTES (SUB-PIZ-02 del informe del cliente).
 *
 * "Toda pizarra debe estructurarse obligatoriamente en dos paneles horizontales
 * continuos":
 *
 *   · Ambiente 1 (izquierdo): el planteamiento del ejercicio y la primera fase
 *     de transformación.
 *   · Ambiente 2 (derecho): los cálculos auxiliares (el MCM), la continuación
 *     operativa y la respuesta final consolidada, enmarcada.
 *
 * Y con una regla de continuidad: lo escrito en el Ambiente 1 no se borra al
 * pasar al 2. Al terminar, los dos enseñan el procedimiento entero.
 *
 * QUÉ VA A CADA LADO se decide paso a paso y SIN MIRAR LO QUE VIENE DESPUÉS: una
 * línea que ya está escrita no puede cambiar de ambiente cuando llega la
 * siguiente —saltaría de un lado al otro delante del alumno—. Por eso la regla
 * es monótona:
 *
 *   1. El planteamiento, siempre al Ambiente 1.
 *   2. Un cálculo auxiliar (MCM, múltiplos, lo que sale de cada columna o de
 *      cada término) al Ambiente 2, arriba: a la altura del ejercicio, como pidió
 *      el cliente para el MCM.
 *   3. El cierre (la respuesta final) al Ambiente 2, abajo.
 *   4. UN solo paso acompaña al planteamiento en el Ambiente 1: el primero, y
 *      sólo si repite su GESTO (o el planteamiento no tenía ninguno). El
 *      siguiente abre el Ambiente 2 —aunque repita el mismo gesto—, y desde ahí
 *      todo sigue en él.
 *
 * Así 1/2 + 1/3 queda con la primera conversión a la izquierda y, a la derecha,
 * el MCM, la segunda conversión, la suma de las fracciones homogéneas y la
 * respuesta; 2(x + 3) = 16, con el reparto a la izquierda y el despeje y la
 * solución a la derecha. Sin una sola regla por tema: sirve igual para un
 * ejercicio nuevo del catálogo.
 *
 * LAS DOS CONVERSIONES ESTABAN JUNTAS A LA IZQUIERDA —los pasos seguían en el
 * Ambiente 1 mientras repitieran el gesto del primero— y el cliente lo corrigió
 * con la captura de 1/2 + 1/3 delante: mientras el Ambiente 1 amplificaba, "el
 * Ambiente 2 sólo muestra la línea del MCM y queda con un enorme espacio
 * vacío". Reparte una conversión a cada lado, que es lo que pidió.
 */

export type Ambiente = 1 | 2;

export type PapelDelPaso = "planteamiento" | "auxiliar" | "paso" | "cierre";

export interface PasoDeLaPizarra {
  papel: PapelDelPaso;
  /** El gesto del paso: la etiqueta del motor o, si no la trae, el tipo de escena deducido. */
  gesto: string | null;
}

export function repartirEnAmbientes(pasos: readonly PasoDeLaPizarra[]): Ambiente[] {
  let primerGesto: string | null = null;
  let acompana = false;
  let segundoAbierto = false;
  return pasos.map((p) => {
    if (p.papel === "planteamiento") {
      // Un planteamiento que ya opera (la distributiva que se anima sobre el
      // propio enunciado) fija el gesto de la primera fase.
      if (p.gesto && !primerGesto) primerGesto = p.gesto;
      return 1;
    }
    if (p.papel === "auxiliar" || p.papel === "cierre") return 2;
    if (!segundoAbierto && !acompana && (primerGesto == null || p.gesto === primerGesto)) {
      primerGesto ??= p.gesto;
      acompana = true;
      return 1;
    }
    segundoAbierto = true;
    return 2;
  });
}

/**
 * ¿Es un cálculo auxiliar, de los que se hacen al margen?
 *
 * El MCM y los múltiplos, lo que sale de cada columna de una cuenta ("unidades:
 * 4 + 8 = 12…", "llevamos 1") y el desglose término a término de una derivada.
 * Son notas que acompañan al procedimiento principal, no un paso de él.
 */
export function esCalculoAuxiliar(texto: string): boolean {
  const t = String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  return (
    /^(m\.?c\.?m|mcm|multiplos|el menor en comun|termino a termino)\b/.test(t) ||
    /^(unidades|decenas|centenas|millares|unidades de millar|decenas de millar|centenas de millar|millones)\s*:/.test(t) ||
    /^(llevamos|nos llevabamos)\b/.test(t)
  );
}
