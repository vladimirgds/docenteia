import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Etiqueta compacta de estado.
 *
 * Los tres tonos no son decorativos, dicen algo distinto: `exito` marca lo que
 * el motor ha verificado, `aviso` lo que se ha guardado sin verificar, y
 * `neutro` lo que simplemente está en borrador. Que el docente distinga de un
 * vistazo lo verificado de lo no verificado es media pantalla del HITO 1.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutro: "border-transparent bg-secondary text-secondary-foreground",
        exito: "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        aviso: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-500",
        error: "border-destructive/30 bg-destructive/10 text-destructive",
        contorno: "border-input text-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutro" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
