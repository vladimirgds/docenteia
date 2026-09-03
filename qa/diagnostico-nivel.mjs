// ¿RECIBE CADA ALUMNO LA PRUEBA DE SU NIVEL?
//
// POR QUÉ EXISTE
// El cliente detectó el fallo de flujo: un alumno se registraba diciendo que
// estaba en 3.º de secundaria y la evaluación diagnóstica le presentaba
// DERIVADAS. El banco era uno solo —cinco preguntas, una por cada tema del
// motor— y se servía entero a todo el mundo, así que la prueba no medía su
// nivel: lo expulsaba.
//
// Aquí se fija el contrato que lo impide:
//
//   A. Del curso declarado sale un nivel de contenido.
//   B. La prueba se compone con el catálogo de ESE nivel y con los ejercicios
//      que el profesorado haya publicado para ese nivel.
//   C. El catálogo sembrado tiene preguntas suficientes en los tres niveles,
//      para que el diagnóstico funcione desde el primer despliegue.
//   D. Y, con servidor levantado: un alumno de 3.º de secundaria NO ve una sola
//      derivada, y uno de bachillerato sí.
//
//   node qa/diagnostico-nivel.mjs
//   BASE_URL=http://localhost:3000 node qa/diagnostico-nivel.mjs

import { readFileSync } from "node:fs";

import {
  ETAPAS,
  cubreAlAlumno,
  cursoDelPerfil,
  cursoValido,
  describirAlcance,
  describirCurso,
  etiquetaCurso,
  interpretarCursoEscrito,
  nivelDePartida,
  nivelSugerido,
} from "../lib/curriculo/etapas.ts";
import {
  componerDiagnostico,
  partirId,
  sirveParaDiagnostico,
  MAX_DEL_BANCO,
  PREGUNTAS_POR_DIAGNOSTICO,
} from "../lib/diagnostico/seleccion.ts";
import { adaptarBanco } from "../lib/diagnostico/banco.ts";
import { clasificarNivel } from "../lib/diagnostico/clasificar.ts";

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

console.log("");
console.log("═══════════════════════════════════════════════════════════");
console.log(" TAXONOMÍA CURRICULAR — etapa, curso y prueba diagnóstica");
console.log("═══════════════════════════════════════════════════════════");
console.log("");

// ── A. Los dos ejes ──────────────────────────────────────────────────────────
console.log(" · A. Etapa y curso frente a nivel de dificultad");

check("hay tres etapas", ETAPAS.length === 3);
check(
  "cada etapa declara sus cursos",
  ETAPAS.every((e) => e.cursos > 0 && e.unidad && e.nombre),
  ETAPAS.map((e) => `${e.nombre}:${e.cursos}`).join(" · "),
);
check("primaria llega a 6.º grado", cursoValido("PRIMARIA", 6) && !cursoValido("PRIMARIA", 7));
check("secundaria llega a 5.º año", cursoValido("SECUNDARIA", 5) && !cursoValido("SECUNDARIA", 6));
check("superior llega a 10.º ciclo", cursoValido("SUPERIOR", 10) && !cursoValido("SUPERIOR", 11));
check("el ordinal se escribe como se dice", etiquetaCurso("SECUNDARIA", 3) === "3.er Año", etiquetaCurso("SECUNDARIA", 3));
check("y con la unidad de su etapa", etiquetaCurso("SUPERIOR", 2) === "2.º Ciclo", etiquetaCurso("SUPERIOR", 2));
check(
  "el curso se describe entero",
  describirCurso("SECUNDARIA", 3) === "Secundaria · 3.er Año",
  describirCurso("SECUNDARIA", 3),
);

// EL ARREGLO DE FONDO: el alcance de un contenido frente al curso del alumno.
const DERIVADAS = { etapa: "SUPERIOR", cursoMin: 1 };
const FACTORIZACION = { etapa: "SECUNDARIA", cursoMin: 3 };
const TRANSVERSAL = { etapa: null, cursoMin: null };

