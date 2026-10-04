import { createHash, timingSafeEqual } from "node:crypto";
import {
  ProviderError,
  type ConnectToken,
  type OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnectionStatus,
  type ProviderConnector,
  type ProviderCredit,
  type ProviderInvestment,
  type ProviderItem,
  type ProviderTransaction,
} from "./provider";

/**
 * Adaptador do Pluggy (https://docs.pluggy.ai).
 *
 * Endpoints usados (conferidos na documentação oficial em 2026-10):
 *   POST   /auth                  { clientId, clientSecret } → { apiKey }  (válida por 2 h)
 *   POST   /connect_token         { options: { clientUserId, itemId?, oauthRedirectUri? ... } } → { accessToken } (30 min)
 *   GET    /connectors?isOpenFinance=true&countries=BR&types=PERSONAL_BANK&page=
                                  → { results[{ id, name, ... }], page, totalPages }
 *   GET    /items/{id}
 *   DELETE /items/{id}
 *   PATCH  /items/{id}            (pede nova coleta no banco; o aviso chega por webhook item/updated)
 *   GET    /accounts?itemId=               (inclui creditData dos cartões)
 *   GET    /investments?itemId=&page=      (CDB, caixinhas/cofrinhos, LCI/LCA, fundos...)
 *   GET    /v2/transactions?accountId=&dateFrom=&after=   (paginação por cursor; o GET /transactions
 *                                                          antigo sai do ar após 31/12/2026)
 * Webhooks: o Pluggy envia os cabeçalhos que cadastrarmos em POST /webhooks; conferimos um segredo.
 *
 * Convenção de sinal (docs "Transaction"): em conta, valor positivo = entrada; em cartão de crédito,
 * valor positivo = compra (aumenta a dívida) e negativo = pagamento/estorno.
 */

type FetchLike = typeof fetch;

export type PluggyOptions = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  /** Segredo esperado no cabeçalho do webhook. */
  webhookSecret?: string;
  fetch?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
};

export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

const API_KEY_TTL_MS = 100 * 60_000; // a chave vale 2 h; renovamos antes
const CONNECT_TOKEN_TTL_MS = 30 * 60_000;

type PluggyItemJson = {
  id: string;
  clientUserId?: string | null;
  status?: string;
  executionStatus?: string;
  lastUpdatedAt?: string | null;
  consentExpiresAt?: string | null;
  connector?: { name?: string; isOpenFinance?: boolean };
  error?: { code?: string } | null;
};

type PluggyCreditDataJson = {
  brand?: string | null;
  creditLimit?: number | null;
  availableCreditLimit?: number | null;
  balanceCloseDate?: string | null;
  balanceDueDate?: string | null;
  minimumPayment?: number | null;
};

type PluggyAccountJson = { id: string; type?: string; name?: string; balance?: number | null; creditData?: PluggyCreditDataJson | null };

type PluggyInvestmentJson = {
  id: string;
  name?: string;
  type?: string;
  subtype?: string | null;
  issuer?: string | null;
  status?: string | null;
  balance?: number | null;
  amount?: number | null;
  amountProfit?: number | null;
  amountOriginal?: number | null;
  amountWithdrawal?: number | null;
  rate?: number | null;
  rateType?: string | null;
  fixedAnnualRate?: number | null;
  annualRate?: number | null;
  issueDate?: string | null;
  dueDate?: string | null;
};

type PluggyTransactionJson = {
  id: string;
  accountId?: string;
  description?: string;
  descriptionRaw?: string | null;
  amount: number;
  date: string;
  status?: string;
};

/** Reais (decimal do JSON) → centavos inteiros. O EPSILON evita o erro clássico 1.005 * 100 = 100.49999. */
const toCents = (value: number) => Math.round((Math.abs(value) + Number.EPSILON) * 100);
const dateOnly = (iso: string) => iso.slice(0, 10);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Reais (podem ser negativos) → centavos inteiros com o sinal preservado; null se ausente. */
const signedCents = (v: unknown): number | null => (isNum(v) ? Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100) : null);
const optDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? dateOnly(v) : null);
const optNum = (v: unknown): number | null => (isNum(v) ? v : null);
const optText = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

