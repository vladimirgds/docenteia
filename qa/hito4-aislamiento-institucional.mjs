// HITO 4 (cierre PMV2) — AISLAMIENTO CURRICULAR MULTIINSTITUCIONAL.
//
// POR QUÉ EXISTE
// El cliente, revisando el código de administración, mandó esta observación:
// "Garantizar que cada institución tenga su propio currículo independiente.
// Cada colegio debe gestionar sus propias asignaturas, temas, reglas
// matemáticas y ejercicios. Impedir que un docente pueda visualizar,
// modificar o eliminar contenido perteneciente a otra institución. Validar
// la propiedad de los recursos en todas las rutas API, evitando
// vulnerabilidades IDOR/BOLA. Verificar los permisos tanto en el backend
// como en las consultas a Prisma."
//
// Antes de esta corrección, `Materia`/`NodoConocimiento`/`Ejercicio` no
// tenían NINGÚN concepto de institución: eran un único banco compartido por
// toda la plataforma, y `/api/docente/materias/[id]`,
// `/api/docente/temas/[id]` y `/api/docente/ejercicios/[id]` hacían
// `findUnique({ where: { id } })` sin comprobar de quién era la fila antes
// de editarla o borrarla — el IDOR/BOLA exacto que describe el cliente.
//
// Cubre, en este orden:
//
//   A. No existía ningún camino para dar de alta un SEGUNDO colegio: se
//      prueba `POST /api/admin/instituciones`, la pieza que faltaba para que
//      el aislamiento se pudiera usar (y probar) con más de un colegio.
//   B. Materias: un docente de otra institución no las ve, no las edita, no
//      las borra (404, no 403 — no se confirma que existan). Uno SIN colegio
//      asignado no puede crear.
//   C. Temas: lo mismo, más los agujeros de "colgar de un padre ajeno" y
//      "categorizar bajo una asignatura ajena".
//   D. Ejercicios: heredan la institución de su tema —la autorización real
//      es "¿puedo escribir en el tema?"—, con el mismo candado.
//   E. El catálogo BASE (el de la semilla, institución `null`): lo ve
//      cualquiera, pero sólo lo edita un SUPERADMIN —ni siquiera el docente
//      de un colegio concreto—.
//   F. `POST /api/docente/tareas` no deja construir el banco de una tarea
//      con ejercicios o un tema de OTRA institución, aunque se citen sus
//      ids directamente en el cuerpo.
//   G. SUPERADMIN no tiene límite: lee y escribe cualquier institución.
//
//   node qa/hito4-aislamiento-institucional.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-aislamiento-institucional.mjs

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion } from "./sesion.mjs";

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
function salir() {
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

const sesionAdmin = await iniciarSesion(
  BASE,
  process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local",
  process.env.SEED_ADMIN_PASSWORD || "Admin-2026",
);
check("se inicia sesión como el administrador de la semilla", Boolean(sesionAdmin));
const admin = api(sesionAdmin);

// ── A. Dar de alta un SEGUNDO colegio ────────────────────────────────────────
console.log("\n · A. POST /api/admin/instituciones");

const rSinSesion = await fetch(`${BASE}/api/admin/instituciones`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nombre: "x" }),
});
check("sin sesión, 401", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

const rInstB = await admin("/api/admin/instituciones", {
  method: "POST",
  body: JSON.stringify({ nombre: `Colegio QA Aislamiento ${sufijo}` }),
});
const cuerpoInstB = await rInstB.json().catch(() => ({}));
check(
  "el SUPERADMIN crea un segundo colegio",
  rInstB.status === 201 && Boolean(cuerpoInstB.institucion?.id),
  `HTTP ${rInstB.status} · ${JSON.stringify(cuerpoInstB)}`,
);
const institucionB = cuerpoInstB.institucion;

// Docente B, nuevo, vinculado al colegio nuevo.
const emailDocenteB = `qa.aislamiento.b.${sufijo}@mentoriamath.local`;
const rCrearDocenteB = await admin("/api/admin/usuarios", {
  method: "POST",
  body: JSON.stringify({ nombre: "QA Docente B", email: emailDocenteB, password: "Docente-2026", rol: "DOCENTE" }),
});
const cuerpoDocenteB = await rCrearDocenteB.json().catch(() => ({}));
check("se crea el docente del segundo colegio", rCrearDocenteB.status === 201, `HTTP ${rCrearDocenteB.status}`);

const rVincularB = await admin(`/api/admin/usuarios/${cuerpoDocenteB.usuario?.id}`, {
  method: "PATCH",
  body: JSON.stringify({ institucionId: institucionB?.id }),
});
check("se vincula al docente B con el colegio nuevo", rVincularB.status === 200, `HTTP ${rVincularB.status}`);

// Docente C, SIN colegio asignado nunca: el candado de "institucionParaCrear".
const emailDocenteC = `qa.aislamiento.c.${sufijo}@mentoriamath.local`;
const rCrearDocenteC = await admin("/api/admin/usuarios", {
  method: "POST",
  body: JSON.stringify({ nombre: "QA Docente Sin Colegio", email: emailDocenteC, password: "Docente-2026", rol: "DOCENTE" }),
});
check("se crea el docente SIN colegio", rCrearDocenteC.status === 201, `HTTP ${rCrearDocenteC.status}`);

// Sesión nueva para B y para C: `institucionId` viaja en el JWT y sólo se
// rellena al iniciar sesión (mismo motivo que `nivelActual` en qa/hito3.mjs).
const sesionDocenteA = await iniciarSesion(
  BASE,
  process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
  process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
);
const sesionDocenteB = await iniciarSesion(BASE, emailDocenteB, "Docente-2026");
const sesionDocenteC = await iniciarSesion(BASE, emailDocenteC, "Docente-2026");
check("el docente A (de la semilla) inicia sesión", Boolean(sesionDocenteA));
check("el docente B (del colegio nuevo) inicia sesión", Boolean(sesionDocenteB));
check("el docente C (sin colegio) inicia sesión", Boolean(sesionDocenteC));

const docA = api(sesionDocenteA);
const docB = api(sesionDocenteB);
const docC = api(sesionDocenteC);

// ── B. Materias ───────────────────────────────────────────────────────────────
console.log("\n · B. Materias: aisladas por institución");

const rMateriaA = await docA("/api/docente/materias", {
  method: "POST",
  body: JSON.stringify({ nombre: `QA Aislamiento Materia A ${sufijo}` }),
});
const cuerpoMateriaA = await rMateriaA.json().catch(() => ({}));
check("el docente A crea una materia", rMateriaA.status === 201, `HTTP ${rMateriaA.status} · ${JSON.stringify(cuerpoMateriaA)}`);
const materiaA = cuerpoMateriaA.materia;
check("…y nace con la institución de A, no con null", Boolean(materiaA?.institucionId), JSON.stringify(materiaA));

const rListaMateriasB = await docB("/api/docente/materias");
const { materias: materiasParaB } = await rListaMateriasB.json().catch(() => ({ materias: [] }));
check(
  "el docente B NO ve la materia privada de A en su listado",
  !materiasParaB?.some((m) => m.id === materiaA?.id),
  `${materiasParaB?.length} materias`,
);

const rPatchMateriaAporB = await docB(`/api/docente/materias/${materiaA?.id}`, {
  method: "PATCH",
  body: JSON.stringify({ nombre: "hackeada" }),
});
check("el docente B NO puede editar la materia de A (404, no 403)", rPatchMateriaAporB.status === 404, `HTTP ${rPatchMateriaAporB.status}`);

const rDeleteMateriaAporB = await docB(`/api/docente/materias/${materiaA?.id}`, { method: "DELETE" });
check("el docente B NO puede borrar la materia de A (404)", rDeleteMateriaAporB.status === 404, `HTTP ${rDeleteMateriaAporB.status}`);

const rMateriaSinColegio = await docC("/api/docente/materias", {
  method: "POST",
  body: JSON.stringify({ nombre: "No debería crearse" }),
});
const cuerpoMateriaSinColegio = await rMateriaSinColegio.json().catch(() => ({}));
check(
  "un docente SIN colegio no puede crear contenido (409, con el mismo aviso que crear un aula)",
  rMateriaSinColegio.status === 409 && /no está asignada a ningún colegio/.test(cuerpoMateriaSinColegio.error ?? ""),
  `HTTP ${rMateriaSinColegio.status} · ${JSON.stringify(cuerpoMateriaSinColegio)}`,
);

const rPatchMateriaAporSuperadmin = await admin(`/api/docente/materias/${materiaA?.id}`, {
  method: "PATCH",
  body: JSON.stringify({ activa: true }),
});
check("el SUPERADMIN SÍ puede editar la materia de A", rPatchMateriaAporSuperadmin.status === 200, `HTTP ${rPatchMateriaAporSuperadmin.status}`);

// ── E (adelantada). El catálogo BASE: visible para todos, editable sólo por SUPERADMIN ──
console.log("\n · E. El catálogo base (semilla): visible para todos, editable sólo por SUPERADMIN");

const rListaMateriasA = await docA("/api/docente/materias");
const { materias: materiasParaA } = await rListaMateriasA.json().catch(() => ({ materias: [] }));
const materiaBase = materiasParaA?.find((m) => m.institucionId === null);
check("hay al menos una materia del catálogo base (institucionId null)", Boolean(materiaBase), JSON.stringify(materiasParaA?.map((m) => m.institucionId)));
check(
  "…y el docente B TAMBIÉN la ve (es de todos)",
  materiasParaB?.some((m) => m.id === materiaBase?.id),
  `${materiasParaB?.length} materias`,
);

if (materiaBase) {
  const rEditarBaseA = await docA(`/api/docente/materias/${materiaBase.id}`, {
    method: "PATCH",
    body: JSON.stringify({ activa: true }),
  });
  check(
    "…pero ni A puede editarla (404): el catálogo base no es de ningún colegio en particular",
    rEditarBaseA.status === 404,
    `HTTP ${rEditarBaseA.status}`,
  );

  const rEditarBaseSuperadmin = await admin(`/api/docente/materias/${materiaBase.id}`, {
    method: "PATCH",
    body: JSON.stringify({ activa: true }),
  });
  check("…y el SUPERADMIN sí puede", rEditarBaseSuperadmin.status === 200, `HTTP ${rEditarBaseSuperadmin.status}`);
}

// ── C. Temas ──────────────────────────────────────────────────────────────────
console.log("\n · C. Temas: aislados por institución, incluido el padre y la asignatura");

const rTemaA = await docA("/api/docente/temas", {
  method: "POST",
  body: JSON.stringify({ titulo: `QA Aislamiento Tema A ${sufijo}`, motor: "ARITMETICA" }),
});
const cuerpoTemaA = await rTemaA.json().catch(() => ({}));
check("el docente A crea un tema", rTemaA.status === 201, `HTTP ${rTemaA.status} · ${JSON.stringify(cuerpoTemaA)}`);
const temaA = cuerpoTemaA.tema;
check("…y nace con la institución de A", temaA?.institucionId, JSON.stringify(temaA));

const rGetTemaAporB = await docB(`/api/docente/temas/${temaA?.id}`);
check("el docente B NO puede LEER el tema de A por su id (404)", rGetTemaAporB.status === 404, `HTTP ${rGetTemaAporB.status}`);

const rListaTemasB = await docB("/api/docente/temas");
const { temas: temasParaB } = await rListaTemasB.json().catch(() => ({ temas: [] }));
check("…ni aparece en su listado", !temasParaB?.some((t) => t.id === temaA?.id), `${temasParaB?.length} temas`);

const rPatchTemaAporB = await docB(`/api/docente/temas/${temaA?.id}`, {
  method: "PATCH",
  body: JSON.stringify({ titulo: "hackeado" }),
});
check("el docente B NO puede editar el tema de A (404)", rPatchTemaAporB.status === 404, `HTTP ${rPatchTemaAporB.status}`);

const rDeleteTemaAporB = await docB(`/api/docente/temas/${temaA?.id}`, { method: "DELETE" });
check("el docente B NO puede borrar el tema de A (404)", rDeleteTemaAporB.status === 404, `HTTP ${rDeleteTemaAporB.status}`);

const rSubtemaDePadreAjeno = await docB("/api/docente/temas", {
  method: "POST",
  body: JSON.stringify({ titulo: "Subtema colado", padreId: temaA?.id }),
});
const cuerpoSubtemaAjeno = await rSubtemaDePadreAjeno.json().catch(() => ({}));
check(
  "el docente B no puede colgar un subtema de un tema PADRE ajeno (404 'El tema padre')",
  rSubtemaDePadreAjeno.status === 404,
  `HTTP ${rSubtemaDePadreAjeno.status} · ${JSON.stringify(cuerpoSubtemaAjeno)}`,
);

const rTemaConAsignaturaAjena = await docB("/api/docente/temas", {
  method: "POST",
  body: JSON.stringify({ titulo: "Tema con asignatura ajena", materiaId: materiaA?.id }),
});
check(
  "…ni categorizar un tema bajo una ASIGNATURA ajena (404 'La asignatura')",
  rTemaConAsignaturaAjena.status === 404,
  `HTTP ${rTemaConAsignaturaAjena.status}`,
);

const rPatchTemaAporSuperadmin = await admin(`/api/docente/temas/${temaA?.id}`, {
  method: "PATCH",
  body: JSON.stringify({ titulo: temaA?.titulo }),
});
check("el SUPERADMIN SÍ puede editar el tema de A", rPatchTemaAporSuperadmin.status === 200, `HTTP ${rPatchTemaAporSuperadmin.status}`);

const temaBase = temasParaB?.find((t) => t.institucionId === null);
check("el docente B ve al menos un tema del catálogo base", Boolean(temaBase), JSON.stringify(temasParaB?.slice(0, 3)));
if (temaBase) {
  const rEditarTemaBasePorB = await docB(`/api/docente/temas/${temaBase.id}`, {
    method: "PATCH",
    body: JSON.stringify({ titulo: temaBase.titulo }),
  });
  check("…pero no puede editarlo (404): el catálogo base sólo lo toca SUPERADMIN", rEditarTemaBasePorB.status === 404, `HTTP ${rEditarTemaBasePorB.status}`);
}

// ── D. Ejercicios: heredan la institución de su tema ─────────────────────────
console.log("\n · D. Ejercicios: heredan la institución de su tema");

// Números derivados del momento de la corrida (no "2 + 2" fijo): el banco
// tiene una restricción ÚNICA, a propósito GLOBAL —`@@unique([motor, nivel,
// enunciado])`, sin institución—, así que un enunciado fijo chocaría con el
// que dejó la corrida anterior de esta misma batería.
const n1 = 10 + (Date.now() % 40);
const n2 = 3 + (Date.now() % 5);
const enunciadoEjercicioA = `${n1} + ${n2}`;
const rEjercicioA = await docA("/api/docente/ejercicios", {
  method: "POST",
  body: JSON.stringify({
    nodoId: temaA?.id,
    nivel: "BASICO",
    enunciado: enunciadoEjercicioA,
    respuestaCorrecta: String(n1 + n2),
    estado: "PUBLICADO",
  }),
});
const cuerpoEjercicioA = await rEjercicioA.json().catch(() => ({}));
check("el docente A crea un ejercicio bajo su tema", rEjercicioA.status === 201, `HTTP ${rEjercicioA.status} · ${JSON.stringify(cuerpoEjercicioA)}`);
const ejercicioA = cuerpoEjercicioA.ejercicio;
check(
  "…y hereda la institución DEL TEMA, no una propia",
  ejercicioA?.institucionId && ejercicioA.institucionId === temaA?.institucionId,
  JSON.stringify(ejercicioA),
);

const rListaEjerciciosB = await docB("/api/docente/ejercicios");
const { ejercicios: ejerciciosParaB } = await rListaEjerciciosB.json().catch(() => ({ ejercicios: [] }));
check("el docente B no ve el ejercicio de A en su listado", !ejerciciosParaB?.some((e) => e.id === ejercicioA?.id));

const rPatchEjercicioAporB = await docB(`/api/docente/ejercicios/${ejercicioA?.id}`, {
  method: "PATCH",
  body: JSON.stringify({ pistas: ["hackeada"] }),
});
check("el docente B NO puede editar el ejercicio de A (404)", rPatchEjercicioAporB.status === 404, `HTTP ${rPatchEjercicioAporB.status}`);

const rDeleteEjercicioAporB = await docB(`/api/docente/ejercicios/${ejercicioA?.id}`, { method: "DELETE" });
check("el docente B NO puede borrar el ejercicio de A (404)", rDeleteEjercicioAporB.status === 404, `HTTP ${rDeleteEjercicioAporB.status}`);

const rEjercicioDirectoEnTemaAjeno = await docB("/api/docente/ejercicios", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaA?.id, nivel: "BASICO", enunciado: "3 + 3", respuestaCorrecta: "6" }),
});
check(
  "el docente B no puede crear un ejercicio DIRECTAMENTE bajo el tema de A (404 'El tema')",
  rEjercicioDirectoEnTemaAjeno.status === 404,
  `HTTP ${rEjercicioDirectoEnTemaAjeno.status}`,
);

