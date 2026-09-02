// ¿SE SOSTIENE EL HITO 1 (AUTORÍA DOCENTE Y CATÁLOGO CURRICULAR)?
//
// Cubre las tres promesas del hito, en este orden:
//
//   A. El currículo como dato: claves estables, árbol sin ciclos, categorías.
//   B. Los ejercicios parametrizados: muestreo determinista y sustitución.
//   C. El validador matemático del servidor: que una respuesta que no cuadra
//      con el motor NO se pueda guardar, y que lo que no se puede verificar se
//      declare en lugar de darse por bueno.
//
// Y, si hay un servidor levantado, D: el ciclo completo por HTTP con sesión de
// docente iniciada —crear asignatura, tema con reglas, validar, guardar
// ejercicio, publicar, borrar— más el control de acceso de cada ruta nueva.
//
// Las secciones A, B y C no necesitan ni servidor ni base de datos: son las que
// fijan el contrato del hito y tienen que poder ejecutarse en cualquier sitio.
//
//   node qa/hito1.mjs
//   BASE_URL=http://localhost:3000 node qa/hito1.mjs

import {
  aplanarArbol,
  claveUnica,
  descendientesDe,
  ejercicioSchema,
  generarClave,
  materiaSchema,
  parametroSchema,
  puedeSerPadre,
  temaSchema,
} from "../lib/docente/curriculo.ts";
import {
  combinaciones,
  normalizarSignos,
  revisarDeclaracion,
  sustituir,
  valoresPosibles,
} from "../lib/docente/parametros.ts";
import { validarEjercicio, delimitadorSinCerrar } from "../lib/docente/validador.ts";
import { reglasParaGuardar } from "../lib/docente/temas.ts";
import { INICIO_POR_ROL, ROLES, ZONAS, puedeAcceder, puedeEditarCurriculo } from "../lib/rbac.ts";

import { BASE_URL as BASE } from "./base-url.mjs";

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
console.log(" HITO 1 — autoría docente, currículo dinámico y validador");
console.log("═══════════════════════════════════════════════════════════\n");

// ── A. El currículo como dato ────────────────────────────────────────────────
console.log(" · A. Claves, árbol y esquemas");

check(
  "el título se convierte en clave legible",
  generarClave("Ecuaciones de 1.er grado") === "ecuaciones-de-1-er-grado",
  generarClave("Ecuaciones de 1.er grado"),
);
check("los acentos no entran en la clave", generarClave("Fracciones básicas") === "fracciones-basicas");
check("un título sin letras no deja la clave vacía", generarClave("¿?¡!") === "tema");
check(
  "dos temas homónimos no chocan",
  claveUnica("fracciones", ["fracciones"]) === "fracciones-2" &&
    claveUnica("fracciones", ["fracciones", "fracciones-2"]) === "fracciones-3",
);

// El árbol: un tema no puede colgar de sí mismo ni de un descendiente suyo.
const arbol = [
  { id: "raiz", padreId: null },
  { id: "hijo", padreId: "raiz" },
  { id: "nieto", padreId: "hijo" },
  { id: "otro", padreId: null },
];
check("los descendientes se recorren a cualquier profundidad", [...descendientesDe(arbol, "raiz")].sort().join(",") === "hijo,nieto");
check("un tema no puede ser su propio padre", puedeSerPadre(arbol, "raiz", "raiz") === false);
check("un tema no puede colgar de su nieto", puedeSerPadre(arbol, "raiz", "nieto") === false);
check("un tema sí puede colgar de una rama ajena", puedeSerPadre(arbol, "raiz", "otro") === true);
check("sin padre siempre se puede guardar", puedeSerPadre(arbol, "hijo", null) === true);

const plano = aplanarArbol(arbol);
check(
  "el árbol se aplana en orden de lectura, con su profundidad",
  plano.map((n) => `${n.nodo.id}:${n.profundidad}`).join(" ") === "raiz:0 hijo:1 nieto:2 otro:0",
  plano.map((n) => `${n.nodo.id}:${n.profundidad}`).join(" "),
);

