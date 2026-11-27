// PMV 3 · H3B — PROFESOR VIRTUAL 3D, en Chrome real (escritorio y móvil).
//
//   · Personaje GLB con esqueleto y expresiones, cargado BAJO DEMANDA (en modo
//     2D el .glb ni se pide).
//   · Explica (boca con las MARCAS de la voz), SEÑALA (brazo + RAYO que termina
//     sobre el término activo), PREGUNTA, ESPERA y da una PISTA.
//   · El mismo recorrido en 2D (respaldo).
//
//   node qa/pmv3-h3b-profesor.mjs      (con la app en marcha)
import { existsSync, mkdirSync, statSync } from "node:fs";
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
let nav = null;
async function salir() {
  await nav?.close().catch(() => {});
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
  if (fallos.length > 0) {
    console.log("\n Fallos:");
    for (const f of fallos) console.log(`   · ${f}`);
  }
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(fallos.length > 0 ? 1 : 0);
}

console.log("\n · El modelo");
const glb = "public/modelos/profesor/profesor.glb";
check("el modelo GLB está en el proyecto, con su licencia", existsSync(glb) && statSync(glb).size > 100_000 && existsSync("public/modelos/profesor/LICENCIA.md"));

await exigirServidor();
const sufijo = Date.now().toString(36);
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) } });
const json = async (r) => r.json().catch(() => ({}));
const post = (a, ruta, cuerpo) => a(ruta, { method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const patch = (a, ruta, cuerpo) => a(ruta, { method: "PATCH", body: JSON.stringify(cuerpo ?? {}) });

const admin = api(await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026"));
const inst = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio H3B ${sufijo}` }))).institucion;
const email = `qa.h3b.doc.${sufijo}@mentoriamath.local`;
const u = (await json(await post(admin, "/api/admin/usuarios", { nombre: "QA H3B", email, password: "Docente-2026", rol: "DOCENTE" }))).usuario;
await patch(admin, `/api/admin/usuarios/${u?.id}`, { institucionId: inst?.id });
const A = api(await iniciarSesion(BASE, email, "Docente-2026"));
const tema = ((await json(await A("/api/docente/bancos"))).bancos ?? []).find((b) => b.tema.clave === "fracciones")?.tema;
const proc = (
  await json(
    await post(A, "/api/docente/procedimientos", {
      nodoId: tema.id,
      titulo: `Profesor 3D ${sufijo}`,
      ejemplo: "1/2 + 1/3",
      pasos: [
        { explica: "Tenemos dos fracciones con distinto denominador.", escribe: "1/2 + 1/3", tipo: "transformacion", terminos: [{ texto: "1/3", explica: "Un tercio." }] },
        { explica: "Pasamos a sextos.", escribe: "3/6 + 2/6", tipo: "transformacion" },
        { explica: "Sumamos los numeradores.", escribe: "5/6", tipo: "resultado" },
      ],
      preguntas: [{ enunciado: "Escribe el resultado.", respuesta: "5/6", pistas: ["Suma los numeradores."] }],
      pistas: ["Busca un denominador común."],
    }),
  )
).procedimiento;
await patch(A, `/api/docente/procedimientos/${proc?.id}`, { estado: "PUBLICADO" });
const aula = (await json(await post(A, "/api/docente/aulas", { nombre: `Aula H3B ${sufijo}`, grado: 3, seccion: "A" }))).aula;
const alumno = await registrarAlumno(BASE, { email: `qa.h3b.al.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "QA H3B", ciclo: "Secundaria", grado: "3" });
await post(api(alumno.sesion), "/api/estudiante/unirse", { codigoAcceso: aula?.codigoAcceso });
check("procedimiento publicado y alumno en el aula", Boolean(proc?.id && aula?.id && alumno.ok));

const CHROME =
  process.env.QA_CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((r) => existsSync(r));
if (!CHROME) {
  check("hay Chrome (QA_CHROME)", false);
  await salir();
}
const { chromium } = createRequire(import.meta.url)("playwright-core");
nav = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function abrir(viewport, { modo2d = false } = {}) {
  const ctx = await nav.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await ctx.addCookies(alumno.sesion.split("; ").map((c) => ({ name: c.slice(0, c.indexOf("=")), value: c.slice(c.indexOf("=") + 1), url: BASE })));
  await ctx.addInitScript((m2d) => {
    if (m2d) localStorage.setItem("pz-profesor", "2d");
    const voz = { habladas: [], actual: null };
    window.__voz = voz;
    window.__pzVigilanciaMs = 3600000;
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: { getVoices: () => [{ lang: "es-ES", name: "Voz de prueba" }], speak: (u) => (voz.habladas.push(u.text), (voz.actual = u)), cancel: () => {} },
      configurable: true,
    });
    window.__empezar = () => voz.actual?.onstart?.();
    window.__terminar = () => voz.actual?.onend?.();
    window.__marca = (i) => voz.actual?.onboundary?.({ charIndex: i ?? 0 });
  }, modo2d);
  const pag = await ctx.newPage();
  const errores = [];
  const pedidos = [];
  pag.on("pageerror", (e) => errores.push("PAGEERROR " + e.message));
  pag.on("console", (m) => m.type() === "error" && !/WebGL|GPU stall|swiftshader/i.test(m.text()) && errores.push(m.text()));
  pag.on("request", (r) => pedidos.push(r.url()));
  await pag.goto(`${BASE}/estudiante/pizarra/${proc.id}`, { waitUntil: "networkidle" });
  await pag.waitForSelector('[data-profesor="2d"], [data-profesor="3d"]', { timeout: 20000 });
  if (!modo2d) await pag.waitForSelector('[data-profesor="3d"][data-modelo="glb"]', { timeout: 20000 }).catch(() => {});
  return { ctx, pag, errores, pedidos };
}

