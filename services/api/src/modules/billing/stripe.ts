import type { BillingPrice } from "@app/shared";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Config } from "../../config";
import {
  BillingProviderError,
  type BillingCatalog,
  type BillingInterval,
  type BillingMode,
  type BillingProvider,
  type NormalizedSubscription,
  type ParsedWebhook,
  type PrepaidPayment,
  type PricesByInterval,
} from "./provider";

/**
 * De onde sai o preço de um plano: um preço (`price_...`) ou um produto (`prod_...`), de que o servidor descobre o preço ativo. `interval` é o ciclo
 * que o nome da variável promete (MONTHLY/YEARLY): se o preço real for de outro ciclo, a fonte é ignorada em vez de cobrar o ciclo errado.
 */
export type StripePlanSource = { kind: "price" | "product"; id: string; interval?: BillingInterval };

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  apiBase: string;
  /** Fontes do plano básico, da mais preferida para a menos (a primeira de cada ciclo vale). */
  basic: StripePlanSource[];
  /** Fontes do adicional Rendimentos, na mesma lógica. */
  investments: StripePlanSource[];
  /** Pix Automático (Pix que renova) na assinatura mensal. Desligado por padrão: só ligue com o Pix recorrente liberado na sua conta. */
  pixRecurring?: boolean;
  log?: { warn: (obj: object, msg: string) => void };
};

type SourceEnv = Pick<
  Config,
  | "STRIPE_PRICE_ID"
  | "STRIPE_PRICE_ID_MONTHLY"
  | "STRIPE_PRICE_ID_YEARLY"
  | "STRIPE_PRODUCT_ID_MONTHLY"
  | "STRIPE_PRODUCT_ID_YEARLY"
  | "STRIPE_PRICE_ID_INVESTMENTS"
  | "STRIPE_PRICE_ID_INVESTMENTS_MONTHLY"
  | "STRIPE_PRICE_ID_INVESTMENTS_YEARLY"
  | "STRIPE_PRODUCT_ID_INVESTMENTS_MONTHLY"
  | "STRIPE_PRODUCT_ID_INVESTMENTS_YEARLY"
>;

/**
 * Monta as fontes de preço a partir das variáveis de ambiente. Um `price_` explícito vale mais que o `prod_` do mesmo ciclo; o `STRIPE_PRICE_ID`
 * antigo (um preço só, de qualquer ciclo) continua funcionando e o ciclo dele é o que o Stripe disser.
 */
export function stripePlanSources(env: SourceEnv): { basic: StripePlanSource[]; investments: StripePlanSource[] } {
  const list = (items: [string | undefined, StripePlanSource["kind"], BillingInterval | undefined][]): StripePlanSource[] =>
    items.flatMap(([id, kind, interval]) => (id ? [{ kind, id, ...(interval ? { interval } : {}) }] : []));
  return {
    basic: list([
      [env.STRIPE_PRICE_ID_MONTHLY, "price", "month"],
      [env.STRIPE_PRICE_ID_YEARLY, "price", "year"],
      [env.STRIPE_PRICE_ID, "price", undefined],
      [env.STRIPE_PRODUCT_ID_MONTHLY, "product", "month"],
      [env.STRIPE_PRODUCT_ID_YEARLY, "product", "year"],
    ]),
    investments: list([
      [env.STRIPE_PRICE_ID_INVESTMENTS_MONTHLY, "price", "month"],
      [env.STRIPE_PRICE_ID_INVESTMENTS_YEARLY, "price", "year"],
      [env.STRIPE_PRICE_ID_INVESTMENTS, "price", undefined],
      [env.STRIPE_PRODUCT_ID_INVESTMENTS_MONTHLY, "product", "month"],
      [env.STRIPE_PRODUCT_ID_INVESTMENTS_YEARLY, "product", "year"],
    ]),
  };
}

/** Pedidos de webhook mais antigos que isto são recusados (protege contra reenvio de um pedido capturado). */
const WEBHOOK_TOLERANCE_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 15_000;
const PRICE_TTL_MS = 10 * 60_000;

type StripePriceRef = { id?: string; product?: string | { id?: string } | null; recurring?: { interval?: string; interval_count?: number } | null };
type StripeSubscriptionItem = { id: string; price?: StripePriceRef; current_period_end?: number };
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
type StripePrice = StripePriceRef & { unit_amount?: number | null; currency?: string; active?: boolean };
type StripeProduct = { active?: boolean; default_price?: string | { id?: string } | null };

