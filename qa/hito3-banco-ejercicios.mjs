// ¿SE PUEDE ARMAR UNA TAREA DESDE EL BANCO DE EJERCICIOS, POR DIFICULTAD O A
// MANO?
//
// POR QUÉ EXISTE
// El cliente insistió tres rounds seguidos en lo mismo, cada vez con más
// detalle técnico: "/docente/ejercicios cada reactivo cuenta obligatoriamente
// con su dificultad… pero en /docente/asignar-tarea este campo no existe, y
// el backend toma ejercicios mezclando dificultades sin criterio pedagógico."
// Y, aparte: "una vez creada la tarea, el profesor sólo visualiza metadatos
// numéricos… sin posibilidad de saber qué ejercicios específicos integran
// dicha tarea."
//
// Esta tarea YA NO pasa por el motor conversacional: es un conjunto FIJO de
// `Ejercicio` ya guardados —automático por tema/dificultad, o elegido a
// mano—, con su propia pantalla de alumno (sin avatar, sin voz) y su propio
// corrector (`compararRespuesta`, el mismo del diagnóstico).
//
//   node qa/hito3-banco-ejercicios.mjs
//   BASE_URL=http://localhost:3000 node qa/hito3-banco-ejercicios.mjs

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";
import { seAcertoElEjercicio } from "../lib/docente/aulas.ts";

let ok = 0;
const fallos = [];
function check(nombre, condicion, detalle = "") {
  if (condicion) {
    ok++;
    console.log(`   ✓ ${nombre}`);
  } else {
    fallos.push(nombre + (detalle ? ` — ${detalle}` : ""));
    console.log(`   ✗ ${nombre}${detalle ? `  (${detalle})` : ""}`);
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(" HITO 3 — tareas armadas desde el banco de ejercicios");
console.log("═══════════════════════════════════════════════════════════\n");

await exigirServidor();

const sesionDocente = await iniciarSesion(
  BASE,
  process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
  process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
);
if (!sesionDocente) {
  console.error("  ✗ No se pudo iniciar sesión como el docente de la semilla.");
  process.exit(1);
}
const api = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", cookie: sesionDocente, ...(opciones.headers || {}) },
  });

const sufijo = Date.now().toString(36);

// El nodo de Aritmética sembrado, con ejercicios validados en los tres
// niveles —ver prisma/seed-data—.
const rTemas = await api("/api/docente/temas");
const temas = await rTemas.json().catch(() => ({}));
const nodoAritmetica = (temas?.temas ?? []).find(
  (t) => t.motor === "ARITMETICA" || t.clave === "aritmetica",
);
check("se encuentra el nodo de Aritmética sembrado", Boolean(nodoAritmetica?.id));

// 1. El filtro por nivel en el listado del banco (antes sólo se podía filtrar
//    en el navegador, después de traer TODO el banco).
const rBasico = await api(`/api/docente/ejercicios?nodoId=${nodoAritmetica.id}&nivel=BASICO&estado=PUBLICADO&validado=true`);
const basico = await rBasico.json().catch(() => ({}));
check(
  "GET /api/docente/ejercicios filtra por nivel en el servidor",
  rBasico.status === 200 && (basico?.ejercicios ?? []).every((e) => e.nivel === "BASICO"),
  `HTTP ${rBasico.status}, ${(basico?.ejercicios ?? []).length} ejercicios`,
);
check("…y hay suficientes BASICO sembrados para las pruebas", (basico?.ejercicios ?? []).length >= 3);

const rAvanzado = await api(`/api/docente/ejercicios?nodoId=${nodoAritmetica.id}&nivel=AVANZADO&estado=PUBLICADO&validado=true`);
const avanzado = await rAvanzado.json().catch(() => ({}));

// 2. Crear el aula y matricular a un alumno.
const rAula = await api("/api/docente/aulas", {
  method: "POST",
  body: JSON.stringify({ nombre: `Banco ${sufijo}`, grado: 3, seccion: "B" }),
});
const aula = await rAula.json();
check("se crea el aula de prueba", rAula.status === 201);