const atr = (pag, n) => pag.getAttribute("[data-profesor]", n);
const caja = (pag, s) => pag.locator(s).first().boundingBox();
const dentro = (p, r, m = 4) => r && p.x >= r.x - m && p.x <= r.x + r.width + m && p.y >= r.y - m && p.y <= r.y + r.height + m;
const rayo = async (pag) => {
  const l = pag.locator('[data-testid="rayo"]');
  const n = async (a) => Number(await l.getAttribute(a));
  return { on: (await l.getAttribute("data-rayo")) === "on", ini: { x: await n("x1"), y: await n("y1") }, fin: { x: await n("x2"), y: await n("y2") } };
};

async function recorrido(etiqueta, pag, tipo) {
  console.log(`\n · Recorrido ${etiqueta}`);
  check(`${etiqueta}: el profesor es ${tipo}`, (await atr(pag, "data-profesor")) === tipo, await atr(pag, "data-profesor"));
  if (tipo === "3d") {
    await pag.waitForSelector('[data-profesor="3d"][data-modelo="glb"]', { timeout: 20000 }).catch(() => {});
    check(`${etiqueta}: el modelo GLB está cargado y dibujándose`, (await atr(pag, "data-modelo")) === "glb");
    const lienzo = await caja(pag, "[data-profesor] canvas");
    check(`${etiqueta}: …en un lienzo con tamaño`, lienzo && lienzo.width > 100 && lienzo.height > 100, JSON.stringify(lienzo));
  }
  // EXPLICA, con la boca siguiendo las marcas de la voz.
  await pag.click('[data-testid="alternar"]');
  await pag.waitForSelector('[data-paso-expr="0"]');
  await pag.evaluate(() => window.__empezar());
  await pag.waitForTimeout(300);
  check(`${etiqueta}: EXPLICA el paso`, (await atr(pag, "data-gesto")) === "explica" && (await atr(pag, "data-hablando")) === "true");
  const marcasAntes = Number((await atr(pag, "data-marcas")) ?? 0);
  await pag.evaluate(() => window.__marca(5));
  await pag.waitForTimeout(30);
  const boca = Number(await atr(pag, "data-boca"));
  await pag.evaluate(() => window.__marca(12));
  await pag.waitForTimeout(100);
  check(`${etiqueta}: la boca se mueve con las MARCAS de la voz`, Number(await atr(pag, "data-marcas")) === marcasAntes + 2 && boca > 0.5, JSON.stringify({ marcasAntes, boca }));
  // SEÑALA el término: brazo + rayo que termina sobre él.
  await pag.evaluate(() => window.__terminar());
  await pag.evaluate(() => window.__empezar());
  await pag.waitForTimeout(900);
  await pag.waitForSelector('[data-testid="rayo"][data-rayo="on"]', { timeout: 5000 }).catch(() => {});
  await pag.waitForTimeout(500); // el brazo y el láser terminan de llegar
  check(`${etiqueta}: SEÑALA el término que nombra`, (await atr(pag, "data-gesto")) === "senala");
  let r = await rayo(pag);
  const termino = await caja(pag, '[data-paso-expr="0"] .pzt-0');
  const profe = await caja(pag, "[data-profesor]");
  check(`${etiqueta}: el RAYO termina sobre el término activo`, r.on && dentro(r.fin, termino), JSON.stringify({ r, termino }));
  check(`${etiqueta}: …y sale de la mano del profesor`, dentro(r.ini, profe, 2), JSON.stringify({ ini: r.ini, profe }));
  // PREGUNTA y ESPERA al terminar la explicación.
  for (let i = 0; i < 4; i++) {
    await pag.evaluate(() => window.__terminar());
    await pag.evaluate(() => window.__empezar());
    await pag.waitForTimeout(80);
  }
  await pag.evaluate(() => window.__terminar());
  await pag.waitForTimeout(300);
  check(`${etiqueta}: al acabar, PREGUNTA`, (await atr(pag, "data-gesto")) === "pregunta");
  check(`${etiqueta}: …sin rayo`, !(await rayo(pag)).on);
  await pag.waitForTimeout(2800);
  check(`${etiqueta}: …y ESPERA la respuesta`, (await atr(pag, "data-gesto")) === "espera");
  // Da una PISTA.
  await pag.click('[data-testid="pista"]');
  await pag.waitForSelector('[data-profesor][data-gesto="pista"]', { timeout: 6000 }).catch(() => {});
  check(`${etiqueta}: da una PISTA`, (await atr(pag, "data-gesto")) === "pista");
}

