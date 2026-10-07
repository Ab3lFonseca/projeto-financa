import { diffDays, formatBRL, monthNamePt, type BudgetDTO, type GoalDTO, type InsightDTO, type ISODate } from "@app/shared";

export type CategoryDelta = {
  categoryId: string | null;
  name: string;
  currentCents: number;
  previousCents: number;
};

export type InsightInput = {
  today: ISODate;
  /** O último mês FECHADO (inteiro), ou null se não teve lançamentos. Economia só existe aqui, nunca no mês em andamento. */
  previousMonth: { month: ISODate; incomeCents: number; expenseCents: number } | null;
  /** Comparativo justo: mês corrente até hoje × mês anterior até o mesmo dia. */
  expenseToDateCents: number;
  previousExpenseToDateCents: number;
  categories: CategoryDelta[];
  budgets: Pick<BudgetDTO, "id" | "category" | "usedPct" | "status" | "spentCents" | "amountCents">[];
  invoicesDue: { cardName: string; dueDate: ISODate; remainingCents: number }[];
  goals: Pick<GoalDTO, "id" | "name" | "progressPct" | "status">[];
  /** Plano Premium libera comparativos por categoria e metas. */
  advanced: boolean;
};

const SEVERITY_ORDER: Record<InsightDTO["severity"], number> = { critical: 0, warning: 1, positive: 2, info: 3 };

const pct = (n: number) => `${Math.abs(Math.round(n))}%`;

/** Dia do mês a partir do qual comparações com o mês anterior passam a ser mostradas. */
export const MIN_DAYS_FOR_COMPARISON = 7;

/** O aviso "sobraram R$ X em <mês passado>" aparece só até este dia do mês (depois disso é notícia velha). */
export const CLOSED_MONTH_INSIGHT_DAYS = 10;

/**
 * Insights em português a partir dos dados reais do usuário. Regras determinísticas
 * (sem IA): cada frase só é gerada quando há base de comparação e o valor é relevante.
 */
