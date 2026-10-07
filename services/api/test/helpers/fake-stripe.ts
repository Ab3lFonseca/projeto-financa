import { createHmac } from "node:crypto";

export type FakeCall = { method: string; path: string; form: URLSearchParams | null; authorization: string | null };

export type FakeItemPrice = { id: string; product?: string; recurring?: { interval: string; interval_count: number } };

export type FakeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data: { id: string; price: FakeItemPrice; current_period_end?: number }[] };
};

export type FakePrice = {
  unit_amount: number;
  currency: string;
  active?: boolean;
  product?: string;
  recurring: { interval: string; interval_count: number } | null;
};

export type FakeProduct = { active?: boolean; default_price?: string | null };

const monthly = (amount: number, product: string): FakePrice => ({ unit_amount: amount, currency: "brl", product, recurring: { interval: "month", interval_count: 1 } });
const yearly = (amount: number, product: string): FakePrice => ({ unit_amount: amount, currency: "brl", product, recurring: { interval: "year", interval_count: 1 } });

/**
 * Stripe de mentira, só com o que a API chama: produtos, preços, sessões de pagamento e de portal, assinaturas e itens de assinatura.
 * Registra cada chamada (para conferir o que o servidor enviou) e permite simular falhas.
 *
 * Catálogo de partida: plano mensal (`price_basic`, produto `prod_basic`) e anual (`price_basic_year`, `prod_basic_year`), e o adicional
 * Rendimentos nos dois ciclos (`price_inv`/`prod_inv` e `price_inv_year`/`prod_inv_year`).
 */
export class FakeStripe {
  readonly calls: FakeCall[] = [];
  readonly subscriptions = new Map<string, FakeSubscription>();
  /** Clientes apagados (exclusão de conta). */
  readonly deletedCustomers = new Set<string>();
  /** Preços por id (centavos, moeda, ciclo, produto). */
  readonly prices = new Map<string, FakePrice>([
    ["price_basic", monthly(1000, "prod_basic")],
    ["price_basic_year", yearly(10000, "prod_basic_year")],
    ["price_inv", monthly(500, "prod_inv")],
    ["price_inv_year", yearly(5000, "prod_inv_year")],
  ]);
  /** Produtos por id, com o preço padrão (`default_price`). Sem preço padrão, o servidor procura o único preço recorrente ativo do produto. */
  readonly products = new Map<string, FakeProduct>([
    ["prod_basic", { default_price: "price_basic" }],
    ["prod_basic_year", { default_price: "price_basic_year" }],
    ["prod_inv", { default_price: "price_inv" }],
    ["prod_inv_year", { default_price: "price_inv_year" }],
  ]);
  /** Sessões de pagamento abertas (o que o servidor enviou) e se a pessoa já pagou. */
  readonly sessions = new Map<string, { id: string; form: URLSearchParams; paid: boolean }>();
  /** A pessoa pagou a sessão (cartão na hora; Pix quando o dinheiro cai). */
  pay(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`sessão ${sessionId} não existe`);
    s.paid = true;
  }
  /** Última sessão aberta. */
  lastSession(): { id: string; form: URLSearchParams; paid: boolean } {
    return [...this.sessions.values()].at(-1)!;
  }
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
    const missing = () => reply({ error: { type: "invalid_request_error", code: "resource_missing" } }, 404);
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
      return price ? reply({ id: m[1], active: true, ...price }) : missing();
    }
    if (method === "GET" && (m = path.match(/^products\/([\w-]+)$/))) {
      const product = this.products.get(m[1]!);
      return product ? reply({ id: m[1], active: true, default_price: null, ...product }) : missing();
    }
    if (method === "GET" && path.startsWith("prices?")) {
      const wanted = url.searchParams.get("product");
      const data = [...this.prices.entries()]
        .filter(([, p]) => p.product === wanted && p.active !== false && p.recurring !== null)
        .map(([id, p]) => ({ id, active: true, ...p }));
      return reply({ object: "list", data });
    }
    if (method === "POST" && path === "checkout/sessions") {
      this.seq++;
      const id = `cs_test_${this.seq}`;
      this.sessions.set(id, { id, form: new URLSearchParams(bodyText ?? ""), paid: false });
      return reply({ id, url: `https://checkout.stripe.com/c/pay/${id}` });
    }
    if (method === "GET" && (m = path.match(/^checkout\/sessions\/([\w-]+)$/))) {
      const s = this.sessions.get(m[1]!);
      if (!s) return missing();
      const metadata: Record<string, string> = {};
      for (const [k, v] of s.form) {
        const meta = k.match(/^metadata\[(\w+)\]$/);
        if (meta) metadata[meta[1]!] = v;
      }
      return reply({ id: s.id, mode: s.form.get("mode"), payment_status: s.paid ? "paid" : "unpaid", client_reference_id: s.form.get("client_reference_id"), customer: s.form.get("customer"), metadata });
    }
    if (method === "POST" && path === "billing_portal/sessions") return reply({ url: "https://billing.stripe.com/p/session/test_portal" });
    if (method === "GET" && (m = path.match(/^subscriptions\/([\w-]+)$/))) {
      const sub = this.subscriptions.get(m[1]!);
      return sub ? reply(sub) : missing();
    }
    if (method === "DELETE" && (m = path.match(/^customers\/([\w-]+)$/))) {
      const id = m[1]!;
      if (this.deletedCustomers.has(id)) return missing();
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
      const priceId = form.get("price") ?? "";
      if (sub?.items) sub.items.data.push({ id: `si_added_${++this.seq}`, price: this.itemPrice(priceId) });
      return reply({ id: `si_added_${this.seq}` });
    }
    if (method === "DELETE" && (m = path.match(/^subscription_items\/([\w-]+)/))) {
      for (const sub of this.subscriptions.values()) if (sub.items) sub.items.data = sub.items.data.filter((i) => i.id !== m![1]);
      return reply({ id: m[1], deleted: true });
    }
    return reply({ error: { type: "invalid_request_error", code: "unexpected_request", message: `${method} ${path}` } }, 404);
  };

  /** O `price` de um item de assinatura como o Stripe o devolve (id, produto e ciclo). */
  private itemPrice(id: string): FakeItemPrice {
    const p = this.prices.get(id);
    return { id, ...(p?.product ? { product: p.product } : {}), ...(p?.recurring ? { recurring: p.recurring } : {}) };
  }

  /**
   * Atalho: cria uma assinatura ativa do plano básico (e, opcionalmente, do adicional) ligada a um usuário. `interval` escolhe o ciclo
   * ("month" é o padrão): o adicional é sempre o do mesmo ciclo, como o Stripe exige.
   */
  setActive(
    id: string,
    o: { userId?: string; customer?: string; periodEnd: Date; status?: string; cancelAtPeriodEnd?: boolean; addon?: boolean; periodEndOnItems?: boolean; interval?: "month" | "year" },
  ): FakeSubscription {
    const seconds = Math.floor(o.periodEnd.getTime() / 1000);
    const year = o.interval === "year";
    const extra = o.periodEndOnItems ? { current_period_end: seconds } : {};
    const items = [{ id: "si_basic", price: this.itemPrice(year ? "price_basic_year" : "price_basic"), ...extra }];
    if (o.addon) items.push({ id: "si_inv", price: this.itemPrice(year ? "price_inv_year" : "price_inv"), ...extra });
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
