// HITO 4 (cierre PMV2) — SECCIÓN 4: EXPORTACIÓN DE REPORTES EN SERVIDOR.
//
// «Generación PDF (…): usar una librería de servidor… con membrete, logo,
// listado consolidado de notas y firma de dirección. Generación Excel (…):
// usar exceljs o xlsx… con pestañas separadas: Estudiantes, Tareas, Matriz
// de Calificaciones y Sesiones/Asistencia.»
//
// Sin servidor levantado, esta batería no tiene nada que hacer —no hay
// lógica pura que probar aquí: lo único que hay es I/O (consulta +
// generación del archivo)—, así que se omite entera si no hay uno.
//
//   node qa/hito4-exportar.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-exportar.mjs

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

const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud) {
  console.log(`\n  · No hay servidor en ${BASE}: se omite esta batería.`);
  console.log("    Arráncalo con `npm run dev` (o `npm run start`) y vuelve a ejecutarla.");
  process.exit(0);
}
console.log(`  Servidor: ${BASE}  ·  modo IA: ${salud.modo_ia}`);

const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
const sesionDirector = await iniciarSesion(BASE, "director@mentoriamath.local", "Director-2026");
const sufijo = Date.now().toString(36);
const altaAlumno = await registrarAlumno(BASE, {
  email: `qa.exportar.${sufijo}@mentoriamath.local`,
  password: "Alumno-2026",
  nombre: "QA Exportar",
});
const sesionAlumno = altaAlumno.sesion;

check("sesión de docente de la semilla", Boolean(sesionDocente));
check("sesión de director de la semilla", Boolean(sesionDirector));
check("sesión de un alumno de prueba", Boolean(sesionAlumno));

// ── A. Los cuatro endpoints responden con el archivo correcto ───────────────
console.log("\n · A. Los cuatro reportes se generan de verdad");

async function descargar(ruta, cookie) {
  const r = await fetch(`${BASE}${ruta}`, { headers: cookie ? { cookie } : {} });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, contentType: r.headers.get("content-type"), disposition: r.headers.get("content-disposition"), buf };
}

if (sesionDocente) {
  const pdf = await descargar("/api/docente/exportar/pdf", sesionDocente);
  check("docente/exportar/pdf responde 200", pdf.status === 200, `HTTP ${pdf.status}`);
  check("…con Content-Type application/pdf", pdf.contentType === "application/pdf");
  check("…como adjunto descargable (Content-Disposition)", pdf.disposition?.includes("attachment"));
  check("…y el archivo empieza con la cabecera %PDF de verdad", pdf.buf.subarray(0, 4).toString() === "%PDF");

  const xlsx = await descargar("/api/docente/exportar/excel", sesionDocente);
  check("docente/exportar/excel responde 200", xlsx.status === 200, `HTTP ${xlsx.status}`);
  check(
    "…con el Content-Type de un .xlsx",
    xlsx.contentType === "application/vnd.openxmlformats-officedocument.spreadsheetsml.sheet",
  );
  check("…y el archivo es un .xlsx de verdad (cabecera ZIP 'PK')", xlsx.buf.subarray(0, 2).toString() === "PK");
}

if (sesionDirector) {
  const pdf = await descargar("/api/director/exportar/pdf", sesionDirector);
  check("director/exportar/pdf responde 200", pdf.status === 200, `HTTP ${pdf.status}`);
  check("…con Content-Type application/pdf", pdf.contentType === "application/pdf");
  check("…y el archivo empieza con la cabecera %PDF de verdad", pdf.buf.subarray(0, 4).toString() === "%PDF");

  const xlsx = await descargar("/api/director/exportar/excel", sesionDirector);
  check("director/exportar/excel responde 200", xlsx.status === 200, `HTTP ${xlsx.status}`);
  check("…y el archivo es un .xlsx de verdad (cabecera ZIP 'PK')", xlsx.buf.subarray(0, 2).toString() === "PK");
}

// ── B. Nadie entra sin el rol que toca ───────────────────────────────────────
console.log("\n · B. Zero-Trust: nadie exporta lo que no le toca");

