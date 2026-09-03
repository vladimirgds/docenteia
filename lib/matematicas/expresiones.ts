/**
 * ANALIZADOR DE EXPRESIONES MATEMÁTICAS.
 *
 * Convierte el texto que escribe un docente —"3x⁴", "e^x", "x·ln(x)",
 * "(x² + 1)/(x - 3)"— en un árbol con el que se puede operar de verdad:
 * derivarlo (`derivar.ts`) y evaluarlo numéricamente (`equivalencia.ts`).
 *
 * POR QUÉ EXISTE
 * El motor heredado del PMV 1 reconocía polinomios y nada más, porque leía las
 * expresiones con expresiones regulares: buscaba "coeficiente + variable +
 * exponente" y aplicaba la regla de la potencia. Con eso, `e^x` y `ln(x)` no
 * eran "una función que no sé derivar" sino texto que no encajaba en el patrón,
 * y el ejercicio se marcaba como NO COMPROBABLE. La única forma de arreglar eso
 * sin acumular parches es leer la expresión como lo que es: una gramática.
 *
 * QUÉ ACEPTA
 *   · Números enteros y decimales, con coma o con punto.
 *   · Variables de una letra y las constantes `e` y `pi` (o π).
 *   · Los operadores + - * / ^ y sus variantes tipográficas (· × ÷ − –).
 *   · Superíndices Unicode: "x²" es "x^2", que es como escribe el motor.
 *   · Multiplicación implícita: "3x", "2(x+1)", "x ln(x)".
 *   · Funciones: ln, log, exp, sqrt (raíz), sin/sen, cos, tan, y su forma sin
 *     paréntesis para un solo argumento — "ln x" es ln(x), como se escribe a
 *     mano en la pizarra.
 *   · Llaves de LaTeX en los exponentes: "e^{2x}".
 *
 * No es un sistema algebraico completo y no pretende serlo: es el mínimo capaz
 * de sostener la derivación y la comprobación de equivalencia con garantía.
 */

// ── El árbol ─────────────────────────────────────────────────────────────────

export type Nodo =
  | { tipo: "numero"; valor: number }
  | { tipo: "constante"; nombre: "e" | "pi" }
  | { tipo: "variable"; nombre: string }
  | { tipo: "suma"; izq: Nodo; der: Nodo }
  | { tipo: "resta"; izq: Nodo; der: Nodo }
  | { tipo: "producto"; izq: Nodo; der: Nodo }
  | { tipo: "cociente"; izq: Nodo; der: Nodo }
  | { tipo: "potencia"; base: Nodo; exponente: Nodo }
  | { tipo: "negacion"; arg: Nodo }
  | { tipo: "funcion"; nombre: NombreFuncion; arg: Nodo };

export const FUNCIONES = [
  "ln",
  "log",
  "exp",
  "sqrt",
  "sin",
  "cos",
  "tan",
] as const;

export type NombreFuncion = (typeof FUNCIONES)[number];

/** Sinónimos que se escriben en castellano o en la notación del prototipo. */
const ALIAS_FUNCION: Record<string, NombreFuncion> = {
  ln: "ln",
  log: "log",
  exp: "exp",
  sqrt: "sqrt",
  raiz: "sqrt",
  raíz: "sqrt",
  sin: "sin",
  sen: "sin",
  cos: "cos",
  tan: "tan",
  tg: "tan",
};

const NOMBRES_FUNCION = Object.keys(ALIAS_FUNCION).sort((a, b) => b.length - a.length);

// ── Léxico ───────────────────────────────────────────────────────────────────

type Token =
  | { clase: "numero"; valor: number }
  | { clase: "nombre"; valor: string }
  | { clase: "funcion"; valor: NombreFuncion }
  | { clase: "op"; valor: "+" | "-" | "*" | "/" | "^" }
  | { clase: "abre" }
  | { clase: "cierra" };

const SUPERINDICES: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-", "⁺": "+", "ⁿ": "n",
};

export class ErrorDeSintaxis extends Error {}

