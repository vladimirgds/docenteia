// PMV 3 · H3A — Demostración del Word, en Chrome real:
//
//   · Al tocar el 2 de 2(x+4), el tutor explica la DISTRIBUTIVA (señalándolo).
//   · El alumno abre una ANALOGÍA, VUELVE AL PASO y RESPONDE para continuar.
//   · Un término que se REPITE (la «x» de los dos miembros): el puntero señala la
//     APARICIÓN correcta al tocarla, al pausar, al repetir y al redimensionar
//     (escritorio → tableta → móvil).
//   · Identificadores estables por paso, miembro y aparición (clases pzm-/pza-).
//   · MEDICIÓN DEL DESFASE audio → láser (del `onstart` del audio al láser
//     colocado), con mediana, p95 y máximo.
//
//   node qa/pmv3-h3a-analogia.mjs      (con la app en marcha)
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
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

await exigirServidor();
const sufijo = Date.now().toString(36);
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) },
  });
const json = async (r) => r.json().catch(() => ({}));
const post = (a, ruta, cuerpo) => a(ruta, { method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const patch = (a, ruta, cuerpo) => a(ruta, { method: "PATCH", body: JSON.stringify(cuerpo ?? {}) });

console.log("\n · Preparación");
const admin = api(await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026"));
const institucion = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio H3A ${sufijo}` }))).institucion;
const email = `qa.h3a.doc.${sufijo}@mentoriamath.local`;
const u = (await json(await post(admin, "/api/admin/usuarios", { nombre: "QA H3A Docente", email, password: "Docente-2026", rol: "DOCENTE" }))).usuario;
await patch(admin, `/api/admin/usuarios/${u?.id}`, { institucionId: institucion?.id });
const A = api(await iniciarSesion(BASE, email, "Docente-2026"));
const bancos = (await json(await A("/api/docente/bancos"))).bancos ?? [];
const tema = bancos.find((b) => b.tema.clave === "ecuaciones-lineales")?.tema;
check("docente y tema de ecuaciones listos", Boolean(tema?.id));

const DISTRIBUTIVA = "Este 2 multiplica a TODO el paréntesis: por la propiedad distributiva, 2 por x más 2 por 4.";
const ANALOGIA = "Es como repartir 2 bolsas iguales, cada una con una manzana x y 4 naranjas: en total tienes 2 manzanas y 8 naranjas.";
const pasos = [
  {
    explica: "Esta es la ecuación. Primero quitamos el paréntesis.",
    escribe: "2(x + 4) = 3x - 1",
    tipo: "transformacion",
    terminos: [
      { texto: "2", explica: DISTRIBUTIVA, analogia: ANALOGIA },
      { texto: "x", aparicion: 1, explica: "La x del miembro izquierdo, dentro del paréntesis." },
      { texto: "x", aparicion: 2, explica: "La x del miembro derecho, multiplicada por 3." },
    ],
  },
  { explica: "Repartimos el 2.", escribe: "2x + 8 = 3x - 1", tipo: "transformacion", regla: "propiedad distributiva" },
  { explica: "Pasamos las x a un lado y los números al otro.", escribe: "8 + 1 = 3x - 2x", tipo: "transformacion" },
  { explica: "Y queda la solución.", escribe: "x = 9", tipo: "resultado" },
];
const rProc = await post(A, "/api/docente/procedimientos", {
  nodoId: tema.id,
  titulo: `Distributiva ${sufijo}`,
  ejemplo: "2(x + 4) = 3x - 1",
  pasos,
  preguntas: [{ enunciado: "¿Cuánto vale x?", respuesta: "9", pistas: ["Despeja la x."] }],
  pistas: ["Quita primero el paréntesis."],
});
const proc = (await json(rProc)).procedimiento;
check("el docente guarda el procedimiento con analogía y apariciones", rProc.status === 201 && Boolean(proc?.id), `HTTP ${rProc.status} ${JSON.stringify(await json(rProc)).slice(0, 200)}`);
const rPub = await patch(A, `/api/docente/procedimientos/${proc?.id}`, { estado: "PUBLICADO" });
check("…y lo publica (el motor verifica los pasos)", rPub.status === 200, `HTTP ${rPub.status} ${JSON.stringify(await json(rPub)).slice(0, 300)}`);
const rMalo = await post(A, "/api/docente/procedimientos/probar", {
  nodoId: tema.id,
  ejemplo: "2(x + 4) = 3x - 1",
  pasos: [{ ...pasos[0], terminos: [{ texto: "x", aparicion: 3, explica: "No existe." }] }, pasos[3]],
});
const infMalo = (await json(rMalo)).informe;
check("una aparición que no existe se rechaza al probar («no aparece 3 veces»)", JSON.stringify(infMalo ?? {}).includes("no aparece 3 veces"), JSON.stringify(infMalo ?? {}).slice(0, 200));

const aula = (await json(await post(A, "/api/docente/aulas", { nombre: `Aula H3A ${sufijo}`, grado: 3, seccion: "A" }))).aula;
const alumno = await registrarAlumno(BASE, { email: `qa.h3a.al.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "QA H3A Alumno", ciclo: "Secundaria", grado: "3" });
await post(api(alumno.sesion), "/api/estudiante/unirse", { codigoAcceso: aula?.codigoAcceso });

console.log("\n · Navegador real (Chrome) con voz guionizada");
const CHROME =
  process.env.QA_CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((r) => existsSync(r));
if (!CHROME) {
  check("hay un Chrome para la prueba (QA_CHROME)", false);
  await salir();
}
const { chromium } = createRequire(import.meta.url)("playwright-core");
nav = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await nav.newContext({ viewport: { width: 1360, height: 1000 } });
await ctx.addCookies(alumno.sesion.split("; ").map((c) => ({ name: c.slice(0, c.indexOf("=")), value: c.slice(c.indexOf("=") + 1), url: BASE })));
await ctx.addInitScript(() => {
  const voz = { habladas: [], cancelaciones: 0, actual: null };
  window.__voz = voz;
  window.__pzVigilanciaMs = 3600000;
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  Object.defineProperty(window, "speechSynthesis", {
    value: { getVoices: () => [{ lang: "es-ES", name: "Voz de prueba" }], speak: (u) => (voz.habladas.push(u.text), (voz.actual = u)), cancel: () => voz.cancelaciones++ },
    configurable: true,
  });
  window.__empezar = () => voz.actual?.onstart?.();
  window.__terminar = () => voz.actual?.onend?.();
});
const pag = await ctx.newPage();
const errores = [];
pag.on("pageerror", (e) => errores.push("PAGEERROR " + e.message));
pag.on("console", (m) => m.type() === "error" && errores.push(m.text()));

const caja = async (sel) => pag.locator(sel).first().boundingBox();
const laser = async () => {
  const r = await caja('[data-testid="laser"]');
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, objetivo: await pag.getAttribute('[data-testid="laser"]', "data-laser-objetivo") };
};
const dentro = (p, r, m = 3) => p.x >= r.x - m && p.x <= r.x + r.width + m && p.y >= r.y - m && p.y <= r.y + r.height + m;
const ultimaVoz = async () => pag.evaluate(() => window.__voz.habladas.at(-1));
const asentar = () => pag.waitForTimeout(700);
const leyenda = async () => (await pag.textContent('[data-testid="leyenda"]')) ?? "";

