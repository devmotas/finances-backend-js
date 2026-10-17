-- Data
UPDATE "recurrences" AS r
SET "amount" = latest."amount"
FROM (
  SELECT DISTINCT ON ("recurrence_id") "recurrence_id", "amount", "date"
  FROM "transactions"
  WHERE "recurrence_id" IS NOT NULL
  ORDER BY "recurrence_id", "date" DESC, "id" DESC
) AS latest
WHERE latest."recurrence_id" = r."id"
  AND latest."date" >= date_trunc('month', CURRENT_DATE)
  AND r."amount" <> latest."amount";
