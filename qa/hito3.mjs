// ¿SE SOSTIENE EL HITO 3 (ARQUITECTURA MULTI-TENANT: COLEGIOS, AULAS Y TAREAS
// PROGRAMADAS)?
//
// «El sistema debe organizar la plataforma bajo una estructura jerárquica
// escolar: Institución → Aula (grado/sección) → Docente titular →
// Estudiantes, con matrícula por código y tareas con fecha de inicio, de
// vencimiento y límite de reintentos.»
//
// Cubre, en este orden:
//
//   A. Lo que no necesita servidor ni base de datos: el vocabulario cerrado
//      (zod), el generador del código de acceso, el estado de una tarea
//      (pendiente/entregada/vencida), cuándo se puede entregar o reintentar,
//      y el cálculo del resumen institucional —puro, con datos de mentira—.
//   B. El RBAC: la zona /director y a dónde aterriza cada rol.
//
// Y, si hay un servidor levantado con la base de datos sembrada, C: el ciclo
// completo por HTTP —crear un aula, matricular un alumno con su código,
// programar una tarea, entregarla, agotar los reintentos, ver el resumen del
// director— con las cuatro sesiones que la jerarquía necesita: docente,
// estudiante, director y un segundo docente para comprobar que un aula ajena
// sigue siendo ajena.
//
//   node qa/hito3.mjs
//   BASE_URL=http://localhost:3000 node qa/hito3.mjs

import {
  CANTIDAD_EJERCICIOS_MAX,
  CANTIDAD_EJERCICIOS_MIN,
  GRADO_MAX,
  GRADO_MIN,
  aulaSchema,
  entregaSchema,
  estadoDeTarea,
  puedeEntregar,
  tareaSchema,
  unirseSchema,
} from "../lib/docente/aulas.ts";
import { generarCodigoAcceso } from "../lib/docente/codigo-acceso.ts";
import { calcularResumen, tasaDeEntrega } from "../lib/director/resumen.ts";
import { INICIO_POR_ROL, ROLES, ZONAS, puedeAcceder } from "../lib/rbac.ts";

import { BASE_URL as BASE } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";

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
console.log(" HITO 3 — colegios, aulas y tareas programadas");
console.log("═══════════════════════════════════════════════════════════\n");

// ── A. Vocabulario, códigos y cálculos puros ─────────────────────────────────
console.log(" · A. Forma, validación y los cálculos que no tocan la base de datos");

// El código de acceso: seis hexadecimales en mayúsculas, como pidió el
// cliente (`crypto.randomBytes(3).toString('hex').toUpperCase()`).
{
  const codigos = Array.from({ length: 200 }, () => generarCodigoAcceso());
  check(
    "el código de acceso son seis hexadecimales en mayúsculas",
    codigos.every((c) => /^[0-9A-F]{6}$/.test(c)),
    codigos.find((c) => !/^[0-9A-F]{6}$/.test(c)) ?? "",
  );
  check(
    "doscientos códigos seguidos no se repiten (16.777.216 combinaciones)",
    new Set(codigos).size === codigos.length,
  );
}

// aulaSchema
{
  check("un aula válida pasa", aulaSchema.safeParse({ nombre: "3ro B", grado: 3, seccion: "B" }).success);
  check("un aula sin nombre no pasa", !aulaSchema.safeParse({ nombre: "", grado: 3, seccion: "B" }).success);
  check(
    `un grado por debajo de ${GRADO_MIN} no pasa`,
    !aulaSchema.safeParse({ nombre: "X", grado: GRADO_MIN - 1, seccion: "A" }).success,
  );
  check(
    `un grado por encima de ${GRADO_MAX} no pasa`,
    !aulaSchema.safeParse({ nombre: "X", grado: GRADO_MAX + 1, seccion: "A" }).success,
  );
  check("una sección vacía no pasa", !aulaSchema.safeParse({ nombre: "X", grado: 1, seccion: "" }).success);
  // El esquema NO admite institucionId: se agrega siempre desde la sesión,
  // nunca desde lo que mande el cliente (ver el comentario de `aulaSchema`).
  check(
    "el esquema no tiene campo institucionId que un cliente pueda rellenar",
    !("institucionId" in aulaSchema.shape),
  );
}