await pag.goto(`${BASE}/estudiante/pizarra/${proc.id}`, { waitUntil: "networkidle" });
await pag.click('[data-testid="alternar"]');
await pag.waitForSelector('[data-paso-expr="0"]');
await pag.evaluate(() => window.__empezar());
await asentar();

// Identificadores estables.
check(
  "cada término lleva su id estable: paso, miembro y aparición",
  (await pag.locator('[data-paso-expr="0"] .pzt-0.pzm-0.pza-1').count()) === 1 &&
    (await pag.locator('[data-paso-expr="0"] .pzt-1.pzm-0.pza-1').count()) === 1 &&
    (await pag.locator('[data-paso-expr="0"] .pzt-2.pzm-1.pza-2').count()) === 1,
);

// 1) Tocar el 2 → distributiva.
await pag.click('[data-termino-boton="0:0"]');
check("tocar el 2 de 2(x+4) → el tutor dice la explicación de la DISTRIBUTIVA", (await ultimaVoz()) === DISTRIBUTIVA);
await pag.evaluate(() => window.__empezar());
await asentar();
let l = await laser();
check("…señalando el 2 con el láser", l.objetivo === "termino:0:0" && dentro(l, await caja('[data-paso-expr="0"] .pzt-0')), JSON.stringify(l));
check("…y con la explicación en pantalla", (await leyenda()).includes("distributiva"));

