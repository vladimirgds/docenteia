/**
 * Semilla de la base de datos.
 *
 * Deja el sistema en un estado desde el que se puede probar el flujo completo
 * del Paso 1 sin tocar SQL a mano:
 *   1. La materia y el árbol de conocimiento de los cinco temas de PRE Light.
 *   2. El banco de preguntas del diagnóstico (desde el JSON del repositorio).
 *   3. Los usuarios que el registro público no puede crear: DOCENTE, DIRECTOR
 *      y SUPERADMIN.
 *
 * Es idempotente: se puede ejecutar las veces que haga falta.
 *   npm run db:seed
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PrismaClient, type NivelAcademico, type Tema } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  adaptarBanco,
  type PreguntaOficial,
  type TemaEnum,
} from "../lib/diagnostico/banco.ts";
import { adaptarCatalogo, type ReglaOficial } from "../lib/leccion/reglas.ts";
import { bancoDeEjercicios } from "../src/lsgPrompt.js";
import { resolverEjercicio } from "../lib/leccion/correccion.ts";

const prisma = new PrismaClient();
const aqui = dirname(fileURLToPath(import.meta.url));

// ── Árbol de conocimiento base ───────────────────────────────────────────────
// Un nodo raíz por tema garantizado y sus subtemas. Es la estructura mínima
// sobre la que el Paso 2 colgará el banco de ejercicios generados.
const ARBOL: Array<{
  clave: string;
  tema: TemaEnum;
  titulo: string;
  descripcion: string;
  hijos: Array<{ clave: string; titulo: string; nivel: "BASICO" | "INTERMEDIO" | "AVANZADO" }>;
}> = [
  {
    clave: "aritmetica",
    tema: "ARITMETICA",
    titulo: "Aritmética básica",
    descripcion: "Las cuatro operaciones y la jerarquía entre ellas.",
    hijos: [
      { clave: "aritmetica.jerarquia", titulo: "Jerarquía de operaciones", nivel: "BASICO" },
      { clave: "aritmetica.negativos", titulo: "Números negativos", nivel: "INTERMEDIO" },
      { clave: "aritmetica.potencias", titulo: "Potencias y raíces", nivel: "AVANZADO" },
    ],
  },
  {
    clave: "fracciones",
    tema: "FRACCIONES",
    titulo: "Fracciones",
    descripcion: "Operar con fracciones y simplificar el resultado.",
    hijos: [
      { clave: "fracciones.suma", titulo: "Suma y resta con igual denominador", nivel: "BASICO" },
      { clave: "fracciones.comun", titulo: "Denominador común", nivel: "INTERMEDIO" },
      { clave: "fracciones.producto", titulo: "Producto y cociente", nivel: "AVANZADO" },
    ],
  },
  {
    clave: "ecuaciones-lineales",
    tema: "ECUACIONES_LINEALES",
    titulo: "Ecuaciones lineales",
    descripcion: "Despejar la incógnita en ecuaciones de primer grado.",
    hijos: [
      { clave: "lineales.despeje", titulo: "Despeje directo", nivel: "BASICO" },
      { clave: "lineales.parentesis", titulo: "Con paréntesis", nivel: "INTERMEDIO" },
      { clave: "lineales.denominador", titulo: "Con denominador o decimales", nivel: "AVANZADO" },
    ],
  },
  {
    clave: "factorizacion",
    tema: "FACTORIZACION",
    titulo: "Factorización",
    descripcion: "Diferencia de cuadrados y factor común.",
    hijos: [
      { clave: "factorizacion.comun", titulo: "Factor común", nivel: "BASICO" },
      { clave: "factorizacion.cuadrados", titulo: "Diferencia de cuadrados", nivel: "INTERMEDIO" },
    ],
  },
  {
    clave: "derivadas",
    tema: "DERIVADAS",
    titulo: "Derivadas",
    descripcion: "Regla de la potencia y derivada de polinomios.",
    hijos: [
      { clave: "derivadas.potencia", titulo: "Regla de la potencia", nivel: "INTERMEDIO" },
      { clave: "derivadas.polinomio", titulo: "Polinomios término a término", nivel: "AVANZADO" },
    ],
  },
];

/**
 * DESDE QUÉ PUNTO DEL SISTEMA EDUCATIVO se plantea cada familia del motor.
 *
 * Es la taxonomía curricular aplicada al contenido de fábrica. Se lee "a partir
 * de": la factorización entra en 3.º de secundaria y sigue valiendo después;
 * las derivadas son de Superior y por eso no le aparecen a un alumno de
 * secundaria, que es exactamente el fallo que esta clasificación cierra.
 */
