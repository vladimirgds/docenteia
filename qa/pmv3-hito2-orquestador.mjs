// PMV 3 · HITO 2 (cierre) — ORQUESTADOR PEDAGÓGICO Y VALIDACIÓN DE PASOS.
//
// Criterios del Word PMV3, H2:
//   «Implementar un servicio de servidor que lea el modo de aprendizaje, el paso
//    activo y los intentos. Aplicar la política de revelación antes de entregar
//    texto, audio o instrucciones del LSG. Extender el validador TypeScript para
//    comprobar transformaciones intermedias y registrar el motivo de cada decisión.»
//   «En: 2(x+4)=3x-1 el sistema acepta: 2x+8=3x-1 y rechaza: 2x+4=3x-1 y explica
//    el error. Si el alumno solicita la solución durante la práctica guiada,
//    recibe la ayuda prevista por la política.»
//
//   node --experimental-strip-types --no-warnings qa/pmv3-hito2-orquestador.mjs

import { PrismaClient } from "@prisma/client";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";
import {
  esSolucionFinal,
  primerPasoIncorrecto,
  resolverPorPasos,
  validarTransformacion as validar,
} from "../lib/matematicas/pasos-alumno.ts";
import { UMBRALES, aplicarPoliticaRevelacion, decidir } from "../lib/tutoria/orquestador.ts";
import { armarPiezas } from "../lib/tutoria/piezas-guiadas.ts";

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
  for (const f of fallos) console.log(`   · ${f}`);
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(fallos.length > 0 ? 1 : 0);
}

// ── 1. El validador de pasos ─────────────────────────────────────────────────
console.log("\n · 1. Validador de transformaciones (el caso del Word)");
const P = "2(x+4)=3x-1";
check("ACEPTA 2x+8=3x-1 (la distributiva bien hecha)", validar(P, "2x+8=3x-1").ok === true);
const mal = validar(P, "2x+4=3x-1");
check("RECHAZA 2x+4=3x-1", mal.ok === false);
check("…y explica el error: el 2 multiplica a TODOS los términos y el 4 quedó sin multiplicar", mal.causa === "DISTRIBUTIVA_INCOMPLETA" && /multiplica a TODOS/.test(mal.explicacion) && /4 quedó sin multiplicar/.test(mal.explicacion), mal.explicacion);
check("…sin revelar el paso correcto (no escribe «2x + 8»)", !/2x\s*\+\s*8/.test(mal.explicacion));
check("acepta pasos intermedios equivalentes: agrupar, reducir y despejar", ["2x-3x=-1-8", "-x=-9", "x=9", "3x-1=2x+8", "4x+16=6x-2"].every((s) => validar(P, s).ok === true));
check("rechaza un término que cambia de lado sin cambiar de signo", validar("2x+8=3x-1", "2x+8-3x=1").causa === "TRANSPOSICION_SIN_CAMBIAR_SIGNO");
check("…y lo explica con el término concreto", /cambiarle el signo/.test(validar("2x+8=3x-1", "2x+8+3x=-1").explicacion) && /3x/.test(validar("2x+8=3x-1", "2x+8+3x=-1").explicacion));
check("detecta qué lado cambió de valor", validar("2x+8=3x-1", "2x+8=3x").causa === "LADO_CAMBIADO");
check("distingue el signo mal repartido en −(x−3) → −x−3", validar("-(x-3)", "-x-3").causa === "SIGNO_AL_DISTRIBUIR" && validar("-(x-3)", "-x+3").ok === true);
check("expresiones: 2(x+4) → 2x+8 vale, 2x+4 no", validar("2(x+4)", "2x+8").ok === true && validar("2(x+4)", "2x+4").causa === "DISTRIBUTIVA_INCOMPLETA");
check("pasar de ecuación a expresión se rechaza", validar(P, "2x+8").causa === "CAMBIA_DE_TIPO");
check("un paso ilegible no se da por malo: ok = null", validar(P, "2x+++").ok === null);
check("un paso idéntico se acepta pero se marca sin avance", validar(P, "2(x+4)=3x-1").sinAvance === true);

