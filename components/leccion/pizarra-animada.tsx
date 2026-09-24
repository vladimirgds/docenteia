"use client";

import katex from "katex";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { comoFilas, partirLaMasLarga, yaEstaDispuesta } from "@/lib/leccion/ajuste";
import { Avatar2D } from "@/components/leccion/avatar-2d";
import { NotaDePizarra } from "@/components/leccion/nota-pizarra";
import { TextoTutor } from "@/components/leccion/texto-tutor";
import { Button } from "@/components/ui/button";
import {
  useGuionEstable,
  useSincronizadorLeccion,
} from "@/components/leccion/sincronizador-leccion";
import {
  elDestapadoEsPrestado,
  guionDeLeccion,
  reglasDeRevelado,
  situacionParaNarracion,
  type Escena,
  type Foco,
} from "@/lib/leccion/animacion";
import { colocarEtiqueta, MARGEN_ANOTACION, type Rect } from "@/lib/leccion/etiquetas";
import type { EstadoAvatar } from "@/public/pseLight";
import type { EstadoPedagogico } from "@/lib/leccion/sincronizacion";
import { ROL, rol } from "@/lib/leccion/roles";
import { cn } from "@/lib/utils";
import type { PasoSemantico } from "@/lib/leccion/marcado";
import type { VozUtilizable } from "@/lib/leccion/voz";

/**
 * PIZARRA ANIMADA: UN PASO DEL DESARROLLO, CON SUS RESALTADOS.
 *
 * Compone la escena UNA vez con KaTeX y dibuja los resaltados en una capa SVG
 * por encima. Encender un foco cambia la opacidad de un rectángulo: no vuelve a
 * pasar por KaTeX, no se sustituye ni un nodo de la fórmula, y por eso la
 * animación no parpadea.
 *
 * CÓMO SABE DÓNDE DIBUJAR
 * El guion marca cada pieza resaltable con `\htmlClass`, que KaTeX conserva en
 * el HTML. Al montar la escena se buscan esas clases, se mide su caja con
 * `getBoundingClientRect` y se guardan las coordenadas relativas al contenedor.
 * Se miden también TODAS las cifras de la fórmula: son los obstáculos que ningún
 * rótulo puede pisar (ver `lib/leccion/etiquetas.ts`).
 *
 * UNA PIZARRA CON VARIOS PASOS A LA VEZ
 * Cada línea del desarrollo es una de estas, y la pizarra de la clase las
 * enseña todas (en sus dos ambientes). Cada una está en uno de tres estados:
 *
 *   · "activa": la que la voz del tutor está recorriendo; enciende su foco.
 *   · "completada": ya recorrida; se ve entera, destapada, y conserva lo que
 *     cuenta como procedimiento —lo tachado y la respuesta enmarcada—. Las cajas
 *     y subrayados de paso se apagan: dejarlos todos encendidos era ruido.
 *   · "pendiente": escrita pero aún no contada; se ve su planteamiento, con lo
 *     que la animación destapará todavía oculto.
 */

/** Una caja medida en el sistema de coordenadas del contenedor. */
type Caja = Rect;

/** Aire alrededor de la pieza resaltada, para que el trazo no la pise. */
const HOLGURA = 4;

export type EstadoEscena = "activa" | "completada" | "pendiente";

interface Medidas {
  cajas: Record<string, Caja>;
  /** Las cifras y signos de la fórmula: lo que ninguna anotación puede tapar. */
  glifos: Caja[];
  /**
   * La letra de los rótulos, para saber cuánto ocupa cada uno: su tamaño y la
   * caja REAL que ocupa un renglón —alto y desfase respecto a la línea de
   * colgar—, medida en el navegador. La letra de pizarra de Windows (Comic
   * Sans) tiene ascendentes y descendentes muy largos: estimando la caja en
   * 1,15 veces el tamaño, "llevo 1" quedaba a 6 px de su llevada y no a 8.
   */
  fuente: { css: string; alto: number; cajaAlto: number; cajaY: number } | null;
  /** Entre qué x caben los rótulos: el ancho del paso en su ambiente. */
  limites: { x0: number; x1: number } | null;
}

/** Dónde va un rótulo: su caja, y la `y` en la que se escribe para que la ocupe. */
type RectDeRotulo = Rect & { yTexto: number };

const SIN_MEDIDAS: Medidas = { cajas: {}, glifos: [], fuente: null, limites: null };

/**
 * HASTA DÓNDE SE DEJA ENCOGER UN RENGLÓN QUE NO CABE.
 *
 * Tres cuartos del tamaño de su pantalla. Por debajo, una ecuación proyectada
 * deja de leerse desde el fondo del aula —que es el mínimo que el informe puso
 * en 24 px para los rótulos— y entonces es mejor partirla que empequeñecerla
 * más. Con el suelo de 36 px del modo proyección, 0,75 deja 27 px.
 */
const ENCAJE_MINIMO = 0.75;

/**
 * ¿La hoja lleva texto que SE VE? KaTeX mete en sus columnas y fracciones
 * espacios de anchura cero (U+200B, los `vlist-s`): cajas de 2 px de ancho y
 * tan altas como la columna entera, invisibles. Contadas como cifras, apartaban
 * los rótulos de nada —"llevo 1" quedaba a 8 px de un hueco vacío y a más de 12
 * de su llevada—.
 */
function tieneTexto(el: Element): boolean {
  return /[^\s\u200b-\u200d\ufeff]/.test(el.textContent ?? "");
}

/**
 * EL HALO DEL TÉRMINO ACTIVO, tal como lo escribió el cliente:
 *
 *   .termino-activo { box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
 *                     border-radius: 4px; transition: all 0.3s ease-in-out; }
 *
 * Con el pulso que él mismo pedía («una animación de pulso sutil») en
 * `@keyframes pz-pulso-foco`, y el color en un token para que siga al tema y
 * para que la proyección lo pueda engordar. Se inyecta como regla porque las
 * piezas las numera KaTeX: ver `halo`, más abajo.
 */
const DECLARACION_HALO =
  "border-radius:4px;box-shadow:0 0 10px var(--pz-halo);" +
  "transition:box-shadow .3s ease-in-out;animation:var(--pz-pulso)";

let lienzoDeMedida: HTMLCanvasElement | null = null;
/** Lo que ocupa un texto con una letra dada, sin pintarlo. */
function anchoDeTexto(texto: string, fuente: string, altoLetra: number): number {
  if (typeof document === "undefined") return texto.length * altoLetra * 0.6;
  lienzoDeMedida ??= document.createElement("canvas");
  const ctx = lienzoDeMedida.getContext("2d");
  if (!ctx) return texto.length * altoLetra * 0.6;
  ctx.font = fuente;
  return ctx.measureText(texto).width;
}

