import type { Tema } from "@prisma/client";
import katex from "katex";

import { analizar, evaluar, variablesDe } from "../matematicas/expresiones.ts";
import { compararRespuesta, equivalentes } from "../matematicas/equivalencia.ts";
import { OPCIONES_KATEX, latexConTerminos } from "../pizarra/latex-terminos.ts";
import { validarEjercicio } from "./validador.ts";
import type { Paso } from "./procedimientos.ts";

/**
 * VERIFICADOR DE PASOS (PMV 3 · HITO 2).
 *
 * «El servidor debe ser capaz de verificar los pasos matemáticos que el motor de
 * la plataforma soporta.» Esto es eso: dado un ejemplo y los pasos con que un
 * docente (o la IA) lo resuelve, comprueba CADA paso contra el motor
 * determinista y dice, paso por paso, si está bien, si está mal o si el motor no
 * sabe juzgarlo.
 *
 * Qué significa «verificar un paso», según el motor:
 *
 *   · ARITMÉTICA / FRACCIONES — el paso es otra forma de escribir el MISMO
 *     valor que el ejemplo (`1/2 + 1/3` → `3/6 + 2/6` → `5/6`).
 *   · ECUACIONES LINEALES — el paso es una ecuación con la MISMA solución
 *     (`2x + 5 = 15` → `2x = 10` → `x = 5`).
 *   · DERIVADAS — el paso es una expresión equivalente a la derivada del ejemplo
 *     (`5(3x+1)^4 · 3` → `15(3x+1)^4`). Las piezas intermedias (`u = 3x + 1`) se
 *     marcan «definición» y no se comparan.
 *   · FACTORIZACIÓN — el paso es una forma del MISMO polinomio, y el resultado
 *     es la factorización que calcula el motor.
 *
 * LA REGLA DE ORO DE ESTE MÓDULO: nunca se da por bueno un resultado porque lo
 * diga UNA sola fuente. Antes de comparar los pasos se contrasta el propio
 * ejemplo con un SEGUNDO cálculo independiente (evaluación numérica directa,
 * raíz de la ecuación por muestreo, derivada numérica por diferencias). Si el
 * motor y esa segunda fuente discrepan —y se ha visto con fracciones anidadas:
 * `3/4 * (1/2 + 2/5)` da 9/10 en el motor y vale 27/40— el ejemplo NO se
 * verifica, en lugar de verificar contra una respuesta equivocada.
 */

export type EstadoPaso = "verificado" | "incorrecto" | "no_verificable" | "definicion";

export interface ResultadoPaso {
  indice: number;
  estado: EstadoPaso;
  detalle: string;
}

export interface InformeVerificacion {
  /** ¿Se puede guardar? Falso si algún paso está mal o el ejemplo no se entiende. */
  valido: boolean;
  /** ¿Todo lo que el servidor sabe comprobar está comprobado y es correcto? */
  verificado: boolean;
  motor: Tema | null;
  /** El resultado del ejemplo según el motor, contrastado con un segundo cálculo. */
  respuestaEjemplo: string | null;
  pasos: ResultadoPaso[];
  /** Reglas que el motor aplicó al resolver el ejemplo (derivadas). */
  reglasMotor: string[];
  errores: string[];
  avisos: string[];
  revisadoEn: string;
}

const TOLERANCIA = 1e-6;
const PUNTOS = [0.7, 1.3, 2.1, 3.4];

const cerca = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOLERANCIA * Math.max(1, Math.abs(a), Math.abs(b));

/** Valor de una expresión sin variables, o `null` si no se puede evaluar. */
function valorConstante(texto: string): number | null {
  const n = analizar(texto);
  if (!n || variablesDe(n).length > 0) return null;
  const v = evaluar(n, {});
  return Number.isFinite(v) ? v : null;
}

/** Raíz de una ecuación lineal en `x` ("lhs = rhs"), o `null` si no es lineal/legible. */
export function raizLineal(ecuacion: string): number | null {
  const partes = ecuacion.split("=");
  if (partes.length !== 2) return null;
  const izq = analizar(partes[0]);
  const der = analizar(partes[1]);
  if (!izq || !der) return null;
  const vars = [...new Set([...variablesDe(izq), ...variablesDe(der)])];
  if (vars.length !== 1) return null;
  const v = vars[0];
  const f = (x: number) => evaluar(izq, { [v]: x }) - evaluar(der, { [v]: x });
  const f0 = f(0);
  const f1 = f(1);
  const f2 = f(2);
  if (![f0, f1, f2].every(Number.isFinite)) return null;
  // Lineal: tres puntos alineados. Si no, no se afirma nada.
  if (!cerca(f2 - f1, f1 - f0)) return null;
  const pendiente = f1 - f0;
  if (Math.abs(pendiente) < 1e-12) return null;
  return -f0 / pendiente;
}

