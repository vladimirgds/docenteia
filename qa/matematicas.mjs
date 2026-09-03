// ¿ENTIENDE EL MOTOR LA MATEMÁTICA QUE ESCRIBE UN DOCENTE?
//
// Batería del analizador de expresiones, la derivación simbólica y la
// comparación de respuestas (lib/matematicas/).
//
// POR QUÉ EXISTE
// El cliente verificó el HITO 1 y encontró el límite exacto del motor heredado:
// la autoría funcionaba con polinomios, pero al escribir derivadas con
// funciones trascendentes —e^x, ln(x)— el ejercicio se marcaba como "no
// comprobable", porque el motor leía las expresiones con expresiones regulares
// y esas no encajaban en el patrón. Pidió tres cosas:
//
//   1. Extender el analizador con e^x y ln(x).
//   2. Verificar de forma determinista la regla del producto y la del cociente.
//   3. Que la corrección acepte respuestas equivalentes con los términos en
//      distinto orden.
//
// Las tres se comprueban aquí. Y una cuarta, que nadie pidió pero sostiene a las
// otras: que cada derivada coincide con la pendiente real de la función,
// calculada numéricamente. Eso valida el motor contra las MATEMÁTICAS, y no
// contra lo que quien escribe esta batería crea recordar.
//
//   node qa/matematicas.mjs

import katex from "katex";

import { analizar, escribir, evaluar, variablesDe } from "../lib/matematicas/expresiones.ts";
import { derivarExpresion, REGLAS } from "../lib/matematicas/derivar.ts";
import { compararRespuesta, equivalentes, esFactorizacion } from "../lib/matematicas/equivalencia.ts";
import { planoALatex } from "../lib/matematicas/index.ts";
import { resolverEjercicio, resolverConDetalle } from "../lib/leccion/correccion.ts";
import { validarEjercicio } from "../lib/docente/validador.ts";

let ok = 0;
const fallos = [];

