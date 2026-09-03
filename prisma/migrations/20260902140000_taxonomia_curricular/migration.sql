-- ─────────────────────────────────────────────────────────────────────────────
-- TAXONOMÍA CURRICULAR: etapa educativa y curso
--
-- El campo `nivel` (Básico/Intermedio/Avanzado) dice cuánto CUESTA un contenido
-- dentro de su etapa, no en qué punto del sistema educativo está el alumno.
-- Confundir las dos cosas era la causa de que a un alumno de secundaria le
-- llegaran derivadas: "avanzado" no es "universitario", es "lo más difícil de
-- lo tuyo".
--
-- A partir de aquí el contenido declara PARA QUIÉN es —etapa y rango de
-- cursos— y el alumno declara DÓNDE ESTÁ. El nivel se queda donde le
-- corresponde: graduando la dificultad dentro de cada etapa.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "EtapaEducativa" AS ENUM ('PRIMARIA', 'SECUNDARIA', 'SUPERIOR');

-- AlterTable: el alumno
ALTER TABLE "perfiles_estudiante" ADD COLUMN "etapa" "EtapaEducativa";
ALTER TABLE "perfiles_estudiante" ADD COLUMN "curso" INTEGER;

-- AlterTable: los contenidos
ALTER TABLE "nodos_conocimiento" ADD COLUMN "etapa" "EtapaEducativa";
ALTER TABLE "nodos_conocimiento" ADD COLUMN "cursoMin" INTEGER;

ALTER TABLE "ejercicios" ADD COLUMN "etapa" "EtapaEducativa";
ALTER TABLE "ejercicios" ADD COLUMN "cursoMin" INTEGER;

ALTER TABLE "preguntas_diagnostico" ADD COLUMN "etapa" "EtapaEducativa";
ALTER TABLE "preguntas_diagnostico" ADD COLUMN "cursoMin" INTEGER;

-- CreateIndex
CREATE INDEX "nodos_conocimiento_etapa_cursoMin_idx" ON "nodos_conocimiento"("etapa", "cursoMin");
CREATE INDEX "ejercicios_etapa_cursoMin_idx" ON "ejercicios"("etapa", "cursoMin");
CREATE INDEX "preguntas_diagnostico_etapa_cursoMin_idx" ON "preguntas_diagnostico"("etapa", "cursoMin");

-- ── Backfill ────────────────────────────────────────────────────────────────
-- El alcance se lee como "a partir de": etapa SECUNDARIA y cursoMin 3 es
-- "desde 3.º de secundaria en adelante", Superior incluido.
--
-- Lo que ya existía se queda SIN etapa, que significa "vale para cualquiera":
-- es contenido general y quitárselo a alguien sería peor que dejarlo. La única
-- excepción es la que motivó todo esto.
--
-- LAS DERIVADAS SON DE SUPERIOR. Es el contenido que no puede aparecerle a un
-- alumno de secundaria, y dejarlo sin etapa mientras la semilla no se ejecute
-- reproduciría el fallo que esta migración viene a cerrar.
UPDATE "preguntas_diagnostico" SET "etapa" = 'SUPERIOR', "cursoMin" = 1 WHERE "tema" = 'DERIVADAS';
UPDATE "ejercicios"            SET "etapa" = 'SUPERIOR', "cursoMin" = 1 WHERE "motor" = 'DERIVADAS';
UPDATE "nodos_conocimiento"    SET "etapa" = 'SUPERIOR', "cursoMin" = 1 WHERE "motor" = 'DERIVADAS';

-- La factorización entra en secundaria, pero no en los primeros años.
UPDATE "preguntas_diagnostico" SET "etapa" = 'SECUNDARIA', "cursoMin" = 3 WHERE "tema" = 'FACTORIZACION';
UPDATE "nodos_conocimiento"    SET "etapa" = 'SECUNDARIA', "cursoMin" = 3 WHERE "motor" = 'FACTORIZACION';

-- El alumno que ya declaró su curso en texto libre conserva lo que escribió, y
-- se le traduce a la taxonomía nueva en lo que se puede reconocer sin adivinar.
UPDATE "perfiles_estudiante"
   SET "etapa" = 'SECUNDARIA'
 WHERE "etapa" IS NULL AND (lower("ciclo") LIKE '%secundaria%' OR lower("grado") LIKE '%secundaria%');

UPDATE "perfiles_estudiante"
   SET "etapa" = 'PRIMARIA'
 WHERE "etapa" IS NULL AND (lower("ciclo") LIKE '%primaria%' OR lower("grado") LIKE '%primaria%');

UPDATE "perfiles_estudiante"
   SET "etapa" = 'SUPERIOR'
 WHERE "etapa" IS NULL
   AND (lower("ciclo") ~ 'bachiller|universi|superior|preuniv' OR lower("grado") ~ 'bachiller|universi|superior|preuniv');

UPDATE "perfiles_estudiante"
   SET "curso" = CAST(substring("grado" FROM '([1-9])') AS INTEGER)
 WHERE "curso" IS NULL AND "etapa" IS NOT NULL AND "grado" ~ '[1-9]';
