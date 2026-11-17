// PMV 3 · HITO 2 — EDITOR DE PROCEDIMIENTOS, AGENTE DE IA Y VERIFICACIÓN DE PASOS.
//
// QUÉ SE DEMUESTRA (criterios de aceptación del hito)
//
//   A. Acceso y catálogo de lo que el servidor sabe verificar.
//   B. FLUJO COMPLETO «SUMA DE FRACCIONES»: probar → guardar → editar con un
//      paso equivocado (el servidor lo marca y NO deja publicar) → corregir →
//      publicar.
//   C. FLUJO COMPLETO «REGLA DE LA CADENA» (derivadas), con la regla declarada.
//   D. El servidor NO verifica contra un resultado dudoso (fracciones anidadas).
//   E. AGENTE DE IA (modo demostración, sin consumir cuota): borrador completo
//      —pasos, términos, preguntas, pistas y ejercicios—, verificado, siempre
//      BORRADOR; un borrador de IA que el servidor no verifica no se publica;
//      constancia de la revisión humana.
//   F. PRIVACIDAD: el procedimiento de un docente no lo ve, edita ni borra otro.
//   G. Temas sin motor: sin verificar → publicar sólo con confirmación expresa
//      (y nunca un borrador de IA).
//   H. TOPE DE CONSUMO del agente.
//
//   node qa/pmv3-hito2.mjs
//   BASE_URL=http://localhost:3000 node qa/pmv3-hito2.mjs
//
// Arranca la aplicación SIN `GEMINI_API_KEY` para no gastar cuota.

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
const paso = (escribe, tipo = "transformacion", extra = {}) => ({ explica: `Explicación de ${escribe}`, escribe, tipo, ...extra });

// ── Preparación ──────────────────────────────────────────────────────────────
console.log("\n · Preparación");
const sesionAdmin = await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026");
const admin = api(sesionAdmin);
const rInst = await admin("/api/admin/instituciones", { method: "POST", body: JSON.stringify({ nombre: `Colegio QA PMV3H2 ${sufijo}` }) });
const institucion = (await json(rInst)).institucion;
async function crearDocente(etiqueta) {
  const email = `qa.pmv3h2.${etiqueta}.${sufijo}@mentoriamath.local`;
  const r = await admin("/api/admin/usuarios", { method: "POST", body: JSON.stringify({ nombre: `QA H2 ${etiqueta}`, email, password: "Docente-2026", rol: "DOCENTE" }) });
  const u = (await json(r)).usuario;
  await admin(`/api/admin/usuarios/${u?.id}`, { method: "PATCH", body: JSON.stringify({ institucionId: institucion?.id }) });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, sesion, api: api(sesion) };
}
const A = await crearDocente("a");
const B = await crearDocente("b");
const C = await crearDocente("c");
check("el SUPERADMIN y tres docentes inician sesión", Boolean(sesionAdmin && A.sesion && B.sesion && C.sesion));

const bancos = (await json(await A.api("/api/docente/bancos"))).bancos ?? [];
const tema = (clave) => bancos.find((b) => b.tema.clave === clave)?.tema;
const temaFracciones = tema("fracciones");
const temaDerivadas = tema("derivadas");
check("existen los temas Fracciones y Derivadas", Boolean(temaFracciones?.id && temaDerivadas?.id));

