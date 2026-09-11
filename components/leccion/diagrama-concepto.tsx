"use client";

import {
  GEOMETRIAS,
  geometriaDeFraccion,
  tieneDiagrama,
  type EtiquetaDiagrama,
  type GeometriaDiagrama,
  type TonoEtiqueta,
} from "@/lib/leccion/diagramas";
import { cn } from "@/lib/utils";

/**
 * Diagramas de la fase de Concepto (Módulo 7).
 *
 * La idea de una derivada es geométrica —la pendiente de la recta tangente en
 * un punto— y contarla sólo con palabras deja fuera lo que mejor la explica.
 * Aquí se dibuja: la curva, el punto y su tangente.
 *
 * Son SVG estáticos y deterministas: nada que generar, nada que pueda salir
 * mal en tiempo de ejecución. Cada tema tiene el suyo cuando aporta algo; si no
 * hay diagrama para un tema, no se dibuja nada y la fase sigue funcionando.
 *
 * Las posiciones de los textos NO se escriben aquí: vienen de
 * `lib/leccion/diagramas.ts`, donde la suite puede comprobar que cada etiqueta
 * cabe dentro del lienzo. Un texto que se sale no rompe nada —el navegador
 * simplemente lo recorta— así que sin esa comprobación el fallo sólo se ve
 * mirando el dibujo.
 */

/** Lo que hace falta para dibujar una fracción concreta y rotularla. */
export interface PropiedadesFraccion {
  numerador?: number;
  denominador?: number;
  etiquetaNumerador?: string;
  etiquetaDenominador?: string;
  /**
   * ¿Ya se ha dicho la palabra "numerador" / "denominador"?
   *
   * El cliente lo pidió con estas palabras: la etiqueta no puede estar puesta
   * desde el primer instante, tiene que aparecer "en sincronía exacta cuando
   * la locución menciona" cada término. `Pizarra` lleva la cuenta —mirando lo
   * que ya se ha escrito en esta fase— y aquí sólo se obedece: sin el aviso, el
   * dibujo se queda con la porción coloreada pero sin la flecha ni el rótulo
   * que dicen qué es. Por defecto los dos están vistos, que es como se
   * comportaba el diagrama antes de este pedido y cómo se sigue comportando en
   * la redacción que no usa estas dos palabras.
   */
  vistoNumerador?: boolean;
  vistoDenominador?: boolean;
}

const CLASES_TONO: Record<TonoEtiqueta, string> = {
  acento: "fill-amber-600",
  tenue: "fill-muted-foreground",
  normal: "fill-foreground",
};

/** Pinta las etiquetas de un diagrama con la geometría ya validada. */
function Etiquetas({
  geometria,
  mostrar,
}: {
  geometria: GeometriaDiagrama;
  /**
   * Qué etiquetas dejar ver, para el diagrama de fracciones.
   *
   * `geometriaDeFraccion` siempre entrega sus etiquetas EN ESTE ORDEN: la del
   * numerador, la del denominador y —sólo si hay una tercera— la síntesis
   * final ("2 de 6 partes iguales"), que necesita las dos palabras dichas para
   * tener sentido. Es una convención local a esta llamada, no un contrato del
   * tipo `GeometriaDiagrama`: los otros tres diagramas no pasan `mostrar` y
   * siguen viendo sus etiquetas todas de una vez, como siempre.
   */
  mostrar?: { numerador: boolean; denominador: boolean };
}) {
  return (
    <>
      {geometria.etiquetas.map((e: EtiquetaDiagrama, i: number) => {
        if (mostrar) {
          if (i === 0 && !mostrar.numerador) return null;
          if (i === 1 && !mostrar.denominador) return null;
          if (i === 2 && !(mostrar.numerador && mostrar.denominador)) return null;
        }
        return (
          <text
            key={e.texto}
            x={e.x}
            y={e.y}
            textAnchor={e.anclaje}
            fontSize={e.tamano}
            className={cn(CLASES_TONO[e.tono], mostrar && "pz-porcion")}
          >
            {e.texto}
          </text>
        );
      })}
    </>
  );
}

