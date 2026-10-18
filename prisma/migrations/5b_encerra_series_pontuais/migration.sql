-- WISE e ITAÚ eram séries pontuais: encerram no mês em que a série antiga acabava (decisão do usuário, 2026-10-18).
UPDATE "recurrences"
SET "end_month" = DATE '2026-10-01'
WHERE "id" = 8 AND "description" = 'WISE' AND "kind" = 'fixed' AND "end_month" IS NULL;

UPDATE "recurrences"
SET "end_month" = DATE '2026-11-01'
WHERE "id" = 9 AND "description" = 'ITAÚ' AND "kind" = 'fixed' AND "end_month" IS NULL;

DELETE FROM "transactions" t
USING "recurrences" r
WHERE t."recurrence_id" = r."id"
  AND r."id" IN (8, 9)
  AND r."end_month" IS NOT NULL
  AND t."date" >= (r."end_month" + INTERVAL '1 month');

UPDATE "recurrences"
SET "materialized_until" = LEAST("materialized_until", "end_month")
WHERE "id" IN (8, 9) AND "end_month" IS NOT NULL;
