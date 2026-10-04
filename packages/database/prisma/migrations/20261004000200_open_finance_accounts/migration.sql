-- Open Finance: tipo (conta/cartão) e último saldo informado pelo provedor em cada conta vinculada.
-- O tipo define o sinal das transações (em cartão, valor positivo = compra; em conta, positivo = entrada).

ALTER TABLE "bank_connection_accounts"
  ADD COLUMN "kind" VARCHAR(10) NOT NULL DEFAULT 'BANK',
  ADD COLUMN "balance_cents" BIGINT;

ALTER TABLE "bank_connection_accounts"
  ADD CONSTRAINT ck_bank_connection_accounts_kind CHECK (kind IN ('BANK', 'CREDIT'));