function tokenizar(entrada: string): Token[] {
  const texto = String(entrada ?? "")
    // Variantes tipográficas: el docente copia y pega de todas partes.
    .replace(/[−–—]/g, "-")
    .replace(/[·×⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[{}]/g, (c) => (c === "{" ? "(" : ")"))
    .replace(/π/g, "pi");

  const tokens: Token[] = [];
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    // Superíndices: "x²" se lee igual que "x^2", que es como los escribe el
    // motor determinista en sus respuestas.
    if (c in SUPERINDICES) {
      let exponente = "";
      while (i < texto.length && texto[i] in SUPERINDICES) {
        exponente += SUPERINDICES[texto[i]];
        i++;
      }
      tokens.push({ clase: "op", valor: "^" });
      tokens.push({ clase: "abre" });
      if (exponente.startsWith("-") || exponente.startsWith("+")) {
        tokens.push({ clase: "op", valor: exponente[0] as "+" | "-" });
        exponente = exponente.slice(1);
      }
      if (exponente === "n") tokens.push({ clase: "nombre", valor: "n" });
      else tokens.push({ clase: "numero", valor: Number(exponente) });
      tokens.push({ clase: "cierra" });
      continue;
    }

    if (/[0-9]/.test(c)) {
      let numero = "";
      while (i < texto.length && /[0-9]/.test(texto[i])) numero += texto[i++];
      // El decimal admite coma, que es como se escribe en castellano.
      if (i < texto.length && (texto[i] === "." || texto[i] === ",") && /[0-9]/.test(texto[i + 1] ?? "")) {
        numero += ".";
        i++;
        while (i < texto.length && /[0-9]/.test(texto[i])) numero += texto[i++];
      }
      tokens.push({ clase: "numero", valor: Number(numero) });
      continue;
    }

    if (/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(c)) {
      const resto = texto.slice(i).toLowerCase();
      const funcion = NOMBRES_FUNCION.find(
        (nombre) => resto.startsWith(nombre) && !/[a-z]/.test(resto[nombre.length] ?? ""),
      );
      if (funcion) {
        tokens.push({ clase: "funcion", valor: ALIAS_FUNCION[funcion] });
        i += funcion.length;
        continue;
      }
      // "pi" es la única constante de dos letras; el resto son variables de una
      // letra, de modo que "xy" es el producto x·y y no una variable llamada xy.
      if (resto.startsWith("pi") && !/[a-z]/.test(resto[2] ?? "")) {
        tokens.push({ clase: "nombre", valor: "pi" });
        i += 2;
        continue;
      }
      tokens.push({ clase: "nombre", valor: texto[i].toLowerCase() });
      i++;
      continue;
    }

    if (c === "(" || c === "[") {
      tokens.push({ clase: "abre" });
      i++;
      continue;
    }
    if (c === ")" || c === "]") {
      tokens.push({ clase: "cierra" });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
      tokens.push({ clase: "op", valor: c });
      i++;
      continue;
    }

    throw new ErrorDeSintaxis(`No entiendo el símbolo "${c}".`);
  }

  return tokens;
}

// ── Gramática ────────────────────────────────────────────────────────────────
//
//   expresion := termino (("+" | "-") termino)*
//   termino   := unario (("*" | "/" | implícito) unario)*
//   unario    := ("-" | "+")* potencia
//   potencia  := atomo ("^" unario)?          ← asociativa por la derecha
//   atomo     := numero | nombre | funcion argumento | "(" expresion ")"

class Analizador {
  private pos = 0;
  private readonly tokens: Token[];

  // Sin propiedad de parámetro: los scripts de qa/ corren con Node a secas, que
  // sólo BORRA los tipos y no admite ese azúcar de TypeScript.
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  analizar(): Nodo {
    const nodo = this.expresion();
    if (this.pos < this.tokens.length) {
      throw new ErrorDeSintaxis("Sobra algo al final de la expresión.");
    }
    return nodo;
  }

  private mirar(): Token | undefined {
    return this.tokens[this.pos];
  }

  private esOp(...valores: string[]): boolean {
    const t = this.mirar();
    return t?.clase === "op" && valores.includes(t.valor);
  }

  private expresion(): Nodo {
    let izq = this.termino();
    while (this.esOp("+", "-")) {
      const op = (this.tokens[this.pos] as { valor: string }).valor;
      this.pos++;
      const der = this.termino();
      izq = op === "+" ? { tipo: "suma", izq, der } : { tipo: "resta", izq, der };
    }
    return izq;
  }

  private termino(): Nodo {
    let izq = this.unario();
    for (;;) {
      if (this.esOp("*", "/")) {
        const op = (this.tokens[this.pos] as { valor: string }).valor;
        this.pos++;
        const der = this.unario();
        izq = op === "*" ? { tipo: "producto", izq, der } : { tipo: "cociente", izq, der };
        continue;
      }
      // Multiplicación implícita: "3x", "2(x+1)", "x ln(x)". Sólo cuando lo que
      // viene puede EMPEZAR un factor; si no, se acabó el término.
      const t = this.mirar();
      if (t && (t.clase === "numero" || t.clase === "nombre" || t.clase === "funcion" || t.clase === "abre")) {
        const der = this.unario();
        izq = { tipo: "producto", izq, der };
        continue;
      }
      return izq;
    }
  }

