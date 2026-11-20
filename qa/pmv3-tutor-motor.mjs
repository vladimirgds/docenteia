// PMV 3 · HITO 4 — LA DECISIÓN DEL TUTOR ADAPTATIVO (máquina de estados pura).
//
//   node --experimental-strip-types qa/pmv3-tutor-motor.mjs

import { ESTADO_INICIAL, UMBRAL_BLOQUEO, UMBRAL_REGRESO, decidir } from "../lib/tutoria/motor.ts";

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
const mal = { tipo: "RESPUESTA", correcta: false };
const bien = { tipo: "RESPUESTA", correcta: true };
const paso = (estado, evento) => decidir(estado, evento);

console.log("\n · A. Umbrales");
check("el bloqueo son 3 errores seguidos", UMBRAL_BLOQUEO === 3);
check("tras un repaso, 2 errores mandan al equivalente", UMBRAL_REGRESO === 2);

console.log("\n · B. Ante un error, una pista (escalera de la más suave a la más concreta)");
{
  let d = paso(ESTADO_INICIAL, mal);
  check("1.er error → pista de nivel 0", d.accion.tipo === "PISTA" && d.accion.nivel === 0);
  d = paso(d.estado, mal);
  check("2.º error → pista de nivel 1", d.accion.tipo === "PISTA" && d.accion.nivel === 1);
  check("…y todavía no hay repaso", d.estado.fase === "AYUDA" && d.estado.repasos === 0);
}

console.log("\n · C. Bloqueo → repaso breve");
{
  let d = paso(ESTADO_INICIAL, mal);
  d = paso(d.estado, mal);
  d = paso(d.estado, mal);
  check("el 3.er error seguido ABRE UN REPASO", d.accion.tipo === "ABRIR_REPASO" && d.estado.fase === "REPASO" && d.estado.repasos === 1);
  const d2 = paso(d.estado, mal);
  check("mientras el repaso sigue abierto, otro error no abre otro", d2.accion.tipo !== "ABRIR_REPASO" && d2.estado.repasos === 1);
}

console.log("\n · D. Un acierto a tiempo rompe la racha");
{
  let d = paso(ESTADO_INICIAL, mal);
  d = paso(d.estado, mal);
  d = paso(d.estado, bien);
  check("acertar tras dos errores continúa", d.accion.tipo === "CONTINUAR" && d.estado.fase === "RESUELTO");
  check("…y pone a cero los errores seguidos", d.estado.erroresSeguidos === 0);
  d = paso({ ...ESTADO_INICIAL }, bien);
  check("acertar a la primera no propone nada más", d.accion.tipo === "CONTINUAR" && d.estado.equivalentes === 0);
  // Dos errores, acierto, dos errores: nunca llegó a tres seguidos → sin repaso.
  let e = ESTADO_INICIAL;
  for (const ev of [mal, mal, bien, mal, mal]) e = paso(e, ev).estado;
  check("errores NO seguidos (2, acierto, 2) no cuentan como bloqueo", e.repasos === 0);
}

console.log("\n · E. Repaso → vuelta al paso original");
{
  let e = ESTADO_INICIAL;
  for (let i = 0; i < 3; i++) e = paso(e, mal).estado;
  const d = paso(e, { tipo: "REPASO_CERRADO" });
  check("cerrar el repaso manda a VOLVER AL PASO ORIGINAL", d.accion.tipo === "VOLVER_AL_PASO" && d.estado.fase === "REGRESO");
  check("…con los errores a cero (oportunidad limpia)", d.estado.erroresSeguidos === 0);
  check("cerrar un repaso que no estaba abierto no cambia nada", paso(ESTADO_INICIAL, { tipo: "REPASO_CERRADO" }).accion.tipo === "CONTINUAR");
}

console.log("\n · F. Tras el repaso: resolver el original → ejercicio equivalente");
{
  let e = ESTADO_INICIAL;
  for (let i = 0; i < 3; i++) e = paso(e, mal).estado;
  e = paso(e, { tipo: "REPASO_CERRADO" }).estado;
  const d = paso(e, bien);
  check("acertar el original tras el repaso PROPONE UN EQUIVALENTE", d.accion.tipo === "PROPONER_EQUIVALENTE" && d.estado.fase === "RESUELTO" && d.estado.equivalentes === 1);
}

console.log("\n · G. Tras el repaso: sigue atascado → equivalente en lugar de insistir");
{
  let e = ESTADO_INICIAL;
  for (let i = 0; i < 3; i++) e = paso(e, mal).estado;
  e = paso(e, { tipo: "REPASO_CERRADO" }).estado;
  let d = paso(e, mal);
  check("el 1.er error tras el repaso da una pista", d.accion.tipo === "PISTA");
  d = paso(d.estado, mal);
  check("el 2.º error tras el repaso PROPONE UN EQUIVALENTE", d.accion.tipo === "PROPONER_EQUIVALENTE" && d.estado.fase === "EQUIVALENTE");
  check("…y no se abre un segundo repaso", d.estado.repasos === 1);
}

console.log("\n · H. Pedir una pista a voluntad");
{
  let d = paso(ESTADO_INICIAL, { tipo: "PISTA_PEDIDA" });
  check("pedir una pista da la de nivel 0", d.accion.tipo === "PISTA" && d.accion.nivel === 0 && d.estado.fase === "AYUDA");
  d = paso(d.estado, mal);
  check("un error después da la SIGUIENTE (nivel 1)", d.accion.tipo === "PISTA" && d.accion.nivel === 1);
  d = paso(d.estado, { tipo: "PISTA_PEDIDA" });
  check("pedir otra, la de nivel 2", d.accion.nivel === 2);
}

console.log("\n · I. Pureza");
{
  const antes = { ...ESTADO_INICIAL };
  paso(antes, mal);
  check("la función no modifica el estado que recibe", JSON.stringify(antes) === JSON.stringify(ESTADO_INICIAL));
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length > 0) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");
process.exit(fallos.length > 0 ? 1 : 0);
