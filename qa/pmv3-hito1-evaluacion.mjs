// PMV 3 · HITO 1 (cierre) — EVALUACIÓN SEGURA.
//
// Criterios del Word PMV3, H1:
//   «Fijar los ejercicios y sus rúbricas al asignar una tarea. Calcular la nota en
//    servidor y controlar reenvíos y reintentos dentro de una transacción.»
//   «Kim crea su primer ejercicio y lo asigna. Otro docente del mismo colegio
//    puede ver el maestro y su propio banco, mientras el material de Kim queda
//    restringido. Editar el ejercicio conserva la versión y la nota de una tarea
//    anterior. El diagnóstico general sigue funcionando.»
//
// Regla de calificación confirmada por el cliente para el piloto: ejercicios de
// IGUAL PESO, SIN crédito parcial, nota del ÚLTIMO INTENTO, calculada en servidor.
//
//   node --experimental-strip-types --no-warnings qa/pmv3-hito1-evaluacion.mjs

import { PrismaClient } from "@prisma/client";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";
import { calcularNota, cambioDeContenido, puntosDe } from "../lib/docente/calificacion.ts";

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

// ── 0. La función de la nota, sola ───────────────────────────────────────────
console.log("\n · 0. La nota (función pura)");
const rub = { puntos: 1, creditoParcial: false, criterio: "EQUIVALENCIA" };
const E = (id) => ({ id, rubrica: rub });
check("3 de 4 acertados → 75", calcularNota([E("a"), E("b"), E("c"), E("d")], [
  { tareaEjercicioId: "a", correcto: true }, { tareaEjercicioId: "b", correcto: true },
  { tareaEjercicioId: "c", correcto: true }, { tareaEjercicioId: "d", correcto: false },
]).puntaje === 75);
check("sin respuestas → 0, y todos cuentan como sin resolver", (() => { const n = calcularNota([E("a"), E("b")], []); return n.puntaje === 0 && n.sinResolver === 2; })());
check("sin crédito parcial: un fallo no resta ni un acierto a medias suma", calcularNota([E("a"), E("b"), E("c")], [
  { tareaEjercicioId: "a", correcto: true }, { tareaEjercicioId: "b", correcto: false }, { tareaEjercicioId: "c", correcto: null },
]).puntaje === 33);
check("una rúbrica con puntos raros no rompe la nota (vale 1)", puntosDe({ puntos: -5 }) === 1 && puntosDe(null) === 1 && puntosDe({ puntos: "x" }) === 1);
check("una tarea sin ejercicios → 0, no NaN", calcularNota([], []).puntaje === 0);
check("una respuesta a un ejercicio ajeno a la tarea no suma", calcularNota([E("a")], [{ tareaEjercicioId: "zzz", correcto: true }]).puntaje === 0);
check("cambioDeContenido: enunciado, respuesta o pistas", cambioDeContenido({ enunciado: "a", respuestaCorrecta: "1", pistas: [] }, { enunciado: "b", respuestaCorrecta: "1", pistas: [] })
  && cambioDeContenido({ enunciado: "a", respuestaCorrecta: "1", pistas: ["x"] }, { enunciado: "a", respuestaCorrecta: "1", pistas: ["y"] })
  && !cambioDeContenido({ enunciado: "a", respuestaCorrecta: "1", pistas: ["x"] }, { enunciado: "a", respuestaCorrecta: "1", pistas: ["x"] }));

await exigirServidor();
const sufijo = Date.now().toString(36);
const maestrosAntes = await prisma.ejercicio.count({ where: { ambito: "MAESTRO" } });
const api = (sesion) => (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(sesion ? { cookie: sesion } : {}), ...(opciones.headers || {}) },
  });
