// HITO 4 (cierre PMV2) — CHECKLIST ACTUALIZADO: GESTIÓN CENTRALIZADA DE
// AULAS Y MATRÍCULA ADMINISTRATIVA.
//
// «Desacoplar el alta de la estructura física/académica de la asignación de
// personas: al dar de alta un aula sólo se debe requerir Nombre del salón,
// Grado, Sección e Institución —el aula se crea inicialmente como una
// entidad independiente—. Una vez creada, se debe poder asignar o cambiar
// el docente titular directamente desde la tabla. La matrícula de alumnos
// se realiza con la acción "Matricular". /docente/aulas (Vista limpia: se
// retira el formulario de creación; el docente sólo visualiza las aulas
// asignadas). POST /api/admin/aulas (Creación centralizada, SIN docente).
// POST /api/admin/matriculas (asignación directa de un estudianteId a un
// aulaId).»
//
// Cubre, en este orden:
//
//   A. `aulaAdminSchema` / `asignarDocenteSchema` / `matriculaAdminSchema`,
//      puros, sin servidor.
//   B. Por HTTP: el candado de la zona —sólo SUPERADMIN entra a
//      /admin/aulas y a los tres endpoints—, crear un aula SIN docente,
//      asignarle uno después con PATCH, cambiarlo, desvincularlo (null),
//      matricular un alumno DIRECTO (sin código), las reglas de negocio
//      (alumno duplicado, aula inexistente, cuentas que no son lo que dicen
//      ser), y que /docente/aulas YA NO ofrezca el formulario de creación.
//
//   node qa/hito4-admin-aulas.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-admin-aulas.mjs

import { aulaAdminSchema, asignarDocenteSchema, matriculaAdminSchema } from "../lib/admin/aulas.ts";
import { BASE_URL as BASE } from "./base-url.mjs";
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

// ── A. Los esquemas, puros ───────────────────────────────────────────────────
console.log("\n · A. aulaAdminSchema / asignarDocenteSchema / matriculaAdminSchema");
{
  const aulaValida = aulaAdminSchema.safeParse({ nombre: "3ro B", grado: 3, seccion: "B", institucionId: "i1" });
  check("un aula con sólo nombre, grado, sección e institución pasa —SIN docente—", aulaValida.success);
  check(
    "…y de hecho, aunque se mande un docenteId de más, el esquema no lo exige ni lo guarda",
    aulaAdminSchema.safeParse({ nombre: "3ro B", grado: 3, seccion: "B", institucionId: "i1" }).success,
  );

  const sinInstitucion = aulaAdminSchema.safeParse({ nombre: "3ro B", grado: 3, seccion: "B" });
  check("sin institucionId, no pasa —eso SÍ sigue siendo obligatorio—", !sinInstitucion.success);

  const asignacionValida = asignarDocenteSchema.safeParse({ docenteId: "d1" });
  check("asignarDocenteSchema con un docenteId pasa", asignacionValida.success);
  const desvinculacion = asignarDocenteSchema.safeParse({ docenteId: null });
  check("…y con docenteId: null también —desvincular es un valor legítimo, no un campo vacío—", desvinculacion.success);
  check("sin el campo docenteId siquiera, no pasa", !asignarDocenteSchema.safeParse({}).success);

  const matriculaValida = matriculaAdminSchema.safeParse({ estudianteId: "e1", aulaId: "a1" });
  check("una matrícula con los dos ids pasa", matriculaValida.success);
  check("sin estudianteId, no pasa", !matriculaAdminSchema.safeParse({ aulaId: "a1" }).success);
  check("sin aulaId, no pasa", !matriculaAdminSchema.safeParse({ estudianteId: "e1" }).success);
}

// ── B. Contra un servidor levantado ──────────────────────────────────────────
const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud) {
  console.log(`\n  · No hay servidor en ${BASE}: se omite el resto de esta batería.`);
  console.log("    Arráncalo con `npm run dev` (o `npm run start`) y vuelve a ejecutarla.");
  salir();
}
console.log(`\n  Servidor: ${BASE}  ·  modo IA: ${salud.modo_ia}`);