export function buildInsights(input: InsightInput): InsightDTO[] {
  const out: InsightDTO[] = [];

  // Variações percentuais só fazem sentido com alguns dias de dados no mês:
  // nos primeiros dias, um único boleto vira "+600%" e só gera ruído.
  const enoughDays = Number(input.today.slice(8, 10)) >= MIN_DAYS_FOR_COMPARISON;

  // --- despesas: este mês × mês anterior (mesmo período)
  const { expenseToDateCents: cur, previousExpenseToDateCents: prev } = input;
  if (enoughDays && prev >= 5_000 && cur >= 1_000) {
    const change = ((cur - prev) / prev) * 100;
    if (change >= 5) {
      out.push({
        id: "spending-up",
        kind: "SPENDING_UP",
        severity: change >= 20 ? "warning" : "info",
        message: `Suas despesas aumentaram ${pct(change)} em relação ao mês passado.`,
        data: { changePct: Math.round(change * 10) / 10 },
      });
    } else if (change <= -5) {
      out.push({
        id: "spending-down",
        kind: "SPENDING_DOWN",
        severity: "positive",
        message: `Suas despesas caíram ${pct(change)} em relação ao mês passado.`,
        data: { changePct: Math.round(change * 10) / 10 },
      });
    }
  }

  // --- economia: SÓ do mês que já fechou, e só nos primeiros dias do mês seguinte (depois disso a notícia é velha).
  // Receita lançada no mês em andamento (o salário, por exemplo) nunca vira "economia": o mês ainda não acabou.
  const closed = input.previousMonth;
  if (closed && (closed.incomeCents > 0 || closed.expenseCents > 0) && Number(input.today.slice(8, 10)) <= CLOSED_MONTH_INSIGHT_DAYS) {
    const leftover = closed.incomeCents - closed.expenseCents;
    const name = monthNamePt(closed.month);
    if (leftover > 0) {
      out.push({
        id: "savings-positive",
        kind: "SAVINGS_POSITIVE",
        severity: "positive",
        message: `Em ${name} sobraram ${formatBRL(leftover)} do que você recebeu.`,
        data: { savingsCents: leftover, month: closed.month },
      });
    } else if (leftover < 0) {
      out.push({
        id: "savings-negative",
        kind: "SAVINGS_NEGATIVE",
        severity: "warning",
        message: `Em ${name} você gastou ${formatBRL(-leftover)} a mais do que recebeu.`,
        data: { savingsCents: leftover, month: closed.month },
      });
    }
  }

  // --- orçamentos
  for (const b of input.budgets) {
    if (b.status === "EXCEEDED") {
      out.push({
        id: `budget-exceeded-${b.id}`,
        kind: "BUDGET_EXCEEDED",
        severity: "critical",
        message: `Você ultrapassou o orçamento de ${b.category.name} em ${formatBRL(Math.max(b.spentCents - b.amountCents, 0))}.`,
        data: { budgetId: b.id, usedPct: b.usedPct },
      });
    } else if (b.status === "WARNING") {
      out.push({
        id: `budget-near-${b.id}`,
        kind: "BUDGET_NEAR_LIMIT",
        severity: "warning",
        message: `Você está próximo de ultrapassar seu orçamento de ${b.category.name} (${pct(b.usedPct)} usado).`,
        data: { budgetId: b.id, usedPct: b.usedPct },
      });
    }
  }

  // --- faturas a vencer
  for (const inv of input.invoicesDue) {
    const days = diffDays(input.today, inv.dueDate);
    if (days >= 0 && days <= 5 && inv.remainingCents > 0) {
      const when = days === 0 ? "vence hoje" : days === 1 ? "vence amanhã" : `vence em ${days} dias`;
      out.push({
        id: `invoice-due-${inv.cardName}-${inv.dueDate}`,
        kind: "INVOICE_DUE_SOON",
        severity: days <= 1 ? "critical" : "warning",
        message: `A fatura do ${inv.cardName} ${when} (${formatBRL(inv.remainingCents)}).`,
        data: { dueDate: inv.dueDate, remainingCents: inv.remainingCents },
      });
    }
  }

  if (input.advanced) {
    // --- categoria com a maior variação relevante (mesmo período do mês anterior)
    const candidates = (enoughDays ? input.categories : [])
      .filter((c) => c.previousCents >= 5_000 || c.currentCents >= 5_000)
      .map((c) => ({ ...c, delta: c.currentCents - c.previousCents }))
      .filter((c) => c.previousCents > 0 && Math.abs(c.delta) >= 3_000 && Math.abs(c.delta / c.previousCents) >= 0.1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const top = candidates[0];
    if (top) {
      const change = (top.delta / top.previousCents) * 100;
      out.push(
        top.delta < 0
          ? {
              id: `category-down-${top.categoryId ?? "none"}`,
              kind: "CATEGORY_DOWN",
              severity: "positive",
              message: `Você gastou ${pct(change)} menos com ${top.name} este mês.`,
              data: { categoryId: top.categoryId, changePct: Math.round(change * 10) / 10 },
            }
          : {
              id: `category-up-${top.categoryId ?? "none"}`,
              kind: "CATEGORY_UP",
              severity: "info",
              message: `Você gastou ${pct(change)} a mais com ${top.name} este mês.`,
              data: { categoryId: top.categoryId, changePct: Math.round(change * 10) / 10 },
            },
      );
    }

    // --- meta quase lá
    const goal = input.goals
      .filter((g) => g.status === "ACTIVE" && g.progressPct >= 75 && g.progressPct < 100)
      .sort((a, b) => b.progressPct - a.progressPct)[0];
    if (goal) {
      out.push({
        id: `goal-progress-${goal.id}`,
        kind: "GOAL_PROGRESS",
        severity: "positive",
        message: `Falta pouco para a meta "${goal.name}": ${pct(goal.progressPct)} concluída.`,
        data: { goalId: goal.id, progressPct: goal.progressPct },
      });
    }
  }

  return out
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 6);
}
