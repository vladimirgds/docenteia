// Validación del BANCO DE PREGUNTAS del diagnóstico inicial.
//
// POR QUÉ EXISTE
// El diagnóstico decide el nivel con el que un alumno empieza el curso. Si una
// de las cinco respuestas del banco estuviera mal, el sistema clasificaría mal
// a TODOS los estudiantes, y lo haría en silencio: no hay ningún síntoma
// visible, sólo alumnos colocados en el nivel equivocado.
//
// Por eso el banco no se da por bueno porque venga revisado a mano: se
// contrasta contra el MISMO motor determinista que califica las prácticas
// (src/preLight.js). Cuando el motor no cubre un caso, se dice explícitamente
// en lugar de darlo por verificado.
//
// No necesita servidor ni base de datos:  node qa/diagnostico.mjs

import { readFileSync } from "node:fs";

import katex from "katex";

import {
  computeAnswer,
  solveLinearFromText,
  solveFractionFromText,
  computeDerivative,
  computeFactorization,
} from "../src/preLight.js";
// Se importa la transformación REAL que usa la semilla, no una copia: validar
// una copia podría dar por bueno un banco que la semilla carga de otra manera.
import { MAX_PREGUNTAS_POR_TEMA, adaptarBanco, latexAPlano } from "../lib/diagnostico/banco.ts";
import { separarFormulas } from "../lib/matematicas/index.ts";

const RUTA = new URL("../prisma/seed-data/preguntas-diagnostico.json", import.meta.url);
const banco = JSON.parse(readFileSync(RUTA, "utf8"));

const TEMAS_VALIDOS = new Set([
  "aritmetica",
  "fracciones",
  "ecuaciones_lineales",
  "factorizacion",
  "derivadas",
]);

let ok = 0;
const fallos = [];
const sinVerificar = [];

function check(nombre, cond, detalle = "") {
  if (cond) {
    ok++;
    console.log(`   ✓ ${nombre}`);
  } else {
    fallos.push(nombre + (detalle ? ` — ${detalle}` : ""));
    console.log(`   ✗ ${nombre}${detalle ? `  (${detalle})` : ""}`);
  }
}

/** Normaliza para comparar: sin espacios, minúsculas, superíndices a "^n". */
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => "^" + [...m].map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)).join(""))
    .replace(/\s+/g, "")
    .replace(/[−–—]/g, "-");
}

/** Compara dos factorizaciones aceptando el orden de los factores. */
function mismaFactorizacion(a, b) {
  const factores = (s) => (norm(s).match(/\([^)]*\)/g) || []).sort().join("");
  return factores(a) === factores(b) && factores(a) !== "";
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(" BANCO DE PREGUNTAS DEL DIAGNÓSTICO — validación");
console.log("═══════════════════════════════════════════════════════════\n");

// ── 1. Integridad estructural ────────────────────────────────────────────────
console.log(" · Estructura del banco");
check("es un array", Array.isArray(banco), `tipo: ${typeof banco}`);
// MVP 2. El banco dejó de ser una lista única de cinco preguntas iguales para
// todo el mundo —con una de derivadas que le salía a un alumno de 3.º de
// secundaria— y pasó a estar partido POR NIVEL. Lo que se exige ahora:
//
//   · cinco preguntas en cada nivel, para que la regla de corte del cliente
//     (0-2 básico · 3-4 intermedio · 5 avanzado) siga contando sobre cinco;
//   · variedad de temas dentro de cada nivel, que es lo que la regla anterior
//     ("un tema por pregunta") protegía cuando el banco era uno solo.
const NIVELES_BANCO = ["BASICO", "INTERMEDIO", "AVANZADO"];
const porNivel = new Map(NIVELES_BANCO.map((n) => [n, banco.filter((p) => p.nivel === n)]));

check("hay preguntas en los tres niveles", NIVELES_BANCO.every((n) => porNivel.get(n).length > 0));
for (const nivel of NIVELES_BANCO) {
  const delNivel = porNivel.get(nivel);
  // Cinco es el mínimo, no el tope: con la taxonomía curricular un mismo nivel
  // de dificultad tiene preguntas de etapas distintas —lo avanzado de
  // secundaria no es lo avanzado de la universidad— y hacen falta cinco para
  // CADA alumno que llegue a ese nivel, no cinco en total.
  check(
    `${nivel}: al menos cinco preguntas`,
    delNivel.length >= 5,
    `tiene ${delNivel.length}`,
  );
  const temasNivel = delNivel.map((p) => p.tema);
  check(
    `${nivel}: al menos tres temas distintos`,
    new Set(temasNivel).size >= 3,
    temasNivel.join(", "),
  );
  check(
    `${nivel}: ningún tema aparece más de ${MAX_PREGUNTAS_POR_TEMA} veces`,
    [...new Set(temasNivel)].every(
      (t) => temasNivel.filter((x) => x === t).length <= MAX_PREGUNTAS_POR_TEMA,
    ),
    temasNivel.join(", "),
  );
}
check("toda pregunta declara su nivel", banco.every((p) => NIVELES_BANCO.includes(p.nivel)));

