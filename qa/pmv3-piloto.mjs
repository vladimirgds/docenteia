// PMV 3 · HITO 4 + PILOTO COMPLETO — TUTORÍA ADAPTATIVA Y REPORTE DE PROGRESO.
//
// El recorrido que pide el cliente para el piloto, de punta a punta:
//
//   1. El DOCENTE crea un ejercicio (con sus pistas) y un banco de ejercicios
//      parecidos, y publica un procedimiento verificado del tema (el repaso).
//   2. Crea un aula y ASIGNA el ejercicio en una tarea.
//   3. El ALUMNO se matricula y resuelve:
//        error → PISTA · error → PISTA · error → REPASO BREVE
//        → vuelve al PASO ORIGINAL → acierta → EJERCICIO EQUIVALENTE → lo resuelve.
//   4. El DOCENTE revisa el PROGRESO (página y API) y EXPORTA a PDF y Excel.
//
// Además: lo que NO debe pasar (un alumno ajeno, un ejercicio que no es de la
// tarea, un repaso «cerrado» sin abrirse, el banco privado de otro docente como
// equivalente) y el tema sin repaso publicado.
//
//   node qa/pmv3-piloto.mjs        (app en marcha, sin GEMINI_API_KEY)

import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

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

await exigirServidor();
const sufijo = Date.now().toString(36);
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) },
  });