function mapCredit(c: PluggyCreditDataJson | null | undefined): ProviderCredit | null {
  if (!c) return null;
  return {
    brand: optText(c.brand, 30),
    limitCents: signedCents(c.creditLimit),
    availableCents: signedCents(c.availableCreditLimit),
    closeDate: optDate(c.balanceCloseDate),
    dueDate: optDate(c.balanceDueDate),
    minimumPaymentCents: signedCents(c.minimumPayment),
  };
}

/** Investimento do Pluggy → formato interno. Descarta o que não tem id ou valor utilizável. */
export function mapInvestment(i: PluggyInvestmentJson): ProviderInvestment | null {
  const balance = signedCents(i.balance ?? i.amount);
  if (!i.id || balance === null) return null;
  const invested = signedCents(i.amountOriginal);
  const profit = signedCents(i.amountProfit) ?? (invested !== null ? balance - invested : null);
  const status = i.status === "PENDING" || i.status === "TOTAL_WITHDRAWAL" ? i.status : "ACTIVE";
  return {
    id: i.id,
    name: optText(i.name, 200) ?? "Investimento",
    type: optText(i.type, 30)?.toUpperCase() ?? "OTHER",
    subtype: optText(i.subtype, 40)?.toUpperCase() ?? null,
    issuer: optText(i.issuer, 200),
    status,
    balanceCents: Math.max(0, balance),
    investedCents: invested !== null ? Math.max(0, invested) : null,
    profitCents: profit,
    withdrawableCents: (() => {
      const w = signedCents(i.amountWithdrawal);
      return w !== null ? Math.max(0, w) : null;
    })(),
    rateType: optText(i.rateType, 20)?.toUpperCase() ?? null,
    rate: optNum(i.rate),
    fixedAnnualRate: optNum(i.fixedAnnualRate),
    annualRate: optNum(i.annualRate),
    issueDate: optDate(i.issueDate),
    dueDate: optDate(i.dueDate),
  };
}

/** Status do Pluggy → status interno. Desconhecido vira OUTDATED (pede nova sincronização, sem alarmar). */
export function mapItemStatus(status: string | undefined, executionStatus: string | undefined): ProviderConnectionStatus {
  switch (status) {
    case "UPDATED":
    case "PARTIAL_SUCCESS":
      return "ACTIVE";
    case "UPDATING":
    case "CREATING":
    case "WAITING_USER_INPUT":
    case "WAITING_USER_ACTION":
      return "CONNECTING";
    case "LOGIN_ERROR":
      return "ERROR";
    case "OUTDATED":
      return "OUTDATED";
    default:
      return executionStatus?.includes("ERROR") ? "ERROR" : "OUTDATED";
  }
}

/** Normaliza sinal: sempre positivo + direção do ponto de vista do titular. */
export function normalizeTransaction(t: PluggyTransactionJson, kind: "BANK" | "CREDIT", fallbackAccountId: string): ProviderTransaction | null {
  const amountCents = toCents(t.amount);
  if (amountCents === 0) return null; // o app não registra valor zero
  const positive = t.amount > 0;
  const direction: "CREDIT" | "DEBIT" = kind === "BANK" ? (positive ? "CREDIT" : "DEBIT") : positive ? "DEBIT" : "CREDIT";
  return {
    id: t.id,
    accountId: t.accountId ?? fallbackAccountId,
    description: (t.description || t.descriptionRaw || "Transação bancária").slice(0, 500),
    amountCents,
    direction,
    postedOn: dateOnly(t.date),
    status: t.status === "PENDING" ? "PENDING" : "POSTED",
  };
}

export class PluggyProvider implements OpenFinanceProvider {
  readonly name = "PLUGGY" as const;

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private apiKey: { value: string; expiresAt: number } | null = null;
  private authInFlight: Promise<string> | null = null;

  constructor(private readonly opts: PluggyOptions) {
    this.baseUrl = (opts.baseUrl ?? "https://api.pluggy.ai").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.now = opts.now ?? (() => new Date());
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  // ------------------------------------------------------------------ infraestrutura HTTP

  private async raw(path: string, init: { method?: string; body?: unknown; apiKey?: string }): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(init.apiKey ? { "x-api-key": init.apiKey } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ProviderError("Provedor de Open Finance indisponível", "PROVIDER_UNREACHABLE", undefined, true);
    }
    return res;
  }