// 2) Analogía → volver al paso.
check("aparece «Ver una analogía»", (await pag.locator('[data-testid="analogia"]').count()) === 1);
await pag.click('[data-testid="analogia"]');
check("abrir la analogía la dice en voz alta", (await ultimaVoz()) === ANALOGIA);
await pag.evaluate(() => window.__empezar());
await pag.evaluate(() => window.__terminar());
await asentar();
check("…y la deja a la vista aunque termine el audio", (await leyenda()).includes("bolsas"));
await pag.click('[data-testid="volver-paso"]');
check("«Volver al paso» retoma la narración del paso donde iba", (await ultimaVoz()) === pasos[0].explica && (await pag.getAttribute('[data-testid="estado"]', "data-estado")) === "hablando");
check("…y retira la analogía", !(await leyenda()).includes("bolsas"));

// 3) La x repetida: aparición correcta al tocar, pausar, repetir y redimensionar.
await pag.click('[data-termino-boton="0:2"]');
await pag.evaluate(() => window.__empezar());
await asentar();
const x1 = await caja('[data-paso-expr="0"] .pzt-1');
let x2 = await caja('[data-paso-expr="0"] .pzt-2');
l = await laser();
check("tocar la x del miembro DERECHO → el láser va a ESA x, no a la primera", l.objetivo === "termino:0:2" && dentro(l, x2) && !dentro(l, x1) && x2.x > x1.x, JSON.stringify({ l, x1, x2 }));
await pag.evaluate(() => window.__terminar()); // acaba la explicación → queda en pausa en su sitio
await asentar();
l = await laser();
check("en pausa, el láser se queda en la segunda x", (await pag.getAttribute('[data-testid="estado"]', "data-estado")) === "pausado" && dentro(l, x2));
await pag.click('[data-termino-boton="0:2"]'); // repetir la explicación del término
await pag.evaluate(() => window.__empezar());
await asentar();
l = await laser();
check("al repetirla, vuelve a la segunda x", dentro(l, await caja('[data-paso-expr="0"] .pzt-2')));
for (const [nombre, w, h] of [["tableta", 820, 1000], ["móvil", 390, 844], ["escritorio", 1360, 1000]]) {
  await pag.setViewportSize({ width: w, height: h });
  await pag.waitForTimeout(900);
  l = await laser();
  x2 = await caja('[data-paso-expr="0"] .pzt-2');
  check(`al redimensionar a ${nombre} (${w}px), el láser sigue sobre la segunda x`, dentro(l, x2, 4), JSON.stringify({ l, x2 }));
}

// 4) Responder para continuar.
await pag.click('[data-testid="volver-paso"]');
await pag.fill('input[aria-label="Tu respuesta"]', "9");
await pag.getByRole("button", { name: "Responder", exact: true }).click();
await pag.waitForSelector('[data-testid="veredicto"]');
check("el alumno responde «9» y el servidor lo da por correcto", (await pag.getAttribute('[data-testid="veredicto"]', "data-tipo")) === "ok");

// 5) Recorrido completo de la lección para medir el desfase.
await pag.click('[data-testid="alternar"]').catch(() => {});
for (let i = 0; i < 12; i++) {
  await pag.evaluate(() => window.__empezar());
  await pag.waitForTimeout(120);
  await pag.evaluate(() => window.__terminar());
  await pag.waitForTimeout(60);
}
const desfases = await pag.evaluate(() => window.__pzDesfases ?? []);
const ord = [...desfases].sort((a, b) => a - b);
const pct = (p) => ord[Math.min(ord.length - 1, Math.floor((p / 100) * ord.length))];
const medida = { muestras: ord.length, medianaMs: pct(50), p95Ms: pct(95), maximoMs: ord.at(-1), transicionVisualMs: 450 };
console.log(`    desfase audio → láser: ${JSON.stringify(medida)}`);
check("se midió el desfase en al menos 8 locuciones", ord.length >= 8, String(ord.length));
check("desfase audio → láser colocado: p95 por debajo de 100 ms", medida.p95Ms < 100, JSON.stringify(medida));
mkdirSync("qa/evidencia", { recursive: true });
writeFileSync("qa/evidencia/desfase-laser.json", JSON.stringify({ fecha: new Date().toISOString(), navegador: "Chrome headless (Playwright)", ...medida, muestrasMs: ord.map((x) => Math.round(x * 10) / 10) }, null, 2));
await pag.screenshot({ path: "qa/evidencia/h3a-analogia.png", fullPage: true });
check("sin errores de consola", errores.length === 0, errores.slice(0, 3).join(" | "));

await salir();
