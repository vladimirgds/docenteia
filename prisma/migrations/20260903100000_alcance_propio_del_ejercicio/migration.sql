-- ─────────────────────────────────────────────────────────────────────────────
-- El alcance del ejercicio pasa de ser una COPIA a ser una EXCEPCIÓN
--
-- Hasta ahora, al guardar un ejercicio se copiaba el alcance de su tema en sus
-- propias columnas. Funcionaba, pero tenía dos costes: al cambiar el alcance del
-- tema, sus ejercicios se quedaban con el valor viejo, y no había forma de
-- distinguir "lo heredé" de "lo decidí yo".
--
-- A partir de aquí, NULL significa "el de mi tema" y un valor significa "éste es
-- mío". El backfill deshace las copias: donde el ejercicio coincide con su tema,
-- vuelve a heredar. Lo que no coincide —no debería haberlo todavía— se respeta,
-- porque sería una decisión explícita de alguien.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "ejercicios" AS e
   SET "etapa" = NULL, "cursoMin" = NULL
  FROM "nodos_conocimiento" AS n
 WHERE e."nodoId" = n."id"
   AND e."etapa" IS NOT DISTINCT FROM n."etapa"
   AND e."cursoMin" IS NOT DISTINCT FROM n."cursoMin";
