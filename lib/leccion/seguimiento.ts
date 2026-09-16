/**
 * Clasificación del SEGUIMIENTO de una consulta dentro de una lección.
 *
 * Cuando el alumno ya está en un tema, lo que escribe casi nunca abre un tema
 * nuevo: pide otro ejemplo, dice que no entendió, quiere algo más difícil. El
 * servidor necesita saberlo para no cambiarle de asunto a mitad de la clase.
 *
 * Es una versión tipada del clasificador que el prototipo tenía en
 * `public/app.js`, con las mismas reglas: son las que verifica `qa/sesiones.mjs`
 * a lo largo de conversaciones enteras, así que cambiarlas aquí rompería la
 * continuidad de tema que esa batería protege.
 */

/** Tipos de seguimiento que acepta /api/query. */
export type Seguimiento =
  | "reexplicar"
  | "mas_facil"
  | "mas_dificil"
  | "continuacion"
  | "desglosar"
  | "practicar"
  | "resolver_otro";

const norm = (q: string) =>
  String(q ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Saludos y cortesías: no abren tema ni cuentan como seguimiento. */
export function esSaludoOCortesia(consulta: string): boolean {
  return /^(hola|buenas|gracias|ok|okay|vale|si|no|adios)\b/.test(norm(consulta));
}

/** ¿La frase nombra un tema explícito o contiene una expresión matemática? */
export function tieneTemaExplicito(consulta: string): boolean {
  const n = norm(consulta);
  return (
    /(derivad|ecuacion|fraccion|factoriz|lineal|primer grado|sumar|restar|multiplic|dividir)/.test(n) ||
    /[a-z][²³⁴⁵⁶⁷⁸⁹]|\d\s*[-+*/=]/.test(consulta)
  );
}

/**
 * Decide qué tipo de seguimiento es una consulta, o null si abre tema nuevo.
 * Sólo tiene sentido llamarla cuando ya hay un tema activo.
 */
export function clasificarSeguimiento(consulta: string): Seguimiento | null {
  const n = norm(consulta);
  const palabras = n.split(/\s+/).length;

  if (/mas\s.*(dificil|avanzad|complej)/.test(n) || (palabras <= 5 && /(dificil|avanzad)/.test(n))) {
    return "mas_dificil";
  }
  if (/mas\s.*(facil|simple|sencill)/.test(n) || (palabras <= 5 && /(facil|simple|sencill)/.test(n))) {
    return "mas_facil";
  }
  if (/\bno\s+(lo\s+)?(entend|entiend)/.test(n) || /explica\w*\s+(lo\s+)?mejor/.test(n)) {
    return "reexplicar";
  }
  if (/paso a paso|los pasos|desglos/.test(n)) {
    return "desglosar";
  }
  if (/otro ejercicio|otro problema|quiero practicar|dame.*ejercicio/.test(n)) {
    return "practicar";
  }
  if (/otro ejemplo|dame.*ejemplo|de la vida|vida real|vida cotidiana/.test(n)) {
    return "continuacion";
  }
  return null;
}

/**
 * Estado de la conversación que viaja con cada consulta.
 *
 * El servidor NO guarda sesión: el contexto lo mantiene el navegador y lo envía
 * en cada petición. Por eso los cursores de rotación tienen que dar la vuelta
 * completa —el servidor los devuelve y aquí se guardan—; si se perdieran, el
 * alumno recibiría siempre el mismo ejemplo.
 */
export interface EstadoConversacion {
  /** Consulta que abrió el tema activo. */
  temaActivo: string;
  /** Clave del tema, para la corrección y el registro de progreso. */
  claveTema: string;
  /** Resumen de lo ya explicado, para que "otro ejemplo" no repita. */
  previo: string;
  /** Posición de cada lista de ejemplos, devuelta por el servidor. */
  cursores: Record<string, number>;
  /** Ejercicio que está en pantalla, y su respuesta si ya se resolvió. */
  ejercicio: string;
  respuesta: string;
  /** Últimas consultas del alumno. */
  historial: string[];
}

export function estadoInicial(): EstadoConversacion {
  return {
    temaActivo: "",
    claveTema: "",
    previo: "",
    cursores: {},
    ejercicio: "",
    respuesta: "",
    historial: [],
  };
}

export interface PeticionQuery {
  query: string;
  contexto?: string;
  seguimiento?: Seguimiento;
  currentTopic?: string;
  previo?: string;
  historial?: string[];
  cursores?: Record<string, number>;
  ejercicio?: string;
  respuesta?: string;
  parte?: "concepto" | "resolucion";
  modo?: "demo" | "ia";
  /**
   * Pide que la explicación la genere la IA en vivo, saltándose los guiones
   * deterministas. Sólo se usa en las aclaraciones: la matemática calificable
   * sigue viniendo del motor determinista.
   */
  explicacionDinamica?: boolean;
  /**
   * Contexto puntual de la aclaración. Sin él el modelo sólo conoce el tema y
   * responde con generalidades en lugar de explicar la regla que el alumno
   * tiene delante.
   */
  aclaracion?: {
    regla?: { nombre: string; formula: string; descripcion?: string } | null;
    /** El ejercicio de la TARJETA; vacío en Concepto y Reglas. */
    ejercicio?: string;
    tema?: string;
    /** La línea que el alumno tenía delante: el paso en el que se atascó. */
    paso?: string;
    /** false con la pregunta de la práctica sin contestar: el desglose no da el resultado. */
    conResultado?: boolean;
    /** Cuántos «no entendí» seguidos: la escalera de simplificación. */
    insistencia?: number;
  };
}

/**
 * Construye el cuerpo de la petición a /api/query a partir del estado.
 *
 * Reproduce el mismo armado que hace la batería de aceptación, que es la que
 * garantiza que el motor mantenga el tema a lo largo de una conversación.
 */
export function construirPeticion(
  consulta: string,
  estado: EstadoConversacion,
  opciones: { seguimiento?: Seguimiento | null; parte?: "concepto" | "resolucion" } = {},
): PeticionQuery {
  const cuerpo: PeticionQuery = { query: consulta };

  const seg =
    opciones.seguimiento !== undefined
      ? opciones.seguimiento
      : estado.temaActivo
        ? clasificarSeguimiento(consulta)
        : null;

  if (estado.temaActivo) cuerpo.currentTopic = estado.temaActivo;
  if (estado.previo) cuerpo.previo = estado.previo;
  if (estado.historial.length) cuerpo.historial = estado.historial.slice(-5);
  if (Object.keys(estado.cursores).length) cuerpo.cursores = estado.cursores;

  if (seg) {
    cuerpo.contexto = estado.temaActivo;
    cuerpo.seguimiento = seg;
    // El desglose y la reexplicación se aplican al ejercicio que el alumno
    // tiene delante, así que tiene que viajar con la petición.
    if (estado.ejercicio) cuerpo.ejercicio = estado.ejercicio;
    if (estado.respuesta) cuerpo.respuesta = estado.respuesta;
    if (opciones.parte) cuerpo.parte = opciones.parte;
  }

  return cuerpo;
}
