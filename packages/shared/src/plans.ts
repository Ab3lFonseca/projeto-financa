// Planos e limites (monetização futura). Hoje o plano é decidido no servidor;
// com BILLING_ENFORCED=false (beta) todos recebem os recursos do Premium.

export type PlanName = "FREE" | "PREMIUM";

export type PlanLimits = {
  /** null = ilimitado */
  accounts: number | null;
  cards: number | null;
  goals: number | null;
  recurringRules: number | null;
  openFinance: boolean;
  /** Períodos longos/personalizados nos gráficos e comparações avançadas. */
  advancedReports: boolean;
  advancedInsights: boolean;
};

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  FREE: {
    accounts: 2,
    cards: 2,
    goals: 2,
    recurringRules: 10,
    openFinance: false,
    advancedReports: false,
    advancedInsights: false,
  },
  PREMIUM: {
    accounts: null,
    cards: null,
    goals: null,
    recurringRules: null,
    openFinance: true,
    advancedReports: true,
    advancedInsights: true,
  },
};

export type LimitedResource = "accounts" | "cards" | "goals" | "recurringRules";

export const LIMITED_RESOURCE_LABEL_PT: Record<LimitedResource, string> = {
  accounts: "contas",
  cards: "cartões",
  goals: "metas",
  recurringRules: "recorrências",
};

/** Períodos de relatório liberados no plano gratuito. */
export const FREE_REPORT_RANGES = ["this_month", "last_3_months"] as const;