/** Parábola y = x², su punto en x = 1 y la tangente allí (pendiente 2). */
function CurvaYTangente() {
  const g = GEOMETRIAS.DERIVADAS;

  // Coordenadas del lienzo: x de 0 a 240, y de 0 a 155 (crece hacia abajo).
  // La parábola se dibuja punto a punto para que la curva sea la real y no una
  // aproximación a ojo con curvas de Bézier.
  const aX = (x: number) => 120 + x * 50;
  const aY = (y: number) => 130 - y * 28;

  const puntos: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = -2 + (i * 4) / 40; // de -2 a 2
    puntos.push(`${aX(x)},${aY(x * x)}`);
  }

  // La tangente y = 2x - 1 se dibuja desde su corte con el eje (x = 0.5) hasta
  // x = 2: empezando antes se salía por debajo del lienzo y quedaba cortada.
  const recta = (x: number) => 2 * x - 1;

  return (
    <svg
      viewBox={`0 0 ${g.ancho} ${g.alto}`}
      className="pz-diagrama h-auto w-full max-w-sm"
      role="img"
      aria-label="La parábola y = x al cuadrado con su recta tangente en el punto x = 1: la pendiente de esa recta, que vale 2, es la derivada en ese punto."
    >
      {/* Ejes */}
      <line x1="20" y1="130" x2="230" y2="130" className="stroke-muted-foreground/40" strokeWidth="1" />
      <line x1="120" y1="10" x2="120" y2="140" className="stroke-muted-foreground/40" strokeWidth="1" />

      {/* La curva */}
      <polyline
        points={puntos.join(" ")}
        fill="none"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* La tangente: es la recta cuya pendiente ES la derivada en ese punto */}
      <line
        x1={aX(0.5)}
        y1={aY(recta(0.5))}
        x2={aX(2)}
        y2={aY(recta(2))}
        className="stroke-amber-500"
        strokeWidth="2"
        strokeDasharray="5 3"
      />

      {/* El punto de tangencia, y su abscisa marcada hasta el eje: la pendiente
          vale 2 AHÍ, no en toda la curva, y sin señalar dónde el número parece
          arbitrario. */}
      <line
        x1={aX(1)}
        y1={aY(1)}
        x2={aX(1)}
        y2={aY(0)}
        className="stroke-amber-500/50"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <circle cx={aX(1)} cy={aY(1)} r="4" className="fill-amber-500" />

      <Etiquetas geometria={g} />
    </svg>
  );
}

/**
 * Dos grupos de fichas que se juntan: la idea de suma.
 *
 * Aritmética no tenía dibujo y su fase de Concepto se quedaba con una línea de
 * texto en medio del lienzo. Se cuentan fichas, que es como se entiende sumar
 * antes de aprender a colocar las cifras en columna.
 */
function JuntarCantidades() {
  const g = GEOMETRIAS.ARITMETICA;
  /** Un grupo de fichas sin juntar: gris, porque el total aún no está hecho. */
  const grupo = (inicio: number, cuantas: number) =>
    Array.from({ length: cuantas }, (_, i) => (
      <circle
        key={`${inicio}-${i}`}
        cx={inicio + i * 24}
        cy={52}
        r="9"
        className="fill-muted stroke-muted-foreground/50"
        strokeWidth="1.5"
      />
    ));

  return (
    <svg
      viewBox={`0 0 ${g.ancho} ${g.alto}`}
      className="pz-diagrama h-auto w-full max-w-sm"
      role="img"
      aria-label="Tres fichas y dos fichas se juntan para formar cinco."
    >
      {grupo(24, 3)}
      {grupo(120, 2)}

      {/* La flecha del "da como resultado". */}
      <line x1="160" y1="52" x2="180" y2="52" className="stroke-muted-foreground" strokeWidth="1.5" />
      <polygon points="188,52 178,47 178,57" className="fill-muted-foreground" />

      {/* El total, ya juntas y en el color del tema. */}
      {Array.from({ length: 5 }, (_, i) => (
        <circle
          key={`t-${i}`}
          cx={196 + (i % 3) * 14}
          cy={i < 3 ? 44 : 62}
          r="6"
          className="fill-primary/60 stroke-primary"
          strokeWidth="1.2"
        />
      ))}

      <Etiquetas geometria={g} />
    </svg>
  );
}

