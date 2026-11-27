// PMV 3 · HITO 3 — PIZARRA CONVERSACIONAL INTERACTIVA.
//
// QUÉ SE DEMUESTRA (criterios de aceptación del hito)
//
//   A. API del alumno: sólo ve lo publicado y accesible; las RESPUESTAS no viajan
//      al navegador; las pistas salen de una en una; el veredicto lo da el
//      servidor.
//   B. NAVEGADOR REAL (Chrome) con una voz sintética GUIONIZADA para poder
//      disparar a mano `onstart`/`onend`, incluidos los tardíos de un audio
//      cancelado:
//        · KaTeX con términos tocables;
//        · profesor 3D en pantalla;
//        · el láser aterriza en la caja EXACTA del término que se nombra, y sólo
//          cuando EMPIEZA su audio;
//        · pausar → el láser se queda; un `onend` tardío no avanza nada;
//        · reanudar / repetir → audio y láser reempiezan juntos;
//        · tocar un término → se oye su explicación, señalándolo, y la narración
//          queda en pausa en su sitio;
//        · pedir pistas (una a una);
//        · responder por texto y HABLANDO (dictado → notación → servidor).
//
//   node qa/pmv3-hito3.mjs          (con la app en marcha)
//   QA_CHROME=<ruta a chrome>       si Chrome no está en la ruta habitual
//
// La batería de la sincronía pura (sin navegador) es qa/pmv3-pizarra-sincronia.mjs.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";

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

await exigirServidor();
const sufijo = Date.now().toString(36);
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) },
  });
const json = async (r) => r.json().catch(() => ({}));

// ── Preparación ──────────────────────────────────────────────────────────────
console.log("\n · Preparación");
const sesionAdmin = await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026");
const admin = api(sesionAdmin);
const institucion = (await json(await admin("/api/admin/instituciones", { method: "POST", body: JSON.stringify({ nombre: `Colegio QA PMV3H3 ${sufijo}` }) }))).institucion;
async function crearDocente(etiqueta) {
  const email = `qa.pmv3h3.${etiqueta}.${sufijo}@mentoriamath.local`;
  const u = (await json(await admin("/api/admin/usuarios", { method: "POST", body: JSON.stringify({ nombre: `QA H3 ${etiqueta}`, email, password: "Docente-2026", rol: "DOCENTE" }) }))).usuario;
  await admin(`/api/admin/usuarios/${u?.id}`, { method: "PATCH", body: JSON.stringify({ institucionId: institucion?.id }) });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, sesion, api: api(sesion) };
}
const A = await crearDocente("a");
const B = await crearDocente("b");
const bancos = (await json(await A.api("/api/docente/bancos"))).bancos ?? [];
const temaFracciones = bancos.find((b) => b.tema.clave === "fracciones")?.tema;
check("docentes y tema listos", Boolean(A.sesion && B.sesion && temaFracciones?.id));

const paso = (escribe, explica, tipo = "transformacion", extra = {}) => ({ explica, escribe, tipo, ...extra });
const RESPUESTA_SECRETA = "6";
const pasos = [
  paso("1/2 + 1/3", "Tenemos dos fracciones con distinto denominador.", "transformacion", {
    terminos: [{ texto: "1/2", explica: "Medio." }, { texto: "1/3", explica: "Un tercio." }],
  }),
  paso("3/6 + 2/6", "Pasamos las dos a denominador seis.", "transformacion", { regla: "denominador común" }),
  paso("5/6", "Sumamos los numeradores.", "resultado"),
];
const crear = async (docente, titulo, estado) => {
  const r = await docente.api("/api/docente/procedimientos", {
    method: "POST",
    body: JSON.stringify({
      nodoId: temaFracciones.id,
      titulo,
      ejemplo: "1/2 + 1/3",
      pasos,
      preguntas: [
        { enunciado: "¿Qué denominador común sirve para 2 y 3?", respuesta: RESPUESTA_SECRETA, pistas: ["Multiplica los denominadores.", "Dos por tres."] },
        { enunciado: "Escribe el resultado final.", respuesta: "5/6" },
        { enunciado: "¿Te ha gustado la explicación?", respuesta: "" },
      ],
      pistas: ["Pista general uno.", "Pista general dos."],
    }),
  });
  const p = (await json(r)).procedimiento;
  if (estado === "PUBLICADO" && p?.id) await docente.api(`/api/docente/procedimientos/${p.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });
  return p;
};
const pubA = await crear(A, "Suma de fracciones (publicada de A)", "PUBLICADO");
const borradorA = await crear(A, "Borrador de A", "BORRADOR");
const pubB = await crear(B, "Publicada de B", "PUBLICADO");
check("A publica uno y deja otro en borrador; B publica el suyo", pubA?.id && borradorA?.id && pubB?.id);

// Alumno que SÍ está en un aula de A, y otro que NO está en ninguna.
const aula = (await json(await A.api("/api/docente/aulas", { method: "POST", body: JSON.stringify({ nombre: `Aula H3 ${sufijo}`, grado: 3, seccion: "A" }) }))).aula;
const registrar = async (etiqueta) =>
  registrarAlumno(BASE, { email: `qa.pmv3h3.${etiqueta}.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: `QA H3 ${etiqueta}`, ciclo: "Secundaria", grado: "3" });
