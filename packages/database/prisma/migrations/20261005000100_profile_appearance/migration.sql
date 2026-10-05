-- Tema escolhido no app (preset + cores personalizadas), validado por Zod na API.
-- Nulo = a pessoa nunca personalizou; vale a coluna `theme` (SYSTEM/LIGHT/DARK).
ALTER TABLE profiles ADD COLUMN appearance jsonb;

-- Defesa em profundidade: o JSON é pequeno (um preset e 4 cores). O limite impede usar a coluna como depósito de dados.
ALTER TABLE profiles
  ADD CONSTRAINT ck_profiles_appearance_size CHECK (appearance IS NULL OR octet_length(appearance::text) <= 512);