  private unario(): Nodo {
    if (this.esOp("-")) {
      this.pos++;
      return { tipo: "negacion", arg: this.unario() };
    }
    if (this.esOp("+")) {
      this.pos++;
      return this.unario();
    }
    return this.potencia();
  }

  private potencia(): Nodo {
    const base = this.atomo();
    if (this.esOp("^")) {
      this.pos++;
      // El exponente se analiza como unario para que "x^-2" y "e^2x" funcionen;
      // la potencia asocia por la derecha, como en matemáticas.
      return { tipo: "potencia", base, exponente: this.unario() };
    }
    return base;
  }

  private atomo(): Nodo {
    const t = this.mirar();
    if (!t) throw new ErrorDeSintaxis("La expresión termina antes de tiempo.");

    if (t.clase === "numero") {
      this.pos++;
      return { tipo: "numero", valor: t.valor };
    }

    if (t.clase === "nombre") {
      this.pos++;
      if (t.valor === "e") return { tipo: "constante", nombre: "e" };
      if (t.valor === "pi") return { tipo: "constante", nombre: "pi" };
      return { tipo: "variable", nombre: t.valor };
    }

    if (t.clase === "funcion") {
      this.pos++;
      const siguiente = this.mirar();
      if (siguiente?.clase === "abre") {
        this.pos++;
        const arg = this.expresion();
        if (this.mirar()?.clase !== "cierra") {
          throw new ErrorDeSintaxis(`Falta cerrar el paréntesis de ${t.valor}.`);
        }
        this.pos++;
        return { tipo: "funcion", nombre: t.valor, arg };
      }
      // "ln x" sin paréntesis: se aplica al átomo siguiente, que es como se
      // escribe a mano. "ln x + 1" es ln(x) + 1, igual que en la pizarra.
      return { tipo: "funcion", nombre: t.valor, arg: this.potencia() };
    }

    if (t.clase === "abre") {
      this.pos++;
      const dentro = this.expresion();
      if (this.mirar()?.clase !== "cierra") {
        throw new ErrorDeSintaxis("Falta cerrar un paréntesis.");
      }
      this.pos++;
      return dentro;
    }

    throw new ErrorDeSintaxis("Esperaba un número, una variable o un paréntesis.");
  }
}

/**
 * Lee una expresión y devuelve su árbol, o `null` si no se deja leer.
 *
 * Devuelve null en lugar de lanzar porque quien llama —el validador, el
 * corrector— trata "no lo entiendo" como un dato, no como una avería: significa
 * que no se puede verificar por esta vía, y hay otras que probar.
 */
export function analizar(expresion: string): Nodo | null {
  const texto = String(expresion ?? "").trim();
  if (!texto) return null;
  try {
    return new Analizador(tokenizar(texto)).analizar();
  } catch {
    return null;
  }
}

/** Las variables que aparecen en la expresión, sin repetir. */
export function variablesDe(nodo: Nodo): string[] {
  const vistas = new Set<string>();
  const recorrer = (n: Nodo) => {
    switch (n.tipo) {
      case "variable":
        vistas.add(n.nombre);
        break;
      case "suma":
      case "resta":
      case "producto":
      case "cociente":
        recorrer(n.izq);
        recorrer(n.der);
        break;
      case "potencia":
        recorrer(n.base);
        recorrer(n.exponente);
        break;
      case "negacion":
        recorrer(n.arg);
        break;
      case "funcion":
        recorrer(n.arg);
        break;
    }
  };
  recorrer(nodo);
  return [...vistas];
}

/** ¿Aparece esta variable en la expresión? */
export function dependeDe(nodo: Nodo, variable: string): boolean {
  return variablesDe(nodo).includes(variable);
}

// ── Evaluación numérica ──────────────────────────────────────────────────────

/**
 * Evalúa la expresión con unos valores concretos.
 *
 * Devuelve NaN donde la función no está definida (ln de un número negativo, una
 * división por cero). Es intencionado: quien compara dos expresiones descarta
 * esos puntos en lugar de dar la comparación por fallida.
 */
