import { randomUUID } from "node:crypto";
import {
  ProviderError,
  type ConnectToken,
  type OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnector,
  type ProviderItem,
  type ProviderTransaction,
} from "../../src/modules/open-finance/provider";

export const WEBHOOK_SECRET = "whsec-test-secret";

/** Provedor em memória: permite montar bancos, contas e transações e inspecionar chamadas. */
export class FakeOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = "PLUGGY" as const;

  items = new Map<string, ProviderItem>();
  accounts = new Map<string, ProviderAccount[]>();
  transactions = new Map<string, ProviderTransaction[]>();
  deleted: string[] = [];
  tokens: Array<{ clientUserId: string; itemId?: string; redirectUri?: string }> = [];
  connectors: ProviderConnector[] = [{ id: 601, name: "Banco A" }, { id: 602, name: "Banco B" }];
  connectorCalls = 0;
  failDelete = false;

  /** Cria uma conexão (item) já "autorizada" pelo usuário no banco. */
  addItem(
    clientUserId: string | null,
    opts: {
      institution?: string;
      isOpenFinance?: boolean;
      status?: ProviderItem["status"];
      accounts?: Array<Partial<ProviderAccount> & { txs?: Array<Partial<ProviderTransaction>> }>;
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
        return { id, kind: d.kind ?? "BANK", name: d.name ?? "Conta", balanceCents: d.balanceCents ?? null };
      }),
    );
    return { itemId, accountIds };
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

  async listTransactions(accountId: string, _kind: "BANK" | "CREDIT", fromDate: string): Promise<ProviderTransaction[]> {
    return (this.transactions.get(accountId) ?? []).filter((t) => t.postedOn >= fromDate);
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
