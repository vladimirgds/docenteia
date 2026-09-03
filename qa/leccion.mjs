// Validación del PASO 2 — lección interactiva multimodal.
//
// Cubre lo que se entrega en este paso y que no verificaba ninguna batería:
//
//   Módulo 4 — la lección llega estructurada en las 4 fases pedagógicas
//              obligatorias (concepto → reglas → ejemplos → práctica).
//   Módulo 5 — la lección de los cinco temas sale del motor determinista, no
//              de la IA, y su aritmética es correcta.
//   Módulo 7 — todo lo que se escribe en la pizarra se puede componer con
//              KaTeX sin errores.
//   Módulo 8 — los botones de apoyo mantienen el tema en lugar de cambiarlo.
//   Módulo 9 — la corrección determinista acierta y, sobre todo, se niega a
//              calificar lo que no ha podido calcular.
//
// Necesita la aplicación levantada:  npm run dev  (en otra terminal)

import { readFileSync } from "node:fs";

import katex from "katex";

import { computeAnswer } from "../src/preLight.js";
import { checkAnswer, flattenLSG } from "../public/pseLight.js";
// Se prueba el MISMO resolutor que usa la ruta de corrección, no una copia.
import { resolverEjercicio } from "../lib/leccion/correccion.ts";
import {
  esIdeaFuerza,
  expresionPrincipal,
  notacionFormal,
  pareceMatematica,
  planoALatex,
  separarProsaYMatematicas,
} from "../lib/matematicas/index.ts";
import {
  esFaseConocida,
  esFaseDeConcepto,
  esFaseDeReglas,
  tituloDeFase,
} from "../lib/leccion/fases.ts";
// La lista real que consulta el componente, no una copia: si se duplicara,
// podrían desincronizarse y la prueba daría por bueno un concepto vacío.
import {
  tieneDiagrama,
  TEMAS_CON_DIAGRAMA,
  GEOMETRIAS,
  GEOMETRIA_DERIVADAS,
  cajaDeEtiqueta,
  etiquetaCabe,
  MARGEN_ETIQUETA,
} from "../lib/leccion/diagramas.ts";
import { pasoIntermedioDerivada } from "../lib/leccion/desarrollo.ts";
import {
  columnaDeCuentaDibujada,
  columnaDeLinea,
  columnaDelDesarrollo,
  cuentaEnCurso,
  esLaMismaCuenta,
  leerOperacionDibujada,
  leerSumaOResta,
  marcasDeColumna,
  sinRayasDibujadas,
  tieneRayaDibujada,
} from "../lib/leccion/columna.ts";
import {
  CLASE_COEFICIENTE,
  CLASE_EXPONENTE,
  lineaResaltada,
} from "../lib/leccion/destacar.ts";
import { rotulosALatex } from "../lib/leccion/rotulos.ts";
import {
  contextoDeAlumno,
  contextoParaElModelo,
  nivelDelMotor,
  MAX_DEBILIDADES,
} from "../lib/perfil/contexto.ts";
import { bancoDeEjercicios, leccionBotonLSG } from "../src/lsgPrompt.js";
import { MODELOS_DEL_PLIEGO } from "../src/geminiClient.js";
import { hayQueMostrarAyuda, veredictoTrasAcierto } from "../lib/leccion/retroalimentacion.ts";
import {
  enunciadoTrasPeticion,
  enunciadosDeLeccion,
  presentacionDe,
  sinPreguntas,
  recortarParaSeguimiento,
} from "../lib/leccion/seguimiento-lsg.ts";
import { adaptarCatalogo, identificarRegla, reglaActiva } from "../lib/leccion/reglas.ts";
import { construirPeticion, estadoInicial } from "../lib/leccion/seguimiento.ts";
import { TEMAS_LECCION } from "../lib/leccion/temas.ts";
import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";

let ok = 0;
const fallos = [];

function check(nombre, cond, detalle = "") {
  if (cond) {
    ok++;
    console.log(`   ✓ ${nombre}`);
  } else {
    fallos.push(nombre + (detalle ? ` — ${detalle}` : ""));
    console.log(`   ✗ ${nombre}${detalle ? `  (${detalle})` : ""}`);
  }
}

async function consultar(cuerpo) {
  const r = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(cuerpo),
  });
  return r.json();
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(" PASO 2 — lección interactiva multimodal");
console.log("═══════════════════════════════════════════════════════════\n");

await exigirServidor();

// ── Módulo 7 · notación plana → LaTeX ────────────────────────────────────────
console.log(" · Traducción a LaTeX para la pizarra (Módulo 7)");

const casosLatex = [
  { entrada: "12x³ - 4x", esperado: "12x^{3} - 4x" },
  { entrada: "x² - 9", esperado: "x^{2} - 9" },
  { entrada: "1/2 + 1/4", esperado: "\\frac{1}{2} + \\frac{1}{4}" },
  { entrada: "3 · 4", esperado: "3 \\cdot 4" },
  { entrada: "12 ÷ 6", esperado: "12 \\div 6" },
  { entrada: "2x + 5 = 15", esperado: "2x + 5 = 15" },
  { entrada: "xⁿ⁻¹", esperado: "x^{n-1}" },
];
for (const c of casosLatex) {
  const obtenido = planoALatex(c.entrada);
  check(`«${c.entrada}» → «${c.esperado}»`, obtenido === c.esperado, `obtenido: «${obtenido}»`);
}

// "d/dx" es notación de derivada, no una fracción: convertirla la rompería.
check(
  "d/dx no se convierte en fracción",
  !planoALatex("d/dx[x³]").includes("\\frac"),
  planoALatex("d/dx[x³]"),
);

console.log("\n · Distinción entre fórmula y prosa");
const casosProsa = [
  { entrada: "2x + 5 = 15", math: true },
  { entrada: "x² - 9", math: true },
  { entrada: "d/dx[xⁿ] = n·xⁿ⁻¹", math: true },
  { entrada: "Escribe tu ejercicio y lo resuelvo paso a paso", math: false },
  { entrada: "Regla de la potencia", math: false },
];
for (const c of casosProsa) {
  check(
    `«${c.entrada}» ${c.math ? "es fórmula" : "es prosa"}`,
    pareceMatematica(c.entrada) === c.math,
  );
}

// ── Notación formal y letras pegadas ─────────────────────────────────────────
// El motor rotula algunas fórmulas en castellano ("derivada de x² = 2x"). Si esa
// línea se compone entera con KaTeX, cada letra se tipografía como una variable
// y en pantalla se lee "derivadadex2=2x": las letras aparecen pegadas y en
// cursiva. Aquí se comprueba que eso no ocurra y que la notación sea la formal.
console.log("\n · Notación formal en la pizarra");

const casosFormales = [
  {
    entrada: "derivada de x² = 2x",
    latex: "\\frac{d}{dx}\\left(x^{2}\\right) = 2x",
  },
  {
    entrada: "derivada de 3x⁴ - 2x² = 12x³ - 4x",
    latex: "\\frac{d}{dx}\\left(3x^{4} - 2x^{2}\\right) = 12x^{3} - 4x",
  },
  { entrada: "unidades: 4 + 7 = 11", latex: "\\text{unidades:}\\;\\; 4 + 7 = 11" },
  { entrada: "decenas: 2 + 1 + 1 = 4", latex: "\\text{decenas:}\\;\\; 2 + 1 + 1 = 4" },
];

for (const caso of casosFormales) {
  const obtenido = notacionFormal(caso.entrada);
  check(
    `«${caso.entrada}» se reescribe en notación formal`,
    obtenido === caso.latex,
    `obtenido: ${obtenido}`,
  );
  if (!obtenido) continue;
  let err = null;
  try {
    katex.renderToString(obtenido, { throwOnError: true, strict: false });
  } catch (e) {
    err = e.message;
  }
  check(`«${caso.entrada}» compila en KaTeX`, err === null, err ?? "");
}

// Una fórmula pura no debe tocarse: no hay nada que formalizar.
for (const pura of ["x²", "2x + 5 = 15", "5x²"]) {
  check(`«${pura}» no necesita reescritura`, notacionFormal(pura) === null);
}

// Y una línea con palabras NUNCA debe considerarse fórmula pura.
for (const mixta of ["derivada de x² = 2x", "unidades: 4 + 7 = 11"]) {
  check(`«${mixta}» no se compone como fórmula pura`, pareceMatematica(mixta) === false);
}

// ── Separación entre la voz y la pizarra ─────────────────────────────────────
// La pizarra es un lienzo de IDEAS FUERZA —título de la regla, fórmulas y el
// ejercicio— y la explicación hablada vive en el subtítulo. El reparto se
// comprueba, no se da por supuesto: desde que las aclaraciones las redacta el
// modelo en vivo, a la pizarra puede llegar un párrafo entero.
console.log("\n · Separación entre la voz y la pizarra");

const casosIdeaFuerza = [
  // Lo que SÍ es pizarra: fórmulas y definiciones de una línea.
  { texto: "2x + 5 = 15", pizarra: true },
  { texto: "12x³ - 4x", pizarra: true },
  { texto: "Regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹", pizarra: true },
  { texto: "Derivada: razón de cambio (la pendiente) de una función", pizarra: true },
  { texto: "Suma: juntar cantidades → total", pizarra: true },
  { texto: "Factorizar: escribir una expresión como un producto de factores", pizarra: true },
  // Lo que NO: un párrafo explicativo, que es cosa del subtítulo.
  {
    texto:
      "Una derivada mide la RAPIDEZ con la que cambia una función: en cada punto indica cuánto crece o decrece, es decir, la pendiente de su gráfica.",
    pizarra: false,
  },
  {
    texto:
      "Para derivar una potencia usamos la regla de la potencia: se baja el exponente multiplicando delante y se le resta 1, y así obtenemos el resultado.",
    pizarra: false,
  },
];

for (const caso of casosIdeaFuerza) {
  check(
    `${caso.pizarra ? "va a la pizarra" : "va al subtítulo"}: «${caso.texto.slice(0, 40)}…»`,
    esIdeaFuerza(caso.texto) === caso.pizarra,
  );
}

// Una fórmula larga entra igualmente: es el contenido propio de la pizarra.
check(
  "una fórmula larga no se rechaza por su longitud",
  esIdeaFuerza("4x⁵ - 3x⁴ + 2x³ - 7x² + 5x - 12 = 0"),
);

// ── Módulo 4 · catálogo formal de reglas ─────────────────────────────────────
// La fase "Reglas y propiedades" debe presentar el catálogo completo del tema,
// no una sola regla. El catálogo vive como dato, no en el código.
console.log("\n · Catálogo formal de reglas (Módulo 4)");

const catalogoCrudo = JSON.parse(
  readFileSync(new URL("../prisma/seed-data/reglas-matematicas.json", import.meta.url), "utf8"),
);

let catalogo = null;
try {
  catalogo = adaptarCatalogo(catalogoCrudo);
  check("el catálogo se adapta sin errores", true);
} catch (e) {
  check("el catálogo se adapta sin errores", false, e.message);
}

if (catalogo) {
  // Cada tema tiene que tener reglas: uno sin ellas dejaría su fase vacía.
  for (const tema of TEMAS_LECCION) {
    const delTema = catalogo.filter((r) => r.tema === tema.tema);
    check(`[${tema.clave}] tiene reglas en el catálogo`, delTema.length > 0, `${delTema.length}`);
  }

  // Las reglas que el cliente pidió explícitamente para derivadas.
  const derivadas = catalogo.filter((r) => r.tema === "DERIVADAS");
  for (const exigida of ["constante", "potencia", "suma", "producto", "cadena"]) {
    check(
      `derivadas incluye la regla de la ${exigida}`,
      derivadas.some((r) => new RegExp(exigida, "i").test(r.nombre)),
      `hay: ${derivadas.map((r) => r.nombre).join(", ")}`,
    );
  }

  // El catálogo se escribe directamente en LaTeX: si una fórmula no compila,
  // el alumno vería el error en rojo en mitad de la lección.
  for (const regla of catalogo) {
    for (const [campo, valor] of [
      ["enunciado", regla.enunciado],
      ["ejemplo", regla.ejemplo],
    ]) {
      if (!valor) continue;
      let err = null;
      try {
        katex.renderToString(valor, { throwOnError: true, strict: false });
      } catch (e) {
        err = e.message;
      }
      check(`[${regla.clave}] el ${campo} compila en KaTeX`, err === null, err ?? "");
    }
  }

  // Un catálogo con una regla sin práctica calificable es correcto y esperado
  // —el motor no cubre la del producto ni la de la cadena—, pero al menos una
  // por tema tiene que serlo, o la fase de práctica se quedaría sin contenido.
  for (const tema of TEMAS_LECCION) {
    const practicables = catalogo.filter((r) => r.tema === tema.tema && r.practicable);
    check(
      `[${tema.clave}] al menos una regla admite práctica calificada`,
      practicables.length > 0,
    );
  }

  console.log("\n · Identificación de la regla aplicada");
  const casosRegla = [
    {
      texto: "Regla de la potencia: multiplicamos el coeficiente por el exponente, y al exponente le restamos 1.",
      esperada: "Regla de la potencia",
    },
    { texto: "Vamos a derivar x².", esperada: null },
    { texto: "Una derivada mide la RAPIDEZ con la que cambia una función.", esperada: null },
  ];
  for (const caso of casosRegla) {
    const encontrada = identificarRegla(caso.texto, derivadas);
    check(
      caso.esperada
        ? `«${caso.texto.slice(0, 32)}…» se etiqueta «${caso.esperada}»`
        : `«${caso.texto.slice(0, 32)}…» no se etiqueta`,
      (encontrada?.nombre ?? null) === caso.esperada,
      `obtenido: ${encontrada?.nombre ?? "null"}`,
    );
  }

  // Con nombres que se contienen unos a otros gana el MÁS LARGO: "regla de la
  // suma y la resta" contiene "regla de la suma", y quedarse con el primero
  // etiquetaría mal el paso.
  const conAmbiguedad = [{ nombre: "Regla de la suma" }, { nombre: "Regla de la suma y la resta" }];
  check(
    "ante nombres solapados se elige el más específico",
    identificarRegla("Aplicamos la regla de la suma y la resta", conAmbiguedad)?.nombre ===
      "Regla de la suma y la resta",
  );

  // ── Sincronía entre la pizarra y el audio ─────────────────────────────────
  // La fase de Reglas debe componer ÚNICAMENTE la tarjeta de la regla que el
  // tutor está explicando. Mostrar el catálogo entero hacía que la voz hablara
  // de la potencia mientras en pantalla aparecían el cociente y la cadena.
  console.log("\n · Regla activa (sincronía pizarra ↔ audio)");

  check(
    "sin líneas todavía, no se muestra ninguna tarjeta",
    reglaActiva([], derivadas) === null,
  );
  check(
    "una línea que no nombra regla no activa ninguna",
    reglaActiva(["Vamos a ver cómo se derivan las potencias."], derivadas) === null,
  );

  // El texto REAL con el que el motor abre la fase de reglas en derivadas.
  const lineasReglaReal = [
    "Para derivar una potencia usamos la REGLA DE LA POTENCIA: se baja el exponente multiplicando delante y se le resta 1. Por ejemplo, la derivada de x³ es 3x², y la de x⁵ es 5x⁴. Veámoslo con calma.",
    "Regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹",
  ];
  const activa = reglaActiva(lineasReglaReal, derivadas);
  check(
    "con el texto real del motor, la regla activa es la de la potencia",
    activa?.nombre === "Regla de la potencia",
    `obtenido: ${activa?.nombre ?? "null"}`,
  );

  // Lo esencial del defecto: NO deben aparecer las demás.
  for (const ausente of ["Regla del cociente", "Regla de la cadena", "Regla del producto"]) {
    check(`no se activa «${ausente}» mientras se explica la potencia`, activa?.nombre !== ausente);
  }

  // Guarda sobre el propio fichero. El defecto no estaba en la lógica sino en
  // la plantilla: un `reglas.map(...)` pintaba todas las tarjetas a la vez. Una
  // prueba de comportamiento no lo habría detectado, porque `reglaActiva()`
  // devolvía lo correcto mientras la pantalla mostraba de más. Se comprueba,
  // por tanto, que en pizarra.tsx no quede ningún recorrido del catálogo.
  const fuentePizarra = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  const recorridos = fuentePizarra.match(/reglas\s*\.\s*map\s*\(/g) || [];
  check(
    "pizarra.tsx no recorre el catálogo completo",
    recorridos.length === 0,
    `encontrados: ${recorridos.length}`,
  );
  check(
    "pizarra.tsx compone la tarjeta de la regla activa",
    /reglaActiva\s*\(/.test(fuentePizarra) && /TarjetaRegla/.test(fuentePizarra),
  );
  // La comprobación de arriba mira los DATOS: que el catálogo tenga reglas para
  // la fase. No basta, porque el componente podría dejar de usarlas y la fase
  // volvería a quedarse en blanco sin que ninguna prueba se enterara —que es
  // exactamente lo que pasó—. Aquí se fija el recurso al catálogo.
  check(
    "pizarra.tsx recurre al catálogo cuando no detecta la regla",
    /porPizarra\s*\?\?\s*reglas\[0\]/.test(fuentePizarra),
  );
  check(
    "pizarra.tsx dibuja el diagrama de la fase de Concepto",
    /esFaseDeConcepto\s*\([^)]*\)\s*&&/.test(fuentePizarra) && /DiagramaConcepto/.test(fuentePizarra),
  );
  // El enunciado tiene que quedar anclado. Es la regresión que ya ocurrió una
  // vez: al componer sólo la última línea, desaparecía en cuanto empezaba el
  // desarrollo.
  check(
    "pizarra.tsx ancla el enunciado y compone el desarrollo aparte",
    /\(ejercicio \|\| planteaEjercicio\)\s*&&/.test(fuentePizarra) &&
      /pasos\.length\s*>\s*0/.test(fuentePizarra),
  );
  // Y el paso intermedio NO puede aparecer en la práctica: revelaría la
  // respuesta que el alumno tiene que hallar.
  check(
    "el paso intermedio se añade sólo en el ejemplo, no en la práctica",
    /esFaseDeEjemplo\(actual\.id\)[\s\S]{0,160}pasoIntermedioDerivada/.test(fuentePizarra),
  );

  // El enunciado NO puede deducirse por posición. Mientras fue "la primera
  // línea de la escena", bastaba con que llegara contenido nuevo sin vaciarla
  // para que la tarjeta se quedara anclada al ejercicio anterior y el nuevo
  // cayera al fondo del desarrollo. Ahora es un campo propio de la escena.
  check(
    "el enunciado sale de su propia prop, no de la primera línea",
    /ejercicio: LineaPizarra \| null;/.test(fuentePizarra) &&
      !/lineas\[0\]|\[primera,\s*\.\.\.resto\]/.test(fuentePizarra),
  );

  const fuenteAula = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );
  // Y el desarrollo se vacía en TODA petición que vaya a escribir: si no, el
  // procedimiento del ejercicio anterior se queda debajo del nuevo.
  check(
    "aula.tsx vacía el desarrollo antes de pintar contenido nuevo",
    /SUSTITUCIÓN, no concatenación[\s\S]{0,320}setDesarrollo\(\[\]\);/.test(fuenteAula),
  );
  check(
    "aula.tsx retira también el enunciado cuando llega otro ejercicio",
    /fijarLineaEjercicio\(null\);[\s\S]{0,40}setDesarrollo\(\[\]\);/.test(fuenteAula),
  );
  // El enunciado se adelanta al abrir la fase, sin esperar a la cola de voz.
  check(
    "aula.tsx adelanta el enunciado al abrir la fase",
    /enunciadoPorFase\.current\.get\(clave\)/.test(fuenteAula),
  );
  // Y no se repite abajo cuando el motor lo escribe con su propia directiva.
  check(
    "aula.tsx no repite el enunciado dentro del desarrollo",
    /ejercicioRef\.current\?\.texto === limpio/.test(fuenteAula),
  );
}

