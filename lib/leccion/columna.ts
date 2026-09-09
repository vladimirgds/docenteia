/**
 * Sumas y restas en COLUMNA, como se enseñan en clase.
 *
 * En primaria una suma no se escribe "24 + 17": se escribe en vertical, con las
 * unidades bajo las unidades y las decenas bajo las decenas, la raya debajo y
 * la llevada encima. Escrita en horizontal, el alumno ve una expresión que
 * todavía no sabe leer y pierde justo lo que se le está enseñando: que las
 * cifras se alinean por su valor posicional.
 *
 * Aquí se compone esa disposición en LaTeX para que la pizarra la pinte con
 * KaTeX. Una columna por cifra —no el número entero en una celda—, que es lo
 * que permite poner la llevada exactamente encima de la columna que la genera.
 *
 * Vive en `lib/` y no dentro del componente para que la suite pueda comprobar
 * la disposición, y las llevadas, sin montar React.
 */

/** Una suma o resta de dos naturales, ya leída. */
export interface OperacionEnColumna {
  a: number;
  b: number;
  operador: "+" | "-";
  resultado: number;
}

/**
 * Lee "24 + 17", "19 + 45 = ?" o "52 - 27 = 25".
 *
 * Devuelve `null` en cuanto la línea no es exactamente eso. Un paso del
 * desarrollo como "unidades: 4 + 7 = 11" NO es la operación: es el relato de
 * una sola columna, y componerlo en vertical sería contar otra cosa.
 */
export function leerSumaOResta(texto: string): OperacionEnColumna | null {
  const limpio = String(texto ?? "")
    .replace(/[−–—]/g, "-") // menos unicode → guion normal
    .trim();

  const m = limpio.match(/^(\d{1,9})\s*([+-])\s*(\d{1,9})\s*(?:=\s*(\d{1,9}|\?))?$/);
  if (!m) return null;

  const a = Number(m[1]);
  const b = Number(m[3]);
  const operador = m[2] as "+" | "-";
  const resultado = operador === "+" ? a + b : a - b;

  // Una resta que da negativo no se dispone en columna: no es lo que se enseña
  // en este tema, y fingir una disposición sería enseñarla mal.
  if (resultado < 0) return null;

  // Si la línea trae el resultado, tiene que ser el correcto. Con uno que no
  // cuadra, no se compone nada: mejor la línea tal cual que una columna que
  // afirma algo falso.
  const declarado = m[4];
  if (declarado && declarado !== "?" && Number(declarado) !== resultado) return null;

  return { a, b, operador, resultado };
}

/**
 * ¿Es una raya dibujada con guiones?
 *
 * El modelo, al escribir una suma en la pizarra, la dibuja como se dibuja en
 * papel: los dos números, una raya de guiones y el total. Esa raya no es
 * matemática —no es una resta— y compuesta como fórmula se lee como una
 * cadena de restas desalineadas, que es lo que reportó el cliente.
 */
function esRaya(linea: string): boolean {
  return /^[-–—_=─━－]{2,}$/.test(linea.replace(/\s+/g, ""));
}

/** Una fila de la cuenta dibujada: su signo, si lo trae, y su número. */
function leerFila(linea: string): { operador: "+" | "-" | null; n: number } | null {
  const m = linea.replace(/\s+/g, "").match(/^([+-]?)(\d{1,9})$/);
  if (!m) return null;
  return { operador: m[1] === "+" ? "+" : m[1] === "-" ? "-" : null, n: Number(m[2]) };
}

/**
 * Lee una cuenta DIBUJADA en varias líneas:
 *
 *      19
 *    + 45
 *    -----
 *      64
 *
 * Es lo que escribe el modelo cuando intenta pintar la columna con caracteres.
 * Recomponerla como una cuenta de verdad es preferible a componer el dibujo:
 * el dibujo, pasado por KaTeX, sale como una fila de guiones y números sueltos.
 *
 * La llevada que venga dibujada se ignora: se recalcula aquí, y así la marca
 * y el resultado no pueden discrepar. Y si el total dibujado no cuadra con la
 * operación, no se compone nada: pintar una cuenta con un total equivocado y
 * darle el aspecto de correcta es peor que dejar el texto como estaba.
 */
