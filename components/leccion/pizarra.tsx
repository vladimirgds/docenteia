"use client";

import katex from "katex";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

import { TextoTutor } from "@/components/leccion/texto-tutor";
import { DiagramaConcepto } from "@/components/leccion/diagrama-concepto";
import { FraccionFormal, NotaDePizarra } from "@/components/leccion/nota-pizarra";
import {
  PizarraAnimada,
  type AnimacionDePizarra,
  type EstadoEscena,
} from "@/components/leccion/pizarra-animada";
import { conceptoDeFraccion, tieneDiagrama } from "@/lib/leccion/diagramas";
import type { OperacionPaso, PasoSemantico } from "@/lib/leccion/marcado";
import {
  columnaDeCuentaDibujada,
  columnaDeLinea,
  leerSumaOResta,
  sinRayasDibujadas,
} from "@/lib/leccion/columna";
import {
  CLASE_COEFICIENTE,
  CLASE_EXPONENTE,
  lineaResaltada,
} from "@/lib/leccion/destacar";
import { escenaDeLinea, identidadDeEscena, type Escena } from "@/lib/leccion/animacion";
import { esCalculoAuxiliar, esGestoDeBorrador, repartirEnAmbientes, type PapelDelPaso } from "@/lib/leccion/ambientes";
import { partirLaMasLarga } from "@/lib/leccion/ajuste";
import { ROL, rol } from "@/lib/leccion/roles";
import { esEnunciadoParaResolver } from "@/lib/leccion/seguimiento-lsg";
import { pasoIntermedioDerivada } from "@/lib/leccion/desarrollo";
import { esNotaRotulada } from "@/lib/leccion/notas";
import { rotulosALatex } from "@/lib/leccion/rotulos";
import {
  esFaseDeConcepto,
  esFaseDeEjemplo,
  esFaseDePractica,
  esFaseDeReglas,
} from "@/lib/leccion/fases";
import { identificarRegla, reglaActiva } from "@/lib/leccion/reglas";
import { notacionFormal, pareceMatematica, planoALatex } from "@/lib/matematicas";
import { cn } from "@/lib/utils";

export { tituloDeFase } from "@/lib/leccion/fases";

/** Una línea escrita en la pizarra. */
export interface LineaPizarra {
  id: number;
  texto: string;
  /** "formula" viene de una directiva `pizarra`; "explicacion", de una `hablar`. */
  clase: "formula" | "explicacion";
  /**
   * La instrucción de foco del paso, si el generador la envía.
   *
   * Es lo que permite que un ejercicio nuevo del catálogo se resalte solo: dice
   * qué operación se está haciendo y sobre qué términos, y la pizarra animada
   * marca exactamente eso sin saber de qué tema se trata.
   */
  operacion?: OperacionPaso;
  /** Lo que el tutor dice mientras se marca este paso, si el generador lo envía. */
  narracion?: string;
  /**
   * EN QUÉ COLUMNA VA, dicho por el motor. `2` es el taller de operaciones
   * auxiliares; sin valor, el hilo conductor. Se declara en vez de deducirse:
   * adivinarlo leyendo la ecuación es lo que mezclaba las dos columnas.
   */
  ambiente?: 1 | 2;
  /**
   * `"explicacion"` es el texto que explica el objetivo del paso, escrito en la
   * pizarra ANTES de su ecuación. Es prosa, pero prosa que va en el tablero.
   */
  papelDelPaso?: "explicacion";
  /**
   * La línea pertenece a una ACLARACIÓN pedida por el alumno, no al hilo de la
   * lección. Se agrupa aparte y se sustituye en la siguiente aclaración, para
   * que pedir ayuda tres veces no deje tres muros de texto en la pizarra.
   */
  aclaracion?: boolean;
}

/**
 * Cómo se compone una línea de aritmética.
 *
 * "planteamiento" es la operación en columna con la raya y sin el total: lo que
 * el alumno tiene delante cuando le toca resolverla. "resuelta" añade las
 * llevadas y el resultado.
 */
type ModoColumna = "planteamiento" | "resuelta";


/**
 * Una fase abierta de la lección. Sólo identidad: ningún contenido.
 *
 * El ejercicio y el desarrollo NO viven aquí dentro, sino como estado propio
 * del aula que llega en props independientes. Mientras el enunciado colgaba de
 * la fase, cualquier cambio en el desarrollo pasaba por la misma estructura
 * que la tarjeta de arriba, y bastaba con no vaciarla a tiempo para que el
 * enunciado se quedara anclado al ejercicio anterior o desapareciera con los
 * pasos. Separados, la tarjeta superior se compone en cuanto se entra en la
 * fase y no depende en absoluto del ciclo de desarrollo.
 */
export interface FaseAbierta {
  id: string;
  titulo: string;
}

/** Desarrollo vacío, estable: evita rehacer el array en cada composición. */
const SIN_DESARROLLO: LineaPizarra[] = [];

/** Una regla del catálogo formal, tal como la muestra la pizarra. */
export interface ReglaPizarra {
  clave: string;
  nombre: string;
  enunciado: string;
  descripcion: string;
  ejemplo: string | null;
  practicable: boolean;
}

/**
 * Pizarra digital (SmartBoard).
 *
 * Cada fase de la lección es una ESCENA con su propia vista: al pasar de
 * "Concepto" a "Reglas" la pizarra se limpia y entra el contenido nuevo, en
 * lugar de seguir apilando párrafos hacia abajo. Dentro de una escena, las
 * líneas se revelan al ritmo de la explicación.
 *
 * Sobre el renderizado: el motor escribe en notación plana ("12x³ - 4x"), que
 * es la que entienden sus analizadores y su suite de pruebas. La traducción a
 * LaTeX ocurre aquí, de modo que la pizarra se compone sin tocar una línea de
 * la lógica ya validada.
 */