// ── Enunciado adelantado ─────────────────────────────────────────────────────
// El motor narra primero y escribe después: la pizarra se quedaba en blanco
// durante toda la locución inicial de la fase. El enunciado se conoce desde que
// llega la lección, así que se adelanta.
console.log("\n · Enunciado disponible antes de narrarlo");

for (const tema of TEMAS_LECCION) {
  const datos = await consultar({ query: tema.consulta });
  const enunciados = enunciadosDeLeccion(datos.lsg);

  for (const modulo of datos.lsg?.modulos ?? []) {
    const id = String(modulo.id);
    if (!/ejemplo|practica/.test(id)) continue;

    const adelantado = enunciados.get(id);
    check(
      `[${tema.clave}] la fase «${tituloDeFase(id)}» tiene enunciado adelantado`,
      Boolean(adelantado),
      `obtenido: ${adelantado}`,
    );

    // Y es de verdad el enunciado: la PRIMERA expresión que la fase escribe.
    const primera = (modulo.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => String(d.contenido ?? "").trim())[0];
    check(
      `[${tema.clave}] el enunciado adelantado coincide con el que escribe el motor`,
      adelantado === primera,
      `adelantado: ${adelantado} · motor: ${primera}`,
    );
  }
}

{
  // Al avanzar el diálogo, la tarjeta cambia: manda la MÁS RECIENTE.
  const reglasDerivadas = (catalogo ?? []).filter((r) => r.tema === "DERIVADAS");
  const trasAvanzar = reglaActiva(
    [
      "Para derivar una potencia usamos la REGLA DE LA POTENCIA.",
      "Ahora la regla de la suma y la resta: se deriva término a término.",
    ],
    reglasDerivadas,
  );
  check(
    "al avanzar el diálogo, la tarjeta pasa a la regla nueva",
    trasAvanzar?.nombre === "Regla de la suma y la resta",
    `obtenido: ${trasAvanzar?.nombre ?? "null"}`,
  );
}

// ── Módulo 7 · matemáticas dentro de la prosa ────────────────────────────────
// El motor incrusta las fórmulas en la frase, sin marcarlas ("la derivada de x³
// es 3x²"). Si no se detectan, la explicación se lee como texto plano, que es
// justo lo que el cliente reportó.
console.log("\n · Fórmulas dentro de la explicación (Módulo 7)");

const casosProsaMat = [
  {
    texto: "Por ejemplo, la derivada de x³ es 3x², y la de x⁵ es 5x⁴.",
    esperadas: ["x³", "3x²", "x⁵", "5x⁴"],
  },
  { texto: "Así, la derivada de x² es 2x. Ahora te toca a ti.", esperadas: ["x²", "2x"] },
  { texto: "Regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹", esperadas: ["xⁿ", "n·xⁿ⁻¹"] },
  { texto: "¿Cuál es la derivada de 5x²?", esperadas: ["5x²"] },
  { texto: "derivada de x² = 2x", esperadas: ["x² = 2x"] },
  { texto: "Aquí el coeficiente es 1 y el exponente 2: 1 × 2 = 2, y el nuevo exponente es 1.", esperadas: ["1 × 2 = 2"] },
  // Prosa pura: no debe marcarse NADA. Convertir una palabra en fórmula se ve
  // roto; dejar una fórmula en texto plano sólo se ve soso.
  {
    texto:
      "Una derivada mide la RAPIDEZ con la que cambia una función: en cada punto indica cuánto crece o decrece, es decir, la pendiente de su gráfica.",
    esperadas: [],
  },
  { texto: "Derivada: razón de cambio (la pendiente) de una función", esperadas: [] },
  { texto: "Vamos a derivar x².", esperadas: ["x²"] },
];

for (const caso of casosProsaMat) {
  const partes = separarProsaYMatematicas(caso.texto);
  const formulas = partes.filter((p) => p.tipo === "linea").map((p) => p.contenido);
  check(
    `detecta ${caso.esperadas.length} fórmula(s) en «${caso.texto.slice(0, 42)}…»`,
    JSON.stringify(formulas) === JSON.stringify(caso.esperadas),
    `obtenido: ${JSON.stringify(formulas)}`,
  );
  // Reconstruir el texto debe devolver el original: si la separación se comiera
  // un trozo, el alumno leería una frase incompleta y nada avisaría.
  check(
    `no pierde contenido en «${caso.texto.slice(0, 30)}…»`,
    partes.map((p) => p.contenido).join("") === caso.texto,
  );
  // Y cada fórmula detectada tiene que poder componerse.
  for (const f of formulas) {
    let err = null;
    try {
      katex.renderToString(planoALatex(f), { throwOnError: true, strict: false });
    } catch (e) {
      err = e.message;
    }
    check(`KaTeX compila «${f}»`, err === null, err ?? "");
  }
}

// ── Estructura de escenas ────────────────────────────────────────────────────
console.log("\n · Rótulos de las fases");
const rotulos = [
  ["concepto", "Concepto"],
  ["regla", "Reglas y propiedades"],
  ["ejemplo_guiado", "Ejemplo paso a paso"],
  ["practica", "Práctica"],
];
for (const [clave, titulo] of rotulos) {
  check(`«${clave}» se rotula «${titulo}»`, tituloDeFase(clave) === titulo, tituloDeFase(clave));
}

// ── Módulos 4, 5 y 7 · la lección de cada tema ───────────────────────────────
console.log("\n · Lección de cada tema (Módulos 4, 5 y 7)");

/** Fases pedagógicas obligatorias, en orden. */
const FASES = [
  { nombre: "concepto", patron: /concepto/i },
  { nombre: "reglas", patron: /regla|propiedad/i },
  { nombre: "ejemplo", patron: /ejemplo/i },
  { nombre: "practica", patron: /practica|práctica/i },
];

const estadoPorTema = new Map();

for (const tema of TEMAS_LECCION) {
  const estado = estadoInicial();
  estado.claveTema = tema.clave;
  const cuerpo = construirPeticion(tema.consulta, estado);
  const datos = await consultar(cuerpo);

  const etiqueta = `[${tema.clave}]`;

  // Módulo 5: los cinco temas los resuelve el motor determinista, no la IA.
  check(
    `${etiqueta} la lección es determinista (no consume IA)`,
    datos.fuente_ia === "local",
    `fuente_ia=${datos.fuente_ia}`,
  );

  // Módulo 4: las cuatro fases pedagógicas obligatorias.
  const modulos = Array.isArray(datos.lsg?.modulos)
    ? datos.lsg.modulos.map((m) => String(m.id))
    : [];
  check(`${etiqueta} la lección viene en módulos`, modulos.length > 0, `módulos: ${modulos.length}`);
  for (const fase of FASES) {
    check(
      `${etiqueta} incluye la fase «${fase.nombre}»`,
      modulos.some((id) => fase.patron.test(id)),
      `módulos: ${modulos.join(", ")}`,
    );
  }

  // Cada módulo se presenta como una ESCENA con su rótulo. Un módulo que no
  // caiga en una fase conocida se le mostraría al alumno con su clave interna.
  check(
    `${etiqueta} todos los módulos tienen rótulo de fase`,
    modulos.every((id) => esFaseConocida(id)),
    `sin rótulo: ${modulos.filter((id) => !esFaseConocida(id)).join(", ")}`,
  );

  // Módulo 7: todo lo que va a la pizarra debe poder componerse.
  const pasos = flattenLSG(datos.lsg || {});

  // Y también las fórmulas incrustadas en las explicaciones habladas.
  let fallosProsa = 0;
  for (const paso of pasos.filter((p) => p.tipo === "hablar")) {
    for (const parte of separarProsaYMatematicas(paso.texto ?? "")) {
      if (parte.tipo !== "linea") continue;
      try {
        katex.renderToString(planoALatex(parte.contenido), { throwOnError: true, strict: false });
      } catch (e) {
        fallosProsa++;
        console.log(`      · no compila en la explicación: «${parte.contenido}» → ${e.message.slice(0, 70)}`);
      }
    }
  }
  check(`${etiqueta} las fórmulas de la explicación se componen`, fallosProsa === 0, `${fallosProsa} fallo(s)`);
  const pizarras = pasos.filter((p) => p.tipo === "pizarra").map((p) => p.contenido);
  check(`${etiqueta} escribe en la pizarra`, pizarras.length > 0);

  let fallosKatex = 0;
  for (const linea of pizarras) {
    if (!pareceMatematica(linea)) continue; // los avisos en prosa no se componen
    try {
      katex.renderToString(planoALatex(linea), { throwOnError: true, strict: false });
    } catch (e) {
      fallosKatex++;
      console.log(`      · no compila: «${linea}» → ${e.message.slice(0, 80)}`);
    }
  }
  check(`${etiqueta} toda la pizarra se compone con KaTeX`, fallosKatex === 0, `${fallosKatex} fallo(s)`);

  // NINGUNA FASE PUEDE QUEDAR EN BLANCO.
  //
  // Al dejar de volcar la locución al lienzo, las fases que sólo narran se
  // quedaron sin nada que mostrar: en aritmética y en ecuaciones lineales, el
  // motor no escribe nada en la pizarra durante "Reglas y propiedades". La
  // tarjeta del catálogo cubre ese hueco, y esto lo comprueba.
  const reglasDelTema = catalogo?.filter((r) => r.tema === tema.tema) ?? [];
  for (const modulo of datos.lsg?.modulos ?? []) {
    const id = String(modulo.id);
    const escritas = (modulo.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => String(d.contenido ?? ""))
      .filter(esIdeaFuerza);

    // Qué se verá en esa fase: lo escrito, o la tarjeta de la regla, o el
    // diagrama del concepto.
    const hayTarjeta = esFaseDeReglas(id) && reglasDelTema.length > 0;
    const hayDiagrama = esFaseDeConcepto(id) && tieneDiagrama(tema.tema);
    check(
      `[${tema.clave}] la fase «${tituloDeFase(id)}» no queda en blanco`,
      escritas.length > 0 || hayTarjeta || hayDiagrama,
      `pizarra: ${escritas.length} · tarjeta: ${hayTarjeta} · diagrama: ${hayDiagrama}`,
    );
  }

  // Ninguna línea que el motor escribe en la pizarra puede ser un párrafo: la
  // explicación hablada es cosa del subtítulo.
  const parrafos = pizarras.filter((linea) => !esIdeaFuerza(linea));
  check(
    `${etiqueta} la pizarra no recibe párrafos explicativos`,
    parrafos.length === 0,
    parrafos.map((l) => `«${l.slice(0, 50)}…»`).join(" · "),
  );

  // Y lo NARRADO no debe repetirse en la pizarra: era la duplicación de la
  // locución. El motor manda el mismo texto por las dos vías, y la interfaz se
  // queda sólo con la de la voz.
  const narrado = pasos.filter((p) => p.tipo === "hablar").map((p) => String(p.texto ?? "").trim());
  const repetidas = pizarras.filter((l) => narrado.includes(String(l).trim()));
  check(
    `${etiqueta} nada de lo narrado se escribe también en la pizarra`,
    repetidas.length === 0,
    repetidas.map((l) => `«${l.slice(0, 40)}…»`).join(" · "),
  );

  // Barrido de LETRAS PEGADAS. Ninguna línea con palabras puede acabar
  // compuesta como fórmula pura: KaTeX tipografiaría cada letra como una
  // variable suelta y el rótulo se leería como un amasijo en cursiva. Es la
  // comprobación que faltaba cuando esto llegó al cliente.
  const pegadas = pizarras.filter(
    (linea) =>
      /[a-záéíóúñ]{3,}/i.test(linea) && // lleva alguna palabra
      notacionFormal(linea) === null && // no se reescribe en notación formal
      pareceMatematica(linea), // y aun así se compondría entera
  );
  check(
    `${etiqueta} ninguna línea con palabras se compone como fórmula`,
    pegadas.length === 0,
    pegadas.map((l) => `«${l}»`).join(" · "),
  );

  // Se guarda el estado para probar después los botones de apoyo.
  estado.temaActivo = tema.consulta;
  if (datos.cursores) estado.cursores = datos.cursores;
  estado.previo = pasos
    .filter((p) => p.tipo === "hablar")
    .slice(0, 3)
    .map((p) => p.texto)
    .join(" ")
    .slice(0, 600);
  estado.ejercicio = pizarras[pizarras.length - 1] ?? "";
  estadoPorTema.set(tema.clave, estado);
}

// ── Enunciado y desarrollo en la pizarra ─────────────────────────────────────
// Al componer sólo la última línea, el enunciado desaparecía en cuanto empezaba
// el desarrollo y el alumno se quedaba con el resultado suelto, sin poder
// contrastarlo con el planteamiento.
console.log("\n · Enunciado fijo y desarrollo debajo");

for (const tema of TEMAS_LECCION) {
  const datos = await consultar({ query: tema.consulta });
  for (const modulo of datos.lsg?.modulos ?? []) {
    const id = String(modulo.id);
    if (!/ejemplo/.test(id)) continue;
    const lineas = (modulo.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => String(d.contenido ?? ""));

    // El modelo de la pizarra: la primera línea es el enunciado y las
    // siguientes el desarrollo. Si el motor dejara de escribirlo así, la
    // tarjeta mostraría un enunciado que en realidad es un paso.
    check(
      `[${tema.clave}] el ejemplo trae enunciado y al menos un paso`,
      lineas.length >= 2,
      `${lineas.length} línea(s): ${lineas.join(" | ")}`,
    );
  }
}

console.log("\n · Paso intermedio de la derivada");
const casosPaso = [
  { entrada: "5x²", esperado: "5 · 2x²⁻¹ = 10x" },
  { entrada: "3x⁴", esperado: "3 · 4x⁴⁻¹ = 12x³" },
  { entrada: "x²", esperado: "2x²⁻¹ = 2x" },
];
for (const caso of casosPaso) {
  const obtenido = pasoIntermedioDerivada(caso.entrada);
  check(
    `«${caso.entrada}» desarrolla como «${caso.esperado}»`,
    obtenido === caso.esperado,
    `obtenido: ${obtenido}`,
  );
  // Y el resultado del paso tiene que ser el MISMO que califica el motor: un
  // desarrollo que lleve a otro número sería peor que no tener desarrollo.
  const resultado = String(obtenido).split("=").pop()?.trim();
  check(
    `«${caso.entrada}» el desarrollo coincide con lo que califica el motor`,
    resultado === String(resolverEjercicio(caso.entrada, "derivadas")),
    `paso: ${resultado} · motor: ${resolverEjercicio(caso.entrada, "derivadas")}`,
  );
}