export function PizarraAnimada({
  escena,
  foco,
  estado = "activa",
  proyeccion = false,
  // LA FRASE DEL TUTOR NO VIVE DENTRO DE LA COLUMNA (petición del cliente,
  // ronda de octubre). La escribía bajo cada paso y el cliente la cronometró en
  // su vídeo: en el segundo 0 flotaba «Vamos a repartir el 2 en 2(x + 3) = 16»
  // —«debe eliminarse; la explicación debe iniciar directamente con el
  // comentario formal»— y en el 0:06 aparecía dentro del Ambiente 1 «El 2
  // multiplica a x: da 2x», que «es una operación auxiliar y pertenece
  // exclusivamente al Ambiente 2». Eran la misma cosa: este pie.
  //
  // En la pizarra de clase se quita: lo que el tutor dice ya se lee bajo el
  // avatar (`.pz-subtitulo`), y la columna queda con lo que el cliente dibujó
  // —comentario y ecuación, nada más—. EN PROYECCIÓN SE QUEDA: allí no hay
  // bloque de subtítulo al lado, la pizarra es la pantalla entera, y el informe
  // exige la frase del tutor a 24 px como mínimo (SUB-PRJ-03).
  conPie = proyeccion,
  marcoFinal = true,
  className,
}: {
  escena: Escena | null;
  /** Foco encendido; -1 mientras se lee la entrada de la escena. */
  foco: number;
  estado?: EstadoEscena;
  proyeccion?: boolean;
  /** La frase del tutor bajo el paso. Sólo en proyección (ver arriba). */
  conPie?: boolean;
  /**
   * Si su respuesta final va en cápsula con visto. `false` cuando detrás viene
   * el cierre del ejercicio, que es quien la enmarca: aquí queda subrayada.
   */
  marcoFinal?: boolean;
  className?: string;
}) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const sonda = useRef<SVGTextElement | null>(null);
  const [medidas, setMedidas] = useState<Medidas>(SIN_MEDIDAS);
  // El aire que necesitan las marcas que salen de la fórmula —la cápsula de la
  // respuesta, un rótulo por debajo del denominador, el conector de la
  // distributiva— para no montarse sobre el paso de al lado ni recortarse.
  const [aire, setAire] = useState({ arriba: 0, abajo: 0 });
  // `useId` trae dos puntos, que en un selector CSS significan otra cosa.
  const idPizarra = `pz-${useId().replace(/:/g, "")}`;

  // LO QUE NO CABE SE PARTE EN RENGLONES (ver `lib/leccion/ajuste.ts`). La
  // fórmula se recompone en un solo bloque alineado, así que las marcas del
  // guion siguen donde estaban y la capa de resaltados las encuentra igual.
  const [filas, setFilas] = useState<string[] | null>(null);
  /**
   * PRIMERO SE ENCOGE, Y SÓLO SI NO HAY MÁS REMEDIO SE PARTE.
   *
   * El cliente lo fotografió con "2x + 8 − 3x = 3x − 1 − 3x": la igualdad se
   * partía en dos renglones —"2x + 8 − 3x" arriba y "= 3x − 1 − 3x" debajo— y
   * «la pizarra se llena muy rápido, activando la barra de desplazamiento».
   * Partir era lo único que esta pizarra sabía hacer cuando una línea no cabía.
   *
   * Una ecuación quebrada se lee peor que una ecuación pequeña, así que ahora se
   * prueba antes a ENCOGER ESE RENGLÓN —y sólo ése— hasta que quepa entero. El
   * factor vive aquí, en `em`, de modo que se compone con el tamaño base de cada
   * pantalla y no lo sustituye. Partir sigue existiendo como último recurso,
   * para la línea que ni encogida al suelo cabe.
   */
  const [encaje, setEncaje] = useState(1);
  /**
   * ¿Se ha RECOGIDO el destapado prestado? Una línea del hilo conductor enseña
   * la operación que se le va a hacer mientras se la cuenta, y la recoge al
   * terminar su paso (ver `elDestapadoEsPrestado`). Al recogerla la línea vuelve
   * a medir lo que medía, así que se recalculan el encaje y las filas.
   */
  const recogida = estado === "completada" && elDestapadoEsPrestado(escena);
  useEffect(() => {
    setFilas(null);
    setEncaje(1);
  }, [escena?.latex, proyeccion, recogida]);

  const latexCompuesto = useMemo(() => {
    const base = escena?.latex ?? "";
    return filas && filas.length > 1 ? comoFilas(filas) : base;
  }, [escena?.latex, filas]);

  const html = useMemo(() => {
    if (!latexCompuesto) return null;
    try {
      return katex.renderToString(latexCompuesto, {
        displayMode: true,
        throwOnError: false,
        errorColor: "hsl(var(--destructive))",
        strict: false,
        // `trust` acotado a UN comando: el guion necesita `\htmlClass` para
        // marcar las piezas, y nada más. El contenido de la lección lo redacta
        // un modelo, y por aquí no puede colar un `\href`.
        trust: (contexto) => contexto.command === "\\htmlClass",
      });
    } catch {
      return null;
    }
  }, [latexCompuesto]);

  // ¿Se sale de su ambiente? Se mide lo COMPUESTO contra el ancho disponible: la
  // caja de la fórmula es `inline-block`, así que crece con ella y no avisa.
  const revisarAncho = useCallback(() => {
    const raiz = contenedor.current;
    const base = escena?.latex ?? "";
    if (!raiz || !base || yaEstaDispuesta(base)) return;
    // EL LÍMITE ES EL BORDE DE SU AMBIENTE, no la caja de la fórmula: la caja se
    // recorta al ambiente, pero lo compuesto —y las marcas que salen de él, la
    // cápsula y su visto— se pintan por encima y se van fuera de la pizarra. Se
    // mide lo mismo que se ve: hasta dónde llega la pieza más a la derecha.
    const ambiente = raiz.closest("[data-ambiente]") ?? raiz.parentElement;
    const limite = ambiente?.getBoundingClientRect().right ?? 0;
    if (!limite) return;
    const piezas = [...raiz.querySelectorAll(".katex-html *, .pz-resaltado")];
    const derecha = Math.max(
      raiz.getBoundingClientRect().right,
      ...piezas.map((el) => el.getBoundingClientRect().right),
    );
    if (derecha <= limite - 4) return;
    // Cuánto sobra, medido desde donde EMPIEZA la fórmula: encogerla mueve su
    // borde derecho, no el izquierdo.
    const izquierda = raiz.getBoundingClientRect().left;
    const necesita = derecha - izquierda;
    const cabe = limite - 4 - izquierda;
    if (necesita > 0 && cabe > 0) {
      // Un pelín menos de lo justo (0,98): KaTeX redondea y una fórmula clavada
      // al milímetro vuelve a dispararlo en el siguiente pintado.
      const propuesto = Math.max(ENCAJE_MINIMO, encaje * (cabe / necesita) * 0.98);
      // Sólo se encoge, nunca se estira: si no baja de verdad, es que ya está en
      // el suelo y lo que toca es partir.
      if (propuesto < encaje - 0.005) {
        setEncaje(propuesto);
        return;
      }
    }
    setFilas((actuales) => {
      const previas = actuales ?? [base];
      if (previas.length >= 4) return actuales;
      return partirLaMasLarga(previas) ?? actuales;
    });
  }, [escena?.latex, encaje]);

  useLayoutEffect(revisarAncho);

  // Las fuentes de KaTeX cargan después del primer pintado: hasta entonces la
  // fórmula mide otra cosa y parecía caber.
  useEffect(() => {
    const fuentes = (document as Document & { fonts?: FontFaceSet }).fonts;
    fuentes?.ready?.then(revisarAncho).catch(() => {});
  }, [revisarAncho]);

  /** Mide las piezas del guion, las cifras de la fórmula y la letra de los rótulos. */
  const medir = useCallback(() => {
    const raiz = contenedor.current;
    if (!raiz || !escena) return;

    const base = raiz.getBoundingClientRect();
    const relativa = (r: DOMRect): Caja => ({
      x: r.left - base.left,
      y: r.top - base.top,
      ancho: r.width,
      alto: r.height,
    });

    const cajas: Record<string, Caja> = {};
    // Un foco puede enmarcar varias piezas por separado —los dos términos que se
    // cancelan a uno y otro lado del igual—, y entonces se mide cada una.
    const aMedir = new Set(
      escena.focos.flatMap((f) => [...(f.piezas ?? [f.clase]), ...(f.anclaEtiqueta ? [f.anclaEtiqueta] : [])]),
    );
    for (const clase of aMedir) {
      const piezas = raiz.querySelectorAll(`.katex-html .${CSS.escape(clase)}`);
      if (piezas.length === 0) continue;

      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (const pieza of piezas) {
        // SE MIDEN LOS GLIFOS, NO LA CAJA DEL SPAN. En una fracción, KaTeX sube
        // el numerador y baja el denominador con desplazamientos dentro de la
        // línea, y la caja del span que los envuelve no los contiene. Midiendo
        // cada glifo, y la raya de la fracción, la marca abarca la fracción entera.
        const hojas = [pieza, ...pieza.querySelectorAll("*")].filter(
          (el) =>
            (el.childElementCount === 0 && tieneTexto(el)) ||
            el.classList.contains("frac-line"),
        );
        for (const el of hojas.length > 0 ? hojas : [pieza]) {
          const r = el.getBoundingClientRect();
          // KaTeX deja spans de anchura cero (los `\mathstrut` y compañía):
          // medir uno de esos estiraría la caja hasta el margen izquierdo.
          if (r.width === 0 && r.height === 0) continue;
          x1 = Math.min(x1, r.left - base.left);
          y1 = Math.min(y1, r.top - base.top);
          x2 = Math.max(x2, r.right - base.left);
          y2 = Math.max(y2, r.bottom - base.top);
        }
      }
      if (!Number.isFinite(x1) || !Number.isFinite(y1)) continue;
      cajas[clase] = { x: x1 - HOLGURA, y: y1 - HOLGURA, ancho: x2 - x1 + HOLGURA * 2, alto: y2 - y1 + HOLGURA * 2 };
    }

    // Todas las cifras y signos visibles o por destapar —y las rayas: la de la
    // cuenta en columna y las de las fracciones—: los rótulos no pisan ninguno,
    // tampoco los que aparecerán después.
    const glifos = [...raiz.querySelectorAll(".katex-html *")]
      .filter(
        (el) =>
          (el.childElementCount === 0 && tieneTexto(el)) ||
          el.classList.contains("hline") ||
          el.classList.contains("frac-line"),
      )
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map(relativa);

    let fuente: Medidas["fuente"] = null;
    if (sonda.current) {
      const cs = getComputedStyle(sonda.current);
      const alto = parseFloat(cs.fontSize) || 12;
      let cajaAlto = alto * 1.15;
      let cajaY = 0;
      try {
        const bb = sonda.current.getBBox();
        if (bb.height > 0) {
          cajaAlto = bb.height;
          cajaY = bb.y;
        }
      } catch {
        // Sin geometría (un navegador sin SVG completo): la estimación.
      }
      fuente = { css: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, alto, cajaAlto, cajaY };
    }

    const exterior = raiz.parentElement?.getBoundingClientRect();
    const limites = exterior ? { x0: exterior.left - base.left, x1: exterior.right - base.left } : null;

    setMedidas({ cajas, glifos, fuente, limites });
  }, [escena]);

  // Medir tras pintar, no después: entre el pintado y un `useEffect` normal
  // cabe un fotograma, y el alumno vería el recuadro llegar tarde.
  useLayoutEffect(() => {
    setMedidas(SIN_MEDIDAS);
    medir();
  }, [medir, html, proyeccion]);

  // Tras cada pintado se mide lo que ocupan las marcas dibujadas y se reserva
  // ese aire encima y debajo de la fórmula. Sólo cambia si cambia la medida,
  // así que no hay bucle: las coordenadas de las marcas son relativas a la
  // fórmula, y el aire se pone por fuera de ella.
  useLayoutEffect(() => {
    const raiz = contenedor.current;
    const svg = raiz?.querySelector("svg");
    if (!raiz || !svg) return;
    let minY = 0;
    let maxY = raiz.offsetHeight;
    for (const g of svg.querySelectorAll<SVGGraphicsElement>(".pz-resaltado")) {
      const b = g.getBBox();
      if (b.width === 0 && b.height === 0) continue;
      minY = Math.min(minY, b.y - 6);
      maxY = Math.max(maxY, b.y + b.height + 6);
    }
    const nuevo = { arriba: Math.ceil(-minY), abajo: Math.ceil(maxY - raiz.offsetHeight) };
    setAire((a) => (a.arriba === nuevo.arriba && a.abajo === nuevo.abajo ? a : nuevo));
  });

  useEffect(() => {
    const raiz = contenedor.current;
    if (!raiz) return;

    // Las fuentes de KaTeX cargan después del primer pintado: sin volver a
    // medir, los recuadros se quedan donde estaban las letras de reserva.
    const fuentes = (document as Document & { fonts?: FontFaceSet }).fonts;
    fuentes?.ready?.then(() => medir()).catch(() => {});

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const observador = new ResizeObserver(() => medir());
    observador.observe(raiz);
    return () => observador.disconnect();
  }, [medir]);

  if (!escena) return null;

  // Hasta dónde está destapada la escena y qué marcas se dibujan. Un destapado
  // PRESTADO —la operación que una línea del hilo enseña mientras se la cuenta—
  // se recoge al terminar su paso: la operación se queda en el borrador y el
  // hilo conductor vuelve a su ecuación limpia (ver `elDestapadoEsPrestado`).
  const focoVisible =
    estado === "completada"
      ? elDestapadoEsPrestado(escena)
        ? -1
        : escena.focos.length - 1
      : estado === "pendiente"
        ? -1
        : foco;
  const aDibujar = escena.focos
    .map((f, i) => ({ f, i }))
    .filter(({ f, i }) =>
      estado === "activa" ? i === foco : estado === "completada" ? Boolean(f.final) || f.tipo === "tachado" : false,
    );

  // El factor y el término que se reparten, destacados en color mientras el
  // conector los une (sin recuadros: ver `Foco.conector`).
  const enfasis = aDibujar
    .filter(({ f }) => f.conector && estado === "activa")
    .flatMap(({ f }) => f.piezas ?? [])
    .map((p) => `#${idPizarra} .${p}{color:var(--pz-color-enfasis)}`)
    .join("");

  /**
   * Y EL ROJO, EN EL MOMENTO EN QUE SE TACHA.
   *
   * El término que se va a cancelar lleva su clase desde que se escribe la línea,
   * así que salió rojo un paso antes de que nadie lo tachara —"2x + 6 = 16" con
   * el 6 en rojo—. Hasta ahí es un término en foco, y va en azul; el rojo entra
   * con el aspa, que es la marca que dice "esto se va".
   */
  const tachado = aDibujar
    .filter(({ f }) => f.tipo === "tachado")
    .flatMap(({ f }) => f.piezas ?? [f.clase])
    .filter(Boolean)
    .map((p) => `#${idPizarra} .${p}{color:var(--pz-cancelado)}`)
    .join("");

  /**
   * EL PUNTERO GUÍA: EL TÉRMINO QUE SE ESTÁ NOMBRANDO, CON SU HALO.
   *
   * Lo pidió el cliente con el problema delante: «cuando el avatar dice "El 2
   * multiplica a x", o "Restamos 6 a ambos miembros", la mirada del estudiante
   * debe dirigirse de inmediato al término mencionado. Actualmente el alumno
   * debe adivinar qué parte de la pizarra se está explicando.» Y eligió la vía
   * ligera: «envolver los términos clave de KaTeX en clases dinámicas y
   * aplicarles una animación de pulso sutil» —su opción A—, en vez de un
   * puntero SVG midiendo coordenadas en cada fotograma.
   *
   * Se aplica como REGLA CSS sobre las piezas que ya marca el guion, igual que
   * el revelado: no se toca el DOM de KaTeX, así que la fórmula no se recompone
   * ni se desplaza al encenderse el halo. Sólo en el paso activo y sólo sobre el
   * foco que el tutor está nombrando en ese momento: un halo en dos sitios a la
   * vez no señala nada.
   */
  const halo =
    estado === "activa" && foco >= 0
      ? (escena.focos[foco]?.piezas ?? [escena.focos[foco]?.clase])
          .filter(Boolean)
          // Bajo `[data-foco="si"]`: el puntero es UNO. Cuando la voz se va al
          // taller de la derecha, el renglón de allí toma el foco y este paso lo
          // suelta, en vez de quedarse los dos encendidos a la vez.
          .map((p) => `[data-foco="si"] #${idPizarra} .${p}{${DECLARACION_HALO}}`)
          .join("")
      : "";

  /** Dónde va el rótulo de una caja: el primer lado que no pisa ninguna cifra. */
  const rotulo = (
    texto: string,
    caja: Caja,
    preferidos?: ("arriba" | "abajo" | "derecha" | "izquierda")[],
  ): RectDeRotulo => {
    const altoLetra = medidas.fuente?.alto ?? 12;
    const ancho = anchoDeTexto(texto, medidas.fuente?.css ?? "12px sans-serif", altoLetra) + 2;
    const alto = medidas.fuente?.cajaAlto ?? altoLetra * 1.15;
    const rect = colocarEtiqueta({
      caja,
      ancho,
      alto,
      obstaculos: medidas.glifos,
      preferidos,
      limites: medidas.limites ?? undefined,
    }).rect;
    return { ...rect, yTexto: rect.y - (medidas.fuente?.cajaY ?? 0) };
  };

  const narracionActiva = foco >= 0 ? (escena.focos[foco]?.narracion ?? "") : escena.narracion;

  return (
    <div
      className={cn(
        // Sin recortar: las marcas salen de la fórmula (la cápsula y su visto,
        // un rótulo, el conector) y el aire que necesitan se reserva abajo.
        "pz-animada relative w-full px-1 py-1 text-left",
        // Recogido el destapado, lo prestado deja de ocupar sitio: si sólo se
        // apagara, "−x + 8 = −1" se quedaría con el hueco del "− 8" en medio.
        recogida && "pz-recogida",
        proyeccion && "pz-proyeccion",
        className,
      )}
      // Quién decidió lo que se marca: la etiqueta del paso o la deducción. No
      // cambia nada en pantalla; permite comprobar desde fuera que un paso
      // etiquetado por el motor se pinta con su etiqueta.
      data-origen={escena.origen}
      data-gesto={escena.clase}
      // De qué LÍNEA del guion viene esta escena. Dos renglones pueden acabar
      // enseñando lo mismo —la resta escrita y la resta tachada son la misma
      // igualdad— y sin esto no hay forma de distinguir desde fuera esos dos
      // tiempos de un paso repetido de verdad.
      data-texto={escena.texto}
      data-estado={estado}
    >
      <div
        ref={contenedor}
        id={idPizarra}
        className="pz-animada-formula relative inline-block max-w-full"
        // El encaje va en `em` para componerse con el tamaño de cada pantalla.
        // Al cambiarlo, el `ResizeObserver` de abajo vuelve a medir las cifras,
        // así que los recuadros y los tachados siguen donde están las letras.
        style={{
          marginTop: aire.arriba,
          marginBottom: aire.abajo,
          ...(encaje < 1 ? { fontSize: `${encaje}em` } : null),
        }}
      >
        {/* LO QUE SE VA DESTAPANDO, declarado como REGLA CSS y no tocando el
            DOM a mano: una regla la vuelve a aplicar el navegador siempre, y
            sigue sin recomponer la fórmula. */}
        <style>{reglasDeRevelado(idPizarra, focoVisible) + enfasis + tachado + halo}</style>

        {html ? (
          <span className="pz-formula" {...rol(ROL.FORMULA)} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          // Escena de prosa —o fórmula que KaTeX no supo componer—: se pinta
          // como NOTA DE PIZARRA, con su rótulo y sus fórmulas.
          <NotaDePizarra texto={escena.texto} />
        )}

        {/* La capa de resaltados. `pointer-events: none` para que no se coma la
            selección de texto de la fórmula que tiene debajo, y `aria-hidden`
            porque lo que dice ya se está diciendo en voz alta y en el pie. */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          {/* La sonda de la letra de los rótulos: invisible, sólo para medir. */}
          <text
            ref={sonda}
            x={0}
            y={0}
            visibility="hidden"
            dominantBaseline="hanging"
            className="pz-etiqueta"
            {...rol(ROL.PIZARRA)}
          >
            M
          </text>

          {aDibujar.flatMap(({ f, i }) => {
            if (f.conector) {
              const [a, b] = f.piezas ?? [];
              const factor = a ? medidas.cajas[a] : undefined;
              const termino = b ? medidas.cajas[b] : undefined;
              if (!factor || !termino) return [];
              return [
                <ConectorReparto
                  key={`conector-${i}`}
                  factor={factor}
                  termino={termino}
                  glifos={medidas.glifos}
                  etiqueta={f.etiqueta}
                  marcador={`${idPizarra}-flecha`}
                  rotulo={rotulo}
                />,
              ];
            }
            // Una caja POR PIEZA: la cancelación a los dos lados del igual no se
            // encierra en una sola caja que se trague el "= 16".
            return (f.piezas ?? [f.clase]).flatMap((pieza, j) => {
              const caja = medidas.cajas[pieza];
              if (!caja) return [];
              return [
                <Resaltado
                  key={`${pieza}-${i}-${j}`}
                  foco={f.final && !marcoFinal ? { ...f, final: false } : f}
                  caja={caja}
                  ancla={f.anclaEtiqueta ? medidas.cajas[f.anclaEtiqueta] : undefined}
                  glifos={medidas.glifos}
                  // El rótulo se escribe una sola vez, sobre la primera pieza, y
                  // sólo en el paso activo.
                  conEtiqueta={j === 0 && estado === "activa"}
                  rotulo={rotulo}
                />,
              ];
            });
          })}
        </svg>
      </div>

      {/* Lo que el tutor está contando de ESTE paso, para quien no puede oírlo.
          Es voz del tutor: TUTOR_DIALOG, con sus fórmulas compuestas por KaTeX. */}
      {conPie && estado === "activa" && (
        <TextoTutor
          como="p"
          className="pz-pie mt-3 min-h-[1.5rem] text-sm text-muted-foreground"
          aria-live="polite"
          texto={narracionActiva}
        />
      )}
    </div>
  );
}

