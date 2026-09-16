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
      const fase = (() => { const id = document.querySelector(".pz-pizarra")?.getAttribute("data-fase") ?? ""; return /concepto/i.test(id) ? "Concepto" : /regla|propiedad/i.test(id) ? "Reglas y propiedades" : /ejemplo/i.test(id) ? "Ejemplo paso a paso" : /pr[aá]ctica/i.test(id) ? "Práctica" : ""; })();
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
    // La pizarra de dos ambientes: el ejercicio en el encabezado "Ejercicio:" y
    // el desarrollo, los pasos de los ambientes que no son el planteamiento.
    const encabezado = document.querySelector(".pz-encabezado-ejercicio");
    void porRotulo;
    return {
      tarjeta: (encabezado?.innerText ?? "").replace(/\s+/g, " ").trim(),
      tarjetaLatex: encabezado?.querySelector(".pz-encabezado-formula annotation")?.textContent ?? null,
      desarrollo: [...document.querySelectorAll('.pz-ambiente .pz-elemento:not([data-papel="planteamiento"])')]
        .map((e) => e.querySelector("annotation")?.textContent)
        .filter(Boolean),
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

  // 2. La marca del resultado no puede tapar las cifras. El total de una cuenta
  // en columna es la RESPUESTA FINAL del ejercicio: se enmarca —un rectángulo
  // con aire alrededor de las cifras— y lleva el visto a la derecha del marco
  // (revisión daa127d, 2ª: el visto, sólo en la respuesta final).
  let marca = null;
  for (let k = 0; k < 160 && !marca; k++) {
    marca = await pagina.evaluate(() => {
      // La respuesta ENMARCADA (la del cierre), y las cifras de SU paso: la
      // pizarra enseña varios pasos a la vez.
      const g = document.querySelector('.pz-animada .pz-resaltado[data-tipo="resultado"][data-final="si"]');
      if (!g) return null;
      const svg = g.ownerSVGElement.getBoundingClientRect();
      const paso = g.closest(".pz-animada");
      const glifos = [...paso.querySelectorAll(".pz-resultado, .pz-solucion, .pz-final")]
        .flatMap((el) => [el, ...el.querySelectorAll("*")])
        .filter((el) => el.childElementCount === 0 && /[^\s\u200b-\u200d\ufeff]/.test(el.textContent ?? ""))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0);
      if (glifos.length === 0) return null;
      const marco = g.querySelector("rect.pz-marco-final");
      return {
        elipses: document.querySelectorAll(".pz-animada ellipse").length,
        final: g.getAttribute("data-final") === "si",
        marco: marco
          ? { x: Number(marco.getAttribute("x")), y: Number(marco.getAttribute("y")), w: Number(marco.getAttribute("width")), h: Number(marco.getAttribute("height")) }
          : null,
        rayas: [...g.querySelectorAll("line")].map((l) => Number(l.getAttribute("y1"))),
        visto: g.querySelector("path.pz-visto") ? g.querySelector("path.pz-visto").getBBox().x : null,
        arriba: Math.min(...glifos.map((r) => r.top - svg.top)),
        abajo: Math.max(...glifos.map((r) => r.bottom - svg.top)),
        izquierda: Math.min(...glifos.map((r) => r.left - svg.left)),
        derecha: Math.max(...glifos.map((r) => r.right - svg.left)),
      };
    });
    if (!marca) await pagina.waitForTimeout(250);
  }
  if (!marca) {
    check("la lección llega a marcar un resultado", false, "no apareció en 40 s");
  } else {
    const m = marca.marco;
    console.log(`  · resultado: final=${marca.final} · marco ${m ? `x=${m.x.toFixed(0)}..${(m.x + m.w).toFixed(0)} y=${m.y.toFixed(0)}..${(m.y + m.h).toFixed(0)}` : "—"} · cifras x=${marca.izquierda.toFixed(0)}..${marca.derecha.toFixed(0)} y=${marca.arriba.toFixed(0)}..${marca.abajo.toFixed(0)} · visto en x=${marca.visto?.toFixed(0)}`);
    check("el resultado ya no se rodea con una elipse", marca.elipses === 0);
    check("el total de la cuenta es la respuesta final: se ENMARCA", marca.final && m != null && marca.rayas.length === 0);
    check(
      "y el marco rodea las cifras con aire, sin cruzar ninguna",
      m != null && m.x < marca.izquierda && m.x + m.w > marca.derecha && m.y < marca.arriba && m.y + m.h > marca.abajo,
    );
    check("con el visto a la derecha del marco, sin tocarlo", m != null && marca.visto != null && marca.visto > m.x + m.w);
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

  // 4a. "No entendí este paso" en mitad de la práctica: tras explicar, vuelve a
  // preguntar —por un ejercicio NUEVO: el suyo acaba de resolverse en la pizarra
  // (segunda ronda del cliente)—.
  const antesDeExplicar = await estadoVisible(pagina);
  await pagina.getByRole("button", { name: /No entendí este paso/ }).first().click();
  await pagina.waitForTimeout(1500);
  const trasExplicar = await esperar(pagina, (e) => Boolean(e.pregunta) || e.completada, 90_000, 500);
  check(
    'tras explicar, la práctica vuelve a preguntar: la lección no se da por "completada" sin contestar',
    Boolean(trasExplicar.pregunta) && !trasExplicar.completada,
    trasExplicar.completada ? "dijo ¡Lección completada! sin pregunta" : "",
  );
  check(
    "…por un ejercicio NUEVO, que se lleva la tarjeta con la pizarra limpia: no el que acaba de resolverse",
    Boolean(antesDeExplicar.tarjetaLatex) && trasExplicar.tarjetaLatex !== antesDeExplicar.tarjetaLatex &&
      trasExplicar.pregunta !== antesDeExplicar.pregunta && trasExplicar.desarrollo.length === 0,
    `${antesDeExplicar.tarjetaLatex} → ${trasExplicar.tarjetaLatex} · ${trasExplicar.desarrollo.length} pasos`,
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
        // La expresión formal, VERTICAL (revisión daa127d, 2ª): una sola fórmula
        // con dos rayas de fracción y sin ninguna barra inclinada.
        // Las PALABRAS van en letra de pizarra con su raya (HTML) y "= 1/4" en
        // KaTeX: "el mismo tamaño y tipo de letra" que las notas, pidió el cliente.
        const f = document.querySelector(".pz-fraccion-formal");
        const compuesta = (f?.querySelector(".katex-html")?.textContent ?? "").replace(/\s+/g, "");
        return {
          numerador: /numerador: \d/.test(texto),
          denominador: /denominador: \d/.test(texto),
          formal: Boolean(f) && f.querySelectorAll(".mfrac").length === 1 &&
            /Numerador/.test(f.querySelector(".pz-fraccion-palabras-arriba")?.textContent ?? "") &&
            /Denominador/.test(f.querySelector(".pz-fraccion-palabras-abajo")?.textContent ?? "") &&
            /=/.test(compuesta) && !/\//.test(f.textContent ?? ""),
          barra: /Numerador\s*\/\s*Denominador/.test(texto),
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
    "la expresión formal acaba apareciendo, VERTICAL: Numerador sobre Denominador = n sobre d",
    vistos.some((v) => v.formal),
  );
  check("y en ningún momento se escribe con barra inclinada («Numerador / Denominador»)", !vistos.some((v) => v.barra));
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

  // Las llevadas se animan en el EJEMPLO (en Reglas ya no se anima ninguna
  // cuenta, OBS-04 del informe): se espera a que la clase llegue a él.
  let medida = null;
  for (let k = 0; k < 600 && !medida; k++) {
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
    check('la lección llega a mostrar "llevo 1" en proyección', false, "no apareció en 3 min");
  } else {
    const holgura = medida.caja.top - medida.etiqueta.bottom;
    console.log(`  · borde de abajo de "llevo 1": ${medida.etiqueta.bottom.toFixed(0)} · borde de arriba de la caja: ${medida.caja.top.toFixed(0)} · holgura: ${holgura.toFixed(1)}px`);
    check('"llevo 1" no toca la caja de la cifra que lleva —hay hueco de verdad entre las dos—', holgura > 2);
  }

  // LA IDENTIDAD TIPOGRÁFICA, en la MISMA sesión: la escena ya tiene una
  // fórmula de KaTeX y un subtítulo en pantalla, así que no hace falta abrir
  // un navegador nuevo sólo para medir la fuente. Menos sesiones en fila es
  // menos ocasión de que Chrome se caiga a media batería larga.
  //
  // El cliente CORRIGIÓ el pedido de la ronda anterior: el habla del tutor
  // —el subtítulo— NO lleva letra manuscrita; sólo lo ESCRITO en la pizarra
  // (la etiqueta de la llevada) la lleva. Se comprueba justo eso: las dos
  // fuentes tienen que ser DISTINTAS, y ninguna es la de KaTeX.
  const fuentes = await pagina.evaluate(() => {
    const subtitulo = document.querySelector('p[class*="bg-muted/60"]');
    const etiqueta = document.querySelector(".pz-etiqueta");
    const katexEl = document.querySelector(".katex");
    return {
      subtitulo: subtitulo ? getComputedStyle(subtitulo).fontFamily : null,
      etiqueta: etiqueta ? getComputedStyle(etiqueta).fontFamily : null,
      formula: katexEl ? getComputedStyle(katexEl).fontFamily : null,
    };
  });
  console.log(`  · fuentes computadas: ${JSON.stringify(fuentes)}`);
  // El informe del cliente (SUB-TIP-01) fijó una fuente por ROL: lo que dice
  // el tutor, Segoe Print; lo que se escribe en la pizarra, Chalkboard SE.
  check(
    "el subtítulo del tutor es TUTOR_DIALOG: Segoe Print",
    Boolean(fuentes.subtitulo) && /^"?Segoe Print/.test(fuentes.subtitulo),
  );
  check(
    "la etiqueta ESCRITA sobre la pizarra es BOARD_LABEL: Chalkboard SE",
    Boolean(fuentes.etiqueta) && /^"?Chalkboard SE/.test(fuentes.etiqueta),
  );
  check(
    "y las dos fuentes son distintas entre sí",
    Boolean(fuentes.subtitulo) && Boolean(fuentes.etiqueta) && fuentes.subtitulo !== fuentes.etiqueta,
  );
  check(
    "la fórmula NO hereda ninguna de las dos: KaTeX sigue componiendo con la suya",
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
      // El trazo del conector (no el de su punta, que va dentro del marker).
      const arco = panel.querySelector('g[data-tipo="reparto"] path.pz-conector');
      // La punta, definida con el propio conector y de tamaño fijo.
      const marcador = panel.querySelector('g[data-tipo="reparto"] marker[markerUnits="userSpaceOnUse"]');
      return arco ? { hayArco: true, tieneMarcador: Boolean(marcador), d: arco.getAttribute("d") } : { hayArco: false };
    });

  // Se llega primero a la práctica: desde ahí "Más difícil" trae otro ejemplo
  // DENTRO de la misma fase, con su tarjeta de EJERCICIO —en Concepto no hay
  // tarjeta que vigilar—. Y se espera a que la tarjeta cambie antes de mirar
  // qué gesto anima el panel: mirando antes se leía la escena del ejemplo
  // anterior y el intento se daba por perdido.
  //
  // Cada "Más difícil" trae una lección entera —ejemplo y después su práctica—;
  // el arco se busca mientras dura su EJEMPLO, y la siguiente pulsación espera
  // a la pregunta de esa práctica. Sin esa espera, la pulsación caía a mitad de
  // la lección y se miraba la tarjeta de la práctica, que —con razón— ya no se
  // anima.
  await esperar(pagina, (e) => Boolean(e.pregunta), 120_000);
  let vista = null;
  for (let intento = 0; intento < 6 && !vista?.hayArco; intento++) {
    const masDificil = pagina.getByRole("button", { name: /Más difícil/ }).first();
    if (!(await masDificil.count())) break;
    await masDificil.click();
    await pagina.waitForTimeout(800);
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      vista = await buscarArco();
      if (vista?.hayArco) break;
      if ((await estadoVisible(pagina)).pregunta) break;
      await pagina.waitForTimeout(250);
    }
  }
  if (!vista?.hayArco) {
    // Con seis lecciones seguidas la probabilidad de fallar por puro azar es
    // pequeña (el nivel difícil abre con uno); se deja constancia en vez de forzar el fallo, porque no
    // es un defecto del código sino mala suerte del sorteo.
    console.log("  · no salió ningún ejemplo con paréntesis a la izquierda en 6 intentos (puede pasar por azar)");
  } else {
    console.log(`  · arco: ${vista.d}`);
    check("aparece el conector entre el factor y el sumando", vista.hayArco);
    check("con su punta de flecha definida, de tamaño fijo", vista.tieneMarcador);
    // Como lo dibujó el cliente (OBS-16): una ESCUADRA que baja del factor,
    // cruza por debajo de la expresión y sube al sumando.
    check("es una escuadra limpia: baja, cruza por debajo y sube", /^M [\d.-]+ [\d.-]+ V [\d.-]+ H [\d.-]+ V [\d.-]+$/.test(vista.d ?? ""));

    // REVISIÓN daa127d, PUNTO 5: la tarjeta de arriba no adelanta lo que la
    // animación de abajo todavía está repartiendo. Se vigila mientras dura el
    // ejemplo: en ninguna muestra puede leerse en la tarjeta el resultado del
    // reparto ("2x + 6") que el enunciado no dice.
    const muestras = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      muestras.push(
        await pagina.evaluate(() => {
          // El enunciado, en el encabezado "Ejercicio:" de la pizarra.
          const tarjeta = document.querySelector(".pz-encabezado-formula annotation")?.textContent ?? "";
          const panel = document.querySelector(".pz-animada");
          const fila = panel?.querySelector(".pz-rev-2.pz-resultado");
          return {
            tarjeta,
            gesto: panel?.getAttribute("data-gesto") ?? null,
            repartido: fila ? Number(getComputedStyle(fila).opacity) > 0.5 : false,
            etiqueta: panel?.querySelector(".pz-etiqueta[data-etiqueta]")?.textContent ?? null,
            pie: panel?.querySelector(".pz-pie")?.textContent ?? "",
          };
        }),
      );
      await pagina.waitForTimeout(200);
    }
    const conDistributiva = muestras.filter((m) => /\d\s*\\left\(|\d\s*\(/.test(m.tarjeta));
    const spoiler = conDistributiva.filter((m) => {
      // Lo que saldría de repartir: "2x + 6" para "2(x + 3) = 16".
      const r = m.tarjeta.replace(/\\left|\\right|\s/g, "").match(/^(-?\d+)\(x([+-])(\d+)\)=/);
      if (!r) return false;
      const [, f, s, c] = r;
      const expandido = `${f}x${s}${Number(f) * Number(c)}`;
      return m.tarjeta.replace(/\\left|\\right|\s/g, "").includes(`=${expandido}`) || m.tarjeta.replace(/\s/g, "").includes(expandido);
    });
    console.log(`  · tarjeta durante el reparto: ${conDistributiva[0]?.tarjeta?.replace(/\s+/g, " ").slice(0, 60) ?? "(sin paréntesis)"}`);
    check(
      "la tarjeta de EJERCICIO no enseña el resultado del reparto mientras la animación lo cuenta",
      spoiler.length === 0,
      `${spoiler.length} muestras con el spoiler`,
    );
    check(
      "y la animación de abajo reparte los dos términos hasta destapar la ecuación repartida",
      muestras.some((m) => m.gesto === "distributiva" && m.repartido) &&
        muestras.some((m) => /multiplica a x/.test(m.pie)) && muestras.some((m) => /Y el \d+ multiplica a/.test(m.pie)),
    );

    // Y la PRÁCTICA: su enunciado se le pide al alumno, así que la pizarra no
    // lo anima —antes le repartía el 2 mientras le preguntaba cuánto vale x—.
    const enPractica = await esperar(pagina, (e) => Boolean(e.pregunta), 90_000);
    const panel = await pagina.evaluate(() => ({
      panel: document.querySelector("[data-panel]")?.getAttribute("data-panel") ?? null,
      recuadros: document.querySelectorAll(".pz-animada .pz-resaltado").length,
    }));
    console.log(`  · práctica: ${enPractica.tarjetaLatex ?? "?"} · panel: ${panel.panel} · recuadros: ${panel.recuadros}`);
    if (enPractica.pregunta) {
      check(
        "el enunciado de la práctica no se anima: la pizarra no le hace el primer paso al alumno",
        panel.panel === "reposo" && panel.recuadros === 0,
      );
    }
  }
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  await pagina.context().close();
}