// Onboardear al alumno (etapa + diagnóstico): `/estudiante/leccion` —la
// página que abre una tarea del banco también— exige `nivelActual`, y una
// cuenta recién registrada no lo tiene hasta terminar ese paso. El JWT sólo
// lo rellena al iniciar sesión, así que hace falta volver a loguearse
// después (ver qa/hito3.mjs, la misma corrección allá).
const email = `qa.banco.${sufijo}@mentoriamath.local`;
const clave = "Alumno-2026";
const alta = await registrarAlumno(BASE, { email, password: clave, nombre: "QA Banco" });
check("se registra el alumno de prueba", alta.ok);

await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", cookie: alta.sesion },
  body: JSON.stringify({ etapa: "SECUNDARIA", curso: 3 }),
});
const prueba = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })).json();
if ((prueba?.preguntas ?? []).length > 0) {
  await fetch(`${BASE}/api/diagnostico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: alta.sesion },
    body: JSON.stringify({
      respuestas: prueba.preguntas.map((p) => ({
        preguntaId: p.id,
        respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
        tiempoMs: 1000,
      })),
    }),
  });
}
alta.sesion = await iniciarSesion(BASE, email, clave);

const apiAlumno = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", cookie: alta.sesion, ...(opciones.headers || {}) },
  });
const rUnirse = await apiAlumno("/api/estudiante/unirse", {
  method: "POST",
  body: JSON.stringify({ codigoAcceso: aula?.aula?.codigoAcceso }),
});
check("el alumno se matricula en el aula", rUnirse.status === 201);

const ahoraIso = new Date().toISOString();
const mananaIso = new Date(Date.now() + 86_400_000).toISOString();

// 3. Modo automático: "Asigna la cantidad solicitada según tema y
//    dificultad (aleatorio)".
const rAuto = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula.aula.id,
    titulo: `Banco automático ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    cantidadEjercicios: 3,
    limiteReintentos: 1,
    nodoId: nodoAritmetica.id,
    origenEjercicios: "banco",
    dificultad: "BASICO",
  }),
});
const tareaAuto = await rAuto.json();
check("el modo automático arma la tarea desde el banco", rAuto.status === 201, `HTTP ${rAuto.status} ${JSON.stringify(tareaAuto)}`);
check("…con exactamente los 3 ejercicios pedidos", tareaAuto?.tarea?.ejercicioIds?.length === 3, JSON.stringify(tareaAuto?.tarea?.ejercicioIds));
check("…y cantidadEjercicios coincide con los elegidos", tareaAuto?.tarea?.cantidadEjercicios === 3);

const idsAuto = new Set((basico?.ejercicios ?? []).map((e) => e.id));
check(
  "…todos del nivel BASICO pedido",
  (tareaAuto?.tarea?.ejercicioIds ?? []).every((id) => idsAuto.has(id)),
  JSON.stringify(tareaAuto?.tarea?.ejercicioIds),
);

// 4. Pedir más de los que hay disponibles se rechaza con un mensaje claro
//    (no se asigna "lo que haya").
const rSinSuficientes = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula.aula.id,
    titulo: `Banco imposible ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    cantidadEjercicios: 10_000,
    nodoId: nodoAritmetica.id,
    origenEjercicios: "banco",
    dificultad: "BASICO",
  }),
});
check(
  "pedir más ejercicios de los que hay en el banco se rechaza con 400",
  rSinSuficientes.status === 400,
  `HTTP ${rSinSuficientes.status}`,
);

// 5. Modo manual: el docente elige, a mano, ejercicios concretos.
const elegidosAMano = (avanzado?.ejercicios ?? []).slice(0, 2).map((e) => e.id);
check("hay al menos 2 ejercicios AVANZADO para elegir a mano", elegidosAMano.length === 2);

const rManual = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula.aula.id,
    titulo: `Banco manual ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    nodoId: nodoAritmetica.id,
    origenEjercicios: "banco",
    dificultad: "AVANZADO",
    ejercicioIds: elegidosAMano,
    limiteReintentos: 0,
  }),
});
const tareaManual = await rManual.json();
check("el modo manual arma la tarea con los ejercicios elegidos", rManual.status === 201, `HTTP ${rManual.status}`);
check(
  "…exactamente esos, ni más ni menos",
  JSON.stringify([...(tareaManual?.tarea?.ejercicioIds ?? [])].sort()) === JSON.stringify([...elegidosAMano].sort()),
  JSON.stringify(tareaManual?.tarea?.ejercicioIds),
);

