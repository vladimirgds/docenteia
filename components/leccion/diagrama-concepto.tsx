"use client";

import {
  GEOMETRIAS,
  tieneDiagrama,
  type EtiquetaDiagrama,
  type GeometriaDiagrama,
  type TonoEtiqueta,
} from "@/lib/leccion/diagramas";

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

const CLASES_TONO: Record<TonoEtiqueta, string> = {
  acento: "fill-amber-600",
  tenue: "fill-muted-foreground",
  normal: "fill-foreground",
};

/** Pinta las etiquetas de un diagrama con la geometría ya validada. */
function Etiquetas({ geometria }: { geometria: GeometriaDiagrama }) {
  return (
    <>
      {geometria.etiquetas.map((e: EtiquetaDiagrama) => (
        <text
          key={e.texto}
          x={e.x}
          y={e.y}
          textAnchor={e.anclaje}
          fontSize={e.tamano}
          className={CLASES_TONO[e.tono]}
        >
          {e.texto}
        </text>
      ))}
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
      className="h-auto w-full max-w-sm"
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
      className="h-auto w-full max-w-sm"
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

/** Un todo dividido en partes iguales: la idea de fracción. */
function PartesDeUnTodo() {
  const g = GEOMETRIAS.FRACCIONES;
  const partes = [0, 1, 2, 3];
  return (
    <svg
      viewBox={`0 0 ${g.ancho} ${g.alto}`}
      className="h-auto w-full max-w-sm"
      role="img"
      aria-label="Un rectángulo dividido en cuatro partes iguales, con una sombreada: una de cuatro."
    >
      {partes.map((i) => (
        <rect
          key={i}
          x={20 + i * 50}
          y="20"
          width="50"
          height="50"
          className={i === 0 ? "fill-primary/60 stroke-primary" : "fill-muted stroke-muted-foreground/40"}
          strokeWidth="1.5"
        />
      ))}

      {/* La flecha que ata la palabra "numerador" a la parte sombreada. Sin
          ella, el alumno oye los dos nombres y ve un rectángulo partido, pero
          nada le dice cuál es cuál. */}
      <line x1="45" y1="15" x2="45" y2="30" className="stroke-primary" strokeWidth="1.5" />
      <polygon points="45,36 41,28 49,28" className="fill-primary" />

      {/* Y la llave que abarca las cuatro partes: eso es el denominador. */}
      <path
        d="M 20 80 L 20 86 L 220 86 L 220 80"
        className="stroke-primary"
        strokeWidth="1.5"
        fill="none"
      />
      <polygon points="120,94 116,86 124,86" className="fill-primary" />

      <Etiquetas geometria={g} />
    </svg>
  );
}

/** Una balanza en equilibrio: la idea de ecuación. */
function BalanzaEnEquilibrio() {
  const g = GEOMETRIAS.ECUACIONES_LINEALES;
  return (
    <svg
      viewBox={`0 0 ${g.ancho} ${g.alto}`}
      className="h-auto w-full max-w-sm"
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

const DIAGRAMAS: Record<string, () => React.ReactElement> = {
  ARITMETICA: JuntarCantidades,
  DERIVADAS: CurvaYTangente,
  FRACCIONES: PartesDeUnTodo,
  ECUACIONES_LINEALES: BalanzaEnEquilibrio,
};

/** Diagrama del tema, o nada si ese tema no tiene uno. */
export function DiagramaConcepto({ tema }: { tema: string }) {
  // La lista de temas con diagrama vive en lib/leccion/diagramas.ts, que es la
  // que consulta también la suite; aquí sólo se resuelve el componente.
  if (!tieneDiagrama(tema)) return null;
  const Diagrama = DIAGRAMAS[tema];
  if (!Diagrama) return null;
  return (
    <div className="flex justify-center rounded-md border bg-muted/20 p-3">
      <Diagrama />
    </div>
  );
}