const alumnoDentro = await registrar("dentro");
const alumnoFuera = await registrar("fuera");
const rUnirse = await api(alumnoDentro.sesion)("/api/estudiante/unirse", { method: "POST", body: JSON.stringify({ codigoAcceso: aula?.codigoAcceso }) });
check("un alumno se matricula en el aula de A y otro no", alumnoDentro.ok && alumnoFuera.ok && rUnirse.status === 201, `HTTP ${rUnirse.status}`);
const D = api(alumnoDentro.sesion);
const F = api(alumnoFuera.sesion);

// ── A. API del alumno ────────────────────────────────────────────────────────
console.log("\n · A. API del alumno");
check("sin sesión → 401", (await api(null)("/api/estudiante/procedimientos")).status === 401);
check("un docente en la API del alumno → 403", (await A.api("/api/estudiante/procedimientos")).status === 403);
const listaDentro = (await json(await D("/api/estudiante/procedimientos"))).procedimientos ?? [];
check("el alumno de A ve el procedimiento PUBLICADO de A", listaDentro.some((p) => p.id === pubA.id));
check("…no ve el borrador de A", !listaDentro.some((p) => p.id === borradorA.id));
check("…ni el publicado de B (no está en su aula)", !listaDentro.some((p) => p.id === pubB.id));
const listaFuera = (await json(await F("/api/estudiante/procedimientos"))).procedimientos ?? [];
check("el alumno sin aula no ve ninguno de los privados", !listaFuera.some((p) => [pubA.id, pubB.id, borradorA.id].includes(p.id)));
check("el alumno sin aula recibe 404 al abrir el de A", (await F(`/api/estudiante/procedimientos/${pubA.id}`)).status === 404);
check("el alumno de A recibe 404 al abrir el borrador", (await D(`/api/estudiante/procedimientos/${borradorA.id}`)).status === 404);

const rDetalle = await D(`/api/estudiante/procedimientos/${pubA.id}`);
const textoDetalle = await rDetalle.text();
const detalle = JSON.parse(textoDetalle).procedimiento;
check("el detalle trae los pasos con sus términos", rDetalle.status === 200 && detalle?.pasos?.length === 3 && detalle.pasos[0].terminos.length === 2);
check("las RESPUESTAS no viajan al navegador", !textoDetalle.includes('"respuesta"') && !/"5\/6","?\s*,?\s*"?pistas/.test(textoDetalle.replace(/"escribe":"5\/6"/, "")));
check("…las pistas tampoco (sólo cuántas hay)", !textoDetalle.includes("Multiplica los denominadores") && detalle.preguntas[0].pistas === 2);
check("…y una pregunta sin respuesta se marca como no verificable", detalle.preguntas[2].verificable === false);

