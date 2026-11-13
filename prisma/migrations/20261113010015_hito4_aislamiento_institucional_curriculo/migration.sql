-- AlterTable
ALTER TABLE "ejercicios" ADD COLUMN     "institucionId" TEXT;

-- AlterTable
ALTER TABLE "materias" ADD COLUMN     "institucionId" TEXT;

-- AlterTable
ALTER TABLE "nodos_conocimiento" ADD COLUMN     "institucionId" TEXT;

-- CreateIndex
CREATE INDEX "ejercicios_institucionId_idx" ON "ejercicios"("institucionId");

-- CreateIndex
CREATE INDEX "materias_institucionId_idx" ON "materias"("institucionId");

-- CreateIndex
CREATE INDEX "nodos_conocimiento_institucionId_idx" ON "nodos_conocimiento"("institucionId");

-- AddForeignKey
ALTER TABLE "materias" ADD CONSTRAINT "materias_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodos_conocimiento" ADD CONSTRAINT "nodos_conocimiento_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejercicios" ADD CONSTRAINT "ejercicios_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
