import { TEMAS, temaAEnum, type TemaEnum } from "../diagnostico/banco.ts";
import { solveLinearSteps } from "../../src/preLight.js";
import {
  escenaDeCancelacion,
  escenaDeCancelacionDeIncognita,
  escenaDeDivisionEnFraccion,
} from "./animacion.ts";

/**
 * Catálogo formal de reglas y propiedades.
 *
 * POR QUÉ VIVE EN LA BASE DE DATOS
 * El motor pedagógico decide CÓMO se enseña un tema; QUÉ reglas lo componen es
 * currículo, y el currículo crece. Teniéndolo como dato, ampliar el temario es
 * cargar contenido —o editarlo desde el panel de administración más adelante—
 * en lugar de tocar la aplicación.
 *
 * El fichero `prisma/seed-data/reglas-matematicas.json` es la fuente; este
 * módulo lo valida y lo adapta al esquema. Lo usan a la vez la semilla y la
 * batería de QA, de modo que lo que se comprueba es la conversión real.
 */

export type NivelRegla = "BASICO" | "INTERMEDIO" | "AVANZADO";

/** Una regla tal como llega en el JSON. */
export interface ReglaOficial {
  clave: string;
  tema: string;
  orden: number;
  nombre: string;
  /** Enunciado formal en LaTeX. */
  enunciado: string;
  descripcion: string;
  ejemplo?: string;
  nivel?: string;
  practicable?: boolean;
}

/** Una regla ya adaptada al esquema de `reglas_matematicas`. */
export interface ReglaAdaptada {
  clave: string;
  tema: TemaEnum;
  orden: number;
  nombre: string;
  enunciado: string;
  descripcion: string;
  ejemplo: string | null;
  nivel: NivelRegla | null;
  practicable: boolean;
}

const NIVELES: readonly NivelRegla[] = ["BASICO", "INTERMEDIO", "AVANZADO"];

export function adaptarRegla(r: ReglaOficial, indice: number): ReglaAdaptada {
  if (!r || typeof r.clave !== "string" || !r.clave.trim()) {
    throw new Error(`La regla en la posición ${indice} no tiene clave.`);
  }
  for (const campo of ["nombre", "enunciado", "descripcion"] as const) {
    if (typeof r[campo] !== "string" || !r[campo].trim()) {
      throw new Error(`La regla "${r.clave}" no tiene ${campo}.`);
    }
  }
  if (!Number.isInteger(r.orden)) {
    throw new Error(`La regla "${r.clave}" no tiene un orden entero.`);
  }

  const nivel = r.nivel ? String(r.nivel).toUpperCase() : null;
  if (nivel && !(NIVELES as readonly string[]).includes(nivel)) {
    throw new Error(`Nivel desconocido en la regla "${r.clave}": ${r.nivel}`);
  }

  return {
    clave: r.clave,
    tema: temaAEnum(r.tema),
    orden: r.orden,
    nombre: r.nombre,
    enunciado: r.enunciado,
    descripcion: r.descripcion,
    ejemplo: r.ejemplo?.trim() ? r.ejemplo : null,
    nivel: (nivel as NivelRegla | null) ?? null,
    practicable: r.practicable === true,
  };
}

/**
 * Adapta el catálogo completo y comprueba lo que sólo se ve en conjunto: claves
 * repetidas, órdenes duplicados dentro de un tema y temas sin ninguna regla.
 *
 * Lo último importa más de lo que parece: un tema sin reglas dejaría la fase
 * "Reglas y propiedades" vacía en pantalla, que es exactamente el defecto que
 * este catálogo viene a corregir.
 */
