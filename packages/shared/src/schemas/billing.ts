import { z } from "zod";
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

const priceDTO = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  interval: z.enum(["month", "year"]),
});

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
  /** Preços lidos do provedor de pagamento (nunca ficam escritos no app). `null` = não configurado. */
  prices: z.object({ basic: priceDTO.nullable(), investments: priceDTO.nullable() }),
});
export type BillingDTO = z.infer<typeof billingDTO>;
export type BillingPrice = z.infer<typeof priceDTO>;

export const checkoutBody = z.strictObject({
  /** Já começar com o adicional Rendimentos. */
  investments: z.boolean().default(false),
});

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