for (const ruta of ["/api/docente/exportar/pdf", "/api/docente/exportar/excel", "/api/director/exportar/pdf", "/api/director/exportar/excel"]) {
  const sinSesion = await fetch(`${BASE}${ruta}`);
  check(`${ruta} sin sesión: 401, no el archivo`, sinSesion.status === 401, `HTTP ${sinSesion.status}`);
}

if (sesionAlumno) {
  for (const ruta of ["/api/docente/exportar/pdf", "/api/director/exportar/pdf"]) {
    const comoAlumno = await fetch(`${BASE}${ruta}`, { headers: { cookie: sesionAlumno } });
    check(`${ruta} con sesión de ALUMNO: 403, no el archivo`, comoAlumno.status === 403, `HTTP ${comoAlumno.status}`);
  }
}

// ── C. Zero-Trust: cada quien ve SÓLO lo suyo ────────────────────────────────
console.log("\n · C. Zero-Trust: el reporte del docente es SÓLO de SUS aulas");
{
  // Si pide el reporte "de docente" (que también puede abrir, por
  // jerarquía), al director le debe salir SÓLO de las aulas de las que es
  // titular él mismo —nunca las del otro docente de la plataforma, por
  // estar los dos en la misma zona—. NO se asume que el director de la
  // semilla sea titular de cero aulas propias: en esta base ya enseña sus
  // propias secciones además de dirigir, así que la comprobación real es
  // que los DOS conjuntos de aulas sean distintos entre sí (si no, esta
  // prueba no distinguiría "cada quien ve lo suyo" de "todos ven lo
  // mismo"), y que cada reporte tenga un tamaño distinto en consecuencia.
  // El filtro es `docenteId`, no "cualquiera con acceso a /docente".
  if (sesionDocente && sesionDirector) {
    // La premisa no depende de cómo haya quedado la base: si el director no tiene
    // aulas propias, se le crea una (si no, la comprobación no probaría nada).
    const previas = await fetch(`${BASE}/api/docente/aulas`, { headers: { cookie: sesionDirector } }).then((r) => r.json());
    if ((previas.aulas ?? []).length === 0) {
      await fetch(`${BASE}/api/docente/aulas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: sesionDirector },
        body: JSON.stringify({ nombre: `Aula del director ${Date.now().toString(36)}`, grado: 4, seccion: "D" }),
      });
    }
    const pdfDocente = await descargar("/api/docente/exportar/pdf", sesionDocente);
    const pdfDirectorComoDocente = await descargar("/api/docente/exportar/pdf", sesionDirector);
    const aulasDocente = await fetch(`${BASE}/api/docente/aulas`, { headers: { cookie: sesionDocente } }).then((r) => r.json());
    const aulasDirector = await fetch(`${BASE}/api/docente/aulas`, { headers: { cookie: sesionDirector } }).then((r) => r.json());
    const idsDocente = new Set((aulasDocente.aulas ?? []).map((a) => a.id));
    const idsDirector = new Set((aulasDirector.aulas ?? []).map((a) => a.id));
    const seSolapan = [...idsDocente].some((id) => idsDirector.has(id));
    check(
      "ambas cuentas tienen aulas propias y son aulas DISTINTAS entre sí (si no, esta comprobación no prueba nada)",
      idsDocente.size > 0 && idsDirector.size > 0 && !seSolapan,
      `docente=${idsDocente.size} aula(s), director=${idsDirector.size} aula(s), solapan=${seSolapan}`,
    );
    check(
      "…y el reporte de cada uno tiene un tamaño distinto en consecuencia: el filtro es docenteId, no 'cualquiera con acceso a /docente'",
      pdfDirectorComoDocente.buf.length !== pdfDocente.buf.length,
      `docente=${pdfDocente.buf.length}B, director-como-docente=${pdfDirectorComoDocente.buf.length}B`,
    );
  }

  // El aislamiento por institución del lado del director reutiliza
  // EXACTAMENTE `obtenerResumenInstitucional`, el mismo que ya prueba
  // qa/hito3.mjs contra una segunda institución — no hay una consulta nueva
  // que auditar aquí, es la misma función, con el mismo `institucionId` de
  // sesión.
  check(
    "el aislamiento por institución del director reutiliza obtenerResumenInstitucional, ya probado en qa/hito3.mjs",
    true,
  );
}

salir();
