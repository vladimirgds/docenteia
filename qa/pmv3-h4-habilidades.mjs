// PMV 3 · H4 — Habilidades, prerrequisitos y el caso de recuperación del Word.
//
//   A. Habilidades y prerrequisitos SIN CICLOS (un ciclo → 409, explicado).
//   B. Caso completo: errores repetidos en 2x − 3x → el tutor abre el REPASO DE
//      SIGNOS (prerrequisito) → vuelve a ESA operación → acierto → ejercicio
//      equivalente → lo resuelve.
//   C. Registro por habilidad: intentos, errores, aciertos, pistas y repasos.
//   D. El docente lo ve en el PANEL, el PDF y el EXCEL, con las MISMAS métricas
//      y el MISMO filtro por aula.
//
//   node qa/pmv3-h4-habilidades.mjs      (con la app en marcha)
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";
import { cicloAlSustituir, creariaCiclo, prerrequisitosEnOrden } from "../lib/docente/habilidades.ts";

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

console.log("\n · Unidad: el grafo");
const g = [
  { de: "semejantes", a: "signos" },
  { de: "signos", a: "enteros" },
];
check("A→B→C: añadir C→A cerraría un ciclo", JSON.stringify(creariaCiclo(g, "enteros", "semejantes")) === JSON.stringify(["enteros", "semejantes", "signos", "enteros"]));
check("…y A→A también", creariaCiclo(g, "signos", "signos") !== null);
check("una arista nueva sin ciclo se acepta", creariaCiclo(g, "semejantes", "enteros") === null);
check("sustituir prerrequisitos ignora las aristas viejas del nodo", cicloAlSustituir(g, "signos", []) === null && cicloAlSustituir(g, "signos", ["semejantes"]) !== null);
check("prerrequisitos del más cercano al más lejano", JSON.stringify(prerrequisitosEnOrden(g, "semejantes")) === JSON.stringify(["signos", "enteros"]));

await exigirServidor();
const sufijo = Date.now().toString(36);
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) },
  });
