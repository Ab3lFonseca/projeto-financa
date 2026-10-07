import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DevBillingProvider } from "../src/modules/billing/dev";
import type { BillingProvider } from "../src/modules/billing/provider";
import { StripeProvider } from "../src/modules/billing/stripe";
import { beforeEraseOf } from "../src/modules/privacy/before-erase";
import { finalizeDeletions } from "../src/modules/privacy/service";
import { createTestEnv, type TestEnv, type TestUser } from "./helpers/env";
import { FakeStripe, signStripe, stripeEvent } from "./helpers/fake-stripe";

const WHSEC = "whsec_integration123";
const DAY = 86_400_000;
const APP_WEB_URL = "https://app.exemplo.test";

/** Provedor como o dono vai configurar: um PRODUTO por ciclo (mensal e anual) no plano e no adicional. `addon: "month"` = adicional só no mensal. */
function stripeProvider(stripe: FakeStripe, withAddon: boolean | "month" = true): StripeProvider {
  const investments = withAddon
    ? [
        { kind: "product" as const, id: "prod_inv", interval: "month" as const },
        ...(withAddon === true ? [{ kind: "product" as const, id: "prod_inv_year", interval: "year" as const }] : []),
      ]
    : [];
  return new StripeProvider(
    {
      secretKey: "sk_test_integration",
      webhookSecret: WHSEC,
      apiBase: "https://api.stripe.test",
      basic: [
        { kind: "product", id: "prod_basic", interval: "month" },
        { kind: "product", id: "prod_basic_year", interval: "year" },
      ],
      investments,
    },
    stripe.fetch,
  );
}

/** Cria um ambiente de teste com a cobrança ligada e o provedor indicado. */
async function envWith(provider: BillingProvider | null, over: Record<string, string> = {}) {
  return createTestEnv({ BILLING_ENFORCED: "true", APP_WEB_URL, ...over }, { billingProvider: provider });
}

async function member(env: TestEnv, o: { expired?: boolean } = {}): Promise<TestUser> {
  const u = await env.newUser();
  await u.get("/v1/me"); // provisiona
  if (o.expired) await env.expireTrial(u.id);
  return u;
}

async function makeAdmin(env: TestEnv): Promise<TestUser> {
  const admin = await member(env);
  await env.prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  env.app.users.invalidate(admin.id);
  return admin;
}

/** Tenta criar algo (uma escrita qualquer) para saber se o app está liberado ou somente leitura. */
const tryWrite = (u: TestUser) => u.post("/v1/categories", { type: "EXPENSE", name: `Cat ${randomUUID().slice(0, 8)}` });

let eventSeq = 0;
const eventId = () => `evt_${Date.now()}_${++eventSeq}`;

function webhooks(env: TestEnv, secret = WHSEC) {
  return {
    async deliver(type: string, object: Record<string, unknown>, o: { id?: string; body?: string; signature?: string | null; timestamp?: number } = {}) {
      const raw = o.body ?? stripeEvent(o.id ?? eventId(), type, object);
      const sig = o.signature === undefined ? signStripe(secret, raw, env.now().getTime(), { timestamp: o.timestamp }) : o.signature;
      return env.call("POST", "/v1/webhooks/stripe", { body: raw, headers: { "content-type": "application/json", ...(sig ? { "stripe-signature": sig } : {}) } });
    },
  };
}

// =========================================================================================================== Stripe

