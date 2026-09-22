// LOS MANDOS DE LA CLASE Y LOS ESTADOS DEL AVATAR, EN UN CHROME DE VERDAD
//
// El pliego del Hito 2 pide dos cosas que hasta ahora sólo se comprobaban por
// dentro —leyendo el código o simulando el reproductor en Node—:
//
//   · «Controles: Pausar, Reanudar, Repetir paso, Avanzar manualmente».
//     De los cuatro, la batería de Chrome sólo llegaba a pulsar Pausar y
//     Reanudar. Que "Avanzar" avance y que "Repetir paso" repita no lo miraba
//     nadie en una clase de verdad.
//   · «Avatar con IDLE, EXPLICANDO, CELEBRANDO, APOYO y PENSANDO».
//     La máquina de estados estaba comprobada como función; que el avatar
//     CAMBIE de estado durante una clase —explicando, al preguntar, al acertar—
//     no se había visto nunca desde fuera.
//
// Esto lo comprueba dando una clase entera: se escucha lo que dice el tutor
// (interceptando el sintetizador), se pulsan los cuatro mandos y se anota el
// estado del avatar en cada momento.
//
//   node qa/mandos.mjs

import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { resolverEjercicio } from "../lib/leccion/correccion.ts";
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

let ok = 0;
const fallos = [];
const check = (nombre, condicion, detalle = "") => {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ""}`);
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
};

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core"));
} catch (e) {
  console.error(`\n  ✗ Sin playwright-core no se pueden comprobar los mandos: ${String(e.message).split("\n")[0]}\n`);
  process.exit(1);
}
if (!CHROME) {
  console.error("\n  ✗ No se ha encontrado Chrome ni Edge.\n");
  process.exit(1);
}
await exigirServidor();


/** La voz de prueba: una es-ES con la duración de una voz real. */
function instalarVoz() {
  const voz = { name: "QA es-ES", lang: "es-ES", default: true, localService: true };
  window.SpeechSynthesisUtterance = class {
    constructor(t) {
      Object.assign(this, { text: t, lang: "", voice: null, rate: 1, pitch: 1, onstart: null, onend: null, onerror: null });
    }
  };
  // Lo que se va diciendo, en orden: es la única forma de comprobar desde fuera
  // que "Repetir paso" repite y que al pausar deja de hablar.
  window.__dicho = [];
  const s = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => [voz],
    addEventListener() {},
    removeEventListener() {},
    onvoiceschanged: null,
    speak(u) {
      s.speaking = true;
      window.__dicho.push(String(u.text ?? ""));
      const d = Math.max(400, Math.min(2500, String(u.text ?? "").length * 22));
      u._a = setTimeout(() => u.onstart?.({ charIndex: 0 }), 40);
      u._b = setTimeout(() => {
        s.speaking = false;
        u.onend?.({ charIndex: String(u.text ?? "").length });
      }, d);
      u._c = () => {
        clearTimeout(u._a);
        clearTimeout(u._b);
      };
      s._u = u;
    },
    cancel() {
      const u = s._u;
      if (u) {
        u._c?.();
        s._u = null;
        s.speaking = false;
        u.onend?.({ charIndex: 0 });
      }
    },
    pause() {},
    resume() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: s, configurable: true });
}

/** Lo que se ve desde fuera de la clase, en un vistazo. */
function instalarMirador() {
  window.__mirar = () => {
    const activo = document.querySelector('.pz-elemento[data-estado="activa"]');
    const pie = activo?.querySelector(".pz-pie");
    return {
      dicho: window.__dicho ?? [],
      avatar: document.querySelector("svg[data-estado]")?.getAttribute("data-estado") ?? "",
      rotulo: (document.querySelector("svg[data-estado]")?.parentElement?.textContent ?? "").trim().slice(0, 40),
      // Por dónde va la pizarra: qué línea está activa y qué dice su pie.
      lineaActiva: (activo?.textContent ?? "").replace(/\s+/g, "").slice(0, 60),
      pie: (pie?.textContent ?? "").trim(),
      marcas: document.querySelectorAll(".pz-resaltado").length,
      lineas: document.querySelectorAll(".pz-elemento").length,
      pregunta: Boolean(document.querySelector(".pz-pregunta")),
      veredicto: (document.querySelector(".pz-veredicto")?.textContent ?? "").trim(),
    };
  };
}

async function abrirClase(navegador) {
  const correo = `qa.mandos.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@mentoriamath.local`;
  const clave = "Alumno-2026";
  const alta = await registrarAlumno(BASE, { email: correo, password: clave, nombre: "QA Mandos" });
  await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: alta.sesion },
    body: JSON.stringify({ etapa: "SECUNDARIA", curso: 2 }),
  });
  const diag = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })).json();
  await fetch(`${BASE}/api/diagnostico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: alta.sesion },
    body: JSON.stringify({
      respuestas: (diag.preguntas ?? []).map((p) => ({ preguntaId: p.id, respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0" })),
    }),
  });
  const sesion = (await iniciarSesion(BASE, correo, clave)) ?? alta.sesion;
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
  // La cookie se declara POR URL, no por dominio: asi vale igual en
  // http://localhost que en https://..., donde el nombre puede llevar el
  // prefijo `__Secure-` y exige `secure: true`. Con el dominio a pelo, Chrome
  // rechazaba la sesion al apuntar la bateria al despliegue de verdad.
  await ctx.addCookies(
    sesion.split(";").map((par) => {
      const [name, ...r] = par.trim().split("=");
      return { name, value: r.join("="), url: BASE };
    }),
  );
  await ctx.addInitScript(instalarVoz);
  await ctx.addInitScript(instalarMirador);
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  await p.goto(`${BASE}/estudiante/leccion`, { waitUntil: "networkidle" });
  const temas = await p.locator(".text-lg").allTextContents();
  const i = Math.max(0, temas.findIndex((t) => /lineal/i.test(t)));
  await p.getByRole("button", { name: /Empezar|Desde el principio/ }).nth(i).click();
  return { p, ctx, errores };
}

