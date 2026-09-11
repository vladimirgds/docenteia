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

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
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

/**
 * El motor de navegador es `playwright-core`: el DRIVER, sin navegadores dentro.
 *
 * Se declara en devDependencies —y no en una ruta suelta de un equipo— porque
 * una prueba que sólo corre en la máquina de quien la escribió no es una
 * prueba: es una anécdota. `playwright-core` NO descarga Chromium (eso es
 * `playwright` a secas): conduce el Chrome que ya está instalado, que es justo
 * lo que aquí se quiere. Se sigue admitiendo PLAYWRIGHT_CORE para apuntar a una
 * copia externa.
 */
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

/**
 * UNA PRUEBA QUE NO PUEDE CORRER NO ES UNA PRUEBA QUE PASA.
 *
 * Antes, si faltaba playwright-core, esto avisaba y salía con código 0: la
 * batería figuraba como superada sin haber abierto un navegador. Y como la ruta
 * apuntaba a una carpeta temporal, bastó con que se limpiara para que la única
 * prueba que mira la pantalla de verdad dejara de ejecutarse sin que nadie lo
 * notara. Ahora la falta de driver y la falta de navegador son FALLOS, con su
 * código de salida, que es lo que `npm test` sabe leer.
 */
let chromium;
try {
  ({ chromium } = require(RUTA_PLAYWRIGHT));
} catch (e) {
  console.error("\n  ✗ No se ha podido cargar playwright-core: la lección NO se ha probado en un navegador.");
  console.error("    Instálalo con:  npm install");
  console.error("    O apunta a una copia externa:  PLAYWRIGHT_CORE=<ruta> node qa/navegador.mjs");
  console.error(`    (${String(e.message).split("\n")[0]})\n`);
  process.exit(1);
}
if (!CHROME) {
  console.error("\n  ✗ No se ha encontrado Chrome ni Edge: la lección NO se ha probado en un navegador.");
  console.error("    Indica la ruta con:  CHROME=<ruta a chrome.exe> node qa/navegador.mjs\n");
  process.exit(1);
}

// ── Un alumno listo para entrar en la lección ────────────────────────────────

const email = `qa.navegador.${Date.now().toString(36)}@mentoriamath.local`;
const clave = "Alumno-2026";

// Sin esto, no arrancar la aplicación se manifestaba como un ECONNREFUSED sin
// traducir y treinta líneas de traza, en vez de como lo que es.
await exigirServidor();

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
      // ¿Hay una locución sonando AHORA? Es la condición con la que la lección
      // decide esconder el desarrollo, así que la comprobación la necesita.
      hablando: (window.__locuciones ?? []).some((l) => l.inicio != null && l.fin == null),
      // La fase abierta, la regla que se está explicando y si su tarjeta ha
      // cedido la cuenta a la pizarra animada. Es la "cuenta estática fija en
      // una esquina" del informe del cliente.
      fase: [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim()).join(" | "),
      regla: [...document.querySelectorAll("h3")].map((h) => h.textContent?.trim()).join(" | "),
      reglaCedida: document.body.textContent?.includes("La cuenta se monta paso a paso aquí debajo"),
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
  await pagina.waitForTimeout(150);
}

const conPanel = fotos.filter((f) => f.hayPanel);
check("la pizarra animada llega a montarse", conPanel.length > 0, `${fotos.length} muestras`);

// LA CUENTA DE LA REGLA NO PUEDE QUEDARSE QUIETA EN UNA ESQUINA.
//
// El cliente lo reportó dos veces sobre la misma pantalla: en "Reglas y
// propiedades" hay una suma en columna compuesta y parada.
//
// Sólo se exige de las reglas que SON una cuenta. "Propiedad conmutativa" es
// una identidad —"a + b = b + a"—, no hay columnas que encender, y su tarjeta
// la compone con todo el derecho. Cuál de las dos toca lo decide el generador
// según lo que esté explicando, así que la comprobación mira qué regla hay en
// pantalla en lugar de dar por hecho que salió la de la llevada.
const CUENTAS = /Suma con llevada|Resta con préstamo/;
const enReglas = fotos.filter(
  (f) => /Reglas y propiedades/.test(f.fase ?? "") && CUENTAS.test(f.regla ?? ""),
);
if (enReglas.length === 0) {
  const vistas = [
    ...new Set(
      fotos
        .filter((f) => /Reglas y propiedades/.test(f.fase ?? ""))
        .map((f) => (f.regla ?? "").replace("Paso a paso animado", "").replace(/^\s*\|\s*/, "")),
    ),
  ].filter(Boolean);
  console.log(
    `  · en esta lección la fase de Reglas no explicó una cuenta en columna (${vistas.join(", ") || "sin regla en pantalla"})`,
  );
} else {
  console.log(`  · regla en pantalla: ${enReglas[0].regla}`);
  check(
    "la cuenta de la regla se anima, no se compone quieta",
    enReglas.every((f) => f.hayPanel),
    `${enReglas.filter((f) => f.hayPanel).length} de ${enReglas.length} muestras con panel`,
  );
  check(
    "y la tarjeta no compone una segunda copia mientras tanto",
    enReglas.every((f) => f.reglaCedida),
  );
}

// La secuencia tal como la vive el alumno: cada cambio de paso o de escena.
const recorrido = [];
for (const f of conPanel) {
  const firma = `${f.contador ?? "?"} | ${(f.pie ?? "").slice(0, 40)}`;
  if (recorrido.at(-1) !== firma) recorrido.push(firma);
}
console.log("  · recorrido:");
for (const paso of recorrido) console.log(`      ${paso}`);

/**
 * ¿La animación ha llegado a su último paso?
 *
 * Antes esto se preguntaba con /Paso 5 de 5/, que son los pasos que tiene la
 * cuenta de tres cifras del ejemplo grande. Una cuenta de una cifra tiene tres,
 * y al llegar a "Paso 3 de 3" —ya terminada, con su resultado rodeado— el
 * bloque Desarrollo aparece con todo el derecho: la comprobación lo denunciaba
 * como spoiler. Se pregunta por la forma, no por un número escrito a mano.
 */
