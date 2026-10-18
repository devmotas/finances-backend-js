-- AlterTable
ALTER TABLE "recurrences" ADD COLUMN IF NOT EXISTS "destination_account_id" BIGINT;

ALTER TABLE "recurrences" DROP CONSTRAINT IF EXISTS "recurrences_destination_account_id_fkey";
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_destination_account_id_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "investment_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "recurrences_destination_account_id_idx" ON "recurrences"("destination_account_id");

-- AddCheckConstraint: só série fixa tem destino
ALTER TABLE "recurrences" DROP CONSTRAINT IF EXISTS "recurrences_destination_only_fixed_check";
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_destination_only_fixed_check"
  CHECK ("destination_account_id" IS NULL OR "kind" = 'fixed');

-- CreateIndex: cada mês da série pode ter a entrada e o aporte dela
DROP INDEX IF EXISTS "transactions_recurrence_id_recurrence_index_key";
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_recurrence_id_recurrence_index_flow_key"
  ON "transactions"("recurrence_id", "recurrence_index", "flow");