export interface OperacionDibujada extends OperacionEnColumna {
  /**
   * El dibujo ya trae el total correcto.
   *
   * El motor va redibujando la MISMA cuenta a medida que la resuelve: primero
   * los dos números, luego con la cifra de las unidades bajo la raya, y al
   * final con la llevada y el total. Mientras está a medias, la columna se
   * compone sin resultado: poner el total antes de que él llegue ahí sería
   * adelantarle el final al alumno.
   */
  completa: boolean;
}

export function leerOperacionDibujada(texto: string): OperacionDibujada | null {
  const lineas = String(texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length < 2) return null;
  if (!lineas.some(esRaya)) return null; // sin raya no es una cuenta dibujada

  const filas = lineas.filter((l) => !esRaya(l)).map(leerFila);
  if (filas.some((f) => f === null) || filas.length < 2 || filas.length > 4) return null;

  const util = filas as Array<{ operador: "+" | "-" | null; n: number }>;
  const conSigno = util.findIndex((f) => f.operador !== null);
  if (conSigno < 1) return null; // el signo va con el segundo sumando

  const b = util[conSigno];
  const a = util[conSigno - 1];
  if (a.operador !== null) return null;

  const operador = b.operador as "+" | "-";
  const resultado = operador === "+" ? a.n + b.n : a.n - b.n;
  if (resultado < 0) return null;

  // Lo que venga después de la raya es el total. Si no cuadra, el dibujo está
  // a medias —el motor lleva escrita sólo una columna— y se compone sin él.
  const resto = util.slice(conSigno + 1);
  if (resto.length > 1) return null;
  const completa = resto.length === 1 && resto[0].n === resultado;

  return { a: a.n, b: b.n, operador, resultado, completa };
}

/**
 * La operación de una línea de pizarra, venga escrita en una línea ("19 + 45")
 * o dibujada en varias. `null` si la línea no es una operación.
 */
export function operacionDeLinea(texto: string): OperacionEnColumna | null {
  return leerSumaOResta(texto) ?? leerOperacionDibujada(texto);
}

/**
 * LA CUENTA QUE HAY DENTRO DE UNA REGLA DEL CATÁLOGO.
 *
 * El enunciado de "Suma con llevada" no es una frase: es la cuenta en columna
 * dibujada con un `array` de LaTeX, llevada incluida. Compuesta tal cual, sale
 * una imagen fija —la que el cliente lleva dos revisiones señalando en la
 * esquina de "Reglas y propiedades"—, porque no hay nada que un guion pueda
 * animar en un bloque de LaTeX ya montado.
 *
 * Aquí se deshace el dibujo hasta la cuenta que representa ("24 + 17 = 41"), y
 * con ella la pizarra animada la monta columna por columna como cualquier otra.
 * Se reaprovecha el lector de cuentas dibujadas en vez de escribir un segundo
 * intérprete: las filas del `array` y las líneas de un dibujo con guiones son
 * lo mismo con otra sintaxis, y ese lector ya sabe negarse cuando el total no
 * cuadra.
 */
export function cuentaDeArrayLatex(latex: string): string | null {
  const texto = String(latex ?? "");
  if (!/\\begin\{array\}/.test(texto)) return null;

  const cuerpo = texto
    .replace(/\\begin\{array\}(\{[^}]*\})?/g, "")
    .replace(/\\end\{array\}/g, "")
    .replace(/\\(?:script|display|text)style/g, "");

  const lineas = cuerpo
    // Las filas del array van separadas por "\\"…
    .split(/\\\\/)
    // …y la raya de la cuenta es la "\hline", que puede compartir fila con el
    // total. Se convierte en una línea propia, que es como la espera el lector.
    .flatMap((fila) => fila.split(/\\hline/).flatMap((t, i) => (i === 0 ? [t] : ["---", t])))
    // Las celdas de una misma fila forman el número: "& 2 & 4" es el 24.
    .map((t) => t.replace(/&/g, "").replace(/\s+/g, ""))
    .filter(Boolean);

  const op = leerOperacionDibujada(lineas.join("\n"));
  // Sin el total escrito —o con uno que no sale— no se compone nada: la regla
  // se queda como está antes que enseñar una cuenta que no es la suya.
  if (!op?.completa) return null;

  return `${op.a} ${op.operador} ${op.b} = ${op.resultado}`;
}