const sec3 = { etapa: "SECUNDARIA", curso: 3 };
const sec1 = { etapa: "SECUNDARIA", curso: 1 };
const sup2 = { etapa: "SUPERIOR", curso: 2 };
const pri5 = { etapa: "PRIMARIA", curso: 5 };
const sinDeclarar = { etapa: null, curso: null };

check("a 3.º de secundaria NO le tocan las derivadas", !cubreAlAlumno(DERIVADAS, sec3));
check("ni a 1.º de secundaria", !cubreAlAlumno(DERIVADAS, sec1));
check("ni a 5.º de primaria", !cubreAlAlumno(DERIVADAS, pri5));
check("a un universitario SÍ", cubreAlAlumno(DERIVADAS, sup2));
check("a 3.º de secundaria sí le toca la factorización", cubreAlAlumno(FACTORIZACION, sec3));
check("a 1.º de secundaria todavía no", !cubreAlAlumno(FACTORIZACION, sec1));
check(
  "y un universitario también recibe lo de secundaria: lo tiene estudiado",
  cubreAlAlumno(FACTORIZACION, sup2),
);
check("lo transversal le llega a cualquiera", [sec3, sec1, sup2, pri5, sinDeclarar].every((a) => cubreAlAlumno(TRANSVERSAL, a)));
check(
  "quien no declara etapa sólo recibe lo transversal",
  !cubreAlAlumno(DERIVADAS, sinDeclarar) && !cubreAlAlumno(FACTORIZACION, sinDeclarar),
);
check(
  "el alcance se explica en castellano",
  describirAlcance(FACTORIZACION) === "Desde Secundaria · 3.er Año",
  describirAlcance(FACTORIZACION),
);

// El otro eje: la dificultad con la que se empieza a preguntar.
check("un alumno de primaria empieza en básico", nivelSugerido("PRIMARIA", 5) === "BASICO");
check("uno de 1.º de secundaria, también", nivelSugerido("SECUNDARIA", 1) === "BASICO");
check("uno de 3.º de secundaria, en intermedio", nivelSugerido("SECUNDARIA", 3) === "INTERMEDIO");
check("uno de superior, en avanzado", nivelSugerido("SUPERIOR", 1) === "AVANZADO");
check(
  "el nivel ya medido manda sobre el curso",
  nivelDePartida({ nivelActual: "BASICO", etapa: "SUPERIOR", curso: 3 }) === "BASICO",
);
check(
  "sin nivel medido, decide el curso",
  nivelDePartida({ nivelActual: null, etapa: "SECUNDARIA", curso: 4 }) === "INTERMEDIO",
);

// Las cuentas del PMV 1 traían el curso en texto libre.
for (const [ciclo, grado, etapa, curso] of [
  ["Secundaria", "3.º", "SECUNDARIA", 3],
  ["secundaria", "3º", "SECUNDARIA", 3],
  ["Secundaria", "tercero", "SECUNDARIA", 3],
  ["Primaria", "5º", "PRIMARIA", 5],
  ["Bachillerato", "2º", "SUPERIOR", 2],
  ["Universidad", "", "SUPERIOR", null],
]) {
  const leido = interpretarCursoEscrito(ciclo, grado);
  check(
    `"${ciclo} ${grado}".trim() se entiende como ${etapa}${curso ? " " + curso : ""}`,
    leido.etapa === etapa && leido.curso === curso,
    JSON.stringify(leido),
  );
}
check("un curso irreconocible no se inventa", interpretarCursoEscrito("", "").etapa === null);
check("un ordinal sin etapa tampoco", interpretarCursoEscrito("", "3º").etapa === null);
check(
  "el perfil nuevo manda sobre el texto heredado",
  cursoDelPerfil({ etapa: "SUPERIOR", curso: 1, ciclo: "Secundaria", grado: "3º" }).etapa === "SUPERIOR",
);

