import { z } from "zod";
import { badgeDiscountDTO } from "../badges";
import { timestamp } from "./common";

/**
 * Como a pessoa acessa o app agora:
 *  - beta:          cobrança desligada, todos usam de graça (inclusive os recursos adicionais);
 *  - trial:         teste grátis (30 dias por padrão, contados do cadastro), com TUDO liberado, inclusive o adicional Rendimentos;
 *  - paid:          assinatura paga em dia (plano básico; o adicional Rendimentos só se foi contratado);
 *  - complimentary: cortesia concedida pela equipe (sem pagar; quem concede escolhe se inclui o Rendimentos);
 *  - admin:         conta administradora (sempre liberada, com tudo);
 *  - expired:       o teste acabou e não há assinatura: o app fica **somente leitura** (consulta e exporta, não cria nem edita).
 */
export const accessStates = ["beta", "trial", "paid", "complimentary", "admin", "expired"] as const;
export const AccessState = z.enum(accessStates);
export type AccessStateName = z.infer<typeof AccessState>;

export const accessDTO = z.object({
  state: AccessState,
  /** Pode criar e editar? `false` = somente leitura. */
  allowed: z.boolean(),
  /** Fim do teste, do período pago ou da cortesia. `null` = sem data de fim. */
  expiresAt: timestamp.nullable(),
  /** Dias inteiros que faltam para `expiresAt` (0 = termina hoje); `null` quando não há fim. */
  daysLeft: z.number().int().nullable(),
  /** A assinatura foi cancelada e termina no fim do período já pago. */
  cancelAtPeriodEnd: z.boolean(),
  /** Recursos adicionais liberados. */
  features: z.object({
    /** Rendimentos: painel de CDI/CDB, porquinhos e investimentos acompanhados todo dia. */
    investments: z.boolean(),
  }),
});
export type AccessDTO = z.infer<typeof accessDTO>;

export const billingProviderName = z.enum(["none", "stripe", "dev"]);

/** Ciclo de cobrança: todo mês ou todo ano. */
export const billingIntervals = ["month", "year"] as const;
export const BillingInterval = z.enum(billingIntervals);
export type BillingIntervalName = z.infer<typeof BillingInterval>;

const priceDTO = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  interval: BillingInterval,
});

/** Preço de um item (plano ou adicional) em cada ciclo; `null` = não oferecido nesse ciclo. */
const pricesByInterval = z.object({ month: priceDTO.nullable(), year: priceDTO.nullable() });
export type PricesByInterval = z.infer<typeof pricesByInterval>;

export const billingDTO = z.object({
  access: accessDTO,
  /** `false` no beta: a cobrança está desligada e ninguém precisa assinar. */
  enforced: z.boolean(),
  trialDays: z.number().int(),
  provider: billingProviderName,
  /** Dá para começar a assinar agora (provedor configurado). */
  checkoutAvailable: z.boolean(),
  /** O adicional Rendimentos pode ser contratado (existe preço configurado para ele). */
  investmentsAvailable: z.boolean(),
  /** Já tem assinatura no provedor e pode gerenciá-la (trocar cartão, cancelar). */
  canManage: z.boolean(),
  /** Tem o adicional Rendimentos contratado (independe do teste grátis). */
  hasInvestmentsAddon: z.boolean(),
  /** Ciclo da assinatura paga atual (mensal ou anual). `null` = sem assinatura paga pelo app (teste, cortesia, administrador). */
  interval: BillingInterval.nullable(),
  /** `true` = renova sozinha; `false` = paga uma vez, por um período fechado (vale até a data e não renova); `null` = sem pagamento pelo app. */
  autoRenew: z.boolean().nullable(),
  /** Preços lidos do provedor de pagamento, por ciclo (nunca ficam escritos no app). `null` = não oferecido. */
  prices: z.object({ basic: pricesByInterval, investments: pricesByInterval }),
  /** Desconto ganho com insígnias (Ouro ou acima), aplicado na assinatura. O servidor é quem calcula; o app só mostra. */
  discount: badgeDiscountDTO,
});
export type BillingDTO = z.infer<typeof billingDTO>;
export type BillingPrice = z.infer<typeof priceDTO>;

/** Como pagar: `recurring` renova sozinha (assinatura); `once` paga uma vez por um período fechado, sem renovação (aceita Pix). */
export const billingModes = ["recurring", "once"] as const;
export const BillingMode = z.enum(billingModes);
export type BillingModeName = z.infer<typeof BillingMode>;

/** Quantos dias vale um pagamento avulso: mensal = 30 dias, anual = 365 dias. */
export const PREPAID_DAYS: Record<BillingIntervalName, number> = { month: 30, year: 365 };

export const checkoutBody = z.strictObject({
  /** Já começar com o adicional Rendimentos. */
  investments: z.boolean().default(false),
  /** Ciclo escolhido. Sem informar, vale o mensal (nunca cobra o anual sem a pessoa pedir). */
  interval: BillingInterval.default("month"),
  /** Sem informar, vale a assinatura que renova (o jeito de sempre). */
  mode: BillingMode.default("recurring"),
});

/** O que o plano custa por mês, em centavos: o anual dividido por 12 (arredondado). */
export function perMonthCents(price: BillingPrice): number {
  return price.interval === "year" ? Math.round(price.amountCents / 12) : price.amountCents;
}

/**
 * Quanto a pessoa economiza escolhendo o anual em vez de pagar 12 mensais (% inteiro, calculado só com os preços lidos do provedor).
 * `null` quando falta um dos preços, as moedas diferem ou o anual não sai mais barato.
 */
export function yearlySavingsPercent(prices: PricesByInterval): number | null {
  const { month, year } = prices;
  if (!month || !year || month.currency !== year.currency || month.amountCents <= 0) return null;
  const pct = Math.round((1 - year.amountCents / (month.amountCents * 12)) * 100);
  return pct > 0 ? pct : null;
}

export const checkoutDTO = z.object({
  /** Endereço da página de pagamento do provedor; `null` quando a assinatura foi ativada na hora (só no modo de desenvolvimento). */
  url: z.url().nullable(),
  activated: z.boolean(),
});

export const portalDTO = z.object({ url: z.url() });

/** Liga ou desliga o adicional Rendimentos numa assinatura que já existe. */
export const addonBody = z.strictObject({ enabled: z.boolean() });

/** Concessão de acesso gratuito (cortesia). `days: null` = sem data de fim. */
export const grantAccessBody = z.strictObject({
  days: z.number().int().min(1).max(3650).nullable(),
  /** Inclui o adicional Rendimentos. */
  investments: z.boolean().default(false),
});