const mirar = (p) => p.evaluate(() => window.__mirar());
const pulsar = async (p, nombre) => {
  const b = p.getByRole("button", { name: nombre }).first();
  if (!(await b.count())) return false;
  await b.click();
  return true;
};
/** Un mando de la botonera de la pizarra (la que gobierna los pasos). */
const pulsarEnLaPizarra = async (p, texto) => {
  const b = p.locator(".pz-mandos button", { hasText: texto }).first();
  if (!(await b.count())) return false;
  await b.click();
  return true;
};

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
const { p, ctx, errores } = await abrirClase(navegador);

// Estados del avatar, anotados durante toda la clase.
const vistos = new Set();
const anotar = async () => {
  const m = await mirar(p);
  if (m.avatar) vistos.add(m.avatar);
  return m;
};

console.log("\n── La clase arranca ──");
let m = await anotar();
for (let i = 0; i < 40 && m.dicho.length < 2; i++) {
  await p.waitForTimeout(250);
  m = await anotar();
}
check("la clase empieza a hablar sola", m.dicho.length >= 1, `${m.dicho.length} locuciones`);
check("y el avatar está explicando", vistos.has("EXPLICANDO"), [...vistos].join(", "));

// LOS MANDOS DE PASO VIVEN EN LA PIZARRA ANIMADA, así que se espera a que haya
// algo animado que gobernar: en el concepto, que es prosa, no hay pasos que
// avanzar ni que repetir. La clase entera sí se pausa y se reanuda desde la
// tarjeta del avatar en cualquier momento, y eso se comprueba igual.
let conPanel = false;
for (let i = 0; i < 160 && !conPanel; i++) {
  conPanel = await p.evaluate(
    () => Boolean(document.querySelector(".pz-mandos")) && document.querySelectorAll(".pz-elemento").length > 0,
  );
  if (!conPanel) await p.waitForTimeout(500);
  await anotar();
}
check("la pizarra animada ofrece su botonera de pasos", conPanel);
const mandos = await p.evaluate(() =>
  [...document.querySelectorAll(".pz-mandos button")].map(
    (b) => (b.textContent ?? "").trim() || b.getAttribute("aria-label") || "",
  ),
);
check(
  "y están los mandos del pliego: pausar, repetir paso y avanzar",
  ["Pausa", "Repetir paso", "Avanzar"].every((t) => mandos.some((x) => x.includes(t))),
  mandos.join(" · "),
);

// ── 1. PAUSAR: deja de hablar y deja de avanzar ──────────────────────────────
console.log("\n── Pausar ──");
const antesDePausar = (await mirar(p)).dicho.length;
const sePauso = (await pulsar(p, /^Pausa$/)) || (await pulsar(p, /^Pausar$/));
check("el mando «Pausar» existe y se puede pulsar", sePauso);
await p.waitForTimeout(2500);
const enPausa = await anotar();
check(
  "al pausar, la clase deja de hablar",
  enPausa.dicho.length <= antesDePausar + 1,
  `${antesDePausar} → ${enPausa.dicho.length} locuciones`,
);