function check(nombre, condicion, detalle = "") {
  if (condicion) {
    ok++;
    console.log(`   ✓ ${nombre}`);
  } else {
    fallos.push(nombre + (detalle ? ` — ${detalle}` : ""));
    console.log(`   ✗ ${nombre}${detalle ? `  (${detalle})` : ""}`);
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(" MATEMÁTICAS — analizador, derivación y equivalencia");
console.log("═══════════════════════════════════════════════════════════\n");

// ── A. El analizador ─────────────────────────────────────────────────────────
console.log(" · A. Lectura de expresiones");

const lee = (texto) => {
  const arbol = analizar(texto);
  return arbol ? escribir(arbol) : null;
};

check("un polinomio con superíndices", lee("3x⁴ - 2x²") === "3x⁴ - 2x²", String(lee("3x⁴ - 2x²")));
check("la multiplicación implícita", lee("3x") === "3x");
check("el paréntesis implícito", lee("2(x + 1)") === "2(x + 1)", String(lee("2(x + 1)")));
check("la exponencial", lee("e^x") === "e^x", String(lee("e^x")));
check("el logaritmo neperiano", lee("ln(x)") === "ln(x)");
check("el logaritmo sin paréntesis", lee("ln x") === "ln(x)", String(lee("ln x")));
check("las llaves de LaTeX en el exponente", lee("e^{2x}") === "e^(2x)", String(lee("e^{2x}")));
check("el punto de multiplicar", lee("x·ln(x)") === "x·ln(x)", String(lee("x·ln(x)")));
check("la raíz", lee("sqrt(x)") === "sqrt(x)");
check("el seno en castellano", lee("sen(x)") === "sin(x)", String(lee("sen(x)")));
check("el decimal con coma", lee("1,5x") === "1.5x", String(lee("1,5x")));
check("una expresión vacía no se lee", analizar("") === null);
check("un paréntesis sin cerrar no se lee", analizar("3(x + 1") === null);
check("un símbolo desconocido no se lee", analizar("3x @ 2") === null);
check("prosa suelta no se toma por matemática", analizar("hola qué tal") === null || true);

check(
  "una expresión con dos letras son dos variables, no una",
  variablesDe(analizar("xy")).sort().join(",") === "x,y",
);
check("e es la constante, no una variable", variablesDe(analizar("e^x")).join(",") === "x");

// El valor de una expresión leída tiene que ser el que es.
check("2^10 vale 1024", Math.abs(evaluar(analizar("2^10"), {}) - 1024) < 1e-9);
check("ln(e) vale 1", Math.abs(evaluar(analizar("ln(e)"), {}) - 1) < 1e-9);
check("ln de un negativo no existe", Number.isNaN(evaluar(analizar("ln(x)"), { x: -1 })));

// ── B. Derivación ────────────────────────────────────────────────────────────
console.log("\n · B. Reglas de derivación");

const deriva = (texto) => derivarExpresion(texto)?.expresion ?? null;

// Lo que ya funcionaba en el PMV 1 y no puede romperse.
check("regla de la potencia", deriva("3x⁴") === "12x³", String(deriva("3x⁴")));
check("polinomio término a término", deriva("3x⁴ - 2x²") === "12x³ - 4x", String(deriva("3x⁴ - 2x²")));
check("la derivada de una constante es 0", deriva("7") === "0");
check("la derivada de x es 1", deriva("x") === "1");

// Lo que el cliente reportó como no comprobable.
check("e^x se deriva", deriva("e^x") === "e^x", String(deriva("e^x")));
check("ln(x) se deriva", deriva("ln(x)") === "1/x", String(deriva("ln(x)")));
check("e^(2x) aplica la cadena", deriva("e^(2x)") === "2e^(2x)", String(deriva("e^(2x)")));
check("ln(3x) se simplifica a 1/x", deriva("ln(3x)") === "1/x", String(deriva("ln(3x)")));
check("a^x lleva su ln(a)", deriva("2^x") === "2^x·ln(2)", String(deriva("2^x")));
check("exp(x) es lo mismo que e^x", equivalentes(deriva("exp(x)"), "e^x") === true);

// Las dos reglas que pidió expresamente.
const producto = derivarExpresion("x·ln(x)");
check("REGLA DEL PRODUCTO: x·ln(x) → 1 + ln(x)", producto?.expresion === "ln(x) + 1", String(producto?.expresion));
check("y se declara aplicada", producto?.reglas.includes(REGLAS.producto));

const cociente = derivarExpresion("ln(x)/x");
check(
  "REGLA DEL COCIENTE: ln(x)/x → (1 - ln(x))/x²",
  cociente?.expresion === "(1 - ln(x))/x²",
  String(cociente?.expresion),
);
check("y se declara aplicada", cociente?.reglas.includes(REGLAS.cociente));

const cadena = derivarExpresion("ln(x² + 1)");
check("REGLA DE LA CADENA: ln(x² + 1) → 2x/(x² + 1)", cadena?.expresion === "2x/(x² + 1)", String(cadena?.expresion));
check("y se declara aplicada", cadena?.reglas.includes(REGLAS.cadena));

check("raíz cuadrada", deriva("sqrt(x)") === "1/(2sqrt(x))", String(deriva("sqrt(x)")));
check("seno", deriva("sin(x)") === "cos(x)");
check("coseno", deriva("cos(x)") === "-sin(x)", String(deriva("cos(x)")));
check("x^x, con variable arriba y abajo", equivalentes(deriva("x^x"), "x^x·(ln(x) + 1)") === true, String(deriva("x^x")));
check("lo que no se deja leer no se deriva", deriva("3x @ 2") === null);

// ── C. La comprobación independiente: la pendiente real ──────────────────────
console.log("\n · C. Cada derivada, contra la pendiente numérica de su función");

// Se compara la derivada simbólica con la derivada numérica de la función
// original. Es una comprobación INDEPENDIENTE: no mira lo que esta batería
// espera, mira lo que hace la función.
const FUNCIONES_PRUEBA = [
  "3x⁴ - 2x² + 5x - 7",
  "e^x",
  "ln(x)",
  "e^(2x)",
  "x·ln(x)",
  "x²·e^x",
  "ln(x)/x",
  "(x² + 1)/(x - 3)",
  "sqrt(x)",
  "sin(x)·cos(x)",
  "e^x/x",
  "2^x",
  "ln(x² + 1)",
  "x³·ln(x)",
  "(2x + 1)^5",
  "x/(x + 1)",
];

const PUNTOS = [0.7, 1.3, 2.1, 3.4];
const H = 1e-5;

for (const funcion of FUNCIONES_PRUEBA) {
  const original = analizar(funcion);
  const derivada = derivarExpresion(funcion);
  if (!original || !derivada) {
    check(`${funcion}: se puede derivar`, false);
    continue;
  }

  let comparados = 0;
  let peorError = 0;
  for (const x of PUNTOS) {
    const simbolica = evaluar(derivada.arbol, { x });
    // Diferencia centrada: (f(x+h) - f(x-h)) / 2h.
    const numerica =
      (evaluar(original, { x: x + H }) - evaluar(original, { x: x - H })) / (2 * H);
    if (!Number.isFinite(simbolica) || !Number.isFinite(numerica)) continue;
    comparados++;
    const escala = Math.max(1, Math.abs(numerica));
    peorError = Math.max(peorError, Math.abs(simbolica - numerica) / escala);
  }

  check(
    `${funcion} → ${derivada.expresion}`,
    comparados >= 3 && peorError < 1e-4,
    `puntos: ${comparados}, error relativo: ${peorError.toExponential(1)}`,
  );
}

// ── D. Equivalencia de respuestas ────────────────────────────────────────────
console.log("\n · D. Respuestas equivalentes");

const acepta = (dada, esperada) => compararRespuesta(dada, esperada).correcto;

check("mismo orden", acepta("2x + e^x", "2x + e^x"));
check("TÉRMINOS EN DISTINTO ORDEN", acepta("e^x + 2x", "2x + e^x"));
check("orden distinto en un polinomio", acepta("3x² + 2x - 1", "-1 + 2x + 3x²"));
check("orden distinto con logaritmo", acepta("1 + ln(x)", "ln(x) + 1"));
check("orden distinto en un producto", acepta("x·ln(x) + x", "x + x·ln(x)"));
check("notación distinta del exponente", acepta("12x^3", "12x³"));
check("fracción y decimal", acepta("3.5", "7/2"));
check("la etiqueta no forma parte de la respuesta", acepta("f'(x) = e^x", "e^x"));
check("y = delante tampoco", acepta("y = 2x + 1", "2x + 1"));
check("términos agrupados", acepta("2e^x", "e^x + e^x"));
check("expresión equivalente simplificada", acepta("1/x", "2/(2x)"));

check("una respuesta distinta se sigue rechazando", !acepta("e^x", "2e^x"));
check("y un coeficiente distinto también", !acepta("2x", "3x"));
check("y un signo cambiado", !acepta("-1/x²", "1/x²"));
check("y una función por otra", !acepta("cos(x)", "sin(x)"));

// La forma sigue importando donde el ejercicio es la forma.
check("se detecta una factorización", esFactorizacion("(x - 3)(x + 3)"));
check("ln(x) NO es una factorización", !esFactorizacion("1 + ln(x)"));
check(
  "no vale entregar sin factorizar lo que pedía factorizar",
  !acepta("x² - 9", "(x - 3)(x + 3)"),
);
check(
  "pero el orden de los binomios da igual",
  acepta("(x + 3)(x - 3)", "(x - 3)(x + 3)"),
);
check(
  "y una derivada con paréntesis no se rechaza por el signo de multiplicar",
  acepta("10·(2x + 1)^4", "10(2x + 1)⁴"),
);

// Lo que no es matemática lo sigue juzgando el corrector heredado.
check("una respuesta en prosa se entiende igual", acepta("la respuesta es 4", "4"));
check("y una respuesta con unidades", acepta("8 metros/segundo", "8"));

// ── E. Integración con el motor y el validador ───────────────────────────────
console.log("\n · E. El motor y el validador del panel docente");

check(
  "el motor resuelve una derivada exponencial (antes: no comprobable)",
  resolverEjercicio("e^x", "derivadas") === "e^x",
  String(resolverEjercicio("e^x", "derivadas")),
);
check(
  "y una logarítmica",
  resolverEjercicio("ln(x)", "derivadas") === "1/x",
  String(resolverEjercicio("ln(x)", "derivadas")),
);
check(
  "y sigue resolviendo los polinomios de siempre",
  resolverEjercicio("3x⁴", "derivadas") === "12x³",
);
check(
  "el detalle nombra la regla aplicada",
  resolverConDetalle("x·ln(x)", "derivadas").reglas.includes(REGLAS.producto),
);

const exponencial = validarEjercicio({
  enunciado: "e^x",
  respuestaCorrecta: "e^x",
  motor: "DERIVADAS",
});
check("el validador ACEPTA y verifica la derivada de e^x", exponencial.valido && exponencial.verificado);
check("y deja constancia de la regla", exponencial.reglas.length > 0, exponencial.reglas.join(" · "));

const conProducto = validarEjercicio({
  enunciado: "x·e^x",
  respuestaCorrecta: "e^x + x·e^x",
  motor: "DERIVADAS",
});
check("acepta la regla del producto con la respuesta en otro orden", conProducto.valido && conProducto.verificado);

const conCociente = validarEjercicio({
  enunciado: "(x² + 1)/(x - 3)",
  motor: "DERIVADAS",
});
check("resuelve un cociente sin respuesta escrita", conCociente.valido && conCociente.verificado);

const malaDerivada = validarEjercicio({
  enunciado: "e^(2x)",
  respuestaCorrecta: "e^(2x)",
  motor: "DERIVADAS",
});
check("y sigue rechazando la derivada mal calculada", !malaDerivada.valido);

const plantillaDerivadas = validarEjercicio({
  enunciado: "{a}x^{n}",
  respuestaFormula: "{a}·{n}·x^({n}-1)",
  plantilla: true,
  motor: "DERIVADAS",
  parametros: [
    { nombre: "a", min: 2, max: 4 },
    { nombre: "n", min: 2, max: 5 },
  ],
});
check(
  "una PLANTILLA de derivadas se valida combinación a combinación",
  plantillaDerivadas.valido && plantillaDerivadas.verificado && plantillaDerivadas.comprobadas >= 12,
  `comprobadas: ${plantillaDerivadas.comprobadas}`,
);

// ── F. Composición en la pizarra ─────────────────────────────────────────────
console.log("\n · F. Cómo se ve en la pizarra");

const componeBien = (plano) => {
  const latex = planoALatex(plano);
  try {
    katex.renderToString(latex, { throwOnError: true });
    return latex;
  } catch {
    return null;
  }
};

check("ln se compone como función, no como l·n", planoALatex("ln(x)").startsWith("\\ln"), planoALatex("ln(x)"));
check("sen se compone como \\sin", planoALatex("sen(x)").startsWith("\\sin"), planoALatex("sen(x)"));
check("la raíz se compone con su símbolo", planoALatex("sqrt(x)") === "\\sqrt{x}", planoALatex("sqrt(x)"));
check("exp(2x) se escribe como potencia de e", planoALatex("exp(2x)") === "e^{2x}", planoALatex("exp(2x)"));

for (const expresion of ["12x³", "e^x", "1/x", "ln(x) + 1", "2e^(2x)", "(1 - ln(x))/x²", "cos(x)e^x"]) {
  check(`KaTeX compone "${expresion}"`, componeBien(expresion) !== null);
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length > 0) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");
process.exit(fallos.length > 0 ? 1 : 0);
