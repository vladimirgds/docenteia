/**
 * LA PIZARRA EN DOS AMBIENTES: EL HILO PRINCIPAL Y EL BORRADOR.
 *
 * El informe del cliente (SUB-PIZ-02) pidió «dos paneles horizontales
 * continuos», y durante varias rondas el reparto fue por POSICIÓN: el
 * planteamiento y la primera transformación a la izquierda, y todo lo demás
 * bajando por la derecha. Eso dejaba la izquierda medio vacía y la derecha
 * saturada, con barra de desplazamiento, y el cliente lo cerró con una regla
 * nueva que ya no habla de posiciones sino de PAPELES:
 *
 *   «1. Ambiente 1 (columna izquierda — desarrollo principal): en esta columna
 *    debe ir el hilo conductor limpio del ejercicio paso a paso: planteamiento
 *    inicial, ecuaciones simplificadas resultantes y, al final, la respuesta
 *    definitiva. Aquí el estudiante sigue la secuencia principal sin sobrecarga
 *    de cálculos intermedios.
 *
 *    2. Ambiente 2 (columna derecha — operaciones auxiliares y cancelaciones):
 *    esta columna debe reservarse para los cálculos de apoyo, desgloses y
 *    cancelaciones de términos (como restar 3x a ambos lados o simplificar
 *    constantes).
 *
 *    3. Regla de PERSISTENCIA en el Ambiente 2: cuando concluye una operación
 *    auxiliar y su resultado se traslada formalmente al siguiente renglón del
 *    Ambiente 1, el Ambiente 2 NO debe limpiarse. Las operaciones auxiliares
 *    deben permanecer visibles para que el estudiante pueda revisar y comprender
 *    la evolución progresiva de todo el desarrollo.»
 *
 * Esa tercera regla llegó primero al revés —«el Ambiente 2 debe limpiarse o
 * refrescarse para dar paso al siguiente cálculo auxiliar»— y así se entregó. El
 * cliente la corrigió después de probarlo: prefiere poder repasar la cuenta
 * entera a ganar sitio. Manda la versión de ahora: NADA SE BORRA, ni en una
 * columna ni en la otra. Lo que evita que el alumno tenga que buscar es el
 * autodesplazamiento al renglón que se está explicando.
 *
 * QUÉ ES HILO Y QUÉ ES BORRADOR
 *
 *   · Hilo: el planteamiento, cada ecuación ya simplificada —"2x + 8 = 3x − 1",
 *     "−x + 8 = −1", "−x = −9"— y la respuesta final enmarcada.
 *   · Borrador: la operación escrita en los dos miembros y su tachado
 *     —"2x + 8 − 3x = 3x − 1 − 3x"—, la división escrita como fracción, el MCM y
 *     los múltiplos, lo que sale de cada columna de una cuenta y el desglose
 *     término a término de una derivada.
 *
 * Y NO SE DECIDE MIRANDO LA ECUACIÓN, sino el GESTO que el paso hace sobre
 * ella, que es lo que el motor ya etiqueta: tachar, dividir los dos miembros o
 * anotar al margen son borrador; escribir la línea que queda es hilo. La misma
 * regla sirve para una suma de fracciones o para una derivada sin una sola
 * excepción por tema.
 *
 * Y CADA COLUMNA ES SÓLO LO SUYO: «el Ambiente 2 se reserva EXCLUSIVAMENTE para
 * los cálculos de apoyo, desgloses, operaciones inversas y cancelaciones». No
 * hay, por tanto, un modo en el que el hilo se pase a la derecha cuando se queda
 * sin sitio: si el desarrollo es largo, se desplaza, que es lo que el cliente
 * prefiere a perder de vista la mitad de la cuenta.
 */

export type Ambiente = 1 | 2;

export type PapelDelPaso = "planteamiento" | "auxiliar" | "paso" | "cierre";

export interface PasoDeLaPizarra {
  papel: PapelDelPaso;
  /** El gesto del paso: la etiqueta del motor o, si no la trae, el tipo de escena deducido. */
  gesto: string | null;
  /**
   * ¿Es una operación de apoyo —tachar, dividir los dos miembros, una nota al
   * margen— en vez de un eslabón del hilo conductor? Lo deduce la pizarra de la
   * escena del paso (ver `esGestoDeBorrador`), que es quien la tiene compuesta.
   */
  auxiliar?: boolean;
}

/**
 * ¿ES UNA OPERACIÓN DE APOYO? LO DICE EL MOTOR, NO LA ECUACIÓN.
 *
 * Esto se dedujo un tiempo de lo que la escena SEÑALABA —un tachado era una
 * cancelación, dos marcas sobre los denominadores una división— y con esa regla
 * acababan en la columna de apoyo ecuaciones que son del hilo: el cliente puso
 * «11x − 8 + 8 = 25 + 8» y «11x/11 = 33/11» en el desarrollo formal, y al taller
 * sólo la cuenta que los justifica («−8 + 8 = 0»). Eso no se ve mirando la
 * ecuación: lo sabe quien la genera, y por eso ahora lo declara (`ambiente: 2`
 * en la directiva, `papel: "auxiliar"` en las notas al margen).
 *
 * Queda aquí la red para lo que llegue SIN declarar —una aclaración que el
 * modelo escribe en vivo—: una nota al margen reconocible por su gesto. Todo lo
 * demás es hilo, que es lo que el alumno tiene que poder leer de corrido.
 */
const GESTOS_DE_NOTA_AL_MARGEN = new Set(["columna"]);

export function esGestoDeBorrador(
  gesto: string | null | undefined,
  focos: readonly { tipo?: string; clase?: string }[] = [],
): boolean {
  // Con escena compuesta no se deduce nada: si fuera apoyo, vendría declarado.
  if (focos.length) return false;
  return Boolean(gesto && GESTOS_DE_NOTA_AL_MARGEN.has(gesto));
}

/**
 * Reparte los pasos entre los dos ambientes, cada uno con su papel.
 *
 * No hay más regla que ésa, y no depende de cuánto quepa: lo que se escribe se
 * queda escrito en su columna, y si el desarrollo es largo la pizarra se
 * desplaza al renglón que se está explicando.
 */
export function repartirEnAmbientes(pasos: readonly PasoDeLaPizarra[]): Ambiente[] {
  return pasos.map((p) => {
    const esApoyo = p.papel === "auxiliar" || (p.papel === "paso" && Boolean(p.auxiliar));
    // El planteamiento, las ecuaciones que van quedando y la respuesta
    // definitiva son el hilo conductor; tachar, dividir los dos miembros y las
    // notas al margen son el apoyo.
    return esApoyo ? 2 : 1;
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
