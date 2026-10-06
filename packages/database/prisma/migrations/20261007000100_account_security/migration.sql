-- Minha conta e seguranca: limites de alteracao (nome, e-mail, senha) e verificacao em duas etapas.
--  * account_changes: so o tipo e o instante de cada alteracao (nunca o valor), para contar por mes e por ano.
--  * users.mfa_*: o fator TOTP vive no provedor de login; aqui so o id dele e quando foi ativado (a API exige o codigo no login).
--  * profiles.security_prompt_answered_at: a pergunta do primeiro acesso ("ativar a verificacao em duas etapas?") sai uma vez so.
-- Tudo aditivo e compativel com a versao anterior da API.

CREATE TYPE "account_change_kind" AS ENUM ('NAME', 'EMAIL', 'PASSWORD');

CREATE TABLE account_changes (
  id         uuid                  NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid                  NOT NULL,
  kind       "account_change_kind" NOT NULL,
  created_at timestamptz(6)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT account_changes_pkey PRIMARY KEY (id),
  CONSTRAINT account_changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX account_changes_user_id_kind_created_at_idx ON account_changes (user_id, kind, created_at);

-- A pessoa so le o proprio historico; quem grava e o servidor (dono), que ignora RLS.
GRANT SELECT ON account_changes TO app_user;
ALTER TABLE account_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_changes_owner_select ON account_changes FOR SELECT TO app_user
  USING (user_id = app_current_user_id());

ALTER TABLE users
  ADD COLUMN mfa_factor_id varchar(64),
  ADD COLUMN mfa_enabled_at timestamptz(6);

-- trial_intro_seen_at: o aviso "voce esta no teste gratis de 30 dias" sai uma vez so (e so com a cobranca ligada).
ALTER TABLE profiles
  ADD COLUMN security_prompt_answered_at timestamptz(6),
  ADD COLUMN trial_intro_seen_at timestamptz(6);
