// PMV 3 · HITO 1 — CATÁLOGO MAESTRO, BANCOS PRIVADOS POR DOCENTE Y BORRADORES IA.
//
// QUÉ SE DEMUESTRA (criterios de aceptación del hito)
//
//   A. Acceso: sin sesión 401; alumno 403.
//   B. BANCO DOCENTE VACÍO: un docente nuevo ve todos los temas con su banco
//      propio a cero, y el catálogo maestro al lado.
//   C. PRIVACIDAD: lo que guarda el docente A no lo ve el docente B —ni en el
//      listado, ni por id, ni lo puede editar o borrar— aunque sean del MISMO
//      colegio. Y B puede guardar el mismo enunciado sin que le diga "ya existe"
//      (sería una fuga del contenido de A).
//   D. CATÁLOGO INTACTO: lo que guarda un docente nunca entra en el catálogo
//      maestro (el que alimenta el diagnóstico), y los 400+ ejercicios del PMV 2
//      siguen siendo catálogo.
//   E. BORRADORES IA: se generan en el banco privado, siempre BORRADOR, con la
//      matemática verificada por el servidor; no se publican sin revisión
//      humana; uno que el servidor no puede verificar NO se publica.
//   F. COPIAR del catálogo al banco propio.
//   G. TAREAS: un docente asigna con su banco privado; otro docente no puede
//      citar ese id.
//   H. TOPE DE CONSUMO sobre el endpoint que llama a Gemini.
//
//   node qa/pmv3-hito1.mjs
//   BASE_URL=http://localhost:3000 node qa/pmv3-hito1.mjs
//
// NOTA: arranca la aplicación SIN `GEMINI_API_KEY` para no consumir cuota (modo
// demostración, igual que el resto de baterías). La prueba contra Gemini real
// está descrita en ENTREGA_PMV3_HITO1.md y se hace a mano.

import { PrismaClient } from "@prisma/client";

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

// ── Preparación: un colegio con TRES docentes del mismo centro ──────────────
console.log("\n · Preparación");
const sesionAdmin = await iniciarSesion(
  BASE,
  process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local",
  process.env.SEED_ADMIN_PASSWORD || "Admin-2026",
);
check("el SUPERADMIN inicia sesión", Boolean(sesionAdmin));
const admin = api(sesionAdmin);

const rInst = await admin("/api/admin/instituciones", {
  method: "POST",
  body: JSON.stringify({ nombre: `Colegio QA PMV3 ${sufijo}` }),
});
const institucion = (await json(rInst)).institucion;
check("se crea el colegio de la prueba", rInst.status === 201 && Boolean(institucion?.id), `HTTP ${rInst.status}`);

async function crearDocente(etiqueta) {
  const email = `qa.pmv3.${etiqueta}.${sufijo}@mentoriamath.local`;
  const r = await admin("/api/admin/usuarios", {
    method: "POST",
    body: JSON.stringify({ nombre: `QA PMV3 ${etiqueta}`, email, password: "Docente-2026", rol: "DOCENTE" }),
  });
  const u = (await json(r)).usuario;
  await admin(`/api/admin/usuarios/${u?.id}`, { method: "PATCH", body: JSON.stringify({ institucionId: institucion?.id }) });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, email, sesion, api: api(sesion) };
}
const A = await crearDocente("a");
const B = await crearDocente("b");
const C = await crearDocente("c");
check("tres docentes del MISMO colegio inician sesión", Boolean(A.sesion && B.sesion && C.sesion));

