// Núcleo de /api/query, independiente del framework.
//
// POR QUÉ EXISTE ESTE MÓDULO
// El prototipo tenía toda esta lógica dentro del manejador de Express. El PMV 1
// la sirve desde una ruta de Next.js, y la exigencia del cliente es "paridad
// algorítmica" con el prototipo. Reescribir el manejador para Next habría
// obligado a demostrar esa paridad a base de pruebas; extraerlo a una función
// pura la hace ESTRUCTURAL: Express (server.js, que se conserva como
// referencia) y Next (app/api/query/route.ts) llaman al mismo código, así que
// no pueden divergir.
//
// La transformación fue mecánica y sin cambios de comportamiento:
//   res.json(x)                 →  { status: 200, json: x }
//   res.status(n).json(x)       →  { status: n, json: x }
//   res.set("Retry-After", v)   →  headers: { "Retry-After": v }
// El pipeline, el orden de las ramas, la caché, los límites y los textos en
// español son los del prototipo, literales.
//
// Pipeline: consulta → clasificador de intención → motor determinista o IA
//           (Gemini, LSG) → PRE Light → respuesta.

import { classifyIntent } from "./classifier.js";
import { generateLSG } from "./geminiClient.js";
import { processLSG, processStepByStep } from "./preLight.js";
import { mockLSG, leccionBotonLSG, desgloseDelEjercicioLSG, reexplicacionDeConceptoLSG } from "./lsgPrompt.js";

// ── Salud del servicio ────────────────────────────────────────────────────────
// Informa de si hay API key configurada, SIN revelarla.
export function salud() {
  return {
    status: "ok",
    modo_ia: process.env.GEMINI_API_KEY ? "gemini" : "mock",
    modelo: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    version:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.RENDER_GIT_COMMIT ||
      process.env.COMMIT ||
      "desconocido",
  };
}

// Caché de lecciones en memoria: la MISMA consulta no vuelve a llamar a Gemini
// (el mayor ahorro de créditos — al probar se repiten mucho las mismas consultas).
const CACHE = new Map(); // clave -> respuesta ya generada
const CACHE_MAX = 300;
const cacheKey = (q, intent, modo) =>
  (modo || "auto") + "::" + intent + "::" + q.toLowerCase().replace(/\s+/g, " ").trim();

// ── PROTECCIÓN DEL ENDPOINT: LÍMITE DE SOLICITUDES ────────────────────────────
// Pedido por el cliente para evitar consumo indebido de la cuota de Gemini. La clave del diseño es
// QUÉ se limita: las lecciones de los temas garantizados NO cuestan nada (las calcula el motor
// determinista), así que limitarlas solo estorbaría —incluidas las propias baterías de prueba, que
// hacen 1 800 turnos seguidos—. Lo que gasta cuota es la llamada a Gemini, y es lo que se controla.
//
// Tres capas, todas en memoria:
//   1. Tope general por IP, generoso, contra abuso o bucles del navegador.
//   2. Tope de llamadas a la IA por IP, mucho más estricto.
//   3. Tope GLOBAL diario de llamadas a la IA: pase lo que pase, la cuota no se puede vaciar en un día.
// Al superarse se responde 429 con un mensaje claro en español, no con un error crudo.
//
// ⚠️ LIMITACIÓN EN SERVERLESS (Vercel, Render con autoescalado)
// Estos contadores viven en la memoria del proceso. El prototipo corría en UNA
// instancia, así que eran exactos. En serverless cada lambda tiene su propia
// memoria y se recicla sola, de modo que:
//   · los topes por IP se aplican por instancia, no de forma global, y
//   · el tope "global" diario deja de serlo: con N instancias, el gasto máximo
//     real es N veces el configurado.
// La caché de lecciones se degrada sin más (menos aciertos, nada se rompe),
// pero el límite de cuota SÍ pierde su garantía. Para producción hay que
// respaldar estos contadores en almacenamiento compartido (una tabla en
// PostgreSQL o Redis). Queda anotado para el Paso 4 (despliegue productivo);
// en un preview de revisión el riesgo es asumible porque el tráfico es de una
// sola persona.
const LIMITES = {
  generalPorMinuto: Number(process.env.LIMITE_GENERAL_MIN || 3000),
  iaPorMinuto: Number(process.env.LIMITE_IA_MIN || 15),
  iaPorHora: Number(process.env.LIMITE_IA_HORA || 120),
  iaPorDiaGlobal: Number(process.env.LIMITE_IA_DIA || 500),
};
const ventanas = new Map(); // "ip|tipo" -> { hasta, n }
const iaHoy = { dia: "", n: 0 };

