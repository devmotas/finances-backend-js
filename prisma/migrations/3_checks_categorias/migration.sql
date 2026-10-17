-- AddCheckConstraint
ALTER TABLE "categories" ADD CONSTRAINT "categories_flow_check"
  CHECK ("flow" IN ('income', 'expense', 'investment'));

ALTER TABLE "categories" ADD CONSTRAINT "categories_expense_group_check"
  CHECK ("expense_group" IN ('essential', 'nonEssential'));

ALTER TABLE "categories" ADD CONSTRAINT "categories_only_expenses_have_group_check"
  CHECK (("flow" = 'expense') = ("expense_group" IS NOT NULL));

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_flow_check"
  CHECK ("flow" IN ('income', 'expense', 'investment'));

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_schedule_check"
  CHECK ("schedule" IN ('fixed', 'variable'));
