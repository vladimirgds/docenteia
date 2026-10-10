// ¿SE ACOTA DE VERDAD LA PRÁCTICA DE UNA TAREA, EN UN NAVEGADOR DE VERDAD?
//
// POR QUÉ EXISTE
// El cliente encontró, en el sitio publicado, que una tarea de "5 ejercicios"
// mandaba al alumno a la lección libre (`/estudiante/leccion`), sin cupo, sin
// contador y sin cierre: "el estudiante resuelve ejercicios de forma
// indefinida sin saber cuál ni cuándo termina". `qa/hito3.mjs` prueba el
// servidor —el cupo, las fechas, los reintentos—, pero el conteo de
// ejercicios vive en el navegador (`components/leccion/aula.tsx`), atado a
// cuándo el motor cierra un ejercicio de PRÁCTICA. Eso sólo se ve abriendo la
// página de verdad.
//
// Aquí se abre una tarea de 2 ejercicios de aritmética y se resuelven los
// dos, verificando:
//
//   A. La lección arranca DIRECTO en el tema de la tarea, sin el selector.
//   B. El contador dice "Ejercicio 1 de 2" y pasa a "Ejercicio 2 de 2".
//   C. Al resolver el segundo, aparece la pantalla de cierre con la nota.
//   D. La entrega queda registrada de verdad: `GET /api/estudiante/tareas` la
//      ve "entregada", con la nota que corresponde a dos aciertos.
//
//   node qa/hito3-navegador.mjs
//   BASE_URL=http://localhost:3000 CHROME=/ruta/a/chrome.exe node qa/hito3-navegador.mjs

import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";

const require = createRequire(import.meta.url);

const CHROME =
  process.env.CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((ruta) => existsSync(ruta));

const RUTA_PLAYWRIGHT = process.env.PLAYWRIGHT_CORE || "playwright-core";

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
function salir() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
  if (fallos.length > 0) {
    console.log("\n Fallos:");
    for (const f of fallos) console.log(`   · ${f}`);
  }
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(fallos.length > 0 ? 1 : 0);
}

let chromium;
try {
  ({ chromium } = require(RUTA_PLAYWRIGHT));
} catch (e) {
  console.error("\n  ✗ No se ha podido cargar playwright-core: esta tarea NO se ha probado en un navegador.");
  console.error(`    (${String(e.message).split("\n")[0]})\n`);
  process.exit(1);
}
if (!CHROME) {
  console.error("\n  ✗ No se ha encontrado Chrome ni Edge.\n");
  process.exit(1);
}

await exigirServidor();

console.log("\n── Preparando el aula, la matrícula y la tarea (por HTTP) ──");

const sesionDocente = await iniciarSesion(
  BASE,
  process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
  process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
);
if (!sesionDocente) {
  console.error("  ✗ No se pudo iniciar sesión como el docente de la semilla.");
  process.exit(1);
}
const api = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", cookie: sesionDocente, ...(opciones.headers || {}) },
  });

const sufijo = Date.now().toString(36);
const rAula = await api("/api/docente/aulas", {
  method: "POST",
  body: JSON.stringify({ nombre: `Navegador Hito3 ${sufijo}`, grado: 1, seccion: "N" }),
});
const aula = await rAula.json();
check("se crea el aula de prueba", rAula.status === 201, `HTTP ${rAula.status}`);

const email = `qa.hito3nav.${sufijo}@mentoriamath.local`;
const clave = "Alumno-2026";
const alta = await registrarAlumno(BASE, { email, password: clave, nombre: "QA Hito3 Nav" });
check("se registra el alumno de prueba", alta.ok);

await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", cookie: alta.sesion },
  body: JSON.stringify({ etapa: "PRIMARIA", curso: 4 }),
});
const prueba = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })).json();
await fetch(`${BASE}/api/diagnostico`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: alta.sesion },
  body: JSON.stringify({
    respuestas: (prueba.preguntas ?? []).map((p) => ({
      preguntaId: p.id,
      respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
    })),
  }),
});
// Mismo motivo que en qa/hito3.mjs: nivelActual viaja en el JWT y sólo se
// rellena al iniciar sesión, así que hace falta una sesión nueva.
const galleta = (await iniciarSesion(BASE, email, clave)) ?? alta.sesion;

