import { createHmac } from "node:crypto";

export type FakeCall = { method: string; path: string; form: URLSearchParams | null; authorization: string | null };

export type FakeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data: { id: string; price: { id: string }; current_period_end?: number }[] };
};

/**
 * Stripe de mentira, só com o que a API chama: preços, sessões de pagamento e de portal, assinaturas e itens de assinatura.
 * Registra cada chamada (para conferir o que o servidor enviou) e permite simular falhas.
 */
export class FakeStripe {
  readonly calls: FakeCall[] = [];
  readonly subscriptions = new Map<string, FakeSubscription>();
  /** Clientes apagados (exclusão de conta). */
  readonly deletedCustomers = new Set<string>();
  /** Preços por id (centavos, moeda, intervalo). */
  readonly prices = new Map<string, { unit_amount: number; currency: string; recurring: { interval: string; interval_count: number } }>([
    ["price_basic", { unit_amount: 1000, currency: "brl", recurring: { interval: "month", interval_count: 1 } }],
    ["price_inv", { unit_amount: 500, currency: "brl", recurring: { interval: "month", interval_count: 1 } }],
  ]);
  /** Quantas das próximas chamadas devem falhar com HTTP 500. */
  failNext = 0;
  /** Resposta de erro do provedor para a próxima chamada (ex.: cartão recusado). */
  errorNext: { status: number; code: string; message: string } | null = null;
  private seq = 0;

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/v1\//, "") + url.search;
    const bodyText = typeof init?.body === "string" ? init.body : null;
    const headers = new Headers(init?.headers as ConstructorParameters<typeof Headers>[0]);
    this.calls.push({ method, path, form: bodyText ? new URLSearchParams(bodyText) : null, authorization: headers.get("authorization") });

    const reply = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
    if (this.failNext > 0) {
      this.failNext--;
      return reply({ error: { type: "api_error", message: "falha interna do provedor" } }, 500);
    }
    if (this.errorNext) {
      const e = this.errorNext;
      this.errorNext = null;
      return reply({ error: { type: "card_error", code: e.code, message: e.message } }, e.status);
    }

    let m: RegExpMatchArray | null;
    if (method === "GET" && (m = path.match(/^prices\/([\w-]+)$/))) {
      const price = this.prices.get(m[1]!);
      return price ? reply(price) : reply({ error: { type: "invalid_request_error", code: "resource_missing" } }, 404);
    }
    if (method === "POST" && path === "checkout/sessions") {
      this.seq++;
      return reply({ id: `cs_test_${this.seq}`, url: `https://checkout.stripe.com/c/pay/cs_test_${this.seq}` });
    }
    if (method === "POST" && path === "billing_portal/sessions") return reply({ url: "https://billing.stripe.com/p/session/test_portal" });
    if (method === "GET" && (m = path.match(/^subscriptions\/([\w-]+)$/))) {
      const sub = this.subscriptions.get(m[1]!);
      return sub ? reply(sub) : reply({ error: { type: "invalid_request_error", code: "resource_missing" } }, 404);
    }
    if (method === "DELETE" && (m = path.match(/^customers\/([\w-]+)$/))) {
      const id = m[1]!;
      if (this.deletedCustomers.has(id)) return reply({ error: { type: "invalid_request_error", code: "resource_missing" } }, 404);
      this.deletedCustomers.add(id);
      // Apagar o cliente cancela na hora as assinaturas dele.
      for (const sub of this.subscriptions.values()) {
        const owner = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        if (owner === id) sub.status = "canceled";
      }
      return reply({ id, deleted: true });
    }
    if (method === "POST" && path === "subscription_items") {
      const form = new URLSearchParams(bodyText ?? "");
      const sub = this.subscriptions.get(form.get("subscription") ?? "");
      if (sub?.items) sub.items.data.push({ id: `si_added_${++this.seq}`, price: { id: form.get("price") ?? "" } });
      return reply({ id: `si_added_${this.seq}` });
    }
    if (method === "DELETE" && (m = path.match(/^subscription_items\/([\w-]+)/))) {
      for (const sub of this.subscriptions.values()) if (sub.items) sub.items.data = sub.items.data.filter((i) => i.id !== m![1]);
      return reply({ id: m[1], deleted: true });
    }
    return reply({ error: { type: "invalid_request_error", code: "unexpected_request", message: `${method} ${path}` } }, 404);
  };

  /** Atalho: cria uma assinatura ativa do plano básico (e, opcionalmente, do adicional) ligada a um usuário. */
  setActive(id: string, o: { userId?: string; customer?: string; periodEnd: Date; status?: string; cancelAtPeriodEnd?: boolean; addon?: boolean; periodEndOnItems?: boolean }): FakeSubscription {
    const seconds = Math.floor(o.periodEnd.getTime() / 1000);
    const items = [{ id: "si_basic", price: { id: "price_basic" }, ...(o.periodEndOnItems ? { current_period_end: seconds } : {}) }];
    if (o.addon) items.push({ id: "si_inv", price: { id: "price_inv" }, ...(o.periodEndOnItems ? { current_period_end: seconds } : {}) });
    const sub: FakeSubscription = {
      id,
      customer: o.customer ?? "cus_test_1",
      status: o.status ?? "active",
      cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
      ...(o.periodEndOnItems ? {} : { current_period_end: seconds }),
      metadata: o.userId ? { user_id: o.userId } : {},
      items: { data: items },
    };
    this.subscriptions.set(id, sub);
    return sub;
  }
}

/** Cabeçalho `Stripe-Signature` válido para o corpo exato, no instante `nowMs` (o relógio de teste, não o real). */
export function signStripe(secret: string, body: string, nowMs: number, over: { timestamp?: number; extraV1?: string[] } = {}): string {
  const t = over.timestamp ?? Math.floor(nowMs / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},${(over.extraV1 ?? []).map((s) => `v1=${s},`).join("")}v1=${sig}`;
}

/** Evento de webhook (corpo JSON) no formato do Stripe. */
export function stripeEvent(id: string, type: string, object: Record<string, unknown>): string {
  return JSON.stringify({ id, object: "event", type, data: { object } });
}