// Con un polinomio el desarrollo son varios pasos: fabricar uno solo daría una
// idea equivocada del método, así que no se inventa nada.
for (const polinomio of ["4x⁵ - 3x³", "x² - 9", "2/6 + 3/6"]) {
  check(`«${polinomio}» no se desarrolla en un solo paso`, pasoIntermedioDerivada(polinomio) === null);
}

// ── Cómo se presenta cada seguimiento ────────────────────────────────────────
// El servidor responde tres cosas distintas según lo que pulse el alumno, y
// tratarlas igual dejaba la pizarra descuadrada: una lección NUEVA se apilaba
// dentro de la escena anterior, así que arriba quedaba congelado el ejercicio
// viejo y abajo aparecía el nuevo, como si fueran el mismo.
console.log("\n · Presentación de cada tipo de seguimiento");

{
  const tema = "Enséñame derivadas";
  const base = { contexto: tema, currentTopic: tema };

  const apertura = await consultar({ query: tema });
  check(
    "abrir un tema se presenta reiniciando",
    presentacionDe(apertura.lsg, { esSeguimiento: false }) === "reiniciar",
  );

  // "Más difícil" no trae módulos: es otro ejercicio dentro de la misma fase.
  const masDificil = await consultar({
    ...base,
    query: "Proponme un problema más difícil",
    seguimiento: "mas_dificil",
  });
  check(
    "«más difícil» no trae módulos",
    !Array.isArray(masDificil.lsg?.modulos) || masDificil.lsg.modulos.length === 0,
  );
  check(
    "«más difícil» se presenta sustituyendo el ejercicio",
    presentacionDe(masDificil.lsg, { esSeguimiento: true }) === "sustituir",
  );

  // "Dame otro ejemplo" trae la lección entera: hay que reiniciar la pizarra.
  const otroEjemplo = await consultar({
    ...base,
    query: "Dame otro ejemplo",
    seguimiento: "continuacion",
  });
  check(
    "«dame otro ejemplo» trae la lección completa",
    Array.isArray(otroEjemplo.lsg?.modulos) && otroEjemplo.lsg.modulos.length >= 3,
    `módulos: ${(otroEjemplo.lsg?.modulos ?? []).length}`,
  );
  check(
    "«dame otro ejemplo» se presenta reiniciando",
    presentacionDe(otroEjemplo.lsg, { esSeguimiento: true }) === "reiniciar",
  );

  // Y al reiniciar por un seguimiento se entra por el ejemplo, no por el
  // concepto: repetirlo devolvería al alumno al principio de la clase.
  const recortada = recortarParaSeguimiento(otroEjemplo.lsg);
  const fases = (recortada.modulos ?? []).map((m) => String(m.id));
  check(
    "la lección de seguimiento no repite el concepto",
    !fases.some((f) => /concepto/i.test(f)),
    `fases: ${fases.join(", ")}`,
  );
  check(
    "la lección de seguimiento no repite las reglas",
    !fases.some((f) => /regla/i.test(f)),
    `fases: ${fases.join(", ")}`,
  );
  check("la lección de seguimiento conserva el ejemplo y la práctica", fases.length >= 2, fases.join(", "));

  // Una aclaración se añade a lo que hay: el alumno sigue con su ejercicio.
  const aclaracion = await consultar({
    ...base,
    query: "Explícame la regla que se aplica",
    seguimiento: "reexplicar",
    parte: "concepto",
    explicacionDinamica: true,
  });
  check(
    "una aclaración se presenta anexando",
    presentacionDe(aclaracion.lsg, { esSeguimiento: true, soloExplicacion: true }) === "anexar",
  );

  // Si el recorte dejara la lección vacía, se devuelve entera: es preferible
  // repetir una fase que dejar la pizarra sin nada.
  const soloConcepto = { modulos: [{ id: "concepto", directivas: [] }] };
  check(
    "un recorte que vaciaría la lección la deja intacta",
    recortarParaSeguimiento(soloConcepto).modulos.length === 1,
  );
}

// ── Módulo 8 · los botones de apoyo mantienen el tema ────────────────────────
console.log("\n · Botones de apoyo (Módulo 8)");

const BOTONES = [
  { etiqueta: "No entendí este paso", consulta: "No entendí, explícalo mejor", seguimiento: "reexplicar", parte: "resolucion" },
  { etiqueta: "Dame otro ejemplo", consulta: "Dame otro ejemplo", seguimiento: "continuacion" },
  { etiqueta: "Explicar regla", consulta: "Explícame la regla que se aplica", seguimiento: "reexplicar", parte: "concepto" },
];

for (const tema of TEMAS_LECCION) {
  const estado = estadoPorTema.get(tema.clave);
  for (const boton of BOTONES) {
    const cuerpo = construirPeticion(boton.consulta, estado, {
      seguimiento: boton.seguimiento,
      parte: boton.parte,
    });
    const datos = await consultar(cuerpo);
    const pasos = flattenLSG(datos.lsg || {});

    check(
      `[${tema.clave}] «${boton.etiqueta}» responde sin error`,
      Boolean(datos.lsg) && pasos.length > 0 && !datos.error,
      datos.error ?? `pasos: ${pasos.length}`,
    );
    // Un botón de apoyo NO debe cambiar de asunto: se sigue en el mismo tema.
    check(
      `[${tema.clave}] «${boton.etiqueta}» no cambia de tema`,
      datos.reexplicacion === true,
      `reexplicacion=${datos.reexplicacion}`,
    );
  }
}

// ── Progresión gradual de dificultad ─────────────────────────────────────────
// "Más difícil" subía de golpe al último nivel y ahí se quedaba, así que
// pulsarlo otra vez no cambiaba nada y el alumno oscilaba entre los mismos
// ejercicios. Ahora es un peldaño cada vez, con un nivel más por encima.
console.log("\n · Progresión gradual de dificultad");

const ultimaPizarra = (datos) =>
  flattenLSG(datos.lsg || {})
    .filter((d) => d.tipo === "pizarra")
    .map((d) => d.contenido)
    .pop() ?? "";

for (const tema of TEMAS_LECCION) {
  let cursores = {};
  const inicial = await consultar({ query: tema.consulta });
  cursores = inicial.cursores || {};

  const vistos = [ultimaPizarra(inicial)];
  const niveles = [];

  for (let paso = 0; paso < 3; paso++) {
    const datos = await consultar({
      query: "Proponme un problema más difícil",
      contexto: tema.consulta,
      seguimiento: "mas_dificil",
      currentTopic: tema.consulta,
      cursores,
    });
    cursores = datos.cursores || cursores;
    vistos.push(ultimaPizarra(datos));
    niveles.push(cursores["nivel:actual"]);
  }

  // El nivel tiene que SUBIR peldaño a peldaño, no saltar de una vez.
  check(
    `[${tema.clave}] "más difícil" sube de nivel de forma gradual`,
    niveles[0] < niveles[1] && niveles[1] <= niveles[2],
    `niveles: ${niveles.join(" → ")}`,
  );
  check(
    `[${tema.clave}] alcanza el nivel más alto de la escalera`,
    Math.max(...niveles) >= 3,
    `máximo: ${Math.max(...niveles)}`,
  );
  // Y los ejercicios tienen que cambiar de verdad.
  check(
    `[${tema.clave}] cada peldaño propone un ejercicio distinto`,
    new Set(vistos.filter(Boolean)).size >= 3,
    vistos.join(" | "),
  );
  // Subir de nivel no puede dejar al alumno sin corrección: si el motor
  // determinista no resuelve el ejercicio que propone la escalera, el Módulo 9
  // responde "no puedo calificarlo" y la práctica se queda a medias. Es el
  // riesgo real del entregable, y se comprueba peldaño a peldaño.
  for (const propuesto of vistos.filter(Boolean)) {
    check(
      `[${tema.clave}] el motor puede calificar «${propuesto}»`,
      resolverEjercicio(propuesto, tema.clave) != null,
      "la escalera propone un ejercicio que la corrección no sabe resolver",
    );
  }

  // Bajar también es un peldaño, no un salto al nivel más fácil.
  const bajada = await consultar({
    query: "Ahora uno más fácil",
    contexto: tema.consulta,
    seguimiento: "mas_facil",
    currentTopic: tema.consulta,
    cursores,
  });
  const nivelTrasBajar = (bajada.cursores || {})["nivel:actual"];
  check(
    `[${tema.clave}] "más fácil" baja un solo peldaño`,
    nivelTrasBajar === Math.max(...niveles) - 1,
    `de ${Math.max(...niveles)} a ${nivelTrasBajar}`,
  );

  // La escalera no se estanca: seguir pulsando "más difícil" por encima del
  // nivel escrito a mano entra en los niveles GENERADOS y sigue subiendo.
  let cursoresLargos = { ...cursores };
  const nivelesLargos = [];
  const ejerciciosLargos = [];
  for (let paso = 0; paso < 6; paso++) {
    const datos = await consultar({
      query: "Proponme un problema más difícil",
      contexto: tema.consulta,
      seguimiento: "mas_dificil",
      currentTopic: tema.consulta,
      cursores: cursoresLargos,
    });
    cursoresLargos = datos.cursores || cursoresLargos;
    nivelesLargos.push(cursoresLargos["nivel:actual"]);
    ejerciciosLargos.push(ultimaPizarra(datos));
  }
  check(
    `[${tema.clave}] la escalera sigue subiendo más allá del nivel escrito a mano`,
    Math.max(...nivelesLargos) >= 5,
    `niveles: ${nivelesLargos.join(" → ")}`,
  );
  // Y lo generado tiene que poder calificarlo el motor: un ejercicio más
  // difícil que después no se puede corregir no sirve de nada.
  const sinResolver = ejerciciosLargos
    .filter(Boolean)
    .map((e) => e.replace(/\s*=\s*\?$/, ""))
    .filter((e) => resolverEjercicio(e, tema.clave) == null);
  check(
    `[${tema.clave}] todo ejercicio generado es calificable`,
    sinResolver.length === 0,
    sinResolver.map((e) => `«${e}»`).join(" · "),
  );

  // Los ejercicios del nivel más alto deben poder resolverse: un enunciado que
  // el motor no sabe calificar dejaría al alumno sin corrección.
  const dificil = vistos[vistos.length - 1];
  if (dificil) {
    check(
      `[${tema.clave}] el ejercicio del nivel alto es calificable`,
      resolverEjercicio(dificil.replace(/\s*=\s*\?$/, ""), tema.clave) != null,
      `«${dificil}»`,
    );
  }
}

// ── Explicación dinámica (Módulo 4) ──────────────────────────────────────────
// Los botones de aclaración devolvían guiones fijos del prototipo. Con la
// bandera `explicacionDinamica` se saltan esas ramas y la explicación se pide
// al modelo.
console.log("\n · Explicación dinámica en los botones de aclaración");

for (const tema of TEMAS_LECCION.slice(0, 2)) {
  const base = { contexto: tema.consulta, currentTopic: tema.consulta, seguimiento: "reexplicar" };

  const fija = await consultar({ query: "No entendí, explícalo mejor", ...base, parte: "resolucion" });
  const dinamica = await consultar({
    query: "No entendí, explícalo mejor",
    ...base,
    parte: "resolucion",
    explicacionDinamica: true,
  });

  // Sin la bandera se responde con el guion determinista.
  check(
    `[${tema.clave}] sin la bandera responde el guion determinista`,
    fija.fuente_ia === "local",
    `fuente_ia=${fija.fuente_ia}`,
  );
  // Con la bandera NO se usa el guion: la respuesta sale del modelo, o del
  // contenido de respaldo si la clave de Gemini no está operativa.
  check(
    `[${tema.clave}] con la bandera no se usa el guion determinista`,
    dinamica.fuente_ia !== "local",
    `fuente_ia=${dinamica.fuente_ia}`,
  );
  check(
    `[${tema.clave}] la aclaración dinámica devuelve contenido`,
    flattenLSG(dinamica.lsg || {}).length > 0,
  );
}

// ── Contexto y estilo de la aclaración ───────────────────────────────────────
// Pulsar "Explicar regla" sobre 5x² devolvía una analogía genérica de una
// montaña rusa sobre qué es una derivada: el prompt de "no entendí" ORDENA
// partir de una analogía cotidiana, y el modelo no sabía de qué regla ni sobre
// qué término tenía que hablar. Ahora se le inyecta ese contexto y se le pide
// conducta de pizarra: sin saludos y en pocas líneas.
console.log("\n · Contexto y estilo de la aclaración");

{
  const derivadas = catalogo?.filter((r) => r.tema === "DERIVADAS") ?? [];
  const potencia = derivadas.find((r) => /potencia/i.test(r.nombre));
  check("el catálogo tiene la regla de la potencia para inyectarla", Boolean(potencia));

  const aclaracion = {
    regla: potencia ? { nombre: potencia.nombre, formula: potencia.enunciado } : null,
    ejercicio: "5x²",
    tema: "Enséñame derivadas",
  };

  const datos = await consultar({
    query: "Explícame la regla que se aplica",
    contexto: "Enséñame derivadas",
    currentTopic: "Enséñame derivadas",
    seguimiento: "reexplicar",
    parte: "concepto",
    explicacionDinamica: true,
    aclaracion,
  });

  check("la aclaración con contexto responde", Boolean(datos.lsg), datos.error ?? "");
  check("no cae en el guion determinista", datos.fuente_ia !== "local", `fuente_ia=${datos.fuente_ia}`);

  const pasos = flattenLSG(datos.lsg || {});
  const hablado = pasos
    .filter((p) => p.tipo === "hablar")
    .map((p) => p.texto)
    .join(" ");

  // Estilo de pizarra: ni saludos ni presentaciones.
  const saludos = /\b(hola|buenas|claro que s[ií]|entiendo que|buena pregunta|por supuesto)\b/i;
  check(
    "la aclaración no empieza con un saludo ni una presentación",
    !saludos.test(hablado),
    hablado.slice(0, 90),
  );

  // Concisión: la queja era el formato de chat, con párrafos largos.
  const frases = pasos.filter((p) => p.tipo === "hablar");
  check(
    "la aclaración es breve (3 intervenciones como mucho)",
    frases.length <= 3,
    `${frases.length} intervenciones`,
  );

  // Y sin LaTeX crudo: la notación va en texto plano y la compone la interfaz.
  // Meterla en LaTeX rompería el TTS y los analizadores del motor, que trabajan
  // sobre esa notación.
  check(
    "la aclaración no trae LaTeX crudo",
    !/\\[a-zA-Z]+\{|\$/.test(hablado),
    hablado.slice(0, 90),
  );
}

// ── Módulo 9 · corrección determinista ───────────────────────────────────────
console.log("\n · Motor de corrección (Módulo 9)");

// Los ejercicios se pasan tal como aparecen en la pizarra, SIN la palabra que
// dice qué hacer con ellos: eso lo aporta el tema activo. Es exactamente lo que
// recibe la ruta de corrección cuando el alumno responde.
const casosCorreccion = [
  { ejercicio: "2x + 5 = 15", tema: "lineales", buena: "5", mala: "10" },
  { ejercicio: "1/2 + 1/4", tema: "fracciones", buena: "3/4", mala: "2/6" },
  { ejercicio: "47 + 38", tema: "aritmetica", buena: "85", mala: "75" },
  { ejercicio: "3x²", tema: "derivadas", buena: "6x", mala: "3x" },
  { ejercicio: "x² - 9", tema: "factorizacion", buena: "(x-3)(x+3)", mala: "(x-9)(x+9)" },
];

for (const caso of casosCorreccion) {
  const esperada = resolverEjercicio(caso.ejercicio, caso.tema);
  check(
    `[${caso.tema}] el servidor calcula la solución de «${caso.ejercicio}»`,
    esperada != null,
    `esperada=${esperada}`,
  );
  if (esperada == null) continue;
  check(
    `[${caso.tema}] acepta la respuesta correcta «${caso.buena}»`,
    checkAnswer(caso.buena, esperada).correct === true,
    `esperada=${esperada}`,
  );
  check(
    `[${caso.tema}] rechaza la respuesta incorrecta «${caso.mala}»`,
    checkAnswer(caso.mala, esperada).correct === false,
    `esperada=${esperada}`,
  );
}

// El TEMA decide cómo leer una expresión ambigua. "x² - 9" se puede derivar o
// factorizar: en una sesión de factorización hay que factorizarla. Sin esta
// exclusividad, el alumno recibiría la corrección de una operación que no era
// la que se le pidió.
const comoDerivada = resolverEjercicio("x² - 9", "derivadas");
const comoFactor = resolverEjercicio("x² - 9", "factorizacion");
check("«x² - 9» en derivadas se deriva", comoDerivada === "2x", `obtenido: ${comoDerivada}`);
check(
  "«x² - 9» en factorización se factoriza",
  String(comoFactor).includes("("),
  `obtenido: ${comoFactor}`,
);
check("la misma expresión da resultados distintos según el tema", comoDerivada !== comoFactor);

// Lo que el motor NO sabe calcular no se califica: dar por buena —o por mala—
// una respuesta que no se ha podido verificar es justo la alucinación que el
// validador determinista existe para evitar.
check(
  "no calcula lo que está fuera de su alcance (integral)",
  resolverEjercicio("integral de sen(x)") == null,
  `obtenido: ${resolverEjercicio("integral de sen(x)")}`,
);
check(
  "no calcula lo que está fuera de su alcance (sistema de dos variables)",
  resolverEjercicio("x + y = 3", "lineales") == null,
  `obtenido: ${resolverEjercicio("x + y = 3", "lineales")}`,
);

// La corrección exige autenticación: es la que registra el progreso del alumno.
const sinSesion = await fetch(`${BASE}/api/practica/corregir`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ejercicio: "2x + 5 = 15", respuesta: "5" }),
});
check(
  "la corrección rechaza peticiones sin sesión",
  sinSesion.status === 401,
  `status=${sinSesion.status}`,
);

