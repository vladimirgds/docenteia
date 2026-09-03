import {
  analizar,
  dependeDe,
  escribir,
  formatearNumero,
  type Nodo,
} from "./expresiones.ts";

/**
 * DERIVACIÓN SIMBÓLICA DETERMINISTA.
 *
 * Deriva sobre el árbol que produce `expresiones.ts`, aplicando las reglas del
 * cálculo una a una. Al hacerlo sobre la estructura, y no sobre el texto, las
 * reglas se componen solas: la del producto puede contener una exponencial, la
 * del cociente un logaritmo y la de la cadena cualquiera de las dos, sin que
 * haya que prever la combinación.
 *
 * QUÉ CUBRE
 *   · Constantes, variable y regla de la potencia — incluida la de exponente
 *     negativo o fraccionario.
 *   · Suma y resta (linealidad).
 *   · REGLA DEL PRODUCTO   (uv)' = u'v + uv'
 *   · REGLA DEL COCIENTE   (u/v)' = (u'v - uv') / v²
 *   · REGLA DE LA CADENA en todo lo anterior.
 *   · Exponenciales: e^u, y a^u con base constante (a^u·ln a·u').
 *   · Logaritmos: ln(u) = u'/u, y log decimal.
 *   · Raíz cuadrada y funciones trigonométricas básicas.
 *   · Derivación logarítmica para u^v, con variable en base y exponente (x^x).
 *
 * La IA no interviene: esto es cálculo, y el cálculo tiene reglas.
 *
 * Devuelve además QUÉ REGLAS se han aplicado. No es adorno: el validador lo
 * guarda en el informe del ejercicio, de modo que el docente ve con qué se ha
 * comprobado su ejercicio, y el HITO 2 puede narrar la resolución nombrando la
 * regla en cada paso.
 */

export const REGLAS = {
  potencia: "regla de la potencia",
  suma: "regla de la suma",
  producto: "regla del producto",
  cociente: "regla del cociente",
  cadena: "regla de la cadena",
  exponencial: "derivada de la exponencial",
  logaritmo: "derivada del logaritmo",
  raiz: "derivada de la raíz",
  trigonometrica: "derivada trigonométrica",
  logaritmica: "derivación logarítmica",
} as const;

export interface Derivada {
  /** La derivada, ya simplificada y en notación plana. */
  expresion: string;
  arbol: Nodo;
  /** Las reglas aplicadas, en el orden en que aparecieron. */
  reglas: string[];
}

// ── Constructores cómodos ────────────────────────────────────────────────────

const num = (valor: number): Nodo => ({ tipo: "numero", valor });
const CERO = num(0);
const UNO = num(1);

const esNumero = (n: Nodo, valor?: number): boolean =>
  n.tipo === "numero" && (valor === undefined || n.valor === valor);

// ── La derivación ────────────────────────────────────────────────────────────