describe("assinatura com Stripe (cobrança ligada)", () => {
  let env: TestEnv;
  let stripe: FakeStripe;
  let hook: ReturnType<typeof webhooks>;
  beforeAll(async () => {
    stripe = new FakeStripe();
    env = await envWith(stripeProvider(stripe));
    hook = webhooks(env);
  });
  afterAll(async () => {
    await env.close();
  });

  const getCalls = (prefix: string) => stripe.calls.filter((c) => c.method === "GET" && c.path.startsWith(prefix));
  /** Todo usuário nasce com uma assinatura-base (FREE); "nada foi gravado" significa que ela continua sem vínculo com o Stripe. */
  const untouched = async (u: TestUser) => {
    const row = await env.prisma.subscription.findUnique({ where: { userId: u.id } });
    return row === null || (row.plan === "FREE" && row.externalId === null && row.providerCustomerId === null);
  };

  /** A pessoa paga no Stripe: a assinatura passa a existir lá e o webhook de checkout concluído chega. */
  async function subscribe(u: TestUser, subId: string, o: { addon?: boolean; periodEnd?: Date; customer?: string; interval?: "month" | "year" } = {}) {
    stripe.setActive(subId, { userId: u.id, customer: o.customer ?? `cus_${subId}`, periodEnd: o.periodEnd ?? new Date(env.now().getTime() + 30 * DAY), addon: o.addon, interval: o.interval });
    const res = await hook.deliver("checkout.session.completed", { subscription: subId, client_reference_id: u.id });
    expect(res.status).toBe(200);
  }

  describe("estado e início do pagamento", () => {
    it("no teste grátis mostra estado, preços lidos do provedor e o que dá para fazer", async () => {
      const u = await member(env);
      const res = await u.get("/v1/billing");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        enforced: true,
        trialDays: 30,
        provider: "stripe",
        checkoutAvailable: true,
        investmentsAvailable: true,
        canManage: false,
        hasInvestmentsAddon: false,
        interval: null,
        prices: {
          basic: { month: { amountCents: 1000, currency: "BRL", interval: "month" }, year: { amountCents: 10000, currency: "BRL", interval: "year" } },
          investments: { month: { amountCents: 500, currency: "BRL", interval: "month" }, year: { amountCents: 5000, currency: "BRL", interval: "year" } },
        },
      });
      expect(res.body.access).toMatchObject({ state: "trial", allowed: true, cancelAtPeriodEnd: false, features: { investments: true } });
      expect(res.body.access.daysLeft).toBeGreaterThan(0);
      expect((await u.get("/v1/me")).body.entitlements.access.state).toBe("trial");
    });

    it("exige login", async () => {
      expect((await env.anon.get("/v1/billing")).status).toBe(401);
      expect((await env.anon.post("/v1/billing/checkout", {})).status).toBe(401);
    });

    it("o preço indisponível não derruba a tela: vem sem valor e o resto funciona", async () => {
      const broken = new FakeStripe();
      broken.failNext = 99;
      const e = await envWith(stripeProvider(broken));
      try {
        const u = await member(e);
        const res = await u.get("/v1/billing");
        expect(res.status).toBe(200);
        expect(res.body.prices).toEqual({ basic: { month: null, year: null }, investments: { month: null, year: null } });
        expect(res.body.checkoutAvailable).toBe(true);
      } finally {
        await e.close();
      }
    });

    it("abre o pagamento no Stripe com endereços de retorno do servidor, ligado ao usuário, e audita sem dados pessoais", async () => {
      const u = await member(env);
      const res = await u.post("/v1/billing/checkout", {});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ url: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//), activated: false });

      const form = stripe.calls.filter((c) => c.path === "checkout/sessions").at(-1)!.form!;
      expect(form.get("client_reference_id")).toBe(u.id);
      expect(form.get("customer_email")).toBe(u.email);
      expect(form.get("success_url")).toBe(`${APP_WEB_URL}/subscription/return?status=success`);
      expect(form.get("cancel_url")).toBe(`${APP_WEB_URL}/subscription/return?status=cancel`);
      expect(form.get("line_items[1][price]")).toBeNull();

      const audits = await env.prisma.auditLog.findMany({ where: { actorId: u.id, action: "billing.checkout.started" } });
      expect(audits).toHaveLength(1);
      expect(JSON.stringify(audits, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(u.email);
    });

    it("com o Rendimentos, o pagamento já leva o segundo item", async () => {
      const u = await member(env);
      expect((await u.post("/v1/billing/checkout", { investments: true })).status).toBe(200);
      expect(stripe.calls.filter((c) => c.path === "checkout/sessions").at(-1)!.form!.get("line_items[1][price]")).toBe("price_inv");
    });

    it("o cliente não escolhe para onde o pagamento volta (sem redirecionamento aberto) nem manda campos extras", async () => {
      const u = await member(env);
      const res = await u.post("/v1/billing/checkout", { investments: false, successUrl: "https://malicioso.example" });
      expect(res.status).toBe(422);
      expect(stripe.calls.filter((c) => c.path === "checkout/sessions" && c.form?.get("success_url")?.includes("malicioso"))).toHaveLength(0);
    });

    it("quem já tem acesso pago, cortesia ou é administrador não abre um segundo pagamento", async () => {
      const paid = await member(env);
      await env.makePaid(paid.id);
      const r1 = await paid.post("/v1/billing/checkout", {});
      expect(r1.status).toBe(409);
      expect(r1.body.error.code).toBe("ALREADY_ACTIVE");

      const gift = await member(env);
      await env.makePaid(gift.id, { store: "MANUAL" });
      expect((await gift.post("/v1/billing/checkout", {})).body.error.code).toBe("ALREADY_ACTIVE");

      const admin = await makeAdmin(env);
      expect((await admin.post("/v1/billing/checkout", {})).body.error.code).toBe("ALREADY_ACTIVE");
    });

    it("falha do Stripe vira 502 com mensagem própria, sem repassar o texto do provedor", async () => {
      const u = await member(env);
      stripe.errorNext = { status: 402, code: "card_declined", message: "O cartão 4242 4242 4242 4242 foi recusado" };
      const res = await u.post("/v1/billing/checkout", {});
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe("BILLING_PROVIDER_ERROR");
      expect(JSON.stringify(res.body)).not.toContain("4242");
    });
  });

  describe("ciclos: mensal e anual", () => {
    const lastCheckout = () => stripe.calls.filter((c) => c.path === "checkout/sessions").at(-1)!.form!;

    it("sem informar o ciclo vale o MENSAL; o anual só se a pessoa pedir, e o adicional vai no ciclo escolhido", async () => {
      const u = await member(env);
      expect((await u.post("/v1/billing/checkout", {})).status).toBe(200);
      expect(lastCheckout().get("line_items[0][price]")).toBe("price_basic");

      expect((await u.post("/v1/billing/checkout", { interval: "year" })).status).toBe(200);
      expect(lastCheckout().get("line_items[0][price]")).toBe("price_basic_year");
      expect(lastCheckout().get("line_items[1][price]")).toBeNull();

      expect((await u.post("/v1/billing/checkout", { interval: "year", investments: true })).status).toBe(200);
      expect(lastCheckout().get("line_items[0][price]")).toBe("price_basic_year");
      expect(lastCheckout().get("line_items[1][price]")).toBe("price_inv_year");

      expect((await u.post("/v1/billing/checkout", { interval: "semana" })).status).toBe(422);
      const intervals = (await env.prisma.auditLog.findMany({ where: { actorId: u.id, action: "billing.checkout.started" } })).map((a) => (a.metadata as { interval?: string }).interval);
      expect(intervals).toEqual(expect.arrayContaining(["month", "year"]));
    });

    it("assinatura anual: o ciclo é gravado e aparece no estado; o adicional entra no preço ANUAL", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_anual", { interval: "year", periodEnd: new Date(env.now().getTime() + 365 * DAY) });
      expect((await u.get("/v1/billing")).body).toMatchObject({ interval: "year", access: { state: "paid", features: { investments: false } } });
      expect((await env.prisma.subscription.findUniqueOrThrow({ where: { userId: u.id } })).billingInterval).toBe("year");

      const on = await u.post("/v1/billing/addon", { enabled: true });
      expect(on.body).toMatchObject({ hasInvestmentsAddon: true, interval: "year" });
      expect(stripe.calls.some((c) => c.path === "subscription_items" && c.form?.get("price") === "price_inv_year" && c.form?.get("subscription") === "sub_anual")).toBe(true);
      expect(stripe.calls.some((c) => c.path === "subscription_items" && c.form?.get("price") === "price_inv" && c.form?.get("subscription") === "sub_anual")).toBe(false);
      expect((await u.post("/v1/billing/addon", { enabled: false })).body.hasInvestmentsAddon).toBe(false);
    });

    it("o ciclo só aparece para quem paga pelo app (teste grátis e cortesia ficam sem)", async () => {
      const trial = await member(env);
      expect((await trial.get("/v1/billing")).body.interval).toBeNull();
      const gift = await member(env);
      await env.makePaid(gift.id, { store: "MANUAL" });
      expect((await gift.get("/v1/billing")).body.interval).toBeNull();
      const monthly = await member(env, { expired: true });
      await subscribe(monthly, "sub_mensal_ciclo");
      expect((await monthly.get("/v1/billing")).body.interval).toBe("month");
    });

    it("assinatura num ciclo que não é mensal/anual simples não aceita o adicional (não dá para escolher o preço certo)", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_trimestral");
      stripe.subscriptions.get("sub_trimestral")!.items!.data[0]!.price.recurring = { interval: "month", interval_count: 3 };
      const res = await u.post("/v1/billing/addon", { enabled: true });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("ADDON_UNAVAILABLE");
    });

    it("a receita mensal estimada do painel conta o anual dividido por 12", async () => {
      const admin = await makeAdmin(env);
      const revenue = async () => (await admin.get("/v1/admin/stats")).body.billing.monthlyRevenueCents as number;
      const before = await revenue();
      const yearly = await member(env, { expired: true });
      await subscribe(yearly, "sub_receita_anual", { interval: "year", periodEnd: new Date(env.now().getTime() + 365 * DAY) });
      expect((await revenue()) - before).toBe(833); // R$ 100,00 por ano = R$ 8,33 por mês (arredondado)
      const yearlyWithAddon = await member(env, { expired: true });
      await subscribe(yearlyWithAddon, "sub_receita_anual_inv", { interval: "year", addon: true, periodEnd: new Date(env.now().getTime() + 365 * DAY) });
      expect((await revenue()) - before).toBe(833 + 833 + 417); // + o adicional anual: R$ 50,00 por ano = R$ 4,17 por mês
    });
  });

  describe("webhook", () => {
    it("pagamento concluído: libera o acesso pago a partir do estado lido no Stripe", async () => {
      const u = await member(env, { expired: true });
      const blocked = await tryWrite(u);
      expect(blocked.status).toBe(402);
      expect(blocked.body.error.code).toBe("SUBSCRIPTION_REQUIRED");
      expect((await u.get("/v1/categories")).status).toBe(200); // consultar continua liberado

      const end = new Date(env.now().getTime() + 30 * DAY);
      await subscribe(u, "sub_pago_1", { periodEnd: end });

      const billing = (await u.get("/v1/billing")).body;
      expect(billing.access).toMatchObject({ state: "paid", allowed: true, cancelAtPeriodEnd: false, features: { investments: false } });
      expect(billing.access.expiresAt).toBe(new Date(Math.floor(end.getTime() / 1000) * 1000).toISOString());
      expect(billing).toMatchObject({ canManage: true, hasInvestmentsAddon: false });
      expect((await tryWrite(u)).status).toBe(201);

      const row = await env.prisma.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      expect(row).toMatchObject({ plan: "PREMIUM", status: "ACTIVE", store: "WEB", externalId: "sub_pago_1", providerCustomerId: "cus_sub_pago_1", cancelAtPeriodEnd: false, investmentsAddon: false });
      expect(await env.prisma.auditLog.count({ where: { entityId: u.id, action: "billing.subscription.synced" } })).toBe(1);
    });

    it("assinatura que já inclui o Rendimentos libera o recurso", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_pago_2", { addon: true });
      const billing = (await u.get("/v1/billing")).body;
      expect(billing).toMatchObject({ hasInvestmentsAddon: true });
      expect(billing.access.features.investments).toBe(true);
    });

    it("evento repetido é ignorado e não relê o provedor (idempotência)", async () => {
      const u = await member(env, { expired: true });
      stripe.setActive("sub_dup", { userId: u.id, periodEnd: new Date(env.now().getTime() + 5 * DAY) });
      const id = eventId();
      const body = { id: "sub_dup", metadata: { user_id: u.id } };
      const first = await hook.deliver("customer.subscription.created", body, { id });
      expect(first.body).toEqual({ ok: true, duplicate: false });
      const reads = getCalls("subscriptions/sub_dup").length;
      const again = await hook.deliver("customer.subscription.created", body, { id });
      expect(again.status).toBe(200);
      expect(again.body).toEqual({ ok: true, duplicate: true });
      expect(getCalls("subscriptions/sub_dup")).toHaveLength(reads);
      const events = await env.prisma.billingEvent.findMany({ where: { provider: "stripe", eventId: id } });
      expect(events).toHaveLength(1);
      expect(events[0]!.processedAt).not.toBeNull();
    });

    it("sem assinatura válida, nada é aceito nem gravado (cabeçalho ausente, segredo errado, corpo alterado, pedido antigo)", async () => {
      const u = await member(env, { expired: true });
      stripe.setActive("sub_fraude", { userId: u.id, periodEnd: new Date(env.now().getTime() + 30 * DAY) });
      const id = eventId();
      const raw = stripeEvent(id, "customer.subscription.updated", { id: "sub_fraude", metadata: { user_id: u.id } });
      const now = env.now().getTime();

      const attempts: [string, Awaited<ReturnType<typeof hook.deliver>>][] = [
        ["sem cabeçalho", await hook.deliver("x", {}, { body: raw, signature: null })],
        ["segredo errado", await hook.deliver("x", {}, { body: raw, signature: signStripe("whsec_errado999", raw, now) })],
        ["corpo alterado", await hook.deliver("x", {}, { body: raw.replace("sub_fraude", "sub_outra"), signature: signStripe(WHSEC, raw, now) })],
        ["pedido de ontem reenviado", await hook.deliver("x", {}, { body: raw, timestamp: Math.floor(now / 1000) - 86_400 })],
        ["lixo", await hook.deliver("x", {}, { body: raw, signature: "t=1,v1=zz" })],
      ];
      for (const [label, res] of attempts) {
        expect(res.status, label).toBe(401);
        expect(res.body.error.code, label).toBe("WEBHOOK_UNAUTHORIZED");
      }
      expect(await env.prisma.billingEvent.count({ where: { eventId: id } })).toBe(0);
      expect(await untouched(u)).toBe(true);
      expect((await u.get("/v1/billing")).body.access.state).toBe("expired");
    });

    it("a assinatura vale sobre os bytes exatos do corpo (JSON com espaços e quebras de linha)", async () => {
      const u = await member(env, { expired: true });
      stripe.setActive("sub_bytes", { userId: u.id, periodEnd: new Date(env.now().getTime() + 30 * DAY) });
      const pretty = JSON.stringify({ id: eventId(), object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_bytes", metadata: { user_id: u.id } } } }, null, 4);
      expect((await hook.deliver("x", {}, { body: pretty })).status).toBe(200);
      expect((await u.get("/v1/billing")).body.access.state).toBe("paid");
    });

    it("se o processamento falha, o evento é esquecido para o Stripe reenviar, e o reenvio funciona", async () => {
      const u = await member(env, { expired: true });
      stripe.setActive("sub_retry", { userId: u.id, periodEnd: new Date(env.now().getTime() + 30 * DAY) });
      const id = eventId();
      const object = { id: "sub_retry", metadata: { user_id: u.id } };

      stripe.failNext = 1;
      const failed = await hook.deliver("customer.subscription.updated", object, { id });
      expect(failed.status).toBe(502);
      expect(await env.prisma.billingEvent.count({ where: { eventId: id } })).toBe(0);
      expect(await untouched(u)).toBe(true);

      const retried = await hook.deliver("customer.subscription.updated", object, { id });
      expect(retried.body).toEqual({ ok: true, duplicate: false });
      expect((await u.get("/v1/billing")).body.access.state).toBe("paid");
    });

    it("eventos fora de ordem: vale o estado ATUAL no Stripe, não o que o evento atrasado descreve", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_ordem");
      // Chega, atrasado, um evento de cancelamento antigo; mas no Stripe a assinatura segue ativa.
      const late = await hook.deliver("customer.subscription.deleted", { id: "sub_ordem", metadata: { user_id: u.id } });
      expect(late.status).toBe(200);
      expect((await u.get("/v1/billing")).body.access.state).toBe("paid");
    });

    it("cancelamento agendado mantém o acesso até o fim do período; cancelamento efetivado volta ao modo somente leitura", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_cancela");

      stripe.subscriptions.get("sub_cancela")!.cancel_at_period_end = true;
      await hook.deliver("customer.subscription.updated", { id: "sub_cancela", metadata: { user_id: u.id } });
      const scheduled = (await u.get("/v1/billing")).body.access;
      expect(scheduled).toMatchObject({ state: "paid", allowed: true, cancelAtPeriodEnd: true });
      expect((await tryWrite(u)).status).toBe(201);

      const sub = stripe.subscriptions.get("sub_cancela")!;
      sub.status = "canceled";
      sub.current_period_end = Math.floor((env.now().getTime() - DAY) / 1000);
      await hook.deliver("customer.subscription.deleted", { id: "sub_cancela", metadata: { user_id: u.id } });
      expect((await u.get("/v1/billing")).body.access).toMatchObject({ state: "expired", allowed: false });
      expect((await tryWrite(u)).body.error.code).toBe("SUBSCRIPTION_REQUIRED");
      const row = await env.prisma.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      expect(row.status).toBe("CANCELED");
      expect(row.canceledAt).not.toBeNull();
    });

    it("cartão recusado (em atraso) mantém o acesso até o fim do período já pago, e depois deixa de valer", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_atraso");
      const sub = stripe.subscriptions.get("sub_atraso")!;
      sub.status = "past_due";
      await hook.deliver("invoice.payment_failed", { subscription: "sub_atraso" });
      expect((await u.get("/v1/billing")).body.access).toMatchObject({ state: "paid", allowed: true });

      sub.current_period_end = Math.floor((env.now().getTime() - DAY) / 1000);
      await hook.deliver("customer.subscription.updated", { id: "sub_atraso", metadata: { user_id: u.id } });
      expect((await u.get("/v1/billing")).body.access.state).toBe("expired");
    });

    it("pagamento não concluído (incomplete) não dá acesso e não apaga a assinatura que já existia", async () => {
      const fresh = await member(env, { expired: true });
      stripe.setActive("sub_inc", { userId: fresh.id, periodEnd: new Date(env.now().getTime() + 30 * DAY), status: "incomplete" });
      expect((await hook.deliver("customer.subscription.created", { id: "sub_inc", metadata: { user_id: fresh.id } })).status).toBe(200);
      expect(await untouched(fresh)).toBe(true);
      expect((await fresh.get("/v1/billing")).body.access.state).toBe("expired");

      const paying = await member(env, { expired: true });
      await subscribe(paying, "sub_antiga");
      stripe.setActive("sub_inc2", { userId: paying.id, periodEnd: new Date(env.now().getTime() + 30 * DAY), status: "incomplete" });
      await hook.deliver("customer.subscription.created", { id: "sub_inc2", metadata: { user_id: paying.id } });
      expect((await env.prisma.subscription.findUniqueOrThrow({ where: { userId: paying.id } })).externalId).toBe("sub_antiga");
      expect((await paying.get("/v1/billing")).body.access.state).toBe("paid");
    });

    it("assinatura sem usuário nos metadados: acha pelo cliente que já conhecemos; sem nenhum vínculo, é ignorada", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_a", { customer: "cus_conhecido" });

      stripe.setActive("sub_b", { periodEnd: new Date(env.now().getTime() + 30 * DAY), customer: "cus_conhecido" }); // sem user_id
      expect((await hook.deliver("customer.subscription.created", { id: "sub_b" })).status).toBe(200);
      expect((await env.prisma.subscription.findUniqueOrThrow({ where: { userId: u.id } })).externalId).toBe("sub_b");

      stripe.setActive("sub_orfa", { periodEnd: new Date(env.now().getTime() + 30 * DAY), customer: "cus_desconhecido" });
      expect((await hook.deliver("customer.subscription.created", { id: "sub_orfa" })).status).toBe(200);
      expect(await env.prisma.subscription.count({ where: { externalId: "sub_orfa" } })).toBe(0);
    });

    it("usuário que não existe mais é ignorado sem erro (o Stripe não fica reenviando para sempre)", async () => {
      const ghost = randomUUID();
      stripe.setActive("sub_fantasma", { userId: ghost, periodEnd: new Date(env.now().getTime() + 30 * DAY) });
      const res = await hook.deliver("customer.subscription.created", { id: "sub_fantasma", metadata: { user_id: ghost } });
      expect(res.status).toBe(200);
      expect(await env.prisma.subscription.count({ where: { externalId: "sub_fantasma" } })).toBe(0);
    });

    it("evento que não é de assinatura é aceito e registrado", async () => {
      const id = eventId();
      const res = await hook.deliver("customer.created", { id: "cus_novo" }, { id });
      expect(res.body).toEqual({ ok: true, duplicate: false });
      const row = await env.prisma.billingEvent.findFirstOrThrow({ where: { eventId: id } });
      expect(row).toMatchObject({ provider: "stripe", eventType: "customer.created" });
      expect(row.processedAt).not.toBeNull();
    });

    it("a tabela de eventos não guarda dados do pagamento, só identificação do evento", async () => {
      const id = eventId();
      await hook.deliver("customer.created", { id: "cus_x", email: "pessoa@exemplo.com", card: "4242424242424242" }, { id });
      const row = await env.prisma.billingEvent.findFirstOrThrow({ where: { eventId: id } });
      const json = JSON.stringify(row);
      expect(json).not.toContain("pessoa@exemplo.com");
      expect(json).not.toContain("4242");
    });
  });

  describe("adicional Rendimentos e portal", () => {
    it("liga e desliga o Rendimentos numa assinatura paga, com o resultado já na resposta", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_addon");
      expect((await u.get("/v1/billing")).body.hasInvestmentsAddon).toBe(false);

      const on = await u.post("/v1/billing/addon", { enabled: true });
      expect(on.status).toBe(200);
      expect(on.body).toMatchObject({ hasInvestmentsAddon: true });
      expect(on.body.access.features.investments).toBe(true);
      expect(stripe.calls.some((c) => c.path === "subscription_items" && c.form?.get("price") === "price_inv" && c.form?.get("subscription") === "sub_addon")).toBe(true);
      expect((await env.prisma.subscription.findUniqueOrThrow({ where: { userId: u.id } })).investmentsAddon).toBe(true);

      const again = await u.post("/v1/billing/addon", { enabled: true }); // repetir não duplica o item
      expect(again.status).toBe(200);
      expect(stripe.subscriptions.get("sub_addon")!.items!.data.filter((i) => i.price.id === "price_inv")).toHaveLength(1);

      const off = await u.post("/v1/billing/addon", { enabled: false });
      expect(off.body).toMatchObject({ hasInvestmentsAddon: false });
      expect(off.body.access.features.investments).toBe(false);
      expect(stripe.subscriptions.get("sub_addon")!.items!.data.some((i) => i.price.id === "price_inv")).toBe(false);

      const actions = (await env.prisma.auditLog.findMany({ where: { actorId: u.id, action: { startsWith: "billing.addon." } } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(["billing.addon.enabled", "billing.addon.disabled"]));
    });

    it("sem assinatura paga (teste grátis, cortesia), o adicional não se contrata por aqui", async () => {
      const trial = await member(env);
      const r1 = await trial.post("/v1/billing/addon", { enabled: true });
      expect(r1.status).toBe(409);
      expect(r1.body.error.code).toBe("NO_PAID_SUBSCRIPTION");

      const gift = await member(env);
      await env.makePaid(gift.id, { store: "MANUAL" });
      expect((await gift.post("/v1/billing/addon", { enabled: true })).body.error.code).toBe("NO_PAID_SUBSCRIPTION");
      expect((await trial.post("/v1/billing/addon", { enabled: "sim" })).status).toBe(422);
    });

    it("o portal abre só para quem tem assinatura no Stripe e volta para o site", async () => {
      const none = await member(env);
      const r0 = await none.post("/v1/billing/portal");
      expect(r0.status).toBe(409);
      expect(r0.body.error.code).toBe("NO_SUBSCRIPTION");

      const u = await member(env, { expired: true });
      await subscribe(u, "sub_portal", { customer: "cus_portal" });
      const res = await u.post("/v1/billing/portal");
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
      const form = stripe.calls.filter((c) => c.path === "billing_portal/sessions").at(-1)!.form!;
      expect(form.get("customer")).toBe("cus_portal");
      expect(form.get("return_url")).toBe(`${APP_WEB_URL}/subscription`);
    });
  });

  describe("exclusão de conta", () => {
    const erase = (u: TestUser) => u.delete("/v1/me", { body: { password: u.password, confirm: "EXCLUIR" } });

    it("apaga o cliente no Stripe (o que cancela a assinatura) antes de apagar a conta: ninguém continua sendo cobrado", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_exclui", { customer: "cus_exclui" });
      expect(stripe.subscriptions.get("sub_exclui")!.status).toBe("active");

      const res = await erase(u);
      expect(res.status).toBe(200);
      expect(stripe.deletedCustomers.has("cus_exclui")).toBe(true);
      expect(stripe.subscriptions.get("sub_exclui")!.status).toBe("canceled");
      expect(await env.prisma.user.count({ where: { id: u.id } })).toBe(0);
      expect(await env.prisma.subscription.count({ where: { userId: u.id } })).toBe(0);
    });

    it("se o Stripe falhar, a conta NÃO é apagada, fica bloqueada, e o job de retomada conclui depois (e cancela a cobrança)", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_retoma", { customer: "cus_retoma" });

      stripe.failNext = 1;
      const failed = await erase(u);
      expect(failed.status).toBe(502);
      expect(await env.prisma.user.count({ where: { id: u.id } })).toBe(1);
      expect(stripe.deletedCustomers.has("cus_retoma")).toBe(false);
      expect((await env.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("DELETING");

      const done = await finalizeDeletions(
        { prisma: env.prisma, authProvider: env.auth, pepper: "p".repeat(16), now: () => new Date(Date.now() + 3_600_000), beforeErase: beforeEraseOf(env.app) },
        0,
      );
      expect(done).toBeGreaterThanOrEqual(1);
      expect(stripe.deletedCustomers.has("cus_retoma")).toBe(true);
      expect(await env.prisma.user.count({ where: { id: u.id } })).toBe(0);
    });

    it("cliente que já não existe no Stripe conta como sucesso (retomada de uma exclusão pela metade)", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_ja_apagado", { customer: "cus_ja_apagado" });
      stripe.deletedCustomers.add("cus_ja_apagado");
      expect((await erase(u)).status).toBe(200);
      expect(await env.prisma.user.count({ where: { id: u.id } })).toBe(0);
    });

    it("quem nunca pagou (teste grátis) não aciona o Stripe", async () => {
      const u = await member(env);
      const before = stripe.calls.filter((c) => c.path.startsWith("customers/")).length;
      expect((await erase(u)).status).toBe(200);
      expect(stripe.calls.filter((c) => c.path.startsWith("customers/")).length).toBe(before);
    });

    it("a exportação dos dados inclui a situação da assinatura, sem os identificadores internos do Stripe", async () => {
      const u = await member(env, { expired: true });
      await subscribe(u, "sub_exporta", { customer: "cus_exporta", addon: true });
      const doc = (await u.get("/v1/privacy/export")).body;
      expect(doc.data.subscription).toMatchObject({ plan: "PREMIUM", status: "ACTIVE", store: "WEB", investmentsAddon: true, cancelAtPeriodEnd: false });
      expect(JSON.stringify(doc)).not.toMatch(/cus_exporta|sub_exporta|providerCustomerId|externalId/);
    });
  });

  describe("cortesia concedida pelo administrador", () => {
    it("só administrador concede ou retira; usuário comum e anônimo são barrados", async () => {
      const target = await member(env, { expired: true });
      const common = await member(env);
      expect((await common.post(`/v1/admin/users/${target.id}/access`, { days: 30 })).status).toBe(403);
      expect((await common.delete(`/v1/admin/users/${target.id}/access`)).status).toBe(403);
      expect((await env.anon.post(`/v1/admin/users/${target.id}/access`, { days: 30 })).status).toBe(401);
      expect((await target.get("/v1/billing")).body.access.state).toBe("expired");
    });

    it("concede por N dias: libera as escritas, sem o Rendimentos por padrão, e audita quem concedeu", async () => {
      const admin = await makeAdmin(env);
      const target = await member(env, { expired: true });
      expect((await tryWrite(target)).status).toBe(402);

      const res = await admin.post(`/v1/admin/users/${target.id}/access`, { days: 30 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: target.id, plan: "PREMIUM", access: { state: "complimentary", investments: false } });
      expect(new Date(res.body.access.expiresAt).getTime()).toBe(env.now().getTime() + 30 * DAY);

      expect((await tryWrite(target)).status).toBe(201);
      const mine = (await target.get("/v1/billing")).body;
      expect(mine.access).toMatchObject({ state: "complimentary", allowed: true, daysLeft: 30, features: { investments: false } });
      expect(mine.canManage).toBe(false); // cortesia não tem cartão para gerenciar
      expect((await target.get("/v1/me")).body.entitlements.access.state).toBe("complimentary");

      const audit = await env.prisma.auditLog.findFirstOrThrow({ where: { actorId: admin.id, action: "admin.access.granted", entityId: target.id } });
      expect(audit.metadata).toMatchObject({ days: 30, investments: false });
    });

    it("concede sem prazo e com o Rendimentos", async () => {
      const admin = await makeAdmin(env);
      const target = await member(env, { expired: true });
      const res = await admin.post(`/v1/admin/users/${target.id}/access`, { days: null, investments: true });
      expect(res.body.access).toEqual({ state: "complimentary", expiresAt: null, investments: true });
      const mine = (await target.get("/v1/billing")).body.access;
      expect(mine).toMatchObject({ state: "complimentary", expiresAt: null, daysLeft: null, features: { investments: true } });
    });

    it("recusa quem já tem assinatura paga ativa (não apaga o vínculo com o Stripe) mas aceita quem já cancelou, mantendo o cliente", async () => {
      const admin = await makeAdmin(env);
      const payer = await member(env, { expired: true });
      await subscribe(payer, "sub_cortesia", { customer: "cus_cortesia" });
      const blocked = await admin.post(`/v1/admin/users/${payer.id}/access`, { days: 30 });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("ALREADY_PAID");
      expect((await env.prisma.subscription.findUniqueOrThrow({ where: { userId: payer.id } })).externalId).toBe("sub_cortesia");

      // Cancelou e o período acabou: pode receber cortesia, e o cliente do Stripe é preservado.
      const sub = stripe.subscriptions.get("sub_cortesia")!;
      sub.status = "canceled";
      sub.current_period_end = Math.floor((env.now().getTime() - DAY) / 1000);
      await hook.deliver("customer.subscription.deleted", { id: "sub_cortesia", metadata: { user_id: payer.id } });
      expect((await admin.post(`/v1/admin/users/${payer.id}/access`, { days: 10 })).status).toBe(200);
      expect(await env.prisma.subscription.findUniqueOrThrow({ where: { userId: payer.id } })).toMatchObject({ store: "MANUAL", providerCustomerId: "cus_cortesia", externalId: null });
    });

    it("valida o pedido e o alvo", async () => {
      const admin = await makeAdmin(env);
      const target = await member(env, { expired: true });
      for (const bad of [{ days: 0 }, { days: 4000 }, { days: "30" }, { days: 1.5 }, { days: 30, extra: true }, {}]) {
        expect((await admin.post(`/v1/admin/users/${target.id}/access`, bad)).status, JSON.stringify(bad)).toBe(422);
      }
      expect((await admin.post(`/v1/admin/users/${randomUUID()}/access`, { days: 30 })).status).toBe(404);
      expect((await admin.post("/v1/admin/users/nao-e-uuid/access", { days: 30 })).status).toBe(422);
      expect((await target.get("/v1/billing")).body.access.state).toBe("expired");
    });

    it("retira a cortesia (volta ao somente leitura, auditado); só vale para cortesias", async () => {
      const admin = await makeAdmin(env);
      const target = await member(env, { expired: true });
      await admin.post(`/v1/admin/users/${target.id}/access`, { days: null, investments: true });
      expect((await tryWrite(target)).status).toBe(201);

      const res = await admin.delete(`/v1/admin/users/${target.id}/access`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: target.id, plan: "FREE", access: { state: "expired", investments: false } });
      expect((await tryWrite(target)).body.error.code).toBe("SUBSCRIPTION_REQUIRED");
      expect(await env.prisma.auditLog.count({ where: { actorId: admin.id, action: "admin.access.revoked", entityId: target.id } })).toBe(1);

      const again = await admin.delete(`/v1/admin/users/${target.id}/access`);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("NOT_COMPLIMENTARY");

      const plain = await member(env);
      expect((await admin.delete(`/v1/admin/users/${plain.id}/access`)).body.error.code).toBe("NOT_COMPLIMENTARY");

      const payer = await member(env, { expired: true });
      await subscribe(payer, "sub_paga_nao_revoga");
      expect((await admin.delete(`/v1/admin/users/${payer.id}/access`)).body.error.code).toBe("NOT_COMPLIMENTARY");
      expect((await payer.get("/v1/billing")).body.access.state).toBe("paid");
    });

    it("o painel mostra o acesso de cada pessoa e os números de assinatura, sem expor nada do pagamento", async () => {
      const admin = await makeAdmin(env);
      const gift = await member(env, { expired: true });
      await admin.post(`/v1/admin/users/${gift.id}/access`, { days: null, investments: true });
      const payer = await member(env, { expired: true });
      await subscribe(payer, "sub_painel", { addon: true, customer: "cus_painel" });
      const lapsed = await member(env, { expired: true });

      const list = (await admin.get("/v1/admin/users", { query: { search: gift.email } })).body;
      expect(list.data[0].access).toMatchObject({ state: "complimentary", investments: true });
      expect((await admin.get(`/v1/admin/users/${lapsed.id}`)).body.access.state).toBe("expired");

      const stats = (await admin.get("/v1/admin/stats")).body.billing;
      expect(stats.enforced).toBe(true);
      expect(stats.complimentary).toBeGreaterThanOrEqual(1);
      expect(stats.paid).toBeGreaterThanOrEqual(1);
      expect(stats.expired).toBeGreaterThanOrEqual(1);
      expect(stats.admin).toBeGreaterThanOrEqual(1);
      expect(stats.investmentsAddon).toBeGreaterThanOrEqual(2); // a cortesia com Rendimentos + o pagante com adicional
      // Receita estimada: cada pagante vale o preço do básico do SEU ciclo (mensal R$ 10,00; anual ÷ 12) + o adicional pago. Cortesia não paga.
      // (O cálculo exato por ciclo é o do teste "a receita mensal estimada do painel conta o anual dividido por 12".)
      expect(stats.currency).toBe("BRL");
      expect(stats.monthlyRevenueCents).toBeGreaterThanOrEqual(1500);

      const everything = JSON.stringify([list, (await admin.get(`/v1/admin/users/${payer.id}`)).body, stats]);
      expect(everything).not.toMatch(/cus_|sub_painel|providerCustomerId|externalId|stripe/i);
    });
  });
});