/**
 * ¿Las dos líneas son la MISMA cuenta?
 *
 * El motor la redibuja entera en cada paso, así que en la pizarra se apilaban
 * tres versiones de la misma suma —una vacía, una a medias y una terminada—
 * como si fueran tres ejercicios. Reconociéndolas, la nueva sustituye a la
 * anterior y en el lienzo hay una sola cuenta que avanza.
 */
export function esLaMismaCuenta(unaLinea: string, otraLinea: string): boolean {
  const una = operacionDeLinea(unaLinea);
  const otra = operacionDeLinea(otraLinea);
  if (!una || !otra) return false;
  return una.a === otra.a && una.b === otra.b && una.operador === otra.operador;
}

/** Las cifras de un número, alineadas a la derecha en `ancho` columnas. */
function cifras(n: number, ancho: number): string[] {
  const texto = String(n);
  return Array.from({ length: ancho }, (_, i) => {
    const desde = ancho - texto.length;
    return i < desde ? "" : texto[i - desde];
  });
}

/**
 * Las marcas que van ENCIMA de cada columna.
 *
 * En la suma son las llevadas: el 1 que pasa a la columna siguiente.
 *
 * En la resta son las cifras del minuendo ya rebajadas por el préstamo, que es
 * exactamente lo que el tutor narra al resolverla ("decenas: 4 - 2 = 2" cuando
 * el 5 de 52 se ha convertido en 4). Marca y locución cuentan lo mismo porque
 * salen del mismo cálculo.
 */
export function marcasDeColumna(op: OperacionEnColumna, ancho: number): string[] {
  const da = cifras(op.a, ancho).map((c) => (c === "" ? 0 : Number(c)));
  const db = cifras(op.b, ancho).map((c) => (c === "" ? 0 : Number(c)));
  const marcas = Array.from({ length: ancho }, () => "");

  if (op.operador === "+") {
    let llevada = 0;
    for (let i = ancho - 1; i >= 0; i--) {
      const suma = da[i] + db[i] + llevada;
      llevada = suma >= 10 ? 1 : 0;
      // La llevada se escribe sobre la columna a la que se suma, la de la izquierda.
      if (llevada && i - 1 >= 0) marcas[i - 1] = "1";
    }
    return marcas;
  }

  let prestamo = 0;
  for (let i = ancho - 1; i >= 0; i--) {
    const arriba = da[i] - prestamo;
    if (arriba < db[i]) {
      prestamo = 1;
      // La columna de la izquierda queda rebajada en uno: esa es su marca.
      if (i - 1 >= 0) marcas[i - 1] = String(da[i - 1] - 1);
    } else {
      prestamo = 0;
    }
  }
  return marcas;
}

/**
 * La operación dispuesta en columna, en LaTeX.
 *
 * Con `conResultado`, debajo de la raya va el total y encima las llevadas: es
 * la operación resuelta, la del desarrollo. Sin él queda el planteamiento —los
 * dos números, el signo y la raya— que es lo que el alumno tiene delante
 * cuando le toca resolverla.
 */
export function columnaVertical(
  op: OperacionEnColumna,
  opciones: { conResultado: boolean },
): string {
  const ancho = Math.max(String(op.a).length, String(op.b).length, String(op.resultado).length);
  const celdas = (lista: string[]) => lista.join(" & ");
  const filas: string[] = [];

  if (opciones.conResultado) {
    const marcas = marcasDeColumna(op, ancho);
    if (marcas.some(Boolean)) {
      filas.push(celdas(["", ...marcas.map((m) => (m ? `\\scriptstyle ${m}` : ""))]));
    }
  }

  filas.push(celdas(["", ...cifras(op.a, ancho)]));
  filas.push(celdas([op.operador, ...cifras(op.b, ancho)]));

  // La raya de la operación. Va siempre, también en el planteamiento: es la
  // que dice al alumno dónde escribe él la respuesta.
  const cuerpo = filas.join(" \\\\ ") + " \\\\ \\hline";
  const total = opciones.conResultado
    ? " " + celdas(["", ...cifras(op.resultado, ancho)])
    : "";

  // Una columna por cifra, más la primera para el signo.
  const columnas = "r" + "c".repeat(ancho);
  return `\\begin{array}{${columnas}} ${cuerpo}${total} \\end{array}`;
}

/**
 * Cuántas columnas de cifras tiene la operación, o 0 si no es una de las que se
 * disponen así.
 *
 * El tutor narra el desarrollo columna a columna ("unidades: 4 + 7 = 11",
 * "decenas: 2 + 1 + 1 = 4"). La cuenta entera, con su total, es el resumen de
 * todas: componerla antes de que las haya contado todas adelanta el resultado.
 */