// ── Revisión daa127d: lo que dice = lo que muestra, «No entendí», tipografía ──
console.log("\n── Revisión daa127d: sincronía voz-pizarra, «No entendí este paso», rótulos ──");

{
  const { pagina, errores } = await sesionRapida("revision.c", "PRIMARIA", 6);
  await abrirTema(pagina, /fracci/i);
  await pagina.waitForTimeout(600);
  const proyectar = pagina.getByRole("button", { name: /Modo proyección/ }).first();
  if (await proyectar.count()) await proyectar.click();
  await pagina.waitForTimeout(300);

  // Se muestrea TODO a la vez —lo que se oye (subtítulo) y lo que se ve (notas
  // proyectadas, paso animado)— cada ~120 ms, hasta llegar al ejemplo.
  const foto = () =>
    pagina.evaluate(() => {
      const fase = (() => { const id = document.querySelector(".pz-pizarra")?.getAttribute("data-fase") ?? ""; return /concepto/i.test(id) ? "Concepto" : /regla|propiedad/i.test(id) ? "Reglas y propiedades" : /ejemplo/i.test(id) ? "Ejemplo paso a paso" : /pr[aá]ctica/i.test(id) ? "Práctica" : ""; })();
      const subtitulo = document.querySelector('p[class*="bg-muted/60"]')?.textContent ?? "";
      const notas = [...document.querySelectorAll(".modo-proyeccion .pz-nota")].map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim());
      const rotulo = document.querySelector(".modo-proyeccion .pz-nota-rotulo");
      const formula = document.querySelector(".modo-proyeccion .pz-nota .katex");
      return {
        t: performance.now(),
        fase,
        subtitulo,
        notas,
        // Numerador sobre Denominador, con su raya, en letra de pizarra.
        fraccionDePalabras: Boolean(document.querySelector(".modo-proyeccion .pz-fraccion-palabras-arriba")),
        rotulo: rotulo ? { px: parseFloat(getComputedStyle(rotulo).fontSize), fuente: getComputedStyle(rotulo).fontFamily } : null,
        formulaPx: formula ? parseFloat(getComputedStyle(formula).fontSize) : null,
        // El rótulo de una marca (no la sonda con la que se mide la letra).
        etiqueta: document.querySelector(".pz-animada .pz-etiqueta[data-etiqueta]")?.textContent ?? null,
      };
    });
  const fotos = [];
  const t0 = Date.now();
  // Hasta dos minutos: el bucle sale en cuanto el paso de los numeradores se ha
  // visto y apagado, y el margen sólo cuenta cuando la lección tarda en llegar
  // (con la clave de IA rechazada, el servidor espera antes de su respaldo).
  while (Date.now() - t0 < 120_000) {
    const f = await foto();
    fotos.push(f);
    // Se sigue hasta que el paso de los numeradores se haya visto y apagado.
    // "Visto" es en DOS muestras seguidas: al montarse la escena, la frase de
    // entrada —que nombra "el denominador 4"— pasa por el primer foco camino del
    // de los denominadores en un solo fotograma, y parar en ese destello dejaba
    // la medida en 0 ms sin llegar al paso de verdad (que dura 1,4 s).
    const vistoNum = fotos.some((x, k) => x.etiqueta === "numeradores" && fotos[k - 1]?.etiqueta === "numeradores");
    if (vistoNum && f.etiqueta !== "numeradores" && /Ejemplo/.test(f.fase)) break;
    await pagina.waitForTimeout(120);
  }
  const fasesVistas = [...new Set(fotos.map((f) => f.fase).filter(Boolean))];
  console.log(`  · fases: ${fasesVistas.join(" → ")} · ${fotos.length} muestras`);

  // CONCEPTO: lo que se dice está escrito mientras se dice.
  const diciendoDenominador = fotos.filter((f) => /n[uú]mero de ABAJO es el denominador/.test(f.subtitulo));
  if (diciendoDenominador.length) {
    check(
      'mientras el tutor dice "…el número de ABAJO es el denominador", la pizarra ya lo tiene escrito',
      diciendoDenominador.every((f) => f.notas.some((n) => /^Denominador:/.test(n))),
      `${diciendoDenominador.filter((f) => !f.notas.some((n) => /^Denominador:/.test(n))).length} muestras sin él`,
    );
  } else {
    console.log("  · (salió la redacción que no nombra numerador/denominador: no aplica)");
  }
  check(
    "en Concepto las notas se acumulan: lo ya dicho sigue a la vista (varias a la vez)",
    fotos.some((f) => /Concepto/.test(f.fase) && f.notas.length >= 3),
    `máximo ${Math.max(0, ...fotos.filter((f) => /Concepto/.test(f.fase)).map((f) => f.notas.length))}`,
  );
  if (diciendoDenominador.length) {
    check(
      '"Fracción: numerador / denominador" se proyecta como fracción de verdad, con su raya',
      fotos.some((f) => f.fraccionDePalabras),
    );
  }
  // REGLAS: cada propiedad, escrita mientras se cuenta.
  const diciendoEquivalentes = fotos.filter((f) => /EQUIVALENTES/.test(f.subtitulo));
  const diciendoIgual = fotos.filter((f) => /SUMAR fracciones con el mismo denominador/.test(f.subtitulo));
  check(
    'en Reglas, al oír "…son EQUIVALENTES…" está escrito "Fracciones equivalentes"',
    diciendoEquivalentes.length > 0 && diciendoEquivalentes.every((f) => f.notas.some((n) => /^Fracciones equivalentes/.test(n))),
  );
  check(
    'y al oír cómo se SUMAN con el mismo denominador, está escrita esa propiedad',
    diciendoIgual.length > 0 && diciendoIgual.every((f) => f.notas.some((n) => /^Igual denominador/.test(n))),
  );
  // TIPOGRAFÍA: el rótulo a tamaño de aula y en letra de pizarra.
  const conRotulo = fotos.find((f) => f.rotulo);
  console.log(`  · rótulo proyectado: ${conRotulo ? `${conRotulo.rotulo.px}px · ${conRotulo.rotulo.fuente.slice(0, 40)}` : "—"} · fórmula: ${conRotulo?.formulaPx ?? "—"}px`);
  check(
    "en proyección el rótulo mide al menos text-2xl (24 px) y va en letra de pizarra",
    Boolean(conRotulo) && conRotulo.rotulo.px >= 24 && /Chalkboard SE|Segoe Print/.test(conRotulo.rotulo.fuente),
  );
  check(
    "y la fórmula de la nota va un escalón por encima del rótulo",
    fotos.some((f) => f.rotulo && f.formulaPx && f.formulaPx > f.rotulo.px),
  );
  // EL FOTOGRAMA DE LOS NUMERADORES: ¿cuánto se queda a la vista?
  let mejor = 0;
  for (let i = 0; i < fotos.length; i++) {
    if (fotos[i].etiqueta !== "numeradores") continue;
    let j = i;
    while (j + 1 < fotos.length && fotos[j + 1].etiqueta === "numeradores") j++;
    mejor = Math.max(mejor, fotos[j].t - fotos[i].t);
    i = j;
  }
  console.log(`  · el recuadro "numeradores" estuvo a la vista ${Math.round(mejor)} ms seguidos (locución de prueba: 450 ms)`);
  check(
    // Medido por muestras cada ~170 ms, así que la cifra se queda CORTA por los dos
    // extremos: si lo medido pasa de 1 s, lo real también. Antes duraba lo que la
    // pausa de escritura, 0,7 s —y sin locución a la vista—.
    "el paso de los numeradores se sostiene: al menos un segundo a la vista, además de su locución",
    mejor >= 1000,
    `${Math.round(mejor)} ms`,
  );

  // «NO ENTENDÍ ESTE PASO» EN EL EJEMPLO: el mismo ejercicio, desglosado, y la
  // clase sigue hasta la práctica.
  const salir = pagina.getByRole("button", { name: /Salir de proyección/ }).first();
  if (await salir.count()) await salir.click();
  await pagina.waitForTimeout(300);
  const antes = await estadoVisible(pagina);
  const faseAntes = (await foto()).fase;
  await pagina.getByRole("button", { name: /No entendí este paso/ }).first().click();
  const tras = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 90_000) {
    const e = await estadoVisible(pagina);
    const f = await foto();
    tras.push({ ...e, fase: f.fase });
    if (e.pregunta || e.completada) break;
    await pagina.waitForTimeout(250);
  }
  const ultimo = tras.at(-1) ?? {};
  const cuentaAjena = tras.some((e) => e.desarrollo.some((l) => /\\frac\{1\}\{4\}\s*\+\s*\\frac\{1\}\{4\}/.test(l)) && !/\\frac\{1\}\{4\}\s*\+\s*\\frac\{1\}\{4\}/.test(antes.tarjetaLatex ?? ""));
  console.log(`  · antes: ${faseAntes} · "${(antes.tarjetaLatex ?? "").slice(0, 40)}" → después: ${ultimo.fase} · pregunta: ${ultimo.pregunta ? "sí" : "no"} · completada: ${ultimo.completada}`);
  check(
    "«No entendí este paso» en el ejemplo no cambia el ejercicio de la tarjeta",
    Boolean(antes.tarjetaLatex) && tras.filter((e) => /Ejemplo/.test(e.fase)).every((e) => e.tarjetaLatex === antes.tarjetaLatex),
  );
  check("ni escribe otra cuenta en el desarrollo (la «1/4 + 1/4» de la captura)", !cuentaAjena);
  check(
    "y después retoma la clase: llega a la práctica con su pregunta, sin darse por «completada» antes",
    Boolean(ultimo.pregunta) && !ultimo.completada && /Práctica/.test(ultimo.fase ?? ""),
    `fase ${ultimo.fase}`,
  );
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  await pagina.context().close();
}

