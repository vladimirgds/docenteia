// PMV 3 · Hito 5A (ampliación) — La ficha de método dentro de una TAREA EVALUABLE.
//
//   A. Asignar: sólo fichas PUBLICADAS y visibles; se congela la versión publicada.
//   B. Corregir: pista de error concreta (factor omitido, respuesta errónea típica)
//      sin revelar la respuesta; el acierto sigue contando igual.
//   C. Congelado: editar y republicar la ficha no cambia la tarea ya asignada.
//   D. Sin ficha, la tarea se corrige como siempre.
//
//   node --experimental-strip-types --no-warnings qa/pmv3-hito5a-ficha-en-tarea.mjs
//   (app SIN GEMINI_API_KEY)
import { PrismaClient } from "@prisma/client";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";
import { FICHA_REGLA_CADENA } from "../lib/docente/fichas-demo.ts";
import { candidatosDelEnunciado, fichaCongelada, revisarConFichaDeTarea } from "../lib/docente/fichas-tarea.ts";

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

// ── Unidad: lectura del enunciado y revisión con la ficha ───────────────────
console.log("\n · Unidad");
const cadena = fichaCongelada(FICHA_REGLA_CADENA);
check("la ficha de referencia pasa la validación de copia congelada", Boolean(cadena));
check("una copia congelada corrupta se ignora (la tarea se corrige sin ficha)", fichaCongelada({ titulo: "x" }) === null && fichaCongelada(null) === null);
check(
  "el enunciado se lee con o sin consigna",
  ["(3x^2+1)^4", "Deriva (3x^2+1)^4", "Deriva: (3x^2+1)^4", "f(x) = (3x^2+1)^4"].every((e) => revisarConFichaDeTarea(cadena, e, "24x(3x^2+1)^3").correcta === true),
);
check("…sin inventar candidatos vacíos", candidatosDelEnunciado("   ").length === 0);
const u1 = revisarConFichaDeTarea(cadena, "(3x^2+1)^4", "4(3x^2+1)^3");
check("omitir 6x → pista de error concreta", u1.aplica && u1.correcta === false && /derivada de la función interior/.test(u1.pista ?? ""));
check("un problema que no encaja con el método → la ficha no se aplica", revisarConFichaDeTarea(cadena, "x^2 + 3x", "2x+3").aplica === false);

