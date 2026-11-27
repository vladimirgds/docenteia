-- PMV 3 · H4 — Habilidades y prerrequisitos (grafo sin ciclos) y registro por habilidad.
-- MIGRACIÓN ADITIVA: tres tablas nuevas y una columna opcional en "ejercicios" y "sesiones_tutoria"; no toca filas existentes.
-- MARCHA ATRÁS:
--   ALTER TABLE "ejercicios" DROP COLUMN "habilidadId"; ALTER TABLE "sesiones_tutoria" DROP COLUMN "habilidadId";
--   DROP TABLE "registros_habilidad", "prerrequisitos_habilidad", "habilidades";

-- AlterTable
ALTER TABLE "ejercicios" ADD COLUMN     "habilidadId" TEXT;

-- AlterTable
ALTER TABLE "sesiones_tutoria" ADD COLUMN     "habilidadId" TEXT;

-- CreateTable
CREATE TABLE "habilidades" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "nodoId" TEXT,
    "repasoId" TEXT,
    "autorId" TEXT NOT NULL,
    "institucionId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habilidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prerrequisitos_habilidad" (
    "habilidadId" TEXT NOT NULL,
    "requiereId" TEXT NOT NULL,

    CONSTRAINT "prerrequisitos_habilidad_pkey" PRIMARY KEY ("habilidadId","requiereId")
);

-- CreateTable
CREATE TABLE "registros_habilidad" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "habilidadId" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "errores" INTEGER NOT NULL DEFAULT 0,
    "aciertos" INTEGER NOT NULL DEFAULT 0,
    "pistas" INTEGER NOT NULL DEFAULT 0,
    "repasos" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_habilidad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "habilidades_nodoId_idx" ON "habilidades"("nodoId");

-- CreateIndex
CREATE UNIQUE INDEX "habilidades_autorId_clave_key" ON "habilidades"("autorId", "clave");

-- CreateIndex
CREATE INDEX "prerrequisitos_habilidad_requiereId_idx" ON "prerrequisitos_habilidad"("requiereId");

-- CreateIndex
CREATE INDEX "registros_habilidad_habilidadId_idx" ON "registros_habilidad"("habilidadId");

-- CreateIndex
CREATE UNIQUE INDEX "registros_habilidad_estudianteId_habilidadId_key" ON "registros_habilidad"("estudianteId", "habilidadId");

-- CreateIndex
CREATE INDEX "ejercicios_habilidadId_idx" ON "ejercicios"("habilidadId");

-- AddForeignKey
ALTER TABLE "ejercicios" ADD CONSTRAINT "ejercicios_habilidadId_fkey" FOREIGN KEY ("habilidadId") REFERENCES "habilidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prerrequisitos_habilidad" ADD CONSTRAINT "prerrequisitos_habilidad_habilidadId_fkey" FOREIGN KEY ("habilidadId") REFERENCES "habilidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prerrequisitos_habilidad" ADD CONSTRAINT "prerrequisitos_habilidad_requiereId_fkey" FOREIGN KEY ("requiereId") REFERENCES "habilidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_habilidad" ADD CONSTRAINT "registros_habilidad_habilidadId_fkey" FOREIGN KEY ("habilidadId") REFERENCES "habilidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

