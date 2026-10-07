-- Ciclo de cobranca da assinatura (mensal ou anual). Aditivo e compativel com a versao anterior da API: coluna opcional, sem valor
-- inicial. Quem ja assina continua valendo; o ciclo e preenchido na proxima leitura da assinatura no provedor (webhook).

ALTER TABLE subscriptions
  ADD COLUMN billing_interval varchar(8),
  ADD CONSTRAINT ck_subscriptions_billing_interval CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));