// =========================================================================================================== pagamento avulso

describe("pagamento avulso (uma vez, sem renovar, aceita Pix)", () => {
  let env: TestEnv;
  let stripe: FakeStripe;
  let hook: ReturnType<typeof webhooks>;
  beforeAll(async () => {
    stripe = new FakeStripe();
    env = await envWith(stripeProvider(stripe));
    hook = webhooks(env);
  });
  afterAll(async () => {
    await env.close();
  });

  /** A pessoa abre o pagamento avulso e o servidor devolve o endereço do Stripe; devolve o id da sessão aberta. */
  async function open(u: TestUser, body: Record<string, unknown> = {}): Promise<string> {
    const res = await u.post("/v1/billing/checkout", { mode: "once", ...body });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    return stripe.lastSession().id;
  }
  /** O Stripe avisa que a sessão terminou (cartão: já paga; Pix: ainda aguardando). */
  const completed = (sessionId: string, userId: string, type = "checkout.session.completed") => hook.deliver(type, { id: sessionId, mode: "payment", client_reference_id: userId });

  it("pagar uma vez libera o período fechado (30 dias), sem vínculo de assinatura, e o estado mostra que NÃO renova", async () => {
    const u = await member(env, { expired: true });
    expect((await tryWrite(u)).status).toBe(402);
    const id = await open(u);
    stripe.pay(id);
    expect((await completed(id, u.id)).status).toBe(200);

    const state = (await u.get("/v1/billing")).body;
    expect(state).toMatchObject({ interval: "month", autoRenew: false, access: { state: "paid", allowed: true } });
    expect(state.access.daysLeft).toBe(30);
    expect(state.access.cancelAtPeriodEnd).toBe(true);
    expect((await tryWrite(u)).status).toBe(201);
    const row = await env.prisma.subscription.findUnique({ where: { userId: u.id } });
    expect(row).toMatchObject({ plan: "PREMIUM", status: "ACTIVE", externalId: null, billingInterval: "month" });
    expect(await env.prisma.auditLog.count({ where: { actorId: u.id, action: "billing.prepaid.granted" } })).toBe(1);
  });

  it("anual com Rendimentos: 365 dias e o adicional vem junto", async () => {
    const u = await member(env, { expired: true });
    const id = await open(u, { interval: "year", investments: true });
    stripe.pay(id);
    await completed(id, u.id);
    const state = (await u.get("/v1/billing")).body;
    expect(state).toMatchObject({ interval: "year", autoRenew: false, hasInvestmentsAddon: true });
    expect(state.access.daysLeft).toBe(365);
  });

  it("Pix: o primeiro aviso chega com o pagamento ainda pendente e NÃO libera; só o aviso de pagamento confirmado libera", async () => {
    const u = await member(env, { expired: true });
    const id = await open(u);
    expect((await completed(id, u.id)).status).toBe(200); // sessão concluída, Pix ainda não pago
    expect((await u.get("/v1/billing")).body.access.state).toBe("expired");
    expect((await tryWrite(u)).status).toBe(402);

    stripe.pay(id); // a pessoa pagou o Pix
    expect((await completed(id, u.id, "checkout.session.async_payment_succeeded")).status).toBe(200);
    expect((await u.get("/v1/billing")).body).toMatchObject({ autoRenew: false, access: { state: "paid" } });
  });

  it("cartão: os dois avisos (concluída e pagamento confirmado) concedem UMA vez só, e o reenvio do mesmo aviso é ignorado", async () => {
    const u = await member(env, { expired: true });
    const id = await open(u);
    stripe.pay(id);
    await completed(id, u.id);
    await completed(id, u.id, "checkout.session.async_payment_succeeded");
    const first = (await hook.deliver("checkout.session.completed", { id, mode: "payment", client_reference_id: u.id }, { id: "evt_repetido" })).status;
    const dup = await hook.deliver("checkout.session.completed", { id, mode: "payment", client_reference_id: u.id }, { id: "evt_repetido" });
    expect(first).toBe(200);
    expect(dup.status).toBe(200);
    expect((await u.get("/v1/billing")).body.access.daysLeft).toBe(30); // não somou 60/90
    expect(await env.prisma.auditLog.count({ where: { actorId: u.id, action: "billing.prepaid.granted" } })).toBe(1);
  });

  it("nunca confia no corpo do aviso: sessão não paga no Stripe não libera, ainda que o aviso diga o contrário", async () => {
    const u = await member(env, { expired: true });
    const id = await open(u);
    await hook.deliver("checkout.session.completed", { id, mode: "payment", payment_status: "paid", client_reference_id: u.id });
    expect((await u.get("/v1/billing")).body.access.state).toBe("expired");
  });

  it("sessão que não é pagamento avulso nosso (sem a marca) não libera nada", async () => {
    const u = await member(env, { expired: true });
    stripe.sessions.set("cs_de_outro_sistema", { id: "cs_de_outro_sistema", form: new URLSearchParams({ mode: "payment", client_reference_id: u.id }), paid: true });
    expect((await completed("cs_de_outro_sistema", u.id)).status).toBe(200);
    expect((await u.get("/v1/billing")).body.access.state).toBe("expired");
  });

  it("falha ao consultar o Stripe devolve erro (o Stripe reenvia) e não deixa a sessão marcada como concedida", async () => {
    const u = await member(env, { expired: true });
    const id = await open(u);
    stripe.pay(id);
    stripe.failNext = 1;
    expect((await completed(id, u.id)).status).toBeGreaterThanOrEqual(500);
    expect((await u.get("/v1/billing")).body.access.state).toBe("expired");
    // o Stripe reenvia o mesmo evento: agora o provedor responde e o período é concedido
    expect((await completed(id, u.id)).status).toBe(200);
    expect((await u.get("/v1/billing")).body.access.state).toBe("paid");
  });

  it("pagar de novo antes de acabar ESTENDE a partir do fim atual (não perde dias) e dá para trocar para o anual", async () => {
    const u = await member(env, { expired: true });
    const a = await open(u);
    stripe.pay(a);
    await completed(a, u.id);
    expect((await u.get("/v1/billing")).body.access.daysLeft).toBe(30);

    const b = await open(u); // permitido: quem pagou uma vez pode renovar
    stripe.pay(b);
    await completed(b, u.id);
    expect((await u.get("/v1/billing")).body.access.daysLeft).toBe(60);
  });

  it("quem tem assinatura que renova sozinha não abre pagamento avulso (nem paga em dobro)", async () => {
    const u = await member(env, { expired: true });
    stripe.setActive("sub_renova", { userId: u.id, customer: "cus_renova", periodEnd: new Date(env.now().getTime() + 30 * DAY) });
    await hook.deliver("checkout.session.completed", { subscription: "sub_renova", client_reference_id: u.id });
    expect((await u.get("/v1/billing")).body).toMatchObject({ autoRenew: true, access: { state: "paid" } });
    const res = await u.post("/v1/billing/checkout", { mode: "once" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_ACTIVE");
  });

  it("quem pagou uma vez só pode renovar pagando de novo avulso (assinar com renovação continua exigindo o gerenciamento)", async () => {
    const u = await member(env, { expired: true });
    const id = await open(u);
    stripe.pay(id);
    await completed(id, u.id);
    expect((await u.post("/v1/billing/checkout", { mode: "recurring" })).body.error.code).toBe("ALREADY_ACTIVE");
    // sem vínculo de assinatura não há adicional para ligar depois
    const addon = await u.post("/v1/billing/addon", { enabled: true });
    expect(addon.status).toBe(409);
    expect(addon.body.error.code).toBe("PREPAID_NO_ADDON");
  });

  it("o pagamento avulso respeita o catálogo: ciclo ou adicional sem preço não abre pagamento", async () => {
    const mensal = new FakeStripe();
    const e = await envWith(stripeProvider(mensal, "month"));
    try {
      const u = await member(e, { expired: true });
      const res = await u.post("/v1/billing/checkout", { mode: "once", interval: "year", investments: true });
      expect(res.status).toBe(422);
      expect(mensal.sessions.size).toBe(0);
      expect((await u.post("/v1/billing/checkout", { mode: "once", interval: "month", investments: true })).status).toBe(200);
    } finally {
      await e.close();
    }
  });

  it("o corpo do pedido é validado (modo desconhecido é recusado) e exige login", async () => {
    const u = await member(env, { expired: true });
    expect((await u.post("/v1/billing/checkout", { mode: "boleto" })).status).toBe(422);
    expect((await env.anon.post("/v1/billing/checkout", { mode: "once" })).status).toBe(401);
  });

  it("quando o prazo acaba, o acesso volta a somente leitura (não renova sozinho)", async () => {
    const u = await member(env, { expired: true });
    const id = await open(u);
    stripe.pay(id);
    await completed(id, u.id);
    expect((await tryWrite(u)).status).toBe(201);
    await env.prisma.subscription.update({ where: { userId: u.id }, data: { currentPeriodEnd: new Date(env.now().getTime() - 1000) } });
    env.app.users.invalidate(u.id);
    expect((await u.get("/v1/billing")).body.access.state).toBe("expired");
    expect((await tryWrite(u)).status).toBe(402);
    // e pode pagar de novo
    const again = await open(u);
    stripe.pay(again);
    await completed(again, u.id);
    expect((await u.get("/v1/billing")).body.access.state).toBe("paid");
  });

  it("a receita mensal estimada do painel não conta quem pagou uma vez (não é recorrente)", async () => {
    const admin = await makeAdmin(env);
    const before = (await admin.get("/v1/admin/stats")).body.billing.monthlyRevenueCents as number;
    const u = await member(env, { expired: true });
    const id = await open(u, { investments: true });
    stripe.pay(id);
    await completed(id, u.id);
    const after = (await admin.get("/v1/admin/stats")).body.billing;
    expect(after.monthlyRevenueCents).toBe(before);
    expect(after.paid).toBeGreaterThanOrEqual(1);
  });
});

// =========================================================================================================== desenvolvimento

describe("provedor de desenvolvimento (assina na hora, sem pagar)", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await envWith(new DevBillingProvider());
  });
  afterAll(async () => {
    await env.close();
  });

  it("do teste vencido (somente leitura) para assinante: ativa na hora, com adicional opcional, sem portal nem webhook", async () => {
    const u = await member(env, { expired: true });
    expect((await tryWrite(u)).status).toBe(402);
    const before = (await u.get("/v1/billing")).body;
    expect(before).toMatchObject({ provider: "dev", checkoutAvailable: true, canManage: false });
    expect(before.access.state).toBe("expired");

    const res = await u.post("/v1/billing/checkout", {});
    expect(res.body).toEqual({ url: null, activated: true });
    const after = (await u.get("/v1/billing")).body;
    expect(after.access).toMatchObject({ state: "paid", allowed: true, features: { investments: false } });
    expect(after.access.daysLeft).toBe(30);
    expect(after.canManage).toBe(false);
    expect((await tryWrite(u)).status).toBe(201);

    const addon = await u.post("/v1/billing/addon", { enabled: true });
    expect(addon.body.access.features.investments).toBe(true);
    expect(addon.body.hasInvestmentsAddon).toBe(true);
    expect((await u.post("/v1/billing/addon", { enabled: false })).body.hasInvestmentsAddon).toBe(false);

    const portal = await u.post("/v1/billing/portal");
    expect(portal.body.error.code).toBe("NO_SUBSCRIPTION");
    expect((await u.post("/v1/billing/checkout", {})).body.error.code).toBe("ALREADY_ACTIVE");

    const hook = await webhooks(env).deliver("customer.created", {});
    expect(hook.status).toBe(401);
  });

  it("assinar já com o Rendimentos", async () => {
    const u = await member(env, { expired: true });
    expect((await u.post("/v1/billing/checkout", { investments: true })).body.activated).toBe(true);
    expect((await u.get("/v1/billing")).body).toMatchObject({ hasInvestmentsAddon: true });
  });

  it("escolher o plano anual: ativa por um ano e guarda o ciclo (o mensal continua sendo o padrão)", async () => {
    const yearly = await member(env, { expired: true });
    expect((await yearly.post("/v1/billing/checkout", { interval: "year" })).body.activated).toBe(true);
    const state = (await yearly.get("/v1/billing")).body;
    expect(state).toMatchObject({ interval: "year", access: { state: "paid" } });
    expect(state.access.daysLeft).toBe(365);

    const monthly = await member(env, { expired: true });
    await monthly.post("/v1/billing/checkout", {});
    expect((await monthly.get("/v1/billing")).body).toMatchObject({ interval: "month" });
  });

  it("pagar uma vez (sem renovar): ativa pelo período fechado, sem vínculo, e dá para pagar de novo para estender", async () => {
    const u = await member(env, { expired: true });
    expect((await u.post("/v1/billing/checkout", { mode: "once" })).body).toEqual({ url: null, activated: true });
    const state = (await u.get("/v1/billing")).body;
    expect(state).toMatchObject({ interval: "month", autoRenew: false, access: { state: "paid" } });
    expect(state.access.daysLeft).toBe(30);
    expect((await u.post("/v1/billing/checkout", { mode: "once", interval: "year" })).body.activated).toBe(true);
    expect((await u.get("/v1/billing")).body.access.daysLeft).toBe(395); // 30 + 365
    expect((await u.post("/v1/billing/checkout", { mode: "recurring" })).body.error.code).toBe("ALREADY_ACTIVE");

    const recurring = await member(env, { expired: true });
    await recurring.post("/v1/billing/checkout", {});
    expect((await recurring.get("/v1/billing")).body).toMatchObject({ autoRenew: true });
    expect((await recurring.post("/v1/billing/checkout", { mode: "once" })).body.error.code).toBe("ALREADY_ACTIVE");
  });

  it("mostra os dois ciclos, para o plano e para o adicional", async () => {
    const u = await member(env, { expired: true });
    const { prices } = (await u.get("/v1/billing")).body;
    expect(prices.basic.month.interval).toBe("month");
    expect(prices.basic.year.interval).toBe("year");
    expect(prices.investments.month.interval).toBe("month");
    expect(prices.investments.year.interval).toBe("year");
    // o anual sai mais barato que 12 mensais (é isso que o app anuncia como economia)
    expect(prices.basic.year.amountCents).toBeLessThan(prices.basic.month.amountCents * 12);
  });
});

