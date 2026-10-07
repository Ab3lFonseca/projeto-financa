import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { BillingProviderError } from "../src/modules/billing/provider";
import { StripeProvider, stripePlanSources, type StripePlanSource } from "../src/modules/billing/stripe";
import { FakeStripe, signStripe, stripeEvent } from "./helpers/fake-stripe";

const SECRET = "sk_test_abc123";
const WHSEC = "whsec_supersecret123";
const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const USER = "11111111-1111-4111-8111-111111111111";

/** O que a configuração real do dono faz: um PRODUTO por ciclo (o servidor descobre o preço), no plano e no adicional. */
const BY_PRODUCT = {
  basic: [
    { kind: "product", id: "prod_basic", interval: "month" },
    { kind: "product", id: "prod_basic_year", interval: "year" },
  ] as StripePlanSource[],
  investments: [
    { kind: "product", id: "prod_inv", interval: "month" },
    { kind: "product", id: "prod_inv_year", interval: "year" },
  ] as StripePlanSource[],
};

function make(over: { investments?: StripePlanSource[]; basic?: StripePlanSource[] } = {}) {
  const stripe = new FakeStripe();
  const warnings: Record<string, unknown>[] = [];
  const provider = new StripeProvider(
    {
      secretKey: SECRET,
      webhookSecret: WHSEC,
      apiBase: "https://api.stripe.test",
      basic: over.basic ?? BY_PRODUCT.basic,
      investments: over.investments ?? BY_PRODUCT.investments,
      log: { warn: (obj) => warnings.push(obj as Record<string, unknown>) },
    },
    stripe.fetch,
  );
  return { stripe, provider, warnings };
}

const body = (o: Record<string, unknown> = {}) => stripeEvent("evt_1", "customer.subscription.updated", { id: "sub_1", metadata: { user_id: USER }, ...o });