// ── A. Acceso ────────────────────────────────────────────────────────────────
console.log("\n · A. Acceso");
const sinSesion = api(null);
check("GET /api/docente/bancos sin sesión → 401", (await sinSesion("/api/docente/bancos")).status === 401);
check(
  "POST borradores-ia sin sesión → 401",
  (await sinSesion("/api/docente/ejercicios/borradores-ia", { method: "POST", body: "{}" })).status === 401,
);
const alumno = await registrarAlumno(BASE, {
  email: `qa.pmv3.alumno.${sufijo}@mentoriamath.local`,
  password: "Alumno-2026",
  nombre: "QA PMV3 Alumno",
  ciclo: "Secundaria",
  grado: "3",
});
check("se registra un alumno", alumno.ok, `HTTP ${alumno.estado}`);
const sesionAlumno = api(alumno.sesion);
check("GET /api/docente/bancos como alumno → 403", (await sesionAlumno("/api/docente/bancos")).status === 403);
check(
  "POST borradores-ia como alumno → 403",
  (await sesionAlumno("/api/docente/ejercicios/borradores-ia", { method: "POST", body: "{}" })).status === 403,
);

// ── B. Banco docente vacío ───────────────────────────────────────────────────
console.log("\n · B. Banco docente vacío por tema");
const rBancos = await A.api("/api/docente/bancos");
const bancos = await json(rBancos);
check("GET /api/docente/bancos → 200", rBancos.status === 200, `HTTP ${rBancos.status}`);
check("hay temas en el currículo", (bancos.bancos?.length ?? 0) > 0, `${bancos.bancos?.length}`);
check(
  "el banco propio de un docente nuevo está VACÍO en todos los temas",
  bancos.totales?.propios === 0 && bancos.bancos.every((b) => b.propio.total === 0),
  JSON.stringify(bancos.totales),
);
check("…y el catálogo maestro tiene contenido publicado", (bancos.totales?.catalogoPublicados ?? 0) > 100, `${bancos.totales?.catalogoPublicados}`);
const temaAritmetica = bancos.bancos?.find((b) => b.tema.clave === "aritmetica")?.tema;
check("el tema Aritmética está en la lista", Boolean(temaAritmetica?.id));

const rMaestro = await A.api("/api/docente/ejercicios?banco=maestro");
const maestro = await json(rMaestro);
check(
  "?banco=maestro devuelve sólo catálogo",
  rMaestro.status === 200 && maestro.ejercicios.length > 0 && maestro.ejercicios.every((e) => e.ambito === "MAESTRO"),
);
const rPropioVacio = await A.api("/api/docente/ejercicios?banco=propio");
check("?banco=propio está vacío al principio", (await json(rPropioVacio)).ejercicios?.length === 0);
check("?banco=inventado → 400", (await A.api("/api/docente/ejercicios?banco=inventado")).status === 400);
const totalMaestroDB = await prisma.ejercicio.count({ where: { ambito: "MAESTRO" } });
check("todo lo que había antes sigue siendo catálogo maestro", totalMaestroDB >= 390, `${totalMaestroDB}`);

// ── C. Privacidad entre docentes del mismo colegio ───────────────────────────
console.log("\n · C. El banco de A no lo ve B");
const enunciadoA = `${700 + (Date.now() % 200)} + 55`;
const rCrearA = await A.api("/api/docente/ejercicios", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaAritmetica.id, nivel: "BASICO", enunciado: enunciadoA, estado: "PUBLICADO" }),
});
const cuerpoCrearA = await json(rCrearA);
const ejA = cuerpoCrearA.ejercicio;
check(
  "A guarda un ejercicio en un tema del CATÁLOGO BASE (antes era un 404)",
  rCrearA.status === 201 && Boolean(ejA?.id),
  `HTTP ${rCrearA.status} · ${JSON.stringify(cuerpoCrearA).slice(0, 200)}`,
);
check("…queda en el banco DOCENTE y no en el catálogo", ejA?.ambito === "DOCENTE" && ejA?.origen === "DOCENTE");
check("…verificado por el motor", ejA?.validado === true && Boolean(ejA?.respuestaCorrecta), JSON.stringify({ v: ejA?.validado, r: ejA?.respuestaCorrecta }));

// El cliente NO puede elegir el ámbito.
const rAmbitoForzado = await A.api("/api/docente/ejercicios", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaAritmetica.id, nivel: "BASICO", enunciado: `${enunciadoA} + 1`, ambito: "MAESTRO", estado: "BORRADOR" }),
});
const forzado = (await json(rAmbitoForzado)).ejercicio;
check("enviar ambito: MAESTRO en el cuerpo NO escribe en el catálogo", forzado?.ambito === "DOCENTE", `${forzado?.ambito}`);