const json = async (r) => r.json().catch(() => ({}));
const post = (cliente, ruta, cuerpo) => cliente(ruta, { method: "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });

// ── 1. Un colegio, a Kim y a otra docente ────────────────────────────────────
console.log("\n · 1. Kim crea su primer ejercicio y lo asigna");
const sesionAdmin = await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026");
const admin = api(sesionAdmin);
const institucion = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio H1 ${sufijo}` }))).institucion;
async function crearDocente(nombre, etiqueta) {
  const email = `qa.h1.${etiqueta}.${sufijo}@mentoriamath.local`;
  const u = (await json(await post(admin, "/api/admin/usuarios", { nombre, email, password: "Docente-2026", rol: "DOCENTE" }))).usuario;
  await admin(`/api/admin/usuarios/${u?.id}`, { method: "PATCH", body: JSON.stringify({ institucionId: institucion?.id }) });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, sesion, api: api(sesion) };
}
const Kim = await crearDocente("Kim", "kim");
const Otra = await crearDocente("Otra docente", "otra");
check("Kim y otra docente del mismo colegio inician sesión", Boolean(Kim.sesion && Otra.sesion));

const bancosKim = (await json(await Kim.api("/api/docente/bancos"))).bancos ?? [];
const aritmetica = bancosKim.find((b) => b.tema.clave === "aritmetica")?.tema;
check("el banco privado de Kim empieza VACÍO (ningún ejercicio suyo)", Boolean(aritmetica?.id) && (await prisma.ejercicio.count({ where: { autorId: Kim.id } })) === 0);

const crear = async (docente, enunciado, pistas = []) =>
  (await json(await post(docente.api, "/api/docente/ejercicios", { nodoId: aritmetica.id, nivel: "BASICO", enunciado, estado: "PUBLICADO", pistas }))).ejercicio;
const ej1 = await crear(Kim, "10 + 5", ["Suma las unidades primero."]);
const ej2 = await crear(Kim, "20 + 7");
check("Kim crea dos ejercicios en su banco privado, verificados", [ej1, ej2].every((e) => e?.id && e.validado && e.ambito === "DOCENTE"));
check("nacen en la VERSIÓN 1", [ej1, ej2].every((e) => e?.version === 1), JSON.stringify([ej1?.version]));
check("…con la respuesta que calcula el motor (15 y 27)", ej1?.respuestaCorrecta === "15" && ej2?.respuestaCorrecta === "27", `${ej1?.respuestaCorrecta},${ej2?.respuestaCorrecta}`);

const visibles = async (docente) => (await json(await docente.api(`/api/docente/ejercicios?nodoId=${aritmetica.id}`))).ejercicios ?? [];
check("la OTRA docente no ve los ejercicios de Kim", !(await visibles(Otra)).some((e) => [ej1.id, ej2.id].includes(e.id)));
check("…pero sí ve el catálogo maestro", (await visibles(Otra)).some((e) => e.ambito === "MAESTRO"));
check("…y no puede abrirlos ni editarlos por id (404)", (await Otra.api(`/api/docente/ejercicios/${ej1.id}`, { method: "PATCH", body: JSON.stringify({ pistas: ["x"] }) })).status === 404);
const rOtraAsigna = await (async () => {
  const aulaO = (await json(await post(Otra.api, "/api/docente/aulas", { nombre: `Aula O ${sufijo}`, grado: 3, seccion: "B" }))).aula;
  return post(Otra.api, "/api/docente/tareas", { aulaId: aulaO.id, titulo: "Robo", fechaInicio: new Date().toISOString().slice(0, 10), fechaVencimiento: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), origenEjercicios: "banco", ejercicioIds: [ej1.id] });
})();
check("…ni asignarlos citando su id (400)", rOtraAsigna.status === 400);

const aula = (await json(await post(Kim.api, "/api/docente/aulas", { nombre: `Aula Kim ${sufijo}`, grado: 3, seccion: "A" }))).aula;
const hoy = new Date().toISOString().slice(0, 10);
const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const asignar = async (ejercicioIds, limiteReintentos = 3, titulo = "Tarea") =>
  (await json(await post(Kim.api, "/api/docente/tareas", { aulaId: aula.id, titulo: `${titulo} ${sufijo}`, fechaInicio: hoy, fechaVencimiento: manana, origenEjercicios: "banco", ejercicioIds, limiteReintentos }))).tarea;
const tarea = await asignar([ej1.id, ej2.id], 3, "Tarea de Kim");
check("Kim asigna la tarea a su aula", Boolean(tarea?.id));

// ── 2. Congelado al asignar ──────────────────────────────────────────────────
console.log("\n · 2. Los ejercicios y rúbricas quedan CONGELADOS al asignar");
const congelados = await prisma.tareaEjercicio.findMany({ where: { tareaId: tarea.id }, orderBy: { orden: "asc" } });
check("la tarea tiene su copia congelada, en orden", congelados.length === 2 && congelados[0].ejercicioId === ej1.id && congelados[1].ejercicioId === ej2.id);
check("…con enunciado, respuesta, versión y pistas tal como estaban", congelados[0].enunciado === "10 + 5" && congelados[0].respuestaCorrecta === "15" && congelados[0].version === 1 && congelados[0].pistas[0] === "Suma las unidades primero.");
check("…y la RÚBRICA: 1 punto, sin crédito parcial", congelados.every((c) => c.rubrica?.puntos === 1 && c.rubrica?.creditoParcial === false));
const tareaBD = await prisma.tarea.findUnique({ where: { id: tarea.id } });
check("la regla de calificación queda escrita en la tarea (iguales, sin parcial, último intento)", tareaBD.reglaCalificacion?.pesos === "IGUALES" && tareaBD.reglaCalificacion?.creditoParcial === false && tareaBD.reglaCalificacion?.nota === "ULTIMO_INTENTO");

// ── 3. El alumno ─────────────────────────────────────────────────────────────
console.log("\n · 3. La nota la calcula el servidor");
async function alumno(etiqueta) {
  const al = await registrarAlumno(BASE, { email: `qa.h1.${etiqueta}.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: `Alumno H1 ${etiqueta}`, ciclo: "Secundaria", grado: "3" });
  await post(api(al.sesion), "/api/estudiante/unirse", { codigoAcceso: aula.codigoAcceso });
  return { ...al, api: api(al.sesion) };
}
const S = await alumno("uno");
const ruta = (t, e, p) => `/api/estudiante/tareas/${t}/ejercicios/${e}/${p}`;
const resp = (cli, t, e, r) => post(cli, ruta(t, e, "corregir"), { respuesta: r });
const entregar = (cli, t, cuerpo = { completada: true }) => post(cli, `/api/estudiante/tareas/${t}/entregar`, cuerpo);