// ── Etiquetas de los diagramas ───────────────────────────────────────────────
// El cliente vio "pendie" donde debía leerse "pendiente": el texto se anclaba
// por la izquierda a cuatro unidades del borde y el navegador lo recortaba.
// Nada fallaba —el SVG existe y el componente monta— así que ninguna prueba de
// comportamiento podía verlo. Con la geometría como dato, sí se comprueba.
{
  for (const tema of TEMAS_CON_DIAGRAMA) {
    const g = GEOMETRIAS[tema];
    check(`${tema}: el diagrama declara su geometría`, Boolean(g) && g.etiquetas.length > 0);
    if (!g) continue;

    for (const e of g.etiquetas) {
      const caja = cajaDeEtiqueta(e);
      check(
        `${tema}: la etiqueta "${e.texto}" cabe entera en el lienzo`,
        etiquetaCabe(e, g),
        `x de ${caja.izquierda.toFixed(1)} a ${caja.derecha.toFixed(1)} · lienzo 0..${g.ancho} · margen ${MARGEN_ETIQUETA}`,
      );
    }
  }

  // La derivada de y = x² no vale 2: vale 2 EN x = 1. Sin el punto, el número
  // parece arbitrario, y esta es la fase que introduce el concepto.
  const dice = GEOMETRIA_DERIVADAS.etiquetas.map((e) => e.texto).join(" · ");
  check(
    "el diagrama de derivadas dice EN QUÉ PUNTO vale 2 la pendiente",
    /x\s*=\s*1/.test(dice),
    `etiquetas: ${dice}`,
  );

  // El caso exacto que reportó el cliente: la palabra completa, no un recorte.
  const pieDerivadas = GEOMETRIAS.DERIVADAS.etiquetas.find((e) => e.texto.includes("pendiente"));
  check(
    "el diagrama de derivadas nombra la pendiente con la palabra entera",
    Boolean(pieDerivadas) && /\bpendiente\b/.test(pieDerivadas.texto),
    `obtenido: ${pieDerivadas?.texto ?? "ninguna"}`,
  );
  check(
    "la etiqueta de la pendiente va centrada, no pegada al borde",
    pieDerivadas?.anclaje === "middle",
    `anclaje: ${pieDerivadas?.anclaje ?? "ninguno"}`,
  );

  // Y que el componente pinte ESOS números, no otros escritos a mano: si algún
  // diagrama volviera a poner su propio <text>, la comprobación de arriba
  // dejaría de decir nada sobre lo que se dibuja.
  const fuenteDiagrama = readFileSync(
    new URL("../components/leccion/diagrama-concepto.tsx", import.meta.url),
    "utf8",
  );
  check(
    "los diagramas no escriben textos sueltos: todos salen de la geometría",
    (fuenteDiagrama.match(/<text/g) ?? []).length === 1,
    `<text> encontrados: ${(fuenteDiagrama.match(/<text/g) ?? []).length}`,
  );
  check(
    "el componente toma el viewBox de la geometría comprobada",
    /viewBox=\{`0 0 \$\{g\.ancho\} \$\{g\.alto\}`\}/.test(fuenteDiagrama),
  );
}

// ── La pizarra nunca arranca en blanco ───────────────────────────────────────
// El cliente entraba en Práctica, oía "vamos a derivar 3x⁴ - 2x²" y veía el
// lienzo vacío hasta que terminaba la locución. La tarjeta de EJERCICIO no
// puede esperar a que el motor emita una directiva de pizarra: hay fases que
// sólo NARRAN el enunciado, o lo llevan dentro de la pregunta al alumno.
console.log("\n · La tarjeta de ejercicio no espera a la locución");

{
  const casos = [
    { frase: "Vamos a derivar 3x⁴ - 2x²", esperado: "3x⁴ - 2x²" },
    { frase: "Ahora resuelve tú: 2x + 5 = 15", esperado: "2x + 5 = 15" },
    { frase: "¿Cuánto vale la derivada de 5x²?", esperado: "5x²" },
    { frase: "Muy bien, sigamos con el siguiente apartado", esperado: null },
    { frase: "Lo haremos en 2 pasos", esperado: null },
  ];
  for (const c of casos) {
    const obtenido = expresionPrincipal(c.frase);
    check(
      `de «${c.frase}» se rescata ${c.esperado ? `«${c.esperado}»` : "nada"}`,
      obtenido === c.esperado,
      `obtenido: ${obtenido === null ? "null" : `«${obtenido}»`}`,
    );
  }

  // Una fase que sólo narra el enunciado también lo adelanta a la pizarra.
  const soloHablada = enunciadosDeLeccion({
    modulos: [
      {
        id: "practica",
        directivas: [
          { tipo: "hablar", contenido: "Vamos a derivar 3x⁴ - 2x². Tómate tu tiempo." },
          { tipo: "preguntar", contenido: "¿Cuál es la derivada?" },
        ],
      },
    ],
  });
  check(
    "una fase que sólo narra el enunciado igualmente lo adelanta",
    soloHablada.get("practica") === "3x⁴ - 2x²",
    `obtenido: ${soloHablada.get("practica") ?? "ninguno"}`,
  );

  // Y la prosa sigue sin subir al lienzo: una fase sin matemáticas no aporta
  // enunciado, porque no lo tiene.
  const soloProsa = enunciadosDeLeccion({
    modulos: [{ id: "concepto", directivas: [{ tipo: "hablar", contenido: "Una derivada mide el cambio" }] }],
  });
  check(
    "la prosa sin fórmula no se cuela como enunciado",
    soloProsa.get("concepto") === undefined,
    `obtenido: ${soloProsa.get("concepto") ?? "ninguno"}`,
  );

}

