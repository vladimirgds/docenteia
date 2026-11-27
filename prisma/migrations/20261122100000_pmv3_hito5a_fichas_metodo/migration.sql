-- PMV 3 · HITO 5A — Fichas de método versionadas (patrón, variables, condiciones, pasos, operaciones, ejemplos y pistas).
-- MIGRACIÓN ADITIVA: sólo crea dos tablas; no toca ninguna fila existente.
-- MARCHA ATRÁS:
--   DROP TABLE "fichas_metodo_versiones", "fichas_metodo";

-- CreateTable
CREATE TABLE "fichas_metodo" (
    "id" TEXT NOT NULL,
    "nodoId" TEXT,
    "titulo" TEXT NOT NULL,
    "motor" "Tema",
    "contenido" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publicadaVersion" INTEGER,
    "origen" "OrigenContenido" NOT NULL DEFAULT 'DOCENTE',
    "ambito" "AmbitoContenido" NOT NULL DEFAULT 'DOCENTE',
    "estado" "EstadoContenido" NOT NULL DEFAULT 'BORRADOR',
    "validacion" JSONB NOT NULL DEFAULT '{}',
    "verificada" BOOLEAN NOT NULL DEFAULT false,
    "pendienteValidacion" BOOLEAN NOT NULL DEFAULT false,
    "autorId" TEXT,
    "institucionId" TEXT,
    "aprobadaPorId" TEXT,
    "aprobadaEn" TIMESTAMP(3),
    "metadatos" JSONB NOT NULL DEFAULT '{}',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fichas_metodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichas_metodo_versiones" (
    "id" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contenido" JSONB NOT NULL,
    "validacion" JSONB NOT NULL DEFAULT '{}',
    "verificada" BOOLEAN NOT NULL DEFAULT false,
    "pendienteValidacion" BOOLEAN NOT NULL DEFAULT false,
    "nota" TEXT,
    "autorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fichas_metodo_versiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fichas_metodo_nodoId_estado_idx" ON "fichas_metodo"("nodoId", "estado");

-- CreateIndex
CREATE INDEX "fichas_metodo_ambito_autorId_idx" ON "fichas_metodo"("ambito", "autorId");

-- CreateIndex
CREATE INDEX "fichas_metodo_institucionId_idx" ON "fichas_metodo"("institucionId");

-- CreateIndex
CREATE INDEX "fichas_metodo_versiones_fichaId_creadoEn_idx" ON "fichas_metodo_versiones"("fichaId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "fichas_metodo_versiones_fichaId_version_key" ON "fichas_metodo_versiones"("fichaId", "version");

-- AddForeignKey
ALTER TABLE "fichas_metodo" ADD CONSTRAINT "fichas_metodo_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "nodos_conocimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_metodo" ADD CONSTRAINT "fichas_metodo_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_metodo" ADD CONSTRAINT "fichas_metodo_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_metodo" ADD CONSTRAINT "fichas_metodo_aprobadaPorId_fkey" FOREIGN KEY ("aprobadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_metodo_versiones" ADD CONSTRAINT "fichas_metodo_versiones_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "fichas_metodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_metodo_versiones" ADD CONSTRAINT "fichas_metodo_versiones_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

