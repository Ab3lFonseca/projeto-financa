-- =============================================================================
-- Open Finance: cartões (limite, fatura, vencimento) e investimentos (CDB, caixinhas,
-- cofrinhos, fundos...) com histórico diário.
--
-- Parte 1 (estrutura) foi gerada por `prisma migrate diff` a partir do schema.prisma.
-- Parte 2 (abaixo) é o que o Prisma não modela: restrições, gatilho de updated_at, chaves
-- compostas deferidas, grants e Row Level Security — o mesmo padrão da migration anterior.
-- Os investimentos são SOMENTE LEITURA para o usuário (app_user só tem SELECT): quem grava
-- é a sincronização, que roda como dono e filtra por user_id.
-- =============================================================================

-- ----- Parte 1: estrutura ----------------------------------------------------

-- AlterTable
ALTER TABLE "bank_connections" ADD COLUMN     "auto_import" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "bank_connection_accounts" ADD COLUMN     "available_credit_cents" BIGINT,
ADD COLUMN     "bill_close_date" DATE,
ADD COLUMN     "bill_due_date" DATE,
ADD COLUMN     "card_brand" VARCHAR(30),
ADD COLUMN     "credit_limit_cents" BIGINT,
ADD COLUMN     "minimum_payment_cents" BIGINT,
ADD COLUMN     "provider_data_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "bank_investments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider_investment_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "subtype" VARCHAR(40),
    "issuer" VARCHAR(200),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "balance_cents" BIGINT NOT NULL,
    "invested_cents" BIGINT,
    "profit_cents" BIGINT,
    "withdrawable_cents" BIGINT,
    "rate_type" VARCHAR(20),
    "rate" DECIMAL(12,4),
    "fixed_annual_rate" DECIMAL(12,4),
    "annual_rate" DECIMAL(12,4),
    "issue_date" DATE,
    "due_date" DATE,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_investment_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "balance_cents" BIGINT NOT NULL,
    "invested_cents" BIGINT,
    "profit_cents" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_investment_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_investments_user_id_closed_at_idx" ON "bank_investments"("user_id", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "bank_investments_connection_id_provider_investment_id_key" ON "bank_investments"("connection_id", "provider_investment_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_investments_user_id_id_key" ON "bank_investments"("user_id", "id");

-- CreateIndex
CREATE INDEX "bank_investment_snapshots_user_id_snapshot_date_idx" ON "bank_investment_snapshots"("user_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_investment_snapshots_investment_id_snapshot_date_key" ON "bank_investment_snapshots"("investment_id", "snapshot_date");

-- AddForeignKey
ALTER TABLE "bank_investments" ADD CONSTRAINT "bank_investments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_investments" ADD CONSTRAINT "bank_investments_user_id_connection_id_fkey" FOREIGN KEY ("user_id", "connection_id") REFERENCES "bank_connections"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_investment_snapshots" ADD CONSTRAINT "bank_investment_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_investment_snapshots" ADD CONSTRAINT "bank_investment_snapshots_user_id_investment_id_fkey" FOREIGN KEY ("user_id", "investment_id") REFERENCES "bank_investments"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ----- Parte 2: integridade, isolamento e permissões -------------------------

ALTER TABLE bank_connection_accounts
  ADD CONSTRAINT ck_bank_connection_accounts_credit CHECK (
    (credit_limit_cents IS NULL OR credit_limit_cents >= 0)
    AND (minimum_payment_cents IS NULL OR minimum_payment_cents >= 0)
  );

ALTER TABLE bank_investments
  ADD CONSTRAINT ck_bank_investments_name CHECK (char_length(btrim(name)) > 0),
  ADD CONSTRAINT ck_bank_investments_balance CHECK (balance_cents >= 0),
  ADD CONSTRAINT ck_bank_investments_invested CHECK (invested_cents IS NULL OR invested_cents >= 0),
  ADD CONSTRAINT ck_bank_investments_withdrawable CHECK (withdrawable_cents IS NULL OR withdrawable_cents >= 0),
  ADD CONSTRAINT ck_bank_investments_status CHECK (status IN ('ACTIVE', 'PENDING', 'TOTAL_WITHDRAWAL')),
  ADD CONSTRAINT ck_bank_investments_period CHECK (due_date IS NULL OR issue_date IS NULL OR due_date >= issue_date);

ALTER TABLE bank_investment_snapshots
  ADD CONSTRAINT ck_bank_investment_snapshots_balance CHECK (balance_cents >= 0);

-- updated_at correto mesmo para UPDATEs fora do Prisma (a migration anterior só cobriu as tabelas que existiam).
CREATE TRIGGER trg_bank_investments_set_updated_at
  BEFORE UPDATE ON bank_investments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FKs compostas deferidas até o COMMIT: a exclusão LGPD (DELETE FROM users) apaga tudo por cascata.
ALTER TABLE bank_investments ALTER CONSTRAINT bank_investments_user_id_connection_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE bank_investment_snapshots ALTER CONSTRAINT bank_investment_snapshots_user_id_investment_id_fkey DEFERRABLE INITIALLY DEFERRED;

-- Somente leitura para o usuário.
GRANT SELECT ON bank_investments, bank_investment_snapshots TO app_user;

ALTER TABLE bank_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_investment_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_investments_owner_select ON bank_investments FOR SELECT TO app_user
  USING (user_id = app_current_user_id());
CREATE POLICY bank_investment_snapshots_owner_select ON bank_investment_snapshots FOR SELECT TO app_user
  USING (user_id = app_current_user_id());