// ── API ─────────────────────────────────────────────────────────────────────
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
const institucion = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio H5AT ${sufijo}` }))).institucion;
async function crearDocente(etiqueta) {
  const email = `qa.h5at.${etiqueta}.${sufijo}@mentoriamath.local`;
  const u = (await json(await post(admin, "/api/admin/usuarios", { nombre: `QA H5AT ${etiqueta}`, email, password: "Docente-2026", rol: "DOCENTE" }))).usuario;
  await patch(admin, `/api/admin/usuarios/${u?.id}`, { institucionId: institucion?.id });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, sesion, api: api(sesion) };
}
const A = await crearDocente("a");
const B = await crearDocente("b");
check("dos docentes inician sesión", Boolean(A.sesion && B.sesion));
const bancos = (await json(await A.api("/api/docente/bancos"))).bancos ?? [];
const tDer = bancos.find((b) => b.tema.clave === "derivadas")?.tema;
check("existe el tema Derivadas", Boolean(tDer?.id));

// Ficha publicada de A, un borrador de A y una ficha privada (publicada) de B.
const fA = (await json(await post(A.api, "/api/docente/fichas-metodo", { nodoId: tDer.id, ficha: FICHA_REGLA_CADENA }))).ficha;
const rPub = await patch(A.api, `/api/docente/fichas-metodo/${fA?.id}`, { estado: "PUBLICADO", aprobar: true });
check("A publica la ficha de la regla de la cadena", rPub.status === 200 && (await json(rPub)).ficha?.publicadaVersion === 1);
const borrador = (await json(await post(A.api, "/api/docente/fichas-metodo", { nodoId: tDer.id, ficha: { ...FICHA_REGLA_CADENA, titulo: "Borrador sin publicar" } }))).ficha;
const fB = (await json(await post(B.api, "/api/docente/fichas-metodo", { nodoId: tDer.id, ficha: { ...FICHA_REGLA_CADENA, titulo: "Privada de B" } }))).ficha;
await patch(B.api, `/api/docente/fichas-metodo/${fB?.id}`, { estado: "PUBLICADO", aprobar: true });

const crearEj = async (enunciado) =>
  (await json(await post(A.api, "/api/docente/ejercicios", { nodoId: tDer.id, nivel: "INTERMEDIO", enunciado, estado: "PUBLICADO", pistas: ["¿Hay una función dentro de otra?"] }))).ejercicio;
const ej1 = await crearEj("(3x^2+1)^4");
const ej2 = await crearEj("(5x^3-2)^2");
check("A crea dos ejercicios de derivadas publicados y validados", Boolean(ej1?.validado && ej2?.validado), JSON.stringify(ej1).slice(0, 160));

const aula = (await json(await post(A.api, "/api/docente/aulas", { nombre: `Aula H5AT ${sufijo}`, grado: 3, seccion: "A" }))).aula;
const alumno = await registrarAlumno(BASE, { email: `qa.h5at.al.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "QA H5AT Alumno", ciclo: "Secundaria", grado: "3" });
const Al = api(alumno.sesion);
await post(Al, "/api/estudiante/unirse", { codigoAcceso: aula.codigoAcceso });
const hoy = new Date().toISOString().slice(0, 10);
const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
let n = 0;
const tarea = (extra) =>
  post(A.api, "/api/docente/tareas", {
    aulaId: aula.id,
    titulo: `Cadena ${sufijo} ${++n}`,
    fechaInicio: hoy,
    fechaVencimiento: manana,
    origenEjercicios: "banco",
    ejercicioIds: [ej1.id, ej2.id],
    limiteReintentos: 3,
    nodoId: tDer.id,
    ...extra,
  });

console.log("\n · A. Asignar con ficha");
check("una ficha en BORRADOR no se puede aplicar (409)", (await tarea({ fichaId: borrador?.id })).status === 409);
check("la ficha privada de otro docente no existe para A (404)", (await tarea({ fichaId: fB?.id })).status === 404);
check("un id inventado → 404", (await tarea({ fichaId: "no-existe" })).status === 404);
const rT = await tarea({ fichaId: fA.id });
const t = (await json(rT)).tarea;
check("con la ficha publicada → 201", rT.status === 201 && Boolean(t?.id));
const enBd = await prisma.tarea.findUnique({ where: { id: t?.id } });
check(
  "se congela la versión PUBLICADA, con su título",
  enBd?.fichaId === fA.id && enBd?.fichaVersion === 1 && enBd?.fichaTitulo === FICHA_REGLA_CADENA.titulo && enBd?.fichaContenido?.patron === FICHA_REGLA_CADENA.patron,
);