  private async authenticate(): Promise<string> {
    const res = await this.raw("/auth", { method: "POST", body: { clientId: this.opts.clientId, clientSecret: this.opts.clientSecret } });
    if (!res.ok) throw new ProviderError("Falha ao autenticar no provedor", "PROVIDER_AUTH_FAILED", res.status, res.status >= 500);
    const json = (await res.json()) as { apiKey?: string };
    if (!json.apiKey) throw new ProviderError("Resposta de autenticação inesperada", "PROVIDER_BAD_RESPONSE", res.status);
    this.apiKey = { value: json.apiKey, expiresAt: this.now().getTime() + API_KEY_TTL_MS };
    return json.apiKey;
  }

  private async getApiKey(force = false): Promise<string> {
    if (!force && this.apiKey && this.apiKey.expiresAt > this.now().getTime()) return this.apiKey.value;
    // Uma única autenticação por vez (evita rajada de POST /auth, que tem limite de taxa).
    this.authInFlight ??= this.authenticate().finally(() => {
      this.authInFlight = null;
    });
    return this.authInFlight;
  }

  /** Chamada autenticada; renova a chave uma vez se o provedor responder 401/403. */
  private async call(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    let res = await this.raw(path, { ...init, apiKey: await this.getApiKey() });
    if (res.status === 401 || res.status === 403) {
      res = await this.raw(path, { ...init, apiKey: await this.getApiKey(true) });
    }
    return res;
  }

  private async json<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T | null> {
    const res = await this.call(path, init);
    if (res.status === 404) return null;
    if (res.status === 429) throw new ProviderError("Limite de requisições do provedor atingido", "PROVIDER_RATE_LIMITED", 429, true);
    if (!res.ok) throw new ProviderError("O provedor recusou a requisição", "PROVIDER_ERROR", res.status, res.status >= 500);
    return (await res.json()) as T;
  }

  // ------------------------------------------------------------------ operações

  async createConnectToken(input: { clientUserId: string; itemId?: string; redirectUri?: string }): Promise<ConnectToken> {
    // clientUserId precisa ficar DENTRO de `options` (no nível raiz o Pluggy ignora).
    const body = {
      options: {
        clientUserId: input.clientUserId,
        ...(input.itemId ? { itemId: input.itemId } : {}),
        // Bancos do Open Finance autorizam no app do banco e voltam para o nosso app por deep link.
        ...(input.redirectUri ? { oauthRedirectUri: input.redirectUri } : {}),
        avoidDuplicates: true,
      },
    };
    const json = await this.json<{ accessToken?: string }>("/connect_token", { method: "POST", body });
    if (!json?.accessToken) throw new ProviderError("Não foi possível iniciar a conexão", "PROVIDER_BAD_RESPONSE");
    return { accessToken: json.accessToken, expiresAt: new Date(this.now().getTime() + CONNECT_TOKEN_TTL_MS) };
  }

  async listRegulatedConnectors(): Promise<ProviderConnector[]> {
    const out: ProviderConnector[] = [];
    let totalPages = 1;
    // Teto de segurança de 10 páginas (o catálogo regulado de pessoa física tem poucas dezenas).
    for (let page = 1; page <= Math.min(totalPages, 10); page++) {
      const qs = new URLSearchParams({ isOpenFinance: "true", countries: "BR", types: "PERSONAL_BANK", page: String(page) });
      const json = await this.json<{ results?: Array<{ id: number; name?: string; isOpenFinance?: boolean }>; totalPages?: number }>(`/connectors?${qs.toString()}`);
      totalPages = json?.totalPages ?? 1;
      for (const c of json?.results ?? []) {
        // Confere de novo no resultado: o filtro da query nunca é a única barreira.
        if (c.isOpenFinance === false) continue;
        out.push({ id: c.id, name: (c.name ?? "Banco").slice(0, 80) });
      }
    }
    return out;
  }

