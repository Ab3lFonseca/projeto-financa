import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { BillingProviderError } from "../src/modules/billing/provider";
import { StripeProvider } from "../src/modules/billing/stripe";
import { FakeStripe, signStripe, stripeEvent } from "./helpers/fake-stripe";

const SECRET = "sk_test_abc123";
const WHSEC = "whsec_supersecret123";
const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const USER = "11111111-1111-4111-8111-111111111111";

function make(over: { investments?: boolean } = {}) {
  const stripe = new FakeStripe();
  const provider = new StripeProvider(
    { secretKey: SECRET, webhookSecret: WHSEC, priceId: "price_basic", investmentsPriceId: over.investments === false ? undefined : "price_inv", apiBase: "https://api.stripe.test" },
    stripe.fetch,
  );
  return { stripe, provider };
}

const body = (o: Record<string, unknown> = {}) => stripeEvent("evt_1", "customer.subscription.updated", { id: "sub_1", metadata: { user_id: USER }, ...o });

describe("Stripe: preços", () => {
  it("lê os preços do provedor (nunca ficam no código) e guarda em cache", async () => {
    const { stripe, provider } = make();
    expect(await provider.prices()).toEqual({
      basic: { amountCents: 1000, currency: "BRL", interval: "month" },
      investments: { amountCents: 500, currency: "BRL", interval: "month" },
    });
    await provider.prices();
    expect(stripe.calls.filter((c) => c.path.startsWith("prices/"))).toHaveLength(2); // 2 preços, 1 leitura cada (a segunda chamada veio do cache)
    expect(stripe.calls[0]!.authorization).toBe(`Bearer ${SECRET}`);
  });

  it("sem o preço do adicional, ele não pode ser contratado", async () => {
    const { provider } = make({ investments: false });
    expect(provider.supportsInvestments).toBe(false);
    expect((await provider.prices()).investments).toBeNull();
    await expect(provider.createCheckout({ userId: USER, email: "a@b.c", customerId: null, investments: true, successUrl: "https://x/ok", cancelUrl: "https://x/no" })).rejects.toMatchObject({ code: "ADDON_NOT_CONFIGURED" });
    await expect(provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: null, enabled: true })).rejects.toMatchObject({ code: "ADDON_NOT_CONFIGURED" });
  });

  it("preço que não é mensal/anual simples (ex.: a cada 3 meses) é tratado como não configurado, em vez de mostrar um valor errado", async () => {
    const { stripe, provider } = make();
    stripe.prices.set("price_basic", { unit_amount: 3000, currency: "brl", recurring: { interval: "month", interval_count: 3 } });
    expect((await provider.prices()).basic).toBeNull();
  });

  it("aceita o preço anual", async () => {
    const { stripe, provider } = make();
    stripe.prices.set("price_basic", { unit_amount: 9990, currency: "brl", recurring: { interval: "year", interval_count: 1 } });
    expect((await provider.prices()).basic).toEqual({ amountCents: 9990, currency: "BRL", interval: "year" });
  });
});