// Un ciclo heredado de datos corruptos no debe colgar el listado.
const conCiclo = [
  { id: "a", padreId: "b" },
  { id: "b", padreId: "a" },
];
check("un ciclo en los datos no cuelga el listado", aplanarArbol(conCiclo).length === 2);

check("un tema sin título no se acepta", temaSchema.safeParse({ titulo: "ab" }).success === false);
check("un tema con título válido se acepta", temaSchema.safeParse({ titulo: "Derivadas" }).success);
check(
  "una regla incompleta tumba el tema entero",
  temaSchema.safeParse({ titulo: "Derivadas", reglas: [{ nombre: "R" }] }).success === false,
);
check("una asignatura sin nombre no se acepta", materiaSchema.safeParse({ nombre: "" }).success === false);
check(
  "un ejercicio sin tema no se acepta",
  ejercicioSchema.safeParse({ nivel: "BASICO", enunciado: "2+2" }).success === false,
);
check(
  "un parámetro con máximo menor que el mínimo no se acepta",
  parametroSchema.safeParse({ nombre: "a", min: 9, max: 2 }).success === false,
);

// Las reglas heredan motor y estado del tema: es lo que hace que lo que escribe
// el docente aparezca —o no— en la lección del alumno.
const preparadas = reglasParaGuardar(
  [
    { tipo: "REGLA", nombre: "Regla de la potencia", enunciado: "x^n", descripcion: "…" },
    { tipo: "ERROR_FRECUENTE", nombre: "Regla de la potencia", enunciado: "x^n", descripcion: "…" },
  ],
  { clave: "derivadas", nodoId: "n1", motor: "DERIVADAS", estado: "BORRADOR", autorId: "u1" },
);
check("la regla hereda el motor del tema", preparadas.every((r) => r.tema === "DERIVADAS"));
check("la regla hereda el estado del tema", preparadas.every((r) => r.estado === "BORRADOR"));
check(
  "dos reglas con el mismo nombre no chocan de clave",
  preparadas[0].clave !== preparadas[1].clave,
  preparadas.map((r) => r.clave).join(" · "),
);
check("la clave de la regla cuelga de la del tema", preparadas[0].clave.startsWith("derivadas."));

// ── B. Ejercicios parametrizados ─────────────────────────────────────────────
console.log("\n · B. Plantillas y parámetros");

check(
  "el rango se recorre con su paso",
  valoresPosibles({ nombre: "d", min: 0.5, max: 2, paso: 0.5 }).join(",") === "0.5,1,1.5,2",
);
check(
  "los valores excluidos no aparecen",
  !valoresPosibles({ nombre: "a", min: -2, max: 2, excluir: [0] }).includes(0),
);
check("un rango invertido no da valores", valoresPosibles({ nombre: "a", min: 5, max: 1 }).length === 0);

const pequenio = combinaciones([
  { nombre: "a", min: 1, max: 3 },
  { nombre: "b", min: 1, max: 4 },
]);
check("un espacio pequeño se recorre entero", pequenio.exhaustivo && pequenio.muestras.length === 12);

const grande = combinaciones([
  { nombre: "a", min: 1, max: 50 },
  { nombre: "b", min: 1, max: 50 },
]);
const grandeOtraVez = combinaciones([
  { nombre: "a", min: 1, max: 50 },
  { nombre: "b", min: 1, max: 50 },
]);
check("un espacio grande se muestrea", !grande.exhaustivo && grande.totales === 2500);
check(
  "el muestreo es reproducible: dos ejecuciones dan lo mismo",
  JSON.stringify(grande.muestras) === JSON.stringify(grandeOtraVez.muestras),
);
check(
  "el muestreo no repite combinación",
  new Set(grande.muestras.map((m) => JSON.stringify(m))).size === grande.muestras.length,
);