export function columnasDeOperacion(texto: string): number {
  const op = leerSumaOResta(texto);
  if (!op) return 0;
  return Math.max(String(op.a).length, String(op.b).length, String(op.resultado).length);
}

/**
 * La línea de pizarra compuesta en columna, o `null` si no es una suma ni una
 * resta de las que se disponen así.
 */
export function columnaDeLinea(
  texto: string,
  opciones: { conResultado: boolean },
): string | null {
  const op = leerSumaOResta(texto);
  return op ? columnaVertical(op, opciones) : null;
}

/**
 * La cuenta que el modelo dibujó con guiones, recompuesta como columna de
 * verdad, con su llevada y su total. `null` si el texto no es eso.
 *
 * Se compone resuelta sólo si el dibujo ya traía el total correcto. Con el
 * dibujo a medias se compone el planteamiento: adelantar el resultado sería
 * darle al alumno el final antes de que el tutor llegue ahí.
 */
export function columnaDeCuentaDibujada(texto: string): string | null {
  const op = leerOperacionDibujada(texto);
  return op ? columnaVertical(op, { conResultado: op.completa }) : null;
}

/**
 * El texto sin las rayas dibujadas con guiones.
 *
 * Último recurso, para cuando la cuenta no se deja recomponer: la raya se
 * quita igualmente, porque compuesta como fórmula se lee como una cadena de
 * restas y desalinea todo lo demás.
 */
export function sinRayasDibujadas(texto: string): string {
  return String(texto ?? "")
    .split(/\r?\n/)
    .filter((l) => !esRaya(l.trim()))
    .join("\n")
    .trim();
}

/**
 * La cuenta que se está EXPLICANDO ahora mismo.
 *
 * El tutor no siempre explica la que está en la tarjeta: al pedir ayuda, el
 * modelo puede pasar a la de la práctica. Si la pizarra compone la de la
 * tarjeta mientras la voz narra otra —"nueve más cinco son catorce" con un
 * 24 + 17 delante—, el alumno ve una cosa y oye otra.
 *
 * Manda lo ÚLTIMO que se ha explicado: se recorre el desarrollo de atrás hacia
 * adelante y se devuelve la primera operación que aparezca. Si el desarrollo no
 * nombra ninguna, la de la tarjeta, que es la que el alumno tiene delante.
 */
export function cuentaEnCurso(
  lineasDelDesarrollo: readonly string[],
  ejercicio: string,
): string | null {
  const comoTexto = (op: OperacionEnColumna) => `${op.a} ${op.operador} ${op.b}`;

  for (let i = lineasDelDesarrollo.length - 1; i >= 0; i--) {
    const op = operacionDeLinea(lineasDelDesarrollo[i]);
    if (op) return comoTexto(op);
  }
  const propia = operacionDeLinea(ejercicio);
  return propia ? comoTexto(propia) : null;
}

/**
 * El desarrollo de un ejercicio de aritmética: UNA sola cuenta resuelta.
 *
 * Es la única cosa que se compone debajo del enunciado. Ni el planteamiento
 * repetido —ya está arriba, en su tarjeta— ni los trozos con que el motor la va
 * escribiendo, ni dos copias apiladas. Devuelve el LaTeX de esa cuenta, o
 * `null` si el ejercicio no es una operación de las que se disponen en columna.
 *
 * Vive aquí, y no dentro del componente, para que la suite pueda comprobar la
 * garantía —una matriz, resuelta, la del ejercicio que se explica— sin montar
 * React.
 */
export function columnaDelDesarrollo(
  lineasDelDesarrollo: readonly string[],
  ejercicio: string,
): { texto: string; latex: string } | null {
  if (lineasDelDesarrollo.length === 0) return null;
  const texto = cuentaEnCurso(lineasDelDesarrollo, ejercicio);
  if (!texto) return null;
  const latex = columnaDeLinea(texto, { conResultado: true });
  return latex ? { texto, latex } : null;
}

/** ¿El texto lleva una raya dibujada con guiones? */
export function tieneRayaDibujada(texto: string): boolean {
  return String(texto ?? "")
    .split(/\r?\n/)
    .some((l) => esRaya(l.trim()));
}