describe("Stripe: pagamento hospedado", () => {
  const input = { userId: USER, email: "pessoa@email.com", customerId: null, investments: false, successUrl: "https://app.test/subscription/return?status=success", cancelUrl: "https://app.test/subscription/return?status=cancel" };

  it("abre o Checkout em modo assinatura, ligado ao usuário, em português, sem repassar nada de cartão", async () => {
    const { stripe, provider } = make();
    const { url } = await provider.createCheckout(input);
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const call = stripe.calls.find((c) => c.path === "checkout/sessions")!;
    const f = call.form!;
    expect(f.get("mode")).toBe("subscription");
    expect(f.get("client_reference_id")).toBe(USER);
    expect(f.get("subscription_data[metadata][user_id]")).toBe(USER);
    expect(f.get("line_items[0][price]")).toBe("price_basic");
    expect(f.get("line_items[1][price]")).toBeNull();
    expect(f.get("locale")).toBe("pt-BR");
    expect(f.get("customer_email")).toBe("pessoa@email.com");
    expect(f.get("customer")).toBeNull();
    expect(f.get("success_url")).toBe(input.successUrl);
    expect(f.get("cancel_url")).toBe(input.cancelUrl);
  });

  it("com o adicional, inclui o segundo item; com cliente já existente, reaproveita o cartão salvo (sem e-mail)", async () => {
    const { stripe, provider } = make();
    await provider.createCheckout({ ...input, investments: true, customerId: "cus_old" });
    const f = stripe.calls.find((c) => c.path === "checkout/sessions")!.form!;
    expect(f.get("line_items[1][price]")).toBe("price_inv");
    expect(f.get("customer")).toBe("cus_old");
    expect(f.get("customer_email")).toBeNull();
  });

  it("o portal do cliente usa o cliente do provedor e volta para o site", async () => {
    const { stripe, provider } = make();
    expect((await provider.createPortal({ customerId: "cus_1", returnUrl: "https://app.test/subscription" })).url).toMatch(/^https:\/\//);
    const f = stripe.calls.find((c) => c.path === "billing_portal/sessions")!.form!;
    expect(f.get("customer")).toBe("cus_1");
    expect(f.get("return_url")).toBe("https://app.test/subscription");
  });

  it("recusa uma URL que não seja https devolvida pelo provedor", async () => {
    const evil = new StripeProvider({ secretKey: SECRET, webhookSecret: WHSEC, priceId: "price_basic", apiBase: "https://api.stripe.test" }, (async () => new Response(JSON.stringify({ url: "javascript:alert(1)" }), { status: 200 })) as typeof fetch);
    await expect(evil.createCheckout(input)).rejects.toMatchObject({ code: "NO_CHECKOUT_URL" });
    await expect(evil.createPortal({ customerId: "cus_1", returnUrl: "https://x" })).rejects.toMatchObject({ code: "NO_PORTAL_URL" });
  });

  it("liga e desliga o adicional na assinatura (idempotente: não duplica nem remove o que não existe)", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_1", { userId: USER, periodEnd: new Date(NOW + 10 * 86_400_000) });
    await provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: null, enabled: true });
    const add = stripe.calls.find((c) => c.path === "subscription_items")!.form!;
    expect(add.get("subscription")).toBe("sub_1");
    expect(add.get("price")).toBe("price_inv");

    const writes = () => stripe.calls.filter((c) => c.method !== "GET").length;
    const before = writes();
    await provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: "si_x", enabled: true }); // já tem
    await provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: null, enabled: false }); // já não tem
    expect(writes()).toBe(before);

    await provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: "si_x", enabled: false });
    expect(stripe.calls.some((c) => c.method === "DELETE" && c.path.startsWith("subscription_items/si_x"))).toBe(true);
  });
});

describe("Stripe: erros do provedor", () => {
  it("devolve só um código estável; o texto livre do Stripe (que pode ter dados do cartão) nunca é repassado", async () => {
    const { stripe, provider } = make();
    stripe.errorNext = { status: 402, code: "card_declined", message: "Seu cartão final 4242 foi recusado" };
    const err = await provider.createPortal({ customerId: "cus_1", returnUrl: "https://x" }).catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect(err.code).toBe("PROVIDER_CARD_DECLINED");
    expect(err.status).toBe(402);
    expect(err.message).not.toContain("4242");
  });

  it("falha de rede e resposta 500 viram erros do provedor, sem vazar detalhes", async () => {
    const down = new StripeProvider({ secretKey: SECRET, webhookSecret: WHSEC, priceId: "price_basic", apiBase: "https://api.stripe.test" }, (async () => {
      throw new Error("ECONNRESET 10.0.0.1:443");
    }) as typeof fetch);
    const err = await down.prices().catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect(err.code).toBe("PROVIDER_NETWORK");
    expect(err.message).not.toContain("10.0.0.1");

    const { stripe, provider } = make();
    stripe.failNext = 1;
    await expect(provider.fetchSubscription("sub_1")).rejects.toMatchObject({ code: "PROVIDER_API_ERROR", status: 500 });
  });
});

