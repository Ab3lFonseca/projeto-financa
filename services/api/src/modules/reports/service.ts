import { Prisma } from "@app/database";
import {
  addDays,
  diffDays,
  endOfMonth,
  fromISODate,
  granularityFor,
  listMonthStarts,
  monthShortPt,
  parseISODate,
  percentChange,
  startOfMonth,
  startOfWeek,
  toISODate,
  type BalanceEvolutionDTO,
  type CashFlowDTO,
  type CategoryBreakdownDTO,
  type IncomeVsExpenseDTO,
  type ISODate,
  type MonthComparisonDTO,
  type ResolvedRange,
} from "@app/shared";
import type { Tx } from "../../lib/db";
import { num } from "../../lib/dto";

export type Bucket = "week" | "month";

const SEM_CATEGORIA = { name: "Sem categoria", icon: "circle-help", color: "#94A3B8" };

// ---------------------------------------------------------------- períodos e rótulos

/** Início de cada período (semana: segunda; mês: dia 1) cobrindo [from, to]. */
export function bucketStarts(from: ISODate, to: ISODate, bucket: Bucket): ISODate[] {
  if (bucket === "month") return listMonthStarts(from, to);
  const out: ISODate[] = [];
  let cursor = startOfWeek(from);
  while (cursor <= to) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

export function bucketKey(date: ISODate, bucket: Bucket): ISODate {
  return bucket === "month" ? startOfMonth(date) : startOfWeek(date);
}

/** "out" (mesmo ano) ou "out/25" (quando a série passa de um ano); semanas: "28/09". */
export function bucketLabel(start: ISODate, bucket: Bucket, spansYears: boolean): string {
  const { year, month, day } = parseISODate(start);
  if (bucket === "week") return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
  return spansYears ? `${monthShortPt(start)}/${String(year).slice(2)}` : monthShortPt(start);
}

export function pickBucket(range: ResolvedRange, requested?: Bucket): Bucket {
  if (requested) return requested;
  return granularityFor(range.from, range.to) === "week" ? "week" : "month";
}

// ---------------------------------------------------------------- consultas

type TotalsRow = { period: Date; income: bigint; expense: bigint };

/** Receitas e despesas EFETIVADAS por período (transferências não entram). */
export async function incomeExpenseByBucket(
  tx: Tx,
  userId: string,
  from: ISODate,
  to: ISODate,
  bucket: Bucket,
): Promise<Map<ISODate, { income: number; expense: number }>> {
  const trunc = Prisma.raw(bucket === "week" ? "'week'" : "'month'");
  const rows = await tx.$queryRaw<TotalsRow[]>(Prisma.sql`
    SELECT date_trunc(${trunc}, occurred_on)::date AS period,
           COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount_cents END), 0)::bigint AS income,
           COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount_cents END), 0)::bigint AS expense
    FROM transactions
    WHERE user_id = ${userId}::uuid
      AND deleted_at IS NULL
      AND status = 'POSTED'
      AND type IN ('INCOME', 'EXPENSE')
      AND occurred_on BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1
    ORDER BY 1
  `);
  return new Map(rows.map((r) => [toISODate(r.period), { income: num(r.income), expense: num(r.expense) }]));
}

export async function sumsBetween(tx: Tx, userId: string, from: ISODate, to: ISODate) {
  const groups = await tx.transaction.groupBy({
    by: ["type"],
    where: {
      userId,
      deletedAt: null,
      status: "POSTED",
      type: { in: ["INCOME", "EXPENSE"] },
      occurredOn: { gte: fromISODate(from), lte: fromISODate(to) },
    },
    _sum: { amountCents: true },
  });
  const sum = (t: string) => num(groups.find((g) => g.type === t)?._sum.amountCents ?? 0n);
  return { incomeCents: sum("INCOME"), expenseCents: sum("EXPENSE") };
}

/** Totais por categoria (receita ou despesa) no período. */
export async function totalsByCategory(
  tx: Tx,
  userId: string,
  type: "INCOME" | "EXPENSE",
  from: ISODate,
  to: ISODate,
) {
  const groups = await tx.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      deletedAt: null,
      status: "POSTED",
      type,
      occurredOn: { gte: fromISODate(from), lte: fromISODate(to) },
    },
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  const ids = groups.map((g) => g.categoryId).filter((x): x is string => x !== null);
  const categories = ids.length
    ? await tx.category.findMany({ where: { userId, id: { in: ids } }, select: { id: true, name: true, icon: true, color: true } })
    : [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  return groups
    .map((g) => {
      const meta = g.categoryId ? byId.get(g.categoryId) : null;
      return {
        categoryId: g.categoryId,
        name: meta?.name ?? SEM_CATEGORIA.name,
        icon: meta?.icon ?? SEM_CATEGORIA.icon,
        color: meta?.color ?? SEM_CATEGORIA.color,
        totalCents: num(g._sum.amountCents),
        count: g._count._all,
      };
    })
    .filter((g) => g.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** Saldo consolidado (contas que entram no total) ao fim de `date`. */
export async function consolidatedBalanceAt(tx: Tx, userId: string, date: ISODate): Promise<number> {
  const rows = await tx.$queryRaw<{ balance: bigint }[]>(Prisma.sql`
    WITH included AS (
      SELECT id, opening_balance_cents
      FROM accounts
      WHERE user_id = ${userId}::uuid AND deleted_at IS NULL AND archived_at IS NULL AND include_in_total
    )
    SELECT (
      COALESCE((SELECT SUM(opening_balance_cents) FROM included), 0)
      + COALESCE((
          SELECT SUM(CASE WHEN t.type = 'INCOME' OR (t.type = 'TRANSFER' AND t.transfer_side = 'IN')
                          THEN t.amount_cents ELSE -t.amount_cents END)
          FROM transactions t JOIN included i ON i.id = t.account_id
          WHERE t.user_id = ${userId}::uuid AND t.deleted_at IS NULL AND t.status = 'POSTED'
            AND t.occurred_on <= ${date}::date), 0)
      - COALESCE((
          SELECT SUM(p.amount_cents)
          FROM invoice_payments p JOIN included i ON i.id = p.account_id
          WHERE p.user_id = ${userId}::uuid AND p.paid_on <= ${date}::date), 0)
    )::bigint AS balance
  `);
  return num(rows[0]?.balance ?? 0n);
}

type FlowRow = { period: Date; inflow: bigint; outflow: bigint };

/**
 * Entradas e saídas das contas que entram no total, por período.
 *  - `includeTransfers`: para o SALDO (uma transferência para conta fora do total é saída);
 *  - sem transferências: para o FLUXO DE CAIXA (regime de caixa: despesas pagas direto da conta
 *    + pagamentos de fatura; compras no cartão só saem quando a fatura é paga).
 */
export async function flowByPeriod(
  tx: Tx,
  userId: string,
  from: ISODate,
  to: ISODate,
  trunc: "day" | "week" | "month",
  includeTransfers: boolean,
): Promise<Map<ISODate, { inflow: number; outflow: number }>> {
  const unit = Prisma.raw(`'${trunc}'`);
  const transferIn = includeTransfers ? Prisma.sql`OR (t.type = 'TRANSFER' AND t.transfer_side = 'IN')` : Prisma.empty;
  const transferOut = includeTransfers ? Prisma.sql`OR (t.type = 'TRANSFER' AND t.transfer_side = 'OUT')` : Prisma.empty;
  const rows = await tx.$queryRaw<FlowRow[]>(Prisma.sql`
    WITH included AS (
      SELECT id FROM accounts
      WHERE user_id = ${userId}::uuid AND deleted_at IS NULL AND archived_at IS NULL AND include_in_total
    )
    SELECT date_trunc(${unit}, x.d)::date AS period,
           COALESCE(SUM(x.inflow), 0)::bigint AS inflow,
           COALESCE(SUM(x.outflow), 0)::bigint AS outflow
    FROM (
      SELECT t.occurred_on AS d,
             CASE WHEN t.type = 'INCOME' ${transferIn} THEN t.amount_cents ELSE 0 END AS inflow,
             CASE WHEN t.type = 'EXPENSE' ${transferOut} THEN t.amount_cents ELSE 0 END AS outflow
      FROM transactions t JOIN included i ON i.id = t.account_id
      WHERE t.user_id = ${userId}::uuid AND t.deleted_at IS NULL AND t.status = 'POSTED'
        AND t.occurred_on BETWEEN ${from}::date AND ${to}::date
      UNION ALL
      SELECT p.paid_on AS d, 0, p.amount_cents
      FROM invoice_payments p JOIN included i ON i.id = p.account_id
      WHERE p.user_id = ${userId}::uuid AND p.paid_on BETWEEN ${from}::date AND ${to}::date
    ) x
    GROUP BY 1
    ORDER BY 1
  `);
  return new Map(rows.map((r) => [toISODate(r.period), { inflow: num(r.inflow), outflow: num(r.outflow) }]));
}

// ---------------------------------------------------------------- relatórios

export async function categoryBreakdown(
  tx: Tx,
  userId: string,
  range: ResolvedRange,
  type: "INCOME" | "EXPENSE",
): Promise<CategoryBreakdownDTO> {
  const rows = await totalsByCategory(tx, userId, type, range.from, range.to);
  const total = rows.reduce((s, r) => s + r.totalCents, 0);
  return {
    range,
    type,
    totalCents: total,
    items: rows.map((r) => ({ ...r, pct: total > 0 ? Math.round((r.totalCents / total) * 1000) / 10 : 0 })),
  };
}

export async function incomeVsExpense(
  tx: Tx,
  userId: string,
  range: ResolvedRange,
  bucket: Bucket,
): Promise<IncomeVsExpenseDTO> {
  const data = await incomeExpenseByBucket(tx, userId, range.from, range.to, bucket);
  const starts = bucketStarts(range.from, range.to, bucket);
  const spansYears = range.from.slice(0, 4) !== range.to.slice(0, 4);
  return {
    range,
    granularity: bucket,
    points: starts.map((start) => {
      const v = data.get(start) ?? { income: 0, expense: 0 };
      return {
        key: bucket === "month" ? start.slice(0, 7) : start,
        label: bucketLabel(start, bucket, spansYears),
        startDate: start,
        incomeCents: v.income,
        expenseCents: v.expense,
        netCents: v.income - v.expense,
      };
    }),
  };
}

export async function cashFlow(
  tx: Tx,
  userId: string,
  range: ResolvedRange,
  bucket: Bucket,
): Promise<CashFlowDTO> {
  const data = await flowByPeriod(tx, userId, range.from, range.to, bucket, false);
  const starts = bucketStarts(range.from, range.to, bucket);
  const spansYears = range.from.slice(0, 4) !== range.to.slice(0, 4);
  let cumulative = 0;
  return {
    range,
    granularity: bucket,
    points: starts.map((start) => {
      const v = data.get(start) ?? { inflow: 0, outflow: 0 };
      const net = v.inflow - v.outflow;
      cumulative += net;
      return {
        key: bucket === "month" ? start.slice(0, 7) : start,
        label: bucketLabel(start, bucket, spansYears),
        startDate: start,
        inflowCents: v.inflow,
        outflowCents: v.outflow,
        netCents: net,
        cumulativeCents: cumulative,
      };
    }),
  };
}

/** Evolução do saldo consolidado: até 62 dias por dia; até ~6 meses por semana; depois por mês. */
export async function balanceEvolution(
  tx: Tx,
  userId: string,
  range: ResolvedRange,
  today: ISODate,
): Promise<BalanceEvolutionDTO> {
  const last = range.to < today ? range.to : today; // não projeta o futuro
  const days = diffDays(range.from, range.to) + 1;
  const trunc: "day" | "week" | "month" = days <= 62 ? "day" : days <= 190 ? "week" : "month";
  const starting = await consolidatedBalanceAt(tx, userId, addDays(range.from, -1));
  if (last < range.from) {
    return { range, startingBalanceCents: starting, endingBalanceCents: starting, points: [] };
  }
  const flows = await flowByPeriod(tx, userId, range.from, last, trunc, true);

  const points: { date: ISODate; balanceCents: number }[] = [];
  let balance = starting;
  const periodStarts =
    trunc === "day"
      ? Array.from({ length: diffDays(range.from, last) + 1 }, (_, i) => addDays(range.from, i))
      : bucketStarts(range.from, last, trunc);
  for (const start of periodStarts) {
    const f = flows.get(start) ?? { inflow: 0, outflow: 0 };
    balance += f.inflow - f.outflow;
    // ponto = saldo ao FIM do período (dia; semana; mês), sem passar do fim do intervalo
    const end =
      trunc === "day" ? start : trunc === "week" ? addDays(start, 6) : endOfMonth(start);
    points.push({ date: end > last ? last : end, balanceCents: balance });
  }
  return { range, startingBalanceCents: starting, endingBalanceCents: balance, points };
}

export async function monthComparison(
  tx: Tx,
  userId: string,
  month: ISODate,
  today: ISODate,
): Promise<MonthComparisonDTO> {
  const current = startOfMonth(month);
  const previous = startOfMonth(addDays(current, -1));
  // Mês corrente é comparado "até o mesmo dia" do anterior, para não distorcer no começo do mês.
  const isCurrentMonth = startOfMonth(today) === current;
  const curTo = isCurrentMonth ? today : endOfMonth(current);
  const prevTo = isCurrentMonth ? sameDayOrLast(previous, parseISODate(today).day) : endOfMonth(previous);

  const [cur, prev] = [await sumsBetween(tx, userId, current, curTo), await sumsBetween(tx, userId, previous, prevTo)];
  const curCats = await totalsByCategory(tx, userId, "EXPENSE", current, curTo);
  const prevCats = await totalsByCategory(tx, userId, "EXPENSE", previous, prevTo);

  const merged = new Map<string | null, { name: string; color: string; cur: number; prev: number }>();
  for (const c of curCats) merged.set(c.categoryId, { name: c.name, color: c.color, cur: c.totalCents, prev: 0 });
  for (const p of prevCats) {
    const m = merged.get(p.categoryId);
    if (m) m.prev = p.totalCents;
    else merged.set(p.categoryId, { name: p.name, color: p.color, cur: 0, prev: p.totalCents });
  }

  return {
    current: { month: current, incomeCents: cur.incomeCents, expenseCents: cur.expenseCents, netCents: cur.incomeCents - cur.expenseCents },
    previous: { month: previous, incomeCents: prev.incomeCents, expenseCents: prev.expenseCents, netCents: prev.incomeCents - prev.expenseCents },
    incomeChangePct: percentChange(cur.incomeCents, prev.incomeCents),
    expenseChangePct: percentChange(cur.expenseCents, prev.expenseCents),
    categories: [...merged.entries()]
      .map(([categoryId, v]) => ({
        categoryId,
        name: v.name,
        color: v.color,
        currentCents: v.cur,
        previousCents: v.prev,
        deltaCents: v.cur - v.prev,
        changePct: percentChange(v.cur, v.prev),
      }))
      .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents)),
  };
}

/** Dia `day` do mês de `monthStart`, limitado ao último dia. */
export function sameDayOrLast(monthStart: ISODate, day: number): ISODate {
  const end = parseISODate(endOfMonth(monthStart)).day;
  const { year, month } = parseISODate(monthStart);
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, end)).padStart(2, "0")}`;
}
