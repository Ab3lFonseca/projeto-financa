-- Transferencia recorrente (ex.: guardar R$ 200 por mes na reserva). Aditivo e compativel com a versao anterior da API: coluna opcional e
-- uma restricao que so AFROUXA a anterior (antes: type <> 'TRANSFER'). A regra de transferencia usa account_id como origem e to_account_id
-- como destino; sem cartao e sem categoria. As duas pernas geradas ficam em transactions (type TRANSFER); so a perna de SAIDA leva o
-- recurrence_id (a chave unica recurrence_id + occurred_on nao admite duas pernas da mesma regra no mesmo dia).

ALTER TABLE recurring_rules ADD COLUMN to_account_id uuid;

ALTER TABLE recurring_rules
  ADD CONSTRAINT recurring_rules_user_id_to_account_id_fkey
  FOREIGN KEY (user_id, to_account_id) REFERENCES accounts (user_id, id) ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE recurring_rules DROP CONSTRAINT ck_recurring_rules_type;

ALTER TABLE recurring_rules
  ADD CONSTRAINT ck_recurring_rules_transfer CHECK (
    (type = 'TRANSFER') = (to_account_id IS NOT NULL)
    AND (type <> 'TRANSFER' OR (card_id IS NULL AND category_id IS NULL AND account_id IS NOT NULL AND to_account_id <> account_id))
  );
