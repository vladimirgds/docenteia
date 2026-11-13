// HITO 4 (cierre PMV2) — PROTECCIÓN DE LOS SERVICIOS DE INTELIGENCIA
// ARTIFICIAL.
//
// POR QUÉ EXISTE
// El cliente mandó esta observación: "Proteger el endpoint de generación de
// voz mediante autenticación y límites de consumo. Controlar las
// solicitudes al servicio de Gemini para evitar consumos excesivos o no
// autorizados. Implementar límites por usuario y por IP según corresponda."
//
// `/api/voz` no tenía NINGÚN candado: cualquiera, sin iniciar sesión, podía
// pedir audio sin límite, y cada petición es una llamada PAGADA a un
// proveedor externo (Google Cloud TTS / ElevenLabs). `/api/query` —el único
// camino hacia Gemini— ya tenía un tope sólido POR IP (`src/queryCore.js`,
// de una ronda anterior), pero ninguno POR USUARIO: una cuenta concreta
// podía agotar Gemini cambiando de IP, o varias cuentas de un mismo colegio
// se repartían un único cupo por NAT sin que nada las distinguiera entre sí.
//
// Cubre, en este orden:
//
//   A. `/api/voz`: sin sesión, 401 —en POST, en GET y en GET ?probar=1,
//      los tres caminos que de verdad llaman al proveedor o enseñan su
//      configuración—.
//   B. `/api/voz`: el tope por usuario (30/min) corta de verdad, con
//      `Retry-After`.
//   C. `/api/query`: el tope por usuario (60/min, capa NUEVA, aparte del
//      tope por IP que ya existía) corta de verdad, con `Retry-After`, sin
//      tocar el comportamiento determinista de una consulta normal.
//
//   node qa/hito4-ia-proteccion.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-ia-proteccion.mjs

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { registrarAlumno } from "./sesion.mjs";

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

// ── A. /api/voz exige sesión en sus tres caminos ────────────────────────────
console.log("\n · A. /api/voz exige sesión —antes, cualquiera podía pedir audio pagado sin iniciar sesión—");

const rVozPostSinSesion = await fetch(`${BASE}/api/voz`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ texto: "hola" }),
});
check("POST /api/voz sin sesión: 401", rVozPostSinSesion.status === 401, `HTTP ${rVozPostSinSesion.status}`);

const rVozGetSinSesion = await fetch(`${BASE}/api/voz`);
check("GET /api/voz sin sesión: 401", rVozGetSinSesion.status === 401, `HTTP ${rVozGetSinSesion.status}`);

const rVozProbarSinSesion = await fetch(`${BASE}/api/voz?probar=1`);
check("GET /api/voz?probar=1 sin sesión: 401 —éste SÍ llamaría de verdad al proveedor—", rVozProbarSinSesion.status === 401, `HTTP ${rVozProbarSinSesion.status}`);

// ── Una sesión de alumno de verdad, para B y C ───────────────────────────────
const emailAlumno = `qa.iaproteccion.${sufijo}@mentoriamath.local`;
const altaAlumno = await registrarAlumno(BASE, { email: emailAlumno, password: "Alumno-2026", nombre: "QA IA Protección" });
check("se registra el alumno de prueba", altaAlumno.ok);
const apiAlumno = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", cookie: altaAlumno.sesion, ...(opciones.headers || {}) },
  });

// ── B. /api/voz: tope por usuario (30/min) y por IP (90/min) ────────────────
console.log("\n · B. /api/voz: topes de consumo (30/min por usuario, 90/min por IP, red de seguridad)");