check(
  "el hueco se sustituye por su valor",
  sustituir("{a}x + {b} = {c}", { a: 3, b: 5, c: 20 }) === "3x + 5 = 20",
);
check(
  "un valor negativo no deja un doble signo en el enunciado",
  sustituir("{a}x + {b} = {c}", { a: 3, b: -5, c: 20 }) === "3x - 5 = 20",
  sustituir("{a}x + {b} = {c}", { a: 3, b: -5, c: 20 }),
);
check("el coeficiente 1 no se escribe", normalizarSignos("1x + 4 = 9") === "x + 4 = 9");
check("el 1 de un número mayor no se toca", normalizarSignos("21x = 42") === "21x = 42");

const problemas = revisarDeclaracion(["{a}x = {z}"], [{ nombre: "a", min: 1, max: 3 }]);
check("un hueco sin declarar se detecta", problemas.some((p) => p.includes("{z}")));
check(
  "un parámetro declarado y no usado se detecta",
  revisarDeclaracion(["{a}x = 4"], [
    { nombre: "a", min: 1, max: 3 },
    { nombre: "b", min: 1, max: 3 },
  ]).some((p) => p.includes("{b}")),
);

// ── C. El validador matemático del servidor ──────────────────────────────────
console.log("\n · C. Validador matemático (la promesa central del hito)");

const correcto = validarEjercicio({
  enunciado: "3x + 5 = 20",
  respuestaCorrecta: "5",
  motor: "ECUACIONES_LINEALES",
});
check("un ejercicio correcto se valida y queda verificado", correcto.valido && correcto.verificado);

const equivocado = validarEjercicio({
  enunciado: "3x + 5 = 20",
  respuestaCorrecta: "6",
  motor: "ECUACIONES_LINEALES",
});
check("una respuesta que no cuadra con el motor NO se puede guardar", equivocado.valido === false);
check(
  "y el error dice qué calcula el motor",
  equivocado.errores.some((e) => e.includes("5")),
  equivocado.errores[0],
);

const adoptado = validarEjercicio({ enunciado: "2x = 7", motor: "ECUACIONES_LINEALES" });
check(
  "sin respuesta escrita, la calcula el motor y queda verificado",
  adoptado.valido && adoptado.verificado && adoptado.respuestaCorrecta === "7/2",
  String(adoptado.respuestaCorrecta),
);

const equivalente = validarEjercicio({
  enunciado: "2x = 7",
  respuestaCorrecta: "3.5",
  motor: "ECUACIONES_LINEALES",
});
check("3.5 y 7/2 se reconocen como la misma respuesta", equivalente.valido && equivalente.verificado);

const plantilla = validarEjercicio({
  enunciado: "{a}x + {b} = {c}",
  respuestaFormula: "({c} - {b}) / {a}",
  plantilla: true,
  motor: "ECUACIONES_LINEALES",
  parametros: [
    { nombre: "a", min: 2, max: 4 },
    { nombre: "b", min: -3, max: 3 },
    { nombre: "c", min: 8, max: 12 },
  ],
});
check("una plantilla correcta se valida", plantilla.valido && plantilla.verificado);
check(
  "y se comprueba combinación a combinación, no una sola vez",
  plantilla.comprobadas >= 20,
  `comprobadas: ${plantilla.comprobadas} de ${plantilla.totalCombinaciones}`,
);

const formulaInvertida = validarEjercicio({
  enunciado: "{a}x + {b} = {c}",
  respuestaFormula: "({b} - {c}) / {a}",
  plantilla: true,
  motor: "ECUACIONES_LINEALES",
  parametros: [
    { nombre: "a", min: 2, max: 3 },
    { nombre: "b", min: 1, max: 2 },
    { nombre: "c", min: 8, max: 9 },
  ],
});
check("una fórmula equivocada se detecta en las muestras", formulaInvertida.valido === false);

const divisionPorCero = validarEjercicio({
  enunciado: "{a}x = {b}",
  respuestaFormula: "{b} / {a}",
  plantilla: true,
  motor: "ECUACIONES_LINEALES",
  parametros: [
    { nombre: "a", min: 0, max: 2 },
    { nombre: "b", min: 4, max: 6 },
  ],
});
check(
  "un rango que permite dividir por cero se rechaza",
  divisionPorCero.valido === false,
  divisionPorCero.errores[0],
);