// ── B. Cómo se compone la prueba ─────────────────────────────────────────────
console.log("\n · B. Composición de la prueba");

const pregunta = (id, tema, nivel, orden, alcance = {}) => ({
  id,
  tema,
  nivel,
  etapa: alcance.etapa ?? null,
  cursoMin: alcance.cursoMin ?? null,
  enunciado: `¿Pregunta ${id}?`,
  expresion: null,
  opciones: [
    { id: "a", texto: "1" },
    { id: "b", texto: "2" },
  ],
  orden,
});

const ejercicio = (id, extra = {}) => ({
  id,
  enunciado: `2x = ${id}`,
  nivel: "INTERMEDIO",
  motor: "ECUACIONES_LINEALES",
  respuestaCorrecta: "4",
  plantilla: false,
  etapa: null,
  cursoMin: null,
  ...extra,
});

const catalogoIntermedio = [
  pregunta("c1", "ARITMETICA", "INTERMEDIO", 1),
  pregunta("c2", "FRACCIONES", "INTERMEDIO", 2),
  pregunta("c3", "ECUACIONES_LINEALES", "INTERMEDIO", 3),
  pregunta("c4", "FACTORIZACION", "INTERMEDIO", 4),
  pregunta("c5", "ARITMETICA", "INTERMEDIO", 5),
];

const soloCatalogo = componerDiagnostico({ catalogo: catalogoIntermedio, banco: [] });
check(
  "sin banco del docente, la prueba son las preguntas del catálogo",
  soloCatalogo.length === PREGUNTAS_POR_DIAGNOSTICO &&
    soloCatalogo.every((i) => i.origen === "catalogo"),
  `${soloCatalogo.length} items`,
);
check(
  "y todas son de opción múltiple",
  soloCatalogo.every((i) => i.tipo === "opcion_multiple" && (i.opciones ?? []).length === 2),
);

// El reparto por tema: lo que impide que la prueba mida un solo asunto.
const desordenado = [
  pregunta("f1", "FACTORIZACION", "AVANZADO", 1),
  pregunta("f2", "FACTORIZACION", "AVANZADO", 2),
  pregunta("d1", "DERIVADAS", "AVANZADO", 3),
  pregunta("d2", "DERIVADAS", "AVANZADO", 4),
  pregunta("l1", "ECUACIONES_LINEALES", "AVANZADO", 5),
];
const dosDeCinco = componerDiagnostico({
  catalogo: desordenado,
  banco: [ejercicio("e1"), ejercicio("e2"), ejercicio("e3")],
});
const temasDelCatalogo = dosDeCinco
  .filter((i) => i.origen === "catalogo")
  .map((i) => i.tema);
check(
  "cuando sólo caben dos preguntas del catálogo, son de temas distintos",
  new Set(temasDelCatalogo).size === temasDelCatalogo.length,
  temasDelCatalogo.join(", "),
);

const conBanco = componerDiagnostico({
  catalogo: catalogoIntermedio,
  banco: [ejercicio("e1"), ejercicio("e2"), ejercicio("e3"), ejercicio("e4"), ejercicio("e5")],
});
check("la prueba sigue teniendo cinco preguntas", conBanco.length === PREGUNTAS_POR_DIAGNOSTICO);
check(
  "el banco del docente entra en la prueba",
  conBanco.filter((i) => i.origen === "banco").length === MAX_DEL_BANCO,
  `${conBanco.filter((i) => i.origen === "banco").length} del banco`,
);
check(
  "pero no la copa entera: el catálogo calibrado sigue presente",
  conBanco.some((i) => i.origen === "catalogo"),
);
check(
  "las del banco son de respuesta abierta",
  conBanco.filter((i) => i.origen === "banco").every((i) => i.tipo === "respuesta_abierta"),
);
check(
  "el identificador dice de dónde sale cada pregunta",
  conBanco.every((i) => partirId(i.id)?.origen === i.origen),
);

