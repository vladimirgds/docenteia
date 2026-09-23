/**
 * EL MODELO DE DATOS DE UN PASO, TAL COMO LO PIDIÓ EL CLIENTE.
 *
 * «Para que no dependa de un ejercicio en específico, estructura la respuesta de
 * cada paso con esta forma», y a continuación la escribió él mismo. Es ésta, sin
 * cambiarle un nombre: es un contrato, y la batería comprueba que el motor lo
 * cumple para TODO el catálogo de ecuaciones, no para un ejercicio suelto.
 *
 * QUÉ VA EN CADA COLUMNA
 *
 *   «1. Ambiente 1 (columna izquierda: hilo conductor principal). Es la columna
 *    del desarrollo formal del ejercicio. Lleva una estructura secuencial
 *    vertical y limpia:
 *      · Texto explicativo de la acción principal: explicar el objetivo del paso
 *        ANTES de escribir la ecuación.
 *      · Ecuación canónica resultante: muestra la ecuación simplificada.
 *      · Cierre y resultado: culmina con el despeje final de la incógnita.
 *    En esta columna no deben acumularse operaciones aisladas de aritmética
 *    elemental ni bloques desalineados.
 *
 *    2. Ambiente 2 (columna derecha: taller de operaciones auxiliares). Es la
 *    columna de borrador o apoyo analítico. Aquí se detalla el cálculo de dónde
 *    sale cada valor intermedio antes o durante su incorporación al Ambiente 1.»
 *
 * Y con su ejemplo delante, que es el que fija la frontera entre las dos:
 *
 *   Ambiente 1        «Agrupamos las "x", sumando: 6x + 5x»
 *                     11x − 8 = 25
 *                     «Luego, para eliminar el "−8", sumamos +8 a cada miembro»
 *                     11x − 8 + 8 = 25 + 8
 *                     11x = 33
 *   Ambiente 2        «entonces sumamos:»   6x + 5x = 11x
 *                     «Entonces, colocamos los 11x en la ecuación»
 *                     ─────────
 *                     −8 + 8 = 0
 *
 * La LÍNEA COMPENSADA es del hilo —el cliente la puso ahí: «muestra la ecuación
 * simplificada (por ejemplo: 11x − 8 = 25, luego 11x − 8 + 8 = 25 + 8, y luego
 * 11x = 33)»—; al taller va la ARITMÉTICA que la justifica, no la ecuación.
 */

export interface PasoLeccion {
  ambiente1: {
    /** El objetivo del paso, dicho ANTES de escribir la ecuación. */
    explicacion: string;
    /** La ecuación canónica que queda, en la notación del motor. */
    ecuacionKaTeX: string;
  };
  ambiente2?: {
    /** Lo que presenta el cálculo de apoyo: «entonces sumamos:». */
    textoAuxiliar?: string;
    /** La cuenta suelta de donde sale el valor: «6x + 5x = 11x». */
    calculoKaTeX?: string;
    /** Qué se hace con ella: «Entonces, colocamos los 11x en la ecuación». */
    conclusion?: string;
  };
}

/**
 * ¿Este objeto cumple el contrato?
 *
 * Se comprueba lo que el contrato EXIGE —`ambiente1` con sus dos cadenas no
 * vacías— y que, si trae apoyo, no venga vacío: un `ambiente2` sin nada dentro
 * abriría una columna en blanco a la derecha de la pizarra.
 */
export function esPasoLeccion(x: unknown): x is PasoLeccion {
  if (!x || typeof x !== "object") return false;
  const paso = x as PasoLeccion;
  const uno = paso.ambiente1;
  if (!uno || typeof uno.explicacion !== "string" || typeof uno.ecuacionKaTeX !== "string") return false;
  if (!uno.explicacion.trim() || !uno.ecuacionKaTeX.trim()) return false;
  const dos = paso.ambiente2;
  if (dos === undefined) return true;
  if (!dos || typeof dos !== "object") return false;
  const cadena = (v: unknown) => v === undefined || typeof v === "string";
  if (!cadena(dos.textoAuxiliar) || !cadena(dos.calculoKaTeX) || !cadena(dos.conclusion)) return false;
  return Boolean(
    (dos.textoAuxiliar ?? "").trim() || (dos.calculoKaTeX ?? "").trim() || (dos.conclusion ?? "").trim(),
  );
}