// =========================================================================================================== sem provedor / beta / sem adicional

describe("sem provedor de pagamento", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await envWith(null);
  });
  afterAll(async () => {
    await env.close();
  });

  it("o estado diz que não dá para assinar; tentar assinar ou receber webhook responde 503 claro", async () => {
    const u = await member(env, { expired: true });
    const state = (await u.get("/v1/billing")).body;
    expect(state).toMatchObject({ provider: "none", checkoutAvailable: false, investmentsAvailable: false, interval: null, prices: { basic: { month: null, year: null }, investments: { month: null, year: null } } });
    const checkout = await u.post("/v1/billing/checkout", {});
    expect(checkout.status).toBe(503);
    expect(checkout.body.error.code).toBe("BILLING_UNAVAILABLE");
    expect((await u.post("/v1/billing/portal")).status).toBe(503);
    expect((await webhooks(env).deliver("customer.created", {})).status).toBe(503);
    // O modo somente leitura continua valendo: consulta liberada, escrita não.
    expect((await tryWrite(u)).status).toBe(402);
    expect((await u.get("/v1/categories")).status).toBe(200);
  });
});

describe("cobrança desligada (beta)", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ APP_WEB_URL }, { billingProvider: stripeProvider(new FakeStripe()) });
  });
  afterAll(async () => {
    await env.close();
  });

  it("ninguém precisa assinar: o estado é 'beta' e abrir um pagamento é recusado", async () => {
    const u = await member(env, { expired: true });
    const state = (await u.get("/v1/billing")).body;
    expect(state.enforced).toBe(false);
    expect(state.access).toMatchObject({ state: "beta", allowed: true, expiresAt: null, daysLeft: null, features: { investments: true } });
    const res = await u.post("/v1/billing/checkout", {});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("BILLING_NOT_ENFORCED");
    expect((await tryWrite(u)).status).toBe(201);
  });
});