const rPatchEjercicioAporSuperadmin = await admin(`/api/docente/ejercicios/${ejercicioA?.id}`, {
  method: "PATCH",
  body: JSON.stringify({ pistas: [] }),
});
check("el SUPERADMIN SÍ puede editar el ejercicio de A", rPatchEjercicioAporSuperadmin.status === 200, `HTTP ${rPatchEjercicioAporSuperadmin.status}`);

// ── F. /api/docente/tareas no deja construir el banco con contenido ajeno ──
console.log("\n · F. Una tarea de B no puede citar contenido PRIVADO de A, aunque se mande el id a mano");

const rAulaB = await docB("/api/docente/aulas", {
  method: "POST",
  body: JSON.stringify({ nombre: `QA Aislamiento Aula B ${sufijo}`, grado: 1, seccion: "Q" }),
});
const cuerpoAulaB = await rAulaB.json().catch(() => ({}));
check("se crea el aula de B", rAulaB.status === 201, `HTTP ${rAulaB.status} · ${JSON.stringify(cuerpoAulaB)}`);
const aulaB = cuerpoAulaB.aula;

const rTareaConNodoAjeno = await docB("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aulaB?.id,
    titulo: "Tarea con tema ajeno",
    fechaInicio: new Date().toISOString(),
    fechaVencimiento: new Date(Date.now() + 86_400_000).toISOString(),
    nodoId: temaA?.id,
  }),
});
check(
  "una tarea de B no puede enlazar el tema PRIVADO de A (404 'El tema')",
  rTareaConNodoAjeno.status === 404,
  `HTTP ${rTareaConNodoAjeno.status}`,
);