function derivarNodo(nodo: Nodo, variable: string, reglas: Set<string>): Nodo {
  switch (nodo.tipo) {
    case "numero":
    case "constante":
      return CERO;

    case "variable":
      return nodo.nombre === variable ? UNO : CERO;

    case "suma":
    case "resta": {
      reglas.add(REGLAS.suma);
      const izq = derivarNodo(nodo.izq, variable, reglas);
      const der = derivarNodo(nodo.der, variable, reglas);
      return { tipo: nodo.tipo, izq, der };
    }

    case "negacion":
      return { tipo: "negacion", arg: derivarNodo(nodo.arg, variable, reglas) };

    case "producto": {
      // Un factor constante no es la regla del producto, es sacar el factor
      // fuera; nombrar aquí la regla del producto confundiría al docente.
      const izqDepende = dependeDe(nodo.izq, variable);
      const derDepende = dependeDe(nodo.der, variable);
      if (!izqDepende) return { tipo: "producto", izq: nodo.izq, der: derivarNodo(nodo.der, variable, reglas) };
      if (!derDepende) return { tipo: "producto", izq: derivarNodo(nodo.izq, variable, reglas), der: nodo.der };

      reglas.add(REGLAS.producto);
      const u = nodo.izq;
      const v = nodo.der;
      return {
        tipo: "suma",
        izq: { tipo: "producto", izq: derivarNodo(u, variable, reglas), der: v },
        der: { tipo: "producto", izq: u, der: derivarNodo(v, variable, reglas) },
      };
    }

    case "cociente": {
      const u = nodo.izq;
      const v = nodo.der;
      // Dividir por una constante es multiplicar por su inverso: tampoco es la
      // regla del cociente, y sale una expresión mucho más limpia.
      if (!dependeDe(v, variable)) {
        return { tipo: "cociente", izq: derivarNodo(u, variable, reglas), der: v };
      }

      reglas.add(REGLAS.cociente);
      return {
        tipo: "cociente",
        izq: {
          tipo: "resta",
          izq: { tipo: "producto", izq: derivarNodo(u, variable, reglas), der: v },
          der: { tipo: "producto", izq: u, der: derivarNodo(v, variable, reglas) },
        },
        der: { tipo: "potencia", base: v, exponente: num(2) },
      };
    }

    case "potencia": {
      const baseDepende = dependeDe(nodo.base, variable);
      const expDepende = dependeDe(nodo.exponente, variable);

      if (!baseDepende && !expDepende) return CERO;

      // u^n con n constante: regla de la potencia (más cadena si u no es la
      // variable pelada).
      if (baseDepende && !expDepende) {
        reglas.add(REGLAS.potencia);
        const interior = derivarNodo(nodo.base, variable, reglas);
        const nuevoExponente: Nodo = { tipo: "resta", izq: nodo.exponente, der: UNO };
        const base: Nodo = {
          tipo: "producto",
          izq: nodo.exponente,
          der: { tipo: "potencia", base: nodo.base, exponente: nuevoExponente },
        };
        if (nodo.base.tipo === "variable" && nodo.base.nombre === variable) return base;
        reglas.add(REGLAS.cadena);
        return { tipo: "producto", izq: base, der: interior };
      }

      // a^u con a constante: exponencial. El caso e^u sale directo, sin el
      // factor ln(e) = 1 que el simplificador no tendría por qué conocer.
      if (!baseDepende && expDepende) {
        reglas.add(REGLAS.exponencial);
        const interior = derivarNodo(nodo.exponente, variable, reglas);
        const esE = nodo.base.tipo === "constante" && nodo.base.nombre === "e";
        const factorLn: Nodo = esE ? UNO : { tipo: "funcion", nombre: "ln", arg: nodo.base };
        if (!(nodo.exponente.tipo === "variable" && nodo.exponente.nombre === variable)) {
          reglas.add(REGLAS.cadena);
        }
        return {
          tipo: "producto",
          izq: { tipo: "producto", izq: nodo, der: factorLn },
          der: interior,
        };
      }

      // u^v con variable arriba y abajo: derivación logarítmica.
      //   (u^v)' = u^v · (v'·ln u + v·u'/u)
      reglas.add(REGLAS.logaritmica);
      const u = nodo.base;
      const v = nodo.exponente;
      return {
        tipo: "producto",
        izq: nodo,
        der: {
          tipo: "suma",
          izq: {
            tipo: "producto",
            izq: derivarNodo(v, variable, reglas),
            der: { tipo: "funcion", nombre: "ln", arg: u },
          },
          der: {
            tipo: "cociente",
            izq: { tipo: "producto", izq: v, der: derivarNodo(u, variable, reglas) },
            der: u,
          },
        },
      };
    }

    case "funcion": {
      const u = nodo.arg;
      const interior = derivarNodo(u, variable, reglas);
      const esVariablePelada = u.tipo === "variable" && u.nombre === variable;
      if (!esVariablePelada) reglas.add(REGLAS.cadena);

      const porInterior = (externa: Nodo): Nodo =>
        esVariablePelada ? externa : { tipo: "producto", izq: externa, der: interior };

      switch (nodo.nombre) {
        case "exp":
          reglas.add(REGLAS.exponencial);
          return porInterior({ tipo: "funcion", nombre: "exp", arg: u });

        case "ln":
          reglas.add(REGLAS.logaritmo);
          return { tipo: "cociente", izq: interior, der: u };

        case "log":
          reglas.add(REGLAS.logaritmo);
          return {
            tipo: "cociente",
            izq: interior,
            der: { tipo: "producto", izq: u, der: { tipo: "funcion", nombre: "ln", arg: num(10) } },
          };

        case "sqrt":
          reglas.add(REGLAS.raiz);
          return {
            tipo: "cociente",
            izq: interior,
            der: { tipo: "producto", izq: num(2), der: { tipo: "funcion", nombre: "sqrt", arg: u } },
          };

        case "sin":
          reglas.add(REGLAS.trigonometrica);
          return porInterior({ tipo: "funcion", nombre: "cos", arg: u });

        case "cos":
          reglas.add(REGLAS.trigonometrica);
          return porInterior({ tipo: "negacion", arg: { tipo: "funcion", nombre: "sin", arg: u } });

        case "tan":
          reglas.add(REGLAS.trigonometrica);
          return {
            tipo: "cociente",
            izq: interior,
            der: { tipo: "potencia", base: { tipo: "funcion", nombre: "cos", arg: u }, exponente: num(2) },
          };
      }
    }
  }
}

