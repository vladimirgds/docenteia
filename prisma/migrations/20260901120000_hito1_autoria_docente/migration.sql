-- ─────────────────────────────────────────────────────────────────────────────
-- MVP 2 · HITO 1 — Catálogo curricular dinámico y autoría docente
--
-- Esta migración NO es la que genera `prisma migrate dev` tal cual. Se ha
-- escrito a mano en tres puntos, porque la automática destruye datos:
--
--   1. El enum Rol. Prisma recrea el tipo y castea con
--      `"rol"::text::"Rol_new"`, lo que REVIENTA en cuanto exista una cuenta
--      ADMIN (el valor no está en el enum nuevo). Aquí se renombra el valor:
--      la cuenta de administración del PMV 1 sigue siendo la misma fila y pasa
--      a ser SUPERADMIN sin tocarla.
--
--   2. Las columnas `tema` de nodos_conocimiento y ejercicios. Prisma las
--      DROPea y crea `motor` vacía, con lo que el árbol de conocimiento y el
--      banco de ejercicios perderían su vínculo con el motor determinista.
--      Aquí se RENOMBRAN, que es lo que de verdad ocurrió: el campo no cambia
--      de contenido, cambia de nombre y deja de ser obligatorio.
--
--   3. El estado del contenido ya existente. `estado` nace con default
--      BORRADOR —lo correcto para lo que se crea desde el panel—, pero el
--      currículo del PMV 1 ya estaba en producción: aplicar el default lo
--      despublicaría entero y los alumnos se quedarían sin temario. Se
--      backfillea a PUBLICADO al final.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "EstadoContenido" AS ENUM ('BORRADOR', 'PUBLICADO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "TipoRegla" AS ENUM ('REGLA', 'PROPIEDAD', 'ESTRATEGIA', 'ERROR_FRECUENTE');

-- AlterEnum (a mano: sin recrear el tipo, para no perder las cuentas)
-- ADD VALUE dentro de una transacción es válido desde PostgreSQL 12 siempre que
-- el valor nuevo no se USE en la misma transacción; aquí sólo se declara.
ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'DIRECTOR';
ALTER TYPE "Rol" RENAME VALUE 'ADMIN' TO 'SUPERADMIN';

-- AlterEnum
-- El banco de ejercicios pasa a tener un tercer productor: el profesor.
ALTER TYPE "OrigenContenido" ADD VALUE IF NOT EXISTS 'DOCENTE';

-- DropIndex (los índices se recrean sobre el nombre nuevo de la columna)
DROP INDEX "nodos_conocimiento_tema_nivel_idx";
DROP INDEX "ejercicios_tema_nivel_validado_idx";
DROP INDEX "ejercicios_tema_nivel_enunciado_key";

-- RenameColumn (a mano: conserva el contenido)
ALTER TABLE "nodos_conocimiento" RENAME COLUMN "tema" TO "motor";
ALTER TABLE "nodos_conocimiento" ALTER COLUMN "motor" DROP NOT NULL;
ALTER TABLE "ejercicios" RENAME COLUMN "tema" TO "motor";
ALTER TABLE "ejercicios" ALTER COLUMN "motor" DROP NOT NULL;

-- AlterTable
ALTER TABLE "materias" ADD COLUMN     "activa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "nodos_conocimiento" ADD COLUMN     "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "autorId" TEXT,
ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "estado" "EstadoContenido" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN     "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "materiaId" TEXT,
ADD COLUMN     "objetivos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ejercicios" ADD COLUMN     "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "autorId" TEXT,
ADD COLUMN     "estado" "EstadoContenido" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN     "informeValidacion" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "parametros" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "pistas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "plantilla" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "respuestaFormula" TEXT,
ADD COLUMN     "validadoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reglas_matematicas" ADD COLUMN     "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "autorId" TEXT,
ADD COLUMN     "estado" "EstadoContenido" NOT NULL DEFAULT 'PUBLICADO',
ADD COLUMN     "nodoId" TEXT,
ADD COLUMN     "tipo" "TipoRegla" NOT NULL DEFAULT 'REGLA',
ALTER COLUMN "tema" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "materias_activa_orden_idx" ON "materias"("activa", "orden");

-- CreateIndex
CREATE INDEX "nodos_conocimiento_materiaId_orden_idx" ON "nodos_conocimiento"("materiaId", "orden");

-- CreateIndex
CREATE INDEX "nodos_conocimiento_motor_nivel_idx" ON "nodos_conocimiento"("motor", "nivel");

-- CreateIndex
CREATE INDEX "nodos_conocimiento_estado_actualizadoEn_idx" ON "nodos_conocimiento"("estado", "actualizadoEn");

-- CreateIndex
CREATE INDEX "ejercicios_motor_nivel_validado_idx" ON "ejercicios"("motor", "nivel", "validado");

-- CreateIndex
CREATE INDEX "ejercicios_nodoId_estado_idx" ON "ejercicios"("nodoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ejercicios_motor_nivel_enunciado_key" ON "ejercicios"("motor", "nivel", "enunciado");

-- CreateIndex
CREATE INDEX "reglas_matematicas_nodoId_orden_idx" ON "reglas_matematicas"("nodoId", "orden");

-- AddForeignKey
ALTER TABLE "nodos_conocimiento" ADD CONSTRAINT "nodos_conocimiento_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "materias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodos_conocimiento" ADD CONSTRAINT "nodos_conocimiento_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejercicios" ADD CONSTRAINT "ejercicios_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglas_matematicas" ADD CONSTRAINT "reglas_matematicas_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "nodos_conocimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglas_matematicas" ADD CONSTRAINT "reglas_matematicas_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill del contenido que ya existía ────────────────────────────────────
-- Lo que estaba en producción sigue publicado. El default BORRADOR es para lo
-- que se cree a partir de ahora desde el panel docente.
UPDATE "nodos_conocimiento" SET "estado" = 'PUBLICADO';
UPDATE "ejercicios" SET "estado" = 'PUBLICADO';

-- El árbol del PMV 1 se sembró sin asignatura porque todavía no existía la
-- categorización. Se engancha a la que ya usa el perfil del alumno.
UPDATE "nodos_conocimiento"
   SET "materiaId" = (SELECT "id" FROM "materias" WHERE "codigo" = 'MAT' LIMIT 1)
 WHERE "materiaId" IS NULL;

-- `actualizadoEn` nace con CURRENT_TIMESTAMP, que fecharía todo el contenido
-- antiguo en el día del despliegue. Donde se sabe cuándo se creó, se respeta.
UPDATE "ejercicios" SET "actualizadoEn" = "creadoEn";
UPDATE "reglas_matematicas" SET "actualizadoEn" = "creadoEn";
