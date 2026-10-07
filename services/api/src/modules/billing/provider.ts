import type { BillingIntervalName, BillingModeName, BillingPrice } from "@app/shared";

export type BillingProviderName = "stripe" | "dev";

/** Ciclo de cobrança: todo mês ou todo ano. */
export type BillingInterval = BillingIntervalName;
/** Como paga: assinatura que renova ou pagamento avulso por um período fechado. */
export type BillingMode = BillingModeName;

/** Preço de um item em cada ciclo; `null` = o provedor não tem esse preço configurado. */
export type PricesByInterval = { month: BillingPrice | null; year: BillingPrice | null };

/** Tudo o que se pode vender: o plano básico e o adicional Rendimentos, cada um em cada ciclo. */
export type BillingCatalog = { basic: PricesByInterval; investments: PricesByInterval };

export const EMPTY_PRICES: PricesByInterval = { month: null, year: null };
export const EMPTY_CATALOG: BillingCatalog = { basic: EMPTY_PRICES, investments: EMPTY_PRICES };

/** Erro do provedor de pagamento. O código é estável; texto livre do provedor nunca vai para o cliente. */
export class BillingProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BillingProviderError";
  }
}

/** Assinatura como o servidor a entende, independente de qual provedor cobra. */
export type NormalizedSubscription = {
  providerSubscriptionId: string;
  providerCustomerId: string;
  /** Id do usuário que o servidor gravou ao abrir o pagamento (`metadata.user_id`); nulo se não veio. */
  userId: string | null;
  /** INCOMPLETE = o pagamento ainda não foi concluído: não dá acesso nem apaga o que já existe. */
  status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "INCOMPLETE";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Ciclo do plano (mensal ou anual), lido do item do plano básico; nulo se o provedor não informou ou não é mensal/anual simples. */
  interval: BillingInterval | null;
  /** Tem o item do adicional Rendimentos. */
  investmentsAddon: boolean;
  /** Id do item do adicional dentro da assinatura (para removê-lo depois). */
  investmentsItemId: string | null;
};

/** O que um webhook confirmado diz: qual evento é e qual assinatura reler. O estado em si vem sempre da API do provedor. */
export type ParsedWebhook = {
  id: string;
  type: string;
  subscriptionId: string | null;
  userId: string | null;
  /** Pagamento avulso (uma vez): a sessão de pagamento a conferir no provedor. Nulo nos demais eventos. */
  prepaidSessionId: string | null;
};

/** Pagamento avulso lido do provedor (o que o servidor gravou ao abrir o pagamento, e se já foi pago). */
export type PrepaidPayment = {
  sessionId: string;
  userId: string;
  interval: BillingInterval;
  investments: boolean;
  /** O dinheiro já entrou? Pix aguarda a pessoa pagar: antes disso, `false`. */
  paid: boolean;
  customerId: string | null;
};

export interface BillingProvider {
  readonly name: BillingProviderName;
  /** Preços cadastrados no provedor, por ciclo (nunca ficam no código). Um ciclo sem preço configurado vem `null`. */
  catalog(): Promise<BillingCatalog>;
  /** O adicional Rendimentos tem preço configurado em algum ciclo (sem consultar o provedor). */
  readonly supportsInvestments: boolean;
  createCheckout(input: {
    userId: string;
    email: string;
    customerId: string | null;
    interval: BillingInterval;
    investments: boolean;
    /** `recurring` (padrão) = assinatura que renova; `once` = paga uma vez por um período fechado (aceita Pix). */
    mode?: BillingMode;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  /** Lê um pagamento avulso (sessão de pagamento) no provedor. `null` se não for um pagamento avulso nosso. */
  fetchPrepaidSession(sessionId: string): Promise<PrepaidPayment | null>;
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** O adicional segue o ciclo da assinatura (o provedor exige o mesmo ciclo em todos os itens), por isso `interval` é o dela. */
  setInvestmentsAddon(input: { subscriptionId: string; itemId: string | null; enabled: boolean; interval: BillingInterval }): Promise<void>;
  fetchSubscription(subscriptionId: string): Promise<NormalizedSubscription>;
  /**
   * Apaga o cliente no provedor (exclusão de conta): cancela na hora qualquer assinatura dele e remove e-mail e cartão salvos. Cliente que já
   * não existe conta como sucesso (é o que acontece na retomada de uma exclusão que ficou pela metade).
   */
  deleteCustomer(customerId: string): Promise<void>;
  /** Confere a assinatura do webhook (HMAC) e a idade do pedido; lança `BillingProviderError("INVALID_SIGNATURE")` se não bater. */
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined, nowMs: number): ParsedWebhook;
}
