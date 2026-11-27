-- PMV 3 · HITO 5B — Ficha de método aplicada a una tarea evaluable (copia congelada al asignar).
-- MIGRACIÓN ADITIVA: cuatro columnas opcionales en "tareas"; las tareas existentes quedan con NULL y se corrigen igual que antes.
-- MARCHA ATRÁS:
--   ALTER TABLE "tareas" DROP COLUMN "fichaId", DROP COLUMN "fichaVersion", DROP COLUMN "fichaTitulo", DROP COLUMN "fichaContenido";

ALTER TABLE "tareas" ADD COLUMN "fichaId" TEXT;
ALTER TABLE "tareas" ADD COLUMN "fichaVersion" INTEGER;
ALTER TABLE "tareas" ADD COLUMN "fichaTitulo" TEXT;
ALTER TABLE "tareas" ADD COLUMN "fichaContenido" JSONB;