const sinFormula = validarEjercicio({
  enunciado: "{a}x = 10",
  respuestaCorrecta: "5",
  plantilla: true,
  motor: "ECUACIONES_LINEALES",
  parametros: [{ nombre: "a", min: 2, max: 4 }],
});
check("una plantilla con respuesta fija se rechaza", sinFormula.valido === false);

const huecoSuelto = validarEjercicio({
  enunciado: "{a}x = 10",
  respuestaCorrecta: "5",
  motor: "ECUACIONES_LINEALES",
});
check("un hueco fuera de una plantilla se detecta", huecoSuelto.valido === false);

const sinMotor = validarEjercicio({
  enunciado: "Explica por qué la suma es conmutativa",
  respuestaCorrecta: "El orden de los sumandos no altera la suma",
  motor: null,
});
check("sin motor se puede guardar…", sinMotor.valido === true);
check("…pero NO queda verificado", sinMotor.verificado === false);
check(
  "y se dice por qué",
  sinMotor.avisos.some((a) => a.includes("motor")),
  sinMotor.avisos[0],
);

const sinMotorNiRespuesta = validarEjercicio({ enunciado: "Demuestra el teorema", motor: null });
check(
  "sin motor y sin respuesta no hay nada que calificar: se rechaza",
  sinMotorNiRespuesta.valido === false,
);

check("un paréntesis sin cerrar se nombra", delimitadorSinCerrar("3(x + 5 = 20") !== null);
check("un enunciado equilibrado pasa", delimitadorSinCerrar("3(x + 5) = 20") === null);
check(
  "un paréntesis sin cerrar bloquea el guardado",
  validarEjercicio({
    enunciado: "3(x + 5 = 20",
    respuestaCorrecta: "5",
    motor: "ECUACIONES_LINEALES",
  }).valido === false,
);

const derivada = validarEjercicio({
  enunciado: "3x⁴",
  respuestaCorrecta: "12x³",
  motor: "DERIVADAS",
});
check("el validador también cubre derivadas", derivada.valido && derivada.verificado);

const factorizacion = validarEjercicio({
  enunciado: "x² - 9",
  respuestaCorrecta: "(x - 3)(x + 3)",
  motor: "FACTORIZACION",
});
check("y factorización", factorizacion.valido && factorizacion.verificado);

const pistaChivata = validarEjercicio({
  enunciado: "3x + 5 = 20",
  respuestaCorrecta: "5",
  motor: "ECUACIONES_LINEALES",
  pistas: ["La solución es 5"],
});
check(
  "una pista que regala la respuesta se avisa",
  pistaChivata.avisos.some((a) => a.includes("pistas")),
);

// Reproducibilidad: la misma entrada da el mismo veredicto y las mismas muestras.
const repetido = validarEjercicio({
  enunciado: "{a}x + {b} = {c}",
  respuestaFormula: "({c} - {b}) / {a}",
  plantilla: true,
  motor: "ECUACIONES_LINEALES",
  parametros: [
    { nombre: "a", min: 2, max: 9 },
    { nombre: "b", min: -9, max: 9 },
    { nombre: "c", min: 1, max: 40 },
  ],
});
const repetidoOtraVez = validarEjercicio({
  enunciado: "{a}x + {b} = {c}",
  respuestaFormula: "({c} - {b}) / {a}",
  plantilla: true,
  motor: "ECUACIONES_LINEALES",
  parametros: [
    { nombre: "a", min: 2, max: 9 },
    { nombre: "b", min: -9, max: 9 },
    { nombre: "c", min: 1, max: 40 },
  ],
});
check(
  "validar dos veces lo mismo da el mismo resultado",
  JSON.stringify(repetido.muestras) === JSON.stringify(repetidoOtraVez.muestras) &&
    repetido.valido === repetidoOtraVez.valido,
);

// ── D. Control de acceso ─────────────────────────────────────────────────────
console.log("\n · D. Roles del MVP 2");

