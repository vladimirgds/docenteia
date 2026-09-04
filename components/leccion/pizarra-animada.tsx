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
import { useSincronizadorLeccion } from "@/components/leccion/sincronizador-leccion";
import {
  guionDeLeccion,
  reglasDeRevelado,
  situacionParaNarracion,
  type Escena,
  type Foco,
} from "@/lib/leccion/animacion";
import type { EstadoPedagogico } from "@/lib/leccion/sincronizacion";
import { cn } from "@/lib/utils";
import type { TTS } from "@/public/tts.js";

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

    for (const clase of new Set(escena.focos.map((f) => f.clase))) {
      const piezas = raiz.querySelectorAll(`.${CSS.escape(clase)}`);
      if (piezas.length === 0) continue;

      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (const pieza of piezas) {
        const r = pieza.getBoundingClientRect();
        // KaTeX deja spans de anchura cero (los `\mathstrut` y compañía): medir
        // uno de esos estiraría la caja hasta el margen izquierdo.
        if (r.width === 0 && r.height === 0) continue;
        x1 = Math.min(x1, r.left - base.left);
        y1 = Math.min(y1, r.top - base.top);
        x2 = Math.max(x2, r.right - base.left);
        y2 = Math.max(y2, r.bottom - base.top);
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
          {escena.focos.map((f, i) => {
            const caja = cajas[f.clase];
            if (!caja || i !== foco) return null;
            return <Resaltado key={`${f.clase}-${i}`} foco={f} caja={caja} />;
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
 * Un resaltado: caja, óvalo o tachado.
 *
 * Los que ya han pasado se quedan tenues en lugar de desaparecer: al llegar a
 * la última columna, el alumno ve el camino recorrido por la cuenta.
 */
function Resaltado({ foco, caja }: { foco: Foco; caja: Caja }) {
  return (
    <g className="pz-resaltado" data-tipo={foco.tipo}>
      {/* El fondo va DEBAJO del trazo y encima de la fórmula: es lo que hace que
          la columna operada se ilumine, y no sólo se enmarque. Como la capa no
          recibe eventos, la fórmula se sigue pudiendo seleccionar. */}
      {foco.tipo === "ovalo" ? (
        <ellipse
          cx={caja.x + caja.ancho / 2}
          cy={caja.y + caja.alto / 2}
          rx={caja.ancho / 2 + 2}
          ry={caja.alto / 2 + 2}
          className="pz-fondo"
        />
      ) : (
        <rect
          x={caja.x}
          y={caja.y}
          width={caja.ancho}
          height={caja.alto}
          rx={6}
          className="pz-fondo"
        />
      )}

      {foco.tipo === "ovalo" ? (
        <ellipse
          cx={caja.x + caja.ancho / 2}
          cy={caja.y + caja.alto / 2}
          rx={caja.ancho / 2 + 2}
          ry={caja.alto / 2 + 2}
          className="pz-trazo"
          fill="none"
        />
      ) : (
        <rect
          x={caja.x}
          y={caja.y}
          width={caja.ancho}
          height={caja.alto}
          rx={6}
          className="pz-trazo"
          fill="none"
        />
      )}

      {foco.tipo === "tachado" ? (
        <line
          x1={caja.x + 1}
          y1={caja.y + caja.alto}
          x2={caja.x + caja.ancho - 1}
          y2={caja.y}
          className="pz-trazo pz-tachado"
        />
      ) : null}

      {foco.etiqueta ? (
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
  leccionEnMarcha = false,
  leccionPausada = false,
  mandosLeccion,
  className,
}: {
  /** Las líneas de la lección, en la notación plana del motor. */
  lineas: readonly string[];
  tts?: TTS | null;
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

  // El guion sólo se rehace cuando cambian las líneas de verdad: recomponerlo
  // en cada pintado reiniciaría la reproducción a mitad de explicación.
  const firma = lineas.join("|");
  const escenas = useMemo(() => guionDeLeccion(firma.split("|")), [firma]);

  const { estado, mandos } = useSincronizadorLeccion({ escenas, tts, audio: vozActiva });

  useEffect(() => {
    alCambiarAvatar?.(estado.avatar);
  }, [estado.avatar, alCambiarAvatar]);

  // La pizarra sigue a la voz del tutor. Es lo que ata el resaltado a lo que se
  // está oyendo: sin esto, la locución iba por las decenas y el recuadro seguía
  // en el primer paso, esperando a que alguien pulsara Reproducir.
  useEffect(() => {
    if (!narracion) return;
    const destino = situacionParaNarracion(escenas, narracion, estado.escena);
    if (!destino) return;
    mandos.situar(destino.escena, destino.foco);
  }, [narracion, escenas, estado.escena, mandos]);

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

  if (escenas.length === 0) return null;

  const enMarcha = estado.estado === "reproduciendo";

  /** Cualquier mando que arranque la voz pide antes el turno de palabra. */
  const conLaVoz = (accion: () => void) => () => {
    alTomarLaVoz?.();
    accion();
  };
  const escenaActual = escenas[estado.escena] ?? null;

  return (
    <div
      ref={marco}
      className={cn(
        "rounded-lg border bg-card p-4",
        proyeccion && "modo-proyeccion flex h-full flex-col overflow-y-auto",
        className,
      )}
    >
      <div className="pz-cabecera mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Paso a paso animado</h3>
          {/*
            El paso que se cuenta es el de la ANIMACIÓN —la entrada y luego cada
            resaltado—, no la escena. Contando escenas, una cuenta de tres
            columnas decía "paso 1 de 4" mientras por dentro daba cuatro pasos,
            y desde fuera parecía que no avanzaba.
          */}
          <span className="text-xs text-muted-foreground tabular-nums">
            Paso {estado.foco + 2} de {estado.segmentos}
            {estado.escenas > 1 ? ` · línea ${estado.escena + 1}/${estado.escenas}` : ""}
          </span>
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
      <div className="pz-escenario">
        {proyeccion && (
          <div className="pz-avatar">
            <Avatar2D estado={estado.avatar} hablando={enMarcha && estado.modo === "voz"} />
          </div>
        )}
        <PizarraAnimada escena={escenaActual} foco={estado.foco} proyeccion={proyeccion} />
      </div>

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

      {/* Selector de escena: en clase, el profesor vuelve a un paso concreto sin
          tener que reproducir la lección entera. */}
      {escenas.length > 1 && (
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