  async getItem(itemId: string): Promise<ProviderItem | null> {
    const item = await this.json<PluggyItemJson>(`/items/${encodeURIComponent(itemId)}`);
    if (!item) return null;
    return {
      id: item.id,
      clientUserId: item.clientUserId ?? null,
      institutionName: item.connector?.name ?? "Banco",
      isOpenFinance: item.connector?.isOpenFinance === true,
      status: mapItemStatus(item.status, item.executionStatus),
      lastUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
      consentExpiresAt: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null,
      errorCode: item.error?.code ? String(item.error.code).slice(0, 64) : null,
      partial: item.status === "PARTIAL_SUCCESS",
    };
  }

  async listAccounts(itemId: string): Promise<ProviderAccount[]> {
    const json = await this.json<{ results?: PluggyAccountJson[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
    return (json?.results ?? []).map((a) => ({
      id: a.id,
      kind: a.type === "CREDIT" ? "CREDIT" : "BANK",
      name: (a.name || "Conta").slice(0, 120),
      balanceCents: signedCents(a.balance),
      credit: a.type === "CREDIT" ? mapCredit(a.creditData) : null,
    }));
  }

  async listInvestments(itemId: string): Promise<ProviderInvestment[]> {
    const out: ProviderInvestment[] = [];
    let totalPages = 1;
    // Teto de segurança: 10 páginas (500 por página) por conexão.
    for (let page = 1; page <= Math.min(totalPages, 10); page++) {
      const qs = new URLSearchParams({ itemId, page: String(page) });
      const json = await this.json<{ results?: PluggyInvestmentJson[]; totalPages?: number }>(`/investments?${qs.toString()}`);
      totalPages = json?.totalPages ?? 1;
      for (const raw of json?.results ?? []) {
        const mapped = mapInvestment(raw);
        if (mapped) out.push(mapped);
      }
    }
    return out;
  }

  async refreshItem(itemId: string): Promise<void> {
    const res = await this.call(`/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: {} });
    if (res.ok) return;
    if (res.status === 404) throw new ProviderError("Conexão não encontrada no provedor", "PROVIDER_ITEM_NOT_FOUND", 404);
    if (res.status === 429) throw new ProviderError("Limite de requisições do provedor atingido", "PROVIDER_RATE_LIMITED", 429, true);
    throw new ProviderError("O provedor recusou o pedido de atualização", "PROVIDER_ERROR", res.status, res.status >= 500);
  }

  async listTransactions(accountId: string, kind: "BANK" | "CREDIT", fromDate: string): Promise<ProviderTransaction[]> {
    const out: ProviderTransaction[] = [];
    let query: string | null = `?${new URLSearchParams({ accountId, dateFrom: fromDate }).toString()}`;
    // Teto de segurança: 20 páginas × 500 = 10 mil transações por conta por sincronização.
    for (let page = 0; page < 20 && query; page++) {
      const json: { results?: PluggyTransactionJson[]; next?: string | null } | null = await this.json(`/v2/transactions${query}`);
      for (const t of json?.results ?? []) {
        const n = normalizeTransaction(t, kind, accountId);
        if (n) out.push(n);
      }
      // Documentação: `next` é a query string pronta da próxima página (null = acabou).
      const next: string | null = json?.next ?? null;
      query = next && /^\?[\w%=&.\-:+]{1,1000}$/.test(next) ? next : null;
    }
    return out;
  }

  async deleteItem(itemId: string): Promise<void> {
    const res = await this.call(`/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    if (res.ok || res.status === 404) return;
    if (res.status === 429) throw new ProviderError("Limite de requisições do provedor atingido", "PROVIDER_RATE_LIMITED", 429, true);
    throw new ProviderError("Não foi possível remover a conexão no provedor", "PROVIDER_ERROR", res.status, res.status >= 500);
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>): boolean {
    const expected = this.opts.webhookSecret;
    if (!expected) return false; // sem segredo configurado, nenhum webhook é aceito
    const raw = headers[WEBHOOK_SECRET_HEADER];
    const received = Array.isArray(raw) ? raw[0] : raw;
    if (!received) return false;
    // Hash dos dois lados: tamanhos iguais e comparação em tempo constante.
    const a = createHash("sha256").update(received).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
  }
}
