// PMV 3 · HITO 3 — SINCRONÍA ENTRE EL AUDIO Y EL PUNTERO LÁSER.
//
// Prueba el secuenciador contra un locutor FALSO que dispara los eventos en el
// orden y a la hora que se le diga, incluidos los malos (un `onend` tardío de un
// audio ya cancelado). No necesita servidor ni navegador.
//
//   node qa/pmv3-pizarra-sincronia.mjs

import { Secuenciador, construirSegmentos, crearLocutorTemporizado } from "../lib/pizarra/secuenciador.ts";
import { latexConTerminos } from "../lib/pizarra/latex-terminos.ts";

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

/** Un locutor controlado a mano: cada `hablar` queda anotado y sus eventos se disparan desde la prueba. */
function locutorFalso() {
  const locuciones = [];
  return {
    locuciones,
    hablar(texto, eventos) {
      const l = { texto, eventos, cancelada: false };
      locuciones.push(l);
      return () => {
        l.cancelada = true;
      };
    },
    ultima: () => locuciones[locuciones.length - 1],
  };
}

const PASOS = [
  { explica: "Paso uno.", terminos: [{ texto: "1/2", explica: "Medio." }, { texto: "1/3", explica: "Un tercio." }] },
  { explica: "Paso dos." },
  { explica: "Paso tres.", terminos: [{ texto: "5/6", explica: "Cinco sextos." }] },
];
const segmentos = construirSegmentos(PASOS);

console.log("\n · A. Construcción de los segmentos");
check("un segmento por paso más uno por término (6)", segmentos.length === 6, `${segmentos.length}`);
check("el orden es narrativo: paso, sus términos, siguiente paso", segmentos.map((s) => s.objetivo).join(",") === "paso:0,termino:0:0,termino:0:1,paso:1,paso:2,termino:2:0");

console.log("\n · B. El puntero se mueve cuando EMPIEZA el audio");
{
  const loc = locutorFalso();
  const historial = [];
  const s = new Secuenciador(segmentos, loc, (i) => historial.push(i));
  s.reproducir();
  check("al pedir reproducir, el estado es «hablando»", s.instantanea().estado === "hablando");
  check("…pero el puntero todavía NO apunta a nada (el audio no ha empezado)", s.instantanea().objetivo === null);
  loc.ultima().eventos.alEmpezar();
  check("al empezar el audio, el puntero apunta al paso 0", s.instantanea().objetivo === "paso:0");
  loc.ultima().eventos.alTerminar();
  check("al acabar el segmento se pasa al siguiente (el término 0 del paso 0)", loc.ultima().texto === "Medio.");
  check("…y el puntero aún no se ha movido hasta que suena", s.instantanea().objetivo === "paso:0");
  loc.ultima().eventos.alEmpezar();
  check("…cuando suena, señala el término 0", s.instantanea().objetivo === "termino:0:0");
}

console.log("\n · C. Recorrido completo");
{
  const loc = locutorFalso();
  const s = new Secuenciador(segmentos, loc);
  s.reproducir();
  const vistos = [];
  for (let i = 0; i < segmentos.length; i++) {
    loc.ultima().eventos.alEmpezar();
    vistos.push(s.instantanea().objetivo);
    loc.ultima().eventos.alTerminar();
  }
  check("recorre los 6 segmentos señalando cada objetivo en orden", vistos.join(",") === segmentos.map((x) => x.objetivo).join(","));
  check("al terminar, el estado es «fin»", s.instantanea().estado === "fin");
  s.reproducir();
  check("reproducir tras el fin vuelve a empezar", s.instantanea().indice === 0 && s.instantanea().estado === "hablando");
}

