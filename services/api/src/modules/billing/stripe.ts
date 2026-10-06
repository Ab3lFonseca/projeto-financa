import type { BillingPrice } from "@app/shared";
import { createHmac, timingSafeEqual } from "node:crypto";
import { BillingProviderError, type BillingProvider, type NormalizedSubscription, type ParsedWebhook } from "./provider";

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  investmentsPriceId?: string;
  apiBase: string;
};

/** Pedidos de webhook mais antigos que isto são recusados (protege contra reenvio de um pedido capturado). */
const WEBHOOK_TOLERANCE_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 15_000;
const PRICE_TTL_MS = 10 * 60_000;

type StripeSubscriptionItem = { id: string; price?: { id?: string }; current_period_end?: number };
type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: StripeSubscriptionItem[] };
};
type StripePrice = { unit_amount?: number | null; currency?: string; recurring?: { interval?: string; interval_count?: number } | null };

const STATUS_MAP: Record<string, NormalizedSubscription["status"]> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "EXPIRED",
  paused: "EXPIRED",
  incomplete_expired: "CANCELED",
  incomplete: "INCOMPLETE",
};

/**
 * Cobrança hospedada pelo Stripe (Checkout + Portal do cliente). Os dados do cartão/Pix nunca passam pelo nosso servidor: a pessoa
 * paga na página do Stripe e volta para o site. Usa só `fetch` (sem SDK) com tempo limite e a chave SECRETA, que fica só no servidor.
 */
export class StripeProvider implements BillingProvider {
  readonly name = "stripe" as const;
  private priceCache: { at: number; value: { basic: BillingPrice | null; investments: BillingPrice | null } } | null = null;