/**
 * Un resaltado: caja, tachado o la confirmación del resultado.
 */
function Resaltado({
  foco,
  caja,
  ancla,
  glifos,
  conEtiqueta = true,
  rotulo,
}: {
  foco: Foco;
  caja: Caja;
  /** La pieza sobre la que va el rótulo, si no es la caja ("llevo 1" sobre su llevada). */
  ancla?: Caja;
  glifos: readonly Caja[];
  conEtiqueta?: boolean;
  rotulo: (texto: string, caja: Caja, preferidos?: ("arriba" | "abajo" | "derecha" | "izquierda")[]) => RectDeRotulo;
}) {
  const etiqueta = foco.etiqueta && conEtiqueta ? foco.etiqueta : null;
  // EL RÓTULO NO PUEDE TAPAR NINGUNA CIFRA. Se coloca en el primer lado de su
  // caja que, con 8 px de aire, no pisa ningún glifo de la fórmula: "entre 6"
  // iba encima del denominador —es decir, encima del numerador— y el cliente lo
  // fotografió tapando el 3. Ahora baja por debajo del 6. Con ancla, siempre
  // ENCIMA de ella: la llevada está en la fila de arriba y no tiene nada encima.
  const rect = etiqueta ? (ancla ? rotulo(etiqueta, ancla, ["arriba"]) : rotulo(etiqueta, caja)) : null;
  const textoEtiqueta = rect ? (
    <text
      x={rect.x + rect.ancho / 2}
      y={rect.yTexto}
      dominantBaseline="hanging"
      textAnchor="middle"
      className="pz-etiqueta"
      {...rol(ROL.PIZARRA)}
      data-etiqueta={etiqueta ?? undefined}
    >
      {etiqueta}
    </text>
  ) : null;

  // EL RESULTADO NO SE RODEA CON UN ÓVALO: el cliente lo fotografió cruzando el
  // 3800. Un resultado INTERMEDIO lleva dos rayas debajo y nada más; la
  // RESPUESTA FINAL va en una cápsula de esquinas redondeadas —borde verde,
  // fondo verde muy suave— con el visto a su derecha, sin rozar ninguna cifra.
  if (foco.tipo === "resultado") {
    // Todo proporcional al tamaño del número: en proyección la fórmula se
    // multiplica y el trazo engorda.
    const aire = Math.max(MARGEN_ANOTACION, caja.alto * 0.14);
    // LA CÁPSULA NO CRUZA NADA DE LO QUE TIENE AL LADO. Su aire se recorta hasta
    // lo que haya a cada lado —el "=" de delante, la cifra de arriba, la raya de
    // la cuenta, el renglón siguiente—, dejando siempre un hueco.
    const fuera = glifos.filter((g) => {
      const cx = g.x + g.ancho / 2;
      const cy = g.y + g.alto / 2;
      return !(cx >= caja.x && cx <= caja.x + caja.ancho && cy >= caja.y && cy <= caja.y + caja.alto);
    });
    // Cada vecino se clasifica por dónde cae su CENTRO respecto al de la caja,
    // no por sus bordes: las cajas de los glifos de KaTeX son más altas que el
    // trazo, y la raya de una cuenta puede solaparse con la del total que tiene
    // debajo sin dejar de estar encima. El borde de la cápsula se queda siempre
    // a 4 px (el medio trazo al proyectar) de lo que tenga al lado.
    const centroX = caja.x + caja.ancho / 2;
    const centroY = caja.y + caja.alto / 2;
    // Una raya (la de la cuenta, la de una fracción) sólo puede ser techo o
    // suelo: es plana y cruza de lado a lado.
    const esRaya = (g: Caja) => g.alto < 4 && g.ancho > 3 * g.alto;
    const enSuFranja = fuera.filter(
      (g) => !esRaya(g) && g.y < caja.y + caja.alto && g.y + g.alto > caja.y && Math.abs(g.y + g.alto / 2 - centroY) < caja.alto / 2,
    );
    const tope = { izquierda: -Infinity, derecha: Infinity, arriba: -Infinity, abajo: Infinity };
    for (const g of enSuFranja) {
      if (g.x + g.ancho / 2 < centroX) tope.izquierda = Math.max(tope.izquierda, g.x + g.ancho);
      else tope.derecha = Math.min(tope.derecha, g.x);
    }
    const izquierda = foco.final ? Math.max(caja.x - aire, tope.izquierda + 4) : caja.x - 3;
    const derecha = foco.final ? Math.min(caja.x + caja.ancho + aire, tope.derecha - 4) : caja.x + caja.ancho + 3;
    for (const g of fuera) {
      if (enSuFranja.includes(g) || g.x >= derecha || g.x + g.ancho <= izquierda) continue;
      if (g.y + g.alto / 2 < centroY) tope.arriba = Math.max(tope.arriba, g.y + g.alto);
      else tope.abajo = Math.min(tope.abajo, g.y);
    }
    const arriba = Math.max(caja.y - aire, tope.arriba + 4);
    const abajo = Math.min(caja.y + caja.alto + aire, tope.abajo - 4);
    const primera = caja.y + caja.alto + Math.max(5, caja.alto * 0.09);
    const segunda = primera + Math.max(5, caja.alto * 0.1);
    // El visto, proporcionado al número y separado del marco por un hueco limpio.
    const tam = Math.min(64, Math.max(12, caja.alto * 0.45));
    const x0 = derecha + Math.max(10, caja.alto * 0.12);
    const y0 = caja.y + caja.alto / 2;
    return (
      <g className="pz-resaltado" data-tipo={foco.tipo} data-final={foco.final ? "si" : undefined}>
        {foco.final ? (
          <rect
            x={izquierda}
            y={arriba}
            width={derecha - izquierda}
            height={Math.max(0, abajo - arriba)}
            rx={12}
            className="pz-trazo pz-marco-final"
            pathLength={1}
          />
        ) : (
          <>
            <line x1={izquierda} y1={primera} x2={derecha} y2={primera} className="pz-trazo pz-subrayado" pathLength={1} />
            <line x1={izquierda} y1={segunda} x2={derecha} y2={segunda} className="pz-trazo pz-subrayado pz-subrayado-2" pathLength={1} />
          </>
        )}
        {foco.final ? (
          <path
            d={`M ${x0} ${y0} l ${tam * 0.35} ${tam * 0.4} l ${tam * 0.65} ${-tam * 0.85}`}
            className="pz-trazo pz-visto"
            fill="none"
            pathLength={1}
          />
        ) : null}
        {textoEtiqueta}
      </g>
    );
  }

  return (
    <g className="pz-resaltado" data-tipo={foco.tipo}>
      {/* El fondo va DEBAJO del trazo y encima de la fórmula: es lo que hace que
          la columna operada se ilumine, y no sólo se enmarque. */}
      <rect x={caja.x} y={caja.y} width={caja.ancho} height={caja.alto} rx={6} className="pz-fondo" />
      <rect
        x={caja.x}
        y={caja.y}
        width={caja.ancho}
        height={caja.alto}
        rx={6}
        className="pz-trazo"
        fill="none"
        pathLength={1}
      />
      {foco.tipo === "tachado" ? (
        <line
          x1={caja.x + 1}
          y1={caja.y + caja.alto}
          x2={caja.x + caja.ancho - 1}
          y2={caja.y}
          className="pz-trazo pz-tachado"
          pathLength={1}
        />
      ) : null}
      {textoEtiqueta}
    </g>
  );
}

