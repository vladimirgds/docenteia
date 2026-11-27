import type { Tema } from "@prisma/client";

import { equivalentes } from "../matematicas/equivalencia.ts";
import { analizar } from "../matematicas/expresiones.ts";
import {
  aplicarPatron,
  generarCasos,
  instanciar,
  nombresEnPlantilla,
  rellenar,
  resolverConFicha,
  variablesDelPatron,
  type Ficha,
  type Instancia,
} from "./fichas-metodo.ts";
import { verificarPasos, type InformeVerificacion } from "./verificar-pasos.ts";

/**
 * VERIFICACIÓN DE UNA FICHA DE MÉTODO (PMV 3 · HITO 5A).
 *
 * «Comprobar las operaciones soportadas con el motor matemático» y «marcar los
 * casos pendientes de validación automática». Una ficha se verifica así:
 *
 *   1. ESTRUCTURA — las variables del patrón están declaradas, ninguna sobra, y
 *      las plantillas sólo nombran variables que existen.
 *   2. OPERACIONES — cada operación declarada se contrasta con lo que el motor
 *      del tema sabe comprobar. Las que no, quedan PENDIENTES (no son un error:
 *      el docente puede publicarlas confirmándolo, pero se ve que no están
 *      comprobadas).
 *   3. EJEMPLOS — cada ejemplo encaja con el patrón, se resuelve con la ficha y
 *      cada paso resultante se verifica con el motor (`verificarPasos`).
 *   4. CASOS GENERADOS — lo mismo con varios problemas que genera el servidor a
 *      partir del patrón. Es lo que demuestra que la ficha vale para el MÉTODO y
 *      no sólo para los ejemplos que escribió su autor.
 *
 * Un paso que el motor da por INCORRECTO es un error: la ficha no se publica.
 * Un paso que el motor no sabe juzgar es un PENDIENTE: se marca y se dice cuál.
 */

/** Lo que el motor de cada tema sabe comprobar, por operación. */
export const OPERACIONES_SOPORTADAS: Record<Tema, Record<string, string>> = {
  ARITMETICA: {
    suma: "Suma de enteros y decimales",
    resta: "Resta",
    multiplicacion: "Multiplicación",
    division: "División",
    descomposicion: "Descomposición en decenas y unidades",
  },
  FRACCIONES: {
    suma: "Suma de dos fracciones",
    resta: "Resta de dos fracciones",
    producto: "Producto de dos fracciones",
    cociente: "Cociente de dos fracciones",
    denominador_comun: "Denominador común (mcm) y amplificación",
    simplificar: "Simplificación por el máximo común divisor",
  },
  ECUACIONES_LINEALES: {
    sumar_ambos_lados: "Sumar lo mismo a los dos lados",
    restar_ambos_lados: "Restar lo mismo a los dos lados",
    multiplicar_ambos_lados: "Multiplicar los dos lados",
    dividir_ambos_lados: "Dividir los dos lados",
    distributiva: "Propiedad distributiva",
    reducir_terminos: "Reducir términos semejantes",
    transposicion: "Pasar un término al otro lado cambiando el signo",
  },
  DERIVADAS: {
    potencia: "Regla de la potencia",
    suma: "Derivada de una suma",
    producto: "Regla del producto",
    cociente: "Regla del cociente",
    cadena: "Regla de la cadena",
    exponencial: "Exponencial",
    logaritmo: "Logaritmo",
    raiz: "Raíz",
    trigonometrica: "Funciones trigonométricas",
  },
  FACTORIZACION: {
    factor_comun: "Factor común",
    diferencia_cuadrados: "Diferencia de cuadrados",
    trinomio: "Trinomio cuadrado perfecto",
  },
};

export type CodigoPendiente =
  | "SIN_MOTOR"
  | "OPERACION_NO_SOPORTADA"
  | "EJEMPLO_NO_VERIFICABLE"
  | "CASO_NO_VERIFICABLE"
  | "PISTA_NO_COMPROBABLE";

export interface Pendiente {
  codigo: CodigoPendiente;
  detalle: string;
}

export interface ResultadoCaso {
  /** «ejemplo» lo escribió el autor; «generado» lo creó el servidor. */
  origen: "ejemplo" | "generado";
  problema: string;
  coincide: boolean;
  /** Veredicto del motor sobre los pasos de este caso. */
  estado: "verificado" | "incorrecto" | "pendiente" | "no_encaja";
  detalle: string;
  resultado: string | null;
  pasos: { escribe: string; estado: string }[];
}

