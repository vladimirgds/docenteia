// LA VOZ DE LA LECCIÓN SALE DEL ENDPOINT, NO DEL NAVEGADOR
//
// El cliente lo pidió con estas palabras: «asegura que aula.tsx y
// pizarra-animada.tsx reproduzcan directamente el stream de audio retornado por
// el endpoint de voz neuronal (/api/voz con Google Cloud TTS / ElevenLabs)
// mediante un elemento <audio> o buffer de audio, desactivando la síntesis
// local del navegador».
//
// Esta batería lo comprueba EN CHROME, con una clase de verdad y el endpoint
// respondiendo audio (se interpone un proveedor de mentira, para no gastar
// cuota ni depender de una clave):
//
//   1. la clase pide el audio a /api/voz —una petición por frase—;
//   2. lo reproduce en un <audio>, que es lo que suena;
//   3. `window.speechSynthesis.speak` NO se llama ni una sola vez;
//   4. la pizarra sigue sincronizada: el foco se enciende cuando el audio
//      empieza a sonar, no cuando se encola;
//   5. y la interfaz dice qué voz está sonando.
//
// Y la otra mitad del trato, con el endpoint apagado (503): la clase no se
// queda muda, vuelve a la voz del navegador y lo dice.
//
//   node qa/voz.mjs

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

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core"));
} catch (e) {
  console.error(`\n  ✗ Sin playwright-core no se puede comprobar la voz: ${String(e.message).split("\n")[0]}\n`);
  process.exit(1);
}
if (!CHROME) {
  console.error("\n  ✗ No se ha encontrado Chrome ni Edge.\n");
  process.exit(1);
}
await exigirServidor();

const url = new URL(BASE);

/**
 * UN MP3 DE MENTIRA, PERO REPRODUCIBLE.
 *
 * No hace falta que suene a nada: hace falta que el navegador lo acepte, lo
 * reproduzca y dispare `playing` y `ended`. Un WAV de medio segundo de silencio
 * vale, y así la batería no gasta cuota de ningún proveedor.
 */
function silencio(segundos = 0.25) {
  const muestras = Math.round(44100 * segundos);
  const datos = Buffer.alloc(muestras * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + datos.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(datos.length, 40);
  return Buffer.concat([h, datos]);
}

/** La voz de prueba: una es-ES con la duración de una voz real (~35 ms por carácter). */
function instalarVoz() {
  const voz = { name: "QA es-ES", lang: "es-ES", default: true, localService: true };
  window.SpeechSynthesisUtterance = class {
    constructor(t) {
      Object.assign(this, { text: t, lang: "", voice: null, rate: 1, pitch: 1, onstart: null, onend: null, onerror: null });
    }
  };
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
      const d = Math.max(500, Math.min(4500, u.text.length * 35));
      u._a = setTimeout(() => u.onstart?.({ charIndex: 0 }), 60);
      u._b = setTimeout(() => {
        s.speaking = false;
        u.onend?.({ charIndex: u.text.length });
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

/** Cuenta cada llamada a la síntesis local, sin dejarla sonar. */
const vigilarSintesisLocal = () => {
  window.__speakLocal = 0;
  // La voz de prueba ya está puesta (se inyecta antes que esto): aquí sólo se
  // cuenta cuántas veces la lección recurre a ella, sin quitarla de en medio.
  const original = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
  if (original) {
    window.speechSynthesis.speak = (u) => {
      window.__speakLocal++;
      original(u);
    };
  }
  // Y se anota cada <audio> que se pone a sonar, con su origen.
  window.__audios = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    window.__audios.push(String(this.src || "").slice(0, 60));
    return play.apply(this, args);
  };
};

async function abrirClase(navegador, { rutaVoz }) {
  const correo = `qa.voz.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@mentoriamath.local`;
  const clave = "Alumno-2026";
  const alta = await registrarAlumno(BASE, { email: correo, password: clave, nombre: "QA Voz" });
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
  await ctx.addCookies(
    sesion.split(";").map((par) => {
      const [name, ...r] = par.trim().split("=");
      return { name, value: r.join("="), domain: url.hostname, path: "/", httpOnly: false, secure: false };
    }),
  );
  // Primero la voz de prueba —Chrome sin ventana no trae ninguna instalada— y
  // encima el vigilante, que cuenta las veces que la lección la usa.
  await ctx.addInitScript(instalarVoz);
  await ctx.addInitScript(vigilarSintesisLocal);
  // EL PROVEEDOR DE MENTIRA. Se interpone aquí, en el navegador, para no tocar
  // el servidor ni necesitar una clave de Google o de ElevenLabs.
  const peticiones = [];
  await ctx.route("**/api/voz", async (ruta) => {
    const req = ruta.request();
    peticiones.push({ metodo: req.method(), cuerpo: req.postData() ?? "" });
    if (rutaVoz === "apagada") {
      await ruta.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ disponible: false, motivo: "sin_configurar" }) });
      return;
    }
    if (req.method() === "GET") {
      await ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ disponible: true, proveedor: "google", voz: "es-US-Neural2-B" }) });
      return;
    }
    await ruta.fulfill({ status: 200, contentType: "audio/wav", body: silencio() });
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.goto(`${BASE}/estudiante/leccion`, { waitUntil: "networkidle" });
  const temas = await p.locator(".text-lg").allTextContents();
  const i = Math.max(0, temas.findIndex((t) => /lineal/i.test(t)));
  await p.getByRole("button", { name: /Empezar|Desde el principio/ }).nth(i).click();
  return { p, ctx, peticiones, errores };
}