const responder = (pregunta, respuesta, cliente = D) => cliente(`/api/estudiante/procedimientos/${pubA.id}/responder`, { method: "POST", body: JSON.stringify({ pregunta, respuesta }) });
check("respuesta correcta → correcto: true", (await json(await responder(0, "6"))).correcto === true);
check("respuesta incorrecta → correcto: false", (await json(await responder(0, "7"))).correcto === false);
check("el servidor acepta formas equivalentes (2·3)", (await json(await responder(0, "2*3"))).correcto === true);
check("una fracción equivalente cuenta (10/12 = 5/6)", (await json(await responder(1, "10/12"))).correcto === true);
const rSinRef = await json(await responder(2, "sí"));
check("sin respuesta de referencia: no se inventa un veredicto", rSinRef.correcto === null && rSinRef.verificable === false);
check("pregunta inexistente → 404", (await responder(9, "x")).status === 404);
check("respuesta vacía → 400", (await responder(0, "  ")).status === 400);
check("el alumno sin aula no puede responder (404)", (await responder(0, "6", F)).status === 404);

const pista = (nivel, pregunta) => D(`/api/estudiante/procedimientos/${pubA.id}/pista`, { method: "POST", body: JSON.stringify(pregunta === undefined ? { nivel } : { pregunta, nivel }) });
const p0 = await json(await pista(0, 0));
const p1 = await json(await pista(1, 0));
const p2 = await json(await pista(2, 0));
check("las pistas salen de una en una, de la más suave a la más concreta", p0.pista === "Multiplica los denominadores." && p0.quedan === 1 && p1.pista === "Dos por tres." && p1.quedan === 0);
check("cuando se acaban, se dice (no se repite la última)", p2.pista === null && p2.quedan === 0);
check("sin pista propia en la pregunta, se usan las generales", (await json(await pista(0, 1))).pista === "Pista general uno.");
check("sin pregunta, pistas generales", (await json(await pista(1))).pista === "Pista general dos.");

// ── B. Navegador ─────────────────────────────────────────────────────────────
console.log("\n · B. Navegador real (Chrome) con voz guionizada");
const CHROME =
  process.env.QA_CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((r) => existsSync(r));
if (!CHROME) {
  check("hay un Chrome para la prueba de navegador (QA_CHROME)", false, "no se encontró Chrome");
  salir();
}
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const nav = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await nav.newContext({ viewport: { width: 1360, height: 1000 } });
// La cookie de sesión del alumno, sin pasar por el formulario de login.
await ctx.addCookies(
  alumnoDentro.sesion.split("; ").map((c) => {
    const i = c.indexOf("=");
    return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE };
  }),
);
// Voz sintética de guion + reconocimiento de voz falso.
await ctx.addInitScript(() => {
  const voz = { habladas: [], cancelaciones: 0, actual: null };
  window.__voz = voz;
  window.__pzVigilanciaMs = 3600000; // la prueba dispara onstart/onend a mano
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  window.SpeechSynthesisUtterance = Utterance;
  const sint = {
    getVoices: () => [{ lang: "es-ES", name: "Voz de prueba" }],
    speak(u) {
      voz.habladas.push(u.text);
      voz.actual = u;
    },
    cancel() {
      voz.cancelaciones++;
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: sint, configurable: true });
  window.__empezar = () => voz.actual?.onstart?.();
  window.__terminar = () => voz.actual?.onend?.();
  window.__dictado = "seis";
  // Chrome moderno expone también `SpeechRecognition` sin prefijo, y la pizarra
  // prefiere ese: se sustituyen los dos nombres.
  const Falso = class {
    start() {
      setTimeout(() => {
        this.onresult?.({ results: [[{ transcript: window.__dictado }]] });
        this.onend?.();
      }, 40);
    }
  };
  Object.defineProperty(window, "SpeechRecognition", { value: Falso, configurable: true });
  Object.defineProperty(window, "webkitSpeechRecognition", { value: Falso, configurable: true });
});
const pag = await ctx.newPage();
const errores = [];
pag.on("console", (m) => m.type() === "error" && errores.push(m.text()));
pag.on("pageerror", (e) => errores.push("PAGEERROR " + e.message));