describe("Stripe: leitura da assinatura", () => {
  const end = new Date(NOW + 20 * 86_400_000);

  it("traduz os estados do Stripe e extrai cliente, usuário, fim do período e adicional", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_1", { userId: USER, periodEnd: end, addon: true });
    expect(await provider.fetchSubscription("sub_1")).toEqual({
      providerSubscriptionId: "sub_1",
      providerCustomerId: "cus_test_1",
      userId: USER,
      status: "ACTIVE",
      currentPeriodEnd: new Date(Math.floor(end.getTime() / 1000) * 1000),
      cancelAtPeriodEnd: false,
      investmentsAddon: true,
      investmentsItemId: "si_inv",
    });

    const map: Record<string, string> = { trialing: "TRIALING", past_due: "PAST_DUE", canceled: "CANCELED", unpaid: "EXPIRED", paused: "EXPIRED", incomplete: "INCOMPLETE", incomplete_expired: "CANCELED", algo_novo: "EXPIRED" };
    for (const [stripeStatus, expected] of Object.entries(map)) {
      stripe.setActive("sub_s", { userId: USER, periodEnd: end, status: stripeStatus });
      expect((await provider.fetchSubscription("sub_s")).status, stripeStatus).toBe(expected);
    }
  });

  it("lê o fim do período também quando a versão da API o coloca nos itens (e usa o mais próximo)", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_1", { userId: USER, periodEnd: end, addon: true, periodEndOnItems: true });
    const sub = await provider.fetchSubscription("sub_1");
    expect(sub.currentPeriodEnd?.getTime()).toBe(Math.floor(end.getTime() / 1000) * 1000);
  });

  it("cancelamento agendado vale tanto por cancel_at_period_end quanto por cancel_at; cliente pode vir como objeto", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_1", { userId: USER, periodEnd: end, cancelAtPeriodEnd: true });
    expect((await provider.fetchSubscription("sub_1")).cancelAtPeriodEnd).toBe(true);
    const sub = stripe.setActive("sub_2", { userId: USER, periodEnd: end });
    sub.cancel_at = Math.floor(end.getTime() / 1000);
    sub.customer = { id: "cus_obj" };
    const read = await provider.fetchSubscription("sub_2");
    expect(read.cancelAtPeriodEnd).toBe(true);
    expect(read.providerCustomerId).toBe("cus_obj");
  });

  it("assinatura sem o usuário nos metadados volta com userId nulo (o serviço procura pelo cliente)", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_1", { periodEnd: end });
    expect((await provider.fetchSubscription("sub_1")).userId).toBeNull();
  });
});

