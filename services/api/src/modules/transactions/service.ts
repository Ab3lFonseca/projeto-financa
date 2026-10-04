import type { Prisma } from "@app/database";
import {
  addMonths,
  fromISODate,
  splitInstallments,
  todayIn,
  type CreateTransactionBody,
  type ISODate,
  type ListTransactionsQuery,
  type TransactionDTO,
  type UpdateTransactionBody,
} from "@app/shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { OpCtx, Tx } from "../../lib/db";
import { dateOut, num, tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { ensureInvoice, syncInvoiceStatuses } from "../../lib/invoices";
import { decodeCursor, encodeCursor, slicePage } from "../../lib/pagination";
import { requireAccount, requireCard, requireCategory } from "../../lib/refs";
import type { AuthUser } from "../../types";
import { evaluateBudgetAlerts } from "../budgets/service";
import type { PushNotifier } from "../notifications/notifier";

export type Deps = { notifier: PushNotifier; now: Date };

// ---------------------------------------------------------------------------- mapeamento

const accountSelect = { select: { id: true, name: true, deletedAt: true } } as const;

export const transactionInclude = {
  account: accountSelect,
  card: accountSelect,
  category: { select: { id: true, name: true, icon: true, color: true, type: true, deletedAt: true } },
  transfer: { select: { fromAccount: accountSelect, toAccount: accountSelect } },
} satisfies Prisma.TransactionInclude;

export type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

const ref = (x: { id: string; name: string; deletedAt: Date | null }) => ({
  id: x.id,
  name: x.name,
  deleted: x.deletedAt !== null,
});

export function toTransactionDTO(r: TransactionRow): TransactionDTO {
  const counterpart = r.transfer ? (r.transferSide === "OUT" ? r.transfer.toAccount : r.transfer.fromAccount) : null;
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    description: r.description,
    amountCents: num(r.amountCents),
    occurredOn: dateOut(r.occurredOn),
    account: r.account ? ref(r.account) : null,
    card: r.card ? ref(r.card) : null,
    category: r.category
      ? { id: r.category.id, name: r.category.name, icon: r.category.icon, color: r.category.color, type: r.category.type, deleted: r.category.deletedAt !== null }
      : null,
    paymentMethod: r.paymentMethod,
    invoiceId: r.invoiceId,
    installment:
      r.installmentGroupId && r.installmentNo && r.installmentTotal
        ? { groupId: r.installmentGroupId, number: r.installmentNo, total: r.installmentTotal }
        : null,
    transferId: r.transferId,
    transferSide: r.transferSide,
    counterpartAccount: counterpart ? ref(counterpart) : null,
    recurrenceId: r.recurrenceId,
    notes: r.notes,
    version: r.version,
    createdAt: tsOut(r.createdAt),
    updatedAt: tsOut(r.updatedAt),
  };
}

// ---------------------------------------------------------------------------- criação

/**
 * Cria um lançamento (ou N parcelas, em compra parcelada no cartão).
 * Idempotente quando o app envia o `id` gerado no aparelho.
 */
