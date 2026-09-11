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
} from "react";

import { Avatar2D } from "@/components/leccion/avatar-2d";
import { TextoMatematico } from "@/components/math";
import { Button } from "@/components/ui/button";
import {
  useGuionEstable,
  useSincronizadorLeccion,
} from "@/components/leccion/sincronizador-leccion";
import {
  escenaEstatica,
  guionDeLeccion,
  reglasDeRevelado,
  situacionParaNarracion,
  type Escena,
  type Foco,
} from "@/lib/leccion/animacion";
import type { EstadoAvatar } from "@/public/pseLight";
import type { EstadoPedagogico } from "@/lib/leccion/sincronizacion";
import { cn } from "@/lib/utils";
import type { PasoSemantico } from "@/lib/leccion/marcado";
import type { VozUtilizable } from "@/lib/leccion/voz";

/**
 * PIZARRA ANIMADA.
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
 * Varias piezas con la misma clase —las tres cifras de una columna— dan UNA
 * caja que las abarca a todas: así sale el recuadro vertical sobre la columna.
 *
 * Las medidas se rehacen cuando cambia la escena y cuando cambia el tamaño
 * (girar la tablet, entrar en modo proyección). No se rehacen al cambiar de
 * foco, que es lo que ocurre veinte veces por lección.
 */

/** Una caja medida en el sistema de coordenadas del contenedor. */
interface Caja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Aire alrededor de la pieza resaltada, para que el trazo no la pise. */
const HOLGURA = 4;

