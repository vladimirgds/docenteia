// PMV 3 · HITO 2 — la práctica guiada en un NAVEGADOR REAL (Chrome).
//
// El recorrido del Word: en 2(x+4)=3x-1 el sistema acepta 2x+8=3x-1, rechaza
// 2x+4=3x-1 y explica el error; y si el alumno pide la solución en práctica
// guiada recibe la ayuda prevista por la política (no la solución).
//
//   node qa/pmv3-hito2-navegador.mjs

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
  for (const f of fallos) console.log(`   · ${f}`);
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(fallos.length > 0 ? 1 : 0);
}

await exigirServidor();
const CHROME =
  process.env.QA_CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((r) => existsSync(r));
if (!CHROME) {
  check("hay un Chrome para la prueba (QA_CHROME)", false, "no se encontró");
  salir();
}
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const sufijo = Date.now().toString(36);
const al = await registrarAlumno(BASE, { email: `qa.h2nav.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "Alumno H2 Nav", ciclo: "Secundaria", grado: "3" });
check("se registra un alumno", al.ok);
// Todo alumno hace primero la evaluación inicial (el producto lo exige): se completa por la API.
const emailAl = `qa.h2nav.${sufijo}@mentoriamath.local`;
await fetch(`${BASE}/api/estudiante/nivel-educativo`, { method: "PUT", headers: { "Content-Type": "application/json", cookie: al.sesion }, body: JSON.stringify({ etapa: "SECUNDARIA", curso: 3 }) });
const prueba = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: al.sesion } })).json();
await fetch(`${BASE}/api/diagnostico`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: al.sesion },
  body: JSON.stringify({ respuestas: (prueba.preguntas ?? []).map((q) => ({ preguntaId: q.id, respuestaDada: q.tipo === "opcion_multiple" ? "a" : "0" })) }),
});
al.sesion = (await iniciarSesion(BASE, emailAl, "Alumno-2026")) ?? al.sesion; // el nivel viaja en el JWT

const nav = await chromium.launch({ executablePath: CHROME, headless: true });
async function sesionDe(viewport) {
  const ctx = await nav.newContext({ viewport });
  await ctx.addCookies(al.sesion.split("; ").map((c) => ({ name: c.slice(0, c.indexOf("=")), value: c.slice(c.indexOf("=") + 1), url: BASE })));
  const pag = await ctx.newPage();
  const errores = [];
  pag.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  pag.on("pageerror", (e) => errores.push("PAGEERROR " + e.message));
  return { ctx, pag, errores };
}

// ── Escritorio ───────────────────────────────────────────────────────────────
console.log("\n · Escritorio (1280×900)");
const { ctx, pag, errores } = await sesionDe({ width: 1280, height: 900 });
await pag.goto(`${BASE}/estudiante`, { waitUntil: "networkidle" });
check("la portada del alumno ofrece la práctica guiada", (await pag.getByRole("link", { name: "Practicar paso a paso" }).count()) === 1);
await pag.getByRole("link", { name: "Practicar paso a paso" }).click();
await pag.waitForURL(/practica-guiada/);
await pag.getByRole("button", { name: "Empezar" }).click();
await pag.getByTestId("enunciado").waitFor();
check("se abre la práctica: Paso 1 de 4", /Paso 1 de 4/.test(await pag.getByTestId("progreso").innerText()));
check("el enunciado se pinta con KaTeX", (await pag.getByTestId("enunciado").locator(".katex").count()) > 0);

const campo = pag.getByLabel("Tu siguiente paso");
await campo.fill("2x+4=3x-1");
await pag.getByRole("button", { name: "Comprobar paso" }).click();
await pag.getByTestId("paso-rechazado").waitFor();
const msg1 = await pag.getByTestId("mensaje-tutor").innerText();
check("RECHAZA 2x+4=3x-1: queda marcado en rojo", (await pag.getByTestId("paso-rechazado").count()) === 1);
check("…y el tutor explica el error (el 2 multiplica a todos los términos)", /multiplica a TODOS/.test(msg1) && /4 quedó sin multiplicar/.test(msg1), msg1);

await pag.getByRole("button", { name: "Quiero la solución" }).click();
await pag.waitForFunction(() => /Una pista/.test(document.querySelector('[data-testid="tutor"]')?.textContent ?? ""));
const cuerpo = await pag.locator("main, body").first().innerText();
check("pide la solución → recibe una PISTA (la ayuda prevista)", /una pista/i.test(cuerpo));
check("…y la página NO muestra la solución (ni «x = 9» ni el paso correcto)", !/x\s*=\s*9/.test(await pag.getByTestId("tutor").innerText()) && !/2x\s*\+\s*8/.test(await pag.getByTestId("tutor").innerText()));

await campo.fill("2x+8=3x-1");
await pag.getByRole("button", { name: "Comprobar paso" }).click();
await pag.waitForFunction(() => /Paso 2 de 4/.test(document.querySelector('[data-testid="progreso"]')?.textContent ?? ""));
check("ACEPTA 2x+8=3x-1: pasa a la lista con ✓ y el progreso avanza", (await pag.getByTestId("pasos").locator("li").count()) === 1 && /Paso 2 de 4/.test(await pag.getByTestId("progreso").innerText()));
check("…y el paso rechazado desaparece", (await pag.getByTestId("paso-rechazado").count()) === 0);

await campo.fill("2x-3x=-1-8");
await pag.getByRole("button", { name: "Comprobar paso" }).click();
await pag.waitForFunction(() => /Paso 3 de 4/.test(document.querySelector('[data-testid="progreso"]')?.textContent ?? ""));
await campo.fill("-x=-9");
await pag.getByRole("button", { name: "Comprobar paso" }).click();
await pag.waitForFunction(() => /Paso 4 de 4/.test(document.querySelector('[data-testid="progreso"]')?.textContent ?? ""));
await campo.fill("x=9");
await pag.getByRole("button", { name: "Comprobar paso" }).click();
await pag.getByTestId("resuelta").waitFor();
check("llega a x = 9 y la práctica queda «¡Resuelta!»", (await pag.getByTestId("resuelta").count()) === 1);
await pag.screenshot({ path: "qa/evidencia/practica-guiada-escritorio.png", fullPage: true });
check("sin errores de consola", errores.length === 0, errores.slice(0, 2).join(" | "));
await ctx.close();

// ── Móvil ────────────────────────────────────────────────────────────────────
console.log("\n · Móvil (390×800)");
const movil = await sesionDe({ width: 390, height: 800 });
await movil.pag.goto(`${BASE}/estudiante/practica-guiada`, { waitUntil: "networkidle" });
await movil.pag.getByRole("button", { name: "Empezar" }).click();
await movil.pag.getByTestId("enunciado").waitFor();
await movil.pag.getByLabel("Tu siguiente paso").fill("2x+4=3x-1");
await movil.pag.getByRole("button", { name: "Comprobar paso" }).click();
await movil.pag.getByTestId("paso-rechazado").waitFor();
const desborda = await movil.pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("en móvil no hay scroll horizontal", !desborda);
check("…y los botones de ayuda son visibles", (await movil.pag.getByRole("button", { name: "Quiero la solución" }).isVisible()));
await movil.pag.screenshot({ path: "qa/evidencia/practica-guiada-movil.png", fullPage: true });
check("sin errores de consola en móvil", movil.errores.length === 0, movil.errores.slice(0, 2).join(" | "));
await movil.ctx.close();

// ── Evaluación: sin ayudas ───────────────────────────────────────────────────
console.log("\n · Modo evaluación");
const ev = await sesionDe({ width: 1280, height: 900 });
await ev.pag.goto(`${BASE}/estudiante/practica-guiada`, { waitUntil: "networkidle" });
await ev.pag.getByLabel("Modo").selectOption("EVALUACION");
await ev.pag.getByRole("button", { name: "Empezar" }).click();
await ev.pag.getByTestId("enunciado").waitFor();
check("en evaluación los botones de ayuda están desactivados", (await ev.pag.getByRole("button", { name: "Pista" }).isDisabled()) && (await ev.pag.getByRole("button", { name: "Quiero la solución" }).isDisabled()));
await ev.ctx.close();

await nav.close();
salir();