console.log("\n · 1b. El PRIMER paso incorrecto de una resolución");
const buena = primerPasoIncorrecto(P, ["2x+8=3x-1", "2x-3x=-1-8", "-x=-9", "x=9"]);
check("una resolución correcta no tiene paso incorrecto", buena.primerIncorrecto === null);
const conError = primerPasoIncorrecto(P, ["2x+8=3x-1", "2x-3x=-1+8", "-x=7", "x=-7"]);
check("señala el PRIMER paso incorrecto (el 2.º) y no los siguientes", conError.primerIncorrecto === 1, String(conError.primerIncorrecto));
check("…y el error del primero (2x+4) se señala en el índice 0", primerPasoIncorrecto(P, ["2x+4=3x-1", "x=5"]).primerIncorrecto === 0);
check("resolución modelo: 2x+8=3x-1 → 2x-3x=-1-8 → -x=-9 → x=9", JSON.stringify(resolverPorPasos(P)?.map((p) => p.texto.replace(/\s/g, ""))) === JSON.stringify(["2x+8=3x-1", "2x-3x=-1-8", "-x=-9", "x=9"]));
check("…y cada paso del modelo es válido respecto al anterior", (() => { const t = resolverPorPasos(P); let a = P; return t.every((p) => { const v = validar(a, p.texto).ok; a = p.texto; return v === true; }); })());
check("x = 9 es la solución final; x = 5 no", esSolucionFinal(P, "x=9") && !esSolucionFinal(P, "x=5") && esSolucionFinal(P, "9=x"));
check("las ecuaciones con solución fraccionaria salen exactas (x = 1/3)", resolverPorPasos("-2(x-1)=4x").at(-1).texto === "x = 1/3");
check("una ecuación no lineal no se guía (null)", resolverPorPasos("x^2=4") === null);
check("una ecuación sin solución / identidad se reconoce", /no tiene solución/.test(resolverPorPasos("x+1=x+2").at(-1).explicacion) && /infinitas/.test(resolverPorPasos("2x+5=2x+5").at(-1).explicacion));

// ── 2. El orquestador (función pura) ─────────────────────────────────────────
console.log("\n · 2. Orquestador: modo + paso + intentos → decisión con motivo");
const e = (modo, evento, f = 0, p = 0, pt = p) => ({ modo, evento, paso: { indice: 1, total: 4 }, intentos: { fallosEnPaso: f, pistasEnPaso: p, pistasTotales: pt } });
const d = (...a) => decidir(e(...a));
check("guiada: inicio de paso → PREGUNTAR", d("PRACTICA_GUIADA", "INICIO_PASO").accion === "PREGUNTAR");
check("guiada: paso correcto → CONTINUAR", d("PRACTICA_GUIADA", "PASO_CORRECTO").accion === "CONTINUAR");
check("guiada: 1.er fallo → EXPLICAR el error (sin pista)", d("PRACTICA_GUIADA", "PASO_INCORRECTO", 1).accion === "EXPLICAR");
check("guiada: 2.º fallo → PISTA orientadora (nivel 1)", (() => { const x = d("PRACTICA_GUIADA", "PASO_INCORRECTO", 2); return x.accion === "PISTA" && x.nivelAyuda === 1; })());
check("guiada: 3.er fallo → PISTA concreta (nivel 2)", (() => { const x = d("PRACTICA_GUIADA", "PASO_INCORRECTO", 3); return x.accion === "PISTA" && x.nivelAyuda === 2; })());
check("guiada: 4.º fallo → MOSTRAR_PASO (revela «paso», nunca «solución»)", (() => { const x = d("PRACTICA_GUIADA", "PASO_INCORRECTO", 4); return x.accion === "MOSTRAR_PASO" && x.revelaHasta === "paso"; })());
const sol0 = d("PRACTICA_GUIADA", "PIDE_SOLUCION", 0, 0);
check("guiada: PIDE LA SOLUCIÓN sin haber intentado → recibe una PISTA (la ayuda prevista), no la solución", sol0.accion === "PISTA" && sol0.revelaHasta === "pista" && sol0.razon === "SOLUCION_NO_PERMITIDA_AUN_SE_DA_PISTA");
check("…el motivo queda escrito en palabras", /aún no corresponde/.test(sol0.motivo));
check("guiada: pide la solución tras fallar y recibir pistas → MOSTRAR_PASO, jamás MOSTRAR_SOLUCION", ["MOSTRAR_PASO"].includes(d("PRACTICA_GUIADA", "PIDE_SOLUCION", 3, 2).accion) && [0, 1, 2, 3, 4, 8].every((f) => [0, 1, 2, 5].every((p) => d("PRACTICA_GUIADA", "PIDE_SOLUCION", f, p, p + 5).accion !== "MOSTRAR_SOLUCION")));
check("guiada: pedir pista a voluntad sube de nivel y a la 3.ª muestra el paso", d("PRACTICA_GUIADA", "PIDE_PISTA", 0, 0).nivelAyuda === 1 && d("PRACTICA_GUIADA", "PIDE_PISTA", 0, 1).nivelAyuda === 2 && d("PRACTICA_GUIADA", "PIDE_PISTA", 0, 2).accion === "MOSTRAR_PASO");
check("libre: la solución completa llega tras agotar las pistas", d("PRACTICA_LIBRE", "PIDE_SOLUCION", 0, 0, 0).accion === "PISTA" && d("PRACTICA_LIBRE", "PIDE_SOLUCION", 0, 2, UMBRALES.pistasParaSolucionLibre).accion === "MOSTRAR_SOLUCION");
check("explicación: se revela todo", d("EXPLICACION", "PIDE_SOLUCION").revelaHasta === "solucion");
check("evaluación: pistas y soluciones se NIEGAN; las respuestas sólo se registran", ["PIDE_PISTA", "PIDE_SOLUCION", "PIDE_EXPLICACION"].every((ev) => d("EVALUACION", ev).accion === "NEGAR") && d("EVALUACION", "PASO_INCORRECTO", 3).accion === "REGISTRAR");
check("toda decisión lleva motivo y razón", ["EXPLICACION", "PRACTICA_GUIADA", "PRACTICA_LIBRE", "EVALUACION"].every((m) => ["INICIO_PASO", "PASO_CORRECTO", "PASO_INCORRECTO", "PIDE_PISTA", "PIDE_SOLUCION", "PIDE_EXPLICACION"].every((ev) => { const x = d(m, ev, 2, 1); return x.motivo.length > 10 && x.razon.length > 5; })));

