-- =============================================================================
-- Constraints, triggers, FKs deferidas, RLS e papéis que o Prisma não modela.
--
-- IMPORTANTE: esta migration roda DEPOIS da migration de estrutura gerada a partir do
-- schema.prisma (pasta 20261004000000_init). Mantenha a ordem dos timestamps.
-- Racional de cada bloco: docs/database.md
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Funções auxiliares
-- -----------------------------------------------------------------------------

-- Usuário "da requisição". A API define app.user_id por transação (SET LOCAL).
-- Sem valor definido => NULL => nenhuma linha passa pelas policies (falha fechada).
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- Mantém updated_at correto mesmo para UPDATEs feitos fora do Prisma.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      'trg_' || r.table_name || '_set_updated_at',
      r.table_name
    );
  END LOOP;
END
$$;


-- -----------------------------------------------------------------------------
-- 2. CHECK constraints (integridade que não depende só da API)
-- -----------------------------------------------------------------------------

ALTER TABLE users
  ADD CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email));

ALTER TABLE profiles
  ADD CONSTRAINT ck_profiles_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT ck_profiles_timezone CHECK (char_length(btrim(timezone)) > 0);

ALTER TABLE accounts
  ADD CONSTRAINT ck_accounts_name CHECK (char_length(btrim(name)) > 0),
  ADD CONSTRAINT ck_accounts_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT ck_accounts_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE credit_cards
  ADD CONSTRAINT ck_credit_cards_name CHECK (char_length(btrim(name)) > 0),
  ADD CONSTRAINT ck_credit_cards_limit CHECK (limit_cents >= 0),
  ADD CONSTRAINT ck_credit_cards_closing_day CHECK (closing_day BETWEEN 1 AND 31),
  ADD CONSTRAINT ck_credit_cards_due_day CHECK (due_day BETWEEN 1 AND 31),
  ADD CONSTRAINT ck_credit_cards_last4 CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  ADD CONSTRAINT ck_credit_cards_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE invoices
  ADD CONSTRAINT ck_invoices_reference_month_first_day CHECK (EXTRACT(DAY FROM reference_month) = 1),
  ADD CONSTRAINT ck_invoices_due_after_closing CHECK (due_date >= closing_date);

ALTER TABLE invoice_payments
  ADD CONSTRAINT ck_invoice_payments_amount CHECK (amount_cents > 0);

ALTER TABLE categories
  ADD CONSTRAINT ck_categories_name CHECK (char_length(btrim(name)) > 0),
  ADD CONSTRAINT ck_categories_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT ck_categories_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);

-- Lançamentos: regras de forma (quem pode combinar com quem).
ALTER TABLE transactions
  ADD CONSTRAINT ck_transactions_amount_positive CHECK (amount_cents > 0),
  ADD CONSTRAINT ck_transactions_description CHECK (char_length(btrim(description)) > 0),
  -- Origem: ou uma conta, ou um cartão (nunca os dois, nunca nenhum).
  ADD CONSTRAINT ck_transactions_source_xor CHECK ((account_id IS NULL) <> (card_id IS NULL)),
  -- Cartão <=> forma de pagamento CREDIT. Transferência não usa cartão.
  ADD CONSTRAINT ck_transactions_card_payment CHECK ((card_id IS NOT NULL) = (payment_method = 'CREDIT')),
  ADD CONSTRAINT ck_transactions_card_not_transfer CHECK (card_id IS NULL OR type <> 'TRANSFER'),
  ADD CONSTRAINT ck_transactions_invoice_needs_card CHECK (invoice_id IS NULL OR card_id IS NOT NULL),
  -- Transferência: tem cabeçalho e lado (OUT/IN), não tem categoria.
  ADD CONSTRAINT ck_transactions_transfer_shape CHECK (
    (type = 'TRANSFER') = (transfer_id IS NOT NULL)
    AND (type = 'TRANSFER') = (transfer_side IS NOT NULL)
  ),
  ADD CONSTRAINT ck_transactions_transfer_no_category CHECK (type <> 'TRANSFER' OR category_id IS NULL),
  -- Parcelas: grupo, número e total andam juntos; 1 <= número <= total.
  ADD CONSTRAINT ck_transactions_installments CHECK (
    (installment_group_id IS NULL) = (installment_no IS NULL)
    AND (installment_no IS NULL) = (installment_total IS NULL)
    AND (
      installment_no IS NULL
      OR (installment_total BETWEEN 2 AND 120 AND installment_no BETWEEN 1 AND installment_total)
    )
  ),
  ADD CONSTRAINT ck_transactions_version CHECK (version >= 1);

ALTER TABLE transfers
  ADD CONSTRAINT ck_transfers_amount CHECK (amount_cents > 0),
  ADD CONSTRAINT ck_transfers_distinct_accounts CHECK (from_account_id <> to_account_id);

ALTER TABLE recurring_rules
  ADD CONSTRAINT ck_recurring_rules_type CHECK (type <> 'TRANSFER'),
  ADD CONSTRAINT ck_recurring_rules_description CHECK (char_length(btrim(description)) > 0),
  ADD CONSTRAINT ck_recurring_rules_amount CHECK (amount_cents > 0),
  ADD CONSTRAINT ck_recurring_rules_source_xor CHECK ((account_id IS NULL) <> (card_id IS NULL)),
  ADD CONSTRAINT ck_recurring_rules_card_payment CHECK ((card_id IS NOT NULL) = (payment_method = 'CREDIT')),
  ADD CONSTRAINT ck_recurring_rules_interval CHECK (interval_count >= 1),
  ADD CONSTRAINT ck_recurring_rules_day_of_month CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  ADD CONSTRAINT ck_recurring_rules_period CHECK (end_date IS NULL OR end_date >= start_date);