const temas = banco.map((p) => p.tema);
check(
  "el banco completo sigue cubriendo los 5 temas de PRE Light",
  temas.every((t) => TEMAS_VALIDOS.has(t)) && new Set(temas).size === TEMAS_VALIDOS.size,
  `temas: ${temas.join(", ")}`,
);
check(
  "las derivadas sólo se preguntan en el nivel avanzado",
  banco.filter((p) => p.tema === "derivadas").every((p) => p.nivel === "AVANZADO"),
);

// Y el otro eje: cada alumno tiene con qué completar SU prueba, sin salirse de
// lo que le corresponde por curso.
const ETAPA_ORDEN = { PRIMARIA: 1, SECUNDARIA: 2, SUPERIOR: 3 };
const leCorresponde = (p, alumno) => {
  if (!p.nivel_etapa && !p.etapa) return true;
  const etapa = p.etapa;
  if (!etapa) return true;
  if (ETAPA_ORDEN[alumno.etapa] < ETAPA_ORDEN[etapa]) return false;
  if (ETAPA_ORDEN[alumno.etapa] > ETAPA_ORDEN[etapa]) return true;
  return !p.curso_min || alumno.curso >= p.curso_min;
};

// El contenido sembrado empieza en 4.º de primaria: por debajo, la prueba
// depende de lo que cargue el profesorado, y así se dice en lugar de fingir
// una cobertura que no hay.
for (const [alumno, nivelEsperado] of [
  [{ etapa: "PRIMARIA", curso: 4 }, "BASICO"],
  [{ etapa: "PRIMARIA", curso: 5 }, "BASICO"],
  [{ etapa: "SECUNDARIA", curso: 1 }, "BASICO"],
  [{ etapa: "SECUNDARIA", curso: 3 }, "INTERMEDIO"],
  [{ etapa: "SECUNDARIA", curso: 4 }, "AVANZADO"],
  [{ etapa: "SUPERIOR", curso: 1 }, "AVANZADO"],
]) {
  const suyas = banco.filter(
    (p) => p.nivel === nivelEsperado && leCorresponde(p, alumno),
  );
  check(
    `${alumno.etapa} ${alumno.curso} tiene cinco preguntas de nivel ${nivelEsperado}`,
    suyas.length >= 5,
    `${suyas.length} preguntas`,
  );
}

check(
  "ningún alumno de secundaria puede recibir una derivada",
  banco
    .filter((p) => leCorresponde(p, { etapa: "SECUNDARIA", curso: 5 }))
    .every((p) => p.tema !== "derivadas"),
);
check("los identificadores no se repiten", new Set(banco.map((p) => p.id)).size === banco.length);

for (const p of banco) {
  const etiqueta = `[${p.id}]`;
  check(`${etiqueta} enunciado no vacío`, typeof p.pregunta === "string" && p.pregunta.trim().length > 0);
  check(`${etiqueta} tiene al menos 2 opciones`, Array.isArray(p.opciones) && p.opciones.length >= 2);
  check(`${etiqueta} sin opciones duplicadas`, new Set(p.opciones).size === p.opciones.length);
  check(
    `${etiqueta} la respuesta correcta está entre las opciones`,
    p.opciones.includes(p.respuesta_correcta),
    `respuesta_correcta="${p.respuesta_correcta}"`,
  );
}

// ── 2. Verificación matemática contra el motor determinista ──────────────────
console.log("\n · Matemática (contrastada con src/preLight.js)");

for (const p of banco) {
  const etiqueta = `[${p.id}] ${p.tema}`;
  // El banco guarda la matemática en LaTeX para poder mostrarla con KaTeX; el
  // motor determinista trabaja en notación plana, así que se traduce antes.
  const enunciado = latexAPlano(p.pregunta);
  const esperado = latexAPlano(p.respuesta_correcta);
  let calculado = null;
  let comparar = (a, b) => norm(a) === norm(b);

  switch (p.tema) {
    case "aritmetica":
      calculado = computeAnswer(enunciado);
      break;
    case "fracciones":
      calculado = solveFractionFromText(enunciado);
      break;
    case "ecuaciones_lineales":
      calculado = solveLinearFromText(enunciado);
      break;
    case "factorizacion":
      calculado = computeFactorization(enunciado);
      comparar = mismaFactorizacion;
      break;
    case "derivadas":
      calculado = computeDerivative(enunciado);
      break;
  }

  if (calculado == null) {
    // El motor no cubre este caso. NO se da por verificado: se declara.
    sinVerificar.push(`${etiqueta} — el motor determinista no resuelve este enunciado`);
    console.log(`   ⚠️  ${etiqueta} sin verificar (el motor no cubre el enunciado)`);
    continue;
  }

  check(
    `${etiqueta} la respuesta declarada coincide con el motor`,
    comparar(calculado, esperado),
    `motor="${calculado}" · banco="${esperado}"`,
  );
}