// Escritorio, 3D.
const e3 = await abrir({ width: 1360, height: 1000 });
check("3D: el modelo .glb se pide al abrir la pizarra (bajo demanda)", e3.pedidos.some((x) => x.includes("/modelos/profesor/profesor.glb")));
await recorrido("escritorio 3D", e3.pag, "3d");
mkdirSync("qa/evidencia", { recursive: true });
await e3.pag.screenshot({ path: "qa/evidencia/profesor-3d-escritorio.png" });
// Cambiar a 2D desde la propia pizarra.
await e3.pag.click('[data-testid="modo-profesor"]');
await e3.pag.waitForTimeout(300);
check("el alumno puede cambiar a 2D desde la pizarra", (await atr(e3.pag, "data-profesor")) === "2d");
check("escritorio: sin errores de consola", e3.errores.length === 0, e3.errores.slice(0, 3).join(" | "));
await e3.ctx.close();

// Escritorio, 2D: el recorrido entero, y el .glb NI SE PIDE.
const e2 = await abrir({ width: 1360, height: 1000 }, { modo2d: true });
check("2D: el modelo 3D no se descarga", !e2.pedidos.some((x) => x.includes("profesor.glb")));
await recorrido("escritorio 2D", e2.pag, "2d");
await e2.pag.screenshot({ path: "qa/evidencia/profesor-2d-escritorio.png" });
check("2D: sin errores de consola", e2.errores.length === 0, e2.errores.slice(0, 3).join(" | "));
await e2.ctx.close();

// Móvil, 3D.
const m3 = await abrir({ width: 390, height: 844 });
await recorrido("móvil 3D", m3.pag, "3d");
await m3.pag.screenshot({ path: "qa/evidencia/profesor-3d-movil.png", fullPage: true });
check("móvil: sin errores de consola", m3.errores.length === 0, m3.errores.slice(0, 3).join(" | "));
await m3.ctx.close();

await salir();