const sinNada = await entregar(S.api, tarea.id, { puntaje: 100, completada: true });
check("entregar SIN haber respondido nada se rechaza (409), aunque el navegador diga 100", sinNada.status === 409);
check("…y no gasta un intento", (await prisma.entregaTarea.count({ where: { tareaId: tarea.id } })) === 0);

await resp(S.api, tarea.id, ej1.id, "99"); // mal
await resp(S.api, tarea.id, ej2.id, "27"); // bien
const mentira = await json(await entregar(S.api, tarea.id, { puntaje: 100, completada: true, detalle: [{ ejercicioId: ej1.id, enunciado: "x", respuestaDada: "15", respuestaCorrecta: "15", correcto: true }] }));
check("el navegador dice 100 y el detalle dice «correcto»; el servidor pone 50 (1 de 2)", mentira.entrega?.puntaje === 50, JSON.stringify(mentira.entrega?.puntaje));
check("…y marca la nota como calculada por el SERVIDOR", mentira.entrega?.modoNota === "SERVIDOR");
check("el detalle lo escribe el servidor: el ejercicio 1 figura como INCORRECTO con su respuesta real", mentira.entrega?.detalle?.[0]?.correcto === false && mentira.entrega.detalle[0].respuestaDada === "99" && mentira.entrega.detalle[0].respuestaCorrecta === "15");
check("…y registra la versión de cada ejercicio", mentira.entrega?.detalle?.every((d) => d.version === 1));
check("igual peso y sin parcial: 1 acierto de 2 es 50, no otra cosa", mentira.nota?.aciertos === 1 && mentira.nota?.total === 2);
check("el intento 1 queda ENTREGADO con su nota", (await prisma.intentoTarea.findFirst({ where: { tareaId: tarea.id, numero: 1 } }))?.estado === "ENTREGADO");