/** Um item à venda já resolvido: o preço a cobrar (`price_...`), o produto dele e como mostrar o valor. */
type Resolved = { priceId: string; productId: string | null; price: BillingPrice };
type ResolvedGroup = Partial<Record<BillingInterval, Resolved>>;
type ResolvedCatalog = { basic: ResolvedGroup; investments: ResolvedGroup };

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

const enc = encodeURIComponent;
const idOf = (v: string | { id?: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));

/** Percentual gravado nos metadados ("5", "10"...): inteiro de 0 a 100, qualquer outra coisa vira 0 (sem desconto). */
function percentOf(v: string | undefined): number {
  const n = v !== undefined && /^\d{1,3}$/.test(v) ? Number(v) : 0;
  return n >= 0 && n <= 100 ? n : 0;
}

/** Só vale ciclo mensal ou anual SIMPLES (a cada 1 mês ou 1 ano); "a cada 3 meses" não é oferecido, para nunca mostrar um valor errado. */
function intervalOf(price: StripePriceRef | undefined): BillingInterval | null {
  const interval = price?.recurring?.interval;
  if ((interval !== "month" && interval !== "year") || (price?.recurring?.interval_count ?? 1) !== 1) return null;
  return interval;
}

/**
 * Cobrança hospedada pelo Stripe (Checkout + Portal do cliente). Os dados do cartão/Pix nunca passam pelo nosso servidor: a pessoa
 * paga na página do Stripe e volta para o site. Usa só `fetch` (sem SDK) com tempo limite e a chave SECRETA, que fica só no servidor.
 * Vende o plano em ciclo mensal e/ou anual: cada ciclo vem de um preço ou de um produto configurado (o servidor descobre o preço ativo do produto).
 */
export class StripeProvider implements BillingProvider {
  readonly name = "stripe" as const;
  private cache: { at: number; value: ResolvedCatalog } | null = null;