const json = async (r) => r.json().catch(() => ({}));
const post = (a, ruta, cuerpo) => a(ruta, { method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const patch = (a, ruta, cuerpo) => a(ruta, { method: "PATCH", body: JSON.stringify(cuerpo ?? {}) });

console.log("\n · Preparación");
const admin = api(await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026"));
const institucion = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio H4 ${sufijo}` }))).institucion;
async function crearDocente(etiqueta) {
  const email = `qa.h4.${etiqueta}.${sufijo}@mentoriamath.local`;
  const u = (await json(await post(admin, "/api/admin/usuarios", { nombre: `QA H4 ${etiqueta}`, email, password: "Docente-2026", rol: "DOCENTE" }))).usuario;
  await patch(admin, `/api/admin/usuarios/${u?.id}`, { institucionId: institucion?.id });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, sesion, api: api(sesion) };
}
const A = await crearDocente("a");
const B = await crearDocente("b");
const bancos = (await json(await A.api("/api/docente/bancos"))).bancos ?? [];
const tAri = bancos.find((b) => b.tema.clave === "aritmetica")?.tema;
const tEcu = bancos.find((b) => b.tema.clave === "ecuaciones-lineales")?.tema;
check("dos docentes y los temas Aritmética y Ecuaciones", Boolean(A.sesion && B.sesion && tAri?.id && tEcu?.id));

// El repaso de signos: un procedimiento publicado de A.
const rRep = await post(A.api, "/api/docente/procedimientos", {
  nodoId: tAri.id,
  titulo: `Repaso de signos ${sufijo}`,
  ejemplo: "3 - 5",
  pasos: [
    { explica: "Restar más de lo que hay deja un resultado negativo.", escribe: "3 - 5", tipo: "transformacion" },
    { explica: "Tres menos cinco es menos dos.", escribe: "-2", tipo: "resultado" },
  ],
  preguntas: [{ enunciado: "¿Cuánto es 2 - 3?", respuesta: "-1" }],
  pistas: ["Fíjate en cuál de los dos números es mayor."],
});
const repaso = (await json(rRep)).procedimiento;
const rPubRep = await patch(A.api, `/api/docente/procedimientos/${repaso?.id}`, { estado: "PUBLICADO" });
check("A publica el procedimiento «Repaso de signos»", rPubRep.status === 200, `HTTP ${rRep.status}/${rPubRep.status}`);

console.log("\n · A. Habilidades y prerrequisitos sin ciclos");
const crearH = (doc, cuerpo) => post(doc.api, "/api/docente/habilidades", cuerpo);
const rSig = await crearH(A, { clave: `signos-${sufijo}`, nombre: "Ley de los signos", repasoId: repaso.id });
const signos = (await json(rSig)).habilidad;
check("crear «Ley de los signos» con su repaso → 201", rSig.status === 201 && signos?.repasoId === repaso.id);
const rSem = await crearH(A, { clave: `semejantes-${sufijo}`, nombre: "Reducir términos semejantes", requiere: [signos.id] });
const semejantes = (await json(rSem)).habilidad;
check("crear «Reducir términos semejantes», que REQUIERE la de signos → 201", rSem.status === 201 && semejantes?.requiere?.[0]?.requiereId === signos.id);
check("una clave repetida → 409", (await crearH(A, { clave: `signos-${sufijo}`, nombre: "Otra" })).status === 409);
const rCiclo = await patch(A.api, `/api/docente/habilidades/${signos.id}`, { requiere: [semejantes.id] });
const jCiclo = await json(rCiclo);
check("hacer que «signos» requiera «semejantes» cerraría un ciclo → 409, explicado", rCiclo.status === 409 && /ciclo/.test(jCiclo.error ?? "") && /Ley de los signos/.test(jCiclo.error ?? ""), JSON.stringify(jCiclo));
check("…y no se guarda nada", (await prisma.prerrequisitoHabilidad.count({ where: { habilidadId: signos.id } })) === 0);
check("una habilidad no puede requerirse a sí misma (409)", (await patch(A.api, `/api/docente/habilidades/${signos.id}`, { requiere: [signos.id] })).status === 409);
check("B no ve ni edita las habilidades de A (404)", (await patch(B.api, `/api/docente/habilidades/${signos.id}`, { nombre: "x" })).status === 404);
check("B no puede usar una habilidad de A como prerrequisito (404)", (await crearH(B, { clave: `b-${sufijo}`, nombre: "De B", requiere: [signos.id] })).status === 404);
check("un repaso que no es un procedimiento publicado visible → 400", (await crearH(A, { clave: `x-${sufijo}`, nombre: "X", repasoId: "no-existe" })).status === 400);
const lista = (await json(await A.api("/api/docente/habilidades"))).habilidades ?? [];
check("A lista sus dos habilidades", lista.length === 2);

// Ejercicios de la habilidad.
const crearEj = async (enunciado) =>
  (await json(await post(A.api, "/api/docente/ejercicios", { nodoId: tEcu.id, nivel: "INTERMEDIO", enunciado, estado: "PUBLICADO", pistas: ["Agrupa primero los términos con x.", "2x menos 3x: ¿cuántas x quedan?"] }))).ejercicio;
const ej = await crearEj("2x - 3x = 5");
const eq = await crearEj("4x - 6x = 8");
check("A crea «2x - 3x = 5» (−5) y un equivalente «4x - 6x = 8» (−4)", ej?.respuestaCorrecta === "-5" && eq?.respuestaCorrecta === "-4", JSON.stringify([ej?.respuestaCorrecta, eq?.respuestaCorrecta]));
for (const e of [ej, eq]) await post(A.api, `/api/docente/habilidades/${semejantes.id}/ejercicios`, { ejercicioId: e.id });
check("los dos quedan enlazados a «Reducir términos semejantes»", (await prisma.ejercicio.count({ where: { id: { in: [ej.id, eq.id] }, habilidadId: semejantes.id } })) === 2);
check("B no puede enlazar un ejercicio de A (404)", (await post(B.api, `/api/docente/habilidades/${semejantes.id}/ejercicios`, { ejercicioId: ej.id })).status === 404);

const aula = (await json(await post(A.api, "/api/docente/aulas", { nombre: `Aula H4 ${sufijo}`, grado: 3, seccion: "A" }))).aula;
const aulaVacia = (await json(await post(A.api, "/api/docente/aulas", { nombre: `Aula H4 vacía ${sufijo}`, grado: 3, seccion: "B" }))).aula;
const alumno = await registrarAlumno(BASE, { email: `qa.h4.al.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: `Alumna H4 ${sufijo}`, ciclo: "Secundaria", grado: "3" });
const Al = api(alumno.sesion);
await post(Al, "/api/estudiante/unirse", { codigoAcceso: aula.codigoAcceso });
const hoy = new Date().toISOString().slice(0, 10);
const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const tarea = (await json(await post(A.api, "/api/docente/tareas", { aulaId: aula.id, titulo: `Semejantes ${sufijo}`, fechaInicio: hoy, fechaVencimiento: manana, origenEjercicios: "banco", ejercicioIds: [ej.id], limiteReintentos: 3, nodoId: tEcu.id }))).tarea;
check("A asigna la tarea con «2x - 3x = 5»", Boolean(tarea?.id));

console.log("\n · B. Bloqueo → repaso de signos → regreso → equivalente");
const base = `/api/estudiante/tareas/${tarea.id}/ejercicios/${ej.id}`;
const r1 = await json(await post(Al, `${base}/corregir`, { respuesta: "5" }));
const r2 = await json(await post(Al, `${base}/corregir`, { respuesta: "5" }));
check("dos errores de signo → dos pistas", r1.tutor?.accion === "PISTA" && r2.tutor?.accion === "PISTA", JSON.stringify([r1.tutor?.accion, r2.tutor?.accion]));
const r3 = await json(await post(Al, `${base}/corregir`, { respuesta: "5" }));
check(
  "al tercer error, el tutor abre el REPASO DE SIGNOS (prerrequisito de la habilidad)",
  r3.tutor?.accion === "ABRIR_REPASO" && r3.tutor?.repaso?.id === repaso.id && /Ley de los signos/.test(r3.tutor?.mensaje ?? ""),
  JSON.stringify(r3.tutor),
);
const rCierre = await json(await post(Al, `${base}/repaso`, {}));
check("al cerrar el repaso, VUELVE A ESA OPERACIÓN (el mismo ejercicio)", rCierre.tutor?.accion === "VOLVER_AL_PASO");
check("…y la sesión de tutoría sigue en ese ejercicio, en fase REGRESO", (await prisma.sesionTutoria.findFirst({ where: { tareaId: tarea.id, ejercicioId: ej.id } }))?.fase === "REGRESO");
const r4 = await json(await post(Al, `${base}/corregir`, { respuesta: "-5" }));
check("ahora acierta (−5) → el tutor propone un ejercicio EQUIVALENTE", r4.correcto === true && r4.tutor?.accion === "PROPONER_EQUIVALENTE" && r4.tutor?.equivalente?.id === eq.id, JSON.stringify(r4.tutor));
const r5 = await json(await post(Al, `${base}/equivalente`, { equivalenteId: eq.id, respuesta: "-4" }));
check("…y resuelve el equivalente (−4)", r5.correcto === true, JSON.stringify(r5));

console.log("\n · C. Registro por habilidad");
const reg = await prisma.registroHabilidad.findFirst({ where: { habilidadId: semejantes.id } });
check(
  "«Reducir términos semejantes»: 4 intentos, 3 errores, 1 acierto, 2 pistas, 1 repaso",
  reg?.intentos === 4 && reg?.errores === 3 && reg?.aciertos === 1 && reg?.pistas === 2 && reg?.repasos === 1,
  JSON.stringify(reg),
);
const ses = await prisma.sesionTutoria.findFirst({ where: { tareaId: tarea.id } });
check("la sesión de tutoría guarda la habilidad", ses?.habilidadId === semejantes.id);
const evRep = await prisma.eventoTutoria.findFirst({ where: { sesionId: ses.id, tipo: "REPASO_ABIERTO" } });
check("el evento «repaso abierto» dice qué habilidad se repasó", evRep?.detalle?.habilidad === "Ley de los signos");

console.log("\n · D. Panel, PDF y Excel: mismas métricas, mismo filtro");
const COLUMNAS_HABILIDADES = ["Estudiante", "Habilidad", "Intentos", "Errores", "Aciertos", "Pistas", "Repasos"];
const rPanel = await A.api(`/docente/tutoria?aulaId=${aula.id}`);
const html = await rPanel.text();
check("el panel carga con el filtro de aula", rPanel.status === 200 && html.includes('data-testid="filtro-aula"'));
check("…muestra la tabla «Por habilidad» con sus columnas", html.includes('data-testid="resumen-habilidades"') && COLUMNAS_HABILIDADES.every((c) => html.includes(`>${c}<`)));
check("…la habilidad, el repaso de signos y el equivalente resuelto", html.includes("Reducir términos semejantes") && html.includes("habilidad: Ley de los signos") && html.includes("equivalente resuelto"));
check("…y los enlaces de exportación llevan el MISMO filtro", html.includes(`/api/docente/exportar/pdf?aulaId=${aula.id}`) && html.includes(`/api/docente/exportar/excel?aulaId=${aula.id}`));

const excel = async (q) => {
  const r = await fetch(`${BASE}/api/docente/exportar/excel${q}`, { headers: { cookie: A.sesion } });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));
  const hoja = (n) => {
    const f = [];
    wb.getWorksheet(n)?.eachRow((x) => f.push(x.values.slice(1)));
    return f;
  };
  return { status: r.status, hoja };
};
const x = await excel(`?aulaId=${aula.id}`);
const hab = x.hoja("Habilidades");
check("Excel: hoja «Habilidades» con las MISMAS columnas que el panel", x.status === 200 && JSON.stringify(hab[0]) === JSON.stringify(["Aula", ...COLUMNAS_HABILIDADES]), JSON.stringify(hab[0]));
const filaHab = hab.find((f) => f[2] === "Reducir términos semejantes");
check("…con la fila de la alumna: 4 · 3 · 1 · 2 · 1", filaHab && filaHab[3] === 4 && filaHab[4] === 3 && filaHab[5] === 1 && filaHab[6] === 2 && filaHab[7] === 1, JSON.stringify(filaHab));
const tut = x.hoja("Tutoría adaptativa");
const filaTut = tut.find((f) => f[5] === "2x - 3x = 5");
check("Excel: la tutoría del ejercicio dice la habilidad y «Equivalente resuelto: Sí»", filaTut && filaTut[4] === "Reducir términos semejantes" && filaTut[10] === "Sí", JSON.stringify(filaTut));
const xv = await excel(`?aulaId=${aulaVacia.id}`);
check("Excel con el filtro de OTRA aula: no trae a la alumna", !JSON.stringify(xv.hoja("Habilidades")).includes("Alumna H4") && !JSON.stringify(xv.hoja("Estudiantes")).includes("Alumna H4"));
const rPdf = await fetch(`${BASE}/api/docente/exportar/pdf?aulaId=${aula.id}`, { headers: { cookie: A.sesion } });
const pdf = Buffer.from(await rPdf.arrayBuffer());
check("PDF con el filtro: 200, application/pdf, archivo válido", rPdf.status === 200 && /pdf/.test(rPdf.headers.get("content-type") ?? "") && pdf.subarray(0, 4).toString() === "%PDF");
const rPdfB = await fetch(`${BASE}/api/docente/exportar/excel?aulaId=${aula.id}`, { headers: { cookie: B.sesion } });
const wbB = new ExcelJS.Workbook();
await wbB.xlsx.load(Buffer.from(await rPdfB.arrayBuffer()));
const todoB = [];
wbB.eachSheet((h) => h.eachRow((f) => todoB.push(f.values)));
check("B, aunque pida el aula de A por su id, no recibe sus datos", !JSON.stringify(todoB).includes("Alumna H4"));

await salir();
