-- Quadro de sugestoes: cada usuario envia sugestoes e o administrador marca cada uma como valida (verde, passa para a validacao), nao valida
-- (vermelho) ou em analise (branco, o estado em que toda sugestao chega).
--  * Escrita so pelo servidor (dono, ignora RLS); a pessoa so le as proprias.
--  * Apagar a conta apaga as sugestoes (ON DELETE CASCADE); apagar quem decidiu so limpa o campo decided_by_id.
-- Aditivo e compativel com a versao anterior da API.

CREATE TABLE suggestions (
  id            uuid           NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid           NOT NULL,
  body          varchar(1000)  NOT NULL,
  status        varchar(10)    NOT NULL DEFAULT 'PENDING',
  admin_note    varchar(500),
  decided_by_id uuid,
  decided_at    timestamptz(6),
  created_at    timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT suggestions_decided_by_id_fkey FOREIGN KEY (decided_by_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ck_suggestions_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT ck_suggestions_body CHECK (char_length(btrim(body)) >= 10)
);

CREATE INDEX suggestions_user_id_created_at_idx ON suggestions (user_id, created_at);
CREATE INDEX suggestions_status_created_at_idx ON suggestions (status, created_at);

GRANT SELECT ON suggestions TO app_user;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY suggestions_owner_select ON suggestions FOR SELECT TO app_user
  USING (user_id = app_current_user_id());