const sesionAdmin = await iniciarSesion(
  BASE,
  process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local",
  process.env.SEED_ADMIN_PASSWORD || "Admin-2026",
);
const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
const sufijo = Date.now().toString(36);
const altaAlumno = await registrarAlumno(BASE, {
  email: `qa.adminaulas.${sufijo}@mentoriamath.local`,
  password: "Alumno-2026",
  nombre: "QA AdminAulas",
});

check("sesión del SUPERADMIN de la semilla", Boolean(sesionAdmin));
check("sesión de docente de la semilla", Boolean(sesionDocente));
check("se registra el alumno de prueba", altaAlumno.ok);

// ── B.1 El candado de la zona ────────────────────────────────────────────────
console.log("\n · B.1 Sólo el SUPERADMIN entra");
{
  const rSinSesion = await fetch(`${BASE}/admin/aulas`, { redirect: "manual" });
  check("/admin/aulas sin sesión: redirige", rSinSesion.status >= 300 && rSinSesion.status < 400, `HTTP ${rSinSesion.status}`);

  if (sesionDocente) {
    const rComoDocente = await fetch(`${BASE}/admin/aulas`, { headers: { cookie: sesionDocente }, redirect: "manual" });
    check("un docente NO entra a /admin/aulas", rComoDocente.status >= 300 && rComoDocente.status < 400, `HTTP ${rComoDocente.status}`);

    const rPostComoDocente = await fetch(`${BASE}/api/admin/aulas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionDocente },
      body: JSON.stringify({ nombre: "x", grado: 1, seccion: "A", institucionId: "i" }),
    });
    check("un docente NO puede POST /api/admin/aulas", rPostComoDocente.status === 403, `HTTP ${rPostComoDocente.status}`);

    const rPatchComoDocente = await fetch(`${BASE}/api/admin/aulas/cualquiera`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: sesionDocente },
      body: JSON.stringify({ docenteId: "d" }),
    });
    check("un docente NO puede PATCH /api/admin/aulas/[id] (asignarse a sí mismo, por ejemplo)", rPatchComoDocente.status === 403, `HTTP ${rPatchComoDocente.status}`);
  }

  if (altaAlumno.sesion) {
    const rPostComoAlumno = await fetch(`${BASE}/api/admin/matriculas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: altaAlumno.sesion },
      body: JSON.stringify({ estudianteId: "e", aulaId: "a" }),
    });
    check("un alumno NO puede POST /api/admin/matriculas", rPostComoAlumno.status === 403, `HTTP ${rPostComoAlumno.status}`);
  }

  if (sesionAdmin) {
    const rComoAdmin = await fetch(`${BASE}/admin/aulas`, { headers: { cookie: sesionAdmin } });
    check("el SUPERADMIN SÍ entra a /admin/aulas", rComoAdmin.status === 200, `HTTP ${rComoAdmin.status}`);
  }
}