const otraVez = await entregar(S.api, tarea.id, { puntaje: 100, completada: true });
check("reenviar la misma entrega (doble clic) → 409 y NO cuenta otro intento", otraVez.status === 409 && (await prisma.entregaTarea.findFirst({ where: { tareaId: tarea.id } }))?.intentosUsados === 1);

// ── 4. Editar el ejercicio no toca la tarea anterior ─────────────────────────
console.log("\n · 4. Editar el ejercicio conserva la versión y la nota de la tarea anterior");
const rEd = await Kim.api(`/api/docente/ejercicios/${ej1.id}`, { method: "PATCH", body: JSON.stringify({ enunciado: "10 + 6", pistas: ["Cuenta hacia delante."] }) });
const editado = (await json(rEd)).ejercicio;
check("Kim edita el ejercicio 1 (enunciado y pistas)", rEd.status === 200 && editado?.enunciado === "10 + 6");
check("…y su VERSIÓN pasa a 2, con la nueva respuesta (16)", editado?.version === 2 && editado.respuestaCorrecta === "16", `v${editado?.version} → ${editado?.respuestaCorrecta}`);
const hist = await prisma.ejercicioVersion.findMany({ where: { ejercicioId: ej1.id } });
check("la versión 1 queda en el historial, intacta", hist.length === 1 && hist[0].version === 1 && hist[0].enunciado === "10 + 5" && hist[0].respuestaCorrecta === "15");
const rEd2 = await Kim.api(`/api/docente/ejercicios/${ej1.id}`, { method: "PATCH", body: JSON.stringify({ nivel: "INTERMEDIO" }) });
check("un cambio que no toca el contenido (el nivel) NO sube la versión", (await json(rEd2)).ejercicio?.version === 2);
const congDespues = await prisma.tareaEjercicio.findMany({ where: { tareaId: tarea.id }, orderBy: { orden: "asc" } });
check("la tarea anterior sigue con el enunciado, la respuesta y la versión de cuando se asignó", congDespues[0].enunciado === "10 + 5" && congDespues[0].respuestaCorrecta === "15" && congDespues[0].version === 1 && congDespues[0].pistas[0] === "Suma las unidades primero.");
check("la NOTA de la tarea anterior sigue siendo 50", (await prisma.entregaTarea.findFirst({ where: { tareaId: tarea.id } }))?.puntaje === 50);
const resultado = await json(await S.api(`/api/estudiante/tareas/${tarea.id}/resultado`));
check("el desglose del alumno enseña la respuesta congelada (15), no la nueva", resultado.ejercicios?.find((e) => e.id === ej1.id)?.respuestaCorrecta === "15");
const pagina = await (await fetch(`${BASE}/estudiante/leccion?tareaId=${tarea.id}`, { headers: { cookie: S.sesion }, redirect: "manual" })).text();
void pagina;

// Una tarea NUEVA con el ejercicio editado usa la versión 2.
const tarea2 = await asignar([ej1.id], 3, "Tarea nueva");
const cong2 = await prisma.tareaEjercicio.findFirst({ where: { tareaId: tarea2.id } });
check("una tarea NUEVA congela la versión 2 (10 + 6 = 16)", cong2?.version === 2 && cong2.enunciado === "10 + 6" && cong2.respuestaCorrecta === "16");
const S2 = await alumno("dos");
const buena = await json(await resp(S2.api, tarea2.id, ej1.id, "16"));
check("…y se corrige contra 16, no contra 15", buena.correcto === true && (await json(await resp(S2.api, tarea2.id, ej1.id, "15"))).correcto === false);
await resp(S2.api, tarea2.id, ej1.id, "16");
// Si el docente borra el ejercicio del banco, la tarea sigue.
{
  const v15 = await json(await resp(S.api, tarea.id, ej1.id, "15"));
  const v16 = await json(await resp(S.api, tarea.id, ej1.id, "16"));
  check("la tarea de Kim se sigue corrigiendo con su copia congelada: 15 acierta y 16 (la nueva) no", v15.correcto === true && v16.correcto === false);
  await post(S.api, ruta(tarea.id, ej1.id, "corregir"), { respuesta: "15" }); // deja el intento en curso como estaba
}