console.log("\n · B. Corregir con la ficha");
const corregir = (tareaId, ejId, respuesta) => post(Al, `/api/estudiante/tareas/${tareaId}/ejercicios/${ejId}/corregir`, { respuesta });
const r1 = await json(await corregir(t.id, ej1.id, "4(3x^2+1)^3"));
check(
  "omitir 6x → incorrecto, con la pista de error de la ficha",
  r1.correcto === false && r1.metodo?.titulo === FICHA_REGLA_CADENA.titulo && /derivada de la función interior/.test(r1.metodo?.pista ?? ""),
  JSON.stringify(r1).slice(0, 200),
);
check("…la pista no revela la respuesta (ni 6x ni 24x)", !/6x|24x/.test(r1.metodo?.pista ?? ""));
check("…y la respuesta correcta no viaja al navegador", !JSON.stringify(r1).includes("24x(3x^2+1)^3"));
const r2 = await json(await corregir(t.id, ej2.id, "30x^2(5x^3-2)^2"));
check("exponente sin bajar en (5x^3-2)^2 → pista de la respuesta errónea típica", r2.correcto === false && /exponente/.test(r2.metodo?.pista ?? ""), JSON.stringify(r2).slice(0, 200));
const r3 = await json(await corregir(t.id, ej2.id, "x"));
check("un error que la ficha no reconoce → sin pista de ficha (el tutor sigue con las suyas)", r3.correcto === false && r3.metodo?.pista === null);
const r4 = await json(await corregir(t.id, ej1.id, "24x(3x^2+1)^3"));
check("acierto → correcto, sin pista", r4.correcto === true && r4.metodo?.pista === null);
const r5 = await json(await corregir(t.id, ej2.id, "30x^2(5x^3-2)"));
check("acierto en el segundo ejercicio", r5.correcto === true);
const rEnt = await post(Al, `/api/estudiante/tareas/${t.id}/entregar`, {});
const ent = await json(rEnt);
const intentoFinal = await prisma.intentoTarea.findFirst({ where: { tareaId: t.id, estudianteId: alumno.id ?? undefined }, orderBy: { numero: "desc" } });
check("al entregar, la nota la calcula el servidor como siempre: 100", rEnt.status === 200 && (intentoFinal?.puntaje === 100 || ent.entrega?.puntaje === 100 || ent.puntaje === 100), JSON.stringify(ent).slice(0, 200));

console.log("\n · C. La ficha queda congelada en la tarea");
const cambiada = { ...FICHA_REGLA_CADENA, pistasDeError: [{ omiteFactor: "{~a*m}x^{m-1}", texto: "TEXTO NUEVO tras asignar." }] };
await patch(A.api, `/api/docente/fichas-metodo/${fA.id}`, { ficha: cambiada, nota: "cambio la pista" });
await patch(A.api, `/api/docente/fichas-metodo/${fA.id}`, { estado: "PUBLICADO", aprobar: true });
check("A edita y republica la ficha (versión 2)", (await prisma.fichaMetodo.findUnique({ where: { id: fA.id } }))?.publicadaVersion === 2);
const tViejaAbierta = (await json(await tarea({ fichaId: fA.id }))).tarea; // ya con v2
// Una tarea asignada ANTES del cambio, aún abierta: se crea con v1 congelada a mano en BD
// copiando la de `t` (la de `t` ya se entregó).
await prisma.tarea.update({ where: { id: tViejaAbierta.id }, data: { fichaVersion: 1, fichaContenido: enBd.fichaContenido } });
const viejo = await json(await corregir(tViejaAbierta.id, ej1.id, "4(3x^2+1)^3"));
check("una tarea con la versión 1 congelada sigue dando la pista de la versión 1", /derivada de la función interior/.test(viejo.metodo?.pista ?? "") && !/TEXTO NUEVO/.test(viejo.metodo?.pista ?? ""));
const t2 = (await json(await tarea({ fichaId: fA.id }))).tarea;
const nuevo = await json(await corregir(t2.id, ej1.id, "4(3x^2+1)^3"));
check("una tarea nueva toma la versión 2", /TEXTO NUEVO/.test(nuevo.metodo?.pista ?? "") && (await prisma.tarea.findUnique({ where: { id: t2.id } }))?.fichaVersion === 2);

console.log("\n · D. Sin ficha, como siempre");
const t3 = (await json(await tarea({}))).tarea;
const s1 = await json(await corregir(t3.id, ej1.id, "4(3x^2+1)^3"));
check("sin ficha: incorrecto y metodo = null", s1.correcto === false && s1.metodo === null);
check("…y la tarea no guarda ficha", (await prisma.tarea.findUnique({ where: { id: t3.id } }))?.fichaId === null);
const otroAlumno = await registrarAlumno(BASE, { email: `qa.h5at.al2.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "QA H5AT Otro", ciclo: "Secundaria", grado: "3" });
check("un alumno de fuera del aula no puede corregir en la tarea (403)", (await post(api(otroAlumno.sesion), `/api/estudiante/tareas/${t3.id}/ejercicios/${ej1.id}/corregir`, { respuesta: "x" })).status === 403);

await salir();