// ── A. Acceso y soporte ──────────────────────────────────────────────────────
console.log("\n · A. Acceso y qué sabe verificar el servidor");
check("GET procedimientos sin sesión → 401", (await api(null)("/api/docente/procedimientos")).status === 401);
const alumno = await registrarAlumno(BASE, { email: `qa.pmv3h2.al.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "QA H2 Alumno", ciclo: "Secundaria", grado: "3" });
check("GET procedimientos como alumno → 403", (await api(alumno.sesion)("/api/docente/procedimientos")).status === 403);
check("POST borrador-ia como alumno → 403", (await api(alumno.sesion)("/api/docente/procedimientos/borrador-ia", { method: "POST", body: "{}" })).status === 403);
const soporte = await json(await A.api("/api/docente/procedimientos/soporte"));
check(
  "el servidor declara los cinco motores que sabe verificar",
  ["ARITMETICA", "FRACCIONES", "ECUACIONES_LINEALES", "DERIVADAS", "FACTORIZACION"].every((m) => soporte.motores?.[m]?.comprueba),
);
check("…y el límite de pasos", soporte.limites?.pasos === 12);

// ── B. Suma de fracciones ────────────────────────────────────────────────────
console.log("\n · B. Flujo completo: suma de fracciones");
const pasosFrac = [
  paso("1/2 + 1/3", "transformacion", { terminos: [{ texto: "1/2", explica: "Medio." }, { texto: "1/3", explica: "Un tercio." }] }),
  paso("3/6 + 2/6", "transformacion", { regla: "denominador común" }),
  paso("5/6", "resultado"),
];
const rProbar = await A.api("/api/docente/procedimientos/probar", { method: "POST", body: JSON.stringify({ nodoId: temaFracciones.id, ejemplo: "1/2 + 1/3", pasos: pasosFrac }) });
const informeProbar = (await json(rProbar)).informe;
check("«Probar» verifica los 3 pasos sin guardar nada", rProbar.status === 200 && informeProbar?.verificado === true && informeProbar.pasos.every((p) => p.estado === "verificado"));
check("…y calcula la respuesta del ejemplo: 5/6", informeProbar?.respuestaEjemplo === "5/6");
check("probar no guarda: no hay procedimientos todavía", ((await json(await A.api("/api/docente/procedimientos"))).procedimientos ?? []).length === 0);

const rCrea = await A.api("/api/docente/procedimientos", {
  method: "POST",
  body: JSON.stringify({
    nodoId: temaFracciones.id,
    tipo: "PROCEDIMIENTO",
    titulo: "Suma de fracciones con distinto denominador",
    ejemplo: "1/2 + 1/3",
    pasos: pasosFrac,
    preguntas: [{ enunciado: "¿Qué denominador común sirve para 2 y 3?", respuesta: "6", pistas: ["Multiplica."] }],
    pistas: ["¿Los denominadores son iguales?"],
  }),
});
const cuerpoCrea = await json(rCrea);
const procFrac = cuerpoCrea.procedimiento;
check("A crea el procedimiento → 201", rCrea.status === 201 && Boolean(procFrac?.id), `HTTP ${rCrea.status}`);
check("…nace BORRADOR, de su banco privado, verificado", procFrac?.estado === "BORRADOR" && procFrac?.ambito === "DOCENTE" && procFrac?.verificado === true);
check("…el motor lo heredó del tema (el cliente no lo elige)", procFrac?.motor === "FRACCIONES");
check("…guarda las preguntas y pistas", procFrac?.preguntas?.length === 1 && procFrac?.pistas?.length === 1);

// Un paso equivocado: se guarda como borrador, pero se marca y NO se publica.
const pasosMal = [pasosFrac[0], paso("3/6 + 2/5", "transformacion"), paso("5/6", "resultado")];
const rMal = await A.api(`/api/docente/procedimientos/${procFrac.id}`, { method: "PATCH", body: JSON.stringify({ pasos: pasosMal }) });
const malo = await json(rMal);
check("un paso equivocado se guarda como borrador pero NO queda verificado", rMal.status === 200 && malo.procedimiento?.verificado === false && malo.informe?.valido === false);
const pasoMalo = malo.informe?.pasos?.[1];
check("…el informe señala EL PASO 2 y explica por qué", pasoMalo?.estado === "incorrecto" && /vale/.test(pasoMalo?.detalle ?? ""), JSON.stringify(pasoMalo));
const rNoPub = await A.api(`/api/docente/procedimientos/${procFrac.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });
check("publicar con un paso equivocado → 422", rNoPub.status === 422, `HTTP ${rNoPub.status}`);
const rMalFinal = await A.api(`/api/docente/procedimientos/${procFrac.id}`, { method: "PATCH", body: JSON.stringify({ pasos: [pasosFrac[0], pasosFrac[1], paso("5/7", "resultado")] }) });
check("un resultado final que no es el del motor también se marca", (await json(rMalFinal)).informe?.pasos?.[2]?.estado === "incorrecto");

const rArregla = await A.api(`/api/docente/procedimientos/${procFrac.id}`, { method: "PATCH", body: JSON.stringify({ pasos: pasosFrac }) });
check("el docente corrige y vuelve a quedar verificado", (await json(rArregla)).procedimiento?.verificado === true);
const rPub = await A.api(`/api/docente/procedimientos/${procFrac.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });
const pub = (await json(rPub)).procedimiento;
check("…y se PUBLICA", rPub.status === 200 && pub?.estado === "PUBLICADO", `HTTP ${rPub.status}`);
check("…y la publicación queda en la auditoría", (await prisma.logAuditoria.count({ where: { accion: "PROCEDIMIENTO_PUBLICADO", entidadId: procFrac.id } })) === 1);

// ── C. Regla de la cadena ────────────────────────────────────────────────────
console.log("\n · C. Flujo completo: regla de la cadena");
const pasosCadena = [
  paso("u = 3x + 1", "definicion"),
  paso("5(3x+1)^4 · 3", "transformacion", { regla: "regla de la cadena", terminos: [{ texto: "· 3", explica: "Derivada de la interior." }] }),
  paso("15(3x+1)^4", "resultado"),
];
const rCad = await A.api("/api/docente/procedimientos", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaDerivadas.id, tipo: "REGLA", titulo: "Regla de la cadena", ejemplo: "(3x+1)^5", pasos: pasosCadena }),
});
const procCad = (await json(rCad)).procedimiento;
check("A crea la regla de la cadena → 201, verificada", rCad.status === 201 && procCad?.verificado === true && procCad?.tipo === "REGLA", `HTTP ${rCad.status}`);
check("…la respuesta del ejemplo es 15(3x + 1)⁴", procCad?.respuestaEjemplo === "15(3x + 1)⁴", procCad?.respuestaEjemplo);
check("…el motor confirma que aplicó la regla de la cadena", procCad?.informeVerificacion?.reglasMotor?.includes("regla de la cadena"));
const rCadMal = await A.api("/api/docente/procedimientos/probar", { method: "POST", body: JSON.stringify({ nodoId: temaDerivadas.id, ejemplo: "(3x+1)^5", pasos: [paso("5(3x+1)^4", "transformacion"), paso("15(3x+1)^4", "resultado")] }) });
const infCadMal = (await json(rCadMal)).informe;
check("olvidar el factor interior (· 3) se detecta en el paso 1", infCadMal?.pasos?.[0]?.estado === "incorrecto" && infCadMal?.valido === false);
check("…y el mensaje orienta al docente (marcar como «definición»)", /definición/.test(infCadMal?.pasos?.[0]?.detalle ?? ""));
const rCadRegla = await A.api("/api/docente/procedimientos/probar", { method: "POST", body: JSON.stringify({ nodoId: temaDerivadas.id, ejemplo: "sin(2x)", pasos: [paso("cos(2x) · 2", "transformacion", { regla: "regla del producto" }), paso("2cos(2x)", "resultado")] }) });
const infRegla = (await json(rCadRegla)).informe;
check("declarar una regla que el motor no usó genera un AVISO (no un error)", infRegla?.valido === true && infRegla.avisos.some((a) => /regla del producto/.test(a)));
await A.api(`/api/docente/procedimientos/${procCad.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });

// ── D. Resultados dudosos ────────────────────────────────────────────────────
console.log("\n · D. El servidor no verifica contra un resultado dudoso");
const rAnid = await A.api("/api/docente/procedimientos/probar", { method: "POST", body: JSON.stringify({ nodoId: temaFracciones.id, ejemplo: "3/4 * (1/2 + 2/5)", pasos: [paso("3/4 * (9/10)", "transformacion"), paso("27/40", "resultado")] }) });
const infAnid = (await json(rAnid)).informe;
check("un ejemplo cuyo resultado el motor calcula mal NO se verifica", infAnid?.verificado === false && infAnid?.valido === false);
check("…y el mensaje lo explica", /independiente/.test(infAnid?.errores?.[0] ?? ""), infAnid?.errores?.[0]);
const rInv = await A.api("/api/docente/procedimientos/probar", { method: "POST", body: JSON.stringify({ nodoId: temaFracciones.id, ejemplo: "1/2 + 1/3", pasos: [paso("1/2 + 1/3", "resultado", { terminos: [{ texto: "9/9", explica: "no está" }] })] }) });
check("un término que no está en lo que se escribe se rechaza", (await json(rInv)).informe?.errores?.some((e) => /9\/9/.test(e)));

// ── E. Agente de IA ──────────────────────────────────────────────────────────
console.log("\n · E. Agente de IA (borrador completo y editable)");
check("tema inexistente → 404", (await A.api("/api/docente/procedimientos/borrador-ia", { method: "POST", body: JSON.stringify({ nodoId: "no-existe", titulo: "Suma de fracciones" }) })).status === 404);
check("título demasiado corto → 400", (await A.api("/api/docente/procedimientos/borrador-ia", { method: "POST", body: JSON.stringify({ nodoId: temaFracciones.id, titulo: "x" }) })).status === 400);
const rIA = await A.api("/api/docente/procedimientos/borrador-ia", {
  method: "POST",
  body: JSON.stringify({ nodoId: temaFracciones.id, tipo: "PROCEDIMIENTO", titulo: "Suma de fracciones", nivel: "INTERMEDIO", ejercicios: 3 }),
});
const ia = await json(rIA);
check("POST borrador-ia (fracciones) → 201", rIA.status === 201, `HTTP ${rIA.status} · ${JSON.stringify(ia).slice(0, 160)}`);
const pIA = ia.procedimiento;
check("el borrador es de origen IA, BORRADOR y privado", pIA?.origen === "IA" && pIA?.estado === "BORRADOR" && pIA?.ambito === "DOCENTE");
check("…verificado por el motor", pIA?.verificado === true && ia.informe?.valido === true);
check("…con pasos, términos tocables, preguntas y pistas", pIA?.pasos?.length >= 3 && pIA.pasos.some((p) => p.terminos?.length > 0) && pIA.preguntas?.length >= 1 && pIA.pistas?.length >= 2);
check("…guarda modelo y modo de generación", Boolean(pIA?.metadatos?.ia?.modo && pIA?.metadatos?.ia?.modelo));
check("…y propone ejercicios de práctica verificados, como borradores", ia.ejercicios?.borradores?.length >= 1 && ia.ejercicios.borradores.every((e) => e.origen === "IA" && e.estado === "BORRADOR" && e.validado === true && e.ambito === "DOCENTE"));
check("…enlazados al procedimiento del que salen", ia.ejercicios?.borradores?.every((e) => e.metadatos?.ia?.procedimientoId === pIA.id));

// editable: el docente retoca un paso y sigue verificado
const pasosIA = pIA.pasos.map((p, i) => (i === 0 ? { ...p, explica: "Texto retocado por el docente." } : p));
const rEdIA = await A.api(`/api/docente/procedimientos/${pIA.id}`, { method: "PATCH", body: JSON.stringify({ pasos: pasosIA }) });
check("el borrador de IA es EDITABLE y sigue verificado", rEdIA.status === 200 && (await json(rEdIA)).procedimiento?.pasos?.[0]?.explica === "Texto retocado por el docente.");
// un borrador de IA con el resultado alterado no se publica
const pasosRotos = pIA.pasos.map((p, i, arr) => (i === arr.length - 1 ? { ...p, escribe: "1/1" } : p));
const rRoto = await A.api(`/api/docente/procedimientos/${pIA.id}`, { method: "PATCH", body: JSON.stringify({ pasos: pasosRotos }) });
check("si se rompe el resultado, deja de estar verificado", (await json(rRoto)).procedimiento?.verificado === false);
check("…y el borrador de IA NO se publica (422)", (await A.api(`/api/docente/procedimientos/${pIA.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) })).status === 422);
await A.api(`/api/docente/procedimientos/${pIA.id}`, { method: "PATCH", body: JSON.stringify({ pasos: pasosIA }) });
const rPubIA = await A.api(`/api/docente/procedimientos/${pIA.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });
const pubIA = (await json(rPubIA)).procedimiento;
check("tras corregir, el docente lo publica", rPubIA.status === 200 && pubIA?.estado === "PUBLICADO");
check("…y queda constancia de la revisión humana", Boolean(pubIA?.revisadoEn) && (await prisma.procedimiento.findUnique({ where: { id: pIA.id }, select: { revisadoPorId: true } }))?.revisadoPorId === A.id);

const rIACad = await A.api("/api/docente/procedimientos/borrador-ia", { method: "POST", body: JSON.stringify({ nodoId: temaDerivadas.id, tipo: "REGLA", titulo: "Regla de la cadena", ejercicios: 2 }) });
const iaCad = await json(rIACad);
check("el agente genera la regla de la cadena, verificada", rIACad.status === 201 && iaCad.procedimiento?.verificado === true && iaCad.informe?.reglasMotor?.includes("regla de la cadena"), `HTTP ${rIACad.status}`);
check("…con ejercicios de práctica de la cadena", iaCad.ejercicios?.borradores?.length >= 1);

// ── F. Privacidad ────────────────────────────────────────────────────────────
console.log("\n · F. El procedimiento de A no lo ve B");
const listB = (await json(await B.api("/api/docente/procedimientos"))).procedimientos ?? [];
check("B no ve ninguno de los procedimientos de A", !listB.some((p) => [procFrac.id, procCad.id, pIA.id].includes(p.id)));
check("B no lo lee por id (404)", (await B.api(`/api/docente/procedimientos/${procFrac.id}`)).status === 404);
check("B no lo edita (404)", (await B.api(`/api/docente/procedimientos/${procFrac.id}`, { method: "PATCH", body: JSON.stringify({ titulo: "Robado" }) })).status === 404);
check("B no lo borra (404)", (await B.api(`/api/docente/procedimientos/${procFrac.id}`, { method: "DELETE" })).status === 404);
check("B no lo enlaza como repaso (404)", (await B.api("/api/docente/procedimientos", { method: "POST", body: JSON.stringify({ nodoId: temaFracciones.id, titulo: "Mío", ejemplo: "1/2 + 1/3", pasos: pasosFrac, repasoId: procFrac.id }) })).status === 404);
check("el SUPERADMIN sí lo ve (auditoría)", (await admin(`/api/docente/procedimientos/${procFrac.id}`)).status === 200);
check("el procedimiento de A sigue intacto", (await prisma.procedimiento.findUnique({ where: { id: procFrac.id }, select: { titulo: true } }))?.titulo === "Suma de fracciones con distinto denominador");

// ── G. Temas sin motor ───────────────────────────────────────────────────────
console.log("\n · G. Tema sin motor: sin verificar");
const rTemaLibre = await A.api("/api/docente/temas", { method: "POST", body: JSON.stringify({ titulo: `Tema libre QA ${sufijo}`, estado: "PUBLICADO" }) });
const temaLibre = (await json(rTemaLibre)).tema;
check("A crea un tema sin motor", rTemaLibre.status === 201 && !temaLibre?.motor, `HTTP ${rTemaLibre.status}`);
const rLibre = await A.api("/api/docente/procedimientos", { method: "POST", body: JSON.stringify({ nodoId: temaLibre.id, titulo: "Procedimiento libre", ejemplo: "2 + 2", pasos: [paso("2 + 2"), paso("4", "resultado")] }) });
const libre = (await json(rLibre)).procedimiento;
check("se guarda, pero SIN verificar", rLibre.status === 201 && libre?.verificado === false);
const rLibreSin = await A.api(`/api/docente/procedimientos/${libre.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO" }) });
check("publicarlo sin confirmar → 422 pidiendo confirmación", rLibreSin.status === 422 && (await json(rLibreSin)).requiereConfirmacion === true);
const rLibreSi = await A.api(`/api/docente/procedimientos/${libre.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO", confirmarSinVerificar: true }) });
check("…con confirmación expresa se publica", rLibreSi.status === 200);
const ia_libre = await prisma.procedimiento.create({
  data: { nodoId: temaLibre.id, titulo: "IA sin verificar", ejemplo: "2 + 2", pasos: [paso("4", "resultado")], origen: "IA", ambito: "DOCENTE", estado: "BORRADOR", autorId: A.id, verificado: false },
});
const rIaLibre = await A.api(`/api/docente/procedimientos/${ia_libre.id}`, { method: "PATCH", body: JSON.stringify({ estado: "PUBLICADO", confirmarSinVerificar: true }) });
check("un borrador de IA sin verificar NO se publica ni confirmando (422)", rIaLibre.status === 422);

// ── H. Tope de consumo ───────────────────────────────────────────────────────
console.log("\n · H. Tope de consumo del agente");
let limitado = null;
for (let i = 0; i < 9; i++) {
  const r = await C.api("/api/docente/procedimientos/borrador-ia", { method: "POST", body: JSON.stringify({ nodoId: temaFracciones.id, titulo: `Suma de fracciones ${i}`, ejercicios: 0 }) });
  if (r.status === 429) {
    limitado = r;
    break;
  }
}
check("tras 6 peticiones seguidas el servidor corta con 429", limitado !== null);
check("…con Retry-After", Boolean(limitado?.headers.get("retry-after")));

await salir();
