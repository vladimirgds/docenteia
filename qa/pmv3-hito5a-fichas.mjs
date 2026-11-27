// PMV 3 · HITO 5A — AGENTE DE IA Y EDITOR DE FICHAS DE MÉTODO.
//
// Criterio de aceptación del Word: «Dos métodos publicados desde el panel, sin
// cambios de código ni nuevo despliegue. Primero, "Suma de fracciones". Segundo,
// la regla de la cadena aplicada a (3x^2+1)^4, con una pista si el alumno omite
// 6x. Luego, reutilizar el método con (5x^3-2)^2 y comprobar que el motor valida
// el nuevo ejercicio.»
//
// QUÉ SE DEMUESTRA
//   A. La ficha son DATOS, no código: intérprete de plantillas sin eval,
//      patrón de entrada, variables, condiciones y pasos (biblioteca pura).
//   B. El motor verifica la ficha en los ejemplos Y en casos generados; las
//      operaciones que no sabe comprobar quedan PENDIENTES.
//   C. API: crear → probar → editar (versiones) → aprobar → publicar → restaurar.
//   D. «Suma de fracciones» y la regla de la cadena publicadas desde la API.
//   E. REUTILIZAR el método con (5x^3-2)^2: el motor valida el ejercicio nuevo.
//   F. El alumno: ve la versión PUBLICADA, y si omite 6x recibe la pista de error.
//   G. Agente de IA (modo demostración): salida validada con Zod, borrador.
//   H. Privacidad, concurrencia, tope de consumo.
//
//   node --experimental-strip-types --no-warnings qa/pmv3-hito5a-fichas.mjs
//
// Arranca la aplicación SIN `GEMINI_API_KEY` para no gastar cuota.

import { PrismaClient } from "@prisma/client";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";
import { FICHA_REGLA_CADENA, FICHA_SUMA_FRACCIONES } from "../lib/docente/fichas-demo.ts";
import { generarFicha } from "../lib/docente/fichas-ia.ts";
import {
  ErrorDePlantilla,
  aplicarPatron,
  evaluarExpresion,
  fichaSchema,
  generarCasos,
  rellenar,
  resolverConFicha,
} from "../lib/docente/fichas-metodo.ts";
import { OPERACIONES_SOPORTADAS, revisarRespuesta, verificarFicha } from "../lib/docente/fichas-verificar.ts";

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
const lanza = (f) => {
  try {
    f();
    return null;
  } catch (e) {
    return e;
  }
};

// ── A. Biblioteca pura: la ficha es DATOS ────────────────────────────────────
console.log("\n · A. Plantillas, patrón y condiciones (sin ejecutar código)");
check("la aritmética de plantillas respeta la precedencia: 2+3*4^2 = 50", evaluarExpresion("2+3*4^2", {}) === 50);
check("…con variables y funciones: mcm(b,d) con b=4, d=6 → 12", evaluarExpresion("mcm(b, d)", { b: 4, d: 6 }) === 12);
check("…mcd(12, 18) = 6 y abs(-3) = 3", evaluarExpresion("mcd(12, 18)", {}) === 6 && evaluarExpresion("abs(-3)", {}) === 3);
check("…comparaciones y lógica: n >= 2 && b != d", evaluarExpresion("n >= 2 && b != d", { n: 4, b: 2, d: 3 }) === 1 && evaluarExpresion("n >= 2 && b != d", { n: 1, b: 2, d: 3 }) === 0);
check("una variable no declarada se rechaza con un mensaje claro", /no está declarada/.test(lanza(() => evaluarExpresion("z+1", {}))?.message ?? ""));
check("NO es eval: «process.exit(1)» y «constructor» no se ejecutan", lanza(() => evaluarExpresion("process.exit(1)", {})) instanceof ErrorDePlantilla && lanza(() => evaluarExpresion("constructor", {})) instanceof ErrorDePlantilla);
check("…ni caracteres raros: «a; b» y «a[0]»", lanza(() => evaluarExpresion("a; b", { a: 1, b: 2 })) instanceof ErrorDePlantilla && lanza(() => evaluarExpresion("a[0]", { a: 1 })) instanceof ErrorDePlantilla);
check("la división entre cero y los resultados enormes se rechazan", lanza(() => evaluarExpresion("1/0", {})) instanceof ErrorDePlantilla && lanza(() => evaluarExpresion("10^99", {})) instanceof ErrorDePlantilla);
check("rellenar: {+b} da el signo, {~a} omite el 1, ^1 desaparece", rellenar("({~a}x^{m}{+b})^{n}", { a: 1, m: 2, b: -3, n: 1 }) === "(x^2-3)");
check("rellenar exige un entero: {1/2} se rechaza", lanza(() => rellenar("{1/2}", {})) instanceof ErrorDePlantilla);

