import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Desplegable nativo.
 *
 * Se usa el `<select>` del navegador y no un componente de Radix a propósito:
 * el panel docente se va a usar también desde tabletas de aula, y el desplegable
 * nativo es el que trae el selector rodante del sistema, con su accesibilidad y
 * su teclado ya resueltos. Un desplegable propio se vería igual y funcionaría
 * peor justo donde más falta hace.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <select
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export { Select };
