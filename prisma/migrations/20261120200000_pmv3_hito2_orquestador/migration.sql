-- PMV 3 · HITO 2 (cierre) — Orquestador pedagógico: prácticas guiadas y registro de decisiones.
-- MIGRACIÓN ADITIVA: sólo crea un tipo y dos tablas; no toca ninguna fila existente.
-- MARCHA ATRÁS:
--   DROP TABLE "decisiones_pedagogicas", "practicas_guiadas"; DROP TYPE "ModoAprendizaje";

-- CreateEnum
CREATE TYPE "ModoAprendizaje" AS ENUM ('EXPLICACION', 'PRACTICA_GUIADA', 'PRACTICA_LIBRE', 'EVALUACION');

-- CreateTable
CREATE TABLE "practicas_guiadas" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "modo" "ModoAprendizaje" NOT NULL DEFAULT 'PRACTICA_GUIADA',
    "pasos" JSONB NOT NULL DEFAULT '[]',
    "pasoActual" TEXT NOT NULL,
    "fallosEnPaso" INTEGER NOT NULL DEFAULT 0,
    "pistasEnPaso" INTEGER NOT NULL DEFAULT 0,
    "pistasTotales" INTEGER NOT NULL DEFAULT 0,
    "solucionMostrada" BOOLEAN NOT NULL DEFAULT false,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practicas_guiadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisiones_pedagogicas" (
    "id" TEXT NOT NULL,
    "practicaId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "modo" "ModoAprendizaje" NOT NULL,
    "evento" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "razon" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "nivelAyuda" INTEGER NOT NULL DEFAULT 0,
    "revelaHasta" TEXT NOT NULL,
    "pasoIndice" INTEGER NOT NULL,
    "entrada" JSONB NOT NULL DEFAULT '{}',
    "retenidas" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisiones_pedagogicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practicas_guiadas_estudianteId_actualizadoEn_idx" ON "practicas_guiadas"("estudianteId", "actualizadoEn");

-- CreateIndex
CREATE INDEX "decisiones_pedagogicas_practicaId_creadoEn_idx" ON "decisiones_pedagogicas"("practicaId", "creadoEn");

-- CreateIndex
CREATE INDEX "decisiones_pedagogicas_estudianteId_idx" ON "decisiones_pedagogicas"("estudianteId");

-- AddForeignKey
ALTER TABLE "practicas_guiadas" ADD CONSTRAINT "practicas_guiadas_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisiones_pedagogicas" ADD CONSTRAINT "decisiones_pedagogicas_practicaId_fkey" FOREIGN KEY ("practicaId") REFERENCES "practicas_guiadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisiones_pedagogicas" ADD CONSTRAINT "decisiones_pedagogicas_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