console.log("\n · D. PAUSAR");
{
  const loc = locutorFalso();
  const s = new Secuenciador(segmentos, loc);
  s.reproducir();
  loc.ultima().eventos.alEmpezar();
  loc.ultima().eventos.alTerminar();
  loc.ultima().eventos.alEmpezar(); // suena el término 0
  const sonando = loc.ultima();
  s.pausar();
  check("pausar cancela el audio en curso", sonando.cancelada === true);
  check("el estado es «pausado»", s.instantanea().estado === "pausado");
  check("el puntero SE QUEDA señalando lo que se estaba diciendo", s.instantanea().objetivo === "termino:0:0");
  const antes = loc.locuciones.length;
  // El sintetizador real dispara `onend` al cancelar: no debe avanzar nada.
  sonando.eventos.alTerminar();
  check("el `onend` TARDÍO del audio cancelado NO avanza la narración", s.instantanea().indice === 1 && s.instantanea().estado === "pausado");
  check("…ni encola ninguna locución nueva", loc.locuciones.length === antes);
  sonando.eventos.alEmpezar();
  check("…ni un `onstart` tardío mueve el puntero", s.instantanea().objetivo === "termino:0:0");
  s.pausar();
  check("pausar dos veces no rompe nada", s.instantanea().estado === "pausado");
}

console.log("\n · E. REANUDAR");
{
  const loc = locutorFalso();
  const s = new Secuenciador(segmentos, loc);
  s.reproducir();
  loc.ultima().eventos.alEmpezar();
  loc.ultima().eventos.alTerminar();
  loc.ultima().eventos.alEmpezar();
  s.pausar();
  s.reanudar();
  check("reanudar vuelve a decir el MISMO segmento desde su principio", loc.ultima().texto === "Medio." && s.instantanea().indice === 1);
  check("mientras no suene, el puntero se queda donde estaba", s.instantanea().objetivo === "termino:0:0");
  loc.ultima().eventos.alEmpezar();
  check("al sonar, audio y puntero reempiezan juntos en el mismo término", s.instantanea().objetivo === "termino:0:0" && s.instantanea().estado === "hablando");
  loc.ultima().eventos.alTerminar();
  check("y la narración sigue por el segmento siguiente", loc.ultima().texto === "Un tercio.");
}

console.log("\n · F. REPETIR");
{
  const loc = locutorFalso();
  const s = new Secuenciador(segmentos, loc);
  s.reproducir();
  for (let i = 0; i < 2; i++) {
    loc.ultima().eventos.alEmpezar();
    loc.ultima().eventos.alTerminar();
  }
  loc.ultima().eventos.alEmpezar(); // suena el término 1 («Un tercio.»)
  const vieja = loc.ultima();
  s.repetir();
  check("repetir cancela el audio actual y vuelve a decir el mismo segmento", vieja.cancelada && loc.ultima().texto === "Un tercio.");
  vieja.eventos.alTerminar();
  check("el fin tardío del audio cancelado no avanza", s.instantanea().indice === 2);
  loc.ultima().eventos.alEmpezar();
  check("el puntero señala el mismo término", s.instantanea().objetivo === "termino:0:1");
  s.repetirPaso();
  check("repetir PASO vuelve al primer segmento del paso", s.instantanea().indice === 0 && loc.ultima().texto === "Paso uno.");
  loc.ultima().eventos.alEmpezar();
  check("…y el puntero señala la expresión entera", s.instantanea().objetivo === "paso:0");
}

console.log("\n · G. SIGUIENTE / ANTERIOR");
{
  const loc = locutorFalso();
  const s = new Secuenciador(segmentos, loc);
  s.reproducir();
  loc.ultima().eventos.alEmpezar();
  s.siguiente();
  check("siguiente salta al primer segmento del paso 1", s.instantanea().indice === 3 && loc.ultima().texto === "Paso dos.");
  loc.ultima().eventos.alEmpezar();
  check("…y el puntero lo sigue", s.instantanea().objetivo === "paso:1");
  s.anterior();
  check("anterior vuelve al paso 0", s.instantanea().indice === 0);
  loc.ultima().eventos.alEmpezar();
  check("…y el láser lo sigue", s.instantanea().objetivo === "paso:0");
  s.pausar();
  const locucionesAntes = loc.locuciones.length;
  s.siguiente();
  check("en pausa, siguiente SIGUE narrando desde el nuevo paso", s.instantanea().estado === "hablando" && loc.locuciones.length === locucionesAntes + 1 && loc.ultima().texto === "Paso dos.");
  check("…y el puntero no se mueve hasta que suena (sigue en el paso 0)", s.instantanea().objetivo === "paso:0");
  loc.ultima().eventos.alEmpezar();
  check("…cuando suena, señala el nuevo paso", s.instantanea().objetivo === "paso:1");
  s.irAPaso(99);
  check("ir más allá del último paso termina", s.instantanea().estado === "fin");
}

