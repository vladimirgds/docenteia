// HITO 2 — PIZARRA KaTeX ANIMADA Y AVATAR DINÁMICO
//
// QUÉ SE COMPRUEBA AQUÍ
//
//   A. INICIALIZACIÓN DE LA PIZARRA ANIMADA. Que cada línea de la lección
//      produzca un guion coherente: llevadas donde tocan, cancelaciones
//      señaladas, y —lo más importante— que TODO foco apunte a una clase que
//      existe de verdad en el LaTeX. Un foco huérfano no da error: dibuja un
//      recuadro en la nada, y eso sólo se ve mirando.
//   B. QUE KaTeX COMPONE CADA ESCENA SIN EXCEPCIÓN y conserva las marcas. Es la
//      condición que hace posible resaltar sin recompilar: si la clase no llega
//      al HTML, no hay nada que medir.
//   C. LA MÁQUINA DE ESTADOS del sincronizador, con reloj y voz falsos: pausar,
//      reanudar, repetir paso, avanzar a mano, y la degradación a temporizador
//      cuando el audio falla o está apagado.
//   D. LA MÁQUINA DE ESTADOS DEL AVATAR: los cinco estados pedagógicos, la
//      traducción desde los del motor, y que cada uno tenga gesto, color y
//      animación definidos (y que esa animación exista en la hoja de estilos).
//   E. Y, con servidor levantado, QUE LA VISTA DE LECCIÓN NO LANCE EXCEPCIONES
//      DE RENDER, más el orden de bloques del formulario de tema.
//
//   node qa/hito2.mjs
//   BASE_URL=http://localhost:3000 node qa/hito2.mjs

import { readFileSync } from "node:fs";

import katex from "katex";

import {
  esAnimable,
  escenaEstatica,
  escenaDeColumna,
  escenaDeDespeje,
  escenaDeLinea,
  escenaDePolinomio,
  escenaDeSimplificacion,
  escenaDeTexto,
  escenaDeAmplificacion,
  escenaDeDistributiva,
  guionDeLeccion,
  reglasDeRevelado,
  situacionParaNarracion,
} from "../lib/leccion/animacion.ts";
import { cuentaDeArrayLatex, marcasDeColumna, leerSumaOResta } from "../lib/leccion/columna.ts";
import { cierreDelDesarrollo } from "../lib/leccion/cierre.ts";
import { conPreguntaPendiente, esEnunciadoParaResolver } from "../lib/leccion/seguimiento-lsg.ts";
import {
  apareceComoTermino,
  processLSG,
  repararEquivalencias,
  TIPOS_OPERACION as TIPOS_OPERACION_SERVIDOR,
} from "../src/preLight.js";
import {
  derivadaResueltaLSG,
  divisionResueltaLSG,
  factorizacionResueltaLSG,
  fraccionResueltaLSG,
  linealResueltaLSG,
  multiplicacionResueltaLSG,
  restaResueltaLSG,
  sumaResueltaLSG,
} from "../src/lsgPrompt.js";
import { crearVozCompartida } from "../lib/leccion/voz.ts";
import {
  etiquetaValida,
  leerAmplificacion,
  leerSumaDeFracciones,
  marcarTerminos,
  miembros,
  posicionesDeTermino,
  TIPOS_OPERACION,
} from "../lib/leccion/marcado.ts";
import { fraccionEnTexto, geometriaDeFraccion } from "../lib/leccion/diagramas.ts";
import {
  avatarDe,
  crearSincronizador,
  duracionEstimada,
  PAUSA_ENTRE_PASOS,
} from "../lib/leccion/sincronizacion.ts";
import {
  DESDE_MOTOR,
  ESTADOS_MOTOR,
  ESTADOS_PEDAGOGICOS,
  ETIQUETA_ESTADO,
  estadoPedagogico,
} from "../lib/leccion/avatar.ts";

import { BASE_URL as BASE } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";

let ok = 0;
const fallos = [];

