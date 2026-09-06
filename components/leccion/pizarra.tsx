"use client";

import katex from "katex";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";

import { TextoMatematico } from "@/components/math";
import { DiagramaConcepto } from "@/components/leccion/diagrama-concepto";
import {
  columnaDeCuentaDibujada,
  columnaDeLinea,
  columnaDelDesarrollo,
  sinRayasDibujadas,
} from "@/lib/leccion/columna";
import {
  CLASE_COEFICIENTE,
  CLASE_EXPONENTE,
  lineaResaltada,
} from "@/lib/leccion/destacar";
import { pasoIntermedioDerivada } from "@/lib/leccion/desarrollo";
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
   * La línea pertenece a una ACLARACIÓN pedida por el alumno, no al hilo de la
   * lección. Se agrupa aparte y se sustituye en la siguiente aclaración, para
   * que pedir ayuda tres veces no deje tres muros de texto en la pizarra.
   */
  aclaracion?: boolean;
}

/**
 * Lo que se compone en la pizarra en un momento dado.
 *
 * El tipo va declarado a mano, y no inferido: con las tres ramas del cálculo
 * devolviendo formas distintas, TypeScript construía una unión que hacía
 * explotar la comprobación de tipos durante la compilación.
 */
/**
 * Cómo se compone una línea de aritmética.
 *
 * "planteamiento" es la operación en columna con la raya y sin el total: lo que
 * el alumno tiene delante cuando le toca resolverla. "resuelta" añade las
 * llevadas y el resultado.
 */
type ModoColumna = "planteamiento" | "resuelta";

/** Un paso del desarrollo, con la forma en que hay que componerlo. */
interface PasoCompuesto {
  linea: LineaPizarra;
  columna?: ModoColumna;
}