/** Un punto sobre una circunferencia de centro (cx, cy) y radio r, en grados. */
function puntoEnCirculo(cx: number, cy: number, r: number, grados: number): [number, number] {
  const rad = (grados * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/**
 * Un todo dividido en partes iguales: la idea de fracción.
 *
 * El dibujo se construye con la fracción de la que se está hablando, así que
 * si la lección explicaba 2/6, el alumno oye 2/6 y ve 2/6.
 *
 * SE DIBUJA COMO UNA PIZZA, no como una barra.
 *
 * Era un rectángulo partido en celdas, y el cliente lo señaló con precisión:
 * mientras la locución dice "partes una pizza en 4 porciones iguales", el
 * dibujo no tenía nada de pizza. La metáfora que se cuenta y la que se ve
 * tienen que ser la misma. Un círculo cortado en porciones es además más
 * fácil de leer con muchas partes —doce gajos de tarta se distinguen mejor que
 * doce celdas estrechas en fila— y cada porción entra con su propio pequeño
 * "corte", una detrás de otra, así que el dibujo no se queda plano y estático
 * desde el primer fotograma.
 */
function PartesDeUnTodo({
  numerador = 1,
  denominador = 4,
  etiquetaNumerador,
  etiquetaDenominador,
  vistoNumerador = true,
  vistoDenominador = true,
}: PropiedadesFraccion) {
  const g = geometriaDeFraccion(numerador, denominador, {
    numerador: etiquetaNumerador,
    denominador: etiquetaDenominador,
  });
  const f = g.fraccion!;

  // La geometría del círculo. Cabe siempre en el mismo lienzo (240×132) sea
  // cual sea el denominador: lo que cambia es en cuántos gajos se corta, no el
  // tamaño de la pizza. El radio deja sitio de sobra entre el borde de abajo
  // de la pizza y el rótulo del denominador —que vive en `geometriaDeFraccion`,
  // a y=104— para el arco y su flecha: con un radio mayor la punta de la
  // flecha llegaba a tocar la letra del rótulo.
  const cx = 120;
  const cy = 50;
  const r = 24;
  const porGajo = 360 / f.partes;

  // El arco de un gajo, de `desde` a `hasta` grados, empezando arriba (-90°) y
  // girando en el sentido de las agujas del reloj —como se reparte una pizza
  // de verdad—. Con un solo gajo (f.partes === 1) el arco completo no se puede
  // describir con un solo comando "A" (los dos extremos coinciden), así que
  // ese caso se dibuja como una circunferencia entera aparte.
  const gajo = (indice: number): string => {
    const desde = -90 + indice * porGajo;
    const hasta = desde + porGajo;
    const [x1, y1] = puntoEnCirculo(cx, cy, r, desde);
    const [x2, y2] = puntoEnCirculo(cx, cy, r, hasta);
    const arcoLargo = porGajo > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${arcoLargo} 1 ${x2} ${y2} Z`;
  };

  // Dónde señala la flecha del numerador: al centro visual del primer gajo
  // tomado —el primero de todos si no se ha tomado ninguno—, que por cómo se
  // numeran los gajos es siempre el que empieza arriba o cerca de arriba, así
  // que la flecha vertical desde el rótulo de encima siempre tiene sentido.
  const [flechaX, flechaY] = puntoEnCirculo(cx, cy, r * 0.62, -90 + porGajo / 2);

  return (
    <svg
      viewBox={`0 0 ${g.ancho} ${g.alto}`}
      className="pz-diagrama h-auto w-full max-w-sm"
      role="img"
      aria-label={`Una pizza dividida en ${f.partes} porciones iguales, con ${f.tomadas} sombreada${f.tomadas === 1 ? "" : "s"}.`}
    >
      {f.partes === 1 ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          className={f.tomadas >= 1 ? "pz-porcion fill-primary/60 stroke-primary" : "pz-porcion fill-muted stroke-muted-foreground/40"}
          strokeWidth="1.5"
        />
      ) : (
        Array.from({ length: f.partes }, (_, i) => (
          <path
            key={`${f.partes}-${f.tomadas}-${i}`}
            d={gajo(i)}
            className={
              i < f.tomadas
                ? "pz-porcion fill-primary/60 stroke-primary"
                : "pz-porcion fill-muted stroke-muted-foreground/40"
            }
            strokeWidth="1.5"
            strokeLinejoin="round"
            style={{ animationDelay: `${i * 55}ms` }}
          />
        ))
      )}

      {/* La flecha que ata la palabra "numerador" a la porción sombreada. Sin
          ella, el alumno oye el nombre y ve una pizza cortada, pero nada le
          dice cuál gajo es cuál. Sólo se dibuja una vez dicha la palabra. */}
      {vistoNumerador && (
        <g className="pz-porcion">
          <line
            x1={flechaX}
            y1="15"
            x2={flechaX}
            y2={flechaY - 8}
            className="stroke-primary"
            strokeWidth="1.5"
          />
          <polygon
            points={`${flechaX},${flechaY - 2} ${flechaX - 4},${flechaY - 10} ${flechaX + 4},${flechaY - 10}`}
            className="fill-primary"
          />
        </g>
      )}

      {/* Y el arco que abarca la pizza entera: eso es el denominador —todas
          las porciones en las que se ha dividido el todo—, y tampoco se
          dibuja hasta que se ha nombrado. */}
      {vistoDenominador && (
        <g className="pz-porcion">
          <path
            d={`M ${cx - r * 0.92} ${cy + r + 3} Q ${cx} ${cy + r + 15} ${cx + r * 0.92} ${cy + r + 3}`}
            className="stroke-primary"
            strokeWidth="1.5"
            fill="none"
          />
          <polygon
            points={`${cx},${cy + r + 18} ${cx - 4},${cy + r + 10} ${cx + 4},${cy + r + 10}`}
            className="fill-primary"
          />
        </g>
      )}

      <Etiquetas geometria={g} mostrar={{ numerador: vistoNumerador, denominador: vistoDenominador }} />
    </svg>
  );
}

/** Una balanza en equilibrio: la idea de ecuación. */
function BalanzaEnEquilibrio() {
  const g = GEOMETRIAS.ECUACIONES_LINEALES;
  return (
    <svg
      viewBox={`0 0 ${g.ancho} ${g.alto}`}
      className="pz-diagrama h-auto w-full max-w-sm"
      role="img"
      aria-label="Una balanza equilibrada: lo que se hace a un lado hay que hacerlo al otro."
    >
      {/* Soporte */}
      <line x1="120" y1="30" x2="120" y2="90" className="stroke-muted-foreground" strokeWidth="2.5" />
      <line x1="95" y1="90" x2="145" y2="90" className="stroke-muted-foreground" strokeWidth="2.5" />
      {/* Brazo */}
      <line x1="40" y1="30" x2="200" y2="30" className="stroke-muted-foreground" strokeWidth="2.5" />
      {/* Platillos */}
      <rect x="20" y="32" width="40" height="22" rx="3" className="fill-primary/50 stroke-primary" strokeWidth="1.5" />
      <rect x="180" y="32" width="40" height="22" rx="3" className="fill-primary/50 stroke-primary" strokeWidth="1.5" />

      <Etiquetas geometria={g} />
    </svg>
  );
}

const DIAGRAMAS: Record<string, (props: PropiedadesFraccion) => React.ReactElement> = {
  ARITMETICA: JuntarCantidades,
  DERIVADAS: CurvaYTangente,
  FRACCIONES: PartesDeUnTodo,
  ECUACIONES_LINEALES: BalanzaEnEquilibrio,
};

/**
 * Diagrama del tema, o nada si ese tema no tiene uno.
 *
 * Las propiedades de la fracción son opcionales: el de fracciones las usa para
 * dibujar exactamente la que se está explicando, y los demás las ignoran.
 */
export function DiagramaConcepto({
  tema,
  numerador,
  denominador,
  etiquetaNumerador,
  etiquetaDenominador,
  vistoNumerador,
  vistoDenominador,
}: { tema: string } & PropiedadesFraccion) {
  // La lista de temas con diagrama vive en lib/leccion/diagramas.ts, que es la
  // que consulta también la suite; aquí sólo se resuelve el componente.
  if (!tieneDiagrama(tema)) return null;
  const Diagrama = DIAGRAMAS[tema];
  if (!Diagrama) return null;
  return (
    <div className="flex justify-center rounded-md border bg-muted/20 p-3">
      <Diagrama
        numerador={numerador}
        denominador={denominador}
        etiquetaNumerador={etiquetaNumerador}
        etiquetaDenominador={etiquetaDenominador}
        vistoNumerador={vistoNumerador}
        vistoDenominador={vistoDenominador}
      />
    </div>
  );
}
