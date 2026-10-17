-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expense_group" VARCHAR(255),
    "flow" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "opening_balance_amount" DECIMAL(15,2) NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "user_id" BIGINT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrences" (
    "id" BIGSERIAL NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "description" VARCHAR(500),
    "installment_total" INTEGER,
    "months" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "category_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,

    CONSTRAINT "recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" BIGSERIAL NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "date" DATE NOT NULL,
    "description" VARCHAR(500),
    "flow" VARCHAR(32) NOT NULL,
    "recurrence_index" INTEGER,
    "schedule" VARCHAR(255) NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "category_id" BIGINT NOT NULL,
    "recurrence_id" BIGINT,
    "user_id" BIGINT NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "default_recurrence_months" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "emergency_fund_target_months" INTEGER NOT NULL,
    "name" VARCHAR(255),
    "password" VARCHAR(255) NOT NULL,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uk6dotkott2kjsp8vw4d0m25fb7" ON "users"("email");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "fkghuylkwuedgl2qahxjt8g41kb" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "fk1w576bsbwn71xeoc9sib8bqym" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "fkeclrv9jf5tuxcuccq9y7pbk77" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fkqwv7rmvc8va8rep7piikrojds" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fkscpo43kqw66yeof9mcljtscgl" FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fksqqi7sneo04kast0o138h19mv" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