export async function createTransactions(
  tx: Tx,
  user: AuthUser,
  input: CreateTransactionBody,
  deps: Deps,
  ctx: OpCtx,
): Promise<{ rows: TransactionRow[]; replayed: boolean }> {
  const today = todayIn(user.timezone, deps.now);

  if (input.id) {
    const existing = await tx.transaction.findFirst({
      where: { id: input.id, userId: user.id },
      include: transactionInclude,
    });
    if (existing) return { rows: [existing], replayed: true };
  }

  const category = input.categoryId ? await requireCategory(tx, user.id, input.categoryId, input.type) : null;
  const account = input.accountId ? await requireAccount(tx, user.id, input.accountId) : null;
  const card = input.cardId ? await requireCard(tx, user.id, input.cardId) : null;

  const paymentMethod = card ? "CREDIT" : (input.paymentMethod ?? "OTHER");
  const status = input.status ?? (card ? "POSTED" : input.occurredOn > today ? "PENDING" : "POSTED");

  const count = input.installments ?? 1;
  const amounts = count > 1 ? splitInstallments(input.amountCents, count) : [input.amountCents];
  const groupId = count > 1 ? randomUUID() : null;

  const ids: string[] = [];
  const invoiceIds: string[] = [];
  const data: Prisma.TransactionCreateManyInput[] = [];
  for (let i = 0; i < count; i++) {
    const date = count > 1 ? addMonths(input.occurredOn, i) : input.occurredOn;
    const invoiceId = card ? await ensureInvoice(tx, user.id, card, date) : null;
    if (invoiceId) invoiceIds.push(invoiceId);
    const id = i === 0 && input.id ? input.id : randomUUID();
    ids.push(id);
    data.push({
      id,
      userId: user.id,
      type: input.type,
      status,
      description: input.description,
      amountCents: amounts[i]!,
      occurredOn: fromISODate(date),
      accountId: account?.id ?? null,
      cardId: card?.id ?? null,
      categoryId: category?.id ?? null,
      paymentMethod,
      invoiceId,
      installmentGroupId: groupId,
      installmentNo: groupId ? i + 1 : null,
      installmentTotal: groupId ? count : null,
      notes: input.notes ?? null,
    });
  }
  await tx.transaction.createMany({ data });

  await syncInvoiceStatuses(tx, user.id, invoiceIds, today);
  if (input.type === "EXPENSE" && status === "POSTED") {
    await evaluateBudgetAlerts(tx, user, deps, ctx, { categoryId: category?.id ?? null, occurredOn: input.occurredOn, today });
  }

  const rows = await tx.transaction.findMany({
    where: { id: { in: ids }, userId: user.id },
    include: transactionInclude,
    orderBy: [{ occurredOn: "asc" }, { installmentNo: "asc" }],
  });
  return { rows, replayed: false };
}

// ---------------------------------------------------------------------------- edição