// ── 2. AVANZAR: adelanta un paso sin esperar a la voz ────────────────────────
console.log("\n── Avanzar ──");
const antesDeAvanzar = await mirar(p);
const avanzo = await pulsarEnLaPizarra(p, "Avanzar");
check("el mando «Avanzar» existe y se puede pulsar", avanzo);
await p.waitForTimeout(900);
const trasAvanzar = await anotar();
check(
  "«Avanzar» mueve la clase un paso: cambia lo resaltado o la línea activa",
  trasAvanzar.pie !== antesDeAvanzar.pie ||
    trasAvanzar.lineaActiva !== antesDeAvanzar.lineaActiva ||
    trasAvanzar.marcas !== antesDeAvanzar.marcas,
  `pie «${antesDeAvanzar.pie.slice(0, 30)}» → «${trasAvanzar.pie.slice(0, 30)}» · marcas ${antesDeAvanzar.marcas} → ${trasAvanzar.marcas}`,
);

// ── 3. REPETIR PASO: vuelve a decir lo mismo ─────────────────────────────────
console.log("\n── Repetir paso ──");
const antesDeRepetir = await mirar(p);
const repitio = await pulsarEnLaPizarra(p, "Repetir paso");
check("el mando «Repetir paso» existe y se puede pulsar", repitio);
let trasRepetir = antesDeRepetir;
for (let i = 0; i < 24 && trasRepetir.dicho.length <= antesDeRepetir.dicho.length; i++) {
  await p.waitForTimeout(250);
  trasRepetir = await anotar();
}
check(
  "«Repetir paso» vuelve a contar el paso: se oye otra vez",
  trasRepetir.dicho.length > antesDeRepetir.dicho.length,
  `${antesDeRepetir.dicho.length} → ${trasRepetir.dicho.length} locuciones`,
);

// ── 4. REANUDAR: la clase sigue sola ─────────────────────────────────────────
console.log("\n── Reanudar ──");
const antesDeReanudar = await mirar(p);
const reanudo = await pulsar(p, /^Reanudar$/);
check("el mando «Reanudar» existe y se puede pulsar", reanudo);
let trasReanudar = antesDeReanudar;
for (let i = 0; i < 40 && trasReanudar.dicho.length <= antesDeReanudar.dicho.length + 1; i++) {
  await p.waitForTimeout(300);
  trasReanudar = await anotar();
}
check(
  "al reanudar, la clase sigue hablando sola",
  trasReanudar.dicho.length > antesDeReanudar.dicho.length + 1,
  `${antesDeReanudar.dicho.length} → ${trasReanudar.dicho.length} locuciones`,
);

// ── 5. LOS ESTADOS DEL AVATAR, EN LA CLASE ───────────────────────────────────
console.log("\n── El avatar, hasta la pregunta y la respuesta ──");
let conPregunta = null;
for (let i = 0; i < 240; i++) {
  const actual = await anotar();
  if (actual.pregunta) {
    conPregunta = actual;
    break;
  }
  await p.waitForTimeout(500);
}
check("la clase llega a preguntar al alumno", Boolean(conPregunta));
if (conPregunta) {
  check(
    "al preguntar, el avatar pasa a APOYO y su rótulo dice que le toca al alumno",
    conPregunta.avatar === "APOYO" && /Te toca a ti/.test(conPregunta.rotulo),
    `${conPregunta.avatar} · «${conPregunta.rotulo}»`,
  );
  check(
    "y el tutor lo ha dicho en voz alta",
    conPregunta.dicho.some((t) => /te toca a ti/i.test(t)),
    conPregunta.dicho.slice(-2).join(" | ").slice(0, 90),
  );

  // Se contesta bien, para ver al avatar celebrar.
  const enunciado = await p.evaluate(
    () => document.querySelector(".pz-encabezado-ejercicio")?.getAttribute("data-enunciado") ?? "",
  );
  const respuesta = resolverEjercicio(enunciado, "ecuaciones lineales");
  await p.locator("input[placeholder*='respuesta' i]").fill(String(respuesta ?? "0"));
  await p.getByRole("button", { name: /Responder/ }).click();
  let trasResponder = null;
  for (let i = 0; i < 120; i++) {
    trasResponder = await anotar();
    if (/Correcto/i.test(trasResponder.veredicto)) break;
    await p.waitForTimeout(250);
  }
  check(
    "la respuesta correcta se corrige como correcta",
    /Correcto/i.test(trasResponder?.veredicto ?? ""),
    `${enunciado} → ${respuesta} («${trasResponder?.veredicto ?? ""}»)`,
  );
  check("y el avatar celebra", vistos.has("CELEBRANDO"), [...vistos].join(", "));
}

check(
  "a lo largo de la clase el avatar cambia de estado (no se queda clavado)",
  vistos.size >= 3,
  [...vistos].join(", "),
);
check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));

await ctx.close();
await navegador.close();

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");
process.exitCode = fallos.length > 0 ? 1 : 0;
