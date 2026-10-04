import {
  fromISODate,
  invoiceCycleFor,
  todayIn,
  type CardDTO,
  type InstallmentPlanDTO,
  type InvoiceDetailDTO,
} from "@app/shared";
import { dateOut, num, tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { invoiceTotals, toInvoiceDTO } from "../../lib/invoices";
import type { Tx } from "../../lib/db";
import { toBankDTO } from "../accounts/service";
import { toTransactionDTO, transactionInclude } from "../transactions/service";

const accountRef = { select: { id: true, name: true, deletedAt: true } } as const;
const bankSelect = { select: { id: true, compeCode: true, name: true, shortName: true, logoUrl: true } } as const;

export const cardInclude = { bank: bankSelect, payAccount: accountRef } as const;

export async function listCardDTOs(
  tx: Tx,
  user: { id: string; timezone: string },
  now: Date,
  opts: { ids?: string[]; includeArchived?: boolean } = {},
): Promise<CardDTO[]> {
  const today = todayIn(user.timezone, now);
  const cards = await tx.creditCard.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
    },
    include: cardInclude,
    orderBy: { createdAt: "asc" },
  });
  if (cards.length === 0) return [];

  const cardIds = cards.map((c) => c.id);
  const invoices = await tx.invoice.findMany({ where: { userId: user.id, cardId: { in: cardIds } } });
  const totals = await invoiceTotals(tx, user.id, { cardIds });

  return cards.map((card) => {
    const mine = invoices.filter((i) => i.cardId === card.id);
    const usedCents = mine.reduce((sum, inv) => {
      const t = totals.get(inv.id);
      return sum + Math.max((t?.totalCents ?? 0) - (t?.paidCents ?? 0), 0);
    }, 0);
    const cycle = invoiceCycleFor(today, card.closingDay, card.dueDay);
    const current = mine.find((i) => dateOut(i.referenceMonth) === cycle.referenceMonth);
    const limitCents = num(card.limitCents);
    return {
      id: card.id,
      name: card.name,
      bank: toBankDTO(card.bank),
      brand: card.brand,
      last4: card.last4,
      limitCents,
      usedCents,
      availableCents: limitCents - usedCents,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      payAccount: card.payAccount
        ? { id: card.payAccount.id, name: card.payAccount.name, deleted: card.payAccount.deletedAt !== null }
        : null,
      color: card.color,
      icon: card.icon,
      source: card.source,
      archived: card.archivedAt !== null,
      currentInvoice: current ? toInvoiceDTO(current, totals.get(current.id), today) : null,
      createdAt: tsOut(card.createdAt),
    };
  });
}

export async function invoiceDetail(
  tx: Tx,
  user: { id: string; timezone: string },
  now: Date,
  cardId: string,
  invoiceId: string,
): Promise<InvoiceDetailDTO> {
  const today = todayIn(user.timezone, now);
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, cardId, userId: user.id },
    include: {
      card: { select: { id: true, name: true } },
      payments: { include: { account: accountRef }, orderBy: { paidOn: "desc" } },
    },
  });
  if (!invoice) throw Errors.notFound("Fatura");
  const totals = await invoiceTotals(tx, user.id, { invoiceIds: [invoice.id] });
  const transactions = await tx.transaction.findMany({
    where: { userId: user.id, invoiceId: invoice.id, deletedAt: null },
    include: transactionInclude,
    orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
  });
  return {
    ...toInvoiceDTO(invoice, totals.get(invoice.id), today),
    card: invoice.card,
    transactions: transactions.map(toTransactionDTO),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      account: { id: p.account.id, name: p.account.name, deleted: p.account.deletedAt !== null },
      amountCents: num(p.amountCents),
      paidOn: dateOut(p.paidOn),
      notes: p.notes,
    })),
  };
}

/** Compras parceladas que ainda têm parcelas por vir. */
export async function installmentPlans(
  tx: Tx,
  user: { id: string; timezone: string },
  now: Date,
  cardId: string,
): Promise<InstallmentPlanDTO[]> {
  const today = todayIn(user.timezone, now);
  const open = await tx.transaction.findMany({
    where: {
      userId: user.id,
      cardId,
      deletedAt: null,
      installmentGroupId: { not: null },
      occurredOn: { gt: fromISODate(today) },
    },
    distinct: ["installmentGroupId"],
    select: { installmentGroupId: true },
  });
  const groupIds = open.map((o) => o.installmentGroupId!).filter(Boolean);
  if (groupIds.length === 0) return [];

  const rows = await tx.transaction.findMany({
    where: { userId: user.id, installmentGroupId: { in: groupIds }, deletedAt: null },
    include: { category: { select: { id: true, name: true, color: true } }, invoice: { select: { dueDate: true } } },
    orderBy: [{ installmentGroupId: "asc" }, { installmentNo: "asc" }],
  });

  const plans: InstallmentPlanDTO[] = [];
  for (const groupId of groupIds) {
    const parcels = rows.filter((r) => r.installmentGroupId === groupId);
    if (parcels.length === 0) continue;
    const past = parcels.filter((p) => dateOut(p.occurredOn) <= today);
    const future = parcels.filter((p) => dateOut(p.occurredOn) > today);
    const next = future[0];
    const first = parcels[0]!;
    plans.push({
      groupId,
      description: first.description,
      total: first.installmentTotal ?? parcels.length,
      currentNumber: past.length > 0 ? past[past.length - 1]!.installmentNo ?? past.length : 0,
      remainingCount: future.length,
      installmentCents: num((next ?? first).amountCents),
      remainingCents: future.reduce((s, p) => s + num(p.amountCents), 0),
      nextDueDate: next ? dateOut(next.invoice?.dueDate ?? next.occurredOn) : null,
      category: first.category,
    });
  }
  return plans.sort((a, b) => (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999"));
}
