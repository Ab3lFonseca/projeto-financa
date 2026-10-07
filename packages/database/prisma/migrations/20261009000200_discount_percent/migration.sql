-- Desconto da assinatura ganho com insignias (Ouro ou acima): percentual ja aplicado no provedor de pagamento. Aditivo e compativel com a
-- versao anterior da API (coluna com padrao 0; quem ja assina continua sem desconto ate ganhar o primeiro degrau).

ALTER TABLE subscriptions
  ADD COLUMN discount_percent smallint NOT NULL DEFAULT 0,
  ADD CONSTRAINT ck_subscriptions_discount_percent CHECK (discount_percent BETWEEN 0 AND 100);