/**
 * EL CONECTOR DE LA DISTRIBUTIVA, como lo dibujó el cliente.
 *
 * Una escuadra: baja desde el factor, cruza por DEBAJO de la expresión con aire
 * y sube con su flecha hasta el término al que multiplica; el "× 2" va debajo
 * de la escuadra. Antes era un arco corto que se colaba entre las cifras y dos
 * recuadros encima de todo ("flechas toscas y confusas"). La escuadra pasa por
 * debajo de TODO lo que hay entre los dos —las cifras medidas—, así que no toca
 * ninguna.
 */
function ConectorReparto({
  factor,
  termino,
  glifos,
  etiqueta,
  marcador,
  rotulo,
}: {
  factor: Caja;
  termino: Caja;
  glifos: readonly Caja[];
  etiqueta?: string;
  marcador: string;
  rotulo: (texto: string, caja: Caja, preferidos?: ("arriba" | "abajo" | "derecha" | "izquierda")[]) => RectDeRotulo;
}) {
  const x0 = factor.x + factor.ancho / 2;
  const x1 = termino.x + termino.ancho / 2;
  const izquierda = Math.min(x0, x1);
  const derecha = Math.max(x0, x1);
  // Lo más bajo de lo que hay ENTRE los dos, en su mismo renglón.
  const techo = Math.min(factor.y, termino.y);
  const suelo = Math.max(factor.y + factor.alto, termino.y + termino.alto);
  const debajo = glifos
    .filter((g) => g.x + g.ancho > izquierda - 4 && g.x < derecha + 4 && g.y < suelo && g.y + g.alto > techo)
    .reduce((max, g) => Math.max(max, g.y + g.alto), suelo);
  // La punta, del tamaño de la letra y no del grosor del trazo: medida en
  // unidades del dibujo (`userSpaceOnUse`). Con el tamaño por defecto, que
  // multiplica el grosor, la punta se volvía un triángulo enorme al proyectar.
  const punta = Math.max(7, Math.min(14, Math.min(factor.alto, termino.alto) * 0.3));
  // El vértice de la punta, justo debajo del término; el trazo acaba dentro de ella.
  const puntaY = termino.y + termino.alto + 3;
  const finTrazo = puntaY + punta * 0.7;
  // La barra, por debajo de todo y con tramo de subida suficiente para la punta.
  const barra = Math.max(debajo + MARGEN_ANOTACION + 4, finTrazo + punta);
  // La barra con su grosor (6 px al proyectar): el "× 2" va debajo sin tocarla.
  const rectBarra: Caja = { x: izquierda, y: barra - 3, ancho: Math.max(2, derecha - izquierda), alto: 6 };
  const rect = etiqueta ? rotulo(etiqueta, rectBarra, ["abajo", "arriba"]) : null;
  return (
    <g className="pz-resaltado" data-tipo="reparto">
      <defs>
        <marker
          id={marcador}
          viewBox="0 0 10 10"
          // El trazo acaba dentro de la punta, no en su vértice: con el grosor
          // de proyección, la raya asomaba por los lados del pico.
          refX="3"
          refY="5"
          markerUnits="userSpaceOnUse"
          markerWidth={punta}
          markerHeight={punta}
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 Z" className="pz-flecha-reparto" />
        </marker>
      </defs>
      <path
        d={`M ${x0} ${factor.y + factor.alto + 2} V ${barra} H ${x1} V ${finTrazo}`}
        className="pz-trazo pz-conector"
        fill="none"
        strokeLinejoin="round"
        pathLength={1}
        markerEnd={`url(#${marcador})`}
      />
      {rect && (
        <text
          x={rect.x + rect.ancho / 2}
          y={rect.yTexto}
          dominantBaseline="hanging"
          textAnchor="middle"
          className="pz-etiqueta"
          {...rol(ROL.PIZARRA)}
          data-etiqueta={etiqueta}
        >
          {etiqueta}
        </text>
      )}
    </g>
  );
}