// ── 3. Los distractores no deben ser también correctos ───────────────────────
console.log("\n · Distractores");
for (const p of banco) {
  const otros = p.opciones.filter((o) => o !== p.respuesta_correcta);
  // Se comparan ya traducidos a notación plana: así se detecta también que dos
  // opciones escritas distinto en LaTeX signifiquen lo mismo.
  const correcta = norm(latexAPlano(p.respuesta_correcta));
  check(
    `[${p.id}] ninguna otra opción equivale a la correcta`,
    otros.every((o) => norm(latexAPlano(o)) !== correcta),
  );
}

// ── 3.5. Separación de prosa y fórmula ───────────────────────────────────────
// Es la pieza que decide qué parte de un enunciado se compone como matemática.
// Equivocarse aquí se ve directamente en la pantalla del alumno.
console.log("\n · Separación de prosa y fórmula");

const casosSeparacion = [
  {
    nombre: "texto sin fórmulas se deja intacto",
    entrada: "Resuelve el ejercicio",
    esperado: [{ tipo: "texto", contenido: "Resuelve el ejercicio" }],
  },
  {
    nombre: "prosa + fórmula en línea",
    entrada: "Calcula: $2+2$",
    esperado: [
      { tipo: "texto", contenido: "Calcula: " },
      { tipo: "linea", contenido: "2+2" },
    ],
  },
  {
    nombre: "fórmula intercalada en medio de la frase",
    entrada: "El valor de $x$ en la ecuación",
    esperado: [
      { tipo: "texto", contenido: "El valor de " },
      { tipo: "linea", contenido: "x" },
      { tipo: "texto", contenido: " en la ecuación" },
    ],
  },
  {
    nombre: "dos fórmulas en la misma frase",
    entrada: "De $a$ a $b$",
    esperado: [
      { tipo: "texto", contenido: "De " },
      { tipo: "linea", contenido: "a" },
      { tipo: "texto", contenido: " a " },
      { tipo: "linea", contenido: "b" },
    ],
  },
  {
    nombre: "fórmula en bloque",
    entrada: "Mira: $$x^2$$",
    esperado: [
      { tipo: "texto", contenido: "Mira: " },
      { tipo: "bloque", contenido: "x^2" },
    ],
  },
  {
    nombre: "un $ suelto no abre fórmula",
    entrada: "Cuesta 5$ en total",
    esperado: [{ tipo: "texto", contenido: "Cuesta 5$ en total" }],
  },
];

for (const caso of casosSeparacion) {
  const obtenido = separarFormulas(caso.entrada);
  check(
    caso.nombre,
    JSON.stringify(obtenido) === JSON.stringify(caso.esperado),
    JSON.stringify(obtenido),
  );
}

// Todo el contenido del banco debe poder reconstruirse sin perder nada: si la
// separación se comiera un trozo del enunciado, el alumno leería una frase
// incompleta y nada avisaría.
for (const p of banco) {
  for (const texto of [p.pregunta, ...p.opciones]) {
    const reconstruido = separarFormulas(texto)
      .map((x) => (x.tipo === "texto" ? x.contenido : `$${x.contenido}$`))
      .join("");
    check(
      `[${p.id}] la separación no pierde contenido`,
      reconstruido.replace(/\s+/g, "") === String(texto).replace(/\s+/g, ""),
      `«${reconstruido}» vs «${texto}»`,
    );
  }
}

// ── 3.6. Formato matemático (KaTeX) ──────────────────────────────────────────
// Requisito del cliente: enunciados y opciones deben mostrarse con notación
// matemática tipográfica, no como texto corrido.
console.log("\n · Formato matemático (KaTeX)");

/** ¿El texto lleva al menos una fórmula delimitada por $…$? */
const llevaFormula = (s) => /\$[^$\n]+\$/.test(String(s));

/** Devuelve el mensaje de error de KaTeX, o null si la fórmula es válida. */
function errorKatex(expresion) {
  try {
    katex.renderToString(expresion, { throwOnError: true, strict: false });
    return null;
  } catch (e) {
    return e.message;
  }
}

