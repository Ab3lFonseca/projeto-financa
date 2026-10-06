import { BillingProviderError, type BillingProvider, type NormalizedSubscription, type ParsedWebhook } from "./provider";

/**
 * Provedor de DESENVOLVIMENTO: "assina" na hora, sem pagar nada (o serviço ativa a assinatura direto no banco). Serve para testar o fluxo
 * inteiro (teste grátis → somente leitura → assinar) sem conta no provedor. A configuração o PROÍBE em produção.
 * Os preços abaixo são fictícios, só para a tela mostrar algo no desenvolvimento.
 */
export class DevBillingProvider implements BillingProvider {
  readonly name = "dev" as const;
  readonly supportsInvestments = true;

  async prices() {
    return {
      basic: { amountCents: 1000, currency: "BRL", interval: "month" as const },
      investments: { amountCents: 500, currency: "BRL", interval: "month" as const },
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
  /** Não há cliente externo para apagar. */
  async deleteCustomer(): Promise<void> {}
  verifyWebhook(): ParsedWebhook {
    return this.unsupported();
  }
}
