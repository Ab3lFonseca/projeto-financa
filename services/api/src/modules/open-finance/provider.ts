/**
 * Porta do provedor de Open Finance. O resto da API só conhece esta interface:
 * trocar de provedor (Pluggy → outro) é escrever um novo adaptador, sem tocar nas rotas.
 *
 * Regras que TODO adaptador deve respeitar:
 *  - nunca receber, repassar ou guardar senha/credencial bancária (o consentimento acontece
 *    no fluxo oficial do banco, aberto pelo widget do provedor);
 *  - devolver valores já normalizados: centavos inteiros, sempre positivos, com `direction`
 *    indicando se foi entrada (CREDIT) ou saída (DEBIT) para o titular — inclusive em cartão,
 *    onde uma compra é DEBIT;
 *  - nunca incluir dados pessoais do usuário em mensagens de erro.
 */

export type ProviderConnectionStatus = "ACTIVE" | "CONNECTING" | "OUTDATED" | "ERROR";

export type ProviderItem = {
  id: string;
  /** Identificador que NÓS enviamos ao criar o token (id do usuário). Prova de posse da conexão. */
  clientUserId: string | null;
  institutionName: string;
  /** true = conector regulado do Open Finance Brasil (consentimento no app do banco). */
  isOpenFinance: boolean;
  status: ProviderConnectionStatus;
  lastUpdatedAt: Date | null;
  consentExpiresAt: Date | null;
  /** Código curto do erro, nunca mensagem livre. */
  errorCode: string | null;
};

export type ProviderAccount = {
  id: string;
  kind: "BANK" | "CREDIT";
  name: string;
  balanceCents: number | null;
};

export type ProviderTransaction = {
  id: string;
  accountId: string;
  description: string;
  /** Sempre > 0. */
  amountCents: number;
  direction: "CREDIT" | "DEBIT";
  /** AAAA-MM-DD */
  postedOn: string;
  status: "POSTED" | "PENDING";
};

export type ConnectToken = { accessToken: string; expiresAt: Date };

/** Banco/conector regulado que o usuário pode escolher no widget. */
export type ProviderConnector = { id: number; name: string };

export interface OpenFinanceProvider {
  readonly name: "PLUGGY";

  /** Token de curta duração para abrir o widget. `itemId` = atualizar/renovar uma conexão existente. */
  createConnectToken(input: { clientUserId: string; itemId?: string; redirectUri?: string }): Promise<ConnectToken>;

  /**
   * Conectores do Open Finance regulado (pessoa física). O app só exibe ESTES no widget, então
   * o usuário nunca é levado a digitar usuário/senha de banco.
   */
  listRegulatedConnectors(): Promise<ProviderConnector[]>;

  getItem(itemId: string): Promise<ProviderItem | null>;
  listAccounts(itemId: string): Promise<ProviderAccount[]>;
  /** Transações lançadas (POSTED e PENDING) a partir de `fromDate` (AAAA-MM-DD), mais recentes ou não. */
  listTransactions(accountId: string, kind: "BANK" | "CREDIT", fromDate: string): Promise<ProviderTransaction[]>;

  /** Remove a conexão no provedor (encerra a coleta de dados). 404 conta como sucesso. */
  deleteItem(itemId: string): Promise<void>;

  /** Confere o segredo enviado pelo provedor no webhook (comparação em tempo constante). */
  verifyWebhook(headers: Record<string, string | string[] | undefined>): boolean;
}

/** Erro do provedor, sem dados do usuário. `retryable` ajuda o job a decidir se tenta de novo. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