/** Lo que el panel le da a la pizarra para que anime sus pasos. */
export interface AnimacionDePizarra {
  escenas: readonly Escena[];
  /** Escena que la voz está recorriendo. */
  escena: number;
  /** Foco encendido en esa escena; -1 es su entrada. */
  foco: number;
  /** La animación ya lo ha destapado todo. */
  terminada: boolean;
  proyeccion: boolean;
}

/**
 * EL PANEL DE LA CLASE: la pizarra, la voz que la mueve y los mandos.
 *
 * Recibe las líneas de la lección tal como las escribe el motor, las convierte
 * en guion y lo reproduce sincronizado con la voz del tutor. La pizarra que
 * enseña es la de la clase entera —sus dos ambientes, el ejercicio fijo arriba—
 * y la dibuja quien la conoce (el aula, con `tablero`); aquí sólo se decide qué
 * paso está animándose.
 *
 * MODO PROYECCIÓN: ESPEJO, NO COPIA
 * El cliente lo pidió como regla (SUB-PRJ-03): "el modo proyección no genera
 * lógica independiente; replica el estado activo de la pantalla base". Aquí se
 * cumple por construcción: proyectar es poner EN PANTALLA COMPLETA ESTE MISMO
 * PANEL —el mismo nodo, el mismo estado, la misma pizarra— con el tema de alto
 * contraste. No hay una segunda vista que pueda enseñar otra cosa. Al proyectar
 * se quitan los textos de interfaz ("Paso 2 de 4", "Proyéctala en el aula") y
 * se escala la letra para leerse desde el fondo del aula.
 */
