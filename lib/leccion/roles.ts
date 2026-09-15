/**
 * LOS TRES ROLES TIPOGRÁFICOS DE LA LECCIÓN (SUB-TIP-01 del informe del cliente).
 *
 * Todo lo que la lección pone en pantalla es una de estas tres cosas, y la
 * fuente sale del ROL, no de una clase escrita a mano en cada componente:
 *
 *   · TUTOR_DIALOG     — lo que DICE el tutor: subtítulos, la frase bajo el paso
 *                        animado, la retroalimentación y el estado del avatar.
 *                        Segoe Print.
 *   · BOARD_LABEL      — lo que se ESCRIBE en la pizarra: notas, "Ejercicio:",
 *                        "MCM(2, 3):", "numeradores", "llevo 1", los rótulos del
 *                        diagrama. Chalkboard SE.
 *   · MATH_EXPRESSION  — cualquier número, operador, fracción, polinomio o
 *                        ecuación. KaTeX (su fuente matemática formal).
 *
 * El componente sólo declara el rol (`data-rol`); la hoja de estilos
 * (`app/globals.css`) es la única que sabe qué familia corresponde a cada uno.
 * Así una fuente se cambia en un sitio y ningún texto se queda fuera.
 */
export const ROL = {
  TUTOR: "TUTOR_DIALOG",
  PIZARRA: "BOARD_LABEL",
  FORMULA: "MATH_EXPRESSION",
} as const;

export type RolTipografico = (typeof ROL)[keyof typeof ROL];

export const ROLES_TIPOGRAFICOS: readonly RolTipografico[] = [ROL.TUTOR, ROL.PIZARRA, ROL.FORMULA];

/** Las props que marcan un elemento con su rol: `<p {...rol(ROL.TUTOR)}>`. */
export function rol(r: RolTipografico): { "data-rol": RolTipografico } {
  return { "data-rol": r };
}
