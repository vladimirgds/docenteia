-- PMV 3 · HITO 1 (cierre) — Evaluación segura: versión de ejercicio, ejercicios y
-- rúbricas CONGELADOS al asignar, intentos y respuestas corregidos en servidor.
--
-- MIGRACIÓN ADITIVA: sólo añade columnas con valor por defecto, tipos y tablas.
-- No modifica ni borra ninguna fila existente, y conserva todos los IDs.
-- El único INSERT es el relleno de `tarea_ejercicios` para las tareas ya
-- asignadas: copia el ejercicio tal como está hoy (versión 1), de modo que, a
-- partir de ahora, editarlo no cambie esas tareas.
--
-- MARCHA ATRÁS (sólo si hiciera falta; pierde lo registrado en las tablas nuevas):
--   DROP TABLE "respuestas_intento", "intentos_tarea", "tarea_ejercicios", "ejercicio_versiones";
--   ALTER TABLE "ejercicios" DROP COLUMN "version";
--   ALTER TABLE "entregas_tarea" DROP COLUMN "modoNota";
--   ALTER TABLE "tareas" DROP COLUMN "reglaCalificacion";
--   DROP TYPE "EstadoIntento";

-- CreateEnum
CREATE TYPE "EstadoIntento" AS ENUM ('EN_CURSO', 'ENTREGADO');

-- AlterTable
ALTER TABLE "ejercicios" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "entregas_tarea" ADD COLUMN     "modoNota" TEXT NOT NULL DEFAULT 'CLIENTE';

-- AlterTable
ALTER TABLE "tareas" ADD COLUMN     "reglaCalificacion" JSONB NOT NULL DEFAULT '{"pesos":"IGUALES","creditoParcial":false,"nota":"ULTIMO_INTENTO","escala":100}';

-- CreateTable
CREATE TABLE "tarea_ejercicios" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "ejercicioId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "orden" INTEGER NOT NULL,
    "enunciado" TEXT NOT NULL,
    "respuestaCorrecta" TEXT NOT NULL,
    "pasos" JSONB NOT NULL DEFAULT '[]',
    "pistas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rubrica" JSONB NOT NULL DEFAULT '{"puntos":1,"creditoParcial":false,"criterio":"EQUIVALENCIA"}',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarea_ejercicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intentos_tarea" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoIntento" NOT NULL DEFAULT 'EN_CURSO',
    "puntaje" DOUBLE PRECISION,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entregadoEn" TIMESTAMP(3),

    CONSTRAINT "intentos_tarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respuestas_intento" (
    "id" TEXT NOT NULL,
    "intentoId" TEXT NOT NULL,
    "tareaEjercicioId" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "correcto" BOOLEAN,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respuestas_intento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ejercicio_versiones" (
    "id" TEXT NOT NULL,
    "ejercicioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "enunciado" TEXT NOT NULL,
    "respuestaCorrecta" TEXT NOT NULL,
    "pasos" JSONB NOT NULL DEFAULT '[]',
    "pistas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ejercicio_versiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarea_ejercicios_ejercicioId_idx" ON "tarea_ejercicios"("ejercicioId");

-- CreateIndex
CREATE UNIQUE INDEX "tarea_ejercicios_tareaId_orden_key" ON "tarea_ejercicios"("tareaId", "orden");

-- CreateIndex
CREATE INDEX "intentos_tarea_estudianteId_idx" ON "intentos_tarea"("estudianteId");

-- CreateIndex
CREATE UNIQUE INDEX "intentos_tarea_tareaId_estudianteId_numero_key" ON "intentos_tarea"("tareaId", "estudianteId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "respuestas_intento_intentoId_tareaEjercicioId_key" ON "respuestas_intento"("intentoId", "tareaEjercicioId");

-- CreateIndex
CREATE UNIQUE INDEX "ejercicio_versiones_ejercicioId_version_key" ON "ejercicio_versiones"("ejercicioId", "version");

-- AddForeignKey
ALTER TABLE "tarea_ejercicios" ADD CONSTRAINT "tarea_ejercicios_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intentos_tarea" ADD CONSTRAINT "intentos_tarea_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intentos_tarea" ADD CONSTRAINT "intentos_tarea_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_intento" ADD CONSTRAINT "respuestas_intento_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "intentos_tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_intento" ADD CONSTRAINT "respuestas_intento_tareaEjercicioId_fkey" FOREIGN KEY ("tareaEjercicioId") REFERENCES "tarea_ejercicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejercicio_versiones" ADD CONSTRAINT "ejercicio_versiones_ejercicioId_fkey" FOREIGN KEY ("ejercicioId") REFERENCES "ejercicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Relleno de las tareas históricas del banco: su copia congelada.
INSERT INTO "tarea_ejercicios" ("id", "tareaId", "ejercicioId", "version", "orden", "enunciado", "respuestaCorrecta", "pasos", "pistas")
SELECT gen_random_uuid()::text, t."id", e."id", e."version", (u.ord - 1)::int, e."enunciado", e."respuestaCorrecta", e."pasos", e."pistas"
FROM "tareas" t
CROSS JOIN LATERAL unnest(t."ejercicioIds") WITH ORDINALITY AS u(eid, ord)
JOIN "ejercicios" e ON e."id" = u.eid;