const ALCANCE_POR_MOTOR: Record<TemaEnum, { etapa: "PRIMARIA" | "SECUNDARIA" | "SUPERIOR"; cursoMin: number }> = {
  ARITMETICA: { etapa: "PRIMARIA", cursoMin: 1 },
  FRACCIONES: { etapa: "PRIMARIA", cursoMin: 4 },
  ECUACIONES_LINEALES: { etapa: "SECUNDARIA", cursoMin: 1 },
  FACTORIZACION: { etapa: "SECUNDARIA", cursoMin: 3 },
  DERIVADAS: { etapa: "SUPERIOR", cursoMin: 1 },
};

// Credenciales de demostración. Están documentadas en el README y DEBEN
// cambiarse antes de cualquier despliegue público; se pueden sobrescribir por
// variables de entorno para no fijarlas en el código de un entorno real.
const DEMO = {
  admin: {
    email: process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local",
    password: process.env.SEED_ADMIN_PASSWORD || "Admin-2026",
    nombre: "Administrador de la plataforma",
  },
  director: {
    email: process.env.SEED_DIRECTOR_EMAIL || "director@mentoriamath.local",
    password: process.env.SEED_DIRECTOR_PASSWORD || "Director-2026",
    nombre: "Dirección del centro",
  },
  docente: {
    email: process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
    password: process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
    nombre: "Docente de demostración",
  },
};

