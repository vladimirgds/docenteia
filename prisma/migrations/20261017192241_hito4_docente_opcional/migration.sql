-- DropForeignKey
ALTER TABLE "aulas" DROP CONSTRAINT "aulas_docenteId_fkey";

-- AlterTable
ALTER TABLE "aulas" ALTER COLUMN "docenteId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
