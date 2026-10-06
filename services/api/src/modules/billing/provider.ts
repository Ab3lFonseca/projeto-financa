import type { BillingPrice } from "@app/shared";

export type BillingProviderName = "stripe" | "dev";

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
};

export interface BillingProvider {
  readonly name: BillingProviderName;
  /** Preços cadastrados no provedor (nunca ficam no código). `null` = não configurado. */
  prices(): Promise<{ basic: BillingPrice | null; investments: BillingPrice | null }>;
  /** O adicional Rendimentos pode ser contratado (tem preço configurado). */
  readonly supportsInvestments: boolean;
  createCheckout(input: { userId: string; email: string; customerId: string | null; investments: boolean; successUrl: string; cancelUrl: string }): Promise<{ url: string }>;
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  setInvestmentsAddon(input: { subscriptionId: string; itemId: string | null; enabled: boolean }): Promise<void>;
  fetchSubscription(subscriptionId: string): Promise<NormalizedSubscription>;
  /**
   * Apaga o cliente no provedor (exclusão de conta): cancela na hora qualquer assinatura dele e remove e-mail e cartão salvos. Cliente que já
   * não existe conta como sucesso (é o que acontece na retomada de uma exclusão que ficou pela metade).
   */
  deleteCustomer(customerId: string): Promise<void>;
  /** Confere a assinatura do webhook (HMAC) e a idade do pedido; lança `BillingProviderError("INVALID_SIGNATURE")` se não bater. */
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined, nowMs: number): ParsedWebhook;
}