const cadena = fichaSchema.parse(FICHA_REGLA_CADENA);
const fracciones = fichaSchema.parse(FICHA_SUMA_FRACCIONES);
const m1 = aplicarPatron(cadena, "(3x^2+1)^4");
check("el patrón de la cadena encaja con (3x^2+1)^4 → a=3, m=2, b=1, n=4", m1.coincide && m1.variables.a === 3 && m1.variables.m === 2 && m1.variables.b === 1 && m1.variables.n === 4);
const m2 = aplicarPatron(cadena, "(5x^3-2)^2");
check("…y con (5x^3-2)^2 → a=5, m=3, b=-2, n=2", m2.coincide && m2.variables.a === 5 && m2.variables.b === -2 && m2.variables.n === 2);
check("…tolera espacios: ( 3x^2 + 1 ) ^ 4", aplicarPatron(cadena, "( 3x^2 + 1 ) ^ 4").coincide);
check("NO encaja con algo que no es de esa forma: sin(2x)", !aplicarPatron(cadena, "sin(2x)").coincide);
const cond = aplicarPatron(cadena, "(3x^2+1)^1");
check("las CONDICIONES cuentan: (3x^2+1)^1 encaja pero no cumple n >= 2", !cond.coincide && /n >= 2/.test(cond.motivo));
check("la variable calculada se resuelve: mcm(2,3) = 6 en 1/2 + 1/3", aplicarPatron(fracciones, "1/2 + 1/3").variables?.l === 6);
check("b != d: 1/3 + 1/3 no se trata con el método de distinto denominador", !aplicarPatron(fracciones, "1/3 + 1/3").coincide);
const pasosC = resolverConFicha(cadena, "(3x^2+1)^4").instancia.pasos.map((p) => p.escribe);
check("la ficha escribe los pasos de (3x^2+1)^4: u = 3x^2+1 · 4(3x^2+1)^3 · 6x · 24x(3x^2+1)^3", pasosC.join(" | ") === "u = 3x^2+1 | 4(3x^2+1)^3 · 6x | 24x(3x^2+1)^3", pasosC.join(" | "));
const pasosC2 = resolverConFicha(cadena, "(5x^3-2)^2").instancia.pasos.map((p) => p.escribe);
check("…y los de (5x^3-2)^2 con la misma ficha: 2(5x^3-2) · 15x^2 → 30x^2(5x^3-2)", pasosC2[1] === "2(5x^3-2) · 15x^2" && pasosC2[2] === "30x^2(5x^3-2)", pasosC2.join(" | "));
check("el servidor genera casos del patrón que cumplen las condiciones", generarCasos(cadena, 8).length === 8 && generarCasos(cadena, 8).every((c) => aplicarPatron(cadena, c.problema).coincide));
check("la ficha rota (esquema) la rechaza Zod con un mensaje por campo", !fichaSchema.safeParse({ titulo: "x" }).success);

// ── B. El motor verifica la ficha ────────────────────────────────────────────
console.log("\n · B. El motor verifica la ficha (ejemplos + casos generados) y marca lo pendiente");
const infFrac = verificarFicha({ motor: "FRACCIONES", ficha: fracciones });
check("«Suma de fracciones» queda VERIFICADA: ejemplos y casos generados", infFrac.valido && infFrac.verificada && infFrac.generados >= 6 && infFrac.casos.every((c) => c.estado === "verificado"), JSON.stringify(infFrac.errores));
const infCad = verificarFicha({ motor: "DERIVADAS", ficha: cadena });
check("«Regla de la cadena» queda VERIFICADA con (3x^2+1)^4, (5x^3-2)^2 y casos generados", infCad.verificada && infCad.casos.some((c) => c.problema === "(3x^2+1)^4" && c.estado === "verificado") && infCad.casos.some((c) => c.problema === "(5x^3-2)^2" && c.estado === "verificado"), JSON.stringify(infCad.errores));
check("el motor calcula lo mismo que la ficha: 24x(3x^2+1)^3", infCad.casos.find((c) => c.problema === "(3x^2+1)^4")?.resultado === "24x(3x^2+1)^3");

// Una ficha con un error de plantilla: el motor lo detecta en un caso concreto.
const rota = fichaSchema.parse({ ...FICHA_REGLA_CADENA, pasos: FICHA_REGLA_CADENA.pasos.map((p, i) => (i === 1 ? { ...p, escribe: "{n}({~a}x^{m}{+b})^{n-1}" } : p)) });
const infRota = verificarFicha({ motor: "DERIVADAS", ficha: rota });
check("una ficha que OLVIDA el factor interior NO se verifica: el motor lo señala", !infRota.valido && !infRota.verificada && infRota.errores.length > 0 && infRota.casos.some((c) => c.estado === "incorrecto"), JSON.stringify(infRota.errores).slice(0, 200));
const infEstructura = verificarFicha({ motor: "DERIVADAS", ficha: fichaSchema.parse({ ...FICHA_REGLA_CADENA, patron: "({~a}x^{m}{+z})^{n}" }) });
check("una variable del patrón sin declarar es un ERROR de estructura (no se prueba nada)", !infEstructura.valido && infEstructura.casos.length === 0 && /«\{z\}»|z/.test(infEstructura.errores[0] ?? ""));
const infSobra = verificarFicha({ motor: "DERIVADAS", ficha: fichaSchema.parse({ ...FICHA_REGLA_CADENA, variables: [...FICHA_REGLA_CADENA.variables, { nombre: "k", tipo: "entero" }] }) });
check("una variable que no sale del patrón es un error", !infSobra.valido && infSobra.errores.some((e) => /«k»/.test(e)));