// ── Simplificación ───────────────────────────────────────────────────────────
//
// No busca la forma más elegante posible —eso es un sistema algebraico— sino
// que el resultado sea LEGIBLE y comparable: sin sumar ceros, sin multiplicar
// por unos y con los términos iguales agrupados. La corrección no depende de
// esto (la equivalencia se comprueba numéricamente), pero lo que ve el docente
// sí: "12x³" y "4·3·x^(4-1)" son la misma derivada y sólo una se puede leer.

export function simplificar(nodo: Nodo): Nodo {
  switch (nodo.tipo) {
    case "numero":
    case "constante":
    case "variable":
      return nodo;

    case "negacion": {
      const arg = simplificar(nodo.arg);
      if (arg.tipo === "numero") return num(-arg.valor);
      if (arg.tipo === "negacion") return arg.arg;
      return { tipo: "negacion", arg };
    }

    case "funcion":
      return { tipo: "funcion", nombre: nodo.nombre, arg: simplificar(nodo.arg) };

    case "potencia": {
      const base = simplificar(nodo.base);
      const exponente = simplificar(nodo.exponente);
      if (esNumero(exponente, 0)) return UNO;
      if (esNumero(exponente, 1)) return base;
      if (esNumero(base, 1)) return UNO;
      if (esNumero(base, 0)) return CERO;
      if (base.tipo === "numero" && exponente.tipo === "numero" && Number.isInteger(exponente.valor)) {
        const valor = Math.pow(base.valor, exponente.valor);
        if (Number.isFinite(valor) && Math.abs(valor) < 1e12) return num(valor);
      }
      return { tipo: "potencia", base, exponente };
    }

    case "cociente":
      return simplificarRacional(nodo);

    case "producto":
      return simplificarRacional(nodo);

    case "suma":
    case "resta":
      return reconstruirSuma(
        aplanarSuma(nodo).map(({ signo, nodo: n }) => ({ signo, nodo: simplificar(n) })),
      );
  }
}

interface Termino {
  signo: 1 | -1;
  nodo: Nodo;
}

/**
 * Simplifica productos y cocientes CANCELANDO lo que se repite arriba y abajo.
 *
 * Es lo que separa una derivada correcta de una derivada legible. Sin esto, la
 * derivada de x·ln(x) sale como "ln(x) + (1/x)·x" y la de ln(3x) como "3/(3x)":
 * ninguna de las dos está mal, pero un docente que ve "3/(3x)" donde esperaba
 * "1/x" concluye, con razón, que el motor no sabe lo que hace.
 *
 * El método es el de toda la vida: descomponer en factores con su exponente,
 * juntar los que tienen la misma base sumando exponentes (x³·x² = x⁵, y también
 * e^x·e^x = e^(2x)), reducir el coeficiente por su máximo común divisor y
 * repartir lo que queda entre numerador y denominador según el signo del
 * exponente.
 */
interface FactorAcumulado {
  base: Nodo;
  exponentes: Nodo[];
}