function cuenta(clave, ventanaMs, tope) {
  const ahora = Date.now();
  const v = ventanas.get(clave);
  if (!v || ahora > v.hasta) {
    ventanas.set(clave, { hasta: ahora + ventanaMs, n: 1 });
    return { ok: true, quedan: tope - 1 };
  }
  v.n++;
  return {
    ok: v.n <= tope,
    quedan: Math.max(0, tope - v.n),
    esperaSeg: Math.ceil((v.hasta - ahora) / 1000),
  };
}

// Limpieza perezosa: sin esto el mapa crecería sin fin en un servicio de larga vida.
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of ventanas) if (t > v.hasta) ventanas.delete(k);
}, 60_000).unref?.();

/** Capa 1: tope general por IP sobre /api/query (no distingue tipo de consulta). */
export function limiteGeneral(ip) {
  const r = cuenta(`${ip}|gen`, 60_000, LIMITES.generalPorMinuto);
  if (r.ok) return { ok: true };
  return {
    ok: false,
    status: 429,
    headers: { "Retry-After": String(r.esperaSeg || 60) },
    json: {
      error: "Demasiadas solicitudes seguidas. Espera unos segundos y vuelve a intentarlo.",
      reintentar_en_segundos: r.esperaSeg || 60,
    },
  };
}

// ¿Esta consulta puede acabar llamando a Gemini? Solo se cuenta contra la cuota si NO la resuelve el
// motor determinista. Se decide más abajo, justo antes de llamar; aquí solo se prepara el contador.
function permisoIA(ip) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (iaHoy.dia !== hoy) {
    iaHoy.dia = hoy;
    iaHoy.n = 0;
  }
  if (iaHoy.n >= LIMITES.iaPorDiaGlobal) {
    return {
      ok: false,
      motivo:
        "Se ha alcanzado el límite diario de consultas a la inteligencia artificial. Los temas garantizados (ecuaciones, derivadas, factorización, fracciones y aritmética) siguen funcionando con normalidad.",
      esperaSeg: 3600,
    };
  }
  const min = cuenta(`${ip}|ia-min`, 60_000, LIMITES.iaPorMinuto);
  if (!min.ok)
    return {
      ok: false,
      motivo: "Vas muy rápido con los temas avanzados. Espera unos segundos y vuelve a intentarlo.",
      esperaSeg: min.esperaSeg,
    };
  const hora = cuenta(`${ip}|ia-hora`, 3_600_000, LIMITES.iaPorHora);
  if (!hora.ok)
    return {
      ok: false,
      motivo:
        "Has hecho muchas consultas de temas avanzados en la última hora. Inténtalo más tarde; los temas garantizados siguen disponibles.",
      esperaSeg: hora.esperaSeg,
    };
  return { ok: true, consumir: () => { iaHoy.n++; } };
}

/**
 * Manejador principal. Recibe el cuerpo ya parseado y la IP del solicitante;
 * devuelve { status, json, headers? }. No conoce Express ni Next.
 */