export interface InformeFicha {
  /** ¿Se puede guardar y probar? Falso si hay errores (un paso que el motor da por mal, plantilla rota…). */
  valido: boolean;
  /** ¿Todo está comprobado por el motor y correcto? Sólo entonces es «verificada». */
  verificada: boolean;
  motor: Tema | null;
  errores: string[];
  avisos: string[];
  pendientes: Pendiente[];
  operaciones: { id: string; soportada: boolean; descripcion: string | null }[];
  casos: ResultadoCaso[];
  /** Cuántos casos generados por el servidor se comprobaron. */
  generados: number;
  revisadoEn: string;
}

const IDENTIFICADOR = /[A-Za-z_][A-Za-z0-9_]*/g;
const FUNCIONES_PERMITIDAS = new Set(["mcd", "mcm", "abs", "min", "max"]);

function estructura(ficha: Ficha): string[] {
  const errores: string[] = [];
  const nombres = ficha.variables.map((v) => v.nombre);
  const repetidas = nombres.filter((n, i) => nombres.indexOf(n) !== i);
  if (repetidas.length > 0) errores.push(`La variable «${[...new Set(repetidas)].join("», «")}» está declarada dos veces.`);

  const libres = ficha.variables.filter((v) => !v.calculada).map((v) => v.nombre);
  const delPatron = variablesDelPatron(ficha.patron);
  for (const n of new Set(delPatron)) {
    if (!nombres.includes(n)) errores.push(`El patrón usa «{${n}}», que no está declarada como variable.`);
    else if (!libres.includes(n)) errores.push(`«${n}» es una variable calculada: no puede aparecer en el patrón.`);
  }
  for (const n of libres) {
    if (!delPatron.includes(n)) errores.push(`La variable «${n}» no aparece en el patrón: no se podría extraer del problema.`);
  }

  const conocidas = new Set(nombres);
  const exigir = (donde: string, nombresUsados: string[]) => {
    for (const n of nombresUsados) {
      if (!conocidas.has(n)) errores.push(`${donde} usa «${n}», que no está declarada como variable.`);
    }
  };
  ficha.pasos.forEach((p, i) => {
    exigir(`El paso ${i + 1}`, [
      ...nombresEnPlantilla(p.explica),
      ...nombresEnPlantilla(p.escribe),
      ...(p.terminos ?? []).flatMap((t) => [...nombresEnPlantilla(t.texto), ...nombresEnPlantilla(t.explica)]),
    ]);
  });
  ficha.pistasDeError.forEach((p, i) => {
    exigir(`La pista de error ${i + 1}`, [
      ...nombresEnPlantilla(p.texto),
      ...(p.omiteFactor ? nombresEnPlantilla(p.omiteFactor) : []),
      ...(p.respuestaErronea ? nombresEnPlantilla(p.respuestaErronea) : []),
    ]);
  });
  for (const c of ficha.condiciones) {
    exigir(`La condición «${c}»`, (c.match(IDENTIFICADOR) ?? []).filter((x) => !FUNCIONES_PERMITIDAS.has(x)));
  }
  for (const v of ficha.variables) {
    if (v.calculada) {
      exigir(`La variable «${v.nombre}»`, (v.calculada.match(IDENTIFICADOR) ?? []).filter((x) => !FUNCIONES_PERMITIDAS.has(x)));
    }
  }
  return [...new Set(errores)];
}

function veredictoDelMotor(inst: Instancia, motor: Tema): { informe: InformeVerificacion; resumen: string } {
  const informe = verificarPasos({ motor, ejemplo: inst.problema, pasos: inst.pasos });
  const resumen = informe.errores[0] ?? informe.avisos[0] ?? "";
  return { informe, resumen };
}

