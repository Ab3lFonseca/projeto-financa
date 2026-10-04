import { z } from "zod";
import { accountDTO } from "./accounts";
import { budgetDTO, goalDTO } from "./budgets-goals";
import { cardDTO } from "./cards";
import { isoDate, uuid } from "./common";
import { upcomingOccurrenceDTO } from "./recurring";
import { transactionDTO } from "./transactions";

export const insightKind = z.enum([
  "SPENDING_DOWN",
  "SPENDING_UP",
  "CATEGORY_DOWN",
  "CATEGORY_UP",
  "BUDGET_NEAR_LIMIT",
  "BUDGET_EXCEEDED",
  "SAVINGS_POSITIVE",
  "SAVINGS_NEGATIVE",
  "INVOICE_DUE_SOON",
  "GOAL_PROGRESS",
]);

export const insightDTO = z.object({
  id: z.string(),
  kind: insightKind,
  severity: z.enum(["positive", "info", "warning", "critical"]),
  /** Frase pronta, em português, com base nos dados reais do usuário. */
  message: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
});

export const monthSummaryDTO = z.object({
  month: isoDate,
  incomeCents: z.number().int(),
  expenseCents: z.number().int(),
  /** Receitas − despesas do mês. */
  savingsCents: z.number().int(),
  /** Economia ÷ receitas (0–100), null sem receitas. */
  savingsRatePct: z.number().nullable(),
  previousIncomeCents: z.number().int(),
  previousExpenseCents: z.number().int(),
  incomeChangePct: z.number().nullable(),
  expenseChangePct: z.number().nullable(),
});

export const dashboardDTO = z.object({
  today: isoDate,
  totalBalanceCents: z.number().int(),
  month: monthSummaryDTO,
  recentTransactions: z.array(transactionDTO),
  spendingByCategory: z.array(
    z.object({
      categoryId: uuid.nullable(),
      name: z.string(),
      icon: z.string(),
      color: z.string(),
      totalCents: z.number().int(),
      pct: z.number(),
    }),
  ),
  /** Últimos 6 meses (mais antigo primeiro). */
  evolution: z.array(
    z.object({
      month: isoDate,
      incomeCents: z.number().int(),
      expenseCents: z.number().int(),
      /** Saldo consolidado no fim do mês. */
      balanceCents: z.number().int(),
    }),
  ),
  accounts: z.array(accountDTO),
  cards: z.array(cardDTO),
  budgetAlerts: z.array(budgetDTO),
  goals: z.array(goalDTO),
  upcoming: z.object({
    bills: z.array(upcomingOccurrenceDTO),
    invoices: z.array(
      z.object({
        cardId: uuid,
        cardName: z.string(),
        invoiceId: uuid,
        dueDate: isoDate,
        remainingCents: z.number().int(),
      }),
    ),
  }),
  insights: z.array(insightDTO),
  unreadNotifications: z.number().int(),
});

export type DashboardDTO = z.infer<typeof dashboardDTO>;
export type InsightDTO = z.infer<typeof insightDTO>;
export type MonthSummaryDTO = z.infer<typeof monthSummaryDTO>;
