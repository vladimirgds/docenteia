// LAS 16 OBSERVACIONES DEL INFORME DEL CLIENTE, VERIFICADAS EN CHROME
//
// POR QUÉ EXISTE
// El cliente pidió "levantar las observaciones y verificar antes de indicar que
// fueron levantadas". Leer el código no verifica nada: esta batería abre la
// aplicación en un Chrome de verdad, da tres clases enteras —aritmética con
// llevadas, fracciones con MCM y ecuaciones con distributiva, cada una hasta el
// nivel difícil— y MIDE en pantalla, a cada instante, lo que el informe exige:
//
//   OBS-01  En proyección no hay textos de interfaz ("Pizarra de la clase",
//           "Proyéctala en el aula", "Paso 2 de 4", la tira de fases).
//   OBS-02  Los rótulos del dibujo de concepto tienen contraste ≥ 4,5:1.
//   OBS-03  "234 [sumando] + 178 [sumando] = 412 [suma o total]" va en columna:
//           las tres cifras apiladas, alineadas a la derecha, con su nombre.
//   OBS-04  En Concepto y Reglas no aparece ninguna cuenta en columna ni la
//           tarjeta con "24 + 17".
//   OBS-05  Cada texto de la pizarra lleva su rol (TUTOR_DIALOG, BOARD_LABEL,
//           MATH_EXPRESSION) y la fuente de su rol.
//   OBS-06  El encabezado dice "Ejercicio:", en letra de pizarra y más grande.
//   OBS-07  La práctica "678 + 145 = ?" va en columna, con la raya y el "?".
//   OBS-08  El Ambiente 2 va alineado a la izquierda y con 24 px entre notas.
//   OBS-09  Pantalla y proyección enseñan exactamente lo mismo.
//   OBS-10  Las notas de Reglas, alineadas a la izquierda y con 24 px de aire.
//   OBS-11  El MCM va en el Ambiente 2, a la altura del ejercicio.
//   OBS-12  El Ambiente 2 no está vacío durante la suma de fracciones, y el
//           Ambiente 1 no se borra nunca (regla de continuidad).
//   OBS-13  Ni una "/" ni un "*" en el texto visible.
//   OBS-14  La respuesta final va en cápsula esmeralda con el visto a la
//           derecha, en el Ambiente 2, y "Resultado final" con fracción formal.
//   OBS-15  Ningún rótulo ("entre 6", "llevo 1", "× 2") a menos de 8 px de una
//           cifra; "llevo 1" estrictamente encima de su llevada.
//   OBS-16  La distributiva, con una escuadra limpia por debajo de la expresión,
//           punta de flecha de tamaño fijo y el "× 2" debajo sin tocar nada.
//   Y en proyección: fórmulas ≥ 48 px, notas y rótulos ≥ 24 px.
//
// Y LA TERCERA RONDA, rigor matemático y sincronía:
//
//   R3-01  La cancelación de un despeje ocurre DENTRO de su miembro: se escribe
//          la resta en los dos lados y se tachan los opuestos de la izquierda.
//          Ninguna marca cruza el signo igual.
//   R3-02  Lo que la voz multiplica, se ve multiplicado: en Reglas de fracciones
//          la equivalencia se escribe con su factor, no sólo con su resultado.
//   R3-03  Las notas del Ambiente 2 van al paso de la voz: mientras se suman las
//          decenas, la nota de la derecha explica las decenas.
//   R4-01  La pizarra no adelanta pasos: lo que el tutor no ha explicado no está
//          escrito (el cliente fotografió el Ambiente 2 con las tres ecuaciones
//          del ejercicio a la vez, y varias barras de desplazamiento encima).
//   R4-02  El tachado rojo de la cancelación llega CON su frase, no antes.
//   R4-03  Ninguna barra gris de desplazamiento dentro de la pizarra.
//   R3-04  Los dos ambientes se aprovechan: las dos conversiones de una suma de
//          fracciones no caen en el mismo lado.
//
// Y LA SEGUNDA RONDA DEL CLIENTE, las ayudas en la práctica:
//
//   R2-01  «Explicar regla» (y «No entendí este paso») anima el ejercicio a la
//          vez que se explica: la columna que se nombra se enciende y las cifras
//          del resultado se escriben al decirlas, ni antes ni después.
//   R2-02  Tras explicarla, la práctica NO pregunta lo que ya está resuelto en
//          la pizarra: sigue con un ejercicio nuevo, con la pizarra limpia, que
//          se corrige y se cierra como cualquier otro.
//   R2-03  Fracción vertical en toda fórmula y propiedad: ninguna "a/b".
//   R2-04  En proyección, la tarjeta de la regla en proporción con el panel de
//          al lado: su fórmula al tamaño de la de las notas, entera y con margen.
//          Se mide también a 1920 × 1080, el tamaño de una pantalla de aula.
//
// En cada momento clave se para la lección, se fotografía en pantalla y
// proyectada, y las dos capturas quedan en la carpeta de salida como evidencia.
//
// LA VOZ ES FALSA, Y A PROPÓSITO (como en `navegador.mjs`): con una voz de
// duración conocida la clase avanza igual en cualquier equipo.
//
//   node qa/observaciones.mjs [carpeta-de-capturas]
//
// CON VOZ DE VERDAD (QA_VOZ_REAL=1): Chrome con ventana y el motor de voz del
// sistema, sin la voz falsa. Las locuciones duran lo que dura sintetizarlas y
// los eventos de arranque y final son los del motor real. Si el equipo no tiene
// ninguna voz en castellano, se toma la primera que haya y se declara es-ES
// para que la aplicación la use: la pronunciación no importa aquí, el ritmo sí.
//
//   QA_VOZ_REAL=1 QA_CLASES=fracciones node qa/observaciones.mjs qa/.tmp/voz-real

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { resolverEjercicio } from "../lib/leccion/correccion.ts";
import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";

const require = createRequire(import.meta.url);
const CHROME =
  process.env.CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((ruta) => existsSync(ruta));

const SALIDA = process.argv[2] || "qa/.tmp/observaciones";
const VOZ_REAL = process.env.QA_VOZ_REAL === "1";
// Con voz real cada frase dura lo que tarda en decirse: la clase entera, más.
const PRESUPUESTO = VOZ_REAL ? 600_000 : 180_000;
mkdirSync(SALIDA, { recursive: true });

// ── Resultados, agrupados por observación ────────────────────────────────────