console.log("\n · H. TOCAR UN TÉRMINO");
{
  const loc = locutorFalso();
  const s = new Secuenciador(segmentos, loc);
  s.reproducir();
  loc.ultima().eventos.alEmpezar();
  loc.ultima().eventos.alTerminar();
  loc.ultima().eventos.alEmpezar();
  loc.ultima().eventos.alTerminar(); // ahora en el segmento 2 (paso 0, término 1)
  const narrando = loc.ultima();
  const indiceAntes = s.instantanea().indice;
  s.explicarTermino(2, 0, "Cinco sextos.");
  check("tocar un término interrumpe la narración", narrando.cancelada === true);
  check("…y dice SU explicación", loc.ultima().texto === "Cinco sextos." && s.instantanea().explicandoTermino);
  loc.ultima().eventos.alEmpezar();
  check("…señalándolo con el láser", s.instantanea().objetivo === "termino:2:0");
  narrando.eventos.alTerminar();
  check("el fin tardío de la narración cancelada no hace nada", s.instantanea().explicandoTermino && s.instantanea().indice === indiceAntes);
  loc.ultima().eventos.alTerminar();
  check("al acabar se queda en pausa, SIN mover la posición", s.instantanea().estado === "pausado" && s.instantanea().indice === indiceAntes);
  s.reanudar();
  check("reanudar continúa la narración por donde iba", loc.ultima().texto === "Un tercio." && s.instantanea().indice === indiceAntes);
  s.explicarTermino(0, 0, "Medio.");
  s.pausar();
  check("pausar mientras se explica un término lo corta", s.instantanea().estado === "pausado" && !s.instantanea().explicandoTermino);
}

console.log("\n · I. Locutor de respaldo (sin voz en el navegador)");
{
  const cola = [];
  const loc = crearLocutorTemporizado(10, (f, ms) => cola.push({ f, ms }) && cola.length - 1, (id) => (cola[id].anulado = true));
  const s = new Secuenciador(segmentos, loc);
  s.reproducir();
  check("sin voz, el puntero se mueve al instante y la duración depende del texto", s.instantanea().objetivo === "paso:0" && cola[0].ms >= 400);
  s.pausar();
  check("pausar anula el temporizador", cola[0].anulado === true);
  cola[0].f();
  check("un temporizador anulado que se dispara igualmente no avanza", s.instantanea().indice === 0);
}

console.log("\n · J. Términos: composición para KaTeX");
{
  const r = latexConTerminos("1/2 + 1/3", [{ texto: "1/2" }, { texto: "1/3" }]);
  check("cada término queda envuelto en su propia clase", r.latex.includes("\\htmlClass{pzt-0}") && r.latex.includes("\\htmlClass{pzt-1}") && r.error === null);
  check("un término ausente se rechaza", latexConTerminos("1/2 + 1/3", [{ texto: "9/9" }]).error !== null);
  check("un término que corta una fracción se rechaza", /corta/.test(latexConTerminos("6/24 + 4/24", [{ texto: "/24" }]).error ?? ""));
  check("dos términos solapados se rechazan", /solapan/.test(latexConTerminos("x² - 9", [{ texto: "x²" }, { texto: "x² - 9" }]).error ?? ""));
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length > 0) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");
process.exit(fallos.length > 0 ? 1 : 0);