const propioA = await json(await A.api("/api/docente/ejercicios?banco=propio"));
check("A lo ve en su banco propio", propioA.ejercicios?.some((e) => e.id === ejA.id));
const bancosA = await json(await A.api("/api/docente/bancos"));
const filaAritA = bancosA.bancos.find((b) => b.tema.clave === "aritmetica");
check("…y el resumen por tema lo cuenta (publicado)", filaAritA?.propio.total >= 2 && filaAritA?.propio.publicados >= 1, JSON.stringify(filaAritA?.propio));

const listadoB = await json(await B.api("/api/docente/ejercicios"));
check("B NO lo ve en el listado general", !listadoB.ejercicios?.some((e) => e.id === ejA.id));
check("B NO lo ve filtrando por tema", !(await json(await B.api(`/api/docente/ejercicios?nodoId=${temaAritmetica.id}`))).ejercicios?.some((e) => e.id === ejA.id));
check("B NO lo ve pidiéndolo por id", (await json(await B.api(`/api/docente/ejercicios?ids=${ejA.id}`))).ejercicios?.length === 0);
check("B NO lo ve en el resumen de bancos", (await json(await B.api("/api/docente/bancos"))).totales?.propios === 0);
check("B no puede EDITARLO (404, no 403)", (await B.api(`/api/docente/ejercicios/${ejA.id}`, { method: "PATCH", body: JSON.stringify({ estado: "ARCHIVADO" }) })).status === 404);
check("B no puede BORRARLO (404)", (await B.api(`/api/docente/ejercicios/${ejA.id}`, { method: "DELETE" })).status === 404);
check("B no puede COPIARLO (404)", (await B.api(`/api/docente/ejercicios/${ejA.id}/copiar`, { method: "POST" })).status === 404);
const unoA = await json(await A.api(`/api/docente/ejercicios?ids=${ejA.id}`));
check("tras los ataques de B, el ejercicio de A sigue intacto", unoA.ejercicios?.[0]?.estado === "PUBLICADO");

const rMismoEnunciadoB = await B.api("/api/docente/ejercicios", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaAritmetica.id, nivel: "BASICO", enunciado: enunciadoA, estado: "BORRADOR" }),
});
check("B puede guardar el MISMO enunciado sin que se le diga que ya existe (no hay fuga)", rMismoEnunciadoB.status === 201, `HTTP ${rMismoEnunciadoB.status}`);
const rRepetidoA = await A.api("/api/docente/ejercicios", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaAritmetica.id, nivel: "BASICO", enunciado: enunciadoA }),
});
check("A repitiendo su propio enunciado → 409", rRepetidoA.status === 409, `HTTP ${rRepetidoA.status}`);

const vistoPorAdmin = await json(await admin(`/api/docente/ejercicios?ids=${ejA.id}`));
check("el SUPERADMIN sí puede verlo (auditoría)", vistoPorAdmin.ejercicios?.length === 1);

// ── D. El catálogo no se contamina ───────────────────────────────────────────
console.log("\n · D. Lo privado no entra en el catálogo maestro");
const privadosEnCatalogo = await prisma.ejercicio.count({ where: { ambito: "MAESTRO", autorId: { in: [A.id, B.id, C.id] } } });
check("ningún ejercicio de los docentes de la prueba está en el catálogo", privadosEnCatalogo === 0, `${privadosEnCatalogo}`);
const sesionAlumnoDiag = alumno.sesion ? await json(await api(alumno.sesion)("/api/diagnostico")) : {};
const idsDiagnostico = JSON.stringify(sesionAlumnoDiag);
check("el diagnóstico del alumno no incluye ejercicios privados", !idsDiagnostico.includes(ejA.id));