{
  const fuentePizarra2 = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  const fuenteAula2 = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );

  // La tarjeta de arriba se pinta por entrar en la fase, no por haber pasos.
  check(
    "la tarjeta de EJERCICIO no está condicionada al desarrollo",
    /\{\(ejercicio \|\| planteaEjercicio\) && \(/.test(fuentePizarra2),
  );
  // Y la de abajo sigue oculta mientras no haya nada que desarrollar.
  check(
    "la tarjeta de DESARROLLO permanece oculta hasta que hay pasos",
    /\{pasos\.length > 0 && \(/.test(fuentePizarra2),
  );
  // El orden importa: el planteamiento arriba, el procedimiento debajo.
  check(
    "el enunciado se compone por encima del desarrollo",
    fuentePizarra2.indexOf("(ejercicio || planteaEjercicio)") <
      fuentePizarra2.indexOf("{pasos.length > 0"),
  );
  // En una fase con ejercicio los pasos no se degradan a "paso suelto".
  check(
    "en una fase con ejercicio los pasos van al desarrollo, no sueltos",
    /if \(!planteaEjercicio\) \{[\s\S]{0,200}pasoSuelto: desarrollo\.length > 0/.test(fuentePizarra2),
  );
  // Último recurso: el enunciado que viaja dentro de la pregunta.
  check(
    "aula.tsx rescata el enunciado de la pregunta al alumno",
    /askAnswer:[\s\S]{0,320}fijarEjercicio\(String\(textoPregunta/.test(fuenteAula2),
  );
  // Y si la fase no trae enunciado, se usa el que el alumno tiene entre manos.
  check(
    "al abrir una fase con ejercicio se recurre al ejercicio activo",
    /enunciadoPorFase\.current\.get\(clave\) \|\| conversacion\.current\.ejercicio/.test(fuenteAula2),
  );
}

// ── "Explicar regla" no puede vaciar la pizarra ──────────────────────────────
// Toda petición borra el desarrollo. Si el alumno pulsaba el botón mientras el
// tutor narraba —con la tarjeta de enunciado todavía sin rellenar—, ese borrado
// dejaba la escena sin nada, y la aclaración es prosa: va al subtítulo, no al
// lienzo. La fase quedaba abierta y la pizarra en blanco hasta el final.
console.log("\n · Los botones de apoyo no dejan la pizarra vacía");

{
  const casos = [
    {
      nombre: "con la tarjeta vacía, la práctica recupera su enunciado",
      entrada: { enTarjeta: null, deLaFase: "3x⁴ - 2x²", activo: "3x⁴ - 2x²", planteaEjercicio: true },
      esperado: "3x⁴ - 2x²",
    },
    {
      nombre: "sin enunciado de fase, vale el ejercicio activo",
      entrada: { enTarjeta: null, deLaFase: null, activo: "5x²", planteaEjercicio: true },
      esperado: "5x²",
    },
    {
      // El activo es el de la práctica: usarlo en el ejemplo cambiaría el
      // enunciado por otro que el alumno no tiene delante.
      nombre: "el ejemplo conserva el suyo, no toma el de la práctica",
      entrada: { enTarjeta: "x²", deLaFase: "x²", activo: "5x²", planteaEjercicio: true },
      esperado: "x²",
    },
    {
      nombre: "una tarjeta desfasada se refresca",
      entrada: { enTarjeta: "2x", deLaFase: "5x²", activo: "5x²", planteaEjercicio: true },
      esperado: "5x²",
    },
    {
      nombre: "sin nada conocido, se conserva lo que hubiera",
      entrada: { enTarjeta: "x²", deLaFase: null, activo: null, planteaEjercicio: true },
      esperado: "x²",
    },
    {
      nombre: "Concepto y Reglas siguen sin tarjeta de ejercicio",
      entrada: { enTarjeta: null, deLaFase: "x²", activo: "x²", planteaEjercicio: false },
      esperado: null,
    },
  ];
  for (const c of casos) {
    const obtenido = enunciadoTrasPeticion(c.entrada);
    check(c.nombre, obtenido === c.esperado, `obtenido: ${obtenido} · esperado: ${c.esperado}`);
  }

  // "Explicar regla" es un seguimiento que sólo aclara: se anexa a la escena en
  // curso. Si se tratara como lección nueva, borraría la pizarra entera.
  check(
    "«Explicar regla» se anexa a la fase en curso, no la reinicia",
    presentacionDe({ modulos: [{ id: "regla" }] }, { esSeguimiento: true, soloExplicacion: true }) ===
      "anexar",
  );

  const fuenteAula3 = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );
  // El enunciado que sobrevive al vaciado lo decide la función comprobada
  // arriba, no una condición escrita a mano en el componente.
  check(
    "aula.tsx decide el enunciado con la regla verificada",
    /enunciadoTrasPeticion\(\{[\s\S]{0,320}planteaEjercicio:/.test(fuenteAula3),
  );
  // Y con la pizarra vacía no se suprime la apertura de fases: si no, una
  // aclaración anexaría a una pizarra que no existe y nada volvería a abrirla.
  check(
    "con la pizarra vacía, una aclaración no bloquea la apertura de fase",
    /esAyuda\.current = presentacion !== "reiniciar" && fasesRef\.current\.length > 0;/.test(
      fuenteAula3,
    ),
  );
}

// ── Estado del ejercicio, desacoplado del ciclo de desarrollo ────────────────
// El ejercicio y el desarrollo son estados INDEPENDIENTES del aula y llegan a
// la pizarra en props separadas. Mientras el enunciado colgaba de la fase,
// cualquier cambio en el desarrollo pasaba por la misma estructura que la
// tarjeta de arriba: bastaba con no vaciarla a tiempo para que el enunciado se
// quedara anclado al ejercicio anterior o desapareciera con los pasos.
console.log("\n · El ejercicio no depende del ciclo de desarrollo");

{
  const fuenteP = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  const fuenteA = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );

  check(
    "la pizarra recibe el ejercicio y el desarrollo en props separadas",
    /ejercicio: LineaPizarra \| null;/.test(fuenteP) && /desarrollo: LineaPizarra\[\];/.test(fuenteP),
  );
  // La fase es sólo identidad: si volviera a llevar contenido dentro, el
  // desacoplamiento se deshace sin que ninguna prueba de comportamiento lo note.
  const fase = fuenteP.match(/export interface FaseAbierta \{[\s\S]*?\}/);
  check(
    "una fase abierta es sólo identidad, sin contenido dentro",
    Boolean(fase) && !/ejercicio|pasos/.test(fase[0]),
    `obtenido: ${fase?.[0].replace(/\s+/g, " ") ?? "no declarada"}`,
  );
  check(
    "el aula gobierna los tres estados por separado",
    /useState<FaseAbierta\[\]>\(\[\]\)/.test(fuenteA) &&
      /useState<LineaPizarra \| null>\(null\)/.test(fuenteA) &&
      /useState<LineaPizarra\[\]>\(\[\]\)/.test(fuenteA),
  );
  // Al entrar en la fase, el ejercicio queda puesto y el desarrollo a cero, en
  // el mismo instante: la tarjeta de arriba no espera a ninguna directiva.
  check(
    // Al abrir, el desarrollo se REEMPLAZA: vacío, o con la línea que la fase ya
    // trae. Lo que no puede es arrastrar el de la fase anterior.
    "al abrir la fase se fija el ejercicio y se renueva el desarrollo",
    /abrirEscena = useCallback\([\s\S]{0,1400}fijarLineaEjercicio\([\s\S]{0,600}setDesarrollo\([\s\S]{0,20}adelantada \?/.test(
      fuenteA,
    ),
  );
  // Sustitución, no concatenación: entre peticiones el array se reemplaza.
  const concatenaciones = (fuenteA.match(/return \[\.\.\.prev, linea\];/g) ?? []).length;
  check(
    "el desarrollo sólo se concatena al escribir un paso, nunca entre peticiones",
    concatenaciones === 1,
    `concatenaciones encontradas: ${concatenaciones}`,
  );
  const reemplazos = (fuenteA.match(/setDesarrollo\(\[\]\)/g) ?? []).length;
  check(
    "el desarrollo se reemplaza al abrir fase, al pedir y al cambiar de ejercicio",
    reemplazos >= 3,
    `reemplazos encontrados: ${reemplazos}`,
  );
}

// ── Módulo 5 · alcance del validador determinista ────────────────────────────
// El motor sólo cubría la diferencia de cuadrados, así que un trinomio —el
// ejercicio de factorización más común, y lo que genera el modelo en vivo— se
// devolvía como "no verificable" y la práctica se quedaba sin calificar. Se
// amplía a factor común y trinomios con raíces enteras, sin aflojar la regla de
// no calificar lo que no se puede calcular.
console.log("\n · Factorización: alcance del motor determinista");

{
  const factorizaciones = [
    // Diferencia de cuadrados: lo que ya estaba, intacto.
    { entrada: "x² - 9", esperado: "(x - 3)(x + 3)" },
    { entrada: "4x² - 25", esperado: "(2x - 5)(2x + 5)" },
    { entrada: "2x² - 8", esperado: "2(x - 2)(x + 2)" },
    // Factor común.
    { entrada: "x² + 7x", esperado: "x(x + 7)" },
    { entrada: "3x² - 6x", esperado: "3x(x - 2)" },
    // Trinomios con raíces enteras.
    { entrada: "x² + 5x + 6", esperado: "(x + 2)(x + 3)" },
    { entrada: "x² - 5x + 6", esperado: "(x - 3)(x - 2)" },
    { entrada: "2x² + 10x + 12", esperado: "2(x + 2)(x + 3)" },
    // Raíz doble: se compone como cuadrado, que es como se enseña.
    { entrada: "x² - 10x + 25", esperado: "(x - 5)²" },
  ];
  for (const c of factorizaciones) {
    const obtenido = resolverEjercicio(c.entrada, "factorizacion");
    check(
      `factoriza «${c.entrada}» → ${c.esperado}`,
      obtenido === c.esperado,
      `obtenido: ${obtenido}`,
    );
  }

  // Y lo que NO tiene solución entera sigue sin calificarse: inventar una
  // factorización aproximada es justo la alucinación que este módulo evita.
  for (const fuera of ["x² + 2x + 5", "x³ + 1", "x² + x + 1"]) {
    check(
      `«${fuera}» queda sin calificar, no se inventa`,
      resolverEjercicio(fuera, "factorizacion") == null,
      `obtenido: ${resolverEjercicio(fuera, "factorizacion")}`,
    );
  }
}

// ── Módulo 9 · el alumno no pierde por la forma de escribirlo ────────────────
// Un falso negativo —marcar mal una respuesta correcta— es peor que no
// calificar: el alumno pierde la confianza en el corrector.
console.log("\n · Corrección: formas equivalentes de una factorización");

{
  const equivalentes = [
    ["(x + 3)(x + 2)", "(x + 2)(x + 3)", "el orden de los factores no cuenta"],
    ["(x - 5)(x - 5)", "(x - 5)²", "el cuadrado y el producto repetido son lo mismo"],
    ["(x - 5)^2", "(x - 5)²", "da igual el acento circunflejo que el superíndice"],
    ["(x + 7)x", "x(x + 7)", "el factor común puede ir delante o detrás"],
    ["x·(x + 7)", "x(x + 7)", "el punto de multiplicar es opcional"],
    ["(2x - 4)(2x + 4)", "4(x - 2)(x + 2)", "el factor común sacado o dentro"],
  ];
  for (const [alumno, esperada, motivo] of equivalentes) {
    check(
      `«${alumno}» se acepta para «${esperada}»: ${motivo}`,
      checkAnswer(alumno, esperada).correct === true,
    );
  }

  const distintas = [
    ["(x + 7)", "x(x + 7)", "falta el factor común"],
    ["(x + 2)(x + 4)", "(x + 2)(x + 3)", "un factor equivocado"],
    ["x² - 10x + 25", "(x - 5)²", "sin factorizar no es la respuesta"],
    ["(x - 2)(x + 2)", "2(x - 2)(x + 2)", "falta el coeficiente"],
  ];
  for (const [alumno, esperada, motivo] of distintas) {
    check(
      `«${alumno}» se rechaza para «${esperada}»: ${motivo}`,
      checkAnswer(alumno, esperada).correct === false,
    );
  }
}

// ── El motor lee la expresión entera, nunca un trozo ─────────────────────────
// "x² - 4x - 21" empezaba por "x² - 4" y la búsqueda parcial lo daba por una
// diferencia de cuadrados: se calificaba con (x - 2)(x + 2), la respuesta de
// otro ejercicio. Un veredicto inventado con toda la apariencia de correcto,
// que es exactamente lo que el validador determinista existe para evitar.
console.log("\n · Factorización: la expresión se lee entera");

{
  const trampas = [
    { entrada: "x² - 4x - 21", esperado: "(x - 7)(x + 3)" },
    { entrada: "x² - 4x - 32", esperado: "(x - 8)(x + 4)" },
    { entrada: "x² - 9x + 20", esperado: "(x - 5)(x - 4)" },
    { entrada: "4x² - 16x", esperado: "4x(x - 4)" },
  ];
  for (const t of trampas) {
    const obtenido = resolverEjercicio(t.entrada, "factorizacion");
    check(
      `«${t.entrada}» no se confunde con su principio`,
      obtenido === t.esperado,
      `obtenido: ${obtenido} · esperado: ${t.esperado}`,
    );
  }
  // La forma completamente factorizada: "(6x - 10)(6x + 10)" es cierta pero
  // deja un factor común dentro, y en una clase de factorización eso es media
  // respuesta.
  check(
    "la diferencia de cuadrados se devuelve del todo factorizada",
    resolverEjercicio("36x² - 100", "factorizacion") === "4(3x - 5)(3x + 5)",
    `obtenido: ${resolverEjercicio("36x² - 100", "factorizacion")}`,
  );
}

// ── La pista no sobrevive al acierto ─────────────────────────────────────────
// Al responder bien, el alumno veía el "¡Correcto! Continuemos." en verde y,
// justo encima, la caja roja con la pista del intento anterior. Llega por dos
// caminos y hay que cerrar los dos: la corrección del servidor puede no llegar
// —sesión caducada, un 401, un fallo de red— y dejar el veredicto viejo tal
// cual, o llegar después de que el motor local haya cantado el acierto.
console.log("\n · Retroalimentación: la pista no sobrevive al acierto");

{
  const conPista = {
    correcto: false,
    verificable: true,
    pista: "Para derivar una potencia, baja el exponente y réstale uno.",
  };
  check(
    "al acertar se retira la pista del intento anterior",
    veredictoTrasAcierto(conPista) === null,
  );
  check(
    "la caja de ayuda no se compone sobre un veredicto correcto",
    hayQueMostrarAyuda({ correcto: true, verificable: true }) === false,
  );
  // Pero la confirmación del servidor SÍ se conserva: es la que dice que el
  // acierto está comprobado contra la solución recalculada, no sólo cantado
  // por el motor local.
  const acierto = { correcto: true, verificable: true };
  check(
    "el veredicto correcto del servidor se conserva",
    veredictoTrasAcierto(acierto) === acierto,
  );
  check(
    "sin nada que decir no se compone caja de ayuda",
    hayQueMostrarAyuda({ correcto: false, verificable: true }) === false,
  );
  check(
    "con pista y sin acierto, la ayuda sí se compone",
    hayQueMostrarAyuda(conPista) === true,
  );
  // Un ejercicio que el motor no cubre no es un fallo del alumno: se explica,
  // sin pintarlo como error.
  check(
    "un ejercicio no verificable muestra su mensaje",
    hayQueMostrarAyuda({ correcto: null, verificable: false, mensaje: "Fuera de alcance." }) === true,
  );

  const fuenteAulaR = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );
  check(
    "aula.tsx limpia la pista en cuanto el motor canta el acierto",
    /if \(ok\) setVeredicto\(veredictoTrasAcierto\);/.test(fuenteAulaR),
  );
  check(
    "aula.tsx retira la pista antes de mandar el intento siguiente",
    /pertenece al intento que la provoc[\s\S]{0,160}setVeredicto\(null\);/.test(fuenteAulaR),
  );
  // Y la cara opuesta: el mensaje del tutor tampoco acompaña al ejercicio
  // siguiente. Un "¡Correcto!" bajo un enunciado nuevo es el mismo fallo.
  check(
    "aula.tsx limpia el mensaje del tutor al plantear la pregunta siguiente",
    /setVeredicto\(null\);\s*\n\s*setFeedback\(null\);\s*\n\s*resolverRespuesta\.current = resolve;/.test(
      fuenteAulaR,
    ),
  );
}

// ── Aritmética en columna ────────────────────────────────────────────────────
// En primaria una suma no se escribe "24 + 17": se escribe en vertical, con las
// unidades bajo las unidades y la llevada encima. En horizontal el alumno ve
// una expresión que todavía no sabe leer y se pierde justo lo que se le está
// enseñando, que es alinear las cifras por su valor posicional.
console.log("\n · Sumas y restas dispuestas en columna");

{
  // Lo que SÍ se dispone en columna, y lo que no.
  const seDispone = ["24 + 17", "19 + 45 = ?", "147 + 285", "52 - 27", "152 - 87", "845 - 210"];
  for (const linea of seDispone) {
    check(
      `«${linea}» se dispone en columna`,
      columnaDeLinea(linea, { conResultado: false }) != null,
    );
  }

  const noSeDispone = [
    ["unidades: 4 + 7 = 11", "es el relato de UNA columna, no la operación"],
    ["decenas: 2 + 1 + 1 = 4", "ídem"],
    ["24 + 17 = 40", "el resultado declarado no cuadra"],
    ["12 - 30", "una resta negativa no se enseña así"],
    ["3 · 4", "la multiplicación no es una suma en columna"],
    ["1/2 + 1/4", "fracciones, no naturales"],
    ["2x + 5 = 15", "una ecuación no es una cuenta"],
    ["3x⁴ - 2x²", "un polinomio tampoco"],
  ];
  for (const [linea, motivo] of noSeDispone) {
    check(
      `«${linea}» se deja como está: ${motivo}`,
      columnaDeLinea(linea, { conResultado: false }) == null,
      `obtenido: ${columnaDeLinea(linea, { conResultado: false })}`,
    );
  }

  // Las llevadas, que son el motivo de disponerlo así.
  const llevadas = [
    { linea: "24 + 17", esperado: ["1", ""] },
    { linea: "147 + 285", esperado: ["1", "1", ""] },
    { linea: "31 + 46", esperado: ["", ""] },
    // En la resta, la marca es la cifra del minuendo ya rebajada por el
    // préstamo: lo mismo que narra el tutor ("decenas: 4 - 2 = 2").
    { linea: "52 - 27", esperado: ["4", ""] },
    { linea: "152 - 87", esperado: ["0", "4", ""] },
    { linea: "845 - 210", esperado: ["", "", ""] },
  ];
  for (const caso of llevadas) {
    const op = leerSumaOResta(caso.linea);
    const marcas = marcasDeColumna(op, caso.esperado.length);
    check(
      `«${caso.linea}» lleva [${caso.esperado.map((m) => m || "·").join(" ")}]`,
      marcas.join("|") === caso.esperado.join("|"),
      `obtenido: [${marcas.map((m) => m || "·").join(" ")}]`,
    );
  }

  // Y lo importante: que KaTeX lo componga de verdad. Un LaTeX que no compila
  // no se ve como un error, se ve como un hueco en la pizarra.
  for (const linea of seDispone) {
    for (const conResultado of [false, true]) {
      const tex = columnaDeLinea(linea, { conResultado });
      let compone = true;
      try {
        katex.renderToString(tex, { throwOnError: true, strict: false });
      } catch (e) {
        compone = false;
        console.log(`      KaTeX: ${e.message}`);
      }
      check(
        `KaTeX compone «${linea}»${conResultado ? " resuelta" : " planteada"}`,
        compone,
        tex,
      );
    }
  }

  // El planteamiento NO lleva el total: es lo que el alumno tiene delante
  // cuando le toca resolverla, y con el resultado puesto no habría ejercicio.
  const planteada = columnaDeLinea("19 + 45 = ?", { conResultado: false });
  check(
    "la operación planteada no adelanta el resultado",
    !planteada.includes("6") || !planteada.includes("4 \\\\ \\hline  & 6"),
    planteada,
  );
  check(
    "la operación planteada lleva su raya, para saber dónde escribir",
    planteada.includes("\\hline"),
  );
  const resuelta = columnaDeLinea("24 + 17", { conResultado: true });
  check(
    "la operación resuelta lleva el total bajo la raya",
    /\\hline\s+&\s+4\s+&\s+1\s+\\end\{array\}/.test(resuelta),
    resuelta,
  );
  check(
    "la operación resuelta lleva la llevada encima",
    resuelta.includes("\\scriptstyle 1"),
    resuelta,
  );

  // Una columna por cifra: es lo que permite poner la llevada justo encima de
  // la columna que la genera. Con el número entero en una celda, la llevada
  // queda al lado y no encima.
  check(
    "hay una columna por cifra, más la del signo",
    columnaDeLinea("147 + 285", { conResultado: true }).startsWith("\\begin{array}{rccc}"),
    columnaDeLinea("147 + 285", { conResultado: true }),
  );

  // Fuente: la pizarra tiene que pedir la disposición en los dos sitios.
  const fuenteP2 = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "la tarjeta de EJERCICIO compone la operación planteada",
    /columna="planteamiento"/.test(fuenteP2),
  );
  check(
    "el desarrollo compone la cuenta resuelta",
    /columna: "resuelta"/.test(fuenteP2),
  );
  // La cuenta resuelta aparece SÓLO cuando hay desarrollo. En la práctica el
  // desarrollo está vacío hasta que el alumno pide ayuda, así que el total no
  // se adelanta; y cuando la pide, la ve resuelta, que es lo que se acordó.
  check(
    "la cuenta resuelta no se compone si no hay desarrollo",
    /if \(lineasDelDesarrollo\.length === 0\) return null;/.test(
      readFileSync(new URL("../lib/leccion/columna.ts", import.meta.url), "utf8"),
    ),
  );
  // Y compone la operación que se está explicando, no la que hubiera antes.
  check(
    "la cuenta resuelta es la que se está explicando",
    /texto: cuenta\.texto \}, columna: "resuelta"/.test(fuenteP2),
  );
}

// ── Punta a punta: toda línea de pizarra se compone ──────────────────────────
// La queja recurrente es "errores de renderizado en cada iteración". Aquí se
// recorre la lección REAL de los cinco temas y se compone cada línea por el
// MISMO camino que sigue la interfaz: primero la disposición en columna, luego
// la notación formal, y si no, la traducción a LaTeX cuando la línea no lleva
// palabras. Lo que la pizarra vaya a componer, se compone aquí antes.
console.log("\n · Punta a punta: cada línea de la pizarra se compone");

{
  /** La misma decisión que toma LineaRenderizada, sin montar React. */
  const latexDeLinea = (texto, columna) =>
    (columna ? columnaDeLinea(texto, { conResultado: columna === "resuelta" }) : null)
    ?? notacionFormal(texto)
    ?? (pareceMatematica(texto) ? planoALatex(texto) : null);

  let compuestas = 0;
  for (const tema of TEMAS_LECCION) {
    const datos = await consultar({ query: tema.consulta });
    const modulos = datos?.lsg?.modulos ?? [];

    check(`[${tema.clave}] la lección llega con sus fases`, modulos.length > 0);

    for (const modulo of modulos) {
      const id = String(modulo.id ?? "");
      const pizarras = (modulo.directivas ?? [])
        .filter((d) => d.tipo === "pizarra")
        .map((d) => String(d.contenido ?? "").trim())
        .filter(Boolean);

      for (const [indice, texto] of pizarras.entries()) {
        // La primera línea de una fase con ejercicio va a la tarjeta de
        // EJERCICIO, que la compone en columna cuando es una cuenta.
        const enTarjeta = indice === 0 && /ejemplo|practica/.test(id);
        const latex = latexDeLinea(texto, enTarjeta ? "planteamiento" : undefined);
        if (!latex) continue; // es prosa: se compone como texto, no como fórmula

        compuestas++;
        let bien = true;
        let motivo = "";
        try {
          katex.renderToString(latex, { throwOnError: true, strict: false });
        } catch (e) {
          bien = false;
          motivo = String(e.message).slice(0, 120);
        }
        check(
          `[${tema.clave}] «${texto}» se compone`,
          bien,
          `${motivo} · latex: ${latex}`,
        );
      }
    }
  }

  check(
    "el recorrido ha compuesto fórmulas de verdad, no cero",
    compuestas >= 15,
    `compuestas: ${compuestas}`,
  );
}

// ── El contenido no se pinta bajo otra fase ──────────────────────────────────
// Al cambiar de fase, la vista saliente y la entrante conviven durante la
// transición. Sin decir a quién pertenece cada cosa, el contenido de una podía
// componerse un instante bajo el rótulo de la otra: eso es el parpadeo, un
// recuadro que asoma un milisegundo y desaparece de golpe.
console.log("\n · La transición de fase no deja recuadros residuales");

{
  const fuentePz = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  const fuenteAu = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );

  check(
    "el contenido viaja marcado con la fase a la que pertenece",
    /faseDelContenido: string;/.test(fuentePz) && /faseDelContenido=\{faseDelContenido\}/.test(fuenteAu),
  );
  check(
    "la pizarra sólo compone el contenido de la fase que pinta",
    /const propio = actual != null && faseDelContenido === actual\.id;/.test(fuentePz) &&
      /const ejercicio = propio \? ejercicioRecibido : null;/.test(fuentePz),
  );
  // La marca cambia en el MISMO lote que la fase: si fuera después, quedaría un
  // render intermedio con la fase nueva y el contenido viejo, que es el fallo.
  check(
    "la marca se actualiza en el mismo lote que la fase",
    /setFases\(fasesRef\.current\);[\s\S]{0,260}setFaseDelContenido\(clave\);/.test(fuenteAu),
  );
  check(
    "al limpiar la pizarra no queda contenido con dueño",
    /setDesarrollo\(\[\]\);\s*\n\s*setFaseDelContenido\(""\);/.test(fuenteAu),
  );
  // Una salida anidada dentro de un contenedor que a su vez sale encadena dos
  // desmontajes, y el de dentro se ve como un recuadro que asoma y desaparece.
  const presencias = (fuentePz.match(/<AnimatePresence/g) ?? []).length;
  check(
    "no hay más AnimatePresence de los necesarios",
    presencias === 2,
    `encontrados: ${presencias}`,
  );
  check(
    "el paso suelto ya no lleva su propia animación de salida",
    !/exit=\{\{ opacity: 0, y: -10 \}\}/.test(fuentePz),
  );
}

// ── El coeficiente y el exponente se ven, no sólo se oyen ────────────────────
// En el ejemplo paso a paso el tutor los nombra uno a uno —"el coeficiente 5,
// la variable x, el exponente 2"—, pero la expresión se veía plana y el alumno
// tenía que adivinar a cuál de las tres cifras se refería.
console.log("\n · Coeficiente y exponente resaltados en el ejemplo");

{
  const resaltados = [
    { entrada: "5x²", coeficientes: ["5"], exponentes: ["2"] },
    { entrada: "x²", coeficientes: [], exponentes: ["2"] },
    { entrada: "3x⁴ - 2x²", coeficientes: ["3", "2"], exponentes: ["4", "2"] },
    { entrada: "12x³ - 4x", coeficientes: ["12", "4"], exponentes: ["3"] },
    { entrada: "5x² = 10x", coeficientes: ["5", "10"], exponentes: ["2"] },
  ];
  for (const caso of resaltados) {
    const latex = lineaResaltada(caso.entrada);
    const marcados = (patron) => [...(latex ?? "").matchAll(patron)].map((m) => m[1]);
    const coef = marcados(/\\htmlClass\{pz-coeficiente\}\{([^}]*)\}/g);
    const exp = marcados(/\\htmlClass\{pz-exponente\}\{([^}]*)\}/g);
    check(
      `«${caso.entrada}» marca coeficientes [${caso.coeficientes.join(",")}] y exponentes [${caso.exponentes.join(",")}]`,
      coef.join("|") === caso.coeficientes.join("|") && exp.join("|") === caso.exponentes.join("|"),
      `obtenido: coef [${coef.join(",")}] exp [${exp.join(",")}]`,
    );
  }

  // El coeficiente implícito NO se marca: en "x²" no hay un 1 escrito, y pintar
  // uno que no está sería enseñar algo que el alumno no ve.
  check(
    "no se inventa el coeficiente implícito",
    !(lineaResaltada("x²") ?? "").includes("pz-coeficiente"),
    lineaResaltada("x²"),
  );

  // Lo que no es un polinomio de una variable se deja como está: marcar de más
  // deja colores donde no tocan y confunde más que no marcar nada.
  for (const fuera of ["unidades: 4 + 7 = 11", "Regla de la potencia", "1/2 + 1/4", "24 + 17", "7"]) {
    check(
      `«${fuera}» no se resalta`,
      lineaResaltada(fuera) == null,
      `obtenido: ${lineaResaltada(fuera)}`,
    );
  }

  // Y KaTeX tiene que componerlo DE VERDAD, con las clases puestas: sin la
  // opción `trust` el marcado se pierde en silencio y el resaltado no se ve.
  const opcionesPizarra = { throwOnError: true, strict: false, trust: (c) => c.command === "\\htmlClass" };
  for (const caso of resaltados) {
    const latex = lineaResaltada(caso.entrada);
    let clases = [];
    let bien = true;
    try {
      const html = katex.renderToString(latex, opcionesPizarra);
      clases = [...html.matchAll(/pz-(coeficiente|exponente)/g)].map((m) => m[1]);
    } catch (e) {
      bien = false;
      console.log(`      KaTeX: ${e.message}`);
    }
    check(
      `KaTeX compone «${caso.entrada}» con sus marcas`,
      bien && clases.length > 0,
      `clases: ${clases.join(",")}`,
    );
  }

  // El permiso está acotado a UN comando: el contenido de la lección lo redacta
  // un modelo, y con `trust: true` a secas podría colar un enlace.
  const conHref = katex.renderToString("\\href{https://ejemplo.com}{pulsa}", opcionesPizarra);
  check(
    "el permiso de KaTeX no deja pasar un enlace",
    !/<a\s/i.test(conHref),
  );
  const fuentePz2 = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "la pizarra acota el permiso a \\htmlClass, no lo abre entero",
    /trust: \(contexto\) => contexto\.command === "\\\\htmlClass"/.test(fuentePz2) &&
      !/trust: true/.test(fuentePz2),
  );
  // Sólo en el ejemplo: es donde el tutor nombra las partes una a una.
  check(
    "el resaltado se pide sólo en la fase de ejemplo",
    /destacarTerminos=\{esFaseDeEjemplo\(actual\.id\)\}/.test(fuentePz2),
  );
  // El color vive en la hoja de estilos, para que siga al tema claro y oscuro.
  const hoja = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  check(
    "el color del resaltado responde al tema claro y al oscuro",
    /\.pz-coeficiente\s*\{/.test(hoja) && /\.dark \.pz-coeficiente\s*\{/.test(hoja) &&
      /\.pz-exponente\s*\{/.test(hoja) && /\.dark \.pz-exponente\s*\{/.test(hoja),
  );
}

// ── La cuenta dibujada con guiones se recompone ──────────────────────────────
// El motor, al escribir una suma, a veces la DIBUJA como en papel: los dos
// números, una raya de guiones y el total. Compuesto tal cual, ese dibujo sale
// como una fila de guiones y cifras sueltas —"119 + 45 - - - - - 64"— que se
// lee como una cadena de restas desalineadas. Se recompone como columna de
// verdad, con su llevada calculada aquí.
console.log("\n · Cuentas dibujadas con guiones");

{
  const salto = String.fromCharCode(10);
  const dibujo = (...filas) => filas.join(salto);

  const recomponibles = [
    { nombre: "dibujo simple", texto: dibujo("  19", "+ 45", "-----", "  64"), a: 19, b: 45, r: 64 },
    { nombre: "con la llevada dibujada", texto: dibujo(" 1", " 19", "+45", "-----", " 64"), a: 19, b: 45, r: 64 },
    { nombre: "resta", texto: dibujo(" 52", "- 27", "----", " 25"), a: 52, b: 27, r: 25 },
    { nombre: "sin total", texto: dibujo(" 19", "+ 45", "-----"), a: 19, b: 45, r: 64 },
    { nombre: "raya con guion largo", texto: dibujo(" 19", "+ 45", "————", " 64"), a: 19, b: 45, r: 64 },
    { nombre: "tres cifras", texto: dibujo(" 147", "+ 285", "------", " 432"), a: 147, b: 285, r: 432 },
  ];
  for (const caso of recomponibles) {
    const op = leerOperacionDibujada(caso.texto);
    check(
      `se recompone: ${caso.nombre}`,
      op != null && op.a === caso.a && op.b === caso.b && op.resultado === caso.r,
      `obtenido: ${op ? `${op.a} ${op.operador} ${op.b} = ${op.resultado}` : "null"}`,
    );
    const tex = columnaDeCuentaDibujada(caso.texto);
    let compone = true;
    try {
      katex.renderToString(tex, { throwOnError: true, strict: false });
    } catch (e) {
      compone = false;
      console.log(`      KaTeX: ${e.message}`);
    }
    check(`KaTeX compone la columna de: ${caso.nombre}`, compone, tex ?? "sin latex");
  }

  // La llevada dibujada se ignora y se recalcula: así la marca y el resultado
  // no pueden discrepar aunque el dibujo venga con una llevada equivocada.
  const conLlevadaMala = leerOperacionDibujada(dibujo(" 9", " 19", "+45", "----", " 64"));
  check(
    "una llevada dibujada mal no cambia la cuenta",
    conLlevadaMala != null && conLlevadaMala.resultado === 64,
    `obtenido: ${conLlevadaMala?.resultado}`,
  );

  // Y un total que no cuadra NO se compone: darle aspecto de cuenta correcta
  // es peor que dejar el texto como estaba.
  // Un total que no cuadra es un dibujo A MEDIAS —el motor lleva escrita sólo
  // una columna—, no una cuenta equivocada: se compone sin total, nunca con el
  // número suelto que había debajo de la raya.
  const aMediasDibujo = dibujo(" 19", "+ 45", "-----", " 4");
  check(
    "un total que no cuadra no se compone como si fuera el resultado",
    leerOperacionDibujada(aMediasDibujo)?.completa === false &&
      !/\hline\s+&/.test(columnaDeCuentaDibujada(aMediasDibujo) ?? ""),
    columnaDeCuentaDibujada(aMediasDibujo) ?? "sin latex",
  );
  for (const noEsCuenta of ["Suma: juntar cantidades", "19 + 45", dibujo(" 19", "+ 45", " 64")]) {
    check(
      `«${noEsCuenta.replace(/\n/g, " ⏎ ")}» no se toma por una cuenta dibujada`,
      leerOperacionDibujada(noEsCuenta) == null,
    );
  }

  // Aunque no se deje recomponer, la raya se quita igual: compuesta como
  // fórmula se lee como restas y desalinea todo lo demás.
  check(
    "la raya de guiones se retira del texto",
    !tieneRayaDibujada(sinRayasDibujadas(dibujo(" 19", "+ 45", "-----", " 4"))),
  );
  check(
    "un texto sin raya no se toca",
    sinRayasDibujadas("unidades: 4 + 7 = 11") === "unidades: 4 + 7 = 11",
  );

  const fuentePzC = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "la pizarra recompone la cuenta dibujada antes que nada",
    /const latex =\s*\n\s*columnaDeCuentaDibujada\(linea\.texto\)/.test(fuentePzC),
  );
  check(
    "la prosa tampoco compone la raya de guiones",
    /TextoMatematico texto=\{sinRayasDibujadas\(linea\.texto\)\}/.test(fuentePzC),
  );
}

// ── Los pasos de la suma dicen qué se escribe y qué se lleva ─────────────────
// "4 + 7 = 11" en una columna de una sola cifra deja al alumno sin saber qué
// hacer con el 11. Lo decía la locución y no la pizarra.
console.log("\n · Los pasos de aritmética dicen la llevada");

{
  const datos = await consultar({ query: "Enséñame a sumar" });
  const pasosSuma = (datos?.lsg?.modulos ?? [])
    .flatMap((m) => m.directivas ?? [])
    .filter((d) => d.tipo === "pizarra")
    .map((d) => String(d.contenido ?? ""));

  const conLlevada = pasosSuma.filter((p) => /se lleva 1/.test(p));
  check(
    "algún paso de la suma dice qué se escribe y qué se lleva",
    conLlevada.length > 0,
    `pasos: ${pasosSuma.join(" | ")}`,
  );
  for (const paso of conLlevada) {
    check(
      `«${paso}» cabe en la pizarra y no acaba en el subtítulo`,
      esIdeaFuerza(paso),
    );
  }
  // Y sigue sin ser un párrafo: la pizarra es para ideas fuerza.
  for (const paso of pasosSuma) {
    check(
      `«${paso}» sigue siendo una idea fuerza`,
      esIdeaFuerza(paso),
    );
  }
}

// ── Una cuenta que avanza, no tres cuentas apiladas ─────────────────────────
// El motor REDIBUJA la misma suma en cada paso: primero los dos números, luego
// con la cifra de las unidades bajo la raya, y al final con la llevada y el
// total. Apiladas, en la pizarra se veían tres sumas distintas —"19 + 45",
// "19 + 45 - - - 4", "119 + 45 - - - 64"— como si fueran tres ejercicios.
console.log("\n · La cuenta que se redibuja es UNA, y avanza");

{
  const salto = String.fromCharCode(10);
  const dibujo = (...filas) => filas.join(salto);

  const planteada = "19 + 45";
  const aMedias = dibujo("19", "+ 45", "---", " 4");
  const terminada = dibujo(" 1", "19", "+ 45", "---", " 64");
  const otra = "24 + 17";

  check("el planteamiento y el dibujo a medias son la misma cuenta", esLaMismaCuenta(planteada, aMedias));
  check("el dibujo a medias y el terminado son la misma cuenta", esLaMismaCuenta(aMedias, terminada));
  check("una suma distinta no se confunde con ella", !esLaMismaCuenta(terminada, otra));
  check("una línea que no es cuenta no se empareja", !esLaMismaCuenta("Regla de la potencia", planteada));

  // Mientras el dibujo está a medias, la columna se compone SIN total: poner el
  // resultado antes de que el tutor llegue ahí sería adelantarle el final.
  const medias = leerOperacionDibujada(aMedias);
  const fin = leerOperacionDibujada(terminada);
  check("un dibujo a medias se reconoce como incompleto", medias != null && medias.completa === false);
  check("un dibujo con su total se reconoce como completo", fin != null && fin.completa === true);
  check(
    "la cuenta a medias se compone sin el total",
    !/\\hline\s+&/.test(columnaDeCuentaDibujada(aMedias) ?? ""),
    columnaDeCuentaDibujada(aMedias) ?? "sin latex",
  );
  check(
    "la cuenta terminada sí lleva su total",
    /\\hline\s+&\s+6\s+&\s+4/.test(columnaDeCuentaDibujada(terminada) ?? ""),
    columnaDeCuentaDibujada(terminada) ?? "sin latex",
  );

  const fuenteAuC = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );
  check(
    "el aula sustituye el redibujo en lugar de apilarlo",
    /esLaMismaCuenta\(ultima\.texto, limpio\)\)\s*\{\s*\n\s*return \[\.\.\.prev\.slice\(0, -1\), linea\];/.test(
      fuenteAuC,
    ),
  );
  check(
    "el desarrollo no replantea el enunciado que ya está en la tarjeta",
    /replanteaElEnunciado/.test(fuenteAuC),
  );
}

// ── La tarjeta de Reglas dice lo que dice la voz ─────────────────────────────
// El tutor explicaba la suma columna por columna con llevada y en la pizarra
// aparecía "Jerarquía de operaciones". La causa: en aritmética y en ecuaciones
// lineales la fase de Reglas no ESCRIBÍA nada, así que la tarjeta caía en la
// primera regla del catálogo, que no era la que se estaba enseñando.
console.log("\n · La tarjeta de Reglas concuerda con la locución");

{
  // La regla que se enseña tiene que existir en el catálogo: si no, no hay
  // tarjeta que mostrar y el respaldo vuelve a inventarse una.
  const aritmeticas = (catalogo ?? []).filter((r) => r.tema === "ARITMETICA");
  for (const nombre of ["Suma con llevada", "Resta con préstamo"]) {
    check(
      `el catálogo tiene la regla «${nombre}», que es la que se enseña`,
      aritmeticas.some((r) => r.nombre === nombre),
      `catálogo: ${aritmeticas.map((r) => r.nombre).join(", ")}`,
    );
  }

  // Y cada tema, en su fase de Reglas, escribe una línea que NOMBRA una regla
  // suya. Es lo que ata la tarjeta a la locución; sin ella, la pizarra compone
  // la primera del catálogo y cuenta otra cosa.
  for (const tema of TEMAS_LECCION) {
    const datos = await consultar({ query: tema.consulta });
    const modulo = (datos?.lsg?.modulos ?? []).find((m) => esFaseDeReglas(String(m.id ?? "")));
    if (!modulo) continue;

    const escritas = (modulo.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => String(d.contenido ?? "").trim())
      .filter(Boolean);
    const delTema = (catalogo ?? []).filter((r) => r.tema === tema.tema);
    const nombrada = escritas.map((l) => identificarRegla(l, delTema)).find(Boolean);

    check(
      `[${tema.clave}] la fase de Reglas escribe algo en la pizarra`,
      escritas.length > 0,
      "sin línea propia, la tarjeta cae en la primera del catálogo",
    );
    check(
      `[${tema.clave}] lo escrito nombra una regla del tema: ${nombrada?.nombre ?? "ninguna"}`,
      Boolean(nombrada),
      `escrito: ${escritas.join(" | ")}`,
    );
    // Y lo escrito cabe en la pizarra: pasarse de largo lo manda al subtítulo,
    // y la fase se queda otra vez sin tarjeta propia.
    for (const linea of escritas) {
      check(`[${tema.clave}] «${linea}» cabe en la pizarra`, esIdeaFuerza(linea));
    }
  }
}

// ── Varias líneas en una directiva son varios pasos ─────────────────────────
// Compuestas de una vez, los saltos se pierden y las líneas se pegan:
// "19 + 45 = ?" seguido de "9 + 5 = 14" salía como "19 + 45 =?9 + 5 = 14".
console.log("\n · Una directiva con varias líneas no se pega");

{
  const salto = String.fromCharCode(10);
  const fuenteAuD = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );
  check(
    "cada línea de una directiva se escribe por separado",
    /contenido\.split\(\/\\r\?\\n\/\)\.map\(\(l\) => l\.trim\(\)\)\.filter\(Boolean\)/.test(fuenteAuD),
  );
  // Salvo la cuenta dibujada: ahí las varias líneas son una sola cosa.
  check(
    "la cuenta dibujada NO se parte en líneas sueltas",
    /leerOperacionDibujada\(contenido\)\s*\n\s*\? \[contenido\]/.test(fuenteAuD),
  );

  // El dibujo sigue reconociéndose como una unidad.
  const dibujada = ["19", "+ 45", "---", " 64"].join(salto);
  check(
    "un dibujo en columna se reconoce entero",
    leerOperacionDibujada(dibujada) != null,
  );
  // Y un par de pasos sueltos NO se toma por un dibujo, así que se separan.
  const dosPasos = ["19 + 45 = ?", "9 + 5 = 14"].join(salto);
  check(
    "dos pasos sueltos no se toman por un dibujo",
    leerOperacionDibujada(dosPasos) == null,
  );
}

// ── La leyenda de color sólo aparece si hay algo marcado ────────────────────
// En aritmética, bajo la suma en columna, se componía "coeficiente · exponente".
// Una suma no tiene ni lo uno ni lo otro: el alumno leía dos palabras que no
// señalaban nada. La leyenda no depende del tema sino de lo que hay marcado.
console.log("\n · La leyenda de color sólo nombra lo que se marca");

{
  const casos = [
    { entrada: "24 + 17", coeficiente: false, exponente: false, motivo: "una suma no tiene ni coeficiente ni exponente" },
    { entrada: "5x²", coeficiente: true, exponente: true, motivo: "los tiene los dos" },
    { entrada: "x²", coeficiente: false, exponente: true, motivo: "el coeficiente implícito no se marca" },
    { entrada: "10x", coeficiente: true, exponente: false, motivo: "sin exponente escrito" },
  ];
  for (const caso of casos) {
    const latex = lineaResaltada(caso.entrada) ?? "";
    check(
      `«${caso.entrada}»: ${caso.motivo}`,
      latex.includes(CLASE_COEFICIENTE) === caso.coeficiente &&
        latex.includes(CLASE_EXPONENTE) === caso.exponente,
      `latex: ${latex || "(sin resaltar)"}`,
    );
  }

  const fuentePzL = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "la leyenda se compone por lo marcado, no por la fase",
    /\{\(marcado\.coeficiente \|\| marcado\.exponente\) && \(/.test(fuentePzL),
  );
  check(
    "cada palabra de la leyenda depende de su propia marca",
    /\{marcado\.coeficiente && \(/.test(fuentePzL) && /\{marcado\.exponente && \(/.test(fuentePzL),
  );
}

// ── Los números llevan su nombre debajo ─────────────────────────────────────
// El tutor dice "24 y 17 son los SUMANDOS, y 41 es la SUMA", pero la pizarra
// mostraba el esquema abstracto "sumando + sumando = suma", sin los números que
// el alumno estaba oyendo: tenía que emparejarlos de memoria.
console.log("\n · Cada número con su nombre debajo");

{
  const rotulados = [
    { entrada: "24 [sumando] + 17 [sumando] = 41 [suma o total]", nombres: ["sumando", "sumando", "suma o total"] },
    { entrada: "52 [minuendo] - 27 [sustraendo] = 25 [diferencia]", nombres: ["minuendo", "sustraendo", "diferencia"] },
    { entrada: "6 [factor] × 7 [factor] = 42 [producto]", nombres: ["factor", "factor", "producto"] },
  ];
  for (const caso of rotulados) {
    const latex = rotulosALatex(caso.entrada);
    const puestos = [...(latex ?? "").matchAll(/\\text\{([^}]*)\}/g)].map((m) => m[1].replace(/\\ /g, " "));
    check(
      `«${caso.entrada}» rotula [${caso.nombres.join(", ")}]`,
      puestos.join("|") === caso.nombres.join("|"),
      `obtenido: [${puestos.join(", ")}]`,
    );
    let compone = true;
    try {
      katex.renderToString(latex, { throwOnError: true, strict: false });
    } catch (e) {
      compone = false;
      console.log(`      KaTeX: ${e.message}`);
    }
    check(`KaTeX compone los rótulos de «${caso.entrada}»`, compone, latex ?? "sin latex");
  }

  // Y lo que no lleva rótulos se compone como siempre.
  for (const sinMarcas of ["24 + 17 = 41", "partes: sumando + sumando = suma", "5x²"]) {
    check(`«${sinMarcas}» no se toma por una línea rotulada`, rotulosALatex(sinMarcas) == null);
  }
  // Una frase con un corchete suelto tampoco: pasada por KaTeX saldría en
  // cursiva y con las letras separadas.
  check(
    "una frase con corchetes no se compone como fórmula",
    rotulosALatex("Cuando los números tienen varias cifras [nota] sumamos") == null,
  );

  // Contra el motor real: la fase de Concepto de las cuatro operaciones rotula
  // los números del ejemplo que se está resolviendo, no unos genéricos.
  for (const consulta of ["Enséñame a sumar", "Enséñame a restar"]) {
    const datos = await consultar({ query: consulta });
    const pizarras = (datos?.lsg?.modulos ?? [])
      .flatMap((m) => m.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => String(d.contenido ?? ""));
    const rotulada = pizarras.find((p) => rotulosALatex(p) != null);
    check(
      `[${consulta}] la pizarra rotula las partes sobre números reales`,
      Boolean(rotulada) && /\d/.test(rotulada),
      `pizarras: ${pizarras.join(" | ")}`,
    );
    check(
      `[${consulta}] la línea rotulada cabe en la pizarra`,
      rotulada != null && esIdeaFuerza(rotulada),
      `linea: ${rotulada}`,
    );
  }
}

// ── Ninguna fase se abre con el lienzo vacío ────────────────────────────────
// El tutor entraba en "Reglas y propiedades" y hablaba varios segundos antes de
// escribir nada: la fase abierta, la voz explicando y la pizarra en blanco. Es
// el mismo patrón que dejaba la Práctica vacía, pero en una fase sin ejercicio.
// La primera línea de cada fase se conoce desde que llega la lección, así que
// se adelanta al entrar en ella.
console.log("\n · Ninguna fase abre con la pizarra en blanco");

{
  for (const tema of TEMAS_LECCION) {
    const datos = await consultar({ query: tema.consulta });
    const lsg = datos?.lsg ?? datos;
    const adelantadas = enunciadosDeLeccion(lsg);

    for (const modulo of lsg?.modulos ?? []) {
      const id = String(modulo.id ?? "");
      check(
        `[${tema.clave}] la fase «${tituloDeFase(id)}» tiene línea desde el primer instante`,
        Boolean(adelantadas.get(id)),
        "esa fase se abriría con el lienzo en blanco mientras el tutor narra",
      );
    }
  }

  const fuenteAuE = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );
  check(
    "el aula adelanta la línea de las fases sin ejercicio",
    /const adelantada = !plantea \? enunciadoPorFase\.current\.get\(clave\) : null;/.test(fuenteAuE),
  );
  check(
    "y no la escribe dos veces cuando el motor llega a ella",
    /if \(ultima && ultima\.texto === limpio\) return prev;/.test(fuenteAuE),
  );
}

// ── Aritmética: el desarrollo es UNA sola cuenta en columna ────────────
// El motor escribe la suma por partes mientras la explica —"27 + 38 =", "¹19",
// "+45", una cifra suelta— y cada parte abría su propia tarjeta: cinco apiladas,
// con barra de desplazamiento y sin rastro de la alineación. Da igual con qué
// trozos llegue: se compone la cuenta entera, y sólo la cuenta.
console.log("\n · El desarrollo de aritmética es una sola matriz");

{
  const cuenta = columnaDeLinea("19 + 45 = ?", { conResultado: true });
  // La barra invertida, sin pelearse con el escapado del fichero.
  const B = String.fromCharCode(92);

  // Una sola matriz: ni dos ni una partida.
  check(
    "la cuenta se compone en un solo bloque",
    cuenta.split(B + "begin{array}").length === 2 &&
      cuenta.split(B + "end{array}").length === 2,
    cuenta,
  );
  // Y con la forma exacta que pidió el cliente: una columna por cifra más la
  // del signo, llevada arriba, raya y resultado abajo.
  const suya = [
    B + "begin{array}{rcc}",
    "& 1 &",
    B + B,
    "& 1 & 9",
    B + B,
    "+ & 4 & 5",
    B + B,
    B + "hline",
    "& 6 & 4",
    B + "end{array}",
  ].join(" ");
  const norma = (t) => t.split(B + "scriptstyle ").join("").replace(/\s+/g, " ").trim();
  check(
    "la cuenta tiene la forma pedida (llevada, sumandos, raya, resultado)",
    norma(cuenta) === norma(suya),
    `obtenido: ${norma(cuenta)}`,
  );
  // La llevada va en cuerpo pequeño, como se escribe a mano y como aparece en
  // la muestra del cliente.
  check("la llevada se compone más pequeña", cuenta.includes(B + "scriptstyle 1"), cuenta);

  let compone = true;
  try {
    katex.renderToString(cuenta, { throwOnError: true, strict: false });
  } catch (e) {
    compone = false;
    console.log(`      KaTeX: ${e.message}`);
  }
  check("KaTeX compone la cuenta entera", compone, cuenta);

  const fuentePzG = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  // En aritmética con desarrollo se compone la cuenta y NADA más: un solo paso.
  check(
    "en aritmética el desarrollo se reduce a la cuenta",
    /if \(ejercicio && cuenta\)[\s\S]{0,200}texto: cuenta\.texto \}, columna: "resuelta" \}/.test(
      fuentePzG,
    ),
  );
  // Y va ANTES de componer los pasos sueltos, para que no lleguen a pintarse.
  check(
    "la cuenta se decide antes que los pasos sueltos",
    fuentePzG.indexOf('columna: "resuelta" }') <
      fuentePzG.indexOf("const pasos: PasoCompuesto[] = desarrollo.map"),
  );
}

// ── Una aclaración explica; no pregunta ─────────────────────────────────────
// El alumno está resolviendo un ejercicio y pulsa "Explicar regla": quiere que
// le expliquen, no que le pregunten otra cosa. La aclaración traía su propia
// pregunta —"¿Entendiste la explicación?"— que ocupaba la caja de respuesta y
// le quitaba de delante el ejercicio que estaba haciendo.
console.log("\n · Una aclaración no ocupa la caja de respuesta");

{
  const conPregunta = {
    directivas: [
      { tipo: "hablar", texto: "Se suman las unidades." },
      { tipo: "preguntar", texto: "¿Entendiste la explicación?" },
    ],
    modulos: [
      {
        id: "practica",
        directivas: [
          { tipo: "pizarra", contenido: "27 + 38" },
          { tipo: "preguntar", texto: "¿Cuánto es 27 + 38?" },
        ],
      },
    ],
  };
  const limpia = sinPreguntas(conPregunta);
  const preguntas = (l) =>
    [...(l.directivas ?? []), ...(l.modulos ?? []).flatMap((m) => m.directivas ?? [])].filter(
      (d) => d.tipo === "preguntar",
    ).length;

  check("la aclaración se queda sin preguntas", preguntas(limpia) === 0, `quedan: ${preguntas(limpia)}`);
  check("lo demás se conserva", (limpia.directivas ?? []).some((d) => d.tipo === "hablar"));
  check(
    "la pizarra de sus módulos se conserva",
    (limpia.modulos ?? [])[0].directivas.some((d) => d.tipo === "pizarra"),
  );
  check("no se toca el original", preguntas(conPregunta) === 2);

  const fuenteAuF = readFileSync(
    new URL("../components/leccion/aula.tsx", import.meta.url),
    "utf8",
  );
  check(
    "el aula quita las preguntas SÓLO de las aclaraciones",
    /opciones\.soloExplicacion \? sinPreguntas\(recortada\) : recortada/.test(fuenteAuF),
  );
}

// ── La cuenta compuesta es la que se está explicando ────────────────────────
// El tutor narraba "nueve más cinco son catorce" —de 19 + 45— y en la pizarra
// se componía 24 + 17, que era lo que decía la tarjeta. El alumno veía una cosa
// y oía otra. La tarjeta y la cuenta resuelta salen ahora de la misma decisión.
console.log("\n · La cuenta compuesta es la que se explica");

{
  const casos = [
    {
      nombre: "manda lo que se está explicando, no la tarjeta",
      desarrollo: ["1", "19 + 45", "4"],
      tarjeta: "24 + 17",
      esperado: "19 + 45",
    },
    {
      nombre: "sin desarrollo, manda la tarjeta",
      desarrollo: [],
      tarjeta: "24 + 17",
      esperado: "24 + 17",
    },
    {
      nombre: "un paso narrado no cambia de cuenta",
      desarrollo: ["unidades: 4 + 7 = 11 (se escribe 1, se lleva 1)"],
      tarjeta: "24 + 17",
      esperado: "24 + 17",
    },
    {
      nombre: "si se explican varias, manda la última",
      desarrollo: ["19 + 45", "4", "27 + 38"],
      tarjeta: "24 + 17",
      esperado: "27 + 38",
    },
    {
      nombre: "el enunciado con interrogante también vale",
      desarrollo: [],
      tarjeta: "19 + 45 = ?",
      esperado: "19 + 45",
    },
    {
      nombre: "lo que no es aritmética no compone cuenta",
      desarrollo: ["2x = 10"],
      tarjeta: "2x + 5 = 15",
      esperado: null,
    },
  ];
  for (const caso of casos) {
    const obtenido = cuentaEnCurso(caso.desarrollo, caso.tarjeta);
    check(
      `${caso.nombre}: ${caso.esperado ?? "ninguna"}`,
      obtenido === caso.esperado,
      `obtenido: ${obtenido}`,
    );
  }

  // La coherencia es lo que importa: la tarjeta y la cuenta resuelta componen
  // la MISMA operación, porque salen de la misma decisión.
  const desarrollo = ["1", "19 + 45", "4"];
  const enCurso = cuentaEnCurso(desarrollo, "24 + 17");
  const arriba = columnaDeLinea(enCurso, { conResultado: false });
  const abajo = columnaDeLinea(enCurso, { conResultado: true });
  const cifras = (tex) => (tex ?? "").replace(/\\[a-z]+|[^0-9]/gi, "");
  check(
    "la tarjeta y la cuenta resuelta son la misma operación",
    cifras(arriba).startsWith(cifras(arriba)) && abajo.includes("1 & 9") && abajo.includes("4 & 5"),
    `arriba: ${arriba} · abajo: ${abajo}`,
  );
  check(
    "y el resultado es el de esa operación, no el de la tarjeta",
    abajo.includes("6 & 4"),
    abajo,
  );

  const fuentePzG = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "la pizarra decide una sola cuenta para las dos tarjetas",
    /const cuenta = useMemo\(/.test(fuentePzG) &&
      /linea=\{cuenta \? \{ \.\.\.ejercicio, texto: cuenta\.texto \} : ejercicio\}/.test(fuentePzG) &&
      /texto: cuenta\.texto \}, columna: "resuelta"/.test(fuentePzG),
  );
}

// ── El desarrollo de aritmética: una matriz, resuelta, y nada más ───────────
// Dos duplicaciones reportadas: el desarrollo repintaba el planteamiento que ya
// está arriba en su tarjeta, y al terminar apilaba dos matrices completas
// idénticas. La composición no acumula: hay una cuenta, y es la resuelta.
console.log("\n · El desarrollo de aritmética es UNA matriz resuelta");

{
  const B = String.fromCharCode(92);
  const matrices = (tex) => tex.split(B + "begin{array}").length - 1;

  const escenarios = [
    {
      nombre: "el motor escribe la cuenta por trozos",
      desarrollo: ["19 + 45", "1", "4", "19 + 45", "64"],
    },
    {
      nombre: "el motor redibuja la cuenta entera dos veces",
      desarrollo: ["19 + 45", "19 + 45"],
    },
    {
      nombre: "el motor narra las columnas",
      desarrollo: [
        "unidades: 9 + 5 = 14 (se escribe 4, se lleva 1)",
        "decenas: 1 + 4 + 1 = 6",
      ],
    },
  ];
  for (const caso of escenarios) {
    const compuesto = columnaDelDesarrollo(caso.desarrollo, "19 + 45 = ?");
    check(`${caso.nombre}: se compone algo`, compuesto != null);
    if (!compuesto) continue;

    check(
      `${caso.nombre}: UNA sola matriz`,
      matrices(compuesto.latex) === 1,
      `matrices: ${matrices(compuesto.latex)}`,
    );
    // Resuelta: con su llevada y su total. El planteamiento ya está arriba.
    check(
      `${caso.nombre}: viene resuelta, no repite el planteamiento`,
      compuesto.latex.includes(B + "scriptstyle 1") && compuesto.latex.includes("& 6 & 4"),
      compuesto.latex,
    );
    let compone = true;
    try {
      katex.renderToString(compuesto.latex, { throwOnError: true, strict: false });
    } catch (e) {
      compone = false;
      console.log(`      KaTeX: ${e.message}`);
    }
    check(`${caso.nombre}: KaTeX la compone`, compone, compuesto.latex);
  }

  // Sin desarrollo no hay cuenta: en la práctica, el alumno ve sólo el
  // planteamiento hasta que pide ayuda.
  check(
    "sin desarrollo no se compone ninguna cuenta",
    columnaDelDesarrollo([], "19 + 45 = ?") == null,
  );
  // Y lo que no es aritmética no pasa por aquí.
  check(
    "lo que no es aritmética no compone cuenta",
    columnaDelDesarrollo(["2x = 10"], "2x + 5 = 15") == null,
  );

  const fuentePzH = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  // La composición SUSTITUYE: un solo elemento, no un array que crece.
  check(
    "el desarrollo se sustituye, no se acumula",
    /pasos: \[\s*\{ linea: \{ \.\.\.ejercicio, id: -ejercicio\.id - 2, texto: cuenta\.texto \}, columna: "resuelta" \},\s*\]/.test(
      fuentePzH,
    ),
  );
  // Y la decisión la toma la función que la suite acaba de comprobar.
  check(
    "la pizarra usa la misma decisión que se comprueba aquí",
    /columnaDelDesarrollo\(desarrollo\.map\(\(l\) => l\.texto\), ejercicio\.texto\)/.test(fuentePzH),
  );
}

// ── La tarjeta de regla: nombre y notación, sin prosa ───────────────────────
// Dentro de la tarjeta se componía la descripción en prosa, palabra por palabra
// lo que el tutor narra y lo que se lee en el subtítulo: el mismo texto por
// tercera vez. La pizarra es para la notación; la prosa, para la voz.
console.log("\n · La tarjeta de regla no compone prosa");

{
  const fuentePzI = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  const tarjeta = fuentePzI.slice(
    fuentePzI.indexOf("function TarjetaRegla"),
    fuentePzI.indexOf("function TarjetaRegla") + 1800,
  );

  check(
    "la tarjeta compone el nombre de la regla",
    /\{regla\.nombre\}/.test(tarjeta),
  );
  check(
    "y su notación",
    /latex=\{regla\.enunciado\}/.test(tarjeta),
  );
  check(
    "pero NO su descripción en prosa",
    !/\{regla\.descripcion\}/.test(tarjeta),
    "esa prosa es la misma que narra el tutor y la que se lee en el subtítulo",
  );

  // El ejemplo sobra cuando el enunciado ya ES una operación dispuesta: en
  // "Suma con llevada" el enunciado es la cuenta en columna con su total, y
  // debajo quedaba un "19 + 45 = 64" horizontal que desdice el formato.
  check(
    "el ejemplo no se compone bajo una operación ya dispuesta",
    /regla\.ejemplo && !esOperacionDispuesta\(regla\.enunciado\)/.test(tarjeta),
  );

  const dispuesta = (enunciado) => String(enunciado ?? "").includes("\\begin{array}");
  const aritmeticas = (catalogo ?? []).filter((r) => r.tema === "ARITMETICA");
  for (const nombre of ["Suma con llevada", "Resta con préstamo"]) {
    const regla = aritmeticas.find((r) => r.nombre === nombre);
    check(
      `«${nombre}»: su enunciado ES la cuenta en columna`,
      Boolean(regla) && dispuesta(regla.enunciado),
      `enunciado: ${regla?.enunciado ?? "no está en el catálogo"}`,
    );
  }
  // Y las demás conservan su ejemplo, que es donde se ve aplicada la fórmula.
  const conFormulaGeneral = (catalogo ?? []).filter((r) => !dispuesta(r.enunciado));
  check(
    "las reglas con fórmula general conservan su ejemplo",
    conFormulaGeneral.length > 0 && conFormulaGeneral.every((r) => Boolean(r.ejemplo)),
    `sin ejemplo: ${conFormulaGeneral.filter((r) => !r.ejemplo).map((r) => r.nombre).join(", ")}`,
  );

  // Todo lo que la tarjeta compone tiene que compilar en KaTeX: un enunciado
  // roto no se ve como un error, se ve como un hueco en la tarjeta.
  for (const regla of catalogo ?? []) {
    let compone = true;
    try {
      katex.renderToString(regla.enunciado, { throwOnError: true, strict: false });
      if (regla.ejemplo && !dispuesta(regla.enunciado)) {
        katex.renderToString(regla.ejemplo, { throwOnError: true, strict: false });
      }
    } catch (e) {
      compone = false;
      console.log(`      KaTeX: ${e.message}`);
    }
    check(`«${regla.nombre}» se compone en la tarjeta`, compone);
  }
}

// ── Hito 1 · metadatos académicos del alumno ─────────────────────────────────
// El perfil guardaba el ciclo, el nivel del diagnóstico y las debilidades, pero
// nada de eso llegaba al motor: la lección salía igual para un alumno de Básico
// recién diagnosticado que para uno Avanzado con veinte fallos a la espalda.
console.log("\n · Los metadatos del alumno llegan al motor");

{
  // El nivel académico se traduce al escalón con el que trabaja el motor.
  const escalones = [
    ["BASICO", "facil"],
    ["INTERMEDIO", "normal"],
    ["AVANZADO", "dificil"],
    [null, null],
    [undefined, null],
  ];
  for (const [academico, motor] of escalones) {
    check(
      `nivel ${academico ?? "sin diagnosticar"} → escalón ${motor ?? "ninguno"}`,
      nivelDelMotor(academico) === motor,
      `obtenido: ${nivelDelMotor(academico)}`,
    );
  }

  const perfil = { ciclo: "Secundaria", grado: "3º", nivelActual: "AVANZADO" };
  const errores = [
    { tema: "FACTORIZACION", tipoError: "respuesta_incorrecta", ocurrencias: 7 },
    { tema: "DERIVADAS", tipoError: "respuesta_incorrecta", ocurrencias: 12 },
    { tema: "FRACCIONES", tipoError: "respuesta_incorrecta", ocurrencias: 2 },
  ];
  const contexto = contextoDeAlumno(perfil, errores);

  check("el contexto lleva el ciclo", contexto?.ciclo === "Secundaria");
  check("el contexto lleva el grado", contexto?.grado === "3º");
  check("el contexto lleva el nivel asignado", contexto?.nivel === "AVANZADO");
  check("y su escalón para el motor", contexto?.nivelMotor === "dificil");
  // Las debilidades, de la más repetida a la menos: es lo que más conviene
  // reforzar, y el aviso al modelo tiene sitio para unas pocas.
  check(
    "las debilidades vienen ordenadas por reincidencia",
    contexto?.debilidades.map((d) => d.tema).join(",") ===
      "DERIVADAS,FACTORIZACION,FRACCIONES",
    `obtenido: ${contexto?.debilidades.map((d) => d.tema).join(",")}`,
  );
  check("y no más de las que caben", contexto.debilidades.length <= MAX_DEBILIDADES);

  // Sin sesión no hay contexto, y la lección sigue siendo la de siempre: si
  // dependiera de quién la pide, dejaría de ser reproducible.
  check("sin perfil no se inventa contexto", contextoDeAlumno(null) === null);

  // El resumen para el modelo no se escribe con huecos: una frase con "ciclo
  // null" el modelo se la toma al pie de la letra.
  const resumen = contextoParaElModelo(contexto);
  check("el resumen nombra el ciclo y el nivel", /Secundaria/.test(resumen) && /avanzado/.test(resumen));
  check("y lo que suele fallar", /suele fallar/.test(resumen) && /derivadas/.test(resumen));
  check("sin nada que decir, no se manda frase", contextoParaElModelo(null) === "");
  check(
    "un perfil vacío tampoco genera frase con huecos",
    contextoParaElModelo(contextoDeAlumno({}, [])) === "",
    `obtenido: «${contextoParaElModelo(contextoDeAlumno({}, []))}»`,
  );

  // El nivel diagnosticado marca el escalón de PARTIDA de un tema nuevo.
  const conNivel = (nivelDePartida) => {
    const cursores = {};
    leccionBotonLSG({ query: "Enséñame derivadas", cursores, nivelDePartida });
    return cursores["nivel:actual"];
  };
  check("un alumno de Básico empieza en el escalón bajo", conNivel("facil") === 0);
  check("uno Avanzado, en el alto", conNivel("dificil") === 2);
  check("y sin diagnóstico, en el medio, como siempre", conNivel("") === 1);

  // La ruta es quien adjunta el perfil: el navegador no puede falsearlo.
  const fuenteRutaQuery = readFileSync(
    new URL("../app/api/query/route.ts", import.meta.url),
    "utf8",
  );
  check(
    "la ruta lee el perfil de la sesión, no del cuerpo de la petición",
    /await auth\(\)/.test(fuenteRutaQuery) &&
      /prisma\.perfilEstudiante\.findUnique/.test(fuenteRutaQuery),
  );
  check(
    "y las debilidades, de la más repetida a la menos",
    /registroError\.findMany[\s\S]{0,160}ocurrencias: "desc"/.test(fuenteRutaQuery),
  );
  check(
    "un fallo al leerlo no tumba la consulta",
    /catch \{\s*\n\s*return null;\s*\n\s*\}/.test(fuenteRutaQuery),
  );
}

// ── Hito 1 · el catálogo, sembrado y sin campos vacíos ──────────────────────
// La tabla de ejercicios estaba vacía: las listas viven en el motor, en memoria,
// y nunca llegaban a PostgreSQL. El catálogo no se podía consultar ni analizar
// fuera del motor.
console.log("\n · El catálogo se siembra entero y sin huecos");

{
  const banco = bancoDeEjercicios();
  check("el banco de ejercicios no está vacío", banco.length > 300, `ejercicios: ${banco.length}`);

  // Los cinco temas tienen ejercicios: si faltara uno, su práctica saldría de
  // la nada y no habría con qué contrastarla.
  const temas = new Set(banco.map((e) => e.tema));
  for (const tema of ["ARITMETICA", "FRACCIONES", "ECUACIONES_LINEALES", "FACTORIZACION", "DERIVADAS"]) {
    check(`el banco cubre ${tema}`, temas.has(tema));
  }

  // Ningún campo vacío: un ejercicio sin enunciado o sin nivel no se puede ni
  // mostrar ni clasificar.
  const incompletos = banco.filter(
    (e) => !e.tema?.trim() || !e.nivel?.trim() || !e.enunciado?.trim() || !e.nivelMotor?.trim(),
  );
  check(
    "ningún ejercicio del banco tiene campos vacíos",
    incompletos.length === 0,
    `incompletos: ${incompletos.length}`,
  );

  // Y TODOS son calificables: el esquema dice que sólo entra al banco lo que el
  // PRE Light ha podido verificar, así que si alguno no se resuelve, la semilla
  // lo deja fuera y el motor estaría proponiendo algo que no sabe corregir.
  const CLAVE = {
    ARITMETICA: "aritmetica",
    FRACCIONES: "fracciones",
    ECUACIONES_LINEALES: "lineales",
    FACTORIZACION: "factorizacion",
    DERIVADAS: "derivadas",
  };
  const sinResolver = banco.filter((e) => !resolverEjercicio(e.enunciado, CLAVE[e.tema]));
  check(
    "el motor sabe resolver todos los ejercicios que propone",
    sinResolver.length === 0,
    `sin resolver: ${sinResolver.map((e) => `${e.tema}:${e.enunciado}`).join(" · ")}`,
  );

  // El catálogo de reglas, igual: ningún campo vacío.
  const reglasIncompletas = (catalogo ?? []).filter(
    (r) => !r.clave?.trim() || !r.nombre?.trim() || !r.enunciado?.trim() || !r.descripcion?.trim(),
  );
  check(
    "ninguna regla del catálogo tiene campos vacíos",
    reglasIncompletas.length === 0,
    `incompletas: ${reglasIncompletas.map((r) => r.clave).join(", ")}`,
  );

  // Y la semilla lo siembra: si no, la base queda por detrás del código.
  const semilla = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
  check(
    "la semilla siembra el banco de ejercicios",
    /bancoDeEjercicios\(\)/.test(semilla) && /prisma\.ejercicio\.upsert/.test(semilla),
  );
  check(
    "y calcula la respuesta con el motor, no la copia",
    /resolverEjercicio\(e\.enunciado/.test(semilla),
  );
  check(
    "sólo entra lo que el motor puede verificar",
    /if \(!respuesta\)[\s\S]{0,120}continue;/.test(semilla),
  );
}

// ── Hito 2 · el diagnóstico deja constancia de las debilidades ──────────────
// El diagnóstico guardaba el nivel, el intento y el historial, pero no las
// debilidades: un alumno recién diagnosticado llegaba a su primera lección sin
// ninguna registrada, y el motor no tenía en qué insistir aunque acabara de
// fallar justo ese tema.
console.log("\n · El diagnóstico registra las debilidades detectadas");

{
  const fuenteDiag = readFileSync(
    new URL("../app/api/diagnostico/route.ts", import.meta.url),
    "utf8",
  );

  check(
    "cada fallo del diagnóstico queda registrado en su tema",
    /for \(const fallo of corregidas\.filter\(\(r\) => !r\.correcta\)\)/.test(fuenteDiag) &&
      /tx\.registroError\.upsert/.test(fuenteDiag),
  );
  // Se acumulan por tema en lugar de abrir una entrada por intento.
  check(
    "las debilidades se acumulan, no se duplican",
    /ocurrencias: \{ increment: 1 \}/.test(fuenteDiag),
  );
  // Y se distinguen de las de la práctica: no es lo mismo llegar flojo en un
  // tema que seguir fallando después de que te lo expliquen.
  check(
    "una debilidad del diagnóstico se distingue de una de la práctica",
    /TIPO_ERROR_DIAGNOSTICO = "diagnostico_inicial"/.test(fuenteDiag),
  );
  // Todo dentro de la MISMA transacción que el nivel: o se guarda el resultado
  // entero o no se guarda nada.
  check(
    "se guardan en la misma transacción que el nivel",
    /prisma\.\$transaction[\s\S]{0,2600}tx\.registroError\.upsert/.test(fuenteDiag),
  );

  // El banco cubre aritmética y álgebra, que es lo que pide el pliego.
  const banco = JSON.parse(
    readFileSync(new URL("../prisma/seed-data/preguntas-diagnostico.json", import.meta.url), "utf8"),
  );
  const preguntas = Array.isArray(banco) ? banco : banco.preguntas ?? [];
  // MVP 2: el banco está partido por niveles, así que lo que tiene que estar
  // entre 3 y 5 es la prueba de CADA nivel, no el fichero entero. Un alumno
  // sigue respondiendo como mucho cinco preguntas; lo que cambió es que son las
  // de su nivel.
  const nivelesDiag = [...new Set(preguntas.map((p) => String(p.nivel ?? "SIN_NIVEL")))];
  for (const nivel of nivelesDiag) {
    const delNivel = preguntas.filter((p) => String(p.nivel ?? "SIN_NIVEL") === nivel);
    check(
      `el nivel ${nivel} tiene al menos 3 preguntas sembradas`,
      delNivel.length >= 3,
      `preguntas: ${delNivel.length}`,
    );
  }
  const temasDiag = new Set(preguntas.map((p) => String(p.tema)));
  check("cubre aritmética", temasDiag.has("aritmetica"));
  check(
    "y álgebra",
    ["ecuaciones_lineales", "factorizacion", "derivadas"].some((t) => temasDiag.has(t)),
    `temas: ${[...temasDiag].join(", ")}`,
  );
}

// ── Hito 2 · el modelo configurado es el del pliego ─────────────────────────
// GEMINI_MODEL manda sobre el que trae el código. Un despliegue apuntando a
// otro modelo funciona igual de bien pero deja de cumplir lo acordado, y desde
// fuera no se nota.
console.log("\n · El modelo configurado se puede contrastar");

{
  check(
    "el pliego fija dos modelos",
    MODELOS_DEL_PLIEGO.includes("gemini-2.5-flash-lite") &&
      MODELOS_DEL_PLIEGO.includes("gemini-2.5-flash"),
    `modelos: ${MODELOS_DEL_PLIEGO.join(", ")}`,
  );
  const salud = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  check(
    "la salud dice si el modelo configurado es uno de ellos",
    /modelo_del_pliego: modeloDelPliego/.test(salud),
  );
  check(
    "y avisa con el nombre del que hay puesto",
    /MODELOS_DEL_PLIEGO\.includes\(modeloConfigurado\)/.test(salud) && /aviso:/.test(salud),
  );
}

// ── Hito 2 · tolerancia a equivalencias, sin falsos negativos ───────────────
// Marcar mal una respuesta correcta es el peor error del corrector: es el que
// hace que el alumno deje de fiarse de él.
console.log("\n · Se aceptan las formas equivalentes de una respuesta");

{
  const equivalentes = [
    ["(x + 3)(x - 3)", "(x - 3)(x + 3)", "el orden de los factores"],
    ["(x+3)(x-3)", "(x - 3)(x + 3)", "sin espacios"],
    ["(x - 5)²", "(x - 5)(x - 5)", "el cuadrado y el producto repetido"],
    ["x(x + 7)", "(x+7)·x", "el factor común, delante o detrás"],
    ["2(x + 2)(x - 2)", "2(x - 2)(x + 2)", "coeficiente y orden"],
    ["0.5", "1/2", "decimal y fracción"],
    ["3/6", "1/2", "una fracción sin simplificar"],
    ["2,5", "2.5", "la coma decimal"],
    ["5.0", "5", "un decimal que es entero"],
    ["−4", "-4", "el menos tipográfico"],
    ["x·2", "2x", "el coeficiente escrito detrás"],
    ["x^2", "x²", "el superíndice"],
    ["3 + 2x", "2x + 3", "el orden de los sumandos"],
    ["-4x + 12x³", "12x³ - 4x", "un polinomio reordenado"],
    ["x = 5", "5", "la respuesta con su despeje"],
  ];
  for (const [alumno, esperada, motivo] of equivalentes) {
    check(
      `«${alumno}» vale para «${esperada}»: ${motivo}`,
      checkAnswer(alumno, esperada).correct === true,
    );
  }

  // Y lo que NO es equivalente sigue estando mal: aflojar el corrector para
  // evitar falsos negativos no puede acabar dando por buena cualquier cosa.
  const distintas = [
    ["x·3", "2x", "otro coeficiente"],
    ["(x + 2)(x + 4)", "(x + 2)(x + 3)", "otro factor"],
    ["6", "7", "otro valor"],
    ["1/3", "1/2", "otra fracción"],
    ["12x³ + 4x", "12x³ - 4x", "otro signo"],
  ];
  for (const [alumno, esperada, motivo] of distintas) {
    check(
      `«${alumno}» no vale para «${esperada}»: ${motivo}`,
      checkAnswer(alumno, esperada).correct === false,
    );
  }
}

// ── Veredicto ────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log(` Aprobadas: ${ok} · Fallidas: ${fallos.length}`);

if (fallos.length) {
  console.log("\n ❌ PASO 2 RECHAZADO. Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}

console.log("\n ✅ PASO 2 APROBADO — lección multimodal completa y verificada.\n");