describe("Stripe: assinatura do webhook", () => {
  const { provider } = make();
  const raw = body();

  it("aceita o pedido com assinatura válida e devolve o evento", () => {
    const parsed = provider.verifyWebhook(Buffer.from(raw), signStripe(WHSEC, raw, NOW), NOW);
    expect(parsed).toEqual({ id: "evt_1", type: "customer.subscription.updated", subscriptionId: "sub_1", userId: USER });
  });

  it("recusa sem cabeçalho, mal formado, com segredo errado ou com o corpo adulterado", () => {
    const bad = (sig: string | undefined, payload = raw) => {
      try {
        provider.verifyWebhook(Buffer.from(payload), sig, NOW);
        return "aceito";
      } catch (e) {
        return e instanceof BillingProviderError ? e.code : "outro erro";
      }
    };
    expect(bad(undefined)).toBe("INVALID_SIGNATURE");
    expect(bad("")).toBe("INVALID_SIGNATURE");
    expect(bad("lixo")).toBe("INVALID_SIGNATURE");
    expect(bad(`t=${Math.floor(NOW / 1000)}`)).toBe("INVALID_SIGNATURE"); // sem v1
    expect(bad(`v1=${"a".repeat(64)}`)).toBe("INVALID_SIGNATURE"); // sem t
    expect(bad(`t=${Math.floor(NOW / 1000)},v1=${"a".repeat(64)}`)).toBe("INVALID_SIGNATURE"); // v1 que não bate
    expect(bad(`t=${Math.floor(NOW / 1000)},v1=curta`)).toBe("INVALID_SIGNATURE"); // v1 que não é hex de 64
    expect(bad(signStripe("whsec_outro", raw, NOW))).toBe("INVALID_SIGNATURE");
    expect(bad(signStripe(WHSEC, raw, NOW), raw.replace("sub_1", "sub_2"))).toBe("INVALID_SIGNATURE"); // corpo mexido depois de assinado
    expect(bad(signStripe(WHSEC, raw, NOW))).toBe("aceito");
  });

  it("recusa pedidos antigos ou do futuro (reenvio de um pedido capturado), mas tolera pequena diferença de relógio", () => {
    const at = (offsetSeconds: number) => () => provider.verifyWebhook(Buffer.from(raw), signStripe(WHSEC, raw, NOW, { timestamp: Math.floor(NOW / 1000) + offsetSeconds }), NOW);
    expect(at(-10)).not.toThrow();
    expect(at(10)).not.toThrow();
    expect(at(-299)).not.toThrow();
    expect(at(-301)).toThrow(/inválida/);
    expect(at(3600)).toThrow(/inválida/);
    expect(at(-86_400)).toThrow(/inválida/);
  });

  it("aceita se UMA das assinaturas v1 for válida (troca de segredo no Stripe manda duas)", () => {
    const stale = createHmac("sha256", "whsec_antigo").update(`${Math.floor(NOW / 1000)}.${raw}`).digest("hex");
    expect(() => provider.verifyWebhook(Buffer.from(raw), signStripe(WHSEC, raw, NOW, { extraV1: [stale] }), NOW)).not.toThrow();
    expect(() => provider.verifyWebhook(Buffer.from(raw), signStripe("whsec_x", raw, NOW, { extraV1: [stale] }), NOW)).toThrow(/inválida/);
  });

  it("assinatura válida com corpo que não é um evento é recusada como payload inválido", () => {
    const codeOf = (payload: string) => {
      try {
        provider.verifyWebhook(Buffer.from(payload), signStripe(WHSEC, payload, NOW), NOW);
        return "aceito";
      } catch (e) {
        return e instanceof BillingProviderError ? e.code : "outro erro";
      }
    };
    expect(codeOf("isto não é json")).toBe("INVALID_PAYLOAD");
    expect(codeOf(JSON.stringify({ type: "x" }))).toBe("INVALID_PAYLOAD");
  });

  it("extrai a assinatura e o usuário de cada tipo de evento que importa", () => {
    const parse = (type: string, object: Record<string, unknown>) => {
      const b = stripeEvent("evt_x", type, object);
      return provider.verifyWebhook(Buffer.from(b), signStripe(WHSEC, b, NOW), NOW);
    };
    expect(parse("checkout.session.completed", { subscription: "sub_9", client_reference_id: USER })).toMatchObject({ subscriptionId: "sub_9", userId: USER });
    expect(parse("checkout.session.async_payment_succeeded", { subscription: "sub_9", metadata: { user_id: USER } })).toMatchObject({ subscriptionId: "sub_9", userId: USER });
    expect(parse("customer.subscription.deleted", { id: "sub_9", metadata: { user_id: USER } })).toMatchObject({ subscriptionId: "sub_9", userId: USER });
    expect(parse("invoice.payment_failed", { subscription: "sub_9" })).toMatchObject({ subscriptionId: "sub_9", userId: null });
    // Versões novas do Stripe colocam a assinatura da fatura em outro lugar.
    expect(parse("invoice.paid", { parent: { subscription_details: { subscription: "sub_9" } } })).toMatchObject({ subscriptionId: "sub_9" });
    // Eventos que não dizem respeito à assinatura não apontam para nenhuma.
    expect(parse("customer.created", { id: "cus_1" })).toMatchObject({ subscriptionId: null, userId: null });
  });
});