/** Derivada numérica (diferencias centrales) de `texto` en `x`. */
function derivadaNumerica(texto: string, x: number): number | null {
  const n = analizar(texto);
  if (!n) return null;
  const vars = variablesDe(n);
  if (vars.length > 1) return null;
  const v = vars[0] ?? "x";
  const h = 1e-5;
  const a = evaluar(n, { [v]: x + h });
  const b = evaluar(n, { [v]: x - h });
  const d = (a - b) / (2 * h);
  return Number.isFinite(d) ? d : null;
}

/** ¿La derivada simbólica `der` coincide con la numérica de `fun`? Segunda fuente. */
function derivadaConcuerda(fun: string, der: string): boolean | null {
  const nd = analizar(der);
  if (!nd) return null;
  const vars = [...new Set([...variablesDe(nd), ...(analizar(fun) ? variablesDe(analizar(fun)!) : [])])];
  const v = vars[0] ?? "x";
  let comparados = 0;
  for (const x of PUNTOS) {
    const num = derivadaNumerica(fun, x);
    const sim = evaluar(nd, { [v]: x });
    if (num === null || !Number.isFinite(sim)) continue;
    comparados++;
    const escala = Math.max(1, Math.abs(num), Math.abs(sim));
    if (Math.abs(num - sim) > 1e-4 * escala) return false;
  }
  return comparados >= 2 ? true : null;
}

/**
 * ¿Se puede MOSTRAR el paso tal como lo verá el alumno —con sus términos
 * resaltados—? Devuelve el motivo si no, o `null`.
 */
function renderiza(plano: string, terminos: readonly { texto: string }[] = []): string | null {
  const compuesto = latexConTerminos(plano, terminos);
  if (compuesto.error) return compuesto.error;
  try {
    katex.renderToString(compuesto.latex, { ...OPCIONES_KATEX, throwOnError: true });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 120) : "no se puede mostrar";
  }
}

interface Contexto {
  motor: Tema;
  ejemplo: string;
  respuesta: string;
  raiz: number | null;
  derivada: string | null;
}

function verificarPaso(paso: Paso, ctx: Contexto): { estado: EstadoPaso; detalle: string } {
  const e = paso.escribe;

  if (paso.tipo === "definicion") {
    return { estado: "definicion", detalle: "Es una definición: introduce una pieza y no se compara." };
  }

  switch (ctx.motor) {
    case "ARITMETICA":
    case "FRACCIONES": {
      const partes = e.split("=").map((p) => p.trim()).filter(Boolean);
      if (partes.length === 0) return { estado: "no_verificable", detalle: "Paso vacío." };
      for (const p of partes) {
        const eq = equivalentes(p, ctx.ejemplo);
        if (eq === null) {
          return { estado: "no_verificable", detalle: `El motor no sabe leer «${p}».` };
        }
        if (eq === false) {
          const v = valorConstante(p);
          const esperado = valorConstante(ctx.ejemplo);
          return {
            estado: "incorrecto",
            detalle:
              v !== null && esperado !== null
                ? `«${p}» vale ${redondea(v)} y el ejemplo vale ${redondea(esperado)}: este paso cambia el valor.`
                : `«${p}» no equivale al ejemplo.`,
          };
        }
      }
      return { estado: "verificado", detalle: "Mismo valor que el ejemplo." };
    }

    case "ECUACIONES_LINEALES": {
      if (ctx.raiz === null) return { estado: "no_verificable", detalle: "No hay solución de referencia." };
      const r = raizLineal(e);
      if (r === null) return { estado: "no_verificable", detalle: "No es una ecuación lineal que el motor sepa leer." };
      return cerca(r, ctx.raiz)
        ? { estado: "verificado", detalle: `Misma solución (x = ${redondea(ctx.raiz)}).` }
        : { estado: "incorrecto", detalle: `Esta ecuación tiene solución x = ${redondea(r)}, y la del ejemplo es x = ${redondea(ctx.raiz)}: el paso cambió la solución.` };
    }

    case "DERIVADAS": {
      if (!ctx.derivada) return { estado: "no_verificable", detalle: "No hay derivada de referencia." };
      const eq = equivalentes(e, ctx.derivada);
      if (eq === null) return { estado: "no_verificable", detalle: `El motor no sabe leer «${e}».` };
      return eq
        ? { estado: "verificado", detalle: "Equivale a la derivada del ejemplo." }
        : {
            estado: "incorrecto",
            detalle:
              "No equivale a la derivada del ejemplo. Si es una pieza intermedia (por ejemplo la derivada de la función interior), márcala como «definición».",
          };
    }

    case "FACTORIZACION": {
      const eq = equivalentes(e, ctx.ejemplo);
      if (eq === null) return { estado: "no_verificable", detalle: `El motor no sabe leer «${e}».` };
      return eq
        ? { estado: "verificado", detalle: "Es el mismo polinomio que el ejemplo." }
        : { estado: "incorrecto", detalle: "No es el mismo polinomio que el ejemplo." };
    }
  }
}