export function Pizarra({
  fases,
  ejercicio: ejercicioRecibido,
  desarrollo: desarrolloRecibido,
  faseDelContenido,
  resaltado,
  reglas = [],
  reglaDetectada = null,
  tema,
  paraResolver,
  enunciadoExplicado = null,
  animacion = null,
  className,
}: {
  /** Fases ya abiertas: la tira de progreso y la vista en curso. */
  fases: FaseAbierta[];
  /**
   * Ejercicio activo. Llega ya resuelto desde el aula, que lo fija al entrar
   * en la fase, así que el encabezado se compone en el milisegundo 0 sin
   * esperar a que haya un solo paso calculado.
   */
  ejercicio: LineaPizarra | null;
  /** Pasos del procedimiento; el aula lo SUSTITUYE entero en cada petición. */
  desarrollo: LineaPizarra[];
  /**
   * De qué fase es ese contenido: durante la transición conviven la vista
   * saliente y la entrante, y sólo se compone el de la fase que se pinta.
   */
  faseDelContenido: string;
  /** Texto de la línea que el puntero está señalando, si hay alguno. */
  resaltado: string | null;
  /** Catálogo formal del tema, del que sale la tarjeta de la fase de Reglas. */
  reglas?: ReglaPizarra[];
  /** Regla que el aula ha detectado como activa a partir de lo narrado. */
  reglaDetectada?: ReglaPizarra | null;
  /** Tema en curso, para elegir el diagrama de la fase de Concepto. */
  tema?: string;
  /**
   * Los enunciados que se le PIDEN al alumno. Su planteamiento no se anima:
   * animarlo era hacerle a la pizarra el primer paso del ejercicio que tiene
   * que resolver él.
   */
  paraResolver?: ReadonlySet<string>;
  /**
   * El de la práctica que el tutor está RESOLVIENDO en voz alta, tras «Explicar
   * regla» o «No entendí este paso»: ése sí se anima, al compás de la voz.
   */
  enunciadoExplicado?: string | null;
  /** El estado de la animación: qué paso está recorriendo la voz. */
  animacion?: AnimacionDePizarra | null;
  className?: string;
}) {
  const actual = fases[fases.length - 1] ?? null;
  const finRef = useRef<HTMLDivElement>(null);
  const proyeccion = animacion?.proyeccion ?? false;

  // El contenido sólo se compone bajo SU fase. Lo que venga marcado con otra
  // no se pinta: es lo que dejaba recuadros residuales al cambiar de fase.
  const propio = actual != null && faseDelContenido === actual.id;
  const ejercicio = propio ? ejercicioRecibido : null;
  const desarrollo = useMemo(
    () => (propio ? desarrolloRecibido : SIN_DESARROLLO),
    [propio, desarrolloRecibido],
  );

  /**
   * Regla que se compone en la fase de Reglas: la que el aula ha detectado como
   * activa, la que se deduzca de lo escrito o, si ninguna, la primera del tema
   * —una fase de "Reglas y propiedades" sin ninguna regla a la vista no es
   * aceptable, y el catálogo siempre tiene una—.
   */
  const reglaEnCurso = useMemo(() => {
    if (!actual || !esFaseDeReglas(actual.id) || reglas.length === 0) return null;
    if (reglaDetectada) return reglaDetectada;
    const porPizarra = reglaActiva(
      [ejercicio?.texto ?? "", ...desarrollo.map((l) => l.texto)],
      reglas,
    );
    return porPizarra ?? reglas[0];
  }, [actual, ejercicio, desarrollo, reglas, reglaDetectada]);

  /**
   * Qué partes se han marcado de verdad en el ejercicio, para la leyenda. En
   * aritmética no se marca nada, y en "x²" sólo el exponente.
   */
  const marcado = useMemo(() => {
    if (!actual || !esFaseDeEjemplo(actual.id) || !ejercicio) {
      return { coeficiente: false, exponente: false };
    }
    const latex = lineaResaltada(ejercicio.texto) ?? "";
    return {
      coeficiente: latex.includes(CLASE_COEFICIENTE),
      exponente: latex.includes(CLASE_EXPONENTE),
    };
  }, [actual, ejercicio]);

  /** ¿La fase en curso plantea un ejercicio al alumno? */
  const planteaEjercicio =
    actual != null && (esFaseDeEjemplo(actual.id) || esFaseDePractica(actual.id));

  /**
   * LOS PASOS DEL EJERCICIO, CADA UNO EN SU AMBIENTE.
   *
   * El planteamiento abre el Ambiente 1; detrás, cada línea del desarrollo con
   * su papel (paso, cálculo auxiliar, cierre) y su escena de animación. El
   * reparto entre los dos ambientes lo hace `repartirEnAmbientes`, que sólo
   * mira lo ya escrito: una línea no cambia de lado cuando llega la siguiente.
   */
  const elementos = useMemo((): ElementoPizarra[] => {
    if (!actual || !planteaEjercicio || !ejercicio) return [];

    const pideAlAlumno =
      ejercicio.texto !== enunciadoExplicado &&
      (Boolean(paraResolver?.has(ejercicio.texto)) || esEnunciadoParaResolver(ejercicio.texto));
    const enColumna = leerSumaOResta(sinRayasDibujadas(ejercicio.texto)) != null;

    const lista: { linea: LineaPizarra; papel: PapelDelPaso }[] = [
      { linea: ejercicio, papel: "planteamiento" },
    ];
    // Paso intermedio de la derivada, donde se ve APLICADA la regla. Sólo en el
    // EJEMPLO: en la práctica revelaría la respuesta.
    const intermedio =
      esFaseDeEjemplo(actual.id) && desarrollo.length > 0 ? pasoIntermedioDerivada(ejercicio.texto) : null;
    if (intermedio) lista.push({ linea: { id: -ejercicio.id - 1, texto: intermedio, clase: "formula" }, papel: "paso" });

    for (const linea of desarrollo) {
      const cierre = linea.operacion?.tipo === "resultado" || Boolean(linea.operacion?.final);
      const auxiliar = !cierre && esCalculoAuxiliar(linea.texto);
      // UNA CUENTA EN COLUMNA ES UNA SOLA: la del planteamiento, que se anima.
      // Los trozos con que el motor la redibuja —"27 + 38 =", "¹19", "+45"—
      // abrían su propia tarjeta cada uno. De las demás líneas sólo se escriben
      // las notas de cada columna (al margen, en el Ambiente 2) y el cierre.
      if (enColumna && !cierre && !auxiliar) continue;
      lista.push({ linea, papel: cierre ? "cierre" : auxiliar ? "auxiliar" : "paso" });
    }

    // Qué escena del guion corresponde a cada línea: la animación la recorre por
    // su identidad. Si dos líneas tienen la misma (el planteamiento "24 + 17" y
    // el cierre "24 + 17 = 41" son la misma cuenta), la escena es de la primera.
    const indicePorIdentidad = new Map<string, number>();
    (animacion?.escenas ?? []).forEach((e, i) => {
      const id = identidadDeEscena(e);
      if (!indicePorIdentidad.has(id)) indicePorIdentidad.set(id, i);
    });
    const usadas = new Set<number>();

    const conEscena = lista.map(({ linea, papel }) => {
      const estatica = papel === "planteamiento" && pideAlAlumno;
      const escena = estatica ? null : escenaDeLinea(pasoDeLinea(linea), `linea-${linea.id}`);
      // UN CÁLCULO DEL TALLER NO ES UN PASO DEL GUION.
      //
      // «Las operaciones auxiliares… deben permanecer visibles en su columna
      // para que el alumno compare en paralelo la ecuación limpia a la
      // izquierda con el cálculo a la derecha.» Y desaparecían: "−8 + 8 = 0" es
      // una igualdad, la pizarra le encontraba una escena del guion y, en
      // cuanto la voz pasaba de ese punto, el filtro de lo ya explicado la
      // consideraba pendiente y la quitaba. El apoyo se escribe cuando el tutor
      // lo narra y se queda: no se sincroniza con nada, porque no es un paso.
      const animable = escena != null && escena.focos.length > 0 && linea.ambiente !== 2;
      let indiceGuion = -1;
      if (animable) {
        const candidato = indicePorIdentidad.get(identidadDeEscena(escena));
        if (candidato != null && !usadas.has(candidato)) {
          indiceGuion = candidato;
          usadas.add(candidato);
        }
      }
      return {
        linea,
        papel,
        escena: animable ? escena : null,
        indiceGuion,
        gesto: linea.operacion?.tipo ?? (animable ? escena.clase : null),
        columna: papel === "planteamiento" && enColumna && estatica ? ("planteamiento" as const) : undefined,
      };
    });

    // QUÉ ES HILO CONDUCTOR Y QUÉ ES BORRADOR lo dice la escena ya compuesta: un
    // tachado es una cancelación y dos marcas sobre los denominadores son una
    // división hecha a los dos lados. Las dos son apoyo; la línea que queda, no.
    // Y LO QUE UNA ESCENA YA DEJA ESCRITO NO SE ESCRIBE OTRA VEZ.
    //
    // El reparto de un paréntesis se compone en dos renglones y el segundo es ya
    // la ecuación sin paréntesis —"2x + 8 = 3x − 1"—, que el motor escribe
    // además como paso propio. Mientras ese paso vivía en el Ambiente 2 no se
    // notaba; con el hilo conductor entero en el Ambiente 1, salía dos veces
    // seguidas. Se compara sin espacios y con el guion de resta normalizado.
    const mismaEcuacion = (a: string, b: string) =>
      a.replace(/[−–—]/g, "-").replace(/\s+/g, "") === b.replace(/[−–—]/g, "-").replace(/\s+/g, "");
    const sinRepetir = conEscena.filter((e, i) => {
      const anterior = conEscena[i - 1]?.escena?.continuacion;
      return !(anterior && mismaEcuacion(anterior, e.linea.texto));
    });

    // QUÉ ES HILO Y QUÉ ES TALLER LO DICE EL MOTOR.
    //
    // La pizarra lo deducía de la escena compuesta, y con eso el desglose
    // aritmético y la ecuación canónica acababan mezclados: el cliente puso la
    // línea compensada —"11x − 8 + 8 = 25 + 8"— en el HILO, y al taller sólo la
    // cuenta que la justifica —"−8 + 8 = 0"—. Eso no se ve mirando la ecuación;
    // lo sabe quien la genera. La deducción queda de red para lo que llegue sin
    // declarar (una aclaración que el modelo escribe en vivo).
    const sitios = repartirEnAmbientes(
      sinRepetir.map(({ papel, gesto, escena, linea }) => ({
        papel,
        gesto,
        auxiliar:
          linea.ambiente === 2 ||
          (linea.ambiente == null && esGestoDeBorrador(gesto, escena?.focos ?? [])),
      })),
    );
    return sinRepetir.map((e, i) => ({ ...e, ambiente: sitios[i] }));
  }, [actual, planteaEjercicio, ejercicio, desarrollo, paraResolver, enunciadoExplicado, animacion?.escenas]);

  /**
   * La fracción en curso, y si ya se han dicho "numerador" / "denominador":
   * el MISMO cálculo que usa cualquier otra vista (`conceptoDeFraccion`).
   */
  const ultimaNota = desarrollo.length > 0 ? desarrollo[desarrollo.length - 1] : null;
  const { fraccion: fraccionEnCurso, vistoNumerador, vistoDenominador } = useMemo(
    () =>
      conceptoDeFraccion({
        faseId: actual?.id,
        tema,
        pasoSuelto: planteaEjercicio ? null : ultimaNota,
        ejercicio,
        desarrollo,
      }),
    [actual, tema, planteaEjercicio, ultimaNota, ejercicio, desarrollo],
  );

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [desarrollo.length, ejercicio?.id, actual?.id]);

  /**
   * LA PIZARRA SIGUE AL PASO QUE SE ESTÁ EXPLICANDO.
   *
   * Un despeje largo baja más de lo que mide la pantalla, y entonces el paso
   * que la voz está contando —y, al final, la respuesta— se quedaban por debajo
   * del borde. El cliente lo pidió con estas palabras: «los últimos pasos y el
   * resultado final quedan ocultos debajo de la pantalla, obligando a usar
   * scroll. Sería ideal implementar un autodesplazamiento suave hacia el paso
   * activo… para que el estudiante siempre vea el paso que se explica y la
   * respuesta final sin tener que mover la pantalla manualmente».
   *
   * Así que la pizarra se desplaza sola al renglón activo cada vez que la voz
   * cambia de paso. La otra salida que él mismo apuntaba —«limpiar etapas
   * intermedias»— no se toma: el informe pide lo contrario («todos los pasos
   * deben permanecer en pantalla simultáneamente al concluir la explicación»),
   * y borrar lo ya explicado es justo lo que en su día se leyó como que la
   * pizarra se borraba sola.
   *
   * `block: "nearest"` mueve lo justo: si el paso ya se ve, no se mueve nada.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const acercar = () => {
      // Desde el cuerpo del tablero, que es el que se desplaza: así se busca en
      // ESTA pizarra y no en otra que hubiera en la página.
      const activo = finRef.current
        ?.closest(".pz-tablero-cuerpo")
        ?.querySelector<HTMLElement>('.pz-elemento[data-estado="activa"]');
      activo?.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "nearest" });
    };
    // Y SE VUELVE A MIRAR CUANDO EL RENGLÓN YA MIDE LO QUE VA A MEDIR.
    //
    // Un paso no tiene su altura definitiva en el momento en que se vuelve
    // activo: las fuentes de KaTeX llegan después, una fracción crece al
    // componerse y un renglón que no cabía de ancho se encoge en una segunda
    // pasada. Mirando sólo al principio, la línea de "-x/-1 = -9/-1" se quedaba
    // 23 px por debajo del borde con la pizarra sin desplazar.
    acercar();
    const cuadro = requestAnimationFrame(acercar);
    // Dos reposos, no uno: entre el primero y el segundo caben el destapado de
    // la línea y el encogido que lo sigue, y con un solo intento el renglón se
    // quedaba de vez en cuando unos píxeles por debajo del borde.
    const reposos = [window.setTimeout(acercar, 350), window.setTimeout(acercar, 800)];
    // Y MIENTRAS ESE PASO SIGA CRECIENDO, SE VUELVE A ACERCAR.
    //
    // El renglón del cierre —"x = 5" con su cápsula, su visto y su frase— no
    // tiene su altura final hasta que la capa de marcas se mide y le reserva el
    // aire de arriba y abajo. Se quedaba 35 px por debajo del borde: justo la
    // respuesta final, que es lo que el cliente pidió no tener que ir a buscar.
    const cuerpo = finRef.current?.closest(".pz-tablero-cuerpo") ?? null;
    const activo = cuerpo?.querySelector<HTMLElement>('.pz-elemento[data-estado="activa"]') ?? null;
    // Y TAMBIÉN CUANDO LO QUE TIENE ENCIMA CRECE.
    //
    // El paso activo puede bajar sin cambiar de tamaño: basta con que se escriba
    // un renglón por encima, o que uno de ellos se componga y crezca. Vigilando
    // sólo al propio paso, una amplificación de fracciones se quedaba 42 px por
    // debajo del borde. Se vigila por tanto el bloque entero de los ambientes.
    const contenido = cuerpo?.querySelector<HTMLElement>(".pz-ambientes") ?? null;
    // Y el BLOQUE del paso activo: el comentario y su desarrollo van juntos, y
    // el bloque puede crecer —el comentario se compone y ocupa otro renglón—
    // sin que crezca el propio paso.
    const celda = activo?.closest<HTMLElement>(".pz-bloque-paso") ?? null;
    const observador = typeof ResizeObserver !== "undefined" ? new ResizeObserver(acercar) : null;
    if (observador) {
      if (activo) observador.observe(activo);
      if (celda) observador.observe(celda);
      if (contenido) observador.observe(contenido);
    }
    return () => {
      cancelAnimationFrame(cuadro);
      for (const t of reposos) window.clearTimeout(t);
      observador?.disconnect();
    };
  }, [animacion?.escena, animacion?.terminada]);

  /** El estado de la escena de un elemento, según por dónde va la voz. */
  const estadoDe = (indiceGuion: number): EstadoEscena => {
    if (!animacion || indiceGuion < 0) return "completada";
    if (indiceGuion < animacion.escena) return "completada";
    if (indiceGuion === animacion.escena) return "activa";
    return "pendiente";
  };

  const compacta = actual != null && !planteaEjercicio;

  // ── Concepto y Reglas: lo escrito en la fase, en sus dos ambientes ─────────
  const notas = planteaEjercicio ? [] : desarrollo.filter((l) => !l.aclaracion && l.clase !== "explicacion");
  const diagrama =
    actual != null && esFaseDeConcepto(actual.id) && tema && tieneDiagrama(tema) ? tema : null;
  // La tarjeta de la regla, salvo cuando su "fórmula" es una cuenta ya resuelta
  // (la suma en columna de "Suma con llevada"): el cliente la vio aparecer
  // mientras se definía la suma —"24 + 17", un ejercicio que no venía a cuento—
  // y pidió retirarla. La regla se lee en la nota que escribe el tutor.
  const tarjeta =
    actual != null && esFaseDeReglas(actual.id) && reglaEnCurso && !esOperacionDispuesta(reglaEnCurso.enunciado)
      ? reglaEnCurso
      : null;
  const conVisual = Boolean(diagrama) || Boolean(tarjeta);
  const notasAmbiente1 = conVisual ? [] : notas.slice(0, 1);
  const notasAmbiente2 = conVisual ? notas : notas.slice(1);

  /**
   * LA PIZARRA ENSEÑA LO EXPLICADO HASTA EL PASO EN CURSO, NI UNA LÍNEA MÁS.
   *
   * Al retroceder con la botonera —"Paso 1 de 4"— las líneas de los pasos
   * siguientes seguían pintadas: el Ambiente 2 mostraba de golpe todas las
   * ecuaciones intermedias y futuras, cada una con su barra de scroll. El
   * cliente lo fotografió en 2(x + 4) = 3x − 1: "cuando quiero ver el paso a
   * paso, la pizarra se desordena".
   *
   * Lo que aún no ha contado la voz no está escrito. Al avanzar reaparece, y al
   * terminar la lección se enseña todo otra vez: los dos ambientes conservan el
   * procedimiento entero, que es lo que pidió el informe.
   */
  const visibles = useMemo(
    () => {
      const escritos = elementos.filter((e) => animacion?.terminada || estadoDe(e.indiceGuion) !== "pendiente");
      /**
       * NADA SE BORRA, NI EN UNA COLUMNA NI EN LA OTRA.
       *
       * La regla de limpieza del Ambiente 2 llegó primero al revés y así se
       * entregó; el cliente la corrigió después de probarla: «cuando concluye
       * una operación auxiliar y su resultado se traslada formalmente al
       * siguiente renglón del Ambiente 1, el Ambiente 2 NO debe limpiarse. Las
       * operaciones auxiliares deben permanecer visibles para que el estudiante
       * pueda revisar y comprender la evolución progresiva de todo el
       * desarrollo».
       *
       * Así que aquí sólo se filtra lo que la voz aún no ha contado. Lo escrito
       * se queda escrito, y lo que evita tener que buscarlo es que la pizarra se
       * desplaza sola al renglón que se está explicando.
       */
      return escritos;
    },
    // `estadoDe` sólo depende de la escena en curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elementos, animacion?.escena, animacion?.terminada],
  );

  /**
   * CADA PASO DEL HILO, EN UN BLOQUE: PRIMERO EL COMENTARIO, DESPUÉS EL DESARROLLO.
   *
   * «En varios pasos estás colocando primero la fórmula/ecuación y después el
   * comentario explicativo. La regla pedagógica debe ser estricta e invariable
   * para todos los temas: 1º primero va el comentario —explica la intención o el
   * porqué de la acción antes de ejecutarla—; 2º luego va el desarrollo —la
   * ecuación resultante formal ya operada—.»
   *
   * El orden en que se escriben ya era ése; lo que faltaba era AGRUPARLOS. Sin
   * una caja que los una, un comentario se lee como si fuera del renglón de
   * arriba, que es justo lo que vio el cliente. Cada comentario abre un bloque y
   * se lleva consigo las líneas de desarrollo que vengan detrás, hasta el
   * comentario siguiente.
   *
   * El Ambiente 2 no se agrupa: su esquema lo dibuja como una pila propia
   * —«cálculo auxiliar del desarrollo 1, 2, 3»— al margen del alto que tenga
   * cada bloque de la izquierda.
   */
  const bloques = useMemo(() => {
    const salida: { comentario: ElementoPizarra | null; desarrollo: ElementoPizarra[] }[] = [];
    for (const e of visibles) {
      if (e.ambiente === 2) continue;
      if (e.linea.papelDelPaso === "explicacion") {
        salida.push({ comentario: e, desarrollo: [] });
        continue;
      }
      const ultimo = salida[salida.length - 1];
      // Lo que llega ANTES del primer comentario —el enunciado— abre su propio
      // bloque, sin comentario que lo encabece.
      if (ultimo) ultimo.desarrollo.push(e);
      else salida.push({ comentario: null, desarrollo: [e] });
    }
    return salida;
  }, [visibles]);

  // LA RESPUESTA SE ENMARCA UNA VEZ: en el cierre. Un paso anterior que ya
  // llegaba a ella —la cuenta en columna con su resultado— la deja subrayada,
  // sin una segunda cápsula con su visto.
  const ultimoCierre = visibles.reduce((k, e, i) => (e.papel === "cierre" ? i : k), -1);

  const renderElemento = (e: ElementoPizarra) => {
    const regla = esFaseDeEjemplo(actual?.id ?? "") && reglas.length ? identificarRegla(e.linea.texto, reglas) : null;
    const estado = estadoDe(e.indiceGuion);

    /**
     * EL COMENTARIO DEL PASO, CON UNA SOLA TIPOGRAFÍA.
     *
     * «Se observa que el tipo de fuente de los mensajes y comentarios varía
     * entre pasos… La tipografía de los comentarios explicativos debe ser
     * uniforme en toda la plataforma: misma familia sans-serif, mismo tamaño
     * legible y un color consistente.»
     *
     * Tenía razón, y venía de pasarlos por la maquinaria de las NOTAS de
     * pizarra: ésa parte el texto por el primer dos puntos y compone el trozo de
     * delante como rótulo —ámbar, letra de tiza— y el resto en blanco. Un
     * comentario no es una nota rotulada: es prosa, y se pinta como prosa.
     */
    if (e.linea.papelDelPaso === "explicacion") {
      return (
        <div key={e.linea.id} className="pz-elemento" data-papel="comentario" data-estado="estatica">
          <p {...rol(ROL.PIZARRA)} className="pz-comentario">
            {e.linea.texto}
          </p>
        </div>
      );
    }

    return (
      <div
        key={e.linea.id}
        className="pz-elemento"
        data-papel={e.papel}
        data-estado={e.escena ? estado : "estatica"}
      >
        {regla && (
          <span {...rol(ROL.PIZARRA)} className="pz-insignia-regla mb-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {regla.nombre}
          </span>
        )}
        {e.escena ? (
          <PizarraAnimada
            escena={e.escena}
            foco={estado === "activa" ? (animacion?.foco ?? -1) : -1}
            estado={estado}
            proyeccion={proyeccion}
            marcoFinal={ultimoCierre < 0 || visibles.indexOf(e) >= ultimoCierre}
          />
        ) : (
          <LineaRenderizada
            linea={e.linea}
            columna={e.columna}
            soloEnunciado={e.papel === "planteamiento"}
            resaltada={resaltado != null && e.linea.texto.includes(resaltado)}
            reglas={[]}
          />
        )}
      </div>
    );
  };

  const nota = (linea: LineaPizarra) => (
    <div key={linea.id} className="pz-elemento" data-papel="nota">
      <LineaRenderizada
        linea={linea}
        resaltada={resaltado != null && linea.texto.includes(resaltado)}
        reglas={[]}
      />
    </div>
  );

  return (
    <div
      className={cn("pz-pizarra space-y-3", proyeccion && "pz-pizarra-proyectada", className)}
      data-fase={actual?.id ?? ""}
      // Al acabar la clase la pizarra sí enseña el ejercicio entero; mientras
      // tanto, sólo lo explicado. Se declara para poder comprobarlo desde fuera.
      data-terminada={animacion?.terminada ? "si" : "no"}
    >
      {/* La tira de fases es interfaz: no se proyecta. */}
      {!proyeccion && <Fases fases={fases} />}

      {/* ALTURA FIJA en pantalla, no mínima: con una altura que crecía con el
          contenido, los botones de abajo saltaban en cada paso. El
          desbordamiento se resuelve dentro, con scroll propio. En proyección la
          pizarra ocupa la pantalla. */}
      <div
        className={cn(
          "pz-tablero-caja relative overflow-hidden rounded-lg border bg-card shadow-inner",
          compacta ? "h-[21rem] sm:h-[25rem]" : "h-[26rem] sm:h-[32rem]",
        )}
        aria-live="polite"
        aria-label="Pizarra"
      >
        {!actual ? (
          <p {...rol(ROL.PIZARRA)} className="p-5 text-sm text-muted-foreground">
            La pizarra está en blanco. Elige un tema y pulsa Reproducir.
          </p>
        ) : (
          <AnimatePresence mode="wait">
            {/* La clave es la fase: al cambiar, la vista entera se sustituye
                con una transición limpia. */}
            <motion.div
              key={actual.id}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="flex h-full flex-col"
            >
              {!proyeccion && (
                <div className="shrink-0 border-b bg-muted/40 px-5 py-2.5">
                  <h2 {...rol(ROL.PIZARRA)} className="text-sm font-semibold tracking-wide text-muted-foreground">
                    {actual.titulo}
                  </h2>
                </div>
              )}

              <div className="pz-tablero-cuerpo min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {/* EL EJERCICIO, FIJO ARRIBA: "Ejercicio:" y el enunciado limpio.
                    Los pasos se despliegan debajo, en los dos ambientes. */}
                {planteaEjercicio && (
                  <EncabezadoEjercicio texto={ejercicio?.texto ?? null} />
                )}

                <div className="pz-ambientes">
                  <section
                    className="pz-ambiente"
                    data-ambiente="1"
                    data-papel-ambiente="hilo"
                    aria-label="Ambiente 1"
                  >
                    {planteaEjercicio
                      ? bloques.map((b, i) => (
                          // BLOQUE DEL PASO: siempre el comentario primero y el
                          // desarrollo después, dentro de la misma caja, para que
                          // no quepa duda de a qué ecuación acompaña cada texto.
                          <div key={`bloque-${i}`} className="pz-bloque-paso">
                            {b.comentario ? renderElemento(b.comentario) : null}
                            {b.desarrollo.map(renderElemento)}
                          </div>
                        ))
                      : (
                        <>
                          {diagrama && (
                            <div className="pz-diagrama-y-fraccion space-y-4">
                              <DiagramaConcepto
                                tema={diagrama}
                                numerador={fraccionEnCurso?.numerador}
                                denominador={fraccionEnCurso?.denominador}
                                vistoNumerador={vistoNumerador}
                                vistoDenominador={vistoDenominador}
                              />
                              {/* LA DEFINICIÓN FORMAL, vertical y sin barra
                                  inclinada, a la misma letra y tamaño que las
                                  notas de al lado (el cliente: "considerar el
                                  mismo tamaño y tipo de letra"). */}
                              {diagrama === "FRACCIONES" && vistoNumerador && vistoDenominador && (
                                <FraccionFormal
                                  numerador={fraccionEnCurso?.numerador ?? 1}
                                  denominador={fraccionEnCurso?.denominador ?? 4}
                                />
                              )}
                            </div>
                          )}
                          {tarjeta && <TarjetaRegla key={tarjeta.clave} regla={tarjeta} proyeccion={proyeccion} />}
                          {notasAmbiente1.map(nota)}
                        </>
                      )}
                  </section>
                  <section
                    className="pz-ambiente"
                    data-ambiente="2"
                    data-papel-ambiente="apoyo"
                    aria-label="Ambiente 2"
                  >
                    {planteaEjercicio
                      ? visibles.filter((e) => e.ambiente === 2).map(renderElemento)
                      : notasAmbiente2.map(nota)}
                  </section>
                </div>



                {/* Qué significa cada color: sin la leyenda, el resaltado es
                    decoración. */}
                {(marcado.coeficiente || marcado.exponente) && (
                  <p {...rol(ROL.PIZARRA)} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {marcado.coeficiente && (
                      <span>
                        <span className="pz-coeficiente">●</span> coeficiente
                      </span>
                    )}
                    {marcado.exponente && (
                      <span>
                        <span className="pz-exponente">●</span> exponente
                      </span>
                    )}
                  </p>
                )}

                <div ref={finRef} />
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/** Un paso de la pizarra, con su ambiente y su escena de animación. */
interface ElementoPizarra {
  linea: LineaPizarra;
  papel: PapelDelPaso;
  /** La escena que lo anima, o null si se compone quieto (una nota, el enunciado de la práctica). */
  escena: Escena | null;
  /** Qué escena del guion es: la voz la recorre por este índice. -1 si no está en el guion. */
  indiceGuion: number;
  gesto: string | null;
  columna?: ModoColumna;
  ambiente: 1 | 2;
}

/**
 * "Ejercicio:" y el enunciado, fijos en lo alto de la pizarra.
 *
 * Con sus dos puntos —el cliente: "dice Ejercicio, debe decir Ejercicio:"— y en
 * letra de pizarra; el enunciado, limpio (sin marcas ni piezas por destapar) y
 * más grande. Es el mismo en pantalla y proyectado, porque es la misma pizarra.
 */
function EncabezadoEjercicio({ texto }: { texto: string | null }) {
  const crudo = String(texto ?? "").trim();
  // "Ejercicio 2:  2/6 + 3/6" trae su propio rótulo: se respeta el número.
  const conRotulo = crudo.match(/^\s*(ejercicio[^:]{0,20}):\s*(.+)$/i);
  const rotulo = conRotulo ? `${conRotulo[1].trim().replace(/^e/, "E")}:` : "Ejercicio:";
  const enunciado = (conRotulo ? conRotulo[2] : crudo).trim();
  const html = useMemo(() => {
    if (!enunciado) return null;
    const latex = notacionFormal(enunciado) ?? (pareceMatematica(enunciado) ? planoALatex(enunciado) : null);
    if (!latex) return null;
    try {
      // En estilo de bloque: en línea, KaTeX baja las fracciones a tamaño de
      // subíndice y "1/2 + 1/3" se leía diminuto al lado de "Ejercicio:".
      return katex.renderToString(`\\displaystyle ${latex}`, { displayMode: false, throwOnError: false, strict: false });
    } catch {
      return null;
    }
  }, [enunciado]);
  return (
    <div className="pz-encabezado-ejercicio" data-enunciado={enunciado}>
      <span className="pz-encabezado-rotulo" {...rol(ROL.PIZARRA)}>
        {rotulo}
      </span>
      {enunciado ? (
        html ? (
          <span className="pz-encabezado-formula" {...rol(ROL.FORMULA)} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span className="pz-encabezado-formula" {...rol(ROL.PIZARRA)}>
            {enunciado}
          </span>
        )
      ) : (
        <span className="pz-encabezado-formula text-muted-foreground" {...rol(ROL.PIZARRA)}>
          Preparando el ejercicio…
        </span>
      )}
    </div>
  );
}

/** Indicador de en qué fase de la lección va el alumno. */
function Fases({ fases }: { fases: FaseAbierta[] }) {
  if (fases.length === 0) return null;
  const indiceActual = fases.length - 1;

  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Fases de la lección">
      {fases.map((fase, i) => {
        const completada = i < indiceActual;
        const activa = i === indiceActual;
        return (
          <li key={fase.id}>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activa && "border-primary bg-primary text-primary-foreground",
                completada && "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
                !activa && !completada && "text-muted-foreground",
              )}
              aria-current={activa ? "step" : undefined}
            >
              {completada && <Check className="h-3 w-3" />}
              {fase.titulo}
            </span>
          </li>
        );
      })}
    </ol>
  );
}


