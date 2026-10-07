import { trialMeter, type TrialMeter } from "./trialMeter";
import { discountedCents, perMonthCents, yearlySavingsPercent, type AccessDTO, type BillingIntervalName, type BillingModeName, type BillingPrice, type PricesByInterval } from "@app/shared";

type Tone = "default" | "positive" | "negative" | "warning" | "primary";

/** "R$ 9,90 / mês" a partir do preço lido do provedor de pagamento; `null` quando o preço não está disponível. */
export function formatPrice(price: BillingPrice | null | undefined): string | null {
  if (!price) return null;
  const value = new Intl.NumberFormat("pt-BR", { style: "currency", currency: price.currency }).format(price.amountCents / 100);
  return `${value} / ${price.interval === "year" ? "ano" : "mês"}`;
}

/** Uma opção de plano na tela de assinatura (mensal ou anual), já com os textos prontos. */
export type PlanOffer = {
  interval: BillingIntervalName;
  label: string;
  price: BillingPrice;
  total: string;
  perMonth: string | null;
  savings: number | null;
  /** Com desconto de insígnias: o valor final ("R$ 95,00 / ano") e, no anual, quanto dá por mês. `null` = sem desconto. */
  discountedTotal: string | null;
  discountedPerMonth: string | null;
};

const money = (cents: number, currency: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);

/**
 * Opções de plano que existem de verdade no provedor, com o anual primeiro. A economia do anual só aparece quando os dois preços existem e o anual
 * sai mais barato (calculada, nunca escrita à mão). `null` em um ciclo = não oferecido.
 */
export function planOffers(prices: PricesByInterval | null | undefined, discountPercent = 0): PlanOffer[] {
  if (!prices) return [];
  const savings = yearlySavingsPercent(prices);
  const off = discountPercent > 0;
  const make = (interval: BillingIntervalName, price: BillingPrice | null): PlanOffer[] => {
    if (!price) return [];
    const per = interval === "year" ? "ano" : "mês";
    const discounted = discountedCents(price.amountCents, discountPercent);
    return [
      {
        interval,
        label: interval === "year" ? "Anual" : "Mensal",
        price,
        total: `${money(price.amountCents, price.currency)} / ${per}`,
        perMonth: interval === "year" ? `${money(perMonthCents(price), price.currency)} por mês` : null,
        savings: interval === "year" ? savings : null,
        discountedTotal: off ? `${money(discounted, price.currency)} / ${per}` : null,
        discountedPerMonth: off && interval === "year" ? `${money(perMonthCents({ ...price, amountCents: discounted }), price.currency)} por mês` : null,
      },
    ];
  };
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

export type AccessStripInfo = {
  tone: "info" | "warning" | "negative";
  icon: string;
  text: string;
  /** Versão grande (cartão do Início): título curto e a explicação embaixo. */
  title: string;
  detail: string;
  /** Texto do botão que leva à assinatura. */
  cta: string;
  /** Barra de progressão do teste (só durante o teste grátis): fração usada, cor, tremor e suor. */
  meter: TrialMeter | null;
};

/**
 * Faixa fixa no alto das telas principais (Início, Transações, Gráficos, Carteira, Investir e Mais). Só aparece com a cobrança ligada:
 * **durante todo o teste grátis** diz quanto falta e até quando, com o botão para assinar já; no modo somente leitura, avisa; e para quem pagou
 * uma vez (ou cancelou) avisa perto do fim. Assinante em dia, cortesia, administrador e beta não veem nada.
 */
export function accessStrip(access: AccessDTO, enforced: boolean, trialDays = 30): AccessStripInfo | null {
  if (!enforced) return null;
  if (access.state === "expired") {
    return {
      tone: "negative",
      icon: "lock",
      text: "Somente leitura: seu teste grátis acabou",
      title: "Somente leitura",
      detail: "Seu teste grátis acabou. Assine para voltar a criar e editar; você continua vendo e exportando tudo.",
      cta: "Assinar",
      meter: null,
    };
  }
  const days = access.daysLeft;
  if (access.state === "trial" && days !== null) {
    const left = days === 0 ? "termina hoje" : days === 1 ? "falta 1 dia" : `faltam ${days} dias`;
    const until = access.expiresAt && days > 0 ? ` (até ${dateText(access.expiresAt)})` : "";
    return {
      tone: days <= 5 ? "warning" : "info",
      icon: "clock",
      text: `Teste grátis: ${left}${until}`,
      title: days === 0 ? "Último dia do teste grátis" : days === 1 ? "Falta 1 dia de teste grátis" : `Faltam ${days} dias de teste grátis`,
      detail:
        days === 0
          ? "Hoje é o último dia. Assine para continuar criando e editando."
          : `${access.expiresAt ? `Termina em ${dateText(access.expiresAt)}. ` : ""}Depois disso o app fica somente leitura. Dá para assinar já.`,
      cta: "Assinar agora",
      meter: trialMeter(days, trialDays),
    };
  }
  if (access.state === "paid" && access.cancelAtPeriodEnd && days !== null && days <= 7) {
    const when = days === 0 ? "termina hoje" : `termina em ${daysText(days)}`;
    return { tone: "warning", icon: "calendar-clock", text: `Seu plano ${when}`, title: `Seu plano ${when}`, detail: "Renove para não perder o acesso para criar e editar.", cta: "Renovar", meter: null };
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