const resultados = new Map();
function check(obs, nombre, condicion, detalle = "") {
  if (!resultados.has(obs)) resultados.set(obs, { ok: 0, fallos: [] });
  const r = resultados.get(obs);
  if (condicion) r.ok++;
  else if (!r.fallos.some((f) => f.nombre === nombre && f.detalle === detalle)) {
    r.fallos.push({ nombre, detalle });
    console.log(`  ✗ [${obs}] ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
/** Los valores medidos, para el informe: el mínimo (o el máximo) visto en toda la clase. */
const metricas = {};
function medida(nombre, valor, modo = "min") {
  if (valor == null || !Number.isFinite(valor)) return;
  const antes = metricas[nombre];
  metricas[nombre] = antes == null ? valor : modo === "min" ? Math.min(antes, valor) : Math.max(antes, valor);
}

/** Una comprobación que se hace muchas veces: sólo se anuncia la primera vez que pasa. */
const vistas = new Set();
function anunciar(obs, nombre) {
  const clave = `${obs}|${nombre}`;
  if (vistas.has(clave)) return;
  vistas.add(clave);
  console.log(`  ✓ [${obs}] ${nombre}`);
}
function verificar(obs, nombre, condicion, detalle = "") {
  check(obs, nombre, condicion, detalle);
  if (condicion) anunciar(obs, nombre);
}

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core"));
} catch (e) {
  console.error("\n  ✗ No se ha podido cargar playwright-core: las observaciones NO se han verificado.");
  console.error(`    (${String(e.message).split("\n")[0]})\n`);
  process.exit(1);
}
if (!CHROME) {
  console.error("\n  ✗ No se ha encontrado Chrome ni Edge: las observaciones NO se han verificado.\n");
  process.exit(1);
}
await exigirServidor();

// ── Lo que se mide dentro de la página ───────────────────────────────────────

/**
 * Se instala en la página y devuelve, en un solo objeto, todo lo que el
 * informe exige medir en el estado actual de la pizarra.
 */
function instalarMedidor() {
  const R = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  };
  /** Separación entre dos cajas: la mayor de las holguras en x y en y (negativa si se tocan). */
  const separacion = (a, b) =>
    Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
  const seTocan = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const visible = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    }
    return true;
  };
  /** ¿Texto que se ve? Sin los espacios de anchura cero que KaTeX usa para maquetar. */
  const conTexto = (el) => /[^\s\u200b-\u200d\ufeff]/.test(el.textContent ?? "");
  /** Las cifras y signos visibles de una fórmula, y sus rayas. */
  const glifos = (raiz) =>
    [...raiz.querySelectorAll(".katex-html *")]
      .filter(
        (el) =>
          ((el.childElementCount === 0 && conTexto(el)) ||
            el.classList.contains("hline") ||
            el.classList.contains("frac-line")) &&
          visible(el),
      )
      .map((el) => ({ t: (el.textContent ?? "").trim() || "—", b: R(el), raya: el.childElementCount === 0 && !conTexto(el) }))
      .filter((g) => g.b.w > 0 && g.b.h > 0);
  /** El texto que se VE: sin el MathML oculto de KaTeX. */
  const textoVisible = (el) => {
    if (!el) return "";
    const c = el.cloneNode(true);
    c.querySelectorAll(".katex-mathml, style, script, [hidden]").forEach((n) => n.remove());
    return (c.textContent ?? "")
      // Los espacios de anchura cero con que KaTeX maqueta sus filas no son
      // palabras: una fórmula partida en dos renglones dice lo mismo que en uno.
      .replace(/[​-‍﻿]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };
  const fuenteTex = (el) => {
    if (!el) return "";
    const c = el.cloneNode(true);
    c.querySelectorAll(".katex").forEach((k) => {
      const tex = k.querySelector(".katex-mathml annotation")?.textContent ?? k.textContent ?? "";
      k.replaceWith(document.createTextNode(` ${tex} `));
    });
    return (c.textContent ?? "").replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2").replace(/\s+/g, " ").trim();
  };
  const luminancia = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const leerColor = (css) => {
    const m = String(css).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  const fondoDe = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const c = leerColor(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c.rgb;
    }
    return [255, 255, 255];
  };
  const contraste = (a, b) => {
    const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };

  window.__obs = () => {
    const proy = Boolean(document.querySelector(".modo-proyeccion"));
    const pizarra = document.querySelector(".pz-pizarra");
    const fase = pizarra?.getAttribute("data-fase") ?? "";
    const out = {
      proy,
      fase,
      sub: document.querySelector(".pz-subtitulo")?.textContent ?? "",
      pie: textoVisible(document.querySelector(".pz-pie")),
      pieConFraccion: Boolean(document.querySelector(".pz-pie .katex .mfrac")),
      pregunta: Boolean([...document.querySelectorAll("input")].find((i) => /respuesta/i.test(i.placeholder ?? ""))),
      tablero: textoVisible(document.querySelector(".pz-tablero-cuerpo")),
      estados: [...document.querySelectorAll(".pz-elemento")].map((e) => `${e.closest("[data-ambiente]")?.getAttribute("data-ambiente")}:${e.getAttribute("data-papel")}:${e.getAttribute("data-estado")}`).join("|"),
      // Cada paso, por la LÍNEA DEL GUION de la que viene: no puede haber dos
      // iguales en la pizarra. Se mira la línea y no lo pintado porque los dos
      // tiempos de una cancelación —"2x + 6 = 16" con la resta ya escrita, y
      // "2x + 6 − 6 = 16 − 6" tachada— enseñan lo mismo siendo renglones
      // distintos, y los dos tienen que quedarse (el cliente lo pidió así).
      pasos: [...document.querySelectorAll(".pz-elemento")].map((e) => {
        const dePanel = e.querySelector("[data-texto]")?.getAttribute("data-texto");
        if (dePanel) return dePanel.replace(/\s+/g, "");
        const c = e.cloneNode(true);
        c.querySelectorAll(".katex-mathml, .pz-pie, style").forEach((n) => n.remove());
        return (c.textContent ?? "").replace(/\s+/g, "");
      }),
      resaltados: document.querySelectorAll(".pz-resaltado").length,
      textoProyeccion: proy ? textoVisible(document.querySelector(".modo-proyeccion")) : null,
      encabezado: null,
      ambientes: [],
      etiquetas: [],
      llevadas: [],
      capsulas: [],
      conectores: [],
      barras: [],
      sinRol: [],
      fuenteMala: [],
      tam: { formula: [], nota: [], etiqueta: [], pie: [], rotulo: [] },
      diagrama: [],
      rotulosColumna: null,
      columnasSinRotulo: 0,
      tarjetaRegla: Boolean(document.querySelector(".pz-tarjeta-regla")),
      practicaColumna: null,
      mcm: null,
      preguntaTexto: textoVisible(document.querySelector(".pz-pregunta")),
      // R3-03/04: qué hay escrito en cada ambiente y con qué gesto.
      notas: [...document.querySelectorAll(".pz-nota")].filter(visible).map((n) => textoVisible(n)),
      pasosAmbiente: [...document.querySelectorAll(".pz-elemento")].filter(visible).map((e) => ({
        ambiente: e.closest("[data-ambiente]")?.getAttribute("data-ambiente") ?? "",
        papel: e.getAttribute("data-papel") ?? "",
        gesto: e.querySelector("[data-gesto]")?.getAttribute("data-gesto") ?? "",
      })),
      cancelaciones: [],
      // R4-01: lo que la pizarra pinta sin haberlo explicado todavía. El cliente
      // fotografió el Ambiente 2 con las tres ecuaciones del ejercicio a la vez.
      pendientes: [...document.querySelectorAll('.pz-elemento[data-estado="pendiente"]')].filter(visible).length,
      terminada: Boolean(document.querySelector("[data-terminada='si']")),
      // R4-02: si hay tachado en la pizarra, con qué frase se está diciendo.
      tachados: [...document.querySelectorAll('.pz-elemento[data-estado="activa"] .pz-resaltado[data-tipo="tachado"]')].filter(visible).length,
      pieActivo: textoVisible(document.querySelector(".pz-elemento[data-estado='activa'] .pz-pie")),
      // R4-03: ninguna barra gris nativa dentro de la pizarra.
      barrasScroll: [],
      // La misma pregunta, con cada fórmula en su TeX: el texto visible de una
      // fracción de KaTeX pone el denominador ANTES que el numerador.
      preguntaFuente: fuenteTex(document.querySelector(".pz-pregunta")),
      veredicto: textoVisible(document.querySelector(".pz-veredicto")),
      tarjeta: null,
      notaFormula: [],
      notaTexto: [],
      planteamiento: null,
    };

    // R4-03: UNA BARRA GRIS ES UN DEFECTO. Se cuenta como barra visible todo lo
    // que dentro de la pizarra desborda a lo ancho con `overflow-x` abierto y sin
    // esconder el raíl, y también lo que ya le está robando alto a su caja (que
    // es exactamente lo que se ve en la foto del cliente).
    // Sólo las cajas que pueden desplazarse —no todo el árbol—: esta medida se
    // toma cada pocos milisegundos y recorrerlo entero ralentizaba el muestreo
    // hasta perderse fotogramas de la animación.
    const desplazables = ".pz-tablero-cuerpo, .pz-ambiente, .pz-elemento, .pz-linea-formula, .pz-regla-formula, .pz-animada-formula, .pz-animada, .katex-display, .pz-tarjeta-regla, .pz-encabezado-formula, .pz-nota";
    for (const el of document.querySelectorAll(desplazables)) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const desborda = el.scrollWidth - el.clientWidth > 1;
      const abierto = /auto|scroll/.test(cs.overflowX) && cs.scrollbarWidth !== "none";
      const borde = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      const roba = el.offsetHeight - el.clientHeight - borde > 2 && desborda;
      if ((desborda && abierto) || roba) {
        out.barrasScroll.push(`${(el.className || el.tagName).toString().slice(0, 42)} (${el.scrollWidth}>${el.clientWidth})`);
      }
    }

    // OBS-06: el encabezado.
    const rotulo = document.querySelector(".pz-encabezado-rotulo");
    if (rotulo && visible(rotulo)) {
      const cs = getComputedStyle(rotulo);
      out.encabezado = {
        texto: rotulo.textContent.trim(),
        rol: rotulo.closest("[data-rol]")?.getAttribute("data-rol"),
        fuente: cs.fontFamily,
        tam: parseFloat(cs.fontSize),
        enunciado: document.querySelector(".pz-encabezado-ejercicio")?.getAttribute("data-enunciado") ?? "",
      };
    }

    // OBS-08/10/11/12: los dos ambientes.
    for (const amb of document.querySelectorAll(".pz-ambiente")) {
      const cs = getComputedStyle(amb);
      const caja = R(amb);
      const izquierda = caja.x + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      const hijos = [...amb.children].filter(visible);
      out.ambientes.push({
        n: amb.getAttribute("data-ambiente"),
        caja,
        hueco: parseFloat(cs.rowGap),
        elementos: hijos.length,
        textos: hijos.map((h) => textoVisible(h).slice(0, 80)),
        // Lo que empieza más a la derecha del borde izquierdo del ambiente.
        desalineado: Math.max(0, ...hijos.map((h) => Math.abs(R(h).x - izquierda))),
        // Y las fórmulas: centradas, empezarían muy a la derecha de su bloque
        // (el de KaTeX es centrado por defecto).
        formulaDesplazada: Math.max(
          0,
          ...[...amb.querySelectorAll(".katex-display")].filter(visible).map((d) => {
            const k = d.querySelector(":scope > .katex");
            return k ? Math.max(0, R(k).x - R(d).x) : 0;
          }),
        ),
        alineacion: [...amb.querySelectorAll(".pz-nota, .pz-linea-formula, .katex-display")].filter(visible).map((n) => getComputedStyle(n).textAlign),
      });
      // El CÁLCULO del MCM —"MCM(2, 3): 2 × 3 = 6"— del ejercicio; no la nota de
      // Reglas que sólo lo nombra ("se igualan con el MCM").
      // NADA SE SALE DE SU AMBIENTE: ni por la derecha ("(suma o total)"
      // cortado) ni por debajo del marco de la pizarra.
      const marco = document.querySelector(".pz-tablero-caja");
      const piezas = [...amb.querySelectorAll(".katex-html *, .pz-nota-trozo, .pz-resaltado, .pz-pie")]
        .filter((el) => visible(el) && (el.childElementCount === 0 || el.matches(".pz-nota-trozo, .pz-resaltado, .pz-pie")))
        .map(R)
        .filter((b) => b.w > 0 && b.h > 0);
      out.ambientes.at(-1).sobresaleDerecha = Math.max(0, ...piezas.map((b) => b.x + b.w - (caja.x + caja.w)));
      // Qué línea se sale, para poder arreglarla sin adivinar: se busca por las
      // CIFRAS que sobresalen, porque la caja del paso está recortada al ambiente.
      out.ambientes.at(-1).sobresaleTexto = [
        ...new Set(
          [...amb.querySelectorAll(".katex-html *, .pz-nota-trozo, .pz-resaltado")]
            .filter((el) => visible(el) && el.childElementCount === 0 && R(el).x + R(el).w > caja.x + caja.w + 1)
            .map((el) => textoVisible(el.closest(".pz-elemento") ?? el).slice(0, 70)),
        ),
      ].join(" · ");
      out.ambientes.at(-1).sobresaleAbajo = marco ? Math.max(0, ...piezas.map((b) => b.y + b.h - (R(marco).y + R(marco).h))) : 0;
      const mcm = /ejemplo|practica/i.test(fase) ? hijos.find((h) => /MCM\s*\(/.test(textoVisible(h))) : null;
      if (mcm) out.mcm = { ambiente: amb.getAttribute("data-ambiente"), indice: hijos.indexOf(mcm), y: R(mcm).y };
    }
    const primero1 = document.querySelector('.pz-ambiente[data-ambiente="1"] > *');
    if (out.mcm && primero1) out.mcm.yEjercicio = R(primero1).y;

    // OBS-15/16: los rótulos, las cápsulas y el conector, contra las cifras de SU fórmula.
    for (const formula of document.querySelectorAll(".pz-animada-formula")) {
      if (!visible(formula)) continue;
      const gl = glifos(formula);
      const cifras = gl.filter((g) => !g.raya);
      for (const t of formula.querySelectorAll("[data-etiqueta]")) {
        if (!visible(t)) continue;
        const b = R(t);
        const cerca = cifras.reduce((m, g) => Math.min(m, separacion(b, g.b)), Infinity);
        const rayas = gl.filter((g) => g.raya).reduce((m, g) => Math.min(m, separacion(b, g.b)), Infinity);
        out.etiquetas.push({ texto: t.getAttribute("data-etiqueta"), sep: cerca, sepRaya: rayas, b });
        if (/^llevo|^reagrupo/.test(t.getAttribute("data-etiqueta") ?? "")) {
          // La llevada que acaba de escribirse: la visible más a la derecha
          // de las que están bajo el rótulo.
          // La caja de la CIFRA de la llevada (sus hojas con texto), no la del
          // envoltorio de KaTeX.
          const cajaDeCifra = (el) => {
            const hojas = [el, ...el.querySelectorAll("*")].filter((h) => h.childElementCount === 0 && conTexto(h)).map(R);
            const x = Math.min(...hojas.map((h) => h.x));
            const y = Math.min(...hojas.map((h) => h.y));
            return { x, y, w: Math.max(...hojas.map((h) => h.x + h.w)) - x, h: Math.max(...hojas.map((h) => h.y + h.h)) - y };
          };
          const llevadas = [...formula.querySelectorAll('.katex-html [class*="pz-llevada-"]')].filter(visible).map(cajaDeCifra);
          const bajo = llevadas.filter((l) => l.x < b.x + b.w && l.x + l.w > b.x);
          const suya = bajo.sort((a, c) => Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) - Math.abs(c.x + c.w / 2 - (b.x + b.w / 2)))[0];
          out.llevadas.push({ texto: t.getAttribute("data-etiqueta"), hay: Boolean(suya), encima: suya ? suya.y - (b.y + b.h) : null });
        }
      }
      for (const rect of formula.querySelectorAll(".pz-marco-final")) {
        if (!visible(rect)) continue;
        const b = R(rect);
        const trazo = parseFloat(getComputedStyle(rect).strokeWidth) || 2;
        const fuera = { x: b.x - trazo / 2, y: b.y - trazo / 2, w: b.w + trazo, h: b.h + trazo };
        const dentro = { x: b.x + trazo / 2, y: b.y + trazo / 2, w: b.w - trazo, h: b.h - trazo };
        const cruzan = gl.filter((g) => {
          const enteroDentro = g.b.x >= dentro.x && g.b.x + g.b.w <= dentro.x + dentro.w && g.b.y >= dentro.y && g.b.y + g.b.h <= dentro.y + dentro.h;
          return !enteroDentro && seTocan(g.b, fuera);
        });
        const visto = rect.parentElement?.querySelector(".pz-visto");
        const v = visto ? R(visto) : null;
        const cs = getComputedStyle(rect);
        out.capsulas.push({
          ambiente: formula.closest("[data-ambiente]")?.getAttribute("data-ambiente"),
          cruzan: cruzan.map((g) => g.t),
          redondeada: Number(rect.getAttribute("rx")) >= 8,
          borde: cs.stroke,
          relleno: cs.fill,
          visto: v ? { aLaDerecha: v.x >= b.x + b.w, centrado: v.y + v.h / 2 >= b.y && v.y + v.h / 2 <= b.y + b.h } : null,
        });
      }
      for (const g of formula.querySelectorAll('[data-tipo="reparto"]')) {
        if (!visible(g)) continue;
        const camino = g.querySelector("path.pz-conector");
        const d = camino?.getAttribute("d") ?? "";
        const escuadra = /^M [-\d.]+ [-\d.]+ V [-\d.]+ H [-\d.]+ V [-\d.]+$/.test(d);
        const barra = Number(d.split(" ")[4]);
        const marker = g.querySelector("marker");
        const base = R(formula);
        // Se recorre el trazo punto a punto: ninguno puede caer sobre una cifra.
        const nums = d.split(" ").filter((x) => /^[-\d.]+$/.test(x)).map(Number);
        const [x0, y0, yb, x1, y1] = nums;
        const puntos = [];
        for (let y = Math.min(y0, yb); y <= Math.max(y0, yb); y += 2) puntos.push([x0, y]);
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 2) puntos.push([x, yb]);
        for (let y = Math.min(y1, yb); y <= Math.max(y1, yb); y += 2) puntos.push([x1, y]);
        const pisa = puntos.filter(([x, y]) => cifras.some((c) => x + base.x > c.b.x && x + base.x < c.b.x + c.b.w && y + base.y > c.b.y && y + base.y < c.b.y + c.b.h)).length;
        const t = g.querySelector("[data-etiqueta]");
        const bt = t ? R(t) : null;
        out.conectores.push({
          escuadra,
          pisa,
          marcaFija: marker?.getAttribute("markerUnits") === "userSpaceOnUse",
          punta: Number(marker?.getAttribute("markerWidth") ?? 0),
          etiqueta: t?.getAttribute("data-etiqueta") ?? null,
          etiquetaDebajo: bt ? bt.y - (barra + base.y) : null,
          etiquetaSep: bt ? cifras.reduce((m, c) => Math.min(m, separacion(bt, c.b)), Infinity) : null,
        });
      }
    }

    // OBS-13: ni "/" ni "*" en el texto que se ve.
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest(".katex-mathml, script, style, noscript")) continue;
      if (/[/*]/.test(n.textContent ?? "") && visible(el)) out.barras.push((n.textContent ?? "").trim().slice(0, 60));
    }

    // OBS-05: el rol y la fuente de cada texto del contenido.
    const zonas = [
      ...document.querySelectorAll(
        ".pz-tablero-caja, .pz-subtitulo, .pz-retroalimentacion, .pz-avatar-estado, .pz-pregunta, .pz-veredicto",
      ),
    ];
    for (const zona of zonas) {
      const w = document.createTreeWalker(zona, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const texto = (n.textContent ?? "").trim();
        const el = n.parentElement;
        if (!texto || !el || el.closest(".katex-mathml, style") || !visible(el)) continue;
        const conRol = el.closest("[data-rol]");
        if (!conRol) {
          out.sinRol.push(texto.slice(0, 50));
          continue;
        }
        const rol = conRol.getAttribute("data-rol");
        const fuente = getComputedStyle(el).fontFamily;
        const enFormula = el.closest(".katex") && !el.closest(".pz-palabra");
        const esperada = enFormula
          ? /KaTeX/
          : rol === "TUTOR_DIALOG"
            ? /^"?(Inter|Segoe UI)/
            : rol === "BOARD_LABEL" || el.closest(".pz-palabra")
              ? /^"?Chalkboard SE/
              : /KaTeX/;
        if (!esperada.test(fuente)) out.fuenteMala.push(`${rol}: «${texto.slice(0, 30)}» en ${fuente.split(",")[0]}`);
      }
    }

    // Tamaños (se leen en proyección).
    const px = (el) => parseFloat(getComputedStyle(el).fontSize);
    for (const k of document.querySelectorAll(".pz-ambientes .katex, .pz-encabezado-formula .katex")) {
      if (!visible(k) || k.closest(".pz-pie")) continue;
      out.tam.formula.push(px(k));
    }
    for (const n of document.querySelectorAll(".pz-nota, .pz-palabra")) if (visible(n)) out.tam.nota.push(px(n));
    for (const t of document.querySelectorAll(".pz-etiqueta[data-etiqueta]")) if (visible(t)) out.tam.etiqueta.push(px(t));
    for (const t of document.querySelectorAll(".pz-pie")) if (visible(t)) out.tam.pie.push(px(t));
    for (const t of document.querySelectorAll(".pz-encabezado-rotulo")) if (visible(t)) out.tam.rotulo.push(px(t));

    // R2-04: la tarjeta de la regla frente a las notas del panel de al lado.
    for (const k of document.querySelectorAll(".pz-nota .katex")) if (visible(k) && !k.closest(".pz-pie")) out.notaFormula.push(px(k));
    for (const n of document.querySelectorAll(".pz-nota")) if (visible(n)) out.notaTexto.push(px(n));
    const tarjeta = document.querySelector(".pz-tarjeta-regla");
    if (tarjeta && visible(tarjeta)) {
      const formulas = [...tarjeta.querySelectorAll(".pz-regla-formula .katex")].filter(visible);
      const amb = tarjeta.closest(".pz-ambiente");
      const marco = document.querySelector(".pz-tablero-caja");
      out.tarjeta = {
        formula: Math.max(0, ...formulas.map(px)),
        nombre: px(tarjeta.querySelector(".pz-tarjeta-regla-nombre") ?? tarjeta),
        // Una fórmula que no cabe se desplaza dentro de su caja: se vería cortada.
        recortada: [...tarjeta.querySelectorAll(".katex-display, .pz-regla-formula")].some((d) => d.scrollWidth > d.clientWidth + 1),
        margenDerecho: amb ? R(amb).x + R(amb).w - (R(tarjeta).x + R(tarjeta).w) : 0,
        altoRelativo: marco ? R(tarjeta).h / R(marco).h : 0,
        fracciones: tarjeta.querySelectorAll(".katex .mfrac").length,
        conFraccion: [...tarjeta.querySelectorAll(".katex-mathml annotation")].some((a) => (a.textContent ?? "").includes("\\frac")),
      };
    }

    // R3-01: la cancelación de un despeje, contra el signo igual de SU línea.
    for (const formula of document.querySelectorAll(".pz-animada-formula")) {
      const marcas = [...formula.querySelectorAll('[class*="pz-cancela-"]')].filter(visible);
      if (marcas.length === 0) continue;
      const iguales = [...formula.querySelectorAll(".katex-html *")]
        .filter((el) => el.childElementCount === 0 && (el.textContent ?? "").trim() === "=" && visible(el))
        .map(R);
      // El primer igual de la línea. Las marcas de una cancelación tienen que
      // estar TODAS del mismo lado de él: una constante se cancela a la
      // izquierda ("2x + 6 − 6 = 16 − 6") y los términos con incógnita a la
      // derecha ("2x + 8 − 3x = 3x − 1 − 3x"). Lo que no puede pasar nunca —y es
      // lo que fotografió el cliente— es que una marca empiece en un miembro y
      // acabe en el otro.
      const igual = iguales.sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null;
      const cajas = marcas.map(R);
      const aLaDerecha = igual ? cajas.filter((b) => b.x >= igual.x + igual.w).length : 0;
      out.cancelaciones.push({
        texto: textoVisible(formula),
        marcas: marcas.length,
        // Repartidas entre los dos miembros = una marca cruza el igual.
        trasElIgual: igual && aLaDerecha > 0 && aLaDerecha < cajas.length ? aLaDerecha : 0,
        // Y ninguna marca, por sí sola, puede empezar antes del igual y acabar después.
        aCaballo: igual ? cajas.filter((b) => b.x < igual.x && b.x + b.w > igual.x + igual.w).length : 0,
        clases: marcas.map((m) => [...m.classList].find((c) => c.startsWith("pz-cancela-")) ?? "").filter(Boolean),
      });
    }

    // R2-01: el planteamiento del ejercicio —¿se anima?, ¿qué cifras del
    // resultado se ven ya bajo la raya?—.
    const elPlan = document.querySelector('.pz-elemento[data-papel="planteamiento"]');
    if (elPlan && visible(elPlan)) {
      const k = elPlan.querySelector(".katex");
      const raya = k?.querySelector(".hline");
      const gl = k ? glifos(k) : [];
      const bajoLaRaya = raya ? gl.filter((g) => !g.raya && /^\d+$/.test(g.t) && g.b.y + g.b.h / 2 > R(raya).y + R(raya).h) : [];
      out.planteamiento = {
        estado: elPlan.getAttribute("data-estado"),
        foco: [...elPlan.querySelectorAll(".pz-resaltado")].some(visible),
        cifrasResultado: bajoLaRaya.reduce((n, g) => n + g.t.length, 0),
      };
    }

    // OBS-02: el contraste de los rótulos del dibujo.
    for (const t of document.querySelectorAll(".pz-diagrama text")) {
      if (!visible(t) || !(t.textContent ?? "").trim()) continue;
      const c = leerColor(getComputedStyle(t).fill);
      if (!c) continue;
      out.diagrama.push({ texto: t.textContent.trim(), ratio: contraste(c.rgb, fondoDe(t.closest("svg") ?? t)) });
    }

    // OBS-03/04: las cuentas en columna de Concepto y Reglas.
    for (const k of document.querySelectorAll(".pz-ambientes .katex")) {
      if (!visible(k) || !k.querySelector(".hline")) continue;
      if (k.querySelector(".pz-palabra")) {
        const numeros = [...k.querySelectorAll(".katex-html *")]
          .filter((el) => el.childElementCount === 0 && /^\d+$/.test((el.textContent ?? "").trim()) && !el.closest(".pz-palabra"))
          .map((el) => ({ n: el.textContent.trim(), b: R(el) }));
        // Las cifras de un mismo número salen en spans vecinos: se agrupan por renglón.
        const filas = [];
        for (const d of numeros) {
          const fila = filas.find((f) => Math.abs(f.y - d.b.y) < 4);
          if (fila) {
            fila.n += d.n;
            fila.derecha = Math.max(fila.derecha, d.b.x + d.b.w);
          } else filas.push({ n: d.n, y: d.b.y, derecha: d.b.x + d.b.w });
        }
        filas.sort((a, b) => a.y - b.y);
        out.rotulosColumna = {
          numeros: filas.map((f) => f.n),
          apiladas: filas.every((f, i) => i === 0 || f.y > filas[i - 1].y + 4),
          alineadas: filas.length > 0 && Math.max(...filas.map((f) => f.derecha)) - Math.min(...filas.map((f) => f.derecha)) < 3,
          palabras: [...k.querySelectorAll(".pz-palabra")].map((p) => p.textContent.trim()),
        };
      } else {
        out.columnasSinRotulo++;
      }
    }

    // OBS-07: la práctica en columna, con su "?" bajo la raya.
    const plan = document.querySelector('.pz-elemento[data-papel="planteamiento"] .katex');
    if (plan && visible(plan)) {
      const raya = plan.querySelector(".hline");
      const interrogacion = [...plan.querySelectorAll(".katex-html *")].find((el) => el.childElementCount === 0 && el.textContent.trim() === "?");
      // Por el CENTRO del "?": la caja de un glifo de KaTeX es el renglón entero,
      // más alta que el trazo, y su borde de arriba puede quedar sobre la raya.
      const centro = (b) => b.y + b.h / 2;
      out.practicaColumna = {
        columna: Boolean(raya),
        interrogacionBajoLaRaya: Boolean(raya && interrogacion && centro(R(interrogacion)) > R(raya).y + R(raya).h),
        texto: textoVisible(plan),
      };
    }
    return out;
  };
}

/** La voz de prueba: una es-ES con la duración de una voz real (~35 ms por carácter). */
function instalarVoz() {
  const voz = { name: "QA es-ES", lang: "es-ES", default: true, localService: true };
  window.SpeechSynthesisUtterance = class {
    constructor(t) {
      Object.assign(this, { text: t, lang: "", voice: null, rate: 1, pitch: 1, onstart: null, onend: null, onerror: null });
    }
  };
  const s = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => [voz],
    addEventListener() {},
    removeEventListener() {},
    onvoiceschanged: null,
    speak(u) {
      s.speaking = true;
      const d = Math.max(500, Math.min(4500, u.text.length * 35));
      u._a = setTimeout(() => u.onstart?.({ charIndex: 0 }), 60);
      u._b = setTimeout(() => {
        s.speaking = false;
        u.onend?.({ charIndex: u.text.length });
      }, d);
      u._c = () => {
        clearTimeout(u._a);
        clearTimeout(u._b);
      };
      s._u = u;
    },
    cancel() {
      const u = s._u;
      if (u) {
        u._c?.();
        s._u = null;
        s.speaking = false;
        u.onend?.({ charIndex: 0 });
      }
    },
    pause() {},
    resume() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: s, configurable: true });
}

// ── Las tres clases ──────────────────────────────────────────────────────────

const navegador = await chromium.launch({
  executablePath: CHROME,
  headless: !VOZ_REAL,
  args: VOZ_REAL ? ["--autoplay-policy=no-user-gesture-required"] : [],
});

/** Con voz real y sin voces en castellano: la primera voz del sistema, declarada es-ES. */
function vozDelSistemaEnCastellano() {
  const original = speechSynthesis.getVoices.bind(speechSynthesis);
  speechSynthesis.getVoices = () => {
    const voces = original();
    if (voces.some((v) => /^es/i.test(v.lang))) return voces;
    const primera = voces[0];
    if (primera && !primera.__es) {
      try {
        Object.defineProperty(primera, "lang", { value: "es-ES" });
        primera.__es = true;
      } catch {
        // Si el navegador no deja reetiquetarla, la clase irá por subtítulos temporizados.
      }
    }
    return voces;
  };
}
const url = new URL(BASE);
const erroresDeConsola = [];
const capturas = [];
let vozUsada = null;

async function abrirClase({ etapa, curso, tema, nivel, viewport = { width: 1366, height: 900 } }) {
  const correo = `qa.obs.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@mentoriamath.local`;
  const clave = "Alumno-2026";
  const alta = await registrarAlumno(BASE, { email: correo, password: clave, nombre: "QA Observaciones" });
  await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: alta.sesion },
    body: JSON.stringify({ etapa, curso }),
  });
  const diag = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })).json();
  await fetch(`${BASE}/api/diagnostico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: alta.sesion },
    body: JSON.stringify({
      respuestas: (diag.preguntas ?? []).map((p) => ({ preguntaId: p.id, respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0" })),
    }),
  });
  // EL NIVEL DEL ALUMNO DE PRUEBA, PUESTO A MANO. El diagnóstico se responde a
  // ciegas y deja siempre "Básico"; la suma de tres cifras con la que el
  // cliente vio los rótulos en horizontal ("234 [sumando] + 178…") sólo sale en
  // "Avanzado". Se toca únicamente el perfil del alumno recién creado.
  if (nivel) {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    try {
      await db.perfilEstudiante.update({ where: { usuarioId: (await db.usuario.findUniqueOrThrow({ where: { email: correo } })).id }, data: { nivelActual: nivel } });
    } finally {
      await db.$disconnect();
    }
  }
  const sesion = (await iniciarSesion(BASE, correo, clave)) ?? alta.sesion;
  const ctx = await navegador.newContext({ viewport });
  await ctx.addCookies(
    sesion.split(";").map((par) => {
      const [name, ...r] = par.trim().split("=");
      return { name, value: r.join("="), domain: url.hostname, path: "/", httpOnly: false, secure: false };
    }),
  );
  await ctx.addInitScript(VOZ_REAL ? vozDelSistemaEnCastellano : instalarVoz);
  await ctx.addInitScript(instalarMedidor);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erroresDeConsola.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erroresDeConsola.push(m.text()));
  await p.goto(`${BASE}/estudiante/leccion`, { waitUntil: "networkidle" });
  const temas = await p.locator(".text-lg").allTextContents();
  const i = Math.max(0, temas.findIndex((t) => tema.test(t)));
  await p.getByRole("button", { name: /Empezar|Desde el principio/ }).nth(i).click();
  // Qué voz está usando la clase (la tarjeta del avatar lo dice): con voz real
  // tiene que ser la del sistema, no la de prueba.
  let voz = null;
  for (let k = 0; k < 20 && !voz; k++) {
    voz = await p.evaluate(() =>
      [...document.querySelectorAll("p, span, div")].map((e) => (e.textContent ?? "").trim()).find((t) => /^voz(:| del | neuronal)|^sin TTS/.test(t)),
    );
    if (!voz) await p.waitForTimeout(250);
  }
  console.log(`  · ${voz ?? "voz: (sin indicar)"}`);
  vozUsada ??= voz;
  return { p, ctx };
}

const proyectar = async (p, activar) => {
  const b = p.getByRole("button", { name: activar ? /Modo proyección/ : /Salir de proyección/ }).first();
  if (await b.count()) await b.click();
  await p.waitForTimeout(450);
};
const pulsar = async (p, nombre) => {
  const b = p.locator(".pz-mandos button", { hasText: nombre }).first();
  if (await b.count()) {
    await b.click();
    return true;
  }
  return false;
};

/** Las comprobaciones que valen en CUALQUIER instante de la clase. */
function comprobarSiempre(m, clase) {
  verificar("OBS-13", "ni «/» ni «*» en el texto visible", m.barras.length === 0, m.barras.join(" · "));
  verificar("OBS-05", "todo texto de la pizarra lleva su rol semántico", m.sinRol.length === 0, m.sinRol.slice(0, 4).join(" · "));
  verificar("OBS-05", "cada rol en su fuente (sans limpia · Chalkboard SE · KaTeX)", m.fuenteMala.length === 0, m.fuenteMala.slice(0, 3).join(" · "));
  for (const e of m.etiquetas) medida("rotulo_a_cifra_px_min", e.sep);
  for (const l of m.llevadas) medida("llevo1_sobre_su_llevada_px_min", l.encima);
  for (const c of m.conectores) {
    medida("conector_rotulo_bajo_escuadra_px_min", c.etiquetaDebajo);
    medida("conector_punta_px_max", c.punta, "max");
  }
  for (const a of m.ambientes) medida("ambiente_hueco_entre_notas_px_min", a.hueco);
  for (const e of m.etiquetas) {
    verificar("OBS-15", "ningún rótulo a menos de 8 px de una cifra", e.sep >= 7.5, `${e.texto}: ${e.sep.toFixed(1)} px (${clase})`);
  }
  for (const l of m.llevadas) {
    verificar("OBS-15", "«llevo 1» estrictamente encima de su llevada, sin tocarla", l.hay && l.encima >= 7.5, `${l.texto}: ${l.encima == null ? "sin llevada debajo" : `${l.encima.toFixed(1)} px`}`);
  }
  for (const c of m.capsulas) {
    verificar("OBS-14", "la cápsula de la respuesta no cruza ninguna cifra ni raya", c.cruzan.length === 0, `cruza ${c.cruzan.join(" ")} (${clase})`);
    verificar("OBS-14", "cápsula redondeada, borde esmeralda (#10b981)", c.redondeada && /16, 185, 129/.test(c.borde), c.borde);
    verificar("OBS-14", "el visto va a la derecha de la cápsula, a su altura", Boolean(c.visto?.aLaDerecha && c.visto?.centrado), JSON.stringify(c.visto));
  }
  for (const c of m.conectores) {
    verificar("OBS-16", "el conector es una escuadra (baja, cruza por debajo, sube)", c.escuadra);
    verificar("OBS-16", "el conector no pasa por encima de ninguna cifra", c.pisa === 0, `${c.pisa} puntos sobre cifras`);
    verificar("OBS-16", "la punta de flecha tiene tamaño fijo (≤ 14 px)", c.marcaFija && c.punta > 0 && c.punta <= 14, `${c.punta}`);
    verificar("OBS-16", "el «× n» va debajo de la escuadra, sin tocarla", c.etiqueta && c.etiquetaDebajo >= 7.5, `${c.etiqueta}: ${c.etiquetaDebajo}`);
    verificar("OBS-16", "el «× n» no toca ninguna cifra", c.etiquetaSep >= 7.5, `${c.etiquetaSep}`);
  }
  if (m.encabezado) {
    verificar("OBS-06", "el encabezado dice «Ejercicio:»", /^Ejercicio( \d+)?:$/.test(m.encabezado.texto), m.encabezado.texto);
    verificar("OBS-06", "«Ejercicio:» en letra de pizarra (Chalkboard SE)", m.encabezado.rol === "BOARD_LABEL" && /^"?Chalkboard SE/.test(m.encabezado.fuente), m.encabezado.fuente);
  }
  for (const a of m.ambientes) {
    verificar(a.n === "2" ? "OBS-08" : "OBS-10", `Ambiente ${a.n}: 24 px (gap-6) entre notas`, a.hueco >= 23.5, `${a.hueco} px`);
    verificar(a.n === "2" ? "OBS-08" : "OBS-10", `Ambiente ${a.n}: todo alineado a la izquierda`, a.desalineado <= 2 && a.formulaDesplazada <= 8 && a.alineacion.every((t) => t === "left" || t === "start"), `desvío ${a.desalineado.toFixed(1)} / ${a.formulaDesplazada.toFixed(1)} px ${a.alineacion.join(",")}`);
  }
  {
    const repetidos = m.pasos.filter((t, i) => t && m.pasos.indexOf(t) !== i);
    verificar("SUB-PIZ-02", "ningún paso se escribe dos veces (tampoco al reanudar tras una pausa)", repetidos.length === 0, `${repetidos.slice(0, 2).join(" · ")} (${clase})`);
  }
  for (const a of m.ambientes) {
    verificar("SUB-PIZ-02", `Ambiente ${a.n}: nada se sale por la derecha`, a.sobresaleDerecha <= 1, `${a.sobresaleDerecha.toFixed(1)} px en «${a.sobresaleTexto ?? ""}» (${clase}${m.proy ? ", proyección" : ""})`);
    // En pantalla la pizarra tiene su propio desplazamiento; proyectada, todo en una sola pantalla.
    if (m.proy) verificar("SUB-PIZ-02", `Ambiente ${a.n}: proyectado, todo cabe en una sola pantalla`, a.sobresaleAbajo <= 1, `${a.sobresaleAbajo.toFixed(1)} px (${clase})`);
  }
  if (m.ambientes.length === 2) {
    const [a1, a2] = m.ambientes;
    verificar("OBS-08", "los dos ambientes miden lo mismo (50 % / 50 %)", Math.abs(a1.caja.w - a2.caja.w) <= 2, `${a1.caja.w.toFixed(0)} / ${a2.caja.w.toFixed(0)}`);
  }

  // R3-01: ninguna marca de cancelación a la derecha del igual.
  for (const c of m.cancelaciones) {
    verificar("R3-01", "la cancelación se tacha DENTRO de su miembro, sin cruzar el igual", c.trasElIgual === 0 && (c.aCaballo ?? 0) === 0, `«${c.texto}»: ${c.trasElIgual} de ${c.marcas} marcas repartidas entre los dos miembros, ${c.aCaballo ?? 0} a caballo del igual (${clase})`);
    // Antes de destaparse, sólo está el término; al destaparse, su opuesto al lado.
    verificar("R3-01", "…y lo que se tacha es el término y su opuesto, nunca el número del otro miembro", JSON.stringify([...new Set(c.clases)].sort()) === JSON.stringify(c.clases.length > 1 ? ["pz-cancela-opuesto", "pz-cancela-termino"] : ["pz-cancela-termino"]), `${c.clases.join(",")} (${clase})`);
  }

  // R3-02: lo que la voz multiplica, se ve multiplicado.
  if (/multiplicas arriba y abajo/i.test(m.sub)) {
    const equivalencia = m.notas.find((t) => /equivalentes/i.test(t)) ?? m.tablero;
    verificar("R3-02", "cuando la voz multiplica arriba y abajo, la pizarra enseña esa multiplicación", /×/.test(equivalencia), `«${String(equivalencia).slice(0, 80)}» (${clase})`);
  }

  // R3-03: la nota de la derecha explica la columna que se está sumando.
  const columna = String(m.sub ?? "").match(/^(?:Sumamos|Restamos|Multiplicamos|Dividimos) las (unidades|decenas|centenas|unidades de millar)/)?.[1];
  if (columna && m.notas.length > 0) {
    verificar("R3-03", "mientras la voz suma una columna, la nota de la derecha es la de ESA columna", m.notas.some((t) => new RegExp(`^${columna}`, "i").test(t.trim())), `«${m.sub.slice(0, 40)}» con ${JSON.stringify(m.notas.map((t) => t.slice(0, 18)))} (${clase})`);
  }

  // R3-04: las dos conversiones de una suma de fracciones, una a cada lado.
  const amplificaciones = m.pasosAmbiente.filter((p) => p.gesto === "amplificacion");
  if (amplificaciones.length >= 2) {
    verificar("R3-04", "las dos conversiones no caen en el mismo ambiente", new Set(amplificaciones.map((p) => p.ambiente)).size >= 2, `${amplificaciones.map((p) => p.ambiente).join(",")} (${clase})`);
  }
  // Y el Ambiente 2 no se queda con una sola línea mientras el 1 acumula pasos.
  // (Sólo donde hay ejercicio: en Reglas, el Ambiente 1 lleva la tarjeta —que no
  // es un paso— y las notas van todas al 2.)
  const enUno = m.pasosAmbiente.filter((p) => p.ambiente === "1").length;
  const enDos = m.pasosAmbiente.filter((p) => p.ambiente === "2").length;
  if (/ejemplo|practica/i.test(m.fase) && enUno + enDos >= 4) {
    verificar("R3-04", "con el procedimiento avanzado, los dos ambientes llevan contenido", enUno >= 1 && enDos >= 1, `${enUno} / ${enDos} (${clase})`);
  }

  // R4-01: LA PIZARRA NO ADELANTA NADA. Mientras la clase no ha terminado, no
  // puede haber en la pizarra una línea que el tutor todavía no ha explicado:
  // eso es lo que llenaba el Ambiente 2 de ecuaciones y lo llenaba de barras.
  verificar(
    "R4-01",
    "no hay pasos futuros pintados en la pizarra: sólo lo ya explicado",
    m.terminada || m.pendientes === 0,
    `${m.pendientes} pendientes a la vista (${clase})`,
  );

  // R4-02: EL TACHADO LLEGA CON SU FRASE. En la línea que se está explicando no
  // puede haber un aspa roja mientras la voz aún no ha dicho que se cancela: el
  // paso se cuenta en dos tiempos —se escribe la resta, y después se tacha—.
  if (m.tachados > 0) {
    verificar(
      "R4-02",
      "el tachado rojo sólo aparece cuando el tutor está diciendo que se cancela",
      /cancel/i.test(m.pieActivo ?? ""),
      `«${(m.pieActivo ?? "").slice(0, 70)}» (${clase})`,
    );
  }

  // R4-03: ninguna barra gris nativa, ni en pantalla ni proyectando.
  verificar(
    "R4-03",
    "ninguna barra de desplazamiento horizontal dentro de la pizarra",
    m.barrasScroll.length === 0,
    `${m.barrasScroll.slice(0, 3).join(" · ")} (${clase})`,
  );
}

/** En proyección: sin textos de interfaz y a tamaño de aula. */
function comprobarProyeccion(m, momento) {
  const parasitos = ["Pizarra de la clase", "Pizarra de clase", "Proyéctala", "Paso ", "línea ", "Concepto", "Reglas y propiedades", "Ejemplo paso a paso", "Práctica", "MentorIA Math"];
  const hallados = parasitos.filter((t) => m.textoProyeccion?.includes(t));
  verificar("OBS-01", "la proyección no enseña textos de interfaz", hallados.length === 0, `${momento}: ${hallados.join(", ")}`);
  const min = (xs) => (xs.length ? Math.min(...xs) : Infinity);
  medida("proyeccion_formula_px_min", min(m.tam.formula));
  medida("proyeccion_nota_px_min", min(m.tam.nota));
  medida("proyeccion_rotulo_marca_px_min", min(m.tam.etiqueta));
  medida("proyeccion_frase_tutor_px_min", min(m.tam.pie));
  medida("proyeccion_ejercicio_px_min", min(m.tam.rotulo));
  for (const d of m.diagrama) medida("proyeccion_contraste_dibujo_min", d.ratio);
  verificar("SUB-PRJ-03", "proyección: fórmulas ≥ 48 px", min(m.tam.formula) >= 47.5, `${momento}: ${min(m.tam.formula).toFixed(1)} px`);
  verificar("SUB-PRJ-03", "proyección: notas ≥ 24 px", min(m.tam.nota) >= 24, `${momento}: ${min(m.tam.nota).toFixed(1)} px`);
  verificar("SUB-PRJ-03", "proyección: rótulos de las marcas ≥ 24 px", min(m.tam.etiqueta) >= 24, `${momento}: ${min(m.tam.etiqueta).toFixed(1)} px`);
  verificar("SUB-PRJ-03", "proyección: la frase del tutor ≥ 24 px", min(m.tam.pie) >= 24, `${momento}: ${min(m.tam.pie).toFixed(1)} px`);
  verificar("OBS-06", "proyección: «Ejercicio:» ≥ 24 px", min(m.tam.rotulo) >= 24, `${momento}: ${min(m.tam.rotulo).toFixed(1)} px`);
  for (const d of m.diagrama) verificar("OBS-02", "proyección: rótulos del dibujo con contraste ≥ 4,5:1", d.ratio >= 4.5, `«${d.texto}» ${d.ratio.toFixed(2)}:1`);
  if (m.tarjeta) {
    // La fórmula de las notas de al lado; sin notas, la de cualquier nota (48 px).
    const deLasNotas = m.notaFormula.length ? Math.max(...m.notaFormula) : 48;
    const textoNotas = m.notaTexto.length ? Math.max(...m.notaTexto) : m.tarjeta.nombre;
    medida("proyeccion_tarjeta_formula_px_max", m.tarjeta.formula, "max");
    medida("proyeccion_tarjeta_alto_relativo_max", m.tarjeta.altoRelativo, "max");
    verificar("R2-04", "proyección: la fórmula de la tarjeta, al tamaño de la de las notas (no mayor)", m.tarjeta.formula <= deLasNotas + 0.5, `${m.tarjeta.formula.toFixed(1)} px frente a ${deLasNotas.toFixed(1)} px (${momento})`);
    verificar("R2-04", "proyección: …y nunca por debajo de los 48 px de aula", m.tarjeta.formula >= 47.5, `${m.tarjeta.formula.toFixed(1)} px (${momento})`);
    verificar("R2-04", "proyección: el nombre de la regla, al tamaño del texto de las notas", Math.abs(m.tarjeta.nombre - textoNotas) <= 1, `${m.tarjeta.nombre.toFixed(1)} / ${textoNotas.toFixed(1)} px (${momento})`);
    verificar("R2-04", "proyección: la tarjeta cabe entera (ninguna fórmula cortada ni desplazable)", !m.tarjeta.recortada, momento);
    verificar("R2-04", "proyección: la tarjeta no toca el borde de su ambiente", m.tarjeta.margenDerecho >= 0, `${m.tarjeta.margenDerecho.toFixed(1)} px (${momento})`);
    if (m.tarjeta.conFraccion) verificar("R2-03", "la tarjeta compone sus fracciones con raya horizontal", m.tarjeta.fracciones > 0, momento);
  }
}

/**
 * Un momento clave: se para la clase, se mide y fotografía en pantalla y en
 * proyección, y se comparan las dos (OBS-09).
 */
async function momento(p, clase, nombre) {
  // El "Pausa" de la tarjeta del avatar existe en todas las fases; el del panel,
  // sólo cuando hay pasos animados.
  const pausa = p.getByRole("button", { name: /^Pausa$/ }).first();
  const pausada = (await pausa.count()) ? (await pausa.click(), true) : await pulsar(p, "Pausar");
  await p.waitForTimeout(400);
  const a = await p.evaluate(() => window.__obs());
  const f1 = `${SALIDA}/${clase}-${nombre}-pantalla.png`;
  await p.screenshot({ path: f1 });
  await proyectar(p, true);
  const b = await p.evaluate(() => window.__obs());
  const f2 = `${SALIDA}/${clase}-${nombre}-proyeccion.png`;
  await p.screenshot({ path: f2 });
  await proyectar(p, false);
  const c = await p.evaluate(() => window.__obs());
  if (pausada) {
    const reanudar = p.getByRole("button", { name: /^Reanudar$/ }).first();
    if (await reanudar.count()) await reanudar.click();
  }
  capturas.push({ clase, nombre, pantalla: f1, proyeccion: f2 });
  console.log(`  · ${clase}: ${nombre}`);

  comprobarSiempre(a, clase);
  comprobarSiempre(b, clase);
  comprobarProyeccion(b, `${clase}/${nombre}`);
  // El espejo: con la clase parada, lo mismo en las dos vistas.
  if (a.tablero === c.tablero && a.estados === c.estados) {
    verificar("OBS-09", "pantalla y proyección enseñan la misma pizarra, palabra por palabra", a.tablero === b.tablero, `${clase}/${nombre}`);
    verificar("OBS-09", "…con los mismos pasos en el mismo estado", a.estados === b.estados, `${a.estados} ≠ ${b.estados}`);
    verificar("OBS-09", "…y las mismas marcas", a.resaltados === b.resaltados, `${a.resaltados} ≠ ${b.resaltados}`);
  }
  return { a, b };
}

// ── Segunda ronda: las ayudas en la práctica ─────────────────────────────────

/** Las cifras de un texto, para reconocer un ejercicio dentro de una frase. */
const SUPERINDICES = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const cifrasDe = (t) =>
  String(t ?? "")
    .replace(/=\s*\?\s*$/, "")
    // "2x⁴" y "2x^{4}" son el mismo ejercicio: el exponente cuenta como cifra.
    .replace(/[⁰¹²³⁴-⁹]/g, (c) => SUPERINDICES[c] ?? "")
    .replace(/\D+/g, "");
/** El lugar de cada columna, por su nombre: la voz dice cuál está sumando. */
const COLUMNAS = { unidades: 0, decenas: 1, centenas: 2 };

/**
 * PULSA UN BOTÓN DE AYUDA CON LA PREGUNTA DE LA PRÁCTICA DELANTE y sigue la
 * explicación muestra a muestra hasta que la práctica vuelve a preguntar.
 *
 * R2-01: mientras se explica, el ejercicio se anima al compás de la voz.
 * R2-02: al terminar, un ejercicio NUEVO, con la pizarra limpia y su pregunta.
 */
async function pedirAyuda(p, clase, boton) {
  const antes = await p.evaluate(() => window.__obs());
  const viejo = antes.encabezado?.enunciado ?? "";
  const enColumna = Boolean(antes.practicaColumna?.columna);
  const b = p.getByRole("button", { name: boton }).first();
  if (!viejo || !(await b.count())) {
    check("R2-01", `«${boton}» con la práctica delante`, false, `${clase}: sin ejercicio o sin botón`);
    return null;
  }
  console.log(`  · ${clase}: «${boton}» sobre ${viejo}`);
  await b.click();
  for (let j = 0; j < 40 && (await p.evaluate(() => window.__obs().pregunta)); j++) await p.waitForTimeout(150);

  const explicacion = [];
  let fin = null;
  let capturada = false;
  const t0 = Date.now();
  while (Date.now() - t0 < PRESUPUESTO) {
    const m = await p.evaluate(() => window.__obs());
    comprobarSiempre(m, clase);
    const enunciado = m.encabezado?.enunciado ?? "";
    if (m.pregunta) {
      fin = m;
      break;
    }
    if (enunciado === viejo) {
      explicacion.push({
        sub: String(m.sub ?? "").trim(),
        plan: m.planteamiento,
        activa: /:activa\b/.test(m.estados),
        elementos: m.estados ? m.estados.split("|").length : 0,
      });
      // La evidencia: la columna a medio escribir con la voz en las decenas o,
      // si el ejercicio no va en columna, un paso animándose.
      const enPlenaAnimacion = enColumna
        ? m.planteamiento?.foco && /^Sumamos las decenas/.test(String(m.sub ?? "").trim())
        : /:activa\b/.test(m.estados) && m.estados.split("|").length >= 3;
      if (!capturada && enPlenaAnimacion) {
        capturada = true;
        await momento(p, clase, `${boton.replace(/\W+/g, "-").toLowerCase()}-animando`);
      }
    }
    await p.waitForTimeout(110);
  }

  const etiqueta = `${clase}, «${boton}», ${viejo}`;
  verificar("R2-01", "la explicación llega a desarrollarse en la pizarra", explicacion.length > 3, etiqueta);
  if (/regla/i.test(boton)) {
    verificar("R2-01", "«Explicar regla» nombra la regla y la explica sobre el ejercicio", explicacion.some((s) => /regla/i.test(s.sub)), etiqueta);
  }
  if (enColumna) {
    const cifras = explicacion.map((s) => s.plan?.cifrasResultado ?? 0);
    const distintas = [...new Set(cifras)].sort((x, y) => x - y);
    verificar("R2-01", "la cuenta en columna se anima (deja de estar quieta en el «?»)", explicacion.some((s) => s.plan && s.plan.estado !== "estatica"), etiqueta);
    verificar("R2-01", "…la columna que se explica se enciende", explicacion.some((s) => s.plan?.foco), etiqueta);
    verificar("R2-01", "…y las cifras del resultado se escriben de una en una", distintas.length >= 3 && Math.max(...cifras) >= cifrasDe(resolverEjercicio(viejo, TEMA_DE_LA_CLASE[clase] ?? "")).length, `${etiqueta}: ${distintas.join(" → ")}`);
    // AL COMPÁS DE LA VOZ: con "Sumamos las decenas" en el subtítulo, la cifra de
    // las unidades ya está escrita y la de las centenas todavía no.
    let comparadas = 0;
    for (const s of explicacion) {
      const col = s.sub.match(/^Sumamos las (unidades|decenas|centenas)\b/)?.[1];
      if (!col || !s.plan) continue;
      const k = COLUMNAS[col];
      comparadas++;
      verificar("R2-01", "cada cifra del resultado sale cuando la voz llega a su columna, ni antes ni después", s.plan.cifrasResultado >= k && s.plan.cifrasResultado <= k + 1, `${etiqueta}: «${s.sub.slice(0, 40)}» con ${s.plan.cifrasResultado} cifras`);
    }
    verificar("R2-01", "…comprobado con la voz en cada columna", comparadas >= 3, `${etiqueta}: ${comparadas} muestras`);
  } else {
    const cuantos = [...new Set(explicacion.map((s) => s.elementos))];
    verificar("R2-01", "los pasos se animan mientras se explican", explicacion.some((s) => s.activa), etiqueta);
    // NO TODOS DE GOLPE: la pizarra empieza con menos de lo que acaba, y va
    // creciendo. Se cuenta lo que se VE, y desde R4-01 lo que se ve es lo ya
    // explicado —no lo ya escrito—: una línea que el guion escribe mientras la
    // voz sigue en la anterior espera su turno, así que dos líneas seguidas
    // pueden destaparse casi a la vez si la voz las alcanza juntas. Lo que no
    // puede pasar —y es lo que fotografió el cliente— es que la explicación
    // aparezca entera desde el primer fotograma.
    const primero = explicacion[0]?.elementos ?? 0;
    const ultimo = explicacion.at(-1)?.elementos ?? 0;
    verificar(
      "R2-01",
      "…y se escriben uno tras otro, no todos de golpe",
      cuantos.length >= 2 && primero < ultimo,
      `${etiqueta}: ${cuantos.join(" → ")}`,
    );
  }

  verificar("R2-02", "tras la explicación, la práctica vuelve a preguntar", Boolean(fin), etiqueta);
  if (!fin) return null;
  const nuevo = fin.encabezado?.enunciado ?? "";
  const a1 = fin.ambientes.find((a) => a.n === "1")?.elementos ?? 0;
  const a2 = fin.ambientes.find((a) => a.n === "2")?.elementos ?? 0;
  verificar("R2-02", "…con un ejercicio NUEVO, no el que acaba de resolverse", Boolean(nuevo) && nuevo !== viejo, `${etiqueta} → ${nuevo}`);
  verificar("R2-02", "…con la pizarra limpia: sólo su enunciado, sin el desarrollo resuelto", a1 === 1 && a2 === 0 && fin.capsulas.length === 0, `${etiqueta} → ${nuevo}: ${a1} + ${a2} elementos, ${fin.capsulas.length} cápsulas`);
  verificar("R2-02", "…y el enunciado nuevo, quieto: se lo resuelve el alumno", !fin.planteamiento || fin.planteamiento.estado === "estatica", `${etiqueta} → ${fin.planteamiento?.estado}`);
  verificar("R2-02", "la casilla pregunta por el ejercicio nuevo", cifrasDe(fin.preguntaFuente).includes(cifrasDe(nuevo)) && !cifrasDe(fin.preguntaFuente).includes(cifrasDe(viejo)), `«${fin.preguntaFuente}» con ${nuevo}`);
  // Sin pausar (la pausa retira la casilla): la pregunta nueva, a la vista.
  await p.screenshot({ path: `${SALIDA}/${clase}-${boton.replace(/\W+/g, "-").toLowerCase()}-pregunta.png` });
  await momento(p, clase, `${boton.replace(/\W+/g, "-").toLowerCase()}-nuevo`);
  return fin;
}

/** El tema con el que se lee un enunciado ambiguo: "x² - 9" se deriva o se factoriza. */
const TEMA_DE_LA_CLASE = {
  aritmetica: "aritmetica",
  "aritmetica-avanzado": "aritmetica",
  fracciones: "fracciones",
  "fracciones-1920": "fracciones",
  ecuaciones: "ecuaciones_lineales",
  derivadas: "derivadas",
  factorizacion: "factorizacion",
};

/** Contesta bien la práctica en curso y comprueba que se corrige y se cierra. */
async function contestarBien(p, clase) {
  const m = await p.evaluate(() => window.__obs());
  const enunciado = m.encabezado?.enunciado ?? "";
  const respuesta = resolverEjercicio(enunciado, TEMA_DE_LA_CLASE[clase] ?? "");
  await p.locator("input[placeholder*='respuesta' i]").fill(respuesta ?? "0");
  await p.getByRole("button", { name: /Responder/ }).click();
  let ultimo = null;
  for (let j = 0; j < 160; j++) {
    ultimo = await p.evaluate(() => window.__obs());
    if (/Correcto/.test(ultimo.veredicto) && ultimo.capsulas.length > 0) break;
    await p.waitForTimeout(250);
  }
  verificar("R2-02", "el ejercicio nuevo se corrige contra SU resultado", /Correcto/.test(ultimo?.veredicto ?? ""), `${clase}: ${enunciado} → ${respuesta} («${ultimo?.veredicto ?? ""}»)`);
  verificar("R2-02", "…y se cierra en la pizarra con su respuesta enmarcada", (ultimo?.capsulas.length ?? 0) > 0, `${clase}: ${enunciado}`);
  comprobarSiempre(ultimo, clase);
}

async function darClase({ clase, etapa, curso, tema, nivel, masDificil, reiniciar = false, disparadores, ayudas = [], viewport }) {
  // QA_CLASES=aritmetica,fracciones da sólo esas clases.
  if (process.env.QA_CLASES && !process.env.QA_CLASES.split(",").includes(clase)) return;
  console.log(`\n── ${clase} (${etapa} ${curso}${nivel ? `, ${nivel}` : ""}, ${masDificil}× «Más difícil»${viewport ? `, ${viewport.width}×${viewport.height}` : ""}) ──`);
  const { p, ctx } = await abrirClase({ etapa, curso, tema, nivel, viewport });
  const hechos = new Set();
  let ejercicio = "";
  let ambiente1 = 0;
  let muestras = 0;

  const correr = async (ms, ronda) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const m = await p.evaluate(() => window.__obs());
      muestras++;
      comprobarSiempre(m, clase);

      // Regla de continuidad: dentro de un ejercicio, el Ambiente 1 no pierde nada.
      const enunciado = m.encabezado?.enunciado ?? "";
      const n1 = m.ambientes.find((a) => a.n === "1")?.elementos ?? 0;
      if (enunciado && enunciado === ejercicio) {
        verificar("OBS-12", "el Ambiente 1 no se borra al pasar al Ambiente 2", n1 >= ambiente1, `${ambiente1} → ${n1} en «${enunciado}»`);
        ambiente1 = Math.max(ambiente1, n1);
      } else {
        ejercicio = enunciado;
        ambiente1 = n1;
      }

      for (const [nombre, cond, alDisparar] of disparadores) {
        const clave = `${ronda}:${nombre}`;
        if (hechos.has(clave) || !cond(m)) continue;
        hechos.add(clave);
        const r = await momento(p, clase, `${ronda}-${nombre}`);
        alDisparar?.(r.a, r.b);
      }
      if (m.pregunta && /practica/i.test(m.fase) && Date.now() - t0 > 4000) return m;
      await p.waitForTimeout(220);
    }
    return null;
  };

  await correr(PRESUPUESTO, "base");
  for (let k = 1; k <= masDificil; k++) {
    await p.getByRole("button", { name: /Más difícil/ }).first().click();
    for (let j = 0; j < 80 && (await p.evaluate(() => window.__obs().pregunta)); j++) await p.waitForTimeout(250);
    await correr(PRESUPUESTO, `dificil${k}`);
  }
  // La clase otra vez desde el Concepto, ya en el nivel difícil: es donde el
  // cliente vio "234 [sumando] + 178 [sumando] = 412" en horizontal.
  if (reiniciar) {
    const b = p.getByRole("button", { name: /Reiniciar lección/ }).first();
    if (await b.count()) {
      await b.click();
      await p.waitForTimeout(800);
      await correr(PRESUPUESTO, "reinicio");
    }
  }
  // Las ayudas, con la pregunta de la práctica delante; después se contesta bien
  // el último ejercicio nuevo.
  if (ayudas.length) {
    const delante = await p.evaluate(() => window.__obs());
    if (!(delante.pregunta && /practica/i.test(delante.fase))) await correr(PRESUPUESTO, "ayudas");
    let seguimos = true;
    for (const boton of ayudas) if (seguimos) seguimos = Boolean(await pedirAyuda(p, clase, boton));
    if (seguimos) await contestarBien(p, clase);
  }
  console.log(`  (${muestras} muestras de la pizarra)`);
  await ctx.close();
}

