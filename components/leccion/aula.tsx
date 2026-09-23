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

import { INVITACION_A_RESPONDER, PSELight } from "@/public/pseLight.js";
import { TTS } from "@/public/tts.js";
import type { EstadoAvatar, EstadoControles, LSG, UIPSELight } from "@/public/pseLight";

import { Avatar2D } from "@/components/leccion/avatar-2d";
import { PanelAnimado } from "@/components/leccion/pizarra-animada";
import type { EstadoPedagogico } from "@/lib/leccion/sincronizacion";
import type { OperacionPaso, PasoSemantico } from "@/lib/leccion/marcado";
import {
  crearVozCompartida,
  type VozCompartida,
  type VozUtilizable,
} from "@/lib/leccion/voz";
import {
  Pizarra,
  pasoDeLinea,
  tituloDeFase,
  type FaseAbierta,
  type LineaPizarra,
  type ReglaPizarra,
} from "@/components/leccion/pizarra";
import { TextoTutor } from "@/components/leccion/texto-tutor";
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
import { esFaseDeEjemplo, esFaseDePractica, esFaseDeReglas } from "@/lib/leccion/fases";
import { reglaActiva } from "@/lib/leccion/reglas";
import {
  enunciadosDeLeccion,
  enunciadosParaResolver,
  enunciadoTrasPeticion,
  conPreguntaPendiente,
  esEnunciadoParaResolver,
  preguntaFinal,
  presentacionDe,
  reanudarTrasAclaracion,
  recortarParaSeguimiento,
  restoDeLeccion,
  sinPreguntas,
  trasLaPrimeraPregunta,
} from "@/lib/leccion/seguimiento-lsg";
import { esIdeaFuerza, expresionPrincipal } from "@/lib/matematicas";
import {
  esLaMismaCuenta,
  leerOperacionDibujada,
  leerSumaOResta,
} from "@/lib/leccion/columna";
import { cierreDelDesarrollo } from "@/lib/leccion/cierre";
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

/**
 * Qué versión del código está viendo quien mira la pantalla.
 *
 * Vercel expone el commit desplegado, y Next lo incrusta en el paquete. Sirve
 * para resolver en un vistazo la duda más cara de esta entrega: si lo que se
 * está probando es la corrección recién subida o el despliegue anterior.
 */
const VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);

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
  /** La tarjeta de respuesta, para llevar la vista hasta ella cuando aparece. */
  const cajaRespuesta = useRef<HTMLDivElement | null>(null);
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
  const reglaEnCursoRef = useRef<{ nombre: string; enunciado: string; descripcion?: string } | null>(null);

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

  /**
   * «NO ENTENDÍ ESTE PASO» Y DE VUELTA A LA CLASE.
   *
   * Tras el desglose, la lección se reanuda por donde iba (ver
   * `reanudarTrasAclaracion`). Una ayuda no abre fases —es lo que evita que la
   * pizarra vuelva a Concepto—, pero las fases que se reanudan SÍ tienen que
   * abrirse: son la continuación de la clase, y al llegar la primera la ayuda
   * se da por terminada.
   */
  const fasesAReanudar = useRef<Set<string>>(new Set());
  /** El paso que la pizarra animada tiene delante ahora mismo: "el paso" del botón. */
  const pasoEnPantalla = useRef<string | null>(null);
  /** La práctica ya se contestó bien: a partir de ahí, desglosarla no le resuelve nada. */
  const practicaResuelta = useRef(false);
  /** La última pregunta planteada: dice QUÉ se pedía —derivar, factorizar— para poder cerrarla. */
  const ultimaPregunta = useRef<string | null>(null);
  /** Cuántos «no entendí» seguidos: la escalera de simplificación del concepto. */
  const insistencia = useRef(0);
  /**
   * Los enunciados que se le PIDEN al alumno en la lección en curso.
   *
   * No se animan: animarlos era hacerle a la pizarra el ejercicio que tiene que
   * resolver él (ver `enunciadosParaResolver`).
   */
  const [paraResolver, setParaResolver] = useState<Set<string>>(() => new Set());
  /** Su espejo, para leerlo desde los callbacks sin esperar al render. */
  const paraResolverRef = useRef<Set<string>>(new Set());
  /**
   * EL ENUNCIADO DE LA PRÁCTICA QUE EL TUTOR ESTÁ RESOLVIENDO EN VOZ ALTA.
   *
   * Tras «Explicar regla» o «No entendí este paso» en la práctica, el tutor
   * resuelve ESE ejercicio paso a paso, y su planteamiento se anima como el de
   * un ejemplo: la columna que se nombra se enciende y las cifras del resultado
   * se escriben mientras se dicen. El cliente lo vio en 678 + 145: la voz
   * contaba "7 + 4, más el 1 que nos llevamos" y la pizarra seguía quieta en el
   * «?». Va atado al TEXTO: en cuanto el ejercicio nuevo se lleva la tarjeta,
   * el suyo vuelve a estar quieto, que es el que tiene que resolver el alumno.
   */
  const [enunciadoExplicado, setEnunciadoExplicado] = useState<string | null>(null);

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
  /**
   * La lección llegó a su final —no sólo se paró—. Con ella terminada, la
   * pizarra animada se queda en su último paso, con todo destapado: el
   * cliente vio el panel volver a "Paso 1 de 4" con el resultado escondido
   * justo cuando la lección decía "¡Lección completada!".
   */
  const [terminoLaLeccion, setTerminoLaLeccion] = useState(false);
  const alCambiarAvatar = useCallback((estado: EstadoPedagogico) => {
    setAvatarPizarra(estado === "IDLE" ? null : estado);
  }, []);
  /**
   * El sintetizador, también en estado y no sólo en la referencia: la pizarra
   * animada lo recibe como prop, y una referencia rellenada en un efecto no
   * provoca el repintado que se lo entregaría.
   */
  /**
   * La vista del sintetizador que usa la pizarra animada.
   *
   * En estado, y no sólo en una referencia, porque la pizarra la recibe como
   * prop y una referencia rellenada en un efecto no provoca el repintado que se
   * la entregaría.
   */
  const [vozPizarra, setVozPizarra] = useState<VozUtilizable | null>(null);
  /** El reparto de turnos, para poder callar a todos al cambiar de tema. */
  const vozRef = useRef<VozCompartida | null>(null);
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
  // Espejo del desarrollo para leerlo desde los callbacks del reproductor.
  const desarrolloRef = useRef<LineaPizarra[]>([]);
  useEffect(() => {
    desarrolloRef.current = desarrollo;
  }, [desarrollo]);
  /**
   * LA PIZARRA TAL COMO ESTABA AL EMPEZAR UNA AYUDA ("Más difícil", "Dame otro
   * ejemplo", "No entendí este paso"…).
   *
   * Al reanudar tras una pausa —o al retroceder— el reproductor rehace la
   * pizarra: la borra y reescribe lo que su lección ya había escrito. Durante
   * una ayuda "borrar" no podía vaciarla —se habría llevado las fases y el
   * ejercicio de antes—, así que no hacía nada, y la reescritura DUPLICABA todo
   * el desarrollo: tras pausar en "3/6 + 2/6", el Ambiente 2 salía con las
   * conversiones repetidas debajo de la suma. Ahora "borrar" vuelve a esta
   * foto, y el reproductor reescribe encima justo lo suyo.
   */
  const baseDeAyuda = useRef<{
    fases: FaseAbierta[];
    ejercicio: LineaPizarra | null;
    desarrollo: LineaPizarra[];
    escrito: string[];
  } | null>(null);
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
  /**
   * DE QUÉ FASE ES EL SUBTÍTULO.
   *
   * Lo mismo que ya se hacía con el contenido de la pizarra, y por el mismo
   * motivo: el cliente vio la fase de "Reglas y propiedades" con el ejemplo de
   * la pizza —de "Concepto"— debajo. Limpiar al abrir la fase no basta, porque
   * el orden de las directivas lo decide el generador de la lección y una frase
   * de la fase anterior puede llegar después del cambio.
   *
   * Etiquetado, no hay orden que valga: una frase de Concepto no se pinta
   * mientras esté abierta Reglas, llegue cuando llegue.
   */
  const [faseDelSubtitulo, setFaseDelSubtitulo] = useState("");

  /** Guarda lo que se está diciendo junto con la fase a la que pertenece. */
  const fijarSubtitulo = useCallback((texto: string) => {
    setSubtitulo(texto);
    setFaseDelSubtitulo(fasesRef.current[fasesRef.current.length - 1]?.id ?? "");
  }, []);
  const [controles, setControles] = useState<EstadoControles>({
    playing: false,
    paused: false,
    hasLesson: false,
    index: 0,
    total: 0,
  });
  const [pregunta, setPregunta] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  // Cuando le toca al alumno, la vista va a donde hay que escribir. En una
  // pantalla de portátil la caja de respuesta cae por debajo del pliegue y el
  // cliente vio a un estudiante esperando a que la lección siguiera sola.
  useEffect(() => {
    if (!pregunta) return;
    const t = setTimeout(() => {
      cajaRespuesta.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, [pregunta]);
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
    (
      texto: string,
      clase: "formula" | "explicacion",
      operacion?: OperacionPaso | null,
      narracion?: string | null,
      sitio?: { ambiente?: 1 | 2; papel?: "explicacion" } | null,
    ) => {
      const limpio = String(texto ?? "").trim();
      if (!limpio) return;
      const linea: LineaPizarra = {
        id: idLinea.current++,
        texto: limpio,
        clase,
        aclaracion: esAclaracion.current,
        ...(operacion ? { operacion } : {}),
        ...(narracion ? { narracion } : {}),
        ...(sitio?.ambiente === 2 ? { ambiente: 2 as const } : {}),
        ...(sitio?.papel === "explicacion" ? { papelDelPaso: "explicacion" as const } : {}),
      };
      asegurarFase();

      if (faseConEjercicio() && ejercicioRef.current === null && !esAclaracion.current) {
        fijarLineaEjercicio(linea);
        return;
      }

      // UN ENUNCIADO NUEVO SE LLEVA LA TARJETA.
      //
      // "2411 + 2457 = ?" es un ejercicio que se le PIDE al alumno. Si la
      // tarjeta tiene otro —el ejemplo resuelto justo antes, en un "más
      // difícil" que no cambia de fase—, el enunciado nuevo iba a parar al
      // desarrollo y la tarjeta seguía mostrando el ejemplo mientras la caja
      // de respuesta preguntaba por otra cuenta. El cliente lo fotografió así:
      // 2000 + 1800 arriba y "¿Cuánto es 2411 + 2457?" abajo. Ahora el
      // ejercicio que se pregunta es el que se ve, y el desarrollo del ejemplo,
      // que era de otra cuenta, se retira con él.
      // No sólo "… = ?": el de ecuaciones se escribe sin interrogación
      // ("2(x + 4) = 3x − 1"), y la lección ya dice cuáles se le PIDEN al
      // alumno —la línea que precede a cada pregunta—. Sin esto, tras "Más
      // difícil" el enunciado de la práctica caía en el desarrollo, bajo la
      // tarjeta del ejemplo, y la pizarra animada se ponía a resolverlo.
      if (
        !esAclaracion.current &&
        faseConEjercicio() &&
        (esEnunciadoParaResolver(limpio) || paraResolverRef.current.has(limpio)) &&
        ejercicioRef.current != null &&
        ejercicioRef.current.texto !== limpio
      ) {
        fijarLineaEjercicio(linea);
        setDesarrollo([]);
        return;
      }

      // El enunciado NO se repite en el desarrollo. El motor lo escribe con una
      // directiva propia, y si ya se adelantó al abrir la fase, esa directiva
      // llegaría aquí y lo pintaría por segunda vez.
      if (ejercicioRef.current?.texto === limpio) return;

      // EL CIERRE DEL EJERCICIO ENTRA SIEMPRE: es la respuesta final enmarcada,
      // no un replanteo del enunciado aunque empiece por la misma cuenta
      // ("24 + 17 = 41" bajo la tarjeta "24 + 17").
      const esCierre = operacion?.tipo === "resultado";

      // Y tampoco lo replantea con otras palabras: la tarjeta muestra
      // "19 + 45 = ?" y el motor abre el desarrollo escribiendo "19 + 45", que
      // es la misma cuenta sin resolver. Un dibujo con su desarrollo sí entra:
      // eso ya no es el enunciado, es el procedimiento.
      const replanteaElEnunciado =
        !esCierre &&
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
        // motor llega a ella. Salvo que llegue ahora como CIERRE: entonces la
        // sustituye, porque es esa etiqueta la que la enmarca.
        if (ultima && ultima.texto === limpio) {
          return esCierre ? [...prev.slice(0, -1), linea] : prev;
        }
        if (!esCierre && ultima && esLaMismaCuenta(ultima.texto, limpio)) {
          return [...prev.slice(0, -1), linea];
        }
        return [...prev, linea];
      });
    },
    [asegurarFase, faseConEjercicio, fijarLineaEjercicio],
  );

  /**
   * CIERRA EL EJERCICIO EN LA PIZARRA: la respuesta final, enmarcada.
   *
   * El cliente, sin matices: "ningún ejercicio puede quedar inconcluso; el
   * último paso debe mostrar siempre el resultado final enmarcado con su
   * feedback de conclusión". Se llama en cuanto el ejercicio queda resuelto
   * —acertado o con los intentos agotados— y otra vez al terminar la lección,
   * por si acaso; la segunda no hace nada si la primera ya lo cerró.
   *
   * Qué línea se escribe lo decide `cierreDelDesarrollo`, que sólo firma
   * cuentas comprobadas: completa la última si vale la respuesta, o añade el
   * enunciado resuelto. Va etiquetada como `resultado`, y por eso la pizarra la
   * enmarca y la animada la dibuja cuando el tutor dice "resultado final".
   */
  const cerrarEjercicio = useCallback((respuesta: string, pregunta?: string | null) => {
    const enunciado = ejercicioRef.current?.texto ?? null;
    setDesarrollo((prev) => {
      const cierre = cierreDelDesarrollo({
        enunciado,
        lineas: prev.map((l) => ({ texto: l.texto, operacion: l.operacion ?? null })),
        respuesta,
        pregunta,
      });
      if (!cierre) return prev;
      const linea: LineaPizarra = {
        id: idLinea.current++,
        texto: cierre.texto,
        clase: "formula",
        // Aunque la lección siga en una aclaración, el cierre es del ejercicio
        // y se anima como tal.
        aclaracion: false,
        operacion: cierre.operacion,
        narracion: cierre.narracion,
      };
      if (cierre.accion === "completar") {
        return prev.map((l, i) => (i === cierre.indice ? { ...l, ...linea } : l));
      }
      return [...prev, linea];
    });
  }, []);

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
      // Y el subtítulo también es de la fase que se cierra. Al pasar de
      // "Concepto" a "Reglas", el ejemplo de la pizza seguía debajo mientras el
      // tutor ya explicaba otra cosa: lo que se lee y lo que se oye contaban
      // cosas distintas. Se limpia y lo repone la primera frase de la fase nueva.
      //
      // Y se limpia también SU ETIQUETA. Sin eso quedaba un subtítulo vacío
      // marcado con la fase anterior: inofensivo hoy, pero es media limpieza, y
      // media limpieza de estado es justo lo que hay que dejar de hacer.
      setSubtitulo("");
      setFaseDelSubtitulo("");

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
    setEstadoVoz(tts.describe());
    // Y cuando el servidor conteste si hay voz neuronal, se dice cuál suena.
    tts.listaLaVoz().then(() => setEstadoVoz(tts.describe())).catch(() => {});

    // EL SINTETIZADOR ES UNO Y SE REPARTE POR TURNOS.
    //
    // Ni el motor de la lección ni la pizarra animada hablan con él
    // directamente: cada uno recibe su vista, y el turno lo lleva
    // `lib/leccion/voz.ts`. Así la regla —hablar te da el turno, callar sólo te
    // calla a ti— vive en UN sitio, en vez de repartida por los tres ficheros
    // que la tenían que respetar.
    const voz = crearVozCompartida(tts);
    vozRef.current = voz;
    const vozTutor = voz.para("tutor");
    setVozPizarra(voz.para("pizarra"));

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
        const id = String(etiqueta ?? "");
        if (esAyuda.current) {
          // La ayuda ha terminado y la clase sigue: la primera fase que se
          // reanuda se abre como cualquier otra y, desde ahí, ya no es ayuda.
          if (!fasesAReanudar.current.has(id)) return;
          esAyuda.current = false;
          esAclaracion.current = false;
          fasesAReanudar.current = new Set();
        }
        abrirEscena(id);
      },
      // A la pizarra sólo suben IDEAS FUERZA: el título de la regla, las
      // fórmulas y el ejercicio. Un párrafo explicativo va al subtítulo, aunque
      // llegue por una directiva de pizarra: desde que las aclaraciones las
      // redacta el modelo en vivo, eso puede pasar.
      writeBoard: (texto, operacion, narracion, sitio) => {
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

        // La etiqueta y la locución son del PASO; si la directiva trae varias
        // líneas, cada una la usa sólo si sus términos están en ella —la
        // subrutina lo comprueba—, así que no se cuela en la línea de al lado.
        for (const linea of lineas) {
          // EL TEXTO EXPLICATIVO DEL PASO SÍ SUBE A LA PIZARRA.
          //
          // La regla de que a la pizarra sólo suben ideas fuerza sigue en pie
          // para la prosa suelta; pero el cliente pidió que el objetivo del paso
          // se ESCRIBA en el Ambiente 1, encima de su ecuación, y eso lo marca
          // el motor con `papel: "explicacion"`.
          if (sitio?.papel === "explicacion" || esIdeaFuerza(linea)) {
            anadirLinea(linea, "formula", operacion, narracion, sitio);
          } else fijarSubtitulo(linea);
        }
      },
      // La explicación hablada NO va a la pizarra. El motor la escribía además
      // de narrarla, así que el mismo párrafo aparecía dos veces: en el lienzo
      // y en el subtítulo. La pizarra queda para el título de la regla, las
      // expresiones y el ejercicio; la prosa, sólo en el subtítulo.
      writeBoardExplain: () => {},
      highlightBoard: (objetivo) => setResaltado(objetivo ?? null),
      clearBoard: () => {
        if (esAyuda.current) {
          // Durante una ayuda, "borrar" es volver a la pizarra que había al
          // empezarla (ver `baseDeAyuda`): el reproductor reescribe encima lo
          // suyo sin duplicar nada.
          const base = baseDeAyuda.current;
          if (base) {
            fasesRef.current = base.fases;
            setFases(base.fases);
            ejercicioRef.current = base.ejercicio;
            setEjercicio(base.ejercicio);
            escrito.current = [...base.escrito];
            desarrolloRef.current = base.desarrollo;
            setDesarrollo(base.desarrollo);
            setResaltado(null);
          }
          return;
        }
        limpiarPizarra();
        setResaltado(null);
      },
      setCaption: (texto) => {
        const t = String(texto ?? "");
        fijarSubtitulo(t);
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
      // UN EJERCICIO RESUELTO SE CIERRA EN LA PIZARRA, en el momento en que queda
      // resuelto: acertado o con los intentos agotados. Llega justo antes del
      // feedback del tutor, que ya nombra el resultado final.
      onExerciseResolved: ({ respuesta, pregunta: textoPregunta }) =>
        cerrarEjercicio(respuesta, textoPregunta ?? ultimaPregunta.current),
      onLessonEnd: ({ acerto, respuesta } = { respondio: false, acerto: false }) => {
        setPregunta(null);
        setEstadoAvatar("sonriendo");
        setTerminoLaLeccion(true);
        // Una ayuda que llega hasta el final de la lección también se da por
        // terminada: la siguiente petición empieza limpia.
        esAyuda.current = false;
        fasesAReanudar.current = new Set();
        if (acerto) practicaResuelta.current = true;

        // Y POR SI ACASO, AL TERMINAR. El cierre ya se escribió al resolver el
        // ejercicio; si por lo que sea no llegó —una lección de otra versión
        // del reproductor—, se escribe aquí. Si ya está, no hace nada.
        if (respuesta) cerrarEjercicio(respuesta, ultimaPregunta.current);
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
          ultimaPregunta.current = String(textoPregunta ?? "") || null;
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

    pseRef.current = new PSELight({ avatar, tts: vozTutor, ui });
    setListo(true);

    return () => {
      pseRef.current?.stop();
      tts.cancel();
    };
  }, [anadirLinea, abrirEscena, cerrarEjercicio]);

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
      // La pregunta que el alumno tenía delante, si pide una explicación en
      // mitad de ella: se lee ahora, antes de que la lección nueva la retire,
      // para devolvérsela al terminar de explicar.
      const preguntaPendiente = opciones.soloExplicacion
        ? (pseRef.current?.preguntaPendiente?.() ?? null)
        : null;

      // LO QUE QUEDABA DE LA LECCIÓN, leído antes de que la ayuda la sustituya:
      // al terminar de explicar, la clase se reanuda desde ahí.
      const reproductor = pseRef.current;
      const faseAlPedir = fasesRef.current[fasesRef.current.length - 1]?.id ?? "";
      const resto =
        opciones.soloExplicacion && reproductor
          ? restoDeLeccion(
              reproductor.timeline as unknown as Parameters<typeof restoDeLeccion>[0],
              reproductor.index,
            )
          : null;

      // ¿El ejercicio de la tarjeta lo está resolviendo el TUTOR (un ejemplo) o
      // se le pide al ALUMNO? Decide si el desglose llega al resultado y si sus
      // pasos se animan como los del ejemplo.
      const enTarjeta = ejercicioRef.current?.texto ?? null;
      const tarjetaParaResolver =
        enTarjeta != null && (paraResolverRef.current.has(enTarjeta) || esEnunciadoParaResolver(enTarjeta));
      // «NO ENTENDÍ ESTE PASO» Y «EXPLICAR REGLA», con un ejercicio en la
      // tarjeta, lo desglosan los dos: la regla se explica SOBRE ese ejercicio,
      // y cada paso se escribe y se anima a la vez que se dice. «Explicar regla»
      // llegaba como prosa suelta del modelo, sin pasos que animar, y la pizarra
      // se quedaba quieta en el enunciado mientras la voz resolvía la cuenta.
      const desgloseDeLaTarjeta =
        Boolean(opciones.soloExplicacion) && enTarjeta != null && faseConEjercicio();
      const desgloseDelEjemplo = desgloseDeLaTarjeta && !tarjetaParaResolver;

      setCargando(true);
      setError(null);
      setFeedback(null);
      setVeredicto(null);
      setPregunta(null);
      setTerminoLaLeccion(false);

      // El desglose vuelve a resolver el mismo ejercicio de la tarjeta, hasta su
      // resultado final enmarcado —también en la práctica: "ningún ejercicio
      // puede quedar inconcluso"—, así que sus pasos son el desarrollo de la
      // tarjeta y se animan como tales, en el ejemplo y en la práctica. Como
      // aclaración aparte sólo queda la que no desglosa el ejercicio.
      const desgloseDeLaPractica = desgloseDeLaTarjeta && tarjetaParaResolver;
      esAclaracion.current =
        Boolean(opciones.soloExplicacion) && !desgloseDelEjemplo && !desgloseDeLaPractica;

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
            regla: activa
              ? { nombre: activa.nombre, formula: activa.enunciado, descripcion: activa.descripcion }
              : null,
            // EL EJERCICIO DE LA TARJETA, no el "activo" de la conversación. El
            // activo es la última línea escrita de la lección —el enunciado de
            // la práctica—, así que en el ejemplo se desglosaba un ejercicio que
            // el alumno todavía no había visto. Sin tarjeta (Concepto, Reglas)
            // no hay ejercicio: se explica la idea con otras palabras.
            ejercicio: faseConEjercicio() ? (enTarjeta ?? conversacion.current.ejercicio) : "",
            tema: conversacion.current.temaActivo || conversacion.current.claveTema,
            // El paso EXACTO que tenía delante: el que enseña la pizarra animada
            // o, si no anima nada, la última línea escrita.
            paso: pasoEnPantalla.current ?? escrito.current[escrito.current.length - 1] ?? "",
            // Con la pregunta de la práctica sin contestar, sin resultado.
            conResultado: !tarjetaParaResolver || practicaResuelta.current,
            insistencia: insistencia.current,
          };
        }
        // Cada «no entendí» seguido baja un escalón; cualquier otra petición
        // devuelve la escalera al principio.
        insistencia.current =
          opciones.soloExplicacion && opciones.parte === "resolucion"
            ? Math.min(2, insistencia.current + 1)
            : 0;
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

        // En la práctica, sólo el desglose determinista —el que llega siempre a
        // su resultado final enmarcado— se anima como desarrollo de la tarjeta.
        // Si la aclaración la redactó el modelo, sigue siendo una aclaración
        // aparte: de ella no se sabe dónde termina.
        // Lo mismo con «Explicar regla» en el ejemplo: sin desglose, es prosa.
        const llegoElDesglose = datos?.lsg?.escena === "desglose_ejercicio";
        if (
          !llegoElDesglose &&
          (desgloseDeLaPractica || (desgloseDelEjemplo && opciones.parte === "concepto"))
        ) {
          esAclaracion.current = true;
        }
        setEnunciadoExplicado(desgloseDeLaPractica && llegoElDesglose ? enTarjeta : null);

        // TRAS RESOLVERLE LA PRÁCTICA, OTRA NUEVA. El desglose de la práctica
        // llega hasta su resultado enmarcado; devolverle después la MISMA
        // pregunta era pedirle que copiara lo que tiene escrito en la pizarra
        // —el cliente lo vio en 3/5 + 1/2, con el 11/10 a la vista—. El servidor
        // cierra el desglose con un ejercicio parecido, que se lleva la tarjeta
        // y deja la pizarra limpia, y su pregunta sustituye a la pendiente.
        const preguntaNueva = datos?.nuevaPractica ? preguntaFinal(datos.lsg) : null;
        const preguntaDeVuelta = preguntaNueva ?? preguntaPendiente;
        // El desglose ya le pasa la palabra ("Ahora te toca a ti con uno nuevo").
        const transicion = preguntaNueva ? null : undefined;

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

        // "MÁS DIFÍCIL" PULSADO EN CONCEPTO O EN REGLAS. Lo que llega es un
        // ejercicio —su ejemplo y su práctica—, y en una fase sin ejercicio la
        // pizarra lo pintaba como notas sueltas: sin «Ejercicio:», sin sus dos
        // ambientes y sin animar nada, con la pregunta de la práctica debajo.
        // Se abre antes la fase del ejemplo, y el ejercicio nuevo entra en ella.
        if (presentacion === "sustituir" && esAyuda.current && !faseConEjercicio()) {
          abrirEscena("ejemplo_guiado");
        }

        if (presentacion === "sustituir") {
          // Llega OTRO ejercicio, no otro paso del mismo: la tarjeta de arriba
          // toma el nuevo. Se conserva la fase, de modo que el alumno no
          // retroceda a Concepto.
          //
          // Y lo toma YA, no cuando el motor llegue a escribirlo. Antes se
          // vaciaba y se esperaba a la directiva de pizarra, que llega detrás
          // de dos locuciones: "Vamos con otro: 2000 + 1800" y "Vamos a sumar
          // 2000 + 1800 paso a paso". Todo ese rato el tutor hablaba de una
          // cuenta y la tarjeta decía "Preparando el ejercicio…" —la captura
          // del cliente—. El ejercicio viene en la respuesta desde el primer
          // momento: se pinta con ella.
          const primera = (Array.isArray(datos.pasos) ? datos.pasos : []).find(
            (p: { tipo?: string; contenido?: string }) =>
              p?.tipo === "pizarra" && String(p.contenido ?? "").trim(),
          ) as { contenido: string; operacion?: OperacionPaso; narracion?: string } | undefined;
          fijarLineaEjercicio(
            primera && faseConEjercicio()
              ? {
                  id: idLinea.current++,
                  texto: String(primera.contenido).trim(),
                  clase: "formula",
                  ...(primera.operacion ? { operacion: primera.operacion } : {}),
                  ...(primera.narracion ? { narracion: primera.narracion } : {}),
                }
              : null,
          );
          setDesarrollo([]);
        }

        // La foto de la pizarra con la que empieza esta ayuda: a ella se vuelve
        // cada vez que el reproductor la rehace (reanudar, retroceder).
        baseDeAyuda.current = esAyuda.current
          ? {
              fases: [...fasesRef.current],
              ejercicio: ejercicioRef.current,
              desarrollo: presentacion === "sustituir" ? [] : [...desarrolloRef.current],
              escrito: [...escrito.current],
            }
          : null;

        // Una lección de seguimiento repite concepto y reglas tal cual: se
        // recorta para entrar directamente por el ejemplo.
        const recortada =
          presentacion === "reiniciar" && opciones.seguimiento
            ? recortarParaSeguimiento(datos.lsg)
            : datos.lsg;
        // Una aclaración explica; no pregunta. Su pregunta ocupaba la caja de
        // respuesta —"¿Entendiste la explicación?"— y le quitaba al alumno de
        // delante el ejercicio que estaba resolviendo.
        // Y después de explicar, se le devuelve el ejercicio que estaba
        // resolviendo: sin esto la explicación terminaba en "¡Lección
        // completada!" con la pregunta sin contestar.
        //
        // Y ADEMÁS, LA CLASE SIGUE. Tras la explicación vuelve lo que quedaba de
        // la lección —la pregunta pendiente y las fases que aún no se habían
        // abierto—: el cliente vio que tras «No entendí este paso» la lección se
        // daba por completada sin llegar a la práctica.
        const lsg = (
          opciones.soloExplicacion
            ? resto && faseAlPedir
              ? reanudarTrasAclaracion(recortada, {
                  faseActual: faseAlPedir,
                  pregunta: preguntaDeVuelta,
                  // Lo que venía tras la pregunta. Si el alumno aún no la tenía
                  // delante, lo que viene empieza por ella: con un ejercicio
                  // nuevo, esa pregunta vieja se salta.
                  mismaFase: preguntaPendiente
                    ? resto.mismaFase
                    : preguntaNueva
                      ? trasLaPrimeraPregunta(resto.mismaFase)
                      : [],
                  siguientes: resto.siguientes,
                  transicion,
                })
              : conPreguntaPendiente(sinPreguntas(recortada), preguntaDeVuelta, transicion)
            : recortada
        ) as LSG;
        fasesAReanudar.current = new Set(
          opciones.soloExplicacion && resto
            ? resto.siguientes.map((m) => String(m.id ?? "")).filter((id) => id && id !== faseAlPedir)
            : [],
        );

        // Se anota el enunciado de cada fase antes de reproducir nada, para
        // poder mostrarlo en cuanto se entra en ella.
        //
        // Salvo el de la fase en la que se pidió la ayuda: la primera línea que
        // escribe un desglose es un paso —"MCM(5, 2): 5 × 2 = 10"—, no el
        // enunciado, y a la siguiente pulsación se habría llevado la tarjeta. La
        // fase sigue con su ejercicio, o con el nuevo que cierra el desglose.
        const enunciados = enunciadosDeLeccion(lsg);
        if (opciones.soloExplicacion && faseAlPedir) {
          const pizarrasDeLaAyuda = (Array.isArray(datos.pasos) ? datos.pasos : [])
            .filter((p: { tipo?: string; contenido?: string }) => p?.tipo === "pizarra" && String(p.contenido ?? "").trim())
            .map((p: { contenido: string }) => String(p.contenido).trim());
          const propio = preguntaNueva
            ? (pizarrasDeLaAyuda[pizarrasDeLaAyuda.length - 1] ?? null)
            : (enunciadoPorFase.current.get(faseAlPedir) ?? enTarjeta);
          if (propio) enunciados.set(faseAlPedir, propio);
          else enunciados.delete(faseAlPedir);
        }
        enunciadoPorFase.current = enunciados;
        // Y qué enunciados se le piden al alumno: esos no se animan. Una ayuda
        // añade los suyos a los de la lección que continúa; una lección nueva
        // empieza de cero.
        const piden = enunciadosParaResolver(lsg);
        paraResolverRef.current = opciones.soloExplicacion
          ? new Set([...paraResolverRef.current, ...piden])
          : piden;
        setParaResolver(paraResolverRef.current);
        if (!opciones.soloExplicacion || preguntaNueva) {
          practicaResuelta.current = false;
          pasoEnPantalla.current = null;
        }

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
        // Salvo la que cierra con un ejercicio nuevo: ése es ya el que se corrige.
        if ((!opciones.soloExplicacion || preguntaNueva) && pizarras.length > 0) {
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
      setTerminoLaLeccion(false);
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
      // El pliego pide que el avatar acompañe la corrección: PENSANDO mientras
      // el servidor valida —que puede tardar—, y luego celebración o apoyo
      // según el veredicto. Sin esto, el alumno enviaba su respuesta y el tutor
      // se quedaba con la misma cara mirando al vacío.
      setEstadoAvatar("pensando");
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
        if (r.ok) {
          const fallo: Veredicto = await r.json();
          setVeredicto(fallo);
          // Celebrar o acompañar. Un veredicto que el motor no puede verificar
          // no es un error del alumno, así que ahí no se pone cara de apoyo.
          if (fallo.correcto === true) setEstadoAvatar("sonriendo");
          else if (fallo.correcto === false) setEstadoAvatar("preguntando");
          else setEstadoAvatar("neutral");
        } else {
          setEstadoAvatar("neutral");
        }
      } catch {
        // Un fallo de red al corregir no debe bloquear la lección: el motor
        // local sigue adelante con su propia ramificación pedagógica.
        setEstadoAvatar("neutral");
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
    // Con voz neuronal del servidor puede no haber ninguna voz española
    // instalada en el equipo y sonar igualmente: manda si PUEDE hablar.
    tts.enabled = activar && tts.hasSpanishVoice();
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
  // Se mantiene al día la última regla nombrada, para poder inyectarla en la
  // petición de aclaración sin que `pedirLeccion` dependa de este estado.
  const [reglaDetectada, setReglaDetectada] = useState<ReglaVista | null>(null);

  /** La fase que está abierta ahora mismo. */
  const faseAbierta = fases[fases.length - 1]?.id ?? "";

  /**
   * LA REGLA QUE SE ESTÁ EXPLICANDO, RESUELTA EN UN SOLO SITIO.
   *
   * Esto vivía dentro de la pizarra, y por eso la primera corrección no sirvió
   * de nada: el aula miraba `reglaDetectada` —que en aritmética casi siempre es
   * null, porque el motor NARRA la regla y no la escribe— mientras la tarjeta
   * caía en su último recurso y componía la primera del tema. Las dos vistas
   * hablaban de reglas distintas: aquí no había cuenta que animar y allí había
   * una compuesta y quieta. Exactamente lo que se ve en la captura.
   *
   * Resuelta aquí y bajada ya elegida, las dos enseñan la misma.
   */
  const reglaEnCurso = useMemo(() => {
    if (!esFaseDeReglas(faseAbierta) || reglasDelTema.length === 0) return null;
    if (reglaDetectada) return reglaDetectada;
    const porPizarra = reglaActiva(
      [ejercicio?.texto ?? "", ...desarrollo.map((l) => l.texto)],
      reglasDelTema,
    );
    // Y si no se deduce ninguna, la primera del tema: una fase de "Reglas y
    // propiedades" en blanco no es aceptable, y el catálogo siempre tiene una.
    return porPizarra ?? reglasDelTema[0];
  }, [faseAbierta, reglasDelTema, reglaDetectada, ejercicio, desarrollo]);

  /**
   * LO QUE SE ANIMA: los pasos del ejercicio, y sólo en las fases que plantean
   * uno (el ejemplo y la práctica).
   *
   * En Concepto y Reglas no se anima nada. Se animaba la cuenta del catálogo de
   * la regla —la suma en columna de "Suma con llevada", 24 + 17— y el cliente la
   * vio aparecer "mientras se está definiendo el concepto de suma... un ejercicio
   * que carece de sentido en este contexto. Retirarlo." Esas fases enseñan
   * definiciones y la regla; la cuenta con sus llevadas se anima en el ejemplo,
   * con los números de la lección.
   *
   * Cada línea viaja como PASO: su LaTeX y, si el generador la envió, la
   * instrucción de foco.
   */
  const lineasAnimadas = useMemo(() => {
    const pasos: PasoSemantico[] = [];
    if (!esFaseDeEjemplo(faseAbierta) && !esFaseDePractica(faseAbierta)) return pasos;
    // EL EJERCICIO QUE SE LE PIDE AL ALUMNO NO SE ANIMA: animarlo es que la
    // pizarra le haga el primer paso. El ejemplo que resuelve el tutor sí, y
    // también la práctica cuando el alumno pidió que se la explicaran.
    if (ejercicio?.texto && (!paraResolver.has(ejercicio.texto) || ejercicio.texto === enunciadoExplicado)) {
      pasos.push(pasoDeLinea(ejercicio));
    }
    for (const linea of desarrollo) {
      if (linea.aclaracion || paraResolver.has(linea.texto)) continue;
      pasos.push(pasoDeLinea(linea));
    }
    return pasos;
  }, [faseAbierta, ejercicio, desarrollo, paraResolver, enunciadoExplicado]);

  /** "Este paso", para el botón «No entendí este paso»: el que la animación tiene delante. */
  const alProgresarAnimacion = useCallback(({ texto }: { terminado: boolean; texto?: string | null }) => {
    pasoEnPantalla.current = texto ?? null;
  }, []);

  /**
   * Los mandos del tutor, para que la pizarra animada pueda usarlos.
   *
   * El sintetizador es uno solo, y el índice de paso también tiene que serlo:
   * pausar desde la pizarra pausa la locución del tutor —y la pizarra se para
   * con él, porque lo va siguiendo—, en lugar de abrir una segunda
   * reproducción que cuente algo distinto.
   */
  useEffect(() => {
    if (!tema) return;
    return () => {
      // Al cambiar de tema —o al salir de la lección— se calla lo que estuviera
      // sonando, venga del tutor o del repaso. Una frase de Aritmética narrada
      // sobre la pantalla de Fracciones es exactamente lo que se reportó.
      vozRef.current?.callarATodos();
    };
  }, [tema?.clave]);

  const mandosLeccion = useMemo(
    () => ({
      pausar: () => pseRef.current?.pause(),
      // Arrancar la lección es el gesto con el que el navegador AUTORIZA el
      // audio: se aprovecha para dejar listo el reproductor de la voz neuronal
      // —si no, la primera frase llega después del clic y el navegador puede
      // negarse a reproducirla, cayendo a la voz metálica justo al empezar—.
      reanudar: () => {
        ttsRef.current?.desbloquear();
        void pseRef.current?.play();
      },
    }),
    [],
  );

  /**
   * CAMBIAR DE FASE O DE TEMA EMPIEZA DE CERO.
   *
   * Lo pidió el cliente y tiene razón de fondo: al pasar de Concepto a Reglas
   * —o de Aritmética a Fracciones— no puede quedar nada de lo anterior. El
   * subtítulo ya va etiquetado con su fase; esto se ocupa de lo que faltaba:
   * la pizarra animada vuelve a su primer paso, en lugar de seguir donde la
   * dejó la fase que se acaba de cerrar.
   *
   * La clave viaja al panel como prop: es él quien tiene la máquina, y un aviso
   * declarativo evita tener que sacarle una API de mandos al aula.
   */
  const reinicioAnimacion = `${tema?.clave ?? ""}·${faseAbierta}`;

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
              <Avatar2D
                estado={avatarPizarra ?? estadoAvatar}
                hablando={hablando}
                // Con una pregunta delante, el rótulo dice lo que toca hacer.
                etiqueta={pregunta ? "Te toca a ti" : undefined}
              />
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
              <p className="text-center text-[10px] leading-tight text-muted-foreground/60">
                build {VERSION}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pizarra y práctica */}
        <div className="space-y-4">
          <Progress value={porcentajeReproducido} />

          {/* LA PIZARRA DE LA CLASE: UNA SOLA.
              Antes había dos —la pizarra de siempre arriba y un panel animado
              debajo, que era además el que se proyectaba—, y el cliente vio que
              "lo que se muestra en la pantalla celeste no es lo mismo de lo que
              se proyecta". Ahora la pizarra (con el ejercicio fijo arriba y sus
              dos ambientes) ES el panel: la animación ocurre dentro de ella, en
              cada paso escrito, y proyectar es poner ESTE MISMO panel en
              pantalla completa. No hay copia que pueda divergir. */}
          <PanelAnimado
            lineas={lineasAnimadas}
            tablero={(animacion) => (
              <Pizarra
                fases={fases}
                ejercicio={ejercicio}
                desarrollo={desarrollo}
                faseDelContenido={faseDelContenido}
                resaltado={resaltado}
                reglas={reglasDelTema}
                // La regla ya resuelta en el aula: la misma en toda la pizarra.
                reglaDetectada={reglaEnCurso}
                tema={tema.tema}
                paraResolver={paraResolver}
                enunciadoExplicado={enunciadoExplicado}
                animacion={animacion}
              />
            )}
            avatarDeLaLeccion={{ estado: avatarPizarra ?? estadoAvatar, hablando }}
            // Terminada —y no vuelta a reproducir—, la pizarra queda resuelta.
            leccionTerminada={terminoLaLeccion && !controles.playing}
            tts={vozPizarra}
            vozActiva={vozActiva}
            // Lo que el tutor está diciendo: con esto la pizarra se coloca
            // sola donde va la voz, sin esperar a que nadie pulse Reproducir.
            //
            // SALVO CUANDO PREGUNTA. "¿Cuánto es 1/7 + 5/7?" repite las cifras
            // del primer paso explicado, y la pizarra rebobinaba hasta él —con
            // el desarrollo ya resuelto escondido— justo cuando el alumno tenía
            // que contestar. Una pregunta (o la pista de un reintento) no es un
            // paso de la explicación: la pizarra se queda donde está.
            narracion={estadoAvatar === "preguntando" ? null : subtitulo}
            alCambiarAvatar={alCambiarAvatar}
            alProgresar={alProgresarAnimacion}
            reinicio={reinicioAnimacion}
            // Un solo mando de reproducción: mientras el tutor explica, los
            // botones de la pizarra actúan sobre ÉL, no sobre una segunda
            // reproducción en paralelo.
            leccionEnMarcha={controles.playing}
            leccionPausada={controles.paused}
            mandosLeccion={mandosLeccion}
            // El sintetizador es uno solo: cuando el repaso animado se pone a
            // hablar, el tutor de la lección calla. Se le pausa Y se corta lo
            // que tuviera en la boca: si la lección no estaba reproduciéndose,
            // `pause()` no hace nada, y una locución a medias seguiría sonando
            // por debajo del repaso.
            alTomarLaVoz={() => {
              pseRef.current?.pause();
              ttsRef.current?.cancel();
            }}
          />

          {/* Subtítulo: lo que el tutor está diciendo en este momento. Sus
              fórmulas se componen igual que las de la pizarra. */}
          {/*
              El subtítulo, sólo si es de la fase que está abierta. Una frase de
              la fase anterior que llegue tarde no se pinta bajo el rótulo de la
              nueva: contaría una cosa mientras la pizarra enseña otra.
          */}
          {subtitulo && faseDelSubtitulo === faseAbierta && (
            // LO QUE DICE EL TUTOR: rol TUTOR_DIALOG. El informe del cliente
            // fija las tres fuentes por rol —"IA explicando: Segoe Print",
            // exclusiva para los subtítulos de narración y la retroalimentación—
            // y la aplica la hoja de estilos; las fórmulas de la frase, KaTeX.
            <TextoTutor
              como="p"
              className="pz-subtitulo rounded-md bg-muted/60 px-4 py-3 text-sm leading-relaxed"
              texto={subtitulo}
            />
          )}

          {cargando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando la lección…
            </p>
          )}

          {/* Entorno de resolución interactiva.

              SE VE QUE LE TOCA AL ALUMNO. La lección se para aquí esperando una
              respuesta, y el cliente vio la consecuencia de no decirlo: "el
              estudiante no sabe que debe interactuar y piensa que el sistema se
              congeló". Ahora la tarjeta se anuncia sola —marco, aviso y un
              latido al aparecer—, se lleva la vista hasta ella y dice, con las
              mismas palabras que acaba de decir el avatar, qué hay que hacer. */}
          {pregunta && (
            <Card ref={cajaRespuesta} className="pz-turno-alumno border-2 border-primary shadow-md">
              <CardHeader className="pb-3">
                <TextoTutor
                  como="p"
                  className="pz-aviso-turno text-sm font-semibold text-primary"
                  texto={INVITACION_A_RESPONDER}
                />
                <CardTitle className="text-base font-medium">
                  <TextoTutor como="span" className="pz-pregunta" texto={pregunta} />
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
                <TextoTutor
                  como="span"
                  className="pz-veredicto"
                  texto={
                    veredicto.correcto === true
                      ? "Correcto. Lo has resuelto bien."
                      : String(veredicto.pista ?? veredicto.mensaje ?? "")
                  }
                />
              </AlertDescription>
            </Alert>
          )}

          {/* Mensaje pedagógico del tutor */}
          {/* La retroalimentación también es voz del tutor, y sus fórmulas
              ("Resultado final: 11/10") salen con la fracción vertical. */}
          {feedback && (
            <TextoTutor
              como="p"
              className={cn(
                "pz-retroalimentacion text-sm font-medium",
                feedback.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600",
              )}
              texto={feedback.msg}
            />
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