// unirseSchema: se normaliza igual que se genera —mayúsculas, sin espacios—.
{
  const parsed = unirseSchema.safeParse({ codigoAcceso: " a1b2c3 " });
  check("el código de unirse se normaliza a mayúsculas sin espacios", parsed.success && parsed.data.codigoAcceso === "A1B2C3");
  check("un código demasiado corto no pasa", !unirseSchema.safeParse({ codigoAcceso: "AB" }).success);
}

// tareaSchema: la regla de las dos fechas juntas.
{
  const base = {
    aulaId: "aula1",
    titulo: "Práctica 1",
    fechaInicio: "2026-01-01T00:00:00.000Z",
    fechaVencimiento: "2026-01-08T00:00:00.000Z",
  };
  check("una tarea con vencimiento posterior al inicio pasa", tareaSchema.safeParse(base).success);
  const invertida = { ...base, fechaInicio: base.fechaVencimiento, fechaVencimiento: base.fechaInicio };
  const rInvertida = tareaSchema.safeParse(invertida);
  check("una tarea con vencimiento ANTERIOR al inicio no pasa", !rInvertida.success);
  check(
    "…y el error señala el campo fechaVencimiento, no uno genérico",
    !rInvertida.success && rInvertida.error.issues[0]?.path.includes("fechaVencimiento"),
  );
  const iguales = { ...base, fechaVencimiento: base.fechaInicio };
  check("una tarea con las dos fechas IGUALES tampoco pasa (tiene que haber ventana)", !tareaSchema.safeParse(iguales).success);
  check(
    `cantidadEjercicios admite entre ${CANTIDAD_EJERCICIOS_MIN} y ${CANTIDAD_EJERCICIOS_MAX}`,
    tareaSchema.safeParse({ ...base, cantidadEjercicios: CANTIDAD_EJERCICIOS_MIN }).success &&
      tareaSchema.safeParse({ ...base, cantidadEjercicios: CANTIDAD_EJERCICIOS_MAX }).success &&
      !tareaSchema.safeParse({ ...base, cantidadEjercicios: CANTIDAD_EJERCICIOS_MAX + 1 }).success,
  );
  check("sin título no pasa", !tareaSchema.safeParse({ ...base, titulo: "" }).success);
}

check("entregaSchema admite un puntaje entre 0 y 100", entregaSchema.safeParse({ puntaje: 100 }).success && !entregaSchema.safeParse({ puntaje: 101 }).success);

// estadoDeTarea: pendiente / entregada / vencida.
{
  const ahora = new Date("2026-06-15T12:00:00.000Z");
  const futura = { fechaVencimiento: new Date("2026-06-20T00:00:00.000Z") };
  const pasada = { fechaVencimiento: new Date("2026-06-01T00:00:00.000Z") };
  check("sin entrega y con tiempo por delante, pendiente", estadoDeTarea(futura, null, ahora) === "pendiente");
  check("sin entrega y ya vencida, vencida", estadoDeTarea(pasada, null, ahora) === "vencida");
  check(
    "con entrega completa, entregada — aunque haya vencido mientras tanto",
    estadoDeTarea(pasada, { completada: true }, ahora) === "entregada",
  );
  check(
    "con un intento sin completar y tiempo por delante, sigue pendiente",
    estadoDeTarea(futura, { completada: false }, ahora) === "pendiente",
  );
}

// puedeEntregar: las tres puertas.
{
  const ahora = new Date("2026-06-15T12:00:00.000Z");
  const tarea = { fechaVencimiento: new Date("2026-06-20T00:00:00.000Z"), limiteReintentos: 2 };
  const vencida = { fechaVencimiento: new Date("2026-06-01T00:00:00.000Z"), limiteReintentos: 2 };
  check("sin entrega previa, se puede entregar", puedeEntregar(tarea, null, ahora) === null);
  check("tarea vencida, no se puede", puedeEntregar(vencida, null, ahora) !== null);
  check(
    "con limiteReintentos=2 (tope 3 intentos), al 3er intento usado ya no se puede",
    puedeEntregar(tarea, { intentosUsados: 3, completada: false }, ahora) !== null,
  );
  check(
    "…pero al 2º intento usado SÍ, todavía le queda uno",
    puedeEntregar(tarea, { intentosUsados: 2, completada: false }, ahora) === null,
  );
  check(
    "limiteReintentos=0 es SIN TOPE: muchos intentos usados y sigue pudiendo",
    puedeEntregar({ ...tarea, limiteReintentos: 0 }, { intentosUsados: 50, completada: false }, ahora) === null,
  );
  check(
    "una tarea ya completada no se puede volver a entregar",
    puedeEntregar(tarea, { intentosUsados: 1, completada: true }, ahora) !== null,
  );
}

