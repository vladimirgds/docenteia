-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "institucionId" TEXT;

-- CreateTable
CREATE TABLE "instituciones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigoModular" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instituciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aulas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grado" INTEGER NOT NULL,
    "seccion" TEXT NOT NULL,
    "codigoAcceso" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "institucionId" TEXT NOT NULL,
    "docenteId" TEXT NOT NULL,

    CONSTRAINT "aulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matriculas" (
    "id" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aulaId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,

    CONSTRAINT "matriculas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "cantidadEjercicios" INTEGER NOT NULL DEFAULT 5,
    "limiteReintentos" INTEGER NOT NULL DEFAULT 3,
    "nodoId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aulaId" TEXT NOT NULL,
    "docenteId" TEXT NOT NULL,

    CONSTRAINT "tareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_tarea" (
    "id" TEXT NOT NULL,
    "puntaje" DOUBLE PRECISION,
    "intentosUsados" INTEGER NOT NULL DEFAULT 0,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "fechaEntrega" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "tareaId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,

    CONSTRAINT "entregas_tarea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instituciones_codigoModular_key" ON "instituciones"("codigoModular");

-- CreateIndex
CREATE UNIQUE INDEX "aulas_codigoAcceso_key" ON "aulas"("codigoAcceso");

-- CreateIndex
CREATE INDEX "aulas_institucionId_idx" ON "aulas"("institucionId");

-- CreateIndex
CREATE INDEX "aulas_docenteId_idx" ON "aulas"("docenteId");

-- CreateIndex
CREATE INDEX "matriculas_estudianteId_idx" ON "matriculas"("estudianteId");

-- CreateIndex
CREATE UNIQUE INDEX "matriculas_aulaId_estudianteId_key" ON "matriculas"("aulaId", "estudianteId");

-- CreateIndex
CREATE INDEX "tareas_aulaId_idx" ON "tareas"("aulaId");

-- CreateIndex
CREATE INDEX "tareas_docenteId_idx" ON "tareas"("docenteId");

-- CreateIndex
CREATE INDEX "tareas_fechaVencimiento_idx" ON "tareas"("fechaVencimiento");

-- CreateIndex
CREATE INDEX "entregas_tarea_estudianteId_idx" ON "entregas_tarea"("estudianteId");

-- CreateIndex
CREATE UNIQUE INDEX "entregas_tarea_tareaId_estudianteId_key" ON "entregas_tarea"("tareaId", "estudianteId");

-- CreateIndex
CREATE INDEX "usuarios_institucionId_idx" ON "usuarios"("institucionId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "aulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "nodos_conocimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "aulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_tarea" ADD CONSTRAINT "entregas_tarea_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_tarea" ADD CONSTRAINT "entregas_tarea_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