// Lo que NO puede entrar en un diagnóstico.
check(
  "una plantilla con huecos no se le enseña a un alumno",
  !sirveParaDiagnostico(ejercicio("p1", { plantilla: true })),
);
check(
  "un ejercicio sin motor no entra: no se podría corregir",
  !sirveParaDiagnostico(ejercicio("p2", { motor: null })),
);
check(
  "ni uno sin respuesta guardada",
  !sirveParaDiagnostico(ejercicio("p3", { respuestaCorrecta: "" })),
);
check(
  "el filtro se aplica al componer",
  componerDiagnostico({
    catalogo: [],
    banco: [ejercicio("p1", { plantilla: true }), ejercicio("e1")],
  }).length === 1,
);

// Comodines: sólo cuando el nivel se queda corto.
const conComodines = componerDiagnostico({
  catalogo: [pregunta("c1", "ARITMETICA", "BASICO", 1)],
  banco: [],
  comodines: [
    pregunta("x1", "ARITMETICA", null, 90),
    pregunta("x2", "FRACCIONES", null, 91),
  ],
});
check(
  "si faltan preguntas del nivel, se completa con las transversales",
  conComodines.length === 3,
  `${conComodines.length} items`,
);
check(
  "los comodines no se usan cuando el nivel ya tiene preguntas suficientes",
  componerDiagnostico({
    catalogo: catalogoIntermedio,
    banco: [],
    comodines: [pregunta("x1", "ARITMETICA", null, 90)],
  }).every((i) => i.id !== "catalogo:x1"),
);

// ── C. El catálogo sembrado ──────────────────────────────────────────────────
console.log("\n · C. Preguntas sembradas por nivel");

const banco = adaptarBanco(
  JSON.parse(readFileSync(new URL("../prisma/seed-data/preguntas-diagnostico.json", import.meta.url), "utf8")),
);
const porNivel = new Map();
for (const p of banco) {
  const clave = p.nivel ?? "SIN_NIVEL";
  porNivel.set(clave, [...(porNivel.get(clave) ?? []), p]);
}

for (const nivel of ["BASICO", "INTERMEDIO", "AVANZADO"]) {
  const preguntas = porNivel.get(nivel) ?? [];
  check(
    `${nivel}: al menos 3 preguntas sembradas`,
    preguntas.length >= 3,
    `${preguntas.length} preguntas`,
  );
  check(
    `${nivel}: la prueba se puede completar entera`,
    preguntas.length >= PREGUNTAS_POR_DIAGNOSTICO,
    `${preguntas.length} de ${PREGUNTAS_POR_DIAGNOSTICO}`,
  );
  check(`${nivel}: pregunta por más de un tema`, new Set(preguntas.map((p) => p.tema)).size >= 2);
}

const basicas = porNivel.get("BASICO") ?? [];
check(
  "NINGUNA pregunta de nivel básico es de derivadas",
  basicas.every((p) => p.tema !== "DERIVADAS"),
  basicas.map((p) => p.tema).join(", "),
);
check(
  "ni de factorización",
  basicas.every((p) => p.tema !== "FACTORIZACION"),
);
const intermedias = porNivel.get("INTERMEDIO") ?? [];
check(
  "ninguna pregunta de nivel intermedio es de derivadas",
  intermedias.every((p) => p.tema !== "DERIVADAS"),
  intermedias.map((p) => p.tema).join(", "),
);
check(
  "las derivadas viven en el nivel avanzado",
  (porNivel.get("AVANZADO") ?? []).some((p) => p.tema === "DERIVADAS"),
);

