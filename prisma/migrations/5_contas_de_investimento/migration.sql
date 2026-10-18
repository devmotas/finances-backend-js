-- CreateTable
CREATE TABLE IF NOT EXISTS "investment_accounts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'investment',
    "initial_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "initial_balance_date" DATE NOT NULL,
    "target_balance" DECIMAL(15,2),
    "legacy_category_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "investment_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "investment_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "investment_accounts_role_check" CHECK ("role" IN ('investment', 'reserve', 'short_term_reserve')),
    CONSTRAINT "investment_accounts_target_only_short_term_check" CHECK ("target_balance" IS NULL OR "role" = 'short_term_reserve')
);

CREATE UNIQUE INDEX IF NOT EXISTS "investment_accounts_legacy_category_id_key" ON "investment_accounts"("legacy_category_id");
CREATE INDEX IF NOT EXISTS "investment_accounts_user_id_idx" ON "investment_accounts"("user_id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "balance_updates" (
    "id" BIGSERIAL NOT NULL,
    "investment_account_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "balance_updates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "balance_updates_investment_account_id_fkey" FOREIGN KEY ("investment_account_id") REFERENCES "investment_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "balance_updates_investment_account_id_date_key" ON "balance_updates"("investment_account_id", "date");

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "investment_account_id" BIGINT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "direction" VARCHAR(16);
ALTER TABLE "transactions" ALTER COLUMN "category_id" DROP NOT NULL;

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_investment_account_id_fkey";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_investment_account_id_fkey" FOREIGN KEY ("investment_account_id") REFERENCES "investment_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "transactions_investment_account_id_idx" ON "transactions"("investment_account_id");

-- Data: cada categoria de investimento vira uma conta com o mesmo id (de-para em legacy_category_id)
INSERT INTO "investment_accounts" ("id", "user_id", "name", "role", "initial_balance", "initial_balance_date", "legacy_category_id", "created_at")
SELECT c."id", c."user_id", c."name",
       CASE WHEN c."name" ILIKE '%reserva%' THEN 'reserve' ELSE 'investment' END,
       c."opening_balance_amount", c."created_at"::date, c."id", c."created_at"
FROM "categories" c
WHERE c."flow" = 'investment'
  AND NOT EXISTS (SELECT 1 FROM "investment_accounts" a WHERE a."legacy_category_id" = c."id");

SELECT setval(pg_get_serial_sequence('investment_accounts', 'id'), GREATEST((SELECT MAX("id") FROM "investment_accounts"), 1));

-- Data: aporte e resgate passam a ter valor positivo com direção
UPDATE "transactions" AS t
SET "investment_account_id" = a."id",
    "direction" = CASE WHEN t."amount" < 0 THEN 'withdrawal' ELSE 'contribution' END,
    "amount" = ABS(t."amount")
FROM "investment_accounts" a
WHERE a."legacy_category_id" = t."category_id"
  AND t."flow" = 'investment'
  AND t."investment_account_id" IS NULL;

-- AddCheckConstraint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_direction_check";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_direction_check"
  CHECK ("direction" IN ('contribution', 'withdrawal'));

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_investment_shape_check";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_investment_shape_check"
  CHECK (
    ("flow" = 'investment') = ("investment_account_id" IS NOT NULL)
    AND ("investment_account_id" IS NULL) = ("direction" IS NULL)
    AND ("investment_account_id" IS NULL OR "amount" > 0)
    AND ("investment_account_id" IS NOT NULL OR "category_id" IS NOT NULL)
  );