// ── E. Borradores IA ─────────────────────────────────────────────────────────
console.log("\n · E. Borradores generados por IA");
check("cantidad 0 → 400", (await A.api("/api/docente/ejercicios/borradores-ia", { method: "POST", body: JSON.stringify({ nodoId: temaAritmetica.id, nivel: "BASICO", cantidad: 0 }) })).status === 400);
check("cantidad 6 → 400", (await A.api("/api/docente/ejercicios/borradores-ia", { method: "POST", body: JSON.stringify({ nodoId: temaAritmetica.id, nivel: "BASICO", cantidad: 6 }) })).status === 400);
check("tema inexistente → 404", (await A.api("/api/docente/ejercicios/borradores-ia", { method: "POST", body: JSON.stringify({ nodoId: "no-existe", nivel: "BASICO", cantidad: 1 }) })).status === 404);

const rIA = await A.api("/api/docente/ejercicios/borradores-ia", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaAritmetica.id, nivel: "INTERMEDIO", cantidad: 3, indicaciones: "sumas con llevadas" }),
});
const ia = await json(rIA);
check("POST borradores-ia → 201", rIA.status === 201, `HTTP ${rIA.status} · ${JSON.stringify(ia).slice(0, 200)}`);
check("devuelve entre 1 y 3 borradores", ia.borradores?.length >= 1 && ia.borradores.length <= 3, `${ia.borradores?.length}`);
check(
  "TODOS: origen IA, BORRADOR, ámbito DOCENTE (banco privado)",
  ia.borradores?.every((b) => b.origen === "IA" && b.estado === "BORRADOR" && b.ambito === "DOCENTE"),
);
check("TODOS verificados por el motor del servidor", ia.borradores?.every((b) => b.validado === true));
check("guardan modelo y modo de generación", ia.borradores?.every((b) => b.metadatos?.ia?.modo && b.metadatos?.ia?.modelo));
check("ninguno es público: no hay revisión todavía", ia.borradores?.every((b) => b.revisadoEn === null));