for (const p of banco) {
  check(`[${p.id}] el enunciado marca su matemática con $…$`, llevaFormula(p.pregunta));
  check(
    `[${p.id}] los delimitadores $ están emparejados`,
    (String(p.pregunta).match(/\$/g) || []).length % 2 === 0,
  );
  check(
    `[${p.id}] todas las opciones marcan su matemática`,
    p.opciones.every(llevaFormula),
  );

  // Cada fórmula debe compilar: una llave sin cerrar se vería en rojo en la
  // pantalla del alumno, y eso no debe llegar nunca a producción.
  for (const parte of [p.pregunta, ...p.opciones]) {
    for (const formula of String(parte).match(/\$([^$\n]+)\$/g) || []) {
      const expresion = formula.slice(1, -1);
      const err = errorKatex(expresion);
      check(`[${p.id}] KaTeX compila «${expresion}»`, err === null, err ?? "");
    }
  }
}

// ── 4. Adaptación al esquema (la que ejecuta la semilla) ─────────────────────
console.log("\n · Adaptación al esquema de base de datos");

let adaptadas = null;
try {
  adaptadas = adaptarBanco(banco);
  check("el banco se adapta sin errores", true);
} catch (e) {
  check("el banco se adapta sin errores", false, e.message);
}

if (adaptadas) {
  check("se adaptan todas las preguntas", adaptadas.length === banco.length);
  check(
    "el orden es correlativo desde 1",
    adaptadas.every((p, i) => p.orden === i + 1),
  );
  check(
    "los temas quedan en el formato del enum",
    adaptadas.every((p) => /^[A-Z_]+$/.test(p.tema)),
  );

  for (const [i, p] of adaptadas.entries()) {
    const original = banco[i];
    const correcta = p.opciones.find((o) => o.id === p.respuestaCorrecta);
    check(
      `[${p.clave}] la respuesta correcta apunta a la opción correcta`,
      Boolean(correcta) && correcta.texto === original.respuesta_correcta,
      `id="${p.respuestaCorrecta}" → "${correcta?.texto}" · esperado "${original.respuesta_correcta}"`,
    );
    check(
      `[${p.clave}] se conservan todas las opciones y su orden`,
      p.opciones.length === original.opciones.length &&
        p.opciones.every((o, k) => o.texto === original.opciones[k]),
    );
  }
}

// Un banco con la respuesta correcta fuera de las opciones clasificaría mal a
// todos los alumnos sin dar ningún síntoma. Se comprueba que la adaptación lo
// detecta, en lugar de confiar en que nunca pasará.
const corrupto = JSON.parse(JSON.stringify(banco));
corrupto[0].respuesta_correcta = "valor que no está entre las opciones";
let detectado = false;
try {
  adaptarBanco(corrupto);
} catch {
  detectado = true;
}
check("un banco con la respuesta fuera de las opciones se rechaza", detectado);

// Con el banco partido por niveles, repetir tema deja de ser un error en sí
// —básico pregunta dos veces de aritmética porque no puede preguntar de
// derivadas— y lo que se rechaza es que un NIVEL se apoye en un solo tema.
const nivelMonotema = JSON.parse(JSON.stringify(banco)).filter((p) => p.nivel === "BASICO");
for (const p of nivelMonotema) p.tema = "aritmetica";
let detectadoMonotema = false;
try {
  adaptarBanco(nivelMonotema);
} catch {
  detectadoMonotema = true;
}
check("un nivel que sólo pregunta por un tema se rechaza", detectadoMonotema);

const nivelDesequilibrado = JSON.parse(JSON.stringify(banco)).filter((p) => p.nivel === "INTERMEDIO");
for (let i = 1; i <= MAX_PREGUNTAS_POR_TEMA; i++) {
  nivelDesequilibrado[i].tema = nivelDesequilibrado[0].tema;
}
let detectadoDesequilibrio = false;
try {
  adaptarBanco(nivelDesequilibrado);
} catch {
  detectadoDesequilibrio = true;
}
check(
  `más de ${MAX_PREGUNTAS_POR_TEMA} preguntas del mismo tema en un nivel se rechazan`,
  detectadoDesequilibrio,
);

const nivelInventado = JSON.parse(JSON.stringify(banco));
nivelInventado[0].nivel = "EXPERTO";
let detectadoNivel = false;
try {
  adaptarBanco(nivelInventado);
} catch {
  detectadoNivel = true;
}
check("un nivel que no existe se rechaza", detectadoNivel);

// ── Veredicto ────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log(` Aprobadas: ${ok} · Fallidas: ${fallos.length}`);
if (sinVerificar.length) {
  console.log(`\n Sin verificación automática (${sinVerificar.length}):`);
  for (const s of sinVerificar) console.log(`   · ${s}`);
  console.log(
    "\n   Estos enunciados quedan fuera del alcance actual del motor\n" +
      "   determinista. Se revisan a mano y se dejan anotados aquí a\n" +
      "   propósito, para no presentarlos como comprobados.",
  );
}

if (fallos.length) {
  console.log("\n ❌ BANCO RECHAZADO. Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}

console.log("\n ✅ BANCO APROBADO — estructura íntegra y matemática coherente.\n");