describe("Stripe sem preço do adicional", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await envWith(stripeProvider(new FakeStripe(), false));
  });
  afterAll(async () => {
    await env.close();
  });

  it("o Rendimentos não pode ser contratado (nem no pagamento nem depois), e a tela é avisada", async () => {
    const u = await member(env, { expired: true });
    expect((await u.get("/v1/billing")).body).toMatchObject({ investmentsAvailable: false, prices: { investments: { month: null, year: null } } });
    const checkout = await u.post("/v1/billing/checkout", { investments: true });
    expect(checkout.status).toBe(422);
    expect(checkout.body.error.code).toBe("ADDON_UNAVAILABLE");
    expect((await u.post("/v1/billing/checkout", {})).status).toBe(200); // o plano básico continua contratável
  });
});

describe("Stripe com o adicional só no ciclo mensal", () => {
  let env: TestEnv;
  let stripe: FakeStripe;
  beforeAll(async () => {
    stripe = new FakeStripe();
    env = await envWith(stripeProvider(stripe, "month"));
  });
  afterAll(async () => {
    await env.close();
  });

  it("o adicional é oferecido no mensal e recusado no anual (o Stripe exige o mesmo ciclo em todos os itens)", async () => {
    const u = await member(env, { expired: true });
    const state = (await u.get("/v1/billing")).body;
    expect(state.investmentsAvailable).toBe(true);
    expect(state.prices.investments).toEqual({ month: { amountCents: 500, currency: "BRL", interval: "month" }, year: null });
    expect(state.prices.basic.year).not.toBeNull();

    const yearlyWithAddon = await u.post("/v1/billing/checkout", { interval: "year", investments: true });
    expect(yearlyWithAddon.status).toBe(422);
    expect(yearlyWithAddon.body.error.code).toBe("ADDON_UNAVAILABLE");
    expect((await u.post("/v1/billing/checkout", { interval: "year" })).status).toBe(200); // o plano anual sozinho continua
    expect((await u.post("/v1/billing/checkout", { interval: "month", investments: true })).status).toBe(200);
  });

  it("quem assina o plano anual não consegue incluir o adicional depois (e nada é cobrado por engano)", async () => {
    const u = await member(env, { expired: true });
    stripe.setActive("sub_anual_sem_addon", { userId: u.id, customer: "cus_anual", periodEnd: new Date(env.now().getTime() + 300 * DAY), interval: "year" });
    expect((await webhooks(env).deliver("checkout.session.completed", { subscription: "sub_anual_sem_addon", client_reference_id: u.id })).status).toBe(200);
    const res = await u.post("/v1/billing/addon", { enabled: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ADDON_UNAVAILABLE");
    expect(stripe.calls.some((c) => c.path === "subscription_items")).toBe(false);
  });
});

describe("Stripe vendendo só o plano mensal", () => {
  it("o anual vem sem preço e abrir um pagamento anual é recusado, sem tocar no Stripe", async () => {
    const stripe = new FakeStripe();
    const provider = new StripeProvider(
      { secretKey: "sk_test_integration", webhookSecret: WHSEC, apiBase: "https://api.stripe.test", basic: [{ kind: "product", id: "prod_basic", interval: "month" }], investments: [] },
      stripe.fetch,
    );
    const env = await envWith(provider);
    try {
      const u = await member(env, { expired: true });
      const state = (await u.get("/v1/billing")).body;
      expect(state.prices.basic.year).toBeNull();
      expect(state.prices.basic.month).not.toBeNull();
      const res = await u.post("/v1/billing/checkout", { interval: "year" });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("INTERVAL_UNAVAILABLE");
      expect(stripe.calls.filter((c) => c.path === "checkout/sessions")).toHaveLength(0);
      expect((await u.post("/v1/billing/checkout", { interval: "month" })).status).toBe(200);
    } finally {
      await env.close();
    }
  });
});