check("hay cuatro roles", ROLES.length === 4 && ROLES.includes("DIRECTOR") && ROLES.includes("SUPERADMIN"));
check("ya no existe el rol ADMIN del PMV 1", !ROLES.includes("ADMIN"));
check("cada rol tiene página de inicio", ROLES.every((r) => Boolean(INICIO_POR_ROL[r])));
check("el director entra en la zona docente", puedeAcceder("DIRECTOR", "/docente/curriculo"));
check("el estudiante no entra en la zona docente", !puedeAcceder("ESTUDIANTE", "/docente/curriculo"));
check("sólo el superadministrador entra en /admin", puedeAcceder("SUPERADMIN", "/admin") && !puedeAcceder("DOCENTE", "/admin"));
check("el docente puede editar el currículo", puedeEditarCurriculo("DOCENTE"));
check("el director NO puede editar el currículo", !puedeEditarCurriculo("DIRECTOR"));
check("un anónimo no puede editar el currículo", !puedeEditarCurriculo(undefined));
check(
  "las tres zonas siguen protegidas",
  ZONAS.length === 3 && ZONAS.every((z) => z.permite.length > 0),
);

// ── E. El ciclo completo por HTTP (necesita servidor y base de datos) ────────
console.log("\n · E. Ciclo completo con sesión de docente");

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
  // Las rutas nuevas, sin sesión, no deben contestar con datos.
  for (const ruta of [
    "/api/docente/temas",
    "/api/docente/ejercicios",
    "/api/docente/materias",
  ]) {
    const r = await fetch(`${BASE}${ruta}`, { redirect: "manual" });
    check(`${ruta} sin sesión no devuelve datos`, r.status === 401 || r.status >= 300, `HTTP ${r.status}`);
  }

  const sesion = await iniciarSesion(
    process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
    process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
  );
  check("un docente puede iniciar sesión", Boolean(sesion), "revisa que la semilla se haya ejecutado");

  if (sesion) {
    const api = (ruta, opciones = {}) =>
      fetch(`${BASE}${ruta}`, {
        ...opciones,
        headers: {
          "Content-Type": "application/json",
          cookie: sesion,
          ...(opciones.headers || {}),
        },
      });

    const sufijo = Date.now().toString(36);
    let materiaId = null;
    let temaId = null;
    let ejercicioId = null;

    // 1. Asignatura
    const rMateria = await api("/api/docente/materias", {
      method: "POST",
      body: JSON.stringify({ nombre: `QA Asignatura ${sufijo}` }),
    });
    const materia = await rMateria.json().catch(() => ({}));
    materiaId = materia?.materia?.id ?? null;
    check("se crea una asignatura", rMateria.status === 201 && Boolean(materiaId), `HTTP ${rMateria.status}`);

    // 2. Tema con reglas, en una sola petición
    const rTema = await api("/api/docente/temas", {
      method: "POST",
      body: JSON.stringify({
        titulo: `QA Ecuaciones ${sufijo}`,
        descripcion: "Tema creado por la batería del HITO 1.",
        materiaId,
        motor: "ECUACIONES_LINEALES",
        nivel: "BASICO",
        estado: "PUBLICADO",
        objetivos: ["Despejar la incógnita"],
        etiquetas: ["QA", "hito1"],
        reglas: [
          {
            tipo: "REGLA",
            nombre: `Regla QA ${sufijo}`,
            enunciado: "ax + b = c",
            descripcion: "Se resta b y se divide entre a.",
            practicable: true,
          },
        ],
      }),
    });
    const tema = await rTema.json().catch(() => ({}));
    temaId = tema?.tema?.id ?? null;
    check("se crea un tema con su regla", rTema.status === 201 && Boolean(temaId), `HTTP ${rTema.status}`);
    check("el tema recibe clave generada", Boolean(tema?.tema?.clave));
    check("la regla queda contada en el tema", tema?.tema?._count?.reglas === 1);

    // 2b. Las tres vistas del pliego responden de verdad.
    //     Compilar no es renderizar: una consulta mal escrita en un componente
    //     de servidor pasa el `tsc` y revienta al abrir la página.
    for (const ruta of [
      "/docente",
      "/docente/curriculo",
      "/docente/crear-tema",
      "/docente/ejercicios",
      `/docente/crear-tema?id=${temaId}`,
    ]) {
      const r = await fetch(`${BASE}${ruta}`, { headers: { cookie: sesion } });
      const html = await r.text();
      check(
        `${ruta} se renderiza para el docente`,
        r.status === 200 && html.includes("MentorIA Math"),
        `HTTP ${r.status}`,
      );
    }

    // 2c. La regla del docente queda guardada COMO LA BUSCA LA LECCIÓN.
    //     La lección del alumno filtra el catálogo por motor y por estado
    //     publicado; si la regla no heredara los dos campos, se guardaría bien
    //     y no la vería ningún alumno, que es el peor de los fallos: silencioso.
    const detalle = await (await api(`/api/docente/temas/${temaId}`)).json();
    const reglaGuardada = detalle?.tema?.reglas?.[0];
    check(
      "la regla hereda en base el motor del tema",
      reglaGuardada?.tema === "ECUACIONES_LINEALES",
      `tema: ${reglaGuardada?.tema}`,
    );
    check(
      "y el estado publicado, que es lo que la lección exige",
      reglaGuardada?.estado === "PUBLICADO",
      `estado: ${reglaGuardada?.estado}`,
    );
    check("y queda colgada de su tema", reglaGuardada?.nodoId === temaId);

    // 3. Validación en seco
    const rValidar = await api("/api/docente/ejercicios/validar", {
      method: "POST",
      body: JSON.stringify({ nodoId: temaId, enunciado: "4x + 8 = 20", respuestaCorrecta: "3" }),
    });
    const validado = await rValidar.json().catch(() => ({}));
    check(
      "la validación en seco acepta lo correcto",
      rValidar.status === 200 && validado?.informe?.verificado === true,
    );

    const rValidarMal = await api("/api/docente/ejercicios/validar", {
      method: "POST",
      body: JSON.stringify({ nodoId: temaId, enunciado: "4x + 8 = 20", respuestaCorrecta: "9" }),
    });
    const validadoMal = await rValidarMal.json().catch(() => ({}));
    check(
      "la validación en seco rechaza lo incorrecto sin guardar nada",
      validadoMal?.informe?.valido === false,
    );

    // 4. Alta de ejercicio: el incorrecto no entra
    const rMal = await api("/api/docente/ejercicios", {
      method: "POST",
      body: JSON.stringify({
        nodoId: temaId,
        nivel: "BASICO",
        enunciado: "4x + 8 = 20",
        respuestaCorrecta: "9",
      }),
    });
    check("un ejercicio con la respuesta mal se rechaza con 422", rMal.status === 422, `HTTP ${rMal.status}`);

    const rBien = await api("/api/docente/ejercicios", {
      method: "POST",
      body: JSON.stringify({
        nodoId: temaId,
        nivel: "BASICO",
        enunciado: "4x + 8 = 20",
        respuestaCorrecta: "3",
        estado: "PUBLICADO",
      }),
    });
    const creado = await rBien.json().catch(() => ({}));
    ejercicioId = creado?.ejercicio?.id ?? null;
    check("un ejercicio correcto se guarda", rBien.status === 201 && Boolean(ejercicioId), `HTTP ${rBien.status}`);
    check("y se guarda marcado como verificado", creado?.ejercicio?.validado === true);
    check("con el motor heredado del tema", creado?.ejercicio?.motor === "ECUACIONES_LINEALES");

    // 5. Plantilla parametrizada
    const rPlantilla = await api("/api/docente/ejercicios", {
      method: "POST",
      body: JSON.stringify({
        nodoId: temaId,
        nivel: "INTERMEDIO",
        enunciado: "{a}x + {b} = {c}",
        plantilla: true,
        respuestaFormula: "({c} - {b}) / {a}",
        parametros: [
          { nombre: "a", min: 2, max: 5 },
          { nombre: "b", min: -4, max: 4 },
          { nombre: "c", min: 6, max: 14 },
        ],
      }),
    });
    const plantillaCreada = await rPlantilla.json().catch(() => ({}));
    check(
      "una plantilla parametrizada se guarda verificada",
      rPlantilla.status === 201 && plantillaCreada?.ejercicio?.validado === true,
      `HTTP ${rPlantilla.status}`,
    );

    // 6. Duplicado
    const rRepetido = await api("/api/docente/ejercicios", {
      method: "POST",
      body: JSON.stringify({
        nodoId: temaId,
        nivel: "BASICO",
        enunciado: "4x + 8 = 20",
        respuestaCorrecta: "3",
      }),
    });
    check("no se admite dos veces el mismo enunciado en un tema", rRepetido.status === 409, `HTTP ${rRepetido.status}`);

    // 7. Listado y filtros
    const listado = await (await api(`/api/docente/temas?q=${encodeURIComponent(sufijo)}`)).json();
    check("el tema aparece en el listado filtrado", listado?.temas?.some((t) => t.id === temaId));

    const banco = await (await api(`/api/docente/ejercicios?nodoId=${temaId}`)).json();
    check("el banco devuelve los ejercicios del tema", banco?.ejercicios?.length === 2, `${banco?.ejercicios?.length}`);

    // 8. Edición: cambiar el enunciado obliga a revalidar
    const rEditar = await api(`/api/docente/ejercicios/${ejercicioId}`, {
      method: "PATCH",
      body: JSON.stringify({ enunciado: "4x + 8 = 24" }),
    });
    const editado = await rEditar.json().catch(() => ({}));
    check(
      "al cambiar el enunciado se recalcula la respuesta",
      rEditar.status === 200 && editado?.ejercicio?.respuestaCorrecta === "4",
      `respuesta: ${editado?.ejercicio?.respuestaCorrecta}`,
    );

    // 8b. Pero una respuesta MAL puesta a mano sigue bloqueando la edición: lo
    //     que se relaja al cambiar el enunciado es la respuesta CADUCA, no la
    //     comprobación.
    const rEditarMal = await api(`/api/docente/ejercicios/${ejercicioId}`, {
      method: "PATCH",
      body: JSON.stringify({ enunciado: "4x + 8 = 24", respuestaCorrecta: "9" }),
    });
    check(
      "una respuesta equivocada sigue bloqueando la edición",
      rEditarMal.status === 422,
      `HTTP ${rEditarMal.status}`,
    );

    // 9. El árbol no admite ciclos, tampoco por HTTP
    const rCiclo = await api(`/api/docente/temas/${temaId}`, {
      method: "PATCH",
      body: JSON.stringify({ padreId: temaId }),
    });
    check("la API rechaza que un tema sea su propio padre", rCiclo.status === 409, `HTTP ${rCiclo.status}`);

    // 9a. Cambiar el motor del tema obliga a revisar su banco entero.
    //     Un ejercicio verificado con "ecuaciones lineales" NO está verificado
    //     si el tema pasa a corregirse con otro motor: dejarlo marcado como
    //     válido sería la mentira que el validador existe para impedir.
    const rMotor = await api(`/api/docente/temas/${temaId}`, {
      method: "PATCH",
      body: JSON.stringify({ motor: "DERIVADAS" }),
    });
    const cambiado = await rMotor.json().catch(() => ({}));
    check(
      "cambiar el motor del tema revalida sus ejercicios",
      rMotor.status === 200 && cambiado?.revalidados >= 2,
      `revalidados: ${cambiado?.revalidados}`,
    );

    const trasCambio = await (await api(`/api/docente/ejercicios?nodoId=${temaId}`)).json();
    check(
      "los ejercicios heredan el motor nuevo",
      (trasCambio?.ejercicios ?? []).every((e) => e.motor === "DERIVADAS"),
    );
    check(
      "y dejan de estar verificados si el motor nuevo no los resuelve",
      (trasCambio?.ejercicios ?? []).every((e) => e.validado === false),
      (trasCambio?.ejercicios ?? []).map((e) => `${e.enunciado}:${e.validado}`).join(" · "),
    );

    // Se devuelve el tema a su motor real antes de seguir.
    await api(`/api/docente/temas/${temaId}`, {
      method: "PATCH",
      body: JSON.stringify({ motor: "ECUACIONES_LINEALES" }),
    });

    // 9b. El director supervisa, no escribe. Es la única diferencia de rol que
    //     el HITO 1 introduce, y la que un fallo dejaría invisible: la interfaz
    //     no le ofrece el botón, así que sin esta prueba nadie notaría que la
    //     API sí se lo permite.
    const sesionDirector = await iniciarSesion(
      process.env.SEED_DIRECTOR_EMAIL || "director@mentoriamath.local",
      process.env.SEED_DIRECTOR_PASSWORD || "Director-2026",
    );
    check("un director puede iniciar sesión", Boolean(sesionDirector));
    if (sesionDirector) {
      const rLeer = await fetch(`${BASE}/api/docente/temas`, {
        headers: { cookie: sesionDirector },
      });
      check("el director SÍ puede consultar el currículo", rLeer.status === 200, `HTTP ${rLeer.status}`);

      const rEscribir = await fetch(`${BASE}/api/docente/temas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: sesionDirector },
        body: JSON.stringify({ titulo: "Tema del director" }),
      });
      check("el director NO puede crear temas", rEscribir.status === 403, `HTTP ${rEscribir.status}`);

      const rBorrar = await fetch(`${BASE}/api/docente/ejercicios/${ejercicioId}`, {
        method: "DELETE",
        headers: { cookie: sesionDirector },
      });
      check("el director NO puede borrar ejercicios", rBorrar.status === 403, `HTTP ${rBorrar.status}`);
    }

    // 10. Borrado y limpieza
    for (const ej of banco?.ejercicios ?? []) {
      await api(`/api/docente/ejercicios/${ej.id}`, { method: "DELETE" });
    }
    const rBorrarTema = await api(`/api/docente/temas/${temaId}`, { method: "DELETE" });
    check("el tema se borra cuando ya no tiene historial", rBorrarTema.status === 200, `HTTP ${rBorrarTema.status}`);

    const rBorrarMateria = await api(`/api/docente/materias/${materiaId}`, { method: "DELETE" });
    check("la asignatura vacía se borra", rBorrarMateria.status === 200, `HTTP ${rBorrarMateria.status}`);
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

/**
 * Inicia sesión contra NextAuth con credenciales y devuelve la cookie de sesión.
 *
 * El PMV 1 no probaba nada que necesitara sesión iniciada, y lo decía. Con el
 * HITO 1 eso deja de ser aceptable: todo el módulo de autoría vive detrás del
 * inicio de sesión, así que la batería tiene que saber entrar. Son dos pasos:
 * pedir el token CSRF (que viene con su cookie) y enviarlo con las credenciales
 * al proveedor de credenciales.
 */
async function iniciarSesion(email, password) {
  try {
    const rCsrf = await fetch(`${BASE}/api/auth/csrf`);
    const cookiesCsrf = leerCookies(rCsrf);
    const { csrfToken } = await rCsrf.json();

    const cuerpo = new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: BASE,
      redirect: "false",
    });

    const rLogin = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: cookiesCsrf,
      },
      body: cuerpo.toString(),
      redirect: "manual",
    });

    const cookiesSesion = leerCookies(rLogin);
    return /session-token/.test(cookiesSesion) ? `${cookiesCsrf}; ${cookiesSesion}` : null;
  } catch {
    return null;
  }
}

/** Las cookies de una respuesta, en el formato que espera la cabecera `cookie`. */
function leerCookies(respuesta) {
  const crudas = respuesta.headers.getSetCookie?.() ?? [];
  return crudas.map((c) => c.split(";")[0]).join("; ");
}
