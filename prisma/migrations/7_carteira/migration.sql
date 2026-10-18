-- AlterCheckConstraint: conta pode ser a carteira (dinheiro do dia a dia)
ALTER TABLE "investment_accounts" DROP CONSTRAINT IF EXISTS "investment_accounts_role_check";
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_role_check"
  CHECK ("role" IN ('investment', 'reserve', 'short_term_reserve', 'wallet'));

-- AlterTable: série de transferência para a carteira não tem categoria
ALTER TABLE "recurrences" ALTER COLUMN "category_id" DROP NOT NULL;

ALTER TABLE "recurrences" DROP CONSTRAINT IF EXISTS "recurrences_category_or_destination_check";
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_category_or_destination_check"
  CHECK ("category_id" IS NOT NULL OR "destination_account_id" IS NOT NULL);

-- AlterTable: gastos e entradas da carteira nascem de uma atualização de saldo
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "balance_update_id" BIGINT;

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_balance_update_id_fkey";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_balance_update_id_fkey" FOREIGN KEY ("balance_update_id") REFERENCES "balance_updates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_balance_update_id_key" ON "transactions"("balance_update_id");

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_balance_update_shape_check";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_balance_update_shape_check"
  CHECK ("balance_update_id" IS NULL OR ("flow" IN ('income', 'expense') AND "recurrence_id" IS NULL));