const etiquetaVisible = (m, re) => m.etiquetas.some((e) => re.test(e.texto));

const disparadoresDeAritmetica = [
    ["concepto-dibujo", (m) => /concepto/i.test(m.fase) && m.diagrama.length > 0, (a) => {
      for (const d of a.diagrama) medida("pantalla_contraste_dibujo_min", d.ratio);
      for (const d of a.diagrama) verificar("OBS-02", "pantalla: rótulos del dibujo con contraste ≥ 4,5:1", d.ratio >= 4.5, `«${d.texto}» ${d.ratio.toFixed(2)}:1`);
    }],
    ["concepto-partes", (m) => /concepto/i.test(m.fase) && m.rotulosColumna != null, (a) => {
      const r = a.rotulosColumna;
      verificar("OBS-03", "los sumandos y la suma, en columna (apilados)", r.numeros.length === 3 && r.apiladas, r.numeros.join(" / "));
      verificar("OBS-03", "alineados a la derecha (unidades bajo unidades)", r.alineadas);
      verificar("OBS-03", "cada número con su nombre", r.palabras.length === 3, r.palabras.join(", "));
    }],
    ["reglas", (m) => /regla/i.test(m.fase) && m.ambientes.some((a) => a.elementos > 0)],
    ["ejemplo-llevo", (m) => etiquetaVisible(m, /^llevo/)],
    ["ejemplo-cierre", (m) => m.capsulas.some((c) => c.ambiente === "2"), (a) => {
      verificar("OBS-14", "la respuesta final, enmarcada en el Ambiente 2", a.capsulas.some((c) => c.ambiente === "2"));
    }],
    ["practica", (m) => /practica/i.test(m.fase) && m.pregunta, (a) => {
      verificar("OBS-07", "la práctica va en columna, con la raya", a.practicaColumna?.columna, a.practicaColumna?.texto);
      verificar("OBS-07", "…y el «?» debajo de la raya", a.practicaColumna?.interrogacionBajoLaRaya, a.practicaColumna?.texto);
    }],
    // OBS-04 se mira en todo Concepto y Reglas, no en un solo instante.
    ["_concepto-reglas", (m) => {
      if (/concepto|regla/i.test(m.fase)) {
        verificar("OBS-04", "en Concepto y Reglas no aparece la tarjeta con la cuenta", !m.tarjetaRegla);
        verificar("OBS-04", "en Concepto y Reglas no hay cuentas en columna (sólo los nombres de las partes)", m.columnasSinRotulo === 0);
      }
      return false;
    }],
];