/**
 * Tarjeta de UNA regla, compuesta en KaTeX.
 *
 * Se marca si admite práctica calificada. El motor determinista cubre unas
 * reglas y otras no —la del producto o la de la cadena, por ejemplo, quedan
 * fuera—, y conviene enseñarlas igualmente: lo que no se puede es ofrecer una
 * práctica que después no se podría corregir con garantía.
 */
/**
 * ¿El enunciado de la regla es ya una operación DISPUESTA —una cuenta en
 * columna— y no una fórmula general?
 *
 * Cuando lo es, enseña por sí misma el formato y trae su propio resultado:
 * añadirle debajo un ejemplo horizontal no aporta y contradice lo que se está
 * enseñando. Con una fórmula general —"a² - b² = (a - b)(a + b)"— el ejemplo
 * sí hace falta: es donde se ve aplicada.
 */
function esOperacionDispuesta(enunciado: string): boolean {
  return String(enunciado ?? "").includes("\\begin{array}");
}

/**
 * ¿Se sale de su caja lo compuesto?
 *
 * No basta con mirar la caja: KaTeX compone en un bloque con su propio
 * desplazamiento, así que la fórmula se sale DENTRO de él y el contenedor no se
 * entera. Se mira el bloque de KaTeX y el ancho real de lo compuesto.
 */
