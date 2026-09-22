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
  fraseDeCancelacionDeIncognita,
  escenaDeSimplificacion,
  escenaDeTexto,
  escenaDeAmplificacion,
  escenaDeCierre,
  escenaDeDistributiva,
  guionDeLeccion,
  reglasDeRevelado,
  situacionParaNarracion,
} from "../lib/leccion/animacion.ts";
import { PSELight } from "../public/pseLight.js";
import { cuentaDeArrayLatex, marcasDeColumna, leerSumaOResta } from "../lib/leccion/columna.ts";
import { cierreDelDesarrollo } from "../lib/leccion/cierre.ts";
import {
  conPreguntaPendiente,
  enunciadosParaResolver,
  esEnunciadoParaResolver,
  preguntaFinal,
  reanudarTrasAclaracion,
  restoDeLeccion,
  trasLaPrimeraPregunta,
} from "../lib/leccion/seguimiento-lsg.ts";
import { resolverEjercicio } from "../lib/leccion/correccion.ts";
import {
  apareceComoTermino,
  computeAnswer,
  processLSG,
  repararEquivalencias,
  sincronizarPasosConVoz,
  solveLinearSteps,
  fraseCancelacionIncognita,
  TIPOS_OPERACION as TIPOS_OPERACION_SERVIDOR,
} from "../src/preLight.js";
import {
  derivadaResueltaLSG,
  desgloseDelEjercicioLSG,
  divisionResueltaLSG,
  factorizacionResueltaLSG,
  fraccionResueltaLSG,
  linealResueltaLSG,
  locucionesDistributiva,
  locucionCancelacion,
  multiplicacionResueltaLSG,
  practicaParecida,
  reexplicacionDeConceptoLSG,
  restaResueltaLSG,
  sumaResueltaLSG,
} from "../src/lsgPrompt.js";
import { manejarConsulta } from "../src/queryCore.js";
import { esNotaRotulada, expresionFormalDeFraccion, partirNota } from "../lib/leccion/notas.ts";
import { esCalculoAuxiliar, repartirEnAmbientes } from "../lib/leccion/ambientes.ts";
import { comoFilas, partirFormula, partirLaMasLarga, yaEstaDispuesta } from "../lib/leccion/ajuste.ts";
import { colocarEtiqueta, MARGEN_ANOTACION, seSolapan } from "../lib/leccion/etiquetas.ts";
import { rotulosALatex } from "../lib/leccion/rotulos.ts";
import { ROL, ROLES_TIPOGRAFICOS, rol } from "../lib/leccion/roles.ts";
import { planoALatex, separarProsaYMatematicas } from "../lib/matematicas/index.ts";
import { columnaVertical } from "../lib/leccion/columna.ts";
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

/**
 * SIMULACIÓN DE "LA PIZARRA SIGUE A LA VOZ", con las funciones de verdad.
 *
 * Recorre una lección ya procesada directiva a directiva, con las líneas que la
 * pizarra tendría escritas en cada momento, y coloca el panel donde lo
 * colocaría `situacionParaNarracion` al oír cada frase. Devuelve, por cada
 * frase y cada pausa, qué escena y qué foco se estaban viendo.
 */
function simularLeccion(lsg) {
  const eventos = [];
  for (const m of lsg.modulos ?? [{ id: "leccion", directivas: lsg.directivas }]) {
    const lineas = [];
    let escenas = [];
    let pos = { escena: 0, foco: -1 };
    let dicho = "";
    for (const d of m.directivas) {
      if (d.tipo === "pizarra") {
        lineas.push(d.operacion ? { latex: d.contenido, operacion: d.operacion, narracion: d.narracion } : d.contenido);
        escenas = guionDeLeccion(lineas);
      } else if (d.tipo === "hablar") dicho = d.texto;
      if (dicho && escenas.length) {
        const destino = situacionParaNarracion(escenas, dicho, pos.escena, pos.foco);
        if (destino) pos = destino;
      }
      eventos.push({ fase: m.id, d, escenas, escena: pos.escena, foco: pos.foco });
    }
  }
  return eventos;
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
  // Con la pizarra de dos ambientes cada paso tiene su estado: en el ACTIVO sólo
  // se dibuja su foco encendido; en uno ya COMPLETADO, sólo lo que es
  // procedimiento (lo tachado y la respuesta enmarcada).
  check(
    "y sólo se enciende el foco de la columna que se está operando",
    /estado === "activa" \? i === foco : estado === "completada" \? Boolean\(f\.final\) \|\| f\.tipo === "tachado" : false/.test(panel),
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
    cancelacion.piezas.includes("pz-cancela-termino") &&
      cancelacion.piezas.includes("pz-cancela-opuesto"),
  );
  check(
    "y cada una marca sólo su número en el LaTeX",
    contenidoDe(escena.latex, "pz-cancela-termino") === "6" &&
      contenidoDe(escena.latex, "pz-cancela-opuesto") === "6",
    `${contenidoDe(escena.latex, "pz-cancela-termino")} / ${contenidoDe(escena.latex, "pz-cancela-opuesto")}`,
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
      panel.includes("escena.focos.flatMap((f) => [...(f.piezas ?? [f.clase])"),
  );
  check(
    "con el rótulo escrito una sola vez (y sólo en el paso activo)",
    panel.includes('conEtiqueta={j === 0 && estado === "activa"}'),
  );
}

titulo("A00e. Lo que no cabe se parte en renglones, no se corta");

{
  // La regla de la potencia trae DOS ejemplos; la diferencia de cuadrados, una
  // igualdad larga. A tamaño de aula no caben en media pizarra, y se cortaban
  // contra el borde dejando un trozo colgando (el cliente lo vio en Derivadas).
  const dosEjemplos = "\\frac{d}{dx}\\left[x^{3}\\right] = 3x^{2} \\qquad \\frac{d}{dx}\\left[x^{5}\\right] = 5x^{4}";
  check(
    "una fórmula con dos ejemplos se parte por el separador, no por el igual",
    JSON.stringify(partirFormula(dosEjemplos)) ===
      JSON.stringify(["\\frac{d}{dx}\\left[x^{3}\\right] = 3x^{2}", "\\frac{d}{dx}\\left[x^{5}\\right] = 5x^{4}"]),
    JSON.stringify(partirFormula(dosEjemplos)),
  );
  check(
    "y una igualdad larga, por su igual, que se lleva el renglón siguiente",
    JSON.stringify(partirFormula("a^{2} - b^{2} = (a - b)(a + b)")) === JSON.stringify(["a^{2} - b^{2}", "= (a - b)(a + b)"]),
    JSON.stringify(partirFormula("a^{2} - b^{2} = (a - b)(a + b)")),
  );
  check(
    "nunca por un igual que esté dentro de unas llaves (el numerador de una fracción)",
    partirFormula("\\frac{a = b}{c}") === null,
    JSON.stringify(partirFormula("\\frac{a = b}{c}")),
  );
  check(
    "lo que no tiene por dónde partirse, no se parte",
    partirFormula("2x") === null && partirLaMasLarga(["2x"]) === null,
  );
  check(
    "las filas se componen ARRIMADAS A LA IZQUIERDA, en un solo bloque",
    comoFilas(["x^{2} - 9", "= (x - 3)(x + 3)"]) === "\\begin{aligned} &x^{2} - 9 \\\\[0.15em] &= (x - 3)(x + 3) \\end{aligned}",
    comoFilas(["x^{2} - 9", "= (x - 3)(x + 3)"]),
  );
  check(
    "una cuenta ya dispuesta —una columna, un despeje alineado— no se toca",
    yaEstaDispuesta("\\begin{array}{rcc} & 2 & 4 \\end{array}") &&
      yaEstaDispuesta("\\begin{aligned} x &= 5 \\end{aligned}") &&
      !yaEstaDispuesta("x^{2} - 9 = (x - 3)(x + 3)"),
  );
  // Y toda regla larga del catálogo tiene por dónde partirse para caber.
  const catalogo = JSON.parse(readFileSync(new URL("../prisma/seed-data/reglas-matematicas.json", import.meta.url), "utf8"));
  const reglasDelBanco = Array.isArray(catalogo) ? catalogo : Object.values(catalogo)[0];
  const largasSinPartir = [];
  for (const r of reglasDelBanco) {
    for (const campo of ["enunciado", "ejemplo"]) {
      const latex = String(r[campo] ?? "");
      if (!latex || yaEstaDispuesta(latex)) continue;
      const cuerpo = latex.replace(/\\[a-zA-Z]+|[{}]/g, "").replace(/\s+/g, "");
      if (cuerpo.length > 18 && !partirFormula(latex)) largasSinPartir.push(`${r.nombre} · ${campo}: ${latex}`);
    }
  }
  check("toda regla larga del catálogo tiene por dónde partirse", largasSinPartir.length === 0, largasSinPartir.join(" · "));
}

titulo("A00f. Rigor de cálculo: el rótulo no es parte del ejercicio, y una ecuación se resuelve como ecuación");

