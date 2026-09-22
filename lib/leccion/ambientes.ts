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
 *
 * Y LA CADENA DE RESOLUCIÓN NO SE PARTE EN DOS COLUMNAS.
 *
 * El despeje de "2x + 6 = 16" empezaba en el Ambiente 1 —la línea de la
 * cancelación— y seguía en el 2 —"2x = 10", "x = 5"—. Está todo escrito y no se
 * borra nada, pero leído de corrido parece que la pizarra se vacía y salta a
 * otra cosa; el cliente lo describió así: "tras aplicar la resta a ambos lados,
 * la pizarra se limpia y salta directamente a 2x = 10, borrando el paso de
 * cancelación". Pidió el historial "acumulativo verticalmente en el panel de
 * desarrollo… cada nuevo paso secuencialmente hacia abajo, estilo registro de
 * cuaderno escolar".
 *
 * Así que UNA CADENA DE RESOLUCIÓN SIGUE EN EL AMBIENTE DONDE EMPIEZA, bajando
 * un paso debajo de otro en el orden en que la voz los cuenta:
 *
 *   · si el propio enunciado es ya el primer eslabón —"2x + 6 = 16", sobre el
 *     que se cancela—, le acompaña en el Ambiente 1 UN paso: el que cierra esa
 *     operación (la línea tachada). Desde ahí la cadena sigue por el Ambiente 2,
 *     que es donde el informe pone "la continuación operativa" y "la respuesta
 *     final consolidada". Con los dos tiempos de cada operación —escribirla y
 *     tacharla— un despeje son cinco o seis renglones: amontonarlos todos a la
 *     izquierda dejaría el panel de desarrollo vacío, que es justo lo que el
 *     cliente pidió evitar cuando vio "un enorme espacio vacío" en el Ambiente 2;
 *   · si el enunciado se transforma primero —repartir un paréntesis, amplificar
 *     una fracción—, esa transformación se queda en el Ambiente 1 y la cadena
 *     entera baja por el Ambiente 2.
 *
 * Lo que ya no pasa es que la cadena empiece a la izquierda y salte a la
 * derecha en el segundo paso, que es lo que se leía como un borrado.
 */

export type Ambiente = 1 | 2;

export type PapelDelPaso = "planteamiento" | "auxiliar" | "paso" | "cierre";

export interface PasoDeLaPizarra {
  papel: PapelDelPaso;
  /** El gesto del paso: la etiqueta del motor o, si no la trae, el tipo de escena deducido. */
  gesto: string | null;
}

/**
 * Los gestos que REESCRIBEN EL ENUNCIADO, que son los que el informe pone en el
 * Ambiente 1 como "primera fase de transformación": repartir un paréntesis,
 * amplificar una fracción a su denominador común, simplificar un término.
 *
 * Los demás —cancelar, dividir, bajar un exponente, llegar al resultado— son la
 * continuación operativa: la cadena que baja por el panel de desarrollo.
 */
const TRANSFORMA_EL_ENUNCIADO = new Set(["distributiva", "amplificacion", "simplificacion", "suma-fracciones"]);

export function repartirEnAmbientes(pasos: readonly PasoDeLaPizarra[]): Ambiente[] {
  let primerGesto: string | null = null;
  let acompana = false;
  let segundoAbierto = false;
  /** La cadena de resolución empezó sobre el propio enunciado, en el Ambiente 1. */
  let cadenaEnElUno = false;
  /** Cuántos pasos de esa cadena se han quedado ya en el Ambiente 1. */
  let pasosEnElUno = 0;
  return pasos.map((p) => {
    if (p.papel === "planteamiento") {
      // Un planteamiento que ya opera (la distributiva que se anima sobre el
      // propio enunciado) fija el gesto de la primera fase.
      if (p.gesto && !primerGesto) primerGesto = p.gesto;
      // Y si lo que hace sobre él no es transformarlo sino resolverlo —cancelar
      // un término, dividir entre el coeficiente—, el enunciado es el primer
      // eslabón: la cadena continúa debajo, aquí mismo.
      if (p.gesto && !TRANSFORMA_EL_ENUNCIADO.has(p.gesto)) cadenaEnElUno = true;
      return 1;
    }
    if (p.papel === "auxiliar" || p.papel === "cierre") return 2;
    const transforma = p.gesto != null && TRANSFORMA_EL_ENUNCIADO.has(p.gesto);
    // Acompaña al planteamiento UN solo paso que lo transforme (la primera
    // conversión de una suma de fracciones): la segunda abre el Ambiente 2.
    if (!segundoAbierto && !acompana && transforma && (primerGesto == null || p.gesto === primerGesto)) {
      primerGesto ??= p.gesto;
      acompana = true;
      return 1;
    }
    // Y una cadena de resolución no se parte por la mitad: sigue donde empezó…
    // pero no se queda entera en una sola columna. Con los dos tiempos de cada
    // operación —escribirla y tacharla— un despeje son cinco o seis renglones,
    // y amontonarlos a la izquierda deja el panel de desarrollo vacío, que es
    // justo lo que el cliente pidió evitar en su día. Al enunciado le acompaña
    // UN paso —el que cierra la operación empezada sobre él— y el resto baja
    // por el Ambiente 2, donde se lee de corrido.
    if (!segundoAbierto && !transforma && cadenaEnElUno && pasosEnElUno < 1) {
      pasosEnElUno++;
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