interface ContenidoPizarra {
  /** Pasos del procedimiento, debajo del enunciado. */
  pasos: PasoCompuesto[];
  /** Paso suelto de las fases que no plantean ejercicio. */
  pasoSuelto: LineaPizarra | null;
}

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
  ocultarDesarrollo = false,
  className,
}: {
  /** Fases ya abiertas: la tira de progreso y la vista en curso. */
  fases: FaseAbierta[];
  /**
   * Ejercicio activo. Llega ya resuelto desde el aula, que lo fija al entrar
   * en la fase, así que la tarjeta de arriba se compone en el milisegundo 0
   * sin esperar a que haya un solo paso calculado.
   */
  ejercicio: LineaPizarra | null;
  /**
   * Pasos del procedimiento. Vacío mientras el alumno no pida ayuda ni
   * resolución; el aula lo SUSTITUYE entero en cada petición.
   */
  desarrollo: LineaPizarra[];
  /**
   * De qué fase es ese contenido.
   *
   * Durante la transición, la vista saliente y la entrante conviven. Sin saber
   * a quién pertenece cada cosa, el contenido de una podía pintarse un instante
   * bajo el rótulo de la otra: eso es el parpadeo que se veía, un recuadro que
   * asoma un milisegundo y desaparece de golpe. Aquí sólo se compone el
   * contenido de la fase que se está pintando.
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
   * Oculta el desarrollo mientras la pizarra animada lo va contando.
   *
   * Lo pidió el cliente y tiene toda la razón: con la cuenta resuelta a la
   * vista —el 412 y sus llevadas— el paso a paso de abajo no explica nada. No
   * basta con filtrar las líneas del desarrollo, porque la cuenta de esta
   * tarjeta se COMPONE a partir de los pasos narrados ("unidades: 4 + 8 = 12"),
   * no de una línea con el resultado. Por eso el aula lo dice explícitamente.
   */
  ocultarDesarrollo?: boolean;
  className?: string;
}) {
  const actual = fases[fases.length - 1] ?? null;
  const finRef = useRef<HTMLDivElement>(null);

  // El contenido sólo se compone bajo SU fase. Lo que venga marcado con otra
  // no se pinta: es lo que dejaba recuadros residuales al cambiar de fase.
  const propio = actual != null && faseDelContenido === actual.id;
  const ejercicio = propio ? ejercicioRecibido : null;
  const desarrollo = useMemo(
    () => (propio && !ocultarDesarrollo ? desarrolloRecibido : SIN_DESARROLLO),
    [propio, ocultarDesarrollo, desarrolloRecibido],
  );

  // La regla que el tutor está explicando ahora mismo, deducida de las líneas
  // ya reveladas. Cambia al ritmo del diálogo, no de golpe al entrar en la fase.
  /**
   * Regla que se compone en la fase de Reglas.
   *
   * Se elige, en este orden: la que el aula ha detectado como activa (mira todo
   * lo narrado), la que se deduzca de lo escrito en la pizarra, y si ninguna de
   * las dos da resultado, la PRIMERA del tema.
   *
   * Ese último recurso no es un adorno. En aritmética y en ecuaciones lineales
   * el motor no escribe nada en la pizarra durante esta fase —sólo narra—, así
   * que al dejar de volcar la locución al lienzo la fase se quedaba
   * COMPLETAMENTE en blanco. Una fase de "Reglas y propiedades" sin ninguna
   * regla a la vista no es aceptable, y el catálogo siempre tiene una.
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
   * Qué partes se han marcado de verdad en el ejercicio.
   *
   * La leyenda no depende del tema sino de lo que hay marcado. En aritmética no
   * se marca nada —una suma en columna no tiene coeficiente ni exponente— así
   * que no se compone leyenda: la leyó el alumno bajo "24 + 17" y no
   * significaba nada. Y en "x²" sólo se marca el exponente, así que sólo se
   * nombra el exponente.
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

  /**
   * La cuenta de aritmética que se está explicando, si la hay.
   *
   * Manda sobre el enunciado de la tarjeta: al pedir ayuda, el tutor puede
   * pasar a otra operación, y componer la de la tarjeta mientras la voz narra
   * otra deja al alumno viendo una cosa y oyendo otra. La tarjeta y la cuenta
   * resuelta salen de AQUÍ las dos, así que no pueden discrepar.
   */
  const cuenta = useMemo(
    () =>
      ejercicio
        ? columnaDelDesarrollo(desarrollo.map((l) => l.texto), ejercicio.texto)
        : null,
    [ejercicio, desarrollo],
  );

  /** ¿La fase en curso plantea un ejercicio al alumno? */
  const planteaEjercicio =
    actual != null && (esFaseDeEjemplo(actual.id) || esFaseDePractica(actual.id));

  /**
   * ENUNCIADO FIJO ARRIBA + DESARROLLO DEBAJO.
   *
   * El enunciado llega en su propia prop y se compone tal cual: no se deduce de
   * los pasos ni espera a que haya ninguno. Aquí sólo se decide cómo
   * presentar el desarrollo, que en las fases sin ejercicio se reduce al último
   * paso escrito.
   */
  const { pasos, pasoSuelto } = useMemo((): ContenidoPizarra => {
    if (!actual) return { pasos: [], pasoSuelto: null };

    // Concepto y Reglas no plantean ejercicio: se compone el paso actual.
    if (!planteaEjercicio) {
      return {
        pasos: [],
        pasoSuelto: desarrollo.length > 0 ? desarrollo[desarrollo.length - 1] : null,
      };
    }

    // ARITMÉTICA: el desarrollo es UNA sola cuenta en columna, y nada más.
    //
    // El motor la escribe por partes mientras la explica —"27 + 38 =", "¹19",
    // "+45", una cifra suelta— y cada parte abría su propia tarjeta: cinco
    // apiladas, con barra de desplazamiento y sin rastro de la alineación. Da
    // igual con qué trozos llegue: se compone la cuenta entera, calculada aquí,
    // y los trozos no se pintan. Lo que el tutor va diciendo sigue oyéndose.
    if (ejercicio && cuenta) {
      return {
        pasos: [
          { linea: { ...ejercicio, id: -ejercicio.id - 2, texto: cuenta.texto }, columna: "resuelta" },
        ],
        pasoSuelto: null,
      };
    }

    const pasos: PasoCompuesto[] = desarrollo.map((linea) => ({ linea }));

    // Paso intermedio de la derivada, donde se ve APLICADA la regla. Sólo en el
    // EJEMPLO: en la práctica revelaría la respuesta que el alumno tiene que
    // hallar, que es justo lo que la ramificación pedagógica evita.
    if (ejercicio && esFaseDeEjemplo(actual.id) && desarrollo.length > 0) {
      const intermedio = pasoIntermedioDerivada(ejercicio.texto);
      if (intermedio) {
        return {
          pasos: [{ linea: { id: -ejercicio.id - 1, texto: intermedio, clase: "formula" } }, ...pasos],
          pasoSuelto: null,
        };
      }
    }

    return { pasos, pasoSuelto: null };
  }, [actual, planteaEjercicio, ejercicio, desarrollo, cuenta]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [desarrollo.length, ejercicio?.id, actual?.id]);

  return (
    <div className={cn("space-y-3", className)}>
      <Fases fases={fases} />

      {/* ALTURA FIJA, no mínima. Con una altura que crecía según el contenido,
          la pizarra cambiaba de tamaño en cada paso y los botones de abajo
          saltaban arriba y abajo mientras el alumno leía. El desbordamiento se
          resuelve dentro, con scroll propio. */}
      <div
        className="relative h-[24rem] overflow-hidden rounded-lg border bg-card shadow-inner sm:h-[30rem]"
        aria-live="polite"
        aria-label="Pizarra"
      >
        {!actual ? (
          <p className="p-5 text-sm text-muted-foreground">
            La pizarra está en blanco. Elige un tema y pulsa <em>Reproducir</em>.
          </p>
        ) : (
          <AnimatePresence mode="wait">
            {/* La clave es la escena: al cambiar de fase, la vista entera se
                sustituye con una transición limpia. */}
            <motion.div
              key={actual.id}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="flex h-full flex-col"
            >
              <div className="shrink-0 border-b bg-muted/40 px-5 py-2.5">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
                  {actual.titulo}
                </h2>
              </div>

              {/* El scroll vive aquí dentro: la caja de fuera nunca cambia de
                  tamaño, así que nada de lo que hay debajo se mueve. */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                {/* En la fase de Reglas se compone ÚNICAMENTE la tarjeta de la
                    regla que el tutor está explicando en este momento. Mostrar
                    el catálogo entero desincronizaba la pizarra del audio. */}
                {esFaseDeReglas(actual.id) && reglaEnCurso && (
                  <TarjetaRegla key={reglaEnCurso.clave} regla={reglaEnCurso} />
                )}

                {/* En la fase de Concepto, un diagrama que enseñe la idea: la
                    tangente de una curva, las partes de un todo, la balanza. */}
                {esFaseDeConcepto(actual.id) && tema && <DiagramaConcepto tema={tema} />}

                {/* Fases con ejercicio: el enunciado anclado arriba y su
                    desarrollo debajo, para que el alumno pueda contrastar el
                    planteamiento con el procedimiento.

                    La tarjeta de ARRIBA no depende de que haya desarrollo: se
                    pinta en cuanto se entra en la fase, con el enunciado que se
                    adelantó al recibir la lección. La de ABAJO sólo aparece
                    cuando hay pasos que mostrar. Atar la primera a la segunda
                    dejaba la pizarra en blanco durante toda la locución. */}
                {(ejercicio || planteaEjercicio) && (
                  <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Ejercicio
                    </p>
                    {ejercicio ? (
                      <LineaRenderizada
                        linea={cuenta ? { ...ejercicio, texto: cuenta.texto } : ejercicio}
                        columna="planteamiento"
                        destacarTerminos={esFaseDeEjemplo(actual.id)}
                        resaltada={resaltado != null && ejercicio.texto.includes(resaltado)}
                        reglas={[]}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Preparando el ejercicio…</p>
                    )}
                  </div>
                )}

                {/* Qué significa cada color. Sin la leyenda, el resaltado es
                    decoración; con ella, el alumno ata lo que oye —"el
                    coeficiente 5, el exponente 2"— a lo que ve marcado. */}
                {(marcado.coeficiente || marcado.exponente) && (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
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

                {pasos.length > 0 && (
                  <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Desarrollo
                    </p>
                    <AnimatePresence initial={false}>
                      {pasos.map(({ linea, columna }) => (
                        <motion.div
                          key={linea.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22 }}
                        >
                          <LineaRenderizada
                            linea={linea}
                            columna={columna}
                            destacarTerminos={esFaseDeEjemplo(actual.id)}
                            resaltada={resaltado != null && linea.texto.includes(resaltado)}
                            reglas={esFaseDeEjemplo(actual.id) ? reglas : []}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Concepto y Reglas: no hay ejercicio, se compone el paso en curso.

                    Sin AnimatePresence: una salida anidada dentro de un
                    contenedor que a su vez está saliendo encadena dos
                    desmontajes, y el de dentro se ve como un recuadro que
                    asoma y desaparece. La línea nueva entra con su fundido y
                    la anterior se va con la fase, de una pieza. */}
                {pasoSuelto && (
                    <motion.div
                      key={pasoSuelto.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <LineaRenderizada
                        linea={pasoSuelto}
                        resaltada={resaltado != null && pasoSuelto.texto.includes(resaltado)}
                        reglas={[]}
                      />
                    </motion.div>
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

function TarjetaRegla({ regla }: { regla: ReglaPizarra }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="rounded-md border-2 border-primary/40 bg-primary/5 p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{regla.nombre}</h3>
        {!regla.practicable && (
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            sólo referencia
          </span>
        )}
      </div>

      {/* La tarjeta lleva el nombre de la regla y su notación. Nada más.
          La descripción en prosa NO se compone: es palabra por palabra lo que
          el tutor está narrando y lo que se lee en el subtítulo, así que en el
          lienzo era el mismo texto por tercera vez. La pizarra es para la
          notación; la prosa, para la voz. */}
      <div className="overflow-x-auto py-1">
        <Formula latex={regla.enunciado} display />
      </div>

      {/* Y el ejemplo sólo cuando el enunciado NO es ya una operación resuelta.
          En "Suma con llevada" el enunciado es la propia cuenta en columna, con
          su llevada y su total: debajo quedaba un "19 + 45 = 64" horizontal que
          no añade nada y desdice el formato que se está enseñando. */}
      {regla.ejemplo && !esOperacionDispuesta(regla.enunciado) && (
        <div className="mt-2 overflow-x-auto border-t pt-2">
          <Formula latex={regla.ejemplo} />
        </div>
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

  if (!html) return <span className="font-mono text-sm">{latex}</span>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function LineaRenderizada({
  linea,
  resaltada,
  columna,
  destacarTerminos = false,
  reglas = [],
}: {
  linea: LineaPizarra;
  resaltada: boolean;
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
      columnaDeCuentaDibujada(linea.texto)
      // Números con su nombre debajo: "24 [sumando] + 17 [sumando] = 41 [suma]".
      // El tutor los nombra sobre los números concretos, y así la pizarra
      // enseña lo mismo en vez del esquema abstracto.
      ?? rotulosALatex(linea.texto)
      ?? (columna ? columnaDeLinea(texto, { conResultado: columna === "resuelta" }) : null)
      // El coeficiente y el exponente marcados, para que se vea lo que se oye.
      ?? (destacarTerminos ? lineaResaltada(texto) : null)
      ?? notacionFormal(texto)
      ?? (pareceMatematica(texto) ? planoALatex(texto) : null);
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
  }, [linea.texto, linea.clase, columna, destacarTerminos]);

  // Etiqueta de la regla aplicada: hace explícito, paso a paso, en qué se
  // apoya cada movimiento del ejemplo.
  const etiqueta = regla ? (
    <span className="mb-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
      {regla.nombre}
    </span>
  ) : null;

  if (formulaEntera) {
    return (
      <div>
        {etiqueta}
        <div
          className={cn(
            "overflow-x-auto rounded-md px-3 py-2 transition-colors",
            resaltada
              ? "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50"
              : "bg-muted/40",
          )}
          dangerouslySetInnerHTML={{ __html: formulaEntera }}
        />
      </div>
    );
  }

  return (
    <div>
      {etiqueta}
      <p
        className={cn(
          "rounded-md px-3 py-1.5 leading-relaxed transition-colors",
          linea.clase === "explicacion"
            ? "text-sm text-muted-foreground"
            : "text-base font-medium",
          resaltada && "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50",
        )}
      >
        {/* También aquí sin la raya de guiones: si la cuenta no se ha dejado
            recomponer, la raya sigue sobrando. Como prosa se lee igual de mal
            que como fórmula. */}
        <TextoMatematico texto={sinRayasDibujadas(linea.texto)} />
      </p>
    </div>
  );
}