describe("configuração do pagamento", () => {
  const dev = { NODE_ENV: "development", DATABASE_URL: "postgres://x" };
  const prod = { NODE_ENV: "production", DATABASE_URL: "postgres://x", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "b", IP_HASH_PEPPER: "pepper-pepper-pepper-123", OPEN_FINANCE_ENABLED: "false" };
  const stripeVars = { BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", STRIPE_PRICE_ID: "price_abc", APP_WEB_URL: "https://app.exemplo.com" };

  it("por padrão a cobrança está desligada (beta), com 30 dias de teste e sem provedor", () => {
    const c = loadConfig(dev);
    expect(c.BILLING_ENFORCED).toBe(false);
    expect(c.TRIAL_DAYS).toBe(30);
    expect(c.BILLING_PROVIDER).toBe("none");
    expect(c.BILLING_STARTS_AT).toBeUndefined();
  });

  it("o Stripe exige chave secreta, segredo do webhook, preço e endereço do site; campo em branco conta como ausente", () => {
    expect(() => loadConfig({ ...dev, ...stripeVars })).not.toThrow();
    for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID", "APP_WEB_URL"]) {
      const without = { ...dev, ...stripeVars, [key]: "" };
      expect(() => loadConfig(without), key).toThrow(new RegExp(`${key} é obrigatória`));
    }
  });

  it("recusa a chave publicável e formatos errados (erro de colar a chave no lugar errado)", () => {
    expect(() => loadConfig({ ...dev, ...stripeVars, STRIPE_SECRET_KEY: "pk_test_abc" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => loadConfig({ ...dev, ...stripeVars, STRIPE_WEBHOOK_SECRET: "abc" })).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(() => loadConfig({ ...dev, ...stripeVars, STRIPE_PRICE_ID: "prod_abc" })).toThrow(/STRIPE_PRICE_ID/);
    expect(() => loadConfig({ ...dev, ...stripeVars, STRIPE_PRICE_ID_INVESTMENTS: "xyz" })).toThrow(/STRIPE_PRICE_ID_INVESTMENTS/);
    expect(loadConfig({ ...dev, ...stripeVars, STRIPE_SECRET_KEY: "rk_live_abc", STRIPE_PRICE_ID_INVESTMENTS: "price_inv" }).STRIPE_PRICE_ID_INVESTMENTS).toBe("price_inv");
  });

  it("o provedor de desenvolvimento (assina sem pagar) é proibido em produção", () => {
    expect(loadConfig({ ...dev, BILLING_PROVIDER: "dev" }).BILLING_PROVIDER).toBe("dev");
    expect(() => loadConfig({ ...prod, BILLING_PROVIDER: "dev" })).toThrow(/BILLING_PROVIDER=dev é proibido em produção/);
  });

  it("em produção, ligar a cobrança sem provedor é recusado (ninguém conseguiria assinar quando o teste acabasse)", () => {
    expect(() => loadConfig({ ...prod, BILLING_ENFORCED: "true" })).toThrow(/BILLING_ENFORCED=true exige um provedor/);
    expect(() => loadConfig({ ...prod, BILLING_ENFORCED: "true", ...stripeVars })).not.toThrow();
    expect(() => loadConfig(prod)).not.toThrow(); // beta continua valendo
  });

  it("limita os dias de teste e valida a data de início da cobrança", () => {
    expect(loadConfig({ ...dev, TRIAL_DAYS: "14" }).TRIAL_DAYS).toBe(14);
    expect(() => loadConfig({ ...dev, TRIAL_DAYS: "-1" })).toThrow(/TRIAL_DAYS/);
    expect(() => loadConfig({ ...dev, TRIAL_DAYS: "9999" })).toThrow(/TRIAL_DAYS/);
    expect(loadConfig({ ...dev, BILLING_STARTS_AT: "2026-11-01" }).BILLING_STARTS_AT).toEqual(new Date("2026-11-01T00:00:00.000Z"));
    expect(loadConfig({ ...dev, BILLING_STARTS_AT: "" }).BILLING_STARTS_AT).toBeUndefined();
    expect(() => loadConfig({ ...dev, BILLING_STARTS_AT: "01/11/2026" })).toThrow(/BILLING_STARTS_AT/);
    expect(() => loadConfig({ ...dev, BILLING_STARTS_AT: "2026-13-45" })).toThrow(/BILLING_STARTS_AT/);
  });
});
