import { leerSumaOResta, marcasDeColumna, type OperacionEnColumna } from "./columna.ts";
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
  clase: "columna" | "polinomio" | "despeje" | "texto";
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
  const op = leerSumaOResta(texto);
  if (!op) return null;

  const ancho = Math.max(String(op.a).length, String(op.b).length, String(op.resultado).length);
  const da = cifras(op.a, ancho);
  const db = cifras(op.b, ancho);
  const dr = cifras(op.resultado, ancho);
  const marcas = marcasDeColumna(op, ancho);

  // Cada celda lleva la clase de SU columna; el recuadro que las abarca a todas
  // es lo que dibuja la caja vertical.
  const celda = (columna: number, valor: string) =>
    valor === "" ? "" : marcar(`pz-col-${columna}`, valor);

  const filas: string[] = [];
  if (marcas.some(Boolean)) {
    filas.push(
      ["", ...marcas.map((m, i) => (m ? marcar(`pz-llevada-${i}`, `\\scriptstyle ${m}`) : ""))].join(
        " & ",
      ),
    );
  }
  filas.push(["", ...da.map((d, i) => celda(i, d))].join(" & "));
  filas.push([op.operador, ...db.map((d, i) => celda(i, d))].join(" & "));

  const cuerpo = filas.join(" \\\\ ") + " \\\\ \\hline";
  const total = " " + ["", ...dr.map((d, i) => marcar("pz-resultado", celda(i, d)))].join(" & ");
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
  const compensacion = b === 0 ? "" : ` ${b > 0 ? "-" : "+"} ${marcar("pz-cancela", String(Math.abs(b)))}`;

  const solucion = formatearRacional(c - b, coeficiente);
  const latex =
    `${izquierda}${terminoLatex} = ${c}${compensacion}` +
    ` \\quad \\Rightarrow \\quad ${variable} = ${marcar("pz-solucion", racionalLatex(c - b, coeficiente))}`;

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
    escenaDePolinomio(texto, id) ??
    escenaDeTexto(texto, id)
  );
}

/** El guion completo de una lección, una escena por línea con contenido. */
export function guionDeLeccion(lineas: readonly string[]): Escena[] {
  return lineas
    .map((l) => String(l ?? "").trim())
    .filter(Boolean)
    .map((linea, i) => escenaDeLinea(linea, `escena-${i}`));
}

/** Primera letra en mayúscula, para que la locución empiece como una frase. */
function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