export function PizarraAnimada({
  escena,
  foco,
  proyeccion = false,
  className,
}: {
  escena: Escena | null;
  /** Foco encendido; -1 mientras se lee la entrada de la escena. */
  foco: number;
  proyeccion?: boolean;
  className?: string;
}) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const [cajas, setCajas] = useState<Record<string, Caja>>({});
  // `useId` trae dos puntos, que en un selector CSS significan otra cosa.
  const idPizarra = `pz-${useId().replace(/:/g, "")}`;

  const html = useMemo(() => {
    if (!escena?.latex) return null;
    try {
      return katex.renderToString(escena.latex, {
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
  }, [escena]);

  /** Mide todas las clases del guion de la escena en curso. */
  const medir = useCallback(() => {
    const raiz = contenedor.current;
    if (!raiz || !escena) return;

    const base = raiz.getBoundingClientRect();
    const medidas: Record<string, Caja> = {};

    // Un foco puede enmarcar varias piezas por separado —los dos términos que se
    // cancelan a uno y otro lado del igual—, y entonces se mide cada una.
    const aMedir = new Set(escena.focos.flatMap((f) => f.piezas ?? [f.clase]));
    for (const clase of aMedir) {
      const piezas = raiz.querySelectorAll(`.${CSS.escape(clase)}`);
      if (piezas.length === 0) continue;

      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (const pieza of piezas) {
        // SE MIDEN LOS GLIFOS, NO LA CAJA DEL SPAN.
        //
        // En una fracción, KaTeX sube el numerador y baja el denominador con
        // desplazamientos dentro de la línea, y la caja del span que los
        // envuelve no los contiene: medía la altura de la línea. La doble raya
        // del resultado caía entonces encima del denominador —"6/7" con el 7
        // tachado—. Midiendo cada glifo, y la raya de la fracción, la marca
        // abarca la fracción entera.
        const hojas = [pieza, ...pieza.querySelectorAll("*")].filter(
          (el) =>
            (el.childElementCount === 0 && (el.textContent ?? "").trim() !== "") ||
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

      medidas[clase] = {
        x: x1 - HOLGURA,
        y: y1 - HOLGURA,
        ancho: x2 - x1 + HOLGURA * 2,
        alto: y2 - y1 + HOLGURA * 2,
      };
    }

    setCajas(medidas);
  }, [escena]);

  // Medir tras pintar, no después: entre el pintado y un `useEffect` normal
  // cabe un fotograma, y el alumno vería el recuadro llegar tarde.
  useLayoutEffect(() => {
    setCajas({});
    medir();
  }, [medir, html]);

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

  return (
    <div
      className={cn(
        "pz-animada relative w-full overflow-x-auto px-2 py-6 text-center",
        proyeccion && "pz-proyeccion",
        className,
      )}
      // Quién decidió lo que se marca: la etiqueta del paso o la deducción. No
      // cambia nada en pantalla; permite comprobar desde fuera que un paso
      // etiquetado por el motor se pinta con su etiqueta.
      data-origen={escena.origen}
      data-gesto={escena.clase}
    >
      <div ref={contenedor} id={idPizarra} className="relative inline-block min-w-full">
        {/*
          LO QUE SE VA DESTAPANDO.

          La cuenta empieza con los dos sumandos y nada más; cada columna suelta
          su cifra del resultado y su llevada cuando le toca. El guion marca cada
          pieza con `pz-rev-N` y la hoja de estilos las arranca invisibles; aquí
          se declaran visibles las que ya han salido.

          Va como REGLA CSS y no tocando el DOM a mano. Una versión anterior
          recorría los nodos poniéndoles `style.opacity`, y en el navegador del
          cliente las cifras no aparecían nunca: cualquier repintado del bloque
          se llevaba por delante los estilos escritos a mano. Una regla, en
          cambio, la vuelve a aplicar el navegador siempre, y sigue sin
          recomponer la fórmula: no hay parpadeo.
        */}
        <style>{reglasDeRevelado(idPizarra, foco)}</style>

        {html ? (
          <span className="pz-formula" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          // Escena de prosa —o fórmula que KaTeX no supo componer—: se pinta
          // como texto, con las fórmulas sueltas que lleve dentro resueltas por
          // el mismo camino que el resto de la lección.
          <TextoMatematico texto={escena.texto} className="text-base leading-relaxed" />
        )}

        {/*
          La capa de resaltados. `pointer-events: none` para que no se coma la
          selección de texto de la fórmula que tiene debajo, y `aria-hidden`
          porque lo que dice ya se está diciendo en voz alta y en el pie.
        */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          {/*
            UN solo resaltado encendido: el de la columna que se está operando.
            Dejar tenues los anteriores parecía buena idea —el camino recorrido—
            pero en pantalla se leía como si todas las columnas estuvieran
            marcadas a la vez, y los rótulos de llevada se pisaban unos a otros.
            Lo que queda de los pasos anteriores son las cifras ya escritas, que
            es como se ve una cuenta hecha a mano.
          */}
          {escena.focos.flatMap((f, i) => {
            if (i !== foco) return [];
            // Una caja POR PIEZA. Con una sola caja para las dos, la del
            // despeje abarcaba desde el 6 de la izquierda hasta el de la
            // derecha —tragándose el "= 16"— y la tachadura cruzaba el signo
            // igual, que no se cancela con nada.
            return (f.piezas ?? [f.clase]).flatMap((pieza, j) => {
              const caja = cajas[pieza];
              if (!caja) return [];
              return [
                <Resaltado
                  key={`${pieza}-${i}-${j}`}
                  foco={f}
                  caja={caja}
                  // El rótulo se escribe una sola vez, sobre la primera pieza.
                  conEtiqueta={j === 0}
                />,
              ];
            });
          })}
        </svg>
      </div>

      {/* El texto del foco en curso, para quien no puede oírlo. */}
      <p className="pz-pie mt-4 min-h-[1.5rem] text-sm text-muted-foreground" aria-live="polite">
        {foco >= 0 ? (escena.focos[foco]?.narracion ?? "") : escena.narracion}
      </p>
    </div>
  );
}

/**
 * Un resaltado: caja, tachado o la confirmación del resultado.
 */
function Resaltado({
  foco,
  caja,
  conEtiqueta = true,
}: {
  foco: Foco;
  caja: Caja;
  conEtiqueta?: boolean;
}) {
  // EL RESULTADO NO SE RODEA: SE SUBRAYA Y SE CONFIRMA.
  //
  // Era un óvalo, y el cliente lo fotografió sobre el 3800: el contorno pasaba
  // por encima de las cifras y las cruzaba. Una marca que tapa el número que
  // quiere destacar no destaca nada. Ahora nada toca las cifras: dos rayas
  // DEBAJO del número y un visto a su DERECHA, con aire de por medio. Es la
  // marca que se hace a mano bajo un resultado correcto —el cliente la dibujó
  // así—, y el número, ya en verde, se lee entero.
  if (foco.tipo === "resultado") {
    // Todo proporcional al tamaño del número: en proyección la fórmula se
    // multiplica y el trazo engorda, y con huecos fijos de 5 px las dos rayas
    // se fundían en una sola barra.
    const izquierda = caja.x - 3;
    const derecha = caja.x + caja.ancho + 3;
    const primera = caja.y + caja.alto + Math.max(5, caja.alto * 0.09);
    const segunda = primera + Math.max(5, caja.alto * 0.1);
    // El visto, proporcionado al número y separado de él por un hueco limpio.
    const tam = Math.min(64, Math.max(12, caja.alto * 0.45));
    const x0 = derecha + Math.max(10, caja.alto * 0.12);
    const y0 = caja.y + caja.alto / 2;
    return (
      <g className="pz-resaltado" data-tipo={foco.tipo}>
        <line x1={izquierda} y1={primera} x2={derecha} y2={primera} className="pz-trazo pz-subrayado" pathLength={1} />
        <line x1={izquierda} y1={segunda} x2={derecha} y2={segunda} className="pz-trazo pz-subrayado pz-subrayado-2" pathLength={1} />
        <path
          d={`M ${x0} ${y0} l ${tam * 0.35} ${tam * 0.4} l ${tam * 0.65} ${-tam * 0.85}`}
          className="pz-trazo pz-visto"
          fill="none"
          pathLength={1}
        />
        {foco.etiqueta && conEtiqueta ? (
          <text x={caja.x + caja.ancho / 2} y={caja.y - 6} textAnchor="middle" className="pz-etiqueta">
            {foco.etiqueta}
          </text>
        ) : null}
      </g>
    );
  }

  return (
    <g className="pz-resaltado" data-tipo={foco.tipo}>
      {/* El fondo va DEBAJO del trazo y encima de la fórmula: es lo que hace que
          la columna operada se ilumine, y no sólo se enmarque. Como la capa no
          recibe eventos, la fórmula se sigue pudiendo seleccionar. */}
      <rect
        x={caja.x}
        y={caja.y}
        width={caja.ancho}
        height={caja.alto}
        rx={6}
        className="pz-fondo"
      />

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

      {foco.etiqueta && conEtiqueta ? (
        <text
          x={caja.x + caja.ancho / 2}
          y={caja.y - 6}
          textAnchor="middle"
          className="pz-etiqueta"
        >
          {foco.etiqueta}
        </text>
      ) : null}
    </g>
  );
}

/**
 * LA PIZARRA ANIMADA EN FUNCIONAMIENTO: guion, voz y mandos.
 *
 * Recibe las líneas de la lección tal como las escribe el motor, las convierte
 * en guion y las reproduce sincronizadas con el sintetizador. Es lo que el
 * alumno tiene delante en `/estudiante/leccion`.
 *
 * MODO PROYECCIÓN
 * El botón lleva el panel a pantalla completa con la API del navegador y le
 * aplica el tema de alto contraste: tipografía escalada, trazos gruesos y las
 * rayas de KaTeX engordadas, que a cuatro metros de una pizarra digital es la
 * diferencia entre ver la operación y adivinarla. Si el navegador deniega la
 * pantalla completa —pasa en algunos iframes—, el tema se aplica igual: se
 * pierde el pantalla completa, no la legibilidad.
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
  reposo = null,
  leccionTerminada = false,
  avatarDeLaLeccion,
  className,
}: {
  /**
   * Los pasos de la lección.
   *
   * Un paso puede llegar como texto plano —lo que escribe hoy el motor— o
   * etiquetado con su instrucción de foco. Con etiqueta, la pizarra marca
   * exactamente lo que dice; sin ella, la deduce del contenido.
   */
  lineas: readonly (string | PasoSemantico)[];
  tts?: VozUtilizable | null;
  vozActiva?: boolean;
  /**
   * Lo que el tutor de la lección está diciendo AHORA.
   *
   * Con esto la pizarra se coloca sola donde va la voz, sin que el alumno tenga
   * que darle a Reproducir: si se oye "sumamos las decenas", el recuadro está
   * sobre las decenas. Si el alumno reproduce el repaso por su cuenta, manda él
   * y el seguimiento se aparta.
   */
  narracion?: string | null;
  /** Avisa de por dónde va la animación y de si ya ha terminado. */
  alProgresar?: (progreso: { escena: number; foco: number; terminado: boolean }) => void;
  /**
   * Clave de la fase y el tema en curso: al cambiar, la pizarra vuelve a cero.
   *
   * Sin esto, al pasar de una fase a la siguiente la animación seguía donde la
   * dejó la anterior, y el primer paso de la fase nueva se pintaba con el
   * recuadro a mitad de camino de una cuenta que ya no está en pantalla.
   */
  reinicio?: string;
  /**
   * UN SOLO MANDO DE REPRODUCCIÓN.
   *
   * Mientras el tutor está explicando, quien manda es la lección: pausar aquí
   * tiene que parar SU voz, no abrir una reproducción paralela. Por eso el panel
   * recibe el estado del tutor y sus mandos, y sólo reproduce por su cuenta
   * cuando la lección está parada. Sin esto había dos motores de audio y dos
   * índices de paso, y acababan contando cosas distintas.
   */
  leccionEnMarcha?: boolean;
  leccionPausada?: boolean;
  mandosLeccion?: { pausar: () => void; reanudar: () => void };
  /** El aula usa esto para poner al avatar a explicar, pensar o celebrar. */
  alCambiarAvatar?: (estado: EstadoPedagogico) => void;
  /**
   * LO QUE SE PROYECTA CUANDO NO HAY NADA QUE ANIMAR.
   *
   * El botón de Modo proyección vivía sólo aquí, y este panel desaparecía
   * cuando la fase no tenía un paso animable: en la práctica —con el enunciado
   * "3/5 + 1/2 = ?" y nada más— o en el concepto. El cliente lo fotografió al
   * terminar una lección: el botón no estaba, y la proyección en el aula es un
   * entregable del hito.
   *
   * Con esto el panel no desaparece nunca durante una clase. Si no hay nada que
   * animar se queda en una barra con el botón —sin repetir debajo lo que ya
   * enseña la pizarra— y, al proyectar, pone en grande lo último que hay en la
   * pizarra: el paso, el enunciado o la regla.
   */
  reposo?: { texto: string; latex?: string | null } | null;
  /**
   * La lección ha terminado: la pizarra se queda RESUELTA, en el último paso
   * de su última línea, con todo destapado. Sin esto, al acabar volvía a su
   * primer paso y el resultado quedaba oculto justo cuando el subtítulo decía
   * "¡Lección completada!".
   */
  leccionTerminada?: boolean;
  /** El tutor de la lección, para que en proyección el avatar sea el que habla. */
  avatarDeLaLeccion?: { estado: EstadoAvatar | EstadoPedagogico; hablando: boolean };
  /**
   * Se avisa antes de ponerse a hablar.
   *
   * El sintetizador es uno solo y lo comparten el tutor de la lección y este
   * repaso: sin avisar, las dos locuciones se pisan y no se entiende ninguna.
   * El aula aprovecha para pausar al tutor.
   */
  alTomarLaVoz?: () => void;
  className?: string;
}) {
  const marco = useRef<HTMLDivElement | null>(null);
  const [proyeccion, setProyeccion] = useState(false);

  // El guion sólo se rehace cuando cambia LO QUE SE ANIMA, no cuando cambian las
  // líneas. El tutor va escribiendo mientras explica —el enunciado primero, el
  // desarrollo después— y casi siempre eso produce el mismo guion: la cuenta es
  // la misma. Rehacerlo de todas formas reiniciaba la máquina y la pizarra
  // volvía al primer paso a mitad de explicación.
  // La firma incluye la etiqueta: dos pasos con el mismo LaTeX y distinta
  // operación no son el mismo paso.
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

  /**
   * UN SOLO DUEÑO DEL SINTETIZADOR.
   *
   * Si el tutor vuelve a hablar mientras el repaso se estaba reproduciendo, el
   * repaso calla y pasa a seguirlo. Sin esta regla los dos hablaban a la vez y,
   * como cada locución empieza cancelando la anterior, se cancelaban entre
   * ellas: las dos daban por terminado su paso al instante y el resaltado salía
   * disparado por las columnas mientras el audio apenas había empezado.
   */
  useEffect(() => {
    if (leccionEnMarcha && !leccionPausada && estado.estado === "reproduciendo") {
      mandos.detener();
    }
  }, [leccionEnMarcha, leccionPausada, estado.estado, mandos]);

  // Cambiar de fase o de tema es empezar de cero: la animación vuelve a su
  // primer paso y se calla lo que ella misma estuviera diciendo.
  const primerReinicio = useRef(true);
  useEffect(() => {
    if (primerReinicio.current) {
      primerReinicio.current = false;
      return;
    }
    mandos.detener();
  }, [reinicio, mandos]);

  // La pizarra sigue a la voz del tutor. Es lo que ata el resaltado a lo que se
  // está oyendo: sin esto, la locución iba por las decenas y el recuadro seguía
  // en el primer paso, esperando a que alguien pulsara Reproducir.
  useEffect(() => {
    if (!narracion) return;
    // Se le dice DÓNDE ESTÁ, no sólo en qué escena: la cuenta se cuenta en
    // orden y desde el reposo, así que una locución no puede plantar la pizarra
    // tres pasos más allá. Sin esto, la frase que abre la fase de reglas la
    // dejaba en "Paso 3 de 4" —con las decenas ya resueltas— mientras el tutor
    // apenas estaba presentando la regla.
    const destino = situacionParaNarracion(escenas, narracion, estado.escena, estado.foco);
    if (!destino) return;
    mandos.situar(destino.escena, destino.foco);
  }, [narracion, escenas, estado.escena, estado.foco, mandos]);

  // AL TERMINAR LA LECCIÓN, LA PIZARRA QUEDA RESUELTA: último paso de la última
  // línea, con el resultado subrayado y confirmado. Se vuelve a situar si el
  // guion cambia estando terminada —el cierre del ejercicio añade su línea
  // justo en ese momento— para que lo último que se ve sea eso.
  useEffect(() => {
    if (!leccionTerminada || escenas.length === 0) return;
    const ultima = escenas.length - 1;
    mandos.situar(ultima, Math.max(-1, escenas[ultima].focos.length - 1));
  }, [leccionTerminada, escenas, mandos]);

  // Lo que la lección necesita saber: si la animación ya lo ha destapado todo.
  // Mientras no lo haya hecho, la pizarra de arriba no puede adelantar el
  // resultado.
  const terminado =
    escenas.length === 0 ||
    estado.estado === "final" ||
    (estado.escena === escenas.length - 1 && estado.foco >= estado.segmentos - 2);

  useEffect(() => {
    alProgresar?.({ escena: estado.escena, foco: estado.foco, terminado });
  }, [alProgresar, estado.escena, estado.foco, terminado]);

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

  // Sin nada que animar, la pizarra de reposo: lo último escrito, compuesto
  // sin marcas. Se calcula antes de decidir si el panel se pinta, porque de
  // ella depende.
  const escenaDeReposo = useMemo(
    () => (reposo?.texto ? escenaEstatica(reposo.texto, "reposo", reposo.latex ?? null) : null),
    [reposo?.texto, reposo?.latex],
  );
  const sinAnimacion = escenas.length === 0;
  if (sinAnimacion && !escenaDeReposo) return null;

  const enMarcha = estado.estado === "reproduciendo";

  /** Cualquier mando que arranque la voz pide antes el turno de palabra. */
  const conLaVoz = (accion: () => void) => () => {
    alTomarLaVoz?.();
    accion();
  };
  const escenaActual = sinAnimacion ? escenaDeReposo : (escenas[estado.escena] ?? null);

  // En proyección, el avatar es el del TUTOR mientras habla la lección; el del
  // repaso sólo cuando es el repaso el que está hablando.
  const avatarProyectado = enMarcha
    ? { estado: estado.avatar, hablando: estado.modo === "voz" }
    : (avatarDeLaLeccion ?? { estado: estado.avatar, hablando: false });

  return (
    <div
      ref={marco}
      className={cn(
        "rounded-lg border bg-card p-4",
        sinAnimacion && !proyeccion && "py-2.5",
        proyeccion && "modo-proyeccion flex h-full flex-col overflow-y-auto",
        className,
      )}
      data-panel={sinAnimacion ? "reposo" : "animado"}
    >
      <div
        className={cn(
          "pz-cabecera flex flex-wrap items-center justify-between gap-2",
          (!sinAnimacion || proyeccion) && "mb-2",
        )}
      >
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">
            {sinAnimacion ? "Pizarra de clase" : "Paso a paso animado"}
          </h3>
          {/*
            El paso que se cuenta es el de la ANIMACIÓN —la entrada y luego cada
            resaltado—, no la escena. Contando escenas, una cuenta de tres
            columnas decía "paso 1 de 4" mientras por dentro daba cuatro pasos,
            y desde fuera parecía que no avanzaba.
          */}
          {sinAnimacion ? (
            <span className="text-xs text-muted-foreground">Proyéctala en el aula</span>
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">
              Paso {estado.foco + 2} de {estado.segmentos}
              {estado.escenas > 1 ? ` · línea ${estado.escena + 1}/${estado.escenas}` : ""}
            </span>
          )}
        </div>
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

      {/*
        En proyección la pizarra comparte escenario con el avatar: el tutor
        tiene que seguir a la vista del aula mientras la fórmula ocupa el resto
        de la pantalla. Fuera de proyección no se duplica —el avatar ya está en
        su tarjeta— y la pizarra ocupa todo el ancho.
      */}
      {/* Sin nada que animar, el escenario sólo sale al proyectar: en pantalla
          la pizarra ya enseña lo mismo, y repetirlo aquí debajo duplicaría el
          contenido. */}
      {(!sinAnimacion || proyeccion) && (
        <div className="pz-escenario">
          {proyeccion && (
            <div className="pz-avatar">
              <Avatar2D estado={avatarProyectado.estado} hablando={avatarProyectado.hablando} />
            </div>
          )}
          <PizarraAnimada
            escena={escenaActual}
            foco={sinAnimacion ? -1 : estado.foco}
            proyeccion={proyeccion}
          />
        </div>
      )}

      {!sinAnimacion && (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/*
          El botón actúa sobre QUIEN ESTÉ HABLANDO. Con el tutor en marcha,
          pausa al tutor —y la pizarra se para con él, porque lo va siguiendo—;
          con la lección parada, reproduce el repaso animado. Nunca los dos.
        */}
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

        {/* La degradación se dice, no se esconde: si no hay voz, el alumno tiene
            derecho a saber por qué la pizarra avanza sola. */}
        {estado.modo === "temporizador" && (
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
      {!sinAnimacion && escenas.length > 1 && (
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
