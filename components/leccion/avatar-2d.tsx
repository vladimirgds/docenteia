"use client";

import type { EstadoAvatar } from "@/public/pseLight";
import {
  ESTADOS_PEDAGOGICOS,
  ETIQUETA_ESTADO as ETIQUETA,
  estadoPedagogico,
  type EstadoPedagogico,
} from "@/lib/leccion/avatar";
import { cn } from "@/lib/utils";

/**
 * Avatar 2D reactivo.
 *
 * Tiene CINCO estados pedagógicos, que son los que se le nombran al alumno:
 *
 *   IDLE        · esperando, con respiración leve y parpadeo
 *   EXPLICANDO  · la boca se articula mientras suena la voz; asiente
 *   CELEBRANDO  · sonrisa amplia, rebote y destellos al acertar o terminar
 *   APOYO       · gesto cálido y cabeza inclinada cuando el alumno falla
 *   PENSANDO    · mirada alta y puntitos de reflexión mientras se calcula
 *
 * EL MOTOR NO SABE DE ESTO
 * PSE Light sigue emitiendo sus propios estados (`hablando`, `preguntando`…) y
 * el sincronizador de la pizarra emite los pedagógicos. El componente acepta
 * los dos y traduce aquí: así ninguna de las dos piezas tuvo que adaptarse a la
 * otra, y añadir un estado no obliga a tocar el motor.
 *
 * LAS TRANSICIONES
 * El atributo `d` de un `path` no interpola con CSS, así que un cambio de gesto
 * sería un salto seco. La cara entra por tanto con un fundido corto —opacidad y
 * una pizca de escala— que se vuelve a lanzar con `key` en cada cambio de
 * estado. Las animaciones continuas viven en `globals.css`; sobre SVG necesitan
 * `transform-box`, sin el cual el navegador toma como origen la esquina del
 * lienzo y el avatar se queda quieto.
 */

export { ESTADOS_PEDAGOGICOS, estadoPedagogico, type EstadoPedagogico };

const BOCAS: Record<EstadoPedagogico, string> = {
  IDLE: "M 42 74 Q 60 80 78 74",
  EXPLICANDO: "M 44 72 Q 60 88 76 72 Q 60 80 44 72 Z",
  CELEBRANDO: "M 38 70 Q 60 96 82 70",
  APOYO: "M 42 76 Q 60 86 78 76",
  PENSANDO: "M 48 78 L 72 74",
};

const CEJAS: Record<EstadoPedagogico, { l: string; r: string }> = {
  IDLE: { l: "M 38 46 L 52 44", r: "M 68 44 L 82 46" },
  EXPLICANDO: { l: "M 38 46 L 52 43", r: "M 68 43 L 82 46" },
  CELEBRANDO: { l: "M 38 42 L 52 40", r: "M 68 40 L 82 42" },
  // Cejas internas levantadas: es el gesto universal de "no pasa nada, sigue".
  APOYO: { l: "M 38 47 L 52 41", r: "M 68 41 L 82 47" },
  PENSANDO: { l: "M 38 43 L 52 41", r: "M 68 45 L 82 43" },
};

const COLOR_ESTADO: Record<EstadoPedagogico, string> = {
  IDLE: "text-muted-foreground",
  EXPLICANDO: "text-primary",
  CELEBRANDO: "text-emerald-600 dark:text-emerald-400",
  APOYO: "text-amber-600 dark:text-amber-400",
  PENSANDO: "text-violet-600 dark:text-violet-400",
};

/** Animación continua de la cabeza en cada estado. */
const ANIMACION_CABEZA: Record<EstadoPedagogico, string> = {
  IDLE: "avatar-esperando",
  EXPLICANDO: "avatar-explicando",
  CELEBRANDO: "avatar-celebrando",
  APOYO: "avatar-apoyo",
  PENSANDO: "avatar-pensando",
};

export function Avatar2D({
  estado,
  hablando,
  className,
}: {
  estado: EstadoAvatar | EstadoPedagogico;
  /** Anima la boca mientras el sintetizador está emitiendo. */
  hablando: boolean;
  className?: string;
}) {
  const modo = estadoPedagogico(estado);
  const boca = BOCAS[modo];
  const cejas = CEJAS[modo];

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <svg
        viewBox="0 0 120 120"
        className="h-28 w-28 sm:h-32 sm:w-32"
        role="img"
        aria-label={`Tutor: ${ETIQUETA[modo]}`}
        data-estado={modo}
      >
        <g className={cn("avatar-pieza", ANIMACION_CABEZA[modo])}>
          {/* Cabeza */}
          <circle
            cx="60"
            cy="60"
            r="42"
            className="fill-primary/10 stroke-primary/40"
            strokeWidth="2"
          />

          {/* La cara entra con un fundido en cada cambio de estado: `key` vuelve
              a lanzar la animación, que es lo que suaviza el salto de gesto. */}
          <g key={modo} className="avatar-cara">
            {/* Ojos, con parpadeo constante: es lo que impide que el avatar
                parezca una imagen fija cuando está callado. */}
            <g className="avatar-pieza avatar-ojos">
              <circle cx="45" cy="56" r="5" className="fill-foreground" />
              <circle cx="75" cy="56" r="5" className="fill-foreground" />
            </g>

            {/* Cejas: cambian con el estado y dan la expresión. */}
            <path
              d={cejas.l}
              className="stroke-foreground"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={cejas.r}
              className="stroke-foreground"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />

            {/* Boca: se articula mientras la voz está sonando. */}
            <path
              d={boca}
              className={cn(
                "avatar-pieza stroke-foreground",
                modo === "EXPLICANDO" ? "fill-foreground/70" : "fill-none",
                hablando && "avatar-boca-hablando",
              )}
              strokeWidth="3"
              strokeLinecap="round"
            />

            <Adornos modo={modo} />
          </g>
        </g>
      </svg>

      <span className={cn("text-xs font-medium tabular-nums", COLOR_ESTADO[modo])}>
        {ETIQUETA[modo]}
      </span>
    </div>
  );
}

/**
 * Lo que acompaña al gesto: destellos al celebrar, puntitos al pensar.
 *
 * Son las dos señales que se leen de un vistazo desde el fondo del aula, que es
 * donde está el alumno que mira la pizarra proyectada.
 */
function Adornos({ modo }: { modo: EstadoPedagogico }) {
  if (modo === "CELEBRANDO") {
    return (
      <g className="avatar-destellos stroke-emerald-500 dark:stroke-emerald-400" strokeWidth="3" strokeLinecap="round">
        <path d="M 18 34 L 18 44" />
        <path d="M 13 39 L 23 39" />
        <path d="M 102 30 L 102 40" />
        <path d="M 97 35 L 107 35" />
      </g>
    );
  }

  if (modo === "PENSANDO") {
    return (
      <g className="fill-violet-500 dark:fill-violet-400">
        <circle className="avatar-punto avatar-punto-1" cx="96" cy="30" r="3" />
        <circle className="avatar-punto avatar-punto-2" cx="105" cy="22" r="4" />
        <circle className="avatar-punto avatar-punto-3" cx="114" cy="13" r="5" />
      </g>
    );
  }

  if (modo === "APOYO") {
    // Un gesto de ánimo, no un premio: la mano abierta, no el pulgar arriba.
    return (
      <path
        className="avatar-mano stroke-amber-500 dark:stroke-amber-400"
        d="M 100 74 q 6 -10 12 -4 q 4 6 -2 12"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    );
  }

  return null;
}