// Y, sobre el otro eje: el catálogo declara PARA QUIÉN es cada pregunta.
check("toda pregunta declara su etapa", banco.every((p) => p.etapa));
check(
  "las derivadas están marcadas como Superior",
  banco.filter((p) => p.tema === "derivadas" || p.tema === "DERIVADAS").every((p) => p.etapa === "SUPERIOR"),
);
check(
  "hay preguntas de las tres etapas",
  new Set(banco.map((p) => p.etapa)).size === 3,
  [...new Set(banco.map((p) => p.etapa))].join(", "),
);
check(
  "un alumno de 3.º de secundaria tiene al menos cinco preguntas que le corresponden",
  banco.filter((p) => cubreAlAlumno(p, { etapa: "SECUNDARIA", curso: 3 })).length >= 5,
  String(banco.filter((p) => cubreAlAlumno(p, { etapa: "SECUNDARIA", curso: 3 })).length),
);
check(
  "y ninguna de ellas es de derivadas",
  banco
    .filter((p) => cubreAlAlumno(p, { etapa: "SECUNDARIA", curso: 3 }))
    .every((p) => p.tema !== "DERIVADAS"),
);
check(
  "un alumno de superior sí las tiene",
  banco
    .filter((p) => cubreAlAlumno(p, { etapa: "SUPERIOR", curso: 1 }))
    .some((p) => p.tema === "DERIVADAS"),
);

// La regla de corte del cliente sigue en pie con cinco preguntas por nivel.
check("2 de 5 aciertos siguen siendo BÁSICO", clasificarNivel(2, 5) === "BASICO");
check("3 de 5 siguen siendo INTERMEDIO", clasificarNivel(3, 5) === "INTERMEDIO");
check("5 de 5 siguen siendo AVANZADO", clasificarNivel(5, 5) === "AVANZADO");

// ── D. De punta a punta ──────────────────────────────────────────────────────
console.log("");
console.log(" · D. Un alumno real, de punta a punta");