// Básico y dos veces "Más difícil": 3 + 4, 24 + 17 (una llevada), 234 + 178.
await darClase({
  clase: "aritmetica",
  etapa: "PRIMARIA",
  curso: 1,
  tema: /aritm|suma|n[uú]meros naturales/i,
  masDificil: 2,
  disparadores: disparadoresDeAritmetica,
});

// Avanzado desde el Concepto: el caso exacto del informe, "234 [sumando] +
// 178 [sumando] = 412 [suma o total]", y la práctica de tres cifras.
await darClase({
  clase: "aritmetica-avanzado",
  etapa: "PRIMARIA",
  curso: 4,
  nivel: "AVANZADO",
  tema: /aritm|suma|n[uú]meros naturales/i,
  masDificil: 0,
  disparadores: disparadoresDeAritmetica,
  // La captura del cliente: «Explicar regla» en la práctica de 678 + 145.
  ayudas: ["Explicar regla", "No entendí este paso"],
});

await darClase({
  clase: "fracciones",
  etapa: "PRIMARIA",
  curso: 6,
  tema: /fracci/i,
  masDificil: 2,
  disparadores: [
    ["concepto", (m) => /concepto/i.test(m.fase) && m.diagrama.length > 0 && /denominador/i.test(m.tablero)],
    ["reglas", (m) => /regla/i.test(m.fase) && m.ambientes.some((a) => a.elementos > 1)],
    ["mcm", (m) => m.mcm != null, (a) => {
      verificar("OBS-11", "el MCM va en el Ambiente 2", a.mcm.ambiente === "2", JSON.stringify(a.mcm));
      verificar("OBS-11", "…el primero del Ambiente 2, a la altura del ejercicio", a.mcm.indice === 0 && Math.abs(a.mcm.y - a.mcm.yEjercicio) <= 12, JSON.stringify(a.mcm));
    }],
    ["numeradores", (m) => etiquetaVisible(m, /^numeradores/), (a) => {
      const a2 = a.ambientes.find((x) => x.n === "2");
      if (a.mcm) verificar("OBS-12", "durante la suma de fracciones, el Ambiente 2 no está vacío", (a2?.elementos ?? 0) > 0);
    }],
    ["entre", (m) => etiquetaVisible(m, /^entre/), (a, b) => {
      for (const e of [...a.etiquetas, ...b.etiquetas].filter((x) => /^entre/.test(x.texto))) {
        verificar("OBS-15", "«entre N» a 8 px o más de toda cifra (pantalla y proyección)", e.sep >= 7.5, `${e.sep.toFixed(1)} px`);
      }
    }],
    ["cierre", (m) => m.capsulas.some((c) => c.ambiente === "2") && /Resultado final/.test(m.pie), (a) => {
      verificar("OBS-14", "la respuesta final, enmarcada en el Ambiente 2", a.capsulas.some((c) => c.ambiente === "2"));
      verificar("OBS-14", "«Resultado final» con la fracción formal (sin barra)", a.pieConFraccion && !/\//.test(a.pie), a.pie);
      verificar("OBS-12", "al terminar, los dos ambientes conservan el procedimiento", a.ambientes.every((x) => x.elementos > 0));
    }],
    ["practica", (m) => /practica/i.test(m.fase) && m.pregunta],
  ],
  ayudas: ["No entendí este paso", "Explicar regla"],
});

// A 1920 × 1080, la pantalla del aula: la tarjeta de «Fracciones equivalentes»
// proyectada junto a las notas (la captura del cliente), y la práctica del
// nivel de partida —3/5 + 1/2— con sus dos ayudas.
await darClase({
  clase: "fracciones-1920",
  etapa: "PRIMARIA",
  curso: 6,
  tema: /fracci/i,
  masDificil: 0,
  viewport: { width: 1920, height: 1080 },
  disparadores: [
    ["reglas", (m) => /regla/i.test(m.fase) && m.tarjeta != null],
    ["reglas-notas", (m) => /regla/i.test(m.fase) && m.tarjeta != null && m.ambientes.some((a) => a.n === "2" && a.elementos > 1)],
    ["practica", (m) => /practica/i.test(m.fase) && m.pregunta],
  ],
  ayudas: ["No entendí este paso", "Explicar regla"],
});

await darClase({
  clase: "ecuaciones",
  etapa: "SECUNDARIA",
  curso: 2,
  tema: /ecuaci/i,
  masDificil: 2,
  disparadores: [
    ["conector", (m) => m.conectores.length > 0, (a, b) => {
      verificar("OBS-16", "el conector se dibuja en pantalla y en proyección", a.conectores.length > 0 && b.conectores.length > 0);
    }],
    ["cancela", (m) => etiquetaVisible(m, /cancelan/)],
    ["cierre", (m) => m.capsulas.some((c) => c.ambiente === "2") && /Resultado final/.test(m.pie), (a) => {
      verificar("OBS-14", "la respuesta final, enmarcada en el Ambiente 2", a.capsulas.some((c) => c.ambiente === "2"));
    }],
    ["practica", (m) => /practica/i.test(m.fase) && m.pregunta],
  ],
  ayudas: ["Explicar regla"],
});

// DERIVADAS Y FACTORIZACIÓN: los dos motores que ninguna clase abría en el
// navegador. En derivadas vive la escena de POLINOMIO —la que nombra cada
// término con su coeficiente y su exponente—, y es donde apareció el error de
// signo; conviene verla en pantalla, no sólo en la batería de rigor.
await darClase({
  clase: "derivadas",
  etapa: "SUPERIOR",
  curso: 1,
  tema: /derivad/i,
  masDificil: 1,
  disparadores: [
    ["reglas", (m) => /regla/i.test(m.fase) && m.ambientes.some((a) => a.elementos > 0)],
    ["termino", (m) => etiquetaVisible(m, /^(coeficiente|exponente)$/)],
    ["cierre", (m) => m.capsulas.some((c) => c.ambiente === "2")],
    ["practica", (m) => /practica/i.test(m.fase) && m.pregunta],
  ],
  ayudas: ["No entendí este paso", "Explicar regla"],
});

await darClase({
  clase: "factorizacion",
  etapa: "SECUNDARIA",
  curso: 3,
  tema: /factoriza/i,
  masDificil: 1,
  disparadores: [
    ["reglas", (m) => /regla/i.test(m.fase) && m.ambientes.some((a) => a.elementos > 0)],
    ["cierre", (m) => m.capsulas.some((c) => c.ambiente === "2")],
    ["practica", (m) => /practica/i.test(m.fase) && m.pregunta],
  ],
  ayudas: ["Explicar regla"],
});

await navegador.close();

// ── Lo que no apareció no se da por bueno ────────────────────────────────────
const esperadas = ["OBS-01", "OBS-02", "OBS-03", "OBS-04", "OBS-05", "OBS-06", "OBS-07", "OBS-08", "OBS-09", "OBS-10", "OBS-11", "OBS-12", "OBS-13", "OBS-14", "OBS-15", "OBS-16", "SUB-PIZ-02", "SUB-PRJ-03", "R2-01", "R2-02", "R2-03", "R2-04", "R3-01", "R3-02", "R3-03", "R3-04"];
for (const obs of esperadas) if (!resultados.has(obs)) check(obs, "la observación no llegó a comprobarse", false, "no se dio el momento en las tres clases");
check("CONSOLA", "la consola no suelta errores", erroresDeConsola.length === 0, erroresDeConsola.slice(0, 3).join(" · "));

writeFileSync(
  `${SALIDA}/resultado.json`,
  JSON.stringify({ fecha: new Date().toISOString(), vozReal: VOZ_REAL, voz: vozUsada, resultados: Object.fromEntries(resultados), metricas, capturas }, null, 2),
);

let fallidas = 0;
console.log("\n═══════════════════════════════════════════════════════════");
for (const obs of [...esperadas, "CONSOLA"]) {
  const r = resultados.get(obs) ?? { ok: 0, fallos: [] };
  if (r.fallos.length) fallidas++;
  console.log(` ${r.fallos.length ? "✗" : "✓"} ${obs.padEnd(11)} ${r.ok} comprobaciones${r.fallos.length ? ` · ${r.fallos.length} fallos` : ""}`);
}
console.log(` Capturas: ${capturas.length * 2} en ${SALIDA}`);
for (const [nombre, valor] of Object.entries(metricas)) console.log(`   ${nombre}: ${Math.round(valor * 10) / 10}`);
console.log("═══════════════════════════════════════════════════════════\n");
process.exit(fallidas > 0 ? 1 : 0);
