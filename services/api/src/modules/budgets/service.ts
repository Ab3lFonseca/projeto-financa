import {
  endOfMonth,
  formatBRL,
  fromISODate,
  monthKey,
  startOfMonth,
  type BudgetDTO,
  type BudgetsResponse,
  type ISODate,
} from "@app/shared";
import type { OpCtx, Tx } from "../../lib/db";
import { dateOut, num } from "../../lib/dto";
import { createNotifications } from "../notifications/service";
import type { PushNotifier } from "../notifications/notifier";

export type BudgetStatus = "OK" | "WARNING" | "EXCEEDED";

/** 100% ou mais = estourado; a partir do limite de alerta = atenção. */
export function budgetStatusFor(spentCents: number, amountCents: number, alertPct: number): BudgetStatus {
  if (amountCents <= 0) return "OK";
  if (spentCents >= amountCents) return "EXCEEDED";
  return (spentCents / amountCents) * 100 >= alertPct ? "WARNING" : "OK";
}

/** Despesas EFETIVADAS por categoria no mês (chave null = sem categoria). */
export async function spentByCategory(tx: Tx, userId: string, month: ISODate): Promise<Map<string | null, number>> {
  const groups = await tx.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      deletedAt: null,
      status: "POSTED",
      type: "EXPENSE",
      occurredOn: { gte: fromISODate(startOfMonth(month)), lte: fromISODate(endOfMonth(month)) },
    },
    _sum: { amountCents: true },
  });
  return new Map(groups.map((g) => [g.categoryId, num(g._sum.amountCents)]));
}

/** Gasto de uma categoria incluindo as subcategorias dela. */
function spentWithChildren(spent: Map<string | null, number>, categoryId: string, childrenOf: Map<string, string[]>): number {
  let total = spent.get(categoryId) ?? 0;
  for (const childId of childrenOf.get(categoryId) ?? []) total += spent.get(childId) ?? 0;
  return total;
}

async function childrenMap(tx: Tx, userId: string): Promise<Map<string, string[]>> {
  const rows = await tx.category.findMany({
    where: { userId, deletedAt: null, parentId: { not: null } },
    select: { id: true, parentId: true },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    map.set(r.parentId, [...(map.get(r.parentId) ?? []), r.id]);
  }
  return map;
}

type BudgetRow = {
  id: string;
  month: Date;
  amountCents: bigint;
  alertPct: number;
  category: { id: string; name: string; icon: string; color: string; type: "INCOME" | "EXPENSE"; deletedAt: Date | null };
};

export function toBudgetDTO(b: BudgetRow, spentCents: number): BudgetDTO {
  const amount = num(b.amountCents);
  return {
    id: b.id,
    category: {
      id: b.category.id,
      name: b.category.name,
      icon: b.category.icon,
      color: b.category.color,
      type: b.category.type,
      deleted: b.category.deletedAt !== null,
    },
    month: dateOut(b.month),
    amountCents: amount,
    alertPct: b.alertPct,
    spentCents,
    remainingCents: amount - spentCents,
    usedPct: amount > 0 ? Math.round((spentCents / amount) * 1000) / 10 : 0,
    status: budgetStatusFor(spentCents, amount, b.alertPct),
  };
}

export const budgetCategorySelect = {
  select: { id: true, name: true, icon: true, color: true, type: true, deletedAt: true },
} as const;

export async function budgetsForMonth(tx: Tx, userId: string, month: ISODate): Promise<BudgetsResponse> {
  const first = startOfMonth(month);
  const rows = await tx.budget.findMany({
    where: { userId, month: fromISODate(first) },
    include: { category: budgetCategorySelect },
  });
  const spent = await spentByCategory(tx, userId, first);
  const children = await childrenMap(tx, userId);
  const budgets = rows
    .map((b) => toBudgetDTO(b, spentWithChildren(spent, b.categoryId, children)))
    .sort((a, b) => b.usedPct - a.usedPct || a.category.name.localeCompare(b.category.name, "pt-BR"));
  return {
    month: first,
    totalBudgetCents: budgets.reduce((s, b) => s + b.amountCents, 0),
    totalSpentCents: budgets.reduce((s, b) => s + b.spentCents, 0),
    budgets,
  };
}

export async function budgetDTOById(tx: Tx, userId: string, id: string): Promise<BudgetDTO | null> {
  const row = await tx.budget.findFirst({ where: { id, userId }, include: { category: budgetCategorySelect } });
  if (!row) return null;
  const month = dateOut(row.month);
  const spent = await spentByCategory(tx, userId, month);
  const children = await childrenMap(tx, userId);
  return toBudgetDTO(row, spentWithChildren(spent, row.categoryId, children));
}

/**
 * Depois de uma despesa no mês corrente, avisa se o orçamento da categoria (ou da categoria-pai)
 * passou do limite de alerta ou foi estourado. Uma notificação por orçamento/mês/nível.
 */
export async function evaluateBudgetAlerts(
  tx: Tx,
  user: { id: string },
  deps: { notifier: PushNotifier },
  ctx: OpCtx,
  args: { categoryId: string | null; occurredOn: ISODate; today: ISODate },
): Promise<void> {
  const { categoryId, occurredOn, today } = args;
  if (!categoryId) return;
  if (monthKey(occurredOn) !== monthKey(today)) return; // só alerta sobre o mês corrente

  const month = startOfMonth(occurredOn);
  const category = await tx.category.findFirst({ where: { id: categoryId, userId: user.id }, select: { parentId: true } });
  const targetIds = [categoryId, ...(category?.parentId ? [category.parentId] : [])];

  const budgets = await tx.budget.findMany({
    where: { userId: user.id, month: fromISODate(month), categoryId: { in: targetIds } },
    include: { category: budgetCategorySelect },
  });
  if (budgets.length === 0) return;

  const spent = await spentByCategory(tx, user.id, month);
  const children = await childrenMap(tx, user.id);
  const items = [];
  for (const b of budgets) {
    const spentCents = spentWithChildren(spent, b.categoryId, children);
    const amount = num(b.amountCents);
    const status = budgetStatusFor(spentCents, amount, b.alertPct);
    if (status === "OK") continue;
    const usedPct = Math.round((spentCents / amount) * 100);
    const detail = `${formatBRL(spentCents)} de ${formatBRL(amount)}`;
    items.push(
      status === "EXCEEDED"
        ? {
            type: "BUDGET_EXCEEDED" as const,
            title: "Orçamento estourado",
            body: `Você ultrapassou o orçamento de ${b.category.name} (${detail}).`,
            data: { budgetId: b.id, categoryId: b.categoryId, month },
            dedupeKey: `budget:${b.id}:${monthKey(month)}:exceeded`,
          }
        : {
            type: "BUDGET_NEAR_LIMIT" as const,
            title: "Orçamento perto do limite",
            body: `Você já usou ${usedPct}% do orçamento de ${b.category.name} (${detail}).`,
            data: { budgetId: b.id, categoryId: b.categoryId, month },
            dedupeKey: `budget:${b.id}:${monthKey(month)}:warn`,
          },
    );
  }
  await createNotifications(tx, user.id, items, ctx, deps.notifier);
}