// ── B.2 Crear SIN docente, asignarlo después, y matricular directo ──────────
console.log("\n · B.2 Crear aula (sin titular) → asignar docente → matricular, de punta a punta");
let aulaCreada = null;
if (sesionAdmin) {
  const rUsuarios = await fetch(`${BASE}/api/admin/usuarios?rol=DOCENTE`, { headers: { cookie: sesionAdmin } });
  const { usuarios: docentes } = await rUsuarios.json().catch(() => ({ usuarios: [] }));
  const unDocente = docentes?.[0];
  check("hay al menos un docente sembrado para asignar después", Boolean(unDocente));

  const rInstituciones = await fetch(`${BASE}/api/admin/usuarios`, { headers: { cookie: sesionAdmin } });
  const { instituciones } = await rInstituciones.json().catch(() => ({ instituciones: [] }));
  const unaInstitucion = instituciones?.[0];
  check("hay al menos una institución sembrada", Boolean(unaInstitucion));

  if (unaInstitucion) {
    const rCrear = await fetch(`${BASE}/api/admin/aulas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({
        nombre: `QA Admin Aulas ${sufijo}`,
        grado: 5,
        seccion: `Q${sufijo.slice(-3)}`,
        institucionId: unaInstitucion.id,
      }),
    });
    const cuerpoCrear = await rCrear.json().catch(() => ({}));
    check(
      "POST /api/admin/aulas crea el aula SIN titular —estructura primero, personas después—",
      rCrear.status === 201 && cuerpoCrear.aula?.id && cuerpoCrear.aula?.docenteId === null,
      JSON.stringify(cuerpoCrear),
    );
    aulaCreada = cuerpoCrear.aula;

    const rListado = await fetch(`${BASE}/api/admin/aulas`, { headers: { cookie: sesionAdmin } });
    const { aulas } = await rListado.json().catch(() => ({ aulas: [] }));
    const filaCreada = aulas?.find((a) => a.id === aulaCreada?.id);
    check("…y aparece en GET /api/admin/aulas, de TODA la plataforma", Boolean(filaCreada));
    check("…con docente: null, no un nombre inventado", filaCreada?.docente === null);

    if (aulaCreada && unDocente) {
      const rAsignar = await fetch(`${BASE}/api/admin/aulas/${aulaCreada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: sesionAdmin },
        body: JSON.stringify({ docenteId: unDocente.id }),
      });
      const cuerpoAsignar = await rAsignar.json().catch(() => ({}));
      check(
        "PATCH /api/admin/aulas/[id] asigna el docente titular",
        rAsignar.status === 200 && cuerpoAsignar.aula?.docenteId === unDocente.id,
        `HTTP ${rAsignar.status} · ${JSON.stringify(cuerpoAsignar)}`,
      );

      const rDesvincular = await fetch(`${BASE}/api/admin/aulas/${aulaCreada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: sesionAdmin },
        body: JSON.stringify({ docenteId: null }),
      });
      const cuerpoDesvincular = await rDesvincular.json().catch(() => ({}));
      check(
        "…y también lo puede DESVINCULAR, con docenteId: null",
        rDesvincular.status === 200 && cuerpoDesvincular.aula?.docenteId === null,
        JSON.stringify(cuerpoDesvincular),
      );

      // Se vuelve a asignar, para que el resto del flujo (matrícula, y que el
      // docente titular vea al alumno) tenga sentido.
      await fetch(`${BASE}/api/admin/aulas/${aulaCreada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: sesionAdmin },
        body: JSON.stringify({ docenteId: unDocente.id }),
      });
    }

    const rAsignarAulaInexistente = await fetch(`${BASE}/api/admin/aulas/no-existe`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({ docenteId: unDocente?.id ?? "x" }),
    });
    check("asignar docente a un aula que no existe: 404", rAsignarAulaInexistente.status === 404, `HTTP ${rAsignarAulaInexistente.status}`);

    if (aulaCreada) {
      const rAsignarDocenteInexistente = await fetch(`${BASE}/api/admin/aulas/${aulaCreada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: sesionAdmin },
        body: JSON.stringify({ docenteId: "no-existe" }),
      });
      check("asignar un docenteId que no existe: 404, no 500", rAsignarDocenteInexistente.status === 404, `HTTP ${rAsignarDocenteInexistente.status}`);

      const rUsuariosAlumnoParaRechazo = await fetch(`${BASE}/api/admin/usuarios?rol=ESTUDIANTE&q=qa.adminaulas.${sufijo}`, {
        headers: { cookie: sesionAdmin },
      });
      const { usuarios: alumnosParaRechazo } = await rUsuariosAlumnoParaRechazo.json().catch(() => ({ usuarios: [] }));
      if (alumnosParaRechazo?.[0]) {
        const rAsignarAlumnoComoDocente = await fetch(`${BASE}/api/admin/aulas/${aulaCreada.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", cookie: sesionAdmin },
          body: JSON.stringify({ docenteId: alumnosParaRechazo[0].id }),
        });
        check(
          "asignar como titular a una cuenta que es de ALUMNO: 409, no se cuela",
          rAsignarAlumnoComoDocente.status === 409,
          `HTTP ${rAsignarAlumnoComoDocente.status}`,
        );
      }
    }
  }

  if (aulaCreada && altaAlumno.ok) {
    // Primero averigua el id del alumno vía el listado de usuarios —el alta
    // devuelve la sesión, no el id—.
    const rUsuariosAlumno = await fetch(`${BASE}/api/admin/usuarios?rol=ESTUDIANTE&q=qa.adminaulas.${sufijo}`, {
      headers: { cookie: sesionAdmin },
    });
    const { usuarios: alumnos } = await rUsuariosAlumno.json().catch(() => ({ usuarios: [] }));
    const elAlumno = alumnos?.[0];
    check("el alumno de prueba aparece en la búsqueda de usuarios", Boolean(elAlumno));

    if (elAlumno) {
      const rMatriculaDirecta = await fetch(`${BASE}/api/admin/matriculas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: sesionAdmin },
        body: JSON.stringify({ estudianteId: elAlumno.id, aulaId: aulaCreada.id }),
      });
      const cuerpoMatricula = await rMatriculaDirecta.json().catch(() => ({}));
      check(
        "POST /api/admin/matriculas matricula DIRECTO, sin código de acceso",
        rMatriculaDirecta.status === 201,
        `HTTP ${rMatriculaDirecta.status} · ${JSON.stringify(cuerpoMatricula)}`,
      );

      const rDuplicada = await fetch(`${BASE}/api/admin/matriculas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: sesionAdmin },
        body: JSON.stringify({ estudianteId: elAlumno.id, aulaId: aulaCreada.id }),
      });
      check("matricularlo OTRA VEZ en la misma aula: 409, no un duplicado silencioso", rDuplicada.status === 409, `HTTP ${rDuplicada.status}`);

      const rComoDocenteTitular = await fetch(`${BASE}/api/docente/aulas/${aulaCreada.id}`, { headers: { cookie: sesionDocente } });
      check(
        "y el docente titular asignado ya ve a ese alumno matriculado en SU aula",
        rComoDocenteTitular.status === 200,
        `HTTP ${rComoDocenteTitular.status}`,
      );
    }

    const rAulaInexistente = await fetch(`${BASE}/api/admin/matriculas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({ estudianteId: elAlumno?.id ?? "x", aulaId: "no-existe" }),
    });
    check("matricular en un aula que no existe: 404", rAulaInexistente.status === 404, `HTTP ${rAulaInexistente.status}`);

    const rDocenteComoAlumno = await fetch(`${BASE}/api/admin/usuarios?rol=DOCENTE`, { headers: { cookie: sesionAdmin } });
    const { usuarios: docentesParaRechazo } = await rDocenteComoAlumno.json().catch(() => ({ usuarios: [] }));
    const unDocenteCualquiera = docentesParaRechazo?.[0];
    if (unDocenteCualquiera) {
      const rMatricularDocente = await fetch(`${BASE}/api/admin/matriculas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: sesionAdmin },
        body: JSON.stringify({ estudianteId: unDocenteCualquiera.id, aulaId: aulaCreada.id }),
      });
      check(
        "matricular a una cuenta que NO es de alumno (p. ej. un docente): 409, no se cuela",
        rMatricularDocente.status === 409,
        `HTTP ${rMatricularDocente.status}`,
      );
    }
  }
}

// ── B.3 /docente/aulas ya no ofrece crear ────────────────────────────────────
console.log("\n · B.3 /docente/aulas es vista limpia (sin formulario de creación)");
if (sesionDocente) {
  const r = await fetch(`${BASE}/docente/aulas`, { headers: { cookie: sesionDocente } });
  const html = await r.text();
  check(
    "la pantalla del docente ya NO ofrece \"Crear nueva aula\"",
    !html.includes("Crear nueva aula"),
  );
  check(
    "…pero sigue mostrando sus aulas y el botón de actualizar",
    html.includes("Actualizar") || html.includes("Todavía no tienes ninguna aula asignada"),
  );
}

// ── B.4 /admin/aulas: alta sin "Docente titular", asignación en la tabla ────
console.log("\n · B.4 /admin/aulas desacopla alta de asignación");
if (sesionAdmin) {
  const r = await fetch(`${BASE}/admin/aulas`, { headers: { cookie: sesionAdmin } });
  const html = await r.text();
  check(
    "el formulario de alta ya NO pide \"Docente titular\"",
    !html.includes("Docente titular"),
  );
  check(
    "…pero la tabla sigue dejando asignarlo, con \"Sin asignar\" como opción",
    html.includes("Sin asignar"),
  );
}

salir();