/** Verifica una ficha completa. Función pura: no toca la base de datos. */
export function verificarFicha(entrada: { motor: Tema | null; ficha: Ficha }, opciones: { generados?: number } = {}): InformeFicha {
  const { motor, ficha } = entrada;
  const errores: string[] = [];
  const avisos: string[] = [];
  const pendientes: Pendiente[] = [];
  const casos: ResultadoCaso[] = [];
  const informe = (extra: Partial<InformeFicha> = {}): InformeFicha => ({
    valido: errores.length === 0,
    verificada: false,
    motor,
    errores,
    avisos,
    pendientes,
    operaciones: [],
    casos,
    generados: 0,
    revisadoEn: new Date().toISOString(),
    ...extra,
  });

  // 1) Estructura.
  errores.push(...estructura(ficha));

  // 2) Operaciones frente al motor.
  const catalogo = motor ? OPERACIONES_SOPORTADAS[motor] : {};
  const operaciones = ficha.operaciones.map((id) => ({
    id,
    soportada: id in catalogo,
    descripcion: catalogo[id] ?? null,
  }));
  if (!motor) {
    pendientes.push({
      codigo: "SIN_MOTOR",
      detalle: "El tema no tiene motor: nada de esta ficha se puede comprobar automáticamente.",
    });
  } else {
    for (const o of operaciones.filter((x) => !x.soportada)) {
      pendientes.push({
        codigo: "OPERACION_NO_SOPORTADA",
        detalle: `La operación «${o.id}» no la comprueba el motor de ${motor}: queda pendiente de validación automática.`,
      });
    }
    if (ficha.operaciones.length === 0) {
      avisos.push("No declaras ninguna operación: indica cuáles usa el método para saber si el motor puede comprobarlas.");
    }
  }

  // Si la estructura está rota no tiene sentido instanciar.
  if (errores.length > 0) return informe({ operaciones });

  // 3 y 4) Ejemplos y casos generados.
  const pendientesVistos = new Set<string>();
  const pendiente = (codigo: CodigoPendiente, detalle: string) => {
    const clave = `${codigo}|${detalle}`;
    if (!pendientesVistos.has(clave)) {
      pendientesVistos.add(clave);
      pendientes.push({ codigo, detalle });
    }
  };

  const comprobar = (origen: ResultadoCaso["origen"], problema: string, inst: Instancia | null, motivoNoEncaja?: string) => {
    if (!inst) {
      casos.push({ origen, problema, coincide: false, estado: "no_encaja", detalle: motivoNoEncaja ?? "No encaja con el patrón.", resultado: null, pasos: [] });
      if (origen === "ejemplo") errores.push(`El ejemplo «${problema}» no sirve: ${motivoNoEncaja}`);
      return;
    }
    if (!motor) {
      casos.push({
        origen,
        problema: inst.problema,
        coincide: true,
        estado: "pendiente",
        detalle: "Sin motor: no se puede comprobar.",
        resultado: inst.resultado,
        pasos: inst.pasos.map((p) => ({ escribe: p.escribe, estado: "no_verificable" })),
      });
      return;
    }
    const { informe: inf, resumen } = veredictoDelMotor(inst, motor);
    const pasos = inst.pasos.map((p, i) => ({ escribe: p.escribe, estado: inf.pasos[i]?.estado ?? "no_verificable" }));
    if (!inf.valido) {
      const donde = origen === "ejemplo" ? "el ejemplo" : "el caso generado";
      errores.push(`Con ${donde} «${inst.problema}»: ${resumen}`);
      casos.push({ origen, problema: inst.problema, coincide: true, estado: "incorrecto", detalle: resumen, resultado: inst.resultado, pasos });
    } else if (!inf.verificado) {
      casos.push({ origen, problema: inst.problema, coincide: true, estado: "pendiente", detalle: resumen || "El motor no pudo comprobar todos los pasos.", resultado: inst.resultado, pasos });
      pendiente(
        origen === "ejemplo" ? "EJEMPLO_NO_VERIFICABLE" : "CASO_NO_VERIFICABLE",
        `${origen === "ejemplo" ? "El ejemplo" : "El caso generado"} «${inst.problema}» no queda verificado por el motor${resumen ? `: ${resumen}` : "."}`,
      );
    } else {
      casos.push({ origen, problema: inst.problema, coincide: true, estado: "verificado", detalle: "Todos los pasos verificados por el motor.", resultado: inst.resultado, pasos });
    }
  };

  const vistos = new Set<string>();
  for (const e of ficha.ejemplos) {
    const r = resolverConFicha(ficha, e);
    if (r.ok) vistos.add(r.instancia.problema);
    comprobar("ejemplo", e, r.ok ? r.instancia : null, r.ok ? undefined : r.motivo);
  }
  const nGenerados = opciones.generados ?? 8;
  let generados = 0;
  for (const inst of generarCasos(ficha, nGenerados)) {
    if (vistos.has(inst.problema)) continue;
    generados++;
    comprobar("generado", inst.problema, inst);
  }
  if (nGenerados > 0 && generados === 0) {
    avisos.push("El servidor no pudo generar casos con el patrón y las condiciones: revisa que se puedan cumplir.");
  }

  // 5) Las pistas de error: que se puedan escribir y entender.
  const primero = casos.find((c) => c.coincide && c.resultado);
  if (primero) {
    const apl = aplicarPatron(ficha, primero.problema);
    if (apl.coincide) {
      for (const [i, p] of ficha.pistasDeError.entries()) {
        try {
          rellenar(p.texto, apl.variables);
          if (p.omiteFactor) {
            const f = rellenar(p.omiteFactor, apl.variables);
            if (!analizar(f)) throw new Error(`el factor «${f}» no se entiende`);
          }
          if (p.respuestaErronea) {
            const w = rellenar(p.respuestaErronea, apl.variables);
            if (!analizar(w)) throw new Error(`la respuesta errónea «${w}» no se entiende`);
            if (equivalentes(w, primero.resultado ?? "") === true) throw new Error("la respuesta errónea es en realidad la correcta");
          }
        } catch (e) {
          errores.push(`La pista de error ${i + 1} no se puede escribir: ${e instanceof Error ? e.message : "error"}.`);
        }
      }
    }
  }

  const hayEjemploVerificado = casos.some((c) => c.origen === "ejemplo" && c.estado === "verificado");
  const verificada = errores.length === 0 && pendientes.length === 0 && hayEjemploVerificado;
  return informe({ operaciones, generados, verificada });
}

