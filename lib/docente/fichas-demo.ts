import type { EntradaFicha } from "./fichas-metodo.ts";

/**
 * Las dos fichas de la demostración del Hito 5A, escritas COMO LAS ESCRIBIRÍA UN
 * DOCENTE desde el editor (datos, no código):
 *
 *   1. «Suma de fracciones» (con distinto denominador).
 *   2. La regla de la cadena para `(a·x^m + b)^n`, con una pista si el alumno
 *      omite el factor de la derivada interior (el «6x» de `(3x^2+1)^4`).
 *
 * Sirven también de modo demostración del agente de IA cuando no hay clave de
 * Gemini, para probar el flujo sin gastar cuota.
 */

export const FICHA_SUMA_FRACCIONES: EntradaFicha = {
  titulo: "Suma de fracciones",
  descripcion: "Para sumar fracciones con distinto denominador se busca un denominador común, se amplifica cada una y se suman los numeradores.",
  patron: "{a}/{b} + {c}/{d}",
  variables: [
    { nombre: "a", descripcion: "numerador de la primera fracción", tipo: "positivo" },
    { nombre: "b", descripcion: "denominador de la primera fracción", tipo: "positivo", min: 2 },
    { nombre: "c", descripcion: "numerador de la segunda fracción", tipo: "positivo" },
    { nombre: "d", descripcion: "denominador de la segunda fracción", tipo: "positivo", min: 2 },
    { nombre: "l", descripcion: "denominador común (mcm)", tipo: "positivo", calculada: "mcm(b, d)" },
    { nombre: "p", descripcion: "numerador de la primera, amplificada", tipo: "positivo", calculada: "a * l / b" },
    { nombre: "q", descripcion: "numerador de la segunda, amplificada", tipo: "positivo", calculada: "c * l / d" },
    { nombre: "s", descripcion: "suma de numeradores", tipo: "positivo", calculada: "p + q" },
    { nombre: "g", descripcion: "máximo común divisor", tipo: "positivo", calculada: "mcd(s, l)" },
  ],
  condiciones: ["b >= 2", "d >= 2", "b != d"],
  operaciones: ["suma", "denominador_comun", "simplificar"],
  pasos: [
    {
      explica: "Tenemos dos fracciones con distinto denominador ({b} y {d}): no se pueden sumar tal cual.",
      escribe: "{a}/{b} + {c}/{d}",
      tipo: "transformacion",
      terminos: [
        { texto: "{a}/{b}", explica: "La primera fracción: {a} trozos de {b} partes iguales." },
        { texto: "{c}/{d}", explica: "La segunda fracción: {c} trozos de {d} partes iguales." },
      ],
    },
    {
      explica: "Buscamos un denominador común: el mínimo común múltiplo de {b} y {d} es {l}. Amplificamos cada fracción.",
      escribe: "{p}/{l} + {q}/{l}",
      tipo: "transformacion",
      regla: "denominador común",
      terminos: [{ texto: "{p}/{l}", explica: "La primera fracción, ya con denominador {l}." }],
    },
    {
      explica: "Con el mismo denominador, se suman los numeradores y se deja el denominador: {p} + {q} = {s}.",
      escribe: "{s}/{l}",
      tipo: "transformacion",
      regla: "suma de fracciones",
    },
    {
      explica: "Simplificamos dividiendo numerador y denominador entre {g}.",
      escribe: "{s/g}/{l/g}",
      tipo: "resultado",
      regla: "simplificación",
    },
  ],
  ejemplos: ["1/2 + 1/3", "3/4 + 1/6"],
  pistas: [
    "¿Los dos denominadores son iguales?",
    "Busca un múltiplo común de los dos denominadores.",
    "Amplifica cada fracción hasta el denominador común y suma los numeradores.",
  ],
  pistasDeError: [],
};

export const FICHA_REGLA_CADENA: EntradaFicha = {
  titulo: "Regla de la cadena: potencia de un binomio",
  descripcion: "La derivada de (a·x^m + b)^n es n·(a·x^m + b)^(n-1) multiplicado por la derivada de lo que hay dentro del paréntesis.",
  patron: "({~a}x^{m}{+b})^{n}",
  variables: [
    { nombre: "a", descripcion: "coeficiente de x^m", tipo: "positivo", min: 1, max: 6 },
    { nombre: "m", descripcion: "exponente de x", tipo: "positivo", min: 2, max: 4 },
    { nombre: "b", descripcion: "término independiente", tipo: "entero", min: -5, max: 5 },
    { nombre: "n", descripcion: "exponente exterior", tipo: "positivo", min: 2, max: 5 },
  ],
  condiciones: ["a >= 1", "m >= 2", "b != 0", "n >= 2"],
  operaciones: ["cadena", "potencia"],
  pasos: [
    {
      explica: "Identificamos la función interior: lo que está dentro del paréntesis. La llamamos u.",
      escribe: "u = {~a}x^{m}{+b}",
      tipo: "definicion",
      terminos: [{ texto: "{~a}x^{m}{+b}", explica: "La función interior: la que está dentro del paréntesis." }],
    },
    {
      explica: "Derivamos la exterior (u elevado a {n}) dejando la interior igual, y multiplicamos por la derivada de la interior.",
      escribe: "{n}({~a}x^{m}{+b})^{n-1} · {~a*m}x^{m-1}",
      tipo: "transformacion",
      regla: "regla de la cadena",
      terminos: [
        { texto: "{n}({~a}x^{m}{+b})^{n-1}", explica: "La derivada de la función exterior, sin tocar lo de dentro." },
        { texto: "{~a*m}x^{m-1}", explica: "La derivada de la función interior." },
      ],
    },
    {
      explica: "Juntamos los factores numéricos: {n} por {a*m} es {n*a*m}.",
      escribe: "{n*a*m}x^{m-1}({~a}x^{m}{+b})^{n-1}",
      tipo: "resultado",
      regla: "regla de la cadena",
    },
  ],
  ejemplos: ["(3x^2+1)^4", "(5x^3-2)^2"],
  pistas: [
    "¿Hay una función dentro de otra?",
    "Deriva la exterior y deja la interior igual.",
    "No olvides multiplicar por la derivada de la función interior.",
  ],
  pistasDeError: [
    {
      omiteFactor: "{~a*m}x^{m-1}",
      texto: "Te falta un factor: la derivada de la función interior {~a}x^{m}{+b}. Derívala y multiplícala.",
    },
    {
      respuestaErronea: "{n*a*m}x^{m-1}({~a}x^{m}{+b})^{n}",
      texto: "Revisa el exponente de la función exterior: al derivar una potencia, el exponente baja en 1.",
    },
  ],
};
