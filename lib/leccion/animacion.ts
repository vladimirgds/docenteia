import {
  leerSumaOResta,
  marcasDeColumna,
  operacionDeLinea,
  type OperacionEnColumna,
} from "./columna.ts";
import { notacionFormal, pareceMatematica, planoALatex } from "../matematicas/index.ts";
import {
  escenaDePasoSemantico,
  etiquetaValida,
  leerAmplificacion,
  leerSumaDeFracciones,
  miembros,
  type PasoSemantico,
  type TipoOperacion,
} from "./marcado.ts";

/**
 * EL GUION DE LA PIZARRA ANIMADA.
 *
 * Convierte una línea de la lección —"24 + 17", "3x⁴ - 2x²", "3x + 5 = 20"— en
 * una ESCENA: el LaTeX ya marcado y la lista de FOCOS que se encienden uno tras
 * otro sobre él, cada uno con lo que el tutor dice mientras está encendido.
 *
 * POR QUÉ EL GUION VIVE AQUÍ Y NO EN EL COMPONENTE
 * Porque así se puede comprobar sin navegador. Que la llevada de 24 + 17 sea un
 * 1 sobre las decenas, y no sobre las unidades, es una afirmación matemática:
 * merece una prueba, no una inspección visual. El componente sólo pinta lo que
 * este módulo decide.
 *
 * CÓMO SE MARCA
 * Cada trozo resaltable se envuelve en `\htmlClass{...}`, que KaTeX conserva en
 * el HTML. El componente busca después esas clases en el DOM, mide su caja y
 * dibuja el recuadro en una capa SVG por encima. La fórmula se compone UNA vez
 * y no se vuelve a tocar: encender un foco no recompila nada, que es la
 * diferencia entre una animación y un parpadeo.
 *
 * Varias piezas pueden compartir clase —las tres cifras de una columna la
 * comparten— y entonces el recuadro las abarca a todas. Es lo que dibuja la
 * caja vertical sobre una columna de la cuenta.
 */

export type TipoFoco = "caja" | "resultado" | "tachado";

export interface Foco {
  /** Clase que marca en el LaTeX las piezas que abarca este foco. */
  clase: string;
  tipo: TipoFoco;
  /** Lo que se dice mientras está encendido. Es la unidad de sincronización. */
  narracion: string;
  /** Rótulo corto que se dibuja junto al recuadro ("llevo 1"). */
  etiqueta?: string;
  /**
   * La pieza ENCIMA de la cual va el rótulo, si no es la del recuadro.
   *
   * "llevo 1" va sobre la cifra de la llevada —el 1 pequeño que se escribe en
   * la columna de la izquierda—, "estrictamente arriba y sin tocarla", como lo
   * pide el informe del cliente (SUB-NOT-04); no sobre la columna que la
   * produce.
   */
  anclaEtiqueta?: string;
  /**
   * Piezas que este foco enmarca POR SEPARADO, cada una con su caja.
   *
   * Sin esto, dos trozos que comparten clase se enmarcan en UNA sola caja que
   * los abarca a los dos y a todo lo que quede en medio. Para una columna eso
   * es lo que se quiere; para una cancelación a los dos lados de una ecuación
   * es un disparate: la caja se comía el "= 16" y la tachadura cruzaba el signo
   * igual, que no se cancela con nada.
   */
  piezas?: string[];
  /**
   * La palabra por la que el tutor llama a este paso: "unidades", "decenas".
   *
   * Es la señal más fiable para seguirle, porque la dice con cualquier
   * redacción —"sumamos las decenas", "ahora las decenas", "toca decenas"—
   * mientras que las cifras y los verbos cambian de una frase a otra.
   */
  pista?: string;
  /**
   * ES LA RESPUESTA FINAL DEL EJERCICIO.
   *
   * Sólo ella se enmarca y lleva el visto verde. Antes el visto acompañaba a
   * cualquier foco de tipo "resultado", y el cliente lo fotografió flotando
   * sobre la x de "2x + 6 = 16 − 6": en ese paso no se ha resuelto nada —se
   * están quitando el +6 y el −6—, y una marca de "correcto" ahí le dice al
   * alumno que la x ya está resuelta. Un resultado intermedio se subraya; la
   * respuesta final se enmarca y se confirma.
   */
  final?: boolean;
  /**
   * El foco se enseña con el CONECTOR de la distributiva —la escuadra que sale
   * del factor, pasa por debajo de la expresión y sube con su flecha al
   * término—, sin recuadros: el cliente lo dibujó así ("para que se note la
   * flecha") y los recuadros encima de cada término lo ensuciaban.
   */
  conector?: boolean;
}

export interface Escena {
  id: string;
  /** La línea original, en la notación plana del motor. */
  texto: string;
  /**
   * LaTeX marcado, listo para componer una sola vez.
   *
   * `null` en las escenas de prosa: una frase entera compuesta como fórmula
   * sale en cursiva matemática y sin espacios, ilegible. Esas se pintan como
   * texto, con sus fórmulas sueltas resueltas por el camino de siempre.
   */
  latex: string | null;
  /** Frase con la que entra la escena, antes del primer foco. */
  narracion: string;
  focos: Foco[];
  /** De dónde salió: sirve para depurar y para las pruebas. */
  clase:
    | "columna"
    | "polinomio"
    | "despeje"
    | "simplificacion"
    | "amplificacion"
    | "suma-fracciones"
    | "distributiva"
    | "semantica"
    | "cierre"
    | "texto";
  /**
   * Quién decidió qué se marca: la instrucción de foco que traía el paso, o la
   * deducción a partir de su contenido porque no traía ninguna.
   *
   * No cambia el dibujo. Sirve para poder AFIRMAR, y comprobar en un navegador,
   * que un paso etiquetado por el motor se pinta con su etiqueta y no con una
   * suposición.
   */
  origen?: "etiqueta" | "deduccion";
  /**
   * LA LÍNEA QUE ESTA ESCENA YA DEJA ESCRITA POR DEBAJO.
   *
   * El reparto de un paréntesis se compone en DOS renglones —"2(x + 4) = 3x − 1"
   * y, alineado por el igual, "2x + 8 = 3x − 1"—, porque repartir cambia un
   * miembro y la línea siguiente es la ecuación ya sin paréntesis. Esa segunda
   * línea es, a la vez, el eslabón siguiente del hilo conductor, y el motor la
   * escribe además como paso propio: desde que el hilo vive entero en el
   * Ambiente 1, salía dos veces seguidas.
   *
   * Declarándola aquí, la pizarra sabe que ya está escrita y no la repite.
   */
  continuacion?: string;
}

/** Nombre de cada posición decimal, de derecha a izquierda. */
const POSICIONES = [
  "unidades",
  "decenas",
  "centenas",
  "unidades de millar",
  "decenas de millar",
  "centenas de millar",
];

/** Las cifras de un número, alineadas a la derecha en `ancho` columnas. */
function cifras(n: number, ancho: number): string[] {
  const texto = String(n);
  const relleno = Array.from({ length: Math.max(0, ancho - texto.length) }, () => "");
  return [...relleno, ...texto.split("")];
}

/** Envuelve un trozo de LaTeX en una clase que el componente sabrá encontrar. */
function marcar(clase: string, contenido: string): string {
  return `\\htmlClass{${clase}}{${contenido}}`;
}

// ── Aritmética en columna ────────────────────────────────────────────────────

/**
 * La cuenta en columna, con una caja por columna y las llevadas encima.
 *
 * Es el caso que el pliego pide con más detalle: "resaltado sobre columnas,
 * cifras operadas, llevadas y reagrupaciones". Se recorre de derecha a
 * izquierda, como se hace la cuenta, y cada foco dice en voz alta lo que está
 * señalando.
 */
export function escenaDeColumna(texto: string, id: string): Escena | null {
  // Se aceptan las dos formas en que llega una cuenta: escrita en una línea
  // ("234 + 178") y DIBUJADA en columna por el motor, que es como viene en el
  // desarrollo de la lección. Leyendo sólo la primera, el desarrollo se quedaba
  // fuera de la animación: la pizarra de arriba enseñaba la suma ya resuelta
  // mientras la de abajo iba por el primer paso.
  const op = operacionDeLinea(texto);
  if (!op) return null;

  const ancho = Math.max(String(op.a).length, String(op.b).length, String(op.resultado).length);
  const da = cifras(op.a, ancho);
  const db = cifras(op.b, ancho);
  const dr = cifras(op.resultado, ancho);
  const marcas = marcasDeColumna(op, ancho);

  /**
   * EN QUÉ PASO APARECE CADA CIFRA.
   *
   * La cuenta NO se muestra resuelta desde el principio: al empezar sólo están
   * los dos sumandos, y cada columna va soltando su cifra del resultado y su
   * llevada cuando le toca. Verla ya hecha y limitarse a pasear un recuadro por
   * encima no es una lección animada; es un resultado con adornos.
   *
   * Los focos recorren las columnas de derecha a izquierda: el foco `f` opera
   * la columna `ancho - 1 - f`. De ahí salen las dos cuentas:
   *
   *   · la cifra del resultado de la columna `i` aparece en el foco `ancho-1-i`;
   *   · la llevada escrita sobre la columna `j` la produce la columna `j+1`, así
   *     que aparece en el foco `ancho-2-j`, a la vez que la cifra de abajo.
   */
  const pasoDeColumna = (i: number) => ancho - 1 - i;
  const pasoDeMarca = (j: number) => ancho - 2 - j;

  /** Une la clase de la columna con la del paso en que la pieza se revela. */
  const conRevelado = (clases: string, paso: number, valor: string) =>
    marcar(`${clases} pz-rev-${Math.max(0, paso)}`, valor);

  // Cada celda lleva la clase de SU columna; el recuadro que las abarca a todas
  // es lo que dibuja la caja vertical.
  const celda = (columna: number, valor: string) =>
    valor === "" ? "" : marcar(`pz-col-${columna}`, valor);

  const filas: string[] = [];
  if (marcas.some(Boolean)) {
    filas.push(
      [
        "",
        // La llevada lleva TAMBIÉN la clase de SU columna (`pz-col-${j}`), la
        // misma que las cifras que tiene debajo. No dibuja una caja propia —el
        // foco de la columna no tiene una pieza separada para ella—, pero SÍ
        // entra en la medición de esa caja, y eso es lo que corrige un
        // solapamiento real: cuando una columna recibe una llevada Y ADEMÁS
        // genera la suya propia (una cadena de llevadas seguidas, "234 + 876"),
        // el rótulo "llevo 1" de esa columna se apoya en el TOPE de su caja
        // —`caja.y`— para no tapar las cifras; sin la llevada dentro de esa
        // caja, el tope quedaba por DEBAJO de ella, y el rótulo aterrizaba
        // encima del "1" pequeño de la columna vecina en vez de sobre su
        // propia cifra. Con la llevada dentro, la caja crece hacia arriba para
        // incluirla, y el mismo `dy` relativo que ya despeja las cifras
        // despeja también a ella.
        ...marcas.map((m, j) =>
          m ? conRevelado(`pz-llevada-${j} pz-col-${j}`, pasoDeMarca(j), `\\scriptstyle ${m}`) : "",
        ),
      ].join(" & "),
    );
  }
  filas.push(["", ...da.map((d, i) => celda(i, d))].join(" & "));
  filas.push([op.operador, ...db.map((d, i) => celda(i, d))].join(" & "));

  const cuerpo = filas.join(" \\\\ ") + " \\\\ \\hline";
  // El renglón del resultado, con un puntal invisible que lo separa de la raya:
  // la cápsula de la respuesta necesita ese hueco para no cruzar la raya ni la
  // cifra de encima.
  const total =
    " " +
    [
      "\\rule{0pt}{1.3em}",
      ...dr.map((d, i) =>
        d === "" ? "" : conRevelado(`pz-resultado pz-col-${i}`, pasoDeColumna(i), d),
      ),
    ].join(" & ");
  const latex = `\\begin{array}{${"r" + "c".repeat(ancho)}} ${cuerpo}${total} \\end{array}`;

  return {
    id,
    texto,
    latex,
    narracion:
      op.operador === "+"
        ? `Vamos a sumar ${op.a} más ${op.b}, columna por columna.`
        : `Vamos a restar ${op.b} de ${op.a}, columna por columna.`,
    clase: "columna",
    focos: [...focosDeColumna(op, ancho, da, db), focoDelResultado(op)],
  };
}

