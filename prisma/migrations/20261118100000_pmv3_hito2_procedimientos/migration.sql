-- PMV 3 · HITO 2 — Procedimientos didácticos (reglas, métodos y procedimientos).
-- MIGRACIÓN ADITIVA: sólo crea una tabla y un tipo nuevos; no toca ninguna fila existente.

-- CreateEnum
CREATE TYPE "TipoProcedimiento" AS ENUM ('REGLA', 'METODO', 'PROCEDIMIENTO');

-- CreateTable
CREATE TABLE "procedimientos" (
    "id" TEXT NOT NULL,
    "nodoId" TEXT,
    "tipo" "TipoProcedimiento" NOT NULL DEFAULT 'PROCEDIMIENTO',
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "motor" "Tema",
    "ejemplo" TEXT NOT NULL,
    "respuestaEjemplo" TEXT,
    "pasos" JSONB NOT NULL DEFAULT '[]',
    "preguntas" JSONB NOT NULL DEFAULT '[]',
    "pistas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origen" "OrigenContenido" NOT NULL DEFAULT 'DOCENTE',
    "ambito" "AmbitoContenido" NOT NULL DEFAULT 'DOCENTE',
    "estado" "EstadoContenido" NOT NULL DEFAULT 'BORRADOR',
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "informeVerificacion" JSONB NOT NULL DEFAULT '{}',
    "verificadoEn" TIMESTAMP(3),
    "repasoId" TEXT,
    "autorId" TEXT,
    "institucionId" TEXT,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "metadatos" JSONB NOT NULL DEFAULT '{}',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procedimientos_nodoId_estado_idx" ON "procedimientos"("nodoId", "estado");

-- CreateIndex
CREATE INDEX "procedimientos_ambito_autorId_idx" ON "procedimientos"("ambito", "autorId");

-- CreateIndex
CREATE INDEX "procedimientos_institucionId_idx" ON "procedimientos"("institucionId");

-- AddForeignKey
ALTER TABLE "procedimientos" ADD CONSTRAINT "procedimientos_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "nodos_conocimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedimientos" ADD CONSTRAINT "procedimientos_repasoId_fkey" FOREIGN KEY ("repasoId") REFERENCES "procedimientos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedimientos" ADD CONSTRAINT "procedimientos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedimientos" ADD CONSTRAINT "procedimientos_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedimientos" ADD CONSTRAINT "procedimientos_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