// Operaciones y pendientes.
const conOpDesconocida = fichaSchema.parse({ ...FICHA_REGLA_CADENA, operaciones: ["cadena", "integral_por_partes"] });
const infOp = verificarFicha({ motor: "DERIVADAS", ficha: conOpDesconocida });
check("una operación que el motor no comprueba queda PENDIENTE (no es error)", infOp.valido && !infOp.verificada && infOp.pendientes.some((p) => p.codigo === "OPERACION_NO_SOPORTADA" && /integral_por_partes/.test(p.detalle)));
check("…y las que sí comprueba se marcan como soportadas", infOp.operaciones.find((o) => o.id === "cadena")?.soportada === true && infOp.operaciones.find((o) => o.id === "integral_por_partes")?.soportada === false);
const infSinMotor = verificarFicha({ motor: null, ficha: cadena });
check("sin motor TODO es pendiente (SIN_MOTOR) y la ficha no queda verificada", infSinMotor.valido && !infSinMotor.verificada && infSinMotor.pendientes.some((p) => p.codigo === "SIN_MOTOR"));
check("el catálogo declara las operaciones de los cinco motores", ["ARITMETICA", "FRACCIONES", "ECUACIONES_LINEALES", "DERIVADAS", "FACTORIZACION"].every((m) => Object.keys(OPERACIONES_SOPORTADAS[m]).length > 0));

// La pista de error por «omite el factor».
const r0 = revisarRespuesta(cadena, "(3x^2+1)^4", "24x(3x^2+1)^3");
check("la respuesta correcta se acepta (equivalencia, no texto)", r0.correcta === true && r0.pista === null);
check("…también escrita de otra forma: 4(3x^2+1)^3 · 6x", revisarRespuesta(cadena, "(3x^2+1)^4", "4(3x^2+1)^3*6x").correcta === true);
const r1 = revisarRespuesta(cadena, "(3x^2+1)^4", "4(3x^2+1)^3");
check("si OMITE 6x → pista de ERROR concreta (sobre la derivada interior)", r1.correcta === false && r1.pista?.tipo === "error" && /derivada de la función interior/.test(r1.pista.texto));
check("…y la pista NO revela la solución (ni «24x» ni «6x»)", !/24x|6x/.test(r1.pista?.texto ?? ""));
const r2 = revisarRespuesta(cadena, "(3x^2+1)^4", "12x(3x^2+1)^3");
check("otro error distinto → pista general, no la de «omite el factor»", r2.correcta === false && r2.pista?.tipo === "general");
check("las pistas generales avanzan con los intentos (suave → concreta)", revisarRespuesta(cadena, "(3x^2+1)^4", "x", 0).pista?.texto !== revisarRespuesta(cadena, "(3x^2+1)^4", "x", 2).pista?.texto);
check("el mismo método vale para otro problema: omitir 15x^2 en (5x^3-2)^2", revisarRespuesta(cadena, "(5x^3-2)^2", "2(5x^3-2)").pista?.tipo === "error");
check("un problema que no encaja → la ficha no se aplica", revisarRespuesta(cadena, "sin(2x)", "2cos(2x)").aplica === false);
const rExp = revisarRespuesta(cadena, "(3x^2+1)^4", "24x(3x^2+1)^4");
check("respuesta errónea típica (exponente sin bajar) → pista de error concreta", rExp.correcta === false && rExp.pista?.tipo === "error" && /exponente/.test(rExp.pista.texto));
check("…y la pista no revela la respuesta correcta", !/24x|\(3x\^2\+1\)\^3/.test(rExp.pista?.texto ?? ""));
check("…con otro problema, el mismo método: (5x^3-2)^2 con exponente sin bajar", revisarRespuesta(cadena, "(5x^3-2)^2", "30x^2(5x^3-2)^2").pista?.tipo === "error");
const malaErronea = { ...cadena, pistasDeError: [{ texto: "x", respuestaErronea: "{n*a*m}x^{m-1}({~a}x^{m}{+b})^{n-1}" }] };
check("una «respuesta errónea» que en realidad es la correcta se rechaza al verificar", verificarFicha({ motor: "DERIVADAS", ficha: malaErronea }).errores.some((e) => /en realidad la correcta/.test(e)));

// Agente de IA, modo demostración (sin clave) y con una respuesta de Gemini simulada.
const demo = await generarFicha({ tema: { titulo: "Derivadas", descripcion: null, motor: "DERIVADAS" }, titulo: "Regla de la cadena" }, { clave: "" });
const sinClave = process.env.GEMINI_API_KEY;
check("IA sin clave → modo demostración con la ficha de referencia", demo.modo === "demo" && demo.ficha?.patron === "({~a}x^{m}{+b})^{n}");
void sinClave;
const llamadas = [];
const gemini = async (_m, _c, prompt) => {
  llamadas.push(prompt);
  // 1.ª respuesta: JSON que NO cumple el esquema de Zod (falta el patrón y los pasos). 2.ª: correcta.
  return llamadas.length === 1 ? JSON.stringify({ titulo: "Cadena", variables: [] }) : JSON.stringify(FICHA_REGLA_CADENA);
};
const reparada = await generarFicha({ tema: { titulo: "Derivadas", descripcion: null, motor: "DERIVADAS" }, titulo: "Regla de la cadena" }, { clave: "falsa", llamada: gemini });
check("Gemini devuelve algo que NO pasa Zod → se le devuelven los errores y corrige", reparada.reparaciones === 1 && reparada.ficha !== null && /patron|pasos/.test(llamadas[1] ?? ""), `${reparada.reparaciones}`);
const llamadasMal = [];
const geminiMal = async () => (llamadasMal.push(1), JSON.stringify({ titulo: "Mal" }));
const inutil = await generarFicha({ tema: { titulo: "Derivadas", descripcion: null, motor: "DERIVADAS" }, titulo: "Regla de la cadena" }, { clave: "falsa", llamada: geminiMal });
check("si tras 2 correcciones sigue sin cumplir Zod → no hay ficha (nunca se guarda basura)", inutil.ficha === null && inutil.errores.length > 0 && llamadasMal.length === 3);
const llamadasM = [];
const geminiMotor = async () => (llamadasM.push(1), JSON.stringify(llamadasM.length === 1 ? { ...FICHA_REGLA_CADENA, pasos: [FICHA_REGLA_CADENA.pasos[0], { ...FICHA_REGLA_CADENA.pasos[1], escribe: "{n}({~a}x^{m}{+b})^{n-1}" }, FICHA_REGLA_CADENA.pasos[2]] } : FICHA_REGLA_CADENA));
const conMotor = await generarFicha(
  { tema: { titulo: "Derivadas", descripcion: null, motor: "DERIVADAS" }, titulo: "Regla de la cadena" },
  { clave: "falsa", llamada: geminiMotor, revisar: (f) => verificarFicha({ motor: "DERIVADAS", ficha: f }, { generados: 3 }).errores },
);
check("Gemini propone una ficha que el MOTOR rechaza → corrige con el informe del motor", conMotor.reparaciones === 1 && verificarFicha({ motor: "DERIVADAS", ficha: conMotor.ficha }).verificada);