function focosDeColumna(
  op: OperacionEnColumna,
  ancho: number,
  da: string[],
  db: string[],
): Foco[] {
  const focos: Foco[] = [];
  let arrastre = 0;

  for (let i = ancho - 1; i >= 0; i--) {
    const posicion = POSICIONES[ancho - 1 - i] ?? "la columna siguiente";
    const arriba = Number(da[i] || 0);
    const abajo = Number(db[i] || 0);

    if (op.operador === "+") {
      const suma = arriba + abajo + arrastre;
      const escrita = suma % 10;
      const llevada = suma >= 10 ? 1 : 0;

      const conArrastre = arrastre ? ` más ${arrastre} que llevábamos` : "";
      const narracion = llevada
        ? `${mayuscula(posicion)}: ${arriba} más ${abajo}${conArrastre} son ${suma}. Escribo ${escrita} y llevo 1.`
        : `${mayuscula(posicion)}: ${arriba} más ${abajo}${conArrastre} son ${suma}.`;

      focos.push({
        clase: `pz-col-${i}`,
        tipo: "caja",
        narracion,
        pista: posicion,
        ...(llevada && i - 1 >= 0 ? { etiqueta: "llevo 1", anclaEtiqueta: `pz-llevada-${i - 1}` } : {}),
      });
      arrastre = llevada;
      continue;
    }

    // Resta: el préstamo es la reagrupación, y se nombra como tal.
    const minuendo = arriba - arrastre;
    const prestado = minuendo < abajo;
    const efectivo = prestado ? minuendo + 10 : minuendo;
    // Con préstamo, la cifra de arriba ya no es la escrita: se nombran las dos,
    // porque el alumno ve una y el tutor opera con la otra.
    const arribaDicho = arrastre ? `${arriba}, ya rebajado a ${minuendo},` : String(minuendo);
    const narracion = prestado
      ? `${mayuscula(posicion)}: a ${arribaDicho} no le puedo quitar ${abajo}, así que pido prestada una decena: ${efectivo} menos ${abajo} son ${efectivo - abajo}.`
      : `${mayuscula(posicion)}: ${arribaDicho} menos ${abajo} son ${efectivo - abajo}.`;

    focos.push({
      clase: `pz-col-${i}`,
      tipo: "caja",
      narracion,
      pista: posicion,
      ...(prestado && i - 1 >= 0 ? { etiqueta: "reagrupo", anclaEtiqueta: `pz-llevada-${i - 1}` } : {}),
    });
    arrastre = prestado ? 1 : 0;
  }

  return focos;
}

// El total de la cuenta ES la respuesta del ejercicio: una suma o una resta en
// columna no tiene un paso después. Por eso es de los pocos que se enmarcan.
function focoDelResultado(op: OperacionEnColumna): Foco {
  return {
    clase: "pz-resultado",
    tipo: "resultado",
    narracion: `El resultado es ${op.resultado}.`,
    final: true,
  };
}

// ── Polinomios y derivadas ───────────────────────────────────────────────────

interface TerminoPolinomio {
  signo: string;
  coeficiente: string;
  variable: string;
  exponente: string;
}

const SUPERINDICES: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-", "⁺": "+", "ⁿ": "n",
};

/** Lee un polinomio de una variable. Estricto: lo que no encaja, no se anima. */
function leerTerminos(expresion: string): TerminoPolinomio[] | null {
  let s = String(expresion ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  if (!s) return null;
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ]+/g, (m) => {
    const exp = [...m].map((c) => SUPERINDICES[c] ?? "").join("");
    return exp ? `^${exp}` : "";
  });
  s = s.replace(/\^\{([^{}]*)\}/g, "^$1");

  const terminos: TerminoPolinomio[] = [];
  const patron = /([+-]?)(\d*)([a-zA-Z]?)(?:\^(-?\d+|n(?:-\d+)?))?/g;
  let consumido = 0;
  let m: RegExpExecArray | null;

  while ((m = patron.exec(s)) !== null) {
    if (m[0] === "") {
      patron.lastIndex++;
      continue;
    }
    if (m.index !== consumido) return null;
    consumido = m.index + m[0].length;
    const [, signo, coeficiente, variable, exponente] = m;
    if (!coeficiente && !variable) return null;
    terminos.push({
      signo,
      coeficiente,
      variable: variable ?? "",
      exponente: exponente ?? "",
    });
  }

  if (consumido !== s.length || terminos.length === 0) return null;

  // Una sola variable en toda la expresión. Sin esto, una frase entera —"Vamos
  // a ver la regla"— encaja letra a letra en el patrón y la pizarra se pone a
  // señalar sílabas como si fueran términos.
  const variables = new Set(terminos.map((t) => t.variable).filter(Boolean));
  if (variables.size > 1) return null;
  // Y al menos una cifra: sin números no hay coeficiente ni exponente que
  // resaltar, y lo que quede no es un polinomio que animar.
  if (!terminos.some((t) => t.coeficiente || t.exponente)) return null;

  return terminos;
}

/**
 * Un polinomio con un foco por término, y dentro de cada uno su coeficiente y
 * su exponente.
 *
 * Es lo que el tutor nombra al aplicar la regla de la potencia —"baja el
 * exponente y multiplica al coeficiente"— y hasta ahora el alumno tenía que
 * adivinar a qué cifra se refería.
 */
