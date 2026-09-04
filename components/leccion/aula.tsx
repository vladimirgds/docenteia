"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";

import { PSELight } from "@/public/pseLight.js";
import { TTS } from "@/public/tts.js";
import type { EstadoAvatar, EstadoControles, LSG, UIPSELight } from "@/public/pseLight";

import { Avatar2D } from "@/components/leccion/avatar-2d";
import { PanelAnimado } from "@/components/leccion/pizarra-animada";
import { esAnimable } from "@/lib/leccion/animacion";
import type { EstadoPedagogico } from "@/lib/leccion/sincronizacion";
import {
  Pizarra,
  tituloDeFase,
  type FaseAbierta,
  type LineaPizarra,
  type ReglaPizarra,
} from "@/components/leccion/pizarra";
import { TextoMatematico } from "@/components/math";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  construirPeticion,
  estadoInicial,
  type EstadoConversacion,
  type Seguimiento,
} from "@/lib/leccion/seguimiento";
import { esFaseDeEjemplo, esFaseDePractica } from "@/lib/leccion/fases";
import { reglaActiva } from "@/lib/leccion/reglas";
import {
  enunciadosDeLeccion,
  enunciadoTrasPeticion,
  presentacionDe,
  recortarParaSeguimiento,
  sinPreguntas,
} from "@/lib/leccion/seguimiento-lsg";
import { esIdeaFuerza, expresionPrincipal } from "@/lib/matematicas";
import {
  esLaMismaCuenta,
  leerOperacionDibujada,
  leerSumaOResta,
} from "@/lib/leccion/columna";
import { hayQueMostrarAyuda, veredictoTrasAcierto } from "@/lib/leccion/retroalimentacion";
import { TEMAS_LECCION, type TemaLeccion } from "@/lib/leccion/temas";
import { cn } from "@/lib/utils";

/** Botones de apoyo del entorno de resolución (Módulo 8). */
const BOTONES_APOYO: Array<{
  etiqueta: string;
  consulta: string;
  seguimiento: Seguimiento;
  parte?: "concepto" | "resolucion";
  /** Aclara lo que ya hay en pantalla; no trae ejercicio nuevo. */
  soloExplicacion?: boolean;
}> = [
  {
    etiqueta: "No entendí este paso",
    consulta: "No entendí, explícalo mejor",
    seguimiento: "reexplicar",
    parte: "resolucion",
    soloExplicacion: true,
  },
  {
    etiqueta: "Dame otro ejemplo",
    consulta: "Dame otro ejemplo",
    seguimiento: "continuacion",
  },
  {
    etiqueta: "Explicar regla",
    consulta: "Explícame la regla que se aplica",
    seguimiento: "reexplicar",
    parte: "concepto",
    soloExplicacion: true,
  },
];

interface Veredicto {
  correcto: boolean | null;
  verificable: boolean;
  mensaje?: string;
  pista?: string;
}

/** Una regla del catálogo, tal como llega desde la base de datos. */
export interface ReglaVista extends ReglaPizarra {
  tema: string;
  nivel: string | null;
}

/** Avance acumulado del alumno en un tema, leído de PostgreSQL. */
export interface ProgresoTema {
  tema: string;
  sesiones: number;
  ultima: string | null;
  aciertos: number;
  intentos: number;
}