describe("Stripe: preços por ciclo (mensal e anual)", () => {
  it("descobre o preço ativo de cada PRODUTO (nunca ficam no código), nos dois ciclos, para o plano e para o adicional", async () => {
    const { stripe, provider } = make();
    expect(await provider.catalog()).toEqual({
      basic: { month: { amountCents: 1000, currency: "BRL", interval: "month" }, year: { amountCents: 10000, currency: "BRL", interval: "year" } },
      investments: { month: { amountCents: 500, currency: "BRL", interval: "month" }, year: { amountCents: 5000, currency: "BRL", interval: "year" } },
    });
    expect(stripe.calls[0]!.authorization).toBe(`Bearer ${SECRET}`);
    // 4 produtos + 4 preços; a segunda leitura vem do cache (nenhuma chamada nova ao Stripe)
    const reads = stripe.calls.length;
    expect(reads).toBe(8);
    await provider.catalog();
    expect(stripe.calls).toHaveLength(reads);
  });

  it("um price_ explícito vale mais que o produto do mesmo ciclo, e o antigo STRIPE_PRICE_ID (sem ciclo) ocupa o ciclo que o Stripe disser", async () => {
    const a = make({ basic: [{ kind: "price", id: "price_basic_year", interval: "year" }, { kind: "product", id: "prod_basic", interval: "month" }, { kind: "product", id: "prod_basic_year", interval: "year" }] });
    expect((await a.provider.catalog()).basic.year?.amountCents).toBe(10000);
    expect((await a.provider.catalog()).basic.month?.amountCents).toBe(1000);

    // preço antigo, sem ciclo declarado: era mensal e continua funcionando como mensal; se for anual, ocupa o anual
    const legacyMonthly = make({ basic: [{ kind: "price", id: "price_basic" }] });
    expect((await legacyMonthly.provider.catalog()).basic).toEqual({ month: { amountCents: 1000, currency: "BRL", interval: "month" }, year: null });
    const legacyYearly = make({ basic: [{ kind: "price", id: "price_basic_year" }] });
    expect((await legacyYearly.provider.catalog()).basic).toEqual({ month: null, year: { amountCents: 10000, currency: "BRL", interval: "year" } });
  });

  it("vender só um ciclo é permitido: o outro vem nulo e abrir pagamento nele é recusado", async () => {
    const { provider } = make({ basic: [BY_PRODUCT.basic[1]!], investments: [BY_PRODUCT.investments[1]!] });
    const c = await provider.catalog();
    expect(c.basic.month).toBeNull();
    expect(c.basic.year).not.toBeNull();
    const input = { userId: USER, email: "a@b.c", customerId: null, investments: false, successUrl: "https://x/ok", cancelUrl: "https://x/no" };
    await expect(provider.createCheckout({ ...input, interval: "month" })).rejects.toMatchObject({ code: "PLAN_NOT_CONFIGURED" });
    await expect(provider.createCheckout({ ...input, interval: "year" })).resolves.toMatchObject({ url: expect.stringMatching(/^https:\/\//) });
  });

  it("o ciclo do nome da variável precisa ser o do preço: um produto 'mensal' que na verdade é anual é ignorado (e avisado) em vez de cobrar errado", async () => {
    const { provider, warnings } = make({ basic: [{ kind: "product", id: "prod_basic_year", interval: "month" }] });
    expect((await provider.catalog()).basic).toEqual({ month: null, year: null });
    expect(warnings.some((w) => w.expected === "month" && w.actual === "year")).toBe(true);
  });

  it("sem preço padrão no produto, serve o ÚNICO preço recorrente ativo; com vários (ambíguo) ou arquivado, ignora e avisa", async () => {
    const { stripe, provider, warnings } = make({ basic: [{ kind: "product", id: "prod_semcap", interval: "month" }] });
    stripe.products.set("prod_semcap", { default_price: null });
    stripe.prices.set("price_semcap", { unit_amount: 1990, currency: "brl", product: "prod_semcap", recurring: { interval: "month", interval_count: 1 } });
    expect((await provider.catalog()).basic.month?.amountCents).toBe(1990);

    const { stripe: s2, provider: p2, warnings: w2 } = make({ basic: [{ kind: "product", id: "prod_dois", interval: "month" }] });
    s2.products.set("prod_dois", { default_price: null });
    s2.prices.set("price_d1", { unit_amount: 1000, currency: "brl", product: "prod_dois", recurring: { interval: "month", interval_count: 1 } });
    s2.prices.set("price_d2", { unit_amount: 1200, currency: "brl", product: "prod_dois", recurring: { interval: "month", interval_count: 1 } });
    expect((await p2.catalog()).basic.month).toBeNull();
    expect(w2.some((w) => w.product === "prod_dois" && w.candidates === 2)).toBe(true);

    const { stripe: s3, provider: p3, warnings: w3 } = make({ basic: [{ kind: "product", id: "prod_basic", interval: "month" }] });
    s3.products.set("prod_basic", { active: false, default_price: "price_basic" });
    expect((await p3.catalog()).basic.month).toBeNull();
    expect(w3.some((w) => w.product === "prod_basic")).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("preço arquivado ou que não é mensal/anual simples (ex.: a cada 3 meses) não é oferecido, em vez de mostrar um valor errado", async () => {
    const { stripe, provider } = make({ basic: [{ kind: "price", id: "price_basic", interval: "month" }, { kind: "price", id: "price_basic_year", interval: "year" }] });
    stripe.prices.set("price_basic", { unit_amount: 3000, currency: "brl", product: "prod_basic", recurring: { interval: "month", interval_count: 3 } });
    stripe.prices.set("price_basic_year", { unit_amount: 9990, currency: "brl", product: "prod_basic_year", active: false, recurring: { interval: "year", interval_count: 1 } });
    expect((await provider.catalog()).basic).toEqual({ month: null, year: null });
    // preço de pagamento único (sem recorrência) também não vale
    const unico = make({ basic: [{ kind: "price", id: "price_unico" }] });
    unico.stripe.prices.set("price_unico", { unit_amount: 500, currency: "brl", product: "prod_inv", recurring: null });
    expect((await unico.provider.catalog()).basic).toEqual({ month: null, year: null });
  });

  it("id digitado errado só tira aquele ciclo; queda de rede NÃO é guardada em cache (a próxima chamada tenta de novo)", async () => {
    const { stripe, provider, warnings } = make({ basic: [{ kind: "product", id: "prod_basic", interval: "month" }, { kind: "product", id: "prod_que_nao_existe", interval: "year" }] });
    const c = await provider.catalog();
    expect(c.basic.month?.amountCents).toBe(1000);
    expect(c.basic.year).toBeNull();
    expect(warnings.some((w) => w.source === "prod_que_nao_existe")).toBe(true);

    const flaky = make();
    flaky.stripe.failNext = 1;
    await expect(flaky.provider.catalog()).rejects.toMatchObject({ code: "PROVIDER_API_ERROR" });
    expect((await flaky.provider.catalog()).basic.month?.amountCents).toBe(1000);
    expect(stripe.calls.length).toBeGreaterThan(0);
  });

  it("sem o adicional configurado, ele não pode ser contratado em ciclo nenhum", async () => {
    const { provider } = make({ investments: [] });
    expect(provider.supportsInvestments).toBe(false);
    expect((await provider.catalog()).investments).toEqual({ month: null, year: null });
    const input = { userId: USER, email: "a@b.c", customerId: null, investments: true, successUrl: "https://x/ok", cancelUrl: "https://x/no" };
    for (const interval of ["month", "year"] as const) {
      await expect(provider.createCheckout({ ...input, interval })).rejects.toMatchObject({ code: "ADDON_NOT_CONFIGURED" });
      await expect(provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: null, enabled: true, interval })).rejects.toMatchObject({ code: "ADDON_NOT_CONFIGURED" });
    }
  });

  it("o adicional existe só em um ciclo: no outro, contratar é recusado (o Stripe exige o mesmo ciclo em todos os itens)", async () => {
    const { provider } = make({ investments: [BY_PRODUCT.investments[0]!] }); // só mensal
    const input = { userId: USER, email: "a@b.c", customerId: null, successUrl: "https://x/ok", cancelUrl: "https://x/no" };
    await expect(provider.createCheckout({ ...input, interval: "year", investments: true })).rejects.toMatchObject({ code: "ADDON_NOT_CONFIGURED" });
    await expect(provider.createCheckout({ ...input, interval: "month", investments: true })).resolves.toMatchObject({ url: expect.any(String) });
    await expect(provider.createCheckout({ ...input, interval: "year", investments: false })).resolves.toMatchObject({ url: expect.any(String) });
  });
});

describe("Stripe: pagamento hospedado", () => {
  const input = { userId: USER, email: "pessoa@email.com", customerId: null, interval: "month" as const, investments: false, successUrl: "https://app.test/subscription/return?status=success", cancelUrl: "https://app.test/subscription/return?status=cancel" };

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

  it("cobra o preço do ciclo ESCOLHIDO: anual usa o preço anual, e o adicional vai no mesmo ciclo", async () => {
    const { stripe, provider } = make();
    await provider.createCheckout({ ...input, interval: "year" });
    const f1 = stripe.calls.filter((c) => c.path === "checkout/sessions").at(-1)!.form!;
    expect(f1.get("line_items[0][price]")).toBe("price_basic_year");
    expect(f1.get("line_items[1][price]")).toBeNull();

    await provider.createCheckout({ ...input, interval: "year", investments: true });
    const f2 = stripe.calls.filter((c) => c.path === "checkout/sessions").at(-1)!.form!;
    expect(f2.get("line_items[0][price]")).toBe("price_basic_year");
    expect(f2.get("line_items[1][price]")).toBe("price_inv_year");

    await provider.createCheckout({ ...input, interval: "month", investments: true });
    const f3 = stripe.calls.filter((c) => c.path === "checkout/sessions").at(-1)!.form!;
    expect(f3.get("line_items[0][price]")).toBe("price_basic");
    expect(f3.get("line_items[1][price]")).toBe("price_inv");
  });

  it("com cliente já existente, reaproveita o cartão salvo (sem e-mail)", async () => {
    const { stripe, provider } = make();
    await provider.createCheckout({ ...input, investments: true, customerId: "cus_old" });
    const f = stripe.calls.find((c) => c.path === "checkout/sessions")!.form!;
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
    const evilStripe = new FakeStripe();
    const evil = new StripeProvider(
      { secretKey: SECRET, webhookSecret: WHSEC, basic: [{ kind: "price", id: "price_basic" }], investments: [], apiBase: "https://api.stripe.test" },
      (async (url: unknown, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path.includes("/prices/")) return evilStripe.fetch(url as string, init);
        return new Response(JSON.stringify({ url: "javascript:alert(1)" }), { status: 200 });
      }) as typeof fetch,
    );
    await expect(evil.createCheckout(input)).rejects.toMatchObject({ code: "NO_CHECKOUT_URL" });
    await expect(evil.createPortal({ customerId: "cus_1", returnUrl: "https://x" })).rejects.toMatchObject({ code: "NO_PORTAL_URL" });
  });

  it("liga e desliga o adicional na assinatura (idempotente: não duplica nem remove o que não existe), no ciclo da assinatura", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_1", { userId: USER, periodEnd: new Date(NOW + 10 * 86_400_000) });
    await provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: null, enabled: true, interval: "month" });
    const add = stripe.calls.find((c) => c.path === "subscription_items")!.form!;
    expect(add.get("subscription")).toBe("sub_1");
    expect(add.get("price")).toBe("price_inv");

    const writes = () => stripe.calls.filter((c) => c.method !== "GET").length;
    const before = writes();
    await provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: "si_x", enabled: true, interval: "month" }); // já tem
    await provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: null, enabled: false, interval: "month" }); // já não tem
    expect(writes()).toBe(before);

    await provider.setInvestmentsAddon({ subscriptionId: "sub_1", itemId: "si_x", enabled: false, interval: "month" });
    expect(stripe.calls.some((c) => c.method === "DELETE" && c.path.startsWith("subscription_items/si_x"))).toBe(true);
  });

  it("numa assinatura ANUAL, o adicional que entra é o anual (nunca o mensal)", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_y", { userId: USER, periodEnd: new Date(NOW + 300 * 86_400_000), interval: "year" });
    await provider.setInvestmentsAddon({ subscriptionId: "sub_y", itemId: null, enabled: true, interval: "year" });
    expect(stripe.calls.filter((c) => c.path === "subscription_items").at(-1)!.form!.get("price")).toBe("price_inv_year");
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
    const down = new StripeProvider({ secretKey: SECRET, webhookSecret: WHSEC, basic: [{ kind: "price", id: "price_basic" }], investments: [], apiBase: "https://api.stripe.test" }, (async () => {
      throw new Error("ECONNRESET 10.0.0.1:443");
    }) as typeof fetch);
    const err = await down.catalog().catch((e) => e);
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

  it("traduz os estados do Stripe e extrai cliente, usuário, fim do período, ciclo e adicional", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_1", { userId: USER, periodEnd: end, addon: true });
    expect(await provider.fetchSubscription("sub_1")).toEqual({
      providerSubscriptionId: "sub_1",
      providerCustomerId: "cus_test_1",
      userId: USER,
      status: "ACTIVE",
      currentPeriodEnd: new Date(Math.floor(end.getTime() / 1000) * 1000),
      cancelAtPeriodEnd: false,
      interval: "month",
      investmentsAddon: true,
      investmentsItemId: "si_inv",
    });

    const map: Record<string, string> = { trialing: "TRIALING", past_due: "PAST_DUE", canceled: "CANCELED", unpaid: "EXPIRED", paused: "EXPIRED", incomplete: "INCOMPLETE", incomplete_expired: "CANCELED", algo_novo: "EXPIRED" };
    for (const [stripeStatus, expected] of Object.entries(map)) {
      stripe.setActive("sub_s", { userId: USER, periodEnd: end, status: stripeStatus });
      expect((await provider.fetchSubscription("sub_s")).status, stripeStatus).toBe(expected);
    }
  });

  it("descobre o ciclo da assinatura (mensal ou anual) pelo item do plano, com ou sem adicional", async () => {
    const { stripe, provider } = make();
    stripe.setActive("sub_m", { userId: USER, periodEnd: end, interval: "month" });
    stripe.setActive("sub_y", { userId: USER, periodEnd: end, interval: "year", addon: true });
    expect((await provider.fetchSubscription("sub_m")).interval).toBe("month");
    const y = await provider.fetchSubscription("sub_y");
    expect(y.interval).toBe("year"); // o item do adicional (também anual) não confunde: vale o do plano
    expect(y.investmentsAddon).toBe(true);
    expect(y.investmentsItemId).toBe("si_inv");
    // ciclo que não é mensal/anual simples (ex.: trimestral criado à mão no Stripe): "não sei", sem chutar
    const odd = stripe.setActive("sub_q", { userId: USER, periodEnd: end });
    odd.items!.data[0]!.price.recurring = { interval: "month", interval_count: 3 };
    expect((await provider.fetchSubscription("sub_q")).interval).toBeNull();
  });

  it("reconhece o adicional pelo PRODUTO ou pelo price_ configurado, sem consultar o Stripe (queda de rede nunca 'tira' o adicional)", async () => {
    const byProduct = make();
    byProduct.stripe.setActive("sub_1", { userId: USER, periodEnd: end, addon: true, interval: "year" });
    const callsBefore = byProduct.stripe.calls.length;
    expect((await byProduct.provider.fetchSubscription("sub_1")).investmentsAddon).toBe(true);
    expect(byProduct.stripe.calls.length - callsBefore).toBe(1); // só ler a assinatura

    const byPrice = make({ investments: [{ kind: "price", id: "price_inv" }] });
    byPrice.stripe.setActive("sub_1", { userId: USER, periodEnd: end, addon: true });
    expect((await byPrice.provider.fetchSubscription("sub_1")).investmentsAddon).toBe(true);
    // adicional de outro produto não configurado não conta
    const noAddon = make({ investments: [] });
    noAddon.stripe.setActive("sub_1", { userId: USER, periodEnd: end, addon: true });
    expect((await noAddon.provider.fetchSubscription("sub_1")).investmentsAddon).toBe(false);
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
  const base = { BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", APP_WEB_URL: "https://app.exemplo.com" };
  /** O que o dono vai colocar no Render: um produto por ciclo. */
  const stripeVars = { ...base, STRIPE_PRODUCT_ID_MONTHLY: "prod_mensal123", STRIPE_PRODUCT_ID_YEARLY: "prod_anual456" };

  it("por padrão a cobrança está desligada (beta), com 30 dias de teste e sem provedor", () => {
    const c = loadConfig(dev);
    expect(c.BILLING_ENFORCED).toBe(false);
    expect(c.TRIAL_DAYS).toBe(30);
    expect(c.BILLING_PROVIDER).toBe("none");
    expect(c.BILLING_STARTS_AT).toBeUndefined();
  });

  it("o Stripe exige chave secreta, segredo do webhook e endereço do site; campo em branco conta como ausente", () => {
    expect(() => loadConfig({ ...dev, ...stripeVars })).not.toThrow();
    for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "APP_WEB_URL"]) {
      const without = { ...dev, ...stripeVars, [key]: "" };
      expect(() => loadConfig(without), key).toThrow(new RegExp(`${key} é obrigatória`));
    }
  });

  it("o plano pode vir por produto (mensal e/ou anual) ou por preço; sem nenhum, é recusado com a explicação do que falta", () => {
    expect(() => loadConfig({ ...dev, ...base })).toThrow(/STRIPE_PRODUCT_ID_MONTHLY e\/ou STRIPE_PRODUCT_ID_YEARLY/);
    for (const v of [{ STRIPE_PRODUCT_ID_MONTHLY: "prod_a" }, { STRIPE_PRODUCT_ID_YEARLY: "prod_b" }, { STRIPE_PRICE_ID_MONTHLY: "price_a" }, { STRIPE_PRICE_ID_YEARLY: "price_b" }, { STRIPE_PRICE_ID: "price_c" }]) {
      expect(() => loadConfig({ ...dev, ...base, ...v }), JSON.stringify(v)).not.toThrow();
    }
    expect(() => loadConfig({ ...dev, ...base, STRIPE_PRODUCT_ID_MONTHLY: "   " })).toThrow(/Defina o plano/);
  });

  it("recusa a chave publicável e formatos errados, com dica de onde cada tipo de id vai (erro comum de colar no lugar errado)", () => {
    expect(() => loadConfig({ ...dev, ...stripeVars, STRIPE_SECRET_KEY: "pk_test_abc" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => loadConfig({ ...dev, ...stripeVars, STRIPE_WEBHOOK_SECRET: "abc" })).toThrow(/STRIPE_WEBHOOK_SECRET/);
    // id de produto no campo de preço, e o contrário
    expect(() => loadConfig({ ...dev, ...base, STRIPE_PRICE_ID_MONTHLY: "prod_abc" })).toThrow(/STRIPE_PRICE_ID_MONTHLY.*STRIPE_PRODUCT_ID_MONTHLY/s);
    expect(() => loadConfig({ ...dev, ...base, STRIPE_PRICE_ID: "prod_abc" })).toThrow(/STRIPE_PRICE_ID/);
    expect(() => loadConfig({ ...dev, ...base, STRIPE_PRODUCT_ID_YEARLY: "price_abc" })).toThrow(/STRIPE_PRODUCT_ID_YEARLY.*STRIPE_PRICE_ID_YEARLY/s);
    expect(() => loadConfig({ ...dev, ...stripeVars, STRIPE_PRICE_ID_INVESTMENTS: "xyz" })).toThrow(/STRIPE_PRICE_ID_INVESTMENTS/);
    expect(() => loadConfig({ ...dev, ...stripeVars, STRIPE_PRODUCT_ID_INVESTMENTS_YEARLY: "xyz" })).toThrow(/STRIPE_PRODUCT_ID_INVESTMENTS_YEARLY/);
    expect(loadConfig({ ...dev, ...stripeVars, STRIPE_SECRET_KEY: "rk_live_abc", STRIPE_PRICE_ID_INVESTMENTS: "price_inv" }).STRIPE_PRICE_ID_INVESTMENTS).toBe("price_inv");
  });

  it("monta as fontes de preço na ordem de preferência: price_ explícito, depois o antigo, depois o produto", () => {
    const cfg = loadConfig({
      ...dev,
      ...stripeVars,
      STRIPE_PRICE_ID_YEARLY: "price_y",
      STRIPE_PRICE_ID: "price_antigo",
      STRIPE_PRODUCT_ID_INVESTMENTS_MONTHLY: "prod_im",
      STRIPE_PRICE_ID_INVESTMENTS_MONTHLY: "price_im",
    });
    expect(stripePlanSources(cfg)).toEqual({
      basic: [
        { kind: "price", id: "price_y", interval: "year" },
        { kind: "price", id: "price_antigo" },
        { kind: "product", id: "prod_mensal123", interval: "month" },
        { kind: "product", id: "prod_anual456", interval: "year" },
      ],
      investments: [
        { kind: "price", id: "price_im", interval: "month" },
        { kind: "product", id: "prod_im", interval: "month" },
      ],
    });
    expect(stripePlanSources(loadConfig(dev))).toEqual({ basic: [], investments: [] });
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