function simplificarRacional(nodo: Nodo): Nodo {
  const acumulado = new Map<string, FactorAcumulado>();
  const coef = { num: 1, den: 1 };

  descomponer(simplificarHijos(nodo), UNO, false, acumulado, coef);

  if (coef.num === 0) return CERO;

  const arriba: Nodo[] = [];
  const abajo: Nodo[] = [];

  for (const { base, exponentes } of acumulado.values()) {
    const exponente = simplificar(exponentes.reduce((a, b) => ({ tipo: "suma", izq: a, der: b })));
    if (esNumero(exponente, 0)) continue;
    if (esExponenteNegativo(exponente)) {
      abajo.push(potenciaDe(base, simplificar({ tipo: "negacion", arg: exponente })));
    } else {
      arriba.push(potenciaDe(base, exponente));
    }
  }

  // El coeficiente se reduce como una fracción: 3x²/3 es x², no "3x² partido 3".
  const divisor = mcd(Math.abs(coef.num), Math.abs(coef.den));
  let numerador = coef.num / divisor;
  const denominador = coef.den / divisor;
  const signo = denominador < 0 ? -1 : 1;
  numerador *= signo;

  const cuerpoArriba = producto(arriba);
  const cuerpoAbajo = producto(abajo);

  let resultado: Nodo =
    numerador === 1 && cuerpoArriba !== null
      ? cuerpoArriba
      : cuerpoArriba === null
        ? num(numerador)
        : { tipo: "producto", izq: num(numerador), der: cuerpoArriba };

  const abajoFinal =
    Math.abs(denominador) === 1 && cuerpoAbajo === null
      ? null
      : cuerpoAbajo === null
        ? num(Math.abs(denominador))
        : Math.abs(denominador) === 1
          ? cuerpoAbajo
          : ({ tipo: "producto", izq: num(Math.abs(denominador)), der: cuerpoAbajo } as Nodo);

  if (abajoFinal) resultado = { tipo: "cociente", izq: resultado, der: abajoFinal };
  return resultado;
}

/** Simplifica los hijos sin volver a entrar en la cancelación (evita el bucle). */
function simplificarHijos(nodo: Nodo): Nodo {
  if (nodo.tipo === "producto" || nodo.tipo === "cociente") {
    return { tipo: nodo.tipo, izq: simplificarHijos(nodo.izq), der: simplificarHijos(nodo.der) } as Nodo;
  }
  if (nodo.tipo === "negacion") return { tipo: "negacion", arg: simplificarHijos(nodo.arg) };
  return simplificar(nodo);
}

function descomponer(
  nodo: Nodo,
  exponente: Nodo,
  invertir: boolean,
  acumulado: Map<string, FactorAcumulado>,
  coef: { num: number; den: number },
): void {
  switch (nodo.tipo) {
    case "producto":
      descomponer(nodo.izq, exponente, invertir, acumulado, coef);
      descomponer(nodo.der, exponente, invertir, acumulado, coef);
      return;

    case "cociente":
      descomponer(nodo.izq, exponente, invertir, acumulado, coef);
      descomponer(nodo.der, exponente, !invertir, acumulado, coef);
      return;

    case "negacion":
      coef.num *= -1;
      descomponer(nodo.arg, exponente, invertir, acumulado, coef);
      return;

    case "numero":
      // Un número elevado a algo que no es un entero conocido no se toca.
      if (exponente.tipo === "numero" && Number.isInteger(exponente.valor)) {
        const valor = Math.pow(nodo.valor, Math.abs(exponente.valor));
        const alDenominador = invertir !== exponente.valor < 0;
        if (alDenominador) coef.den *= valor;
        else coef.num *= valor;
        return;
      }
      break;

    case "potencia": {
      const nuevo = simplificar({ tipo: "producto", izq: exponente, der: nodo.exponente });
      descomponer(nodo.base, nuevo, invertir, acumulado, coef);
      return;
    }
  }

  const exponenteFinal = invertir ? simplificar({ tipo: "negacion", arg: exponente }) : exponente;
  const clave = escribir(nodo);
  const entrada = acumulado.get(clave) ?? { base: nodo, exponentes: [] };
  entrada.exponentes.push(exponenteFinal);
  acumulado.set(clave, entrada);
}