// `/api/voz` tiene DOS capas —por usuario y por IP— con el mismo mensaje a
// propósito (ver el comentario de `exigirSesionYLimite`): no hace falta que
// el cliente sepa cuál de las dos lo paró. Por eso esta prueba no exige que
// la capa por usuario sea la que corte exactamente en la 31ª petición —si
// esta misma batería se ha corrido varias veces seguidas en la
// última hora desde esta máquina, el cupo POR IP (compartido entre
// corridas, a diferencia del de usuario, que nace fresco con cada alumno
// nuevo) puede agotarse antes—; sólo exige que el candado SALTE, con
// `Retry-After`, dentro de un número razonable de peticiones.
let primeraRechazadaEnVoz = -1;
for (let i = 1; i <= 35 && primeraRechazadaEnVoz === -1; i++) {
  const r = await apiAlumno("/api/voz", { method: "POST", body: JSON.stringify({ texto: `prueba ${i}` }) });
  if (r.status === 429) {
    primeraRechazadaEnVoz = i;
    check("…con Retry-After", r.headers.get("retry-after") != null);
  }
}
check(
  "el tope de voz se dispara dentro de las primeras 35 peticiones de este usuario",
  primeraRechazadaEnVoz !== -1,
  `primera rechazada: ${primeraRechazadaEnVoz}`,
);

// ── C. /api/query: tope por usuario (60/min), capa NUEVA ───────────────────
console.log("\n · C. /api/query: 60 peticiones por minuto, por usuario (además del tope por IP que ya existía)");

// La MISMA consulta, literal, las 61 veces: `manejarConsulta` cachea por
// (texto, intención, modo) y consulta ANTES de tocar el cupo de Gemini —ver
// `src/queryCore.js`, pasos "1.5" y "LÍMITE DE IA"—, así que sólo la 1ª de
// estas 61 peticiones gasta cuota real; de la 2ª en adelante sale de caché.
// Repetir el texto es justo lo que hace falta para aislar el candado NUEVO
// (por usuario) del candado YA EXISTENTE (por IP, en `src/queryCore.js`).
const consultaRepetida = `resuelve ${20 + (Date.now() % 5)} ÷ 2`;
const MENSAJE_TOPE_POR_USUARIO = "Demasiadas consultas. Espera un momento.";

// El candado POR IP ya existía (`permisoIA`, en `src/queryCore.js`) y es
// COMPARTIDO con cualquier otra batería que haya consultado IA desde esta
// misma máquina en la última hora —qa/hito2.mjs, por ejemplo, hace cientos
// de consultas de verdad—. Si ese candado se dispara primero, responde 429
// con SU PROPIO mensaje, no con el nuestro: eso no es un fallo de ESTA
// capa, así que sólo se exige el mensaje exacto en la 61ª petición —la
// cuenta POR USUARIO avanza en cada intento que llega a comprobarse, pase lo
// que pase después con `manejarConsulta`, así que el 61º intento SIEMPRE es
// el primero que el candado nuevo corta, al margen de cuántos 429 ajenos
// hayan salido antes—.
let seRechazoConMiMensajeAntesDeTiempo = false;
for (let i = 1; i <= 60; i++) {
  const r = await apiAlumno("/api/query", { method: "POST", body: JSON.stringify({ query: consultaRepetida }) });
  if (r.status === 429) {
    const cuerpo = await r.json().catch(() => ({}));
    if (cuerpo.error === MENSAJE_TOPE_POR_USUARIO) seRechazoConMiMensajeAntesDeTiempo = true;
  }
}
check(
  "el tope POR USUARIO (nuevo) no se dispara antes de la petición 61",
  !seRechazoConMiMensajeAntesDeTiempo,
);

const r61 = await apiAlumno("/api/query", { method: "POST", body: JSON.stringify({ query: consultaRepetida }) });
const cuerpo61 = await r61.json().catch(() => ({}));
check(
  "la 61ª petición del mismo usuario en el mismo minuto se corta con EL MENSAJE del tope por usuario",
  r61.status === 429 && cuerpo61.error === MENSAJE_TOPE_POR_USUARIO,
  `HTTP ${r61.status} · ${JSON.stringify(cuerpo61)}`,
);
check("…con Retry-After", r61.headers.get("retry-after") != null);

salir();