// El resumen institucional: puro, con datos de mentira.
{
  const aulas = [
    { id: "a1", nombre: "A", grado: 1, seccion: "A", docenteNombre: "Ana", matriculas: 10, tareasCreadas: 2, entregasCompletadas: 15 },
    { id: "a2", nombre: "B", grado: 2, seccion: "B", docenteNombre: "Luis", matriculas: 0, tareasCreadas: 0, entregasCompletadas: 0 },
  ];
  check("la tasa de entrega de un aula con 10 alumnos y 2 tareas (20 esperadas) y 15 completas es 75%", tasaDeEntrega(aulas[0]) === 75);
  check("un aula sin alumnos ni tareas no tiene tasa (null, no 0%)", tasaDeEntrega(aulas[1]) === null);

  const resumen = calcularResumen(aulas, 3, 10);
  check("el resumen cuenta los docentes y alumnos tal como se le pasan", resumen.totalDocentes === 3 && resumen.totalAlumnos === 10);
  check("el resumen cuenta las aulas por su longitud", resumen.totalAulas === 2);
  check("cada fila del resumen trae su tasa ya calculada", resumen.aulas[0].tasaEntrega === 75 && resumen.aulas[1].tasaEntrega === null);
}

// ── B. RBAC: la zona del director ────────────────────────────────────────────
console.log("\n · B. La zona /director");

check("hay una zona /director en el RBAC", ZONAS.some((z) => z.prefijo === "/director"));
check("un director entra en /director", puedeAcceder("DIRECTOR", "/director"));
check("un superadmin entra en /director", puedeAcceder("SUPERADMIN", "/director"));
check("un docente NO entra en /director", !puedeAcceder("DOCENTE", "/director"));
check("un estudiante NO entra en /director", !puedeAcceder("ESTUDIANTE", "/director"));
check("el director sigue entrando en /docente (supervisión)", puedeAcceder("DIRECTOR", "/docente"));
check("el director ya aterriza en su propio panel", INICIO_POR_ROL.DIRECTOR === "/director");
check("todos los roles siguen teniendo página de inicio", ROLES.every((r) => Boolean(INICIO_POR_ROL[r])));

// ── C. El ciclo completo por HTTP (necesita servidor y base de datos) ───────
console.log("\n · C. Ciclo completo: aula, matrícula, tarea, entrega y resumen");

