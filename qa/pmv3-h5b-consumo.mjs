// PMV 3 · H5B — MEDICIÓN DEL CONSUMO DE IA Y VOZ.
//
//   A. Unidad: contadores de Gemini y avisos de consumo (sin red).
//   B. Acceso: /api/admin/consumo es sólo para SUPERADMIN.
//   C. (Sólo con QA_CONSUMO_REAL=1 y la app arrancada CON GEMINI_API_KEY)
//      lecciones y un borrador de ficha con Gemini REAL: se registran tokens
//      por llamada y se guarda la medición en qa/evidencia/consumo-ia-voz.json.
//      Gasta cuota (pocas llamadas a modelos «flash»): por eso va aparte.
//
//   node --experimental-strip-types --no-warnings qa/pmv3-h5b-consumo.mjs
import { mkdirSync, writeFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";
import { escucharConsumo, notificarConsumo, tokensDeGemini } from "../lib/consumo-eventos.ts";

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
const prisma = new PrismaClient();
async function salir() {
  await prisma.$disconnect();
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
  if (fallos.length > 0) {
    console.log("\n Fallos:");
    for (const f of fallos) console.log(`   · ${f}`);
  }
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(fallos.length > 0 ? 1 : 0);
}

console.log("\n · A. Unidad");
const t = tokensDeGemini({ promptTokenCount: 120, candidatesTokenCount: 300, thoughtsTokenCount: 50, totalTokenCount: 470 });
check("usageMetadata → entrada 120, salida 350 (incluye razonamiento), total 470", t.tokensEntrada === 120 && t.tokensSalida === 350 && t.tokensTotales === 470);
check("sin usageMetadata → ceros, sin lanzar", JSON.stringify(tokensDeGemini(undefined)) === JSON.stringify({ tokensEntrada: 0, tokensSalida: 0, tokensTotales: 0 }));
const recibidos = [];
const quitar = escucharConsumo((c) => recibidos.push(c));
escucharConsumo(() => {
  throw new Error("oyente roto");
});
notificarConsumo({ servicio: "VOZ", origen: "voz", proveedor: "x", caracteres: 10 });
quitar();
notificarConsumo({ servicio: "VOZ", origen: "voz", proveedor: "x", caracteres: 10 });
check("los avisos llegan a quien escucha, y un oyente roto no rompe nada", recibidos.length === 1 && recibidos[0].caracteres === 10);

await exigirServidor();
const sufijo = Date.now().toString(36);
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) },
  });
const json = async (r) => r.json().catch(() => ({}));

