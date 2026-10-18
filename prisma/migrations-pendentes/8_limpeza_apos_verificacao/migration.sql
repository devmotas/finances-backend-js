-- ÚLTIMO PASSO: aplicar só depois de verificar o ensaio das migrations 4 e 5 e do frontend usar a API v2.
-- Para aplicar: mover esta pasta para prisma/migrations/, remover do schema.prisma os campos
-- transactions.schedule e recurrences.months, rodar "npx prisma generate" e publicar o backend junto.

-- Data: lançamentos de investimento deixam de apontar para categorias
UPDATE "transactions" SET "category_id" = NULL WHERE "investment_account_id" IS NOT NULL;
UPDATE "investment_accounts" SET "legacy_category_id" = NULL WHERE "legacy_category_id" IS NOT NULL;
DELETE FROM "categories" c
WHERE c."flow" = 'investment'
  AND NOT EXISTS (SELECT 1 FROM "transactions" t WHERE t."category_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "recurrences" r WHERE r."category_id" = c."id");

ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_flow_check";
ALTER TABLE "categories" ADD CONSTRAINT "categories_flow_check" CHECK ("flow" IN ('income', 'expense'));

-- DropColumn
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_schedule_check";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "schedule";
ALTER TABLE "recurrences" DROP COLUMN IF EXISTS "months";