{
  // 1. EL RÓTULO NO ES PARTE DEL EJERCICIO. La tanda de práctica escribe
  // "Ejercicio 1:  5x" en la pizarra, y eso es lo que llega al corrector: el "1:"
  // se pegaba al monomio —se leía "15x"— y la derivada daba 15 donde vale 5. El
  // alumno respondía bien y el servidor lo calificaba como error.
  check(
    "«Ejercicio 2:  5x» se corrige como 5x: la derivada es 5, no 25",
    resolverEjercicio("Ejercicio 2:  5x", "derivadas") === "5",
    String(resolverEjercicio("Ejercicio 2:  5x", "derivadas")),
  );
  check(
    "«Ejercicio 1: 2x» → 2",
    resolverEjercicio("Ejercicio 1: 2x", "derivadas") === "2",
    String(resolverEjercicio("Ejercicio 1: 2x", "derivadas")),
  );
  check(
    "…y lo que no lleva rótulo se sigue corrigiendo igual",
    resolverEjercicio("5x", "derivadas") === "5" && resolverEjercicio("2x + 5 = 15") === "5" &&
      resolverEjercicio("Ejercicio 1: 1/4 + 1/6") === "5/12",
  );
  check(
    "el rótulo se quita en el CORRECTOR, que es por donde entra la pizarra",
    /^\s*ejercicio\\s\*\(\?:n/.test("") ||
      /sinRotulo\(String\(ejercicio \?\? ""\)\.trim\(\)\)/.test(readFileSync(new URL("../lib/leccion/correccion.ts", import.meta.url), "utf8")),
  );

  // 2. UNA ECUACIÓN SE RESUELVE COMO ECUACIÓN, nunca evaluando el primer trozo
  // aritmético que lleve dentro.
  for (const [pregunta, esperada] of [
    ["¿Cuánto vale x en x/2 + 5 = 12? Escribe solo el número.", "14"],
    ["¿Cuánto vale x en x/3 + 7 = 12? Escribe solo el número.", "15"],
    ["¿Cuánto vale x en 5x/2 - 3 = 2x + 6? Escribe solo el número.", "18"],
    ["¿Cuánto vale x en x/4 + x/2 = 9? Escribe solo el número.", "12"],
    ["¿Cuánto vale x en 2(x + 3) = 16? Escribe solo el número.", "5"],
  ]) {
    check(`«${pregunta.slice(16, 40)}…» → ${esperada}`, computeAnswer(pregunta) === esperada, String(computeAnswer(pregunta)));
  }
  check("y una cuenta sigue siendo una cuenta", computeAnswer("¿Cuánto es 19 + 45?") === "64" && computeAnswer("¿Cuánto es 2/5 + 1/10?") === "1/2");

  // 3. LO QUE SE DICE ES LO QUE SE HACE, en el despeje y en el polinomio.
  const conMenos = escenaDeDespeje("2x - 6 = 16", "e");
  check(
    "con «2x − 6 = 16» el tutor SUMA 6 en los dos lados (no «quitamos»)",
    /^Sumamos 6 en los dos lados/.test(conMenos.focos[0]?.narracion ?? ""),
    conMenos.focos[0]?.narracion,
  );
  const conMas = escenaDeDespeje("2x + 6 = 16", "e");
  check(
    "y con «2x + 6 = 16» resta 6",
    /^Restamos 6 en los dos lados/.test(conMas.focos[0]?.narracion ?? ""),
    conMas.focos[0]?.narracion,
  );
  const poli = escenaDePolinomio("2x⁵ - 3x⁴ + x²", "e");
  const dichos = poli.focos.map((f) => f.narracion);
  check(
    "el término «- 3x⁴» se nombra con su signo y su coeficiente es menos 3",
    dichos.includes("Miramos el término menos 3 por x elevado a 4.") && dichos.includes("Su coeficiente es menos 3."),
    JSON.stringify(dichos.slice(3, 6)),
  );
  check(
    "y «2x⁵» se lee «2 por x elevado a 5», no «2x elevado a 5» (que sería (2x)⁵)",
    dichos.includes("Miramos el término 2 por x elevado a 5.") && !dichos.some((d) => /término \d+x elevado/.test(d ?? "")),
    JSON.stringify(dichos.slice(0, 3)),
  );
}

titulo("A00g. Tercera ronda del cliente: la cancelación dentro de su miembro, la multiplicación a la vista, notas sin desfase y los dos ambientes");

{
  const leccion = (crudo) => processLSG(crudo, crudo.intencion, "prueba").lsg;
  const visible = (latex) => {
    const html = katex.renderToString(latex, { displayMode: true, throwOnError: true, strict: false, trust: (c) => c.command === "\\htmlClass" });
    return html
      .replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[​-‍﻿]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // 1. RIGOR EN LA CANCELACIÓN. Tachar el +6 de la izquierda contra el -6 de la
  // derecha, a través del igual, es falso: la propiedad uniforme escribe el -6 en
  // LOS DOS miembros y la cancelación ocurre entre los opuestos del izquierdo.
  {
    const e = escenaDeDespeje("2x + 6 = 16", "e");
    const [izq, der] = e.latex.split(/(?<!\\begin\{aligned\}[^=]*)=/);
    check(
      "«2x + 6 = 16»: se escribe la resta en los dos miembros — «2x + 6 − 6 = 16 − 6»",
      visible(e.latex).replace(/\s/g, "") === "2x+6−6=16−6",
      visible(e.latex),
    );
    check(
      "…y las dos marcas de cancelación están DENTRO del miembro izquierdo",
      /pz-cancela-termino/.test(izq) && /pz-cancela-opuesto/.test(izq) && !/pz-cancela/.test(der),
      `izq: ${/pz-cancela/.test(izq)} · der: ${/pz-cancela/.test(der)}`,
    );
    // EL PASO SE CUENTA EN DOS TIEMPOS (petición del cliente, ronda de
    // septiembre): "primero se proyecta la operación uniforme completa SIN
    // TACHAR; cuando la voz pronuncie «a la izquierda se cancela +6 con -6», se
    // dispara el tachado". Antes el tachado estaba puesto desde el segundo cero.
    check(
      "…el PRIMER tiempo sólo escribe la resta en los dos miembros: una caja por miembro, sin tachar",
      e.focos[0]?.tipo === "caja" && e.focos[0]?.clase === "pz-uniforme" &&
        JSON.stringify(e.focos[0].piezas) === JSON.stringify(["pz-uniforme-izq", "pz-uniforme-der"]),
      JSON.stringify(e.focos[0]),
    );
    check(
      "…y lo dice sin cancelar todavía: «restamos 6 en los dos lados»",
      /^Restamos 6 en los dos lados/.test(e.focos[0]?.narracion ?? "") && !/cancela/.test(e.focos[0]?.narracion ?? ""),
      e.focos[0]?.narracion,
    );
    check(
      "…el SEGUNDO tiempo tacha ese par de opuestos, y nada más",
      e.focos[1]?.tipo === "tachado" &&
        JSON.stringify(e.focos[1].piezas) === JSON.stringify(["pz-cancela-termino", "pz-cancela-opuesto"]),
      JSON.stringify(e.focos[1]),
    );
    check(
      "…y lo dicho lo cuenta igual: a la izquierda se cancelan, a la derecha se resta",
      /^A la izquierda se cancela \+6 con -6, y a la derecha 16 menos 6 son 10/.test(e.focos[1]?.narracion ?? ""),
      e.focos[1]?.narracion,
    );
    check(
      "…y las cajas del primer tiempo no cruzan el igual: una en cada miembro",
      /pz-uniforme-izq/.test(izq) && !/pz-uniforme-izq/.test(der) &&
        /pz-uniforme-der/.test(der) && !/pz-uniforme-der/.test(izq),
      `izq: ${/pz-uniforme/.test(izq)} · der: ${/pz-uniforme/.test(der)}`,
    );
    const resta = escenaDeDespeje("2x - 6 = 16", "e");
    check(
      "«2x − 6 = 16»: el opuesto es +6, también en los dos miembros",
      visible(resta.latex).replace(/\s/g, "") === "2x−6+6=16+6",
      visible(resta.latex),
    );
    const unaLinea = escenaDeDespeje("x + 3 = 8", "e");
    check(
      "«x + 3 = 8»: se resta 3 en los dos miembros y la solución va debajo",
      /x\+3−3/.test(visible(unaLinea.latex).replace(/\s/g, "")) && /8−3/.test(visible(unaLinea.latex).replace(/\s/g, "")),
      visible(unaLinea.latex),
    );
    check(
      "…y su cancelación sigue siendo del miembro izquierdo",
      !/pz-cancela/.test(unaLinea.latex.split("&=").slice(1).join("&=")),
    );
    // En TODO el catálogo de ecuaciones: las marcas de una cancelación viven
    // DENTRO DE UN MISMO MIEMBRO, nunca a caballo del igual. Cuál de los dos
    // depende de qué se cancele: una constante se cancela a la izquierda
    // ("2x + 6 − 6 = 16 − 6") y los términos con incógnita, a la derecha
    // ("2x + 8 − 3x = 3x − 1 − 3x"). Lo que no puede pasar nunca es que una
    // marca empiece en un miembro y acabe en el otro.
    const cruzan = [];
    for (const nivel of ["facil", "normal", "dificil", "experto"]) {
      const lsg = leccion(linealResueltaLSG({ nivel, concepto: true }));
      for (const d of lsg.modulos.flatMap((m) => m.directivas)) {
        if (d.tipo !== "pizarra" || !d.contenido) continue;
        const escena = escenaDeLinea({ latex: d.contenido, ...(d.operacion ? { operacion: d.operacion } : {}) }, "x");
        if (!escena?.latex) continue;
        const partes = escena.latex.split("&=").join("=").split("=");
        const conMarca = partes.filter((p) => /pz-cancela/.test(p)).length;
        if (conMarca > 1) cruzan.push(d.contenido);
      }
    }
    check("en todo el catálogo de ecuaciones, ninguna cancelación cruza el igual", cruzan.length === 0, cruzan.join(" · "));
  }

  // 2. LA MULTIPLICACIÓN, A LA VISTA EN REGLAS DE FRACCIONES.
  {
    const lsg = leccion(fraccionResueltaLSG({ concepto: true }));
    const dirs = lsg.modulos.flatMap((m) => m.directivas);
    const i = dirs.findIndex((d) => d.tipo === "pizarra" && /Fracciones equivalentes/.test(String(d.contenido ?? "")));
    const escrita = String(dirs[i]?.contenido ?? "");
    const dicha = String(dirs[i + 1]?.texto ?? "");
    check(
      "Reglas de fracciones: la equivalencia se escribe con su multiplicación, «1/2 = (1 × 2)/(2 × 2) = 2/4»",
      escrita === "Fracciones equivalentes: 1/2 = (1 × 2)/(2 × 2) = 2/4",
      escrita,
    );
    check(
      "…y es lo que el tutor está diciendo en esa misma frase",
      dirs[i + 1]?.tipo === "hablar" && /multiplicas arriba y abajo de 1\/2 por 2/.test(dicha) && /sale 2\/4/.test(dicha),
      dicha,
    );
    const [nota] = partirNota(escrita);
    check(
      "…compuesta con fracciones verticales y el factor visible, sin barras",
      planoALatex(nota.cuerpo) === "\\frac{1}{2} = \\frac{1 \\times 2}{2 \\times 2} = \\frac{2}{4}",
      planoALatex(nota.cuerpo),
    );
  }

  // 3. LAS NOTAS DE CADA COLUMNA, SIN DESFASE: se escriben al EMPEZAR su frase.
  {
    const desfasadas = [];
    for (const [nombre, gen] of [["suma", sumaResueltaLSG], ["resta", restaResueltaLSG], ["multiplicación", multiplicacionResueltaLSG], ["división", divisionResueltaLSG]]) {
      for (const nivel of ["facil", "normal", "dificil"]) {
        const dirs = leccion(gen({ nivel, concepto: true })).modulos.flatMap((m) => m.directivas);
        for (let k = 0; k < dirs.length; k++) {
          const d = dirs[k];
          if (d.tipo !== "pizarra" || !d.narracion) continue;
          // La frase que explica la línea tiene que ser la SIGUIENTE directiva que habla.
          const siguienteHabla = dirs.slice(k + 1).find((x) => x.tipo === "hablar");
          if (siguienteHabla?.texto !== d.narracion) desfasadas.push(`${nombre}/${nivel}: ${d.contenido}`);
        }
      }
    }
    check(
      "cada línea de aritmética se escribe justo antes de la frase que la explica (nada de escribirla al terminar de hablar)",
      desfasadas.length === 0,
      desfasadas.slice(0, 3).join(" · "),
    );
    const dirs = leccion(sumaResueltaLSG({ nivel: "dificil", concepto: true })).modulos.flatMap((m) => m.directivas);
    const iNota = dirs.findIndex((d) => d.tipo === "pizarra" && /^unidades:/.test(String(d.contenido ?? "")));
    const iFrase = dirs.findIndex((d) => d.tipo === "hablar" && /unidades/i.test(String(d.texto ?? "")) && /=/.test(String(d.texto ?? "")));
    check(
      "la nota de las unidades está escrita ANTES de que la voz las sume",
      iNota > 0 && iFrase > iNota && dirs.slice(iNota + 1, iFrase).every((d) => d.tipo !== "hablar"),
      `nota ${iNota} · frase ${iFrase}`,
    );
  }
}

titulo("A00h. Segunda ronda del cliente: las ayudas en la práctica, a/b vertical y la tarjeta proyectada");

{
  // 1. «EXPLICAR REGLA» ANIMA EL EJERCICIO. Con un ejercicio en la tarjeta, el
  // servidor explica la regla SOBRE él con el desglose determinista —pasos que
  // se escriben y se animan—, no con prosa suelta del modelo.
  const leccion = (crudo) => processLSG(crudo, crudo.intencion, "prueba").lsg;
  const antes = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "clave-que-no-debe-usarse";
  const regla = await manejarConsulta({
    query: "Explícame la regla que se aplica",
    contexto: "Aritmética",
    currentTopic: "Aritmética",
    seguimiento: "reexplicar",
    parte: "concepto",
    explicacionDinamica: true,
    aclaracion: {
      ejercicio: "678 + 145 = ?",
      tema: "aritmetica",
      conResultado: false,
      regla: { nombre: "Suma con llevada", formula: "", descripcion: "Se suma columna por columna de derecha a izquierda." },
    },
  });
  if (antes === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = antes;
  const pasos = regla.json.pasos ?? [];
  const pizarras = pasos.filter((p) => p.tipo === "pizarra");
  const dicho = pasos.filter((p) => p.tipo === "hablar").map((p) => p.texto);
  check(
    "«Explicar regla» en la práctica de 678 + 145: desglose determinista, aunque haya modelo configurado",
    regla.status === 200 && regla.json.modelo === "desglose" && regla.json.fuente_ia === "local",
    `${regla.json.fuente_ia}/${regla.json.modelo}`,
  );
  check(
    "…que abre nombrando la regla y contándola",
    /La regla que estamos aplicando es «Suma con llevada»\. Se suma columna por columna de derecha a izquierda\./.test(dicho[0] ?? ""),
    dicho[0],
  );
  check(
    "…y escribe LA MISMA cuenta en columna, etiquetada para animarse, con cada columna y su cierre",
    pizarras.some((p) => p.contenido === "678 + 145" && p.operacion?.tipo === "columna") &&
      ["unidades", "decenas", "centenas"].every((c) => pizarras.some((p) => p.contenido.startsWith(`${c}:`))) &&
      pizarras.some((p) => p.contenido === "678 + 145 = 823" && p.operacion?.tipo === "resultado"),
    JSON.stringify(pizarras.map((p) => p.contenido)),
  );
  check(
    "…y cada columna se dice con su nombre, que es lo que mueve la animación",
    ["unidades", "decenas", "centenas"].every((c) => dicho.some((t) => t.startsWith(`Sumamos las ${c}`))),
  );

  // 2. SIN SPOILER: tras resolverla, OTRA práctica.
  const nueva = regla.json.nuevaPractica;
  check(
    "tras resolverle la práctica, el servidor manda un ejercicio NUEVO del mismo tipo",
    nueva && nueva.enunciado !== "678 + 145 = ?" && /^\d{3} \+ \d{3} = \?$/.test(nueva.enunciado) &&
      nueva.respuesta === resolverEjercicio(nueva.enunciado),
    JSON.stringify(nueva),
  );
  check(
    "…que se escribe DESPUÉS del cierre y es lo último que se pregunta",
    pizarras.at(-1)?.contenido === nueva?.enunciado &&
      pasos.findIndex((p) => p.contenido === "678 + 145 = 823") < pasos.findIndex((p) => p.contenido === nueva?.enunciado) &&
      // (el motor quita a la pregunta la coletilla "Escribe solo el número")
      String(nueva?.pregunta).startsWith(pasos.filter((p) => p.tipo === "preguntar").at(-1)?.texto ?? "-"),
  );
  // Con la práctica ya contestada no hay nada que adelantarle: ni ejercicio nuevo.
  const resuelta = await manejarConsulta({
    query: "No entendí, explícalo mejor",
    contexto: "Aritmética",
    currentTopic: "Aritmética",
    seguimiento: "reexplicar",
    parte: "resolucion",
    explicacionDinamica: true,
    aclaracion: { ejercicio: "678 + 145 = ?", tema: "aritmetica", conResultado: true },
  });
  check("con la práctica ya contestada, el desglose cierra sin ejercicio nuevo", resuelta.json.modelo === "desglose" && !resuelta.json.nuevaPractica);

  // El ejercicio parecido, en cada motor: mismo tipo, distinto, y con su respuesta.
  for (const [ej, tema, forma] of [
    ["678 + 145 = ?", "", /^\d{3} \+ \d{3} = \?$/],
    ["3/5 + 1/2 = ?", "", /^\d+\/\d+ \+ \d+\/\d+ = \?$/],
    ["1/7 + 5/7 = ?", "", /^(\d+)\/(\d+) \+ \d+\/\2 = \?$/],
    ["52 - 27 = ?", "", /^\d{2} - \d{2} = \?$/],
    ["23 × 14 = ?", "", /^\d{2} × \d{2} = \?$/],
    ["2(x + 3) = 16", "", /x/],
    ["2x + 5 = 15", "", /x/],
    ["3x⁴ - 2x²", "derivadas", /x/],
    ["x² - 9", "factorización", /^x² - \d+$/],
  ]) {
    const p = practicaParecida(ej, tema);
    const limpio = (t) => String(t).replace(/\s*=\s*\?$/, "");
    check(
      `el ejercicio que sigue a "${ej}" es otro del mismo tipo, con su respuesta`,
      p && limpio(p.enunciado) !== limpio(ej) && forma.test(p.enunciado) && p.pregunta && p.respuesta &&
        (tema ? true : p.respuesta === resolverEjercicio(p.enunciado)),
      JSON.stringify(p),
    );
  }

  // En el aula: las dos ayudas desglosan el ejercicio de la tarjeta; el
  // planteamiento de la práctica se anima mientras se resuelve en voz alta; y la
  // pregunta que vuelve es la del ejercicio nuevo, que se lleva la tarjeta.
  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  const pizarraSrc = readFileSync(new URL("../components/leccion/pizarra.tsx", import.meta.url), "utf8");
  check(
    "el aula desglosa con las DOS ayudas —«No entendí» y «Explicar regla»— si hay ejercicio en la tarjeta",
    /const desgloseDeLaTarjeta =\s*Boolean\(opciones\.soloExplicacion\) && enTarjeta != null && faseConEjercicio\(\);/.test(aula) &&
      !/desgloseDeLaPractica =[^;]*opciones\.parte === "resolucion"/.test(aula),
  );
  check(
    "y manda la descripción de la regla para que el tutor la cuente",
    /descripcion: activa\.descripcion/.test(aula),
  );
  check(
    "el enunciado de la práctica se anima SÓLO mientras el tutor lo resuelve porque el alumno lo pidió",
    /setEnunciadoExplicado\(desgloseDeLaPractica && llegoElDesglose \? enTarjeta : null\)/.test(aula) &&
      /ejercicio\.texto === enunciadoExplicado/.test(aula) &&
      /ejercicio\.texto !== enunciadoExplicado &&/.test(pizarraSrc),
  );
  check(
    "la pregunta que vuelve es la del ejercicio nuevo, sin repetir el paso de palabra",
    /const preguntaNueva = datos\?\.nuevaPractica \? preguntaFinal\(datos\.lsg\) : null;/.test(aula) &&
      /const preguntaDeVuelta = preguntaNueva \?\? preguntaPendiente;/.test(aula) &&
      /const transicion = preguntaNueva \? null : undefined;/.test(aula),
  );
  check(
    "y el ejercicio nuevo es el que se corrige desde entonces",
    /if \(\(!opciones\.soloExplicacion \|\| preguntaNueva\) && pizarras\.length > 0\)/.test(aula),
  );
  check(
    "la primera línea de un desglose no pasa por enunciado de la fase (a la segunda ayuda se llevaba la tarjeta)",
    /const propio = preguntaNueva\s*\?/.test(aula) && /enunciadoPorFase\.current = enunciados;/.test(aula),
  );

  // La combinación, con el desglose real de la práctica de fracciones.
  const crudo = desgloseDelEjercicioLSG({ ejercicio: "3/5 + 1/2 = ?", conResultado: false });
  const des = leccion(crudo);
  const combinada = reanudarTrasAclaracion(des, {
    faseActual: "practica",
    pregunta: preguntaFinal(des),
    mismaFase: trasLaPrimeraPregunta([{ tipo: "hablar", texto: "a" }, { tipo: "preguntar", texto: "¿vieja?" }, { tipo: "hablar", texto: "después" }]),
    transicion: null,
  });
  const dirs = combinada.modulos[0].directivas;
  const preguntas = dirs.filter((d) => d.tipo === "preguntar");
  check(
    "3/5 + 1/2: se resuelve hasta el 11/10 y se pregunta UNA vez, por el ejercicio nuevo",
    preguntas.length === 1 && crudo.nuevaPractica.pregunta.startsWith(preguntas[0].texto) && /1\/3 \+ 2\/5/.test(preguntas[0].texto) &&
      !dirs.some((d) => d.texto === "Ahora inténtalo tú.") &&
      dirs.some((d) => d.contenido === "3/5 + 1/2 = 6/10 + 5/10 = (6 + 5)/10 = 11/10"),
    JSON.stringify(preguntas.map((p) => p.texto)),
  );
  check(
    "…y lo que venía tras la pregunta vieja sigue después de la nueva, sin la vieja",
    dirs.at(-1)?.texto === "después" && !dirs.some((d) => d.texto === "¿vieja?"),
  );
  check(
    "…y el único enunciado que se le pide al alumno es el nuevo",
    JSON.stringify([...enunciadosParaResolver(combinada)]) === JSON.stringify([crudo.nuevaPractica.enunciado]),
    JSON.stringify([...enunciadosParaResolver(combinada)]),
  );
  check(
    "sin ejercicio nuevo, la pregunta pendiente vuelve con su «Ahora inténtalo tú», como antes",
    conPreguntaPendiente({ directivas: [] }, { tipo: "preguntar", texto: "¿?" }).directivas[0]?.texto === "Ahora inténtalo tú." &&
      conPreguntaPendiente({ directivas: [] }, { tipo: "preguntar", texto: "¿?" }, null).directivas.length === 1,
  );
}

{
  // 3. FRACCIÓN VERTICAL TAMBIÉN CON LETRAS: "a/b = (a×k)/(b×k)".
  const amplificacion = planoALatex("a/b = (a×k)/(b×k)");
  check(
    "la propiedad de amplificación se compone con fracciones verticales",
    amplificacion === "\\frac{a}{b} = \\frac{a \\times k}{b \\times k}",
    amplificacion,
  );
  const html = katex.renderToString(amplificacion, { throwOnError: true });
  const visible = html.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, "").replace(/<[^>]+>/g, "");
  check("…y en lo que KaTeX pinta no queda ninguna barra inclinada", !visible.includes("/") && (html.match(/class="mfrac"/g) ?? []).length === 2);
  for (const [plano, latex] of [
    ["x/2 + 2x/3", "\\frac{x}{2} + \\frac{2x}{3}"],
    ["x²/4", "\\frac{x^{2}}{4}"],
    ["a/c ± b/c = (a ± b)/c", "\\frac{a}{c} \\pm \\frac{b}{c} = \\frac{a \\pm b}{c}"],
    ["3/5 + 1/2", "\\frac{3}{5} + \\frac{1}{2}"],
    ["d/dx(x²)", "\\frac{d}{dx}(x^{2})"],
    ["km/h", "km/h"],
    ["y/o", "y/o"],
  ]) {
    check(`"${plano}" → ${latex}`, planoALatex(plano) === latex, planoALatex(plano));
  }
  check(
    "y dentro de una frase del tutor, la propiedad sale como fórmula",
    separarProsaYMatematicas("La propiedad dice que a/b = (a×k)/(b×k), con k distinto de cero.").some((p) => p.tipo !== "texto" && p.contenido === "a/b = (a×k)/(b×k)"),
  );

  // 4. LA TARJETA PROYECTADA, EN PROPORCIÓN CON LAS NOTAS DE AL LADO.
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  check(
    "en proyección, la fórmula de la tarjeta va al tamaño exacto de la de una nota (48 px), no a 64",
    /\.modo-proyeccion \.pz-regla-formula \.katex \{\s*font-size: 3rem;\s*\}/.test(css) &&
      /\.modo-proyeccion \.pz-nota \.katex \{\s*font-size: max\(3rem, 1\.3em\);\s*\}/.test(css),
  );
  check(
    "…y el nombre de la regla, al tamaño del texto de las notas",
    /\.modo-proyeccion \.pz-tarjeta-regla-nombre \{\s*font-size: clamp\(1\.6rem, 2\.2vw, 2\.3rem\);/.test(css) &&
      /\.modo-proyeccion \.pz-nota \{\s*font-size: clamp\(1\.6rem, 2\.2vw, 2\.3rem\);/.test(css),
  );
}

titulo("A00i. Informe del cliente: los cinco subprocesos universales");

{
  // SUB-TIP-01 — TRES ROLES, CADA UNO CON SU FUENTE.
  check(
    "hay exactamente tres roles: TUTOR_DIALOG, BOARD_LABEL y MATH_EXPRESSION",
    JSON.stringify(ROLES_TIPOGRAFICOS) === JSON.stringify(["TUTOR_DIALOG", "BOARD_LABEL", "MATH_EXPRESSION"]) &&
      rol(ROL.PIZARRA)["data-rol"] === "BOARD_LABEL",
  );

  // SUB-PIZ-02 — LOS DOS AMBIENTES, POR UNA REGLA MONÓTONA.
  const reparto = (pasos) => repartirEnAmbientes(pasos.map(([papel, gesto]) => ({ papel, gesto }))).join("");
  // Una conversión a cada lado: el Ambiente 2 no puede quedarse con el MCM y un
  // hueco mientras el 1 amplifica las dos fracciones (segunda ronda, a3.png).
  check(
    "1/2 + 1/3: planteamiento y la PRIMERA conversión a la izquierda; MCM, la segunda, la suma y la respuesta a la derecha",
    reparto([["planteamiento", null], ["auxiliar", null], ["paso", "amplificacion"], ["paso", "amplificacion"], ["paso", "suma_fracciones"], ["cierre", "resultado"]]) === "121222",
    reparto([["planteamiento", null], ["auxiliar", null], ["paso", "amplificacion"], ["paso", "amplificacion"], ["paso", "suma_fracciones"], ["cierre", "resultado"]]),
  );
  check(
    "2(x + 3) = 16: el reparto a la izquierda; el despeje y la solución a la derecha",
    reparto([["planteamiento", "distributiva"], ["paso", "cancelacion"], ["paso", "despeje"], ["cierre", "resultado"]]) === "1222",
    reparto([["planteamiento", "distributiva"], ["paso", "cancelacion"], ["paso", "despeje"], ["cierre", "resultado"]]),
  );
  check(
    "una línea escrita no cambia de lado: abierto el Ambiente 2, lo que viene sigue en él",
    reparto([["planteamiento", null], ["paso", "amplificacion"], ["paso", "cancelacion"], ["paso", "amplificacion"]]) === "1122",
  );
  // LA CADENA DE RESOLUCIÓN NO SE PARTE EN DOS COLUMNAS (cuarta ronda del
  // cliente): "conservar el historial acumulativo verticalmente en el panel de
  // desarrollo… cada nuevo paso secuencialmente hacia abajo". El despeje empezaba
  // en el Ambiente 1 y seguía en el 2, y leído de corrido parecía que la pizarra
  // se vaciaba y saltaba a otra cosa.
  check(
    "2x + 5 = 15: la cadena sigue donde empieza —sobre el enunciado— y baja por el Ambiente 1; la respuesta enmarcada, a la derecha",
    reparto([["planteamiento", "cancelacion"], ["paso", "factor"], ["cierre", "resultado"]]) === "112",
    reparto([["planteamiento", "cancelacion"], ["paso", "factor"], ["cierre", "resultado"]]),
  );
  check(
    "…y al enunciado le acompaña UN paso: el resto baja por el panel de desarrollo, sin dejarlo vacío",
    reparto([["planteamiento", "cancelacion"], ["paso", "factor"], ["paso", "resultado"], ["cierre", "resultado"]]) === "1122",
    reparto([["planteamiento", "cancelacion"], ["paso", "factor"], ["paso", "resultado"], ["cierre", "resultado"]]),
  );
  check(
    "una derivada término a término tampoco: planteamiento y desarrollo en el Ambiente 1, el cierre a la derecha",
    reparto([["planteamiento", "polinomio"], ["paso", "polinomio"], ["cierre", "resultado"]]) === "112",
    reparto([["planteamiento", "polinomio"], ["paso", "polinomio"], ["cierre", "resultado"]]),
  );
  check(
    "si el enunciado se transforma primero, la cadena entera baja por el panel de desarrollo",
    reparto([["planteamiento", "distributiva"], ["paso", "cancelacion"], ["paso", "factor"], ["cierre", "resultado"]]) === "1222" &&
      reparto([["planteamiento", null], ["paso", "cancelacion"], ["paso", "factor"]]) === "122",
  );
  check(
    "el MCM, los múltiplos y lo que sale de cada columna son cálculos auxiliares",
    esCalculoAuxiliar("MCM(2, 3): 2 × 3 = 6") && esCalculoAuxiliar("Múltiplos de 4: 4, 8, 12") &&
      esCalculoAuxiliar("unidades: 3 + 4 = 7") && !esCalculoAuxiliar("2x + 6 = 16"),
  );

  // SUB-NOT-04 — NINGÚN RÓTULO A MENOS DE 8 PX DE UNA CIFRA.
  check("el margen mínimo es el del informe: 8 px", MARGEN_ANOTACION === 8);
  {
    // "entre 6" sobre el denominador de 3/6: encima está el 3. Debe bajar.
    const numerador = { x: 100, y: 0, ancho: 20, alto: 24 };
    const denominador = { x: 100, y: 34, ancho: 20, alto: 24 };
    const { rect, lado } = colocarEtiqueta({ caja: denominador, ancho: 50, alto: 16, obstaculos: [numerador, denominador] });
    check(
      "«entre 6» no se pone encima del denominador (taparía el numerador): baja, a 8 px de toda cifra",
      lado === "abajo" && !seSolapan(rect, numerador, MARGEN_ANOTACION) && !seSolapan(rect, denominador, MARGEN_ANOTACION - 0.5),
      `${lado} ${JSON.stringify(rect)}`,
    );
  }
  check(
    "«llevo 1» se ancla ENCIMA de su llevada (la cifra pequeña de la columna de la izquierda)",
    escenaDeColumna("234 + 178", "e").focos.filter((f) => f.etiqueta === "llevo 1").map((f) => f.anclaEtiqueta).join(",") === "pz-llevada-1,pz-llevada-0",
    JSON.stringify(escenaDeColumna("234 + 178", "e").focos.map((f) => f.anclaEtiqueta)),
  );
  check(
    "la cuenta en columna deja aire entre la raya y el resultado, para su cápsula",
    /\\hline \\rule\{0pt\}\{1\.3em\}/.test(escenaDeColumna("24 + 17", "e").latex),
  );

  // La respuesta final: el ejercicio y su respuesta, sin repetir el desarrollo.
  const cierre = escenaDeCierre("1/2 + 1/3 = 3/6 + 2/6 = (3 + 2)/6 = 5/6", "c");
  check(
    "el cierre es «1/2 + 1/3 = [5/6]»: cabe en su mitad de la pizarra a 48 px",
    cierre.latex === "\\frac{1}{2} + \\frac{1}{3} = \\,\\htmlClass{pz-final}{\\boxed{\\frac{5}{6}}}",
    cierre.latex,
  );

  {
    // Y una suma NO se cierra en fila: "toda suma con números de dos o más
    // cifras en disposición vertical". La columna ya está resuelta en el
    // Ambiente 1; el cierre del Ambiente 2 es "Resultado: [412]".
    const suma = escenaDeCierre("234 + 178 = 412", "c");
    check(
      "el cierre de «234 + 178» es «Resultado: [412]», sin la suma escrita en fila",
      suma.latex === "\\htmlClass{pz-palabra pz-rotulo}{\\text{Resultado:}}\\;\\;\\htmlClass{pz-final}{\\boxed{412}}" &&
        suma.focos[0]?.final === true && suma.focos[0]?.narracion === "Resultado final: 412.",
      suma.latex,
    );
  }

  // SUB-MTH-05 — NI "/" NI "*": FRACCIONES DE VERDAD Y ×.
  check("(3 + 2)/6 → \\frac{3 + 2}{6}", planoALatex("(3 + 2)/6") === "\\frac{3 + 2}{6}", planoALatex("(3 + 2)/6"));
  check("3 * 2 → 3 \\times 2", planoALatex("3 * 2") === "3 \\times 2", planoALatex("3 * 2"));
  check("11/10 → \\frac{11}{10}", planoALatex("11/10") === "\\frac{11}{10}");
  {
    const l = rotulosALatex("234 [sumando] + 178 [sumando] = 412 [suma o total]") ?? "";
    let compone = true;
    try { katex.renderToString(l, { displayMode: true, throwOnError: true, trust: (c) => c.command === "\\htmlClass" }); } catch { compone = false; }
    check(
      "«234 [sumando] + 178 [sumando] = 412 [suma o total]» va EN COLUMNA, con su raya y cada nombre",
      /^\\begin\{array\}\{rrl\}/.test(l) && /\\hline & 412/.test(l) && (l.match(/pz-palabra/g) ?? []).length === 3 && compone,
      l,
    );
  }
  check(
    "la práctica «678 + 145 = ?» va en columna, con el «?» bajo la raya",
    /\\hline\s+&\s+&\s+&\s+\?/.test(columnaVertical({ a: 678, b: 145, operador: "+", resultado: 823 }, { conResultado: false, conIncognita: true }) ?? ""),
    columnaVertical({ a: 678, b: 145, operador: "+", resultado: 823 }, { conResultado: false, conIncognita: true }),
  );
  check(
    "en lo que dice el tutor, «2(x + 3) = 16» es UNA fórmula, no «2(» + fórmula + «) = 16»",
    JSON.stringify(separarProsaYMatematicas("Vamos a repartir el 2 en 2(x + 3) = 16.").filter((p) => p.tipo === "linea").map((p) => p.contenido)) === '["2(x + 3) = 16"]',
  );
  check(
    "y un paréntesis de prosa sigue siendo prosa",
    separarProsaYMatematicas("Sumamos por columnas (primero las unidades).").every((p) => p.tipo === "texto"),
  );
  check(
    "«unidades: 3 + 4 = 7» es una nota rotulada (rótulo en letra de pizarra, fórmula en KaTeX)",
    esNotaRotulada("unidades: 3 + 4 = 7") && esNotaRotulada("MCM(2, 3): 2 × 3 = 6") && !esNotaRotulada("2x + 6 = 16"),
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
    /pz-rev-2/.test(e.latex) && e.focos[2].clase === "pz-resultado",
  );
  // En una ECUACIÓN, lo repartido es la ecuación siguiente en su propio renglón
  // ("2x + 8 = 3x − 1"), no una cadena falsa "… = 3x − 1 = 2x + 8" (revisión
  // daa127d, punto 5).
  check("y es el correcto", e.focos[2].narracion === "Queda 2x + 8 = 3x - 1.", e.focos[2].narracion);

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

titulo("A00a1i. Revisión daa127d (2ª): fracción formal, cierre enmarcado, ejercicio fijo, visto final");

{
  const pizarraTsx = readFileSync(new URL("../components/leccion/pizarra.tsx", import.meta.url), "utf8");
  const panelTsx = readFileSync(new URL("../components/leccion/pizarra-animada.tsx", import.meta.url), "utf8");
  const notaTsx = readFileSync(new URL("../components/leccion/nota-pizarra.tsx", import.meta.url), "utf8");
  const aulaTsx = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  const estilos = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const reproductor = readFileSync(new URL("../public/pseLight.js", import.meta.url), "utf8");
  const leccion = (crudo) => processLSG(crudo, crudo.intencion, "prueba").lsg;
  const clasesDe = (latex) => [...String(latex ?? "").matchAll(/\\htmlClass\{([^}]*)\}/g)].flatMap(([, c]) => c.trim().split(/\s+/));

  // ── 1. LA FRACCIÓN, EN NOTACIÓN FORMAL: NUMERADOR ARRIBA, DENOMINADOR ABAJO ──
  //
  // "Evita usar la barra inclinada / en explicaciones de conceptos básicos; el
  // estudiante necesita ver la estructura de numerador arriba y denominador
  // abajo."
  {
    const latex = expresionFormalDeFraccion(1, 4);
    check(
      "la definición es UNA expresión: Numerador sobre Denominador = 1 sobre 4",
      latex === "\\dfrac{\\text{Numerador}}{\\text{Denominador}} = \\dfrac{1}{4}",
      latex,
    );
    const html = katex.renderToString(latex, { displayMode: true, throwOnError: true });
    const visible = html.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/, "");
    check(
      "compuesta por KaTeX con DOS rayas de fracción horizontales y ninguna barra inclinada",
      (visible.match(/class="mfrac"/g) ?? []).length === 2 &&
        (visible.match(/class="frac-line"/g) ?? []).length === 2 &&
        !/>\s*\/\s*</.test(visible) && /Numerador/.test(visible) && /Denominador/.test(visible),
    );
    check("con la fracción del dibujo: 3 de 8 se escribe 3 sobre 8", expresionFormalDeFraccion(3, 8).endsWith("\\dfrac{3}{8}"));
    // Después, el cliente pidió además "el mismo tamaño y tipo de letra" que las
    // notas: las PALABRAS van en letra de pizarra, con su raya horizontal en
    // HTML, y sólo "= 1/4" lo compone KaTeX en estilo de bloque.
    check(
      "la pizarra la compone con ese componente —y en ningún sitio queda «Numerador / Denominador:»—",
      /<FraccionFormal/.test(pizarraTsx) && !/Numerador \/ Denominador/.test(pizarraTsx) &&
        /export function FraccionFormal/.test(notaTsx) &&
        /<FraccionDePalabras arriba="Numerador" abajo="Denominador" \/>/.test(notaTsx) &&
        /\\\\dfrac\{\$\{n\}\}\{\$\{d\}\}/.test(notaTsx),
    );
    check(
      "y la pizarra de Concepto la pone bajo el gráfico circular, cuando ya se han dicho las dos palabras (la misma en pantalla y proyectada)",
      /diagrama === "FRACCIONES" && vistoNumerador && vistoDenominador && \(\s*<FraccionFormal/.test(pizarraTsx),
    );
  }

  // ── 2. NINGÚN EJERCICIO QUEDA INCONCLUSO: EL RESULTADO FINAL, ENMARCADO ────
  //
  // "En la suma de fracciones heterogéneas, el desarrollo se detiene en la suma
  // de numeradores equivalentes (6/10 + 5/10) y no entrega la respuesta final
  // consolidada (11/10). Ningún ejercicio puede quedar inconcluso; el último
  // paso debe mostrar siempre el resultado final enmarcado con su feedback de
  // conclusión."
  {
    const l = leccion(fraccionResueltaLSG({ nivel: "dificil", instancia: [3, 5, 1, 2] }));
    const dirs = l.modulos ? l.modulos.flatMap((m) => m.directivas) : l.directivas;
    const iPractica = dirs.findIndex((d) => d.tipo === "pizarra" && /= \?$/.test(d.contenido));
    const escritas = dirs.slice(0, iPractica).filter((d) => d.tipo === "pizarra");
    const ultima = escritas.at(-1);
    check(
      "3/5 + 1/2: el último paso del desarrollo es la respuesta final consolidada, 11/10",
      ultima?.contenido === "3/5 + 1/2 = 6/10 + 5/10 = (6 + 5)/10 = 11/10",
      ultima?.contenido,
    );
    check(
      "etiquetada como CIERRE (tipo resultado) y narrada con su conclusión",
      ultima?.operacion?.tipo === "resultado" && ultima.operacion.terminosFoco[0] === "11/10" &&
        ultima.narracion === "¡Y listo! Resultado final: 11/10." &&
        dirs.slice(0, iPractica).some((d) => d.tipo === "hablar" && d.texto === "¡Y listo! Resultado final: 11/10."),
      JSON.stringify(ultima),
    );
    const escena = escenaDeLinea({ latex: ultima.contenido, operacion: ultima.operacion, narracion: ultima.narracion }, "c");
    check(
      "su escena ENMARCA la respuesta —y sólo la respuesta—: \\boxed dentro de la marca pz-final",
      escena.clase === "cierre" && escena.origen === "etiqueta" &&
        /\\htmlClass\{pz-final\}\{\\boxed\{\\frac\{11\}\{10\}\}\}$/.test(escena.latex) &&
        escena.focos.length === 1 && escena.focos[0].final === true && escena.focos[0].tipo === "resultado",
      escena.latex,
    );
    const html = katex.renderToString(escena.latex, { displayMode: true, throwOnError: true, trust: (c) => c.command === "\\htmlClass" });
    check("y KaTeX la compone con su marco", /class="enclosing pz-final"/.test(html) && /class="stretchy fbox"/.test(html));
  }
  {
    // Todos los motores y todos los niveles de fracciones: al sonar la frase de
    // cierre, la pizarra animada está en una respuesta final (marco + visto).
    const casos = [
      ["suma", sumaResueltaLSG({ concepto: true })],
      ["resta", restaResueltaLSG({ concepto: true })],
      ["multiplicación", multiplicacionResueltaLSG({ concepto: true })],
      ["división", divisionResueltaLSG({ concepto: true })],
      ["fracciones (normal)", fraccionResueltaLSG({ concepto: true, nivel: "normal" })],
      ["fracciones (difícil)", fraccionResueltaLSG({ concepto: true, nivel: "dificil" })],
      ["fracciones (experto)", fraccionResueltaLSG({ concepto: true, nivel: "experto" })],
      ["fracciones 2/6 + 2/6 (se simplifica)", fraccionResueltaLSG({ nivel: "normal", instancia: [2, 2, 6] })],
      ["ecuaciones", linealResueltaLSG({ concepto: true })],
      ["ecuación con paréntesis 2(x + 3) = 16", linealResueltaLSG({ nivel: "normal", instancia: "2(x + 3) = 16" })],
      ["derivadas", derivadaResueltaLSG({ concepto: true })],
      ["derivada de un polinomio", derivadaResueltaLSG({ nivel: "dificil" })],
      ["factorización", factorizacionResueltaLSG({ concepto: true })],
    ];
    const sinCierre = [];
    for (const [nombre, crudo] of casos) {
      const ev = simularLeccion(leccion(crudo));
      const iPregunta = ev.findIndex((e) => e.d.tipo === "preguntar");
      const antes = ev.slice(0, iPregunta < 0 ? ev.length : iPregunta);
      const frase = [...antes].reverse().find((e) => e.d.tipo === "hablar" && /resultado final/i.test(e.d.texto));
      const foco = frase?.escenas[frase.escena]?.focos[frase.foco];
      if (!frase || !foco?.final) sinCierre.push(`${nombre}: ${frase ? `${frase.escenas[frase.escena]?.texto} foco ${frase.foco}` : "sin frase de cierre"}`);
    }
    check(
      "en TODOS los motores, al decir «Resultado final» la pizarra animada está en la respuesta final enmarcada",
      sinCierre.length === 0,
      sinCierre.join(" | "),
    );
  }
  {
    // «No entendí este paso» en la práctica: el desglose llega también al final
    // —su resultado enmarcado— y DESPUÉS plantea un ejercicio nuevo (segunda
    // ronda del cliente: volver a preguntar el mismo, con la respuesta a la
    // vista, era darle la solución).
    for (const [ej, final, tema] of [
      ["3/5 + 1/2 = ?", "3/5 + 1/2 = 6/10 + 5/10 = (6 + 5)/10 = 11/10", ""],
      ["2(x + 3) = 16", "x = 5", ""],
      ["234 + 178 = ?", "234 + 178 = 412", ""],
      ["3x⁴ - 2x²", "derivada de 3x⁴ - 2x² = 12x³ - 4x", "derivadas"],
    ]) {
      const d = leccion(desgloseDelEjercicioLSG({ ejercicio: ej, conResultado: false, tema }));
      const pizarras = d.directivas.filter((x) => x.tipo === "pizarra");
      const cierre = pizarras.filter((x) => x.operacion?.tipo === "resultado").at(-1);
      const tras = d.directivas.slice(d.directivas.indexOf(cierre) + 1);
      const nueva = tras.find((x) => x.tipo === "pizarra");
      const pregunta = tras.find((x) => x.tipo === "preguntar");
      check(
        `«No entendí» en la práctica "${ej}": llega a su resultado final enmarcado`,
        cierre?.contenido === final,
        cierre?.contenido,
      );
      check(
        `…y después plantea OTRO ejercicio con su pregunta ("${ej}")`,
        Boolean(nueva && pregunta) && nueva.contenido !== ej && pizarras.at(-1) === nueva && tras.indexOf(pregunta) > tras.indexOf(nueva),
        `${nueva?.contenido} / ${pregunta?.texto}`,
      );
    }
  }
  {
    // Tras el desglose de la práctica se le devuelve la pregunta. Su cierre
    // —etiquetado— queda justo delante de ella y NO puede pasar por enunciado:
    // se llevaría la tarjeta y vaciaría el desarrollo recién explicado (lo cazó
    // la batería de Chrome).
    const crudo = desgloseDelEjercicioLSG({ ejercicio: "1/7 + 5/7 = ?", conResultado: false });
    const desglose = leccion(crudo);
    const reanudada = reanudarTrasAclaracion(desglose, {
      faseActual: "practica",
      pregunta: preguntaFinal(desglose),
      transicion: null,
    });
    const piden = enunciadosParaResolver(reanudada);
    check(
      "tras «No entendí» en la práctica, ninguna línea del desglose —tampoco su cierre— pasa por enunciado: sólo el ejercicio nuevo",
      piden.size === 1 && piden.has(crudo.nuevaPractica.enunciado),
      JSON.stringify([...piden]),
    );
    check(
      "y un enunciado sin etiqueta delante de su pregunta sigue contando como tal",
      enunciadosParaResolver({ directivas: [{ tipo: "pizarra", contenido: "1/7 + 5/7 = ?" }, { tipo: "preguntar", texto: "¿?" }] }).has("1/7 + 5/7 = ?"),
    );
  }
  {
    // EL CIERRE DE LA PRÁCTICA, en cuanto queda resuelta: la línea comprobada.
    const casos = [
      [{ enunciado: "3/5 + 1/2 = ?", respuesta: "11/10" }, "3/5 + 1/2 = 6/10 + 5/10 = 11/10"],
      [{ enunciado: "2/6 + 3/6 = ?", respuesta: "5/6" }, "2/6 + 3/6 = 5/6"],
      [{ enunciado: "2/6 + 2/6 = ?", respuesta: "2/3" }, "2/6 + 2/6 = 4/6 = 2/3"],
      [{ enunciado: "Ejercicio 1:  1/4 + 1/6", respuesta: "5/12" }, "1/4 + 1/6 = 3/12 + 2/12 = 5/12"],
      [{ enunciado: "3x + 2 = 11", respuesta: "3" }, "x = 3"],
      [{ enunciado: "2(x + 4) = 3x - 1", respuesta: "9" }, "x = 9"],
      [{ enunciado: "5x²", respuesta: "10x", pregunta: "¿Cuál es la derivada de 5x²?" }, "derivada de 5x² = 10x"],
      [{ enunciado: "x² - 9", respuesta: "(x - 3)(x + 3)", pregunta: "¿Cómo se factoriza x² - 9? Escríbelo como producto." }, "x² - 9 = (x - 3)(x + 3)"],
      [{ enunciado: "12 × 4 = ?", respuesta: "48" }, "12 × 4 = 48"],
      [{ enunciado: "84 ÷ 4 = ?", respuesta: "21" }, "84 ÷ 4 = 21"],
      [{ enunciado: "2411 + 2457 = ?", respuesta: "4868" }, "2411 + 2457 = 4868"],
    ];
    const mal = [];
    for (const [entrada, esperado] of casos) {
      const c = cierreDelDesarrollo({ lineas: [], ...entrada });
      const e = c ? escenaDeLinea({ latex: c.texto, operacion: c.operacion, narracion: c.narracion }, "c") : null;
      if (c?.texto !== esperado || c.operacion.tipo !== "resultado" || !e?.focos.at(-1)?.final) mal.push(`${entrada.enunciado} → ${c?.texto}`);
    }
    check(
      "la práctica resuelta se cierra con su línea comprobada —fracciones consolidadas, x = …, derivada, factorización, cuentas— y enmarcada",
      mal.length === 0,
      mal.join(" | "),
    );
    const cortada = cierreDelDesarrollo({ enunciado: "3/5 + 1/2 = ?", lineas: ["6/10 + 5/10 = ?"], respuesta: "11/10" });
    check(
      "una línea que se quedó en «6/10 + 5/10 = ?» se completa con el 11/10",
      cortada?.accion === "completar" && cortada.texto === "6/10 + 5/10 = 11/10",
      JSON.stringify(cortada),
    );
    // El feedback de conclusión lleva a la pizarra al marco: acertando y fallando.
    const c = cierreDelDesarrollo({ enunciado: "3/5 + 1/2 = ?", lineas: [], respuesta: "11/10" });
    const guion = guionDeLeccion([{ latex: c.texto, operacion: c.operacion, narracion: c.narracion }]);
    const alAcertar = situacionParaNarracion(guion, "¡Muy bien! 🎉 Respuesta correcta. Resultado final: 11/10.", 0, -1);
    const alFallar = situacionParaNarracion(guion, "No te preocupes, así se aprende. Mira la pizarra: el resultado final es 11/10. Repasa cómo se llega hasta él y lo intentamos con otro. ¡Tú puedes!", 0, -1);
    check(
      "el feedback que nombra el resultado final coloca la pizarra en el marco, acierte o no",
      alAcertar?.foco === 0 && alFallar?.foco === 0 && guion[0].focos[0].final === true,
      `${JSON.stringify(alAcertar)} ${JSON.stringify(alFallar)}`,
    );
  }
  {
    // EL REPRODUCTOR DE VERDAD: cierra el ejercicio al resolverlo, antes del
    // feedback, también cuando se agotan los intentos.
    const probar = async (respuestas) => {
      const registro = [];
      const cola = [...respuestas];
      const ui = {
        setModule() {}, highlightBoard() {}, clearBoard() {}, setCaption() {}, onStep() {}, onProgress() {},
        setControls() {}, writeBoard() {}, writeBoardExplain() {},
        askAnswer: async () => cola.shift() ?? "0",
        showFeedback: (ok, msg) => registro.push({ tipo: "feedback", ok, msg }),
        onExerciseResolved: (r) => registro.push({ tipo: "cierre", ...r }),
        onLessonEnd: (r) => registro.push({ tipo: "fin", ...r }),
      };
      const pse = new PSELight({ avatar: { setState() {}, setSpeaking() {} }, tts: { speak: async () => {}, cancel() {} }, ui });
      await pse.play({ escena: "t", intencion: "practicar", directivas: [
        { tipo: "pizarra", contenido: "3/5 + 1/2 = ?", id: 1 },
        { tipo: "preguntar", texto: "¿Cuánto es 3/5 + 1/2?", respuesta: "11/10", id: 2 },
      ] });
      return registro;
    };
    const bien = await probar(["11/10"]);
    const iCierre = bien.findIndex((r) => r.tipo === "cierre");
    const iFeedback = bien.findIndex((r) => r.tipo === "feedback");
    check(
      "al acertar: primero se cierra el ejercicio en la pizarra y después el feedback, que nombra el resultado final",
      iCierre >= 0 && iCierre < iFeedback && bien[iCierre].acerto === true && bien[iCierre].respuesta === "11/10" &&
        /Resultado final: 11\/10\.$/.test(bien[iFeedback].msg),
      JSON.stringify(bien),
    );
    const mal = await probar(["1/2", "4/7", "9/10"]);
    const cierres = mal.filter((r) => r.tipo === "cierre");
    const ultimo = mal.filter((r) => r.tipo === "feedback").at(-1);
    check(
      "con los tres intentos agotados el ejercicio TAMBIÉN se cierra: la pizarra lo resuelve y el tutor lo dice",
      cierres.length === 1 && cierres[0].acerto === false && /resultado final es 11\/10/.test(ultimo?.msg ?? "") &&
        mal.findIndex((r) => r.tipo === "cierre") < mal.lastIndexOf(ultimo),
      JSON.stringify(mal),
    );
    check(
      "mientras quedan intentos, la respuesta NO se revela: las dos primeras correcciones sólo dan pistas",
      mal.filter((r) => r.tipo === "feedback").slice(0, 2).every((r) => !/11\/10/.test(r.msg)),
    );
    check(
      "y al terminar la lección el aula recibe la respuesta, para cerrar por si acaso",
      mal.at(-1)?.tipo === "fin" && mal.at(-1).respuesta === "11/10",
    );
    check(
      "el aula escribe el cierre al resolverse el ejercicio, y la línea de cierre nunca se descarta como replanteo",
      /onExerciseResolved: \(\{ respuesta, pregunta: textoPregunta \}\) =>/.test(aulaTsx) &&
        /const esCierre = operacion\?\.tipo === "resultado";/.test(aulaTsx) &&
        /!esCierre &&\s*ejercicioRef\.current != null/.test(aulaTsx),
    );
    check(
      "mientras el tutor PREGUNTA, la pizarra no sigue a la voz: la pregunta no la rebobina al primer paso",
      /narracion=\{estadoAvatar === "preguntando" \? null : subtitulo\}/.test(aulaTsx),
    );
    check(
      "y el desglose de la práctica —que ahora llega al final— se anima como el del ejemplo",
      /esAclaracion\.current =\s*Boolean\(opciones\.soloExplicacion\) && !desgloseDelEjemplo && !desgloseDeLaPractica;/.test(aulaTsx),
    );
    check(
      "la pizarra clásica también la enseña enmarcada, con su rótulo «Resultado final»",
      /const esCierre = linea\.operacion\?\.tipo === "resultado"/.test(pizarraTsx) && /Resultado final\s*<\/span>/.test(pizarraTsx) &&
        /\.pz-final \.fbox \{[^}]*border-color/.test(estilos) && /\.pz-animada \.pz-final \.fbox \{[^}]*transparent/.test(estilos),
    );
    check("y el reproductor no guarda un «NO revelamos» tras agotar los intentos", !/NO revelamos el número/.test(reproductor));
  }

  // ── 3. EN PROYECCIÓN, EL EJERCICIO ORIGINAL FIJO ARRIBA ─────────────────────
  //
  // "Mantén fijado en la parte superior el ejercicio original limpio
  // (2(x + 3) = 16), y renderiza abajo el paso del desarrollo activo con la
  // distributiva."
  // Con el informe (SUB-PIZ-02) el encabezado es de LA pizarra —"Ejercicio:" y
  // el enunciado—, la misma en pantalla y proyectada: ya no es un añadido del
  // modo proyección.
  check(
    "la pizarra fija arriba «Ejercicio:» y el enunciado de la tarjeta, en las dos vistas",
    /\{planteaEjercicio && \(\s*<EncabezadoEjercicio texto=\{ejercicio\?\.texto \?\? null\} \/>/.test(pizarraTsx) &&
      /function EncabezadoEjercicio/.test(pizarraTsx) && /: "Ejercicio:"/.test(pizarraTsx),
  );
  check(
    "limpio —compuesto tal cual, sin marcas ni piezas por destapar— y pegado arriba aunque la pizarra se desplace",
    /function EncabezadoEjercicio[\s\S]{0,1200}notacionFormal\(enunciado\) \?\? \(pareceMatematica\(enunciado\) \? planoALatex\(enunciado\) : null\)/.test(pizarraTsx) &&
      /\.pz-encabezado-ejercicio \{[^}]*position: sticky;[^}]*top: 0;/.test(estilos),
  );
  check(
    "y el panel ya no tiene un enunciado propio que pudiera diferir del de la pizarra",
    !/EnunciadoFijo/.test(panelTsx) && !/enunciadoFijo/.test(panelTsx),
  );

  // ── 4. EL VISTO VERDE, SÓLO EN LA RESPUESTA FINAL ───────────────────────────
  //
  // "En el paso 2x + 6 = 16 − 6, aparece un check verde (✓) flotando sobre la x
  // … Retira ese check verde. El foco debe estar únicamente en los términos que
  // se restan (+6 y −6)."
  {
    const paso = escenaDeLinea({ latex: "2x + 6 = 16", operacion: { tipo: "cancelacion", terminosFoco: ["6"] } }, "p");
    // LOS PASOS NO SE SOBRESCRIBEN: SE APILAN (quinta ronda del cliente). La
    // línea del enunciado sólo ESCRIBE la resta en los dos lados; el tachado se
    // dibuja en el renglón siguiente, que el motor escribe aparte, y así al
    // terminar quedan los dos a la vista.
    const tachada = escenaDeLinea({ latex: "2x + 6 - 6 = 16 - 6", operacion: { tipo: "cancelacion", terminosFoco: ["6"] } }, "p2");
    check(
      "sobre 2x + 6 = 16 se ESCRIBE la resta y nada más: el tachado no se dibuja aquí",
      paso.focos.length === 1 && paso.focos[0].tipo === "caja" && paso.focos[0].clase === "pz-uniforme",
      JSON.stringify(paso.focos),
    );
    check(
      "y el renglón siguiente —2x + 6 − 6 = 16 − 6— es el que tacha el par de opuestos",
      tachada.focos.length === 1 && tachada.focos[0].tipo === "tachado" &&
        JSON.stringify(tachada.focos[0].piezas) === JSON.stringify(["pz-cancela-termino", "pz-cancela-opuesto"]),
      JSON.stringify(tachada.focos),
    );
    check(
      "ese renglón se escribe entero, sin nada que destapar: es el registro de lo hecho",
      !/pz-rev-/.test(tachada.latex) && /pz-cancela-termino/.test(tachada.latex) &&
        /pz-cancela-opuesto/.test(tachada.latex) && /= 16 - 6$/.test(tachada.latex),
      tachada.latex,
    );
    check(
      "ni marca de resultado, ni visto, ni coeficiente encendido junto a la x, ni la solución adelantada",
      !paso.focos.some((f) => f.tipo === "resultado" || f.final) &&
        !clasesDe(paso.latex).includes("pz-coef-despeje") && !/Rightarrow/.test(paso.latex),
      paso.latex,
    );
    check(
      "el visto se dibuja SÓLO en una respuesta final; un resultado intermedio lleva el doble subrayado y nada más",
      /\{foco\.final \? \(\s*<path[\s\S]{0,200}className="pz-trazo pz-visto"/.test(panelTsx) &&
        /\{foco\.final \? \(\s*<rect[\s\S]{0,300}className="pz-trazo pz-marco-final"/.test(panelTsx),
    );
    // En toda la lección de 2(x + 3) = 16, la única respuesta final es el cierre.
    const ev = simularLeccion(leccion(linealResueltaLSG({ nivel: "normal", instancia: "2(x + 3) = 16" })));
    const escenasFinales = [...new Set(ev.flatMap((e) => e.escenas).filter((s) => s.focos.some((f) => f.final)).map((s) => s.texto))];
    check(
      "en la lección de 2(x + 3) = 16 sólo la línea de cierre, x = 5, lleva respuesta final",
      escenasFinales.length === 1 && escenasFinales[0] === "x = 5",
      JSON.stringify(escenasFinales),
    );
    // LA SECUENCIA CON EL AUDIO, QUE ES LO QUE PIDIÓ EL CLIENTE: mientras el
    // tutor dice "restamos 6 en ambos lados" la pizarra ESCRIBE la resta (sin
    // tachar), y sólo al decir "a la izquierda se cancela +6 con -6" aparece el
    // tachado rojo. Dos frases, dos tiempos, en ese orden.
    const iResta = ev.findIndex((e) => e.d.tipo === "hablar" && /restamos 6 en ambos lados/.test(e.d.texto));
    const enResta = ev[iResta];
    const focoResta = enResta?.escenas[enResta.escena]?.focos[enResta.foco];
    check(
      "cuando el tutor dice «restamos 6 en ambos lados», la pizarra ESCRIBE la resta y NO tacha nada",
      enResta?.escenas[enResta.escena]?.texto === "2x + 6 = 16" && focoResta?.tipo === "caja" &&
        focoResta?.clase === "pz-uniforme",
      `${enResta?.escenas[enResta.escena]?.texto} foco ${enResta?.foco} (${focoResta?.tipo}/${focoResta?.clase})`,
    );
    const iCancela = ev.findIndex((e) => e.d.tipo === "hablar" && /A la izquierda se cancela \+6 con -6/.test(e.d.texto));
    const enCancela = ev[iCancela];
    const focoCancela = enCancela?.escenas[enCancela.escena]?.focos[enCancela.foco];
    check(
      "y al decir «a la izquierda se cancela +6 con −6» el tachado se dibuja en el RENGLÓN NUEVO, sin borrar el anterior",
      iCancela > iResta && enCancela?.escenas[enCancela.escena]?.texto === "2x + 6 - 6 = 16 - 6" &&
        focoCancela?.tipo === "tachado",
      `${enCancela?.escenas[enCancela.escena]?.texto} foco ${enCancela?.foco} (${focoCancela?.tipo})`,
    );
    check(
      "los dos renglones existen en el guion, en orden: primero la resta escrita, debajo la cancelada",
      (() => {
        const escritos = ev.filter((e) => e.d.tipo === "pizarra" && e.d.accion === "escribir").map((e) => e.d.contenido);
        const i1 = escritos.indexOf("2x + 6 = 16");
        const i2 = escritos.indexOf("2x + 6 - 6 = 16 - 6");
        return i1 >= 0 && i2 === i1 + 1;
      })(),
      ev.filter((e) => e.d.tipo === "pizarra" && e.d.accion === "escribir").map((e) => e.d.contenido).join(" · "),
    );
    check(
      "la frase que tacha es la MISMA en el motor y en la pizarra: si no, se tacharía a destiempo",
      locucionCancelacion("2x + 6 = 16") ===
        escenaDeDespeje("2x + 6 = 16", "e").focos.find((f) => f.tipo === "tachado")?.narracion,
      `${locucionCancelacion("2x + 6 = 16")} ≠ ${escenaDeDespeje("2x + 6 = 16", "e").focos.find((f) => f.tipo === "tachado")?.narracion}`,
    );
    check(
      "y en ningún momento anterior la pizarra estuvo en el tachado de esa línea",
      ev.slice(0, iCancela).every((e) => {
        const f = e.escenas?.[e.escena]?.focos?.[e.foco];
        return !(e.escenas?.[e.escena]?.texto === "2x + 6 = 16" && f?.tipo === "tachado");
      }),
    );
    const iDivide = ev.findIndex((e) => e.d.tipo === "hablar" && /Dividimos ambos lados entre 2/.test(e.d.texto));
    const enDivide = ev[iDivide];
    check(
      "la división entre 2 se señala en SU línea, 2x = 10, con una caja —no con el visto—",
      enDivide?.escenas[enDivide.escena]?.texto === "2x = 10" &&
        enDivide.escenas[enDivide.escena].focos[enDivide.foco]?.tipo === "caja",
      `${enDivide?.escenas[enDivide.escena]?.texto} foco ${enDivide?.foco}`,
    );
    const poli = escenaDePolinomio("3x⁴ - 2x²", "p");
    check(
      "señalar un coeficiente o un exponente tampoco es un resultado: van en caja",
      poli.focos.filter((f) => /pz-(coef|exp)/.test(f.clase)).every((f) => f.tipo === "caja"),
    );
  }

  // ── 5. LA ESCALA TIPOGRÁFICA EN PROYECCIÓN ──────────────────────────────────
  //
  // "«Propiedad uniforme de la suma: lo mismo a los dos lados» sigue en tamaño
  // diminuto (text-sm). Sube el tamaño de estas explicaciones en proyección a un
  // formato visible para aula (text-2xl o text-3xl), centrado y con fuente
  // clara."
  // El informe lo afinó después: notas de 24 px como mínimo, ALINEADAS A LA
  // IZQUIERDA ("definiciones amontonadas al centro", OBS-10), no centradas.
  check(
    "una nota proyectada nunca baja de 24 px, en blanco y alineada a la izquierda",
    /\.modo-proyeccion \.pz-nota \{[^}]*font-size: clamp\(1\.6rem,[^}]*color: hsl\(0 0% 100%\)/.test(estilos) &&
      /^\.pz-nota \{[^}]*align-items: flex-start;[^}]*text-align: left;/m.test(estilos),
  );
  check(
    "y lo que explica el tutor bajo cada paso, al menos text-2xl",
    /\.modo-proyeccion \.pz-pie \{[^}]*font-size: clamp\(1\.5rem,/.test(estilos),
  );
  {
    const lin = leccion(linealResueltaLSG({ concepto: true, nivel: "normal" }));
    const regla = lin.modulos.find((m) => m.id === "regla").directivas.find((d) => d.tipo === "pizarra")?.contenido ?? "";
    check(
      "la regla de ecuaciones se proyecta como NOTA de pizarra —rótulo y cuerpo—, no como fórmula",
      escenaEstatica(regla, "r").latex === null && partirNota(regla)[0]?.rotulo === "Propiedad uniforme de la suma:",
      regla,
    );
  }
}

titulo("A00a1h. Revisión daa127d: lo que dice = lo que muestra, «No entendí» y la tarjeta");

{
  const simular = simularLeccion;
  const leccion = (crudo) => processLSG(crudo, crudo.intencion, "prueba").lsg;

  // 3. EL FOTOGRAMA DE LOS NUMERADORES YA NO DURA "UNOS MILISEGUNDOS".
  //
  // Se exige, para cada paso animado de la lección de fracciones y en los tres
  // niveles: que se escriba ANTES de su primera frase, que CADA foco tenga su
  // frase —y la pizarra esté en ese foco mientras suena—, y que detrás de cada
  // frase haya al menos un segundo de pausa de lectura.
  const casosFraccion = [
    fraccionResueltaLSG({ concepto: true, nivel: "normal" }),
    fraccionResueltaLSG({ concepto: true, nivel: "dificil" }),
    fraccionResueltaLSG({ concepto: true, nivel: "experto" }),
    fraccionResueltaLSG({ nivel: "normal", instancia: [1, 2, 1, 6] }),
    fraccionResueltaLSG({ nivel: "normal", instancia: [2, 3, 10] }),
  ].map(leccion);
  let pasosAnimados = 0;
  let focosNarrados = 0;
  let focosTotales = 0;
  let escritosAntes = 0;
  let conPausa = 0;
  let frasesDePaso = 0;
  let quedaEnElResultado = 0;
  for (const l of casosFraccion) {
    const ev = simular(l);
    ev.forEach((e, i) => {
      if (e.d.tipo !== "pizarra" || !e.d.operacion) return;
      pasosAnimados++;
      const escena = e.escenas.find((s) => s.texto === e.d.contenido);
      if (!escena) return;
      const indice = e.escenas.indexOf(escena);
      // La primera frase que se oye después: el paso ya estaba escrito.
      const siguienteFrase = ev.slice(i + 1).find((x) => x.d.tipo === "hablar");
      if (siguienteFrase && siguienteFrase.escena === indice) escritosAntes++;
      // Cada foco, visitado mientras suena una frase.
      focosTotales += escena.focos.length;
      const vistos = new Set(ev.slice(i + 1).filter((x) => x.d.tipo === "hablar" && x.escena === indice && x.foco >= 0).map((x) => x.foco));
      focosNarrados += vistos.size;
    });
    ev.forEach((e, i) => {
      if (e.d.tipo !== "hablar" || !e.escenas[e.escena] || e.foco < 0) return;
      frasesDePaso++;
      if (ev[i + 1]?.d.tipo === "esperar" && ev[i + 1].d.segundos >= 1) conPausa++;
    });
    const cierre = ev.find((e) => e.d.tipo === "hablar" && /^¡Y listo!/.test(e.d.texto));
    if (cierre) {
      const ultima = cierre.escenas.length - 1;
      const escena = cierre.escenas[ultima];
      if (cierre.escena === ultima && escena?.focos[cierre.foco]?.tipo === "resultado") quedaEnElResultado++;
    }
  }
  check(
    "cada paso animado de fracciones se escribe ANTES de que el tutor lo cuente",
    pasosAnimados > 0 && escritosAntes === pasosAnimados,
    `${escritosAntes}/${pasosAnimados}`,
  );
  check(
    "y CADA uno de sus focos se ve mientras suena su propia frase —ninguno se salta—",
    focosTotales > 0 && focosNarrados === focosTotales,
    `${focosNarrados}/${focosTotales}`,
  );
  check(
    "tras cada frase de un paso, una pausa de lectura de al menos 1 s antes de pasar a lo siguiente",
    frasesDePaso > 0 && conPausa === frasesDePaso,
    `${conPausa}/${frasesDePaso}`,
  );
  check(
    'al cerrar ("¡Y listo!…") la pizarra se queda en el resultado, no vuelve al principio',
    quedaEnElResultado === casosFraccion.length,
    `${quedaEnElResultado}/${casosFraccion.length}`,
  );
  {
    // El caso exacto de la captura: "Sumamos los numeradores: 3 + 2 = 5" con
    // su fotograma a la vista mientras suena y después.
    const ev = simular(casosFraccion[1]);
    const i = ev.findIndex((e) => e.d.tipo === "hablar" && /Sumamos los numeradores: 3 \+ 2 = 5/.test(e.d.texto));
    const escena = ev[i]?.escenas[ev[i]?.escena];
    check(
      '"Sumamos los numeradores: 3 + 2 = 5" suena con el recuadro sobre los numeradores de 3/6 + 2/6',
      escena?.texto === "3/6 + 2/6 = 5/6" && escena.focos[ev[i].foco]?.etiqueta === "numeradores",
      `${escena?.texto} foco ${ev[i]?.foco}`,
    );
    check(
      "y detrás hay una pausa de lectura, sin cambiar de fotograma",
      ev[i + 1]?.d.tipo === "esperar" && ev[i + 1].d.lectura === true && ev[i + 1].foco === ev[i].foco,
    );
  }
  check(
    "la pausa de lectura no pone al avatar a «pensar»: se queda como estaba",
    /if \(!d\.lectura\) this\.avatar\.setState\("pensando"\)/.test(readFileSync(new URL("../public/pseLight.js", import.meta.url), "utf8")),
  );
  {
    // La regla genérica del PRE Light, para cualquier lección —también las del
    // modelo—: el paso que se narra justo antes de escribirse, se escribe antes;
    // y tras narrarlo, pausa.
    const narr = "Dividimos arriba y abajo entre 2.";
    const crudo = [
      { tipo: "hablar", texto: narr },
      { tipo: "pizarra", accion: "escribir", contenido: "4/6 = 2/3", operacion: { tipo: "cancelacion", terminosFoco: ["4/6"] }, narracion: narr },
      { tipo: "hablar", texto: "Siguiente." },
    ];
    const r = sincronizarPasosConVoz(crudo);
    check(
      "regla genérica: la pizarra pasa delante de la frase que la narra",
      r[0].tipo === "pizarra" && r[1].tipo === "hablar" && r[1].texto === narr,
    );
    check(
      "y detrás de esa frase se inserta una pausa de lectura de 1 s",
      r[2]?.tipo === "esperar" && r[2].segundos === 1 && r[2].lectura === true && r[3]?.texto === "Siguiente.",
    );
    const sinEtiqueta = sincronizarPasosConVoz([{ tipo: "hablar", texto: "Hola." }, { tipo: "pizarra", accion: "escribir", contenido: "2 + 2" }]);
    check("una línea sin etiqueta no se toca", sinEtiqueta[0].tipo === "hablar" && sinEtiqueta.length === 2);
  }

  // CONCEPTO Y REGLAS: cada línea se escribe cuando EMPIEZA la frase que la
  // explica ("no sincroniza lo que dice con lo que muestra en pantalla").
  {
    const l = leccion(fraccionResueltaLSG({ concepto: true, nivel: "dificil", evitar: "cuántas partes tomo" }));
    const concepto = l.modulos.find((m) => m.id === "concepto").directivas.filter((d) => d.tipo !== "avatar");
    const pares = [];
    for (let i = 0; i < concepto.length - 1; i++) if (concepto[i].tipo === "pizarra") pares.push([concepto[i], concepto[i + 1]]);
    check(
      "en Concepto, cada línea de la pizarra va inmediatamente ANTES de la frase que la explica",
      pares.length >= 4 && pares.every(([p, h]) => h.tipo === "hablar") &&
        /^Numerador:/.test(pares[0][0].contenido) && /ARRIBA.*numerador/.test(pares[0][1].texto) &&
        /^Denominador:/.test(pares[1][0].contenido) && /ABAJO.*denominador/.test(pares[1][1].texto),
      JSON.stringify(pares.map(([p, h]) => [p.contenido, h.texto?.slice(0, 30)])),
    );
    const regla = l.modulos.find((m) => m.id === "regla").directivas;
    const escritas = regla.filter((d) => d.tipo === "pizarra").map((d) => d.contenido);
    const dichoTras = (linea) => regla[regla.findIndex((d) => d.contenido === linea) + 1]?.texto ?? "";
    check(
      "en Reglas de fracciones se escriben las TRES propiedades del catálogo",
      escritas.length === 3 && /^Fracciones equivalentes/.test(escritas[0]) &&
        /^Igual denominador/.test(escritas[1]) && /^Distinto denominador/.test(escritas[2]),
      JSON.stringify(escritas),
    );
    check(
      "y cada una se CUENTA mientras está escrita: la equivalencia, la suma con igual denominador y la de distinto",
      /EQUIVALENTES/.test(dichoTras(escritas[0])) && /mismo denominador/.test(dichoTras(escritas[1])) &&
        /distintos/.test(dichoTras(escritas[2])),
    );
    check(
      'ya no se oye "cómo se SUMAN" mientras la pizarra enseña "Fracciones equivalentes"',
      !/SUMARLAS/.test(dichoTras(escritas[0])),
    );
    const lin = leccion(linealResueltaLSG({ concepto: true, nivel: "normal" }));
    const reglaLin = lin.modulos.find((m) => m.id === "regla").directivas;
    check(
      "en ecuaciones, la frase de Reglas NOMBRA la propiedad que está escrita en la pizarra",
      /^Propiedad uniforme/.test(reglaLin.find((d) => d.tipo === "pizarra")?.contenido ?? "") &&
        /PROPIEDAD UNIFORME/.test(reglaLin.find((d) => d.tipo === "hablar")?.texto ?? ""),
    );
  }

  // 1. EL DESARROLLO RESUELVE EL EJERCICIO PLANTEADO, CON SU RESPUESTA FINAL.
  {
    const l = leccion(fraccionResueltaLSG({ concepto: true, nivel: "dificil" }));
    const ejemplo = l.modulos.find((m) => m.id === "ejemplo_guiado").directivas;
    check(
      'el ejemplo "1/2 + 1/3" termina con la respuesta consolidada: 1/2 + 1/3 = 3/6 + 2/6 = (3 + 2)/6 = 5/6',
      ejemplo.some((d) => d.tipo === "pizarra" && d.contenido === "1/2 + 1/3 = 3/6 + 2/6 = (3 + 2)/6 = 5/6"),
    );
  }

  // 1 + 2. «NO ENTENDÍ ESTE PASO»: EL MISMO EJERCICIO, DESGLOSADO.
  {
    const des = leccion(desgloseDelEjercicioLSG({ ejercicio: "1/2 + 1/3", paso: "3/6 + 2/6 = 5/6" }));
    const escrito = des.directivas.filter((d) => d.tipo === "pizarra").map((d) => d.contenido);
    const dicho = des.directivas.filter((d) => d.tipo === "hablar").map((d) => d.texto).join(" ");
    const ajenas = escrito.filter((c) => (c.match(/\d+\s*\/\s*\d+/g) ?? []).some((f) => !["1/2", "1/3", "3/6", "2/6", "5/6"].includes(f.replace(/\s+/g, ""))));
    check(
      "el desglose de 1/2 + 1/3 sólo escribe fracciones de ESE ejercicio —nada de 1/4 + 1/4—",
      escrito.length >= 5 && ajenas.length === 0 && !/pizza/i.test(dicho),
      JSON.stringify(ajenas),
    );
    check(
      "y llega a la respuesta final consolidada, 5/6, etiquetada como cierre y anunciada",
      des.directivas.some((d) => d.contenido === "1/2 + 1/3 = 3/6 + 2/6 = (3 + 2)/6 = 5/6" && d.operacion?.tipo === "resultado") &&
        /Resultado final: 5\/6/.test(dicho),
    );
    const iAndamiaje = des.directivas.findIndex((d) => d.tipo === "hablar" && /con el mismo denominador los trozos son del mismo tamaño/.test(d.texto));
    const iSuma = des.directivas.findIndex((d) => d.contenido === "3/6 + 2/6 = 5/6");
    check(
      "el paso en el que estaba el alumno (la suma) recibe su andamiaje JUSTO antes de desglosarse",
      iAndamiaje > 0 && iSuma > iAndamiaje && /suman los numeradores/.test(des.directivas[1]?.texto ?? ""),
    );
    check("y no trae pregunta propia: la lección se reanuda con la suya", !des.directivas.some((d) => d.tipo === "preguntar"));

    // EN LA PRÁCTICA TAMBIÉN SE LLEGA AL FINAL (revisión daa127d, punto 2). Se
    // detenía en "6/10 + 5/10 = ?" para no darle la respuesta, y el cliente lo
    // rechazó: "ningún ejercicio puede quedar inconcluso". Llega al resultado
    // enmarcado y, en vez de "¡Y listo!" a secas, le devuelve la palabra.
    const prac = leccion(desgloseDelEjercicioLSG({ ejercicio: "3/5 + 1/2 = ?", conResultado: false }));
    const dichoPrac = prac.directivas.filter((d) => d.tipo === "hablar").map((d) => d.texto);
    check(
      "en la PRÁCTICA el desglose también llega al resultado final enmarcado: nada de pararse en 6/10 + 5/10 = ?",
      prac.directivas.some((d) => d.contenido === "3/5 + 1/2 = 6/10 + 5/10 = (6 + 5)/10 = 11/10" && d.operacion?.tipo === "resultado") &&
        !prac.directivas.some((d) => d.contenido === "6/10 + 5/10 = ?") &&
        dichoPrac.some((t) => /Resultado final: 11\/10/.test(t)),
      JSON.stringify(prac.directivas.filter((d) => d.tipo === "pizarra").map((d) => d.contenido)),
    );
    const escritoPrac = prac.directivas.filter((d) => d.tipo === "pizarra").map((d) => d.contenido);
    check(
      "y después le pasa la palabra con un ejercicio NUEVO y parecido, no con el que ya está resuelto",
      /te toca a ti con uno nuevo/i.test(dichoPrac.at(-1) ?? "") && /^\d+\/\d+ \+ \d+\/\d+ = \?$/.test(escritoPrac.at(-1) ?? "") &&
        escritoPrac.at(-1) !== "3/5 + 1/2 = ?" && prac.directivas.at(-1)?.tipo === "preguntar",
      `${dichoPrac.at(-1)} · ${escritoPrac.at(-1)}`,
    );
    for (const [ej, final, tema] of [
      ["2(x + 4) = 3x - 1", "x = 9", ""],
      ["19 + 45 = ?", "19 + 45 = 64", ""],
      ["x² - 9", "x² - 9 = (x - 3)(x + 3)", "factorización"],
    ]) {
      const d = desgloseDelEjercicioLSG({ ejercicio: ej, conResultado: false, tema });
      const t = JSON.stringify(d?.directivas ?? []);
      const cierre = (d?.directivas ?? []).find((x) => x.tipo === "pizarra" && x.operacion?.tipo === "resultado");
      check(
        `práctica "${ej}": se desglosa el mismo ejercicio hasta su resultado final enmarcado, ${final}`,
        Boolean(d) && t.includes(ej.replace(" = ?", "")) && cierre?.contenido === final,
        cierre?.contenido,
      );
    }
    for (const [ej, tema] of [["2(x + 4) = 3x - 1", ""], ["234 + 178", ""], ["3x⁴ - 2x²", "derivadas"], ["x² - 9", "factorización"]]) {
      const d = desgloseDelEjercicioLSG({ ejercicio: ej, tema });
      check(`ejemplo "${ej}": el desglose existe y es del mismo ejercicio`, Boolean(d) && JSON.stringify(d.directivas).includes(ej));
    }
    const concepto = reexplicacionDeConceptoLSG("Enséñame las fracciones", 1);
    check(
      "sin ejercicio en la tarjeta (Concepto), se cuenta la idea con otras palabras y no se escribe nada nuevo",
      Boolean(concepto) && !concepto.directivas.some((d) => d.tipo === "pizarra") &&
        concepto.directivas.some((d) => d.tipo === "hablar" && /pizza partida en 5/.test(d.texto)),
    );

    // Por la puerta de verdad: el botón llega al servidor con la tarjeta.
    const respuesta = await manejarConsulta({
      query: "No entendí, explícalo mejor",
      contexto: "Enséñame las fracciones",
      currentTopic: "Enséñame las fracciones",
      seguimiento: "reexplicar",
      parte: "resolucion",
      explicacionDinamica: true,
      aclaracion: { ejercicio: "1/2 + 1/3", tema: "fracciones", paso: "1/2 = 3/6", conResultado: true },
    });
    const pizarras = (respuesta.json.pasos ?? []).filter((p) => p.tipo === "pizarra").map((p) => p.contenido);
    check(
      "el servidor responde al botón con el desglose determinista, sin IA ni demostración",
      respuesta.status === 200 && respuesta.json.fuente_ia === "local" && respuesta.json.modelo === "desglose",
      `${respuesta.json.fuente_ia}/${respuesta.json.modelo}`,
    );
    check(
      "y lo que escribe es 1/2 + 1/3 resuelto, no otra cuenta",
      pizarras.some((c) => /^MCM\(2, 3\)/.test(c)) && !pizarras.some((c) => /1\/4 \+ 1\/4/.test(c)),
      JSON.stringify(pizarras),
    );
    // "Explicar regla" sin modelo disponible: tampoco cae en la demostración.
    const antes = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const regla = await manejarConsulta({
      query: "Explícame la regla que se aplica",
      contexto: "Enséñame las fracciones",
      currentTopic: "Enséñame las fracciones",
      seguimiento: "reexplicar",
      parte: "concepto",
      explicacionDinamica: true,
      aclaracion: { ejercicio: "1/2 + 1/3", tema: "fracciones", regla: { nombre: "Suma y resta con distinto denominador", formula: "" } },
    });
    if (antes !== undefined) process.env.GEMINI_API_KEY = antes;
    const escritoRegla = (regla.json.pasos ?? []).filter((p) => p.tipo === "pizarra").map((p) => p.contenido);
    check(
      "«Explicar regla» sin IA no cae en la lección de demostración: explica la regla sobre el MISMO ejercicio",
      regla.json.modelo === "desglose" && !escritoRegla.some((c) => /1\/4 \+ 1\/4/.test(c)) &&
        (regla.json.pasos ?? []).some((p) => p.tipo === "hablar" && /Suma y resta con distinto denominador/.test(p.texto)),
      `${regla.json.modelo}: ${JSON.stringify(escritoRegla)}`,
    );

    // Y la vuelta a la clase: tras explicar, lo que quedaba de la lección.
    const lsgOriginal = leccion(fraccionResueltaLSG({ concepto: true, nivel: "dificil" }));
    const timeline = lsgOriginal.modulos.flatMap((m) => [{ tipo: "modulo", id: m.id }, ...m.directivas]);
    const enEjemplo = timeline.findIndex((d) => d.tipo === "pizarra" && d.contenido === "1/2 = 3/6");
    const resto = restoDeLeccion(timeline, enEjemplo);
    check(
      "lo que queda de la lección desde el ejemplo es la fase de Práctica entera",
      resto.siguientes.length === 1 && resto.siguientes[0].id === "practica" &&
        resto.siguientes[0].directivas.some((d) => d.tipo === "preguntar"),
      JSON.stringify(resto.siguientes.map((m) => m.id)),
    );
    const combinada = reanudarTrasAclaracion(des, { faseActual: "ejemplo_guiado", pregunta: null, mismaFase: [], siguientes: resto.siguientes });
    check(
      "la explicación ocupa la fase en la que estaba el alumno y DESPUÉS sigue la práctica",
      combinada.modulos.length === 2 && combinada.modulos[0].id === "ejemplo_guiado" &&
        combinada.modulos[1].id === "practica" && !combinada.directivas &&
        combinada.modulos[0].directivas.at(-1)?.texto === "Ahora que lo tienes claro, seguimos con la clase.",
    );
    const enPractica = timeline.findIndex((d) => d.tipo === "preguntar");
    const restoP = restoDeLeccion(timeline, enPractica);
    const conPregunta = reanudarTrasAclaracion(prac, {
      faseActual: "practica",
      pregunta: timeline[enPractica],
      mismaFase: restoP.mismaFase,
      siguientes: restoP.siguientes,
    });
    check(
      "en la práctica, tras explicar se le devuelve SU pregunta, con su respuesta esperada",
      conPregunta.modulos.length === 1 && conPregunta.modulos[0].directivas.at(-1)?.tipo === "preguntar" &&
        conPregunta.modulos[0].directivas.at(-1)?.respuesta === timeline[enPractica].respuesta,
    );

    const aulaTsx = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
    check(
      "el aula manda el ejercicio de la TARJETA (no el último escrito de la lección) y el paso que se ve",
      /ejercicio: faseConEjercicio\(\) \? \(enTarjeta \?\? conversacion\.current\.ejercicio\) : ""/.test(aulaTsx) &&
        /paso: pasoEnPantalla\.current \?\?/.test(aulaTsx) &&
        /conResultado: !tarjetaParaResolver \|\| practicaResuelta\.current/.test(aulaTsx),
    );
    check(
      "y reanuda la lección tras la ayuda: las fases que quedaban se abren y la ayuda termina",
      /reanudarTrasAclaracion\(recortada, \{/.test(aulaTsx) &&
        /if \(!fasesAReanudar\.current\.has\(id\)\) return;/.test(aulaTsx),
    );
  }

  // 4. LOS RÓTULOS, A TAMAÑO DE AULA Y EN LETRA DE PIZARRA.
  {
    const [eq] = partirNota("Fracciones equivalentes: 2/4 = 1/2");
    const [mcm] = partirNota("MCM(2, 3): 2 × 3 = 6");
    const [prop] = partirNota("Propiedad uniforme de la suma: lo mismo a los dos lados");
    check(
      "las tres líneas de las capturas se parten en rótulo y cuerpo",
      eq.rotulo === "Fracciones equivalentes:" && eq.cuerpo === "2/4 = 1/2" &&
        mcm.rotulo === "MCM(2, 3):" && mcm.cuerpo === "2 × 3 = 6" &&
        prop.rotulo === "Propiedad uniforme de la suma:" && prop.cuerpo === "lo mismo a los dos lados",
    );
    check(
      "una línea con varias notas se parte en renglones (los múltiplos de cada denominador)",
      partirNota("Múltiplos de 4: 4, 8, 12. Múltiplos de 6: 6, 12. El menor en común: 12.").map((t) => t.rotulo).join("|") ===
        "Múltiplos de 4:|Múltiplos de 6:|El menor en común:",
    );
    const [fr] = partirNota("Fracción: numerador / denominador");
    check(
      '"Fracción: numerador / denominador" se compone como fracción de verdad, con su raya',
      fr.fraccion?.arriba === "Numerador" && fr.fraccion?.abajo === "Denominador",
    );
    const panelTsx = readFileSync(new URL("../components/leccion/pizarra-animada.tsx", import.meta.url), "utf8");
    const notaTsx = readFileSync(new URL("../components/leccion/nota-pizarra.tsx", import.meta.url), "utf8");
    const estilos = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    check(
      "la pizarra pinta la prosa como NOTA (rótulo + fórmula en estilo de bloque), no como un párrafo diminuto",
      /<NotaDePizarra texto=\{escena\.texto\} \/>/.test(panelTsx) &&
        /className=\{cn\("pz-nota", className\)\} \{\.\.\.rol\(ROL\.PIZARRA\)\}/.test(notaTsx) &&
        /\\\\displaystyle \$\{planoALatex\(p\.contenido\)\}/.test(notaTsx),
    );
    const tam = estilos.match(/\.modo-proyeccion \.pz-nota \{\s*font-size: clamp\(([\d.]+)rem/);
    check(
      "en proyección el rótulo nunca baja de text-2xl (1,5 rem) y crece con la pantalla",
      Boolean(tam) && Number(tam[1]) >= 1.5,
      tam?.[0],
    );
    // El informe del cliente cambió la letra del subtítulo: es voz del tutor
    // (TUTOR_DIALOG, Segoe Print), y la pone su ROL, no una regla de .pz-pie.
    check(
      "y el pie de cada paso es voz del tutor: su letra la pone el rol, no la nota",
      /\.pz-pie \{\s*line-height: 1\.55;\s*\}/.test(estilos) &&
        /<TextoTutor\s+como="p"\s+className="pz-pie/.test(panelTsx),
    );
    const pizarraFase = readFileSync(new URL("../components/leccion/pizarra.tsx", import.meta.url), "utf8");
    check(
      "en Concepto y Reglas se escribe TODO lo de la fase, no sólo la última línea (en pantalla y proyectado)",
      /const notas = planteaEjercicio \? \[\] : desarrollo\.filter\(\(l\) => !l\.aclaracion && l\.clase !== "explicacion"\)/.test(pizarraFase) &&
        /notasAmbiente2\.map\(nota\)/.test(pizarraFase),
    );
  }

  // 5. LA TARJETA NO ADELANTA EL RESULTADO DE LA DISTRIBUTIVA.
  {
    const e = escenaDeDistributiva("2(x + 4) = 3x - 1", "e");
    check(
      "en una ecuación, lo repartido va en su PROPIO renglón: 2x + 8 = 3x − 1, alineado por el igual",
      // Con aire entre los renglones para la escuadra del conector y su "× 2".
      /\\begin\{aligned\}/.test(e.latex) && /\\\\\[1\.6em\] \\htmlClass\{pz-rev-2 pz-resultado\}\{2x \+ 8\}/.test(e.latex),
      e.latex,
    );
    check(
      'y ya no se escribe la cadena falsa "… = 3x − 1 = 2x + 8"',
      !/3x-1 \\htmlClass\{pz-rev-2\}\{= /.test(e.latex),
    );
    let compone = true;
    try { katex.renderToString(e.latex, { displayMode: true, throwOnError: true, strict: false, trust: (c) => c.command === "\\htmlClass" }); } catch { compone = false; }
    check("KaTeX compone el renglón nuevo sin errores", compone);
    const signo = escenaDeDistributiva("2(x - 3) = 10", "e");
    check(
      "cada producto con SU signo: en 2(x − 3), el 2 multiplica a −3 y da −6",
      signo.focos[1].narracion === "Y el 2 multiplica a -3: da -6." && signo.focos[2].narracion === "Queda 2x - 6 = 10.",
      `${signo.focos[1].narracion} / ${signo.focos[2].narracion}`,
    );
    // Las frases del motor y las del panel no pueden separarse: la voz tiene
    // que decir exactamente lo que se enmarca.
    let iguales = 0;
    const catalogo = ["2(x + 3) = 16", "2(x + 4) = 3x - 1", "3(x - 2) = 9", "-3(2x - 5) = 9", "2(3x + 5) = 4(x + 7)", "5(x + 1)"];
    for (const t of catalogo) {
      if (JSON.stringify(locucionesDistributiva(t)) === JSON.stringify(escenaDeDistributiva(t, "e").focos.map((f) => f.narracion))) iguales++;
    }
    check("las frases del reparto del motor son LAS MISMAS que las del panel", iguales === catalogo.length, `${iguales}/${catalogo.length}`);
    {
      // Y en el ejemplo, los tres focos del reparto se ven mientras se dicen.
      const ev = simular(leccion(linealResueltaLSG({ nivel: "dificil" })));
      const vistos = new Set(ev.filter((x) => x.d.tipo === "hablar" && x.escenas[x.escena]?.clase === "distributiva" && x.foco >= 0).map((x) => x.foco));
      check("en el ejemplo de ecuaciones, la animación reparte LOS DOS términos y llega al resultado", vistos.size === 3, [...vistos].join(","));
    }
    const pizarraTsx = readFileSync(new URL("../components/leccion/pizarra.tsx", import.meta.url), "utf8");
    check(
      "la tarjeta de EJERCICIO compone el enunciado tal cual está escrito: sin lo que la animación destapa",
      /soloEnunciado=\{e\.papel === "planteamiento"\}/.test(pizarraTsx) &&
        /\?\? \(soloEnunciado \? null : latexDeLaSubrutina\(linea\)\)/.test(pizarraTsx),
    );
    const lin = leccion(linealResueltaLSG({ concepto: true, nivel: "dificil" }));
    const piden = enunciadosParaResolver(lin);
    const practica = lin.modulos.find((m) => m.id === "practica").directivas.find((d) => d.tipo === "pizarra").contenido;
    check(
      "el enunciado de la práctica se reconoce como lo que se le PIDE al alumno",
      piden.has(practica) && !piden.has(lin.modulos.find((m) => m.id === "ejemplo_guiado").directivas.find((d) => d.tipo === "pizarra").contenido),
      JSON.stringify([...piden]),
    );
    const aulaSrc = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
    check(
      "y la pizarra animada no lo anima —ni en la tarjeta ni si cae en el desarrollo—: no le hace el primer paso al alumno (salvo si él pidió que se lo resolvieran)",
      /if \(ejercicio\?\.texto && \(!paraResolver\.has\(ejercicio\.texto\) \|\| ejercicio\.texto === enunciadoExplicado\)\) \{\s*pasos\.push\(pasoDeLinea\(ejercicio\)\);/.test(aulaSrc) &&
        /if \(linea\.aclaracion \|\| paraResolver\.has\(linea\.texto\)\) continue;/.test(aulaSrc),
    );
    check(
      "un enunciado que se le pide al alumno se lleva la tarjeta aunque no acabe en \"= ?\" (el de ecuaciones)",
      /\(esEnunciadoParaResolver\(limpio\) \|\| paraResolverRef\.current\.has\(limpio\)\)/.test(aulaSrc),
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
  const diagramasTs = readFileSync(new URL("../lib/leccion/diagramas.ts", import.meta.url), "utf8");

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
    // Vive en lib/leccion/diagramas.ts —conceptoDeFraccion— y no en la pizarra:
    // la animada necesita el MISMO cálculo cuando se proyecta sin nada que
    // animar (ver la sección de proyección más abajo), y con la lógica
    // duplicada una podía quedarse viendo el denominador y la otra no.
    "se deduce lo dicho de lo que ya se ha escrito en la fase, por cómo EMPIEZA la línea, en un solo sitio",
    /RE_NUMERADOR_ESCRITO = \/\^numerador\\s\*:\/i/.test(diagramasTs) &&
      /RE_DENOMINADOR_ESCRITO = \/\^denominador\\s\*:\/i/.test(diagramasTs) &&
      /export function conceptoDeFraccion/.test(diagramasTs),
  );
  check(
    "y se lo pasa al diagrama",
    /vistoNumerador=\{vistoNumerador\}/.test(pizarraTsx) && /vistoDenominador=\{vistoDenominador\}/.test(pizarraTsx),
  );

  // 1c. LA EXPRESIÓN FORMAL, AL CERRAR LA IDEA —vertical, sin barra inclinada
  //     (revisión daa127d, punto 1)—.
  check(
    '"falta mostrar la expresión matemática explícita": aparece cuando ya se han dicho las dos palabras',
    /<FraccionFormal/.test(pizarraTsx) &&
      /vistoNumerador && vistoDenominador && \(/.test(pizarraTsx) &&
      !/Numerador \/ Denominador/.test(pizarraTsx),
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
  // Después el informe del cliente lo fijó como regla (SUB-NOT-04): el rótulo
  // se coloca por GEOMETRÍA MEDIDA —a 8 px de toda cifra, con la caja real de
  // su letra— y "llevo 1" estrictamente encima de su llevada.
  check(
    "el rótulo se coloca con las cajas medidas y la caja real de su letra; «llevo 1», sobre su llevada",
    /colocarEtiqueta\(\{\s*caja,\s*ancho,\s*alto,\s*obstaculos: medidas\.glifos,\s*preferidos,\s*limites:/.test(panelTsx) &&
      /cajaAlto = bb\.height/.test(panelTsx) && (panelTsx.match(/y=\{rect\.yTexto\}/g) ?? []).length >= 2 &&
      escenaDeColumna("24 + 17", "e").focos.some((f) => f.etiqueta === "llevo 1" && f.anclaEtiqueta === "pz-llevada-0") &&
      /ancla \? rotulo\(etiqueta, ancla, \["arriba"\]\)/.test(panelTsx),
  );

  // 3. EL BRAZO DE LA DISTRIBUTIVA.
  //
  // El cliente lo dibujó a mano: una ESCUADRA que baja del factor, pasa por
  // debajo de la expresión y sube con su flecha al sumando, con el "× 2" debajo.
  check(
    "hay un componente que dibuja la escuadra entre el factor y el sumando, con punta de tamaño fijo",
    /function ConectorReparto/.test(panelTsx) && /markerEnd=\{`url\(#\$\{marcador\}\)`\}/.test(panelTsx) &&
      /markerUnits="userSpaceOnUse"/.test(panelTsx) && /V \$\{barra\} H \$\{x1\} V \$\{finTrazo\}/.test(panelTsx),
  );
  check(
    "sólo se dibuja para los focos de conector, y sólo con sus dos piezas medidas",
    /if \(f\.conector\) \{\s*const \[a, b\] = f\.piezas \?\? \[\];/.test(panelTsx) &&
      /if \(!factor \|\| !termino\) return \[\];/.test(panelTsx),
  );
  check(
    "reutiliza el trazo de las marcas —mismo color, misma animación de dibujado—",
    /className="pz-trazo pz-conector"[\s\S]{0,120}markerEnd/.test(panelTsx),
  );

  // 4. LA IDENTIDAD TIPOGRÁFICA: dos roles, y el cliente CORRIGIÓ el primer
  // intento. La primera ronda le puso letra manuscrita al habla del tutor; la
  // segunda ronda dijo que no —"Subtítulos del Avatar: tipografía estándar
  // limpia del sistema"— y agrupó "Chalkboard SE" y "Segoe Print" como
  // alternativas de UN solo estilo, el de la pizarra. Aquí se comprueba la
  // versión corregida, y que no quede rastro de la que se deshizo.
  check(
    "el habla ya NO tiene una fuente manuscrita propia: no existe esa clase",
    !/\.pz-manuscrita\b/.test(estilos) && !/pz-manuscrita/.test(aulaTsx) && !/pz-manuscrita/.test(pizarraTsx),
  );
  // EL INFORME DEL CLIENTE SUSTITUYE ESTA RONDA (SUB-TIP-01): tres roles, cada
  // uno con su fuente —la pizarra en Chalkboard SE, las fórmulas en KaTeX—,
  // aplicada por el ROL de cada elemento y no a mano. Y la del tutor la corrigió
  // la ronda de septiembre: era manuscrita y cansaba en párrafos largos, así que
  // ahora es una sans limpia y la manuscrita queda para el lienzo.
  const tutorTsx = readFileSync(new URL("../components/leccion/texto-tutor.tsx", import.meta.url), "utf8");
  const tailwind = readFileSync(new URL("../tailwind.config.ts", import.meta.url), "utf8");
  check(
    "el subtítulo del tutor es TUTOR_DIALOG: sans limpia, puesta por su rol",
    /<TextoTutor\s+como="p"\s+className="pz-subtitulo/.test(aulaTsx) && /\{\.\.\.rol\(ROL\.TUTOR\)\}/.test(tutorTsx) &&
      /--fuente-tutor: Inter, "Segoe UI Variable Text", "Segoe UI", system-ui/.test(estilos) &&
      /\[data-rol="TUTOR_DIALOG"\] \{\s*@apply font-tutor;/.test(estilos),
  );
  check(
    "y NINGUNA cursiva manuscrita en la voz del tutor: la fatiga visual que pidió quitar el cliente",
    !/--fuente-tutor:[^;]*(Segoe Print|Bradley Hand|Comic Sans|Chalkboard|cursive)/.test(estilos),
  );
  check(
    "el párrafo del avatar se lee como párrafo: cuerpo de 1rem y renglón holgado",
    /\.pz-subtitulo \{[^}]*font-size: 1rem;[^}]*line-height: 1\.65;/.test(estilos),
  );
  check(
    "el pie de la pizarra animada —lo que dice el foco encendido— también es voz del tutor",
    /<TextoTutor\s+como="p"\s+className="pz-pie/.test(panelTsx) && !/\.pz-pie \{[^}]*font-family/.test(estilos),
  );
  check(
    "la escritura de pizarra es Chalkboard SE (con Comic Sans MS en Windows), distinta de la del tutor",
    /--fuente-pizarra: "Chalkboard SE", "Chalkboard", "Comic Sans MS"/.test(estilos) &&
      /\[data-rol="BOARD_LABEL"\] \{\s*@apply font-pizarra;/.test(estilos) &&
      /pizarra: \["var\(--fuente-pizarra\)"\]/.test(tailwind) && /tutor: \["var\(--fuente-tutor\)"\]/.test(tailwind),
  );
  check(
    "la etiqueta de la llevada y los rótulos del diagrama son BOARD_LABEL",
    /className="pz-etiqueta"\s*\{\.\.\.rol\(ROL\.PIZARRA\)\}/.test(panelTsx) && /data-rol="BOARD_LABEL"/.test(diagramaTsx),
  );
  check(
    "una nota escrita que no se dejó componer como fórmula es NOTA DE PIZARRA; el habla, voz del tutor",
    /if \(linea\.clase === "explicacion"\) \{[\s\S]{0,300}<TextoTutor/.test(pizarraTsx) &&
      /<NotaDePizarra\s+texto=\{sinRayasDibujadas\(linea\.texto\)\}/.test(pizarraTsx),
  );
  // Las fórmulas no se tocan: KaTeX sigue siendo quien las compone, sin una
  // fuente distinta impuesta encima.
  check(
    "las fórmulas siguen sin una fuente propia forzada: las compone KaTeX tal cual",
    !/\.katex\s*\{[^}]*font-family/.test(estilos),
  );

  // 5. "LLEVO 1" YA NO SE TAPA CON UNA LLEVADA ENCADENADA.
  //
  // El cliente lo volvió a reportar tras el fix de la ronda anterior, esta vez
  // con una suma de varias cifras: una columna puede RECIBIR una llevada y a
  // la vez GENERAR la suya propia (p.ej. "234 + 876", donde decenas recibe la
  // llevada de unidades y genera otra hacia centenas). La caja de esa columna
  // sólo incluía las cifras del sumando/sumandos, no la llevada que entra por
  // arriba, así que el tope de la caja —de donde cuelga el rótulo— quedaba
  // por debajo de esa llevada y el rótulo aterrizaba encima de ella. El fix:
  // la marca de la llevada lleva TAMBIÉN la clase de su propia columna
  // (`pz-col-${j}`, no sólo `pz-llevada-${j}`), así que entra en la medición
  // de esa caja y el `dy="-0.65em"` ya existente la despeja de verdad.
  const encadenada = escenaDeColumna("234 + 876", "e");
  const marcasLlevada = [...encadenada.latex.matchAll(/\\htmlClass\{([^}]*)\}\{\\scriptstyle 1\}/g)].map(
    (m) => m[1].trim(),
  );
  check(
    '"234 + 876" encadena tres llevadas seguidas: es el caso que chocaba',
    encadenada.focos.filter((f) => f.etiqueta === "llevo 1").length === 3,
    JSON.stringify(encadenada.focos.map((f) => f.etiqueta)),
  );
  check(
    "cada marca de llevada lleva también la clase de SU columna, no sólo pz-llevada-N",
    marcasLlevada.length === 3 &&
      marcasLlevada.every((c) => {
        const n = /pz-llevada-(\d+)/.exec(c)?.[1];
        return n !== undefined && c.includes(`pz-col-${n}`);
      }),
    JSON.stringify(marcasLlevada),
  );

  // 6. EL DIAGRAMA DE CONCEPTO TAMBIÉN SE PROYECTA, NO SÓLO EL TEXTO.
  //
  // "Al activar el Modo Proyección, el gráfico circular interactivo debe
  // permanecer visible y escalado en grande. Actualmente sólo muestra una
  // frase diminuta en medio de la pantalla negra." La pizarra animada, sin
  // nada que animar, sólo componía el último texto escrito —con KaTeX, a
  // tamaño de fórmula—; el dibujo que sí ve la pizarra clásica arriba no
  // llegaba nunca a la proyectada.
  // Ahora proyectar es poner EN GRANDE LA MISMA PIZARRA (SUB-PRJ-03): el
  // dibujo está en ella, en el Ambiente 1, y se proyecta porque se proyecta ella.
  check(
    "la pizarra de la clase dibuja el DiagramaConcepto —la misma en pantalla y proyectada—",
    /import \{ DiagramaConcepto \} from "@\/components\/leccion\/diagrama-concepto"/.test(pizarraTsx) &&
      !/DiagramaConcepto/.test(panelTsx),
  );
  check(
    "el dibujo sale en Concepto cuando el tema lo tiene",
    /const diagrama =\s*actual != null && esFaseDeConcepto\(actual\.id\) && tema && tieneDiagrama\(tema\) \? tema : null;/.test(pizarraTsx),
  );
  check(
    "y se dibuja en el Ambiente 1, con la fracción en curso",
    /\{diagrama && \(\s*<div className="pz-diagrama-y-fraccion[\s\S]{0,200}<DiagramaConcepto\s+tema=\{diagrama\}/.test(pizarraTsx),
  );
  check(
    "la fracción en curso sale del mismo cómputo de siempre —conceptoDeFraccion—, no de uno propio",
    /conceptoDeFraccion\(\{/.test(pizarraTsx),
  );
  check(
    "y en proyección se escala a lo ancho del ambiente",
    /\.modo-proyeccion \.pz-diagrama \{\s*max-width: min\(40rem, 100%\);/.test(estilos),
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
  // Los compone `FormulaQueCabe`, que además los parte en renglones —y, si aún
  // no caben, los encoge lo justo— para que nunca se corten contra el borde.
  check(
    "el ejemplo de la regla se compone en modo display, no en línea",
    /<FormulaQueCabe\s+latex=\{regla\.ejemplo\}/.test(pizarraClasica) &&
      /<Formula key=\{`\$\{i\}-\$\{fila\}`\} latex=\{fila\} display \/>/.test(pizarraClasica),
  );
  check(
    "y la regla, igual: las dos por la fórmula que se ajusta a su mitad de la pizarra",
    (pizarraClasica.match(/<FormulaQueCabe/g) ?? []).length === 2 &&
      /partirLaMasLarga\(estado\.current\.filas\)/.test(pizarraClasica) &&
      /Math\.max\(0\.8, estado\.current\.escala/.test(pizarraClasica),
  );
  // El informe pidió después lo contrario de centrar (OBS-10: "definiciones
  // amontonadas al centro… alinear a la izquierda").
  check(
    "alineado a la izquierda, como todo el ambiente, y al tamaño de la regla",
    (pizarraClasica.match(/className="pz-regla-formula/g) ?? []).length === 2 &&
      !/pz-regla-formula[^"]*text-center/.test(pizarraClasica) &&
      /\.pz-ambiente \.katex-display \{[^}]*text-align: left;/.test(estilos) &&
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
  // Pulsado en Concepto o en Reglas, lo que llega es un ejercicio: se abre la
  // fase del ejemplo, o se pintaba como notas sueltas sin «Ejercicio:».
  check(
    "«Más difícil» pulsado en Concepto o Reglas abre la fase del ejemplo antes de sustituir",
    /if \(presentacion === "sustituir" && esAyuda\.current && !faseConEjercicio\(\)\) \{\s*abrirEscena\("ejemplo_guiado"\);/.test(aulaTsx),
  );
  // Reanudar tras una pausa rehace la pizarra: durante una ayuda, "borrar" es
  // volver a la foto del inicio de la ayuda, o el desarrollo salía duplicado.
  check(
    "al reanudar una ayuda no se duplica el desarrollo: se vuelve a la pizarra con la que empezó",
    /baseDeAyuda\.current = esAyuda\.current/.test(aulaTsx) && /const base = baseDeAyuda\.current;\s*if \(base\) \{/.test(aulaTsx),
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
  {
    // Una línea que ya dice la respuesta no se reescribe ni se duplica: sólo se
    // etiqueta como cierre, que es lo que la enmarca.
    const yaDice = cierreDelDesarrollo({ enunciado: "3/5 + 1/2 = ?", lineas: ["6/10 + 5/10 = 11/10"], respuesta: "11/10" });
    check(
      "lo que ya dice la respuesta no se reescribe: sólo se etiqueta como cierre, para enmarcarlo",
      yaDice?.accion === "completar" && yaDice.texto === "6/10 + 5/10 = 11/10" && yaDice.operacion.tipo === "resultado",
      JSON.stringify(yaDice),
    );
    check(
      "y lo que ya está cerrado no se toca",
      cierreDelDesarrollo({
        enunciado: "3/5 + 1/2 = ?",
        lineas: [{ texto: "3/5 + 1/2 = 11/10", operacion: { tipo: "resultado" } }],
        respuesta: "11/10",
      }) === null,
    );
  }
  check(
    "y nunca se escribe una cuenta que no sale",
    cierreDelDesarrollo({ enunciado: "3/5 + 1/2 = ?", lineas: ["6/10 + 5/10"], respuesta: "1/2" }) === null &&
      cierreDelDesarrollo({ enunciado: "¿Cuál es la derivada de 5x²?", lineas: [], respuesta: "5x" }) === null &&
      cierreDelDesarrollo({ enunciado: "3x + 2 = 11", lineas: [], respuesta: "4" }) === null &&
      cierreDelDesarrollo({ enunciado: "x² - 9", lineas: [], respuesta: "(x - 3)(x + 4)", pregunta: "¿Cómo se factoriza x² - 9?" }) === null,
  );
  check(
    "el cierre se escribe en cuanto el ejercicio queda resuelto —acertado o con los intentos agotados—, justo antes del feedback",
    /onExerciseResolved: \(\{ respuesta, pregunta: textoPregunta \}\) =>\s*cerrarEjercicio\(/.test(aulaTsx) &&
      /cierra\(true\);[\s\S]{0,700}this\.ui\.showFeedback\(true, msg\)/.test(reproductor) &&
      /cierra\(false\);\s*const cierre = `No te preocupes/.test(reproductor) &&
      /respuesta: this\._respondio \? this\._respuesta : null/.test(reproductor),
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
      /conPreguntaPendiente\(sinPreguntas\(recortada\), preguntaDeVuelta, transicion\)/.test(aulaTsx),
  );

  // 4b. EL MODO PROYECCIÓN NO DESAPARECE.
  // El panel ya no tiene un "reposo" propio: dibuja LA pizarra de la clase
  // (con `tablero`), que es la misma en pantalla y proyectada (SUB-PRJ-03).
  check(
    "sin nada que animar, el panel no se retira: la pizarra y el botón de proyección siguen ahí",
    !/if \(sinAnimacion[^)]*\) return null;/.test(panelTsx) && /\{tablero\(\{/.test(panelTsx) &&
      /\{proyeccion \? "Salir de proyección" : "Modo proyección"\}/.test(panelTsx),
  );
  check(
    "y en pantalla la pizarra es UNA: la del panel, sin una segunda copia que pueda decir otra cosa",
    /tablero=\{\(animacion\) => \(\s*<Pizarra/.test(aulaTsx) && (aulaTsx.match(/<Pizarra\b/g) ?? []).length === 1,
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
    // Uno más que antes en cada motor: el CIERRE del ejercicio, la línea con la
    // respuesta final etiquetada como `resultado` (revisión daa127d, punto 2).
    // En derivadas y factorización el cierre va en la misma línea que la
    // operación (`final`), así que no suma ninguna.
    ["suma", () => sumaResueltaLSG({ concepto: true }), 2],
    ["resta", () => restaResueltaLSG({ concepto: true }), 2],
    ["multiplicación", () => multiplicacionResueltaLSG({ concepto: true }), 3],
    ["división", () => divisionResueltaLSG({ concepto: true }), 3],
    ["fracciones", () => fraccionResueltaLSG({ concepto: true, nivel: "normal" }), 2],
    ["fracciones con denominadores distintos", () => fraccionResueltaLSG({ concepto: true, nivel: "dificil" }), 4],
    // Cinco: la resta escrita, la resta tachada, la división escrita, su
    // resultado y el cierre. Todo lo que el tutor nombra queda etiquetado, que
    // es lo que permite a la pizarra seguirlo frase a frase.
    ["ecuaciones lineales", () => linealResueltaLSG({ concepto: true }), 5],
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
    /import \{ escenaDeLinea, identidadDeEscena, type Escena \} from "@\/lib\/leccion\/animacion"/.test(pizarraTsx) &&
      // Salvo en el ENUNCIADO de la tarjeta, que se compone tal cual está
      // escrito: la escena lleva dentro lo que la animación destapa al final.
      /\?\? \(soloEnunciado \? null : latexDeLaSubrutina\(linea\)\)/.test(pizarraTsx),
  );
  check(
    "y le pasa la instrucción de foco —y la locución— del paso cuando vienen dadas",
    /escenaDeLinea\(pasoDeLinea\(linea\), "pizarra"\)/.test(pizarraTsx) &&
      /linea\.operacion \? \{ operacion: linea\.operacion \}/.test(pizarraTsx) &&
      /linea\.narracion \? \{ narracion: linea\.narracion \}/.test(pizarraTsx),
  );
  // Y una nota con rótulo de palabras ("unidades: 3 + 4 = 7") no se compone
  // entera por KaTeX: va como nota, con el rótulo en letra de pizarra.
  check(
    "sólo cae a la notación formal o al conversor genérico si la subrutina no reconoce nada (y no es una nota rotulada)",
    /\?\? \(soloEnunciado \? null : latexDeLaSubrutina\(linea\)\)[\s\S]{0,300}\?\? \(esNotaRotulada\(texto\) \? null : notacionFormal\(texto\) \?\? \(pareceMatematica\(texto\) \? planoALatex\(texto\) : null\)\)/.test(pizarraTsx),
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

  // EN EL AULA, ESA CUENTA YA NO SE ENSEÑA EN REGLAS (OBS-04 del informe): el
  // cliente vio "24 + 17" en columna mientras se definía la suma —"un ejercicio
  // que carece de sentido en este contexto"— y pidió retirarlo. La regla se lee
  // en la nota que escribe el tutor; la cuenta, en el ejemplo.
  const aula = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  const pizarraClasica = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  check(
    "el aula ya no saca la cuenta de la regla del catálogo",
    !/cuentaDeArrayLatex/.test(aula) && !/cuentaDeLaRegla/.test(aula),
  );
  check(
    "sólo se anima en el Ejemplo y en la Práctica, nunca en Concepto ni en Reglas",
    /if \(!esFaseDeEjemplo\(faseAbierta\) && !esFaseDePractica\(faseAbierta\)\) return pasos;/.test(aula),
  );
  check(
    "y la tarjeta de la regla no sale cuando su «fórmula» es una cuenta dispuesta",
    /esFaseDeReglas\(actual\.id\) && reglaEnCurso && !esOperacionDispuesta\(reglaEnCurso\.enunciado\)/.test(pizarraClasica) &&
      /function esOperacionDispuesta\(enunciado: string\): boolean/.test(pizarraClasica),
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
  check("el primer foco escribe la resta en los dos miembros, sin tachar", escena.focos[0].tipo === "caja" && escena.focos[0].clase === "pz-uniforme");
  check("y el segundo es la cancelación", escena.focos[1].tipo === "tachado");
  check("y se rotula como tal", escena.focos[1].etiqueta === "se cancelan");
  check(
    "el término se tacha en los DOS lados, cada uno con su marca",
    marcada(escena.latex, "pz-cancela-termino") && marcada(escena.latex, "pz-cancela-opuesto"),
    escena.latex,
  );
  check(
    "la resta del otro lado está bien contada",
    /20 menos 5 son 15/.test(escena.focos[1].narracion),
    escena.focos[1].narracion,
  );
  // UN PASO, UNA OPERACIÓN (revisión del cliente sobre la build daa127d): en
  // "3x + 5 = 20" se quita el 5 de los dos lados y ahí acaba la escena. Dividir
  // entre 3 es la línea siguiente, "3x = 15", con su propia escena.
  check(
    "sobre 3x + 5 = 20 sólo se cancela —en dos tiempos—: ni se divide ni se adelanta la solución",
    escena.focos.length === 2 && escena.focos.every((f) => f.tipo !== "resultado") &&
      !escena.latex.includes("pz-coef-despeje") && !escena.latex.includes("Rightarrow"),
    escena.latex,
  );

  const division = escenaDeDespeje("3x = 15", "e");
  check(
    "la división va en SU línea, 3x = 15: caja sobre el 3 y luego la solución",
    division.focos.length === 2 &&
      division.focos[0].clase === "pz-coef-despeje" && division.focos[0].tipo === "caja" &&
      division.focos.at(-1).narracion === "x vale 5.",
    JSON.stringify(division.focos),
  );

  const fraccion = escenaDeDespeje("2x = 15", "e");
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
    "y donde la línea llega a la solución, ésta se destapa en el último paso",
    // En "3x + 5 = 20" no hay solución escrita —la x sigue con su 3—, así que
    // el único destape es el de la resta. Donde sí la hay, va tras el último foco.
    !/pz-solucion/.test(escena.latex) &&
      [escenaDeDespeje("x + 3 = 8", "e"), escenaDeDespeje("3x = 15", "e")].every((e) =>
        e.latex.includes(`\\htmlClass{pz-rev-${e.focos.length - 1}}`),
      ),
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
  // Con la pizarra de dos ambientes ya NO HAY un bloque de desarrollo aparte que
  // esconder: cada línea es un paso de la misma pizarra, con su estado, y lo
  // que la voz aún no ha contado se ve sin lo que destapará.
  const panelAnimado = readFileSync(new URL("../components/leccion/pizarra-animada.tsx", import.meta.url), "utf8");
  check(
    "no hay un desarrollo aparte: cada línea es un paso de LA pizarra, con su estado",
    !aula.includes("ocultarDesarrollo") && /data-estado=\{e\.escena \? estado : "estatica"\}/.test(pizarra) &&
      /estado=\{estado\}/.test(pizarra),
  );
  check(
    "un paso que la voz aún no ha contado no enseña lo que destapará",
    /estado === "completada" \? escena\.focos\.length - 1 : estado === "pendiente" \? -1 : foco/.test(panelAnimado),
  );
  check(
    "y la cuenta en columna es UNA: la del planteamiento, que se anima; sus trozos no abren tarjeta propia",
    /if \(enColumna && !cierre && !auxiliar\) continue;/.test(pizarra),
  );
  // Lo que dice, salvo cuando pregunta: una pregunta no es un paso y no mueve
  // la pizarra (revisión daa127d, 2ª).
  check(
    "y la pizarra recibe lo que el tutor está diciendo",
    aula.includes('narracion={estadoAvatar === "preguntando" ? null : subtitulo}'),
  );

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
  // Subió de 600 ms a 1 s: "una pausa de lectura de al menos 1 segundo antes de
  // cualquier transición automática", pidió el cliente.
  check("con la pausa por defecto en al menos 1 s", PAUSA_ENTRE_PASOS >= 1000);

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

  s.situar(1, 0);
  check("situar coloca la pizarra donde va la voz", s.instantanea().escena === 1);
  s.situar(0, 2);
  check("en el foco pedido", s.instantanea().escena === 0 && s.instantanea().foco === 2);
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
  // Con la pizarra de dos ambientes el alto es FIJO (los botones no saltan) y
  // más bajo en Concepto y Reglas, que escriben menos.
  check(
    "la pizarra no deja medio lienzo en blanco en Concepto y Reglas",
    /const compacta = actual != null && !planteaEjercicio;/.test(pizarraTsx) &&
      pizarraTsx.includes('"h-[21rem] sm:h-[25rem]"') &&
      pizarraTsx.includes('"h-[26rem] sm:h-[32rem]"'),
  );
  check(
    // La "tarjeta residual" que el cliente fotografió —la regla sin fórmula,
    // porque la cuenta se animaba abajo— ya no puede darse: en Reglas la cuenta
    // no se anima (OBS-04) y la tarjeta no sale si su fórmula es una cuenta.
    "y no queda ninguna tarjeta de regla vacía: sin fórmula que enseñar, la regla va como nota",
    !/sinFormula/.test(pizarraTsx) && !/reglaAnimada/.test(pizarraTsx) &&
      /const notasAmbiente1 = conVisual \? \[\] : notas\.slice\(0, 1\);/.test(pizarraTsx),
  );
  check(
    "ni se repite la regla: si hay tarjeta, las notas van al otro ambiente",
    /const notasAmbiente2 = conVisual \? notas : notas\.slice\(1\);/.test(pizarraTsx),
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
  // Escalada a los mínimos del informe: fórmulas ≥ 48 px y notas ≥ 24 px.
  check(
    "con la tipografía escalada",
    /\.modo-proyeccion \.katex \{\s*font-size: clamp\(3rem,/.test(estilos) &&
      /\.modo-proyeccion \.pz-nota \.katex \{\s*font-size: max\(3rem, 1\.3em\);/.test(estilos),
  );
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
    "y la pizarra ocupa la pantalla entera, no un renglón en medio de la nada",
    /\.modo-proyeccion \.pz-tablero-caja \{[^}]*flex: 1 1 auto;/.test(bloqueProyeccion) &&
      /\.modo-proyeccion \.pz-lienzo,\s*\.modo-proyeccion \.pz-pizarra \{[^}]*height: 100%;/.test(bloqueProyeccion),
  );
  check(
    "el avatar se queda a la vista, en un lateral",
    /\.modo-proyeccion \.pz-escenario \{[^}]*grid-template-columns/.test(bloqueProyeccion) &&
      bloqueProyeccion.includes(".modo-proyeccion .pz-avatar svg"),
  );
  check(
    "el tema es de pizarra oscura (slate-950, como pide el informe) y texto claro",
    /\.modo-proyeccion \{[^}]*background: #020617;/.test(bloqueProyeccion) &&
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

// ── LA RONDA DE SEPTIEMBRE DEL CLIENTE (R4) ─────────────────────────────────
//
// Cuatro puntos, y cada uno con su comprobación:
//   1. la pizarra no acumula pasos futuros al navegar con los botones;
//   2. el tachado de la cancelación va DESPUÉS de proyectar la operación;
//   3. ninguna barra gris de desplazamiento;
//   4. la voz del tutor en letra de leer, y audio neuronal con red de seguridad.
{
  const pizarraSrc = readFileSync(new URL("../components/leccion/pizarra.tsx", import.meta.url), "utf8");
  const ttsSrc = readFileSync(new URL("../public/tts.js", import.meta.url), "utf8");
  const aulaSrc = readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8");
  const vozSrc = readFileSync(new URL("../app/api/voz/route.ts", import.meta.url), "utf8");
  const ejemplo = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  // R4-01. LO QUE NO SE HA EXPLICADO, NO ESTÁ ESCRITO. El cliente fotografió el
  // segundo ambiente con las tres ecuaciones del ejercicio a la vez —pasadas y
  // futuras— y varias barras de desplazamiento encima.
  check(
    "la pizarra sólo pinta lo ya explicado: filtra por el estado del guion antes de repartir",
    /const visibles = useMemo\(/.test(pizarraSrc) &&
      /estadoDe\(e\.indiceGuion\) !== "pendiente"/.test(pizarraSrc),
  );
  check(
    "y los DOS ambientes se dibujan desde ese filtro, no desde la lista entera",
    (pizarraSrc.match(/visibles\.filter\(\(e\) => e\.ambiente === \d\)/g) || []).length === 2,
  );
  check(
    "al terminar la lección sí se ve todo: el repaso no se queda a medias",
    /animacion\?\.terminada \|\| estadoDe/.test(pizarraSrc),
  );

  // R4-03. NINGUNA BARRA GRIS. Se desplaza si hace falta (móvil estrecho), pero
  // la barra nativa no se pinta.
  check(
    "las cajas de fórmula esconden la barra nativa de desplazamiento",
    /scrollbar-width: none;/.test(css) && /::-webkit-scrollbar[\s\S]{0,200}display: none;/.test(css),
  );
  check(
    "y en proyección directamente no hay desplazamiento horizontal: lo que no cabe se ha partido antes",
    /\.modo-proyeccion \.katex-display,[\s\S]{0,160}overflow-x: hidden;/.test(css),
  );

  // R4-04a. LA VOZ DEL TUTOR SE LEE, NO SE DESCIFRA.
  check(
    "la letra del tutor es una sans limpia; la manuscrita queda para el lienzo de la pizarra",
    /--fuente-tutor: Inter,/.test(css) && /--fuente-pizarra: "Chalkboard SE"/.test(css),
  );

  // R4-04b. VOZ NEURONAL, CON RED DE SEGURIDAD.
  check(
    "hay un endpoint de voz que sintetiza en el servidor y devuelve MP3",
    /export async function POST/.test(vozSrc) && /audio\/mpeg/.test(vozSrc),
  );
  check(
    "acepta los dos proveedores que pidió el cliente: Google Neural2 y ElevenLabs",
    /texttospeech\.googleapis\.com/.test(vozSrc) && /api\.elevenlabs\.io/.test(vozSrc),
  );
  check(
    "sin clave configurada responde 503 y NO deja la clase muda: el navegador vuelve a su voz",
    /status: 503/.test(vozSrc) && /if \(r\.status === 503\) this\.neural = false;/.test(ttsSrc) &&
      /_hablarLocal\(spoken, \{ signal, onStart \}, 0\)/.test(ttsSrc),
  );
  check(
    "la clave vive sólo en el servidor: ninguna variable de voz es NEXT_PUBLIC_",
    !/NEXT_PUBLIC_[A-Z_]*(TTS|VOZ|ELEVEN)/.test(vozSrc + ttsSrc + ejemplo),
  );
  check(
    "y no hay ninguna clave escrita en el repositorio: sólo el hueco documentado",
    /# GOOGLE_TTS_API_KEY=""/.test(ejemplo) && /# ELEVENLABS_API_KEY=""/.test(ejemplo) &&
      !/GOOGLE_TTS_API_KEY=".+"/.test(ejemplo) && !/ELEVENLABS_API_KEY=".+"/.test(ejemplo),
  );
  check(
    "el arranque del resaltado sigue siendo el momento REAL en que empieza a sonar",
    /const sonando = \(\) => \{ try \{ onStart\?\.\(\); \} catch \{\} \};/.test(ttsSrc) &&
      /audio\.addEventListener\("playing", sonando\);/.test(ttsSrc),
  );
  // Y EL AUDIO SUENA DE VERDAD (cuarta ronda: "la voz que reproduce el navegador
  // sigue siendo la nativa"): un solo <audio>, autorizado con el primer gesto
  // del alumno, y la síntesis del navegador apagada mientras haya neuronal.
  check(
    "hay UN solo reproductor, que se reutiliza para todas las frases",
    /_elemento\(\) \{[\s\S]{0,200}this\._audio = a;/.test(ttsSrc) &&
      /const audio = this\._elemento\(\);/.test(ttsSrc),
  );
  check(
    "y se autoriza con el primer gesto del alumno, que es lo único que acepta el navegador",
    /desbloquear\(\) \{/.test(ttsSrc) && /addEventListener\("pointerdown", abrir/.test(ttsSrc) &&
      /ttsRef\.current\?\.desbloquear\(\);/.test(aulaSrc),
  );
  check(
    "con voz neuronal, la síntesis del navegador se apaga",
    /if \(this\.neural && this\.synth\) \{\s*try \{ this\.synth\.cancel\(\); \} catch \{\}/.test(ttsSrc),
  );
  check(
    "un tropiezo de red no cambia de voz: se reintenta antes de ceder, y sólo a la tercera se rinde",
    /if \(!url && this\.neural !== false && !signal\?\.aborted\) url = await this\._audioDe/.test(ttsSrc) &&
      /this\._fallosNeurales >= 3/.test(ttsSrc),
  );
  check(
    "si la voz neuronal se cae a media frase, se termina por donde iba, sin repetir lo dicho",
    /_hablarLocal\(spoken, \{ signal, onStart: null \}, dichos\)/.test(ttsSrc) &&
      /speakNext\(desde\);/.test(ttsSrc),
  );
  check(
    "callar calla también el audio neuronal",
    /cancel\(\) \{[\s\S]{0,240}this\._audio\.pause\(\)/.test(ttsSrc),
  );
  check(
    "con la voz apagada por el alumno no suena ninguna de las dos",
    /if \(!this\.enabled\) return null;/.test(ttsSrc),
  );
  // El endpoint, de verdad: sin claves en el entorno dice que no hay voz.
  const { configuracionDeVoz } = await import("../lib/voz/config.ts");
  check(
    "sin claves, la configuración de voz es nula (y con una, la elige)",
    configuracionDeVoz({}) === null &&
      configuracionDeVoz({ GOOGLE_TTS_API_KEY: "x" })?.proveedor === "google" &&
      configuracionDeVoz({ ELEVENLABS_API_KEY: "x" })?.proveedor === "elevenlabs" &&
      configuracionDeVoz({ GOOGLE_TTS_API_KEY: "x", ELEVENLABS_API_KEY: "y", VOZ_PROVEEDOR: "elevenlabs" })?.proveedor === "elevenlabs",
  );
  check(
    "la voz por defecto del tutor sigue siendo masculina, como en toda la plataforma",
    configuracionDeVoz({ GOOGLE_TTS_API_KEY: "x" })?.voz === "es-US-Neural2-B",
  );
  // QUÉ CLAVE HACE FALTA, DICHO POR EL PROPIO ENDPOINT (quinta ronda: el
  // cliente tuvo que leer el código en producción para averiguarlo), y una
  // clave puesta con otro nombre razonable no se ignora en silencio.
  check(
    "una clave puesta con otro nombre habitual también vale, y se sabe con cuál se encontró",
    configuracionDeVoz({ GOOGLE_TTS_KEY: "x" })?.variable === "GOOGLE_TTS_KEY" &&
      configuracionDeVoz({ ELEVEN_LABS_API_KEY: "y" })?.proveedor === "elevenlabs" &&
      configuracionDeVoz({ XI_API_KEY: "z" })?.variable === "XI_API_KEY",
  );
  check(
    "sin clave, /api/voz dice exactamente qué variable falta —y no sólo que no hay voz—",
    /motivo: "sin_configurar"/.test(vozSrc) && /variables: CLAVES_DE_VOZ/.test(vozSrc) &&
      /GOOGLE_TTS_API_KEY[\s\S]{0,80}ELEVENLABS_API_KEY/.test(vozSrc),
  );
  check(
    "y con clave puesta se puede comprobar si FUNCIONA, que no es lo mismo, sin gastar una clase",
    /searchParams\.get\("probar"\)/.test(vozSrc) && /sintetizar\("Prueba de voz\."/.test(vozSrc) &&
      /prueba: "ok"/.test(vozSrc) && /prueba: "falla"/.test(vozSrc),
  );
  check(
    "la salud del servicio informa del estado de la voz en la misma mirada",
    /voz: vozConfigurada/.test(readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8")),
  );
  check(
    "y la pantalla dice POR QUÉ no hay voz neuronal, donde el cliente estaba mirando",
    /this\.motivo = d\?\.motivo/.test(ttsSrc) &&
      /sin voz neuronal: falta \$\{this\.claveQueFalta/.test(ttsSrc),
  );

  // CUANDO LE TOCA AL ALUMNO, SE NOTA. El cliente lo pidió con la pantalla
  // delante: la lección se para esperando respuesta, el avatar se queda en "Te
  // acompaño" y nada dice que hay que escribir abajo —"el estudiante piensa que
  // el sistema se congeló"—.
  {
    const player = readFileSync(new URL("../public/pseLight.js", import.meta.url), "utf8");
    const estilos2 = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    check(
      "el avatar dice, en toda pregunta, que le toca al alumno y dónde escribir",
      /export const INVITACION_A_RESPONDER\s*=\s*\n?\s*"Ahora te toca a ti: resuelve el ejercicio y escribe tu respuesta en la caja de abajo\."/.test(player) &&
        /await this\._speak\(INVITACION_A_RESPONDER, "preguntando", signal\);/.test(player),
    );
    check(
      "…y la interfaz enseña esa MISMA frase junto al formulario",
      /INVITACION_A_RESPONDER/.test(aulaSrc) && /className="pz-aviso-turno/.test(aulaSrc),
    );
    check(
      "el formulario de respuesta se resalta y la vista va hasta él",
      /pz-turno-alumno border-2 border-primary/.test(aulaSrc) &&
        /cajaRespuesta\.current\?\.scrollIntoView/.test(aulaSrc) &&
        /\.pz-turno-alumno \{[\s\S]{0,80}animation: pz-turno/.test(estilos2),
    );
    check(
      "…sin marear a quien pide menos movimiento",
      /prefers-reduced-motion: reduce\)[\s\S]{0,120}\.pz-turno-alumno \{[\s\S]{0,40}animation: none/.test(estilos2),
    );
    check(
      "y el rótulo del avatar dice de quién es el turno, no sólo que acompaña",
      /etiqueta=\{pregunta \? "Te toca a ti" : undefined\}/.test(aulaSrc) &&
        /const rotulo = etiqueta\?\.trim\(\) \|\| ETIQUETA\[modo\]/.test(
          readFileSync(new URL("../components/leccion/avatar-2d.tsx", import.meta.url), "utf8"),
        ),
    );
  }

  // TODA OPERACIÓN QUE EL AVATAR NOMBRA SE ESCRIBE ANTES DE ENSEÑAR SU
  // RESULTADO (regla que pidió el cliente con "x/3 + 7 = 12" delante: el tutor
  // decía "multiplicamos ambos lados por 3" y la pizarra saltaba a "x + 21 =
  // 36" sin enseñar nunca la multiplicación).
  {
    const dicho = /(multiplicamos|dividimos|restamos|sumamos)\s+(?:ambos|los dos)\s+lados\s+(?:por|entre)?\s*([\d.,/]+|[a-z]?\d*[a-z])?/i;
    const ecuaciones = ["x/3 + 7 = 12", "0,5x = 4", "5x - 7 = 2x + 5", "2(x + 3) = 16", "2x + 5 = 15", "x/2 + 5 = 12"];
    const sinEscribir = [];
    for (const eq of ecuaciones) {
      const sol = solveLinearSteps(eq);
      if (!sol) continue;
      sol.steps.forEach((paso, i) => {
        const m = dicho.exec(String(paso.explica));
        if (!m) return;
        // Dos excepciones, y las dos por cómo se enseña, no por comodidad:
        //  · dividir entre el coeficiente enseña su resultado en la misma línea
        //    ("x = 5"), que es como el cliente lo aceptó en su propio dibujo;
        //  · la cancelación SÍ se escribe, pero la escribe la lección en un
        //    renglón aparte (`tiempoDeCancelacion`), no este paso.
        if (/dividimos/i.test(m[1]) || paso.accion?.tipo === "cancelacion") return;
        const numero = (m[2] ?? "").replace(",", ".");
        const escrito = String(paso.escribe ?? "");
        const registrada =
          escrito.includes(`${numero} ·`) ||
          escrito.includes(`· ${numero}`) ||
          escrito.includes(`+ ${numero}`) ||
          escrito.includes(`- ${numero}`);
        if (!registrada) sinEscribir.push(`${eq} · paso ${i}: «${paso.explica}» ⇒ «${escrito}»`);
      });
    }
    check(
      "lo que el tutor dice que hace con los dos lados queda escrito en la pizarra, no sólo dicho",
      sinEscribir.length === 0,
      sinEscribir.slice(0, 3).join(" | "),
    );
    check(
      "x/3 + 7 = 12 enseña la multiplicación, su reparto y luego el despeje",
      (() => {
        const p = (solveLinearSteps("x/3 + 7 = 12")?.steps ?? []).map((x) => x.escribe);
        return p[0] === "3 · (x/3 + 7) = 3 · 12" && p[1] === "x + 21 = 36" && p[2] === "x = 15";
      })(),
      (solveLinearSteps("x/3 + 7 = 12")?.steps ?? []).map((x) => x.escribe).join(" | "),
    );
    check(
      "y una ecuación con x en los dos lados escribe la resta antes de juntar los términos",
      (solveLinearSteps("5x - 7 = 2x + 5")?.steps ?? [])[0]?.escribe === "5x - 7 - 2x = 2x + 5 - 2x",
      (solveLinearSteps("5x - 7 = 2x + 5")?.steps ?? [])[0]?.escribe,
    );
    // DIVIDIR TAMBIÉN SE ESCRIBE (regla general del cliente: "en los ejercicios
    // con multiplicación o división en ambos miembros… la pizarra salta
    // directamente a la ecuación resultante sin proyectar el paso operativo").
    check(
      "dividir entre el coeficiente se escribe antes de enseñar la solución",
      (() => {
        const p = (solveLinearSteps("2x + 5 = 15")?.steps ?? []).map((x) => x.escribe);
        return p.includes("2x ÷ 2 = 10 ÷ 2") && p.indexOf("2x ÷ 2 = 10 ÷ 2") === p.indexOf("x = 5") - 1;
      })(),
      (solveLinearSteps("2x + 5 = 15")?.steps ?? []).map((x) => x.escribe).join(" | "),
    );
    // LA RESPUESTA NO PUEDE IR ANTES DE LA OPERACIÓN QUE LA PRODUCE.
    //
    // El cliente lo fotografió con "2(x + 3) = 16": la pizarra enseñaba
    // "2x = 10", debajo "x = 5" y DESPUÉS "2x ÷ 2 = 10 ÷ 2". La solución salía
    // de la propia línea "2x = 10", que la traía dentro como segundo renglón
    // —algo que tenía sentido cuando la división no se escribía—.
    {
      const pasos = (solveLinearSteps("2(x + 3) = 16")?.steps ?? []);
      const division = pasos.find((p) => /÷/.test(String(p.escribe)));
      const anterior = pasos[pasos.indexOf(division) - 1];
      const escenaAnterior = escenaDeLinea(
        { latex: anterior?.escribe, operacion: division?.accion, narracion: division?.explica },
        "prev",
      );
      check(
        "la línea que se va a dividir no adelanta el resultado: ni solución escrita ni marca de resuelto",
        !/pz-solucion/.test(escenaAnterior.latex ?? "") &&
          !escenaAnterior.focos.some((f) => f.tipo === "resultado" || f.final),
        `${anterior?.escribe} → ${escenaAnterior.latex}`,
      );
      check(
        "y el orden escrito es: se divide y DESPUÉS sale la solución",
        (() => {
          const escritos = pasos.map((p) => String(p.escribe));
          const iDiv = escritos.findIndex((t) => /÷/.test(t));
          const iSol = escritos.findIndex((t) => /^x = /.test(t));
          return iDiv >= 0 && iSol > iDiv;
        })(),
        pasos.map((p) => p.escribe).join(" | "),
      );
      check(
        "…también cuando el coeficiente es −1, que no tiene cifra que recuadrar",
        (() => {
          const p = (solveLinearSteps("2(x + 4) = 3x - 1")?.steps ?? []);
          const div = p.find((x) => /÷/.test(String(x.escribe)));
          const prev = p[p.indexOf(div) - 1];
          const e = escenaDeLinea({ latex: prev?.escribe, operacion: div?.accion, narracion: div?.explica }, "u");
          return !/pz-solucion/.test(e.latex ?? "") && e.focos.length > 0;
        })(),
      );
    }
    check(
      "…y esa línea lleva su foco, para que no aparezca antes de que la voz la cuente",
      (() => {
        const paso = (solveLinearSteps("2x + 5 = 15")?.steps ?? []).find((x) => x.escribe === "x = 5");
        const e = escenaDeLinea({ latex: "2x ÷ 2 = 10 ÷ 2", operacion: paso?.accion, narracion: paso?.explica }, "d");
        return e.focos.length > 0 && e.focos[0].narracion === paso?.explica;
      })(),
    );

    // CADA LÍNEA, CON SU FRASE — Y LA MISMA EN EL MOTOR Y EN LA PIZARRA.
    //
    // El cliente fotografió "2(x + 4) = 3x − 1": dos líneas aparecían de golpe
    // "sin coincidir con lo que dice el avatar". Pasaba porque esas líneas no
    // llevaban etiqueta: la pizarra las componía como si fueran un polinomio de
    // derivadas —"miramos el término 2 por x, su coeficiente es 2…"— y no podía
    // reconocer ninguna frase del tutor, así que no avanzaba con la voz.
    check(
      "la frase que tacha los términos con incógnita es la MISMA en el motor y en la pizarra",
      fraseCancelacionIncognita(2, 3, "x") === fraseDeCancelacionDeIncognita(2, 3, "x") &&
        fraseCancelacionIncognita(5, 2, "y") === fraseDeCancelacionDeIncognita(5, 2, "y"),
      `${fraseCancelacionIncognita(2, 3, "x")} ≠ ${fraseDeCancelacionDeIncognita(2, 3, "x")}`,
    );
    check(
      "una ecuación con incógnita a los dos lados NO se cuenta como un polinomio de derivadas",
      escenaDePolinomio("2x + 8 = 3x - 1", "x") === null && escenaDePolinomio("3x² + 2x", "x") !== null,
    );
    {
      // Toda línea escrita de la lección que el cliente grabó tiene que traer
      // foco, y su foco tiene que decir lo que el tutor dice en ese momento.
      const enLeccion = (crudo) => processLSG(crudo, crudo.intencion, "prueba").lsg;
      const ev = simularLeccion(enLeccion(linealResueltaLSG({ nivel: "dificil", instancia: "2(x + 4) = 3x - 1" })));
      const escritas = ev.filter((e) => e.d.tipo === "pizarra" && e.d.accion === "escribir");
      const sinFoco = escritas
        .map((e) => ({ texto: e.d.contenido, escena: escenaDeLinea({ latex: e.d.contenido, operacion: e.d.operacion, narracion: e.d.narracion }, "x") }))
        .filter(({ escena }) => !escena || escena.focos.length === 0 || escena.clase === "polinomio");
      check(
        "2(x + 4) = 3x − 1: ninguna línea se queda sin foco ni se compone como un polinomio",
        sinFoco.length === 0,
        sinFoco.map((x) => x.texto).join(" · "),
      );
      const iResta = ev.findIndex((e) => e.d.tipo === "hablar" && /restamos 3x en los dos lados/i.test(e.d.texto));
      const iTacha = ev.findIndex((e) => e.d.tipo === "hablar" && /A la derecha se cancela 3x con -3x/.test(e.d.texto));
      const focoEn = (i) => ev[i]?.escenas?.[ev[i]?.escena]?.focos?.[ev[i]?.foco];
      check(
        "cuando dice «restamos 3x en los dos lados» la pizarra lo ESCRIBE, y tacha al decir que se cancela",
        iResta >= 0 && iTacha > iResta &&
          focoEn(iResta)?.tipo === "caja" && focoEn(iResta)?.clase === "pz-uniforme" &&
          focoEn(iTacha)?.tipo === "tachado",
        `escribir: ${focoEn(iResta)?.tipo}/${focoEn(iResta)?.clase} · tachar: ${focoEn(iTacha)?.tipo}`,
      );
    }
  }
}

// ── EL DESPLIEGUE TIENE QUE PODER CONSTRUIR LA APLICACIÓN ───────────────────
//
// Durante semanas el cliente abrió la URL de las guías de prueba y vio la misma
// versión de siempre. No era la pizarra: el blueprint de Render se había quedado
// en el prototipo —instalaba dependencias y arrancaba, sin compilar—, así que
// cada despliegue de la aplicación Next moría al arrancar y Render seguía
// sirviendo el último contenedor que sí arrancó, de agosto.
//
// Esto es lo que impide que vuelva a pasar sin que nadie se entere.
{
  const paquete = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const blueprint = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");
  const arranque = String(paquete.scripts?.start ?? "");
  const construccion = /buildCommand:\s*(.+)/.exec(blueprint)?.[1]?.trim() ?? "";
  const despliegue = String(paquete.scripts?.["vercel-build"] ?? "");

  check(
    "arrancar la aplicación exige haberla compilado antes (`next start` no compila)",
    /next start/.test(arranque),
    arranque,
  );
  check(
    "y el blueprint de despliegue la compila: instalar no basta",
    /npm run (build|vercel-build)/.test(construccion),
    construccion,
  );
  check(
    "el despliegue usa la MISMA secuencia que Vercel: generar, migrar, sembrar y compilar",
    /vercel-build/.test(construccion) && /prisma generate/.test(despliegue) && /next build/.test(despliegue),
    `${construccion} · ${despliegue}`,
  );
  const pideTipos = /--experimental-strip-types/.test(despliegue);
  const nodeBlueprint = /key: NODE_VERSION[\s\S]{0,60}?value: "([^"]+)"/.exec(blueprint)?.[1] ?? "";
  const suficiente = (v) => {
    const [may, men = 0] = String(v).split(".").map(Number);
    return may > 22 || (may === 22 && men >= 6);
  };
  check(
    "si la siembra necesita el intérprete de tipos, el despliegue fija un Node que lo tiene (≥ 22.6)",
    !pideTipos || suficiente(nodeBlueprint),
    `NODE_VERSION=${nodeBlueprint}`,
  );
  check(
    "y el paquete declara ese mínimo, para que ninguna plataforma elija un Node que no puede construirlo",
    !pideTipos || suficiente(String(paquete.engines?.node ?? "").replace(/[^\d.]/g, "")),
    `engines.node=${paquete.engines?.node}`,
  );
  check(
    "el blueprint pide los secretos que la aplicación necesita para algo más que arrancar",
    ["DATABASE_URL", "AUTH_SECRET", "GEMINI_API_KEY"].every((k) => blueprint.includes(`key: ${k}`)),
  );
  check(
    "y deja hueco a la voz neuronal, sin escribir ninguna clave en el repositorio",
    /key: GOOGLE_TTS_API_KEY[\s\S]{0,40}sync: false/.test(blueprint) &&
      /key: ELEVENLABS_API_KEY[\s\S]{0,40}sync: false/.test(blueprint),
  );
  // Y desde fuera se comprueba qué versión está viva sin entrar a ningún panel:
  // `/api/health` publica el commit desplegado, y la lección lo enseña bajo el
  // avatar. Es lo que convierte "está igual" en una pregunta con respuesta.
  const nucleo = readFileSync(new URL("../src/queryCore.js", import.meta.url), "utf8");
  const saludRuta = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  check(
    "la salud del servicio publica el commit desplegado, y la ruta lo devuelve",
    /VERCEL_GIT_COMMIT_SHA[\s\S]{0,120}RENDER_GIT_COMMIT/.test(nucleo) &&
      /const base = salud\(\);/.test(saludRuta) && /\.\.\.base/.test(saludRuta),
  );
  check(
    "y la pantalla de la lección enseña ese mismo build, para verlo sin consola",
    /build \{VERSION\}/.test(readFileSync(new URL("../components/leccion/aula.tsx", import.meta.url), "utf8")),
  );

  // CORREGIR EL BLUEPRINT NO BASTA: una plataforma sólo lo relee si el servicio
  // sigue enlazado a él, y el del cliente tiene sus ajustes puestos a mano —los
  // del prototipo—. El único gancho que se ejecuta pase lo que pase es
  // `postinstall`, que llama `npm install`: ahí se construye la aplicación.
  const preparacion = readFileSync(new URL("../scripts/despliegue.mjs", import.meta.url), "utf8");
  check(
    "instalar dependencias construye la aplicación allí donde se despliega",
    /scripts\/despliegue\.mjs/.test(String(paquete.scripts?.postinstall ?? "")) && /next build/.test(preparacion),
    `postinstall: ${paquete.scripts?.postinstall}`,
  );
  check(
    "…y no en un portátil ni en Vercel, donde sería compilar dos veces",
    /enVercel[\s\S]{0,400}vercel-build/.test(preparacion) &&
      /Instalación local: nada más que hacer/.test(preparacion),
  );
  check(
    "la base de datos no puede tumbar un despliegue: migrar y sembrar avisan, compilar manda",
    /ejecutar\("prisma migrate deploy", \{ obligatorio: false \}\)/.test(preparacion) &&
      /seed\.ts", \{ obligatorio: false \}\)/.test(preparacion) &&
      /ejecutar\("next build", \{ obligatorio: true \}\)/.test(preparacion),
  );
  check(
    "y se puede comprobar desde fuera qué versión está viva, con una orden",
    /qa\/despliegue\.mjs/.test(readFileSync(new URL("../package.json", import.meta.url), "utf8")) &&
      /x-powered-by/.test(readFileSync(new URL("./despliegue.mjs", import.meta.url), "utf8")),
  );

  check(
    "compilar en el plan gratuito no se queda sin memoria a mitad",
    /NODE_OPTIONS[\s\S]{0,120}max-old-space-size/.test(blueprint),
  );
  // Los dos flujos de GitHub que responden solos a "¿compila?" y "¿está
  // desplegado?" viajan aparte: crear ficheros en `.github/workflows` exige un
  // permiso que esta credencial no tiene. Cuando estén en el repositorio, esta
  // comprobación los exige; mientras tanto no penaliza no tenerlos.
  const flujo = (nombre) => {
    try {
      return readFileSync(new URL(`../.github/workflows/${nombre}`, import.meta.url), "utf8");
    } catch {
      return null;
    }
  };
  const ci = flujo("verificacion.yml");
  const vigilancia = flujo("despliegue.yml");
  if (ci) {
    check(
      "en cada push a main se compila el repositorio desde cero y se pasan las baterías",
      /npm ci/.test(ci) && /npm run build/.test(ci) && /qa\/hito2\.mjs/.test(ci) && /branches: \[main\]/.test(ci),
    );
  }
  if (vigilancia) {
    check(
      "y se vigila que lo desplegado sea lo de main, con aviso cuando no lo es",
      /qa\/despliegue\.mjs/.test(vigilancia) && /schedule/.test(vigilancia) && /workflow_dispatch/.test(vigilancia),
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
