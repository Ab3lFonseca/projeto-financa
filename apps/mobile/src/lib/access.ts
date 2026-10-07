import { perMonthCents, yearlySavingsPercent, type AccessDTO, type BillingIntervalName, type BillingModeName, type BillingPrice, type PricesByInterval } from "@app/shared";

type Tone = "default" | "positive" | "negative" | "warning" | "primary";

/** "R$ 9,90 / mês" a partir do preço lido do provedor de pagamento; `null` quando o preço não está disponível. */
export function formatPrice(price: BillingPrice | null | undefined): string | null {
  if (!price) return null;
  const value = new Intl.NumberFormat("pt-BR", { style: "currency", currency: price.currency }).format(price.amountCents / 100);
  return `${value} / ${price.interval === "year" ? "ano" : "mês"}`;
}

/** Uma opção de plano na tela de assinatura (mensal ou anual), já com os textos prontos. */
export type PlanOffer = { interval: BillingIntervalName; label: string; price: BillingPrice; total: string; perMonth: string | null; savings: number | null };

const money = (cents: number, currency: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);

/**
 * Opções de plano que existem de verdade no provedor, com o anual primeiro. A economia do anual só aparece quando os dois preços existem e o anual
 * sai mais barato (calculada, nunca escrita à mão). `null` em um ciclo = não oferecido.
 */
export function planOffers(prices: PricesByInterval | null | undefined): PlanOffer[] {
  if (!prices) return [];
  const savings = yearlySavingsPercent(prices);
  const make = (interval: BillingIntervalName, price: BillingPrice | null): PlanOffer[] =>
    price
      ? [
          {
            interval,
            label: interval === "year" ? "Anual" : "Mensal",
            price,
            total: `${money(price.amountCents, price.currency)} / ${interval === "year" ? "ano" : "mês"}`,
            perMonth: interval === "year" ? `${money(perMonthCents(price), price.currency)} por mês` : null,
            savings: interval === "year" ? savings : null,
          },
        ]
      : [];
  return [...make("year", prices.year), ...make("month", prices.month)];
}

/** O ciclo que já vem marcado: o anual, quando existe (é o que a pessoa vê primeiro); senão o mensal. */
export function defaultInterval(offers: PlanOffer[]): BillingIntervalName {
  return offers.find((o) => o.interval === "year")?.interval ?? offers[0]?.interval ?? "month";
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

/**
 * Como a situação da pessoa aparece na tela de assinatura e no cartão de perfil. `autoRenew === false` = pagou uma vez por um período fechado
 * (não renova sozinho): o texto fala em "pago até", nunca em "cancelada".
 */
export function accessSummary(access: AccessDTO, autoRenew?: boolean | null): AccessSummary {
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
      if (autoRenew === false) {
        return {
          badge: { label: "Premium", tone: "positive" },
          title: "Plano ativo",
          detail: access.expiresAt
            ? `Pago até ${dateText(access.expiresAt)}, sem renovação automática. Depois disso o app fica somente leitura; renove quando quiser.`
            : "Plano pago, sem renovação automática.",
        };
      }
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
    return { tone: "warning", icon: "calendar-clock", text: `Seu plano ${days === 0 ? "termina hoje" : `termina em ${daysText(days)}`}. Toque para renovar.` };
  }
  return null;
}

/** Etiqueta curta do cartão de perfil (aba Mais) e das listas. */
export function accessBadge(access: AccessDTO): { label: string; tone: Tone } {
  return accessSummary(access).badge;
}

/** As duas formas de pagar: assinatura que renova sozinha (cartão) ou pagamento único por um período fechado (aceita Pix). */
export const PAYMENT_MODE_OPTIONS: { value: BillingModeName; label: string }[] = [
  { value: "recurring", label: "Renova sozinha" },
  { value: "once", label: "Pagar uma vez" },
];

/** Explicação curta, embaixo da escolha, do que cada forma de pagar significa. */
export function paymentModeHint(mode: BillingModeName, interval: BillingIntervalName): string {
  const period = interval === "year" ? "1 ano" : "30 dias";
  return mode === "once"
    ? `Você paga uma vez e usa por ${period}, sem renovação automática e sem cobrança surpresa. Aceita Pix e cartão. Quando acabar, é só pagar de novo.`
    : "O cartão é cobrado automaticamente a cada ciclo. Você cancela quando quiser, sem multa.";
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
