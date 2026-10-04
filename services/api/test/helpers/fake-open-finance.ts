import { randomUUID } from "node:crypto";
import {
  ProviderError,
  type ConnectToken,
  type OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnector,
  type ProviderInvestment,
  type ProviderItem,
  type ProviderTransaction,
} from "../../src/modules/open-finance/provider";

export const WEBHOOK_SECRET = "whsec-test-secret";

/** Provedor em memória: permite montar bancos, contas, cartões, investimentos e transações e inspecionar chamadas. */
export class FakeOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = "PLUGGY" as const;

  items = new Map<string, ProviderItem>();
  accounts = new Map<string, ProviderAccount[]>();
  transactions = new Map<string, ProviderTransaction[]>();
  investments = new Map<string, ProviderInvestment[]>();
  deleted: string[] = [];
  refreshed: string[] = [];
  tokens: Array<{ clientUserId: string; itemId?: string; redirectUri?: string }> = [];
  connectors: ProviderConnector[] = [{ id: 601, name: "Banco A" }, { id: 602, name: "Banco B" }];
  connectorCalls = 0;
  failDelete = false;
  failInvestments = false;
  failRefresh = false;

  /** Cria uma conexão (item) já "autorizada" pelo usuário no banco. */
  addItem(
    clientUserId: string | null,
    opts: {
      institution?: string;
      isOpenFinance?: boolean;
      status?: ProviderItem["status"];
      partial?: boolean;
      accounts?: Array<Partial<ProviderAccount> & { txs?: Array<Partial<ProviderTransaction>> }>;
      investments?: Array<Partial<ProviderInvestment>>;
    } = {},
  ): { itemId: string; accountIds: string[] } {
    const itemId = randomUUID();
    this.items.set(itemId, {
      id: itemId,
      clientUserId,
      institutionName: opts.institution ?? "Banco Teste",
      isOpenFinance: opts.isOpenFinance ?? true,
      status: opts.status ?? "ACTIVE",
      lastUpdatedAt: new Date("2026-10-04T12:00:00Z"),
      consentExpiresAt: null,
      errorCode: null,
      partial: opts.partial ?? false,
    });
    const accountIds: string[] = [];
    const defs = opts.accounts ?? [{ kind: "BANK", name: "Conta corrente" }];
    this.accounts.set(
      itemId,
      defs.map((d) => {
        const id = d.id ?? randomUUID();
        accountIds.push(id);
        this.transactions.set(
          id,
          (d.txs ?? []).map((t) => ({
            id: randomUUID(),
            accountId: id,
            description: "COMPRA TESTE",
            amountCents: 1000,
            direction: "DEBIT",
            postedOn: "2026-10-02",
            status: "POSTED",
            ...t,
          })),
        );
        const kind = d.kind ?? "BANK";
        return {
          id,
          kind,
          name: d.name ?? "Conta",
          balanceCents: d.balanceCents ?? null,
          credit: kind === "CREDIT" ? (d.credit ?? null) : null,
        };
      }),
    );
    this.investments.set(itemId, (opts.investments ?? []).map((i) => this.makeInvestment(i)));
    return { itemId, accountIds };
  }

  makeInvestment(over: Partial<ProviderInvestment> = {}): ProviderInvestment {
    return {
      id: randomUUID(),
      name: "CDB Teste",
      type: "FIXED_INCOME",
      subtype: "CDB",
      issuer: "Banco Teste S.A.",
      status: "ACTIVE",
      balanceCents: 105_000,
      investedCents: 100_000,
      profitCents: 5_000,
      withdrawableCents: 105_000,
      rateType: "CDI",
      rate: 110,
      fixedAnnualRate: null,
      annualRate: null,
      issueDate: "2026-07-01",
      dueDate: "2028-07-01",
      ...over,
    };
  }

  setInvestments(itemId: string, list: Array<Partial<ProviderInvestment> & { id?: string }>): ProviderInvestment[] {
    const made = list.map((i) => this.makeInvestment(i));
    this.investments.set(itemId, made);
    return made;
  }

  addTransactions(accountId: string, txs: Array<Partial<ProviderTransaction>>): ProviderTransaction[] {
    const created = txs.map(
      (t): ProviderTransaction => ({
        id: randomUUID(),
        accountId,
        description: "COMPRA TESTE",
        amountCents: 1000,
        direction: "DEBIT",
        postedOn: "2026-10-02",
        status: "POSTED",
        ...t,
      }),
    );
    this.transactions.set(accountId, [...(this.transactions.get(accountId) ?? []), ...created]);
    return created;
  }

  async listRegulatedConnectors(): Promise<ProviderConnector[]> {
    this.connectorCalls++;
    return this.connectors;
  }

  async createConnectToken(input: { clientUserId: string; itemId?: string; redirectUri?: string }): Promise<ConnectToken> {
    this.tokens.push(input);
    return { accessToken: `connect-token-${this.tokens.length}`, expiresAt: new Date("2026-10-04T15:30:00Z") };
  }

  async getItem(itemId: string): Promise<ProviderItem | null> {
    return this.items.get(itemId) ?? null;
  }

  async listAccounts(itemId: string): Promise<ProviderAccount[]> {
    return this.accounts.get(itemId) ?? [];
  }

  async listInvestments(itemId: string): Promise<ProviderInvestment[]> {
    if (this.failInvestments) throw new ProviderError("falha simulada", "PROVIDER_ERROR", 500, true);
    return this.investments.get(itemId) ?? [];
  }

  async listTransactions(accountId: string, _kind: "BANK" | "CREDIT", fromDate: string): Promise<ProviderTransaction[]> {
    return (this.transactions.get(accountId) ?? []).filter((t) => t.postedOn >= fromDate);
  }

  async refreshItem(itemId: string): Promise<void> {
    if (this.failRefresh) throw new ProviderError("falha simulada", "PROVIDER_ERROR", 500, true);
    this.refreshed.push(itemId);
  }

  async deleteItem(itemId: string): Promise<void> {
    if (this.failDelete) throw new ProviderError("falha simulada", "PROVIDER_UNREACHABLE", undefined, true);
    this.deleted.push(itemId);
    this.items.delete(itemId);
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>): boolean {
    return headers["x-webhook-secret"] === WEBHOOK_SECRET;
  }
}
