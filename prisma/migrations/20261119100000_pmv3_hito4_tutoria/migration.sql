-- PMV 3 · HITO 4 — Tutoría adaptativa (sesiones y eventos de tutoría).
-- MIGRACIÓN ADITIVA: sólo crea dos tipos y dos tablas; no toca ninguna fila existente.

-- CreateEnum
CREATE TYPE "FaseTutoria" AS ENUM ('INICIAL', 'AYUDA', 'REPASO', 'REGRESO', 'EQUIVALENTE', 'RESUELTO');

-- CreateEnum
CREATE TYPE "TipoEventoTutoria" AS ENUM ('RESPUESTA_CORRECTA', 'RESPUESTA_INCORRECTA', 'PISTA', 'REPASO_ABIERTO', 'REPASO_CERRADO', 'EQUIVALENTE_PROPUESTO', 'EQUIVALENTE_RESPONDIDO');

-- CreateTable
CREATE TABLE "sesiones_tutoria" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "ejercicioId" TEXT,
    "nodoId" TEXT,
    "tema" TEXT,
    "fase" "FaseTutoria" NOT NULL DEFAULT 'INICIAL',
    "erroresSeguidos" INTEGER NOT NULL DEFAULT 0,
    "erroresTotales" INTEGER NOT NULL DEFAULT 0,
    "pistasDadas" INTEGER NOT NULL DEFAULT 0,
    "repasos" INTEGER NOT NULL DEFAULT 0,
    "equivalentes" INTEGER NOT NULL DEFAULT 0,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_tutoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_tutoria" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "tipo" "TipoEventoTutoria" NOT NULL,
    "detalle" JSONB NOT NULL DEFAULT '{}',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_tutoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sesiones_tutoria_tareaId_idx" ON "sesiones_tutoria"("tareaId");

-- CreateIndex
CREATE INDEX "sesiones_tutoria_estudianteId_actualizadoEn_idx" ON "sesiones_tutoria"("estudianteId", "actualizadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_tutoria_estudianteId_tareaId_ejercicioId_key" ON "sesiones_tutoria"("estudianteId", "tareaId", "ejercicioId");

-- CreateIndex
CREATE INDEX "eventos_tutoria_sesionId_creadoEn_idx" ON "eventos_tutoria"("sesionId", "creadoEn");

-- AddForeignKey
ALTER TABLE "sesiones_tutoria" ADD CONSTRAINT "sesiones_tutoria_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_tutoria" ADD CONSTRAINT "sesiones_tutoria_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_tutoria" ADD CONSTRAINT "sesiones_tutoria_ejercicioId_fkey" FOREIGN KEY ("ejercicioId") REFERENCES "ejercicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_tutoria" ADD CONSTRAINT "eventos_tutoria_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "sesiones_tutoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