const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud || (salud.base_datos && salud.base_datos !== "ok")) {
  console.log(`   · Sin servidor o sin base de datos en ${BASE}: se omite esta sección.`);
} else {
  const sufijo = Date.now().toString(36);

  /**
   * Registra un alumno, le configura su etapa por la pantalla de nivel
   * educativo y devuelve la prueba que le arma el servidor.
   */
  async function pruebaDe(nombre, { etapa, curso, ciclo, grado } = {}) {
    const email = `qa.${nombre}.${sufijo}@mentoriamath.local`;
    const { ok: registrado, sesion } = await registrarAlumno(BASE, {
      nombre: `QA ${nombre}`,
      email,
      password: "Diagnostico-2026",
      ciclo,
      grado,
    });
    if (!registrado || !sesion) {
      return { registrado, prueba: null, sesion: null, configurado: false };
    }

    let configurado = true;
    if (etapa) {
      const r = await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: sesion },
        body: JSON.stringify({ etapa, curso }),
      });
      configurado = r.ok;
    }

    const r = await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: sesion } });
    return { registrado, configurado, prueba: await r.json().catch(() => null), sesion };
  }

  // EL CASO DEL CLIENTE: 3.er año de secundaria.
  const tercero = await pruebaDe("sec3", { etapa: "SECUNDARIA", curso: 3 });
  check("un alumno se registra y configura su etapa", tercero.registrado && tercero.configurado);

  if (tercero.prueba) {
    check(
      "el servidor reconoce su etapa y su curso",
      tercero.prueba.etapa === "SECUNDARIA" && tercero.prueba.cursoEscolar === 3,
      `${tercero.prueba.etapa} ${tercero.prueba.cursoEscolar}`,
    );
    check(
      "la prueba se arma con dificultad INTERMEDIO",
      tercero.prueba.nivelDePartida === "INTERMEDIO",
      String(tercero.prueba.nivelDePartida),
    );
    check(
      "NO le aparece ninguna pregunta de derivadas (el fallo reportado)",
      (tercero.prueba.preguntas ?? []).every((p) => p.tema !== "DERIVADAS"),
      (tercero.prueba.preguntas ?? []).map((p) => p.tema).join(", "),
    );
    check(
      "la prueba tiene las cinco preguntas",
      (tercero.prueba.preguntas ?? []).length === PREGUNTAS_POR_DIAGNOSTICO,
      `${(tercero.prueba.preguntas ?? []).length}`,
    );
    check(
      "ninguna pregunta viaja con su respuesta correcta",
      JSON.stringify(tercero.prueba.preguntas ?? []).includes("respuestaCorrecta") === false,
    );

    const envio = await fetch(`${BASE}/api/diagnostico`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: tercero.sesion },
      body: JSON.stringify({
        respuestas: (tercero.prueba.preguntas ?? []).map((p) => ({
          preguntaId: p.id,
          respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
          tiempoMs: 1000,
        })),
      }),
    });
    const resultado = await envio.json().catch(() => ({}));
    check(
      "el diagnóstico se corrige y asigna un nivel",
      envio.status === 200 && Boolean(resultado.nivel),
      `HTTP ${envio.status}`,
    );

    const parcial = await fetch(`${BASE}/api/diagnostico`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: tercero.sesion },
      body: JSON.stringify({
        respuestas: [{ preguntaId: tercero.prueba.preguntas[0].id, respuestaDada: "a" }],
      }),
    });
    check("un envío incompleto se rechaza", parcial.status === 400, `HTTP ${parcial.status}`);

    // Un curso que no existe no se acepta: secundaria no tiene 8.º año.
    const invalido = await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: tercero.sesion },
      body: JSON.stringify({ etapa: "SECUNDARIA", curso: 8 }),
    });
    check("un curso imposible se rechaza", invalido.status === 400, `HTTP ${invalido.status}`);
  }

  // El otro extremo: superior sí ve derivadas.
  const universitario = await pruebaDe("sup2", { etapa: "SUPERIOR", curso: 2 });
  if (universitario.prueba) {
    check(
      "un alumno de superior recibe dificultad avanzada",
      universitario.prueba.nivelDePartida === "AVANZADO",
      String(universitario.prueba.nivelDePartida),
    );
    check(
      "y en su prueba SÍ hay derivadas",
      (universitario.prueba.preguntas ?? []).some((p) => p.tema === "DERIVADAS"),
      (universitario.prueba.preguntas ?? []).map((p) => p.tema).join(", "),
    );
  }

  // Primaria: ni derivadas ni factorización.
  const nino = await pruebaDe("pri5", { etapa: "PRIMARIA", curso: 5 });
  if (nino.prueba) {
    check(
      "un alumno de primaria recibe dificultad básica",
      nino.prueba.nivelDePartida === "BASICO",
      String(nino.prueba.nivelDePartida),
    );
    check(
      "y ni derivadas ni factorización",
      (nino.prueba.preguntas ?? []).every((p) => !["DERIVADAS", "FACTORIZACION"].includes(p.tema)),
      (nino.prueba.preguntas ?? []).map((p) => p.tema).join(", "),
    );
  }

  // Una cuenta del PMV 1, con el curso en texto libre.
  const heredada = await pruebaDe("legado", { ciclo: "Secundaria", grado: "3.º" });
  if (heredada.prueba) {
    check(
      "una cuenta antigua con el curso en texto también se clasifica",
      heredada.prueba.etapa === "SECUNDARIA" && heredada.prueba.cursoEscolar === 3,
      `${heredada.prueba.etapa} ${heredada.prueba.cursoEscolar}`,
    );
    check(
      "y tampoco ve derivadas",
      (heredada.prueba.preguntas ?? []).every((p) => p.tema !== "DERIVADAS"),
    );
  }

  // ── La vista de LECCIÓN sólo ofrece lo que le toca ──────────────────────
  // Lo reportó el cliente: un alumno de 6.º de primaria hacía un diagnóstico de
  // primaria y al entrar en la lección se encontraba con Ecuaciones lineales,
  // Factorización y Derivadas, porque las tarjetas salían de una lista escrita
  // en el código en lugar del currículo.
  async function leccionDe(nombre, etapa, curso) {
    const email = `qa.leccion.${nombre}.${sufijo}@mentoriamath.local`;
    const alta = await registrarAlumno(BASE, {
      nombre: `QA Leccion ${nombre}`,
      email,
      password: "Diagnostico-2026",
    });
    if (!alta.ok) return null;

    await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: alta.sesion },
      body: JSON.stringify({ etapa, curso }),
    });

    // La lección exige diagnóstico hecho, así que se completa.
    const prueba = await (
      await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })
    ).json();
    await fetch(`${BASE}/api/diagnostico`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: alta.sesion },
      body: JSON.stringify({
        respuestas: (prueba.preguntas ?? []).map((p) => ({
          preguntaId: p.id,
          respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
        })),
      }),
    });

    // El nivel viaja en el token, y el de la sesión abierta es de antes del
    // diagnóstico: se vuelve a entrar para que la página no rebote.
    const sesion = await iniciarSesion(BASE, email, "Diagnostico-2026");
    const r = await fetch(`${BASE}/estudiante/leccion`, { headers: { cookie: sesion } });
    const html = await r.text();
    const tarjetas = ["Aritmética", "Fracciones", "Ecuaciones lineales", "Factorización", "Derivadas"]
      .filter((t) => html.includes(t));
    return { estado: r.status, tarjetas, sesion };
  }

  const leccionPri6 = await leccionDe("pri6", "PRIMARIA", 6);
  if (leccionPri6) {
    check("la lección carga para un alumno de 6.º de primaria", leccionPri6.estado === 200);
    check(
      "y NO ofrece derivadas, factorización ni ecuaciones lineales (el fallo reportado)",
      !leccionPri6.tarjetas.some((t) =>
        ["Derivadas", "Factorización", "Ecuaciones lineales"].includes(t),
      ),
      leccionPri6.tarjetas.join(", "),
    );
    check(
      "sí ofrece lo que le corresponde",
      leccionPri6.tarjetas.includes("Aritmética") && leccionPri6.tarjetas.includes("Fracciones"),
      leccionPri6.tarjetas.join(", "),
    );

    // Y el servidor lo impide, no sólo la pantalla.
    for (const [tema, esperado] of [
      ["derivadas", 403],
      ["factorizacion", 403],
      ["lineales", 403],
      ["aritmetica", 200],
    ]) {
      const r = await fetch(`${BASE}/api/sesion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: leccionPri6.sesion },
        body: JSON.stringify({ tema }),
      });
      check(
        `/api/sesion con "${tema}" responde ${esperado}`,
        r.status === esperado,
        `HTTP ${r.status}`,
      );
    }
  }

  const leccionSec3 = await leccionDe("sec3", "SECUNDARIA", 3);
  if (leccionSec3) {
    check(
      "a 3.º de secundaria la lección le ofrece álgebra pero no derivadas",
      leccionSec3.tarjetas.includes("Ecuaciones lineales") &&
        leccionSec3.tarjetas.includes("Factorización") &&
        !leccionSec3.tarjetas.includes("Derivadas"),
      leccionSec3.tarjetas.join(", "),
    );
  }

  const leccionSup = await leccionDe("sup1", "SUPERIOR", 1);
  if (leccionSup) {
    check(
      "a un universitario le ofrece los cinco temas",
      leccionSup.tarjetas.length === 5,
      leccionSup.tarjetas.join(", "),
    );
  }

  // Sin etapa declarada no se compone prueba: se le manda a configurarla, que
  // es mejor que medirle con un temario que no es el suyo.
  const sinEtapa = await pruebaDe("sinetapa", {});
  if (sinEtapa.prueba) {
    check(
      "sin etapa declarada, el servidor pide configurarla",
      sinEtapa.prueba.etapaSinConfigurar === true,
      JSON.stringify(sinEtapa.prueba).slice(0, 90),
    );
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
