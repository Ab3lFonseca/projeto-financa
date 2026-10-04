import { Prisma } from "@app/database";
import {
  deriveInvoiceStatus,
  fromISODate,
  invoiceCycleFor,
  type InvoiceDTO,
  type ISODate,
} from "@app/shared";
import type { Tx } from "./db";
import { dateOut, num } from "./dto";

export type InvoiceTotals = { totalCents: number; paidCents: number };

type Filter = { invoiceIds?: string[]; cardIds?: string[] };

function fragment(alias: string, filter: Filter): Prisma.Sql {
  if (filter.invoiceIds) {
    return Prisma.sql`AND ${Prisma.raw(alias)}.id IN (${Prisma.join(filter.invoiceIds.map((id) => Prisma.sql`${id}::uuid`))})`;
  }
  if (filter.cardIds) {
    return Prisma.sql`AND ${Prisma.raw(alias)}.card_id IN (${Prisma.join(filter.cardIds.map((id) => Prisma.sql`${id}::uuid`))})`;
  }
  return Prisma.empty;
}

/**
 * Total (compras − estornos) e valor pago de cada fatura.
 * Só compras EFETIVADAS e não excluídas contam.
 */
export async function invoiceTotals(tx: Tx, userId: string, filter: Filter): Promise<Map<string, InvoiceTotals>> {
  if ((filter.invoiceIds && filter.invoiceIds.length === 0) || (filter.cardIds && filter.cardIds.length === 0)) {
    return new Map();
  }
  const rows = await tx.$queryRaw<{ id: string; total: bigint; paid: bigint }[]>(Prisma.sql`
    SELECT i.id,
           COALESCE(t.total, 0)::bigint AS total,
           COALESCE(p.paid, 0)::bigint AS paid
    FROM invoices i
    LEFT JOIN (
      SELECT tr.invoice_id,
             SUM(CASE WHEN tr.type = 'INCOME' THEN -tr.amount_cents ELSE tr.amount_cents END)::bigint AS total
      FROM transactions tr
      WHERE tr.user_id = ${userId}::uuid
        AND tr.deleted_at IS NULL
        AND tr.status = 'POSTED'
        AND tr.invoice_id IN (SELECT i2.id FROM invoices i2 WHERE i2.user_id = ${userId}::uuid ${fragment("i2", filter)})
      GROUP BY tr.invoice_id
    ) t ON t.invoice_id = i.id
    LEFT JOIN (
      SELECT ip.invoice_id, SUM(ip.amount_cents)::bigint AS paid
      FROM invoice_payments ip
      WHERE ip.user_id = ${userId}::uuid
        AND ip.invoice_id IN (SELECT i3.id FROM invoices i3 WHERE i3.user_id = ${userId}::uuid ${fragment("i3", filter)})
      GROUP BY ip.invoice_id
    ) p ON p.invoice_id = i.id
    WHERE i.user_id = ${userId}::uuid ${fragment("i", filter)}
  `);
  return new Map(rows.map((r) => [r.id, { totalCents: num(r.total), paidCents: num(r.paid) }]));
}

type InvoiceRow = {
  id: string;
  cardId: string;
  referenceMonth: Date;
  closingDate: Date;
  dueDate: Date;
};

export function toInvoiceDTO(inv: InvoiceRow, totals: InvoiceTotals | undefined, today: ISODate): InvoiceDTO {
  const totalCents = totals?.totalCents ?? 0;
  const paidCents = totals?.paidCents ?? 0;
  return {
    id: inv.id,
    cardId: inv.cardId,
    referenceMonth: dateOut(inv.referenceMonth),
    closingDate: dateOut(inv.closingDate),
    dueDate: dateOut(inv.dueDate),
    status: deriveInvoiceStatus({ closingDate: dateOut(inv.closingDate), totalCents, paidCents, today }),
    totalCents,
    paidCents,
    remainingCents: Math.max(totalCents - paidCents, 0),
  };
}

/**
 * Fatura que recebe uma compra feita em `purchaseDate`. Cria sob demanda.
 * (createMany + skipDuplicates evita abortar a transação numa corrida.)
 */
export async function ensureInvoice(
  tx: Tx,
  userId: string,
  card: { id: string; closingDay: number; dueDay: number },
  purchaseDate: ISODate,
): Promise<string> {
  const cycle = invoiceCycleFor(purchaseDate, card.closingDay, card.dueDay);
  const referenceMonth = fromISODate(cycle.referenceMonth);
  await tx.invoice.createMany({
    data: [
      {
        userId,
        cardId: card.id,
        referenceMonth,
        closingDate: fromISODate(cycle.closingDate),
        dueDate: fromISODate(cycle.dueDate),
      },
    ],
    skipDuplicates: true,
  });
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { cardId_referenceMonth: { cardId: card.id, referenceMonth } },
    select: { id: true },
  });
  return invoice.id;
}

/** Persiste o status derivado (usado em consultas e jobs). A fonte da verdade continua sendo os dados. */
export async function syncInvoiceStatuses(tx: Tx, userId: string, invoiceIds: string[], today: ISODate): Promise<void> {
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return;
  const invoices = await tx.invoice.findMany({ where: { userId, id: { in: ids } } });
  const totals = await invoiceTotals(tx, userId, { invoiceIds: ids });
  for (const inv of invoices) {
    const dto = toInvoiceDTO(inv, totals.get(inv.id), today);
    if (dto.status !== inv.status) {
      await tx.invoice.update({ where: { id: inv.id }, data: { status: dto.status } });
    }
  }
}
