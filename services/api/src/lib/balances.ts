import { Prisma } from "@app/database";
import type { ISODate } from "@app/shared";
import { num } from "./dto";
import type { Tx } from "./db";

/**
 * Saldo de cada conta até `today`:
 *   saldo inicial + receitas + transferências recebidas − despesas − transferências enviadas
 *   − pagamentos de fatura
 * Só entram lançamentos EFETIVADOS (POSTED), não excluídos, com data <= hoje.
 * Compras no cartão não mexem no saldo da conta até a fatura ser paga.
 */
export async function accountBalances(
  tx: Tx,
  userId: string,
  today: ISODate,
  accountIds?: string[],
): Promise<Map<string, number>> {
  const idFilter =
    accountIds && accountIds.length > 0
      ? Prisma.sql`AND a.id IN (${Prisma.join(accountIds.map((id) => Prisma.sql`${id}::uuid`))})`
      : Prisma.empty;

  const rows = await tx.$queryRaw<{ id: string; balance: bigint }[]>(Prisma.sql`
    SELECT a.id,
           (a.opening_balance_cents + COALESCE(t.net, 0) - COALESCE(p.paid, 0))::bigint AS balance
    FROM accounts a
    LEFT JOIN (
      SELECT account_id,
             SUM(CASE WHEN type = 'INCOME' OR (type = 'TRANSFER' AND transfer_side = 'IN')
                      THEN amount_cents ELSE -amount_cents END)::bigint AS net
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND deleted_at IS NULL
        AND status = 'POSTED'
        AND occurred_on <= ${today}::date
        AND account_id IS NOT NULL
      GROUP BY account_id
    ) t ON t.account_id = a.id
    LEFT JOIN (
      SELECT account_id, SUM(amount_cents)::bigint AS paid
      FROM invoice_payments
      WHERE user_id = ${userId}::uuid AND paid_on <= ${today}::date
      GROUP BY account_id
    ) p ON p.account_id = a.id
    WHERE a.user_id = ${userId}::uuid
      AND a.deleted_at IS NULL
      ${idFilter}
  `);
  return new Map(rows.map((r) => [r.id, num(r.balance)]));
}