const borradoresA = await json(await A.api("/api/docente/ejercicios?banco=borradores-ia"));
check("?banco=borradores-ia los lista", ia.borradores?.every((b) => borradoresA.ejercicios?.some((e) => e.id === b.id)));
check("B no ve los borradores de A", !(await json(await B.api("/api/docente/ejercicios?banco=borradores-ia"))).ejercicios?.some((e) => ia.borradores.some((b) => b.id === e.id)));
const bancosTrasIA = await json(await A.api("/api/docente/bancos"));
check("el resumen cuenta los borradores IA pendientes", bancosTrasIA.totales?.borradoresIA === ia.borradores.length, JSON.stringify(bancosTrasIA.totales));
check("B no puede publicar el borrador de A (404)", (await B.api(`/api/docente/ejercicios/${ia.borradores[0].id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) })).status === 404);

// Un borrador verificado se publica SÓLO cuando una persona lo pide, y queda constancia.
const verificado = ia.borradores[0];
const rPublica = await A.api(`/api/docente/ejercicios/${verificado.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });
const publicado = (await json(rPublica)).ejercicio;
check("el docente PUBLICA un borrador verificado tras revisarlo", rPublica.status === 200 && publicado?.estado === "PUBLICADO", `HTTP ${rPublica.status}`);
check("…y queda constancia de la revisión humana (quién y cuándo)", Boolean(publicado?.revisadoEn));
const enBD = await prisma.ejercicio.findUnique({ where: { id: verificado.id }, select: { revisadoPorId: true, ambito: true, origen: true } });
check("…con el revisor correcto en base de datos", enBD?.revisadoPorId === A.id && enBD?.ambito === "DOCENTE" && enBD?.origen === "IA");

// Un borrador de IA que el servidor NO ha podido verificar no se publica.
const sinVerificar = await prisma.ejercicio.create({
  data: {
    nodoId: temaAritmetica.id,
    motor: null,
    nivel: "BASICO",
    enunciado: `Ejercicio sin verificar ${sufijo}`,
    respuestaCorrecta: "42",
    origen: "IA",
    ambito: "DOCENTE",
    estado: "BORRADOR",
    validado: false,
    autorId: A.id,
  },
});
const rNoPublica = await A.api(`/api/docente/ejercicios/${sinVerificar.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });
check("un borrador IA SIN verificar NO se puede publicar (422)", rNoPublica.status === 422, `HTTP ${rNoPublica.status}`);
const sigueBorrador = await prisma.ejercicio.findUnique({ where: { id: sinVerificar.id }, select: { estado: true, revisadoEn: true } });
check("…y sigue en BORRADOR sin constancia de revisión", sigueBorrador?.estado === "BORRADOR" && sigueBorrador?.revisadoEn === null);

// Un docente puede editar el borrador antes de publicarlo.
const aEditar = ia.borradores[1];
if (aEditar) {
  const rEdita = await A.api(`/api/docente/ejercicios/${aEditar.id}`, { method: "PATCH", body: JSON.stringify({ pistas: ["Suma las unidades primero."] }) });
  check("el borrador es EDITABLE (pistas)", rEdita.status === 200 && (await json(rEdita)).ejercicio?.pistas?.[0] === "Suma las unidades primero.");
}

// ── F. Copiar del catálogo ───────────────────────────────────────────────────
console.log("\n · F. Copiar del catálogo al banco propio");
const origenCatalogo = maestro.ejercicios.find((e) => e.estado === "PUBLICADO" && e.validado && e.nodo?.clave === "aritmetica");
const rCopia = await B.api(`/api/docente/ejercicios/${origenCatalogo.id}/copiar`, { method: "POST" });
const copia = (await json(rCopia)).ejercicio;
check("B copia un ejercicio del catálogo → 201", rCopia.status === 201, `HTTP ${rCopia.status}`);
check("…la copia es de B: banco DOCENTE, borrador, verificada", copia?.ambito === "DOCENTE" && copia?.estado === "BORRADOR" && copia?.validado === true);
check("…y recuerda de dónde viene", copia?.metadatos?.copiadoDe === origenCatalogo.id);
check("copiar dos veces lo mismo → 409", (await B.api(`/api/docente/ejercicios/${origenCatalogo.id}/copiar`, { method: "POST" })).status === 409);
check("el original del catálogo no cambió", (await prisma.ejercicio.findUnique({ where: { id: origenCatalogo.id }, select: { ambito: true } }))?.ambito === "MAESTRO");
check("el SUPERADMIN no tiene banco propio al que copiar → 403", (await admin(`/api/docente/ejercicios/${origenCatalogo.id}/copiar`, { method: "POST" })).status === 403);
const copiaEditada = await B.api(`/api/docente/ejercicios/${copia.id}`, { method: "PATCH", body: JSON.stringify({ pistas: ["Pista de B"] }) });
check("B edita SU copia", copiaEditada.status === 200);
check("…y el original del catálogo NO cambió de pistas", (await prisma.ejercicio.findUnique({ where: { id: origenCatalogo.id }, select: { pistas: true } }))?.pistas?.[0] !== "Pista de B");
check("B no puede editar el original del catálogo (404)", (await B.api(`/api/docente/ejercicios/${origenCatalogo.id}`, { method: "PATCH", body: JSON.stringify({ pistas: ["x"] }) })).status === 404);

// ── G. Tareas con el banco privado ───────────────────────────────────────────
console.log("\n · G. Tareas con el banco privado");
const rAulaA = await A.api("/api/docente/aulas", { method: "POST", body: JSON.stringify({ nombre: `Aula A ${sufijo}`, grado: 3, seccion: "A" }) });
const aulaA = (await json(rAulaA)).aula;
const rAulaB = await B.api("/api/docente/aulas", { method: "POST", body: JSON.stringify({ nombre: `Aula B ${sufijo}`, grado: 3, seccion: "B" }) });
const aulaB = (await json(rAulaB)).aula;
check("A y B crean su aula", Boolean(aulaA?.id && aulaB?.id), `${rAulaA.status}/${rAulaB.status}`);
const ahora = new Date();
const manana = new Date(Date.now() + 86_400_000);
const cuerpoTarea = (aulaId, ids) =>
  JSON.stringify({
    aulaId,
    titulo: "Tarea PMV3",
    fechaInicio: ahora.toISOString().slice(0, 10),
    fechaVencimiento: manana.toISOString().slice(0, 10),
    origenEjercicios: "banco",
    ejercicioIds: ids,
    limiteReintentos: 2,
  });
const rTareaA = await A.api("/api/docente/tareas", { method: "POST", body: cuerpoTarea(aulaA?.id, [ejA.id, verificado.id]) });
check("A asigna una tarea con SU banco privado", rTareaA.status === 201, `HTTP ${rTareaA.status} · ${JSON.stringify(await json(rTareaA)).slice(0, 160)}`);
const rTareaB = await B.api("/api/docente/tareas", { method: "POST", body: cuerpoTarea(aulaB?.id, [ejA.id]) });
check("B NO puede citar el id del banco privado de A en una tarea (400)", rTareaB.status === 400, `HTTP ${rTareaB.status}`);
const rTareaBcopia = await B.api("/api/docente/tareas", { method: "POST", body: cuerpoTarea(aulaB?.id, [origenCatalogo.id]) });
check("B sí puede asignar con ejercicios del catálogo", rTareaBcopia.status === 201, `HTTP ${rTareaBcopia.status}`);

// ── G2. Borrar un tema no destruye el banco privado de otros ────────────────
console.log("\n · G2. Borrar un tema con ejercicios privados de otro docente");
const rTemaA = await A.api("/api/docente/temas", {
  method: "POST",
  body: JSON.stringify({ titulo: `Tema QA PMV3 ${sufijo}`, motor: "ARITMETICA", estado: "PUBLICADO" }),
});
const temaDeA = (await json(rTemaA)).tema;
check("A crea un tema propio del colegio", rTemaA.status === 201 && Boolean(temaDeA?.id), `HTTP ${rTemaA.status}`);
const rEnTemaA = await B.api("/api/docente/ejercicios", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaDeA?.id, nivel: "BASICO", enunciado: "12 + 30", estado: "PUBLICADO" }),
});
const ejDeBenTemaA = (await json(rEnTemaA)).ejercicio;
check("B guarda un ejercicio privado en el tema de A", rEnTemaA.status === 201 && Boolean(ejDeBenTemaA?.id), `HTTP ${rEnTemaA.status}`);
const rBorraTema = await A.api(`/api/docente/temas/${temaDeA?.id}`, { method: "DELETE" });
check("A NO puede borrar el tema: destruiría el banco de B (409)", rBorraTema.status === 409, `HTTP ${rBorraTema.status}`);
check("…y el ejercicio de B sigue ahí", (await prisma.ejercicio.count({ where: { id: ejDeBenTemaA?.id } })) === 1);
const rArchiva = await A.api(`/api/docente/temas/${temaDeA?.id}`, { method: "PATCH", body: JSON.stringify({ estado: "ARCHIVADO" }) });
check("A sí puede archivar el tema", rArchiva.status === 200, `HTTP ${rArchiva.status}`);
check("…y el ejercicio de B sigue ahí tras archivar", (await prisma.ejercicio.count({ where: { id: ejDeBenTemaA?.id } })) === 1);

// ── H. Tope de consumo ───────────────────────────────────────────────────────
console.log("\n · H. Tope de consumo de la IA");
let limitado = null;
for (let i = 0; i < 12; i++) {
  const r = await C.api("/api/docente/ejercicios/borradores-ia", {
    method: "POST",
    body: JSON.stringify({ nodoId: temaAritmetica.id, nivel: "BASICO", cantidad: 1 }),
  });
  if (r.status === 429) {
    limitado = r;
    break;
  }
}
check("tras 8 peticiones seguidas el servidor corta con 429", limitado !== null);
check("…con Retry-After", Boolean(limitado?.headers.get("retry-after")));

await salir();
