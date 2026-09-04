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
  escenaDeColumna,
  escenaDeDespeje,
  escenaDeLinea,
  escenaDePolinomio,
  escenaDeTexto,
  guionDeLeccion,
  situacionParaNarracion,
} from "../lib/leccion/animacion.ts";
import { marcasDeColumna, leerSumaOResta } from "../lib/leccion/columna.ts";
import {
  avatarDe,
  crearSincronizador,
  duracionEstimada,
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
  check("el último foco es el resultado, en óvalo", escena.focos[2].tipo === "ovalo");
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
    "el término se tacha en los DOS lados",
    (escena.latex.match(/pz-cancela/g) || []).length === 2,
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
    "Vamos a ver la regla de la potencia",
    "derivada = 2x",
  ];
  const guion = guionDeLeccion(corpus);

  check("el guion tiene una escena por línea", guion.length === corpus.length);
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

  let escenaActual = 0;
  for (const [dicho, focoEsperado] of recorrido) {
    const destino = situacionParaNarracion(guion, dicho, escenaActual);
    if (destino) escenaActual = destino.escena;
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
  // El otro punto del cliente: el bloque DESARROLLO de arriba enseñaba la suma
  // ya resuelta mientras abajo corría la animación.
  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");

  check("la lección sabe qué líneas anima la pizarra", aula.includes("esAnimable"));
  check(
    "y mientras la animación no termina, no las compone arriba",
    aula.includes("desarrolloVisible") && aula.includes("desarrollo={desarrolloVisible}"),
  );
  check(
    "en cuanto termina la animación —o la lección— el desarrollo vuelve entero",
    /if \(animacionCompleta \|\| !controles\.playing\) return desarrollo;/.test(aula),
  );
  check(
    "las aclaraciones se siguen viendo: no destripan el resultado",
    /linea\.aclaracion \|\| !esAnimable/.test(aula),
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

/** Un locutor de mentira, con el comportamiento que pida cada prueba. */
function locutorFalso({ modo = "ok" } = {}) {
  const dichos = [];
  let resolver = null;
  return {
    dichos,
    resolverPendiente() {
      const r = resolver;
      resolver = null;
      r?.();
    },
    locutor: {
      disponible: () => modo !== "ausente",
      hablar(texto) {
        dichos.push(texto);
        if (modo === "falla") return Promise.reject(new Error("sin voz"));
        if (modo === "colgado") return new Promise(() => {});
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
  const s = crearSincronizador({ escenas: GUION, locutor: voz.locutor, reloj: r.reloj });

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
  const s = crearSincronizador({ escenas: GUION, locutor: voz.locutor, reloj: r.reloj });
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
    "y se destapan cambiando una opacidad, sin recomponer la fórmula",
    panel.includes("pz-rev-") && panel.includes("style.opacity"),
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