console.log("\n · 2b. La política de revelación filtra texto, audio y LSG");
const pasos = resolverPorPasos(P);
const ctx = { siguiente: pasos[0], restantes: pasos, veredicto: null };
const decGuiada = d("PRACTICA_GUIADA", "PIDE_SOLUCION", 0, 0);
const solucionPieza = armarPiezas({ ...decGuiada, accion: "MOSTRAR_SOLUCION" }, ctx); // un fallo del armado: mete la solución
const salida = aplicarPoliticaRevelacion(decGuiada, solucionPieza);
check("aunque el armado meta la SOLUCIÓN por error, la política la retiene (texto, audio y LSG)", salida.texto.length === 0 && salida.audio === null && salida.lsg.length === 0 && salida.retenidas === 1);
const conTodo = aplicarPoliticaRevelacion(decGuiada, [...armarPiezas({ ...decGuiada, accion: "MOSTRAR_SOLUCION" }, ctx), ...armarPiezas({ ...decGuiada, accion: "MOSTRAR_PASO" }, ctx), ...armarPiezas({ ...decGuiada, accion: "PISTA", nivelAyuda: 1 }, ctx)]);
check("con pista + paso + solución, en una petición de «pista» sólo pasa la pista", conTodo.texto.length === 1 && conTodo.retenidas === 2 && !conTodo.texto.join(" ").includes("-x = -9"));
const todo = aplicarPoliticaRevelacion(d("EXPLICACION", "PIDE_SOLUCION"), armarPiezas(d("EXPLICACION", "PIDE_SOLUCION"), ctx));
check("en modo explicación la solución sí sale: texto, audio y LSG", /x = 9/.test(todo.texto[0]) && Boolean(todo.audio) && todo.lsg.some((i) => i.tipo === "resultado" && /x = 9/.test(i.texto)) && todo.retenidas === 0);
const ev = aplicarPoliticaRevelacion(d("EVALUACION", "PIDE_PISTA"), [...armarPiezas({ ...decGuiada, accion: "PISTA", nivelAyuda: 1 }, ctx)]);
check("en evaluación ninguna pista sale", ev.texto.length === 0 && ev.retenidas === 1);

// ── 3. El recorrido contra el servidor ───────────────────────────────────────
await exigirServidor();
const sufijo = Date.now().toString(36);
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) },
  });
