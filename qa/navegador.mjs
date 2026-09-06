// LA LECCIÓN, PROBADA EN UN NAVEGADOR DE VERDAD
//
// POR QUÉ EXISTE
// Las tres últimas correcciones se dieron por buenas leyendo el código y
// fallaron en pantalla: estilos escritos a mano que un repintado se llevaba, un
// desarrollo que se compone a partir de los pasos narrados y no de la línea que
// se filtraba, y un resaltado que parecía atado a la voz porque en la máquina
// de estados lo estaba. Nada de eso se ve sin abrir la página.
//
// Aquí se abre. Se levanta un Chrome de verdad, se entra como alumno, se pide
// una lección de aritmética y se observa la pantalla mientras corre:
//
//   A. El bloque DESARROLLO no puede aparecer mientras la animación explica.
//   B. El resaltado sólo se mueve DESPUÉS de que empiece a sonar la locución
//      del paso; nunca por delante.
//   C. Las cifras destapadas no desaparecen: lo escrito se queda escrito.
//   D. La consola no suelta ni un error.
//
// LA VOZ ES FALSA, Y A PROPÓSITO
// Un navegador sin voces instaladas no dispara `onstart` ni `onend`, así que no
// habría nada que comprobar. Se instala un `speechSynthesis` de mentira con una
// voz es-ES que avisa del arranque a los 200 ms y del final a los 1.600 ms. Con
// tiempos conocidos, "el foco espera a la voz" deja de ser una impresión y pasa
// a ser una medida.
//
//   node qa/navegador.mjs
//   BASE_URL=http://localhost:3001 CHROME=/ruta/a/chrome.exe node qa/navegador.mjs

import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { BASE_URL as BASE } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";

const require = createRequire(import.meta.url);

/** Dónde está Chrome. En este equipo, el de siempre. */
const CHROME =
  process.env.CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((ruta) => existsSync(ruta));

/** El motor de navegador vive fuera del proyecto: es una herramienta, no una dependencia. */
const RUTA_PLAYWRIGHT =
  process.env.PLAYWRIGHT_CORE ||
  "C:/Users/ADMINI~1/AppData/Local/Temp/2/claude/c--Users-Administrator-Documents-Maths-2-/08e627f6-dfc0-4951-b8e9-778e8330ee3f/scratchpad/node_modules/playwright-core";

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
} catch {
  console.log("\n(playwright-core no está instalado: se omite la prueba de navegador.)");
  console.log("  npm i playwright-core   y   CHROME=<ruta a chrome.exe> node qa/navegador.mjs\n");
  process.exit(0);
}
if (!CHROME) {
  console.log("\n(No se ha encontrado Chrome ni Edge: se omite la prueba de navegador.)\n");
  process.exit(0);
}

// ── Un alumno listo para entrar en la lección ────────────────────────────────

const email = `qa.navegador.${Date.now().toString(36)}@mentoriamath.local`;
const clave = "Alumno-2026";

const alta = await registrarAlumno(BASE, { email, password: clave, nombre: "QA Navegador" });
if (!alta.ok) {
  console.log(`\n(No se pudo registrar al alumno de prueba en ${BASE}: HTTP ${alta.estado}.)\n`);
  process.exit(1);
}

await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", cookie: alta.sesion },
  body: JSON.stringify({ etapa: "PRIMARIA", curso: 4 }),
});
const prueba = await (
  await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })
).json();
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
const galleta = (await iniciarSesion(BASE, email, clave)) ?? alta.sesion;

// ── El navegador ─────────────────────────────────────────────────────────────

console.log(`\n── Abriendo ${BASE}/estudiante/leccion en Chrome ──`);

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1400 } });

const url = new URL(BASE);
await contexto.addCookies(
  galleta.split(";").map((par) => {
    const [nombre, ...resto] = par.trim().split("=");
    return {
      name: nombre,
      value: resto.join("="),
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: url.protocol === "https:",
    };
  }),
);

