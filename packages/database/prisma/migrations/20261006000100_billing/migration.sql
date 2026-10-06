-- Cobrança: assinatura mensal depois de 30 dias grátis.
--  * O fim do teste grátis é calculado pelo servidor (cadastro + TRIAL_DAYS); `trial_ends_at` só guarda uma prorrogação feita pelo suporte.
--  * `provider_customer_id` liga a assinatura ao cliente no provedor de pagamento (portal para trocar cartão e cancelar).
--  * `cancel_at_period_end`: cancelada, mas vale até o fim do período já pago.
--  * `investments_addon`: adicional "Rendimentos" (CDI/CDB, porquinhos e investimentos), cobrado por cima do plano básico.
ALTER TABLE subscriptions
  ADD COLUMN provider_customer_id varchar(128),
  ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN investments_addon boolean NOT NULL DEFAULT false;

-- Idempotência dos webhooks do provedor de pagamento. Sem payload (traria e-mail e dados do pagamento).
CREATE TABLE billing_events (
  id           uuid         NOT NULL DEFAULT gen_random_uuid(),
  provider     varchar(20)  NOT NULL,
  event_id     varchar(128) NOT NULL,
  event_type   varchar(80)  NOT NULL,
  received_at  timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at timestamptz(6),
  CONSTRAINT billing_events_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX billing_events_provider_event_id_key ON billing_events (provider, event_id);
CREATE INDEX billing_events_received_at_idx ON billing_events (received_at);

-- Como audit_logs e webhook_events: sem acesso para `app_user` e sem policy (só o servidor, que ignora RLS, lê e escreve).
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