/** Hasta dónde puede llegar lo compuesto, y hasta dónde llega. */
function medidaDeAjuste(el: HTMLElement): { disponible: number; ancho: number } {
  const ambiente = el.closest("[data-ambiente]") ?? el.parentElement;
  const caja = el.getBoundingClientRect();
  const limite = (ambiente?.getBoundingClientRect().right ?? caja.right) - 4;
  const piezas = [...el.querySelectorAll<HTMLElement>(".katex-html *")];
  const derecha = Math.max(caja.left, ...piezas.map((d) => d.getBoundingClientRect().right));
  return { disponible: Math.max(0, limite - caja.left), ancho: Math.max(0, derecha - caja.left) };
}

/**
 * UNA FÓRMULA DE LA TARJETA QUE CABE SIEMPRE EN SU MITAD DE LA PIZARRA.
 *
 * El catálogo trae reglas largas —"d/dx[x³] = 3x² \qquad d/dx[x⁵] = 5x⁴"— y a
 * tamaño de aula no caben en medio lienzo: se cortaban por la mitad y dejaban un
 * "d/dx" suelto colgando del borde (el cliente lo vio en Derivadas).
 *
 * Primero se parte en renglones por donde una fórmula se puede partir. Si aun
 * así no cabe —"a² − b² = (a − b)(a + b)" no tiene un segundo igual por el que
 * partir—, se encoge lo justo, y nunca por debajo del 80 %: una tarjeta un poco
 * más pequeña se lee; una tarjeta cortada, no.
 */