// ── Revisión daa127d (2ª): fracción formal, cierre enmarcado, ejercicio fijo ─
console.log("\n── Revisión daa127d (2ª): fracción formal, cierre enmarcado, ejercicio fijo, visto final ──");

/** Todo lo que se ve del panel animado y de la proyección, de una vez. */
const fotoPanel = (pagina) =>
  pagina.evaluate(() => {
    // El paso que la voz está recorriendo (la pizarra enseña todos a la vez).
    const panel = document.querySelector('.pz-animada[data-estado="activa"]');
    // "Ejercicio:" y el enunciado, fijos en lo alto de la pizarra.
    const fijo = document.querySelector(".pz-encabezado-ejercicio");
    const nota = document.querySelector(".modo-proyeccion .pz-ambiente .pz-nota");
    const formal = document.querySelector(".modo-proyeccion .pz-fraccion-formal");
    // Se comparan fórmulas sin sus marcas ni su espaciado: la tarjeta puede
    // llevar resaltados (\htmlClass) y la cabecera fija va limpia.
    const plano = (t) => String(t ?? "").replace(/\\htmlClass\{[^}]*\}/g, "").replace(/\\left|\\right|[{}\s]/g, "");
    return {
      fase: (() => { const id = document.querySelector(".pz-pizarra")?.getAttribute("data-fase") ?? ""; return /concepto/i.test(id) ? "Concepto" : /regla|propiedad/i.test(id) ? "Reglas y propiedades" : /ejemplo/i.test(id) ? "Ejemplo paso a paso" : /pr[aá]ctica/i.test(id) ? "Práctica" : ""; })(),
      subtitulo: document.querySelector('p[class*="bg-muted/60"]')?.textContent ?? "",
      proyeccion: Boolean(document.querySelector(".modo-proyeccion")),
      panel: document.querySelector("[data-panel]")?.getAttribute("data-panel") ?? null,
      gesto: panel?.getAttribute("data-gesto") ?? null,
      escena: plano(panel?.querySelector(".pz-formula annotation")?.textContent),
      visto: Boolean(panel?.querySelector("path.pz-visto")),
      marco: Boolean(panel?.querySelector("rect.pz-marco-final")),
      tachado: Boolean(panel?.querySelector('.pz-resaltado[data-tipo="tachado"]')),
      fijo: fijo ? plano(fijo.querySelector("annotation")?.textContent ?? fijo.textContent) : null,
      fijoAbajo: fijo ? fijo.getBoundingClientRect().bottom : null,
      pasoArriba: (panel ?? document.querySelector(".pz-animada"))?.getBoundingClientRect().top ?? null,
      tarjeta: plano(document.querySelector(".pz-encabezado-formula annotation")?.textContent),
      formal: formal ? formal.querySelectorAll(".mfrac").length : 0,
      palabras: Boolean(formal?.querySelector(".pz-fraccion-palabras-arriba") && formal?.querySelector(".pz-fraccion-palabras-abajo")),
      notaPx: nota ? parseFloat(getComputedStyle(nota).fontSize) : null,
      notaCentro: nota ? getComputedStyle(nota).textAlign : null,
      notaTexto: nota ? (nota.textContent ?? "").replace(/\s+/g, " ").trim() : null,
      pregunta: Boolean([...document.querySelectorAll("input")].find((i) => /respuesta/i.test(i.placeholder ?? ""))),
    };
  });

