-- Aviso "Function Search Path Mutable" do Advisor de segurança do Supabase.
--
-- Uma função sem search_path fixo resolve nomes pelo search_path de quem a chama; um papel que consiga criar objetos num
-- schema do caminho poderia "sombrear" uma função/operador usada aqui. Com search_path vazio só vale o pg_catalog (sempre
-- consultado), e as duas funções só usam current_setting, NULLIF, cast para uuid e now(), todos do pg_catalog.
ALTER FUNCTION app_current_user_id() SET search_path = '';
ALTER FUNCTION set_updated_at() SET search_path = '';