const centro = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const caja = async (selector) => (await pag.locator(selector).first().boundingBox());
const laser = async () => {
  const r = await caja('[data-testid="laser"]');
  const objetivo = await pag.getAttribute('[data-testid="laser"]', "data-laser-objetivo");
  const opacidad = await pag.$eval('[data-testid="laser"]', (e) => getComputedStyle(e).opacity);
  return { ...centro(r), objetivo, visible: Number(opacidad) > 0.5 };
};
const dentro = (p, r, margen = 3) => p.x >= r.x - margen && p.x <= r.x + r.width + margen && p.y >= r.y - margen && p.y <= r.y + r.height + margen;
const voz = () => pag.evaluate(() => ({ habladas: [...window.__voz.habladas], cancelaciones: window.__voz.cancelaciones }));
const asentar = () => pag.waitForTimeout(700); // la transición del láser dura 450 ms

await pag.goto(`${BASE}/estudiante/pizarra/${pubA.id}`, { waitUntil: "networkidle" });
check("la pizarra abre para el alumno de A", (await pag.locator("text=Suma de fracciones (publicada de A)").count()) > 0);
await pag.waitForSelector('[data-profesor="2d"], [data-profesor="3d"]', { timeout: 20000 }).catch(() => {});
check("hay un profesor virtual en pantalla", (await pag.locator('[data-profesor]').count()) === 1);
const tipoProfe = await pag.getAttribute("[data-profesor]", "data-profesor");
check("…en 3D (WebGL) o, sin WebGL, con el profesor 2D de respaldo", tipoProfe === "3d" || tipoProfe === "2d", tipoProfe ?? "");
if (tipoProfe === "3d") {
  const px = await pag.evaluate(() => {
    const c = document.querySelector("[data-profesor] canvas");
    return c ? { w: c.width, h: c.height } : null;
  });
  check("…el lienzo 3D tiene tamaño y se está dibujando", px && px.w > 100 && px.h > 100, JSON.stringify(px));
}
check("antes de empezar la pizarra está vacía", (await pag.locator("[data-paso-expr]").count()) === 0);

// 1) Empezar: se encola el audio del paso 1, pero el láser NO se mueve hasta que suena.
await pag.click('[data-testid="alternar"]');
await pag.waitForSelector('[data-paso-expr="0"]');
let v = await voz();
check("al empezar se pide a la voz el texto del paso 1", v.habladas[0] === "Tenemos dos fracciones con distinto denominador.", JSON.stringify(v.habladas));
check("el láser NO señala nada mientras el audio no ha empezado", (await laser()).objetivo === "" && !(await laser()).visible);
await pag.evaluate(() => window.__empezar());
await asentar();
let l = await laser();
const exprPaso0 = await caja('[data-paso-expr="0"] .katex-html');
check("al EMPEZAR el audio, el láser señala la expresión del paso 1", l.objetivo === "paso:0" && l.visible && dentro(l, exprPaso0, 40), JSON.stringify(l));
check("hay dos términos tocables en el paso 1", (await pag.locator('[data-paso-expr="0"] .katex-html .pzt-0, [data-paso-expr="0"] .katex-html .pzt-1').count()) === 2);

// 2) Pasa al término 0.
await pag.evaluate(() => window.__terminar());
v = await voz();
check("al acabar el audio se encola la explicación del primer término", v.habladas[1] === "Medio.", JSON.stringify(v.habladas));
l = await laser();
check("…y el láser todavía no se ha movido (el audio no ha empezado)", l.objetivo === "paso:0");
await pag.evaluate(() => window.__empezar());
await asentar();
l = await laser();
const t0 = await caja('[data-paso-expr="0"] .katex-html .pzt-0');
check("al empezar, el láser aterriza DENTRO de la caja del término «1/2»", l.objetivo === "termino:0:0" && dentro(l, t0, 3), `láser ${JSON.stringify(l)} · término ${JSON.stringify(t0)}`);
check("…y el término queda resaltado", (await pag.locator(".pz-activo").count()) === 1);

