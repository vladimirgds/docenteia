-- ─────────────────────────────────────────────────────────────────────────────
-- El diagnóstico deja de ser uno solo para todos
--
-- Un alumno de 3.º de secundaria recibía preguntas de derivadas, porque el
-- banco era único: una pregunta por cada tema del motor, servida entera a todo
-- el mundo. Con `nivel`, cada alumno recibe las preguntas de su nivel de
-- partida, deducido del curso que declaró al registrarse.
--
-- El backfill no deja las preguntas existentes en NULL a propósito: NULL
-- significa "vale para cualquier nivel", y dejar ahí la pregunta de derivadas
-- reproduciría exactamente el problema que esta migración viene a resolver.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "preguntas_diagnostico" ADD COLUMN "nivel" "NivelAcademico";

-- CreateIndex
CREATE INDEX "preguntas_diagnostico_nivel_activa_idx" ON "preguntas_diagnostico"("nivel", "activa");

-- Backfill: se clasifica el banco del PMV 1 por el tema de cada pregunta.
UPDATE "preguntas_diagnostico" SET "nivel" = 'INTERMEDIO'
 WHERE "nivel" IS NULL AND "tema" IN ('ARITMETICA', 'FRACCIONES', 'ECUACIONES_LINEALES');

UPDATE "preguntas_diagnostico" SET "nivel" = 'AVANZADO'
 WHERE "nivel" IS NULL AND "tema" IN ('FACTORIZACION', 'DERIVADAS');

-- ── La prueba también se nutre del banco del docente ─────────────────────────
-- Una respuesta del diagnóstico puede venir ahora de un ejercicio escrito por
-- un profesor, no sólo del catálogo sembrado. Sin esto, la respuesta a una
-- pregunta del banco no tendría dónde guardarse y el intento quedaría a medias.
ALTER TABLE "respuestas_diagnostico" ALTER COLUMN "preguntaId" DROP NOT NULL;
ALTER TABLE "respuestas_diagnostico" ADD COLUMN "ejercicioId" TEXT;

CREATE UNIQUE INDEX "respuestas_diagnostico_intentoId_ejercicioId_key"
  ON "respuestas_diagnostico"("intentoId", "ejercicioId");

ALTER TABLE "respuestas_diagnostico"
  ADD CONSTRAINT "respuestas_diagnostico_ejercicioId_fkey"
  FOREIGN KEY ("ejercicioId") REFERENCES "ejercicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