const navegador = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });

// ── 1. CON VOZ NEURONAL: suena el endpoint y NO el navegador ─────────────────
{
  console.log("\n── Con el endpoint de voz respondiendo audio ──");
  const { p, ctx, peticiones, errores } = await abrirClase(navegador, { rutaVoz: "neural" });
  await p.waitForTimeout(9000);

  const estado = await p.evaluate(() => ({
    local: window.__speakLocal ?? -1,
    audios: window.__audios ?? [],
    etiqueta: [...document.querySelectorAll("p, span, div")].map((e) => (e.textContent ?? "").trim()).find((t) => /^voz(:| neuronal)|^sin TTS|^voz del sistema/.test(t)) ?? "",
    focos: document.querySelectorAll(".pz-resaltado").length,
    lineas: document.querySelectorAll(".pz-elemento").length,
  }));

  const post = peticiones.filter((x) => x.metodo === "POST");
  check("la clase pregunta al endpoint si hay voz neuronal", peticiones.some((x) => x.metodo === "GET"));
  check("y le pide el audio de cada frase", post.length >= 2, `${post.length} peticiones`);
  check(
    "lo que pide es el texto que dice el tutor, frase a frase",
    post.every((x) => {
      try {
        const t = JSON.parse(x.cuerpo)?.texto;
        return typeof t === "string" && t.length > 0 && t.length <= 600;
      } catch {
        return false;
      }
    }),
    post[0]?.cuerpo?.slice(0, 80),
  );
  check(
    "el audio del endpoint se reproduce en un <audio> de la página",
    estado.audios.some((src) => src.startsWith("blob:")),
    estado.audios.slice(0, 3).join(" · "),
  );
  check(
    "la síntesis local del navegador NO se usa ni una vez",
    estado.local === 0,
    `speechSynthesis.speak llamado ${estado.local} veces`,
  );
  check("la interfaz dice que suena la voz neuronal", /neuronal/.test(estado.etiqueta), estado.etiqueta);
  check("y la pizarra va sincronizada: hay marcas encendidas sobre lo escrito", estado.focos > 0 && estado.lineas > 0, `${estado.focos} marcas · ${estado.lineas} líneas`);
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  await ctx.close();
}

// ── 2. CON EL ENDPOINT APAGADO: la clase no se queda muda ────────────────────
{
  console.log("\n── Con el endpoint apagado (503), como en una instalación sin clave ──");
  const { p, ctx, peticiones, errores } = await abrirClase(navegador, { rutaVoz: "apagada" });
  await p.waitForTimeout(9000);

  const estado = await p.evaluate(() => ({
    local: window.__speakLocal ?? -1,
    etiqueta: [...document.querySelectorAll("p, span, div")].map((e) => (e.textContent ?? "").trim()).find((t) => /^voz(:| neuronal)|^sin TTS|^voz del sistema/.test(t)) ?? "",
    lineas: document.querySelectorAll(".pz-elemento").length,
  }));
  check("se pregunta una vez y no se insiste: sin clave no se pide audio", peticiones.filter((x) => x.metodo === "POST").length <= 1, `${peticiones.length} peticiones`);
  check("la clase sigue hablando con la voz del navegador", estado.local > 0, `speechSynthesis.speak llamado ${estado.local} veces`);
  check("la interfaz NO anuncia una voz neuronal que no hay", !/neuronal/.test(estado.etiqueta), estado.etiqueta);
  check("y la pizarra se escribe igual", estado.lineas > 0, `${estado.lineas} líneas`);
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  await ctx.close();
}

await navegador.close();

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");
process.exit(fallos.length > 0 ? 1 : 0);