// ── C. API ───────────────────────────────────────────────────────────────────
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
const sesionAdmin = await iniciarSesion(BASE, process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local", process.env.SEED_ADMIN_PASSWORD || "Admin-2026");
const admin = api(sesionAdmin);
const institucion = (await json(await post(admin, "/api/admin/instituciones", { nombre: `Colegio H5A ${sufijo}` }))).institucion;
async function crearDocente(etiqueta) {
  const email = `qa.h5a.${etiqueta}.${sufijo}@mentoriamath.local`;
  const r = await post(admin, "/api/admin/usuarios", { nombre: `QA H5A ${etiqueta}`, email, password: "Docente-2026", rol: "DOCENTE" });
  const u = (await json(r)).usuario;
  await patch(admin, `/api/admin/usuarios/${u?.id}`, { institucionId: institucion?.id });
  const sesion = await iniciarSesion(BASE, email, "Docente-2026");
  return { id: u?.id, sesion, api: api(sesion) };
}
const A = await crearDocente("a");
const B = await crearDocente("b");
const C = await crearDocente("c");
check("el SUPERADMIN y tres docentes inician sesión", Boolean(sesionAdmin && A.sesion && B.sesion && C.sesion));
const bancos = (await json(await A.api("/api/docente/bancos"))).bancos ?? [];
const tema = (clave) => bancos.find((b) => b.tema.clave === clave)?.tema;
const tFrac = tema("fracciones");
const tDer = tema("derivadas");
check("existen los temas Fracciones y Derivadas", Boolean(tFrac?.id && tDer?.id));

console.log("\n · C. Acceso");
const alumno = await registrarAlumno(BASE, { email: `qa.h5a.al.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "QA H5A Alumno", ciclo: "Secundaria", grado: "3" });
check("GET fichas sin sesión → 401", (await api(null)("/api/docente/fichas-metodo")).status === 401);
check("GET fichas como alumno → 403", (await api(alumno.sesion)("/api/docente/fichas-metodo")).status === 403);
check("POST borrador-ia como alumno → 403", (await post(api(alumno.sesion), "/api/docente/fichas-metodo/borrador-ia", {})).status === 403);
const catalogo = await json(await A.api("/api/docente/fichas-metodo/probar"));
check("el editor puede pedir el catálogo de operaciones que el motor comprueba", Array.isArray(Object.keys(catalogo.operaciones?.DERIVADAS ?? {})) && "cadena" in (catalogo.operaciones?.DERIVADAS ?? {}));

// ── D. «Suma de fracciones» desde el panel ───────────────────────────────────
console.log("\n · D. «Suma de fracciones»: probar → guardar → editar → aprobar → publicar");
const pr = await json(await post(A.api, "/api/docente/fichas-metodo/probar", { nodoId: tFrac.id, ficha: FICHA_SUMA_FRACCIONES }));
check("«Probar» verifica la ficha SIN guardarla (ejemplos + casos generados)", pr.informe?.verificada === true && pr.informe?.generados >= 6);
check("…no queda nada guardado", (await prisma.fichaMetodo.count({ where: { autorId: A.id } })) === 0);
const rc = await post(A.api, "/api/docente/fichas-metodo", { nodoId: tFrac.id, ficha: FICHA_SUMA_FRACCIONES });
const fc = await json(rc);
check("guardar → 201, BORRADOR, versión 1, verificada por el motor", rc.status === 201 && fc.ficha?.estado === "BORRADOR" && fc.ficha?.version === 1 && fc.ficha?.verificada === true && fc.ficha?.publicadaVersion === null, JSON.stringify(fc).slice(0, 200));
check("el motor se hereda del tema (el cliente no lo elige)", fc.ficha?.motor === "FRACCIONES");
const idF = fc.ficha?.id;
check("la versión 1 queda en el historial", (await prisma.fichaMetodoVersion.count({ where: { fichaId: idF, version: 1 } })) === 1);

const sinAprobar = await patch(A.api, `/api/docente/fichas-metodo/${idF}`, { estado: "PUBLICADO" });
check("publicar SIN aprobación expresa → 422", sinAprobar.status === 422 && (await json(sinAprobar)).requiereAprobacion === true);

// Editar con un error de plantilla: se guarda (no se pierde el trabajo), pero no se publica.
const pasosRotos = FICHA_SUMA_FRACCIONES.pasos.map((p, i) => (i === 2 ? { ...p, escribe: "{s}/{b}" } : p));
const rEd = await patch(A.api, `/api/docente/fichas-metodo/${idF}`, { ficha: { ...FICHA_SUMA_FRACCIONES, pasos: pasosRotos }, nota: "probando un paso mal" });
const jEd = await json(rEd);
check("editar con un paso que el motor da por MAL: se guarda, versión 2, NO verificada", rEd.status === 200 && jEd.ficha?.version === 2 && jEd.ficha?.verificada === false && jEd.informe?.errores?.length > 0);
const noPub = await patch(A.api, `/api/docente/fichas-metodo/${idF}`, { estado: "PUBLICADO", aprobar: true });
check("…y aunque se apruebe, con errores NO se publica (422)", noPub.status === 422 && !(await json(noPub)).ficha);
// Corregir y publicar.
const rFix = await patch(A.api, `/api/docente/fichas-metodo/${idF}`, { ficha: FICHA_SUMA_FRACCIONES, nota: "corregido" });
check("corregir → versión 3, verificada otra vez", (await json(rFix)).ficha?.version === 3);
const rPub = await patch(A.api, `/api/docente/fichas-metodo/${idF}`, { estado: "PUBLICADO", aprobar: true });
const jPub = await json(rPub);
check("aprobar y publicar → PUBLICADO en la versión 3, con quién aprobó", rPub.status === 200 && jPub.ficha?.estado === "PUBLICADO" && jPub.ficha?.publicadaVersion === 3 && Boolean(jPub.ficha?.aprobadaEn));
check("la publicación queda en la auditoría", (await prisma.logAuditoria.count({ where: { accion: "FICHA_METODO_PUBLICADA", entidadId: idF } })) === 1);
const hist = await json(await A.api(`/api/docente/fichas-metodo/${idF}/versiones`));
check("el historial tiene las 3 versiones y marca la publicada", hist.versiones?.length === 3 && hist.publicada === 3 && hist.actual === 3);
const v1 = await json(await A.api(`/api/docente/fichas-metodo/${idF}/versiones?version=1`));
check("se puede ver el contenido de cualquier versión", v1.version?.contenido?.patron === "{a}/{b} + {c}/{d}");

// ── Alumno ───────────────────────────────────────────────────────────────────
console.log("\n · F. El alumno ve lo PUBLICADO (y sólo lo de sus docentes)");
const aula = (await json(await post(A.api, "/api/docente/aulas", { nombre: `Aula H5A ${sufijo}`, grado: 3, seccion: "A" }))).aula;
const alumnoOtro = await registrarAlumno(BASE, { email: `qa.h5a.al2.${sufijo}@mentoriamath.local`, password: "Alumno-2026", nombre: "QA H5A Otro", ciclo: "Secundaria", grado: "3" });
const antes = await json(await api(alumno.sesion)("/api/estudiante/fichas-metodo"));
check("un alumno que no está en el aula NO ve la ficha privada del docente", !(antes.fichas ?? []).some((f) => f.id === idF));
check("…ni puede comprobar con ella (404)", (await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idF}/comprobar`, { problema: "1/2 + 1/3", respuesta: "5/6" })).status === 404);
await post(api(alumno.sesion), "/api/estudiante/unirse", { codigoAcceso: aula.codigoAcceso });
const despues = await json(await api(alumno.sesion)("/api/estudiante/fichas-metodo"));
check("matriculado en el aula, ve la ficha publicada", (despues.fichas ?? []).some((f) => f.id === idF && f.version === 3));
const okFrac = await json(await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idF}/comprobar`, { problema: "1/2 + 1/3", respuesta: "5/6" }));
check("el alumno responde 5/6 → correcta", okFrac.aplica === true && okFrac.correcta === true);
const malFrac = await json(await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idF}/comprobar`, { problema: "1/2 + 1/3", respuesta: "2/5" }));
check("responde 2/5 → incorrecta, con pista general y SIN la respuesta correcta", malFrac.correcta === false && malFrac.pista?.tipo === "general" && !JSON.stringify(malFrac).includes("5/6") && malFrac.esperada === undefined);