function enElUltimoPaso(contador) {
  const m = /^Paso (\d+) de (\d+)/.exec(contador ?? "");
  return Boolean(m) && m[1] === m[2];
}

// A. El spoiler
//
// LA REGLA, TAL COMO LA APLICA LA LECCIÓN: el desarrollo se esconde mientras el
// tutor EXPLICA y la animación no ha destapado todo. En cuanto la animación
// termina —o la lección calla— el desarrollo vuelve entero, que es lo que el
// alumno necesita para repasar.
//
// Sin la condición de que el tutor esté hablando, esto acusaba un caso legítimo:
// al pasar del ejemplo a la práctica la animación entra en la cuenta nueva por
// su paso 1, y durante la pausa entre locuciones sigue compuesto el desarrollo
// de la cuenta ANTERIOR —ya explicada entera—. Eso no destripa nada: lo que no
// puede pasar es que el desarrollo adelante lo que la animación todavía está
// explicando, y para eso hace falta que el tutor esté explicándolo.
const spoiler = conPanel.filter(
  (f) => f.hayDesarrollo && f.hablando && f.contador && !enElUltimoPaso(f.contador),
);
check(
  "el bloque DESARROLLO no aparece mientras la animación explica",
  spoiler.length === 0,
  spoiler.length ? `visible en ${spoiler.length} muestras (p. ej. "${spoiler[0].contador}")` : "",
);

// A2. LA PIZARRA NO SE ADELANTA NI SE SALTA PASOS
//
// El cliente la fotografió en "Paso 3 de 4", con la columna de las decenas ya
// resuelta, mientras el avatar apenas estaba dando la bienvenida de la fase. La
// cuenta se cuenta en orden: del reposo al primer paso, y de ahí de uno en uno.
{
  const paso = (c) => {
    const m = /^Paso (\d+) de (\d+)/.exec(c ?? "");
    return m ? { n: Number(m[1]), de: Number(m[2]), linea: (c ?? "").split("·")[1] ?? "" } : null;
  };
  const secuencia = [];
  for (const f of conPanel) {
    const p = paso(f.contador);
    if (!p) continue;
    const anterior = secuencia.at(-1);
    if (!anterior || anterior.n !== p.n || anterior.linea !== p.linea) secuencia.push(p);
  }

  const primeros = secuencia.filter((p, i) => i === 0 || secuencia[i - 1].linea !== p.linea);
  check(
    "cada cuenta empieza por su primer paso, no por en medio",
    primeros.every((p) => p.n <= 2),
    primeros.map((p) => `Paso ${p.n} de ${p.de}`).join(" · "),
  );

  const saltos = secuencia.filter(
    (p, i) => i > 0 && secuencia[i - 1].linea === p.linea && p.n - secuencia[i - 1].n > 1,
  );
  check(
    "y de ahí avanza de uno en uno, sin saltarse ninguno",
    saltos.length === 0,
    saltos.map((p) => `salta a ${p.n}`).join(" · "),
  );
}

// A3. LA NOTACIÓN NO SE DEGRADA A TEXTO PLANO
//
// "(3 * 2)/(5 * 2) = 6/10" compuesto tal cual, con asteriscos y barras. El
// cliente lo llamó sintaxis de consola, y lo es: se mira en TODA la pantalla,
// venga de la pizarra animada o de la tarjeta de desarrollo.
{
  const crudo = await pagina.evaluate(() => {
    const texto = document.body.innerText ?? "";
    const sospechas = texto.match(/\(\s*\d+\s*\*\s*\d+\s*\)\s*\/\s*\(\s*\d+\s*\*\s*\d+\s*\)/g) ?? [];
    return sospechas.slice(0, 3);
  });
  check(
    "ninguna fórmula se compone con sintaxis de consola",
    crudo.length === 0,
    crudo.join(" · "),
  );
}

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
//
// ESTA COMPROBACIÓN ERA UN COLADOR. Ignoraba todo lo que encajara en
// /Failed to load resource/, que es el texto con el que Chrome anuncia CUALQUIER
// recurso que no carga: un trozo de JavaScript que falta, una llamada a la API
// que devuelve 500 y el favicon inexistente daban exactamente el mismo mensaje.
// El escape se puso para tapar el 404 del favicon —que el proyecto no tenía— y
// de paso tapaba cualquier fallo de carga real.
//
// El favicon ya existe (`app/icon.svg`), así que no hay nada que disculpar y la
// comprobación puede ser lo que decía ser: la consola, limpia del todo.
if (erroresConsola.length > 0) {
  console.log("  · consola:");
  for (const e of erroresConsola.slice(0, 8)) console.log(`      ${e}`);
} else {
  console.log("  · consola: limpia");
}
check(
  "la consola del navegador no suelta errores",
  erroresConsola.length === 0,
  erroresConsola.slice(0, 2).join(" | "),
);

// ── Segunda escena: la cancelación de un despeje ──────────────────────────
//
// El cliente lo reportó como error matemático grave: en "2x + 6 = 16 - 6" la
// caja roja y la tachadura abarcaban "+ 6 = 16 - 6", es decir el signo igual y
// un número que no se cancela con nada. Lo único que puede quedar dentro es el
// término que se va, en su miembro. Se mide en pantalla: dónde están las cajas
// y dónde el "=".
console.log("\n── Ecuaciones lineales: la cancelación no puede tragarse el igual ──");