// 6. Un id inventado (o no publicado) en la selección manual se rechaza.
const rManualMalo = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula.aula.id,
    titulo: `Banco manual inválido ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    nodoId: nodoAritmetica.id,
    origenEjercicios: "banco",
    ejercicioIds: ["no-existe-este-id"],
  }),
});
check("un ejercicio inventado en la selección manual se rechaza con 400", rManualMalo.status === 400, `HTTP ${rManualMalo.status}`);

// 7. Una tarea SIN origenEjercicios sigue comportándose exactamente igual
//    que antes de esta corrección —el motor conversacional, sin banco—.
const rLegado = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula.aula.id,
    titulo: `Sin banco ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    cantidadEjercicios: 5,
    nodoId: nodoAritmetica.id,
  }),
});
const tareaLegado = await rLegado.json();
check(
  "una tarea sin pedir el banco se crea igual que siempre, sin ejercicioIds",
  rLegado.status === 201 && (tareaLegado?.tarea?.ejercicioIds ?? []).length === 0,
  JSON.stringify(tareaLegado?.tarea),
);

// 8. La ficha del aula trae los ejercicioIds, para "Ver ejercicios de la tarea".
const rFicha = await api(`/api/docente/aulas/${aula.aula.id}`);
const ficha = await rFicha.json().catch(() => ({}));
const filaAuto = (ficha?.tareas ?? []).find((t) => t.id === tareaAuto?.tarea?.id);
check(
  "la ficha del aula trae los ejercicioIds de la tarea automática",
  JSON.stringify([...(filaAuto?.ejercicioIds ?? [])].sort()) === JSON.stringify([...(tareaAuto?.tarea?.ejercicioIds ?? [])].sort()),
  JSON.stringify(filaAuto?.ejercicioIds),
);

// 9. "Ver ejercicios de la tarea": pedir por id exacto trae esos y sólo esos,
//    CON la respuesta correcta —es el docente, puede verla—.
const rVerEjercicios = await api(`/api/docente/ejercicios?ids=${tareaAuto.tarea.ejercicioIds.join(",")}`);
const verEjercicios = await rVerEjercicios.json().catch(() => ({}));
check(
  "'Ver ejercicios de la tarea' trae exactamente los asignados, con su respuesta",
  (verEjercicios?.ejercicios ?? []).length === 3 &&
    verEjercicios.ejercicios.every((e) => typeof e.respuestaCorrecta === "string" && e.respuestaCorrecta.length > 0),
  JSON.stringify(verEjercicios?.ejercicios?.map((e) => e.id)),
);

// 10. La página del alumno ya no pasa por el motor conversacional.
const rPagina = await fetch(`${BASE}/estudiante/leccion?tareaId=${tareaAuto.tarea.id}`, {
  headers: { cookie: alta.sesion },
});
const textoPagina = await rPagina.text();
check("la página del alumno responde para una tarea del banco", rPagina.status === 200, `HTTP ${rPagina.status}`);
// React intercala comentarios de hidratación ("<!-- -->") entre expresiones
// JSX contiguas al servir HTML crudo —un navegador los colapsa solo, por
// eso el mismo patrón sin esto funciona en las baterías con Chrome real—.
check(
  "…y muestra 'Ejercicio 1 de 3', sin selector de tema ni avatar",
  /Ejercicio\s*(?:<!--\s*-->\s*)?1\s*(?:<!--\s*-->\s*)?de\s*(?:<!--\s*-->\s*)?3/.test(textoPagina) &&
    !/Elige un tema/.test(textoPagina),
  "no se encontró el contador esperado",
);

// 11. Corregir cada ejercicio: la respuesta correcta se saca de 'Ver
//     ejercicios' (el docente la ve), y se entrega al corrector del alumno
//     —que NUNCA la expone de vuelta—.
let aciertos = 0;
for (const ejercicio of verEjercicios.ejercicios) {
  const rCorrecta = await apiAlumno(`/api/estudiante/tareas/${tareaAuto.tarea.id}/ejercicios/${ejercicio.id}/corregir`, {
    method: "POST",
    body: JSON.stringify({ respuesta: ejercicio.respuestaCorrecta }),
  });
  const correccion = await rCorrecta.json().catch(() => ({}));
  check(
    `el ejercicio ${ejercicio.id.slice(-6)} con la respuesta correcta se marca correcto`,
    rCorrecta.status === 200 && correccion.correcto === true,
    `HTTP ${rCorrecta.status} ${JSON.stringify(correccion)}`,
  );
  check(
    "…y el veredicto NUNCA trae la respuesta correcta de vuelta",
    !("respuestaCorrecta" in correccion),
    JSON.stringify(correccion),
  );
  if (correccion.correcto) aciertos++;
}
check("los tres ejercicios se corrigieron correctos", aciertos === 3, String(aciertos));