// ── 5. Último intento, no el mejor ───────────────────────────────────────────
console.log("\n · 5. Reintentos: cuenta el ÚLTIMO intento");
const t3 = await asignar([ej2.id], 3, "Reintentos");
const S3 = await alumno("tres");
await resp(S3.api, t3.id, ej2.id, "27");
const n1 = await json(await entregar(S3.api, t3.id));
await resp(S3.api, t3.id, ej2.id, "0");
const n2 = await json(await entregar(S3.api, t3.id));
check("intento 1 acertado → 100; intento 2 fallado → la nota baja a 0 (cuenta el último, no el mejor)", n1.entrega?.puntaje === 100 && n2.entrega?.puntaje === 0, `${n1.entrega?.puntaje} → ${n2.entrega?.puntaje}`);
check("…con 2 intentos usados", n2.entrega?.intentosUsados === 2);
const hi = await prisma.intentoTarea.findMany({ where: { tareaId: t3.id }, orderBy: { numero: "asc" } });
check("cada intento queda guardado con su nota (100 y 0)", hi.length === 2 && hi[0].puntaje === 100 && hi[1].puntaje === 0 && hi.every((h) => h.estado === "ENTREGADO"));
await resp(S3.api, t3.id, ej2.id, "27");
const n3 = await json(await entregar(S3.api, t3.id));
check("el 3.er intento (el último permitido) se acepta → 100", n3.entrega?.puntaje === 100 && n3.entrega.intentosUsados === 3);
const rCuarto = await resp(S3.api, t3.id, ej2.id, "27");
check("el 4.º no se puede ni empezar: sin intentos → 409", rCuarto.status === 409);
check("…ni entregar (409)", (await entregar(S3.api, t3.id)).status === 409);

// ── 6. Concurrencia ──────────────────────────────────────────────────────────
console.log("\n · 6. Reenvíos y reintentos en paralelo (transacción)");
const t4 = await asignar([ej2.id], 1, "Una sola oportunidad");
const S4 = await alumno("cuatro");
await resp(S4.api, t4.id, ej2.id, "27");
const rondas = await Promise.all(Array.from({ length: 6 }, () => entregar(S4.api, t4.id)));
const estados = rondas.map((r) => r.status).sort();
check("6 entregas simultáneas → EXACTAMENTE una se acepta y 5 se rechazan", estados.filter((s) => s === 200).length === 1 && estados.filter((s) => s === 409).length === 5, estados.join(","));
const e4 = await prisma.entregaTarea.findFirst({ where: { tareaId: t4.id } });
check("…con un solo intento contado y la nota intacta (100)", e4?.intentosUsados === 1 && e4.puntaje === 100);
check("…y un único intento guardado", (await prisma.intentoTarea.count({ where: { tareaId: t4.id } })) === 1);

const t5 = await asignar([ej2.id], 2, "Dos oportunidades");
const S5 = await alumno("cinco");
await resp(S5.api, t5.id, ej2.id, "27");
await entregar(S5.api, t5.id); // 1.º
await resp(S5.api, t5.id, ej2.id, "27");
const carrera = await Promise.all(Array.from({ length: 5 }, () => entregar(S5.api, t5.id)));
const e5 = await prisma.entregaTarea.findFirst({ where: { tareaId: t5.id } });
check("en el último intento permitido, 5 entregas a la vez → una sola cuenta (total 2, nunca 3+)", carrera.filter((r) => r.status === 200).length === 1 && e5?.intentosUsados === 2, `${carrera.map((r) => r.status)} usados=${e5?.intentosUsados}`);
const mezcla = await Promise.all([
  ...Array.from({ length: 4 }, (_, i) => resp(S5.api, t5.id, ej2.id, i % 2 ? "27" : "1")),
]);
check("corregir con la tarea ya agotada → 409 (nadie abre un intento de más)", mezcla.every((r) => r.status === 409));
check("…y no hay intentos EN_CURSO huérfanos", (await prisma.intentoTarea.count({ where: { tareaId: t5.id, estado: "EN_CURSO" } })) === 0);