  constructor(
    private readonly cfg: StripeConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get supportsInvestments(): boolean {
    return this.cfg.investments.length > 0;
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

  // ------------------------------------------------------------------------------------------------ catálogo de preços

  /** Um `price_` vendável: ativo, recorrente, mensal ou anual simples e com valor; `null` se não serve. */
  private parsePrice(p: StripePrice, id: string, productFallback: string | null): Resolved | null {
    const interval = intervalOf(p);
    if (p.active === false || typeof p.unit_amount !== "number" || !p.currency || !interval) return null;
    return { priceId: p.id ?? id, productId: idOf(p.product) ?? productFallback, price: { amountCents: p.unit_amount, currency: p.currency.toUpperCase(), interval } };
  }

  private async resolveSource(src: StripePlanSource): Promise<Resolved | null> {
    try {
      if (src.kind === "price") return this.parsePrice(await this.call<StripePrice>("GET", `prices/${enc(src.id)}`), src.id, null);

      const product = await this.call<StripeProduct>("GET", `products/${enc(src.id)}`);
      if (product.active === false) {
        this.cfg.log?.warn({ product: src.id }, "produto do Stripe arquivado: ignorado");
        return null;
      }
      const defaultId = idOf(product.default_price);
      if (defaultId) return this.parsePrice(await this.call<StripePrice>("GET", `prices/${enc(defaultId)}`), defaultId, src.id);
      // Sem preço padrão no produto: serve se houver UM só preço recorrente ativo (com mais de um, não dá para adivinhar qual cobrar).
      const list = await this.call<{ data?: (StripePrice & { id: string })[] }>("GET", `prices?product=${enc(src.id)}&active=true&type=recurring&limit=10`);
      const sellable = (list.data ?? []).flatMap((p) => this.parsePrice(p, p.id, src.id) ?? []);
      if (sellable.length === 1) return sellable[0]!;
      this.cfg.log?.warn({ product: src.id, candidates: sellable.length }, "produto do Stripe sem preço padrão e sem um único preço recorrente: defina o preço padrão no Stripe");
      return null;
    } catch (err) {
      // Id digitado errado (ou de outra conta do Stripe): só este ciclo fica fora; o resto da cobrança segue funcionando.
      if (err instanceof BillingProviderError && err.code === "PROVIDER_RESOURCE_MISSING") {
        this.cfg.log?.warn({ source: src.id }, "id de preço/produto não encontrado no Stripe: ignorado");
        return null;
      }
      throw err;
    }
  }

  private async resolveGroup(sources: StripePlanSource[]): Promise<ResolvedGroup> {
    const results = await Promise.all(sources.map((s) => this.resolveSource(s)));
    const out: ResolvedGroup = {};
    results.forEach((r, i) => {
      const src = sources[i]!;
      if (!r) return;
      if (src.interval && src.interval !== r.price.interval) {
        this.cfg.log?.warn({ source: src.id, expected: src.interval, actual: r.price.interval }, "o ciclo do preço no Stripe não é o do nome da variável: ignorado");
        return;
      }
      out[r.price.interval] ??= r; // as fontes vêm em ordem de preferência: a primeira de cada ciclo vale
    });
    return out;
  }

  /** Preços já resolvidos, em cache por 10 minutos. Falha de rede NÃO é guardada (a próxima chamada tenta de novo). */
  private async resolved(): Promise<ResolvedCatalog> {
    if (this.cache && Date.now() - this.cache.at < PRICE_TTL_MS) return this.cache.value;
    const [basic, investments] = await Promise.all([this.resolveGroup(this.cfg.basic), this.resolveGroup(this.cfg.investments)]);
    const value = { basic, investments };
    this.cache = { at: Date.now(), value };
    return value;
  }

  async catalog(): Promise<BillingCatalog> {
    const r = await this.resolved();
    const show = (g: ResolvedGroup): PricesByInterval => ({ month: g.month?.price ?? null, year: g.year?.price ?? null });
    return { basic: show(r.basic), investments: show(r.investments) };
  }

  // ------------------------------------------------------------------------------------------------ pagamento

  /**
   * Cupom do desconto de insígnias (um por degrau: `financa-badges-5`, `-10`, `-15`), criado no Stripe na primeira vez que é preciso e reaproveitado
   * depois. Vale para sempre (`duration=forever`): numa assinatura vale em todas as renovações; no pagamento único vale na cobrança. Se um cupom com
   * esse id já existe mas tem OUTRO percentual (ou está inválido), recusa: nunca cobra um desconto diferente do prometido.
   */
  private ensuredCoupons = new Set<string>();
  private async ensureCoupon(percent: number): Promise<string> {
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new BillingProviderError("DISCOUNT_INVALID", "Percentual de desconto inválido");
    const id = `financa-badges-${percent}`;
    if (this.ensuredCoupons.has(id)) return id;
    type Coupon = { id?: string; percent_off?: number | null; valid?: boolean };
    let coupon: Coupon | null = null;
    try {
      coupon = await this.call<Coupon>("GET", `coupons/${enc(id)}`);
    } catch (err) {
      if (!(err instanceof BillingProviderError && err.code === "PROVIDER_RESOURCE_MISSING")) throw err;
    }
    if (!coupon) {
      try {
        coupon = await this.call<Coupon>("POST", "coupons", { id, percent_off: String(percent), duration: "forever", name: `Desconto de insígnias (${percent}%)` });
      } catch (err) {
        // criado por outra requisição no mesmo instante: lê o que ficou
        if (!(err instanceof BillingProviderError && err.status === 400)) throw err;
        coupon = await this.call<Coupon>("GET", `coupons/${enc(id)}`);
      }
    }
    if (coupon.percent_off !== percent || coupon.valid === false) throw new BillingProviderError("DISCOUNT_COUPON_MISMATCH", "O cupom de desconto no provedor não confere com o esperado");
    this.ensuredCoupons.add(id);
    return id;
  }

  async createCheckout(input: { userId: string; email: string; customerId: string | null; interval: BillingInterval; investments: boolean; mode?: BillingMode; discountPercent?: number; successUrl: string; cancelUrl: string }) {
    // Percentual inválido (negativo, fracionado, NaN, acima de 100) é erro de quem chamou: recusa antes de qualquer chamada ao provedor.
    const requested = input.discountPercent ?? 0;
    if (requested !== 0 && (!Number.isInteger(requested) || requested < 1 || requested > 100)) throw new BillingProviderError("DISCOUNT_INVALID", "Percentual de desconto inválido");
    const r = await this.resolved();
    const basic = r.basic[input.interval];
    if (!basic) throw new BillingProviderError("PLAN_NOT_CONFIGURED", "Plano sem preço configurado para este ciclo");
    const addon = input.investments ? r.investments[input.interval] : undefined;
    // O Stripe exige o mesmo ciclo em todos os itens da assinatura: o adicional é o do ciclo escolhido.
    if (input.investments && !addon) throw new BillingProviderError("ADDON_NOT_CONFIGURED", "Adicional sem preço configurado para este ciclo");

    const form: Record<string, string> = {
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      "metadata[user_id]": input.userId,
      locale: "pt-BR",
      allow_promotion_codes: "true",
    };
    // Desconto de insígnias: o Stripe não aceita `discounts` junto de `allow_promotion_codes`, então com desconto o campo de código promocional sai
    // (o desconto das insígnias é o que vale; não se somam).
    const discountPercent = input.discountPercent ?? 0;
    if (discountPercent > 0) {
      form["discounts[0][coupon]"] = await this.ensureCoupon(discountPercent);
      delete form.allow_promotion_codes;
    }
    if ((input.mode ?? "recurring") === "once") {
      // Pagamento avulso, por um período fechado (sem renovação). O valor é o MESMO do plano no ciclo escolhido, lido do provedor; a sessão
      // leva o que o servidor precisa para conceder o acesso quando o dinheiro entrar (Pix pode demorar: o aviso vem depois).
      form.mode = "payment";
      form["metadata[kind]"] = "prepaid";
      form["metadata[interval]"] = input.interval;
      form["metadata[investments]"] = addon ? "true" : "false";
      form["metadata[discount_percent]"] = String(discountPercent);
      [basic, ...(addon ? [addon] : [])].forEach((item, i) => {
        form[`line_items[${i}][quantity]`] = "1";
        form[`line_items[${i}][price_data][currency]`] = item.price.currency.toLowerCase();
        form[`line_items[${i}][price_data][unit_amount]`] = String(item.price.amountCents);
        if (item.productId) form[`line_items[${i}][price_data][product]`] = item.productId;
        else form[`line_items[${i}][price_data][product_data][name]`] = i === 0 ? "Finança" : "Finança Rendimentos";
      });
    } else {
      form.mode = "subscription";
      form["line_items[0][price]"] = basic.priceId;
      form["line_items[0][quantity]"] = "1";
      form["subscription_data[metadata][user_id]"] = input.userId;
      form["subscription_data[metadata][discount_percent]"] = String(discountPercent);
      if (addon) {
        form["line_items[1][price]"] = addon.priceId;
        form["line_items[1][quantity]"] = "1";
      }
      // Pix Automático (Pix recorrente), só se ligado na configuração e só no mensal: o valor aceito para o ciclo anual não foi confirmado na
      // documentação do provedor. O teto autorizado fica folgado (o dobro do valor, no mínimo R$ 400) para aguentar reajuste de preço.
      if (this.cfg.pixRecurring && input.interval === "month") {
        const total = basic.price.amountCents + (addon?.price.amountCents ?? 0);
        form["payment_method_options[pix][mandate_options][amount]"] = String(Math.max(40_000, total * 2));
        form["payment_method_options[pix][mandate_options][payment_schedule]"] = "monthly";
      }
    }
    // Com cliente já existente o Stripe reaproveita o cartão salvo; sem ele, cria o cliente a partir do e-mail.
    if (input.customerId) form.customer = input.customerId;
    else form.customer_email = input.email;
    const session = await this.call<{ url?: string }>("POST", "checkout/sessions", form);
    if (!session.url || !session.url.startsWith("https://")) throw new BillingProviderError("NO_CHECKOUT_URL", "O provedor não devolveu a página de pagamento");
    return { url: session.url };
  }

  async fetchPrepaidSession(sessionId: string): Promise<PrepaidPayment | null> {
    const s = await this.call<{
      id?: string;
      mode?: string;
      payment_status?: string;
      client_reference_id?: string | null;
      customer?: string | { id?: string } | null;
      metadata?: Record<string, string>;
    }>("GET", `checkout/sessions/${enc(sessionId)}`);
    const interval = s.metadata?.interval;
    const userId = s.metadata?.user_id ?? s.client_reference_id ?? null;
    // Só vale o que foi aberto por este servidor como pagamento avulso (mode=payment e a marca nos metadados).
    if (s.mode !== "payment" || s.metadata?.kind !== "prepaid" || !userId || (interval !== "month" && interval !== "year")) return null;
    return { sessionId, userId, interval, investments: s.metadata?.investments === "true", discountPercent: percentOf(s.metadata?.discount_percent), paid: s.payment_status === "paid", customerId: idOf(s.customer) };
  }

  async setSubscriptionDiscount(input: { subscriptionId: string; percent: number }): Promise<void> {
    const coupon = await this.ensureCoupon(input.percent);
    // `discounts` substitui o desconto anterior; o metadado guarda o percentual para o servidor saber o que está aplicado.
    await this.call("POST", `subscriptions/${enc(input.subscriptionId)}`, { "discounts[0][coupon]": coupon, "metadata[discount_percent]": String(input.percent) });
  }

  async createPortal(input: { customerId: string; returnUrl: string }) {
    const session = await this.call<{ url?: string }>("POST", "billing_portal/sessions", { customer: input.customerId, return_url: input.returnUrl, locale: "pt-BR" });
    if (!session.url || !session.url.startsWith("https://")) throw new BillingProviderError("NO_PORTAL_URL", "O provedor não devolveu o portal");
    return { url: session.url };
  }

  async setInvestmentsAddon(input: { subscriptionId: string; itemId: string | null; enabled: boolean; interval: BillingInterval }) {
    if (!this.supportsInvestments) throw new BillingProviderError("ADDON_NOT_CONFIGURED", "Adicional sem preço configurado");
    if (input.enabled) {
      if (input.itemId) return; // já tem
      const addon = (await this.resolved()).investments[input.interval];
      if (!addon) throw new BillingProviderError("ADDON_NOT_CONFIGURED", "Adicional sem preço configurado para o ciclo desta assinatura");
      await this.call("POST", "subscription_items", {
        subscription: input.subscriptionId,
        price: addon.priceId,
        quantity: "1",
        proration_behavior: "create_prorations",
      });
      return;
    }
    if (!input.itemId) return; // já não tem
    await this.call("DELETE", `subscription_items/${enc(input.itemId)}?proration_behavior=create_prorations`);
  }

  async deleteCustomer(customerId: string) {
    try {
      await this.call("DELETE", `customers/${enc(customerId)}`);
    } catch (err) {
      if (err instanceof BillingProviderError && err.code === "PROVIDER_RESOURCE_MISSING") return;
      throw err;
    }
  }

  /** O item é o do adicional? Pelo `price_` configurado ou pelo produto configurado: sem consultar o Stripe (uma falha de rede nunca "tira" o adicional). */
  private isAddonItem(item: StripeSubscriptionItem): boolean {
    return this.cfg.investments.some((src) => (src.kind === "price" ? item.price?.id === src.id : idOf(item.price?.product) === src.id));
  }

  async fetchSubscription(subscriptionId: string): Promise<NormalizedSubscription> {
    const sub = await this.call<StripeSubscription>("GET", `subscriptions/${enc(subscriptionId)}`);
    const items = sub.items?.data ?? [];
    // O fim do período mudou de lugar entre versões da API do Stripe: ora na assinatura, ora nos itens.
    const periodEndSeconds = sub.current_period_end ?? items.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number").sort((a, b) => a - b)[0];
    const addonItem = items.find((i) => this.isAddonItem(i));
    const planItem = items.find((i) => !this.isAddonItem(i));
    return {
      providerSubscriptionId: sub.id,
      providerCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      userId: sub.metadata?.user_id ?? null,
      status: STATUS_MAP[sub.status] ?? "EXPIRED",
      currentPeriodEnd: typeof periodEndSeconds === "number" ? new Date(periodEndSeconds * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end) || (typeof sub.cancel_at === "number" && sub.cancel_at > 0),
      interval: intervalOf(planItem?.price),
      discountPercent: percentOf(sub.metadata?.discount_percent),
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
    let prepaidSessionId: string | null = null;
    if (type.startsWith("customer.subscription.")) {
      subscriptionId = str(object.id);
      userId = str((object.metadata as Record<string, unknown> | undefined)?.user_id);
    } else if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      subscriptionId = str(object.subscription);
      userId = str(object.client_reference_id) ?? str((object.metadata as Record<string, unknown> | undefined)?.user_id);
      // Pagamento avulso: sem assinatura; a sessão é conferida no provedor antes de liberar qualquer acesso.
      if (object.mode === "payment") prepaidSessionId = str(object.id);
    } else if (type === "invoice.paid" || type === "invoice.payment_failed" || type === "invoice.payment_succeeded") {
      subscriptionId = str(object.subscription) ?? str((object.parent as { subscription_details?: { subscription?: unknown } } | undefined)?.subscription_details?.subscription);
    }
    return { id: event.id, type, subscriptionId, userId, prepaidSessionId };
  }
}
