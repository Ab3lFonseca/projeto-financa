import { z } from "zod";
import { diffDays } from "../dates";
import { MAX_CUSTOM_RANGE_DAYS } from "../ranges";
import { CategoryType } from "../enums";
import { isoDate, monthParam, uuid } from "./common";

export const reportRange = z.enum(["this_month", "last_3_months", "last_6_months", "this_year", "custom"]);

const reportFields = {
  range: reportRange.default("this_month"),
  /** Apenas com range=custom. */
  from: isoDate.optional(),
  to: isoDate.optional(),
};

function validateCustom(v: { range: string; from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (v.range !== "custom") return;
  if (!v.from || !v.to) {
    ctx.addIssue({ code: "custom", path: ["from"], message: "Informe from e to para o período personalizado" });
    return;
  }
  if (v.from > v.to) {
    ctx.addIssue({ code: "custom", path: ["from"], message: "A data inicial deve ser anterior à final" });
  } else if (diffDays(v.from, v.to) > MAX_CUSTOM_RANGE_DAYS) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "Período muito longo (máximo de 3 anos)" });
  }
}

export const reportQuery = z.object(reportFields).superRefine(validateCustom);

export const granularity = z.enum(["week", "month"]);

export const seriesQuery = z
  .object({ ...reportFields, granularity: granularity.optional() })
  .superRefine(validateCustom);

export const categoryBreakdownQuery = z
  .object({ ...reportFields, type: CategoryType.default("EXPENSE") })
  .superRefine(validateCustom);

export const monthComparisonQuery = z.object({ month: monthParam.optional() });

export const resolvedRangeDTO = z.object({ range: reportRange, from: isoDate, to: isoDate });

export const categoryBreakdownDTO = z.object({
  range: resolvedRangeDTO,
  type: CategoryType,
  totalCents: z.number().int(),
  items: z.array(
    z.object({
      categoryId: uuid.nullable(),
      name: z.string(),
      icon: z.string(),
      color: z.string(),
      totalCents: z.number().int(),
      /** 0–100 */
      pct: z.number(),
      count: z.number().int(),
    }),
  ),
});

export const incomeVsExpenseDTO = z.object({
  range: resolvedRangeDTO,
  granularity,
  points: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      startDate: isoDate,
      incomeCents: z.number().int(),
      expenseCents: z.number().int(),
      netCents: z.number().int(),
    }),
  ),
});

export const balanceEvolutionDTO = z.object({
  range: resolvedRangeDTO,
  startingBalanceCents: z.number().int(),
  endingBalanceCents: z.number().int(),
  points: z.array(z.object({ date: isoDate, balanceCents: z.number().int() })),
});

export const cashFlowDTO = z.object({
  range: resolvedRangeDTO,
  granularity,
  points: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      startDate: isoDate,
      /** Entradas em conta. */
      inflowCents: z.number().int(),
      /** Saídas de conta: despesas pagas direto + pagamentos de fatura (regime de caixa). */
      outflowCents: z.number().int(),
      netCents: z.number().int(),
      cumulativeCents: z.number().int(),
    }),
  ),
});

const monthTotals = z.object({
  month: isoDate,
  incomeCents: z.number().int(),
  expenseCents: z.number().int(),
  netCents: z.number().int(),
});

export const monthComparisonDTO = z.object({
  current: monthTotals,
  previous: monthTotals,
  incomeChangePct: z.number().nullable(),
  expenseChangePct: z.number().nullable(),
  categories: z.array(
    z.object({
      categoryId: uuid.nullable(),
      name: z.string(),
      color: z.string(),
      currentCents: z.number().int(),
      previousCents: z.number().int(),
      deltaCents: z.number().int(),
      changePct: z.number().nullable(),
    }),
  ),
});

export type CategoryBreakdownDTO = z.infer<typeof categoryBreakdownDTO>;
export type IncomeVsExpenseDTO = z.infer<typeof incomeVsExpenseDTO>;
export type BalanceEvolutionDTO = z.infer<typeof balanceEvolutionDTO>;
export type CashFlowDTO = z.infer<typeof cashFlowDTO>;
export type MonthComparisonDTO = z.infer<typeof monthComparisonDTO>;