const apiAlumno = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", cookie: galleta, ...(opciones.headers || {}) },
  });
const rUnirse = await apiAlumno("/api/estudiante/unirse", {
  method: "POST",
  body: JSON.stringify({ codigoAcceso: aula?.aula?.codigoAcceso }),
});
check("el alumno se matricula en el aula", rUnirse.status === 201, `HTTP ${rUnirse.status}`);

// El nodo de Aritmética sembrado: tiene motor determinista, así que la tarea
// puede asociarle un tema y la lección arrancar directo en él.
const rTemas = await api("/api/docente/temas");
const temas = await rTemas.json().catch(() => ({}));
const nodoAritmetica = (temas?.temas ?? temas?.nodos ?? []).find(
  (t) => t.motor === "ARITMETICA" || t.clave === "aritmetica",
);

const ahoraIso = new Date().toISOString();
const mananaIso = new Date(Date.now() + 86_400_000).toISOString();
const rTarea = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula?.aula?.id,
    titulo: `Práctica acotada ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    cantidadEjercicios: 2,
    limiteReintentos: 0,
    nodoId: nodoAritmetica?.id ?? null,
  }),
});
const tarea = await rTarea.json();
check("se crea la tarea de 2 ejercicios", rTarea.status === 201 && Boolean(tarea?.tarea?.id), `HTTP ${rTarea.status}`);
check("…asociada al nodo de Aritmética", Boolean(nodoAritmetica?.id), "no se encontró el nodo sembrado");

// ── El navegador ─────────────────────────────────────────────────────────────

console.log(`\n── Abriendo /estudiante/leccion?tareaId=… en Chrome ──`);

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1400 } });

// La cookie se declara POR URL, no por dominio (ver memoria del proyecto):
// así vale igual en http://localhost que en un despliegue https.
await contexto.addCookies(
  galleta.split(";").map((par) => {
    const [nombre, ...resto] = par.trim().split("=");
    return { name: nombre, value: resto.join("="), url: BASE };
  }),
);

// Voz de mentira, con tiempos conocidos: sin esto, un Chrome sin voces
// instaladas no dispara onstart/onend y la lección se queda esperando.
await contexto.addInitScript(() => {
  window.SpeechSynthesisUtterance = class {
    constructor(texto) {
      this.text = texto;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  };
  const sintetizador = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => [{ name: "QA es-ES", lang: "es-ES", default: true, localService: true }],
    addEventListener() {},
    removeEventListener() {},
    onvoiceschanged: null,
    speak(u) {
      setTimeout(() => u.onstart?.({ charIndex: 0 }), 50);
      setTimeout(() => {
        sintetizador.speaking = false;
        u.onend?.({ charIndex: u.text.length });
      }, 250);
      sintetizador.speaking = true;
    },
    cancel() {
      sintetizador.speaking = false;
    },
    pause() {
      sintetizador.paused = true;
    },
    resume() {
      sintetizador.paused = false;
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: sintetizador, configurable: true });
});

const pagina = await contexto.newPage();
const erroresConsola = [];
pagina.on("pageerror", (e) => erroresConsola.push(String(e)));

await pagina.goto(`${BASE}/estudiante/leccion?tareaId=${tarea.tarea.id}`, { waitUntil: "networkidle" });

const estadoVisible = () =>
  pagina.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((i) => /respuesta/i.test(i.placeholder ?? ""));
    let preguntaLatex = null;
    for (let el = input, k = 0; el && k < 6; k++) {
      el = el.parentElement;
      const a = el?.querySelector("annotation");
      if (a) {
        preguntaLatex = a.textContent;
        break;
      }
    }
    const texto = document.body.innerText ?? "";
    const contador = texto.match(/Ejercicio (\d+) de (\d+)/);
    return {
      titulo: document.querySelector("h1")?.textContent ?? null,
      contador: contador ? { actual: Number(contador[1]), total: Number(contador[2]) } : null,
      hayInput: Boolean(input),
      preguntaLatex,
      tareaCompletada: /Tarea completada/.test(texto),
      nota: (texto.match(/Nota:\s*(\d+)\s*\/\s*100/) || [])[1] ?? null,
      cambiarDeTema: /Cambiar de tema/.test(texto),
      selectorDeTemas: /Elige un tema/.test(texto),
    };
  });

async function esperar(cond, ms, cada = 300) {
  const t0 = Date.now();
  let e = await estadoVisible();
  while (!cond(e) && Date.now() - t0 < ms) {
    await pagina.waitForTimeout(cada);
    e = await estadoVisible();
  }
  return e;
}

/** "19 + 45" → "64". Misma función que qa/navegador.mjs, para aritmética simple. */
function resolverPregunta(latex) {
  const e = String(latex ?? "").replace(/\s+/g, "");
  const s = e.match(/^(\d+)([+-])(\d+)$/);
  return s ? String(s[2] === "+" ? Number(s[1]) + Number(s[3]) : Number(s[1]) - Number(s[3])) : null;
}

let estado = await esperar((e) => e.contador != null || e.hayInput, 15_000);
check("la lección arranca DIRECTA en el tema de la tarea, sin el selector", !estado.selectorDeTemas, JSON.stringify(estado));
check("no se ofrece 'Cambiar de tema' con una tarea en curso", !estado.cambiarDeTema);
check(
  "el contador arranca en 'Ejercicio 1 de 2'",
  estado.contador?.actual === 1 && estado.contador?.total === 2,
  JSON.stringify(estado.contador),
);

// Primer ejercicio.
estado = await esperar((e) => e.hayInput && e.preguntaLatex, 15_000);
check("aparece el primer ejercicio con su enunciado", Boolean(estado.preguntaLatex), JSON.stringify(estado));
const r1 = resolverPregunta(estado.preguntaLatex);
if (r1 != null) {
  await pagina.locator("input[placeholder*='respuesta' i]").fill(r1);
  await pagina.getByRole("button", { name: /Responder/ }).click();
}

// El contador pasa a "2 de 2" (o ya se completó, si el motor fue más rápido).
estado = await esperar((e) => e.contador?.actual === 2 || e.tareaCompletada, 20_000);
check(
  "tras el primer ejercicio, el contador pasa a 'Ejercicio 2 de 2'",
  estado.contador?.actual === 2 || estado.tareaCompletada,
  JSON.stringify(estado),
);

// Un ejercicio resuelto no trae el siguiente solo: como en la lección libre,
// hace falta pedirlo —"Dame otro ejemplo" y los demás botones de apoyo siguen
// ahí mientras no se llegue al cupo—. Lo que acota la tarea es el TOPE, no
// que cada ejercicio aparezca sin que nadie lo pida.
if (!estado.tareaCompletada) {
  await pagina.getByRole("button", { name: /Dame otro ejemplo/ }).click();
  estado = await esperar((e) => e.hayInput && e.preguntaLatex, 15_000);
  const r2 = resolverPregunta(estado.preguntaLatex);
  if (r2 != null) {
    await pagina.locator("input[placeholder*='respuesta' i]").fill(r2);
    await pagina.getByRole("button", { name: /Responder/ }).click();
  }
}

estado = await esperar((e) => e.tareaCompletada, 20_000);
check("al resolver el cupo entero aparece la pantalla de cierre", estado.tareaCompletada, JSON.stringify(estado));
// La tarjeta aparece en cuanto se completa el cupo, ANTES de que termine el
// POST a /entregar ("Registrando tu entrega…"): la nota se pinta un instante
// después, cuando esa petición responde.
estado = await esperar((e) => e.nota != null, 10_000);
check("…con una nota de 100/100 (los dos ejercicios, correctos)", estado.nota === "100", `nota=${estado.nota}`);
check("la consola del navegador no soltó ningún error", erroresConsola.length === 0, erroresConsola.join(" | "));

// La entrega quedó registrada de verdad, no sólo en pantalla.
const rTareasAlumno = await apiAlumno("/api/estudiante/tareas");
const tareasAlumno = await rTareasAlumno.json().catch(() => ({}));
const laSuya = (tareasAlumno?.tareas ?? []).find((t) => t.id === tarea.tarea.id);
check(
  "la entrega quedó registrada en el servidor: entregada, con nota 100",
  laSuya?.estado === "entregada" && laSuya?.puntaje === 100,
  JSON.stringify(laSuya),
);

await navegador.close();
salir();
