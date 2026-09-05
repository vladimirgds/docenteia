import {
  leerSumaOResta,
  marcasDeColumna,
  operacionDeLinea,
  type OperacionEnColumna,
} from "./columna.ts";
import { planoALatex } from "../matematicas/index.ts";

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

export type TipoFoco = "caja" | "ovalo" | "tachado";

export interface Foco {
  /** Clase que marca en el LaTeX las piezas que abarca este foco. */
  clase: string;
  tipo: TipoFoco;
  /** Lo que se dice mientras está encendido. Es la unidad de sincronización. */
  narracion: string;
  /** Rótulo corto que se dibuja junto al recuadro ("llevo 1"). */
  etiqueta?: string;
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
  clase: "columna" | "polinomio" | "despeje" | "simplificacion" | "texto";
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
        ...marcas.map((m, j) =>
          m ? conRevelado(`pz-llevada-${j}`, pasoDeMarca(j), `\\scriptstyle ${m}`) : "",
        ),
      ].join(" & "),
    );
  }
  filas.push(["", ...da.map((d, i) => celda(i, d))].join(" & "));
  filas.push([op.operador, ...db.map((d, i) => celda(i, d))].join(" & "));

  const cuerpo = filas.join(" \\\\ ") + " \\\\ \\hline";
  const total =
    " " +
    [
      "",
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
        ...(llevada && i - 1 >= 0 ? { etiqueta: "llevo 1" } : {}),
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
      ...(prestado && i - 1 >= 0 ? { etiqueta: "reagrupo" } : {}),
    });
    arrastre = prestado ? 1 : 0;
  }

  return focos;
}