ALTER TABLE budgets
  ADD CONSTRAINT ck_budgets_amount CHECK (amount_cents > 0),
  ADD CONSTRAINT ck_budgets_month_first_day CHECK (EXTRACT(DAY FROM month) = 1),
  ADD CONSTRAINT ck_budgets_alert_pct CHECK (alert_pct BETWEEN 1 AND 100);

ALTER TABLE goals
  ADD CONSTRAINT ck_goals_name CHECK (char_length(btrim(name)) > 0),
  ADD CONSTRAINT ck_goals_target CHECK (target_cents > 0),
  ADD CONSTRAINT ck_goals_initial CHECK (initial_cents >= 0),
  ADD CONSTRAINT ck_goals_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE goal_contributions
  ADD CONSTRAINT ck_goal_contributions_amount CHECK (amount_cents <> 0);

ALTER TABLE bank_connection_accounts
  ADD CONSTRAINT ck_bank_connection_accounts_target CHECK (NOT (account_id IS NOT NULL AND card_id IS NOT NULL));

ALTER TABLE bank_transactions
  ADD CONSTRAINT ck_bank_transactions_amount CHECK (amount_cents > 0);


-- -----------------------------------------------------------------------------
-- 3. FKs compostas (user_id, id) deferidas até o COMMIT
--
-- Permite `DELETE FROM users WHERE id = ...` (exclusão LGPD) apagar tudo por cascata
-- de user_id sem depender da ordem em que as tabelas filhas são removidas.
-- A integridade continua garantida: a verificação ocorre no fim da transação.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND array_length(conkey, 1) > 1
  LOOP
    EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED', r.tbl, r.conname);
  END LOOP;
END
$$;


-- -----------------------------------------------------------------------------
-- 4. Papel da aplicação + grants (menor privilégio)
--
-- `app_user` é o papel sob o qual as requisições de usuário rodam (SET LOCAL ROLE).
-- Ele NÃO ignora RLS. O papel de login da API precisa ser membro dele:
--     GRANT app_user TO <papel_de_login_da_api>;   (ver docs/database.md)
-- Jobs/administração rodam como dono (ignora RLS) e filtram por user_id explicitamente.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT app_user TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO app_user;

-- Somente leitura
GRANT SELECT ON banks, users, subscriptions TO app_user;

-- Leitura e escrita nas tabelas do usuário
GRANT SELECT, INSERT, UPDATE, DELETE ON
  profiles, accounts, credit_cards, invoices, invoice_payments, categories,
  transactions, transfers, recurring_rules, budgets, goals, goal_contributions,
  bank_connections, bank_connection_accounts, bank_transactions,
  notifications, push_tokens, idempotency_keys
TO app_user;

-- Consentimentos e pedidos LGPD: nunca apagados pelo usuário (histórico probatório)
GRANT SELECT, INSERT, UPDATE ON consents TO app_user;
GRANT SELECT, INSERT ON privacy_requests TO app_user;

-- audit_logs e webhook_events: sem acesso para app_user (somente servidor).


-- -----------------------------------------------------------------------------
-- 5. Row Level Security (segunda camada de isolamento por usuário)
--
-- Camada 1 é a API (sempre filtra por user_id) + FKs compostas.
-- RLS habilitado em TODAS as tabelas: sem policy => ninguém (exceto dono/BYPASSRLS) lê.
-- Isso também fecha a Data API do Supabase (papéis anon/authenticated).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Tabelas com user_id: o usuário só enxerga/escreve as próprias linhas.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'consents', 'accounts', 'credit_cards', 'invoices', 'invoice_payments',
    'categories', 'transactions', 'transfers', 'recurring_rules', 'budgets', 'goals',
    'goal_contributions', 'bank_connections', 'bank_connection_accounts', 'bank_transactions',
    'notifications', 'push_tokens', 'idempotency_keys', 'privacy_requests'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO app_user
         USING (user_id = app_current_user_id())
         WITH CHECK (user_id = app_current_user_id())',
      t || '_owner_all', t
    );
  END LOOP;
END
$$;

-- Casos especiais
CREATE POLICY users_self_select ON users FOR SELECT TO app_user
  USING (id = app_current_user_id());

CREATE POLICY subscriptions_self_select ON subscriptions FOR SELECT TO app_user
  USING (user_id = app_current_user_id());

CREATE POLICY banks_read_all ON banks FOR SELECT TO app_user
  USING (true);

-- Papéis da Data API do Supabase (se existirem): sem acesso algum às tabelas.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END
$$;


-- -----------------------------------------------------------------------------
-- 6. Auto-verificação: falha a migration se alguma tabela escapar do isolamento
-- (protege contra tabelas futuras esquecidas ao editar este arquivo)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname <> '_prisma_migrations'
    AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tabelas sem RLS habilitado: %', missing;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'user_id'
    )
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tabelas com user_id sem policy de RLS: %', missing;
  END IF;
END
$$;