export function Aula({
  temas = TEMAS_LECCION,
  reglas = [],
  progreso = [],
  curso = null,
}: {
  /**
   * Los temas que se le pueden ofrecer a ESTE alumno.
   *
   * Los decide el servidor a partir del currículo y del curso del alumno; antes
   * se pintaban los cinco motores escritos en el código, y por eso a un alumno
   * de 6.º de primaria le aparecían derivadas. El valor por defecto se conserva
   * para que el componente siga siendo utilizable de forma aislada (la batería
   * de QA lo monta sin servidor).
   */
  temas?: readonly TemaLeccion[];
  reglas?: ReglaVista[];
  progreso?: ProgresoTema[];
  /** Curso del alumno, para poder decírselo en pantalla. */
  curso?: string | null;
}) {
  // ── Instancias del motor (sólo en el navegador) ────────────────────────────
  const pseRef = useRef<PSELight | null>(null);
  const ttsRef = useRef<TTS | null>(null);
  const resolverRespuesta = useRef<((valor: string | null) => void) | null>(null);
  const idLinea = useRef(0);
  const conversacion = useRef<EstadoConversacion>(estadoInicial());

  // ¿La petición en curso es una AYUDA sobre la lección activa, en vez de un
  // tema nuevo? Los callbacks del reproductor lo consultan para no reiniciar la
  // clase: al cargar una lección, el motor limpia la pizarra y vuelve a anunciar
  // sus módulos desde el primero, y eso devolvía al alumno a la fase Concepto
  // borrándole el ejercicio que estaba resolviendo.
  const esAyuda = useRef(false);

  // ¿La petición en curso es una ACLARACIÓN? Sus líneas se agrupan aparte en la
  // pizarra y sustituyen a las de la aclaración anterior.
  const esAclaracion = useRef(false);

  // Sesión de aprendizaje abierta en el servidor, a la que se cuelgan los
  // intentos de práctica.
  const sesionId = useRef<string | null>(null);

  // Última regla que el tutor ha nombrado en TODA la lección.
  //
  // Es distinta de la que la pizarra resalta en la fase de Reglas: aquélla mira
  // sólo la escena en curso, porque enseña la tarjeta de lo que se está
  // narrando. Ésta mira la lección entera, porque el alumno pulsa "Explicar
  // regla" cuando ya está en Práctica, y lo que hay que explicarle es la regla
  // que le enseñaron, no ninguna de la fase en la que está.
  const reglaEnCursoRef = useRef<{ nombre: string; enunciado: string } | null>(null);

  /** Todo lo que el tutor ha narrado en la lección, para detectar la regla. */
  const narrado = useRef<string[]>([]);

  /**
   * Enunciado de cada fase, leído de la lección ANTES de reproducirla.
   *
   * El motor narra primero y escribe después: en la fase de práctica dice
   * "Vamos a derivar 3x⁴ - 2x²" durante varios segundos y sólo al terminar
   * emite la directiva que lo escribe. Como la locución ya no se vuelca al
   * lienzo, la pizarra se quedaba en blanco todo ese rato.
   *
   * Adelantando el enunciado al abrir la fase, la tarjeta aparece en el mismo
   * instante en que empieza a hablar de ella, sin esperar a la cola de voz.
   */
  const enunciadoPorFase = useRef<Map<string, string>>(new Map());

  /**
   * Espejos del estado de la pizarra.
   *
   * Las directivas del motor llegan varias en el mismo tick, y la decisión de
   * si una línea es el ENUNCIADO o un paso del desarrollo depende de si ya hay
   * enunciado. Leyendo el estado de React esa respuesta llega tarde: dos
   * líneas seguidas se promocionaban las dos a enunciado. Los espejos se
   * adelantan al render y la decisión es siempre sobre el valor real.
   */
  const fasesRef = useRef<FaseAbierta[]>([]);
  const ejercicioRef = useRef<LineaPizarra | null>(null);
  /** Todo lo escrito en la pizarra durante la lección, para detectar la regla. */
  const escrito = useRef<string[]>([]);

  // ── Estado visible ─────────────────────────────────────────────────────────
  const [listo, setListo] = useState(false);
  const [tema, setTema] = useState<TemaLeccion | null>(null);
  const [estadoAvatar, setEstadoAvatar] = useState<EstadoAvatar>("neutral");
  const [hablando, setHablando] = useState(false);
  /**
   * El estado que pide la pizarra animada, cuando está reproduciendo.
   *
   * Manda sobre el del motor mientras dura la animación —es lo que está
   * ocurriendo en pantalla— y se aparta en cuanto queda en reposo, para no
   * dejar al avatar clavado en "esperando" durante el resto de la lección.
   */
  const [avatarPizarra, setAvatarPizarra] = useState<EstadoPedagogico | null>(null);
  const alCambiarAvatar = useCallback((estado: EstadoPedagogico) => {
    setAvatarPizarra(estado === "IDLE" ? null : estado);
  }, []);
  /**
   * El sintetizador, también en estado y no sólo en la referencia: la pizarra
   * animada lo recibe como prop, y una referencia rellenada en un efecto no
   * provoca el repintado que se lo entregaría.
   */
  const [tts, setTts] = useState<TTS | null>(null);
  /**
   * La pizarra en TRES estados independientes.
   *
   * El ejercicio ya no cuelga de la fase ni se deduce del desarrollo: se fija
   * al entrar en la fase y vive por su cuenta, así que la tarjeta de arriba se
   * compone en el milisegundo 0 aunque no haya un solo paso calculado. El
   * desarrollo es un array aparte que se SUSTITUYE entero en cada petición.
   */
  const [fases, setFases] = useState<FaseAbierta[]>([]);
  const [ejercicio, setEjercicio] = useState<LineaPizarra | null>(null);
  const [desarrollo, setDesarrollo] = useState<LineaPizarra[]>([]);
  /**
   * De qué fase es el contenido que hay ahora mismo en el ejercicio y en el
   * desarrollo.
   *
   * Al cambiar de fase, la vista saliente y la entrante conviven durante la
   * transición. Sin decir a quién pertenece cada cosa, el contenido nuevo podía
   * pintarse un instante bajo el rótulo de la fase vieja —o al revés— y eso es
   * el parpadeo: un recuadro que aparece un milisegundo y desaparece de golpe.
   * Con la marca, la pizarra sólo compone el contenido de la fase que está
   * pintando.
   */
  const [faseDelContenido, setFaseDelContenido] = useState("");
  const [resaltado, setResaltado] = useState<string | null>(null);
  const [subtitulo, setSubtitulo] = useState("");
  const [controles, setControles] = useState<EstadoControles>({
    playing: false,
    paused: false,
    hasLesson: false,
    index: 0,
    total: 0,
  });
  const [pregunta, setPregunta] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [intento, setIntento] = useState(1);
  const [veredicto, setVeredicto] = useState<Veredicto | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vozActiva, setVozActiva] = useState(true);
  const [estadoVoz, setEstadoVoz] = useState("");

  /** Deja la pizarra entera en blanco: fases, ejercicio y desarrollo. */
  const limpiarPizarra = useCallback(() => {
    fasesRef.current = [];
    ejercicioRef.current = null;
    escrito.current = [];
    setFases([]);
    setEjercicio(null);
    setDesarrollo([]);
    setFaseDelContenido("");
  }, []);

  /** Abre una fase genérica cuando el motor escribe sin haber anunciado ninguna. */
  const asegurarFase = useCallback(() => {
    if (fasesRef.current.length > 0) return;
    fasesRef.current = [{ id: "leccion", titulo: "Lección" }];
    setFases(fasesRef.current);
    setFaseDelContenido("leccion");
  }, []);

  /** ¿La fase abierta plantea un ejercicio al alumno? */
  const faseConEjercicio = useCallback(() => {
    const fase = fasesRef.current[fasesRef.current.length - 1];
    return fase != null && (esFaseDeEjemplo(fase.id) || esFaseDePractica(fase.id));
  }, []);

  /** Fija el ejercicio activo, o lo retira. Mantiene el espejo al día. */
  const fijarLineaEjercicio = useCallback((linea: LineaPizarra | null) => {
    ejercicioRef.current = linea;
    setEjercicio(linea);
    if (linea) escrito.current = [...escrito.current, linea.texto].slice(-60);
  }, []);

  /**
   * Escribe una línea en la pizarra.
   *
   * La PRIMERA expresión de una fase con ejercicio es el ENUNCIADO y va a su
   * propio estado; las demás son el procedimiento y se acumulan en el
   * desarrollo. Al vivir en estados separados, un paso nuevo no puede tocar la
   * tarjeta de arriba ni al revés.
   */
  const anadirLinea = useCallback(
    (texto: string, clase: "formula" | "explicacion") => {
      const limpio = String(texto ?? "").trim();
      if (!limpio) return;
      const linea: LineaPizarra = {
        id: idLinea.current++,
        texto: limpio,
        clase,
        aclaracion: esAclaracion.current,
      };
      asegurarFase();

      if (faseConEjercicio() && ejercicioRef.current === null && !esAclaracion.current) {
        fijarLineaEjercicio(linea);
        return;
      }

      // El enunciado NO se repite en el desarrollo. El motor lo escribe con una
      // directiva propia, y si ya se adelantó al abrir la fase, esa directiva
      // llegaría aquí y lo pintaría por segunda vez.
      if (ejercicioRef.current?.texto === limpio) return;

      // Y tampoco lo replantea con otras palabras: la tarjeta muestra
      // "19 + 45 = ?" y el motor abre el desarrollo escribiendo "19 + 45", que
      // es la misma cuenta sin resolver. Un dibujo con su desarrollo sí entra:
      // eso ya no es el enunciado, es el procedimiento.
      const replanteaElEnunciado =
        ejercicioRef.current != null &&
        leerSumaOResta(limpio) != null &&
        esLaMismaCuenta(ejercicioRef.current.texto, limpio);
      if (replanteaElEnunciado) return;

      escrito.current = [...escrito.current, limpio].slice(-60);
      setDesarrollo((prev) => {
        // El motor REDIBUJA la misma cuenta en cada paso: primero los dos
        // números, luego con la cifra de las unidades bajo la raya, y al final
        // con la llevada y el total. Apiladas, en la pizarra se veían tres
        // sumas distintas. Es una sola, que avanza: la nueva sustituye a la
        // anterior en lugar de añadirse.
        const ultima = prev[prev.length - 1];
        // La línea adelantada al abrir la fase no se escribe dos veces cuando el
        // motor llega a ella.
        if (ultima && ultima.texto === limpio) return prev;
        if (ultima && esLaMismaCuenta(ultima.texto, limpio)) {
          return [...prev.slice(0, -1), linea];
        }
        return [...prev, linea];
      });
    },
    [asegurarFase, faseConEjercicio, fijarLineaEjercicio],
  );

  /**
   * Rellena la tarjeta de EJERCICIO de la fase en curso a partir de una frase.
   *
   * La tarjeta superior no puede depender de que el motor emita una directiva
   * de pizarra: hay fases que sólo narran el enunciado o lo dejan dentro de la
   * pregunta, y entonces el lienzo se quedaba en blanco con el ejercicio ya
   * planteado. Se extrae la expresión de la frase y se descarta la prosa, que
   * sigue yendo sólo al subtítulo.
   *
   * Sin efecto si la fase no plantea ejercicio o si la tarjeta ya tiene uno:
   * el enunciado se fija una vez y no lo pisa nada.
   */
  const fijarEjercicio = useCallback(
    (frase: string) => {
      if (!faseConEjercicio() || ejercicioRef.current) return;
      const formula = expresionPrincipal(frase);
      if (!formula) return;
      fijarLineaEjercicio({ id: idLinea.current++, texto: formula, clase: "formula" });
    },
    [faseConEjercicio, fijarLineaEjercicio],
  );

  /**
   * Abre una fase. Cada fase pedagógica es una vista propia: la pizarra se
   * sustituye con una transición limpia en lugar de seguir apilando párrafos.
   *
   * El ejercicio se fija AQUÍ, en el mismo instante en que se entra, y el
   * desarrollo arranca vacío. No se espera a ninguna directiva ni a la cola de
   * voz: la tarjeta de arriba está puesta antes de que el tutor abra la boca.
   */
  const abrirEscena = useCallback(
    (id: string) => {
      const clave = String(id ?? "").trim();
      if (!clave) return;

      // El reproductor reconstruye la pizarra al retroceder o reanudar, y en esa
      // reconstrucción vuelve a anunciar los módulos ya vistos. Sin esta guarda
      // se duplicarían las fases.
      const abiertas = fasesRef.current;
      if (abiertas.length > 0 && abiertas[abiertas.length - 1].id === clave) return;

      fasesRef.current = [...abiertas, { id: clave, titulo: tituloDeFase(clave) }];
      setFases(fasesRef.current);
      // En el mismo lote que la fase: el contenido que viene a continuación es
      // suyo, y el de la fase anterior deja de pintarse en el mismo instante.
      setFaseDelContenido(clave);

      // El enunciado se conoce desde que llegó la lección; y si esta fase no lo
      // trae, vale el que el alumno tiene entre manos. En una fase de ejercicio
      // la tarjeta no puede abrirse vacía.
      const plantea = esFaseDeEjemplo(clave) || esFaseDePractica(clave);
      const texto = enunciadoPorFase.current.get(clave) || conversacion.current.ejercicio;
      fijarLineaEjercicio(
        plantea && texto ? { id: idLinea.current++, texto, clase: "formula" } : null,
      );
      // Y en las fases que NO plantean ejercicio —Concepto y Reglas— se adelanta
      // igual su primera línea. El tutor entra en Reglas y habla varios segundos
      // antes de escribir nada: hasta entonces el lienzo se quedaba vacío, con
      // la fase abierta y la voz explicando. La línea se conoce desde que llegó
      // la lección, así que no hay razón para esperarla.
      const adelantada = !plantea ? enunciadoPorFase.current.get(clave) : null;
      setDesarrollo(
        adelantada ? [{ id: idLinea.current++, texto: adelantada, clase: "formula" }] : [],
      );
    },
    [fijarLineaEjercicio],
  );

  // ── Montaje del reproductor ────────────────────────────────────────────────
  useEffect(() => {
    const tts = new TTS();
    ttsRef.current = tts;
    setTts(tts);
    setEstadoVoz(tts.describe());

    // El avatar y la voz son dependencias del motor; aquí se le entregan como
    // adaptadores que, en lugar de tocar el DOM, actualizan el estado de React.
    const avatar = {
      setState: (estado: EstadoAvatar) => setEstadoAvatar(estado),
      setSpeaking: (activo: boolean) => setHablando(activo),
    };

    const ui: UIPSELight = {
      // Durante una ayuda no se abre fase nueva ni se borra la pizarra: la
      // respuesta se añade a la escena en la que está el alumno.
      setModule: (etiqueta) => {
        if (esAyuda.current) return;
        abrirEscena(String(etiqueta ?? ""));
      },
      // A la pizarra sólo suben IDEAS FUERZA: el título de la regla, las
      // fórmulas y el ejercicio. Un párrafo explicativo va al subtítulo, aunque
      // llegue por una directiva de pizarra: desde que las aclaraciones las
      // redacta el modelo en vivo, eso puede pasar.
      writeBoard: (texto) => {
        const contenido = String(texto ?? "").trim();
        if (!contenido) return;

        // Una directiva puede traer VARIAS líneas. Compuestas de una vez, los
        // saltos se pierden y las líneas se pegan: "19 + 45 = ?" seguido de
        // "9 + 5 = 14" salía como "19 + 45 =?9 + 5 = 14". Cada línea es un paso
        // y se escribe por separado.
        //
        // Salvo cuando el motor DIBUJA la cuenta en columna: ahí las varias
        // líneas son una sola cosa, y separarlas la destruiría.
        const lineas = leerOperacionDibujada(contenido)
          ? [contenido]
          : contenido.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

        for (const linea of lineas) {
          if (esIdeaFuerza(linea)) anadirLinea(linea, "formula");
          else setSubtitulo(linea);
        }
      },
      // La explicación hablada NO va a la pizarra. El motor la escribía además
      // de narrarla, así que el mismo párrafo aparecía dos veces: en el lienzo
      // y en el subtítulo. La pizarra queda para el título de la regla, las
      // expresiones y el ejercicio; la prosa, sólo en el subtítulo.
      writeBoardExplain: () => {},
      highlightBoard: (objetivo) => setResaltado(objetivo ?? null),
      clearBoard: () => {
        if (esAyuda.current) return;
        limpiarPizarra();
        setResaltado(null);
      },
      setCaption: (texto) => {
        const t = String(texto ?? "");
        setSubtitulo(t);
        // Lo narrado se guarda aparte para poder saber qué regla está
        // explicando el tutor. Antes se deducía de la pizarra, pero la prosa ya
        // no se escribe allí.
        if (t.trim()) narrado.current = [...narrado.current, t].slice(-40);
      },
      onStep: () => {},
      setControls: (estado) => setControles(estado),
      onProgress: (index, total) =>
        setControles((prev) => ({ ...prev, index, total })),
      showFeedback: (ok, msg) => {
        setFeedback({ ok, msg });
        // Al acertar se retira la pista del intento anterior. El motor local
        // canta el acierto por su cuenta, y si la corrección del servidor no
        // llegó —sesión caducada, fallo de red— su caja roja se quedaba en
        // pantalla junto al "¡Correcto!" en verde.
        if (ok) setVeredicto(veredictoTrasAcierto);
      },
      onLessonEnd: () => {
        setPregunta(null);
        setEstadoAvatar("sonriendo");
        // Se cierra la sesión para que quede su duración registrada.
        if (sesionId.current) {
          void fetch("/api/sesion", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sesionId: sesionId.current }),
          }).catch(() => {});
        }
      },
      // Suspende la lección hasta que el alumno responde. La promesa se resuelve
      // desde el formulario de respuesta, o con null si se aborta la lección.
      askAnswer: (textoPregunta, opciones) =>
        new Promise<string | null>((resolve) => {
          // Último recurso para la tarjeta: si la fase llegó hasta aquí sin
          // escribir ni narrar el enunciado, lo lleva la propia pregunta.
          fijarEjercicio(String(textoPregunta ?? ""));
          setPregunta(String(textoPregunta ?? ""));
          setBorrador("");
          setIntento(1);
          // La retroalimentación del ejercicio anterior no acompaña al
          // siguiente: ni el veredicto del servidor ni el mensaje del tutor.
          setVeredicto(null);
          setFeedback(null);
          resolverRespuesta.current = resolve;
          opciones?.signal?.addEventListener("abort", () => {
            resolverRespuesta.current = null;
            setPregunta(null);
            resolve(null);
          });
        }),
    };

    pseRef.current = new PSELight({ avatar, tts, ui });
    setListo(true);

    return () => {
      pseRef.current?.stop();
      tts.cancel();
    };
  }, [anadirLinea, abrirEscena]);

  // ── Petición de lección al servidor ────────────────────────────────────────
  const pedirLeccion = useCallback(
    async (
      consulta: string,
      opciones: {
        seguimiento?: Seguimiento | null;
        parte?: "concepto" | "resolucion";
        /**
         * El botón sólo pide una ACLARACIÓN sobre lo que ya está en pantalla,
         * no un ejercicio nuevo. En ese caso la explicación la genera la IA en
         * vivo y el ejercicio que el alumno está resolviendo no se toca.
         */
        soloExplicacion?: boolean;
      } = {},
    ) => {
      setCargando(true);
      setError(null);
      setFeedback(null);
      setVeredicto(null);
      setPregunta(null);

      esAclaracion.current = Boolean(opciones.soloExplicacion);

      // TODA petición que vaya a escribir en la pizarra vacía antes el
      // desarrollo. Si no, el procedimiento del ejercicio anterior se queda
      // debajo y el contenido nuevo se añade al fondo, de modo que en pantalla
      // conviven dos ejercicios distintos como si fueran uno. El ENUNCIADO se
      // conserva, porque una aclaración no cambia el ejercicio que el alumno
      // está resolviendo.
      // El enunciado se refresca con el ejercicio activo: si el alumno ya pasó
      // al siguiente, la tarjeta no puede seguir mostrando el anterior.
      const activo = conversacion.current.ejercicio;
      const faseActual = fasesRef.current[fasesRef.current.length - 1];
      if (faseActual) {
        const texto = enunciadoTrasPeticion({
          enTarjeta: ejercicioRef.current?.texto ?? null,
          deLaFase: enunciadoPorFase.current.get(faseActual.id) ?? null,
          activo,
          planteaEjercicio: faseConEjercicio(),
        });
        // La línea sólo se rehace cuando el texto cambia: rehacerla siempre le
        // daría un id nuevo y la tarjeta parpadearía en cada pulsación.
        if (texto !== (ejercicioRef.current?.texto ?? null)) {
          fijarLineaEjercicio(
            texto ? { id: idLinea.current++, texto, clase: "formula" } : null,
          );
        }
      }
      // SUSTITUCIÓN, no concatenación: el desarrollo del ejercicio activo se
      // reemplaza entero. Los pasos de la respuesta anterior no pueden quedar
      // debajo de los nuevos, que es lo que apilaba dos ejercicios en pantalla.
      setDesarrollo([]);

      try {
        const cuerpo = construirPeticion(consulta, conversacion.current, opciones);
        if (opciones.soloExplicacion) {
          cuerpo.explicacionDinamica = true;
          // Qué regla se está explicando y sobre qué término. Es la diferencia
          // entre "explícame la regla de la potencia sobre 5x²" y "háblame de
          // derivadas", que es lo que el modelo entendía sin este contexto.
          const activa = reglaEnCursoRef.current;
          cuerpo.aclaracion = {
            regla: activa ? { nombre: activa.nombre, formula: activa.enunciado } : null,
            ejercicio: conversacion.current.ejercicio,
            tema: conversacion.current.temaActivo || conversacion.current.claveTema,
          };
        }
        const r = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(cuerpo),
        });
        const datos = await r.json();

        if (!r.ok) {
          setError(datos.error ?? "No se pudo generar la lección.");
          return;
        }

        const estado = conversacion.current;

        // Cómo presentar la respuesta. Es la decisión que estaba mal: se
        // trataba todo seguimiento igual, así que una lección NUEVA se apilaba
        // dentro de la escena anterior y el enunciado de arriba se quedaba
        // congelado en el ejercicio viejo mientras abajo aparecía el nuevo.
        const presentacion = presentacionDe(datos.lsg, {
          esSeguimiento: Boolean(opciones.seguimiento),
          soloExplicacion: opciones.soloExplicacion,
        });

        // El reproductor sólo puede borrar la pizarra entera y reabrir fases
        // cuando se REINICIA. Al anexar y al sustituir hay que conservar las
        // escenas, porque son las que mantienen al alumno en su fase; en el
        // segundo caso el vaciado se hace aquí abajo, escena a escena.
        // Con la pizarra vacía NO se suprime la apertura de fases: si el alumno
        // pulsa un botón de apoyo antes de que se abra ninguna escena, anexar a
        // "lo que hay" no anexa a nada y el lienzo se queda en blanco sin nada
        // que vuelva a abrirlo.
        esAyuda.current = presentacion !== "reiniciar" && fasesRef.current.length > 0;

        if (presentacion === "sustituir") {
          // Llega OTRO ejercicio, no otro paso del mismo: se retira también el
          // enunciado para que la tarjeta de arriba tome el nuevo. Se conserva
          // la fase, de modo que el alumno no retroceda a Concepto.
          fijarLineaEjercicio(null);
          setDesarrollo([]);
        }

        // Una lección de seguimiento repite concepto y reglas tal cual: se
        // recorta para entrar directamente por el ejemplo.
        const recortada =
          presentacion === "reiniciar" && opciones.seguimiento
            ? recortarParaSeguimiento(datos.lsg)
            : datos.lsg;
        // Una aclaración explica; no pregunta. Su pregunta ocupaba la caja de
        // respuesta —"¿Entendiste la explicación?"— y le quitaba al alumno de
        // delante el ejercicio que estaba resolviendo.
        const lsg = (opciones.soloExplicacion ? sinPreguntas(recortada) : recortada) as LSG;

        // Se anota el enunciado de cada fase antes de reproducir nada, para
        // poder mostrarlo en cuanto se entra en ella.
        enunciadoPorFase.current = enunciadosDeLeccion(lsg);

        // El servidor no guarda sesión: el contexto se mantiene aquí y viaja en
        // cada petición. Los cursores de rotación tienen que dar la vuelta
        // completa o el alumno vería siempre el mismo ejemplo.
        if (datos.cursores) estado.cursores = datos.cursores;
        if (!opciones.seguimiento) estado.temaActivo = consulta;
        estado.historial = [...estado.historial, consulta].slice(-5);

        const pasos = Array.isArray(datos.pasos) ? datos.pasos : [];
        estado.previo = pasos
          .filter((p: { tipo: string }) => p.tipo === "hablar")
          .slice(0, 3)
          .map((p: { texto: string }) => p.texto)
          .join(" ")
          .slice(0, 600);

        // El ejercicio en pantalla es la última fórmula escrita. Una aclaración
        // NO lo cambia: el alumno sigue con el que estaba resolviendo, y
        // sustituirlo haría que su respuesta se corrigiera contra otro
        // enunciado. "Otro ejemplo" o un cambio de nivel sí lo renuevan.
        const pizarras = pasos
          .filter((p: { tipo: string }) => p.tipo === "pizarra")
          .map((p: { contenido: string }) => p.contenido);
        if (!opciones.soloExplicacion && pizarras.length > 0) {
          estado.ejercicio = pizarras[pizarras.length - 1];
        }

        pseRef.current?.play(lsg);
      } catch {
        setError("No se pudo contactar con el servidor. Revisa tu conexión.");
      } finally {
        setCargando(false);
      }
    },
    [],
  );

  /**
   * Abre un tema.
   *
   * `continuar` retoma donde lo dejó el alumno en lugar de repetirle el mismo
   * diálogo introductorio: se entra como seguimiento del tema, así que el motor
   * arranca con material nuevo y respeta el nivel que ya tenía.
   */
  const empezarTema = useCallback(
    (elegido: TemaLeccion, continuar = false) => {
      setTema(elegido);
      conversacion.current = estadoInicial();
      conversacion.current.claveTema = elegido.clave;
      narrado.current = [];

      // La sesión se abre en el servidor: es lo que hace que el avance quede
      // registrado. Si falla, la clase sigue igualmente.
      sesionId.current = null;
      void fetch("/api/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema: elegido.clave }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          sesionId.current = d?.sesionId ?? null;
        })
        .catch(() => {});

      if (continuar) {
        conversacion.current.temaActivo = elegido.consulta;
        void pedirLeccion("Dame otro ejemplo", { seguimiento: "continuacion" });
      } else {
        void pedirLeccion(elegido.consulta);
      }
    },
    [pedirLeccion],
  );

  // ── Envío de la respuesta del alumno ───────────────────────────────────────
  const responder = useCallback(async () => {
    const respuesta = borrador.trim();
    if (!respuesta) return;

    const estado = conversacion.current;

    // La pista pertenece al intento que la provocó: se retira antes de mandar
    // el siguiente, para que no acompañe a una respuesta que aún no se ha
    // calificado.
    setVeredicto(null);

    // Evaluación inmediata contra la solución que RECALCULA el servidor. El
    // navegador no conoce la respuesta correcta.
    if (estado.ejercicio) {
      try {
        const r = await fetch("/api/practica/corregir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ejercicio: estado.ejercicio,
            respuesta,
            tema: estado.claveTema,
            sesionId: sesionId.current ?? undefined,
            intento,
            // Lo escrito en la pizarra durante la lección: el corrector lo usa
            // como contexto de lo que el alumno tenía delante.
            pizarra: escrito.current.join("\n").slice(0, 2000),
          }),
        });
        if (r.ok) setVeredicto(await r.json());
      } catch {
        // Un fallo de red al corregir no debe bloquear la lección: el motor
        // local sigue adelante con su propia ramificación pedagógica.
      }
    }

    setIntento((n) => n + 1);
    const resolver = resolverRespuesta.current;
    resolverRespuesta.current = null;
    setPregunta(null);
    setBorrador("");
    resolver?.(respuesta);
  }, [borrador, intento]);

  // ── Controles de reproducción ──────────────────────────────────────────────
  const alternarVoz = useCallback(() => {
    const tts = ttsRef.current;
    if (!tts) return;
    const activar = !vozActiva;
    setVozActiva(activar);
    tts.enabled = activar && Boolean(tts.voice);
    if (!activar) tts.cancel();
  }, [vozActiva]);

  // Porcentaje de la lección reproducida. Se llama así, y no "progreso", para
  // no confundirlo con el avance acumulado del alumno que llega por props.
  const porcentajeReproducido =
    controles.total > 0 ? (controles.index / controles.total) * 100 : 0;

  // Las reglas del tema en curso. El catálogo llega entero desde el servidor
  // porque son pocas decenas y así no hace falta un viaje por cada cambio.
  const reglasDelTema = useMemo(
    () => (tema ? reglas.filter((r) => r.tema === tema.tema) : []),
    [reglas, tema],
  );

  /**
   * Las líneas que se le pasan a la pizarra animada.
   *
   * El enunciado primero y luego los pasos del procedimiento, sin las
   * aclaraciones: una aclaración responde a una duda puntual y se sustituye por
   * la siguiente, así que animarla dejaría el repaso lleno de pasos que ya no
   * están. Las líneas van en la notación plana del motor; el guion se encarga
   * de decidir cuáles se dejan animar.
   */
  const lineasAnimadas = useMemo(() => {
    const textos: string[] = [];
    if (ejercicio?.texto) textos.push(ejercicio.texto);
    for (const linea of desarrollo) {
      if (!linea.aclaracion) textos.push(linea.texto);
    }
    return textos;
  }, [ejercicio, desarrollo]);

  /**
   * EL DESARROLLO NO PUEDE ADELANTAR EL RESULTADO.
   *
   * Lo señaló el cliente: arriba, en la pizarra de siempre, aparecía la suma
   * entera resuelta —412 con sus llevadas— mientras abajo la animación iba por
   * el primer paso. Con la solución a la vista, el paso a paso no explica nada.
   *
   * Así que mientras la animación no haya destapado todo, las líneas que ella
   * anima no se componen arriba. Las de prosa sí: esas no destripan nada. En
   * cuanto termina, el desarrollo completo vuelve, que es lo que el alumno
   * necesita para repasar.
   */
  const [animacionCompleta, setAnimacionCompleta] = useState(true);
  const alProgresarAnimacion = useCallback(
    ({ terminado }: { terminado: boolean }) => setAnimacionCompleta(terminado),
    [],
  );

  /**
   * Los mandos del tutor, para que la pizarra animada pueda usarlos.
   *
   * El sintetizador es uno solo, y el índice de paso también tiene que serlo:
   * pausar desde la pizarra pausa la locución del tutor —y la pizarra se para
   * con él, porque lo va siguiendo—, en lugar de abrir una segunda
   * reproducción que cuente algo distinto.
   */
  const mandosLeccion = useMemo(
    () => ({
      pausar: () => pseRef.current?.pause(),
      reanudar: () => void pseRef.current?.play(),
    }),
    [],
  );

  const desarrolloVisible = useMemo(() => {
    // Sólo se retiene mientras el tutor está explicando. Si la lección ya ha
    // terminado, el desarrollo se compone entero pase lo que pase con la
    // animación: preferible un resultado repetido a un alumno esperando algo
    // que no va a llegar.
    if (animacionCompleta || !controles.playing) return desarrollo;
    return desarrollo.filter((linea) => linea.aclaracion || !esAnimable(linea.texto));
  }, [desarrollo, animacionCompleta, controles.playing]);

  // Se mantiene al día la última regla nombrada, para poder inyectarla en la
  // petición de aclaración sin que `pedirLeccion` dependa de este estado.
  const [reglaDetectada, setReglaDetectada] = useState<ReglaVista | null>(null);

  useEffect(() => {
    // Se mira lo narrado Y lo escrito: el nombre de la regla puede aparecer en
    // cualquiera de los dos ("Regla de la potencia: la derivada de xⁿ…").
    const fuentes = [...narrado.current, ...escrito.current];
    const encontrada = reglaActiva(fuentes, reglasDelTema);
    reglaEnCursoRef.current = encontrada;
    setReglaDetectada(encontrada);
  }, [ejercicio, desarrollo, reglasDelTema, subtitulo]);

  // ── Elección de tema ───────────────────────────────────────────────────────
  if (!tema) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Lección interactiva</h1>
          <p className="text-muted-foreground">
            Elige un tema. El tutor te lo explicará paso a paso en la pizarra y
            después practicarás.
          </p>
          {curso && (
            // Se dice de dónde sale la lista: son los temas de su curso, no
            // "los temas que hay". Un alumno que no ve derivadas tiene derecho
            // a saber por qué.
            <p className="text-sm text-muted-foreground">
              Temas publicados para tu curso: <strong>{curso}</strong>.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {temas.map((t) => {
            const avance = progreso.find((p) => p.tema === t.tema);
            const visitado = Boolean(avance && (avance.sesiones > 0 || avance.intentos > 0));
            return (
              <Card key={t.clave} className="flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{t.titulo}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <p className="text-sm text-muted-foreground">{t.descripcion}</p>

                  {avance && (
                    <p className="text-xs text-muted-foreground">
                      {avance.sesiones > 0 && (
                        <>
                          {avance.sesiones} {avance.sesiones === 1 ? "lección" : "lecciones"}
                          {avance.ultima && (
                            <> · última el {new Date(avance.ultima).toLocaleDateString("es")}</>
                          )}
                        </>
                      )}
                      {avance.intentos > 0 && (
                        <>
                          {avance.sesiones > 0 && <br />}
                          {avance.aciertos} de {avance.intentos} ejercicios acertados
                        </>
                      )}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {visitado ? (
                      <>
                        <Button size="sm" onClick={() => empezarTema(t, true)}>
                          Continuar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => empezarTema(t)}>
                          Desde el principio
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => empezarTema(t)}>
                        Empezar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Aula ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tema.titulo}</h1>
          {/* La fase en curso ya la indica el paso a paso sobre la pizarra: no
              hace falta repetirla aquí. */}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            pseRef.current?.stop();
            setTema(null);
            limpiarPizarra();
            setSubtitulo("");
            setFeedback(null);
            setVeredicto(null);
          }}
        >
          Cambiar de tema
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Avatar y controles */}
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6">
              <Avatar2D estado={avatarPizarra ?? estadoAvatar} hablando={hablando} />
              <div className="flex gap-2">
                {controles.playing && !controles.paused ? (
                  <Button size="sm" variant="outline" onClick={() => pseRef.current?.pause()}>
                    <Pause className="h-4 w-4" />
                    Pausa
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!controles.hasLesson || cargando}
                    onClick={() => void pseRef.current?.play()}
                  >
                    <Play className="h-4 w-4" />
                    {controles.paused ? "Reanudar" : "Reproducir"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={vozActiva ? "Silenciar la voz" : "Activar la voz"}
                  onClick={alternarVoz}
                >
                  {vozActiva ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                disabled={cargando}
                onClick={() => empezarTema(tema)}
              >
                <RotateCcw className="h-4 w-4" />
                Reiniciar lección
              </Button>
              <p className="text-center text-[11px] leading-tight text-muted-foreground">
                {estadoVoz}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pizarra y práctica */}
        <div className="space-y-4">
          <Progress value={porcentajeReproducido} />

          <Pizarra
            fases={fases}
            ejercicio={ejercicio}
            desarrollo={desarrolloVisible}
            faseDelContenido={faseDelContenido}
            resaltado={resaltado}
            reglas={reglasDelTema}
            reglaDetectada={reglaDetectada}
            tema={tema.tema}
          />

          {/* Repaso animado de lo que hay en la pizarra: la misma lección, paso
              a paso, con los resaltados sincronizados con la voz. Se monta sólo
              cuando hay algo que animar. */}
          <PanelAnimado
            lineas={lineasAnimadas}
            tts={tts}
            vozActiva={vozActiva}
            // Lo que el tutor está diciendo: con esto la pizarra se coloca
            // sola donde va la voz, sin esperar a que nadie pulse Reproducir.
            narracion={subtitulo}
            alCambiarAvatar={alCambiarAvatar}
            alProgresar={alProgresarAnimacion}
            // Un solo mando de reproducción: mientras el tutor explica, los
            // botones de la pizarra actúan sobre ÉL, no sobre una segunda
            // reproducción en paralelo.
            leccionEnMarcha={controles.playing}
            leccionPausada={controles.paused}
            mandosLeccion={mandosLeccion}
            // El sintetizador es uno solo: cuando el repaso animado se pone a
            // hablar, el tutor de la lección calla. Sin esto se solapan las dos
            // voces y no se entiende ninguna de las dos.
            alTomarLaVoz={() => pseRef.current?.pause()}
          />

          {/* Subtítulo: lo que el tutor está diciendo en este momento. Sus
              fórmulas se componen igual que las de la pizarra. */}
          {subtitulo && (
            <p className="rounded-md bg-muted/60 px-4 py-3 text-sm leading-relaxed">
              <TextoMatematico texto={subtitulo} />
            </p>
          )}

          {cargando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando la lección…
            </p>
          )}

          {/* Entorno de resolución interactiva */}
          {pregunta && (
            <Card className="border-primary/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">
                  <TextoMatematico texto={pregunta} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void responder();
                  }}
                >
                  <Input
                    autoFocus
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    placeholder="Tu respuesta"
                    aria-label="Tu respuesta"
                  />
                  <Button type="submit" disabled={!borrador.trim()}>
                    Responder
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Veredicto del servidor. La caja de ayuda no se compone sobre un
              acierto: sin esta condición, la pista del intento fallado quedaba
              encima del mensaje verde. */}
          {veredicto && (veredicto.correcto === true || hayQueMostrarAyuda(veredicto)) && (
            <Alert
              variant={
                veredicto.correcto === true
                  ? "success"
                  : veredicto.correcto === false
                    ? "destructive"
                    : "default"
              }
            >
              {veredicto.correcto === true ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Lightbulb className="h-4 w-4" />
              )}
              <AlertDescription>
                {veredicto.correcto === true
                  ? "Correcto. Lo has resuelto bien."
                  : (veredicto.pista ?? veredicto.mensaje)}
              </AlertDescription>
            </Alert>
          )}

          {/* Mensaje pedagógico del tutor */}
          {feedback && (
            <p
              className={cn(
                "text-sm font-medium",
                feedback.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600",
              )}
            >
              {feedback.msg}
            </p>
          )}

          {/* Botones contextuales de apoyo */}
          <div className="flex flex-wrap gap-2">
            {BOTONES_APOYO.map((b) => (
              <Button
                key={b.etiqueta}
                variant="secondary"
                size="sm"
                disabled={cargando || !listo}
                onClick={() =>
                  void pedirLeccion(b.consulta, {
                    seguimiento: b.seguimiento,
                    parte: b.parte,
                    soloExplicacion: b.soloExplicacion,
                  })
                }
              >
                {b.etiqueta}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              disabled={cargando || !listo}
              onClick={() =>
                void pedirLeccion("Proponme un problema más difícil", {
                  seguimiento: "mas_dificil",
                })
              }
            >
              Más difícil
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={cargando || !listo}
              onClick={() =>
                void pedirLeccion("Ahora uno más fácil", { seguimiento: "mas_facil" })
              }
            >
              Más fácil
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

