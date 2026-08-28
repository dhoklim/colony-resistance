ALTER TABLE `events` ADD `progress_step` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Resume existing rounds after the consecutive results already published.
-- If the next question has saved answers, keep that question open.
WITH RECURSIVE released(question_count) AS (
  SELECT 0
  UNION ALL
  SELECT question_count + 1 FROM released, events
  WHERE events.id = 1 AND question_count < 10
    AND (events.revealed_questions & (1 << question_count)) <> 0
)
UPDATE events SET progress_step = 2 * (SELECT MAX(question_count) FROM released)
  + CASE WHEN EXISTS (
      SELECT 1 FROM answers
      WHERE question_id = 1 + (SELECT MAX(question_count) FROM released)
    ) THEN 1 ELSE 0 END
WHERE id = 1;