const json = async (r) => r.json().catch(() => ({}));
const post = (cliente, ruta, cuerpo) => cliente(ruta, { method: "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });

// ── 1. El docente prepara el material ────────────────────────────────────────
console.log("\n · 1. El docente crea el ejercicio, el banco de parecidos y el repaso");
const sesionAdmin = await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026");
const admin = api(sesionAdmin);
const institucion = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio Piloto ${sufijo}` }))).institucion;
async function crearDocente(etiqueta) {
  const email = `qa.piloto.${etiqueta}.${sufijo}@mentoriamath.local`;
  const u = (await json(await post(admin, "/api/admin/usuarios", { nombre: `Prof. Piloto ${etiqueta}`, email, password: "Docente-2026", rol: "DOCENTE" }))).usuario;
  await admin(`/api/admin/usuarios/${u?.id}`, { method: "PATCH", body: JSON.stringify({ institucionId: institucion?.id }) });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, sesion, api: api(sesion) };
}
const A = await crearDocente("a");
const B = await crearDocente("b");
check("dos docentes del mismo colegio inician sesión", Boolean(A.sesion && B.sesion));

const bancos = (await json(await A.api("/api/docente/bancos"))).bancos ?? [];
const tema = (clave) => bancos.find((b) => b.tema.clave === clave)?.tema;
const fracciones = tema("fracciones");
const aritmetica = tema("aritmetica");

const crearEjercicio = async (docente, nodoId, enunciado, pistas = []) => {
  const r = await post(docente.api, "/api/docente/ejercicios", { nodoId, nivel: "INTERMEDIO", enunciado, estado: "PUBLICADO", pistas });
  return (await json(r)).ejercicio;
};
const PISTAS = ["¿Los dos denominadores son iguales?", "Busca un denominador común: un múltiplo de ambos.", "Amplifica cada fracción y suma los numeradores."];
const principal = await crearEjercicio(A, fracciones.id, "1/2 + 1/3", PISTAS);
const parecidoA1 = await crearEjercicio(A, fracciones.id, "1/3 + 1/4");
const parecidoA2 = await crearEjercicio(A, fracciones.id, "1/4 + 1/6");
const ajenoB = await crearEjercicio(B, fracciones.id, "1/5 + 1/2"); // el banco PRIVADO de otro docente
check("A crea el ejercicio principal (con 3 pistas) y dos parecidos, verificados", [principal, parecidoA1, parecidoA2].every((e) => e?.id && e.validado && e.estado === "PUBLICADO"));
check("B tiene su propio ejercicio parecido en su banco privado", Boolean(ajenoB?.id));
check("la respuesta del principal es 5/6 (la calcula el motor)", principal?.respuestaCorrecta === "5/6", principal?.respuestaCorrecta);

const rIA = await post(A.api, "/api/docente/procedimientos/borrador-ia", { nodoId: fracciones.id, titulo: "Suma de fracciones", ejercicios: 0 });
const procedimiento = (await json(rIA)).procedimiento;
check("el agente de IA genera el procedimiento del tema, verificado", rIA.status === 201 && procedimiento?.verificado === true, `HTTP ${rIA.status}`);
const rPub = await A.api(`/api/docente/procedimientos/${procedimiento.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });
check("el docente lo revisa y lo publica: será el REPASO BREVE", rPub.status === 200);

// ── 2. Aula y tarea ──────────────────────────────────────────────────────────
console.log("\n · 2. El docente crea el aula y asigna el ejercicio");
const aula = (await json(await post(A.api, "/api/docente/aulas", { nombre: `Aula Piloto ${sufijo}`, grado: 3, seccion: "A" }))).aula;
const hoy = new Date().toISOString().slice(0, 10);
const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const rTarea = await post(A.api, "/api/docente/tareas", {
  aulaId: aula.id,
  titulo: `Tarea piloto ${sufijo}`,
  fechaInicio: hoy,
  fechaVencimiento: manana,
  origenEjercicios: "banco",
  ejercicioIds: [principal.id],
  limiteReintentos: 3,
});
const tarea = (await json(rTarea)).tarea;
check("A asigna una tarea con SU ejercicio privado", rTarea.status === 201 && tarea?.ejercicioIds?.[0] === principal.id, `HTTP ${rTarea.status}`);

const registrar = async (etiqueta) =>
  registrarAlumno(BASE, { email: `qa.piloto.${etiqueta}.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: `Alumno Piloto ${etiqueta}`, ciclo: "Secundaria", grado: "3" });
async function alumnoEnAula(etiqueta) {
  const al = await registrar(etiqueta);
  const r = await post(api(al.sesion), "/api/estudiante/unirse", { codigoAcceso: aula.codigoAcceso });
  return { ...al, api: api(al.sesion), unido: r.status === 201 };
}
const S1 = await alumnoEnAula("uno");
check("el alumno se matricula con el código del aula", S1.ok && S1.unido);
const intruso = await registrar("intruso"); // sin aula
const rutaCorregir = (t, e) => `/api/estudiante/tareas/${t}/ejercicios/${e}/corregir`;
const rutaTutor = (t, e, parte) => `/api/estudiante/tareas/${t}/ejercicios/${e}/${parte}`;
const responder = (cliente, respuesta, t = tarea.id, e = principal.id) => post(cliente, rutaCorregir(t, e), { respuesta });

// ── 3. La tutoría adaptativa ─────────────────────────────────────────────────
console.log("\n · 3. El alumno se atasca: pista → pista → repaso → vuelve → equivalente");
const e1 = await json(await responder(S1.api, "7/5"));
check("1.er error → el tutor da la PISTA 1 (la más suave)", e1.correcto === false && e1.tutor?.accion === "PISTA" && e1.tutor.pista === PISTAS[0], JSON.stringify(e1.tutor));
const e2 = await json(await responder(S1.api, "8/6"));
check("2.º error → la PISTA 2", e2.tutor?.accion === "PISTA" && e2.tutor.pista === PISTAS[1]);
const e3 = await json(await responder(S1.api, "9/9"));
check("3.er error seguido (bloqueo) → ABRE UN REPASO BREVE", e3.tutor?.accion === "ABRIR_REPASO", JSON.stringify(e3.tutor));
check("…con el procedimiento publicado del tema", e3.tutor?.repaso?.id === procedimiento.id);
const vistaRepaso = await S1.api(`/api/estudiante/procedimientos/${e3.tutor?.repaso?.id}`);
check("…que el alumno puede abrir en la pizarra", vistaRepaso.status === 200);

const cerrar = await json(await post(S1.api, rutaTutor(tarea.id, principal.id, "repaso")));
check("cierra el repaso → el tutor dice VOLVER AL PASO ORIGINAL", cerrar.tutor?.accion === "VOLVER_AL_PASO");
const cerrarOtra = await json(await post(S1.api, rutaTutor(tarea.id, principal.id, "repaso")));
check("cerrar un repaso que ya no está abierto no cambia nada", cerrarOtra.tutor?.accion === "CONTINUAR");

const ok1 = await json(await responder(S1.api, "5/6"));
check("acierta el ejercicio ORIGINAL tras el repaso → correcto", ok1.correcto === true);
check("…y el tutor PROPONE UN EJERCICIO EQUIVALENTE", ok1.tutor?.accion === "PROPONER_EQUIVALENTE" && Boolean(ok1.tutor.equivalente?.id), JSON.stringify(ok1.tutor));
const eq = ok1.tutor?.equivalente;
check("…uno de los parecidos de A (no el original, no el de otro docente)", [parecidoA1.id, parecidoA2.id].includes(eq?.id) && eq?.id !== principal.id && eq?.id !== ajenoB.id);
check("…sin respuesta en el enunciado que viaja", !JSON.stringify(ok1).includes("respuestaCorrecta"));

const esperadaEq = (await prisma.ejercicio.findUnique({ where: { id: eq.id }, select: { respuestaCorrecta: true } })).respuestaCorrecta;
const eqMal = await json(await post(S1.api, rutaTutor(tarea.id, principal.id, "equivalente"), { equivalenteId: eq.id, respuesta: "0" }));
const eqBien = await json(await post(S1.api, rutaTutor(tarea.id, principal.id, "equivalente"), { equivalenteId: eq.id, respuesta: esperadaEq }));
check("el equivalente se corrige en el servidor: mal → false, bien → true", eqMal.correcto === false && eqBien.correcto === true);

console.log("\n · 3b. Lo que NO debe pasar");
check("un alumno SIN aula no puede usar el tutor (403)", (await responder(api(intruso.sesion), "1")).status === 403);
check("…ni pedir pistas (403)", (await post(api(intruso.sesion), rutaTutor(tarea.id, principal.id, "pista"))).status === 403);
check("un ejercicio que NO es de la tarea → 404", (await responder(S1.api, "x", tarea.id, parecidoA1.id)).status === 404);
check("un equivalente que NO se le propuso → 404", (await post(S1.api, rutaTutor(tarea.id, principal.id, "equivalente"), { equivalenteId: parecidoA1.id === eq.id ? parecidoA2.id : parecidoA1.id, respuesta: "1" })).status === 404);
check("el ejercicio de otro docente no se puede usar como equivalente (404)", (await post(S1.api, rutaTutor(tarea.id, principal.id, "equivalente"), { equivalenteId: ajenoB.id, respuesta: "1" })).status === 404);
check("un docente en las rutas del alumno → 403", (await responder(A.api, "1")).status === 403);

// Repetido con otros alumnos: el equivalente NUNCA sale del banco privado de otro docente.
const propuestos = new Set([eq.id]);
for (const etiqueta of ["dos", "tres", "cuatro"]) {
  const S = await alumnoEnAula(etiqueta);
  for (const r of ["1", "2", "3"]) await responder(S.api, r);
  await post(S.api, rutaTutor(tarea.id, principal.id, "repaso"));
  const f = await json(await responder(S.api, "5/6"));
  if (f.tutor?.equivalente?.id) propuestos.add(f.tutor.equivalente.id);
}
check("en 4 alumnos distintos, ningún equivalente sale del banco privado de B", !propuestos.has(ajenoB.id) && propuestos.size >= 1, [...propuestos].join(","));
const resto = await prisma.sesionTutoria.count({ where: { tareaId: tarea.id } });
check("hay una sesión de tutoría por alumno", resto === 4, `${resto}`);

// El estado queda en la base, ejercicio por ejercicio.
const sesion1 = await prisma.sesionTutoria.findFirst({
  where: { estudianteId: S1.id ?? undefined, tareaId: tarea.id },
  include: { eventos: { orderBy: { creadoEn: "asc" } }, estudiante: { select: { email: true } } },
});
const s1 = await prisma.sesionTutoria.findFirst({
  where: { tareaId: tarea.id, estudiante: { email: `qa.piloto.uno.${sufijo}@mentoriamath.local` } },
  include: { eventos: { orderBy: { creadoEn: "asc" } } },
});
check("la sesión guarda los contadores: 3 errores, 2 pistas, 1 repaso, 1 equivalente, resuelta", s1?.erroresTotales === 3 && s1.pistasDadas === 2 && s1.repasos === 1 && s1.equivalentes === 1 && s1.resuelta === true, JSON.stringify(s1 && { e: s1.erroresTotales, p: s1.pistasDadas, r: s1.repasos, q: s1.equivalentes, ok: s1.resuelta }));
const secuencia = (s1?.eventos ?? []).map((e) => e.tipo).join(" > ");
check(
  "…y el historial cuenta la historia, en orden",
  secuencia === "RESPUESTA_INCORRECTA > PISTA > RESPUESTA_INCORRECTA > PISTA > RESPUESTA_INCORRECTA > REPASO_ABIERTO > REPASO_CERRADO > RESPUESTA_CORRECTA > EQUIVALENTE_PROPUESTO > EQUIVALENTE_RESPONDIDO > EQUIVALENTE_RESPONDIDO",
  secuencia,
);
void sesion1;

// Pedir una pista a voluntad: escalera por el servidor.
const S5 = await alumnoEnAula("cinco");
const pa = await json(await post(S5.api, rutaTutor(tarea.id, principal.id, "pista")));
const pb = await json(await post(S5.api, rutaTutor(tarea.id, principal.id, "pista")));
check("pedir una pista a voluntad: salen de una en una (1.ª y 2.ª)", pa.tutor?.pista === PISTAS[0] && pb.tutor?.pista === PISTAS[1]);

// ── 3c. Tema sin repaso publicado ────────────────────────────────────────────
console.log("\n · 3c. Un tema SIN repaso publicado: el itinerario no se atasca");
const solo = await crearEjercicio(A, aritmetica.id, "20 + 22");
await crearEjercicio(A, aritmetica.id, "30 + 12");
const tareaAr = (await json(await post(A.api, "/api/docente/tareas", { aulaId: aula.id, titulo: `Tarea aritmética ${sufijo}`, fechaInicio: hoy, fechaVencimiento: manana, origenEjercicios: "banco", ejercicioIds: [solo.id], limiteReintentos: 3 }))).tarea;
const S6 = await alumnoEnAula("seis");
for (const r of ["1", "2"]) await responder(S6.api, r, tareaAr.id, solo.id);
const sinRepaso = await json(await responder(S6.api, "3", tareaAr.id, solo.id));
check("sin repaso publicado, el 3.er error lo dice con claridad (repaso null)", sinRepaso.tutor?.accion === "ABRIR_REPASO" && sinRepaso.tutor.repaso === null && /profesor/.test(sinRepaso.tutor.mensaje));
const sesAr = await prisma.sesionTutoria.findFirst({ where: { tareaId: tareaAr.id }, select: { fase: true } });
check("…y la sesión no se queda en REPASO para siempre: pasa a REGRESO", sesAr?.fase === "REGRESO", sesAr?.fase);
const trasUno = await json(await responder(S6.api, "4", tareaAr.id, solo.id));
const trasDos = await json(await responder(S6.api, "5", tareaAr.id, solo.id));
check("…y tras 2 errores más se propone un equivalente", trasUno.tutor?.accion === "PISTA" && trasDos.tutor?.accion === "PROPONER_EQUIVALENTE");

// ── 4. El docente revisa el progreso y exporta ───────────────────────────────
console.log("\n · 4. El docente revisa el progreso y exporta a PDF y Excel");
const rPagina = await fetch(`${BASE}/docente/tutoria`, { headers: { cookie: A.sesion } });
const html = await rPagina.text();
check("la página /docente/tutoria carga para el docente", rPagina.status === 200 && html.includes("Tutoría adaptativa"));
check("…y muestra a sus alumnos con su actividad", html.includes("Alumno Piloto uno"));
check("…pero NO muestra a los de otro docente", !(await (await fetch(`${BASE}/docente/tutoria`, { headers: { cookie: B.sesion } })).text()).includes("Alumno Piloto uno"));
check("un alumno no entra en /docente/tutoria", (await fetch(`${BASE}/docente/tutoria`, { headers: { cookie: S1.sesion }, redirect: "manual" })).status !== 200);

const rPdf = await fetch(`${BASE}/api/docente/exportar/pdf`, { headers: { cookie: A.sesion } });
const pdf = Buffer.from(await rPdf.arrayBuffer());
check("exportar PDF: 200, application/pdf y empieza por %PDF", rPdf.status === 200 && /pdf/.test(rPdf.headers.get("content-type") ?? "") && pdf.subarray(0, 4).toString() === "%PDF", `HTTP ${rPdf.status}`);
check("…con contenido real (no vacío)", pdf.length > 2000, `${pdf.length} bytes`);

const rXlsx = await fetch(`${BASE}/api/docente/exportar/excel`, { headers: { cookie: A.sesion } });
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(await rXlsx.arrayBuffer()));
const hojas = wb.worksheets.map((h) => h.name);
check("exportar Excel: 200 y trae las hojas del informe + «Tutoría adaptativa»", rXlsx.status === 200 && ["Estudiantes", "Tareas", "Matriz de calificaciones", "Sesiones", "Tutoría adaptativa"].every((h) => hojas.includes(h)), hojas.join(","));
const filas = (nombre) => {
  const filas = [];
  wb.getWorksheet(nombre).eachRow((fila) => filas.push(fila.values.slice(1)));
  return filas;
};
const hojaTut = filas("Tutoría adaptativa");
const filaS1 = hojaTut.find((f) => f[1] === "Alumno Piloto uno");
check("la hoja de tutoría tiene la fila del alumno con 3 errores, 2 pistas, 1 repaso, 1 equivalente", filaS1 && filaS1[6] === 3 && filaS1[7] === 2 && filaS1[8] === 1 && filaS1[9] === 1 && filaS1[11] === "Sí", JSON.stringify(filaS1));
const hojaEst = filas("Estudiantes");
const estUno = hojaEst.find((f) => f[1] === "Alumno Piloto uno");
check("la hoja «Estudiantes» suma sus pistas, repasos y equivalentes", estUno && estUno[5] === 2 && estUno[6] === 1 && estUno[7] === 1, JSON.stringify(estUno));
check("el Excel del docente B no trae a los alumnos de A", !JSON.stringify(await (async () => {
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(Buffer.from(await (await fetch(`${BASE}/api/docente/exportar/excel`, { headers: { cookie: B.sesion } })).arrayBuffer()));
  const t = [];
  w.eachSheet((h) => h.eachRow((f) => t.push(f.values)));
  return t;
})()).includes("Alumno Piloto uno"));

// ── 5. El mismo recorrido, en un navegador real ──────────────────────────────
console.log("\n · 5. El alumno, en Chrome: pistas, repaso en la pizarra, equivalente");
const CHROME =
  process.env.QA_CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((r) => existsSync(r));
if (!CHROME) {
  check("hay un Chrome para la prueba de navegador (QA_CHROME)", false, "no se encontró Chrome");
  await salir();
}
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const S7 = await alumnoEnAula("siete");
// Todo alumno hace primero la evaluación inicial (el producto lo exige: sin ella
// la lección y las tareas lo mandan al diagnóstico). Aquí se completa por la API.
const emailS7 = `qa.piloto.siete.${sufijo}@mentoriamath.local`;
await fetch(`${BASE}/api/estudiante/nivel-educativo`, { method: "PUT", headers: { "Content-Type": "application/json", cookie: S7.sesion }, body: JSON.stringify({ etapa: "PRIMARIA", curso: 4 }) });
const pruebaS7 = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: S7.sesion } })).json();
await fetch(`${BASE}/api/diagnostico`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: S7.sesion },
  body: JSON.stringify({ respuestas: (pruebaS7.preguntas ?? []).map((q) => ({ preguntaId: q.id, respuestaDada: q.tipo === "opcion_multiple" ? "a" : "0" })) }),
});
S7.sesion = (await iniciarSesion(BASE, emailS7, "Alumno-2026")) ?? S7.sesion; // el nivel viaja en el JWT
const nav = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await nav.newContext({ viewport: { width: 1360, height: 1100 } });
await ctx.addCookies(S7.sesion.split("; ").map((c) => ({ name: c.slice(0, c.indexOf("=")), value: c.slice(c.indexOf("=") + 1), url: BASE })));
await ctx.addInitScript(() => {
  window.__pzVigilanciaMs = 3600000;
  window.SpeechSynthesisUtterance = class {
    constructor(t) {
      this.text = t;
    }
  };
  Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [], speak() {}, cancel() {} }, configurable: true });
});
const pag = await ctx.newPage();
const errores = [];
pag.on("console", (m) => m.type() === "error" && errores.push(m.text()));
pag.on("pageerror", (e) => errores.push("PAGEERROR " + e.message));
await pag.goto(`${BASE}/estudiante/leccion?tareaId=${tarea.id}`, { waitUntil: "networkidle" });
const campo = pag.locator('input[aria-label="Tu respuesta"]').first();
const enviar = async (valor) => {
  await campo.fill(valor);
  await pag.getByRole("button", { name: "Responder", exact: true }).click();
};
check("la tarea abre con el ejercicio principal", (await pag.locator("text=Ejercicio 1 de 1").count()) > 0, `URL: ${pag.url()} · texto: ${(await pag.locator("body").innerText()).replace(/s+/g, " ").slice(0, 200)}`);

await enviar("7/5");
await pag.waitForSelector('[data-testid="pistas-tutor"] li');
check("tras el 1.er error, aparece la PISTA 1 en pantalla (y el alumno sigue en el ejercicio)", (await pag.textContent('[data-testid="pistas-tutor"] li:nth-child(1)')).includes("denominadores") && (await pag.locator("text=Ejercicio 1 de 1").count()) > 0);
await enviar("8/6");
await pag.waitForSelector('[data-testid="pistas-tutor"] li:nth-child(2)');
check("tras el 2.º, la PISTA 2", true);
await pag.click('[data-testid="pedir-pista"]');
await pag.waitForSelector('[data-testid="pistas-tutor"] li:nth-child(3)');
check("pedir una pista a voluntad da la 3.ª", (await pag.textContent('[data-testid="pistas-tutor"] li:nth-child(3)')).includes("Amplifica"));
await enviar("9/9");
await enviar("1/1");
await pag.waitForSelector('[data-testid="repaso"]', { timeout: 15000 });
check("el bloqueo ABRE EL REPASO: la pizarra con el procedimiento, dentro de la tarea", (await pag.locator('[data-testid="repaso"] [data-testid="tablero"]').count()) === 1);
check("…con el profesor 3D y los mandos de la explicación", (await pag.locator('[data-testid="repaso"] [data-profesor]').count()) === 1 && (await pag.locator('[data-testid="repaso"] [data-testid="alternar"]').count()) === 1);
await pag.click('[data-testid="terminar-repaso"]');
await pag.waitForSelector('[data-testid="repaso"]', { state: "detached" });
check("«He terminado el repaso» cierra la pizarra y devuelve AL EJERCICIO ORIGINAL", (await pag.locator("text=Ejercicio 1 de 1").count()) > 0 && (await pag.locator('input[aria-label="Tu respuesta"]').count()) > 0);
await enviar("5/6");
await pag.waitForSelector('[data-testid="equivalente"]', { timeout: 15000 });
check("al acertar el original, el tutor propone un EJERCICIO EQUIVALENTE", true);
const propuestoUI = await prisma.eventoTutoria.findFirst({ where: { tipo: "EQUIVALENTE_PROPUESTO", sesion: { estudianteId: (await prisma.usuario.findUnique({ where: { email: `qa.piloto.siete.${sufijo}@mentoriamath.local` }, select: { id: true } })).id } }, select: { detalle: true } });
const esperadaUI = (await prisma.ejercicio.findUnique({ where: { id: propuestoUI.detalle.equivalenteId }, select: { respuestaCorrecta: true } })).respuestaCorrecta;
await pag.fill('input[aria-label="Respuesta al ejercicio parecido"]', esperadaUI);
await pag.getByRole("button", { name: "Comprobar" }).click();
await pag.waitForSelector('[data-testid="veredicto-equivalente"][data-tipo="ok"]');
check("lo resuelve y el tutor lo celebra", true);
await pag.waitForSelector("text=Tarea completada", { timeout: 15000 });
check("la tarea se completa y se entrega con su nota", await pag.waitForSelector("text=Nota:", { timeout: 15000 }).then(() => true).catch(() => false));
check("sin errores de consola en todo el recorrido", errores.length === 0, errores.slice(0, 3).join(" | "));

// El docente, en el navegador, ve al alumno y puede exportar.
const ctxDoc = await nav.newContext({ viewport: { width: 1360, height: 1000 } });
await ctxDoc.addCookies(A.sesion.split("; ").map((c) => ({ name: c.slice(0, c.indexOf("=")), value: c.slice(c.indexOf("=") + 1), url: BASE })));
const pagDoc = await ctxDoc.newPage();
await pagDoc.goto(`${BASE}/docente/tutoria`, { waitUntil: "networkidle" });
check("el docente ve en su panel la tutoría del alumno que acaba de pasar por ella", (await pagDoc.locator("text=Alumno Piloto siete").count()) > 0);
check("…con los botones de exportar PDF y Excel", (await pagDoc.locator('[data-testid="exportar-pdf"]').count()) === 1 && (await pagDoc.locator('[data-testid="exportar-excel"]').count()) === 1);
await pagDoc.locator('[data-testid="sesion-tutoria"]').first().locator("summary").click();
check("…y desplegando una sesión se lee su historia (pistas, repaso…)", /Repaso abierto/.test(await pagDoc.locator('[data-testid="sesion-tutoria"]').first().textContent()));
await pagDoc.screenshot({ path: process.env.QA_CAPTURA_TUTORIA || "tutoria-qa.png", fullPage: true });

await nav.close();
await salir();