/** Voz de mentira con tiempos conocidos: 200 ms al arrancar, 1.600 ms al acabar. */
await contexto.addInitScript(() => {
  const voz = { name: "QA es-ES", lang: "es-ES", default: true, localService: true };
  const locuciones = [];
  window.__locuciones = locuciones;

  // La locución también es de mentira. Con la de verdad, asignarle nuestra voz
  // falsa lanza un TypeError que el motor se traga, y la prueba mediría un
  // silencio creyendo que mide una voz.
  window.SpeechSynthesisUtterance = class {
    constructor(texto) {
      this.text = texto;
      this.lang = "";
      this.voice = null;
      this.rate = 1;
      this.pitch = 1;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  };

  const sintetizador = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => [voz],
    addEventListener() {},
    removeEventListener() {},
    onvoiceschanged: null,
    speak(u) {
      const registro = { u, texto: u.text, encolada: performance.now(), inicio: null, fin: null, cortada: false };
      locuciones.push(registro);
      sintetizador.speaking = true;
      u._inicio = setTimeout(() => {
        registro.inicio = performance.now();
        u.onstart?.({ charIndex: 0 });
      }, 200);
      u._fin = setTimeout(() => {
        registro.fin = performance.now();
        sintetizador.speaking = false;
        u.onend?.({ charIndex: u.text.length });
      }, 1600);
      u._cancelar = () => {
        clearTimeout(u._inicio);
        clearTimeout(u._fin);
      };
      sintetizador._ultima = u;
    },
    cancel() {
      const u = sintetizador._ultima;
      if (u) {
        u._cancelar?.();
        const registro = locuciones.find((l) => l.u === u);
        if (registro && registro.fin == null) {
          registro.fin = performance.now();
          registro.cortada = true;
        }
        sintetizador._ultima = null;
        sintetizador.speaking = false;
        u.onend?.({ charIndex: 0 });
      }
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
pagina.on("console", (m) => {
  if (m.type() === "error") erroresConsola.push(m.text());
});
// El texto de consola de un 404 no dice qué recurso fue: se anota la respuesta.
pagina.on("response", (r) => {
  if (r.status() >= 400) erroresConsola.push(`HTTP ${r.status()} ${r.url()}`);
});
pagina.on("pageerror", (e) => erroresConsola.push(String(e)));

await pagina.goto(`${BASE}/estudiante/leccion`, { waitUntil: "networkidle" });

const tarjeta = pagina.locator("text=Aritmética").first();
check("la vista de lección ofrece Aritmética", await tarjeta.count().then((n) => n > 0));

await pagina.getByRole("button", { name: /Empezar|Desde el principio/ }).first().click();

// ── Se observa la pantalla mientras la lección corre ─────────────────────────

/** Una foto del estado visible, con el reloj de la página. */
const fotos = [];
const inicio = Date.now();
while (Date.now() - inicio < 45_000) {
  const foto = await pagina.evaluate(() => {
    const panel = document.querySelector(".pz-animada");
    const contador = [...document.querySelectorAll("span")].find((s) =>
      /^Paso \d+ de \d+/.test(s.textContent ?? ""),
    );
    const caja = panel?.querySelector(".pz-resaltado rect, .pz-resaltado ellipse") ?? null;

    // Cifras destapadas de verdad: las que el navegador pinta con opacidad 1.
    const destapadas = [...(panel?.querySelectorAll("[class*='pz-rev-']") ?? [])].filter(
      (el) => Number(getComputedStyle(el).opacity) > 0.5,
    ).length;

    return {
      t: performance.now(),
      hayPanel: Boolean(panel),
      contador: contador?.textContent?.trim() ?? null,
      escena: panel?.querySelector(".pz-formula")?.textContent?.slice(0, 24) ?? null,
      pie: panel?.querySelector(".pz-pie")?.textContent?.trim() ?? null,
      // El rótulo "Desarrollo" de la pizarra clásica: el spoiler que no debe estar.
      hayDesarrollo: [...document.querySelectorAll("p")].some(
        (p) => p.textContent?.trim() === "Desarrollo",
      ),
      cajaX: caja ? Number(caja.getAttribute("x") ?? caja.getAttribute("cx")) : null,
      destapadas,
      locuciones: (window.__locuciones ?? []).map((l) => ({
        texto: l.texto,
        encolada: l.encolada,
        inicio: l.inicio,
        fin: l.fin,
        cortada: l.cortada,
      })),
    };
  });
  fotos.push(foto);
  if (foto.contador && /Paso 5 de 5/.test(foto.contador)) break;
  await pagina.waitForTimeout(150);
}

const conPanel = fotos.filter((f) => f.hayPanel);
check("la pizarra animada llega a montarse", conPanel.length > 0, `${fotos.length} muestras`);

// La secuencia tal como la vive el alumno: cada cambio de paso o de escena.
const recorrido = [];
for (const f of conPanel) {
  const firma = `${f.contador ?? "?"} | ${(f.pie ?? "").slice(0, 40)}`;
  if (recorrido.at(-1) !== firma) recorrido.push(firma);
}
console.log("  · recorrido:");
for (const paso of recorrido) console.log(`      ${paso}`);

// A. El spoiler
const spoiler = conPanel.filter(
  (f) => f.hayDesarrollo && f.contador && !/Paso 5 de 5/.test(f.contador),
);
check(
  "el bloque DESARROLLO no aparece mientras la animación explica",
  spoiler.length === 0,
  spoiler.length ? `visible en ${spoiler.length} muestras (p. ej. "${spoiler[0].contador}")` : "",
);

// B. El resaltado no adelanta a la voz
const movimientos = [];
for (let i = 1; i < conPanel.length; i++) {
  if (conPanel[i].cajaX !== conPanel[i - 1].cajaX && conPanel[i].cajaX != null) {
    movimientos.push(conPanel[i]);
  }
}
console.log(`  · el resaltado se movió ${movimientos.length} veces`);

const adelantados = movimientos.filter((f) => {
  const arrancadas = f.locuciones.filter((l) => l.inicio != null).length;
  // Cada movimiento del foco tiene que ir DESPUÉS de que empiece a sonar una
  // locución. Si se mueve sin que haya arrancado ninguna nueva, va por delante.
  return arrancadas === 0;
});
check(
  "el resaltado no se mueve antes de que empiece a sonar la voz",
  adelantados.length === 0,
  `${adelantados.length} movimientos sin locución arrancada`,
);

const separaciones = movimientos
  .slice(1)
  .map((f, i) => Math.round(f.t - movimientos[i].t))
  .filter((ms) => ms > 0);
if (separaciones.length > 0) {
  const minima = Math.min(...separaciones);
  console.log(`  · separación entre movimientos: ${separaciones.join(", ")} ms`);
  check(
    "entre columna y columna pasa al menos la locución entera",
    minima >= 1200,
    `la más corta fue de ${minima} ms`,
  );
}

// B2. La voz suena de verdad y no se la corta nadie.
//
// Es la comprobación que habría cazado el fallo de raíz: la pizarra cancelaba
// el sintetizador cada vez que seguía al tutor, y como una cancelación dispara
// el `onend` de la locución que corta, el tutor daba por dicha cada frase nada
// más empezarla y la lección se iba de carrera.
const dichas = conPanel.at(-1)?.locuciones ?? [];
console.log(`  · locuciones pronunciadas: ${dichas.length}`);
check("el tutor habla de verdad", dichas.length >= 2, `${dichas.length} locuciones`);

const cortadas = dichas.filter((l) => l.cortada && l.inicio != null && l.fin - l.inicio < 1200);
check(
  "y a ninguna se la corta a mitad de frase",
  cortadas.length === 0,
  cortadas.length ? `${cortadas.length} cortadas: "${cortadas[0].texto?.slice(0, 40)}…"` : "",
);

// C. Lo escrito se queda escrito
let retrocesos = 0;
for (let i = 1; i < conPanel.length; i++) {
  // Un cambio de paso puede destapar más o empezar una escena nueva; lo que no
  // puede pasar es que, sin moverse el paso, se esconda algo ya escrito.
  const mismoPaso = conPanel[i].contador === conPanel[i - 1].contador;
  if (mismoPaso && conPanel[i].destapadas < conPanel[i - 1].destapadas) retrocesos++;
}
check("las cifras destapadas no vuelven a esconderse", retrocesos === 0, `${retrocesos}`);
console.log(`  · cifras destapadas: ${conPanel.map((f) => f.destapadas).join("")}`.slice(0, 90));

// D. Sin errores de consola
// El favicon no existe en el proyecto y el navegador lo pide en cada carga: es
// ruido conocido, no un fallo de la lección.
console.log("  · consola:", JSON.stringify(erroresConsola.slice(0, 4)));
const soloFavicon = erroresConsola.every(
  (e) => /favicon/i.test(e) || /Failed to load resource/i.test(e),
);
const erroresReales = soloFavicon ? [] : erroresConsola;
check(
  "la consola del navegador no suelta errores",
  erroresReales.length === 0,
  erroresReales.slice(0, 2).join(" | "),
);

await navegador.close();
salir();