function focoDelResultado(op: OperacionEnColumna): Foco {
  return {
    clase: "pz-resultado",
    tipo: "ovalo",
    narracion: `El resultado es ${op.resultado}.`,
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

      const legible = `${t.coeficiente || ""}${t.variable}${t.exponente ? ` elevado a ${t.exponente}` : ""}`;
      focos.push({
        clase: `pz-term-${i}`,
        tipo: "caja",
        narracion: `Miramos el término ${legible.trim()}.`,
      });
      if (t.coeficiente && t.variable) {
        focos.push({
          clase: `pz-coef-${i}`,
          tipo: "ovalo",
          narracion: `Su coeficiente es ${t.coeficiente}.`,
          etiqueta: "coeficiente",
        });
      }
      if (t.exponente) {
        focos.push({
          clase: `pz-exp-${i}`,
          tipo: "ovalo",
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
 * Una ecuación lineal con el término que se cancela TACHADO a los dos lados.
 *
 * La cancelación es el momento en que se entiende el despeje: el +5 y el −5 se
 * van juntos. Verlo tachado en los dos lados a la vez es exactamente lo que el
 * pliego pide con "cancelaciones".
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
  // El coeficiente sólo se marca cuando está escrito. En "x + 5 = 20" no hay
  // un 1 que señalar, y dibujar un recuadro sobre nada deja la caja flotando.
  const izquierda = unitario
    ? `${coeficiente === -1 ? "-" : ""}${variable}`
    : `${marcar("pz-coef-despeje", String(coeficiente))}${variable}`;
  const terminoLatex = b === 0 ? "" : ` ${b > 0 ? "+" : "-"} ${marcar("pz-cancela", String(Math.abs(b)))}`;

  // Cuántos focos habrá, para saber en cuál se destapa la solución. La ecuación
  // no puede empezar con el resultado escrito: eso es dar la respuesta antes de
  // la pregunta.
  const focosPrevistos = (b !== 0 ? 1 : 0) + (unitario ? 0 : 1) + 1;
  const pasoSolucion = focosPrevistos - 1;

  // Lo que se resta a la derecha aparece en el momento de cancelar, no antes.
  const compensacion =
    b === 0
      ? ""
      : ` ${marcar(`pz-rev-0`, `${b > 0 ? "-" : "+"} ${marcar("pz-cancela", String(Math.abs(b)))}`)}`;

  const solucion = formatearRacional(c - b, coeficiente);
  const latex =
    `${izquierda}${terminoLatex} = ${c}${compensacion}` +
    ` ${marcar(
      `pz-rev-${pasoSolucion}`,
      `\\quad \\Rightarrow \\quad ${variable} = ${marcar("pz-solucion", racionalLatex(c - b, coeficiente))}`,
    )}`;

  const focos: Foco[] = [];
  if (b !== 0) {
    focos.push({
      clase: "pz-cancela",
      tipo: "tachado",
      narracion: `Quitamos ${Math.abs(b)} en los dos lados: a la izquierda se cancela y a la derecha ${c} ${b > 0 ? "menos" : "más"} ${Math.abs(b)} son ${c - b}.`,
      etiqueta: "se cancelan",
    });
  }
  if (!unitario) {
    focos.push({
      clase: "pz-coef-despeje",
      tipo: "ovalo",
      narracion: `Queda ${coeficiente}${variable} = ${c - b}. Dividimos los dos lados entre ${coeficiente}.`,
      etiqueta: "dividimos",
    });
  }
  focos.push({
    clase: "pz-solucion",
    tipo: "ovalo",
    narracion: `${variable} vale ${solucion}.`,
  });

  return {
    id,
    texto,
    latex,
    narracion: `Despejamos ${variable}.`,
    clase: "despeje",
    focos,
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
    `\\frac{${marcar("pz-cancela", arriba)}}{${marcar("pz-cancela", abajo)}}` +
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
        tipo: "tachado",
        narracion: `${mayuscula(porQue.join(" y "))}.`,
        etiqueta: divisor > 1 ? `÷ ${divisor}` : "se cancelan",
      },
      {
        clase: "pz-simplificada",
        tipo: "ovalo",
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
 * La escena de una línea, probando cada guion por orden de especificidad.
 *
 * El orden importa: "24 + 17" es a la vez una cuenta en columna y, si se mira
 * de lejos, una expresión; se anima como cuenta, que es lo que se está
 * enseñando.
 */
export function escenaDeLinea(texto: string, id: string): Escena {
  return (
    escenaDeColumna(texto, id) ??
    escenaDeDespeje(texto, id) ??
    escenaDeSimplificacion(texto, id) ??
    escenaDePolinomio(texto, id) ??
    escenaDeTexto(texto, id)
  );
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
export function guionDeLeccion(lineas: readonly string[]): Escena[] {
  const escenas: Escena[] = [];
  const vistas = new Set<string>();

  for (const cruda of lineas) {
    const linea = String(cruda ?? "").trim();
    if (!linea) continue;

    const escena = escenaDeLinea(linea, `escena-${escenas.length}`);
    const identidad = identidadDeEscena(escena);
    if (vistas.has(identidad)) continue;
    vistas.add(identidad);
    escenas.push(escena);
  }

  return escenas;
}

/** Qué hace única a una escena: la cuenta que resuelve, no cómo está escrita. */
function identidadDeEscena(escena: Escena): string {
  const op = operacionDeLinea(escena.texto);
  if (op) return `columna:${op.a}${op.operador}${op.b}`;
  return `${escena.clase}:${normalizar(escena.texto).replace(/\s+/g, "")}`;
}

/** ¿Esta línea se anima con focos, o es texto que sólo se lee? */
export function esAnimable(texto: string): boolean {
  return escenaDeLinea(String(texto ?? ""), "prueba").focos.length > 0;
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
): Situacion | null {
  const dicho = normalizar(narracion);
  if (!dicho.trim() || escenas.length === 0) return null;

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
      let puntos = solapamiento(candidato.texto, dicho);
      if (candidato.claves.some((clave) => dicho.includes(clave))) puntos += 0.5;
      // Un empate se resuelve a favor de donde ya está la pizarra: saltar de
      // escena por un decimal es peor que quedarse.
      if (indice === escenaActual) puntos += 0.05;

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

  return eleccion ?? respaldo;
}

/** Palabras que delatan un foco aunque el tutor lo cuente con otras palabras. */
function clavesDeFoco(foco: Foco): string[] {
  if (foco.tipo === "tachado") return ["cancel", "quitamos", "restamos", "ambos lados", "los dos lados"];
  if (foco.clase === "pz-coef-despeje") return ["dividimos", "dividir", "divide"];
  if (foco.clase === "pz-solucion") return ["vale", "solucion", "por tanto", "queda "];
  if (foco.clase === "pz-resultado") return ["resultado", "en total"];
  if (foco.clase.startsWith("pz-coef")) return ["coeficiente"];
  if (foco.clase.startsWith("pz-exp")) return ["exponente"];
  return [];
}

/**
 * Qué parte de lo que diría el guion aparece en lo que ha dicho el tutor.
 *
 * Sólo cuentan las palabras largas y los números de dos cifras o más. Un "2"
 * suelto aparece en casi cualquier frase con números —"234 + 178 = 412" tiene
 * un 2, un 1 y un 4—, así que contarlo como prueba hacía que el cierre del
 * ejemplo se pareciera al paso de las centenas más que al del resultado.
 */
function solapamiento(narracion: string, dicho: string): number {
  const piezas = normalizar(narracion).match(/[a-z]{4,}|\d{2,}/g) ?? [];
  if (piezas.length === 0) return 0;
  const aciertos = piezas.filter((pieza) => dicho.includes(pieza)).length;
  return aciertos / piezas.length;
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
