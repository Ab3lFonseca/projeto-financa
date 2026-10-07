import { Prisma, type PrismaClient } from "@app/database";
import { daysInMonth, diffDays, METRIC_KEYS, startOfMonth, todayIn, type Metrics } from "@app/shared";
import { accountBalances } from "../../lib/balances";
import type { Tx } from "../../lib/db";
import { num } from "../../lib/dto";
import { cushionMonths, dayIndex, longestRun, monthIndex, savingsSummary, weekIndex, type MonthTotals } from "./streaks";

/** Lançamento "manual": o que a pessoa registrou (não conta o que as recorrências geram nem o que veio do banco). */
const MANUAL = Prisma.sql`deleted_at IS NULL AND type IN ('INCOME', 'EXPENSE') AND recurrence_id IS NULL AND bank_transaction_id IS NULL`;

type User = { id: string; timezone: string };

const zero = (): Metrics => Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Metrics;

/**
 * Todos os números das insígnias de uma pessoa, calculados dos dados dela agora. Roda dentro da transação do usuário (RLS): só enxerga o que é
 * dele. `prisma` (dono) só serve para contar a trilha de auditoria, que o usuário não lê. Nenhum valor sai daqui para fora do servidor: o app
 * recebe só o número de cada insígnia e os níveis ganhos.
 */