export function evaluar(nodo: Nodo, valores: Record<string, number>): number {
  switch (nodo.tipo) {
    case "numero":
      return nodo.valor;
    case "constante":
      return nodo.nombre === "e" ? Math.E : Math.PI;
    case "variable": {
      const v = valores[nodo.nombre];
      return v === undefined ? NaN : v;
    }
    case "suma":
      return evaluar(nodo.izq, valores) + evaluar(nodo.der, valores);
    case "resta":
      return evaluar(nodo.izq, valores) - evaluar(nodo.der, valores);
    case "producto":
      return evaluar(nodo.izq, valores) * evaluar(nodo.der, valores);
    case "cociente": {
      const divisor = evaluar(nodo.der, valores);
      return divisor === 0 ? NaN : evaluar(nodo.izq, valores) / divisor;
    }
    case "potencia":
      return Math.pow(evaluar(nodo.base, valores), evaluar(nodo.exponente, valores));
    case "negacion":
      return -evaluar(nodo.arg, valores);
    case "funcion": {
      const x = evaluar(nodo.arg, valores);
      switch (nodo.nombre) {
        case "ln":
          return x > 0 ? Math.log(x) : NaN;
        case "log":
          return x > 0 ? Math.log10(x) : NaN;
        case "exp":
          return Math.exp(x);
        case "sqrt":
          return x >= 0 ? Math.sqrt(x) : NaN;
        case "sin":
          return Math.sin(x);
        case "cos":
          return Math.cos(x);
        case "tan":
          return Math.tan(x);
      }
    }
  }
}

// ── Escritura ────────────────────────────────────────────────────────────────

const SUPERINDICE_DE: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻",
};

/** Prioridad de cada nodo, para poner paréntesis sólo donde hacen falta. */
function prioridad(nodo: Nodo): number {
  switch (nodo.tipo) {
    case "suma":
    case "resta":
      return 1;
    case "producto":
    case "cociente":
      return 2;
    case "negacion":
      return 2;
    case "potencia":
      return 3;
    default:
      return 4;
  }
}

/**
 * Escribe el árbol en la NOTACIÓN PLANA del proyecto.
 *
 * Es la que entienden el resto de piezas: exponentes numéricos en superíndice
 * ("12x³", como los escribe el motor heredado), funciones con paréntesis y el
 * producto implícito cuando no hace falta signo. Convertirla a LaTeX para la
 * pizarra es después trabajo de `planoALatex`.
 */
export function escribir(nodo: Nodo): string {
  switch (nodo.tipo) {
    case "numero":
      return formatearNumero(nodo.valor);
    case "constante":
      return nodo.nombre === "e" ? "e" : "π";
    case "variable":
      return nodo.nombre;

    case "suma":
      return `${escribir(nodo.izq)} + ${escribir(nodo.der)}`;

    case "resta": {
      // "a - (-b)" se escribe "a + b": el doble signo no se le enseña a nadie.
      const der = nodo.der;
      if (der.tipo === "negacion") return `${escribir(nodo.izq)} + ${escribir(der.arg)}`;
      if (der.tipo === "numero" && der.valor < 0) {
        return `${escribir(nodo.izq)} + ${formatearNumero(-der.valor)}`;
      }
      return `${escribir(nodo.izq)} - ${conParentesis(der, 2)}`;
    }

    case "producto": {
      const izq = conParentesis(nodo.izq, 2);
      const der = conParentesis(nodo.der, 2);
      // El signo de multiplicar sobra cuando el producto se lee solo: "3x",
      // "2(x + 1)", "(x - 1)(x + 1)". Entre dos números NO se puede quitar,
      // porque "3 2" se leería "32", y por eso se exige que lo segundo empiece
      // por letra o paréntesis.
      const pegado = /[0-9)]$/.test(izq) && /^[a-zA-Zπ(]/.test(der);
      return pegado ? `${izq}${der}` : `${izq}·${der}`;
    }

    case "cociente":
      return `${conParentesis(nodo.izq, 2)}/${conParentesis(nodo.der, 3)}`;

    case "potencia": {
      const base = conParentesis(nodo.base, 4);
      const exp = nodo.exponente;
      if (exp.tipo === "numero" && Number.isInteger(exp.valor) && Math.abs(exp.valor) < 1000) {
        const digitos = String(exp.valor)
          .split("")
          .map((d) => SUPERINDICE_DE[d] ?? d)
          .join("");
        return `${base}${digitos}`;
      }
      return `${base}^${conParentesis(exp, 4)}`;
    }

    case "negacion":
      return `-${conParentesis(nodo.arg, 2)}`;

    case "funcion":
      return `${nodo.nombre}(${escribir(nodo.arg)})`;
  }
}

function conParentesis(nodo: Nodo, minima: number): string {
  const texto = escribir(nodo);
  return prioridad(nodo) < minima ? `(${texto})` : texto;
}

/** Sin exponente científico ni ceros de arrastre. */
export function formatearNumero(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const redondeado = Math.round(n * 1e10) / 1e10;
  return String(Number.isInteger(redondeado) ? redondeado : parseFloat(redondeado.toFixed(10)));
}
