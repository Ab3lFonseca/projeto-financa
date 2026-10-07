-- Insignias: cada nivel ganho (1 = Bronze ... 6 = Mestre) de cada insignia. Os niveis, uma vez ganhos, nunca saem (apagar lancamentos nao desconquista).
--  * seen_at: nulo ate a pessoa ver a comemoracao do nivel (o app mostra na tela assim que ganha e marca como vista).
--  * O catalogo (nomes, textos e metas de cada nivel) vive no codigo; aqui so quem ganhou o que e quando. Sem valores financeiros.
-- Aditivo e compativel com a versao anterior da API.

CREATE TABLE user_badges (
  id         uuid           NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid           NOT NULL,
  badge_id   varchar(40)    NOT NULL,
  tier       smallint       NOT NULL,
  earned_at  timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  seen_at    timestamptz(6),
  CONSTRAINT user_badges_pkey PRIMARY KEY (id),
  CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_user_badges_tier CHECK (tier BETWEEN 1 AND 6),
  CONSTRAINT user_badges_user_id_badge_id_tier_key UNIQUE (user_id, badge_id, tier)
);

CREATE INDEX user_badges_user_id_earned_at_idx ON user_badges (user_id, earned_at);

-- A pessoa so le as proprias; quem grava e o servidor (dono), que ignora RLS.
GRANT SELECT ON user_badges TO app_user;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_badges_owner_select ON user_badges FOR SELECT TO app_user
  USING (user_id = app_current_user_id());
