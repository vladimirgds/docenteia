-- PMV 3 · H5B — Registro del consumo de IA y voz.
-- MIGRACIÓN ADITIVA: una tabla nueva.
-- MARCHA ATRÁS:
--   DROP TABLE "consumo_servicios";

-- CreateTable
CREATE TABLE "consumo_servicios" (
    "id" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modelo" TEXT,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSalida" INTEGER NOT NULL DEFAULT 0,
    "tokensTotales" INTEGER NOT NULL DEFAULT 0,
    "caracteres" INTEGER NOT NULL DEFAULT 0,
    "cacheado" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "usuarioId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumo_servicios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumo_servicios_servicio_creadoEn_idx" ON "consumo_servicios"("servicio", "creadoEn");

-- CreateIndex
CREATE INDEX "consumo_servicios_origen_creadoEn_idx" ON "consumo_servicios"("origen", "creadoEn");