const emailEq = `qa.despeje.${Date.now().toString(36)}@mentoriamath.local`;
const altaEq = await registrarAlumno(BASE, { email: emailEq, password: clave, nombre: "QA Despeje" });
await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", cookie: altaEq.sesion },
  body: JSON.stringify({ etapa: "SECUNDARIA", curso: 2 }),
});
const pruebaEq = await (
  await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: altaEq.sesion } })
).json();
await fetch(`${BASE}/api/diagnostico`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: altaEq.sesion },
  body: JSON.stringify({
    respuestas: (pruebaEq.preguntas ?? []).map((p) => ({
      preguntaId: p.id,
      respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
    })),
  }),
});
const galletaEq = (await iniciarSesion(BASE, emailEq, clave)) ?? altaEq.sesion;

const ctxEq = await navegador.newContext({ viewport: { width: 1280, height: 1400 } });
await ctxEq.addCookies(
  galletaEq.split(";").map((par) => {
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
const paginaEq = await ctxEq.newPage();
await paginaEq.goto(`${BASE}/estudiante/leccion`, { waitUntil: "networkidle" });

const temas = await paginaEq.locator(".text-lg").allTextContents();
const cual = temas.findIndex((t) => /ecuaciones/i.test(t));
check("la vista ofrece Ecuaciones lineales", cual >= 0, temas.join(", "));
await paginaEq
  .getByRole("button", { name: /Empezar|Desde el principio/ })
  .nth(cual < 0 ? 0 : cual)
  .click();

let cancelacion = null;
for (let k = 0; k < 80 && !cancelacion; k++) {
  cancelacion = await paginaEq.evaluate(() => {
    const panel = document.querySelector(".pz-animada");
    if (!panel?.querySelector('.pz-resaltado[data-tipo="tachado"]')) return null;
    const caja = (n) => {
      const b = n.getBoundingClientRect();
      return { x1: Math.round(b.left), x2: Math.round(b.right) };
    };
    return {
      formula: panel.querySelector("annotation")?.textContent ?? "",
      cajas: [...panel.querySelectorAll('.pz-resaltado[data-tipo="tachado"] rect')].map(caja),
      iguales: [...panel.querySelectorAll(".pz-formula .mrel")]
        .filter((n) => n.textContent?.trim() === "=")
        .map(caja),
    };
  });
  if (!cancelacion) await paginaEq.waitForTimeout(750);
}

if (!cancelacion) {
  check("la lección llega a mostrar una cancelación", false, "no apareció en 60 s");
} else {
  // Cada caja se dibuja dos veces —fondo y trazo—, así que se agrupan por
  // posición para contar recuadros, no rectángulos.
  const distintas = [...new Set(cancelacion.cajas.map((c) => `${c.x1}-${c.x2}`))];
  console.log(`  · recuadros: ${distintas.join(" · ")}`);
  console.log(`  · signos igual: ${cancelacion.iguales.map((s) => `${s.x1}-${s.x2}`).join(" · ")}`);

  check("se dibuja un recuadro por término cancelado", distintas.length === 2, distintas.join(" · "));
  check(
    "y ningún recuadro encierra el signo igual",
    !cancelacion.cajas.some((c) => cancelacion.iguales.some((s) => s.x1 >= c.x1 && s.x2 <= c.x2)),
    JSON.stringify(cancelacion.cajas),
  );
}

// ── Fracciones: el paso intermedio tiene que estar EN LA PIZARRA ─────────────
//
// Es la queja que se repitió tres revisiones seguidas: "la experiencia sigue
// viéndose como una imagen estática con audio de fondo". Y era literal. El
// generador escribe la equivalencia con el producto entero —"3/5 = (3 * 2)/(5 *
// 2) = 6/10"—, ninguna lectura del guion la reconocía, el guion salía vacío y el
// panel animado NI SE MONTABA: lo único en pantalla era la tarjeta de
// desarrollo, con la solución completa y sin un solo resaltado.
//
// Que las lecturas funcionen ya se comprueba en hito2. Aquí se comprueba lo que
// sólo se ve abriendo la página: que en una lección de fracciones de verdad el
// panel se monta, el factor sale marcado y su recuadro se dibuja.
console.log("\n── Fracciones: el paso intermedio se ve, y se ve marcado ──");

const emailFr = `qa.fracciones.${Date.now().toString(36)}@mentoriamath.local`;
const altaFr = await registrarAlumno(BASE, {
  email: emailFr,
  password: clave,
  nombre: "QA Fracciones",
});
await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", cookie: altaFr.sesion },
  body: JSON.stringify({ etapa: "PRIMARIA", curso: 6 }),
});
const pruebaFr = await (
  await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: altaFr.sesion } })
).json();
await fetch(`${BASE}/api/diagnostico`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: altaFr.sesion },
  body: JSON.stringify({
    respuestas: (pruebaFr.preguntas ?? []).map((p) => ({
      preguntaId: p.id,
      respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
    })),
  }),
});
const galletaFr = (await iniciarSesion(BASE, emailFr, clave)) ?? altaFr.sesion;