export async function updateTransaction(
  tx: Tx,
  user: AuthUser,
  id: string,
  input: UpdateTransactionBody,
  deps: Deps,
  ctx: OpCtx,
): Promise<TransactionRow[]> {
  const today = todayIn(user.timezone, deps.now);
  const current = await tx.transaction.findFirst({ where: { id, userId: user.id, deletedAt: null } });
  if (!current) throw Errors.notFound("Lançamento");
  if (current.type === "TRANSFER") {
    throw Errors.conflict("Transferências são editadas em /transfers", "USE_TRANSFERS_ENDPOINT");
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw Errors.conflict("Este lançamento foi alterado em outro aparelho", "VERSION_CONFLICT", {
      currentVersion: current.version,
    });
  }

  // ---- escopo do grupo de parcelas: só campos "descritivos"
  if (input.scope === "group" && current.installmentGroupId) {
    const forbidden = ["amountCents", "occurredOn", "accountId", "cardId", "paymentMethod", "status"] as const;
    if (forbidden.some((k) => input[k] !== undefined)) {
      throw Errors.unprocessable(
        "Para todas as parcelas só é possível alterar descrição, categoria e observação",
        "GROUP_SCOPE_FIELDS",
      );
    }
    if (input.categoryId) await requireCategory(tx, user.id, input.categoryId, current.type);
    await tx.transaction.updateMany({
      where: { userId: user.id, installmentGroupId: current.installmentGroupId, deletedAt: null },
      data: {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        version: { increment: 1 },
      },
    });
    return tx.transaction.findMany({
      where: { userId: user.id, installmentGroupId: current.installmentGroupId, deletedAt: null },
      include: transactionInclude,
      orderBy: { installmentNo: "asc" },
    });
  }

  // ---- escopo de uma linha: mescla campos e revalida as regras
  let accountId = current.accountId;
  let cardId = current.cardId;
  if (input.accountId !== undefined) {
    accountId = input.accountId;
    if (input.accountId) cardId = input.cardId !== undefined ? input.cardId : null;
  }
  if (input.cardId !== undefined) {
    cardId = input.cardId;
    if (input.cardId) accountId = input.accountId !== undefined ? input.accountId : null;
  }
  if (Boolean(accountId) === Boolean(cardId)) {
    throw Errors.unprocessable("Informe a conta ou o cartão (apenas um)", "SOURCE_REQUIRED", { field: "accountId" });
  }

  const sourceChanged = accountId !== current.accountId || cardId !== current.cardId;
  if (current.installmentGroupId && sourceChanged) {
    throw Errors.unprocessable("A origem de uma parcela não pode ser alterada", "INSTALLMENT_SOURCE_LOCKED");
  }

  let paymentMethod = input.paymentMethod ?? current.paymentMethod;
  if (cardId) {
    if (input.paymentMethod && input.paymentMethod !== "CREDIT") {
      throw Errors.unprocessable("Compras no cartão usam a forma de pagamento Crédito", "PAYMENT_METHOD_MISMATCH", { field: "paymentMethod" });
    }
    paymentMethod = "CREDIT";
  } else if (paymentMethod === "CREDIT") {
    if (input.paymentMethod === "CREDIT") {
      throw Errors.unprocessable("Crédito exige um cartão", "PAYMENT_METHOD_MISMATCH", { field: "paymentMethod" });
    }
    paymentMethod = "OTHER"; // saiu do cartão para uma conta
  }

  const account = accountId && accountId !== current.accountId ? await requireAccount(tx, user.id, accountId) : null;
  const card = cardId ? await requireCard(tx, user.id, cardId, { allowArchived: cardId === current.cardId }) : null;
  if (accountId && accountId === current.accountId) {
    await requireAccount(tx, user.id, accountId, { allowArchived: true });
  }
  void account;

  const categoryId = input.categoryId !== undefined ? input.categoryId : current.categoryId;
  if (input.categoryId) await requireCategory(tx, user.id, input.categoryId, current.type);

  const occurredOn = input.occurredOn ?? dateOut(current.occurredOn);
  const dateChanged = occurredOn !== dateOut(current.occurredOn);

  let invoiceId = current.invoiceId;
  if (card && (dateChanged || cardId !== current.cardId || !invoiceId)) {
    invoiceId = await ensureInvoice(tx, user.id, card, occurredOn);
  }
  if (!card) invoiceId = null;

  const result = await tx.transaction.updateMany({
    where: { id: current.id, userId: user.id, version: current.version, deletedAt: null },
    data: {
      description: input.description ?? current.description,
      amountCents: input.amountCents ?? current.amountCents,
      occurredOn: fromISODate(occurredOn),
      accountId,
      cardId,
      categoryId,
      paymentMethod,
      status: input.status ?? current.status,
      invoiceId,
      notes: input.notes !== undefined ? input.notes : current.notes,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    throw Errors.conflict("Este lançamento foi alterado em outro aparelho", "VERSION_CONFLICT");
  }

  await syncInvoiceStatuses(tx, user.id, [current.invoiceId, invoiceId].filter((x): x is string => Boolean(x)), today);
  if (current.type === "EXPENSE") {
    await evaluateBudgetAlerts(tx, user, deps, ctx, { categoryId, occurredOn, today });
  }

  return tx.transaction.findMany({ where: { id: current.id, userId: user.id }, include: transactionInclude });
}

// ---------------------------------------------------------------------------- exclusão

export async function deleteTransaction(
  tx: Tx,
  user: AuthUser,
  id: string,
  scope: "one" | "group",
  deps: Deps,
): Promise<void> {
  const current = await tx.transaction.findFirst({ where: { id, userId: user.id, deletedAt: null } });
  if (!current) throw Errors.notFound("Lançamento");
  if (current.type === "TRANSFER") {
    throw Errors.conflict("Transferências são excluídas em /transfers", "USE_TRANSFERS_ENDPOINT");
  }
  const where: Prisma.TransactionWhereInput =
    scope === "group" && current.installmentGroupId
      ? { userId: user.id, installmentGroupId: current.installmentGroupId, deletedAt: null }
      : { id: current.id, userId: user.id };

  const affected = await tx.transaction.findMany({ where, select: { invoiceId: true } });
  await tx.transaction.updateMany({ where, data: { deletedAt: deps.now, version: { increment: 1 } } });
  await syncInvoiceStatuses(
    tx,
    user.id,
    affected.map((a) => a.invoiceId).filter((x): x is string => Boolean(x)),
    todayIn(user.timezone, deps.now),
  );
}

// ---------------------------------------------------------------------------- consulta

type Filters = Pick<
  ListTransactionsQuery,
  | "from" | "to" | "type" | "categoryId" | "uncategorized" | "accountId" | "cardId" | "invoiceId"
  | "paymentMethod" | "status" | "q" | "minAmountCents" | "maxAmountCents"
>;

export function buildWhere(userId: string, f: Filters): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [];
  const where: Prisma.TransactionWhereInput = { userId, deletedAt: null };

  if (f.from || f.to) {
    where.occurredOn = { ...(f.from ? { gte: fromISODate(f.from) } : {}), ...(f.to ? { lte: fromISODate(f.to) } : {}) };
  }
  if (f.type?.length) where.type = { in: f.type };
  if (f.categoryId?.length || f.uncategorized) {
    and.push({
      OR: [
        ...(f.categoryId?.length ? [{ categoryId: { in: f.categoryId } }] : []),
        ...(f.uncategorized ? [{ categoryId: null }] : []),
      ],
    });
  }
  if (f.accountId) where.accountId = f.accountId;
  if (f.cardId) where.cardId = f.cardId;
  if (f.invoiceId) where.invoiceId = f.invoiceId;
  if (f.paymentMethod?.length) where.paymentMethod = { in: f.paymentMethod };
  if (f.status) where.status = f.status;
  if (f.q) {
    and.push({
      OR: [
        { description: { contains: f.q, mode: "insensitive" } },
        { notes: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  if (f.minAmountCents !== undefined || f.maxAmountCents !== undefined) {
    where.amountCents = {
      ...(f.minAmountCents !== undefined ? { gte: f.minAmountCents } : {}),
      ...(f.maxAmountCents !== undefined ? { lte: f.maxAmountCents } : {}),
    };
  }
  if (and.length) where.AND = and;
  return where;
}

const dateCursor = z.object({ d: z.string(), id: z.uuid() });
const amountCursor = z.object({ a: z.number().int(), id: z.uuid() });

export async function listTransactions(tx: Tx, userId: string, q: ListTransactionsQuery) {
  const base = buildWhere(userId, q);
  const { sort, limit, cursor } = q;
  const byDate = sort === "date_desc" || sort === "date_asc";
  const desc = sort === "date_desc" || sort === "amount_desc";
  const cmp = desc ? "lt" : "gt";

  let keyset: Prisma.TransactionWhereInput | undefined;
  if (cursor) {
    if (byDate) {
      const c = decodeCursor(cursor, dateCursor);
      const d = fromISODate(c.d as ISODate);
      keyset = { OR: [{ occurredOn: { [cmp]: d } }, { occurredOn: d, id: { [cmp]: c.id } }] };
    } else {
      const c = decodeCursor(cursor, amountCursor);
      keyset = { OR: [{ amountCents: { [cmp]: c.a } }, { amountCents: c.a, id: { [cmp]: c.id } }] };
    }
  }

  const order = desc ? "desc" : "asc";
  const rows = await tx.transaction.findMany({
    where: keyset ? { AND: [base, keyset] } : base,
    include: transactionInclude,
    orderBy: byDate ? [{ occurredOn: order }, { id: order }] : [{ amountCents: order }, { id: order }],
    take: limit + 1,
  });
  const { items, hasMore } = slicePage(rows, limit);
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? byDate
        ? encodeCursor({ d: dateOut(last.occurredOn), id: last.id })
        : encodeCursor({ a: num(last.amountCents), id: last.id })
      : null;

  return { data: items.map(toTransactionDTO), page: { hasMore, nextCursor } };
}

export async function summarizeTransactions(tx: Tx, userId: string, filters: Filters) {
  const groups = await tx.transaction.groupBy({
    by: ["type"],
    where: buildWhere(userId, filters),
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  const sum = (type: string) => num(groups.find((g) => g.type === type)?._sum.amountCents ?? 0n);
  const incomeCents = sum("INCOME");
  const expenseCents = sum("EXPENSE");
  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    count: groups.reduce((n, g) => n + g._count._all, 0),
  };
}
