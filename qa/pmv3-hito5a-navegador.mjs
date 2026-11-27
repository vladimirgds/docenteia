// PMV 3 · HITO 5A — el editor de métodos en un NAVEGADOR REAL (Chrome).
//
// El recorrido del Word, tal como lo hace una persona desde el panel, sin tocar
// código ni desplegar:
//   1. «Suma de fracciones»: el docente pide un borrador a la IA, lo revisa, lo
//      aprueba y lo publica.
//   2. Regla de la cadena: el docente TECLEA la ficha a mano en el editor
//      (patrón, variables, condiciones, pasos, ejemplos, pista si omite 6x), la
//      prueba con el motor, y la publica.
//   3. Reutiliza el método con (5x^3-2)^2 y el motor valida el ejercicio nuevo.
//   4. Versiones: editar crea una versión; restaurar una antigua crea otra.
//   5. El alumno omite 6x y recibe la pista; con la respuesta correcta, acierta.
//
//   node qa/pmv3-hito5a-navegador.mjs        (app SIN GEMINI_API_KEY)

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
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) } });
const json = async (r) => r.json().catch(() => ({}));
const post = (a, ruta, cuerpo) => a(ruta, { method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const cookiesDe = (sesion) => sesion.split("; ").map((c) => ({ name: c.slice(0, c.indexOf("=")), value: c.slice(c.indexOf("=") + 1), url: BASE }));

// ── Preparación por API ──────────────────────────────────────────────────────
const sesionAdmin = await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026");
const admin = api(sesionAdmin);
const institucion = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio H5A Nav ${sufijo}` }))).institucion;
const emailDoc = `qa.h5anav.doc.${sufijo}@mentoriamath.local`;
const doc = (await json(await post(admin, "/api/admin/usuarios", { nombre: "Docente H5A Nav", email: emailDoc, password: "Docente-2026", rol: "DOCENTE" }))).usuario;
await admin(`/api/admin/usuarios/${doc?.id}`, { method: "PATCH", body: JSON.stringify({ institucionId: institucion?.id }) });
const sesionDoc = await iniciarSesion(BASE, emailDoc, "Docente-2026");
const aula = (await json(await post(api(sesionDoc), "/api/docente/aulas", { nombre: `Aula H5A Nav ${sufijo}`, grado: 3, seccion: "A" }))).aula;
check("hay un docente con su aula", Boolean(sesionDoc && aula?.codigoAcceso));

const emailAl = `qa.h5anav.al.${sufijo}@mentoriamath.local`;
const al = await registrarAlumno(BASE, { email: emailAl, password: "Alumno-2026", nombre: "Alumno H5A Nav", ciclo: "Secundaria", grado: "3" });
await fetch(`${BASE}/api/estudiante/nivel-educativo`, { method: "PUT", headers: { "Content-Type": "application/json", cookie: al.sesion }, body: JSON.stringify({ etapa: "SECUNDARIA", curso: 3 }) });
const prueba = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: al.sesion } })).json();
await fetch(`${BASE}/api/diagnostico`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: al.sesion },
  body: JSON.stringify({ respuestas: (prueba.preguntas ?? []).map((q) => ({ preguntaId: q.id, respuestaDada: q.tipo === "opcion_multiple" ? "a" : "0" })) }),
});
al.sesion = (await iniciarSesion(BASE, emailAl, "Alumno-2026")) ?? al.sesion;
await post(api(al.sesion), "/api/estudiante/unirse", { codigoAcceso: aula.codigoAcceso });
check("el alumno hace su diagnóstico y entra en el aula", Boolean(al.sesion));

const nav = await chromium.launch({ executablePath: CHROME, headless: true });
async function sesionDe(sesion, viewport) {
  const ctx = await nav.newContext({ viewport });
  await ctx.addCookies(cookiesDe(sesion));
  const pag = await ctx.newPage();
  const errores = [];
  pag.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  pag.on("pageerror", (e) => errores.push("PAGEERROR " + e.message));
  return { ctx, pag, errores };
}

// ── Docente ──────────────────────────────────────────────────────────────────
console.log("\n · Docente (1280×900)");
const D = await sesionDe(sesionDoc, { width: 1280, height: 900 });
const p = D.pag;
await p.goto(`${BASE}/docente/metodos`, { waitUntil: "networkidle" });
check("la navegación del docente tiene «Métodos»", (await p.getByRole("link", { name: "Métodos" }).count()) >= 1);
check("la página carga sin fichas", (await p.getByText("Todavía no hay fichas").count()) === 1);

/** Elige en un <select> la opción cuyo texto empieza por `inicio`. */
async function elegirTema(selector, inicio) {
  const valor = await p.locator(`${selector} option`).evaluateAll((os, ini) => os.find((o) => o.textContent.trim().startsWith(ini))?.value, inicio);
  await p.locator(selector).selectOption(valor);
}
const estado = () => p.getByRole("status");

// 1) Suma de fracciones con IA.
await elegirTema("#ia-tema", "Fracciones");
await p.locator("#ia-metodo").fill("Suma de fracciones");
await p.getByRole("button", { name: "Pedir borrador" }).click();
await estado().filter({ hasText: "Borrador generado" }).waitFor({ timeout: 30000 });
check("la IA entrega un borrador verificado por el motor", /verificado por el motor/.test(await estado().innerText()));
check("…con el aviso de modo demostración (sin clave de Gemini)", (await p.getByText(/Modo demostración/).count()) >= 1);
const informe1 = p.getByTestId("informe-ficha");
check("el informe del motor marca la ficha como «Verificada»", /Verificada/.test(await informe1.innerText()));
check("…con ejemplos y casos generados por el servidor, pintados con KaTeX", (await p.getByTestId("casos-ficha").locator("li").count()) >= 6 && (await p.getByTestId("casos-ficha").locator(".katex").count()) > 0);
check("el editor muestra el patrón y las variables de la ficha (no son código)", (await p.locator("#f-patron").inputValue()) === "{a}/{b} + {c}/{d}" && (await p.getByTestId("variable").count()) === 9);
await p.getByRole("checkbox").check();
await p.getByRole("button", { name: /Publicar la versión 1/ }).click();
await estado().filter({ hasText: "Publicada la versión 1" }).waitFor({ timeout: 15000 });
check("tras APROBARLA, «Suma de fracciones» queda publicada", true);
await p.waitForFunction(() => /Publicado/.test(document.querySelector('[data-testid="ficha-fila"]')?.textContent ?? ""));
check("la lista del banco privado la muestra Publicada y Verificada", /Publicado/.test(await p.getByTestId("ficha-fila").first().innerText()) && /Verificada/.test(await p.getByTestId("ficha-fila").first().innerText()));

// 2) Regla de la cadena, TECLEADA a mano.
await p.getByRole("button", { name: "Nueva ficha" }).click();
await elegirTema("#f-tema", "Derivadas");
await p.locator("#f-titulo").fill("Regla de la cadena: potencia de un binomio");
await p.locator("#f-desc").fill("La derivada de (a·x^m + b)^n es n·(a·x^m + b)^(n-1) por la derivada de lo de dentro.");
await p.locator("#f-patron").fill("({~a}x^{m}{+b})^{n}");
const vars = [
  ["a", "positivo", "", "1", "6", "coeficiente de x^m"],
  ["m", "positivo", "", "2", "4", "exponente de x"],
  ["b", "entero", "", "-5", "5", "término independiente"],
  ["n", "positivo", "", "2", "5", "exponente exterior"],
];
for (let i = 0; i < vars.length; i++) {
  if (i > 0) await p.getByRole("button", { name: "Añadir variable" }).click();
  const [nombre, tipo, calc, min, max, desc] = vars[i];
  await p.getByLabel(`Nombre de la variable ${i + 1}`).fill(nombre);
  await p.getByLabel(`Tipo de la variable ${i + 1}`).selectOption(tipo);
  if (calc) await p.getByLabel(`Cálculo de la variable ${i + 1}`).fill(calc);
  await p.getByLabel(`Mínimo de la variable ${i + 1}`).fill(min);
  await p.getByLabel(`Máximo de la variable ${i + 1}`).fill(max);
  await p.getByLabel(`Descripción de la variable ${i + 1}`).fill(desc);
}
await p.locator("#f-cond").fill("a >= 1\nm >= 2\nb != 0\nn >= 2");
await p.getByRole("button", { name: "cadena", exact: true }).click();
await p.getByRole("button", { name: "potencia", exact: true }).click();
check("las operaciones se eligen del catálogo que el motor comprueba (pulsadas)", (await p.getByRole("button", { name: "cadena", exact: true }).getAttribute("aria-pressed")) === "true");

const pasos = [
  ["definicion", "", "Identificamos la función interior: lo que está dentro del paréntesis. La llamamos u.", "u = {~a}x^{m}{+b}", "{~a}x^{m}{+b} => La función interior."],
  ["transformacion", "regla de la cadena", "Derivamos la exterior (u elevado a {n}) dejando la interior igual, y multiplicamos por la derivada de la interior.", "{n}({~a}x^{m}{+b})^{n-1} · {~a*m}x^{m-1}", "{n}({~a}x^{m}{+b})^{n-1} => La derivada de la exterior.\n{~a*m}x^{m-1} => La derivada de la interior."],
  ["resultado", "regla de la cadena", "Juntamos los factores numéricos: {n} por {a*m} es {n*a*m}.", "{n*a*m}x^{m-1}({~a}x^{m}{+b})^{n-1}", ""],
];
for (let i = 0; i < pasos.length; i++) {
  if (i > 0) await p.getByRole("button", { name: "Añadir paso" }).click();
  const [tipo, regla, explica, escribe, terminos] = pasos[i];
  await p.getByLabel(`Tipo del paso ${i + 1}`).selectOption(tipo);
  if (regla) await p.getByLabel(`Regla del paso ${i + 1}`).fill(regla);
  await p.getByLabel(`Explicación del paso ${i + 1}`).fill(explica);
  await p.getByLabel(`Pizarra del paso ${i + 1}`).fill(escribe);
  if (terminos) await p.getByLabel(`Términos del paso ${i + 1}`).fill(terminos);
}
await p.locator("#f-ej").fill("(3x^2+1)^4\n(5x^3-2)^2");
await p.locator("#f-pistas").fill("¿Hay una función dentro de otra?\nDeriva la exterior y deja la interior igual.\nNo olvides multiplicar por la derivada de la función interior.");
await p.getByRole("button", { name: "Añadir pista de error" }).click();
await p.getByLabel("Pista de error 1").fill("Te falta un factor: la derivada de la función interior {~a}x^{m}{+b}. Derívala y multiplícala.");
await p.getByLabel("Factor omitido 1").fill("{~a*m}x^{m-1}");
await p.getByRole("button", { name: "Probar con el motor" }).click();
await p.getByTestId("informe-ficha").waitFor();
const infC = await p.getByTestId("informe-ficha").innerText();
check("«Probar»: el motor verifica la regla de la cadena tecleada a mano", /Verificada/.test(infC) && (await p.getByTestId("errores-ficha").count()) === 0, infC.slice(0, 200));
const casosTxt = await p.getByTestId("casos-ficha").innerText();
check("…con (3x^2+1)^4 y (5x^3-2)^2 entre los casos verificados", (await p.getByTestId("casos-ficha").locator("li").filter({ hasText: "Ejemplo" }).count()) === 2 && !/Incorrecto|No encaja/.test(casosTxt));

// Un error del docente: olvida el factor interior. El motor lo señala y no deja publicar.
const buena = await p.getByLabel("Pizarra del paso 2").inputValue();
await p.getByLabel("Pizarra del paso 2").fill("{n}({~a}x^{m}{+b})^{n-1}");
await p.getByRole("button", { name: "Probar con el motor" }).click();
await p.getByTestId("errores-ficha").waitFor();
check("si el docente OLVIDA el factor interior, el motor lo señala en rojo (Con errores)", /Con errores/.test(await p.getByTestId("informe-ficha").innerText()) && /Incorrecto/.test(await p.getByTestId("casos-ficha").innerText()));
await p.getByLabel("Pizarra del paso 2").fill(buena);
await p.getByRole("button", { name: "Probar con el motor" }).click();
await p.waitForFunction(() => /Verificada/.test(document.querySelector('[data-testid="informe-ficha"]')?.textContent ?? "") && !document.querySelector('[data-testid="errores-ficha"]'));
check("al corregirlo, vuelve a quedar Verificada", true);

await p.getByRole("button", { name: "Guardar borrador" }).click();
await estado().filter({ hasText: "Borrador guardado" }).waitFor();
check("guardar crea el borrador (versión 1)", /versión 1/.test(await estado().innerText()));

// 3) Reutilizar con (5x^3-2)^2.
await p.locator("#f-nuevo").fill("(5x^3-2)^2");
await p.getByRole("button", { name: "Aplicar y validar" }).click();
await p.getByTestId("aplicacion").waitFor();
const ap = await p.getByTestId("aplicacion").innerText();
check("REUTILIZAR con (5x^3-2)^2: el motor verifica los pasos y valida el ejercicio nuevo", /Pasos verificados por el motor/.test(ap) && /Ejercicio validado/.test(ap), ap.slice(0, 200));
check("…y la pizarra muestra los 3 pasos concretos con KaTeX", (await p.getByTestId("aplicacion").locator("li").count()) === 3 && (await p.getByTestId("aplicacion").locator(".katex").count()) >= 3);
await p.getByRole("button", { name: "Guardar como ejercicio borrador" }).click();
await p.getByText(/Guardado como ejercicio borrador/).waitFor();
check("puede guardarlo como ejercicio borrador en su banco privado", true);
await p.screenshot({ path: "qa/evidencia/metodos-docente.png", fullPage: true });

// 4) Publicar y versiones.
await p.getByRole("checkbox").check();
await p.getByRole("button", { name: /Publicar la versión 1/ }).click();
await estado().filter({ hasText: "Publicada la versión 1" }).waitFor();
check("la regla de la cadena se publica tras la aprobación del docente", true);
await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="ficha-fila"]')].filter((f) => /Publicado/.test(f.textContent ?? "")).length === 2);
check("el banco privado tiene las DOS fichas publicadas", (await p.getByTestId("ficha-fila").filter({ hasText: "Publicado" }).count()) === 2);

await p.locator("#f-pistas").fill("¿Hay una función dentro de otra?\nDeriva la exterior y deja la interior igual.\nMultiplica por la derivada de lo de dentro (pista editada).");
await p.getByRole("button", { name: /Guardar \(nueva versión\)/ }).click();
await estado().filter({ hasText: "versión 2" }).waitFor();
check("editar y guardar crea la versión 2", true);
await p.waitForFunction(() => document.querySelectorAll('[data-testid="versiones"] li').length === 2);
check("el historial lista v2 y v1, y la publicada sigue siendo la 1", (await p.getByTestId("versiones").locator("li").count()) === 2 && /publicada:\s*1/.test(await p.locator("body").innerText()));
await p.getByTestId("versiones").locator("li").filter({ hasText: "v1" }).getByRole("button", { name: "Restaurar" }).click();
await estado().filter({ hasText: "Restaurada la versión 1 como versión 3" }).waitFor();
check("restaurar la v1 crea la v3 (no reescribe el pasado)", (await p.locator("#f-pistas").inputValue()).includes("No olvides multiplicar"));

// Si el docente edita pero no aprueba, el alumno sigue viendo la versión publicada (la 1): se comprueba abajo.
check("sin errores de consola en el docente", D.errores.length === 0, D.errores.slice(0, 2).join(" | "));
await D.ctx.close();

// ── Móvil (docente) ──────────────────────────────────────────────────────────
console.log("\n · Docente en móvil (390×800)");
const DM = await sesionDe(sesionDoc, { width: 390, height: 800 });
await DM.pag.goto(`${BASE}/docente/metodos`, { waitUntil: "networkidle" });
const tituloFila = DM.pag.getByTestId("ficha-fila").first();
await tituloFila.getByRole("button", { name: "Abrir" }).click();
await DM.pag.getByTestId("variable").first().waitFor();
check("en móvil el editor no desborda horizontalmente", !(await DM.pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await DM.pag.screenshot({ path: "qa/evidencia/metodos-docente-movil.png", fullPage: false });
check("sin errores de consola en móvil", DM.errores.length === 0, DM.errores.slice(0, 2).join(" | "));
await DM.ctx.close();

// ── Alumno ───────────────────────────────────────────────────────────────────
console.log("\n · Alumno (1280×900)");
const A = await sesionDe(al.sesion, { width: 1280, height: 900 });
const q = A.pag;
await q.goto(`${BASE}/estudiante`, { waitUntil: "networkidle" });
await q.getByRole("link", { name: "Practicar métodos" }).click();
await q.waitForURL(/estudiante\/metodos/);
await q.getByTestId("metodos").waitFor();
check("el alumno ve los dos métodos publicados por su profesor", (await q.getByTestId("metodos").locator("> *").count()) === 2);
await q.locator('[data-testid="metodos"] > *').filter({ hasText: "Regla de la cadena" }).getByRole("button", { name: "Practicar este método" }).click();
check("el problema de ejemplo se carga y se pinta con KaTeX", (await q.locator("#m-problema").inputValue()) === "(3x^2+1)^4" && (await q.getByTestId("problema-metodo").locator(".katex").count()) > 0);
await q.locator("#m-respuesta").fill("4(3x^2+1)^3");
await q.getByRole("button", { name: "Comprobar" }).click();
await q.getByTestId("pista-metodo").waitFor();
const pista = await q.getByTestId("pista-metodo").innerText();
check("OMITE 6x → «Todavía no» y la pista de error sobre la derivada interior", (await q.getByTestId("pista-metodo").getAttribute("data-tipo")) === "error" && /derivada de la función interior/.test(pista), pista);
check("…la pista NO le da la solución (ni «6x» ni «24x»)", !/6x|24x/.test(await q.getByTestId("resultado-metodo").innerText()));
await q.screenshot({ path: "qa/evidencia/metodos-alumno.png", fullPage: true });
await q.locator("#m-respuesta").fill("24x(3x^2+1)^3");
await q.getByRole("button", { name: "Comprobar" }).click();
await q.getByText("¡Correcto!").waitFor();
check("con 24x(3x^2+1)^3 → «¡Correcto!»", true);
await q.locator("#m-problema").fill("(5x^3-2)^2");
await q.locator("#m-respuesta").fill("2(5x^3-2)");
await q.getByRole("button", { name: "Comprobar" }).click();
await q.waitForFunction(() => document.querySelector('[data-testid="pista-metodo"]')?.getAttribute("data-tipo") === "error");
check("REUTILIZADO con (5x^3-2)^2: omitir 15x^2 da la misma pista de error", true);
await q.locator("#m-respuesta").fill("30x^2(5x^3-2)");
await q.getByRole("button", { name: "Comprobar" }).click();
await q.getByText("¡Correcto!").waitFor();
check("…y 30x^2(5x^3-2) es correcto", true);
check("sin errores de consola en el alumno", A.errores.length === 0, A.errores.slice(0, 2).join(" | "));
await A.ctx.close();

await nav.close();
salir();
