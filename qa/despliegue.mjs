// ¿QUÉ VERSIÓN ESTÁ VIVA EN UNA DIRECCIÓN?
//
// Esta batería no prueba la aplicación: prueba que lo que hay DESPLEGADO es lo
// que se ha entregado. Existe porque durante cinco rondas el cliente abrió la
// URL de las guías de prueba, vio siempre lo mismo y dijo "está igual, no has
// cambiado nada" — y tenía razón: el servicio servía una versión de agosto, del
// prototipo anterior, porque su orden de construcción nunca compilaba la
// aplicación. Nadie se enteró porque nadie miraba desde fuera.
//
//   node qa/despliegue.mjs                                (BASE_URL o el sitio en vivo)
//   node qa/despliegue.mjs https://mi-sitio.com           (cualquier dirección)
//   node qa/despliegue.mjs https://mi-sitio.com 52736d8   (y qué commit se espera)
//
// Sin argumento de commit espera el de `git rev-parse HEAD`.
//
// Responde a tres preguntas, en este orden:
//   1. ¿contesta?
//   2. ¿es la aplicación, o el prototipo viejo? (la cabecera lo dice)
//   3. ¿qué commit está sirviendo, y es el que toca?

import { execSync } from "node:child_process";

const DESTINO = (process.argv[2] || process.env.BASE_URL || "https://math-ia.onrender.com").replace(/\/$/, "");
const commitLocal = () => {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const ESPERADO = (process.argv[3] || commitLocal()).trim();

let ok = 0;
const fallos = [];
const check = (nombre, condicion, detalle = "") => {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ""}`);
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
};

console.log(`\n Comprobando ${DESTINO}\n`);

// Render duerme la instancia gratuita: el primer acceso puede tardar un minuto.
let respuesta = null;
let error = "";
for (let intento = 1; intento <= 3 && !respuesta; intento++) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 90_000);
  try {
    // `connection: close` para no dejar un socket vivo al terminar.
    respuesta = await fetch(`${DESTINO}/api/health`, { signal: corte.signal, headers: { connection: "close" } });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (intento < 3) console.log(`  · sin respuesta (intento ${intento}); puede estar despertando…`);
  } finally {
    clearTimeout(reloj);
  }
}

check("el servicio contesta", Boolean(respuesta), error);

if (respuesta) {
  const motor = respuesta.headers.get("x-powered-by") ?? "(sin cabecera)";
  let salud = {};
  try {
    salud = await respuesta.json();
  } catch {
    salud = {};
  }
  const versionViva = String(salud.version ?? "");

  console.log(`  · motor: ${motor} · versión: ${versionViva || "(no informa)"} · estado: ${salud.estado ?? salud.status ?? "?"}`);

  check("responde correctamente", respuesta.ok, `HTTP ${respuesta.status}`);
  check(
    "lo que sirve es la aplicación, no el prototipo de Express",
    !/express/i.test(motor),
    `x-powered-by: ${motor}`,
  );
  check(
    "informa de qué versión está desplegada",
    Boolean(versionViva) && versionViva !== "desconocido",
    versionViva || "(vacío)",
  );
  if (ESPERADO) {
    const corto = (c) => c.slice(0, 7);
    check(
      `la versión desplegada es la esperada (${corto(ESPERADO)})`,
      versionViva.startsWith(ESPERADO) || ESPERADO.startsWith(versionViva),
      `desplegado ${corto(versionViva) || "?"} · esperado ${corto(ESPERADO)}`,
    );
  }
  // El estado de la base no invalida el despliegue, pero se dice: es la
  // diferencia entre "no se ve lo nuevo" y "se ve, pero falta configurar algo".
  if (salud.estado && salud.estado !== "ok") {
    console.log(`  · aviso: la base de datos está «${salud.estado}»${salud.detalle ? ` — ${salud.detalle}` : ""}`);
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
  console.log("\n Si la versión no es la esperada, el despliegue no ha llegado:");
  console.log("   · comprueba en el panel que el servicio construye con `npm ci` o `npm install`");
  console.log("     (el gancho `postinstall` compila la aplicación por su cuenta), y");
  console.log("   · que el despliegue automático está activado para la rama que se fusiona.");
}
console.log("═══════════════════════════════════════════════════════════\n");
// `exitCode` y no `process.exit()`: salir a la fuerza con una conexión recién
// cerrada hace que Node en Windows se queje y devuelva un código que no es éste.
process.exitCode = fallos.length > 0 ? 1 : 0;