async function main() {
  console.log("→ Sembrando la base de datos…");

  // 1. Materia
  const matematicas = await prisma.materia.upsert({
    where: { codigo: "MAT" },
    update: {},
    create: { codigo: "MAT", nombre: "Matemáticas" },
  });
  console.log(`  ✓ Materia: ${matematicas.nombre}`);

  // 2. Árbol de conocimiento
  //
  // Se anota la raíz de cada motor para poder colgar de ella las reglas del
  // catálogo base: en el MVP 2 las reglas pertenecen a un tema, y sin este
  // vínculo el panel docente mostraría el temario de fábrica sin sus reglas.
  const raicesPorMotor = new Map<TemaEnum, string>();
  let nodos = 0;
  for (const raiz of ARBOL) {
    const padre = await prisma.nodoConocimiento.upsert({
      where: { clave: raiz.clave },
      // El catálogo base es contenido publicado, no borrador: es lo que el
      // alumno ya podía usar en el PMV 1 y debe seguir usando.
      update: {
        titulo: raiz.titulo,
        descripcion: raiz.descripcion,
        materiaId: matematicas.id,
        estado: "PUBLICADO",
        ...ALCANCE_POR_MOTOR[raiz.tema],
      },
      create: {
        clave: raiz.clave,
        motor: raiz.tema,
        titulo: raiz.titulo,
        descripcion: raiz.descripcion,
        materiaId: matematicas.id,
        estado: "PUBLICADO",
        ...ALCANCE_POR_MOTOR[raiz.tema],
      },
    });
    raicesPorMotor.set(raiz.tema, padre.id);
    nodos++;
    for (const [i, hijo] of raiz.hijos.entries()) {
      await prisma.nodoConocimiento.upsert({
        where: { clave: hijo.clave },
        update: {
          titulo: hijo.titulo,
          nivel: hijo.nivel,
          padreId: padre.id,
          orden: i,
          materiaId: matematicas.id,
          estado: "PUBLICADO",
          ...ALCANCE_POR_MOTOR[raiz.tema],
        },
        create: {
          clave: hijo.clave,
          motor: raiz.tema,
          titulo: hijo.titulo,
          nivel: hijo.nivel,
          padreId: padre.id,
          orden: i,
          materiaId: matematicas.id,
          estado: "PUBLICADO",
          ...ALCANCE_POR_MOTOR[raiz.tema],
        },
      });
      nodos++;
    }
  }
  console.log(`  ✓ Árbol de conocimiento: ${nodos} nodos`);

  // 3. Banco de preguntas del diagnóstico (formato oficial del cliente)
  const ruta = join(aqui, "seed-data", "preguntas-diagnostico.json");
  const oficial = JSON.parse(readFileSync(ruta, "utf8")) as PreguntaOficial[];

  // adaptarBanco valida además lo que sólo se ve mirando el conjunto: claves
  // repetidas y dos preguntas activas para el mismo tema. Si algo no cuadra,
  // lanza y la semilla se detiene antes de escribir nada.
  const preguntas = adaptarBanco(oficial);

  for (const p of preguntas) {
    await prisma.preguntaDiagnostico.upsert({
      where: { clave: p.clave },
      update: {
        orden: p.orden,
        tema: p.tema,
        nivel: p.nivel,
        etapa: p.etapa,
        cursoMin: p.cursoMin,
        enunciado: p.enunciado,
        opciones: p.opciones,
        respuestaCorrecta: p.respuestaCorrecta,
        activa: true,
      },
      create: {
        clave: p.clave,
        orden: p.orden,
        tema: p.tema,
        nivel: p.nivel,
        etapa: p.etapa,
        cursoMin: p.cursoMin,
        enunciado: p.enunciado,
        opciones: p.opciones,
        respuestaCorrecta: p.respuestaCorrecta,
      },
    });
  }

  // Lo que ya no está en el fichero deja de estar vigente. Se DESACTIVA en vez
  // de borrarse: eliminar una pregunta se llevaría por delante, en cascada, las
  // respuestas de los alumnos que ya la contestaron.
  const retiradas = await prisma.preguntaDiagnostico.updateMany({
    where: { clave: { notIn: preguntas.map((p) => p.clave) }, activa: true },
    data: { activa: false },
  });

  const porNivel = new Map<string, number>();
  for (const p of preguntas) {
    const clave = p.nivel ?? "sin nivel";
    porNivel.set(clave, (porNivel.get(clave) ?? 0) + 1);
  }
  const reparto = [...porNivel].map(([n, c]) => `${c} ${n.toLowerCase()}`).join(" · ");
  console.log(`  ✓ Diagnóstico: ${preguntas.length} preguntas activas (${reparto})`);
  if (retiradas.count > 0) {
    console.log(`    (${retiradas.count} pregunta(s) anterior(es) desactivada(s), historial intacto)`);
  }

  // 3.5. Catálogo formal de reglas y propiedades
  const rutaReglas = join(aqui, "seed-data", "reglas-matematicas.json");
  const reglas = adaptarCatalogo(
    JSON.parse(readFileSync(rutaReglas, "utf8")) as ReglaOficial[],
  );

  for (const r of reglas) {
    await prisma.reglaMatematica.upsert({
      where: { clave: r.clave },
      update: {
        tema: r.tema,
        nodoId: raicesPorMotor.get(r.tema) ?? null,
        orden: r.orden,
        nombre: r.nombre,
        enunciado: r.enunciado,
        descripcion: r.descripcion,
        ejemplo: r.ejemplo,
        nivel: r.nivel,
        practicable: r.practicable,
      },
      create: {
        clave: r.clave,
        tema: r.tema,
        nodoId: raicesPorMotor.get(r.tema) ?? null,
        orden: r.orden,
        nombre: r.nombre,
        enunciado: r.enunciado,
        descripcion: r.descripcion,
        ejemplo: r.ejemplo,
        nivel: r.nivel,
        practicable: r.practicable,
      },
    });
  }
  const temasConReglas = new Set(reglas.map((r) => r.tema)).size;
  console.log(`  ✓ Reglas y propiedades: ${reglas.length} en ${temasConReglas} temas`);

  // 3.6. Banco de ejercicios deterministas
  //
  // Las listas viven en el motor, en memoria, y la tabla `ejercicios` estaba
  // vacía: el catálogo no se podía consultar ni analizar fuera del motor. Se
  // siembra desde la MISMA fuente que usa la lección —no una copia, que se
  // desincronizaría— y la respuesta la calcula el validador determinista.
  //
  // Sólo entra lo que el validador puede verificar, que es lo que dice el
  // esquema: un ejercicio sin respuesta comprobable no sirve para calificar.
  const CLAVE_TEMA: Record<string, string> = {
    ARITMETICA: "aritmetica",
    FRACCIONES: "fracciones",
    ECUACIONES_LINEALES: "lineales",
    FACTORIZACION: "factorizacion",
    DERIVADAS: "derivadas",
  };

  let sembrados = 0;
  const sinVerificar: string[] = [];
  for (const e of bancoDeEjercicios()) {
    const respuesta = resolverEjercicio(e.enunciado, CLAVE_TEMA[e.tema]);
    if (!respuesta) {
      sinVerificar.push(`${e.tema}: ${e.enunciado}`);
      continue;
    }
    await prisma.ejercicio.upsert({
      where: {
        motor_nivel_enunciado: {
          motor: e.tema as Tema,
          nivel: e.nivel as NivelAcademico,
          enunciado: e.enunciado,
        },
      },
      update: {
        respuestaCorrecta: respuesta,
        validado: true,
        estado: "PUBLICADO",
        nodoId: raicesPorMotor.get(e.tema as TemaEnum) ?? null,
        ...ALCANCE_POR_MOTOR[e.tema as TemaEnum],
        metadatos: { nivelMotor: e.nivelMotor },
      },
      create: {
        motor: e.tema as Tema,
        nivel: e.nivel as NivelAcademico,
        enunciado: e.enunciado,
        respuestaCorrecta: respuesta,
        origen: "DETERMINISTA",
        validado: true,
        estado: "PUBLICADO",
        nodoId: raicesPorMotor.get(e.tema as TemaEnum) ?? null,
        ...ALCANCE_POR_MOTOR[e.tema as TemaEnum],
        metadatos: { nivelMotor: e.nivelMotor },
      },
    });
    sembrados++;
  }
  console.log(`  ✓ Banco de ejercicios: ${sembrados} verificados por el motor`);
  if (sinVerificar.length > 0) {
    // Se DECLARA en lugar de guardarlos sin respuesta: un ejercicio que el
    // motor no sabe resolver no puede calificarse, y guardarlo daría por
    // completo un banco que no lo está.
    console.log(`    (${sinVerificar.length} sin sembrar, el motor no los resuelve: ${sinVerificar.join(" · ")})`);
  }

  // 4. Usuarios que el registro público no crea
  for (const [rol, datosUsuario] of [
    ["SUPERADMIN", DEMO.admin],
    ["DIRECTOR", DEMO.director],
    ["DOCENTE", DEMO.docente],
  ] as const) {
    const passwordHash = await bcrypt.hash(datosUsuario.password, 10);
    await prisma.usuario.upsert({
      where: { email: datosUsuario.email },
      update: { rol, nombre: datosUsuario.nombre },
      create: {
        email: datosUsuario.email,
        nombre: datosUsuario.nombre,
        passwordHash,
        rol,
      },
    });
    console.log(`  ✓ Usuario ${rol}: ${datosUsuario.email}`);
  }

  console.log("\n  Semilla completada.");
  console.log("  Credenciales de demostración (cámbialas antes de desplegar):");
  console.log(`    SUPERADMIN → ${DEMO.admin.email} / ${DEMO.admin.password}`);
  console.log(`    DIRECTOR   → ${DEMO.director.email} / ${DEMO.director.password}`);
  console.log(`    DOCENTE    → ${DEMO.docente.email} / ${DEMO.docente.password}`);
  console.log("    ESTUDIANTE → regístrate en http://localhost:3000/registro\n");
}

main()
  .catch((e) => {
    console.error("La semilla falló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