export function escenaDePolinomio(texto: string, id: string): Escena | null {
  const lados = String(texto ?? "").split("=");
  if (lados.length > 2) return null;

  // UNA ECUACIÓN CON INCÓGNITA A LOS DOS LADOS NO ES UN POLINOMIO QUE RECORRER.
  //
  // "2x + 8 = 3x - 1" caía aquí por descarte y la pizarra lo contaba como si
  // fuera una derivada: "miramos el término 2 por x, su coeficiente es 2…",
  // mientras el tutor hablaba de otra cosa. El cliente lo fotografió: dos
  // líneas que "aparecen de golpe, sin coincidir con lo que dice el avatar"
  // —porque la pizarra no podía reconocer ninguna de esas frases—.
  if (lados.length === 2) {
    const conIncognita = (t: string) => /[a-zA-Z]/.test(String(t).replace(/[a-zA-Z]+\s*\(/g, ""));
    if (conIncognita(lados[0]) && conIncognita(lados[1])) return null;
  }

  const terminos = leerTerminos(lados[0]);
  if (!terminos) return null;
  // Un número suelto no es un polinomio que animar término a término.
  if (terminos.length === 1 && !terminos[0].variable) return null;

  const focos: Foco[] = [];
  const compuesto = terminos
    .map((t, i) => {
      const signo = t.signo === "-" ? " - " : i > 0 ? " + " : "";
      const coeficiente =
        t.coeficiente && t.variable ? marcar(`pz-coef-${i}`, t.coeficiente) : t.coeficiente;
      const exponente = t.exponente ? `^{${marcar(`pz-exp-${i}`, t.exponente)}}` : "";
      const cuerpo = `${coeficiente}${t.variable}${exponente}`;

      // EL TÉRMINO, DICHO COMO SE LEE. "2x elevado a 5" se oye como (2x)⁵, que es
      // otra cosa: el coeficiente MULTIPLICA a la potencia, no se eleva con ella.
      // Y el término de "- 3x⁴" es MENOS 3x⁴: el signo va con el término.
      const negativo = t.signo === "-";
      const legible = [
        negativo ? "menos " : "",
        t.coeficiente ? `${t.coeficiente}${t.variable ? " por " : ""}` : "",
        t.variable,
        t.exponente ? ` elevado a ${t.exponente}` : "",
      ].join("");
      focos.push({
        clase: `pz-term-${i}`,
        tipo: "caja",
        narracion: `Miramos el término ${legible.trim()}.`,
      });
      // Señalar el coeficiente o el exponente no es llegar a ningún resultado:
      // van en caja, con su rótulo. Con el subrayado y el visto de un resultado
      // parecía que el coeficiente fuera ya la respuesta.
      if (t.coeficiente && t.variable) {
        focos.push({
          clase: `pz-coef-${i}`,
          tipo: "caja",
          // CON SU SIGNO: el coeficiente de "- 3x⁴" es menos 3, y es ese menos el
          // que baja con la regla de la potencia hasta el -12x³ del resultado.
          narracion: `Su coeficiente es ${negativo ? "menos " : ""}${t.coeficiente}.`,
          etiqueta: "coeficiente",
        });
      }
      if (t.exponente) {
        focos.push({
          clase: `pz-exp-${i}`,
          tipo: "caja",
          narracion: `Su exponente es ${t.exponente}.`,
          etiqueta: "exponente",
        });
      }

      return `${signo}${marcar(`pz-term-${i}`, cuerpo)}`;
    })
    .join("")
    .trim();

  const derecha = lados[1] ? ` = ${planoALatex(lados[1].trim())}` : "";

  return {
    id,
    texto,
    latex: `${compuesto}${derecha}`,
    narracion: "Vamos término a término.",
    clase: "polinomio",
    focos,
  };
}

// ── Despeje con cancelación ──────────────────────────────────────────────────

/**
 * Una ecuación lineal con la constante RESTADA A LOS DOS LADOS y cancelada
 * dentro del miembro en el que estaba.
 *
 * La cancelación es el momento en que se entiende el despeje: el +6 y el −6 se
 * van juntos. Pero se van DENTRO DE SU MIEMBRO. El cliente lo corrigió con
 * palabras que no admiten matiz: "es matemáticamente incorrecto tachar el +6 del
 * lado izquierdo con el −6 del lado derecho a través del signo igual". Lo que se
 * escribe, entonces, es la propiedad uniforme aplicada de verdad —el −6 en los
 * dos miembros—, con el tachado sólo sobre el par opuesto de la izquierda:
 *
 *   2x + 6 − 6 = 16 − 6        (tachados el +6 y el −6 de la izquierda)
 *          2x = 10             (la resta del miembro derecho, en la línea siguiente)
 *
 * A la derecha no se tacha nada: queda la resta simple, que es lo que da 10.
 */
export function escenaDeDespeje(texto: string, id: string): Escena | null {
  const limpio = String(texto ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  // ax + b = c, con b opcional en signo.
  const m = limpio.match(/^(-?\d*)([a-zA-Z])([+-]\d+)?=(-?\d+)$/);
  if (!m) return null;

  const [, coefCrudo, variable, terminoCrudo, derechaCruda] = m;
  const coeficiente = coefCrudo === "" || coefCrudo === "+" ? 1 : coefCrudo === "-" ? -1 : Number(coefCrudo);
  if (!Number.isFinite(coeficiente) || coeficiente === 0) return null;
  const b = terminoCrudo ? Number(terminoCrudo) : 0;
  const c = Number(derechaCruda);

  const unitario = coeficiente === 1 || coeficiente === -1;

  /**
   * LA ECUACIÓN SE COMPONE MIEMBRO A MIEMBRO.
   *
   * Y las marcas se ponen DENTRO de un miembro, nunca sobre la cadena entera.
   * Es la diferencia entre señalar el término que se cancela y señalar un tramo
   * que empieza en un miembro y acaba en el otro: eso último se llevaba por
   * delante el signo igual y el número del otro lado —"+ 6 = 16 - 6"—, que como
   * afirmación matemática es falsa.
   *
   * El igual se escribe aquí, entre los dos, y no forma parte de ninguna marca.
   */
  // El coeficiente sólo se marca cuando está escrito. En "x + 5 = 20" no hay
  // un 1 que señalar, y dibujar un recuadro sobre nada deja la caja flotando.
  // Y sólo en el paso en que se DIVIDE entre él: en "2x + 6 = 16" el 2 no se
  // toca, y marcado salía en color junto a la x mientras se quitaba el 6.
  const coefLatex = unitario
    ? `${coeficiente === -1 ? "-" : ""}`
    : b === 0
      ? marcar("pz-coef-despeje", String(coeficiente))
      : String(coeficiente);
  // Cada término que se cancela lleva SU clase además de la común: la común
  // identifica el foco, las propias delimitan una caja por término.
  const terminoLatex =
    b === 0
      ? ""
      : ` ${b > 0 ? "+" : "-"} ${marcar("pz-cancela pz-cancela-termino", String(Math.abs(b)))}`;

  const solucion = formatearRacional(c - b, coeficiente);

  // "x = 5" TAL CUAL: no queda nada que despejar. Es la solución, y se enmarca
  // como respuesta final —sin un "x = 5 ⇒ x = 5" que repita la línea—.
  if (coeficiente === 1 && b === 0) {
    return {
      id,
      texto,
      latex: `${variable} = ${marcar("pz-solucion", racionalLatex(c, 1))}`,
      narracion: `Ya tenemos la ${variable} sola.`,
      clase: "despeje",
      focos: [{ clase: "pz-solucion", tipo: "resultado", narracion: `${variable} vale ${solucion}.`, final: true }],
    };
  }

  /**
   * UN PASO, UNA OPERACIÓN.
   *
   * Sobre "2x + 6 = 16" se quita el 6 de los dos lados, y nada más: dividir
   * entre 2 es lo que se hace en la línea SIGUIENTE, "2x = 10", que ya tiene su
   * propia escena. Antes esta escena hacía las dos cosas a la vez —cancelaba,
   * luego encendía el coeficiente con la marca de resultado y acababa en
   * "⇒ x = 5"—, y el cliente fotografió el visto verde flotando sobre la x
   * mientras la voz hablaba del 6: una marca de "resuelto" en un paso en el que
   * no se ha resuelto nada. Ahora el foco está únicamente en lo que se resta, el
   * +6 y el −6.
   *
   * Sólo cuando la x queda sola al cancelar ("x + 5 = 20") la misma escena
   * llega a la solución, porque no hay ningún paso más en medio.
   */
  const cancela = b !== 0;
  const divide = !cancela && !unitario;
  /**
   * CUANDO EL TACHADO VIVE EN SU PROPIO RENGLÓN.
   *
   * El cliente pidió que los pasos NO se sobrescriban: que la resta escrita en
   * los dos lados y la cancelación tachada queden las dos a la vista, una
   * debajo de otra, como en un cuaderno. Entonces esta línea hace sólo la
   * primera mitad —escribir la resta— y el tachado se dibuja en el renglón
   * siguiente, que el motor escribe a continuación (`escenaDeCancelacion`).
   *
   * Sin esta opción —una línea deducida, sin guion que la acompañe— la escena
   * sigue haciendo las dos cosas, para no dejar una cancelación sin tachar.
   */
  //
  // Y lo mismo vale para la división: desde que el motor la escribe en su propio
  // renglón —"2x ÷ 2 = 10 ÷ 2"—, esta línea NO puede adelantar el resultado. El
  // cliente lo fotografió: la pizarra enseñaba "2x = 10", debajo "x = 5" y
  // DESPUÉS la división que lo produce. La respuesta antes de la operación.
  //
  // Y ESTA ESCENA NUNCA ADELANTA LA SOLUCION NI TACHA POR SU CUENTA.
  //
  // Antes lo hacia cuando la linea llegaba sola al final ("x + 3 = 8"), porque
  // entonces el motor no escribia los pasos intermedios. Ahora si los escribe:
  // la resta en los dos lados, la cancelacion tachada, la division en fraccion
  // y la solucion, cada una en su renglon. Dejar que ademas los adelantara esta
  // linea producia lo que el cliente fotografio en la practica: el enunciado
  // —que llega SIN etiqueta, porque es un enunciado— se pintaba ya tachado y
  // con "x = 5" debajo, y despues aparecia otra vez la misma igualdad tachada.
  //
  // Un renglon, un tiempo: aqui se ESCRIBE la resta y nada mas.
  const soloEscritura = true;
  const llegaALaSolucion = false;
  // Con "x" a secas y sin constante —"-x = -9"— no hay cifra que recuadrar: el
  // gesto se marca sobre el propio término. Si no, esta línea se quedaría sin
  // foco, y una línea sin foco no se sincroniza con la voz.
  const marcaElTermino = soloEscritura && !cancela && !divide;

  // LO QUE SE RESTA SE ESCRIBE EN LOS DOS MIEMBROS, y aparece en el momento de
  // cancelar, no antes. A la izquierda, como el término OPUESTO que anula al que
  // estaba —los dos se tachan, y los dos están del mismo lado del igual—; a la
  // derecha, como la resta que hay que hacer, sin tachar: es la que da el número
  // de la línea siguiente.
  //
  // Y lo que se escribe en los dos miembros lleva SU PROPIA marca —una caja por
  // miembro, `pz-uniforme-izq` y `pz-uniforme-der`—, que es la del primer
  // tiempo del paso: enseña DÓNDE se ha escrito la resta, sin tachar nada. El
  // tachado llega después, en el segundo tiempo, y sobre otros dos términos.
  const opuesto = `${b > 0 ? "-" : "+"} ${Math.abs(b)}`;
  const compensacionIzquierda = cancela
    ? ` ${marcar(
        `pz-rev-0`,
        marcar(
          "pz-uniforme pz-uniforme-izq",
          `${b > 0 ? "-" : "+"} ${marcar("pz-cancela pz-cancela-opuesto", String(Math.abs(b)))}`,
        ),
      )}`
    : "";
  const compensacionDerecha = cancela ? ` ${marcar(`pz-rev-0`, marcar("pz-uniforme pz-uniforme-der", opuesto))}` : "";

  /** El miembro izquierdo, con sus marcas y sólo las suyas. */
  const izquierda = `${
    marcaElTermino ? marcar("pz-coef-despeje", `${coefLatex}${variable}`) : `${coefLatex}${variable}`
  }${terminoLatex}${compensacionIzquierda}`;

  /** El miembro derecho: el número y, al cancelar, la misma resta sin tachar. */
  const derecha = `${c}${compensacionDerecha}`;

  // La solución se destapa en el último foco: la ecuación no puede empezar con
  // el resultado escrito, eso es dar la respuesta antes de la pregunta.
  // Cancelar son DOS focos —escribir la resta y tachar—, y la solución va detrás.
  const pasoSolucion = (cancela ? (soloEscritura ? 1 : 2) : 0) + (divide ? 1 : 0);
  // LA SOLUCIÓN, EN SU PROPIO RENGLÓN, alineada por el igual:
  //
  //   x + 3 = 8 − 3
  //       x = 5
  //
  // Como se escribe a mano. En una sola línea —"x + 3 = 8 − 3 ⇒ x = 5"— no
  // cabía en su mitad de la pizarra proyectada (48 px por fórmula) y el 5
  // quedaba cortado contra la raya que separa los dos ambientes.
  const rev = (cuerpo: string) => marcar(`pz-rev-${pasoSolucion}`, cuerpo);
  const latex = llegaALaSolucion
    ? `\\begin{aligned} ${izquierda} &= ${derecha} \\\\[0.4em] ${rev(variable)} &${rev(
        `{}= ${marcar("pz-solucion", racionalLatex(c - b, coeficiente))}`,
      )} \\end{aligned}`
    : `${izquierda} = ${derecha}`;

  const focos: Foco[] = [];
  if (cancela) {
    // PRIMERO SE ESCRIBE LA OPERACIÓN UNIFORME; SE TACHA DESPUÉS.
    //
    // El cliente lo pidió con estas palabras: "primero se proyecta la operación
    // uniforme completa sin tachar —2x + 6 − 6 = 16 − 6—; cuando la voz
    // pronuncie «a la izquierda se cancela +6 con −6», se dispara la animación
    // que aplica el tachado rojo". Antes los tachados estaban puestos desde el
    // segundo cero, antes de que el avatar explicara nada.
    //
    // Este primer foco destapa la resta en los dos miembros y la enmarca —una
    // caja por miembro, ninguna cruza el igual—, SIN TACHAR: sostiene su frase
    // en el pie mientras la voz cuenta que se resta lo mismo a los dos lados.
    focos.push({
      clase: "pz-uniforme",
      piezas: ["pz-uniforme-izq", "pz-uniforme-der"],
      tipo: "caja",
      // Alex.pdf §4: «Restamos 6 a ambos miembros:»
      narracion: `${b > 0 ? "Restamos" : "Sumamos"} ${Math.abs(b)} a ambos miembros:`,
    });
  if (!soloEscritura) focos.push({
      clase: "pz-cancela",
      // Una caja por término, y las dos DENTRO DEL MISMO MIEMBRO: el término que
      // estaba y su opuesto. Ninguna marca cruza el igual.
      piezas: ["pz-cancela-termino", "pz-cancela-opuesto"],
      tipo: "tachado",
      // LO QUE SE HACE ES LO QUE SE DICE: con "+6" se RESTA 6 en los dos lados;
      // con "-6" se SUMA 6. Decir "quitamos 6" y escribir "16 + 6" es contar una
      // operación y hacer otra.
      // Y sin un "y" pegado a un signo ("+6 y -6"): esa "y" es prosa, pero la
      // composición de fórmulas dentro de la frase leía "y - 6" como expresión y
      // la escribía en cursiva matemática.
      narracion: `A la izquierda se cancela ${b > 0 ? "+" : "-"}${Math.abs(b)} con ${b > 0 ? "-" : "+"}${Math.abs(b)}, y a la derecha ${c} ${b > 0 ? "menos" : "más"} ${Math.abs(b)} son ${c - b}.`,
      etiqueta: "se cancelan",
    });
  }
  if (divide) {
    // Señalar el número que divide es una CAJA, no un resultado: con la marca
    // de resultado se dibujaba el visto verde justo al lado de la x.
    focos.push({
      clase: "pz-coef-despeje",
      tipo: "caja",
      // LO QUE SE DICE ES LO QUE SE SEÑALA. Aquí sólo está marcado el
      // coeficiente —a la derecha no hay ningún 2 que marcar—, así que el pie
      // habla del coeficiente; que se divide en LOS DOS lados lo enseña el
      // renglón siguiente, con los dos denominadores marcados. El cliente
      // fotografió justo esto: «dice "los dos lados" y sólo señala el 2 del 2x».
      narracion: `La ${variable} está multiplicada por ${coeficiente}.`,
      // LA ETIQUETA DICE LO MISMO QUE EL PIE. Ponía "÷ 2" sobre el coeficiente,
      // y el cliente lo fotografió: «dice dividimos entre 2 a ambos lados, pero
      // sólo divide al 2x, y no al 10». Es que aquí todavía no se divide nada:
      // esta caja enseña la multiplicación que hay que deshacer. El "÷ 2" está
      // en el renglón siguiente, donde sí aparece en los dos miembros.
      etiqueta: `× ${coeficiente}`,
    });
  }
  if (marcaElTermino) {
    focos.push({
      clase: "pz-coef-despeje",
      tipo: "caja",
      // LO QUE SE DICE ES LO QUE SE SEÑALA. Aquí sólo está marcado el
      // coeficiente —a la derecha no hay ningún 2 que marcar—, así que el pie
      // habla del coeficiente; que se divide en los dos lados lo enseña el
      // renglón siguiente, con los dos denominadores marcados. El cliente
      // fotografió justo esto: «dice "los dos lados" y sólo señala el 2x».
      narracion: `La ${variable} está multiplicada por ${coeficiente}.`,
      // LA ETIQUETA DICE LO MISMO QUE EL PIE. Ponía "÷ 2" sobre el coeficiente,
      // y el cliente lo fotografió: «dice dividimos entre 2 a ambos lados, pero
      // sólo divide al 2x, y no al 10». Es que aquí todavía no se divide nada:
      // esta caja enseña la multiplicación que hay que deshacer. El "÷ 2" está
      // en el renglón siguiente, donde sí aparece en los dos miembros.
      etiqueta: `× ${coeficiente}`,
    });
  }
  if (llegaALaSolucion) {
    // Subrayada, sin visto: la respuesta final la enmarca el cierre del
    // ejercicio, que es la línea "x = 5" que viene detrás.
    focos.push({
      clase: "pz-solucion",
      tipo: "resultado",
      narracion: `${variable} vale ${solucion}.`,
    });
  }

  return {
    id,
    texto,
    latex,
    narracion: `Despejamos ${variable}.`,
    clase: "despeje",
    focos,
  };
}

/**
 * EL RENGLÓN DEL TACHADO: "2x + 6 − 6 = 16 − 6", con las aspas.
 *
 * Es el segundo tiempo del despeje, y vive en SU PROPIO RENGLÓN porque el
 * cliente pidió que los pasos no se sobrescriban: «los pasos del desarrollo no
 * deben sobreescribirse; deben agregarse secuencialmente uno debajo del otro…
 * todos los pasos deben permanecer en pantalla simultáneamente al concluir la
 * explicación». Así, al acabar quedan las dos versiones a la vista —la resta
 * escrita y la resta cancelada—, como en un cuaderno.
 *
 * Reconoce la línea YA compensada: el término, su opuesto al lado, y la misma
 * resta al otro lado del igual. Devuelve `null` si no es eso, que es lo que
 * permite encadenarla con las demás sin preguntar por el tema.
 */
export function escenaDeCancelacion(texto: string, id: string): Escena | null {
  const limpio = String(texto ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  // ax + b - b = c - b  (o ax - b + b = c + b)
  const m = limpio.match(/^(-?\d*)([a-zA-Z])([+-]\d+)([+-]\d+)=(-?\d+)([+-]\d+)$/);
  if (!m) return null;

  const [, coefCrudo, variable, terminoCrudo, opuestoCrudo, derechaCruda, compensaCruda] = m;
  const coeficiente = coefCrudo === "" || coefCrudo === "+" ? 1 : coefCrudo === "-" ? -1 : Number(coefCrudo);
  const b = Number(terminoCrudo);
  const opuesto = Number(opuestoCrudo);
  const c = Number(derechaCruda);
  const compensa = Number(compensaCruda);
  if (!Number.isFinite(coeficiente) || coeficiente === 0 || !b) return null;
  // Lo que se cancela tiene que ser un par de opuestos, y al otro lado tiene que
  // estar la MISMA operación: si no, esto no es una cancelación uniforme y no se
  // dibuja nada (mejor sin marcas que con marcas que mienten).
  if (opuesto !== -b || compensa !== -b) return null;

  const signo = (n: number) => (n > 0 ? "+" : "-");
  const coefLatex = coeficiente === 1 ? "" : coeficiente === -1 ? "-" : String(coeficiente);
  const izquierda =
    `${coefLatex}${variable} ${signo(b)} ${marcar("pz-cancela pz-cancela-termino", String(Math.abs(b)))}` +
    ` ${signo(opuesto)} ${marcar("pz-cancela pz-cancela-opuesto", String(Math.abs(opuesto)))}`;
  const derecha = `${c} ${signo(compensa)} ${Math.abs(compensa)}`;

  return {
    id,
    texto,
    latex: `${izquierda} = ${derecha}`,
    narracion: "Se cancelan.",
    clase: "despeje",
    focos: [
      {
        clase: "pz-cancela",
        piezas: ["pz-cancela-termino", "pz-cancela-opuesto"],
        tipo: "tachado",
        narracion: `A la izquierda se cancela ${signo(b)}${Math.abs(b)} con ${signo(opuesto)}${Math.abs(opuesto)}, y a la derecha ${c} ${b > 0 ? "menos" : "más"} ${Math.abs(b)} son ${c + compensa}.`,
        etiqueta: "se cancelan",
      },
    ],
  };
}

/**
 * LA FRASE CON LA QUE SE TACHAN LOS TÉRMINOS EN x.
 *
 * Se construye aquí y en el motor (`solveLinearSteps`) con los mismos números,
 * y la batería comprueba que las dos digan exactamente lo mismo: si se separan,
 * la pizarra tacharía cuando el tutor ya está en otra cosa.
 */
export function fraseDeCancelacionDeIncognita(
  izquierdo: number,
  derecho: number,
  variable: string,
): string {
  const conVariable = (k: number) => (k === 1 ? variable : k === -1 ? `-${variable}` : `${k}${variable}`);
  const sinSigno = (k: number) => conVariable(Math.abs(k));
  const queda = izquierdo - derecho;
  return (
    `A la derecha se cancela ${derecho > 0 ? "" : "-"}${sinSigno(derecho)} con ` +
    `${derecho > 0 ? "-" : "+"}${sinSigno(derecho)}, y a la izquierda ${conVariable(izquierdo)} ` +
    `${derecho > 0 ? "menos" : "más"} ${sinSigno(derecho)} es ${conVariable(queda)}.`
  );
}

/**
 * LA DIVISIÓN ESCRITA COMO FRACCIÓN: "2x/2 = 10/2".
 *
 * El cliente la pidió así —"crea la regla general: se divide como fracción"— y
 * con ella se ve lo que de verdad pasa: el 2 de arriba y el 2 de abajo se van.
 *
 * Y se marcan LOS DOS DENOMINADORES, uno en cada miembro: la queja anterior fue
 * exactamente esa —«dice "dividimos los dos lados entre 2" pero sólo señala el 2
 * del 2x»—. Aquí lo que se dice y lo que se señala son la misma cosa.
 */
/**
 * LO QUE SE ESCRIBE PARA OPERAR NO SE QUEDA EN EL HILO CONDUCTOR.
 *
 * El cliente dividió la pizarra en dos papeles: «Ambiente 1 — el hilo conductor
 * limpio del ejercicio: planteamiento inicial, ecuaciones simplificadas
 * resultantes y, al final, la respuesta definitiva. Aquí el estudiante sigue la
 * secuencia principal SIN SOBRECARGA DE CÁLCULOS INTERMEDIOS».
 *
 * Y una línea del hilo —"−x + 8 = −1"— se escribe encima la operación que se le
 * va a hacer: aparece "− 8" en los dos miembros mientras la voz cuenta que se
 * resta 8 a los dos lados. Eso está bien MIENTRAS se cuenta —es el renglón al
 * que se refiere el tutor—, pero si se queda puesto, el hilo termina lleno de
 * "−x + 8 − 8 = −1 − 8" en vez de las ecuaciones limpias.
 *
 * Así que ese destapado es PRESTADO: dura lo que dura su paso. La operación
 * entera —escrita y tachada— queda en el borrador, que es su sitio, y el hilo
 * vuelve a su ecuación. Se reconoce por sus focos: una escena cuyo único gesto
 * es la marca uniforme (`pz-uniforme`) es exactamente eso, una línea del hilo
 * enseñando lo que se le va a hacer.
 */
export function elDestapadoEsPrestado(escena: Escena | null | undefined): boolean {
  const focos = escena?.focos ?? [];
  return focos.length > 0 && focos.every((f) => f.clase === "pz-uniforme");
}

export function escenaDeDivisionEnFraccion(texto: string, id: string): Escena | null {
  const limpio = String(texto ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  // ax/n = c/n  (el mismo divisor en los dos lados)
  const m = limpio.match(/^(-?\d*)([a-zA-Z])\/(-?\d+)=(-?\d+)\/(-?\d+)$/);
  if (!m) return null;

  const [, coefCrudo, variable, divIzq, dividendo, divDer] = m;
  const coeficiente = coefCrudo === "" || coefCrudo === "+" ? 1 : coefCrudo === "-" ? -1 : Number(coefCrudo);
  const divisor = Number(divIzq);
  if (!Number.isFinite(coeficiente) || !divisor || divIzq !== divDer) return null;

  const arribaIzq = coeficiente === 1 ? variable : coeficiente === -1 ? `-${variable}` : `${coeficiente}${variable}`;
  const numerador = (cuerpo: string, marca: string) => `\\frac{${cuerpo}}{${marcar(marca, String(divisor))}}`;

  return {
    id,
    texto,
    latex: `${numerador(arribaIzq, "pz-divisor pz-divisor-izq")} = ${numerador(dividendo, "pz-divisor pz-divisor-der")}`,
    // Alex.pdf §4: «Dividimos ambos miembros entre 2:» — misma frase que el
    // comentario formal; el pie de proyección no la repite (ver pieEnColumna).
    narracion: `Dividimos ambos miembros entre ${divisor}:`,
    clase: "despeje",
    focos: [
      {
        clase: "pz-divisor",
        // Una caja por miembro: ninguna marca cruza el igual.
        piezas: ["pz-divisor-izq", "pz-divisor-der"],
        tipo: "caja",
        narracion: `Dividimos ambos miembros entre ${divisor}:`,
        etiqueta: `÷ ${divisor}`,
      },
    ],
  };
}

/**
 * EL PRIMER TIEMPO CON LA INCÓGNITA: "2x + 8 = 3x − 1" → se escribe el −3x.
 *
 * Lo mismo que se hace con una constante, pero con el término en x: la línea
 * que está en la pizarra destapa la resta en los DOS miembros —una caja por
 * miembro, ninguna cruza el igual— mientras la voz cuenta que se resta 3x a los
 * dos lados. El tachado llega en el renglón siguiente.
 *
 * Que la línea EVOLUCIONE (y no se quede como estaba) es además lo que evita
 * que se vea dos veces la misma igualdad: arriba a la izquierda, como resultado
 * de repartir el paréntesis, y aquí otra vez sin cambio alguno.
 */
export function escenaDeRestaDeIncognita(texto: string, id: string): Escena | null {
  const limpio = String(texto ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  // ax + b = cx + d  (con b y d opcionales)
  const m = limpio.match(/^(-?\d*)([a-zA-Z])([+-]\d+)?=(-?\d*)\2([+-]\d+)?$/);
  if (!m) return null;

  const num = (crudo: string) => (crudo === "" || crudo === "+" ? 1 : crudo === "-" ? -1 : Number(crudo));
  const [, aCrudo, variable, bCrudo, cCrudo, dCrudo] = m;
  const a = num(aCrudo);
  const b = bCrudo ? Number(bCrudo) : 0;
  const c = num(cCrudo);
  const d = dCrudo ? Number(dCrudo) : 0;
  if (!Number.isFinite(a) || !Number.isFinite(c) || c === 0 || a === c) return null;

  const conVar = (k: number) => (k === 1 ? variable : k === -1 ? `-${variable}` : `${k}${variable}`);
  const abs = (k: number) => (Math.abs(k) === 1 ? variable : `${Math.abs(k)}${variable}`);
  const signo = (n: number) => (n > 0 ? "+" : "-");
  // Se quita lo que hay a la derecha: si es +3x se resta 3x, y si es -3x se suma.
  const quita = `${c > 0 ? "-" : "+"} ${marcar("pz-uniforme pz-uniforme-IZQ", abs(c))}`;

  const izquierda = `${conVar(a)}${b ? ` ${signo(b)} ${Math.abs(b)}` : ""} ${marcar("pz-rev-0", quita.replace("IZQ", "izq"))}`;
  const derecha = `${conVar(c)}${d ? ` ${signo(d)} ${Math.abs(d)}` : ""} ${marcar(
    "pz-rev-0",
    quita.replace("IZQ", "der"),
  )}`;

  return {
    id,
    texto,
    latex: `${izquierda} = ${derecha}`,
    narracion: `Juntamos los términos con ${variable}.`,
    clase: "despeje",
    focos: [
      {
        clase: "pz-uniforme",
        piezas: ["pz-uniforme-izq", "pz-uniforme-der"],
        tipo: "caja",
        narracion: `${c > 0 ? "Restamos" : "Sumamos"} ${abs(c)} a ambos miembros:`,
      },
    ],
  };
}

/**
 * EL RENGLÓN QUE TACHA LOS TÉRMINOS EN x: "2x + 8 − 3x = 3x − 1 − 3x".
 *
 * El mismo trato que la cancelación de una constante, pero con la incógnita: lo
 * que se cancela está a la DERECHA —el 3x que había y el −3x que acabamos de
 * escribir— y las dos marcas se quedan dentro de ese miembro, sin cruzar el
 * igual. A la izquierda no se tacha nada: ahí los términos se suman.
 */
export function escenaDeCancelacionDeIncognita(texto: string, id: string): Escena | null {
  const limpio = String(texto ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  // a·x + b - c·x = c·x + d - c·x
  const m = limpio.match(
    /^(-?\d*)([a-zA-Z])([+-]\d+)?([+-]\d*)\2=(-?\d*)\2([+-]\d+)?([+-]\d*)\2$/,
  );
  if (!m) return null;

  const num = (crudo: string, porDefecto = 1) => {
    if (crudo === "" || crudo === "+") return porDefecto;
    if (crudo === "-") return -porDefecto;
    const n = Number(crudo);
    return Number.isFinite(n) ? n : NaN;
  };
  const [, aCrudo, variable, bCrudo, restaIzq, cCrudo, dCrudo, restaDer] = m;
  const a = num(aCrudo);
  const b = bCrudo ? Number(bCrudo) : 0;
  const c = num(cCrudo);
  const d = dCrudo ? Number(dCrudo) : 0;
  const quitadoIzq = num(restaIzq);
  const quitadoDer = num(restaDer);
  if (![a, c, quitadoIzq, quitadoDer].every(Number.isFinite)) return null;
  // Lo que se quita tiene que ser lo MISMO en los dos lados, y ser el opuesto
  // del término que hay a la derecha: si no, esto no es lo que se está contando.
  if (quitadoIzq !== quitadoDer || quitadoDer !== -c) return null;

  const conVar = (k: number, marca?: string) => {
    const cuerpo = k === 1 ? variable : k === -1 ? `-${variable}` : `${k}${variable}`;
    return marca ? marcar(marca, cuerpo) : cuerpo;
  };
  const signo = (n: number) => (n > 0 ? "+" : "-");
  const abs = (k: number) => (Math.abs(k) === 1 ? variable : `${Math.abs(k)}${variable}`);

  const izquierda =
    `${conVar(a)}${b ? ` ${signo(b)} ${Math.abs(b)}` : ""} ${signo(quitadoIzq)} ${abs(quitadoIzq)}`;
  const derecha =
    `${marcar("pz-cancela pz-cancela-termino", conVar(c))}` +
    `${d ? ` ${signo(d)} ${Math.abs(d)}` : ""} ` +
    `${signo(quitadoDer)} ${marcar("pz-cancela pz-cancela-opuesto", abs(quitadoDer))}`;

  return {
    id,
    texto,
    latex: `${izquierda} = ${derecha}`,
    narracion: "Se cancelan los términos con la incógnita.",
    clase: "despeje",
    focos: [
      {
        clase: "pz-cancela",
        piezas: ["pz-cancela-termino", "pz-cancela-opuesto"],
        tipo: "tachado",
        narracion: fraseDeCancelacionDeIncognita(a, c, variable),
        etiqueta: "se cancelan",
      },
    ],
  };
}

/** La solución en LaTeX: entera si sale exacta, y si no la fracción reducida. */
function racionalLatex(numerador: number, denominador: number): string {
  const texto = formatearRacional(numerador, denominador);
  const partes = texto.split("/");
  if (partes.length !== 2) return texto;
  const negativo = partes[0].startsWith("-");
  const arriba = negativo ? partes[0].slice(1) : partes[0];
  return `${negativo ? "-" : ""}\\frac{${arriba}}{${partes[1]}}`;
}

/** "7/2" en vez de 3.5: la fracción exacta es la respuesta, el decimal es su sombra. */
function formatearRacional(numerador: number, denominador: number): string {
  if (denominador === 0) return "indefinido";
  if (numerador % denominador === 0) return String(numerador / denominador);
  const signo = numerador * denominador < 0 ? "-" : "";
  const a = Math.abs(numerador);
  const b = Math.abs(denominador);
  const mcd = (x: number, y: number): number => (y === 0 ? x : mcd(y, x % y));
  const g = mcd(a, b) || 1;
  return `${signo}${a / g}/${b / g}`;
}

// ── Simplificación: lo que se cancela, tachado ───────────────────────────────

/** Una fracción escrita como "12/8", "6x/3" o "x^{2}/x". */
interface FraccionLeida {
  coefNum: number;
  coefDen: number;
  variable: string;
  expNum: number;
  expDen: number;
}

function leerFraccion(texto: string): FraccionLeida | null {
  const limpio = String(texto ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
    .replace(/\s+/g, "");
  // Se ignora lo que venga tras el igual: el resultado lo calculamos nosotros.
  const izquierda = limpio.split("=")[0];

  const m = izquierda.match(
    /^(-?\d*)([a-zA-Z]?)(?:\^\{?(\d+)\}?)?\/(-?\d*)([a-zA-Z]?)(?:\^\{?(\d+)\}?)?$/,
  );
  if (!m) return null;

  const [, cn, vn, en, cd, vd, ed] = m;
  // Una variable sólo se cancela contra la misma variable.
  if (vn && vd && vn !== vd) return null;

  const coefNum = cn === "" || cn === "+" ? 1 : cn === "-" ? -1 : Number(cn);
  const coefDen = cd === "" || cd === "+" ? 1 : cd === "-" ? -1 : Number(cd);
  if (!Number.isFinite(coefNum) || !Number.isFinite(coefDen) || coefDen === 0) return null;

  return {
    coefNum,
    coefDen,
    variable: vn || vd || "",
    expNum: vn ? Number(en ?? 1) : 0,
    expDen: vd ? Number(ed ?? 1) : 0,
  };
}

/**
 * Una simplificación con lo que se va TACHADO.
 *
 * Es la otra cancelación que pide el pliego, la algebraica: el factor común de
 * arriba y de abajo se tacha a la vez —que es como se hace a mano— y sólo
 * después aparece la fracción reducida. Escribir el resultado desde el
 * principio convierte la simplificación en un dato que hay que creerse.
 */
export function escenaDeSimplificacion(texto: string, id: string): Escena | null {
  const f = leerFraccion(texto);
  if (!f) return null;

  const divisor = mcd(Math.abs(f.coefNum), Math.abs(f.coefDen));
  const potencias = Math.min(f.expNum, f.expDen);
  // Sin factor común no hay nada que tachar: no es una simplificación.
  if (divisor <= 1 && potencias <= 0) return null;

  const escribir = (coef: number, exponente: number) => {
    const parte = f.variable && exponente > 0
      ? `${f.variable}${exponente > 1 ? `^{${exponente}}` : ""}`
      : "";
    if (!parte) return String(coef);
    if (coef === 1) return parte;
    if (coef === -1) return `-${parte}`;
    return `${coef}${parte}`;
  };

  const arriba = escribir(f.coefNum, f.expNum);
  const abajo = escribir(f.coefDen, f.expDen);
  const arribaSimple = escribir(f.coefNum / divisor, f.expNum - potencias);
  const abajoSimple = escribir(f.coefDen / divisor, f.expDen - potencias);

  // Denominador 1: el resultado se escribe sin fracción, como se hace a mano.
  const resultado =
    abajoSimple === "1" ? arribaSimple : `\\frac{${arribaSimple}}{${abajoSimple}}`;

  const latex =
    `\\frac{${marcar("pz-cancela pz-cancela-num", arriba)}}{${marcar("pz-cancela pz-cancela-den", abajo)}}` +
    ` ${marcar("pz-rev-1", `= ${marcar("pz-simplificada", resultado)}`)}`;

  const porQue: string[] = [];
  if (divisor > 1) porQue.push(`dividimos arriba y abajo entre ${divisor}`);
  if (potencias > 0) {
    porQue.push(
      potencias === 1
        ? `se cancela una ${f.variable} de arriba con la de abajo`
        : `se cancelan ${potencias} ${f.variable} de arriba con las de abajo`,
    );
  }

  return {
    id,
    texto,
    latex,
    narracion: `Vamos a simplificar ${arriba} entre ${abajo}.`,
    clase: "simplificacion",
    focos: [
      {
        clase: "pz-cancela",
        // Se tachan arriba y abajo por separado, como se hace a mano; una caja
        // única taparía también la raya de la fracción.
        piezas: ["pz-cancela-num", "pz-cancela-den"],
        tipo: "tachado",
        narracion: `${mayuscula(porQue.join(" y "))}.`,
        etiqueta: divisor > 1 ? `÷ ${divisor}` : "se cancelan",
      },
      {
        clase: "pz-simplificada",
        tipo: "resultado",
        narracion:
          abajoSimple === "1"
            ? `Queda ${arribaSimple}.`
            : `Queda ${arribaSimple} entre ${abajoSimple}.`,
      },
    ],
  };
}

/** Máximo común divisor, para saber entre cuánto se divide la fracción. */
function mcd(a: number, b: number): number {
  return b === 0 ? a : mcd(b, a % b);
}

// ── Amplificación de fracciones ──────────────────────────────────────────────

/**
 * `1/2 = 3/6` contado como lo que es: multiplicar arriba y abajo por 3.
 *
 * El salto de 1/2 a 3/6 no se ve, y el alumno tiene que creérselo. Escribiendo
 * la multiplicación —`1×3 / 2×3`— con el factor marcado en los dos sitios, se
 * lee de dónde sale cada número y por qué la fracción sigue valiendo lo mismo.
 * El resultado no se destapa hasta el último paso.
 */
export function escenaDeAmplificacion(texto: string, id: string): Escena | null {
  const f = leerAmplificacion(texto);
  if (!f) return null;

  const factor = (donde: string) => marcar(`pz-factor pz-factor-${donde}`, String(f.factor));

  // LA LÍNEA ENTERA, DESTAPADA POR PARTES.
  //
  // Antes se componía sólo el producto y su resultado, y la fracción de partida
  // se perdía: en pantalla aparecía "1×3/2×3 = 3/6" sin decir de dónde salía.
  // Escrita entera —origen, producto, resultado— y con cada trozo saliendo en
  // su paso, se lee como lo que es: la misma fracción, escrita de otra forma.
  const producto = `\\frac{${f.a} \\times ${factor("num")}}{${f.b} \\times ${factor("den")}}`;
  const latex =
    `\\frac{${f.a}}{${f.b}}` +
    ` ${marcar("pz-rev-0", `= ${producto}`)}` +
    ` ${marcar("pz-rev-1", `= ${marcar("pz-resultado", `\\frac{${f.c}}{${f.d}}`)}`)}`;

  return {
    id,
    texto,
    latex,
    narracion: `Vamos a escribir ${f.a} entre ${f.b} con denominador ${f.d}.`,
    clase: "amplificacion",
    focos: [
      {
        clase: "pz-factor",
        // Arriba y abajo, cada uno con su recuadro: es lo que enseña que se
        // multiplica por lo MISMO en los dos sitios.
        piezas: ["pz-factor-num", "pz-factor-den"],
        tipo: "caja",
        narracion: `Multiplicamos arriba y abajo por ${f.factor}.`,
        etiqueta: `× ${f.factor}`,
      },
      {
        clase: "pz-resultado",
        tipo: "resultado",
        narracion: `Queda ${f.c} entre ${f.d}.`,
      },
    ],
  };
}

// ── Suma de fracciones con el mismo denominador ──────────────────────────────

/**
 * `6/10 + 5/10 = 11/10` contado como la regla que es.
 *
 * Es la segunda mitad de la lección de fracciones y era una línea muerta: la
 * tarjeta de desarrollo la escribía entera, sin un resaltado, y el panel
 * animado ni se montaba. Aquí se separa en los dos gestos que enseña la regla
 * —arriba se opera, abajo NO se toca— con un recuadro sobre cada numerador y
 * otro sobre cada denominador, y el resultado no sale hasta el final.
 */
export function escenaDeSumaDeFracciones(texto: string, id: string): Escena | null {
  const s = leerSumaDeFracciones(texto);
  if (!s) return null;

  const arriba = (i: number, valor: number) => marcar(`pz-numerador pz-num-${i}`, String(valor));
  const abajo = (i: number) => marcar(`pz-denominador pz-den-${i}`, String(s.d));

  const verbo = s.operador === "+" ? "Sumamos" : "Restamos";
  const dicho = s.operador === "+" ? "más" : "menos";

  const latex =
    `\\frac{${arriba(0, s.n1)}}{${abajo(0)}} ${s.operador} \\frac{${arriba(1, s.n2)}}{${abajo(1)}}` +
    // El paso intermedio con la operación a la vista, que es lo que hace ver
    // que el denominador viaja intacto mientras los numeradores se juntan.
    ` ${marcar("pz-rev-0", `= \\frac{${s.n1} ${s.operador} ${s.n2}}{${s.d}}`)}` +
    ` ${marcar("pz-rev-2", `= ${marcar("pz-solucion", `\\frac{${s.total}}{${s.d}}`)}`)}`;

  return {
    id,
    texto,
    latex,
    narracion: `${s.n1} entre ${s.d} ${dicho} ${s.n2} entre ${s.d}.`,
    clase: "suma-fracciones",
    focos: [
      {
        clase: "pz-numerador",
        // Cada numerador con SU recuadro: en una sola caja que abarcara los dos
        // quedaría dentro el signo y el denominador de en medio.
        piezas: ["pz-num-0", "pz-num-1"],
        tipo: "caja",
        narracion: `${verbo} los numeradores: ${s.n1} ${s.operador} ${s.n2} = ${s.total}.`,
        etiqueta: "numeradores",
        pista: "numeradores",
      },
      {
        clase: "pz-denominador",
        piezas: ["pz-den-0", "pz-den-1"],
        tipo: "caja",
        narracion: `El denominador ${s.d} no cambia: se queda en ${s.d}.`,
        etiqueta: `entre ${s.d}`,
        pista: "denominador",
      },
      {
        clase: "pz-solucion",
        tipo: "resultado",
        narracion: `Queda ${s.total} entre ${s.d}.`,
      },
    ],
  };
}

// ── Propiedad distributiva ───────────────────────────────────────────────────

/** Un término de dentro del paréntesis: "3x", "-4", "x". */
interface TerminoInterno {
  signo: 1 | -1;
  coeficiente: number;
  variable: string;
}

/** Lee "x + 4", "2x - 3", "5 + y" como términos con su signo. */
function leerInterior(texto: string): TerminoInterno[] | null {
  const limpio = String(texto ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  if (!limpio) return null;

  const terminos: TerminoInterno[] = [];
  const patron = /([+-]?)(\d*)([a-zA-Z]?)/g;
  let consumido = 0;
  let m: RegExpExecArray | null;

  while ((m = patron.exec(limpio)) !== null) {
    if (m[0] === "") {
      patron.lastIndex++;
      continue;
    }
    if (m.index !== consumido) return null;
    consumido = m.index + m[0].length;

    const [, signo, coef, variable] = m;
    if (!coef && !variable) return null;
    terminos.push({
      signo: signo === "-" ? -1 : 1,
      coeficiente: coef === "" ? 1 : Number(coef),
      variable: variable ?? "",
    });
  }

  if (consumido !== limpio.length || terminos.length < 2 || terminos.length > 3) return null;
  // Una sola variable: "xy" no es de lo que se enseña aquí.
  if (new Set(terminos.map((t) => t.variable).filter(Boolean)).size > 1) return null;
  return terminos;
}

/** Escribe un término ya multiplicado: "2x", "-8", "x". */
function escribirTermino(t: TerminoInterno, factor: number): string {
  const valor = t.coeficiente * factor;
  if (!t.variable) return String(valor);
  if (valor === 1) return t.variable;
  if (valor === -1) return `-${t.variable}`;
  return `${valor}${t.variable}`;
}

/**
 * `2(x + 4)` contado como lo que es: el 2 entra en los DOS sumandos.
 *
 * Lo pidió el cliente: el alumno ve `2(x + 4)` y de pronto `2x + 8`, sin ver
 * por qué. Aquí el factor y cada sumando se enmarcan a la vez —"el 2 multiplica
 * a x", "y el 2 multiplica a 4"— y el resultado no se destapa hasta el final.
 */
export function escenaDeDistributiva(texto: string, id: string): Escena | null {
  const limpio = String(texto ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  // Sólo el paréntesis a la izquierda del igual, que es donde se reparte.
  const m = limpio.match(/^(-?\d+)\(([^()]+)\)(?:=(.+))?$/);
  if (!m) return null;

  const factor = Number(m[1]);
  const interior = leerInterior(m[2]);
  if (!Number.isFinite(factor) || factor === 0 || !interior) return null;

  const marcado = (i: number, cuerpo: string) => marcar(`pz-reparte pz-reparte-${i}`, cuerpo);
  const dentro = interior
    .map((t, i) => {
      const signo = t.signo === -1 ? " - " : i > 0 ? " + " : "";
      const coef = t.coeficiente === 1 && t.variable ? "" : String(t.coeficiente);
      return `${signo}${marcado(i + 1, `${coef}${t.variable}`)}`;
    })
    .join("");

  const expandido = interior
    .map((t, i) => {
      const valor = escribirTermino(t, factor * t.signo);
      const sinSigno = valor.replace(/^-/, "");
      const signo = valor.startsWith("-") ? " - " : i > 0 ? " + " : "";
      return `${signo}${sinSigno}`;
    })
    .join("");

  const cabeza = `${marcado(0, String(factor))}\\left(${dentro}\\right)`;
  const final = `pz-rev-${interior.length}`;
  // EN UNA ECUACIÓN, LO REPARTIDO VA EN SU PROPIO RENGLÓN —Y EN SU PROPIO PASO—.
  //
  // Primero el resultado se colgaba al final de la línea entera: "2(x + 4) = 3x − 1
  // = 2x + 8". Es notación falsa —encadena "3x − 1 = 2x + 8", que no es lo que se
  // ha hecho— y fue lo que el cliente vio en la tarjeta de arriba. Después pasó a
  // un segundo renglón de la MISMA escena, alineado por el igual.
  //
  // Y ahí lo paró él, con la columna del Paso 1 dibujada entera: «el comentario
  // debe colocarse arriba, justo debajo de la ecuación original y ANTES de
  // mostrar el resultado 2x + 6 = 16». Entre dos renglones de una misma fórmula
  // no cabe un comentario, así que la ecuación repartida deja de ser el segundo
  // renglón de esta escena y pasa a ser el paso siguiente del hilo, que es lo que
  // el motor ya escribe. Esta escena se queda con la ecuación original y su
  // reparto: el factor, cada sumando y la escuadra del "× 2" que los une, que
  // viven TODOS en el primer renglón (`pz-reparte-0` es el factor y
  // `pz-reparte-i` los términos de dentro del paréntesis). No se pierde nada de
  // la animación: lo que se mueve de sitio es el resultado.
  //
  // Sin igual —una expresión suelta, "2(x + 4)"— no hay paso siguiente que lo
  // escriba, y ahí "= 2x + 8" sigue siendo lo correcto, en su misma línea.
  const latex = m[3]
    ? `${cabeza} = ${planoALatex(m[3])}`
    : `${cabeza} ${marcar(final, `= ${marcar("pz-resultado", expandido)}`)}`;

  // YA NO HAY CONTINUACIÓN QUE DECLARAR. La declaraba para que la pizarra no
  // escribiera dos veces la ecuación repartida; ahora esta escena no la escribe,
  // así que la escribe el paso siguiente del hilo —con su comentario encima— y
  // el filtro de repetidos la deja pasar.

  const nombreTermino = (t: (typeof interior)[number]) => {
    const cuerpo = t.variable
      ? `${t.coeficiente === 1 ? "" : t.coeficiente}${t.variable}`
      : String(t.coeficiente);
    return `${t.signo === -1 ? "-" : ""}${cuerpo}`;
  };
  // Misma locución que `locucionesDistributiva` / Ambiente 2 (Alex.pdf §1):
  // el avatar narra el cálculo auxiliar en el momento en que se proyecta.
  const focos: Foco[] = interior.map((t, i) => {
    const prod = escribirTermino(t, factor * t.signo);
    const trozo = `${factor} por ${nombreTermino(t)} es ${prod}`;
    const narracion =
      i === 0
        ? `Multiplicamos el ${factor} por cada término: ${trozo},`
        : i === interior.length - 1
          ? `y ${trozo}.`
          : `y ${trozo},`;
    return {
      clase: "pz-reparte",
      piezas: ["pz-reparte-0", `pz-reparte-${i + 1}`],
      tipo: "caja" as const,
      conector: true,
      narracion,
      etiqueta: `× ${factor}`,
    };
  });

  // EL FOCO DEL RESULTADO SÓLO SI EL RESULTADO ESTÁ EN ESTA ESCENA.
  //
  // En una expresión suelta, "2(x + 4) = 2x + 8" se compone entera y ese foco
  // destapa el "2x + 8" del final. En una ECUACIÓN el resultado ya no vive aquí
  // —es el paso siguiente del hilo, detrás de su comentario—, y un foco sin nada
  // que señalar deja la escuadra encendida sobre un hueco.
  if (!m[3]) {
    focos.push({
      clase: "pz-resultado",
      tipo: "resultado",
      narracion: `Por eso obtenemos ${expandido.replace(/\s+/g, " ").trim().replace(/^-\s+/, "-")}.`,
    });
  }

  return {
    id,
    texto,
    latex,
    // ENTRADA SIN LA LLAVE × n (Alex.pdf §2).
    //
    // Con narración vacía el sincronizador saltaba al primer foco en cuanto
    // aparecía la ecuación, y la llave amarilla «× 2» se dibujaba en el 0:01.
    // La entrada dice el rótulo corto; la llave sólo con el foco activo del
    // reparto, y se desmonta al pasar a 2x + 6 = 16 (estado completada).
    narracion: m[3] ? "Por propiedad distributiva:" : `Vamos a repartir el ${factor}.`,
    clase: "distributiva",
    focos,
  };
}

// ── El cierre del ejercicio ──────────────────────────────────────────────────

/**
 * LA RESPUESTA FINAL, ENMARCADA.
 *
 * El cliente lo pidió como norma: "ningún ejercicio puede quedar inconcluso;
 * el último paso debe mostrar siempre el resultado final enmarcado con su
 * feedback de conclusión". Lo había visto en una suma de fracciones con
 * denominadores distintos cuyo desarrollo se paraba en "6/10 + 5/10" sin llegar
 * nunca al 11/10.
 *
 * La línea de cierre es el ejercicio entero igualado a su respuesta —"3/5 + 1/2
 * = 6/10 + 5/10 = (6 + 5)/10 = 11/10", "x = 5"—, y lo que se enmarca es su
 * ÚLTIMO miembro: la respuesta. Va dentro de `\boxed`, que es como se enmarca
 * un resultado en matemáticas, para que la pizarra clásica la enseñe enmarcada
 * sin necesidad de ninguna animación; en la animada ese marco se oculta y lo
 * dibuja la capa de resaltados, trazándose en el momento en que el tutor dice
 * "resultado final", con el visto a su lado.
 *
 * `null` si la línea no se deja componer como fórmula: un recuadro alrededor de
 * media frase no enmarca nada.
 */
export function escenaDeCierre(texto: string, id: string, narracion?: string | null): Escena | null {
  const limpio = String(texto ?? "").trim();

  // UNA SUMA O UNA RESTA SE CIERRA CON SU RESULTADO, NO EN FILA.
  //
  // "Toda suma con números de dos o más cifras se presenta en disposición
  // vertical formal" (SUB-MTH-05): "234 + 178 = [412]" era la única suma de la
  // clase escrita en fila. La cuenta, en columna, ya está resuelta en el
  // Ambiente 1; aquí va la respuesta consolidada —"Resultado: [412] ✓"—, sin
  // repetir la columna entera. El rótulo es escritura de pizarra (`pz-palabra`).
  const op = /=/.test(limpio) ? operacionDeLinea(limpio) : null;
  if (op) {
    return {
      id,
      texto: limpio,
      latex: `\\htmlClass{pz-palabra pz-rotulo}{\\text{Resultado:}}\\;\\;${marcar("pz-final", `\\boxed{${op.resultado}}`)}`,
      narracion: "El ejercicio completo, de principio a fin.",
      clase: "cierre",
      focos: [
        {
          clase: "pz-final",
          tipo: "resultado",
          narracion: narracion?.trim() || `Resultado final: ${op.resultado}.`,
          final: true,
        },
      ],
    };
  }
  // "Resultado: 42" —un rótulo de palabras y el valor—: el rótulo va como texto
  // y sólo el valor, enmarcado. El marco alrededor de la palabra no enmarca
  // ninguna respuesta.
  const rotulada = limpio.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,40}):\s*(.+)$/);
  const valor = rotulada ? componerPaso(rotulada[2]) : null;
  if (rotulada && valor) {
    const rotulo = rotulada[1].trim();
    return {
      id,
      texto: limpio,
      latex: `\\text{${rotulo}:}\\;${marcar("pz-final", `\\boxed{${valor}}`)}`,
      narracion: "El ejercicio completo, de principio a fin.",
      clase: "cierre",
      focos: [
        {
          clase: "pz-final",
          tipo: "resultado",
          narracion: narracion?.trim() || `Resultado final: ${rotulada[2].trim()}.`,
          final: true,
        },
      ],
    };
  }
  const compuesto = componerPaso(limpio);
  if (!compuesto) return null;

  let partes = miembros(compuesto).map((p) => p.trim());
  // Una división no exacta se cierra con "≈": la respuesta es lo que va detrás.
  let union = " = ";
  const aprox = compuesto.lastIndexOf("\\approx");
  if (partes.length === 1 && aprox > 0) {
    partes = [compuesto.slice(0, aprox).trim(), compuesto.slice(aprox + "\\approx".length).trim()];
    union = " \\approx ";
  }
  const respuesta = partes[partes.length - 1];
  if (!respuesta) return null;

  const enmarcada = marcar("pz-final", `\\boxed{${respuesta}}`);
  // EL EJERCICIO Y SU RESPUESTA, SIN REPETIR EL DESARROLLO:
  //
  //   1/2 + 1/3 = [5/6] ✓
  //
  // Los pasos intermedios ya están escritos en la pizarra —ninguno se borra—, y
  // copiarlos otra vez en el cierre no cabía en su mitad a tamaño de aula
  // (fórmulas de 48 px como mínimo al proyectar): la cadena entera, un renglón
  // por igualdad, se salía por abajo del Ambiente 2 y la cápsula pisaba el
  // renglón de encima.
  // Con un espacio fino tras el igual: la cápsula necesita su aire sin rozarlo.
  const latex = partes.length > 1 ? `${partes[0]}${union}\\,${enmarcada}` : enmarcada;
  const dicha = limpio.split(/=|≈/).at(-1)?.trim() || limpio;

  return {
    id,
    texto: limpio,
    latex,
    // Neutra a propósito: si dijera "resultado final", la frase del tutor
    // empataría con la entrada y la pizarra podría quedarse sin enmarcar nada
    // justo cuando lo anuncia.
    narracion: "El ejercicio completo, de principio a fin.",
    clase: "cierre",
    focos: [
      {
        clase: "pz-final",
        tipo: "resultado",
        narracion: narracion?.trim() || `Resultado final: ${dicha}.`,
        final: true,
      },
    ],
  };
}

/**
 * Un paso que opera Y cierra el ejercicio: tras su operación, su resultado
 * enmarcado.
 *
 * Es el caso de "derivada de 3x² = 6x": se recuadran el 3 y el 2 que se
 * multiplican y, a continuación, se enmarca el 6x, que es la respuesta. Si la
 * escena ya termina en una respuesta final —una cuenta en columna, un "x = 5"—
 * se deja como está.
 */
function conCierre(escena: Escena): Escena {
  if (escena.focos.some((f) => f.final) || !escena.latex) return escena;
  const partes = miembros(escena.latex);
  if (partes.length < 2) return escena;
  const respuesta = partes[partes.length - 1].trim();
  if (!respuesta) return escena;
  const dicha = escena.texto.split("=").at(-1)?.trim() || escena.texto;
  return {
    ...escena,
    latex: `${partes.slice(0, -1).map((p) => p.trim()).join(" = ")} = \\,${marcar("pz-final", `\\boxed{${respuesta}}`)}`,
    focos: [
      ...escena.focos,
      { clase: "pz-final", tipo: "resultado", narracion: `Resultado final: ${dicha}.`, final: true },
    ],
  };
}

// ── Escena de respaldo ───────────────────────────────────────────────────────

/**
 * Una línea que no se deja animar se compone igual, sin focos.
 *
 * Es la degradación honesta: la pizarra sigue mostrando la lección aunque esta
 * línea concreta no tenga un guion que contar.
 */
export function escenaDeTexto(texto: string, id: string): Escena {
  const limpio = String(texto ?? "").trim();
  return {
    id,
    texto: limpio,
    latex: null,
    narracion: limpio,
    clase: "texto",
    focos: [],
  };
}

// ── Puerta de entrada ────────────────────────────────────────────────────────

/**
 * QUÉ COMPOSITOR DIBUJA CADA GESTO.
 *
 * Es la tabla que convierte el `tipo` de la instrucción de foco en un dibujo.
 * Hay una entrada por GESTO —no por tema ni por ejercicio—, y cada compositor
 * lee los números del propio paso: la etiqueta dice qué se hace, el paso dice
 * con qué. Un ejercicio nuevo del catálogo usa esta tabla sin tocarla.
 *
 * `factor` no tiene dibujo compuesto propio salvo en un despeje —dividir entre
 * el coeficiente—; en cualquier otro paso lo dibuja el marcador genérico, que
 * pone su recuadro sobre los términos que diga la etiqueta.
 */
const COMPOSITOR: Record<
  TipoOperacion,
  (texto: string, id: string, narracion?: string | null) => Escena | null
> = {
  columna: (t, id) => escenaDeColumna(t, id),
  // La línea que se va a dividir NO adelanta el resultado: la división se
  // escribe en su propio renglón y la solución llega después de ella.
  factor: (t, id) => escenaDeDivisionEnFraccion(t, id) ?? escenaDeDespeje(t, id),
  // Dos renglones, dos escenas: el que ESCRIBE la resta en los dos lados y el
  // que la TACHA. El motor escribe el segundo justo después del primero, y así
  // los dos quedan a la vista al terminar (petición del cliente: los pasos no
  // se sobrescriben, se apilan).
  cancelacion: (t, id) =>
    escenaDeCancelacion(t, id) ??
    escenaDeCancelacionDeIncognita(t, id) ??
    escenaDeDespeje(t, id) ??
    escenaDeRestaDeIncognita(t, id) ??
    escenaDeSimplificacion(t, id),
  amplificacion: (t, id) => escenaDeAmplificacion(t, id),
  "suma-fracciones": (t, id) => escenaDeSumaDeFracciones(t, id),
  distributiva: (t, id) => escenaDeDistributiva(t, id),
  // El cierre lleva la locución del motor —"¡Y listo! Resultado final: 11/10."—
  // en su foco: es la frase exacta con la que la pizarra lo reconoce.
  resultado: (t, id, narracion) => escenaDeCierre(t, id, narracion),
};

/**
 * El paso en LaTeX, para el marcador genérico. `null` si es prosa: una frase
 * compuesta como fórmula sale en cursiva y pegada, y ahí no se marca nada.
 */
function componerPaso(texto: string): string | null {
  const limpio = String(texto ?? "").trim();
  if (!limpio) return null;
  return notacionFormal(limpio) ?? (pareceMatematica(limpio) ? planoALatex(limpio) : null);
}

/**
 * Una escena QUIETA: lo escrito, compuesto y sin nada que encender.
 *
 * Es lo que el panel proyecta cuando la fase no tiene un paso animable —el
 * enunciado de la práctica, la regla, una línea del concepto—. Va sin marcas ni
 * piezas por destapar: no hay voz que las vaya encendiendo, y una pieza oculta
 * que nadie destapa es un trozo de fórmula que el aula no llega a ver.
 */
export function escenaEstatica(texto: string, id: string, latex?: string | null): Escena {
  const limpio = String(texto ?? "").trim();
  return {
    id,
    texto: limpio,
    latex: latex?.trim() || componerPaso(limpio),
    narracion: "",
    clase: "texto",
    focos: [],
    origen: "deduccion",
  };
}

/**
 * LA SUBRUTINA: la escena de un paso, etiquetado o no.
 *
 * Es la única puerta. La usan la pizarra animada y la clásica, el desarrollo y
 * lo que responda "Explicar regla", y por eso las dos pizarras no pueden
 * componer la misma línea de dos maneras distintas.
 *
 *   1. Si el paso trae INSTRUCCIÓN DE FOCO y es válida —todos sus términos
 *      están escritos en él—, manda ella: su tipo elige el compositor, y si ese
 *      compositor no sabe leer el paso, el marcador genérico pone el recuadro,
 *      el color o el tachado sobre los términos que diga. Una etiqueta válida
 *      NUNCA se sustituye por una suposición.
 *   2. Sólo si el paso no trae etiqueta —o la trae mal— se deduce del
 *      contenido. Cada lectura es estricta: la que no reconoce lo suyo devuelve
 *      null y deja pasar a la siguiente. El orden importa: "24 + 17" es a la vez
 *      una cuenta en columna y una expresión, y se anima como cuenta.
 */
export function escenaDeLinea(paso: string | PasoSemantico, id: string): Escena {
  const texto = typeof paso === "string" ? paso : String(paso.latex ?? "");
  // UNA CUENTA DEL TALLER NO ES LA RESPUESTA DEL EJERCICIO. "−8 + 8 = 0" es una
  // igualdad como cualquier otra y se componía como resultado: cápsula esmeralda
  // y visto verde, en la columna de apoyo. La respuesta es UNA y está en el hilo.
  const delTaller = typeof paso !== "string" && paso.ambiente === 2;
  const sinCierre = (e: Escena): Escena =>
    delTaller ? { ...e, focos: e.focos.map(({ final: _final, ...f }) => f) } : e;

  if (typeof paso !== "string" && paso.operacion && etiquetaValida(texto, paso.operacion)) {
    const porEtiqueta =
      COMPOSITOR[paso.operacion.tipo]?.(texto, id, paso.narracion) ??
      escenaDePasoSemantico(paso, id, componerPaso);
    if (porEtiqueta) {
      const escena = paso.operacion.final && !delTaller ? conCierre(porEtiqueta) : porEtiqueta;
      return { ...sinCierre(escena), origen: "etiqueta" };
    }
  }

  const deducida =
    // UNA CUENTA DEL TALLER SE ESCRIBE EN LÍNEA, NO EN COLUMNA.
    //
    // "8 − 8 = 0" es una resta, y la pizarra la componía como cuenta vertical
    // —con su raya y el 0 debajo—: el cliente lo vio en el vídeo y lo describió
    // como «un 0 flotante». En el taller se anota al margen, como en un
    // cuaderno; la cuenta en columna es para el ejercicio de aritmética.
    (delTaller ? null : escenaDeColumna(texto, id)) ??
    escenaDeDespeje(texto, id) ??
    escenaDeDistributiva(texto, id) ??
    escenaDeAmplificacion(texto, id) ??
    escenaDeSumaDeFracciones(texto, id) ??
    escenaDeSimplificacion(texto, id) ??
    escenaDePolinomio(texto, id) ??
    escenaDeTexto(texto, id);
  return { ...sinCierre(deducida), origen: "deduccion" };
}

/**
 * El guion completo de una lección, una escena por línea con contenido.
 *
 * Las repeticiones se descartan: el motor escribe el enunciado ("234 + 178") y
 * luego el desarrollo de la misma cuenta ("234 + 178 = 412"), que son la misma
 * operación y producen la misma escena. Sin este filtro la pizarra decía "línea
 * 1 de 2" y repetía la cuenta entera, y seguir la voz se volvía ambiguo porque
 * dos escenas encajaban igual de bien.
 */
export function guionDeLeccion(lineas: readonly (string | PasoSemantico)[]): Escena[] {
  const escenas: Escena[] = [];
  const vistas = new Set<string>();

  for (const cruda of lineas) {
    const paso = typeof cruda === "string" ? cruda.trim() : cruda;
    const linea = typeof paso === "string" ? paso : String(paso?.latex ?? "").trim();
    if (!linea) continue;

    // EL TALLER NO ES GUION. Un cálculo de la columna de apoyo —"6 - 6 = 0"— no
    // es un paso que el tutor recorra: se escribe cuando lo narra y se queda
    // (la pizarra ya lo trata así, ver `animable`). Colado en el guion corría
    // los índices de los pasos de verdad, y la ecuación que el tutor acababa de
    // decir quedaba DOS escenas por delante de la voz en vez de una: se ocultaba
    // y dejaba en su columna el hueco que el cliente fotografió.
    if (typeof paso !== "string" && paso.ambiente === 2) continue;

    const escena = escenaDeLinea(paso, `escena-${escenas.length}`);
    // La prosa no entra en el guion. Una frase del tutor no tiene nada que
    // resaltar: como escena sólo repite lo que ya está en el subtítulo, y
    // además parte la lección en trozos —"línea 1 de 3"— que no corresponden a
    // ningún paso. La pizarra animada anima lo que se puede animar.
    if (escena.focos.length === 0) continue;

    const identidad = identidadDeEscena(escena);
    if (vistas.has(identidad)) continue;
    vistas.add(identidad);
    escenas.push(escena);
  }

  return escenas;
}

/**
 * Qué hace única a una escena: la cuenta que resuelve, no cómo está escrita.
 *
 * La usa también la pizarra, para saber qué línea escrita corresponde a qué
 * escena del guion —la que la animación está recorriendo—.
 */
export function identidadDeEscena(escena: Escena): string {
  const op = operacionDeLinea(escena.texto);
  if (op) return `columna:${op.a}${op.operador}${op.b}`;
  return `${escena.clase}:${normalizar(escena.texto).replace(/\s+/g, "")}`;
}

/** ¿Esta línea se anima con focos, o es texto que sólo se lee? */
export function esAnimable(paso: string | PasoSemantico): boolean {
  return escenaDeLinea(typeof paso === "string" ? String(paso ?? "") : paso, "prueba").focos.length > 0;
}

/**
 * Las reglas CSS que destapan lo ya calculado, hasta el paso `foco` incluido.
 *
 * El guion marca cada pieza pendiente con `pz-rev-N` y la hoja de estilos las
 * arranca invisibles; esto declara visibles las que ya han salido. Se hace con
 * una REGLA y no tocando el DOM: los estilos escritos a mano sobre los nodos de
 * KaTeX se pierden en cuanto algo repinta el bloque, y entonces las cifras no
 * aparecen nunca —que es exactamente lo que se vio en el navegador del cliente.
 */
export function reglasDeRevelado(id: string, foco: number): string {
  if (foco < 0 || !id) return "";
  const visibles = Array.from({ length: foco + 1 }, (_, i) => `#${id} .pz-rev-${i}`);
  return `${visibles.join(",")}{opacity:1}`;
}

// ── Seguir la voz del tutor ──────────────────────────────────────────────────

/**
 * DÓNDE ESTÁ LA LECCIÓN, SEGÚN LO QUE EL TUTOR ACABA DE DECIR.
 *
 * La pizarra animada no vive aparte del tutor: cuando él dice "sumamos las
 * decenas", el recuadro tiene que estar sobre las decenas. Antes había que
 * darle a Reproducir en el panel para que se moviera, así que la voz iba por un
 * lado y la pizarra por otro —justo lo que el cliente vio en la captura.
 *
 * Se compara lo dicho con la narración de cada foco: coinciden las cifras, la
 * posición decimal y los verbos. No hace falta que el tutor use nuestras
 * palabras exactas —él dice "escribimos 1 y llevamos 1" y el guion "escribo 1 y
 * llevo 1"— porque se puntúa por solapamiento, no por igualdad.
 */
export interface Situacion {
  escena: number;
  /** Foco encendido; -1 es la entrada de la escena. */
  foco: number;
}

/** Por debajo de esto no se mueve nada: mejor quieto que saltando al azar. */
const UMBRAL_SEGUIMIENTO = 0.45;

export function situacionParaNarracion(
  escenas: readonly Escena[],
  narracion: string,
  escenaActual = 0,
  /** Dónde está la pizarra AHORA. -1 es el reposo: la escena sin resaltar. */
  focoActual = -1,
): Situacion | null {
  const dicho = normalizar(narracion);
  if (!dicho.trim() || escenas.length === 0) return null;
  /**
   * Se comparan PALABRAS ENTERAS, no trozos.
   *
   * Buscando por dentro, "vamos" aparecía en "lle­vamos" y "sumar" en
   * "sumamos": la entrada de la escena empataba con la columna que el tutor
   * estaba explicando y, al empatar, ganaba ella. El resaltado se quedaba en el
   * primer paso mientras la voz iba por las unidades.
   */
  const palabras = palabrasDe(narracion);
  const dichoLiteral = literal(narracion);

  // EL CIERRE DEL EJEMPLO, ANTES QUE NADA.
  //
  // "Así, 3 + 4 = 7. Ahora te toca a ti." es la frase con la que el tutor cierra
  // la cuenta, y el óvalo tiene que ir al resultado. Por puntuación no puede
  // ganar: dice exactamente los mismos números que el paso de las unidades —en
  // una suma de una cifra, "3 más 4 son 7" ES la cuenta entera—, y el paso de
  // las unidades lleva además la palabra de su columna. Se reconoce por su
  // forma, no por parecido.
  const cierre = cierreDeColumna(escenas, palabras, escenaActual);
  if (cierre) return cierre;

  // PRESENTAR UNA LÍNEA NO ES OPERARLA.
  //
  // "Vamos a resolver 2(x + 3) = 16 paso a paso" y "Vamos con otra ecuación:
  // 2(x + 3) = 16" dicen la ecuación ENTERA y ninguna operación. Por parecido
  // acababan en un foco —comparten el 2, el 3 y el 16 con "y 2 por 3 es 6"—, y
  // dos frases de ésas seguidas dejaban la escuadra del reparto del 2 al 3 antes
  // de que el tutor hubiera dicho nada: «la flecha salta directamente conectando
  // el 2 con el 3, ignorando la multiplicación inicial (2·x)».
  //
  // Una frase que REPITE la línea entera y no nombra ninguno de sus focos deja la
  // pizarra en REPOSO sobre ella: escrita, sin nada señalado. Es lo que hace un
  // profesor al leer el enunciado antes de empezar.
  const presenta = presentaLaLinea(escenas, dicho, escenaActual);
  if (presenta) return presenta;

  // ¿Está el tutor DANDO un paso, o describiendo el método?
  const enumera = enumeraColumnas(dicho);

  // Se buscan por separado la mejor escena CON algo que señalar y la mejor sin
  // nada. Una línea de prosa cuya narración es la frase entera encaja al 100 %
  // y le robaba el turno a la columna que el tutor estaba explicando; entre las
  // dos, gana siempre la que puede enseñar el paso.
  let eleccion: Situacion | null = null;
  let mejorPuntuacion = 0;
  let respaldo: Situacion | null = null;
  let mejorRespaldo = 0;

  for (let indice = 0; indice < escenas.length; indice++) {
    const escena = escenas[indice];
    const candidatos: Array<{ foco: number; texto: string; claves: string[] }> = [
      { foco: -1, texto: escena.narracion, claves: [] },
      ...escena.focos.map((f, i) => ({ foco: i, texto: f.narracion, claves: clavesDeFoco(f) })),
    ];

    for (const candidato of candidatos) {
      let puntos = solapamiento(candidato.texto, palabras);
      // UN EMPATE EXACTO LO GANA EL FOCO MÁS CONCRETO: el que ha acertado más
      // piezas. "El 2 multiplica a x" y "Y el 2 multiplica a 3" sólo se
      // distinguen por la x —de una letra, no cuenta como pieza—, así que al
      // oír la segunda frase las dos puntuaban 1 y ganaba la primera por orden:
      // la animación se quedaba en el primer término. La que acierta además el
      // 3 y el 6 es la que se está diciendo. Una milésima por pieza no alcanza
      // para cambiar ninguna diferencia real entre candidatos.
      puntos += aciertos(candidato.texto, palabras) * 0.001;
      if (!enumera && candidato.claves.some((clave) => dicho.includes(clave))) puntos += 0.5;
      // LA LOCUCIÓN EXACTA DEL MOTOR MANDA. Un paso etiquetado trae la frase
      // con la que el tutor lo va a contar; si lo dicho ES esa frase, ningún
      // parecido vale más. Sin esto, la regla de la potencia —"el coeficiente
      // es 1 y el exponente 2…"— encajaba mejor en el enunciado "x²", que tiene
      // un foco llamado "exponente", que en el paso "derivada de x² = 2x" que el
      // tutor estaba contando, y la pizarra no llegaba a enmarcar su resultado.
      if (dichoLiteral !== "" && literal(candidato.texto) === dichoLiteral) puntos += 1;
      // Un empate se resuelve a favor de donde ya está la pizarra: saltar de
      // escena por un decimal es peor que quedarse.
      if (indice === escenaActual) puntos += 0.05;

      // Un empate entre la entrada de la escena y un paso lo gana el paso: la
      // entrada no señala nada. Sin este desempate, "escribimos el 3 debajo de
      // las unidades" se quedaba en la entrada porque "vamos" y "columna"
      // empataban con "unidades" y "13".
      if (candidato.foco >= 0) puntos += 0.02;

      if (puntos < UMBRAL_SEGUIMIENTO) continue;

      if (escena.focos.length === 0) {
        if (puntos > mejorRespaldo) {
          mejorRespaldo = puntos;
          respaldo = { escena: indice, foco: candidato.foco };
        }
        continue;
      }

      if (puntos > mejorPuntuacion) {
        mejorPuntuacion = puntos;
        eleccion = { escena: indice, foco: candidato.foco };
      }
    }
  }

  return enOrden(eleccion ?? respaldo, escenaActual, focoActual, enumera);
}

/**
 * LA CUENTA SE CUENTA EN ORDEN, Y EMPIEZA EN REPOSO.
 *
 * El parecido entre frases elige BIEN el sitio casi siempre, pero cuando se
 * equivoca lo hace de la peor manera: la locución que abre la fase de reglas
 * —"…primero las unidades, luego las decenas… si pasa de 9, LLEVAMOS 1"— repite
 * la palabra "decenas" y un par de unos, y con eso puntúa más alto en el paso de
 * las decenas que en ningún otro sitio. La pizarra arrancaba en "Paso 3 de 4",
 * con la columna de las decenas ya resuelta, mientras el tutor apenas estaba
 * presentando la regla. El cliente lo describió exactamente así.
 *
 * Contra eso no vale afinar la puntuación —un "1" suelto aparece en cualquier
 * frase—: hace falta una regla de orden, que es la que sigue una cuenta de
 * verdad.
 *
 *   1. Estando en reposo, una frase que ENUMERA columnas no puede llevar la
 *      pizarra MÁS ALLÁ del primer paso. Enumerar es presentar el método, no
 *      operar una columna. Al primer paso sí puede llevarla: "sumamos las
 *      unidades y llevamos 1 a las decenas" nombra dos y es un paso de verdad,
 *      y bloquearlo dejaría la pizarra un paso por detrás del audio.
 *   2. No se salta ningún paso: se avanza de uno en uno. Así, si una locución
 *      apunta tres pasos más allá, la pizarra da UNO. Retroceder sí es libre:
 *      "repito el paso anterior" tiene que poder volver.
 *
 * La segunda regla es además la que impide que la primera congele nada: pase lo
 * que pase, la locución siguiente puede avanzar un paso.
 */
/**
 * ¿La frase se limita a PRESENTAR una línea de la pizarra?
 *
 * Lo es cuando repite la línea entera —sin espacios, como se escribe— y no dice
 * nada que distinga a ninguno de sus focos. Entonces no hay paso que señalar: la
 * pizarra se pone en esa línea, en reposo.
 */
const ABRE_EL_EJERCICIO = /^(?:vamos|veamos|empecemos|resolvamos)\b|paso a paso/;

function presentaLaLinea(
  escenas: readonly Escena[],
  dicho: string,
  escenaActual: number,
): Situacion | null {
  // Sólo las frases con las que se PRESENTA —"vamos a resolver…", "vamos con
  // otra ecuación…", "…paso a paso"—. Cualquier otra que repita la línea la
  // está operando y le toca a su foco.
  if (!ABRE_EL_EJERCICIO.test(dicho.trim())) return null;
  const sinEspacios = (t: string) => normalizar(t).replace(/[^a-z0-9+\-*/=().]/gi, "");
  const dichoPegado = sinEspacios(dicho);
  // NUNCA HACIA ATRÁS. Al encadenar ejercicios el tutor dice «Vamos con otra
  // ecuación: 2(x + 3) = 16» mientras la pizarra aún tiene el anterior resuelto:
  // si esa frase llevara el puntero a la primera línea, todo lo de detrás
  // volvería a estar «por explicar» y se borraría de la pizarra. Se busca de la
  // escena en curso en adelante; al empezar de cero, el reposo ya es la 0.
  for (let indice = Math.max(0, escenaActual); indice < escenas.length; indice++) {
    const escena = escenas[indice];
    const linea = sinEspacios(String(escena.texto ?? ""));
    // Una línea corta —"x = 5"— aparece dentro de cualquier frase por azar.
    if (linea.length < 6 || !dichoPegado.includes(linea)) continue;
    return { escena: indice, foco: -1 };
  }
  return null;
}

function enOrden(
  destino: Situacion | null,
  escenaActual: number,
  focoActual: number,
  enumera: boolean,
): Situacion | null {
  if (!destino) return null;

  // Al cambiar de escena se entra por el principio, no por en medio.
  const desde = destino.escena === escenaActual ? focoActual : -1;

  if (enumera && desde < 0 && destino.foco > 0) return { escena: destino.escena, foco: -1 };

  return { escena: destino.escena, foco: Math.min(destino.foco, desde + 1) };
}

/**
 * ¿Es esto el cierre de una cuenta en columna?
 *
 * Lo es cuando la frase cumple las dos condiciones a la vez:
 *
 *   1. NO nombra ninguna columna. El tutor dice "unidades" o "decenas" siempre
 *      que explica una, así que una frase sin esa palabra no está en ninguna.
 *   2. Repite la cuenta ENTERA: los dos sumandos y el total.
 *
 * Con las dos no queda otra lectura: la frase resume la cuenta y lo que toca
 * encender es el óvalo del resultado. Exigir la cuenta entera es lo que separa
 * el cierre de la presentación de la SIGUIENTE cuenta —"Vamos a sumar 7 más 2,
 * columna por columna" tampoco nombra columna, pero no dice ni 3, ni 4, ni 7—.
 */
function cierreDeColumna(
  escenas: readonly Escena[],
  palabras: Set<string>,
  escenaActual: number,
): Situacion | null {
  const orden = [
    escenaActual,
    ...escenas.map((_, i) => i).filter((i) => i !== escenaActual),
  ];

  for (const indice of orden) {
    const escena = escenas[indice];
    if (!escena) continue;

    // Sólo las cuentas en columna: son las únicas cuyos focos llevan el nombre
    // de su columna. En un polinomio o un despeje esta lectura no aplica.
    const columnas = escena.focos.filter((f) => f.pista);
    if (columnas.length === 0) continue;
    if (columnas.some((f) => palabras.has(f.pista as string))) continue;

    const resultado = escena.focos.findIndex((f) => f.clase === "pz-resultado");
    if (resultado < 0) continue;

    const cuenta = [
      ...cifrasDe(escena.narracion),
      ...cifrasDe(escena.focos[resultado].narracion),
    ];
    if (cuenta.length === 0 || !cuenta.every((n) => palabras.has(n))) continue;

    return { escena: indice, foco: resultado };
  }

  return null;
}

/** Los números enteros de un texto, tal como se dicen. */
function cifrasDe(texto: string): string[] {
  return normalizar(texto).match(/\d+/g) ?? [];
}

/**
 * ¿La frase ENUMERA columnas en vez de estar en una?
 *
 * "…de derecha a izquierda (primero las unidades, luego las decenas…)" nombra
 * dos: no está en ninguna, las está presentando. Es la locución con la que se
 * abre la fase de reglas, y con ella la pizarra se plantaba en el paso de las
 * decenas —"Paso 3 de 4", con la columna ya resuelta— mientras el tutor apenas
 * estaba diciendo de qué va la regla. El cliente lo reportó como un desfase de
 * estado, y lo es: la pizarra iba por delante del audio desde el primer segundo.
 *
 * Una frase así no puede ganar por NOMBRAR una columna. Sigue puntuando por
 * parecido, que es lo que deja pasar los pasos de verdad: "sumamos las unidades
 * y llevamos 1 a las decenas" también nombra dos, pero repite las cifras de su
 * columna y gana por ellas, no por la palabra.
 */
function enumeraColumnas(dicho: string): boolean {
  const nombradas = ["unidades", "decenas", "centenas", "millar"].filter((posicion) =>
    dicho.includes(posicion),
  );
  return nombradas.length >= 2;
}

/** Palabras que delatan un foco aunque el tutor lo cuente con otras palabras. */
function clavesDeFoco(foco: Foco): string[] {
  // La posición decimal manda sobre todo lo demás: si el tutor dice "decenas",
  // está en las decenas, redacte la frase como la redacte.
  //
  // Y si esa columna se lleva una, "llevo" también la delata: el cliente pidió
  // que al oír "llevo 1" el acarreo se destaque EN ESE MOMENTO, y en la fase de
  // reglas la frase no nombra ninguna posición ("si pasa de 9, llevo 1").
  if (foco.pista) {
    return foco.etiqueta === "llevo 1"
      ? [foco.pista, "llevo", "llevada", "llevamos", "acarreo"]
      : [foco.pista];
  }
  // Tachar se dispara con "se cancela", y sólo con eso: "restamos 6 en ambos
  // lados" es el paso ANTERIOR —escribir la resta—, y con él se tachaba ya.
  if (foco.tipo === "tachado") return ["cancel"];
  // «ambos miembros» entra en la lista porque desde que cada frase explica el
  // PORQUÉ antes de operar, el tutor dice «restamos 12 en ambos miembros» con
  // las palabras del álgebra, no «en los dos lados».
  if (foco.clase === "pz-uniforme")
    return ["restamos", "sumamos", "quitamos", "los dos lados", "ambos lados", "los dos miembros", "ambos miembros"];
  if (foco.clase === "pz-final") return ["resultado final", "respuesta final"];
  if (foco.clase === "pz-coef-despeje") return ["dividimos", "dividir", "divide", "multiplicada por"];
  // La división ya escrita en fracción: se enciende cuando la voz habla de
  // dividir, que es lo que se está viendo en esos dos denominadores.
  if (foco.clase === "pz-divisor") return ["dividimos", "dividir", "divide", "al dividir"];
  if (foco.clase === "pz-solucion") return ["vale", "solucion", "por tanto", "queda "];
  if (foco.clase === "pz-resultado") return ["resultado", "en total"];
  if (foco.clase.startsWith("pz-coef")) return ["coeficiente"];
  if (foco.clase.startsWith("pz-exp")) return ["exponente"];
  return [];
}

/**
 * Qué parte de lo que diría el guion aparece en lo que ha dicho el tutor.
 *
 * Cuentan las palabras largas y los números ENTEROS, de una cifra o de cuatro.
 *
 * Antes se exigían dos cifras. El miedo era razonable —"234 + 178 = 412" lleva
 * dentro un 2, un 1 y un 4, y contarlos habría hecho que el cierre del ejemplo
 * se pareciera al paso de las centenas—, pero no llega a darse: los dos lados
 * se parten en números ENTEROS, así que la pieza "2" sólo casa con un "2"
 * suelto, nunca con el 2 que va dentro de "234".
 *
 * Y exigir dos cifras dejaba ciega a la pizarra justo con las cuentas de los
 * más pequeños: en "3 + 4 = 7" no hay una sola pieza que puntuar, así que dos
 * sumas distintas de una cifra eran indistinguibles y el cierre del ejemplo no
 * encajaba en ningún paso.
 */
function solapamiento(narracion: string, palabras: Set<string>): number {
  const piezas = normalizar(narracion).match(/[a-z]{4,}|\d+/g) ?? [];
  if (piezas.length === 0) return 0;
  return aciertos(narracion, palabras) / piezas.length;
}

/** Cuántas piezas de la narración de un foco aparecen en lo dicho. */
function aciertos(narracion: string, palabras: Set<string>): number {
  const piezas = normalizar(narracion).match(/[a-z]{4,}|\d+/g) ?? [];
  return piezas.filter((pieza) => palabras.has(pieza)).length;
}

/** La frase sin signos ni mayúsculas: para reconocer una locución dicha tal cual. */
function literal(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9]+/g, " ").trim();
}

/** Las palabras de lo dicho, enteras. */
function palabrasDe(texto: string): Set<string> {
  return new Set(normalizar(texto).match(/[a-z]+|\d+/g) ?? []);
}

/** Sin tildes, en minúsculas: el tutor no siempre acentúa igual que el guion. */
function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Primera letra en mayúscula, para que la locución empiece como una frase. */
function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
