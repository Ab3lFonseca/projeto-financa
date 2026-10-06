import type { AccessDTO, AccessStateName, PlanName } from "@app/shared";

const DAY_MS = 86_400_000;

/** Configuração da cobrança que decide o acesso. */
export type AccessConfig = {
  /** false = beta: ninguém precisa assinar, tudo liberado. */
  billingEnforced: boolean;
  /** Dias de teste grátis, contados do cadastro. */
  trialDays: number;
  /** Se definido, quem se cadastrou antes dessa data começa o teste nela (o teste de contas antigas não "já nasce vencido"). */
  billingStartsAt: Date | null;
};

export type SubscriptionInfo = {
  plan: PlanName;
  status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  store: "APPLE" | "GOOGLE" | "WEB" | "MANUAL";
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  investmentsAddon: boolean;
} | null;

/** O que o servidor sabe sobre o acesso de alguém. `AccessDTO` é a versão enviada ao app. */
export type AccessInfo = {
  state: AccessStateName;
  allowed: boolean;
  expiresAt: Date | null;
  daysLeft: number | null;
  cancelAtPeriodEnd: boolean;
  features: { investments: boolean };
};

/** Fim do teste grátis: o que o suporte gravou, ou cadastro (ou início da cobrança, se for depois) + dias de teste. */
export function trialEnd(createdAt: Date, subscription: SubscriptionInfo, config: Pick<AccessConfig, "trialDays" | "billingStartsAt">): Date {
  if (subscription?.trialEndsAt) return subscription.trialEndsAt;
  const start = config.billingStartsAt && config.billingStartsAt > createdAt ? config.billingStartsAt : createdAt;
  return new Date(start.getTime() + config.trialDays * DAY_MS);
}

/** Dias inteiros até `end` (0 = acaba hoje ainda); nunca negativo. */
export function daysUntil(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

const make = (state: AccessStateName, allowed: boolean, expiresAt: Date | null, now: Date, cancelAtPeriodEnd: boolean, investments: boolean): AccessInfo => ({
  state,
  allowed,
  expiresAt,
  daysLeft: expiresAt ? daysUntil(expiresAt, now) : null,
  cancelAtPeriodEnd,
  features: { investments },
});

/**
 * Decide como a pessoa acessa o app. Ordem (a primeira que vale decide):
 *  1. cobrança desligada (beta)  → todos liberados, com tudo;
 *  2. administrador              → sempre liberado, com tudo;
 *  3. assinatura paga ou cortesia em dia → liberado; o Rendimentos só se foi contratado/concedido;
 *  4. dentro do teste grátis     → liberado, com tudo (o Rendimentos está incluído no teste);
 *  5. caso contrário             → somente leitura.
 *
 * Assinatura "em atraso" (PAST_DUE) mantém o acesso até o fim do período que já foi pago: o cartão recusado não derruba a pessoa no meio do mês.
 */
export function resolveAccess(input: { role: "USER" | "ADMIN"; createdAt: Date; subscription: SubscriptionInfo; config: AccessConfig; now: Date }): AccessInfo {
  const { role, createdAt, subscription: sub, config, now } = input;
  if (!config.billingEnforced) return make("beta", true, null, now, false, true);
  if (role === "ADMIN") return make("admin", true, null, now, false, true);

  if (sub && sub.plan === "PREMIUM") {
    const periodOpen = !sub.currentPeriodEnd || sub.currentPeriodEnd > now;
    const active = (sub.status === "ACTIVE" || sub.status === "TRIALING") && periodOpen;
    const graceAfterFailure = sub.status === "PAST_DUE" && sub.currentPeriodEnd !== null && sub.currentPeriodEnd > now;
    if (active || graceAfterFailure) {
      return make(sub.store === "MANUAL" ? "complimentary" : "paid", true, sub.currentPeriodEnd, now, sub.cancelAtPeriodEnd, sub.investmentsAddon);
    }
  }

  const end = trialEnd(createdAt, sub, config);
  if (now < end) return make("trial", true, end, now, false, true);
  return make("expired", false, null, now, false, false);
}

/** O plano (Premium/Free) que o resto do servidor usa: Premium enquanto há acesso liberado, Free no modo somente leitura. */
export function planOf(access: AccessInfo): PlanName {
  return access.allowed ? "PREMIUM" : "FREE";
}

/** Versão do acesso que vai para o app (datas em texto ISO). */
export function toAccessDTO(access: AccessInfo): AccessDTO {
  return {
    state: access.state,
    allowed: access.allowed,
    expiresAt: access.expiresAt ? access.expiresAt.toISOString() : null,
    daysLeft: access.daysLeft,
    cancelAtPeriodEnd: access.cancelAtPeriodEnd,
    features: access.features,
  };
}
