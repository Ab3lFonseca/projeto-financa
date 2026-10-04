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
  /**
   * Coleta concluída, mas alguma parte falhou (ex.: limite mensal do Open Finance estourado num produto).
   * Nesse caso uma lista vazia NÃO prova que o usuário não tem aquilo: não encerramos nada com base nela.
   */
  partial: boolean;
};

/** Dados do cartão de crédito como o banco informou. */
export type ProviderCredit = {
  brand: string | null;
  limitCents: number | null;
  availableCents: number | null;
  /** AAAA-MM-DD */
  closeDate: string | null;
  dueDate: string | null;
  minimumPaymentCents: number | null;
};

export type ProviderAccount = {
  id: string;
  kind: "BANK" | "CREDIT";
  name: string;
  /** Conta: saldo. Cartão: fatura em aberto. */
  balanceCents: number | null;
  /** Só em cartão (kind = CREDIT). */
  credit: ProviderCredit | null;
};

export type ProviderInvestment = {
  id: string;
  name: string;
  /** FIXED_INCOME, MUTUAL_FUND, EQUITY, ETF, SECURITY, COE, OTHER */
  type: string;
  /** CDB, LCI, LCA, TREASURE... */
  subtype: string | null;
  issuer: string | null;
  status: "ACTIVE" | "PENDING" | "TOTAL_WITHDRAWAL";
  /** Valor atual da posição (nunca negativo). */
  balanceCents: number;
  investedCents: number | null;
  /** Pode ser negativo. */
  profitCents: number | null;
  withdrawableCents: number | null;
  rateType: string | null;
  rate: number | null;
  fixedAnnualRate: number | null;
  annualRate: number | null;
  /** AAAA-MM-DD */
  issueDate: string | null;
  dueDate: string | null;
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
  /** Investimentos da conexão (CDB, caixinhas/cofrinhos, fundos...). Lista vazia = nada a mostrar. */
  listInvestments(itemId: string): Promise<ProviderInvestment[]>;
  /**
   * Pede ao provedor uma NOVA coleta no banco (consome a cota mensal do Open Finance por produto/instituição).
   * Quando terminar, o provedor avisa por webhook. Não confundir com `listAccounts`/`listInvestments`, que só leem
   * o que o provedor já guardou.
   */
  refreshItem(itemId: string): Promise<void>;
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