export async function manejarConsulta(body, ip = "desconocida") {
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  // Contexto de conversación: el último tema, para reexplicar cuando el alumno dice
  // "no entendí". El frontend lo envía solo cuando la consulta es un seguimiento.
  const contexto = typeof body?.contexto === "string" ? body.contexto.trim().slice(0, 2000) : "";
  // Tipo de seguimiento del tema activo (opcional).
  const SEG_VALIDOS = ["reexplicar", "mas_facil", "mas_dificil", "continuacion", "desglosar", "practicar", "resolver_otro"];
  const seguimiento = SEG_VALIDOS.includes(body?.seguimiento)
    ? body.seguimiento
    : contexto
      ? "reexplicar" // compatibilidad: si hay contexto sin tipo, es un "no entendí"
      : "";
  // Tema activo + últimas consultas del alumno. Se pasa a la IA para que NUNCA
  // interprete el mensaje de forma aislada (evita "bajar" de tema en un seguimiento).
  const currentTopic = typeof body?.currentTopic === "string" ? body.currentTopic.trim().slice(0, 300) : "";
  const historial = Array.isArray(body?.historial)
    ? body.historial.filter((s) => typeof s === "string" && s.trim()).slice(-5).map((s) => s.trim().slice(0, 200))
    : [];
  // Resumen de la lección ANTERIOR (memoria): lo ya explicado, para que un "otro ejemplo" no repita.
  const previo = typeof body?.previo === "string" ? body.previo.trim().slice(0, 800) : "";

  // METADATOS ACADÉMICOS del alumno, si hay sesión: ciclo, nivel diagnosticado y
  // debilidades. Los adjunta la ruta, no el navegador, así que no se pueden
  // falsear desde fuera. Sin sesión vienen vacíos y todo sigue igual: la lección
  // determinista no puede depender de quién la pida o dejaría de ser reproducible.
  const alumno = body?.alumno && typeof body.alumno === "object" ? body.alumno : null;
  // El nivel del diagnóstico marca el escalón de partida, pero NO pisa el que
  // venga en la consulta: si el alumno ya ha pulsado "más difícil", manda eso.
  const nivelDelPerfil = typeof alumno?.nivelMotor === "string" ? alumno.nivelMotor : "";

  // CURSOR DE ROTACIÓN: posición ("tema:nivel" → índice) de por dónde va cada lista de ejemplos. El
  // servidor NO guarda sesión, así que el cursor viaja con la conversación. Se saneia entero
  // (claves, tipos y rango) porque viene del cliente. El tope de claves NO es decorativo: si se
  // supera, las que sobran se descartan EN SILENCIO y esa rotación deja de avanzar.
  const MAX_CURSORES = 80;
  const cursores = {};
  const curRaw = body?.cursores;
  if (curRaw && typeof curRaw === "object" && !Array.isArray(curRaw)) {
    for (const k of Object.keys(curRaw).slice(0, MAX_CURSORES)) {
      const v = curRaw[k];
      if (/^[a-z_]{1,20}:[a-z]{1,10}$/.test(k) && Number.isInteger(v) && v >= -1 && v < 1000) cursores[k] = v;
    }
  }

  // Continuidad de ARTEFACTO: el EJERCICIO que está en pantalla y su respuesta ya calculada.
  const ejercicio = typeof body?.ejercicio === "string" ? body.ejercicio.trim().slice(0, 300) : "";
  const respuestaEj = typeof body?.respuesta === "string" ? body.respuesta.trim().slice(0, 60) : "";
  // Modo elegido por el usuario: "demo" (sin IA), "ia" (usa Gemini) o vacío (automático).
  const modo = body?.modo === "demo" || body?.modo === "ia" ? body.modo : "";

  // EXPLICACIÓN DINÁMICA. Los botones de aclaración ("no entendí", "explícame la regla") caían en las
  // ramas deterministas de abajo, que responden con un guion fijo —siempre las mismas frases, la misma
  // analogía—. Con esta bandera se saltan esas ramas y la explicación la redacta el modelo en vivo,
  // teniendo delante el tema, el ejercicio en pantalla y lo ya explicado.
  //
  // Sólo afecta a la PROSA. Los ejercicios calificables siguen saliendo del motor determinista: si la
  // aritmética de una práctica la escribiera el modelo, se perdería la garantía que da el PRE Light,
  // que es la razón de ser de todo esto. Por eso la interfaz activa la bandera en los botones que
  // aclaran y NO en los que traen ejercicio nuevo.
  //
  // Va apagada por defecto, de modo que el comportamiento del prototipo —y su suite— no cambia.
  const explicacionDinamica = body?.explicacionDinamica === true;

  // Contexto puntual de la aclaración: qué regla se está explicando, con qué fórmula, y sobre qué
  // término. Sin esto el modelo sólo sabe el tema, y responde con generalidades sobre "qué es una
  // derivada" en vez de explicar la regla que el alumno tiene delante. Se saneia porque viene del
  // navegador: sólo campos de texto, y cortos.
  const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const aclaracion = explicacionDinamica && body?.aclaracion && typeof body.aclaracion === "object"
    ? {
        regla: body.aclaracion.regla && typeof body.aclaracion.regla === "object"
          ? {
              nombre: texto(body.aclaracion.regla.nombre, 80),
              formula: texto(body.aclaracion.regla.formula, 200),
            }
          : null,
        ejercicio: texto(body.aclaracion.ejercicio, 120),
        tema: texto(body.aclaracion.tema, 80),
        // La línea que el alumno tenía delante al pulsar: el paso EXACTO en el que se atascó.
        paso: texto(body.aclaracion.paso, 160),
        // En la práctica, con la pregunta sin contestar, el desglose se detiene antes del resultado.
        conResultado: body.aclaracion.conResultado !== false,
        // Cuántas veces seguidas lleva diciendo que no entiende: la escalera de simplificación.
        insistencia: Number.isInteger(body.aclaracion.insistencia) ? Math.max(0, Math.min(2, body.aclaracion.insistencia)) : 0,
      }
    : null;

  if (!query) {
    return { status: 400, json: { error: "Falta la consulta ('query')." } };
  }
  if (query.length > 2000) {
    return { status: 400, json: { error: "La consulta es demasiado larga." } };
  }

  try {
    // 0) DESGLOSE PASO A PASO del ejercicio actual (continuidad de artefacto). El alumno pidió
    //    "explícame los pasos anteriores / paso a paso": re-narramos la solución del ejercicio que
    //    YA está en pantalla, de forma DETERMINISTA (sin IA, sin coste).
    if (seguimiento === "desglosar" && !explicacionDinamica) {
      // El TEMA ACTIVO viaja con el desglose: la lectura correcta la sabe la clase, no la expresión.
      const built = processStepByStep(ejercicio, respuestaEj, `${contexto} ${currentTopic}`);
      if (built) {
        return {
          status: 200,
          json: {
            query,
            reexplicacion: true,
            intencion: "explicar",
            confianza: 1,
            fuente_ia: "local", // contenido determinista del PRE Light (no IA, no demo)
            modelo: "pre-light",
            lsg: built.lsg,
            pasos: built.pasos,
            advertencias: built.warnings,
            tokens: null,
            cache_activo: false,
          },
        };
      }
      // SIN ejercicio utilizable. El alumno pidió resolver EL de la pantalla, así que aquí NUNCA se
      // sigue al flujo normal: la IA acababa inventando un ejercicio NUEVO y el alumno, que había
      // pedido "resuelve ESTA", veía otra distinta. Se responde de forma honesta y determinista.
      const aviso = {
        escena: "sin_ejercicio_a_la_vista",
        intencion: "explicar",
        duracion_estimada: 12,
        directivas: [
          { tipo: "avatar", accion: "neutral" },
          { tipo: "hablar", texto: "No tengo tu ejercicio a la vista, así que no voy a resolver otro distinto. Escríbemelo tal cual —por ejemplo «resuelve 5x - 7 = 2x + 5»— y lo hacemos juntos paso a paso." },
          { tipo: "pizarra", accion: "escribir", contenido: "Escribe tu ejercicio y lo resuelvo paso a paso" },
          // Pregunta de COMPRENSIÓN (sin respuesta que calificar) puesta a propósito: si no la
          // pusiéramos, el PRE Light añadiría una de cierre y podría inventar un ejercicio.
          { tipo: "preguntar", texto: "¿Quieres escribirme el ejercicio y lo resolvemos juntos?", respuesta: "", esperar_respuesta: true, si_correcto: "continuar", si_incorrecto: "continuar" },
        ],
      };
      const avisoProc = processLSG(aviso, "explicar", query);
      return {
        status: 200,
        json: {
          query,
          reexplicacion: true,
          intencion: "explicar",
          confianza: 1,
          fuente_ia: "local",
          modelo: "pre-light",
          lsg: avisoProc.lsg,
          pasos: avisoProc.pasos,
          advertencias: avisoProc.warnings,
          tokens: null,
          cache_activo: false,
        },
      };
    }

    // 0.05) "NO ENTENDÍ" con un ejercicio EN PANTALLA: el alumno quiere que le vuelvan a explicar ESE
    //       ejercicio, más despacio — no que le cambien a otro distinto. Se re-narra el MISMO, paso a
    //       paso y sin coste de IA. Se re-explica el ejercicio del TEMA, NO el de PRÁCTICA: explicar
    //       la práctica le REVELARÍA la respuesta que debe hallar él. Si el alumno está viendo el
    //       CONCEPTO (no un problema), "no entendí" NO debe re-resolverle una ecuación.
    const parte = body?.parte === "concepto" ? "concepto" : "resolucion";

    // 0.04) «NO ENTENDÍ ESTE PASO»: EL MISMO EJERCICIO, DESGLOSADO, SIN IA.
    //
    // Este botón pedía la explicación al modelo en vivo, y cuando el modelo no respondía —cuota
    // agotada— la consulta caía en la lección de demostración genérica del tema: otra cuenta ("1/4 +
    // 1/4 = 2/4") debajo del enunciado que el alumno estaba resolviendo ("1/2 + 1/3"), una pizza que no
    // se veía por ningún lado y la lección dada por terminada. El cliente lo reportó con dos capturas.
    // Ahora el desglose es determinista y del ejercicio de la TARJETA: el paso en el que estaba, con su
    // andamiaje, y el resto más despacio. Sin ejercicio en la tarjeta (concepto, reglas), la misma idea
    // contada con otras palabras. La lección la reanuda el aula.
    if (explicacionDinamica && parte === "resolucion" && aclaracion) {
      const temaAcl = `${aclaracion.tema} ${contexto} ${currentTopic}`;
      const raw = aclaracion.ejercicio
        ? desgloseDelEjercicioLSG({ ejercicio: aclaracion.ejercicio, tema: temaAcl, paso: aclaracion.paso, conResultado: aclaracion.conResultado })
        : reexplicacionDeConceptoLSG(temaAcl, aclaracion.insistencia);
      if (raw) {
        const des = processLSG(raw, "explicar", query);
        return {
          status: 200,
          json: {
            query,
            reexplicacion: true,
            intencion: "explicar",
            confianza: 1,
            fuente_ia: "local",
            modelo: "desglose",
            lsg: des.lsg,
            pasos: des.pasos,
            advertencias: des.warnings,
            tokens: null,
            cache_activo: false,
          },
        };
      }
    }

    if (seguimiento === "reexplicar" && !explicacionDinamica && parte !== "concepto" && (ejercicio || contexto)) {
      // Una expresión SUELTA no dice qué hay que hacer con ella: "3x⁴ - 2x²" puede derivarse o
      // factorizarse. El TEMA ACTIVO decide la lectura, y esa lectura es EXCLUSIVA, no sólo
      // prioritaria: en una sesión de factorización nunca se acepta la lectura "derivada de …".
      const temaCtx = String(`${contexto} ${currentTopic}`).toLowerCase();
      const esDeriv = /deriv/.test(temaCtx),
        esFactor = /factoriz|cuadrados/.test(temaCtx);
      const candidatos = [];
      if (ejercicio) {
        if (esDeriv) candidatos.push(`derivada de ${ejercicio}`);
        if (esFactor) candidatos.push(`factoriza ${ejercicio}`);
        // La expresión SUELTA solo se prueba cuando el tema no es derivadas ni factorización.
        if (!esDeriv && !esFactor) candidatos.push(ejercicio, `derivada de ${ejercicio}`, `factoriza ${ejercicio}`);
      }
      // El TEMA solo sirve de último recurso cuando NO sabemos qué hay en pantalla.
      if (contexto && !ejercicio) candidatos.push(contexto);
      let mismo = null;
      for (const c of candidatos) {
        const intento = processStepByStep(c, "", temaCtx);
        if (intento && intento.pasos.filter((p) => p.tipo === "pizarra").length >= 2) {
          mismo = intento;
          break;
        }
      }
      // Solo vale si de verdad DESGLOSÓ algo.
      const pizarras = mismo ? mismo.pasos.filter((p) => p.tipo === "pizarra").length : 0;
      if (mismo && pizarras >= 2) {
        const conIntro = {
          ...mismo.lsg,
          directivas: [
            { tipo: "hablar", texto: "Sin problema: vamos MÁS DESPACIO con el MISMO ejercicio, paso a paso, sin saltarnos nada." },
            ...(mismo.lsg.directivas || []),
          ],
        };
        const re = processLSG(conIntro, "explicar", query);
        return {
          status: 200,
          json: {
            query,
            reexplicacion: true,
            intencion: "explicar",
            confianza: 1,
            fuente_ia: "local",
            modelo: "pre-light",
            lsg: re.lsg,
            pasos: re.pasos,
            advertencias: re.warnings,
            tokens: null,
            cache_activo: false,
          },
        };
      }
    }

    // 0.1) LECCIÓN DE BOTÓN DETERMINISTA (los 4 chips: ecuación lineal, derivadas, factorización,
    //      fracciones). Cada botón presenta un EJEMPLO resuelto paso a paso + una PRÁCTICA distinta y
    //      calificable, con aritmética GARANTIZADA (0 coste de IA). Si la consulta no es de ninguno de
    //      los 4 botones, devuelve null y se sigue el flujo normal con Gemini.
    const boton = explicacionDinamica
      ? null
      : leccionBotonLSG({ query, seguimiento, contexto, currentTopic, previo, historial, cursores, nivelDePartida: nivelDelPerfil });
    if (boton) {
      const { lsg, pasos, warnings } = processLSG(boton.lsg, boton.intencion, query);
      return {
        status: 200,
        json: {
          query,
          reexplicacion: !!contexto,
          intencion: boton.intencion,
          confianza: 1,
          fuente_ia: "local",
          modelo: boton.modelo,
          cursores,
          lsg,
          pasos,
          advertencias: warnings,
          tokens: null,
          cache_activo: false,
        },
      };
    }

    // Seguimiento del tema activo (mantiene el TEMA anterior; no es un tema nuevo).
    const reexplain = !!contexto;
    const esNivel = seguimiento === "mas_facil" || seguimiento === "mas_dificil";
    const esOtraPractica = seguimiento === "practicar";
    const esContinuacion = seguimiento === "continuacion";
    const esResolverOtro = seguimiento === "resolver_otro";
    // effectiveQuery: reexplicar/nivel re-usan el TEMA; "continuación"/"otra práctica"/"resolver otra"
    // usan el MENSAJE real del alumno, anclado al tema, para no perder el tema.
    const effectiveQuery = !reexplain
      ? query
      : esContinuacion
        ? query
        : esOtraPractica
          ? query
          : esResolverOtro
            ? query
            : contexto;

    // 1) Intención: "más fácil/difícil" y "otro ejercicio" → practicar; "otra ecuación y resuélvela"
    //    → resolver; "continuación" o "no entendí" → explicar. Si no es seguimiento, decide el clasificador.
    const classification = reexplain
      ? esResolverOtro
        ? { intent: "resolver", confidence: 0.9, scores: { resolver: 1, aprender: 0, explicar: 0, practicar: 0 } }
        : esNivel || esOtraPractica
          ? { intent: "practicar", confidence: 0.9, scores: { resolver: 0, aprender: 0, explicar: 0, practicar: 1 } }
          : { intent: "explicar", confidence: 0.9, scores: { resolver: 0, aprender: 0, explicar: 1, practicar: 0 } }
      : classifyIntent(query);

    // 1.5) Caché: en una reexplicación NO se usa (cada "no entendí" debe poder ser DISTINTO).
    //      La clave incluye el modo: demo e IA se cachean por separado.
    const key = cacheKey(effectiveQuery, classification.intent, modo);
    if (!reexplain && CACHE.has(key)) {
      const cached = CACHE.get(key);
      CACHE.delete(key);
      CACHE.set(key, cached); // refrescar orden (LRU)
      return { status: 200, json: { ...cached, cacheado: true } };
    }

    // LÍMITE DE IA: se comprueba AQUÍ, no al entrar, porque hasta este punto la consulta pudo haberse
    // resuelto con el motor determinista, que no gasta cuota. En modo "demo" tampoco se llama.
    let permiso = { ok: true, consumir: () => {} };
    if (modo !== "demo") {
      permiso = permisoIA(ip);
      if (!permiso.ok) {
        return {
          status: 429,
          headers: { "Retry-After": String(permiso.esperaSeg || 60) },
          json: { error: permiso.motivo, reintentar_en_segundos: permiso.esperaSeg || 60 },
        };
      }
    }

    // 2) Generar el LSG. Modo "demo" → contenido básico sin IA; "ia" → SIEMPRE intenta Gemini;
    //    auto (vacío) → intenta IA con enfriamiento tras 429.
    const gen = await generateLSG(effectiveQuery, classification.intent, {
      reexplain,
      seguimiento,
      tema: contexto || currentTopic,
      currentTopic,
      historial,
      previo,
      // El contexto del alumno, ya resumido en una línea por la ruta.
      alumno: typeof alumno?.resumen === "string" ? alumno.resumen : "",
      forceDemo: modo === "demo",
      // Una aclaración pide explícitamente al modelo: no vale caer al contenido
      // de demostración, que es otro guion fijo y devolvería el problema al
      // punto de partida.
      forceAI: modo === "ia" || explicacionDinamica,
      aclaracion,
    });
    let { lsg: rawLsg, source, model } = gen;
    const { usage, cached } = gen;
    // UNA ACLARACIÓN NUNCA CAE EN LA LECCIÓN DE DEMOSTRACIÓN DEL TEMA. "Explicar regla" sigue
    // redactándolo el modelo en vivo; pero si el modelo no responde, la demostración genérica traería
    // OTRO ejercicio —es exactamente lo que el cliente fotografió con «No entendí este paso»—. En su
    // lugar, el desglose determinista del ejercicio de la tarjeta, presentado por la regla que se pidió.
    if (explicacionDinamica && source === "mock" && aclaracion) {
      const temaAcl = `${aclaracion.tema} ${contexto} ${currentTopic}`;
      const mismo = aclaracion.ejercicio
        ? desgloseDelEjercicioLSG({ ejercicio: aclaracion.ejercicio, tema: temaAcl, paso: aclaracion.paso, conResultado: aclaracion.conResultado })
        : reexplicacionDeConceptoLSG(temaAcl, aclaracion.insistencia);
      if (mismo) {
        // Se abre con la regla que se pidió, en lugar del "sin problema" de quien dice que no entiende.
        if (aclaracion.regla?.nombre && mismo.directivas[1]?.tipo === "hablar") {
          mismo.directivas[1] = { tipo: "hablar", texto: `La regla que estamos aplicando es «${aclaracion.regla.nombre}». Mira cómo funciona en tu ejercicio.` };
        }
        rawLsg = mismo;
        source = "local";
        model = "desglose";
      }
    }
    // Solo cuenta contra la cuota si la lección vino REALMENTE del modelo.
    if (source === "gemini" && !cached) permiso.consumir();

    // 3) PRE Light: validar y normalizar en bloques predecibles. Si la IA devolvió un JSON válido
    //    pero con estructura INESPERADA (processLSG lanza), NO devolvemos un 502: caemos al contenido
    //    de demostración (siempre válido) y lo señalamos de forma transparente al alumno.
    let lsg, pasos, warnings;
    try {
      ({ lsg, pasos, warnings } = processLSG(rawLsg, classification.intent, effectiveQuery));
    } catch (preErr) {
      console.warn("[/api/query] LSG de la IA no procesable, se usa modo demostración:", preErr.message);
      const demo = mockLSG(effectiveQuery, classification.intent, { reexplain });
      ({ lsg, pasos, warnings } = processLSG(demo, classification.intent, effectiveQuery));
      source = "mock";
      model = "demo-respaldo";
    }

    const payload = {
      query,
      reexplicacion: !!contexto,
      intencion: classification.intent,
      confianza: classification.confidence,
      fuente_ia: source, // "gemini" | "mock"
      modelo: model,
      lsg,
      pasos,
      advertencias: warnings,
      tokens: usage || null,
      cache_activo: !!cached,
    };

    // Cachear lecciones reales con explicaciones, o ecuaciones ya resueltas por el modo demo.
    const tieneExplicacion = pasos.some((p) => p.tipo === "hablar");
    const ecuacionResuelta = source === "mock" && lsg.escena === "demo_resuelto";
    // No cachear las reexplicaciones: cada "no entendí" debe poder salir distinto.
    if (!reexplain && ((source === "gemini" && tieneExplicacion) || ecuacionResuelta)) {
      CACHE.set(key, payload);
      if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value); // desalojar el más viejo
    }

    return { status: 200, json: payload };
  } catch (err) {
    // Log COMPLETO en el servidor (con stack) para diagnosticar bugs propios; al cliente solo un
    // mensaje genérico (no se filtran mensajes internos de excepción).
    console.error("[/api/query] Error:", err.stack || err.message);
    return {
      status: 502,
      json: { error: "No se pudo generar la lección. Inténtalo de nuevo en unos momentos." },
    };
  }
}