const rTareaConEjercicioAjeno = await docB("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aulaB?.id,
    titulo: "Tarea con ejercicio ajeno",
    fechaInicio: new Date().toISOString(),
    fechaVencimiento: new Date(Date.now() + 86_400_000).toISOString(),
    origenEjercicios: "banco",
    ejercicioIds: [ejercicioA?.id],
  }),
});
const cuerpoTareaConEjercicioAjeno = await rTareaConEjercicioAjeno.json().catch(() => ({}));
check(
  "…ni armar el banco de una tarea citando el id de un ejercicio PRIVADO de A (400, 'ya no publicado o validado')",
  rTareaConEjercicioAjeno.status === 400,
  `HTTP ${rTareaConEjercicioAjeno.status} · ${JSON.stringify(cuerpoTareaConEjercicioAjeno)}`,
);

// ── G. SUPERADMIN, sin límite, visto desde el listado completo ──────────────
console.log("\n · G. SUPERADMIN ve y edita cualquier institución, sin restricción");

const rListaMateriasSuperadmin = await admin("/api/docente/materias");
const { materias: materiasParaSuperadmin } = await rListaMateriasSuperadmin.json().catch(() => ({ materias: [] }));
check(
  "el SUPERADMIN ve la materia de A en el listado completo",
  materiasParaSuperadmin?.some((m) => m.id === materiaA?.id),
  `${materiasParaSuperadmin?.length} materias`,
);

salir();