const ctxFr = await navegador.newContext({ viewport: { width: 1280, height: 1400 } });
await ctxFr.addCookies(
  galletaFr.split(";").map((par) => {
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
const paginaFr = await ctxFr.newPage();
await paginaFr.goto(`${BASE}/estudiante/leccion`, { waitUntil: "networkidle" });

const temasFr = await paginaFr.locator(".text-lg").allTextContents();
const cualFr = temasFr.findIndex((t) => /fracci/i.test(t));
check("la vista ofrece Fracciones", cualFr >= 0, temasFr.join(", "));
await paginaFr
  .getByRole("button", { name: /Empezar|Desde el principio/ })
  .nth(cualFr < 0 ? 0 : cualFr)
  .click();

// EL ESTADO SE LIMPIA AL CAMBIAR DE PESTAÑA.
//
// Lo pidió el cliente con estas palabras: al pasar a "Reglas y propiedades" la
// pizarra mostraba la fórmula de las fracciones equivalentes mientras el
// subtítulo y la voz seguían con el ejemplo de la pizza, que es de "Concepto".
// Se vigila durante toda la lección: en ninguna muestra puede leerse el texto
// de una fase bajo el rótulo de otra.
const vigilanciaFr = [];
const desdeFr = Date.now();
while (Date.now() - desdeFr < 40_000) {
  vigilanciaFr.push(
    await paginaFr.evaluate(() => {
      const fase = [...document.querySelectorAll("h2")]
        .map((h) => h.textContent?.trim())
        .find((t) => /Concepto|Reglas y propiedades|Ejemplo|Práctica/.test(t ?? "")) ?? "";
      // Quién decidió lo que marca la pizarra animada en este momento: la
      // etiqueta que mandó el motor, o una deducción a partir del texto.
      const panel = document.querySelector(".pz-animada");
      return {
        fase,
        texto: document.body.innerText ?? "",
        origen: panel?.getAttribute("data-origen") ?? null,
        gesto: panel?.getAttribute("data-gesto") ?? null,
      };
    }),
  );
  await paginaFr.waitForTimeout(400);
}

const pizzaFueraDeSitio = vigilanciaFr.filter(
  (v) => /Reglas y propiedades/.test(v.fase) && /pizza en 4 porciones/.test(v.texto),
);
const fasesVistas = [...new Set(vigilanciaFr.map((v) => v.fase).filter(Boolean))];
console.log(`  · fases observadas: ${fasesVistas.join(" → ")}`);
check(
  "el ejemplo de Concepto no se lee bajo el rótulo de Reglas",
  pizzaFueraDeSitio.length === 0,
  `${pizzaFueraDeSitio.length} muestras`,
);


let fraccion = null;
for (let k = 0; k < 100 && !fraccion; k++) {
  fraccion = await paginaFr.evaluate(() => {
    const panel = document.querySelector(".pz-animada");
    if (!panel) return null;
    const formula = panel.querySelector(".pz-formula");
    // Las marcas del paso de fracciones: el factor de la amplificación o los
    // numeradores de la suma. Sin ellas no hay nada que resaltar.
    const marcas = [...(formula?.querySelectorAll(".pz-factor, .pz-numerador") ?? [])];
    if (marcas.length === 0) return null;
    return {
      latex: panel.querySelector("annotation")?.textContent ?? "",
      // Quién decidió lo que se marca: la etiqueta del motor o una deducción.
      origen: panel.getAttribute("data-origen"),
      gesto: panel.getAttribute("data-gesto"),
      marcas: marcas.length,
      // ¿Están coloreadas? Es lo que el cliente pidió: que se lean como una
      // etiqueta y no como texto negro con una raya encima.
      colores: [...new Set(marcas.map((m) => getComputedStyle(m).color))],
      recuadros: panel.querySelectorAll(".pz-resaltado rect, .pz-resaltado ellipse").length,
      // Lo que todavía no ha salido tiene que estar invisible de verdad.
      ocultas: [...panel.querySelectorAll("[class*='pz-rev-']")].filter(
        (el) => Number(getComputedStyle(el).opacity) < 0.5,
      ).length,
      total: panel.querySelectorAll("[class*='pz-rev-']").length,
    };
  });
  if (!fraccion) await paginaFr.waitForTimeout(750);
}

if (!fraccion) {
  check("la lección de fracciones llega a marcar un paso", false, "no apareció en 75 s");
} else {
  console.log(`  · fórmula: ${fraccion.latex.slice(0, 90)}`);
  console.log(`  · marcas: ${fraccion.marcas} · colores: ${fraccion.colores.join(" ")}`);
  console.log(`  · piezas por destapar: ${fraccion.ocultas} de ${fraccion.total}`);

  check("el paso de fracciones llega a la pizarra animada con sus marcas", fraccion.marcas >= 1);
  // EL CONTRATO DEL CLIENTE, VISTO DESDE EL NAVEGADOR: el motor manda el gesto
  // y los términos con el paso, y la pizarra dibuja lo que dice la etiqueta en
  // lugar de adivinarlo leyendo el texto.
  console.log(`  · dibujado por: ${fraccion.origen} (${fraccion.gesto})`);
  check(
    "y lo dibuja por la etiqueta que manda el motor, no por deducción",
    fraccion.origen === "etiqueta",
    `${fraccion.origen}/${fraccion.gesto}`,
  );
  check(
    "y el término marcado NO va en negro",
    fraccion.colores.every((c) => c !== "rgb(0, 0, 0)"),
    fraccion.colores.join(" "),
  );
  check("con su recuadro dibujado encima", fraccion.recuadros > 0, `${fraccion.recuadros}`);
  check(
    "y ninguna fórmula de la lección en sintaxis de consola",
    !/\(\s*\d+\s*\*\s*\d+\s*\)\s*\/\s*\(\s*\d+\s*\*\s*\d+\s*\)/.test(
      vigilanciaFr.map((v) => v.texto).join(" "),
    ),
  );
}

// "EXPLICAR REGLA", QUE ES DONDE EL CLIENTE VIO ROMPERSE LA NOTACIÓN.
//
// El botón pide una aclaración al servidor y sus líneas entran por el mismo
// sitio que las demás. Se pulsa de verdad y se mira lo que queda en pantalla.
{
  const boton = paginaFr.getByRole("button", { name: /Explicar regla/ }).first();
  if ((await boton.count()) === 0) {
    console.log('  · el botón "Explicar regla" no estaba disponible en esta lección');
  } else {
    await boton.click();
    let tras = null;
    for (let k = 0; k < 40; k++) {
      await paginaFr.waitForTimeout(750);
      tras = await paginaFr.evaluate(() => {
        const texto = document.body.innerText ?? "";
        return {
          consola: texto.match(/\(\s*\d+\s*\*\s*\d+\s*\)\s*\/\s*\(\s*\d+\s*\*\s*\d+\s*\)/g) ?? [],
          // Barras de dividir sueltas entre números: la otra cara del texto
          // plano. Una fracción compuesta por KaTeX no deja "6/10" en el texto.
          formulas: document.querySelectorAll(".katex").length,
        };
      });
      if (tras.consola.length > 0) break;
    }
    console.log(`  · fórmulas compuestas tras "Explicar regla": ${tras.formulas}`);
    check(
      'tras "Explicar regla" la notación sigue compuesta, no en crudo',
      tras.consola.length === 0,
      tras.consola.join(" · "),
    );
    check("y la pizarra sigue teniendo fórmulas", tras.formulas > 0, `${tras.formulas}`);
  }
  check(
    "y lo que aún no ha salido sigue oculto",
    fraccion.total === 0 || fraccion.ocultas > 0,
    `${fraccion.ocultas}/${fraccion.total}`,
  );
}

// ── Revisión f515a57: los cuatro flujos del cliente, de principio a fin ─────
//
// Cada uno se reproduce como lo hizo él: la lección entera, la práctica
// contestada, y los botones de apoyo pulsados en el momento en que los pulsó.
console.log("\n── Revisión f515a57: ejercicio completo, marca limpia, proyección siempre ──");

/** Voz falsa y rápida: 80 ms al arrancar, 450 ms al acabar. */
function vozRapida() {
  const voz = { name: "QA es-ES", lang: "es-ES", default: true, localService: true };
  window.SpeechSynthesisUtterance = class {
    constructor(t) {
      Object.assign(this, { text: t, lang: "", voice: null, rate: 1, pitch: 1, onstart: null, onend: null, onerror: null });
    }
  };
  const s = {
    speaking: false, paused: false, pending: false, getVoices: () => [voz],
    addEventListener() {}, removeEventListener() {}, onvoiceschanged: null,
    speak(u) {
      s.speaking = true;
      u._a = setTimeout(() => u.onstart?.({ charIndex: 0 }), 80);
      u._b = setTimeout(() => { s.speaking = false; u.onend?.({ charIndex: u.text.length }); }, 450);
      u._c = () => { clearTimeout(u._a); clearTimeout(u._b); };
      s._u = u;
    },
    cancel() { const u = s._u; if (u) { u._c?.(); s._u = null; s.speaking = false; u.onend?.({ charIndex: 0 }); } },
    pause() { s.paused = true; },
    resume() { s.paused = false; },
  };
  Object.defineProperty(window, "speechSynthesis", { value: s, configurable: true });
}

async function sesionRapida(nombre, etapa, curso) {
  const correo = `qa.${nombre}.${Date.now().toString(36)}@mentoriamath.local`;
  const alta = await registrarAlumno(BASE, { email: correo, password: clave, nombre: `QA ${nombre}` });
  await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: alta.sesion },
    body: JSON.stringify({ etapa, curso }),
  });
  const diag = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })).json();
  await fetch(`${BASE}/api/diagnostico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: alta.sesion },
    body: JSON.stringify({
      respuestas: (diag.preguntas ?? []).map((p) => ({ preguntaId: p.id, respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0" })),
    }),
  });
  const g = (await iniciarSesion(BASE, correo, clave)) ?? alta.sesion;
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 1400 } });
  await ctx.addCookies(
    g.split(";").map((par) => {
      const [name, ...r] = par.trim().split("=");
      return { name, value: r.join("="), domain: url.hostname, path: "/", httpOnly: false, secure: url.protocol === "https:" };
    }),
  );
  await ctx.addInitScript(vozRapida);
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(String(e)));
  await pagina.goto(`${BASE}/estudiante/leccion`, { waitUntil: "networkidle" });
  return { pagina, errores };
}

async function abrirTema(pagina, patron) {
  const temas = await pagina.locator(".text-lg").allTextContents();
  const i = temas.findIndex((t) => patron.test(t));
  await pagina.getByRole("button", { name: /Empezar|Desde el principio/ }).nth(Math.max(0, i)).click();
}

/** Lo que se ve de la tarjeta, la pregunta, el desarrollo y el panel. */
const estadoVisible = (pagina) =>
  pagina.evaluate(() => {
    const porRotulo = (r) => [...document.querySelectorAll("p")].find((p) => p.textContent?.trim() === r)?.parentElement;
    const input = [...document.querySelectorAll("input")].find((i) => /respuesta/i.test(i.placeholder ?? ""));
    let pregunta = null;
    for (let el = input, k = 0; el && k < 6; k++) {
      el = el.parentElement;
      const a = el?.querySelector("annotation");
      if (a) { pregunta = a.textContent; break; }
    }
    return {
      tarjeta: (porRotulo("Ejercicio")?.innerText ?? "").replace(/\s+/g, " ").trim(),
      tarjetaLatex: porRotulo("Ejercicio")?.querySelector("annotation")?.textContent ?? null,
      desarrollo: [...(porRotulo("Desarrollo")?.querySelectorAll("annotation") ?? [])].map((a) => a.textContent),
      pregunta,
      completada: /¡Lección completada!/.test(document.body.innerText ?? ""),
      proyeccion: [...document.querySelectorAll("button")].some((b) => /Modo proyección/.test(b.textContent ?? "")),
    };
  });

async function esperar(pagina, cond, ms, cada = 300) {
  const t0 = Date.now();
  let e = await estadoVisible(pagina);
  while (!cond(e) && Date.now() - t0 < ms) {
    await pagina.waitForTimeout(cada);
    e = await estadoVisible(pagina);
  }
  return e;
}

/** "19 + 45" o "\frac{3}{5} + \frac{1}{2}" → la respuesta, en su forma más simple. */
function resolverPregunta(latex) {
  const e = String(latex ?? "").replace(/\\frac\{(\d+)\}\{(\d+)\}/g, "$1/$2").replace(/\s+/g, "");
  const f = e.match(/^(\d+)\/(\d+)\+(\d+)\/(\d+)$/);
  if (f) {
    const [a, b, c, d] = f.slice(1).map(Number);
    const mcd = (x, y) => (y ? mcd(y, x % y) : x);
    const n = a * d + c * b, den = b * d, k = mcd(n, den);
    return den / k === 1 ? String(n / k) : `${n / k}/${den / k}`;
  }
  const s = e.match(/^(\d+)([+-])(\d+)$/);
  return s ? String(s[2] === "+" ? Number(s[1]) + Number(s[3]) : Number(s[1]) - Number(s[3])) : null;
}

async function contestar(pagina, estado) {
  const respuesta = resolverPregunta(estado.pregunta);
  await pagina.locator("input[placeholder*='respuesta' i]").fill(respuesta ?? "0");
  await pagina.getByRole("button", { name: /Responder/ }).click();
  return respuesta;
}

// A. ARITMÉTICA: la marca del resultado, el cierre y el "más difícil".
{
  const { pagina, errores } = await sesionRapida("revision.arit", "PRIMARIA", 6);
  await abrirTema(pagina, /aritm/i);

  // 2. La marca del resultado no puede tapar las cifras.
  let marca = null;
  for (let k = 0; k < 160 && !marca; k++) {
    marca = await pagina.evaluate(() => {
      const g = document.querySelector('.pz-animada .pz-resaltado[data-tipo="resultado"]');
      if (!g) return null;
      const svg = g.ownerSVGElement.getBoundingClientRect();
      const glifos = [...document.querySelectorAll(".pz-animada .pz-resultado, .pz-animada .pz-solucion")]
        .flatMap((el) => [el, ...el.querySelectorAll("*")])
        .filter((el) => el.childElementCount === 0 && (el.textContent ?? "").trim())
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0);
      if (glifos.length === 0) return null;
      return {
        elipses: document.querySelectorAll(".pz-animada ellipse").length,
        rayas: [...g.querySelectorAll("line")].map((l) => Number(l.getAttribute("y1"))),
        visto: g.querySelector("path.pz-visto") ? g.querySelector("path.pz-visto").getBBox().x : null,
        abajo: Math.max(...glifos.map((r) => r.bottom - svg.top)),
        derecha: Math.max(...glifos.map((r) => r.right - svg.left)),
      };
    });
    if (!marca) await pagina.waitForTimeout(250);
  }
  if (!marca) {
    check("la lección llega a marcar un resultado", false, "no apareció en 40 s");
  } else {
    console.log(`  · resultado: rayas en y=${marca.rayas.map((y) => y.toFixed(0)).join(",")} · cifras hasta y=${marca.abajo.toFixed(0)} · visto en x=${marca.visto?.toFixed(0)} · cifras hasta x=${marca.derecha.toFixed(0)}`);
    check("el resultado ya no se rodea con una elipse", marca.elipses === 0);
    check("se subraya dos veces", marca.rayas.length === 2);
    check("y las dos rayas van POR DEBAJO de las cifras, sin cruzarlas", Math.min(...marca.rayas) > marca.abajo);
    check("con el visto a la derecha del número, sin tocarlo", marca.visto != null && marca.visto > marca.derecha);
  }

  // 4a. Se contesta la práctica: la lección termina con el ejercicio cerrado.
  const antes = await esperar(pagina, (e) => Boolean(e.pregunta), 120_000);
  check("durante la práctica está el botón de Modo proyección", antes.proyeccion);
  const dada = await contestar(pagina, antes);
  const fin = await esperar(pagina, (e) => e.completada, 30_000);
  console.log(`  · práctica "${antes.pregunta}" → ${dada} · desarrollo al terminar: ${fin.desarrollo.length} línea(s)`);
  check("al acertar, el desarrollo se cierra con el resultado", fin.completada && fin.desarrollo.length > 0);
  check("y el botón de proyección sigue ahí", fin.proyeccion);

  // 1. "Más difícil": la tarjeta no puede quedarse en "Preparando el ejercicio…".
  await pagina.getByRole("button", { name: /Más difícil/ }).first().click();
  const muestras = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    muestras.push({ t: Date.now() - t0, ...(await estadoVisible(pagina)) });
    await pagina.waitForTimeout(250);
  }
  // Se deja un segundo y medio para que responda el servidor; después, nada de "Preparando".
  const congelada = muestras.filter((m) => m.t > 1500 && /Preparando el ejercicio/.test(m.tarjeta));
  check(
    '"Más difícil": la tarjeta no se queda en "Preparando el ejercicio…"',
    congelada.length === 0,
    `${congelada.length} muestras`,
  );
  const alPreguntar = await esperar(pagina, (e) => Boolean(e.pregunta), 60_000);
  // Las cifras en orden y sin separar: la tarjeta es una cuenta en columna
  // ("& 1 & 9 \\ + & 4 & 5") y la pregunta va en línea ("19 + 45").
  const numeros = (t) => (String(t ?? "").match(/\d/g) ?? []).join("");
  console.log(`  · tarjeta: "${numeros(alPreguntar.tarjetaLatex)}" · pregunta: "${numeros(alPreguntar.pregunta)}"`);
  check(
    "y la tarjeta muestra el ejercicio que se pregunta, no el ejemplo anterior",
    Boolean(alPreguntar.pregunta) && numeros(alPreguntar.tarjetaLatex).startsWith(numeros(alPreguntar.pregunta)),
  );
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
}

// B. FRACCIONES: proyección siempre, y la explicación no se come la pregunta.
{
  const { pagina, errores } = await sesionRapida("revision.frac", "PRIMARIA", 6);
  await abrirTema(pagina, /fracci/i);

  const enPractica = await esperar(pagina, (e) => Boolean(e.pregunta), 120_000);
  check("en la práctica de fracciones está el botón de Modo proyección", enPractica.proyeccion);

  // 4b. Se proyecta, y el botón para salir se ve.
  await pagina.getByRole("button", { name: /Modo proyección/ }).first().click();
  await pagina.waitForTimeout(700);
  const salir = await pagina.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Salir de proyección/.test(x.textContent ?? ""));
    if (!b) return null;
    const cs = getComputedStyle(b);
    return { fondo: cs.backgroundColor, letra: cs.color, formula: Boolean(document.querySelector(".modo-proyeccion .katex")) };
  });
  check("la proyección muestra la fórmula", Boolean(salir?.formula));
  check(
    'y el botón "Salir de proyección" se lee: su letra no es del color de su fondo',
    salir != null && salir.fondo !== salir.letra,
    salir ? `${salir.letra} sobre ${salir.fondo}` : "no hay botón",
  );
  if (salir) await pagina.getByRole("button", { name: /Salir de proyección/ }).first().click();
  await pagina.waitForTimeout(400);

  // 4a. "No entendí este paso" en mitad de la práctica: tras explicar, vuelve la pregunta.
  await pagina.getByRole("button", { name: /No entendí este paso/ }).first().click();
  await pagina.waitForTimeout(1500);
  const trasExplicar = await esperar(pagina, (e) => Boolean(e.pregunta) || e.completada, 90_000, 500);
  check(
    'tras explicar, la pregunta vuelve: la lección no se da por "completada" sin contestar',
    Boolean(trasExplicar.pregunta) && !trasExplicar.completada,
    trasExplicar.completada ? "dijo ¡Lección completada! sin pregunta" : "",
  );
  if (trasExplicar.pregunta) {
    const dada = await contestar(pagina, trasExplicar);
    const fin = await esperar(pagina, (e) => e.completada, 30_000);
    const ultima = fin.desarrollo.at(-1) ?? "";
    const [n, d] = String(dada).split("/");
    const cerrada = d ? ultima.includes(`\\frac{${n}}{${d}}`) : ultima.includes(n);
    console.log(`  · práctica "${trasExplicar.pregunta}" → ${dada} · última línea: ${ultima.slice(0, 70)}…`);
    check("y al acertarla, el desarrollo termina con el resultado", fin.completada && cerrada);
  }
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
}

// ── Revisión 9b06d70: pizza circular, brazo de la distributiva, llevo 1 ─────
console.log("\n── Revisión 9b06d70: pizza circular, sincronía, brazo, llevo 1, tipografía ──");

// 1. FRACCIONES: la pizza es un círculo, y numerador/denominador aparecen en
// sincronía con lo que se acaba de escribir en la pizarra.
{
  const { pagina, errores } = await sesionRapida("revision.frac2", "PRIMARIA", 6);
  await abrirTema(pagina, /fracci/i);

  // La primera foto, apenas se monta el diagrama: sirve para comprobar la
  // FORMA (círculo, no barras) y capturar el estado más temprano posible.
  let primera = null;
  for (let k = 0; k < 60 && !primera; k++) {
    primera = await pagina.evaluate(() => {
      const svg = document.querySelector(".pz-diagrama");
      if (!svg) return null;
      const texto = document.body.innerText ?? "";
      return {
        rects: svg.querySelectorAll("rect").length,
        paths: svg.querySelectorAll("path").length,
        numerador: /numerador: \d/.test(texto),
        denominador: /denominador: \d/.test(texto),
        formal: /Numerador \/ Denominador:/.test(texto),
      };
    });
    if (!primera) await pagina.waitForTimeout(200);
  }
  if (!primera) {
    check("el diagrama de fracciones llega a montarse", false, "no apareció en 12 s");
  } else {
    console.log(`  · primera foto: ${JSON.stringify(primera)}`);
    check("la pizza se dibuja con gajos, no con barras", primera.rects === 0 && primera.paths > 0);
  }

  // Se sigue el estado varios segundos: si en ALGÚN momento se ve el
  // denominador pero TODAVÍA no el numerador, la introducción no respetó el
  // orden en que se dicen las palabras. La expresión formal se busca EN el
  // mismo barrido, no después: la fase de Concepto se cierra sola al cabo de
  // unos segundos, y comprobarla tras el barrido la buscaba en una pantalla
  // que ya había pasado a "Reglas y propiedades" —fallo de instante, no del
  // código—.
  const vistos = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    vistos.push(
      await pagina.evaluate(() => {
        const texto = document.body.innerText ?? "";
        return {
          numerador: /numerador: \d/.test(texto),
          denominador: /denominador: \d/.test(texto),
          formal: /Numerador \/ Denominador:/.test(texto),
        };
      }),
    );
    await pagina.waitForTimeout(300);
  }
  const primerNumerador = vistos.findIndex((v) => v.numerador);
  const primerDenominador = vistos.findIndex((v) => v.denominador);
  console.log(`  · numerador visible desde la muestra ${primerNumerador} · denominador desde la ${primerDenominador}`);
  if (primerNumerador < 0 || primerDenominador < 0) {
    console.log("  · (esta lección salió con la redacción que no nombra numerador/denominador; no aplica)");
  } else {
    check(
      "el numerador aparece ANTES que el denominador, nunca al revés",
      primerNumerador <= primerDenominador,
    );
    check(
      "y hay al menos una muestra con el numerador puesto y el denominador aún no",
      vistos.some((v) => v.numerador && !v.denominador),
    );
  }
  check(
    "la expresión formal —Numerador / Denominador: n/d— acaba apareciendo",
    vistos.some((v) => v.formal),
  );
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  // Se cierra la sesión al terminar: una batería larga con muchas sesiones
  // seguidas es más estable liberando cada una según se deja de usar.
  await pagina.context().close();
}

// 2. "LLEVO 1" NO TAPA LA CIFRA, EN PROYECCIÓN —que es donde el cliente lo
// fotografió, con la letra del rótulo mucho más grande que la de pantalla—.
{
  const { pagina, errores } = await sesionRapida("revision.arit2", "PRIMARIA", 6);
  await abrirTema(pagina, /aritm/i);
  await pagina.waitForTimeout(1200);

  // "Más difícil" da 24 + 17, que siempre lleva.
  const masDificil = pagina.getByRole("button", { name: /Más difícil/ }).first();
  if (await masDificil.count()) await masDificil.click();
  for (let k = 0; k < 60; k++) {
    if (await pagina.evaluate(() => Boolean(document.querySelector(".pz-animada")))) break;
    await pagina.waitForTimeout(300);
  }
  await pagina.waitForTimeout(400);

  const boton = pagina.getByRole("button", { name: /Modo proyección/ }).first();
  if (await boton.count()) await boton.click();
  let enProyeccion = false;
  for (let k = 0; k < 30 && !enProyeccion; k++) {
    enProyeccion = await pagina.evaluate(() => Boolean(document.querySelector(".modo-proyeccion")));
    if (!enProyeccion) await pagina.waitForTimeout(200);
  }
  check("se consigue entrar en Modo proyección", enProyeccion);

  let medida = null;
  for (let k = 0; k < 60 && !medida; k++) {
    medida = await pagina.evaluate(() => {
      const t = [...document.querySelectorAll(".pz-etiqueta")].find((x) => /llevo/i.test(x.textContent ?? ""));
      if (!t) return null;
      const caja = t.closest("g")?.querySelector("rect");
      if (!caja) return null;
      return { etiqueta: t.getBoundingClientRect(), caja: caja.getBoundingClientRect() };
    });
    if (!medida) await pagina.waitForTimeout(300);
  }
  if (!medida) {
    check('la lección llega a mostrar "llevo 1" en proyección', false, "no apareció en 18 s");
  } else {
    const holgura = medida.caja.top - medida.etiqueta.bottom;
    console.log(`  · borde de abajo de "llevo 1": ${medida.etiqueta.bottom.toFixed(0)} · borde de arriba de la caja: ${medida.caja.top.toFixed(0)} · holgura: ${holgura.toFixed(1)}px`);
    check('"llevo 1" no toca la caja de la cifra que lleva —hay hueco de verdad entre las dos—', holgura > 2);
  }

  // LA IDENTIDAD TIPOGRÁFICA, en la MISMA sesión: la escena ya tiene una
  // fórmula de KaTeX y un subtítulo manuscrito en pantalla, así que no hace
  // falta abrir un navegador nuevo sólo para medir la fuente. Menos sesiones
  // en fila es menos ocasión de que Chrome se caiga a media batería larga.
  const fuentes = await pagina.evaluate(() => {
    const el = (sel) => document.querySelector(sel);
    const katexEl = document.querySelector(".katex");
    return {
      manuscrita: el(".pz-manuscrita") ? getComputedStyle(el(".pz-manuscrita")).fontFamily : null,
      formula: katexEl ? getComputedStyle(katexEl).fontFamily : null,
    };
  });
  console.log(`  · fuentes computadas: ${JSON.stringify(fuentes)}`);
  check(
    "el subtítulo del tutor pide la fuente manuscrita, con Segoe Print primero",
    Boolean(fuentes.manuscrita) && /Segoe Print/.test(fuentes.manuscrita),
  );
  check(
    "la fórmula NO hereda esa fuente: KaTeX sigue componiendo con la suya",
    Boolean(fuentes.formula) && !/Segoe Print|Comic Sans|Chalkboard/.test(fuentes.formula),
  );

  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  await pagina.context().close();
}

// 3. EL BRAZO DE LA DISTRIBUTIVA: un arco de verdad entre el factor y el
// sumando, no sólo dos cajas sueltas. Sólo dos de las ocho formas del nivel
// difícil llevan un paréntesis a la izquierda, así que se reintenta.
{
  const { pagina, errores } = await sesionRapida("revision.lin2", "SECUNDARIA", 2);
  await abrirTema(pagina, /lineal/i);
  await pagina.waitForTimeout(1200);

  const buscarArco = () =>
    pagina.evaluate(() => {
      const panel = document.querySelector(".pz-animada");
      if (!panel || panel.getAttribute("data-gesto") !== "distributiva") return null;
      const arco = panel.querySelector('g[data-tipo="reparto"] path');
      const marcador = document.querySelector("marker#pz-flecha-reparto");
      return arco ? { hayArco: true, tieneMarcador: Boolean(marcador), d: arco.getAttribute("d") } : { hayArco: false };
    });

  let vista = null;
  for (let intento = 0; intento < 8 && !vista?.hayArco; intento++) {
    const masDificil = pagina.getByRole("button", { name: /Más difícil/ }).first();
    if (await masDificil.count()) await masDificil.click();
    for (let k = 0; k < 40; k++) {
      await pagina.waitForTimeout(300);
      vista = await buscarArco();
      if (vista) break;
      const gesto = await pagina.evaluate(() => document.querySelector(".pz-animada")?.getAttribute("data-gesto"));
      if (gesto && gesto !== "distributiva") break;
    }
  }
  if (!vista?.hayArco) {
    // Con ocho intentos la probabilidad de fallar por puro azar es
    // (6/8)^8 ≈ 10 %; se deja constancia en vez de forzar el fallo, porque no
    // es un defecto del código sino mala suerte del sorteo.
    console.log("  · no salió ningún ejemplo con paréntesis a la izquierda en 8 intentos (puede pasar por azar)");
  } else {
    console.log(`  · arco: ${vista.d}`);
    check("aparece el brazo curvo entre el factor y el sumando", vista.hayArco);
    check("con su punta de flecha definida", vista.tieneMarcador);
    // El arco va de un punto a otro con una curva (comando "Q"), no una recta.
    check("es una curva, no una línea recta", /^M [\d.-]+ [\d.-]+ Q /.test(vista.d ?? ""));
  }
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  await pagina.context().close();
}

await navegador.close();
salir();