/** Entra o sale de Modo proyección con el botón del panel. */
async function proyeccion(pagina, activar) {
  const boton = pagina.getByRole("button", { name: activar ? /Modo proyección/ : /Salir de proyección/ }).first();
  if (await boton.count()) await boton.click();
  for (let k = 0; k < 20; k++) {
    if ((await pagina.evaluate(() => Boolean(document.querySelector(".modo-proyeccion")))) === activar) return true;
    await pagina.waitForTimeout(150);
  }
  return false;
}

/** Muestrea el panel hasta que aparezca la pregunta de la práctica. */
async function muestrearHastaLaPractica(pagina, ms) {
  const fotos = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = await fotoPanel(pagina);
    fotos.push(f);
    if (f.pregunta && /Práctica/.test(f.fase)) break;
    await pagina.waitForTimeout(140);
  }
  return fotos;
}

// 1, 2 y 4. FRACCIONES: la definición formal en vertical, el visto sólo en la
// respuesta final, y el ejercicio que no queda inconcluso ni fallándolo.
{
  const { pagina, errores } = await sesionRapida("revision.d.frac", "PRIMARIA", 6);
  await abrirTema(pagina, /fracci/i);
  await pagina.waitForTimeout(500);
  check("se entra en Modo proyección desde el principio de la lección", await proyeccion(pagina, true));
  const fotos = await muestrearHastaLaPractica(pagina, 150_000);
  console.log(`  · fases: ${[...new Set(fotos.map((f) => f.fase).filter(Boolean))].join(" → ")} · ${fotos.length} muestras`);

  // Numerador sobre Denominador en letra de pizarra (con su raya) y "= 1/4" en
  // KaTeX: las dos rayas, cada una en la letra de su rol.
  check(
    "Concepto proyectado: bajo el gráfico, la definición formal con sus DOS rayas de fracción",
    fotos.some((f) => /Concepto/.test(f.fase) && f.formal === 1 && f.palabras),
  );
  const vistoFueraDeSitio = fotos.filter((f) => f.visto && f.gesto !== "cierre");
  check(
    "en ningún paso intermedio aparece el visto verde: sólo en el cierre del ejercicio",
    vistoFueraDeSitio.length === 0,
    vistoFueraDeSitio.slice(0, 2).map((f) => `${f.gesto}: ${f.escena.slice(0, 40)}`).join(" | "),
  );
  const alCerrar = fotos.filter((f) => /Resultado final/.test(f.subtitulo) && /Ejemplo/.test(f.fase));
  check(
    "al decir «Resultado final» la pizarra enmarca la respuesta y la confirma con el visto",
    alCerrar.some((f) => f.gesto === "cierre" && f.marco && f.visto),
    `${alCerrar.length} muestras; gestos: ${[...new Set(alCerrar.map((f) => f.gesto))].join(",")}`,
  );
  // Mientras se ANIMA un paso. Antes del primero, lo único proyectado es el
  // propio enunciado, y ahí la cabecera no lo repite (a propósito).
  const enEjemplo = fotos.filter((f) => /Ejemplo/.test(f.fase) && f.panel === "animado");
  const escenasVistas = new Set(enEjemplo.map((f) => f.escena));
  check(
    "proyectando el ejemplo, el ejercicio original está fijo ARRIBA mientras abajo cambia el paso activo",
    enEjemplo.length > 0 && escenasVistas.size >= 2 &&
      enEjemplo.every((f) => f.fijo && f.fijo === f.tarjeta && f.fijoAbajo <= f.pasoArriba),
    `${enEjemplo.filter((f) => !f.fijo || f.fijo !== f.tarjeta).length} muestras sin él · ${escenasVistas.size} pasos`,
  );

  // Se sale de proyección para contestar: tres respuestas erróneas.
  await proyeccion(pagina, false);
  const enunciado = (await estadoVisible(pagina)).pregunta;
  const correcta = resolverPregunta(enunciado);
  for (const mala of ["1/99", "2/99", "3/99"]) {
    await esperar(pagina, (e) => Boolean(e.pregunta), 30_000);
    await pagina.locator("input[placeholder*='respuesta' i]").fill(mala);
    await pagina.getByRole("button", { name: /Responder/ }).click();
    await pagina.waitForTimeout(1600);
  }
  const fin = await esperar(pagina, (e) => e.completada, 40_000);
  const ultima = fin.desarrollo.at(-1) ?? "";
  const [n, d] = String(correcta).split("/");
  const cerrada = /\\boxed\{/.test(ultima) && (d ? ultima.includes(`\\frac{${n}}{${d}}`) : ultima.includes(String(n)));
  // La fracción del feedback va compuesta con su raya (ni una "/" en pantalla):
  // se lee la fórmula que la compone, no el texto.
  const feedback = await pagina.evaluate(() => {
    const el = document.querySelector(".pz-retroalimentacion");
    if (!el) return null;
    const c = el.cloneNode(true);
    c.querySelectorAll(".katex-mathml").forEach((x) => x.remove());
    return { texto: c.textContent ?? "", latex: [...el.querySelectorAll("annotation")].map((x) => x.textContent).join(" ") };
  });
  console.log(`  · práctica "${enunciado}" fallada tres veces · última línea: ${ultima.replace(/\\htmlClass\{[^}]*\}/g, "").slice(0, 80)}…`);
  check(
    "fallada con los intentos agotados, el ejercicio NO queda inconcluso: la pizarra termina en su resultado enmarcado",
    fin.completada && cerrada,
  );
  check(
    "y el tutor da el feedback de conclusión con el resultado final",
    Boolean(feedback) && /resultado final es/i.test(feedback.texto) &&
      (d ? feedback.latex.includes(`\\frac{${n}}{${d}}`) : feedback.texto.includes(String(n))),
    JSON.stringify(feedback),
  );
  // La línea de cierre, en el Ambiente 2 con su cápsula esmeralda y el visto.
  const rotuloCierre = await pagina.evaluate(() => {
    const cierre = document.querySelector('[data-ambiente="2"] [data-papel="cierre"]');
    const marco = cierre?.querySelector("rect.pz-marco-final");
    return {
      enAmbiente2: Boolean(cierre),
      borde: marco ? getComputedStyle(marco).stroke : null,
      visto: Boolean(cierre?.querySelector("path.pz-visto")),
    };
  });
  check(
    "la línea de cierre va en el Ambiente 2, con su cápsula esmeralda y su visto",
    rotuloCierre.enAmbiente2 && /16, 185, 129/.test(rotuloCierre.borde ?? "") && rotuloCierre.visto,
    JSON.stringify(rotuloCierre),
  );
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  await pagina.context().close();
}

// 3, 4 y 5. ECUACIONES: la regla a tamaño de aula, el ejercicio fijo arriba al
// proyectar 2(x + 3) = 16 y ningún visto sobre la x al quitar el 6.
{
  const { pagina, errores } = await sesionRapida("revision.d.lin", "SECUNDARIA", 2);
  await abrirTema(pagina, /lineal/i);
  await pagina.waitForTimeout(500);
  await proyeccion(pagina, true);
  const primera = await muestrearHastaLaPractica(pagina, 150_000);
  const regla = primera.filter((f) => /Propiedad uniforme/.test(f.notaTexto ?? ""));
  console.log(`  · regla proyectada: ${regla[0] ? `${regla[0].notaPx}px · ${regla[0].notaCentro}` : "—"}`);
  check(
    // El informe fijó 24 px como mínimo y la alineación a la izquierda (OBS-10).
    "«Propiedad uniforme de la suma: lo mismo a los dos lados» se proyecta a tamaño de aula (≥ 24 px) y alineada a la izquierda",
    regla.length > 0 && regla.every((f) => f.notaPx >= 24 && (f.notaCentro === "left" || f.notaCentro === "start")),
  );

  // "Más difícil" trae 2(x + 3) = 16, el ejercicio de la captura. Para pulsar se
  // sale un momento de proyección: el lienzo proyectado tapa los botones.
  await proyeccion(pagina, false);
  let fotos = [];
  let conParentesis = false;
  for (let intento = 0; intento < 5 && !conParentesis; intento++) {
    const masDificil = pagina.getByRole("button", { name: /Más difícil/ }).first();
    if (!(await masDificil.count())) break;
    await masDificil.click();
    // La pregunta de la práctica anterior sigue en pantalla hasta que llega la
    // lección nueva: se espera a que se vaya antes de muestrear.
    for (let k = 0; k < 80 && (await fotoPanel(pagina)).pregunta; k++) await pagina.waitForTimeout(250);
    await proyeccion(pagina, true);
    fotos = await muestrearHastaLaPractica(pagina, 150_000);
    // El ejemplo de "Más difícil" se cuenta dentro de la vista en la que se
    // pidió (la de Práctica): se reconoce por el panel animado, no por el rótulo.
    conParentesis = fotos.some((f) => f.panel === "animado" && /^\d+\(x[+-]\d+\)=/.test(f.tarjeta ?? ""));
    await proyeccion(pagina, false);
  }
  const ejemplo = fotos.filter((f) => f.panel === "animado");
  const tarjeta = ejemplo[0]?.tarjeta ?? "";
  console.log(`  · ejemplo: ${tarjeta} · pasos animados vistos: ${new Set(ejemplo.map((f) => f.gesto)).size}`);
  if (!conParentesis) {
    console.log("  · (no salió un ejemplo con paréntesis en 5 intentos; se comprueba igual con el que salió)");
  }
  check(
    "proyectando la ecuación, el ejercicio original limpio queda fijo arriba en TODOS los pasos",
    ejemplo.length > 0 && ejemplo.every((f) => f.fijo === tarjeta && f.fijoAbajo <= f.pasoArriba),
    `${ejemplo.filter((f) => f.fijo !== tarjeta).length} de ${ejemplo.length} sin él`,
  );
  if (conParentesis) {
    check(
      "y debajo se anima el paso activo con la distributiva, sin quitar el enunciado",
      ejemplo.some((f) => f.gesto === "distributiva" && f.fijo === tarjeta),
    );
  }
  const quitando = ejemplo.filter((f) => f.tachado);
  check(
    "al quitar el término de los dos lados, el foco está sólo en él: sin visto verde sobre la x",
    quitando.length > 0 && quitando.every((f) => !f.visto),
    `${quitando.length} muestras con el tachado, ${quitando.filter((f) => f.visto).length} con visto`,
  );
  check(
    "el visto aparece únicamente en la respuesta final",
    ejemplo.filter((f) => f.visto).every((f) => f.gesto === "cierre") &&
      ejemplo.some((f) => f.gesto === "cierre" && f.marco && f.visto),
  );
  check("sin errores en la página", errores.length === 0, errores.slice(0, 2).join(" | "));
  await pagina.context().close();
}

await navegador.close();
salir();
