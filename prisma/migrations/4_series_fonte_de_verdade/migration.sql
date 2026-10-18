-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(32);
ALTER TABLE "recurrences" ADD COLUMN IF NOT EXISTS "first_index" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "recurrences" ADD COLUMN IF NOT EXISTS "end_month" DATE;
ALTER TABLE "recurrences" ADD COLUMN IF NOT EXISTS "materialized_until" DATE;
ALTER TABLE "recurrences" ALTER COLUMN "months" DROP NOT NULL;

ALTER TABLE "transactions" ALTER COLUMN "schedule" DROP NOT NULL;

-- Data: séries parceladas terminam na última parcela; as demais viram fixas sem fim
UPDATE "recurrences"
SET "kind" = CASE WHEN "installment_total" IS NOT NULL THEN 'installment' ELSE 'fixed' END
WHERE "kind" IS NULL;

UPDATE "recurrences"
SET "end_month" = (date_trunc('month', "start_date") + ("installment_total" - "first_index") * INTERVAL '1 month')::date
WHERE "kind" = 'installment' AND "end_month" IS NULL;

-- Data: último mês já gerado pela série antiga, mesmo que algum mês tenha sido excluído depois
UPDATE "recurrences" AS r
SET "materialized_until" = GREATEST(
  (date_trunc('month', r."start_date") + (COALESCE(r."months", 1) - 1) * INTERVAL '1 month')::date,
  COALESCE(
    (SELECT date_trunc('month', MAX(t."date"))::date FROM "transactions" t WHERE t."recurrence_id" = r."id"),
    date_trunc('month', r."start_date")::date
  )
)
WHERE r."materialized_until" IS NULL;

-- Data (ticket 12): lançamento "fixo" sem série vira avulso
UPDATE "transactions" SET "schedule" = 'variable' WHERE "schedule" = 'fixed' AND "recurrence_id" IS NULL;

ALTER TABLE "recurrences" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "recurrences" ALTER COLUMN "materialized_until" SET NOT NULL;

-- AddCheckConstraint
ALTER TABLE "recurrences" DROP CONSTRAINT IF EXISTS "recurrences_kind_check";
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_kind_check"
  CHECK ("kind" IN ('fixed', 'installment'));

ALTER TABLE "recurrences" DROP CONSTRAINT IF EXISTS "recurrences_installment_total_check";
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_installment_total_check"
  CHECK (("kind" = 'installment') = ("installment_total" IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_recurrence_id_recurrence_index_key"
  ON "transactions"("recurrence_id", "recurrence_index");
