import type { AccessDTO, BillingPrice } from "@app/shared";

type Tone = "default" | "positive" | "negative" | "warning" | "primary";

/** "R$ 9,90 / mês" a partir do preço lido do provedor de pagamento; `null` quando o preço não está disponível. */
export function formatPrice(price: BillingPrice | null | undefined): string | null {
  if (!price) return null;
  const value = new Intl.NumberFormat("pt-BR", { style: "currency", currency: price.currency }).format(price.amountCents / 100);
  return `${value} / ${price.interval === "year" ? "ano" : "mês"}`;
}

/** Valor em centavos como "R$ 1.234,56" (painel do administrador). */
export function formatMoneyCents(cents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

/** "hoje", "1 dia", "12 dias". */
export function daysText(days: number): string {
  if (days <= 0) return "hoje";
  return days === 1 ? "1 dia" : `${days} dias`;
}

/** Data curta (dd/mm/aaaa) de um instante ISO. */
export function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export type AccessSummary = { badge: { label: string; tone: Tone }; title: string; detail: string };

/** Como a situação da pessoa aparece na tela de assinatura e no cartão de perfil. */
export function accessSummary(access: AccessDTO): AccessSummary {
  switch (access.state) {
    case "beta":
      return { badge: { label: "Beta", tone: "primary" }, title: "Acesso liberado", detail: "Durante o lançamento todos os recursos estão liberados para você." };
    case "trial":
      return {
        badge: { label: "Teste grátis", tone: "primary" },
        title: "Teste grátis",
        detail: access.expiresAt ? `Termina em ${dateText(access.expiresAt)} (${access.daysLeft === 0 ? "hoje" : `faltam ${daysText(access.daysLeft ?? 0)}`}). Tudo está liberado.` : "Tudo está liberado.",
      };
    case "paid":
      return {
        badge: { label: "Premium", tone: "positive" },
        title: "Assinatura ativa",
        detail: access.expiresAt
          ? access.cancelAtPeriodEnd
            ? `Cancelada: vale até ${dateText(access.expiresAt)}. Depois disso o app fica somente leitura.`
            : `Renova em ${dateText(access.expiresAt)}.`
          : "Assinatura em dia.",
      };
    case "complimentary":
      return {
        badge: { label: "Cortesia", tone: "positive" },
        title: "Acesso gratuito",
        detail: access.expiresAt ? `Liberado até ${dateText(access.expiresAt)}.` : "Liberado, sem data para acabar.",
      };
    case "admin":
      return { badge: { label: "Admin", tone: "primary" }, title: "Conta administradora", detail: "Acesso total, sem cobrança." };
    case "expired":
      return {
        badge: { label: "Somente leitura", tone: "negative" },
        title: "Teste encerrado",
        detail: "Você continua vendo tudo e pode exportar seus dados, mas só volta a criar e editar assinando.",
      };
  }
}

export type AccessBannerInfo = { tone: "info" | "warning" | "negative"; icon: string; text: string };

/**
 * Aviso no topo da tela inicial. Só aparece com a cobrança ligada e quando há algo a fazer: teste perto do fim, modo somente leitura
 * ou assinatura cancelada prestes a acabar. Quem está em dia (ou no beta) não vê nada.
 */
export function accessBanner(access: AccessDTO, enforced: boolean): AccessBannerInfo | null {
  if (!enforced) return null;
  if (access.state === "expired") {
    return { tone: "negative", icon: "lock", text: "Modo somente leitura: seu teste grátis acabou. Toque para assinar e voltar a criar e editar." };
  }
  const days = access.daysLeft;
  if (access.state === "trial" && days !== null && days <= 10) {
    const when = days === 0 ? "termina hoje" : `termina em ${daysText(days)}`;
    return { tone: days <= 5 ? "warning" : "info", icon: "clock", text: `Seu teste grátis ${when}. Toque para ver o plano.` };
  }
  if (access.state === "paid" && access.cancelAtPeriodEnd && days !== null && days <= 7) {
    return { tone: "warning", icon: "calendar-clock", text: `Sua assinatura ${days === 0 ? "termina hoje" : `termina em ${daysText(days)}`}. Toque para reativar.` };
  }
  return null;
}

/** Etiqueta curta do cartão de perfil (aba Mais) e das listas. */
export function accessBadge(access: AccessDTO): { label: string; tone: Tone } {
  return accessSummary(access).badge;
}

/** Duração da cortesia que o administrador escolhe. `days: null` = sem data para acabar. */
export const GRANT_DURATIONS: { label: string; days: number | null }[] = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "1 ano", days: 365 },
  { label: "Sem prazo", days: null },
];

/** Nome do estado de acesso para o painel do administrador. */
export const ACCESS_STATE_LABEL: Record<AccessDTO["state"], string> = {
  beta: "Beta (todos liberados)",
  trial: "Teste grátis",
  paid: "Assinante",
  complimentary: "Cortesia",
  admin: "Administrador",
  expired: "Teste vencido (somente leitura)",
};
