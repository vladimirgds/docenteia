// ¿SE MANTIENE UN CAMINO VISIBLE DE VUELTA A /admin PARA EL SUPERADMIN?
//
// POR QUÉ EXISTE
// El cliente reportó, mirando capturas reales: "al estar en /admin se
// muestra el menú de administración. Sin embargo, cuando se navega a las
// aulas del docente (/docente/aulas), el menú superior cambia
// automáticamente al menú del Docente... se pierde la barra de navegación
// del admin y no hay enlace directo para regresar a la administración".
//
// `/docente` y `/director` son pantallas COMPARTIDAS —las usa de verdad
// quien tiene ese rol, y un SUPERADMIN las abre sólo para PREVISUALIZAR
// (enlaces "Panel Docente"/"Panel Directivo" en NavegacionAdmin)—, así que
// no pueden cambiar de barra de navegación entera sólo porque quien mira es
// el administrador. La solución (ver components/admin/volver-admin.tsx):
// un acceso "← Volver a Administración" en la Cabecera, visible SÓLO para
// SUPERADMIN y SÓLO fuera de /admin —nunca para un DOCENTE/DIRECTOR real—.
//
//   node qa/hito4-navegacion-admin.mjs
//   BASE_URL=http://localhost:3000 CHROME=/ruta/a/chrome.exe node qa/hito4-navegacion-admin.mjs

import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion } from "./sesion.mjs";

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

let chromium;
try {
  ({ chromium } = require(RUTA_PLAYWRIGHT));
} catch (e) {
  console.error("\n  ✗ No se ha podido cargar playwright-core: esto NO se ha probado en un navegador.");
  console.error(`    (${String(e.message).split("\n")[0]})\n`);
  process.exit(1);
}
if (!CHROME) {
  console.error("\n  ✗ No se ha encontrado Chrome ni Edge.\n");
  process.exit(1);
}

await exigirServidor();

const sesionAdmin = await iniciarSesion(
  BASE,
  process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local",
  process.env.SEED_ADMIN_PASSWORD || "Admin-2026",
);
check("se inicia sesión como el administrador de la semilla", Boolean(sesionAdmin));

const sesionDocente = await iniciarSesion(
  BASE,
  process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
  process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
);
check("se inicia sesión como el docente de la semilla", Boolean(sesionDocente));

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });

async function paginaCon(galleta) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  await contexto.addCookies(
    galleta.split(";").map((par) => {
      const [nombre, ...resto] = par.trim().split("=");
      return { name: nombre, value: resto.join("="), url: BASE };
    }),
  );
  const pagina = await contexto.newPage();
  const erroresConsola = [];
  pagina.on("pageerror", (e) => erroresConsola.push(String(e)));
  return { contexto, pagina, erroresConsola };
}

async function leerBarras(pagina) {
  return pagina.evaluate(() => {
    const enlace = (texto) => [...document.querySelectorAll("a")].find((a) => a.textContent?.trim() === texto);
    return {
      navAdmin: Boolean([...document.querySelectorAll("nav a")].find((a) => a.textContent?.trim() === "Usuarios")),
      navDocente: Boolean([...document.querySelectorAll("nav a")].find((a) => a.textContent?.trim() === "Currículo")),
      volverAdmin: Boolean(enlace("← Volver a Administración")),
      hrefVolverAdmin: enlace("← Volver a Administración")?.getAttribute("href") ?? null,
    };
  });
}

console.log("\n── Como SUPERADMIN: /admin no necesita el acceso de vuelta (ya está ahí) ──");
{
  const { contexto, pagina, erroresConsola } = await paginaCon(sesionAdmin);
  await pagina.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const estado = await leerBarras(pagina);
  check("en /admin se ve la barra de administración", estado.navAdmin, JSON.stringify(estado));
  check("…y NO aparece 'Volver a Administración' (sería redundante)", !estado.volverAdmin, JSON.stringify(estado));
  check("la consola no soltó errores", erroresConsola.length === 0, erroresConsola.join(" | "));
  await contexto.close();
}

console.log("\n── Como SUPERADMIN: al previsualizar /docente, aparece el acceso de vuelta ──");
{
  const { contexto, pagina, erroresConsola } = await paginaCon(sesionAdmin);
  await pagina.goto(`${BASE}/docente`, { waitUntil: "networkidle" });
  const estado = await leerBarras(pagina);
  check(
    "en /docente se ve la barra del Docente (NavegacionDocente), como siempre",
    estado.navDocente,
    JSON.stringify(estado),
  );
  check(
    "…y además aparece '← Volver a Administración', apuntando a /admin",
    estado.volverAdmin && estado.hrefVolverAdmin === "/admin",
    JSON.stringify(estado),
  );

  // El reporte del cliente era justo sobre /docente/aulas en concreto.
  await pagina.goto(`${BASE}/docente/aulas`, { waitUntil: "networkidle" });
  const estadoAulas = await leerBarras(pagina);
  check(
    "en /docente/aulas (el caso exacto reportado) también aparece el acceso de vuelta",
    estadoAulas.volverAdmin && estadoAulas.hrefVolverAdmin === "/admin",
    JSON.stringify(estadoAulas),
  );

  // Y de verdad funciona: clicarlo lleva de vuelta a /admin, con SU barra.
  await pagina.getByRole("link", { name: "← Volver a Administración" }).click();
  await pagina.waitForURL(`${BASE}/admin`, { timeout: 10_000 });
  const trasVolver = await leerBarras(pagina);
  check(
    "al hacer clic, se vuelve de verdad a /admin con la barra de administración",
    pagina.url() === `${BASE}/admin` && trasVolver.navAdmin,
    JSON.stringify({ url: pagina.url(), ...trasVolver }),
  );

  check("la consola no soltó errores en todo el recorrido", erroresConsola.length === 0, erroresConsola.join(" | "));
  await contexto.close();
}

console.log("\n── Como SUPERADMIN: también en /director ──");
{
  const { contexto, pagina } = await paginaCon(sesionAdmin);
  await pagina.goto(`${BASE}/director`, { waitUntil: "networkidle" });
  const estado = await leerBarras(pagina);
  check(
    "en /director aparece '← Volver a Administración'",
    estado.volverAdmin && estado.hrefVolverAdmin === "/admin",
    JSON.stringify(estado),
  );
  await contexto.close();
}

console.log("\n── Como un DOCENTE de verdad: el acceso NO debe aparecer (no es admin) ──");
{
  const { contexto, pagina } = await paginaCon(sesionDocente);
  await pagina.goto(`${BASE}/docente`, { waitUntil: "networkidle" });
  const estado = await leerBarras(pagina);
  check(
    "un docente real ve su barra normal, sin ningún enlace a administración",
    estado.navDocente && !estado.volverAdmin,
    JSON.stringify(estado),
  );
  await contexto.close();
}

await navegador.close();
salir();