// Una edición de un docente NO cambia lo que ve el alumno hasta que se vuelve a aprobar.
const edit2 = { ...FICHA_SUMA_FRACCIONES, pistas: ["PISTA NUEVA sin aprobar"] };
const jEd2 = await json(await patch(A.api, `/api/docente/fichas-metodo/${idF}`, { ficha: edit2 }));
check("editar una ficha publicada → versión 4, sigue PUBLICADA en la 3", jEd2.ficha?.version === 4 && jEd2.ficha?.publicadaVersion === 3 && jEd2.ficha?.estado === "PUBLICADO");
const sigue = await json(await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idF}/comprobar`, { problema: "1/2 + 1/3", respuesta: "2/5" }));
check("el alumno sigue viendo la versión 3 (la pista nueva no ha llegado)", sigue.version === 3 && !/PISTA NUEVA/.test(JSON.stringify(sigue)));
await patch(A.api, `/api/docente/fichas-metodo/${idF}`, { estado: "PUBLICADO", aprobar: true });
const ya = await json(await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idF}/comprobar`, { problema: "1/2 + 1/3", respuesta: "2/5" }));
check("…al aprobarla de nuevo, el alumno ve la versión 4", ya.version === 4 && /PISTA NUEVA/.test(ya.pista?.texto ?? ""));
const rest = await post(A.api, `/api/docente/fichas-metodo/${idF}/versiones`, { version: 1 });
const jRest = await json(rest);
check("restaurar la versión 1 CREA la versión 5 (no reescribe el pasado)", rest.status === 201 && jRest.ficha?.version === 5 && jRest.ficha?.contenido?.pistas?.[0] === FICHA_SUMA_FRACCIONES.pistas[0] && jRest.ficha?.publicadaVersion === 4);
check("…y se anota de dónde viene", (await prisma.fichaMetodoVersion.findUnique({ where: { fichaId_version: { fichaId: idF, version: 5 } } }))?.nota === "Restaurada de la versión 1");
check("restaurar una versión que no existe → 404", (await post(A.api, `/api/docente/fichas-metodo/${idF}/versiones`, { version: 99 })).status === 404);

