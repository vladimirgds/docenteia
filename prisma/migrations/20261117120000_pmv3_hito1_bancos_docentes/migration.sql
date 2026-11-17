-- PMV 3 · HITO 1 — Catálogo maestro, bancos privados por docente y borradores IA.
--
-- MIGRACIÓN ADITIVA Y SIN PÉRDIDA DE DATOS:
--   · No borra ni reescribe ninguna fila. Todo ejercicio que ya existe queda
--     como MAESTRO (el DEFAULT de la columna nueva), de modo que el diagnóstico,
--     la lección y las tareas del PMV 2 se comportan exactamente igual.
--   · Los bancos docentes nacen VACÍOS: ningún ejercicio existente pasa a ser
--     privado.
--   · Sólo se sustituye UN índice: el único global (motor, nivel, enunciado), por
--     dos índices parciales (ver más abajo). Todos los datos actuales cumplen el
--     nuevo, porque el viejo era más estricto.

-- CreateEnum
CREATE TYPE "AmbitoContenido" AS ENUM ('MAESTRO', 'DOCENTE');

-- AlterTable
ALTER TABLE "ejercicios"
  ADD COLUMN "ambito"        "AmbitoContenido" NOT NULL DEFAULT 'MAESTRO',
  ADD COLUMN "revisadoPorId" TEXT,
  ADD COLUMN "revisadoEn"    TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ejercicios"
  ADD CONSTRAINT "ejercicios_revisadoPorId_fkey"
  FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ejercicios_ambito_autorId_idx" ON "ejercicios"("ambito", "autorId");

-- UNICIDAD
-- El índice global antiguo habría filtrado información entre bancos privados
-- ("ya existe un ejercicio con ese enunciado" revelaría el contenido del banco
-- de otro docente). Se crean PRIMERO los parciales y SÓLO DESPUÉS se retira el
-- global: en ningún momento queda el catálogo sin protección contra duplicados.
CREATE UNIQUE INDEX "ejercicios_maestro_unico"
  ON "ejercicios"("motor", "nivel", "enunciado")
  WHERE "ambito" = 'MAESTRO';

CREATE UNIQUE INDEX "ejercicios_banco_docente_unico"
  ON "ejercicios"("autorId", "nodoId", "enunciado")
  WHERE "ambito" = 'DOCENTE';

DROP INDEX "ejercicios_motor_nivel_enunciado_key";
