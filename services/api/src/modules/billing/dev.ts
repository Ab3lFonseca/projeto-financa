import { BillingProviderError, type BillingCatalog, type BillingProvider, type NormalizedSubscription, type ParsedWebhook } from "./provider";

/**
 * Provedor de DESENVOLVIMENTO: "assina" na hora, sem pagar nada (o serviço ativa a assinatura direto no banco). Serve para testar o fluxo
 * inteiro (teste grátis → somente leitura → assinar, mensal ou anual) sem conta no provedor. A configuração o PROÍBE em produção.
 * Os preços abaixo são fictícios, só para a tela mostrar algo no desenvolvimento.
 */
export class DevBillingProvider implements BillingProvider {
  readonly name = "dev" as const;
  readonly supportsInvestments = true;

  async catalog(): Promise<BillingCatalog> {
    return {
      basic: {
        month: { amountCents: 1000, currency: "BRL", interval: "month" },
        year: { amountCents: 10000, currency: "BRL", interval: "year" },
      },
      investments: {
        month: { amountCents: 500, currency: "BRL", interval: "month" },
        year: { amountCents: 5000, currency: "BRL", interval: "year" },
      },
    };
  }

  private unsupported(): never {
    throw new BillingProviderError("DEV_PROVIDER", "Operação sem provedor real (modo de desenvolvimento)");
  }

  async createCheckout(): Promise<{ url: string }> {
    return this.unsupported();
  }
  async createPortal(): Promise<{ url: string }> {
    return this.unsupported();
  }
  async setInvestmentsAddon(): Promise<void> {
    return this.unsupported();
  }
  async fetchSubscription(): Promise<NormalizedSubscription> {
    return this.unsupported();
  }
  async fetchPrepaidSession(): Promise<never> {
    return this.unsupported();
  }
  /** Não há assinatura externa: o serviço só grava o percentual no banco. */
  async setSubscriptionDiscount(): Promise<void> {}
  /** Não há cliente externo para apagar. */
  async deleteCustomer(): Promise<void> {}
  verifyWebhook(): ParsedWebhook {
    return this.unsupported();
  }
}