const json = async (r) => r.json().catch(() => ({}));
const post = (cli, ruta, cuerpo) => cli(ruta, { method: "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });

console.log("\n · 3. Práctica guiada contra el servidor: 2(x+4) = 3x-1");
const alumno = async (etiqueta) => {
  const al = await registrarAlumno(BASE, { email: `qa.h2o.${etiqueta}.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: `Alumno H2 ${etiqueta}`, ciclo: "Secundaria", grado: "3" });
  return { ...al, api: api(al.sesion) };
};
const A = await alumno("a");
check("sin sesión → 401", (await post(api(null), "/api/estudiante/practica-guiada", { enunciado: P })).status === 401);
const rNo = await post(A.api, "/api/estudiante/practica-guiada", { enunciado: "x^2 = 4" });
check("una ecuación que el tutor no sabe guiar se rechaza con claridad (422)", rNo.status === 422 && /lineales/.test((await json(rNo)).error ?? ""));
const rIni = await post(A.api, "/api/estudiante/practica-guiada", { enunciado: P });
const ini = await json(rIni);
const id = ini.practica?.id;
check("el alumno abre la práctica guiada (modo por defecto: PRACTICA_GUIADA)", rIni.status === 201 && ini.practica?.modo === "PRACTICA_GUIADA" && Boolean(id));
check("el tutor PREGUNTA por el primer paso (y no revela nada)", ini.decision?.accion === "PREGUNTAR" && ini.decision.revelaHasta === "nada");
check("…el paso previsto es 0 de 4", ini.practica?.paso?.indice === 0 && ini.practica.paso.total === 4);
const paso = (texto, cli = A.api) => post(cli, `/api/estudiante/practica-guiada/${id}/paso`, { paso: texto });
const ayuda = (tipo, cli = A.api) => post(cli, `/api/estudiante/practica-guiada/${id}/ayuda`, { tipo });

const r1 = await json(await paso("2x+4=3x-1"));
check("RECHAZA 2x+4=3x-1 y EXPLICA el error", r1.valido === false && r1.causa === "DISTRIBUTIVA_INCOMPLETA" && /multiplica a TODOS/.test(r1.salida?.texto?.[0] ?? ""));
check("…decisión: EXPLICAR (primer fallo), con su motivo", r1.decision?.accion === "EXPLICAR" && r1.decision.razon === "PRIMER_FALLO_SE_EXPLICA_EL_ERROR");
check("…y la respuesta NO contiene el paso correcto", !JSON.stringify(r1).includes("2x + 8"));
const rSol = await json(await ayuda("SOLUCION"));
check("pide LA SOLUCIÓN en práctica guiada → recibe la ayuda prevista (una PISTA), no la solución", rSol.decision?.accion === "PISTA" && rSol.decision.razon === "SOLUCION_NO_PERMITIDA_AUN_SE_DA_PISTA", JSON.stringify(rSol.decision));
check("…la pista no escribe el resultado ni ningún paso", !/x = 9|-x = -9|2x \+ 8/.test(JSON.stringify(rSol.salida)) && rSol.salida?.texto?.length === 1);
const rSol2 = await json(await ayuda("SOLUCION"));
check("lo pide otra vez → la siguiente pista (más concreta)", rSol2.decision?.nivelAyuda === 2 && rSol2.salida.texto[0] !== rSol.salida.texto[0]);
const rSol3 = await json(await ayuda("SOLUCION"));
check("a la tercera, con esfuerzo acumulado, se le MUESTRA EL PASO (no la solución completa)", rSol3.decision?.accion === "MOSTRAR_PASO" && /2x \+ 8 = 3x - 1/.test(rSol3.salida?.texto?.[0] ?? "") && !/x = 9/.test(JSON.stringify(rSol3.salida)));
check("…y el audio y el LSG llevan sólo ese paso", Boolean(rSol3.salida?.audio) && rSol3.salida.lsg.some((i) => i.tipo === "caja" && /2x \+ 8/.test(i.texto)) && !rSol3.salida.lsg.some((i) => i.tipo === "resultado"));

const r2 = await json(await paso("2x+8=3x-1"));
check("ACEPTA 2x+8=3x-1", r2.valido === true && r2.practica?.pasos?.[0] === "2x+8=3x-1");
check("…avanza: paso 1 de 4 y los contadores del paso vuelven a cero", r2.practica?.paso?.indice === 1 && r2.decision?.accion === "CONTINUAR");
const rEstado = await json(await A.api(`/api/estudiante/practica-guiada/${id}`));
check("el estado guardado lo confirma", rEstado.practica?.pasoActual === "2x+8=3x-1");
const r3 = await json(await paso("2x-3x=-1+8"));
check("un error de signo al pasar términos se explica", r3.valido === false && r3.causa === "TRANSPOSICION_SIN_CAMBIAR_SIGNO" && /cambiarle el signo/.test(r3.salida.texto[0]), r3.causa);
const r3b = await json(await paso("2x-3x=-1+8"));
check("el 2.º fallo seguido → PISTA orientadora", r3b.decision?.accion === "PISTA" && r3b.decision.nivelAyuda === 1);
const r3c = await json(await paso("-x=7"));
check("el 3.er fallo seguido → PISTA concreta", r3c.decision?.accion === "PISTA" && r3c.decision.nivelAyuda === 2);
const r3d = await json(await paso("x=-7"));
check("el 4.º fallo seguido → se MUESTRA EL PASO (no la solución)", r3d.decision?.accion === "MOSTRAR_PASO" && !/x = 9/.test(JSON.stringify(r3d.salida)), JSON.stringify(r3d.decision));
const r4 = await json(await paso("2x-3x=-1-8"));
const r5 = await json(await paso("-x=-9"));
const r6 = await json(await paso("x=9"));
check("sigue y llega a la solución: x = 9 → resuelta", r4.valido && r5.valido && r6.valido && r6.practica?.resuelta === true);
check("…con mensaje final", /Resuelto/.test(r6.salida?.texto?.[0] ?? ""));
check("una práctica resuelta no admite más pasos (409)", (await paso("x=9")).status === 409);

console.log("\n · 3b. El registro de decisiones");
const decisiones = await prisma.decisionPedagogica.findMany({ where: { practicaId: id }, orderBy: [{ creadoEn: "asc" }, { id: "asc" }] });
check("cada decisión queda registrada con su motivo", decisiones.length >= 12 && decisiones.every((x) => x.motivo.length > 10 && x.razon && x.modo === "PRACTICA_GUIADA"), String(decisiones.length));
const secuencia = decisiones.map((x) => x.accion);
check("la secuencia cuenta la historia: PREGUNTAR → EXPLICAR → PISTA → PISTA → MOSTRAR_PASO → CONTINUAR …", secuencia.slice(0, 6).join(">") === "PREGUNTAR>EXPLICAR>PISTA>PISTA>MOSTRAR_PASO>CONTINUAR", secuencia.slice(0, 7).join(">"));
check("…la de «pidió la solución» guarda la entrada que la provocó (modo, paso, intentos)", (() => { const x = decisiones.find((q) => q.evento === "PIDE_SOLUCION"); return x?.entrada?.modo === "PRACTICA_GUIADA" && x.entrada.intentos?.fallosEnPaso === 1 && x.entrada.paso?.indice === 0; })());
check("…y la del error guarda su causa", decisiones.some((x) => x.entrada?.causaDelError === "DISTRIBUTIVA_INCOMPLETA"));
check("ninguna decisión de guiada reveló la «solución»", decisiones.every((x) => x.revelaHasta !== "solucion"));

console.log("\n · 3c. Otros modos y seguridad");
const rEval = await json(await post(A.api, "/api/estudiante/practica-guiada", { enunciado: "3x+2=14", modo: "EVALUACION" }));
const idE = rEval.practica?.id;
const evPaso = await json(await post(A.api, `/api/estudiante/practica-guiada/${idE}/paso`, { paso: "3x=11" }));
check("evaluación: el paso se registra SIN decir si estaba bien ni explicarlo", evPaso.decision?.accion === "REGISTRAR" && evPaso.valido === undefined && !/signo|multiplica/.test(JSON.stringify(evPaso.salida)));
const evAyuda = await json(await post(A.api, `/api/estudiante/practica-guiada/${idE}/ayuda`, { tipo: "PISTA" }));
check("evaluación: una pista se NIEGA", evAyuda.decision?.accion === "NEGAR" && evAyuda.decision.razon === "EVALUACION_SIN_AYUDAS");
const rLibre = await json(await post(A.api, "/api/estudiante/practica-guiada", { enunciado: "3x+2=14", modo: "PRACTICA_LIBRE" }));
const idL = rLibre.practica?.id;
const lAy = (t) => post(A.api, `/api/estudiante/practica-guiada/${idL}/ayuda`, { tipo: t }).then(json);
await lAy("PISTA"); await lAy("PISTA"); await lAy("PISTA");
const lSol = await lAy("SOLUCION");
check("práctica libre: tras agotar las pistas, pedir la solución SÍ la entrega", lSol.decision?.accion === "MOSTRAR_SOLUCION" && /x = 4/.test(lSol.salida?.texto?.[0] ?? "") && lSol.practica?.solucionMostrada === true);
const rExp = await json(await post(A.api, "/api/estudiante/practica-guiada", { enunciado: "3x+2=14", modo: "EXPLICACION" }));
const exSol = await json(await post(A.api, `/api/estudiante/practica-guiada/${rExp.practica?.id}/ayuda`, { tipo: "SOLUCION" }));
check("modo explicación: la solución se explica completa", exSol.decision?.accion === "MOSTRAR_SOLUCION" && /x = 4/.test(exSol.salida.texto[0]));

const B = await alumno("b");
check("otro alumno no ve ni toca mi práctica (404)", (await B.api(`/api/estudiante/practica-guiada/${id}`)).status === 404 && (await post(B.api, `/api/estudiante/practica-guiada/${id}/ayuda`, { tipo: "SOLUCION" })).status === 404);
check("una petición sin tipo de ayuda válido → 400", (await post(A.api, `/api/estudiante/practica-guiada/${idL}/ayuda`, { tipo: "TODO" })).status === 400);
check("un paso vacío → 400", (await post(A.api, `/api/estudiante/practica-guiada/${idL}/paso`, { paso: "  " })).status === 400);

// Concurrencia: dos pasos erróneos a la vez cuentan dos fallos, no uno.
const rC = await json(await post(A.api, "/api/estudiante/practica-guiada", { enunciado: P }));
const idC = rC.practica.id;
await Promise.all([1, 2, 3, 4].map(() => post(A.api, `/api/estudiante/practica-guiada/${idC}/paso`, { paso: "2x+4=3x-1" })));
const pC = await prisma.practicaGuiada.findUnique({ where: { id: idC } });
const dC = await prisma.decisionPedagogica.count({ where: { practicaId: idC, evento: "PASO_INCORRECTO" } });
check("4 pasos erróneos simultáneos cuentan exactamente 4 fallos y 4 decisiones (sin carreras)", pC.fallosEnPaso === 4 && dC === 4, `${pC.fallosEnPaso}/${dC}`);

// ── 4. El docente lo ve, y sólo lo suyo ──────────────────────────────────────
console.log("\n · 4. El docente consulta las decisiones");
const sesionAdmin = await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026");
const admin = api(sesionAdmin);
const institucion = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio H2 ${sufijo}` }))).institucion;
const crearDocente = async (etiqueta) => {
  const email = `qa.h2o.doc.${etiqueta}.${sufijo}@mentoriamath.local`;
  const u = (await json(await post(admin, "/api/admin/usuarios", { nombre: `Docente H2 ${etiqueta}`, email, password: "Docente-2026", rol: "DOCENTE" }))).usuario;
  await admin(`/api/admin/usuarios/${u?.id}`, { method: "PATCH", body: JSON.stringify({ institucionId: institucion?.id }) });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, sesion, api: api(sesion) };
};
const D1 = await crearDocente("uno");
const D2 = await crearDocente("dos");
const aula = (await json(await post(D1.api, "/api/docente/aulas", { nombre: `Aula H2 ${sufijo}`, grado: 3, seccion: "A" }))).aula;
await post(A.api, "/api/estudiante/unirse", { codigoAcceso: aula.codigoAcceso });
const lista = await json(await D1.api("/api/docente/practicas-guiadas"));
check("el docente del aula ve la práctica de su alumno", (lista.practicas ?? []).some((p) => p.id === id));
const detalle = await json(await D1.api(`/api/docente/practicas-guiadas/${id}`));
check("…con todas sus decisiones y motivos", detalle.practica?.decisiones?.length === decisiones.length && detalle.practica.decisiones.every((x) => x.motivo));
check("otro docente NO la ve (ni en la lista ni por id: 404)", !((await json(await D2.api("/api/docente/practicas-guiadas"))).practicas ?? []).some((p) => p.id === id) && (await D2.api(`/api/docente/practicas-guiadas/${id}`)).status === 404);
const paginaD1 = await (await fetch(`${BASE}/docente/tutoria`, { headers: { cookie: D1.sesion } })).text();
check("la página /docente/tutoria muestra la práctica, la decisión y su motivo", paginaD1.includes("practicas-guiadas") && paginaD1.includes("Alumno H2 a") && /aún no corresponde/.test(paginaD1) && /primer fallo/i.test(paginaD1));
const paginaD2 = await (await fetch(`${BASE}/docente/tutoria`, { headers: { cookie: D2.sesion } })).text();
check("…y otro docente no la ve", !paginaD2.includes("Alumno H2 a"));
check("un alumno no entra en el panel del docente (403)", (await A.api("/api/docente/practicas-guiadas")).status === 403);

await salir();
