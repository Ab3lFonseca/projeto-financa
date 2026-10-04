import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  fromISODate,
  percentChange,
  startOfMonth,
  todayIn,
  type DashboardDTO,
} from "@app/shared";
import type { OpCtx, Tx } from "../../lib/db";
import { dateOut, num } from "../../lib/dto";
import { invoiceTotals } from "../../lib/invoices";
import { limitsFor } from "../../lib/plan";
import type { AuthUser } from "../../types";
import { listAccountDTOs } from "../accounts/service";
import { budgetsForMonth } from "../budgets/service";
import { listCardDTOs } from "../cards/service";
import { listGoalDTOs } from "../goals/service";
import type { PushNotifier } from "../notifications/notifier";
import { catchUpUser, ruleInclude, ruleShape } from "../recurring/service";
import {
  consolidatedBalanceAt,
  flowByPeriod,
  incomeExpenseByBucket,
  sameDayOrLast,
  sumsBetween,
  totalsByCategory,
} from "../reports/service";
import { toTransactionDTO, transactionInclude } from "../transactions/service";
import { buildInsights, MIN_DAYS_FOR_COMPARISON } from "./insights";
import { occurrencesBetween } from "@app/shared";

export async function buildDashboard(
  tx: Tx,
  user: AuthUser,
  now: Date,
  deps: { notifier: PushNotifier },
  ctx: OpCtx,
): Promise<DashboardDTO> {
  // Garante que as recorrências vencidas já viraram lançamentos antes de somar.
  await catchUpUser(tx, user, now, deps, ctx);

  const today = todayIn(user.timezone, now);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const prevStart = startOfMonth(addMonths(monthStart, -1));
  const todayDay = Number(today.slice(8, 10));
  const prevSameDay = sameDayOrLast(prevStart, todayDay);
  const comparable = todayDay >= MIN_DAYS_FOR_COMPARISON;

  // ---- contas e saldo total
  const accounts = await listAccountDTOs(tx, user.id, user.timezone, now);
  const totalBalanceCents = accounts.filter((a) => a.includeInTotal).reduce((s, a) => s + a.balanceCents, 0);

  // ---- resumo do mês (mês completo) e comparativo justo (até hoje × mês anterior até o mesmo dia)
  const month = await sumsBetween(tx, user.id, monthStart, monthEnd);
  const monthToDate = await sumsBetween(tx, user.id, monthStart, today);
  const previousToDate = await sumsBetween(tx, user.id, prevStart, prevSameDay);
  const savingsCents = month.incomeCents - month.expenseCents;

  // ---- últimas transações (até hoje)
  const recent = await tx.transaction.findMany({
    where: { userId: user.id, deletedAt: null, occurredOn: { lte: fromISODate(today) } },
    include: transactionInclude,
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: 8,
  });

  // ---- gastos por categoria (top 5 + "Outras")
  const byCategory = await totalsByCategory(tx, user.id, "EXPENSE", monthStart, monthEnd);
  const totalSpent = byCategory.reduce((s, c) => s + c.totalCents, 0);
  const top = byCategory.slice(0, 5);
  const rest = byCategory.slice(5);
  const spendingByCategory = [
    ...top.map((c) => ({ categoryId: c.categoryId, name: c.name, icon: c.icon, color: c.color, totalCents: c.totalCents })),
    ...(rest.length > 0
      ? [{ categoryId: null, name: "Outras categorias", icon: "ellipsis", color: "#94A3B8", totalCents: rest.reduce((s, c) => s + c.totalCents, 0) }]
      : []),
  ].map((c) => ({ ...c, pct: totalSpent > 0 ? Math.round((c.totalCents / totalSpent) * 1000) / 10 : 0 }));

  // ---- evolução dos últimos 6 meses
  const firstMonth = startOfMonth(addMonths(monthStart, -5));
  const monthly = await incomeExpenseByBucket(tx, user.id, firstMonth, monthEnd, "month");
  const flows = await flowByPeriod(tx, user.id, firstMonth, today, "month", true);
  let running = await consolidatedBalanceAt(tx, user.id, addDays(firstMonth, -1));
  const evolution = [];
  for (let i = 0; i < 6; i++) {
    const m = addMonths(firstMonth, i);
    const f = flows.get(m) ?? { inflow: 0, outflow: 0 };
    running += f.inflow - f.outflow;
    const t = monthly.get(m) ?? { income: 0, expense: 0 };
    evolution.push({ month: m, incomeCents: t.income, expenseCents: t.expense, balanceCents: running });
  }

  // ---- cartões, orçamentos, metas
  const cards = await listCardDTOs(tx, user, now);
  const budgets = await budgetsForMonth(tx, user.id, monthStart);
  const budgetAlerts = budgets.budgets.filter((b) => b.status !== "OK");
  const goals = (await listGoalDTOs(tx, user.id, today)).filter((g) => g.status === "ACTIVE");

  // ---- próximas contas (recorrências) e faturas a vencer
  const rules = await tx.recurringRule.findMany({ where: { userId: user.id, active: true, deletedAt: null }, include: ruleInclude });
  const bills = rules
    .flatMap((r) =>
      occurrencesBetween(ruleShape(r), dateOut(r.nextRunOn), addDays(today, 7), 20)
        .filter((d) => d > today)
        .map((date) => ({
          ruleId: r.id,
          date,
          type: r.type as "INCOME" | "EXPENSE",
          description: r.description,
          amountCents: num(r.amountCents),
          category: r.category
            ? { id: r.category.id, name: r.category.name, icon: r.category.icon, color: r.category.color, type: r.category.type, deleted: r.category.deletedAt !== null }
            : null,
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const openInvoices = await tx.invoice.findMany({
    where: { userId: user.id, dueDate: { gte: fromISODate(today) }, card: { deletedAt: null, archivedAt: null } },
    include: { card: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
    take: 20,
  });
  const totals = await invoiceTotals(tx, user.id, { invoiceIds: openInvoices.map((i) => i.id) });
  const invoices = openInvoices
    .map((i) => {
      const t = totals.get(i.id);
      return { cardId: i.card.id, cardName: i.card.name, invoiceId: i.id, dueDate: dateOut(i.dueDate), remainingCents: Math.max((t?.totalCents ?? 0) - (t?.paidCents ?? 0), 0) };
    })
    .filter((i) => i.remainingCents > 0 && diffDays(today, i.dueDate) <= 30);

  // ---- insights (com dados reais)
  const curCats = await totalsByCategory(tx, user.id, "EXPENSE", monthStart, today);
  const prevCats = await totalsByCategory(tx, user.id, "EXPENSE", prevStart, prevSameDay);
  const catMap = new Map<string | null, { categoryId: string | null; name: string; currentCents: number; previousCents: number }>();
  for (const c of curCats) catMap.set(c.categoryId, { categoryId: c.categoryId, name: c.name, currentCents: c.totalCents, previousCents: 0 });
  for (const p of prevCats) {
    const e = catMap.get(p.categoryId);
    if (e) e.previousCents = p.totalCents;
    else catMap.set(p.categoryId, { categoryId: p.categoryId, name: p.name, currentCents: 0, previousCents: p.totalCents });
  }
  const insights = buildInsights({
    today,
    incomeCents: month.incomeCents,
    expenseCents: month.expenseCents,
    expenseToDateCents: monthToDate.expenseCents,
    previousExpenseToDateCents: previousToDate.expenseCents,
    categories: [...catMap.values()],
    budgets: budgets.budgets,
    invoicesDue: invoices,
    goals,
    advanced: limitsFor(user.plan).advancedInsights,
  });

  const unread = await tx.notification.count({ where: { userId: user.id, readAt: null } });

  return {
    today,
    totalBalanceCents,
    month: {
      month: monthStart,
      incomeCents: month.incomeCents,
      expenseCents: month.expenseCents,
      savingsCents,
      savingsRatePct: month.incomeCents > 0 ? Math.round((savingsCents / month.incomeCents) * 1000) / 10 : null,
      previousIncomeCents: previousToDate.incomeCents,
      previousExpenseCents: previousToDate.expenseCents,
      // Nos primeiros dias do mês a comparação é ruído (um boleto vira "+600%"): só mostramos depois.
      incomeChangePct: comparable ? percentChange(monthToDate.incomeCents, previousToDate.incomeCents) : null,
      expenseChangePct: comparable ? percentChange(monthToDate.expenseCents, previousToDate.expenseCents) : null,
    },
    recentTransactions: recent.map(toTransactionDTO),
    spendingByCategory,
    evolution,
    accounts,
    cards,
    budgetAlerts,
    goals: goals.slice(0, 3),
    upcoming: { bills: bills.slice(0, 5), invoices: invoices.slice(0, 5) },
    insights,
    unreadNotifications: unread,
  };
}