export async function computeMetrics(tx: Tx, prisma: PrismaClient, user: User, now: Date): Promise<Metrics> {
  const m = zero();
  const uid = user.id;
  const tz = user.timezone;
  const today = todayIn(tz, now);
  const thisMonth = startOfMonth(today).slice(0, 7);

  // ------------------------------------------------------------------------------------------------ conta e perfil
  const me = await tx.user.findUniqueOrThrow({
    where: { id: uid },
    select: { createdAt: true, mfaFactorId: true, mfaEnabledAt: true, profile: { select: { displayName: true, onboardingCompletedAt: true } } },
  });
  m.tenureDays = Math.max(1, diffDays(todayIn(tz, me.createdAt), today) + 1);

  // ------------------------------------------------------------------------------------------------ constância: dias em que registrou
  const days = await tx.$queryRaw<{ day: string; n: number; same: number }[]>(Prisma.sql`
    SELECT ((created_at AT TIME ZONE ${tz})::date)::text AS day,
           COUNT(*)::int AS n,
           (COUNT(*) FILTER (WHERE occurred_on = (created_at AT TIME ZONE ${tz})::date))::int AS same
    FROM transactions
    WHERE user_id = ${uid}::uuid AND ${MANUAL}
    GROUP BY 1`);
  m.activeDays = days.length;
  m.dailyStreak = longestRun(days.map((d) => dayIndex(d.day)));
  m.weeklyStreak = longestRun(days.map((d) => weekIndex(d.day)));
  m.maxEntriesInDay = days.reduce((best, d) => Math.max(best, d.n), 0);
  m.sameDayEntries = days.reduce((sum, d) => sum + d.same, 0);
  m.entriesTotal = days.reduce((sum, d) => sum + d.n, 0);

  // ------------------------------------------------------------------------------------------------ lançamentos manuais, por tipo
  const [entries] = await tx.$queryRaw<{ expenses: number; incomes: number; noted: number; weekend: number; categorized: number; card: number }[]>(Prisma.sql`
    SELECT COUNT(*) FILTER (WHERE type = 'EXPENSE')::int AS expenses,
           COUNT(*) FILTER (WHERE type = 'INCOME')::int AS incomes,
           COUNT(*) FILTER (WHERE notes IS NOT NULL AND btrim(notes) <> '')::int AS noted,
           COUNT(*) FILTER (WHERE EXTRACT(DOW FROM occurred_on) IN (0, 6))::int AS weekend,
           COUNT(*) FILTER (WHERE category_id IS NOT NULL)::int AS categorized,
           COUNT(*) FILTER (WHERE card_id IS NOT NULL)::int AS card
    FROM transactions
    WHERE user_id = ${uid}::uuid AND ${MANUAL}`);
  m.expenseEntries = entries?.expenses ?? 0;
  m.incomeEntries = entries?.incomes ?? 0;
  m.notedEntries = entries?.noted ?? 0;
  m.weekendEntries = entries?.weekend ?? 0;
  m.categorizedEntries = entries?.categorized ?? 0;
  m.cardEntries = entries?.card ?? 0;

  // ------------------------------------------------------------------------------------------------ todos os lançamentos (inclui os automáticos)
  const [all] = await tx.$queryRaw<{ installments: number; methods: number; generated: number; categories: number; income_categories: number; biggest_income: bigint | null }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT installment_group_id)::int AS installments,
           (COUNT(DISTINCT payment_method) FILTER (WHERE type IN ('INCOME', 'EXPENSE') AND payment_method <> 'OTHER'))::int AS methods,
           COUNT(*) FILTER (WHERE recurrence_id IS NOT NULL)::int AS generated,
           (COUNT(DISTINCT category_id) FILTER (WHERE type IN ('INCOME', 'EXPENSE')))::int AS categories,
           (COUNT(DISTINCT category_id) FILTER (WHERE type = 'INCOME'))::int AS income_categories,
           MAX(amount_cents) FILTER (WHERE type = 'INCOME' AND status = 'POSTED') AS biggest_income
    FROM transactions
    WHERE user_id = ${uid}::uuid AND deleted_at IS NULL`);
  m.installmentPlans = all?.installments ?? 0;
  m.paymentMethods = all?.methods ?? 0;
  m.recurringGenerated = all?.generated ?? 0;
  m.categoriesUsed = all?.categories ?? 0;
  m.incomeCategoriesUsed = all?.income_categories ?? 0;
  m.biggestIncomeCents = num(all?.biggest_income);
  m.transfers = await tx.transfer.count({ where: { deletedAt: null } });

  // ------------------------------------------------------------------------------------------------ meses: receitas, despesas e dias com movimento
  const months = await tx.$queryRaw<{ ym: string; income: bigint; expense: bigint; entry_days: number; expense_days: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('month', occurred_on), 'YYYY-MM') AS ym,
           COALESCE(SUM(amount_cents) FILTER (WHERE type = 'INCOME'), 0)::bigint AS income,
           COALESCE(SUM(amount_cents) FILTER (WHERE type = 'EXPENSE'), 0)::bigint AS expense,
           COUNT(DISTINCT occurred_on)::int AS entry_days,
           (COUNT(DISTINCT occurred_on) FILTER (WHERE type = 'EXPENSE'))::int AS expense_days
    FROM transactions
    WHERE user_id = ${uid}::uuid AND deleted_at IS NULL AND status = 'POSTED' AND type IN ('INCOME', 'EXPENSE')
    GROUP BY 1
    ORDER BY 1`);
  const upToNow = months.filter((r) => r.ym <= thisMonth); // lançamentos agendados para meses futuros ainda não contam
  const closed: MonthTotals[] = upToNow.filter((r) => r.ym < thisMonth).map((r) => ({ ym: r.ym, income: num(r.income), expense: num(r.expense) }));
  m.trackedMonths = upToNow.length;
  m.closerMonths = upToNow.filter((r) => r.entry_days >= 15).length;
  m.incomeTotalCents = upToNow.reduce((sum, r) => sum + num(r.income), 0);
  m.expenseTotalCents = upToNow.reduce((sum, r) => sum + num(r.expense), 0);
  Object.assign(m, savingsSummary(closed));
  // Dia sem gastar só conta nos meses fechados em que a pessoa realmente acompanhou (10 dias ou mais com movimento).
  m.zeroDays = upToNow
    .filter((r) => r.ym < thisMonth && r.entry_days >= 10)
    .reduce((sum, r) => {
      const [y, mo] = r.ym.split("-").map(Number) as [number, number];
      return sum + Math.max(0, daysInMonth(y, mo) - r.expense_days);
    }, 0);

  // ------------------------------------------------------------------------------------------------ contas, saldo e colchão
  const accounts = await tx.account.findMany({ where: { deletedAt: null }, select: { id: true, includeInTotal: true } });
  m.accounts = accounts.length;
  const balances = await accountBalances(tx, uid, today);
  m.netWorthCents = accounts.filter((a) => a.includeInTotal).reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0);
  m.cushionMonths = cushionMonths(m.netWorthCents, closed);

  // ------------------------------------------------------------------------------------------------ orçamentos (gasto da categoria + subcategorias no mês)
  const budgets = await tx.$queryRaw<{ month: string; category_id: string; amount: bigint; spent: bigint }[]>(Prisma.sql`
    SELECT b.month::text AS month, b.category_id, b.amount_cents::bigint AS amount,
           COALESCE((
             SELECT SUM(t.amount_cents)
             FROM transactions t
             JOIN categories c ON c.id = t.category_id
             WHERE t.user_id = b.user_id AND t.deleted_at IS NULL AND t.status = 'POSTED' AND t.type = 'EXPENSE'
               AND t.occurred_on >= b.month AND t.occurred_on < (b.month + interval '1 month')::date
               AND (c.id = b.category_id OR c.parent_id = b.category_id)
           ), 0)::bigint AS spent
    FROM budgets b
    WHERE b.user_id = ${uid}::uuid`);
  m.budgetsCreated = budgets.length;
  m.budgetCategories = new Set(budgets.map((b) => b.category_id)).size;
  m.budgetMonths = new Set(budgets.map((b) => b.month.slice(0, 7))).size;
  const byMonth = new Map<string, { amount: number; spent: number }[]>();
  for (const b of budgets) {
    if (b.month.slice(0, 7) >= thisMonth) continue; // só meses fechados
    const list = byMonth.get(b.month.slice(0, 7)) ?? [];
    list.push({ amount: num(b.amount), spent: num(b.spent) });
    byMonth.set(b.month.slice(0, 7), list);
  }
  for (const list of byMonth.values()) {
    m.budgetsMet += list.filter((b) => b.spent > 0 && b.spent <= b.amount).length;
    if (list.every((b) => b.spent <= b.amount) && list.some((b) => b.spent > 0)) m.perfectMonths++;
  }

  // ------------------------------------------------------------------------------------------------ recorrências
  m.recurringRules = await tx.recurringRule.count({ where: { deletedAt: null, active: true } });

  // ------------------------------------------------------------------------------------------------ metas
  const goals = await tx.goal.findMany({ where: { deletedAt: null }, select: { id: true, status: true, targetCents: true, initialCents: true } });
  const goalIds = new Set(goals.map((g) => g.id));
  const contributions = (await tx.goalContribution.findMany({ select: { goalId: true, amountCents: true, occurredOn: true } })).filter((c) => goalIds.has(c.goalId));
  m.goalsCreated = goals.length;
  m.goalsAchieved = goals.filter((g) => g.status === "ACHIEVED").length;
  m.biggestGoalCents = goals.reduce((best, g) => Math.max(best, num(g.targetCents)), 0);
  const deposits = contributions.filter((c) => num(c.amountCents) > 0);
  m.goalContributions = deposits.length;
  m.goalSavedCents = goals.reduce((sum, g) => sum + num(g.initialCents), 0) + contributions.reduce((sum, c) => sum + num(c.amountCents), 0);
  m.contributionStreak = longestRun(deposits.map((c) => monthIndex(c.occurredOn.toISOString())));

  // ------------------------------------------------------------------------------------------------ cartões e faturas
  m.cards = await tx.creditCard.count({ where: { deletedAt: null } });
  const [pays] = await tx.$queryRaw<{ payments: number; punctual: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS payments, (COUNT(*) FILTER (WHERE p.paid_on <= i.due_date))::int AS punctual
    FROM invoice_payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.user_id = ${uid}::uuid`);
  m.invoicePayments = pays?.payments ?? 0;
  m.punctualPayments = pays?.punctual ?? 0;

  // ------------------------------------------------------------------------------------------------ organização
  m.customCategories = await tx.category.count({ where: { systemKey: null, deletedAt: null } });

  // ------------------------------------------------------------------------------------------------ você no app
  m.dataExports = await prisma.auditLog.count({ where: { actorId: uid, action: "privacy.export" } });
  m.notificationsRead = await tx.notification.count({ where: { readAt: { not: null } } });
  const hasName = Boolean(me.profile?.displayName?.trim());
  const onboarded = me.profile?.onboardingCompletedAt != null;
  m.firstSteps = [hasName, onboarded, m.accounts > 0, m.entriesTotal > 0, m.budgetsCreated > 0, m.goalsCreated > 0].filter(Boolean).length;
  const passwordChanged = (await tx.accountChange.count({ where: { kind: "PASSWORD" } })) > 0;
  const hasPush = (await tx.pushToken.count()) > 0;
  const mfa = Boolean(me.mfaFactorId && me.mfaEnabledAt);
  m.securityScore = [mfa, hasName, onboarded, passwordChanged, hasPush, m.dataExports > 0].filter(Boolean).length;

  return m;
}