// ── Comprobar la respuesta de un alumno con la ficha ─────────────────────────

export interface RevisionDeRespuesta {
  /** ¿La ficha se aplica a este problema? */
  aplica: boolean;
  motivo?: string;
  /** La respuesta correcta según la ficha (sólo la ve quien la pide con permiso). */
  esperada?: string;
  /** `null` si el motor no puede decidir. */
  correcta: boolean | null;
  /** Qué pista darle. `error` = detectó un fallo concreto; `general` = la siguiente de la lista. */
  pista: { tipo: "error" | "general"; texto: string; omiteFactor?: string } | null;
}

/**
 * Compara lo que respondió el alumno con lo que da la ficha y, si falla, elige la
 * pista: primero la de un error concreto que reconozca (p. ej. «omitió el factor
 * de la derivada interior») y, si no, la siguiente pista general.
 *
 * El criterio de «omitió el factor F» es matemático, no textual: (respuesta) × F
 * equivale a la respuesta correcta.
 */
export function revisarRespuesta(ficha: Ficha, problema: string, respuesta: string, intentosPrevios = 0): RevisionDeRespuesta {
  const r = resolverConFicha(ficha, problema);
  if (!r.ok) return { aplica: false, motivo: r.motivo, correcta: null, pista: null };
  const esperada = r.instancia.resultado;
  const dada = respuesta.trim();
  if (!dada) return { aplica: true, esperada, correcta: false, pista: null };

  const igual = equivalentes(dada, esperada);
  if (igual === true) return { aplica: true, esperada, correcta: true, pista: null };

  if (igual === false) {
    for (const p of ficha.pistasDeError) {
      if (p.respuestaErronea) {
        try {
          const mala = rellenar(p.respuestaErronea, r.instancia.variables);
          if (analizar(mala) && equivalentes(dada, mala) === true) {
            return { aplica: true, esperada, correcta: false, pista: { tipo: "error", texto: rellenar(p.texto, r.instancia.variables) } };
          }
        } catch {
          // Una pista mal escrita no puede tumbar la corrección.
        }
      }
      if (!p.omiteFactor) continue;
      try {
        const factor = rellenar(p.omiteFactor, r.instancia.variables);
        const f = analizar(factor) ? factor : null;
        if (f && equivalentes(`(${dada})*(${f})`, esperada) === true) {
          return { aplica: true, esperada, correcta: false, pista: { tipo: "error", texto: rellenar(p.texto, r.instancia.variables), omiteFactor: f } };
        }
      } catch {
        // Una pista mal escrita no puede tumbar la corrección.
      }
    }
    const general = ficha.pistas[Math.min(intentosPrevios, ficha.pistas.length - 1)];
    return {
      aplica: true,
      esperada,
      correcta: false,
      pista: general ? { tipo: "general", texto: rellenar(general, r.instancia.variables) } : null,
    };
  }
  return { aplica: true, esperada, correcta: null, pista: null };
}

export { instanciar };