// 12. Una respuesta mal escrita se marca incorrecta, no da error.
const primerEjercicio = verEjercicios.ejercicios[0];
const rIncorrecta = await apiAlumno(
  `/api/estudiante/tareas/${tareaAuto.tarea.id}/ejercicios/${primerEjercicio.id}/corregir`,
  { method: "POST", body: JSON.stringify({ respuesta: "una respuesta claramente incorrecta 99999" }) },
);
const incorrecta = await rIncorrecta.json().catch(() => ({}));
check("una respuesta incorrecta se marca como tal, sin dar error", rIncorrecta.status === 200 && incorrecta.correcto === false, JSON.stringify(incorrecta));

// 13. Seguridad: un ejercicio que no pertenece a ESTA tarea se rechaza, aunque exista en el banco.
const ejercicioAjeno = tareaManual.tarea.ejercicioIds[0];
const rAjeno = await apiAlumno(
  `/api/estudiante/tareas/${tareaAuto.tarea.id}/ejercicios/${ejercicioAjeno}/corregir`,
  { method: "POST", body: JSON.stringify({ respuesta: "1" }) },
);
check(
  "un ejercicio del banco que NO es de esta tarea se rechaza con 404",
  rAjeno.status === 404,
  `HTTP ${rAjeno.status}`,
);

// 14. Seguridad: un alumno no matriculado no puede corregir nada de esta tarea.
const ajeno = await registrarAlumno(BASE, {
  email: `qa.banco.ajeno.${sufijo}@mentoriamath.local`,
  password: "Alumno-2026",
  nombre: "QA Banco Ajeno",
});
const rNoMatriculado = await fetch(
  `${BASE}/api/estudiante/tareas/${tareaAuto.tarea.id}/ejercicios/${primerEjercicio.id}/corregir`,
  { method: "POST", headers: { "Content-Type": "application/json", cookie: ajeno.sesion }, body: JSON.stringify({ respuesta: "1" }) },
);
check("un alumno no matriculado no puede corregir un ejercicio de esta tarea", rNoMatriculado.status === 403, `HTTP ${rNoMatriculado.status}`);

// 15. Entregar, con la nota de los 3 aciertos (el cliente sabe, por el
//     round anterior, que esto registra la EntregaTarea de verdad).
// El desglose que de verdad manda la pantalla del alumno: dos aciertos, un
// fallo —a propósito, para probar los dos colores de "Ver ejercicios de la
// tarea" (corrección QA) con un solo alumno matriculado—.
const detalleEntrega = verEjercicios.ejercicios.map((e, i) => ({
  ejercicioId: e.id,
  enunciado: e.enunciado,
  respuestaDada: i === 0 ? "una respuesta mal a propósito" : e.respuestaCorrecta,
  respuestaCorrecta: null, // el servidor la rellena él mismo, nunca se confía en el cliente
  correcto: i !== 0,
}));
const rEntregar = await apiAlumno(`/api/estudiante/tareas/${tareaAuto.tarea.id}/entregar`, {
  method: "POST",
  body: JSON.stringify({ puntaje: 100, completada: true, detalle: detalleEntrega }),
});
check("la tarea del banco se entrega con el mismo endpoint de siempre", rEntregar.status === 200, `HTTP ${rEntregar.status}`);

const rTareasAlumno = await apiAlumno("/api/estudiante/tareas");
const laSuya = (await rTareasAlumno.json().catch(() => ({})))?.tareas?.find((t) => t.id === tareaAuto.tarea.id);
check(
  // PMV 3 · HITO 1: la nota ya NO es la que manda el navegador (aquí mandaba 100):
  // la calcula el servidor con lo que él mismo corrigió — 2 aciertos de 3.
  "la entrega de la tarea del banco queda registrada: entregada, nota calculada por el servidor (67, no el 100 del navegador)",
  laSuya?.estado === "entregada" && laSuya?.puntaje === 67,
  JSON.stringify(laSuya),
);