// ── Regla de la cadena: por el agente de IA ──────────────────────────────────
console.log("\n · G. Regla de la cadena con el AGENTE DE IA (modo demostración) y publicación");
const rIA = await post(A.api, "/api/docente/fichas-metodo/borrador-ia", { nodoId: tDer.id, titulo: "Regla de la cadena", ejemplo: "(3x^2+1)^4" });
const jIA = await json(rIA);
check("el agente devuelve un BORRADOR marcado como de IA (nunca publicado)", rIA.status === 201 && jIA.ficha?.origen === "IA" && jIA.ficha?.estado === "BORRADOR" && jIA.modo === "demo", JSON.stringify(jIA).slice(0, 200));
check("…el servidor lo VERIFICÓ con el motor y no quedan casos pendientes", jIA.informe?.verificada === true && jIA.informe?.pendientes?.length === 0);
const idC = jIA.ficha?.id;
check("…con constancia de cómo se generó (modelo, modo, petición)", jIA.ficha?.metadatos?.ia?.peticion === "Regla de la cadena" && jIA.ficha?.metadatos?.ia?.modo === "demo");
const pubIA0 = await patch(A.api, `/api/docente/fichas-metodo/${idC}`, { estado: "PUBLICADO" });
check("un borrador de IA no se publica sin la aprobación del docente", pubIA0.status === 422);
const pubIA = await patch(A.api, `/api/docente/fichas-metodo/${idC}`, { estado: "PUBLICADO", aprobar: true });
const jPubIA = await json(pubIA);
check("el docente lo revisa y lo APRUEBA → publicado en el banco privado", pubIA.status === 200 && jPubIA.ficha?.estado === "PUBLICADO" && jPubIA.ficha?.ambito === "DOCENTE" && jPubIA.ficha?.publicadaVersion === 1);
const sinMotorIA = await post(A.api, "/api/docente/fichas-metodo/borrador-ia", { nodoId: tFrac.id, titulo: "Integrales por partes" });
check("el modo demostración no inventa lo que no sabe (422 con explicación)", sinMotorIA.status === 422 && /demostración/.test((await json(sinMotorIA)).error ?? ""));

// ── E. Reutilizar con (5x^3-2)^2 ─────────────────────────────────────────────
console.log("\n · E. REUTILIZAR el método: (5x^3-2)^2 sin tocar código");
const ap1 = await json(await post(A.api, `/api/docente/fichas-metodo/${idC}/aplicar`, { problema: "(3x^2+1)^4" }));
check("la ficha resuelve (3x^2+1)^4: 24x(3x^2+1)^3, verificado por el motor", ap1.resultado === "24x(3x^2+1)^3" && ap1.motor?.verificado === true);
const rAp = await post(A.api, `/api/docente/fichas-metodo/${idC}/aplicar`, { problema: "(5x^3-2)^2" });
const ap2 = await json(rAp);
check("aplicada a (5x^3-2)^2 → 30x^2(5x^3-2)", rAp.status === 200 && ap2.resultado === "30x^2(5x^3-2)", JSON.stringify(ap2).slice(0, 200));
check("…el MOTOR valida cada paso del ejercicio nuevo", ap2.motor?.verificado === true && ap2.motor?.pasos?.every((p) => p.estado === "verificado" || p.estado === "definicion") && ap2.motor?.errores?.length === 0);
check("…y el ejercicio (enunciado + respuesta) lo valida el validador del banco", ap2.ejercicio?.validado === true);
check("…con los pasos concretos de la pizarra: u = 5x^3-2 · 2(5x^3-2) · 15x^2 · 30x^2(5x^3-2)", ap2.pasos?.map((p) => p.escribe).join(" | ") === "u = 5x^3-2 | 2(5x^3-2) · 15x^2 | 30x^2(5x^3-2)");
check("aplicada a algo que no encaja → 422 con el motivo", (await post(A.api, `/api/docente/fichas-metodo/${idC}/aplicar`, { problema: "sin(2x)" })).status === 422);
const apGuarda = await json(await post(A.api, `/api/docente/fichas-metodo/${idC}/aplicar`, { problema: "(5x^3-2)^2", crearEjercicio: true }));
check("puede guardarlo como ejercicio BORRADOR en el banco privado (validado por el motor)", apGuarda.guardado?.guardados?.length === 1 && apGuarda.guardado.guardados[0].estado === "BORRADOR" && apGuarda.guardado.guardados[0].validado === true, JSON.stringify(apGuarda.guardado).slice(0, 160));