/**
 * ¿Este exponente es negativo?
 *
 * No basta con mirar si es un número menor que cero: al cancelar (e^x)² contra
 * el numerador queda el exponente -2x, que no es un número pero sigue estando
 * abajo. Sin esto, la derivada de x/e^x se escribía "e^(-2x)(e^x - e^x·x)", que
 * es correcta y no la entiende nadie.
 */
function esExponenteNegativo(exponente: Nodo): boolean {
  if (exponente.tipo === "numero") return exponente.valor < 0;
  if (exponente.tipo === "negacion") return true;
  if (exponente.tipo === "producto") {
    return aplanarProducto(exponente).some((f) => f.tipo === "numero" && f.valor < 0);
  }
  return false;
}

function potenciaDe(base: Nodo, exponente: Nodo): Nodo {
  if (esNumero(exponente, 1)) return base;
  return { tipo: "potencia", base, exponente };
}

function producto(factores: Nodo[]): Nodo | null {
  if (factores.length === 0) return null;
  factores.sort((a, b) => escribir(a).localeCompare(escribir(b)));
  return factores.reduce((izq, der) => ({ tipo: "producto", izq, der }) as Nodo);
}

function mcd(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return 1;
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function aplanarSuma(nodo: Nodo, signo: 1 | -1 = 1, salida: Termino[] = []): Termino[] {
  if (nodo.tipo === "suma") {
    aplanarSuma(nodo.izq, signo, salida);
    aplanarSuma(nodo.der, signo, salida);
  } else if (nodo.tipo === "resta") {
    aplanarSuma(nodo.izq, signo, salida);
    aplanarSuma(nodo.der, signo === 1 ? -1 : 1, salida);
  } else {
    salida.push({ signo, nodo });
  }
  return salida;
}

function aplanarProducto(nodo: Nodo, salida: Nodo[] = []): Nodo[] {
  if (nodo.tipo === "producto") {
    aplanarProducto(nodo.izq, salida);
    aplanarProducto(nodo.der, salida);
  } else {
    salida.push(nodo);
  }
  return salida;
}

function reconstruirProducto(factores: Nodo[]): Nodo {
  let coeficiente = 1;
  const resto: Nodo[] = [];

  for (const factor of factores) {
    if (factor.tipo === "numero") {
      coeficiente *= factor.valor;
      continue;
    }
    if (factor.tipo === "negacion") {
      coeficiente *= -1;
      resto.push(factor.arg);
      continue;
    }
    resto.push(factor);
  }

  if (coeficiente === 0) return CERO;
  if (resto.length === 0) return num(coeficiente);

  // Los factores se ordenan por su escritura para que dos productos con los
  // mismos factores en distinto orden salgan idénticos y se puedan agrupar.
  resto.sort((a, b) => escribir(a).localeCompare(escribir(b)));
  let salida = resto.reduce((izq, der) => ({ tipo: "producto", izq, der }) as Nodo);
  if (coeficiente !== 1) {
    salida = { tipo: "producto", izq: num(coeficiente), der: salida };
  }
  return salida;
}

function reconstruirSuma(terminos: Termino[]): Nodo {
  // Cada término se parte en coeficiente numérico y "resto", de modo que
  // 2·e^x y 3·e^x se puedan sumar en 5·e^x.
  const grupos = new Map<string, { coeficiente: number; nodo: Nodo | null }>();
  let constante = 0;

  for (const { signo, nodo } of terminos) {
    if (esNumero(nodo, 0)) continue;
    if (nodo.tipo === "numero") {
      constante += signo * nodo.valor;
      continue;
    }

    const factores = aplanarProducto(nodo);
    let coeficiente = signo;
    const resto: Nodo[] = [];
    for (const f of factores) {
      if (f.tipo === "numero") coeficiente *= f.valor;
      else if (f.tipo === "negacion") {
        coeficiente *= -1;
        resto.push(f.arg);
      } else resto.push(f);
    }

    if (resto.length === 0) {
      constante += coeficiente;
      continue;
    }
    resto.sort((a, b) => escribir(a).localeCompare(escribir(b)));
    const cuerpo = resto.reduce((izq, der) => ({ tipo: "producto", izq, der }) as Nodo);
    const clave = escribir(cuerpo);
    const grupo = grupos.get(clave) ?? { coeficiente: 0, nodo: cuerpo };
    grupo.coeficiente += coeficiente;
    grupos.set(clave, grupo);
  }

  const partes: Termino[] = [];
  for (const { coeficiente, nodo } of grupos.values()) {
    if (coeficiente === 0 || !nodo) continue;
    const magnitud = Math.abs(coeficiente);
    const cuerpo: Nodo = magnitud === 1 ? nodo : { tipo: "producto", izq: num(magnitud), der: nodo };
    partes.push({ signo: coeficiente < 0 ? -1 : 1, nodo: cuerpo });
  }
  if (constante !== 0) {
    partes.push({ signo: constante < 0 ? -1 : 1, nodo: num(Math.abs(constante)) });
  }

  if (partes.length === 0) return CERO;

  // Se encabeza con un término positivo si lo hay: "1 - ln(x)" se lee de
  // corrido y "-ln(x) + 1" obliga a releer.
  if (partes[0].signo === -1) {
    const primeroPositivo = partes.findIndex((p) => p.signo === 1);
    if (primeroPositivo > 0) partes.unshift(...partes.splice(primeroPositivo, 1));
  }

  let salida: Nodo | null = null;
  for (const { signo, nodo } of partes) {
    if (salida === null) {
      salida = signo === 1 ? nodo : { tipo: "negacion", arg: nodo };
      continue;
    }
    salida = signo === 1 ? { tipo: "suma", izq: salida, der: nodo } : { tipo: "resta", izq: salida, der: nodo };
  }
  return salida as Nodo;
}

// ── Puerta de entrada ────────────────────────────────────────────────────────

/** Prefijos con los que se pide una derivada, y que no forman parte de ella. */
const PETICION =
  /^\s*(?:calcula(?:r)?|halla(?:r)?|obt[eé]n(?:er)?|deriva(?:r)?|la\s+)*\s*(?:derivada\s+(?:de\s+)?|d\s*\/\s*d[a-z]\s*|f\s*'\s*\(\s*[a-z]\s*\)\s*=\s*|y\s*'\s*=\s*)/i;

/**
 * Deriva una expresión escrita en texto.
 *
 * Acepta tanto la expresión pelada ("3x⁴") como la petición completa
 * ("deriva e^x·ln(x)", "d/dx(x² + 1)"), porque las dos llegan: la primera desde
 * el formulario del banco de ejercicios y la segunda desde la lección.
 *
 * Devuelve `null` cuando no sabe leer la expresión. Ese null es información,
 * no una avería: significa "no puedo garantizar esta derivada", y quien llama
 * lo trata como tal en vez de inventarse un resultado.
 */
export function derivarExpresion(texto: string, variable = "x"): Derivada | null {
  const limpio = String(texto ?? "")
    .replace(PETICION, "")
    .replace(/^\s*[({[]?\s*(?=.*[)}\]]?\s*$)/, (m) => m)
    .trim();
  if (!limpio) return null;

  const arbol = analizar(limpio);
  if (!arbol) return null;

  const reglas = new Set<string>();
  const derivada = simplificar(derivarNodo(arbol, variable, reglas));

  return {
    expresion: escribir(derivada),
    arbol: derivada,
    reglas: [...reglas],
  };
}

/** La derivada como texto, o null. Es lo que consume el corrector. */
export function derivar(texto: string, variable = "x"): string | null {
  return derivarExpresion(texto, variable)?.expresion ?? null;
}

/** Evalúa una expresión constante ("2·3 + 1"), para el validador de plantillas. */
export function valorNumerico(texto: string): string | null {
  const arbol = analizar(texto);
  if (!arbol) return null;
  const simplificado = simplificar(arbol);
  if (simplificado.tipo === "numero") return formatearNumero(simplificado.valor);
  if (
    simplificado.tipo === "cociente" &&
    simplificado.izq.tipo === "numero" &&
    simplificado.der.tipo === "numero"
  ) {
    return escribir(simplificado);
  }
  return null;
}