console.log("\n · B. Acceso al informe de consumo");
const admin = api(await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026"));
const docente = api(await iniciarSesion(BASE, process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local", process.env.SEED_DOCENTE_PASSWORD || "Docente-2026"));
check("sin sesión → 401", [401, 403].includes((await api(null)("/api/admin/consumo")).status));
check("un docente → 403", (await docente("/api/admin/consumo")).status === 403);
const r0 = await admin("/api/admin/consumo?dias=1");
const j0 = await json(r0);
check("el SUPERADMIN lo lee: filas y totales", r0.status === 200 && Array.isArray(j0.filas) && typeof j0.totales?.tokensTotales === "number", JSON.stringify(j0).slice(0, 200));

if (process.env.QA_CONSUMO_REAL !== "1") {
  console.log("\n · C. (omitido) Medición con Gemini real: ejecuta con QA_CONSUMO_REAL=1 y la app arrancada con GEMINI_API_KEY.");
  await salir();
}

console.log("\n · C. Medición con Gemini REAL");
const desde = new Date();
const alumno = await registrarAlumno(BASE, { email: `qa.h5b.cons.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "QA Consumo", ciclo: "Secundaria", grado: "3" });
const Al = api(alumno.sesion);
const CONSULTAS = ["Explícame el teorema de Pitágoras con un ejemplo", "¿Qué es una función lineal?", "Explícame qué es la probabilidad de un suceso"];
const lecciones = [];
for (const q of CONSULTAS) {
  const t0 = Date.now();
  const r = await Al("/api/query", { method: "POST", body: JSON.stringify({ query: `${q} (${sufijo})`, modo: "ia" }) });
  const j = await json(r);
  lecciones.push({ consulta: q, status: r.status, fuente: j.fuente_ia, modelo: j.modelo, ms: Date.now() - t0 });
}
const conIA = lecciones.filter((l) => l.fuente === "gemini");
check("las lecciones responden; las de temas no deterministas, con Gemini real", lecciones.every((l) => l.status === 200) && conIA.length >= 2, JSON.stringify(lecciones));
check("una lección que resuelve el MOTOR (sin IA) no cuenta como consumo", lecciones.filter((l) => l.fuente !== "gemini").length + conIA.length === lecciones.length);
const bancos = (await json(await docente("/api/docente/bancos"))).bancos ?? [];
const tDer = bancos.find((b) => b.tema.clave === "derivadas")?.tema;
const rF = await docente("/api/docente/fichas-metodo/borrador-ia", { method: "POST", body: JSON.stringify({ nodoId: tDer?.id, titulo: "Regla de la cadena", ejemplo: "(3x^2+1)^4" }) });
check("un borrador de ficha con Gemini real", [201, 422].includes(rF.status), `HTTP ${rF.status}`);
await new Promise((r) => setTimeout(r, 800));

const filas = await prisma.consumoServicio.findMany({ where: { creadoEn: { gte: desde } }, orderBy: { creadoEn: "asc" } });
const lec = filas.filter((f) => f.origen === "leccion");
const fic = filas.filter((f) => f.origen === "fichas-metodo");
check("cada lección con IA deja UN registro con tokens (ni más ni menos)", lec.length === conIA.length && lec.every((f) => f.tokensTotales > 0), JSON.stringify(lec.map((f) => f.tokensTotales)));
const rCache = await Al("/api/query", { method: "POST", body: JSON.stringify({ query: `${CONSULTAS[0]} (${sufijo})`, modo: "ia" }) });
const jCache = await json(rCache);
await new Promise((r) => setTimeout(r, 500));
check("repetir la misma consulta sale de la caché y NO se cuenta como consumo", jCache.cacheado === true && (await prisma.consumoServicio.count({ where: { creadoEn: { gte: desde }, origen: "leccion" } })) === lec.length);
check("…con el usuario que la pidió", lec.every((f) => f.usuarioId === alumno.id || f.usuarioId !== null));
check("el borrador de ficha deja su registro (una fila por llamada, reparaciones incluidas)", fic.length >= 1 && fic.every((f) => f.tokensTotales > 0), JSON.stringify(fic.map((f) => f.tokensTotales)));
const resumen = await json(await admin("/api/admin/consumo?dias=1"));
check("el informe del SUPERADMIN los suma", (resumen.filas ?? []).some((f) => f.origen === "leccion" && f.tokensTotales > 0));

const media = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const medicion = {
  fecha: new Date().toISOString(),
  ia: {
    leccion: {
      llamadas: lec.length,
      modelo: lec[0]?.modelo ?? null,
      tokensEntradaMedia: media(lec.map((f) => f.tokensEntrada)),
      tokensSalidaMedia: media(lec.map((f) => f.tokensSalida)),
      tokensTotalesMedia: media(lec.map((f) => f.tokensTotales)),
      latenciaMediaMs: media(lecciones.map((l) => l.ms)),
    },
    fichaMetodo: {
      llamadas: fic.length,
      modelo: fic[0]?.modelo ?? null,
      tokensTotalesPorBorrador: fic.reduce((a, f) => a + f.tokensTotales, 0),
    },
  },
  voz: {
    nota: "La voz de la lección es la del navegador (speechSynthesis): no pasa por el servidor ni tiene coste por carácter. Si se configura un proveedor (VOZ_PROVEEDOR + clave), /api/voz registra los caracteres sintetizados por llamada.",
    proveedorConfigurado: (await json(await Al("/api/voz"))).disponible === true,
  },
};
mkdirSync("qa/evidencia", { recursive: true });
writeFileSync("qa/evidencia/consumo-ia-voz.json", JSON.stringify(medicion, null, 2));
console.log(`    medición: ${JSON.stringify(medicion.ia)}`);
await salir();