// 3) Pausar: el láser se queda; un onend tardío no avanza.
const antesPausa = await voz();
await pag.click('[data-testid="alternar"]');
v = await voz();
check("pausar cancela la voz", v.cancelaciones > antesPausa.cancelaciones);
check("la pizarra marca «pausado»", (await pag.getAttribute('[data-testid="estado"]', "data-estado")) === "pausado");
await asentar();
l = await laser();
check("el láser SE QUEDA en el término mientras está en pausa", l.objetivo === "termino:0:0" && dentro(l, t0, 3));
const hablabaAntes = (await voz()).habladas.length;
await pag.evaluate(() => window.__terminar()); // el `onend` tardío del audio cancelado
v = await voz();
check("un `onend` tardío del audio cancelado NO avanza la narración", v.habladas.length === hablabaAntes && (await pag.getAttribute('[data-testid="estado"]', "data-indice")) === "1");

// 4) Reanudar: vuelve a decir el mismo segmento y el láser reempieza con él.
await pag.click('[data-testid="alternar"]');
v = await voz();
check("reanudar vuelve a decir el MISMO segmento desde el principio", v.habladas[v.habladas.length - 1] === "Medio.");
await pag.evaluate(() => window.__empezar());
await asentar();
l = await laser();
check("…y el láser reempieza con él, en el mismo término", l.objetivo === "termino:0:0" && dentro(l, t0, 3));

// 5) Repetir.
const n = (await voz()).habladas.length;
await pag.getByRole("button", { name: /⟲ Repetir/ }).click();
v = await voz();
check("repetir vuelve a decir el segmento en curso", v.habladas.length === n + 1 && v.habladas[v.habladas.length - 1] === "Medio.");

// 6) Seguir hasta el segundo término y comprobar que el láser va a otra caja.
await pag.evaluate(() => { window.__empezar(); window.__terminar(); });
await pag.evaluate(() => window.__empezar());
await asentar();
l = await laser();
const t1 = await caja('[data-paso-expr="0"] .katex-html .pzt-1');
check("el láser se mueve al término «1/3» cuando se nombra", l.objetivo === "termino:0:1" && dentro(l, t1, 3) && !dentro(l, t0, 0), JSON.stringify(l));

// 7) Tocar un término.
const indiceAntes = await pag.getAttribute('[data-testid="estado"]', "data-indice");
await pag.locator('[data-paso-expr="0"] .katex-html .pzt-0').first().click();
v = await voz();
check("tocar el término «1/2» dice SU explicación", v.habladas[v.habladas.length - 1] === "Medio.");
await pag.evaluate(() => window.__empezar());
await asentar();
l = await laser();
check("…señalándolo con el láser", l.objetivo === "termino:0:0" && dentro(l, t0, 3));
check("…y la leyenda muestra lo que se está diciendo", (await pag.textContent('[data-testid="leyenda"]')).includes("Medio."));
await pag.evaluate(() => window.__terminar());
check("al acabar se queda en pausa SIN mover la posición de la narración", (await pag.getAttribute('[data-testid="estado"]', "data-estado")) === "pausado" && (await pag.getAttribute('[data-testid="estado"]', "data-indice")) === indiceAntes);
await pag.locator('[data-termino-boton="0:1"]').click();
v = await voz();
check("el botón accesible de un término hace lo mismo que tocarlo", v.habladas[v.habladas.length - 1] === "Un tercio.");
await pag.evaluate(() => { window.__empezar(); window.__terminar(); });

// 8) Siguiente paso.
await pag.getByRole("button", { name: /Siguiente/ }).click();
await pag.waitForSelector('[data-paso-expr="1"]');
v = await voz();
check("«Siguiente» revela el paso 2 y lo dice", v.habladas[v.habladas.length - 1] === "Pasamos las dos a denominador seis.");
await pag.evaluate(() => window.__empezar());
await asentar();
l = await laser();
const exprPaso1 = await caja('[data-paso-expr="1"] .katex-html');
check("…el láser baja a la expresión del paso 2", l.objetivo === "paso:1" && dentro(l, exprPaso1, 40));
await pag.click('[data-testid="alternar"]'); // pausa para no seguir narrando