  constructor(
    private readonly cfg: StripeConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get supportsInvestments(): boolean {
    return Boolean(this.cfg.investmentsPriceId);
  }

  private async call<T>(method: "GET" | "POST" | "DELETE", path: string, form?: Record<string, string>): Promise<T> {
    const url = `${this.cfg.apiBase.replace(/\/+$/, "")}/v1/${path}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method,
        headers: {
          authorization: `Bearer ${this.cfg.secretKey}`,
          ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new BillingProviderError("PROVIDER_NETWORK", "Sem resposta do provedor de pagamento");
    }
    const body = (await res.json().catch(() => null)) as (T & { error?: { code?: string; type?: string } }) | null;
    if (!res.ok || body === null) {
      // Só o código estável do provedor; a mensagem livre dele nunca é repassada.
      const code = body?.error?.code ?? body?.error?.type ?? `HTTP_${res.status}`;
      throw new BillingProviderError(`PROVIDER_${String(code).toUpperCase()}`, "O provedor de pagamento recusou o pedido", res.status);
    }
    return body;
  }

  async prices() {
    if (this.priceCache && Date.now() - this.priceCache.at < PRICE_TTL_MS) return this.priceCache.value;
    const read = async (id: string | undefined): Promise<BillingPrice | null> => {
      if (!id) return null;
      const p = await this.call<StripePrice>("GET", `prices/${encodeURIComponent(id)}`);
      const interval = p.recurring?.interval;
      if (typeof p.unit_amount !== "number" || !p.currency || (interval !== "month" && interval !== "year") || (p.recurring?.interval_count ?? 1) !== 1) return null;
      return { amountCents: p.unit_amount, currency: p.currency.toUpperCase(), interval };
    };
    const value = { basic: await read(this.cfg.priceId), investments: await read(this.cfg.investmentsPriceId) };
    this.priceCache = { at: Date.now(), value };
    return value;
  }

  async createCheckout(input: { userId: string; email: string; customerId: string | null; investments: boolean; successUrl: string; cancelUrl: string }) {
    const form: Record<string, string> = {
      mode: "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      "line_items[0][price]": this.cfg.priceId,
      "line_items[0][quantity]": "1",
      "subscription_data[metadata][user_id]": input.userId,
      "metadata[user_id]": input.userId,
      locale: "pt-BR",
      allow_promotion_codes: "true",
    };
    if (input.investments) {
      if (!this.cfg.investmentsPriceId) throw new BillingProviderError("ADDON_NOT_CONFIGURED", "Adicional sem preço configurado");
      form["line_items[1][price]"] = this.cfg.investmentsPriceId;
      form["line_items[1][quantity]"] = "1";
    }
    // Com cliente já existente o Stripe reaproveita o cartão salvo; sem ele, cria o cliente a partir do e-mail.
    if (input.customerId) form.customer = input.customerId;
    else form.customer_email = input.email;
    const session = await this.call<{ url?: string }>("POST", "checkout/sessions", form);
    if (!session.url || !session.url.startsWith("https://")) throw new BillingProviderError("NO_CHECKOUT_URL", "O provedor não devolveu a página de pagamento");
    return { url: session.url };
  }

  async createPortal(input: { customerId: string; returnUrl: string }) {
    const session = await this.call<{ url?: string }>("POST", "billing_portal/sessions", { customer: input.customerId, return_url: input.returnUrl, locale: "pt-BR" });
    if (!session.url || !session.url.startsWith("https://")) throw new BillingProviderError("NO_PORTAL_URL", "O provedor não devolveu o portal");
    return { url: session.url };
  }

  async setInvestmentsAddon(input: { subscriptionId: string; itemId: string | null; enabled: boolean }) {
    if (!this.cfg.investmentsPriceId) throw new BillingProviderError("ADDON_NOT_CONFIGURED", "Adicional sem preço configurado");
    if (input.enabled) {
      if (input.itemId) return; // já tem
      await this.call("POST", "subscription_items", {
        subscription: input.subscriptionId,
        price: this.cfg.investmentsPriceId,
        quantity: "1",
        proration_behavior: "create_prorations",
      });
      return;
    }
    if (!input.itemId) return; // já não tem
    await this.call("DELETE", `subscription_items/${encodeURIComponent(input.itemId)}?proration_behavior=create_prorations`);
  }

  async deleteCustomer(customerId: string) {
    try {
      await this.call("DELETE", `customers/${encodeURIComponent(customerId)}`);
    } catch (err) {
      if (err instanceof BillingProviderError && err.code === "PROVIDER_RESOURCE_MISSING") return;
      throw err;
    }
  }

  async fetchSubscription(subscriptionId: string): Promise<NormalizedSubscription> {
    const sub = await this.call<StripeSubscription>("GET", `subscriptions/${encodeURIComponent(subscriptionId)}`);
    const items = sub.items?.data ?? [];
    // O fim do período mudou de lugar entre versões da API do Stripe: ora na assinatura, ora nos itens.
    const periodEndSeconds = sub.current_period_end ?? items.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number").sort((a, b) => a - b)[0];
    const addonItem = this.cfg.investmentsPriceId ? items.find((i) => i.price?.id === this.cfg.investmentsPriceId) : undefined;
    return {
      providerSubscriptionId: sub.id,
      providerCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      userId: sub.metadata?.user_id ?? null,
      status: STATUS_MAP[sub.status] ?? "EXPIRED",
      currentPeriodEnd: typeof periodEndSeconds === "number" ? new Date(periodEndSeconds * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end) || (typeof sub.cancel_at === "number" && sub.cancel_at > 0),
      investmentsAddon: Boolean(addonItem),
      investmentsItemId: addonItem?.id ?? null,
    };
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined, nowMs: number): ParsedWebhook {
    const invalid = () => new BillingProviderError("INVALID_SIGNATURE", "Assinatura do webhook inválida");
    if (!signatureHeader) throw invalid();
    // Cabeçalho: "t=1700000000,v1=<hmac>[,v1=<hmac>]" (o Stripe pode mandar mais de uma assinatura durante a troca do segredo).
    const parts = signatureHeader.split(",").map((kv) => kv.trim().split("="));
    const timestamp = parts.find(([k]) => k === "t")?.[1];
    const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
    if (!timestamp || !/^\d{9,12}$/.test(timestamp) || signatures.length === 0) throw invalid();
    if (Math.abs(nowMs / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) throw invalid();

    const expected = createHmac("sha256", this.cfg.webhookSecret).update(`${timestamp}.`).update(rawBody).digest();
    const matches = signatures.some((sig) => {
      if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
      return timingSafeEqual(Buffer.from(sig, "hex"), expected);
    });
    if (!matches) throw invalid();

    let event: { id?: unknown; type?: unknown; data?: { object?: Record<string, unknown> } };
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new BillingProviderError("INVALID_PAYLOAD", "Corpo do webhook inválido");
    }
    if (typeof event.id !== "string" || typeof event.type !== "string") throw new BillingProviderError("INVALID_PAYLOAD", "Evento sem identificação");
    const object = event.data?.object ?? {};
    const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
    const type = event.type;

    let subscriptionId: string | null = null;
    let userId: string | null = null;
    if (type.startsWith("customer.subscription.")) {
      subscriptionId = str(object.id);
      userId = str((object.metadata as Record<string, unknown> | undefined)?.user_id);
    } else if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      subscriptionId = str(object.subscription);
      userId = str(object.client_reference_id) ?? str((object.metadata as Record<string, unknown> | undefined)?.user_id);
    } else if (type === "invoice.paid" || type === "invoice.payment_failed" || type === "invoice.payment_succeeded") {
      subscriptionId = str(object.subscription) ?? str((object.parent as { subscription_details?: { subscription?: unknown } } | undefined)?.subscription_details?.subscription);
    }
    return { id: event.id, type, subscriptionId, userId };
  }
}