// ── 7. Lo que no debe pasar ──────────────────────────────────────────────────
console.log("\n · 7. Seguridad");
const intruso = await alumno("intruso");
const aulaOtra = (await json(await post(Otra.api, "/api/docente/aulas", { nombre: `Aula X ${sufijo}`, grado: 3, seccion: "C" }))).aula;
const fuera = await registrarAlumno(BASE, { email: `qa.h1.fuera.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "Fuera", ciclo: "Secundaria", grado: "3" });
await post(api(fuera.sesion), "/api/estudiante/unirse", { codigoAcceso: aulaOtra.codigoAcceso });
check("un alumno de otra aula no puede corregir ni entregar la tarea de Kim (403)", (await resp(api(fuera.sesion), tarea.id, ej2.id, "27")).status === 403 && (await entregar(api(fuera.sesion), tarea.id)).status === 403);
check("un docente no puede entregar (403)", (await entregar(Kim.api, tarea.id)).status === 403);
void intruso;

// ── 8. Tareas históricas y diagnóstico ───────────────────────────────────────
console.log("\n · 8. Tareas históricas y diagnóstico general");
const conBanco = await prisma.tarea.findMany({ where: { ejercicioIds: { isEmpty: false } }, select: { id: true, ejercicioIds: true } });
const sinCongelar = [];
for (const t of conBanco) {
  const n = await prisma.tareaEjercicio.count({ where: { tareaId: t.id } });
  const vivos = await prisma.ejercicio.count({ where: { id: { in: t.ejercicioIds } } });
  if (n < vivos) sinCongelar.push(t.id);
}
check("TODA tarea del banco (también las anteriores a la migración) tiene su copia congelada", sinCongelar.length === 0, sinCongelar.join(","));

// Tarea del motor conversacional (sin ejercicios en la BD): sigue funcionando y se marca.
const tConv = (await json(await post(Kim.api, "/api/docente/tareas", { aulaId: aula.id, titulo: `Conversacional ${sufijo}`, fechaInicio: hoy, fechaVencimiento: manana, origenEjercicios: "ia", cantidadEjercicios: 2, limiteReintentos: 2 }))).tarea;
const S6 = await alumno("seis");
const c1 = await json(await entregar(S6.api, tConv.id, { puntaje: 80, completada: true, detalle: [] }));
check("una tarea del motor conversacional se entrega como siempre", c1.entrega?.puntaje === 80 && c1.entrega.completada === true);
check("…marcada como nota del CLIENTE (límite documentado)", c1.entrega?.modoNota === "CLIENTE");
const carreraConv = await Promise.all(Array.from({ length: 4 }, () => entregar(S6.api, tConv.id, { puntaje: 90, completada: true, detalle: [] })));
const eConv = await prisma.entregaTarea.findFirst({ where: { tareaId: tConv.id } });
check("…y su tope de reintentos aguanta entregas en paralelo (máx. 2 intentos)", eConv?.intentosUsados === 2 && carreraConv.filter((r) => r.status === 200).length === 1, `usados=${eConv?.intentosUsados}`);

const nuevo = await registrarAlumno(BASE, { email: `qa.h1.diag.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "Alumno diagnóstico", ciclo: "Secundaria", grado: "3" });
await fetch(`${BASE}/api/estudiante/nivel-educativo`, { method: "PUT", headers: { "Content-Type": "application/json", cookie: nuevo.sesion }, body: JSON.stringify({ etapa: "SECUNDARIA", curso: 3 }) });
const diag = await json(await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: nuevo.sesion } }));
check("el diagnóstico general sigue funcionando: entrega preguntas del catálogo maestro", Array.isArray(diag.preguntas) && diag.preguntas.length > 0, JSON.stringify(Object.keys(diag)));
const maestros = await prisma.ejercicio.count({ where: { ambito: "MAESTRO" } });
check("…y el catálogo maestro sigue intacto: nada de lo que hicieron los docentes entró en él", maestros > 0 && maestros === maestrosAntes, `${maestrosAntes} → ${maestros}`);
check("todos los ejercicios existentes están en la versión 1 o superior", (await prisma.ejercicio.count({ where: { version: { lt: 1 } } })) === 0);

await salir();