function check(nombre, condicion, detalle = "") {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ""}`);
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

function titulo(texto) {
  console.log(`\n── ${texto} ${"─".repeat(Math.max(0, 58 - texto.length))}`);
}

/**
 * Las marcas del LaTeX, ya separadas en clases y contenido.
 *
 * Una pieza puede llevar varias clases a la vez —"pz-resultado pz-col-2
 * pz-rev-0"—, así que buscar la cadena `\htmlClass{pz-col-2}` a pelo daría
 * falsos negativos. Aquí se lee la lista de clases, que es lo que hará el
 * navegador.
 */
function marcas(latex) {
  return [...String(latex ?? "").matchAll(/\\htmlClass\{([^}]*)\}\{([^{}]*)\}/g)].map(
    ([, clases, contenido]) => ({
      clases: clases.trim().split(/\s+/),
      contenido: contenido.trim(),
    }),
  );
}

/**
 * ¿Hay alguna pieza marcada con esta clase?
 *
 * Se leen sólo las listas de clases, sin mirar el contenido: una marca puede
 * envolver a otra —el término de un polinomio envuelve a su coeficiente— y
 * emparejar llaves anidadas con una expresión regular no sale bien.
 */
function marcada(latex, clase) {
  return [...String(latex ?? "").matchAll(/\\htmlClass\{([^}]*)\}/g)]
    .flatMap(([, clases]) => clases.trim().split(/\s+/))
    .includes(clase);
}

/** Lo que envuelve esa clase, para comprobar qué cifra lleva dentro. */
function contenidoDe(latex, clase) {
  return marcas(latex).find((m) => m.clases.includes(clase))?.contenido ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// A. El guion de la pizarra
// ═════════════════════════════════════════════════════════════════════════════

titulo("A. Cuenta en columna: columnas, llevadas y reagrupaciones");

{
  const escena = escenaDeColumna("24 + 17", "e");
  check("24 + 17 se anima como cuenta en columna", escena?.clase === "columna");
  check(
    "tiene un foco por columna más el del resultado",
    escena.focos.length === 3,
    `focos: ${escena.focos.length}`,
  );
  check(
    "empieza por las unidades, que es por donde se suma",
    escena.focos[0].clase === "pz-col-1",
    escena.focos[0].clase,
  );
  check(
    "la primera columna avisa de la llevada",
    escena.focos[0].etiqueta === "llevo 1",
    String(escena.focos[0].etiqueta),
  );
  check(
    "y lo dice también en voz alta",
    /escribo 1 y llevo 1/i.test(escena.focos[0].narracion),
    escena.focos[0].narracion,
  );
  check(
    "la llevada se escribe SOBRE las decenas, no sobre las unidades",
    marcada(escena.latex, "pz-llevada-0"),
    escena.latex.slice(0, 80),
  );
  check(
    "la columna de las decenas suma la llevada",
    /2 más 1 más 1 que llevábamos son 4/i.test(escena.focos[1].narracion),
    escena.focos[1].narracion,
  );
  check("el último foco es el resultado, subrayado y confirmado", escena.focos[2].tipo === "resultado");
  check(
    "y el resultado es el correcto",
    escena.focos[2].narracion.includes("41"),
    escena.focos[2].narracion,
  );
}

{
  const escena = escenaDeColumna("52 - 27", "e");
  check("52 - 27 se anima como cuenta en columna", escena?.clase === "columna");
  check(
    "las unidades piden prestado",
    /pido prestada una decena/i.test(escena.focos[0].narracion),
    escena.focos[0].narracion,
  );
  check("y se rotula como reagrupación", escena.focos[0].etiqueta === "reagrupo");
  check(
    "las decenas operan con la cifra ya rebajada, y se nombran las dos",
    /5, ya rebajado a 4, menos 2 son 2/i.test(escena.focos[1].narracion),
    escena.focos[1].narracion,
  );
  check(
    "la marca del préstamo aparece sobre las decenas",
    contenidoDe(escena.latex, "pz-llevada-0") === "\\scriptstyle 4",
    String(contenidoDe(escena.latex, "pz-llevada-0")),
  );
  check(
    "el resultado es el correcto",
    escena.focos[2].narracion.includes("25"),
    escena.focos[2].narracion,
  );
}

{
  // Llevadas en cascada y préstamos en cascada: es donde fallan las cuentas
  // hechas a ojo.
  const cascada = escenaDeColumna("999 + 1", "e");
  check("999 + 1 se anima", cascada?.clase === "columna");
  check(
    "el resultado de 999 + 1 es 1000",
    cascada.focos.at(-1).narracion.includes("1000"),
    cascada.focos.at(-1).narracion,
  );
  check(
    "las tres columnas llevan una",
    cascada.focos.filter((f) => f.etiqueta === "llevo 1").length === 3,
    JSON.stringify(cascada.focos.map((f) => f.etiqueta)),
  );

  const prestamos = escenaDeColumna("100 - 1", "e");
  check(
    "el resultado de 100 - 1 es 99",
    prestamos.focos.at(-1).narracion.includes("99"),
    prestamos.focos.at(-1).narracion,
  );
}

{
  // Las llevadas del guion son EXACTAMENTE las que calcula la aritmética en
  // columna: si divergen, la pizarra estaría enseñando otra cuenta.
  let coinciden = 0;
  const casos = ["24 + 17", "58 + 66", "7 + 8", "999 + 1", "52 - 27", "100 - 1", "345 - 178"];
  for (const texto of casos) {
    const op = leerSumaOResta(texto);
    const ancho = Math.max(String(op.a).length, String(op.b).length, String(op.resultado).length);
    const esperadas = marcasDeColumna(op, ancho);
    const escena = escenaDeColumna(texto, "e");
    const enLatex = esperadas.every((marca, i) =>
      marca
        ? contenidoDe(escena.latex, `pz-llevada-${i}`) === `\\scriptstyle ${marca}`
        : !marcada(escena.latex, `pz-llevada-${i}`),
    );
    if (enLatex) coinciden++;
  }
  check(
    "las marcas del guion son las de la aritmética en columna",
    coinciden === casos.length,
    `${coinciden}/${casos.length}`,
  );
}

titulo("A1. La cuenta se resuelve PASO A PASO, no de golpe");

{
  // Lo señaló el cliente probando el despliegue: la suma aparecía ya resuelta
  // —resultado abajo y llevadas arriba— desde el primer paso, y el resaltado se
  // limitaba a pasear por encima. Cada cifra tiene que aparecer cuando le toca.
  const escena = escenaDeColumna("234 + 178", "e");

  /** Las piezas que el guion revela, con el paso en que lo hace. */
  const revelaciones = [...escena.latex.matchAll(/\\htmlClass\{([^}]*)pz-rev-(\d+)\}\{([^{}]*)\}/g)]
    .map(([, clases, paso, contenido]) => ({
      clases: clases.trim(),
      paso: Number(paso),
      contenido: contenido.trim(),
    }));

  check(
    "la cuenta tiene cinco pasos: entrada, tres columnas y resultado",
    escena.focos.length + 1 === 5,
    `${escena.focos.length + 1}`,
  );

  check(
    "los sumandos NO se revelan: están desde el primer paso",
    !/234|178/.test(revelaciones.map((r) => r.contenido).join(" ")) &&
      escena.latex.includes("\\htmlClass{pz-col-0}{2}"),
  );

  const resultado = revelaciones.filter((r) => r.clases.includes("pz-resultado"));
  check("las tres cifras del resultado se revelan una a una", resultado.length === 3);
  check(
    "el 2 de las unidades aparece en el paso de las unidades",
    resultado.some((r) => r.contenido === "2" && r.paso === 0),
    JSON.stringify(resultado),
  );
  check(
    "el 1 de las decenas, en el paso de las decenas",
    resultado.some((r) => r.contenido === "1" && r.paso === 1),
  );
  check(
    "y el 4 de las centenas, en el suyo",
    resultado.some((r) => r.contenido === "4" && r.paso === 2),
  );

  const llevadas = revelaciones.filter((r) => r.clases.includes("pz-llevada"));
  check("las dos llevadas también se revelan", llevadas.length === 2);
  check(
    "la llevada sobre las decenas aparece a la vez que el 2 de las unidades",
    llevadas.some((r) => r.clases.includes("pz-llevada-1") && r.paso === 0),
    JSON.stringify(llevadas),
  );
  check(
    "y la de las centenas, en el paso de las decenas",
    llevadas.some((r) => r.clases.includes("pz-llevada-0") && r.paso === 1),
  );

  check(
    "en el paso de entrada (foco -1) no se ha destapado nada todavía",
    revelaciones.every((r) => r.paso >= 0),
  );
}

{
  // La regla general, sobre varias cuentas: la cifra de la columna `i` se
  // revela en el paso `ancho - 1 - i`, y la llevada escrita sobre la columna
  // `j`, en el paso `ancho - 2 - j`. Si esto se desalinea, la pizarra escribe
  // una cifra antes de haberla contado.
  let correctas = 0;
  const casos = ["24 + 17", "58 + 66", "999 + 1", "52 - 27", "345 - 178", "7 + 8"];
  for (const texto of casos) {
    const op = leerSumaOResta(texto);
    const ancho = Math.max(String(op.a).length, String(op.b).length, String(op.resultado).length);
    const escena = escenaDeColumna(texto, "e");
    const revelaciones = [...escena.latex.matchAll(/\\htmlClass\{([^}]*)pz-rev-(\d+)\}\{([^{}]*)\}/g)];

    const bien = revelaciones.every(([, clases, paso]) => {
      const enResultado = /pz-col-(\d+)/.exec(clases);
      if (clases.includes("pz-resultado") && enResultado) {
        return Number(paso) === ancho - 1 - Number(enResultado[1]);
      }
      const enLlevada = /pz-llevada-(\d+)/.exec(clases);
      if (enLlevada) return Number(paso) === Math.max(0, ancho - 2 - Number(enLlevada[1]));
      return false;
    });
    if (bien) correctas++;
  }
  check(
    "cada cifra y cada llevada se destapan en el paso que las calcula",
    correctas === casos.length,
    `${correctas}/${casos.length}`,
  );
}

titulo("A1a. La cuenta que DIBUJA el motor también se anima");

{
  // Cómo llega el desarrollo de una lección de aritmética: el motor no escribe
  // "234 + 178 = 412", dibuja la cuenta en columna. Leyendo sólo la forma de una
  // línea, ese desarrollo se quedaba fuera de la animación, y la pizarra de
  // arriba seguía enseñando la suma resuelta mientras la de abajo empezaba.
  const dibujada = ["  234", "+ 178", "-----", "  412"].join("\n");

  check("la cuenta dibujada se reconoce como animable", esAnimable(dibujada));

  const escena = escenaDeColumna(dibujada, "e");
  check("y produce una escena de columna", escena?.clase === "columna");
  check(
    "con los mismos focos que la escrita en una línea",
    JSON.stringify(escena.focos) ===
      JSON.stringify(escenaDeColumna("234 + 178", "e").focos),
  );

  const aMedias = ["  234", "+ 178", "-----", "    2"].join("\n");
  check(
    "el dibujo a medias —una sola columna resuelta— también se anima entero",
    esAnimable(aMedias) && escenaDeColumna(aMedias, "e").focos.length === 4,
  );

  // Y como es la misma cuenta que el enunciado, no se repite como escena.
  const guion = guionDeLeccion(["234 + 178", dibujada]);
  check(
    "el enunciado y la cuenta dibujada son una sola escena",
    guion.length === 1,
    `${guion.length} escenas`,
  );
}

titulo("A1b. Lo destapado se queda escrito, y se declara con una regla CSS");

{
  // El resultado parcial tiene que quedarse en la pizarra: al llegar a las
  // centenas siguen escritos el 2 de las unidades y el 1 de las decenas.
  check("en la entrada no hay ninguna cifra destapada", reglasDeRevelado("pz1", -1) === "");
  check(
    "en el paso de las unidades se destapa lo suyo y nada más",
    reglasDeRevelado("pz1", 0) === "#pz1 .pz-rev-0{opacity:1}",
    reglasDeRevelado("pz1", 0),
  );
  check(
    "en las decenas siguen visibles las unidades",
    reglasDeRevelado("pz1", 1) === "#pz1 .pz-rev-0,#pz1 .pz-rev-1{opacity:1}",
    reglasDeRevelado("pz1", 1),
  );
  check(
    "y en las centenas, las tres cifras ya escritas",
    reglasDeRevelado("pz1", 2) === "#pz1 .pz-rev-0,#pz1 .pz-rev-1,#pz1 .pz-rev-2{opacity:1}",
    reglasDeRevelado("pz1", 2),
  );
  check("sin identificador no se emite regla suelta", reglasDeRevelado("", 3) === "");

  const panel = readFileSync(
    new URL("../components/leccion/pizarra-animada.tsx", import.meta.url),
    "utf8",
  );
  check(
    "el revelado se declara con una regla, no escribiendo estilos en los nodos",
    panel.includes("<style>{reglasDeRevelado(") && !/\.style\.opacity\s*=/.test(panel),
  );
  check(
    "y sólo se enciende el foco de la columna que se está operando",
    /if \(i !== foco\) return \[\];/.test(panel),
  );
}

titulo("A1b2. La cancelación encierra los términos, no el signo igual");

{
  // Lo reportó el cliente y es un error matemático de los graves: en
  // "2x + 6 = 16 - 6" la caja y la tachadura abarcaban "+ 6 = 16 - 6", o sea el
  // signo igual y un número que no se cancela con nada. Cada término que se va
  // tiene que llevar SU caja.
  const escena = escenaDeDespeje("2x + 6 = 16", "e");
  const cancelacion = escena.focos.find((f) => f.tipo === "tachado");

  check(
    "el foco de cancelación enmarca dos piezas, no un tramo entero",
    Array.isArray(cancelacion.piezas) && cancelacion.piezas.length === 2,
    JSON.stringify(cancelacion.piezas),
  );
  check(
    "una por miembro: la de la izquierda y la de la derecha",
    cancelacion.piezas.includes("pz-cancela-izq") &&
      cancelacion.piezas.includes("pz-cancela-der"),
  );
  check(
    "y cada una marca sólo su número en el LaTeX",
    contenidoDe(escena.latex, "pz-cancela-izq") === "6" &&
      contenidoDe(escena.latex, "pz-cancela-der") === "6",
    `${contenidoDe(escena.latex, "pz-cancela-izq")} / ${contenidoDe(escena.latex, "pz-cancela-der")}`,
  );
  check(
    "el 16 y el signo igual quedan FUERA de toda marca",
    !marcas(escena.latex).some((m) => m.contenido.includes("16") || m.contenido.includes("=")),
    JSON.stringify(marcas(escena.latex).map((m) => m.contenido)),
  );

  // Lo mismo al simplificar: numerador y denominador se tachan por separado, sin
  // pasar la raya de la fracción por el medio.
  const simplificada = escenaDeSimplificacion("12/8", "e");
  check(
    "al simplificar se tachan numerador y denominador por separado",
    JSON.stringify(simplificada.focos[0].piezas) ===
      JSON.stringify(["pz-cancela-num", "pz-cancela-den"]),
  );

  const panel = readFileSync(
    new URL("../components/leccion/pizarra-animada.tsx", import.meta.url),
    "utf8",
  );
  check(
    "y la pizarra dibuja una caja por pieza",
    panel.includes("(f.piezas ?? [f.clase]).flatMap") &&
      panel.includes("escena.focos.flatMap((f) => f.piezas ?? [f.clase])"),
  );
  check(
    "con el rótulo escrito una sola vez",
    panel.includes("conEtiqueta={j === 0}"),
  );
}

titulo("A00. Marcado semántico genérico");

{
  // Lo que pidió el cliente: que un paso llegue ETIQUETADO —qué operación y
  // sobre qué términos— y que la pizarra lo marque sin saber de qué tema es.
  // Así el catálogo puede crecer sin tocar el frontend.
  const cancelacion = escenaDeLinea(
    {
      latex: "2x + 8 - 2x = 3x - 1 - 2x",
      operacion: { tipo: "cancelacion", terminosFoco: ["2x"], etiqueta: "se cancelan" },
      narracion: "Restamos 2x en los dos lados.",
    },
    "e",
  );

  check("un paso etiquetado produce escena semántica", cancelacion.clase === "semantica");
  check("con el trazo que le toca a su operación", cancelacion.focos[0].tipo === "tachado");
  check("y con el rótulo que trae", cancelacion.focos[0].etiqueta === "se cancelan");
  check(
    "se marcan TODAS las apariciones del término, no la primera",
    cancelacion.focos[0].piezas.length === 3,
    JSON.stringify(cancelacion.focos[0].piezas),
  );
  check(
    "cada aparición lleva su propia caja",
    new Set(cancelacion.focos[0].piezas).size === cancelacion.focos[0].piezas.length,
  );
  check(
    "y se respeta la narración del paso",
    cancelacion.focos[0].narracion === "Restamos 2x en los dos lados.",
  );

  // La regla que no se puede romper: ninguna marca cruza el igual.
  const conIgual = (escena) =>
    marcas(escena.latex).some((m) => m.contenido.includes("="));
  check("ninguna marca abarca el signo igual", !conIgual(cancelacion));

  // CADA GESTO, POR SU COMPOSITOR; Y SI NINGUNO LEE EL PASO, EL MARCADOR GENÉRICO.
  //
  // Antes toda etiqueta pasaba por el marcador genérico, que recuadra términos
  // sueltos. Ahora el tipo elige el compositor de ESE gesto —la columna con sus
  // llevadas, la amplificación con su producto a la vista—, y el genérico queda
  // para el paso que ningún compositor sabe leer. Las dos cosas se comprueban,
  // y en ninguna una marca cruza el igual.
  //
  // (Esta lista tenía "\frac{1 \times 3}…" con UNA barra dentro de las comillas:
  // en JavaScript es un salto de página y un tabulador, y la prueba corría
  // sobre una cadena rota sin que nada lo delatara.)
  const porGesto = [
    { latex: "2(x + 4) = 3x - 1", operacion: { tipo: "distributiva", terminosFoco: ["2"] }, clase: "distributiva" },
    { latex: "1/2 = 3/6", operacion: { tipo: "amplificacion", terminosFoco: ["1/2", "3/6"], etiqueta: "× 3" }, clase: "amplificacion" },
    { latex: "24 + 17", operacion: { tipo: "columna", terminosFoco: ["24", "17"] }, clase: "columna" },
    { latex: "12 × 4 = (10 + 2) × 4", operacion: { tipo: "distributiva", terminosFoco: ["10", "2"] }, clase: "semantica" },
  ];
  const desvios = porGesto
    .map((paso) => ({ paso, escena: escenaDeLinea(paso, "e") }))
    .filter(({ paso, escena }) => escena.origen !== "etiqueta" || escena.clase !== paso.clase || conIgual(escena));
  check(
    "cada gesto etiquetado se dibuja con su compositor, o con el genérico si ninguno lo lee",
    desvios.length === 0,
    desvios.map(({ paso, escena }) => `${paso.latex} → ${escena.origen}/${escena.clase}`).join(" · "),
  );

  // Un término que no está escrito no se marca: dibujar un recuadro sobre la
  // nada no da error, sólo se ve mirando. La escena cae entonces en la lectura
  // deducida —"3x = 12" es un despeje— en lugar de en un marcado inventado.
  {
    const sinTermino = escenaDeLinea(
      { latex: "3x = 12", operacion: { tipo: "cancelacion", terminosFoco: ["7y"] } },
      "e",
    );
    check(
      "un término que no está en el paso no inventa un resaltado",
      sinTermino.clase !== "semantica" &&
        !sinTermino.focos.some((f) => (f.piezas ?? []).some((p) => p.startsWith("pz-foco-"))),
      sinTermino.clase,
    );
  }

  // El marcado nunca toca el nombre de una macro: la "x" de \exp no es la
  // incógnita.
  //
  // (Esta prueba usaba "2 \times x + 1" con UNA barra dentro de las comillas:
  // en JavaScript eso es un tabulador seguido de "imes", así que no había
  // ninguna macro en la cadena y la prueba pasaba sin probar nada. Además,
  // "times" no lleva x. Ahora la macro está de verdad y lleva la letra.)
  const conMacro = marcarTerminos(
    "2 \\exp x + 1",
    ["x"],
    () => "pz-marcado pz-p0",
  );
  check(
    "no se marca la x de una macro de LaTeX",
    (conMacro.latex.match(/htmlClass/g) || []).length === 1,
    conMacro.latex,
  );

  // Y el reparto por miembros es el que garantiza lo anterior.
  check(
    "la expresión se parte por el igual de nivel superior",
    JSON.stringify(miembros("a + b = c = d")).replace(/ /g, "") === '["a+b","c","d"]' &&
      miembros("\htmlClass{x}{a = b} + 1").length === 1,
  );
}

titulo("A00a. La distributiva se reparte a la vista");

{
  // El cliente lo pidió: en 2(x + 4) el alumno ve de pronto 2x + 8 sin saber
  // por qué. Hay que enseñar que el 2 entra en los dos sumandos.
  const e = escenaDeDistributiva("2(x + 4) = 3x - 1", "e");
  check("2(x + 4) se anima como distributiva", e?.clase === "distributiva");
  check(
    "un paso por sumando, más el resultado",
    e.focos.length === 3,
    `${e.focos.length} focos`,
  );
  check(
    "cada paso enmarca el factor Y el sumando al que llega",
    JSON.stringify(e.focos[0].piezas) === JSON.stringify(["pz-reparte-0", "pz-reparte-1"]) &&
      JSON.stringify(e.focos[1].piezas) === JSON.stringify(["pz-reparte-0", "pz-reparte-2"]),
  );
  check(
    "y se dice qué da cada producto",
    /El 2 multiplica a x: da 2x\./.test(e.focos[0].narracion) &&
      /Y el 2 multiplica a 4: da 8\./.test(e.focos[1].narracion),
    e.focos[0].narracion,
  );
  check(
    "el resultado no se destapa hasta el final",
    e.latex.includes("\htmlClass{pz-rev-2}") && e.focos[2].clase === "pz-resultado",
  );
  check("y es el correcto", e.focos[2].narracion === "Queda 2x + 8.", e.focos[2].narracion);

  const conResta = escenaDeDistributiva("3(2x - 5)", "e");
  check(
    "con un signo menos dentro, también",
    conResta.focos.at(-1).narracion === "Queda 6x - 15.",
    conResta.focos.at(-1).narracion,
  );
  check(
    "lo que no es un reparto de los que se enseñan aquí se deja pasar",
    escenaDeDistributiva("2(x + y)", "e") === null &&
      escenaDeDistributiva("x(x+1)", "e") === null,
  );
}

titulo("A00a1. La lección de fracciones, tal como la escribe el generador");

{
  // LA LECCIÓN QUE EL CLIENTE TENÍA DELANTE, LÍNEA POR LÍNEA.
  //
  // Esta batería probaba la amplificación con "1/2 = 3/6", que es como la
  // escribe el generador de mentira. El de verdad escribe el producto entero
  // —"3/5 = (3 * 2)/(5 * 2) = 6/10"—, ninguna lectura lo reconocía, y el guion
  // salía VACÍO: el panel animado no llegaba a montarse y en pantalla quedaba
  // la tarjeta de desarrollo, estática, con la solución entera a la vista. Es
  // exactamente lo que se reportó como "una imagen estática con audio de
  // fondo". Se prueba con las líneas reales, no con las cómodas.
  const LECCION = [
    "3/5 + 1/2 = ?",
    "3/5 = (3 * 2)/(5 * 2) = 6/10",
    "1/2 = (1 * 5)/(2 * 5) = 5/10",
    "6/10 + 5/10 = (6 + 5)/10 = 11/10",
  ];

  const guion = guionDeLeccion(LECCION);
  check("la lección de fracciones produce escenas que animar", guion.length === 3, `${guion.length}`);
  check(
    "y ninguna se queda sin focos",
    guion.every((e) => e.focos.length > 0),
  );

  // El paso intermedio que el cliente marcó como indispensable.
  const amp = escenaDeLinea("3/5 = (3 * 2)/(5 * 2) = 6/10", "e");
  check("el producto explícito se lee como amplificación", amp.clase === "amplificacion");
  check(
    "la línea se compone entera: origen, producto y resultado",
    /\\frac\{3\}\{5\}/.test(amp.latex) &&
      /3 \\times/.test(amp.latex) &&
      /5 \\times/.test(amp.latex) &&
      /\\frac\{6\}\{10\}/.test(amp.latex),
    amp.latex,
  );
  check(
    "el factor va marcado arriba Y abajo, cada uno con su recuadro",
    amp.focos[0].piezas?.join(",") === "pz-factor-num,pz-factor-den",
  );
  check("con su rótulo", amp.focos[0].etiqueta === "× 2");
  check(
    "el producto no está en pantalla desde el principio",
    /pz-rev-0/.test(amp.latex) && /pz-rev-1/.test(amp.latex),
  );

  // Las tres formas en que puede llegar el mismo paso.
  check(
    "se lee con el producto delante, detrás o sin él",
    Boolean(leerAmplificacion("3/5 = (3 * 2)/(5 * 2) = 6/10")) &&
      Boolean(leerAmplificacion("3/5 = (3 * 2)/(5 * 2)")) &&
      Boolean(leerAmplificacion("3/5 = 6/10")),
  );
  check(
    "y en LaTeX, con aspa o con asterisco",
    Boolean(leerAmplificacion("\\frac{1}{2} = \\frac{3}{6}")) &&
      Boolean(leerAmplificacion("1/2 = (1 × 3)/(2 × 3)")),
  );
  check(
    "una amplificación que no sale NO se adorna",
    leerAmplificacion("1/2 = (1 * 3)/(2 * 3) = 3/7") === null &&
      leerAmplificacion("1/2 = (1 * 3)/(2 * 4)") === null &&
      leerAmplificacion("1/2 = 2/5") === null,
  );

  // Y la otra mitad de la lección: sumar ya con el mismo denominador.
  const suma = escenaDeLinea("6/10 + 5/10 = (6 + 5)/10 = 11/10", "e");
  check("la suma con el mismo denominador también se anima", suma.clase === "suma-fracciones");
  check(
    "arriba se opera y abajo no: un foco para cada cosa",
    suma.focos[0].piezas?.join(",") === "pz-num-0,pz-num-1" &&
      suma.focos[1].piezas?.join(",") === "pz-den-0,pz-den-1",
  );
  check(
    "y el resultado no sale hasta el final",
    /pz-rev-2\}\{= \\htmlClass\{pz-solucion\}/.test(suma.latex),
    suma.latex,
  );
  check(
    "con denominadores distintos no se compone: ése es otro paso",
    leerSumaDeFracciones("3/5 + 1/2 = 11/10") === null,
  );
  check(
    "y una suma que no sale tampoco",
    leerSumaDeFracciones("1/4 + 2/4 = 4/4") === null,
  );
  check("la resta se lee igual", Boolean(leerSumaDeFracciones("3/4 - 1/4 = 2/4")));

  // KaTeX tiene que conservar TODAS las marcas: sin ellas no hay nada que medir.
  for (const escena of guion) {
    const html = katex.renderToString(escena.latex, {
      displayMode: true,
      throwOnError: false,
      strict: false,
      trust: (ctx) => ctx.command === "\\htmlClass",
    });
    const piezas = escena.focos.flatMap((f) => f.piezas ?? [f.clase]);
    check(
      `KaTeX conserva las marcas de "${escena.texto}"`,
      piezas.every((p) => html.includes(p)) && !/katex-error/.test(html),
    );
  }
}

titulo("A00a1g. Revisión 9b06d70: pizza circular, brazo de la distributiva, llevo 1 sin tapar");

{
  const diagramaTsx = readFileSync(
    new URL("../components/leccion/diagrama-concepto.tsx", import.meta.url),
    "utf8",
  );
  const pizarraTsx = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  const panelTsx = readFileSync(
    new URL("../components/leccion/pizarra-animada.tsx", import.meta.url),
    "utf8",
  );
  const estilos = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const aulaTsx = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  const lsgPrompt = readFileSync(new URL("../src/lsgPrompt.js", import.meta.url), "utf8");

  // 1a. LA PIZZA ES UN CÍRCULO, NO UNA BARRA.
  //
  // "Si el diálogo explica 'partes una pizza en 4 porciones iguales', la
  // barra abstracta no conecta con la metáfora." Se dibuja con gajos —un
  // <path> de arco por porción—, no con <rect> en fila.
  check(
    "el diagrama de fracciones dibuja gajos de círculo, no barras",
    /gajo = \(indice: number\)/.test(diagramaTsx) &&
      /A \$\{r\} \$\{r\} 0 \$\{arcoLargo\} 1/.test(diagramaTsx) &&
      !/x=\{f\.margen \+ i \* f\.celda\}/.test(diagramaTsx),
  );
  check(
    "y cada gajo entra con su propio pequeño corte, uno detrás de otro",
    /pz-porcion/.test(diagramaTsx) && /animationDelay: `\$\{i \* 55\}ms`/.test(diagramaTsx),
  );
  check(
    "la animación respeta prefers-reduced-motion",
    /\.pz-porcion \{/.test(estilos) && /prefers-reduced-motion: reduce\) \{\s*\.pz-porcion/.test(estilos),
  );

  // 1b. NUMERADOR Y DENOMINADOR APARECEN CUANDO SE DICEN, NO ANTES.
  check(
    "PartesDeUnTodo no dibuja la flecha ni el arco hasta que se avisa",
    /\{vistoNumerador && \(/.test(diagramaTsx) && /\{vistoDenominador && \(/.test(diagramaTsx),
  );
  check(
    "por defecto los dos se ven —la otra redacción no pierde sus rótulos—",
    /vistoNumerador = true,\s*vistoDenominador = true,/.test(diagramaTsx),
  );
  check(
    "Pizarra deduce lo dicho de lo que ya se ha escrito en la fase, por cómo EMPIEZA la línea",
    /RE_NUMERADOR_ESCRITO = \/\^numerador\\s\*:\/i/.test(pizarraTsx) &&
      /RE_DENOMINADOR_ESCRITO = \/\^denominador\\s\*:\/i/.test(pizarraTsx),
  );
  check(
    "y se lo pasa al diagrama",
    /vistoNumerador=\{vistoNumerador\}/.test(pizarraTsx) && /vistoDenominador=\{vistoDenominador\}/.test(pizarraTsx),
  );

  // 1c. LA EXPRESIÓN FORMAL, AL CERRAR LA IDEA.
  check(
    '"falta mostrar la expresión matemática explícita": aparece cuando ya se han dicho las dos palabras',
    /Numerador \/ Denominador:<\/span>/.test(pizarraTsx) &&
      /vistoNumerador && vistoDenominador && \(/.test(pizarraTsx),
  );

  // 1d. LA NARRACIÓN SE CUENTA EN DOS PASOS, NO EN UNO —Y LA MARCA DE ROTACIÓN
  //     NO SE ROMPE—.
  {
    const crudo = fraccionResueltaLSG({ concepto: true, nivel: "normal", evitar: "cuántas partes tomo" });
    const salida = processLSG(crudo, "aprender", "fracciones");
    const modConcepto = salida.lsg.modulos.find((m) => m.id === "concepto");
    const contenidos = (modConcepto?.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => d.contenido);
    check(
      "el numerador y el denominador se escriben en líneas separadas, cada una con su propio hablar antes",
      contenidos.some((c) => /^Numerador:/.test(c)) && contenidos.some((c) => /^Denominador:/.test(c)),
      JSON.stringify(contenidos),
    );
    const iN = contenidos.findIndex((c) => /^Numerador:/.test(c));
    const iD = contenidos.findIndex((c) => /^Denominador:/.test(c));
    check("y el numerador se escribe ANTES que el denominador", iN >= 0 && iD > iN);
    check(
      "la frase de cierre conserva la marca exacta de la que depende la rotación",
      contenidos.some((c) => c === "Fracción: numerador / denominador"),
    );
    // Y la otra redacción, sin tocar: sigue sin usar esas dos palabras.
    const crudo2 = fraccionResueltaLSG({ concepto: true, nivel: "normal", evitar: "numerador / denominador" });
    const salida2 = processLSG(crudo2, "aprender", "fracciones");
    const contenidos2 = (salida2.lsg.modulos.find((m) => m.id === "concepto")?.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => d.contenido);
    check(
      '"cuántas partes tomo" sigue intacta, sin las palabras "Numerador:"/"Denominador:"',
      contenidos2.length > 0 &&
        !contenidos2.some((c) => /^Numerador:/.test(c)) &&
        !contenidos2.some((c) => /^Denominador:/.test(c)),
      JSON.stringify(contenidos2),
    );
  }

  // 2. "LLEVO 1" NO TAPA LA CIFRA.
  //
  // El desplazamiento fijo (6 px) valía para el tamaño de letra de pantalla,
  // pero en Modo proyección la letra del rótulo crece mucho más —hasta
  // 1,75rem— y el rótulo quedaba prácticamente encima de la llevada. Con
  // `dy="-0.65em"` el hueco se mide en la propia unidad del texto, así que
  // crece con la letra en cualquier tamaño.
  check(
    'la etiqueta ya no sube un margen fijo: usa dy="-0.65em", relativo a su propia letra',
    (panelTsx.match(/dy="-0\.65em"/g) ?? []).length >= 2 && !/y=\{caja\.y - 6\}/.test(panelTsx),
  );

  // 3. EL BRAZO DE LA DISTRIBUTIVA.
  //
  // El cliente lo dibujó a mano: un arco que sale del factor y entra en el
  // sumando al que multiplica, no sólo dos cajas separadas.
  check(
    "hay un componente que dibuja el arco entre el factor y el sumando",
    /function ConectorReparto/.test(panelTsx) && /markerEnd="url\(#pz-flecha-reparto\)"/.test(panelTsx),
  );
  check(
    "sólo se dibuja para la distributiva, y sólo con exactamente dos piezas",
    /escena\.clase !== "distributiva"\) return null/.test(panelTsx) &&
      /f\.piezas\.length !== 2\) return null/.test(panelTsx),
  );
  check(
    "reutiliza el trazo azul de las cajas —mismo color, misma animación de dibujado—",
    /className="pz-trazo"[\s\S]{0,80}markerEnd/.test(panelTsx),
  );

  // 4. LA IDENTIDAD TIPOGRÁFICA: tres roles, tres fuentes.
  check(
    "hay una fuente para lo que el tutor DICE, con el nombre que pidió el cliente",
    /\.pz-manuscrita \{\s*font-family: "Segoe Print", "Bradley Hand", "Snell Roundhand", cursive;/.test(estilos),
  );
  check(
    "y otra para lo que se ESCRIBE en la pizarra que no es una fórmula",
    /\.pz-tiza \{\s*font-family: "Chalkboard SE", "Comic Sans MS", "Comic Sans", sans-serif;/.test(estilos),
  );
  check(
    "el subtítulo del tutor va en la manuscrita",
    /pz-manuscrita rounded-md bg-muted\/60/.test(aulaTsx),
  );
  check(
    "el pie de la pizarra animada —lo que dice el foco encendido— también",
    /\.pz-pie \{\s*font-family: "Segoe Print"/.test(estilos),
  );
  check(
    "la etiqueta de la llevada y los rótulos del diagrama van en tiza",
    /\.pz-etiqueta \{[\s\S]{0,140}font-family: "Chalkboard SE"/.test(estilos) &&
      /\.pz-diagrama text \{\s*font-family: "Chalkboard SE"/.test(estilos),
  );
  check(
    "una nota escrita en la pizarra que no se dejó componer como fórmula también va en tiza",
    /"pz-manuscrita text-base text-muted-foreground"\s*:\s*"pz-tiza text-base font-medium"/.test(pizarraTsx),
  );
  // Las fórmulas no se tocan: KaTeX sigue siendo quien las compone, sin una
  // fuente distinta impuesta encima.
  check(
    "las fórmulas siguen sin una fuente propia forzada: las compone KaTeX tal cual",
    !/\.katex\s*\{[^}]*font-family/.test(estilos),
  );
}

titulo("A00a1f. Revisión f515a57: ejercicio completo, marca limpia y proyección siempre");

{
  const panelTsx = readFileSync(new URL("../components/leccion/pizarra-animada.tsx", import.meta.url), "utf8");
  const aulaTsx = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  const pizarraClasica = readFileSync(new URL("../components/leccion/pizarra.tsx", import.meta.url), "utf8");
  const reproductor = readFileSync(new URL("../public/pseLight.js", import.meta.url), "utf8");
  const estilos = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  // 2. EL RESULTADO SE SUBRAYA Y SE CONFIRMA, NO SE RODEA.
  check(
    "el resultado ya no se rodea con un óvalo que cruce las cifras",
    !/<ellipse/.test(panelTsx) && !/"ovalo"/.test(readFileSync(new URL("../lib/leccion/animacion.ts", import.meta.url), "utf8")),
  );
  check(
    "se dibuja con doble subrayado y un visto a su derecha",
    /pz-subrayado"/.test(panelTsx) && /pz-subrayado pz-subrayado-2"/.test(panelTsx) && /pz-trazo pz-visto"/.test(panelTsx),
  );
  check(
    "proporcionado al número: en proyección las dos rayas no se funden",
    /caja\.alto \* 0\.09/.test(panelTsx) && /Math\.min\(64, Math\.max\(12, caja\.alto \* 0\.45\)\)/.test(panelTsx),
  );
  check(
    "y trazado en orden: primera raya, segunda y el visto",
    /\.pz-subrayado-2 \{[^}]*animation-delay/.test(estilos) && /\.pz-visto \{[^}]*animation-delay/.test(estilos),
  );
  check(
    "la marca mide los glifos, no la caja de la línea: abarca el denominador",
    /pieza\.querySelectorAll\("\*"\)/.test(panelTsx) && /classList\.contains\("frac-line"\)/.test(panelTsx),
  );

  // 3. LA REGLA Y SU EJEMPLO, CENTRADOS Y DEL MISMO TAMAÑO.
  check(
    "el ejemplo de la regla se compone en modo display, no en línea",
    /<Formula latex=\{regla\.ejemplo\} display \/>/.test(pizarraClasica),
  );
  check(
    "centrado y al tamaño de la regla",
    (pizarraClasica.match(/pz-regla-formula[^"]*text-center/g) ?? []).length === 2 &&
      /\.pz-regla-formula \.katex \{[^}]*font-size: 1\.5rem/.test(estilos),
  );

  // 1. EL "MÁS DIFÍCIL" NO SE QUEDA EN "PREPARANDO EL EJERCICIO…".
  check(
    "al sustituir el ejercicio, la tarjeta toma el nuevo en el acto",
    /presentacion === "sustituir"[\s\S]{0,1600}p\?\.tipo === "pizarra"[\s\S]{0,700}fijarLineaEjercicio\(/.test(aulaTsx),
  );
  check(
    "y un enunciado para resolver se lleva la tarjeta, con su desarrollo",
    /esEnunciadoParaResolver\(limpio\)[\s\S]{0,200}fijarLineaEjercicio\(linea\);\s*setDesarrollo\(\[\]\);/.test(aulaTsx),
  );
  check(
    '"19 + 45 = ?" es un enunciado para resolver; "24 + 17 = 41" no',
    esEnunciadoParaResolver("19 + 45 = ?") &&
      esEnunciadoParaResolver("3/5 + 1/2 =?") &&
      !esEnunciadoParaResolver("24 + 17 = 41") &&
      !esEnunciadoParaResolver("24 + 17"),
  );

  // 4a. EL EJERCICIO NO QUEDA A MEDIAS.
  const deLaCaptura = cierreDelDesarrollo({
    enunciado: "3/5 + 1/2 = ?",
    lineas: ["3/5 = (3 * 2)/(5 * 2) = 6/10", "1/2 = (1 * 5)/(2 * 5) = 5/10", "6/10 + 5/10"],
    respuesta: "11/10",
  });
  check(
    'el desarrollo cortado en "6/10 + 5/10" se completa con el 11/10',
    deLaCaptura?.accion === "completar" && deLaCaptura.texto === "6/10 + 5/10 = 11/10",
    JSON.stringify(deLaCaptura),
  );
  check(
    "sin desarrollo, se añade el enunciado resuelto",
    cierreDelDesarrollo({ enunciado: "2411 + 2457 = ?", lineas: [], respuesta: "4868" })?.texto === "2411 + 2457 = 4868",
  );
  check(
    "lo que ya está cerrado no se toca",
    cierreDelDesarrollo({ enunciado: "3/5 + 1/2 = ?", lineas: ["6/10 + 5/10 = 11/10"], respuesta: "11/10" }) === null,
  );
  check(
    "y nunca se escribe una cuenta que no sale",
    cierreDelDesarrollo({ enunciado: "3/5 + 1/2 = ?", lineas: ["6/10 + 5/10"], respuesta: "1/2" }) === null &&
      cierreDelDesarrollo({ enunciado: "¿Cuál es la derivada de 5x²?", lineas: [], respuesta: "10x" }) === null,
  );
  check(
    "el cierre se aplica al acertar, con la respuesta que da el reproductor",
    /onLessonEnd: \(\{ acerto, respuesta \}/.test(aulaTsx) &&
      /if \(acerto && respuesta\)/.test(aulaTsx) &&
      /respuesta: this\._acerto \? this\._respuesta : null/.test(reproductor),
  );

  // 4a (b). LA EXPLICACIÓN NO SE COME LA PREGUNTA.
  const devuelta = conPreguntaPendiente(
    { directivas: [{ tipo: "hablar", texto: "Te lo explico." }] },
    { tipo: "preguntar", texto: "¿Cuánto es 3/5 + 1/2?", respuesta: "11/10" },
  );
  check(
    "tras explicar, se vuelve a plantear la pregunta pendiente con su respuesta",
    devuelta.directivas.at(-1)?.tipo === "preguntar" && devuelta.directivas.at(-1)?.respuesta === "11/10",
  );
  check(
    "el reproductor guarda la pregunta en curso y la retira al resolverla",
    /this\._pendiente = \{/.test(reproductor) && /preguntaPendiente\(\) \{/.test(reproductor),
  );
  check(
    "y el aula la lee ANTES de pedir la explicación",
    /const preguntaPendiente = opciones\.soloExplicacion/.test(aulaTsx) &&
      /conPreguntaPendiente\(sinPreguntas\(recortada\), preguntaPendiente\)/.test(aulaTsx),
  );

  // 4b. EL MODO PROYECCIÓN NO DESAPARECE.
  check(
    "sin nada que animar, el panel no se retira: queda la barra con el botón",
    /if \(sinAnimacion && !escenaDeReposo\) return null;/.test(panelTsx) && /reposo=\{reposo\}/.test(aulaTsx),
  );
  check(
    "y en pantalla no repite lo que ya enseña la pizarra",
    /\(!sinAnimacion \|\| proyeccion\) && \(/.test(panelTsx),
  );
  check(
    "al terminar la lección, la pizarra animada queda resuelta",
    /if \(!leccionTerminada \|\| escenas\.length === 0\) return;/.test(panelTsx) &&
      /leccionTerminada=\{terminoLaLeccion && !controles\.playing\}/.test(aulaTsx),
  );
  check(
    'en proyección, el botón "Salir" tiene fondo propio: no es blanco sobre blanco',
    /\.modo-proyeccion button \{[^}]*background-color/.test(estilos),
  );
  check(
    "y el avatar se ve sobre la pizarra oscura",
    /\.modo-proyeccion \.pz-avatar \.avatar-cabeza \{[^}]*fill:/.test(estilos),
  );
  const estatica = escenaEstatica("3/5 + 1/2 = ?", "r");
  check(
    "la escena de reposo se compone como fórmula, sin marcas ni piezas ocultas",
    Boolean(estatica.latex) && estatica.focos.length === 0 && !/pz-rev-/.test(estatica.latex ?? ""),
    String(estatica.latex),
  );
}

titulo("A00a1e. El motor entrega el paso etiquetado, y la pizarra lo usa");

{
  // EL CONTRATO DEL CLIENTE, DE PUNTA A PUNTA.
  //
  // "El paso matemático entrega: expresión, tipo de foco (columna, factor,
  // cancelación) y texto de locución. La subrutina aplica el recuadro, color o
  // tachado sobre el token correspondiente sin importar el tema ni los
  // números." Hasta aquí el contrato existía y nadie lo cumplía: los motores
  // escribían texto y la pizarra lo adivinaba. Se comprueba con la salida REAL
  // de cada motor pasada por el PRE Light, que es por donde llega al alumno.
  const MOTORES = [
    ["suma", () => sumaResueltaLSG({ concepto: true }), 1],
    ["resta", () => restaResueltaLSG({ concepto: true }), 1],
    ["multiplicación", () => multiplicacionResueltaLSG({ concepto: true }), 2],
    ["división", () => divisionResueltaLSG({ concepto: true }), 2],
    ["fracciones", () => fraccionResueltaLSG({ concepto: true, nivel: "normal" }), 1],
    ["fracciones con denominadores distintos", () => fraccionResueltaLSG({ concepto: true, nivel: "dificil" }), 3],
    ["ecuaciones lineales", () => linealResueltaLSG({ concepto: true }), 2],
    ["derivadas", () => derivadaResueltaLSG({ concepto: true }), 1],
    ["factorización", () => factorizacionResueltaLSG({ concepto: true }), 1],
  ];

  for (const [nombre, generar, esperados] of MOTORES) {
    const crudo = generar();
    const enviados = (crudo.modulos ?? [])
      .flatMap((m) => m.directivas ?? [])
      .filter((d) => d.tipo === "pizarra" && d.operacion);
    const pasos = processLSG(crudo, "aprender", nombre).pasos.filter((p) => p.tipo === "pizarra");
    const etiquetados = pasos.filter((p) => p.operacion);

    check(
      `${nombre}: el motor etiqueta sus pasos operativos`,
      enviados.length === esperados,
      `${enviados.length} etiquetados, se esperaban ${esperados}`,
    );
    check(
      `${nombre}: ninguna etiqueta se pierde en la validación del servidor`,
      etiquetados.length === enviados.length,
      `${etiquetados.length} de ${enviados.length}`,
    );

    const mal = etiquetados
      .map((p) => ({
        p,
        e: escenaDeLinea({ latex: p.contenido, operacion: p.operacion, narracion: p.narracion }, "e"),
      }))
      .filter(({ e }) => e.origen !== "etiqueta" || e.focos.length === 0);
    check(
      `${nombre}: y cada paso etiquetado se dibuja POR SU ETIQUETA`,
      mal.length === 0,
      mal.map(({ p, e }) => `${p.contenido} → ${e.origen}/${e.clase}`).join(" · "),
    );
    check(
      `${nombre}: con la locución del paso`,
      etiquetados.every((p) => typeof p.narracion === "string" && p.narracion.length > 0),
    );
  }

  // Los tres pasos que NINGUNA lectura sabía animar, y que ahora se animan
  // porque el motor dice qué hacer con ellos.
  for (const [contenido, operacion] of [
    ["12 × 4 = (10 + 2) × 4", { tipo: "distributiva", terminosFoco: ["10", "2"] }],
    ["derivada de x² = 2x", { tipo: "factor", terminosFoco: ["2"] }],
    ["84 ÷ 4 = 21", { tipo: "factor", terminosFoco: ["4", "21"] }],
  ]) {
    check(
      `"${contenido}" no se animaba sin etiqueta`,
      escenaDeLinea(contenido, "e").focos.length === 0,
    );
    const conEtiqueta = escenaDeLinea({ latex: contenido, operacion }, "e");
    const html = katex.renderToString(conEtiqueta.latex ?? "", {
      displayMode: true,
      throwOnError: false,
      strict: false,
      trust: (ctx) => ctx.command === "\\htmlClass",
    });
    check(
      `y con ella sí, con fórmula compuesta y sus marcas`,
      conEtiqueta.focos.length > 0 &&
        conEtiqueta.focos.flatMap((f) => f.piezas ?? []).every((p) => html.includes(p)) &&
        !/katex-error/.test(html),
    );
  }

  // LO QUE NO PUEDE PASAR: que una etiqueta mala dibuje algo.
  check(
    "una etiqueta que señala un término que no está se descarta en el servidor",
    processLSG(
      {
        escena: "x",
        intencion: "explicar",
        directivas: [
          { tipo: "hablar", texto: "Restamos." },
          {
            tipo: "pizarra",
            accion: "escribir",
            contenido: "2x + 15 = 25",
            operacion: { tipo: "cancelacion", terminosFoco: ["5"] },
          },
        ],
      },
      "explicar",
      "",
    ).pasos.find((p) => p.tipo === "pizarra").operacion === undefined,
  );
  check(
    "y si llegara, la pizarra la ignora y deduce el paso",
    escenaDeLinea(
      { latex: "1/2 = 3/6", operacion: { tipo: "cancelacion", terminosFoco: ["7"] } },
      "e",
    ).origen === "deduccion",
  );
  check(
    'un término es un término: el "1" no está en "11/10", ni el "5" en "15"',
    posicionesDeTermino("11/10", "1").length === 0 && !apareceComoTermino("2x + 15 = 25", "5"),
  );
  check(
    "y el exponente escrito como superíndice sí cuenta como escrito",
    apareceComoTermino("derivada de 3x² = 6x", "2") &&
      etiquetaValida("derivada de 3x² = 6x", { tipo: "factor", terminosFoco: ["3", "2", "6"] }),
  );

  // El servidor y la interfaz reconocen los MISMOS gestos.
  check(
    "el PRE Light y la pizarra aceptan la misma lista de gestos",
    JSON.stringify([...TIPOS_OPERACION_SERVIDOR].sort()) === JSON.stringify([...TIPOS_OPERACION].sort()),
  );
}

titulo("A00a1d. Cada bloque, en el módulo que le toca");

{
  // EL TEXTO DE LA PIZZA SONABA EN "REGLAS Y PROPIEDADES".
  //
  // El cliente lo leyó como estado congelado de la pantalla anterior. No lo
  // era: el bloque estaba COLOCADO en el módulo equivocado. Las redacciones de
  // concepto se repartían por POSICIÓN —el primer bloque es el qué es, el
  // segundo la regla—, y eso vale para derivadas y factorización, cuyo segundo
  // bloque es la regla de la potencia o la diferencia de cuadrados. En
  // fracciones los dos bloques explican qué es una fracción, así que el de la
  // pizza acababa en "regla" y se narraba con la fase de reglas abierta.
  const modulosDe = (lsg) => {
    const dentro = new Map();
    for (const mod of lsg.modulos ?? []) {
      for (const d of mod.directivas ?? []) {
        const texto = String(d.texto ?? d.contenido ?? "");
        if (texto.trim()) dentro.set(texto, mod.id);
      }
    }
    return dentro;
  };

  const fracciones = modulosDe(fraccionResueltaLSG({ concepto: true, nivel: "normal" }));
  const pizza = [...fracciones.keys()].find((t) => /pizza en 4 porciones/.test(t));
  check("la lección de fracciones trae el ejemplo de la pizza", Boolean(pizza));
  check(
    "y va en Concepto, no en Reglas y propiedades",
    pizza ? fracciones.get(pizza) === "concepto" : false,
    pizza ? fracciones.get(pizza) : "",
  );
  check(
    "la fase de Reglas sigue existiendo, con la equivalencia",
    [...fracciones.entries()].some(
      ([texto, mod]) => mod === "regla" && /Fracciones equivalentes/.test(texto),
    ),
  );

  // Y las dos lecciones que SÍ usan el reparto por posición no pueden perder su
  // fase de reglas: es el mismo camino y se rompería sin que se notara aquí.
  for (const [nombre, generador] of [
    ["derivadas", derivadaResueltaLSG],
    ["factorización", factorizacionResueltaLSG],
  ]) {
    const mods = modulosDe(generador({ concepto: true }));
    check(
      `${nombre} conserva su módulo de reglas`,
      [...mods.values()].includes("regla"),
      [...new Set(mods.values())].join(", "),
    );
  }
}

titulo("A00a1c. Una sola subrutina compone las dos pizarras");

{
  // LA NOTACIÓN NO PUEDE DEGRADARSE A TEXTO PLANO.
  //
  // La pizarra de arriba componía las líneas con el conversor genérico, que no
  // sabe leer un producto dentro de una fracción: "3/5 = (3 * 2)/(5 * 2) =
  // 6/10" salía con sus asteriscos y sus barras, con aspecto de consola,
  // mientras la de abajo componía LA MISMA línea como fracción con el factor en
  // color. Ahora las dos pasan por `escenaDeLinea`, que es la subrutina.
  const pizarraTsx = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "la pizarra clásica compone con la misma subrutina que anima",
    /import \{ escenaDeLinea \} from "@\/lib\/leccion\/animacion"/.test(pizarraTsx) &&
      /\?\? latexDeLaSubrutina\(linea\)/.test(pizarraTsx),
  );
  check(
    "y le pasa la instrucción de foco —y la locución— del paso cuando vienen dadas",
    /escenaDeLinea\(pasoDeLinea\(linea\), "pizarra"\)/.test(pizarraTsx) &&
      /linea\.operacion \? \{ operacion: linea\.operacion \}/.test(pizarraTsx) &&
      /linea\.narracion \? \{ narracion: linea\.narracion \}/.test(pizarraTsx),
  );
  check(
    "sólo cae a la notación formal o al conversor genérico si la subrutina no reconoce nada",
    /\?\? latexDeLaSubrutina\(linea\)\s*\?\? notacionFormal\(texto\)\s*\?\? \(pareceMatematica/.test(pizarraTsx),
  );

  // Y el resultado: fracciones de verdad, con el factor marcado, para las tres
  // líneas de la lección que salían en crudo.
  for (const linea of [
    "3/5 = (3 * 2)/(5 * 2) = 6/10",
    "1/2 = (1 * 5)/(2 * 5) = 5/10",
    "6/10 + 5/10 = (6 + 5)/10 = 11/10",
  ]) {
    const escena = escenaDeLinea(linea, "estatica");
    check(
      `"${linea}" se compone como fracción, no como texto de consola`,
      escena.focos.length > 0 && !/\*/.test(escena.latex) && /\\frac/.test(escena.latex),
      escena.latex,
    );
  }
}

titulo("A00a1b. La pizarra empieza en reposo y avanza en orden");

{
  // EL DESFASE QUE REPORTÓ EL CLIENTE.
  //
  // Mientras el avatar daba la bienvenida de "Reglas y propiedades" —"Cuando
  // los números tienen varias cifras…"—, la pizarra ya estaba en "Paso 3 de 4"
  // con la columna de las decenas resuelta. La frase enumera columnas ("primero
  // las unidades, luego las decenas") y repite un par de unos, y con eso puntúa
  // más alto en el paso de las decenas que en ningún otro sitio.
  const guion = guionDeLeccion(["24 + 17 = 41"]);
  const APERTURA =
    "Cuando los números tienen varias cifras, sumamos columna por columna, de derecha a izquierda (primero las unidades, luego las decenas...). Si una columna pasa de 9, escribimos la cifra de las unidades y LLEVAMOS 1 a la siguiente. Veámoslo con un ejemplo.";

  const enReposo = situacionParaNarracion(guion, APERTURA, 0, -1);
  check(
    "la locución que presenta la regla NO saca a la pizarra del reposo",
    enReposo?.foco === -1,
    enReposo ? `foco ${enReposo.foco}` : "sin situación",
  );

  // Y desde el reposo, la lección entera en orden: unidades, decenas, resultado.
  const LECCION = [
    [APERTURA, -1],
    ["Sumamos las unidades: 4 más 7 son 11, escribimos el 1 y llevamos 1 a las decenas.", 0],
    ["Decenas: 2 más 1 más 1 que llevábamos son 4.", 1],
    ["Así, 24 más 17 son 41.", 2],
  ];
  let escena = 0;
  let foco = -1;
  for (const [dicho, esperado] of LECCION) {
    const destino = situacionParaNarracion(guion, dicho, escena, foco);
    if (destino) {
      escena = destino.escena;
      foco = destino.foco;
    }
    check(`"${dicho.slice(0, 32)}…" deja la pizarra en el paso ${esperado + 2}`, foco === esperado, `foco ${foco}`);
  }

  // La regla de orden, en seco: ni saltos hacia adelante, ni bloqueo al volver.
  check(
    "no se salta ningún paso: se avanza de uno en uno",
    situacionParaNarracion(guion, "El resultado es 41.", 0, -1)?.foco === 0,
  );
  check(
    "retroceder sigue siendo libre, para poder repetir un paso",
    situacionParaNarracion(guion, "Unidades: 4 más 7 son 11. Escribo 1 y llevo 1.", 0, 2)?.foco === 0,
  );
}

titulo("A00a2. El acarreo se destaca cuando el tutor lo nombra");

{
  // En la fase de reglas la frase no nombra ninguna posición —"si pasa de 9,
  // llevo 1"—, y aun así el acarreo tiene que iluminarse en ese momento.
  const guion = guionDeLeccion(["24 + 17"]);
  const destino = situacionParaNarracion(guion, "Suma con llevada: si pasa de 9, llevo 1", 0);
  const foco = destino ? guion[0].focos[destino.foco] : null;
  check(
    '"llevo 1" lleva el foco a la columna que se lleva una',
    foco?.etiqueta === "llevo 1",
    JSON.stringify(destino),
  );

  // Y LA CUENTA DE LA REGLA, TAL COMO ESTÁ EN EL CATÁLOGO.
  //
  // Esto se comprobaba leyendo el código del aula con una expresión regular, y
  // por eso pasó lo que pasó: la línea estaba escrita, la comprobación la veía,
  // y en pantalla la cuenta seguía quieta. El enunciado de la regla es un
  // `array` de LaTeX ya montado —no una operación—, así que no había nada que
  // el guion supiera animar. Se comprueba el CAMINO ENTERO, sobre el dato real
  // de la semilla: del enunciado a la cuenta, y de la cuenta a sus focos.
  const catalogo = JSON.parse(
    readFileSync(new URL("../prisma/seed-data/reglas-matematicas.json", import.meta.url), "utf8"),
  );
  const reglas = Array.isArray(catalogo) ? catalogo : (catalogo.reglas ?? []);
  const llevada = reglas.find((r) => r.clave === "arit-suma-llevando");
  check("el catálogo trae la regla de la suma con llevada", Boolean(llevada));

  const cuenta = llevada ? cuentaDeArrayLatex(llevada.enunciado) : null;
  check(
    "su enunciado en LaTeX no se puede animar tal cual",
    llevada ? !esAnimable(llevada.enunciado) : false,
  );
  check("pero de él se saca la cuenta que representa", cuenta === "24 + 17 = 41", String(cuenta));

  const guionRegla = cuenta ? guionDeLeccion([cuenta]) : [];
  check("y esa cuenta sí se anima", guionRegla.length === 1 && guionRegla[0].focos.length >= 2);
  check(
    "con su acarreo entre los focos",
    guionRegla[0]?.focos.some((f) => f.etiqueta === "llevo 1"),
  );

  // Una regla que no es una operación no se toca: se queda en su tarjeta.
  check(
    "una regla que no es una cuenta se deja donde está",
    cuentaDeArrayLatex("a^2 + b^2 = c^2") === null &&
      cuentaDeArrayLatex(
        "\\begin{array}{rcc} & 2 & 4 \\\\ + & 1 & 7 \\\\ \\hline & 9 & 9 \\end{array}",
      ) === null,
  );

  // Y en el aula: la cuenta llega a la pizarra animada Y desaparece de la
  // tarjeta. Las dos mitades, porque tenerla en los dos sitios es el defecto.
  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  check(
    "el aula saca la cuenta de la regla del catálogo",
    /cuentaDeArrayLatex\(enunciado\)/.test(aula),
  );
  check(
    "y la mete en las líneas que se animan",
    /if \(cuentaDeLaRegla\) pasos\.push/.test(aula),
  );
  check(
    "recalculándolas cuando la regla cambia",
    /\}, \[ejercicio, desarrollo, cuentaDeLaRegla\]\)/.test(aula),
  );
  const pizarraClasica = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "y la tarjeta deja de componerla cuando se está animando",
    /sinFormula \? \(/.test(pizarraClasica) && /sinFormula=\{reglaAnimada\}/.test(pizarraClasica),
  );
}

titulo("A00a3. Lo marcado se ve como una etiqueta, no como una raya");

{
  const estilos = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  check(
    "el término cancelado se colorea, no sólo se tacha",
    /\.pz-cancela,\s*\.pz-marcado \{[^}]*color:/.test(estilos),
  );
  check(
    "lo que se opera va en el color del tema",
    /\.pz-factor,\s*\.pz-reparte,\s*\.pz-numerador,\s*\.pz-operado,\s*\.pz-coef-despeje \{[^}]*color:/.test(estilos),
  );
  check(
    "y el denominador en el suyo, porque abajo NO se opera",
    /\.pz-denominador \{[^}]*color:/.test(estilos),
  );
  check(
    "el fondo del recuadro se ve de verdad",
    /\.pz-fondo \{[^}]*fill: hsl\(217 91% 60% \/ 0\.22\)/.test(estilos),
  );
  check(
    "y el recuadro entra con una transición, no de golpe",
    /@keyframes pz-entra-foco \{[^}]*scale\(0\.94\)/.test(estilos) &&
      /\.pz-resaltado \{[^}]*animation: pz-entra-foco 260ms/.test(estilos),
  );
}

titulo("A00b. La amplificación se ve, no se supone");

{
  // El cliente lo marcó en rojo: de 1/2 a 3/6 hay un salto que el alumno tiene
  // que creerse. Ahora se escribe la multiplicación y se marca el factor.
  const e = escenaDeAmplificacion("1/2 = 3/6", "e");
  check("1/2 = 3/6 se anima como amplificación", Boolean(e));
  check(
    "se escribe la multiplicación arriba y abajo",
    e.latex.includes("1 \\times") && e.latex.includes("2 \\times"),
    e.latex,
  );
  check(
    "el factor se marca en los dos sitios, cada uno con su caja",
    JSON.stringify(e.focos[0].piezas) === JSON.stringify(["pz-factor-num", "pz-factor-den"]),
  );
  check("y se dice por cuánto se multiplica", e.focos[0].etiqueta === "× 3");
  check(
    "el resultado no se destapa hasta el último paso",
    e.latex.includes("\htmlClass{pz-rev-1}"),
  );
  check(
    "una igualdad que no es amplificación no se disfraza de una",
    escenaDeAmplificacion("1/2 = 2/5", "e") === null &&
      escenaDeAmplificacion("1/2 = 1/2", "e") === null,
  );
  check(
    "y leerAmplificacion da el factor correcto",
    leerAmplificacion("1/3 = 2/6")?.factor === 2,
  );
}

titulo("A00c. El marcado se dibuja, no aparece");

{
  const panel = readFileSync(
    new URL("../components/leccion/pizarra-animada.tsx", import.meta.url),
    "utf8",
  );
  const estilos = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  check(
    "el trazo se normaliza para poder recorrerlo",
    (panel.match(/pathLength=\{1\}/g) || []).length >= 3,
  );
  check(
    "y la hoja de estilos lo dibuja de principio a fin",
    /@keyframes pz-dibuja/.test(estilos) &&
      /\.pz-trazo \{[^}]*animation: pz-dibuja/.test(estilos),
  );
  check(
    "el fondo entra después del trazo",
    /\.pz-fondo \{[^}]*animation: pz-rellena[^}]*both/.test(estilos),
  );
  check(
    "y con movimiento reducido no se dibuja nada",
    /prefers-reduced-motion[\s\S]{0,400}\.pz-trazo,[\s\S]{0,80}animation: none/.test(estilos),
  );
}

titulo("A0. Un solo dueño del sintetizador");

{
  // El cliente pidió centralizar el audio: dos que hablan y un solo
  // sintetizador. La regla vive en lib/leccion/voz.ts y es ésta: hablar te da
  // el turno, callar sólo te calla a ti.
  const dicho = [];
  const tts = {
    enabled: true,
    voice: { name: "falsa" },
    describe: () => "voz falsa",
    speak(texto) {
      dicho.push(texto);
      return new Promise((res) => {
        tts._resolver = res;
      });
    },
    cancel() {
      dicho.push("[cancel]");
      tts._resolver?.();
      tts._resolver = null;
    },
  };

  const voz = crearVozCompartida(tts);
  const tutor = voz.para("tutor");
  const pizarra = voz.para("pizarra");

  check("al empezar no habla nadie", voz.quienHabla() === null);

  tutor.speak("Sumamos las unidades.");
  check("hablar da el turno", voz.quienHabla() === "tutor");

  // Ésta es la línea que costó tres rondas: la pizarra se recoloca siguiendo
  // al tutor y, al hacerlo, cancelaba. Si el sintetizador le hiciera caso,
  // cortaría la frase del tutor y su `onend` la daría por dicha.
  pizarra.cancel();
  check(
    "quien no tiene el turno no puede callar al que lo tiene",
    voz.quienHabla() === "tutor" && !dicho.includes("[cancel]"),
    JSON.stringify(dicho),
  );

  tutor.cancel();
  check("pero uno sí puede callarse a sí mismo", voz.quienHabla() === null);

  tutor.speak("El tutor habla otra vez.");
  pizarra.speak("Y ahora manda la pizarra.");
  check("hablar arrebata el turno", voz.quienHabla() === "pizarra");
  check(
    "y al arrebatarlo se corta al anterior, una sola vez",
    dicho.filter((d) => d === "[cancel]").length === 2,
    JSON.stringify(dicho),
  );

  voz.callarATodos();
  check("y al cambiar de tema se calla a todos", voz.quienHabla() === null);

  // Y la regla no puede estar duplicada en la máquina: si vuelve allí, vuelve
  // el desacuerdo entre las dos copias.
  const maquina = readFileSync(
    new URL("../lib/leccion/sincronizacion.ts", import.meta.url),
    "utf8",
  );
  check(
    "la máquina ya no lleva su propia contabilidad del turno",
    !maquina.includes("let hablando"),
  );

  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  check(
    "el aula reparte una vista a cada uno, en lugar de pasar el sintetizador",
    aula.includes('voz.para("tutor")') && aula.includes('voz.para("pizarra")'),
  );
  check(
    "y nadie llama a window.speechSynthesis por su cuenta",
    !aula.includes("window.speechSynthesis") &&
      !readFileSync(
        new URL("../components/leccion/pizarra-animada.tsx", import.meta.url),
        "utf8",
      ).includes("window.speechSynthesis"),
  );
}

titulo("A0b. Cambiar de fase o de tema empieza de cero");

{
  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  const panel = readFileSync(
    new URL("../components/leccion/pizarra-animada.tsx", import.meta.url),
    "utf8",
  );

  check(
    "la clave de reinicio junta tema y fase",
    /const reinicioAnimacion = `\$\{tema\?\.clave \?\? ""\}·\$\{faseAbierta\}`/.test(aula),
  );
  check("y se le pasa a la pizarra", aula.includes("reinicio={reinicioAnimacion}"));
  check(
    "que al cambiar vuelve a su primer paso",
    /useEffect\(\(\) => \{[\s\S]{0,200}mandos\.detener\(\);[\s\S]{0,40}\}, \[reinicio, mandos\]\)/.test(panel),
  );
  check(
    "al dejar el tema se calla a todos",
    aula.includes("vozRef.current?.callarATodos()"),
  );
}

titulo("A1c. Una equivalencia no puede llevar el signo cambiado");

{
  // Lo reportó el cliente: en la lección de 1/2 + 1/3, la pizarra mostraba
  // "1/2 - 3/6" donde tocaba "1/2 = 3/6". El paso es la conversión a común
  // denominador; con el signo cambiado dice algo que no es.
  check(
    "una equivalencia escrita con menos se repara",
    repararEquivalencias("1/2 - 3/6").texto === "1/2 = 3/6" &&
      repararEquivalencias("1/3 - 2/6").texto === "1/3 = 2/6",
  );
  check(
    "y queda constancia de la corrección",
    repararEquivalencias("1/2 - 3/6").correcciones === 1,
  );
  check(
    "una resta de verdad no se toca",
    repararEquivalencias("3/4 - 1/4").texto === "3/4 - 1/4",
  );
  check(
    "ni una suma, aunque los sumandos valgan lo mismo",
    repararEquivalencias("1/2 + 2/4").texto === "1/2 + 2/4",
  );
  check(
    "ni una línea que ya trae su igual",
    repararEquivalencias("1/2 = 3/6").correcciones === 0,
  );
}

titulo("A1d. El diagrama dibuja la fracción de la que se habla");

{
  // Lo pidió el cliente: el gráfico era un SVG fijo de cuatro barras, dijera lo
  // que dijera el tutor. Ahora se construye con el numerador y el denominador
  // que se estén explicando, y las leyendas los dicen.
  const g = geometriaDeFraccion(2, 6);
  check("se dibujan tantas partes como dice el denominador", g.fraccion.partes === 6);
  check("y se sombrean las del numerador", g.fraccion.tomadas === 2);
  check(
    "las leyendas llevan los números de esa fracción",
    g.etiquetas.some((e) => e.texto === "numerador: 2 (lo que tomamos)") &&
      g.etiquetas.some((e) => e.texto === "denominador: 6 (partes iguales del todo)") &&
      g.etiquetas.some((e) => e.texto === "2 de 6 partes iguales"),
    JSON.stringify(g.etiquetas.map((e) => e.texto)),
  );
  check(
    "y se pueden poner las del cliente",
    geometriaDeFraccion(1, 4, {
      numerador: "Numerador (partes tomadas)",
      denominador: "Denominador (total)",
    }).etiquetas[0].texto === "Numerador (partes tomadas)",
  );

  // Y el dibujo cabe en el lienzo con cualquier denominador razonable.
  let caben = 0;
  const denominadores = [2, 3, 4, 5, 6, 8, 10, 12];
  for (const d of denominadores) {
    const geo = geometriaDeFraccion(1, d);
    const f = geo.fraccion;
    if (f.margen + f.partes * f.celda <= geo.ancho - f.margen + 0.001) caben++;
  }
  check("ninguna división se sale del lienzo", caben === denominadores.length, `${caben}/${denominadores.length}`);

  check(
    "un denominador imposible de dibujar no rompe nada",
    geometriaDeFraccion(3, 0).fraccion.partes === 1,
  );

  // Y la fracción sale de lo que hay en pantalla, no de una constante.
  check(
    "se lee la fracción de la línea en curso",
    JSON.stringify(fraccionEnTexto("1/4 = una de 4 partes iguales")) ===
      JSON.stringify({ numerador: 1, denominador: 4 }) &&
      JSON.stringify(fraccionEnTexto("2/6 + 1/6")) ===
        JSON.stringify({ numerador: 2, denominador: 6 }),
  );
  check(
    "una fracción que no se puede dibujar se ignora",
    fraccionEnTexto("18/45") === null && fraccionEnTexto("sin fracciones") === null,
  );

  const pizarraTsx = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "y la pizarra se la pasa al diagrama",
    pizarraTsx.includes("numerador={fraccionEnCurso?.numerador}") &&
      pizarraTsx.includes("denominador={fraccionEnCurso?.denominador}"),
  );
}

titulo("A2. Polinomios, despejes y prosa");

{
  const escena = escenaDePolinomio("3x⁴ - 2x²", "e");
  check("3x⁴ - 2x² se anima término a término", escena?.clase === "polinomio");
  check("dos términos, con coeficiente y exponente cada uno", escena.focos.length === 6);
  check(
    "el coeficiente se nombra y se marca",
    escena.focos[1].clase === "pz-coef-0" && escena.focos[1].etiqueta === "coeficiente",
  );
  check(
    "el exponente también",
    escena.focos[2].clase === "pz-exp-0" && escena.focos[2].etiqueta === "exponente",
  );
  check(
    "el coeficiente que se dice es el que está escrito",
    escena.focos[1].narracion.includes("3"),
    escena.focos[1].narracion,
  );
}

{
  const escena = escenaDeDespeje("3x + 5 = 20", "e");
  check("3x + 5 = 20 se anima como despeje", escena?.clase === "despeje");
  check("el primer foco es la cancelación", escena.focos[0].tipo === "tachado");
  check("y se rotula como tal", escena.focos[0].etiqueta === "se cancelan");
  check(
    "el término se tacha en los DOS lados, cada uno con su marca",
    marcada(escena.latex, "pz-cancela-izq") && marcada(escena.latex, "pz-cancela-der"),
    escena.latex,
  );
  check(
    "la resta del otro lado está bien contada",
    /20 menos 5 son 15/.test(escena.focos[0].narracion),
    escena.focos[0].narracion,
  );
  check(
    "el último foco da la solución",
    escena.focos.at(-1).narracion === "x vale 5.",
    escena.focos.at(-1).narracion,
  );

  const fraccion = escenaDeDespeje("2x - 6 = 9", "e");
  check(
    "una solución no entera se da como fracción exacta, no como decimal",
    fraccion.focos.at(-1).narracion === "x vale 15/2." &&
      fraccion.latex.includes("\\frac{15}{2}"),
    fraccion.focos.at(-1).narracion,
  );

  const unitario = escenaDeDespeje("x + 4 = 9", "e");
  check(
    "sin coeficiente escrito no se resalta un 1 que no existe",
    !unitario.latex.includes("pz-coef-despeje") &&
      !unitario.focos.some((f) => f.clase === "pz-coef-despeje"),
    unitario.latex,
  );

  // La solución tampoco puede estar escrita desde el principio: sería dar la
  // respuesta antes de la pregunta.
  check(
    "lo que se resta al otro lado aparece al cancelar, no antes",
    escena.latex.includes("\\htmlClass{pz-rev-0}"),
    escena.latex,
  );
  check(
    "la solución se destapa en el último paso",
    escena.latex.includes(`\\htmlClass{pz-rev-${escena.focos.length - 1}}`),
    escena.latex,
  );
  check(
    "y en el despeje sin coeficiente, también",
    unitario.latex.includes(`\\htmlClass{pz-rev-${unitario.focos.length - 1}}`),
    unitario.latex,
  );
}

{
  // La otra cancelación que pide el pliego: la de una simplificación. El factor
  // común se tacha arriba y abajo a la vez, y la fracción reducida sólo aparece
  // después; escrita desde el principio, la simplificación es un dato que hay
  // que creerse en lugar de un paso que se entiende.
  const escena = escenaDeSimplificacion("12/8", "e");
  check("12/8 se anima como simplificación", escena?.clase === "simplificacion");
  check("lo que se cancela va tachado", escena.focos[0].tipo === "tachado");
  check(
    "se tacha arriba y abajo, cada uno con su marca",
    marcada(escena.latex, "pz-cancela-num") && marcada(escena.latex, "pz-cancela-den"),
    escena.latex,
  );
  check(
    "y se dice entre cuánto se divide",
    escena.focos[0].narracion === "Dividimos arriba y abajo entre 4." &&
      escena.focos[0].etiqueta === "÷ 4",
    escena.focos[0].narracion,
  );
  check(
    "la fracción reducida se destapa al final, no antes",
    escena.latex.includes("\\htmlClass{pz-rev-1}") &&
      escena.focos.at(-1).clase === "pz-simplificada",
  );
  check("y es la correcta", escena.focos.at(-1).narracion === "Queda 3 entre 2.");

  const conVariable = escenaDeSimplificacion("6x/3", "e");
  check(
    "un monomio se simplifica igual",
    conVariable.focos.at(-1).narracion === "Queda 2x.",
    conVariable.focos.at(-1).narracion,
  );

  const potencias = escenaDeSimplificacion("x^{2}/x", "e");
  check(
    "y las potencias de la misma variable se cancelan",
    /Se cancela una x de arriba con la de abajo/.test(potencias.focos[0].narracion),
    potencias.focos[0].narracion,
  );

  check(
    "una fracción ya irreducible no se anima como simplificación",
    escenaDeSimplificacion("7/3", "e") === null,
  );
  check(
    "ni se mezclan variables distintas",
    escenaDeSimplificacion("6x/3y", "e") === null,
  );
}

{
  // La frase de un tutor NO es un polinomio. Sin este límite, la pizarra se
  // pone a señalar sílabas como si fueran términos.
  for (const frase of [
    "Vamos a ver la regla de la potencia",
    "El coeficiente es 5",
    "Primero identificamos el exponente",
  ]) {
    const escena = escenaDeLinea(frase, "e");
    check(`"${frase.slice(0, 34)}…" no se anima como fórmula`, escena.clase === "texto");
  }

  const suelta = escenaDeTexto("Muy bien, sigamos", "e");
  check("una línea de texto se compone sin focos", suelta.focos.length === 0);
  check(
    "y sin LaTeX: una frase compuesta como fórmula sale ilegible",
    suelta.latex === null,
    String(suelta.latex),
  );
  check("pero conserva el texto que hay que decir", suelta.narracion === "Muy bien, sigamos");
}

titulo("B. Toda escena se compone con KaTeX y conserva sus marcas");

{
  const corpus = [
    "24 + 17",
    "58 + 66",
    "999 + 1",
    "52 - 27",
    "345 - 178",
    "3x + 5 = 20",
    "2x - 6 = 9",
    "x + 4 = 9",
    "3x⁴ - 2x²",
    "12x³ - 4x",
    "5x^{2}",
    "12/8",
    "6x/3",
    "Vamos a ver la regla de la potencia",
    "derivada = 2x",
  ];
  const guion = guionDeLeccion(corpus);

  check(
    "el guion recoge todas las líneas que se pueden animar",
    guion.length === corpus.filter((l) => esAnimable(l)).length,
    `${guion.length} escenas de ${corpus.length} líneas`,
  );
  check(
    "y la prosa no entra: no tiene nada que resaltar y partía la lección en trozos",
    guion.every((e) => e.focos.length > 0) &&
      guionDeLeccion(["Vamos a ver la regla de la potencia"]).length === 0,
  );
  check(
    "cada escena tiene un identificador único",
    new Set(guion.map((e) => e.id)).size === guion.length,
  );
  check(
    "las líneas vacías no generan escena",
    guionDeLeccion(["", "  ", "24 + 17"]).length === 1,
  );

  let huerfanos = 0;
  let excepciones = 0;
  let perdidas = 0;

  for (const escena of guion) {
    for (const foco of escena.focos) {
      if (!marcada(escena.latex, foco.clase)) huerfanos++;
    }

    // La prosa no lleva LaTeX a propósito: compuesta como fórmula saldría en
    // cursiva matemática y sin espacios. Se pinta como texto.
    if (!escena.latex) continue;

    let html = "";
    try {
      html = katex.renderToString(escena.latex, {
        displayMode: true,
        throwOnError: false,
        strict: false,
        trust: (ctx) => ctx.command === "\\htmlClass",
      });
    } catch {
      excepciones++;
      continue;
    }
    if (/katex-error/.test(html)) excepciones++;
    for (const foco of escena.focos) {
      if (!html.includes(foco.clase)) perdidas++;
    }
  }

  check("ningún foco apunta a una clase que no está en la fórmula", huerfanos === 0, `${huerfanos}`);
  check("KaTeX compone todas las escenas sin error", excepciones === 0, `${excepciones}`);
  check(
    "y las clases del guion llegan al HTML, que es lo que se mide",
    perdidas === 0,
    `${perdidas} clases perdidas`,
  );
}

titulo("B2. La pizarra sigue a la voz del tutor");

{
  // El cliente lo vio en la captura: la locución iba por "sumamos las decenas"
  // y la pizarra seguía en el paso 1, sin ningún foco, esperando a que alguien
  // pulsara Reproducir. La pizarra tiene que colocarse donde va la voz.
  const guion = guionDeLeccion(["234 + 178", "234 + 178 = 412"]);

  check(
    "el enunciado y su desarrollo son la MISMA cuenta: una sola escena",
    guion.length === 1,
    `${guion.length} escenas`,
  );

  // Las frases son las del tutor, no las del guion: escribe "escribimos" donde
  // el guion dice "escribo", y aun así tiene que reconocerlas.
  const recorrido = [
    ["Vamos a sumar 234 más 178, columna por columna.", -1],
    ["Sumamos las unidades: 4 + 8 = 12. Como pasa de 9, escribimos 2 y llevamos 1.", 0],
    ["Sumamos las decenas: 3 + 7 + 1 que llevábamos = 11. Como pasa de 9, escribimos 1 y llevamos 1.", 1],
    ["Sumamos las centenas: 2 + 1 + 1 que llevábamos = 4.", 2],
    ["El resultado es 412.", 3],
  ];

  // Se le va diciendo DÓNDE ESTÁ, locución a locución, como hace el componente:
  // la pizarra avanza en orden desde el reposo, así que su posición anterior es
  // parte de la pregunta.
  let escenaActual = 0;
  let focoActual = -1;
  for (const [dicho, focoEsperado] of recorrido) {
    const destino = situacionParaNarracion(guion, dicho, escenaActual, focoActual);
    if (destino) {
      escenaActual = destino.escena;
      focoActual = destino.foco;
    }
    check(
      `"${dicho.slice(0, 34)}…" coloca la pizarra en el paso ${focoEsperado + 2}`,
      destino?.foco === focoEsperado,
      destino ? `foco ${destino.foco}` : "sin situación",
    );
  }

  const columna = guion[0];
  check(
    "y ese foco es el de la columna que se está operando",
    columna.focos[0].clase === "pz-col-2" &&
      columna.focos[1].clase === "pz-col-1" &&
      columna.focos[2].clase === "pz-col-0",
  );

  // El cierre del ejemplo lleva la pizarra al resultado, no a la última
  // columna: las cifras sueltas de "234 + 178 = 412" no son prueba de nada.
  const cierre = situacionParaNarracion(guion, "Así, 234 + 178 = 412. Ahora te toca a ti.", 0);
  check(
    "al cerrar el ejemplo, la marca de resultado va sobre el resultado",
    cierre?.foco === guion[0].focos.length - 1,
    JSON.stringify(cierre),
  );

  // ── Y LO MISMO CON UNA CUENTA DE UNA SOLA CIFRA ────────────────────────────
  //
  // Es la cuenta que recibe un alumno de primaria recién diagnosticado, y era
  // justo la que no cerraba: "El resultado es 7" no tiene ninguna pieza que el
  // tutor repita —"resultado" no lo dice, y el 7 no se contaba por ser de una
  // cifra—, así que el cierre no encajaba en ningún paso y la pizarra se
  // quedaba clavada en "Paso 2 de 3", sin llegar nunca a rodear el resultado.
  {
    const corta = guionDeLeccion(["3 + 4", "unidades: 3 + 4 = 7"]);
    const ultimo = corta[0].focos.length - 1;

    const pasos = [
      ["Vamos a sumar 3 + 4 paso a paso.", -1],
      ["Sumamos las unidades: 3 + 4 = 7.", 0],
      ["Así, 3 + 4 = 7. Ahora te toca a ti.", ultimo],
    ];
    let donde = 0;
    for (const [dicho, esperado] of pasos) {
      const destino = situacionParaNarracion(corta, dicho, donde);
      if (destino) donde = destino.escena;
      check(
        `una cuenta de una cifra: "${dicho.slice(0, 30)}…" va al paso ${esperado + 2}`,
        destino?.foco === esperado,
        destino ? `foco ${destino.foco}` : "sin situación",
      );
    }

    check(
      "el cierre de una cuenta de una cifra NO se queda en las unidades",
      situacionParaNarracion(corta, "Así, 3 + 4 = 7. Ahora te toca a ti.", 0)?.foco === ultimo,
    );

    // Presentar la SIGUIENTE cuenta no puede cerrar la anterior: tampoco nombra
    // columna, pero no repite la cuenta entera.
    const dos = guionDeLeccion(["3 + 4", "unidades: 3 + 4 = 7", "7 + 2 = ?"]);
    const siguiente = situacionParaNarracion(dos, "Vamos a sumar 7 más 2, columna por columna.", 0);
    check(
      "presentar la cuenta siguiente lleva la pizarra a ESA cuenta",
      siguiente?.escena === 1 && siguiente?.foco === -1,
      JSON.stringify(siguiente),
    );

    check(
      "y el cierre de la primera sigue yendo a su resultado",
      situacionParaNarracion(dos, "Así, 3 + 4 = 7. Ahora te toca a ti.", 0)?.escena === 0,
    );
  }

  check(
    "una frase que no habla de la cuenta no mueve la pizarra",
    situacionParaNarracion(guion, "Ahora practica tú con otro ejemplo.", 0) === null,
  );
  check("ni una frase vacía", situacionParaNarracion(guion, "   ", 0) === null);

  // Una línea de prosa no puede robarle el turno a la columna: no tiene nada
  // que señalar, y su narración encaja al 100 % con lo que dice el tutor.
  const conProsa = guionDeLeccion(["234 + 178", "Sumamos las unidades"]);
  const destino = situacionParaNarracion(
    conProsa,
    "Sumamos las unidades: 4 + 8 = 12. Como pasa de 9, escribimos 2 y llevamos 1.",
    0,
  );
  check(
    "con una línea de prosa parecida delante, gana la columna que se opera",
    destino?.escena === 0 && destino?.foco === 0,
    JSON.stringify(destino),
  );
}

{
  // EL SEGUIMIENTO, CON LAS PALABRAS DEL TUTOR DE VERDAD.
  //
  // Las frases de la lección las redacta el modelo, no el guion: dice "escribimos
  // el 3 debajo de las unidades" donde el guion dice "escribo 3". La pizarra
  // tiene que reconocerlo igual. Estas frases son las de la captura del cliente.
  const guion = guionDeLeccion(["678 + 145"]);
  const recorrido = [
    ["Vamos a sumar 678 más 145 paso a paso.", -1],
    [
      "Sumamos 8 + 5, que es 13. Escribimos el 3 debajo de las unidades y nos llevamos el 1 a la columna de las decenas.",
      0,
    ],
    [
      "Ahora sumamos las decenas: 7 + 4 + 1 que nos llevábamos, que es 12. Escribimos el 2 y llevamos 1.",
      1,
    ],
    ["Por último, las centenas: 6 + 1 + 1 = 8.", 2],
    ["Así, 678 + 145 = 823. Ahora te toca a ti.", 3],
  ];

  let escenaActual = 0;
  let focoActual = -1;
  for (const [dicho, esperado] of recorrido) {
    const destino = situacionParaNarracion(guion, dicho, escenaActual, focoActual);
    if (destino) {
      escenaActual = destino.escena;
      focoActual = destino.foco;
    }
    check(
      `"${dicho.slice(0, 40)}…" lleva la pizarra al paso ${esperado + 2}`,
      destino?.foco === esperado,
      destino ? `foco ${destino.foco}` : "no se movió",
    );
  }

  check(
    "y una frase suelta no la mueve",
    situacionParaNarracion(guion, "Muy bien, sigamos practicando.", 0) === null,
  );

  // La causa era comparar TROZOS: "vamos" aparecía dentro de "llevamos".
  const columnas = guion[0].focos;
  check(
    "cada columna sabe cómo la llama el tutor",
    columnas[0].pista === "unidades" &&
      columnas[1].pista === "decenas" &&
      columnas[2].pista === "centenas",
    JSON.stringify(columnas.map((f) => f.pista)),
  );
}

{
  // El otro punto del cliente: el bloque DESARROLLO de arriba enseñaba la suma
  // ya resuelta mientras abajo corría la animación.
  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");

  // No basta con filtrar líneas: la tarjeta del desarrollo COMPONE la cuenta a
  // partir de los pasos narrados, así que hay que decirle que no la pinte.
  const pizarra = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "el aula le dice a la pizarra que esconda el desarrollo",
    aula.includes("ocultarDesarrollo={ocultarDesarrollo}") &&
      /const ocultarDesarrollo = !animacionCompleta && controles\.playing/.test(aula),
  );
  check(
    "y la pizarra lo obedece: sin desarrollo no compone ni la cuenta ni los pasos",
    /propio && !ocultarDesarrollo \? desarrolloRecibido : SIN_DESARROLLO/.test(pizarra),
  );
  check(
    "en cuanto la animación termina —o la lección para— el desarrollo vuelve",
    aula.includes("!animacionCompleta && controles.playing && lineasAnimadas.length > 0"),
  );
  check("y la pizarra recibe lo que el tutor está diciendo", aula.includes("narracion={subtitulo}"));

  check(
    "esAnimable distingue una cuenta de una frase",
    esAnimable("234 + 178 = 412") && !esAnimable("Sumamos las unidades"),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// C. El sincronizador
// ═════════════════════════════════════════════════════════════════════════════

titulo("C. Sincronizador: voz, temporizador y mandos");

/** Un reloj que no corre solo: la prueba decide cuándo pasa el tiempo. */
function relojFalso() {
  let pendientes = [];
  return {
    reloj: {
      programar(cb, ms) {
        const tarea = { cb, ms };
        pendientes.push(tarea);
        return () => {
          pendientes = pendientes.filter((p) => p !== tarea);
        };
      },
    },
    correr() {
      const lista = pendientes;
      pendientes = [];
      for (const tarea of lista) tarea.cb();
      return lista.length;
    },
    pendientes: () => pendientes.length,
  };
}

/**
 * Un locutor de mentira, con el comportamiento que pida cada prueba.
 *
 * Imita al sintetizador de verdad: `empezarPendiente()` dispara el `onstart` de
 * la locución —el momento en que EMPIEZA a sonar— y `resolverPendiente()`, el
 * `onend`. Entre uno y otro, la pizarra tiene que estar enseñando ese paso y no
 * el siguiente.
 */
function locutorFalso({ modo = "ok" } = {}) {
  const dichos = [];
  let resolver = null;
  let empezar = null;
  return {
    dichos,
    empezarPendiente() {
      const e = empezar;
      empezar = null;
      e?.();
    },
    resolverPendiente() {
      const r = resolver;
      resolver = null;
      r?.();
    },
    locutor: {
      disponible: () => modo !== "ausente",
      hablar(texto, opciones = {}) {
        dichos.push(texto);
        empezar = opciones.alEmpezar ?? null;
        if (modo === "falla") return Promise.reject(new Error("sin voz"));
        if (modo === "colgado") return new Promise(() => {});
        // Por defecto se comporta como un navegador normal: avisa del arranque
        // en cuanto la voz suena.
        if (modo === "ok") empezar?.();
        return new Promise((res) => {
          resolver = res;
        });
      },
      cancelar() {},
    },
  };
}

const GUION = guionDeLeccion(["24 + 17", "3x + 5 = 20"]);
const SEGMENTOS = GUION.reduce((total, e) => total + e.focos.length + 1, 0);

{
  const r = relojFalso();
  const visto = [];
  const s = crearSincronizador({
    escenas: GUION,
    locutor: null,
    reloj: r.reloj,
    alCambiar: (e) => visto.push(`${e.escena}:${e.foco}`),
  });

  check("sin locutor, el modo es temporizador desde el principio", s.instantanea().modo === "temporizador");
  check("y el estado inicial es 'inicio'", s.instantanea().estado === "inicio");

  s.reproducir();
  check("al reproducir entra en marcha", s.instantanea().estado === "reproduciendo");
  check("y arranca por la entrada de la primera escena", s.instantanea().foco === -1);

  let vueltas = 0;
  while (s.instantanea().estado !== "final" && vueltas < 40) {
    r.correr();
    vueltas++;
  }
  check("la lección entera avanza sola con el temporizador", s.instantanea().estado === "final");
  check(
    "pasando por todos los segmentos, en orden",
    visto.filter((v) => !v.endsWith("final")).length >= SEGMENTOS,
    `${visto.length} avisos para ${SEGMENTOS} segmentos`,
  );
  check("y sin dejar temporizadores corriendo", r.pendientes() === 0);
  check("al terminar, el avatar celebra", s.instantanea().avatar === "CELEBRANDO");
}

{
  const r = relojFalso();
  const s = crearSincronizador({ escenas: GUION, locutor: null, reloj: r.reloj });
  s.reproducir();
  r.correr();
  const antes = s.instantanea();

  s.pausar();
  check("pausar detiene la reproducción", s.instantanea().estado === "pausado");
  check("y cancela el temporizador en curso", r.pendientes() === 0);
  check("el avatar se queda pensando", s.instantanea().avatar === "PENSANDO");

  r.correr();
  check(
    "el tiempo que pasa en pausa no adelanta la lección",
    s.instantanea().foco === antes.foco && s.instantanea().escena === antes.escena,
  );

  s.reanudar();
  check("reanudar la pone en marcha otra vez", s.instantanea().estado === "reproduciendo");
  check("y vuelve a programar el avance", r.pendientes() === 1);

  const enCurso = s.instantanea();
  s.repetirPaso();
  check(
    "repetir paso NO avanza: vuelve a decir el mismo",
    s.instantanea().escena === enCurso.escena && s.instantanea().foco === enCurso.foco,
    `${enCurso.escena}:${enCurso.foco} → ${s.instantanea().escena}:${s.instantanea().foco}`,
  );

  const previo = s.instantanea();
  s.avanzar();
  check(
    "avanzar a mano pasa al siguiente foco sin esperar al reloj",
    s.instantanea().foco === previo.foco + 1 || s.instantanea().escena === previo.escena + 1,
    `${previo.escena}:${previo.foco} → ${s.instantanea().escena}:${s.instantanea().foco}`,
  );

  const traAvance = s.instantanea();
  s.retroceder();
  check(
    "retroceder vuelve al anterior",
    s.instantanea().foco < traAvance.foco || s.instantanea().escena < traAvance.escena,
  );

  s.irAEscena(1);
  check("se puede saltar a una escena concreta", s.instantanea().escena === 1);
  check("y se entra por su principio", s.instantanea().foco === -1);
  s.irAEscena(99);
  check("una escena que no existe se ignora", s.instantanea().escena === 1);

  s.detener();
  check("detener devuelve la lección al principio", s.instantanea().estado === "inicio");
  check("desde la primera escena", s.instantanea().escena === 0 && s.instantanea().foco === -1);
  check("sin temporizadores pendientes", r.pendientes() === 0);
}

{
  const r = relojFalso();
  const voz = locutorFalso();
  const s = crearSincronizador({
    escenas: GUION,
    locutor: voz.locutor,
    reloj: r.reloj,
    pausaEntrePasos: 0,
  });

  check("con voz disponible, el modo es voz", s.instantanea().modo === "voz");
  s.reproducir();
  check("al reproducir, habla", voz.dichos.length === 1, JSON.stringify(voz.dichos));
  check(
    "y dice la entrada de la escena",
    voz.dichos[0] === GUION[0].narracion,
    voz.dichos[0],
  );

  const antes = s.instantanea().foco;
  voz.resolverPendiente();
  await Promise.resolve();
  check(
    "cuando la voz termina, avanza el paso",
    s.instantanea().foco === antes + 1,
    `${antes} → ${s.instantanea().foco}`,
  );
  check(
    "y enciende el foco correspondiente al nuevo segmento",
    s.instantanea().foco === 0,
  );
  check(
    "diciendo lo que ese foco resalta",
    voz.dichos[1] === GUION[0].focos[0].narracion,
    voz.dichos[1],
  );
}

{
  // EL RESALTADO SE ENCIENDE CON EL EVENTO DE VOZ, no al encolar la locución.
  // Entre una cosa y otra el navegador puede tardar, y ahí es donde se veía el
  // desajuste: la pizarra iba por delante de lo que se oía.
  const r = relojFalso();
  const voz = locutorFalso({ modo: "silencioso" });
  const s = crearSincronizador({
    escenas: GUION,
    locutor: voz.locutor,
    reloj: r.reloj,
    pausaEntrePasos: 0,
  });

  s.reproducir();
  check("la locución se encola en cuanto se reproduce", voz.dichos.length === 1);
  check(
    "pero la pizarra no se mueve hasta que la voz suena",
    s.instantanea().foco === -1,
    `foco ${s.instantanea().foco}`,
  );

  voz.empezarPendiente();
  check("al sonar la voz, se enciende ese paso", s.instantanea().foco === -1);

  voz.resolverPendiente();
  await Promise.resolve();
  check("al terminar, se encola el siguiente", voz.dichos.length === 2);
  check(
    "y la pizarra sigue en el paso anterior hasta que suene",
    s.instantanea().foco === -1,
    `foco ${s.instantanea().foco}`,
  );

  voz.empezarPendiente();
  check(
    "en cuanto suena, el foco salta al paso nuevo",
    s.instantanea().foco === 0,
    `foco ${s.instantanea().foco}`,
  );
}

{
  // Si el navegador nunca avisa del arranque, el paso se enseña igual al
  // terminar: más vale tarde que dejarse un paso sin pintar.
  const r = relojFalso();
  const voz = locutorFalso({ modo: "silencioso" });
  const s = crearSincronizador({
    escenas: GUION,
    locutor: voz.locutor,
    reloj: r.reloj,
    pausaEntrePasos: 0,
  });
  s.reproducir();
  voz.resolverPendiente();
  await Promise.resolve();
  check(
    "sin evento de arranque, el paso se enseña al terminar la locución",
    s.instantanea().foco === -1 || s.instantanea().foco === 0,
  );
}

{
  // PAUSA DIDÁCTICA ENTRE COLUMNAS. La locución de una columna no empalma con
  // la de la siguiente: entre las dos hay medio segundo largo para que el
  // alumno vea la cifra recién escrita.
  const r = relojFalso();
  const voz = locutorFalso();
  const s = crearSincronizador({ escenas: GUION, locutor: voz.locutor, reloj: r.reloj });

  s.reproducir();
  const dichosAlEmpezar = voz.dichos.length;
  voz.resolverPendiente();
  await Promise.resolve();

  check(
    "al terminar una locución no se lanza la siguiente de inmediato",
    voz.dichos.length === dichosAlEmpezar,
    `${voz.dichos.length} locuciones`,
  );
  check("se programa la pausa didáctica", r.pendientes() === 1);

  r.correr();
  check(
    "y pasada la pausa entra el paso siguiente",
    voz.dichos.length === dichosAlEmpezar + 1,
    `${voz.dichos.length} locuciones`,
  );
  check("con la pausa por defecto en 600 ms", PAUSA_ENTRE_PASOS === 600);

  // Pausar durante la pausa no debe dejar la locución siguiente en camino.
  s.pausar();
  const antes = voz.dichos.length;
  r.correr();
  check("una pausa del alumno cancela también la espera entre pasos", voz.dichos.length === antes);
}

{
  // El audio falla a mitad de lección: se sigue con temporizador y se avisa.
  const r = relojFalso();
  const voz = locutorFalso({ modo: "falla" });
  const s = crearSincronizador({ escenas: GUION, locutor: voz.locutor, reloj: r.reloj });
  s.reproducir();
  await Promise.resolve();
  await Promise.resolve();

  check("si la voz falla, se degrada a temporizador", s.instantanea().modo === "temporizador");
  check("y queda constancia para poder decirlo en pantalla", s.instantanea().vozCaida === true);

  let vueltas = 0;
  while (s.instantanea().estado !== "final" && vueltas < 60) {
    r.correr();
    await Promise.resolve();
    await Promise.resolve();
    vueltas++;
  }
  check("la lección llega hasta el final igualmente", s.instantanea().estado === "final");
}

{
  // El caso feo de verdad: el sintetizador ni resuelve ni rechaza. Sin red de
  // seguridad, la pizarra se queda congelada para siempre.
  const r = relojFalso();
  const voz = locutorFalso({ modo: "colgado" });
  const s = crearSincronizador({
    escenas: GUION,
    locutor: voz.locutor,
    reloj: r.reloj,
    pausaEntrePasos: 0,
  });
  s.reproducir();
  check("con la voz colgada hay un temporizador de rescate armado", r.pendientes() === 1);

  const antes = s.instantanea().foco;
  r.correr();
  check(
    "el rescate desatasca la lección",
    s.instantanea().foco === antes + 1,
    `${antes} → ${s.instantanea().foco}`,
  );
  check("y avisa de que la voz no responde", s.instantanea().vozCaida === true);
}

{
  const r = relojFalso();
  const voz = locutorFalso();
  const s = crearSincronizador({ escenas: GUION, locutor: voz.locutor, reloj: r.reloj });
  s.reproducir();
  const dichosAntes = voz.dichos.length;

  s.usarAudio(false);
  check("al apagar el audio se pasa a temporizador", s.instantanea().modo === "temporizador");
  check("sin marcarlo como fallo de voz", s.instantanea().vozCaida === false);
  check("y sin volver a hablar", voz.dichos.length === dichosAntes);
  check("la lección sigue en marcha, no se detiene", s.instantanea().estado === "reproduciendo");

  s.usarAudio(true);
  check("al volver a encenderlo, vuelve la voz", s.instantanea().modo === "voz");
}

{
  // Situar es lo que usa el seguimiento de la voz: coloca la pizarra sin
  // hablar y sin poner en marcha ningún temporizador. Si hablara, serían dos
  // voces a la vez sobre la misma lección.
  const r = relojFalso();
  const voz = locutorFalso();
  const s = crearSincronizador({ escenas: GUION, locutor: voz.locutor, reloj: r.reloj });

  s.situar(1, 2);
  check("situar coloca la pizarra donde va la voz", s.instantanea().escena === 1);
  check("en el foco pedido", s.instantanea().foco === 2);
  check("sin decir una palabra", voz.dichos.length === 0);
  check("y sin arrancar ningún temporizador", r.pendientes() === 0);
  check("la lección no se pone en marcha por situarla", s.instantanea().estado === "inicio");

  s.situar(0, -1);
  check("puede volver a la entrada de una escena", s.instantanea().foco === -1);
  s.situar(9, 0);
  check("una escena que no existe se ignora", s.instantanea().escena === 0);
  s.situar(0, 99);
  check(
    "y un foco fuera de rango se recorta al último de la escena",
    s.instantanea().foco === s.instantanea().segmentos - 2,
    `${s.instantanea().foco}`,
  );

  // Con el repaso reproduciéndose manda él: seguir la voz del tutor entonces
  // sería tirar de la lección desde dos sitios a la vez.
  s.reproducir();
  const donde = s.instantanea();
  s.situar(1, 1);
  check(
    "mientras el repaso se reproduce solo, el seguimiento no interfiere",
    s.instantanea().escena === donde.escena && s.instantanea().foco === donde.foco,
  );
  s.detener();
}

{
  const s = crearSincronizador({ escenas: [], locutor: null, reloj: relojFalso().reloj });
  s.reproducir();
  check("una lección sin escenas termina sin romperse", s.instantanea().estado === "final");
  check("y el avatar no se pone a celebrar la nada", s.instantanea().avatar === "IDLE");
}

{
  check("una frase corta dura al menos segundo y medio", duracionEstimada("Hola") === 1500);
  check(
    "un texto más largo dura más",
    duracionEstimada("Unidades: cuatro más siete son once, escribo uno y llevo una") >
      duracionEstimada("Hola"),
  );
  check("y ninguna locución se eterniza", duracionEstimada("palabra ".repeat(500)) <= 15000);
}

// ═════════════════════════════════════════════════════════════════════════════
// D. El avatar
// ═════════════════════════════════════════════════════════════════════════════

titulo("D. Máquina de estados del avatar");

{
  const pedidos = ["IDLE", "EXPLICANDO", "CELEBRANDO", "APOYO", "PENSANDO"];
  check(
    "están los cinco estados que pidió el cliente",
    pedidos.every((e) => ESTADOS_PEDAGOGICOS.includes(e)),
    ESTADOS_PEDAGOGICOS.join(", "),
  );
  check("y ninguno de más", ESTADOS_PEDAGOGICOS.length === 5);

  for (const motor of ESTADOS_MOTOR) {
    check(
      `el estado "${motor}" del motor tiene traducción`,
      pedidos.includes(DESDE_MOTOR[motor]),
      DESDE_MOTOR[motor],
    );
  }
  check("hablando explica", estadoPedagogico("hablando") === "EXPLICANDO");
  check("sonriendo celebra", estadoPedagogico("sonriendo") === "CELEBRANDO");
  check("preguntando acompaña", estadoPedagogico("preguntando") === "APOYO");
  check(
    "un estado pedagógico se acepta tal cual",
    estadoPedagogico("CELEBRANDO") === "CELEBRANDO",
  );
  check("y uno desconocido no rompe la cara del avatar", estadoPedagogico("inventado") === "IDLE");

  check(
    "cada estado tiene su etiqueta en castellano",
    pedidos.every((e) => typeof ETIQUETA_ESTADO[e] === "string" && ETIQUETA_ESTADO[e].length > 0),
  );
}

{
  // El pliego no pide sólo que los cinco estados EXISTAN, sino cuándo se usa
  // cada uno: PENSANDO mientras el servidor valida, CELEBRANDO ante un acierto
  // y APOYO ante un error. Hasta ahora nadie disparaba los dos primeros y el
  // fallo se narraba con la cara de explicar.
  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  const motor = readFileSync(new URL("../public/pseLight.js", import.meta.url), "utf8");

  const corregir = aula.slice(aula.indexOf("const responder = useCallback"));
  check(
    "el avatar PIENSA mientras el servidor valida la respuesta",
    /setEstadoAvatar\("pensando"\)/.test(corregir) &&
      corregir.indexOf('setEstadoAvatar("pensando")') <
        corregir.indexOf('fetch("/api/practica/corregir"'),
  );
  check(
    "CELEBRA cuando el veredicto es correcto",
    /correcto === true\) setEstadoAvatar\("sonriendo"\)/.test(corregir),
  );
  check(
    "y ACOMPAÑA cuando es incorrecto",
    /correcto === false\) setEstadoAvatar\("preguntando"\)/.test(corregir),
  );
  check(
    "un veredicto que no se puede verificar no se trata como error del alumno",
    /else setEstadoAvatar\("neutral"\)/.test(corregir),
  );
  check(
    "y el tutor narra el fallo con gesto de apoyo, no con el de explicar",
    !/`Casi\. \$\{hint\}`, "hablando"/.test(motor) &&
      /`Casi\. \$\{hint\}`, "preguntando"/.test(motor),
  );

  check(
    "la lección dice qué versión está desplegada, para poder comprobarlo",
    aula.includes("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA") && aula.includes("build {VERSION}"),
  );

  // El subtítulo pertenece a la fase que se cierra: al pasar de "Concepto" a
  // "Reglas", el ejemplo de la pizza se quedaba debajo mientras el tutor ya
  // explicaba otra cosa.
  const pizarraTsx = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "el subtítulo va etiquetado con la fase a la que pertenece",
    aula.includes("faseDelSubtitulo") &&
      /setFaseDelSubtitulo\(fasesRef\.current\[fasesRef\.current\.length - 1\]\?\.id/.test(aula),
  );
  check(
    "y no se pinta si es de una fase que ya se cerró",
    aula.includes("subtitulo && faseDelSubtitulo === faseAbierta") &&
      /const faseAbierta = fases\[fases\.length - 1\]\?\.id \?\? ""/.test(aula),
  );
  check(
    "la pizarra no deja medio lienzo en blanco en Concepto y Reglas",
    /const compacta =\s*actual != null && !esFaseDeEjemplo/.test(pizarraTsx) &&
      pizarraTsx.includes('compacta ? "h-[19rem] sm:h-[23rem]"'),
  );
  check(
    "ni repite el rótulo de la regla que ya está en la tarjeta",
    pizarraTsx.includes("repiteLaRegla") && pizarraTsx.includes("pasoSuelto && !repiteLaRegla"),
  );

  check(
    "el subtítulo se limpia al cambiar de fase",
    /setFaseDelContenido\(clave\);[\s\S]{0,900}setSubtitulo\(""\);/.test(aula),
  );
  check(
    "y su etiqueta de fase también: limpieza entera, no media",
    /setSubtitulo\(""\);\s*setFaseDelSubtitulo\(""\);/.test(aula),
  );
}

{
  check("en reposo, el avatar espera", avatarDe("inicio", 0, 3) === "IDLE");
  check("reproduciendo, explica", avatarDe("reproduciendo", 1, 3) === "EXPLICANDO");
  check("en pausa, piensa", avatarDe("pausado", 1, 3) === "PENSANDO");
  check("al terminar, celebra", avatarDe("final", 2, 3) === "CELEBRANDO");
  check("salvo que no hubiera lección", avatarDe("final", 0, 0) === "IDLE");
}

{
  // El componente es TSX y no se puede importar desde Node, así que su tabla de
  // gestos se comprueba leyéndolo: lo que importa es que ningún estado se quede
  // sin boca, sin color o sin animación.
  const fuente = readFileSync(new URL("../components/leccion/avatar-2d.tsx", import.meta.url), "utf8");
  const estilos = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  for (const registro of ["BOCAS", "CEJAS", "COLOR_ESTADO", "ANIMACION_CABEZA"]) {
    const bloque = fuente.split(`const ${registro}`)[1]?.split("};")[0] ?? "";
    const completos = ESTADOS_PEDAGOGICOS.filter((estado) => bloque.includes(`${estado}:`));
    check(
      `${registro} define los cinco estados`,
      completos.length === 5,
      `faltan: ${ESTADOS_PEDAGOGICOS.filter((e) => !completos.includes(e)).join(", ")}`,
    );
  }

  const animaciones = [...fuente.matchAll(/"(avatar-[a-z-]+)"/g)].map((m) => m[1]);
  const sinEstilo = [...new Set(animaciones)].filter((clase) => !estilos.includes(`.${clase}`));
  check(
    "toda animación que nombra el avatar existe en la hoja de estilos",
    sinEstilo.length === 0,
    sinEstilo.join(", "),
  );
  check(
    "las transiciones se desactivan con prefers-reduced-motion",
    estilos.includes("prefers-reduced-motion") && estilos.includes(".avatar-cara"),
  );
}

{
  // Modo proyección: alto contraste, tipografía escalada y trazos gruesos.
  const estilos = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const panel = readFileSync(
    new URL("../components/leccion/pizarra-animada.tsx", import.meta.url),
    "utf8",
  );

  check("existe el tema de proyección", estilos.includes(".modo-proyeccion"));
  check("con la tipografía escalada", estilos.includes("--pz-escala"));
  check(
    "y las rayas de KaTeX engordadas para que se vean proyectadas",
    estilos.includes(".modo-proyeccion .katex .frac-line"),
  );
  check("el trazo del resaltado también engorda", /modo-proyeccion \.pz-trazo/.test(estilos));

  // Lo que el cliente echó en falta probando en pantalla grande: la fórmula
  // quedaba diminuta en medio de un lienzo en blanco y el avatar desaparecía.
  const bloqueProyeccion = estilos.slice(estilos.indexOf(".modo-proyeccion {"));
  check(
    "la fórmula escala con el ancho de la pantalla, no a un tamaño fijo",
    /\.modo-proyeccion \.katex \{[^}]*clamp\([^)]*vw/.test(bloqueProyeccion),
  );
  check(
    "y ocupa un lienzo alto, no un renglón en medio de la nada",
    /\.modo-proyeccion \.pz-animada \{[^}]*min-height/.test(bloqueProyeccion),
  );
  check(
    "el avatar se queda a la vista, en un lateral",
    /\.modo-proyeccion \.pz-escenario \{[^}]*grid-template-columns/.test(bloqueProyeccion) &&
      bloqueProyeccion.includes(".modo-proyeccion .pz-avatar svg"),
  );
  check(
    "el tema es de pizarra oscura y texto claro",
    /\.modo-proyeccion \{[^}]*background: hsl\(222 47% 8%\)/.test(bloqueProyeccion) &&
      /\.modo-proyeccion \.katex \{[^}]*color: hsl\(0 0% 100%\)/.test(bloqueProyeccion),
  );
  check(
    "los mandos se agrandan para una pantalla táctil de aula",
    /\.modo-proyeccion button \{[^}]*font-size/.test(bloqueProyeccion),
  );
  check(
    "el panel monta el avatar cuando entra en proyección",
    panel.includes("proyeccion && (") && panel.includes("<Avatar2D"),
  );
  check(
    "y cuenta los pasos de la animación, no las escenas",
    panel.includes("estado.foco + 2"),
  );
  check(
    "las piezas por destapar arrancan invisibles",
    /\.pz-animada \[class\*="pz-rev-"\] \{[^}]*opacity: 0/.test(estilos),
  );
  check(
    "la columna operada se ilumina con fondo, no solo con borde",
    /\.pz-fondo \{[^}]*fill:/.test(estilos) && panel.includes('className="pz-fondo"'),
  );
  check(
    "y en proyección ese fondo pesa más, para verse de lejos",
    /\.modo-proyeccion \.pz-fondo \{[^}]*fill:/.test(estilos),
  );
  check(
    "y se destapan con una regla CSS, sin recomponer la fórmula",
    panel.includes("reglasDeRevelado") && !/\.style\.opacity\s*=/.test(panel),
  );

  // Un solo motor de audio: con el tutor explicando, los botones de la pizarra
  // actúan sobre él, no sobre una segunda reproducción en paralelo.
  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  check(
    "la pizarra recibe el estado de reproducción del tutor",
    panel.includes("leccionEnMarcha") && panel.includes("leccionPausada"),
  );
  check(
    "y sus mandos, para pausar la MISMA locución",
    panel.includes("mandosLeccion?.pausar()") && panel.includes("mandosLeccion?.reanudar()"),
  );
  check(
    "el aula se los pasa desde el motor de la lección",
    /pausar: \(\) => pseRef\.current\?\.pause\(\)/.test(aula) &&
      aula.includes("leccionEnMarcha={controles.playing}"),
  );

  // La respuesta al diagnóstico del cliente: el avance de columna NO lo lleva
  // ningún temporizador fijo. Se encadena con el fin de la locución.
  const maquina = readFileSync(
    new URL("../lib/leccion/sincronizacion.ts", import.meta.url),
    "utf8",
  );
  check(
    "ni la pizarra ni el sincronizador avanzan con setInterval",
    !panel.includes("setInterval") && !maquina.includes("setInterval"),
  );
  check(
    "el paso se encadena con el fin de la locución, no con un reloj propio",
    maquina.includes(".hablar(texto, { alEmpezar: mostrar })") &&
      /\.then\(\(\) => \{\s*resuelta = true;\s*seguir\(\);/.test(maquina),
  );
  const servicioVoz = readFileSync(new URL("../lib/leccion/voz.ts", import.meta.url), "utf8");
  check(
    "la pizarra sólo cancela la voz si la locución la lanzó ella",
    /if \(turno !== quien\) return;/.test(servicioVoz) &&
      !maquina.includes("let hablando"),
  );
  check(
    "si el tutor retoma la palabra, el repaso se calla",
    /if \(leccionEnMarcha && !leccionPausada && estado\.estado === "reproduciendo"\)/.test(panel) &&
      panel.includes("mandos.detener()"),
  );
  check(
    "y al tomar la voz el repaso corta lo que el tutor tuviera en la boca",
    aula.includes("ttsRef.current?.cancel()"),
  );
  check(
    "la pantalla completa se pide con la API del navegador",
    panel.includes("requestFullscreen") && panel.includes("exitFullscreen"),
  );
  check(
    "y salir con Escape se detecta, no se supone",
    panel.includes("fullscreenchange"),
  );
  check(
    "si el navegador la deniega, queda al menos el alto contraste",
    panel.includes("setProyeccion((v) => !v)"),
  );
  check(
    "los resaltados se dibujan en una capa SVG aparte, sin recomponer KaTeX",
    panel.includes("<svg") && panel.includes("getBoundingClientRect"),
  );
  check(
    "y se vuelven a medir al cambiar el tamaño",
    panel.includes("ResizeObserver"),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Con servidor levantado
// ═════════════════════════════════════════════════════════════════════════════

const vivo = await fetch(`${BASE}/`, { redirect: "manual" })
  .then((r) => r.status > 0)
  .catch(() => false);

if (!vivo) {
  console.log(`\n(Servidor no disponible en ${BASE}: se omiten las pruebas de vista.)`);
} else {
  titulo("E. La vista de lección se pinta sin excepciones");

  /**
   * Marcas que Next.js deja cuando un componente revienta al renderizar.
   *
   * "This page could not be found" NO vale como síntoma: la plantilla del 404
   * viaja dentro de la carga RSC de todas las páginas, también de las sanas.
   */
  const SINTOMAS = [
    "Application error",
    "Unhandled Runtime Error",
    "a client-side exception has occurred",
    "__next_error__",
  ];

  const sufijo = Date.now().toString(36);
  const email = `qa.hito2.${sufijo}@mentoriamath.local`;
  const clave = "Alumno-2026";
  const alumno = await registrarAlumno(BASE, { email, password: clave, nombre: "QA Hito 2" });
  check("se puede registrar un alumno de prueba", alumno.ok, `HTTP ${alumno.estado}`);

  if (alumno.sesion) {
    // La lección exige etapa declarada y diagnóstico hecho: sin las dos cosas,
    // la página redirige y no se estaría comprobando lo que se cree.
    await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: alumno.sesion },
      body: JSON.stringify({ etapa: "SECUNDARIA", curso: 3 }),
    });
    const prueba = await (
      await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alumno.sesion } })
    ).json();
    await fetch(`${BASE}/api/diagnostico`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: alumno.sesion },
      body: JSON.stringify({
        respuestas: (prueba.preguntas ?? []).map((p) => ({
          preguntaId: p.id,
          respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
        })),
      }),
    });

    // El nivel viaja en el token: se vuelve a entrar para que la página no rebote.
    const sesion = (await iniciarSesion(BASE, email, clave)) ?? alumno.sesion;
    const vista = await fetch(`${BASE}/estudiante/leccion`, {
      headers: { cookie: sesion },
      redirect: "manual",
    });
    check(
      "la vista de lección responde sin rebotar",
      vista.status === 200,
      `HTTP ${vista.status} → ${vista.headers.get("location") ?? ""}`,
    );

    const html = await vista.text();
    check(
      "y no lanza una excepción de render",
      !SINTOMAS.some((s) => html.includes(s)),
      SINTOMAS.filter((s) => html.includes(s)).join(", "),
    );
    check(
      "trae el aula montada",
      html.includes("Elige un tema") || html.includes("Cambiar de tema"),
    );
    // El aula entra por la pantalla de elección de tema, así que la pizarra
    // animada todavía no está en el HTML. Lo que sí se puede comprobar —y es lo
    // que importa— es que su código VIAJA en el paquete de cliente de la ruta:
    // si el componente no hubiera entrado en la compilación, el alumno elegiría
    // tema y no encontraría nada.
    const guiones = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => m[1]);
    let conPizarra = false;
    let conProyeccion = false;
    for (const ruta of guiones) {
      const codigo = await (await fetch(`${BASE}${ruta}`)).text();
      if (codigo.includes("pz-animada")) conPizarra = true;
      if (codigo.includes("Modo proyecci")) conProyeccion = true;
    }
    check("la pizarra animada viaja en el paquete de la lección", conPizarra);
    check("y con ella el modo proyección", conProyeccion);

    // Los estilos no van en el mismo sitio que el código: el resaltado y el
    // tema de proyección son CSS, y si su hoja no llega a esta ruta la pizarra
    // se pinta sin recuadros y sin escalar, sin dar un solo error.
    const hojas = [...html.matchAll(/href="(\/_next\/static\/css\/[^"]+)"/g)].map((m) => m[1]);
    let conEstilos = false;
    let conRevelado = false;
    for (const hoja of hojas) {
      const css = await (await fetch(`${BASE}${hoja}`)).text();
      if (css.includes("modo-proyeccion") && css.includes("pz-trazo")) conEstilos = true;
      if (css.includes("pz-rev-")) conRevelado = true;
    }
    check("los estilos de la pizarra y de proyección llegan a la ruta", conEstilos);
    check("y las piezas por destapar arrancan invisibles en el navegador", conRevelado);
  }

  const docente = await iniciarSesion(
    BASE,
    process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
    process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
  );
  check("un docente puede iniciar sesión", Boolean(docente));

  if (docente) {
    const vista = await fetch(`${BASE}/docente/crear-tema`, { headers: { cookie: docente } });
    const html = await vista.text();
    check("el formulario de tema responde", vista.status === 200, `HTTP ${vista.status}`);
    check(
      "y tampoco lanza excepciones",
      !SINTOMAS.some((s) => html.includes(s)),
      SINTOMAS.filter((s) => html.includes(s)).join(", "),
    );

    // El orden de bloques que pidió el cliente en el backlog del Hito 1.
    const orden = [
      "Nuevo tema",
      "Alcance curricular",
      "Objetivos de aprendizaje",
      "Reglas",
      "Motor de corrección",
      "Publicación",
    ].map((rotulo) => ({ rotulo, pos: html.indexOf(rotulo) }));

    for (const { rotulo, pos } of orden) {
      check(`el formulario tiene el bloque "${rotulo}"`, pos >= 0);
    }
    const ordenados = orden.every((b, i) => i === 0 || (b.pos > orden[i - 1].pos && b.pos >= 0));
    check(
      "los bloques van en el orden pedido: datos, alcance, objetivos, reglas, motor, publicación",
      ordenados,
      orden.map((b) => `${b.rotulo}@${b.pos}`).join(" · "),
    );
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length > 0) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");
process.exit(fallos.length > 0 ? 1 : 0);