// El alumno omite 6x.
console.log("\n · F'. El alumno omite 6x y recibe la pista");
const alRegla = await json(await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idC}/comprobar`, { problema: "(3x^2+1)^4", respuesta: "4(3x^2+1)^3" }));
check("sin 6x → incorrecta con la PISTA DE ERROR sobre la derivada interior", alRegla.correcta === false && alRegla.pista?.tipo === "error" && /derivada de la función interior/.test(alRegla.pista.texto));
check("…y la respuesta de la API no contiene la solución", !/24x|6x/.test(JSON.stringify(alRegla)));
const alOk = await json(await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idC}/comprobar`, { problema: "(3x^2+1)^4", respuesta: "24x(3x^2+1)^3" }));
check("con 24x(3x^2+1)^3 → correcta", alOk.correcta === true);
const alNuevo = await json(await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idC}/comprobar`, { problema: "(5x^3-2)^2", respuesta: "2(5x^3-2)" }));
check("…y reutilizado: en (5x^3-2)^2, omitir 15x^2 da la misma pista de error", alNuevo.correcta === false && alNuevo.pista?.tipo === "error");
check("un problema que no encaja con el método → aplica: false", (await json(await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idC}/comprobar`, { problema: "sin(2x)", respuesta: "2cos(2x)" }))).aplica === false);
check("una petición sin respuesta → 400", (await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idC}/comprobar`, { problema: "(3x^2+1)^4" })).status === 400);
check("sin sesión → 401", (await post(api(null), `/api/estudiante/fichas-metodo/${idC}/comprobar`, { problema: "x", respuesta: "x" })).status === 401);

// ── Pendientes de validación automática ──────────────────────────────────────
console.log("\n · B'. Casos pendientes de validación automática");
const fPend = { ...FICHA_REGLA_CADENA, titulo: "Cadena con operación sin motor", operaciones: ["cadena", "integral_por_partes"] };
const rPend = await json(await post(A.api, "/api/docente/fichas-metodo", { nodoId: tDer.id, ficha: fPend }));
check("una ficha con una operación sin comprobar se guarda MARCADA como pendiente", rPend.ficha?.pendienteValidacion === true && rPend.ficha?.verificada === false && rPend.informe?.pendientes?.length === 1);
const pend1 = await patch(A.api, `/api/docente/fichas-metodo/${rPend.ficha.id}`, { estado: "PUBLICADO", aprobar: true });
const jPend1 = await json(pend1);
check("publicarla sin confirmar → 422 pidiendo confirmación expresa", pend1.status === 422 && jPend1.requiereConfirmacion === true && jPend1.informe?.pendientes?.length === 1);
const pend2 = await patch(A.api, `/api/docente/fichas-metodo/${rPend.ficha.id}`, { estado: "PUBLICADO", aprobar: true, confirmarPendientes: true });
check("…con la confirmación del docente SÍ se publica, y sigue marcada como pendiente", pend2.status === 200 && (await json(pend2)).ficha?.pendienteValidacion === true);
// Un borrador de IA con pendientes no se publica ni confirmándolo.
const rPendIA = await json(await post(A.api, "/api/docente/fichas-metodo", { nodoId: tDer.id, ficha: { ...fPend, titulo: "Cadena IA pendiente" } }));
await prisma.fichaMetodo.update({ where: { id: rPendIA.ficha.id }, data: { origen: "IA" } });
const pendIA = await patch(A.api, `/api/docente/fichas-metodo/${rPendIA.ficha.id}`, { estado: "PUBLICADO", aprobar: true, confirmarPendientes: true });
check("un borrador de IA con casos sin validar NO se publica (ni confirmándolo)", pendIA.status === 422 && (await json(pendIA)).requiereConfirmacion === false);
const temaSinMotor = await prisma.nodoConocimiento.findFirst({ where: { motor: null, institucionId: null } });
if (temaSinMotor) {
  const rSM = await json(await post(A.api, "/api/docente/fichas-metodo", { nodoId: temaSinMotor.id, ficha: FICHA_REGLA_CADENA }));
  check("en un tema SIN motor, todo es pendiente (SIN_MOTOR)", rSM.ficha?.motor === null && rSM.informe?.pendientes?.some((p) => p.codigo === "SIN_MOTOR"));
} else {
  check("(no hay tema sin motor en esta base: se omite)", true);
}

// ── Validación del formato ───────────────────────────────────────────────────
console.log("\n · Formato (Zod en el servidor)");
const mal1 = await post(A.api, "/api/docente/fichas-metodo", { nodoId: tFrac.id, ficha: { titulo: "x" } });
const jMal1 = await json(mal1);
check("una ficha incompleta → 400 con el detalle por campo", mal1.status === 400 && Boolean(jMal1.detalles));
check("un nombre de variable con símbolos → 400", (await post(A.api, "/api/docente/fichas-metodo", { nodoId: tFrac.id, ficha: { ...FICHA_SUMA_FRACCIONES, variables: [{ nombre: "a b; rm", tipo: "entero" }] } })).status === 400);
check("una expresión con código («process.exit») no se ejecuta: se guarda marcada con error", await (async () => {
  const r = await post(A.api, "/api/docente/fichas-metodo", { nodoId: tFrac.id, ficha: { ...FICHA_SUMA_FRACCIONES, titulo: "Con código", variables: FICHA_SUMA_FRACCIONES.variables.map((v) => (v.nombre === "l" ? { ...v, calculada: "process.exit(1)" } : v)) } });
  const j = await json(r);
  return r.status === 201 && j.ficha?.verificada === false && j.informe?.valido === false;
})());
check("el tema inexistente → 404", (await post(A.api, "/api/docente/fichas-metodo", { nodoId: "no-existe", ficha: FICHA_SUMA_FRACCIONES })).status === 404);

// ── H. Privacidad, concurrencia y consumo ────────────────────────────────────
console.log("\n · H. Privacidad, concurrencia y tope de consumo");
check("otro docente NO ve la ficha en el listado", !((await json(await B.api("/api/docente/fichas-metodo"))).fichas ?? []).some((f) => f.id === idF));
check("…ni la lee por id (404)", (await B.api(`/api/docente/fichas-metodo/${idF}`)).status === 404);
check("…ni la edita (404)", (await patch(B.api, `/api/docente/fichas-metodo/${idF}`, { estado: "ARCHIVADO" })).status === 404);
check("…ni la borra (404)", (await B.api(`/api/docente/fichas-metodo/${idF}`, { method: "DELETE" })).status === 404);
check("…ni la aplica (404)", (await post(B.api, `/api/docente/fichas-metodo/${idF}/aplicar`, { problema: "1/2 + 1/3" })).status === 404);
check("…ni ve sus versiones (404)", (await B.api(`/api/docente/fichas-metodo/${idF}/versiones`)).status === 404);
check("…ni la restaura (404)", (await post(B.api, `/api/docente/fichas-metodo/${idF}/versiones`, { version: 1 })).status === 404);
check("el SUPERADMIN sí la ve", (await admin(`/api/docente/fichas-metodo/${idF}`)).status === 200);
check("una ficha ya publicada no se borra (409): se archiva", (await A.api(`/api/docente/fichas-metodo/${idF}`, { method: "DELETE" })).status === 409);
const arch = await patch(A.api, `/api/docente/fichas-metodo/${idC}`, { estado: "ARCHIVADO" });
check("archivar la retira de los alumnos", arch.status === 200 && (await post(api(alumno.sesion), `/api/estudiante/fichas-metodo/${idC}/comprobar`, { problema: "(3x^2+1)^4", respuesta: "x" })).status === 404);
const alumnoAjeno = await json(await api(alumnoOtro.sesion)("/api/estudiante/fichas-metodo"));
check("un alumno sin aula con ese docente no ve ninguna ficha privada", (alumnoOtro.ok ? (alumnoAjeno.fichas ?? []) : []).length === 0);
const rBorr = await json(await post(A.api, "/api/docente/fichas-metodo", { nodoId: tFrac.id, ficha: { ...FICHA_SUMA_FRACCIONES, titulo: "Borrable" } }));
check("un borrador sin publicar sí se puede borrar", (await A.api(`/api/docente/fichas-metodo/${rBorr.ficha.id}`, { method: "DELETE" })).status === 200 && (await prisma.fichaMetodoVersion.count({ where: { fichaId: rBorr.ficha.id } })) === 0);

// Concurrencia: seis ediciones a la vez no se reparten el mismo número de versión.
const rConc = await json(await post(A.api, "/api/docente/fichas-metodo", { nodoId: tFrac.id, ficha: { ...FICHA_SUMA_FRACCIONES, titulo: "Concurrente" } }));
const idConc = rConc.ficha.id;
const respuestas = await Promise.all(
  [1, 2, 3, 4, 5, 6].map((i) => patch(A.api, `/api/docente/fichas-metodo/${idConc}`, { ficha: { ...FICHA_SUMA_FRACCIONES, titulo: "Concurrente", pistas: [`edición ${i}`] } })),
);
const versionesConc = (await prisma.fichaMetodoVersion.findMany({ where: { fichaId: idConc }, orderBy: { version: "asc" } })).map((v) => v.version);
check("6 ediciones simultáneas: sin errores 500 ni versiones duplicadas (1..7)", respuestas.every((r) => r.status === 200) && versionesConc.join(",") === "1,2,3,4,5,6,7", `${respuestas.map((r) => r.status)} ${versionesConc}`);
const finalConc = await prisma.fichaMetodo.findUnique({ where: { id: idConc } });
check("…y la ficha acaba en la versión 7 con el contenido de la última versión guardada", finalConc.version === 7 && JSON.stringify(finalConc.contenido) === JSON.stringify((await prisma.fichaMetodoVersion.findUnique({ where: { fichaId_version: { fichaId: idConc, version: 7 } } })).contenido));

// Tope de consumo del agente de IA.
let limitado = 0;
for (let i = 0; i < 8; i++) {
  const r = await post(C.api, "/api/docente/fichas-metodo/borrador-ia", { nodoId: tDer.id, titulo: `Regla de la cadena ${i}` });
  if (r.status === 429) limitado++;
}
check("el agente de IA tiene tope de consumo por usuario (429 tras 6 peticiones en 10 min)", limitado >= 2, `${limitado} de 8 limitadas`);

await salir();