// 9) Pistas y respuestas.
console.log("\n · C. Pistas y respuestas en el navegador");
await pag.click('[data-testid="pista"]');
await pag.waitForSelector('[data-testid="pistas"] li');
check("«Pedir una pista» muestra la primera pista", (await pag.textContent('[data-testid="pistas"] li:nth-child(1)')) === "Multiplica los denominadores.");
await pag.click('[data-testid="pista"]');
await pag.waitForSelector('[data-testid="pistas"] li:nth-child(2)');
check("…y la segunda, más concreta", (await pag.textContent('[data-testid="pistas"] li:nth-child(2)')) === "Dos por tres.");
await pag.click('[data-testid="pista"]');
await pag.waitForSelector("text=No hay más pistas");
check("cuando se acaban, lo dice", true);
check("las pistas también se DICEN en voz alta", (await voz()).habladas.includes("Dos por tres."));

await pag.fill('input[aria-label="Tu respuesta"]', "7");
await pag.getByRole("button", { name: "Responder", exact: true }).click();
await pag.waitForSelector('[data-testid="veredicto"][data-tipo="mal"]');
check("una respuesta escrita incorrecta da un aviso amable", true);
await pag.fill('input[aria-label="Tu respuesta"]', "6");
await pag.getByRole("button", { name: "Responder", exact: true }).click();
await pag.waitForSelector('[data-testid="veredicto"][data-tipo="ok"]');
check("la correcta, un «¡Correcto!»", (await pag.textContent('[data-testid="veredicto"]')).includes("Correcto"));
check("…y el veredicto se dice en voz alta", (await voz()).habladas.includes("¡Correcto!"));

check("hay botón de responder HABLANDO", (await pag.locator('[data-testid="hablar"]').count()) === 1);
await pag.getByRole("button", { name: "Otra pregunta" }).click();
await pag.evaluate(() => (window.__dictado = "cinco sextos"));
// «cinco sextos» no es una respuesta numérica reconocible: se traduce lo seguro y el servidor decide.
await pag.evaluate(() => (window.__dictado = "diez entre doce"));
await pag.click('[data-testid="hablar"]');
await pag.waitForSelector('[data-testid="transcripcion"]');
check(
  "responder HABLANDO deja la TRANSCRIPCIÓN EDITABLE: no se corrige sola",
  (await pag.inputValue('input[aria-label="Tu respuesta"]')) === "10/12" && (await pag.locator('[data-testid="veredicto"][data-tipo="ok"]').count()) === 0,
);
await pag.fill('input[aria-label="Tu respuesta"]', "10/12");
await pag.getByRole("button", { name: "Responder", exact: true }).click();
const llegoVeredicto = await pag
  .waitForSelector('[data-testid="veredicto"][data-tipo="ok"]', { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
const textoVeredicto = await pag.locator('[data-testid="veredicto"]').first().textContent().catch(() => "(sin veredicto)");
check(
  "…el alumno la revisa, pulsa Responder: «diez entre doce» → 10/12 → correcto",
  llegoVeredicto && (await pag.inputValue('input[aria-label="Tu respuesta"]')) === "10/12",
  `veredicto: ${textoVeredicto} · campo: ${await pag.inputValue('input[aria-label="Tu respuesta"]')}`,
);

await pag.screenshot({ path: process.env.QA_CAPTURA || "pizarra-qa.png", fullPage: true });
check("sin errores de consola en toda la sesión", errores.length === 0, errores.slice(0, 3).join(" | "));

// Vista previa del docente.
const ctxDoc = await nav.newContext({ viewport: { width: 1360, height: 1000 } });
await ctxDoc.addCookies(A.sesion.split("; ").map((c) => ({ name: c.slice(0, c.indexOf("=")), value: c.slice(c.indexOf("=") + 1), url: BASE })));
const pagDoc = await ctxDoc.newPage();
await pagDoc.goto(`${BASE}/docente/procedimientos/${borradorA.id}/previa`, { waitUntil: "networkidle" });
check("el docente ve la VISTA PREVIA de su borrador", (await pagDoc.locator("text=Vista previa: Borrador de A").count()) > 0 && (await pagDoc.locator('[data-testid="tablero"]').count()) === 1);
const rOtro = await ctxDoc.request.get(`${BASE}/docente/procedimientos/${pubB.id}/previa`);
check("…y la vista previa del procedimiento de B da 404 para A", rOtro.status() === 404, `HTTP ${rOtro.status()}`);

await nav.close();
salir();