function FormulaQueCabe({
  latex,
  className,
  proyeccion = false,
}: {
  latex: string;
  className?: string;
  /** Proyectar cambia el tamaño de la letra: hay que volver a medir. */
  proyeccion?: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [filas, setFilas] = useState<string[]>([latex]);
  const [escala, setEscala] = useState(1);
  const estado = useRef({ filas: [latex], escala: 1 });

  // Se intenta ENTERA cada vez que cambia la fórmula o el modo: en pantalla cabe
  // en un renglón y proyectada no, y al revés.
  useEffect(() => {
    estado.current = { filas: [latex], escala: 1 };
    setFilas([latex]);
    setEscala(1);
  }, [latex, proyeccion]);

  const revisar = useCallback(() => {
    const el = caja.current;
    if (!el) return;
    const { disponible, ancho } = medidaDeAjuste(el);
    if (disponible <= 0 || ancho <= disponible) return;

    const siguiente = partirLaMasLarga(estado.current.filas);
    if (siguiente) {
      estado.current = { ...estado.current, filas: siguiente };
      setFilas(siguiente);
      return;
    }
    // Ya no hay por dónde partir: se encoge lo justo para que quepa.
    const propuesta = Math.max(0.8, estado.current.escala * (disponible / ancho));
    if (propuesta < estado.current.escala - 0.01) {
      estado.current = { ...estado.current, escala: propuesta };
      setEscala(propuesta);
    }
  }, []);

  // Tras CADA pintado, y también cuando cargan las fuentes de KaTeX, que es
  // cuando la fórmula toma su ancho de verdad.
  useLayoutEffect(revisar);
  useEffect(() => {
    const fuentes = (document as Document & { fonts?: FontFaceSet }).fonts;
    fuentes?.ready?.then(revisar).catch(() => {});
  }, [revisar, latex, proyeccion]);

  return (
    <div ref={caja} className={className}>
      <div
        style={
          escala < 1
            ? { transform: `scale(${escala})`, transformOrigin: "left center", width: `${100 / escala}%` }
            : undefined
        }
      >
        {filas.map((fila, i) => (
          <Formula key={`${i}-${fila}`} latex={fila} display />
        ))}
      </div>
    </div>
  );
}

function TarjetaRegla({ regla, proyeccion = false }: { regla: ReglaPizarra; proyeccion?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="pz-tarjeta-regla rounded-md border-2 border-primary/40 bg-primary/5 p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 {...rol(ROL.PIZARRA)} className="pz-tarjeta-regla-nombre text-base font-semibold">
          {regla.nombre}
        </h3>
        {!regla.practicable && (
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            sólo referencia
          </span>
        )}
      </div>

      {/* La tarjeta lleva el nombre de la regla y su notación. Nada más: la
          descripción en prosa es lo que el tutor está narrando, y en el lienzo
          era el mismo texto por tercera vez. La pizarra es para la notación; la
          prosa, para la voz. La regla y su ejemplo van al mismo tamaño, en modo
          display y alineados a la izquierda, como el resto de la pizarra. */}
      <FormulaQueCabe latex={regla.enunciado} proyeccion={proyeccion} className="pz-regla-formula overflow-x-auto py-1" />

      {regla.ejemplo && (
        <FormulaQueCabe
          latex={regla.ejemplo}
          proyeccion={proyeccion}
          className="pz-regla-formula mt-2 overflow-x-auto border-t pt-2"
        />
      )}
    </motion.div>
  );
}

// NO se renderiza el catálogo completo en ningún punto de este fichero.
//
// Hubo aquí un componente que recorría todas las reglas del tema y las pintaba
// juntas. Aunque estaba plegado y fuera de la pizarra, seguía siendo un bloque
// con todas las tarjetas a la vez —cociente, cadena, producto— compitiendo con
// lo que el tutor estaba explicando. La regla es simple y no admite matices: la
// pizarra muestra ÚNICAMENTE la tarjeta de la regla activa, elegida por
// `reglaActiva()`. Si en el futuro hace falta una vista de consulta del
// temario, no es este componente ni esta pantalla.

/** Compone una expresión que YA viene en LaTeX (el catálogo se escribe así). */
function Formula({ latex, display = false }: { latex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        errorColor: "hsl(var(--destructive))",
        strict: false,
      });
    } catch {
      return null;
    }
  }, [latex, display]);

  if (!html) return <span {...rol(ROL.FORMULA)}>{latex}</span>;
  return <span {...rol(ROL.FORMULA)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * EL LaTeX DE UNA LÍNEA, POR LA SUBRUTINA DE MARCADO.
 *
 * Es el mismo camino que sigue la pizarra animada, y a propósito: el paso llega
 * con su instrucción de foco —tipo de operación, términos y rótulo— cuando el
 * generador la manda, y se deduce del contenido cuando no. La subrutina pone el
 * recuadro, el color o el tachado sobre el término que toque sin saber de qué
 * tema se trata ni qué números lleva.
 *
 * Devuelve `null` cuando no reconoce nada que marcar: entonces manda el
 * conversor de siempre, que es lo correcto para una línea de prosa.
 *
 * Las marcas de revelado progresivo (`pz-rev-N`) viajan en el LaTeX, pero sólo
 * esconden algo dentro de `.pz-animada`: aquí se ve la línea entera.
 */
function latexDeLaSubrutina(linea: LineaPizarra): string | null {
  const escena = escenaDeLinea(pasoDeLinea(linea), "pizarra");
  return escena.focos.length > 0 ? escena.latex : null;
}

/**
 * Una línea de la pizarra, como PASO: su texto, su instrucción de foco y su
 * locución si el motor las mandó.
 *
 * En un solo sitio a propósito. La pizarra clásica y la animada tienen que
 * entregarle a la subrutina exactamente lo mismo, o volverían a componer la
 * misma línea de dos maneras.
 */
export function pasoDeLinea(
  linea: Pick<LineaPizarra, "texto" | "operacion" | "narracion" | "ambiente">,
): PasoSemantico {
  return {
    latex: linea.texto,
    ...(linea.operacion ? { operacion: linea.operacion } : {}),
    ...(linea.narracion ? { narracion: linea.narracion } : {}),
    ...(linea.ambiente === 2 ? { ambiente: 2 as const } : {}),
  };
}

function LineaRenderizada({
  linea,
  resaltada,
  columna,
  destacarTerminos = false,
  soloEnunciado = false,
  reglas = [],
}: {
  linea: LineaPizarra;
  resaltada: boolean;
  /**
   * La línea es el ENUNCIADO de la tarjeta: se compone tal cual está escrito.
   *
   * Sin esto, la tarjeta se componía con la misma escena que anima el panel de
   * abajo, y esa escena lleva ya dentro lo que la animación destapa al final
   * —aquí, fuera del panel, todo se ve—. El cliente lo fotografió en
   * Ecuaciones: la tarjeta decía "2(x + 4) = 3x − 1 = 2x + 8" mientras abajo el
   * 2 apenas empezaba a repartirse. Un enunciado no enseña su resultado.
   */
  soloEnunciado?: boolean;
  /**
   * Compone la línea como una cuenta en columna. Sólo tiene efecto si la
   * línea es de verdad una suma o una resta de dos naturales.
   */
  columna?: ModoColumna;
  /**
   * Resalta el coeficiente y el exponente. Sólo en el ejemplo paso a paso: es
   * donde el tutor los nombra uno a uno, y es ahí donde el alumno necesita ver
   * cuál de las tres cifras está oyendo.
   */
  destacarTerminos?: boolean;
  /** Si se pasan, se etiqueta qué regla aplica este paso. */
  reglas?: ReglaPizarra[];
}) {
  const regla = useMemo(
    () => (reglas.length ? identificarRegla(linea.texto, reglas) : null),
    [linea.texto, reglas],
  );
  // Una fórmula limpia se compone entera y centrada. Una línea que resulta ser
  // una frase —el motor también escribe rótulos y avisos en la pizarra— se
  // muestra como prosa, pero con SUS fórmulas compuestas igualmente.
  const formulaEntera = useMemo(() => {
    if (linea.clase === "explicacion") return null;

    // El motor rotula algunas fórmulas en castellano ("derivada de x² = 2x").
    // Se reescriben en notación formal; si no encajan en ningún patrón, sólo se
    // componen enteras cuando NO llevan palabras, porque KaTeX tipografiaría
    // cada letra como una variable y el texto saldría pegado y en cursiva.
    // Las sumas y restas se disponen en COLUMNA, como se enseñan en clase: las
    // unidades bajo las unidades y la raya debajo. En horizontal el alumno ve
    // una expresión que aún no sabe leer y se pierde lo que se le está
    // enseñando, que es alinear las cifras por su valor posicional.
    //
    // Y cuando el motor DIBUJA la cuenta con guiones —dos números, una raya y
    // el total, como en papel— se recompone como columna de verdad. Compuesto
    // tal cual, ese dibujo sale como una fila de guiones y cifras sueltas que
    // se lee como una cadena de restas: es lo que reportó el cliente.
    const texto = sinRayasDibujadas(linea.texto);
    const latex =
      // EL CIERRE, ANTES QUE NADA: la línea con la respuesta final se compone
      // con su marco. Detrás del resaltado de coeficientes, "derivada de 3x² =
      // 6x" salía con las cifras en color y sin enmarcar su resultado.
      (linea.operacion?.tipo === "resultado" || linea.operacion?.final ? latexDeLaSubrutina(linea) : null)
      ?? columnaDeCuentaDibujada(linea.texto)
      // Números con su nombre debajo: "24 [sumando] + 17 [sumando] = 41 [suma]".
      // El tutor los nombra sobre los números concretos, y así la pizarra
      // enseña lo mismo en vez del esquema abstracto.
      ?? rotulosALatex(linea.texto)
      ?? (columna
        ? columnaDeLinea(texto, {
            conResultado: columna === "resuelta",
            // El planteamiento de la práctica, con el "?" bajo la raya.
            conIncognita: columna === "planteamiento" && /\?\s*$/.test(linea.texto),
          })
        : null)
      // El coeficiente y el exponente marcados, para que se vea lo que se oye.
      ?? (destacarTerminos ? lineaResaltada(texto) : null)
      // LA MISMA SUBRUTINA QUE ANIMA COMPONE TAMBIÉN LO QUIETO.
      //
      // Aquí se caía a texto plano: el paso "3/5 = (3 * 2)/(5 * 2) = 6/10"
      // salía con sus asteriscos y sus barras, con aspecto de consola, porque
      // el conversor genérico no sabe leer un producto dentro de una fracción.
      // El cliente lo señaló como degradación de la notación, y tenía razón:
      // la misma línea que abajo se compone como fracción con el factor en
      // color, arriba salía en crudo.
      //
      // Se compone con `escenaDeLinea`, que es LA subrutina: recibe el paso
      // —con su instrucción de foco si el generador la manda, y deduciéndola
      // si no— y devuelve el LaTeX ya marcado. La misma para las dos pizarras,
      // para el desarrollo y para lo que responda "Explicar regla", sin una
      // sola rama por tipo de ejercicio.
      //
      // Va ANTES que la notación formal. Detrás, un paso etiquetado como
      // "derivada de x² = 2x" se componía aquí sin marcas —la notación formal
      // lo reconocía primero— mientras abajo salía con el exponente y el
      // coeficiente recuadrados: la misma línea, dos dibujos. La subrutina ya
      // usa la notación formal por dentro, así que la fórmula es la misma; lo
      // que añade son las marcas. Y una línea sin etiqueta que la subrutina no
      // reconoce sigue su camino de siempre.
      ?? (soloEnunciado ? null : latexDeLaSubrutina(linea))
      // "unidades: 3 + 4 = 7" es una NOTA con su rótulo: se pinta abajo, con el
      // rótulo en letra de pizarra y sólo la fórmula en KaTeX.
      ?? (esNotaRotulada(texto) ? null : notacionFormal(texto) ?? (pareceMatematica(texto) ? planoALatex(texto) : null));
    if (!latex) return null;

    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        errorColor: "hsl(var(--destructive))",
        strict: false,
        // `trust` acotado a UN comando. El resaltado necesita `\htmlClass`
        // para que el color viva en la hoja de estilos y siga al tema claro y
        // al oscuro; abriendo la confianza entera, una línea redactada por el
        // modelo podría colar un `\href`. Así no: cualquier otro comando de
        // los que exigen confianza se compone inerte.
        trust: (contexto) => contexto.command === "\\htmlClass",
      });
    } catch {
      return null;
    }
    // La etiqueta cuenta: la misma línea etiquetada como cierre se compone con
    // su marco, y sin etiqueta no.
  }, [linea.texto, linea.clase, linea.operacion, columna, destacarTerminos, soloEnunciado]);

  // Etiqueta de la regla aplicada: hace explícito, paso a paso, en qué se
  // apoya cada movimiento del ejemplo.
  const etiqueta = regla ? (
    <span {...rol(ROL.PIZARRA)} className="pz-insignia-regla mb-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
      {regla.nombre}
    </span>
  ) : null;

  // EL CIERRE DEL EJERCICIO SE DISTINGUE DE UN PASO MÁS. La respuesta ya sale
  // enmarcada en la fórmula (ver `escenaDeCierre`); aquí va además su rótulo de
  // conclusión, con el visto: es lo que el cliente pidió para el último paso,
  // "el resultado final enmarcado con su feedback de conclusión".
  const esCierre = linea.operacion?.tipo === "resultado" && Boolean(formulaEntera);

  if (formulaEntera) {
    return (
      <div className={cn(esCierre && "pz-linea-final")}>
        {etiqueta}
        {esCierre && (
          <span {...rol(ROL.PIZARRA)} className="mb-1 inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="h-3 w-3" />
            Resultado final
          </span>
        )}
        <div
          {...rol(ROL.FORMULA)}
          className={cn(
            "pz-linea-formula overflow-x-auto rounded-md px-1 py-1 transition-colors",
            resaltada && "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50",
          )}
          dangerouslySetInnerHTML={{ __html: formulaEntera }}
        />
      </div>
    );
  }

  // DOS TIPOS DE PROSA, CADA UNA CON SU ROL.
  //
  // Una línea "explicacion" es lo que el tutor DICE (viene de una directiva
  // `hablar`): es voz, TUTOR_DIALOG. Una línea "formula" que no se ha dejado
  // componer como fórmula entera es algo ESCRITO en la pizarra —una nota, un
  // rótulo—: BOARD_LABEL, como NOTA DE PIZARRA (rótulo y cuerpo, sus fórmulas
  // por KaTeX, cada idea en su renglón). Es el mismo componente en pantalla y
  // proyectado: antes aquí era un párrafo y en la proyección una nota, y el
  // cliente vio dos cosas distintas. Una fracción escrita CON PALABRAS
  // ("Fracción: numerador / denominador") sale como fracción, con su raya.
  if (linea.clase === "explicacion") {
    return (
      <div>
        {etiqueta}
        <TextoTutor
          como="p"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm leading-relaxed text-muted-foreground",
            resaltada && "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50",
          )}
          texto={linea.texto}
        />
      </div>
    );
  }
  return (
    <div>
      {etiqueta}
      {/* También aquí sin la raya de guiones: si la cuenta no se ha dejado
          recomponer, la raya sigue sobrando. */}
      <NotaDePizarra
        texto={sinRayasDibujadas(linea.texto)}
        className={cn(
          "rounded-md px-1 py-1 transition-colors",
          resaltada && "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50",
        )}
      />
    </div>
  );
}
