import { randomBytes } from "node:crypto";

/**
 * EL CÓDIGO DE ACCESO DE UN AULA (HITO 3) — sólo servidor.
 *
 * Separado de `lib/docente/aulas.ts` porque usa `node:crypto`: ese módulo lo
 * importan también los formularios del CLIENTE (por sus constantes de
 * validación), y webpack no sabe empaquetar un módulo de Node para el
 * navegador —el build entero fallaba con "UnhandledSchemeError: node:crypto"
 * señalando exactamente esa cadena de imports—. Esta función sólo la llama
 * `POST /api/docente/aulas`, que corre en el servidor.
 */

/**
 * UN CÓDIGO QUE SE PUEDE LEER EN VOZ ALTA EN UN AULA.
 *
 * Seis caracteres hexadecimales en mayúsculas —`crypto.randomBytes(3)`, como
 * pidió el cliente—: 16.777.216 combinaciones, cortas de copiar de la pizarra
 * y sin ambigüedad entre mayúscula y minúscula, porque sólo hay mayúsculas.
 * No se excluyen caracteres parecidos (0/O, 1/I): el hexadecimal no usa ni O
 * ni I, así que esa confusión ya no puede pasar.
 */
export function generarCodigoAcceso(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}