/** Quita tildes y baja a minúsculas, para comparar textos sin depender del acento. */
function normalizar(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identifica qué regla del catálogo está aplicando un paso del ejemplo.
 *
 * El motor nombra la regla dentro de su explicación ("Regla de la potencia:
 * multiplicamos el coeficiente…"), así que basta con buscar el nombre. Se
 * prefiere la coincidencia MÁS LARGA: "regla de la suma y la resta" contiene
 * "regla de la suma", y quedarse con la primera etiquetaría mal el paso.
 *
 * Devuelve null cuando el paso no menciona ninguna regla, que es lo correcto:
 * poner una etiqueta a ojo sería atribuirle al alumno un razonamiento que el
 * tutor no ha hecho.
 */
export function identificarRegla<T extends { nombre: string }>(
  texto: string,
  reglas: readonly T[],
): T | null {
  const t = normalizar(texto);
  if (!t) return null;

  let mejor: T | null = null;
  for (const regla of reglas) {
    const nombre = normalizar(regla.nombre);
    if (!nombre || !t.includes(nombre)) continue;
    if (!mejor || nombre.length > normalizar(mejor.nombre).length) mejor = regla;
  }
  return mejor;
}

/**
 * Determina qué regla está explicando el tutor AHORA MISMO.
 *
 * POR QUÉ EXISTE
 * La fase de Reglas mostraba de golpe todas las tarjetas del catálogo, sin
 * vincularlas al paso que se estaba narrando: la voz explicaba la regla de la
 * potencia mientras en pantalla aparecían también la del cociente y la de la
 * cadena. La pizarra y el audio contaban cosas distintas.
 *
 * Se recorren las líneas ya reveladas de ATRÁS HACIA ADELANTE y se devuelve la
 * primera regla nombrada: la más reciente es la que el tutor acaba de
 * introducir. Como las líneas aparecen una por directiva, la tarjeta cambia al
 * ritmo del diálogo.
 *
 * Devuelve null mientras el tutor no haya nombrado ninguna. Es lo correcto:
 * enseñar una tarjeta antes de que se hable de ella volvería a desincronizar la
 * pizarra, sólo que en la otra dirección.
 */
export function reglaActiva<T extends { nombre: string }>(
  lineas: readonly string[],
  reglas: readonly T[],
): T | null {
  if (!reglas.length) return null;
  for (let i = lineas.length - 1; i >= 0; i--) {
    const encontrada = identificarRegla(lineas[i], reglas);
    if (encontrada) return encontrada;
  }
  return null;
}

/**
 * QUÉ REGLA SE APLICA EN ESTE EJERCICIO, LEÍDA DE SU ESTRUCTURA.
 *
 * «El sistema tiene hardcodeada la propiedad distributiva como explicación
 * universal para cualquier ejercicio de ecuaciones lineales»: el cliente lo
 * fotografió con "x/3 + 7 = 12" —sin paréntesis, sin factor distributivo— y el
 * botón «Explicar regla» respondiendo igual que si lo hubiera.
 *
 * La causa no era un texto fijo: era `reglaActiva()`, que busca el NOMBRE del
 * catálogo dentro de lo último dicho o escrito EN TODA LA LECCIÓN. Si el
 * ejercicio en curso no vuelve a nombrar ninguna regla por su nombre exacto
 * —y "Multiplicamos por 3:" no lo hace—, la búsqueda sigue hacia atrás y
 * encuentra la del ejercicio ANTERIOR. Daba igual qué ejercicio tuviera
 * delante el alumno: la pizarra seguía señalando la regla de otro.
 *
 * Esta función no busca texto: analiza el ejercicio ACTIVO con el mismo
 * `solveLinearSteps` que decide sus pasos (una sola fuente de verdad, no una
 * copia que se desincronice), así que la regla que devuelve es siempre la de
 * ESTE ejercicio, nunca la de uno anterior.
 *
 *   1. `paso` trae la línea exacta que el alumno tenía delante (si la hay) y
 *      ESA línea, por su forma, ya dice qué operación se le ha hecho:
 *        · "ax + b − b = c − b"   → se sumó o restó lo mismo a los dos lados
 *          (propiedad uniforme de la suma).
 *        · "ax/n = c/n"           → se dividió entre lo mismo en los dos lados
 *          (propiedad uniforme del producto).
 *   2. Sin ese dato —la pregunta genérica, «explícame la regla que se
 *      aplica»— se mira el ejercicio entero: si trae paréntesis, hace falta la
 *      distributiva ANTES que ninguna otra; si no trae paréntesis pero sí una
 *      fracción o un decimal que despejar, hace falta multiplicar los dos
 *      lados por el mismo número (uniforme del producto) para quitarlo; si no
 *      trae ninguna de las dos, el primer paso es siempre sumar o restar lo
 *      mismo a los dos lados (uniforme de la suma).
 *
 * `null` si el texto no es una ecuación lineal reconocible, o si el catálogo
 * no tiene la clave que correspondería (currículo incompleto): mejor no
 * etiquetar que etiquetar con una regla que no está.
 */
export function reglaDeEcuacionLineal<T extends { clave: string }>(
  ejercicio: string,
  paso: string | null | undefined,
  reglas: readonly T[],
): T | null {
  const sol = solveLinearSteps(String(ejercicio ?? ""));
  if (!sol) return null;
  const porClave = (clave: string) => reglas.find((r) => r.clave === clave) ?? null;

  // EL PASO, RECONOCIDO CON LOS MISMOS OJOS CON LOS QUE LO ANIMA LA PIZARRA.
  //
  // No se reescribe el patrón: se le pregunta a la MISMA función que decide si
  // ese renglón se tacha por una constante o por la incógnita en los dos
  // lados (`escenaDeCancelacion` / `escenaDeCancelacionDeIncognita`) o se
  // divide en fracción (`escenaDeDivisionEnFraccion`). Si alguna lo reconoce,
  // es la MISMA operación que dibuja el tachado o la fracción, y por tanto la
  // MISMA regla.
  if (paso) {
    if (escenaDeCancelacion(paso, "r") || escenaDeCancelacionDeIncognita(paso, "r")) {
      return porClave("lin-uniforme-suma");
    }
    if (escenaDeDivisionEnFraccion(paso, "r")) {
      return porClave("lin-uniforme-producto");
    }
  }

  // Sin un paso que lo diga por su forma, se juzga el ejercicio entero: lo
  // primero que haría falta para empezar a despejarlo.
  if (sol.tieneParentesis) return porClave("lin-distributiva");
  if (sol.escala !== 1) return porClave("lin-uniforme-producto");
  return porClave("lin-uniforme-suma");
}

export function adaptarCatalogo(oficial: ReglaOficial[]): ReglaAdaptada[] {
  if (!Array.isArray(oficial) || oficial.length === 0) {
    throw new Error("El catálogo de reglas está vacío o no es una lista.");
  }

  const reglas = oficial.map(adaptarRegla);

  const claves = reglas.map((r) => r.clave);
  if (new Set(claves).size !== claves.length) {
    throw new Error("Hay claves de regla repetidas en el catálogo.");
  }

  for (const tema of TEMAS) {
    const delTema = reglas.filter((r) => r.tema === tema);
    if (delTema.length === 0) {
      throw new Error(
        `El tema ${tema} no tiene ninguna regla: su fase "Reglas y propiedades" se vería vacía.`,
      );
    }
    const ordenes = delTema.map((r) => r.orden);
    if (new Set(ordenes).size !== ordenes.length) {
      throw new Error(`Hay órdenes repetidos en las reglas de ${tema}.`);
    }
  }

  return reglas;
}