export function PanelAnimado({
  lineas,
  tts,
  vozActiva = true,
  narracion,
  alCambiarAvatar,
  alTomarLaVoz,
  alProgresar,
  reinicio,
  leccionEnMarcha = false,
  leccionPausada = false,
  mandosLeccion,
  leccionTerminada = false,
  avatarDeLaLeccion,
  tablero,
  className,
}: {
  /**
   * Los pasos que se animan. Un paso puede llegar como texto plano o etiquetado
   * con su instrucción de foco; con etiqueta, la pizarra marca exactamente lo
   * que dice.
   */
  lineas: readonly (string | PasoSemantico)[];
  tts?: VozUtilizable | null;
  vozActiva?: boolean;
  /**
   * Lo que el tutor de la lección está diciendo AHORA: la pizarra se coloca
   * sola donde va la voz, sin que nadie pulse Reproducir.
   */
  narracion?: string | null;
  /** Por dónde va la animación, si ya terminó y qué línea es "este paso". */
  alProgresar?: (progreso: { escena: number; foco: number; terminado: boolean; texto?: string | null }) => void;
  /** Clave de la fase y el tema en curso: al cambiar, la animación vuelve a cero. */
  reinicio?: string;
  /**
   * UN SOLO MANDO DE REPRODUCCIÓN: mientras el tutor explica, pausar aquí para
   * SU voz; el panel sólo reproduce por su cuenta con la lección parada.
   */
  leccionEnMarcha?: boolean;
  leccionPausada?: boolean;
  mandosLeccion?: { pausar: () => void; reanudar: () => void };
  /** El aula usa esto para poner al avatar a explicar, pensar o celebrar. */
  alCambiarAvatar?: (estado: EstadoPedagogico) => void;
  /** La lección ha terminado: la pizarra se queda resuelta, en su último paso. */
  leccionTerminada?: boolean;
  /** El tutor de la lección, para que en proyección el avatar sea el que habla. */
  avatarDeLaLeccion?: { estado: EstadoAvatar | EstadoPedagogico; hablando: boolean };
  /** El sintetizador es uno solo: se avisa antes de ponerse a hablar. */
  alTomarLaVoz?: () => void;
  /** La pizarra de la clase, dibujada con el estado de la animación. */
  tablero: (animacion: AnimacionDePizarra) => ReactNode;
  className?: string;
}) {
  const marco = useRef<HTMLDivElement | null>(null);
  const [proyeccion, setProyeccion] = useState(false);

  // El guion sólo se rehace cuando cambia LO QUE SE ANIMA, no cuando cambian las
  // líneas: rehacerlo reiniciaba la máquina a mitad de explicación. La firma
  // incluye la etiqueta: dos pasos con el mismo LaTeX y distinta operación no
  // son el mismo paso.
  const firma = JSON.stringify(lineas);
  const guion = useMemo(
    () => guionDeLeccion(JSON.parse(firma) as (string | PasoSemantico)[]),
    [firma],
  );
  const escenas = useGuionEstable(guion);

  const { estado, mandos } = useSincronizadorLeccion({ escenas, tts, audio: vozActiva });

  useEffect(() => {
    alCambiarAvatar?.(estado.avatar);
  }, [estado.avatar, alCambiarAvatar]);

  // UN SOLO DUEÑO DEL SINTETIZADOR: si el tutor vuelve a hablar mientras el
  // repaso se reproducía, el repaso calla y pasa a seguirlo.
  useEffect(() => {
    if (leccionEnMarcha && !leccionPausada && estado.estado === "reproduciendo") {
      mandos.detener();
    }
  }, [leccionEnMarcha, leccionPausada, estado.estado, mandos]);

  // Cambiar de fase o de tema es empezar de cero.
  const primerReinicio = useRef(true);
  useEffect(() => {
    if (primerReinicio.current) {
      primerReinicio.current = false;
      return;
    }
    mandos.detener();
  }, [reinicio, mandos]);

  // La pizarra sigue a la voz del tutor. Se le dice DÓNDE ESTÁ, no sólo en qué
  // escena: la cuenta se cuenta en orden y desde el reposo, así que una
  // locución no puede plantar la pizarra tres pasos más allá.
  useEffect(() => {
    if (!narracion) return;
    const destino = situacionParaNarracion(escenas, narracion, estado.escena, estado.foco);
    if (!destino) return;
    mandos.situar(destino.escena, destino.foco);
  }, [narracion, escenas, estado.escena, estado.foco, mandos]);

  // AL TERMINAR LA LECCIÓN, LA PIZARRA QUEDA RESUELTA: último paso de la última
  // línea. Se vuelve a situar si el guion cambia estando terminada —el cierre del
  // ejercicio añade su línea justo en ese momento—.
  useEffect(() => {
    if (!leccionTerminada || escenas.length === 0) return;
    const ultima = escenas.length - 1;
    mandos.situar(ultima, Math.max(-1, escenas[ultima].focos.length - 1));
  }, [leccionTerminada, escenas, mandos]);

  const terminado =
    escenas.length === 0 ||
    estado.estado === "final" ||
    (estado.escena === escenas.length - 1 && estado.foco >= estado.segmentos - 2);

  const textoEnPantalla = escenas[estado.escena]?.texto ?? null;
  useEffect(() => {
    alProgresar?.({ escena: estado.escena, foco: estado.foco, terminado, texto: textoEnPantalla });
  }, [alProgresar, estado.escena, estado.foco, terminado, textoEnPantalla]);

  // La tecla Escape y el botón del navegador también salen de pantalla
  // completa: el estado se lee del documento, no de lo que pulsamos nosotros.
  useEffect(() => {
    const sincronizar = () => setProyeccion(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sincronizar);
    return () => document.removeEventListener("fullscreenchange", sincronizar);
  }, []);

  const alternarProyeccion = useCallback(async () => {
    const nodo = marco.current;
    if (!nodo) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await nodo.requestFullscreen();
    } catch {
      // Sin pantalla completa disponible, al menos el alto contraste.
      setProyeccion((v) => !v);
    }
  }, []);

  const sinAnimacion = escenas.length === 0;
  const enMarcha = estado.estado === "reproduciendo";

  /** Cualquier mando que arranque la voz pide antes el turno de palabra. */
  const conLaVoz = (accion: () => void) => () => {
    // Y autoriza de paso el reproductor de la voz neuronal: es un gesto del
    // alumno, que es lo único que el navegador acepta para dejar sonar audio.
    alTomarLaVoz?.();
    accion();
  };

  // En proyección, el avatar es el del TUTOR mientras habla la lección; el del
  // repaso sólo cuando es el repaso el que está hablando.
  const avatarProyectado = enMarcha
    ? { estado: estado.avatar, hablando: estado.modo === "voz" }
    : (avatarDeLaLeccion ?? { estado: estado.avatar, hablando: false });

  return (
    <div
      ref={marco}
      className={cn(
        "pz-panel rounded-lg border bg-card p-3",
        proyeccion && "modo-proyeccion flex h-full flex-col overflow-y-auto",
        className,
      )}
      data-panel={sinAnimacion ? "reposo" : "animado"}
      data-proyeccion={proyeccion ? "si" : undefined}
    >
      <div className="pz-cabecera mb-2 flex flex-wrap items-center justify-between gap-2">
        {/* Los textos de INTERFAZ —el título del panel y el contador de pasos—
            no se proyectan: el cliente pidió quitar "Pizarra de clase ·
            Proyéctala en el aula" de toda proyección. En pantalla sí están. */}
        {proyeccion ? (
          <span />
        ) : (
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">Pizarra de la clase</h3>
            {!sinAnimacion && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Paso {estado.foco + 2} de {estado.segmentos}
                {/* "de", no "/": ni una barra en lo que ve el alumno (SUB-MTH-05). */}
                {estado.escenas > 1 ? ` · línea ${estado.escena + 1} de ${estado.escenas}` : ""}
              </span>
            )}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => void alternarProyeccion()}
          aria-pressed={proyeccion}
        >
          {proyeccion ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {proyeccion ? "Salir de proyección" : "Modo proyección"}
        </Button>
      </div>

      {/* En proyección la pizarra comparte escenario con el avatar: el tutor
          sigue a la vista del aula mientras la pizarra ocupa el resto. */}
      <div className="pz-escenario">
        {proyeccion && (
          <div className="pz-avatar">
            <Avatar2D estado={avatarProyectado.estado} hablando={avatarProyectado.hablando} />
          </div>
        )}
        <div className="pz-lienzo min-w-0">
          {tablero({
            escenas,
            escena: estado.escena,
            foco: estado.foco,
            terminada: terminado,
            proyeccion,
          })}
        </div>
      </div>

      {!sinAnimacion && (
        <div className="pz-mandos mt-3 flex flex-wrap items-center gap-2">
          {/* El botón actúa sobre QUIEN ESTÉ HABLANDO: con el tutor en marcha,
              pausa al tutor; con la lección parada, reproduce el repaso. */}
          {leccionEnMarcha && !leccionPausada ? (
            <Button size="sm" variant="outline" onClick={() => mandosLeccion?.pausar()}>
              <Pause className="h-4 w-4" />
              Pausar
            </Button>
          ) : leccionPausada ? (
            <Button size="sm" variant="outline" onClick={() => mandosLeccion?.reanudar()}>
              <Play className="h-4 w-4" />
              Reanudar
            </Button>
          ) : enMarcha ? (
            <Button size="sm" variant="outline" onClick={mandos.pausar}>
              <Pause className="h-4 w-4" />
              Pausar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={conLaVoz(estado.estado === "pausado" ? mandos.reanudar : mandos.reproducir)}
            >
              <Play className="h-4 w-4" />
              {estado.estado === "pausado" ? "Reanudar" : "Reproducir"}
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={conLaVoz(mandos.repetirPaso)}>
            <RotateCcw className="h-4 w-4" />
            Repetir paso
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={mandos.retroceder}
            aria-label="Paso anterior"
            disabled={estado.escena === 0 && estado.foco < 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button size="sm" variant="ghost" onClick={conLaVoz(mandos.avanzar)} aria-label="Avanzar un paso">
            Avanzar
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* La degradación se dice, no se esconde: si no hay voz, el alumno
              tiene derecho a saber por qué la pizarra avanza sola. */}
          {estado.modo === "temporizador" && !proyeccion && (
            <span className="text-xs text-muted-foreground">
              {estado.vozCaida
                ? "La voz ha fallado: se avanza por temporizador."
                : "Sin voz disponible: se avanza por temporizador."}
            </span>
          )}
        </div>
      )}

      {/* Selector de escena: en clase, el profesor vuelve a un paso concreto sin
          tener que reproducir la lección entera. */}
      {!sinAnimacion && !proyeccion && escenas.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {escenas.map((escena, i) => (
            <button
              key={escena.id}
              type="button"
              onClick={() => mandos.irAEscena(i)}
              aria-label={`Ir al paso ${i + 1}`}
              aria-current={i === estado.escena}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-colors",
                i === estado.escena ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