function redondea(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

/** Lo que el servidor sabe verificar, para enseñárselo al docente en el editor. */
export const SOPORTE_VERIFICACION: Record<Tema, { motor: string; comprueba: string; ejemplos: string[] }> = {
  ARITMETICA: {
    motor: "Aritmética",
    comprueba: "Cada paso vale lo mismo que el ejemplo y el último es el resultado.",
    ejemplos: ["27 + 15"],
  },
  FRACCIONES: {
    motor: "Fracciones",
    comprueba: "Cada paso vale lo mismo que el ejemplo; el último es la fracción simplificada.",
    ejemplos: ["1/2 + 1/3"],
  },
  ECUACIONES_LINEALES: {
    motor: "Ecuaciones lineales",
    comprueba: "Cada paso es una ecuación con la misma solución; el último despeja x.",
    ejemplos: ["2x + 5 = 15"],
  },
  DERIVADAS: {
    motor: "Derivadas",
    comprueba:
      "Cada paso de cálculo equivale a la derivada del ejemplo. Reglas que el motor aplica: potencia, suma, producto, cociente, cadena, exponencial, logaritmo, raíz y trigonométricas.",
    ejemplos: ["(3x+1)^5", "sin(2x)"],
  },
  FACTORIZACION: {
    motor: "Factorización",
    comprueba: "Cada paso es el mismo polinomio; el último es la forma factorizada.",
    ejemplos: ["x² - 9"],
  },
};

const normaliza = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();

export function verificarPasos(entrada: {
  motor: Tema | null;
  ejemplo: string;
  pasos: readonly Paso[];
  /** Resultado declarado por el autor, para temas sin motor. */
  respuestaDeclarada?: string | null;
}): InformeVerificacion {
  const errores: string[] = [];
  const avisos: string[] = [];
  const pasosOut: ResultadoPaso[] = [];
  const ejemplo = entrada.ejemplo.trim();
  const { motor } = entrada;
  const informe = (extra: Partial<InformeVerificacion>): InformeVerificacion => ({
    valido: errores.length === 0,
    verificado: false,
    motor,
    respuestaEjemplo: null,
    pasos: pasosOut,
    reglasMotor: [],
    errores,
    avisos,
    revisadoEn: new Date().toISOString(),
    ...extra,
  });

  // Que cada paso se pueda MOSTRAR es independiente del motor.
  entrada.pasos.forEach((p, i) => {
    // Primero los términos: su mensaje es más preciso que el de KaTeX.
    for (const t of p.terminos ?? []) {
      if (!p.escribe.includes(t.texto)) {
        errores.push(`Paso ${i + 1}: el término «${t.texto}» no aparece en lo que se escribe en el paso.`);
      }
    }
    if (!errores.some((e) => e.startsWith(`Paso ${i + 1}:`))) {
      const fallo = renderiza(p.escribe, p.terminos ?? []);
      if (fallo) errores.push(`Paso ${i + 1}: la pizarra no puede mostrar «${p.escribe}» (${fallo}).`);
    }
  });
  if (entrada.pasos.length > 0 && entrada.pasos[entrada.pasos.length - 1].tipo !== "resultado") {
    avisos.push("El último paso debería ser de tipo «resultado»: es el que se contrasta con el motor.");
  }

  // Sin motor no hay nada determinista con lo que comprobar.
  if (!motor) {
    entrada.pasos.forEach((p, i) =>
      pasosOut.push({
        indice: i,
        estado: p.tipo === "definicion" ? "definicion" : "no_verificable",
        detalle: "El tema no tiene motor: este paso no se puede comprobar automáticamente.",
      }),
    );
    avisos.push("El tema no tiene motor: el procedimiento se guarda SIN verificar y no se podrá publicar.");
    return informe({ respuestaEjemplo: entrada.respuestaDeclarada ?? null });
  }

  // 1) El ejemplo, resuelto por el motor.
  const base = validarEjercicio({ enunciado: ejemplo, respuestaCorrecta: null, motor });
  if (!base.valido || !base.respuestaCorrecta) {
    errores.push(`El motor no puede resolver el ejemplo «${ejemplo}»: ${base.errores[0] ?? base.avisos[0] ?? "no lo entiende"}.`);
    entrada.pasos.forEach((p, i) =>
      pasosOut.push({ indice: i, estado: p.tipo === "definicion" ? "definicion" : "no_verificable", detalle: "Sin ejemplo resoluble." }),
    );
    return informe({ valido: false });
  }
  const respuesta = base.respuestaCorrecta;
  const reglasMotor = base.reglas ?? [];

  // 2) SEGUNDA FUENTE, independiente del motor, sobre el propio ejemplo.
  let raiz: number | null = null;
  let derivada: string | null = null;
  let concuerda: boolean | null = null;

  if (motor === "ARITMETICA" || motor === "FRACCIONES") {
    const v = valorConstante(ejemplo);
    concuerda = v === null ? null : equivalentes(respuesta, String(v));
  } else if (motor === "ECUACIONES_LINEALES") {
    raiz = raizLineal(ejemplo);
    concuerda = raiz === null ? null : equivalentes(respuesta, String(raiz));
  } else if (motor === "DERIVADAS") {
    derivada = respuesta;
    concuerda = derivadaConcuerda(ejemplo, respuesta);
  } else {
    concuerda = equivalentes(respuesta, ejemplo);
  }

  if (concuerda === false) {
    errores.push(
      `El motor calcula «${respuesta}» para «${ejemplo}», pero una comprobación independiente no lo confirma. No se da por bueno: reescribe el ejemplo en una forma más simple.`,
    );
    entrada.pasos.forEach((p, i) =>
      pasosOut.push({ indice: i, estado: p.tipo === "definicion" ? "definicion" : "no_verificable", detalle: "El resultado de referencia no es fiable." }),
    );
    return informe({ valido: false, respuestaEjemplo: null, reglasMotor });
  }
  if (concuerda === null) {
    avisos.push("No se pudo contrastar el resultado del ejemplo con una segunda fuente: no se verificará.");
  }

  const ctx: Contexto = { motor, ejemplo, respuesta, raiz, derivada };

  // 3) Cada paso.
  entrada.pasos.forEach((p, i) => {
    const r = verificarPaso(p, ctx);
    pasosOut.push({ indice: i, estado: r.estado, detalle: r.detalle });
    if (r.estado === "incorrecto") errores.push(`Paso ${i + 1}: ${r.detalle}`);
  });

  // 4) El resultado final frente al del motor.
  const ultimo = entrada.pasos[entrada.pasos.length - 1];
  let finalOk = false;
  if (ultimo && ultimo.tipo === "resultado") {
    // Un final escrito como cadena ("3/6 + 2/6 = 5/6") se juzga por su ÚLTIMA parte
    // en aritmética y fracciones: lo que cuenta es con qué se queda el alumno.
    const textoFinal =
      (motor === "ARITMETICA" || motor === "FRACCIONES") && ultimo.escribe.includes("=")
        ? ultimo.escribe.split("=").map((x) => x.trim()).filter(Boolean).pop() ?? ultimo.escribe
        : ultimo.escribe;
    const cmp = compararRespuesta(textoFinal, respuesta);
    finalOk = cmp.conocido ? cmp.correcto : false;
    if (!finalOk) {
      const prev = pasosOut[pasosOut.length - 1];
      if (prev.estado !== "incorrecto") {
        errores.push(`El resultado final «${ultimo.escribe}» no coincide con el del motor («${respuesta}»).`);
        prev.estado = "incorrecto";
        prev.detalle = `El resultado final no coincide con el del motor («${respuesta}»).`;
      }
    }
  } else {
    avisos.push("No hay un paso final de tipo «resultado»: no se puede contrastar con el motor.");
  }

  // 5) Reglas declaradas frente a las que aplicó el motor (derivadas).
  if (motor === "DERIVADAS" && reglasMotor.length > 0) {
    const aplicadas = reglasMotor.map(normaliza);
    entrada.pasos.forEach((p, i) => {
      if (p.regla && !aplicadas.some((r) => r.includes(normaliza(p.regla!)) || normaliza(p.regla!).includes(r))) {
        avisos.push(
          `Paso ${i + 1}: declaras «${p.regla}», pero el motor resolvió el ejemplo con: ${reglasMotor.join(", ")}.`,
        );
      }
    });
  }

  const comprobables = pasosOut.filter((p) => p.estado !== "definicion");
  const verificado =
    errores.length === 0 &&
    concuerda === true &&
    finalOk &&
    comprobables.length >= 1 &&
    comprobables.every((p) => p.estado === "verificado");

  if (errores.length === 0 && !verificado) {
    const pend = comprobables.filter((p) => p.estado === "no_verificable").length;
    if (pend > 0) avisos.push(`${pend} paso(s) no se pueden comprobar con el motor: el procedimiento no queda verificado.`);
  }

  return informe({ verificado, respuestaEjemplo: respuesta, reglasMotor });
}