const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud) {
  console.log(`   · No hay servidor en ${BASE}: se omite el ciclo por HTTP.`);
  console.log("     Arráncalo con `npm run dev` y vuelve a ejecutar esta batería.");
} else if (salud.base_datos && salud.base_datos !== "ok") {
  console.log(`   · La base de datos responde "${salud.base_datos}": se omite el ciclo por HTTP.`);
  console.log("     Aplica las migraciones (`npm run db:deploy`) y siembra (`npm run db:seed`).");
} else {
  // Sin sesión, ninguna ruta nueva contesta con datos.
  for (const ruta of ["/api/docente/aulas", "/api/docente/tareas", "/api/estudiante/tareas", "/api/director/resumen"]) {
    const r = await fetch(`${BASE}${ruta}`, { redirect: "manual" });
    check(`${ruta} sin sesión no devuelve datos`, r.status === 401, `HTTP ${r.status}`);
  }

  const sesionDocente = await iniciarSesion(
    BASE,
    process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
    process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
  );
  check("el docente de la semilla puede iniciar sesión", Boolean(sesionDocente), "revisa que la semilla se haya ejecutado");

  if (sesionDocente) {
    const api = (ruta, opciones = {}) =>
      fetch(`${BASE}${ruta}`, {
        ...opciones,
        headers: { "Content-Type": "application/json", cookie: sesionDocente, ...(opciones.headers || {}) },
      });

    const sufijo = Date.now().toString(36);

    // 1. Crear un aula: el docente de la semilla ya tiene institución (ver
    //    prisma/seed.ts), así que esto no debe dar el 409 de "sin colegio".
    const rAula = await api("/api/docente/aulas", {
      method: "POST",
      body: JSON.stringify({ nombre: `3ro B QA ${sufijo}`, grado: 3, seccion: "B" }),
    });
    const aula = await rAula.json().catch(() => ({}));
    check("se crea el aula", rAula.status === 201 && Boolean(aula?.aula?.id), `HTTP ${rAula.status}`);
    const aulaId = aula?.aula?.id;
    const codigoAcceso = aula?.aula?.codigoAcceso;
    check("el aula creada trae su código de acceso", /^[0-9A-F]{6}$/.test(codigoAcceso ?? ""), codigoAcceso);

    // 1b. El grado y la sección no se inventan: el aula los devuelve tal como
    //     se pidieron.
    check(
      "el aula devuelve el grado y la sección pedidos",
      aula?.aula?.grado === 3 && aula?.aula?.seccion === "B",
    );

    // 2. Listarla
    const rListado = await api("/api/docente/aulas");
    const listado = await rListado.json().catch(() => ({}));
    check("el aula aparece en el listado del docente", (listado?.aulas ?? []).some((a) => a.id === aulaId));

    // 3. Un alumno se matricula con el código
    const alumno = await registrarAlumno(BASE, {
      email: `qa.hito3.${sufijo}@mentoriamath.local`,
      password: "Alumno-2026",
      nombre: "QA Hito3",
    });
    check("el alumno de prueba se registra", alumno.ok);

    const apiAlumno = (ruta, opciones = {}) =>
      fetch(`${BASE}${ruta}`, {
        ...opciones,
        headers: { "Content-Type": "application/json", cookie: alumno.sesion, ...(opciones.headers || {}) },
      });

    const rUnirse = await apiAlumno("/api/estudiante/unirse", {
      method: "POST",
      body: JSON.stringify({ codigoAcceso }),
    });
    check("el alumno se matricula con el código", rUnirse.status === 201, `HTTP ${rUnirse.status}`);

    const rUnirseOtraVez = await apiAlumno("/api/estudiante/unirse", {
      method: "POST",
      body: JSON.stringify({ codigoAcceso }),
    });
    check(
      "matricularse DOS VECES en la misma aula devuelve 409, no la duplica",
      rUnirseOtraVez.status === 409,
      `HTTP ${rUnirseOtraVez.status}`,
    );

    const rCodigoInexistente = await apiAlumno("/api/estudiante/unirse", {
      method: "POST",
      body: JSON.stringify({ codigoAcceso: "ZZZZZZ" }),
    });
    check("un código que no existe da 404, no un error genérico", rCodigoInexistente.status === 404, `HTTP ${rCodigoInexistente.status}`);

    // 4. Una fecha de vencimiento anterior al inicio no se guarda.
    const ahoraIso = new Date().toISOString();
    const ayerIso = new Date(Date.now() - 86_400_000).toISOString();
    const mananaIso = new Date(Date.now() + 86_400_000).toISOString();
    const rFechaMala = await api("/api/docente/tareas", {
      method: "POST",
      body: JSON.stringify({ aulaId, titulo: "Fecha mala", fechaInicio: ahoraIso, fechaVencimiento: ayerIso }),
    });
    check("una tarea con vencimiento anterior al inicio no se crea", rFechaMala.status === 400, `HTTP ${rFechaMala.status}`);

    // 5. Se programa una tarea de verdad, con dos reintentos.
    const rTarea = await api("/api/docente/tareas", {
      method: "POST",
      body: JSON.stringify({
        aulaId,
        titulo: `Práctica QA ${sufijo}`,
        fechaInicio: ahoraIso,
        fechaVencimiento: mananaIso,
        cantidadEjercicios: 5,
        limiteReintentos: 1,
      }),
    });
    const tarea = await rTarea.json().catch(() => ({}));
    check("se crea la tarea", rTarea.status === 201 && Boolean(tarea?.tarea?.id), `HTTP ${rTarea.status}`);
    const tareaId = tarea?.tarea?.id;

    // 6. El alumno la ve PENDIENTE en su listado.
    const rTareasAlumno = await apiAlumno("/api/estudiante/tareas");
    const tareasAlumno = await rTareasAlumno.json().catch(() => ({}));
    const laSuya = (tareasAlumno?.tareas ?? []).find((t) => t.id === tareaId);
    check("la tarea aparece en el listado del alumno, pendiente", laSuya?.estado === "pendiente", JSON.stringify(laSuya));

    // 7. Se entrega dos veces (1 + 1 reintento = tope 2) y la tercera se bloquea.
    const entregar = (cuerpo) => apiAlumno(`/api/estudiante/tareas/${tareaId}/entregar`, { method: "POST", body: JSON.stringify(cuerpo) });
    const rE1 = await entregar({ puntaje: 60, completada: false });
    check("1er intento se acepta", rE1.status === 200, `HTTP ${rE1.status}`);
    const rE2 = await entregar({ puntaje: 80, completada: true });
    check("2º intento (el reintento permitido) se acepta", rE2.status === 200, `HTTP ${rE2.status}`);
    const rE3 = await entregar({ puntaje: 90, completada: true });
    check("3er intento, sin reintentos que quedan, se bloquea con 409", rE3.status === 409, `HTTP ${rE3.status}`);

    const rTareasAlumno2 = await apiAlumno("/api/estudiante/tareas");
    const tras = (await rTareasAlumno2.json().catch(() => ({})))?.tareas?.find((t) => t.id === tareaId);
    check("tras completarla, el estado pasa a entregada", tras?.estado === "entregada", JSON.stringify(tras));
    check("el puntaje guardado es el del último intento aceptado (80, no 90)", tras?.puntaje === 80, String(tras?.puntaje));

    // 8. Un alumno sin matricular no puede entregar una tarea ajena.
    const ajeno = await registrarAlumno(BASE, {
      email: `qa.hito3.ajeno.${sufijo}@mentoriamath.local`,
      password: "Alumno-2026",
      nombre: "QA Ajeno",
    });
    const rAjeno = await fetch(`${BASE}/api/estudiante/tareas/${tareaId}/entregar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ajeno.sesion },
      body: JSON.stringify({ puntaje: 100, completada: true }),
    });
    check("un alumno NO matriculado no puede entregar esa tarea", rAjeno.status === 403, `HTTP ${rAjeno.status}`);

    // 9. Una tarea ya vencida se rechaza al entregar y se ve "vencida".
    const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString();
    const rTareaVencida = await api("/api/docente/tareas", {
      method: "POST",
      body: JSON.stringify({ aulaId, titulo: `Vencida QA ${sufijo}`, fechaInicio: ayerIso, fechaVencimiento: haceUnaHora }),
    });
    const tareaVencida = await rTareaVencida.json().catch(() => ({}));
    const rEntregaVencida = await apiAlumno(`/api/estudiante/tareas/${tareaVencida?.tarea?.id}/entregar`, {
      method: "POST",
      body: JSON.stringify({ puntaje: 50, completada: true }),
    });
    check("entregar una tarea ya vencida se bloquea con 409", rEntregaVencida.status === 409, `HTTP ${rEntregaVencida.status}`);

    const listaConVencida = await (await apiAlumno("/api/estudiante/tareas")).json().catch(() => ({}));
    const vistaVencida = (listaConVencida?.tareas ?? []).find((t) => t.id === tareaVencida?.tarea?.id);
    check("…y se etiqueta vencida en el listado del alumno", vistaVencida?.estado === "vencida", vistaVencida?.estado);

    // 10. El docente ve a sus alumnos desde la ficha del aula.
    const correoAlumno = `qa.hito3.${sufijo}@mentoriamath.local`;
    const rFicha = await api(`/api/docente/aulas/${aulaId}`);
    const ficha = await rFicha.json().catch(() => ({}));
    check(
      "la ficha del aula lista al alumno matriculado, con su nombre y correo",
      (ficha?.estudiantes ?? []).some((e) => e.email === correoAlumno && e.nombre === "QA Hito3"),
      JSON.stringify(ficha?.estudiantes?.map((e) => e.email)),
    );

    // 11. Un aula ajena sigue siendo ajena: un segundo docente no puede verla
    //     ni programarle tareas, aunque conozca su id.
    //
    // No hay alta pública de docentes (el pliego lo deja a la semilla/admin):
    // se reutiliza el DIRECTOR de la semilla, que SÍ puede llegar a
    // `exigirDocente` pero no es el titular de esta aula —es la comprobación
    // que importa: "titular", no "con permiso de crear aulas en general"—.
    const sesionDirector = await iniciarSesion(
      BASE,
      process.env.SEED_DIRECTOR_EMAIL || "director@mentoriamath.local",
      process.env.SEED_DIRECTOR_PASSWORD || "Director-2026",
    );
    check("el director de la semilla puede iniciar sesión", Boolean(sesionDirector));

    if (sesionDirector) {
      const apiDirectorComoDocente = (ruta, opciones = {}) =>
        fetch(`${BASE}${ruta}`, {
          ...opciones,
          headers: { "Content-Type": "application/json", cookie: sesionDirector, ...(opciones.headers || {}) },
        });

      const rFichaAjena = await apiDirectorComoDocente(`/api/docente/aulas/${aulaId}`);
      check("un no-titular no puede ver la ficha del aula de otro docente", rFichaAjena.status === 404, `HTTP ${rFichaAjena.status}`);

      const rTareaAjena = await apiDirectorComoDocente("/api/docente/tareas", {
        method: "POST",
        body: JSON.stringify({ aulaId, titulo: "Intrusa", fechaInicio: ahoraIso, fechaVencimiento: mananaIso }),
      });
      check("un no-titular no puede programar tareas en el aula de otro", rTareaAjena.status === 404, `HTTP ${rTareaAjena.status}`);
    }

    // 12. Un estudiante no puede crear aulas ni tareas (RBAC).
    const rEstudianteCreaAula = await apiAlumno("/api/docente/aulas", {
      method: "POST",
      body: JSON.stringify({ nombre: "X", grado: 1, seccion: "A" }),
    });
    check("un estudiante no puede crear aulas", rEstudianteCreaAula.status === 403, `HTTP ${rEstudianteCreaAula.status}`);

    // 13. El resumen del director: cifras que cuadran con lo que se acaba de hacer.
    if (sesionDirector) {
      const rResumen = await fetch(`${BASE}/api/director/resumen`, { headers: { cookie: sesionDirector } });
      const resumen = await rResumen.json().catch(() => ({}));
      check("el director ve el resumen de su colegio", rResumen.status === 200, `HTTP ${rResumen.status}`);
      const filaAula = (resumen?.resumen?.aulas ?? []).find((a) => a.id === aulaId);
      check("el aula creada aparece en el resumen del director", Boolean(filaAula), JSON.stringify(resumen?.resumen?.aulas?.map((a) => a.id)));
      check("…con el alumno matriculado contado", filaAula?.matriculas === 1, String(filaAula?.matriculas));

      // Un estudiante no puede ver el panel institucional.
      const rResumenAlumno = await fetch(`${BASE}/api/director/resumen`, { headers: { cookie: alumno.sesion } });
      check("un estudiante no puede ver el resumen institucional", rResumenAlumno.status === 403, `HTTP ${rResumenAlumno.status}`);
    }

    // 14. Un grado fuera de rango no se guarda, también por HTTP.
    const rGradoMalo = await api("/api/docente/aulas", {
      method: "POST",
      body: JSON.stringify({ nombre: "X", grado: GRADO_MAX + 1, seccion: "A" }),
    });
    check("un grado fuera de rango no se guarda", rGradoMalo.status === 400, `HTTP ${rGradoMalo.status}`);
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length > 0) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");

process.exit(fallos.length > 0 ? 1 : 0);