// 15a. "Ver ejercicios de la tarea" del docente (corrección QA): la
//      dificultad se dice UNA vez, en la tarea —no repetida en cada fila—,
//      y cada ejercicio trae con qué cruzar si se acertó o no.
const rFichaTrasEntregar = await api(`/api/docente/aulas/${aula.aula.id}`);
const fichaTrasEntregar = await rFichaTrasEntregar.json().catch(() => ({}));
const filaAutoTrasEntregar = (fichaTrasEntregar?.tareas ?? []).find((t) => t.id === tareaAuto.tarea.id);
check(
  "la ficha del aula trae la dificultad DE LA TAREA (una vez, no por ejercicio)",
  filaAutoTrasEntregar?.dificultad === "BASICO",
  JSON.stringify(filaAutoTrasEntregar?.dificultad),
);
check(
  "…y el desglose de la entrega completada, para cruzar el acierto por ejercicio",
  Array.isArray(filaAutoTrasEntregar?.entregas) &&
    filaAutoTrasEntregar.entregas.length === 1 &&
    Array.isArray(filaAutoTrasEntregar.entregas[0]?.detalle) &&
    filaAutoTrasEntregar.entregas[0].detalle.length === 3,
  JSON.stringify(filaAutoTrasEntregar?.entregas),
);
check(
  "seAcertoElEjercicio: el 1er ejercicio (contestado mal a propósito) da false",
  seAcertoElEjercicio(filaAutoTrasEntregar?.entregas ?? [], verEjercicios.ejercicios[0].id) === false,
);
check(
  "…y el 2º y 3º (contestados bien) dan true",
  seAcertoElEjercicio(filaAutoTrasEntregar?.entregas ?? [], verEjercicios.ejercicios[1].id) === true &&
    seAcertoElEjercicio(filaAutoTrasEntregar?.entregas ?? [], verEjercicios.ejercicios[2].id) === true,
);
check(
  "…y la respuesta correcta del desglose la rellenó EL SERVIDOR, no lo que mandó el cliente (null)",
  filaAutoTrasEntregar.entregas[0].detalle.every((d) => typeof d.respuestaCorrecta === "string" && d.respuestaCorrecta.length > 0),
  JSON.stringify(filaAutoTrasEntregar.entregas[0].detalle),
);

// 15b. El desglose de resultados ("la respuesta correcta calculada por el
//      motor") sólo se revela una vez entregada —antes sería un atajo para
//      adivinar a fuerza de intentos—.
const rResultadoAntes = await apiAlumno(`/api/estudiante/tareas/${tareaManual.tarea.id}/resultado`);
check(
  "el resultado de una tarea TODAVÍA NO entregada se bloquea con 409",
  rResultadoAntes.status === 409,
  `HTTP ${rResultadoAntes.status}`,
);

const rResultadoDespues = await apiAlumno(`/api/estudiante/tareas/${tareaAuto.tarea.id}/resultado`);
const resultadoDespues = await rResultadoDespues.json().catch(() => ({}));
check(
  "una vez entregada, el resultado SÍ trae la respuesta correcta de cada ejercicio",
  rResultadoDespues.status === 200 &&
    (resultadoDespues?.ejercicios ?? []).length === 3 &&
    resultadoDespues.ejercicios.every((e) => typeof e.respuestaCorrecta === "string"),
  JSON.stringify(resultadoDespues),
);

const rResultadoAjeno = await fetch(`${BASE}/api/estudiante/tareas/${tareaAuto.tarea.id}/resultado`, {
  headers: { cookie: ajeno.sesion },
});
check(
  "un alumno no matriculado no puede ver el resultado de esta tarea",
  rResultadoAjeno.status === 403,
  `HTTP ${rResultadoAjeno.status}`,
);

// 16. Un estudiante no puede ver el banco de ejercicios del docente.
const rBancoComoAlumno = await apiAlumno(`/api/docente/ejercicios?nodoId=${nodoAritmetica.id}`);
check("un estudiante no puede listar el banco de ejercicios del docente", rBancoComoAlumno.status === 403, `HTTP ${rBancoComoAlumno.status}`);

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length > 0) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");

process.exit(fallos.length > 0 ? 1 : 0);
