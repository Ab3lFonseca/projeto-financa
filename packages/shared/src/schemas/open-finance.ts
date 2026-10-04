import { z } from "zod";
import { BankTransactionDirection, BankTransactionStatus, ConnectionStatus, OpenFinanceProvider, PaymentMethod } from "../enums";
import { accountRef } from "./accounts";
import { cursorQuery, positiveCents, singleLine, timestamp, uuid, isoDate } from "./common";
import { cardRef } from "./transactions";

/** Estado do recurso para o usuário atual (a tela decide o que mostrar). */
export const openFinanceStatusDTO = z.object({
  /** Recurso ligado neste servidor (OPEN_FINANCE_ENABLED + provedor configurado). */
  enabled: z.boolean(),
  /** Liberado para o plano do usuário. */
  allowedByPlan: z.boolean(),
  provider: OpenFinanceProvider,
  /** O usuário já deu o consentimento específico de Open Finance? */
  consentGranted: z.boolean(),
});

/** Bancos regulados que o widget pode listar (o app passa estes ids ao widget). */
export const connectorsDTO = z.object({
  data: z.array(z.object({ id: z.number().int(), name: z.string() })),
});

export const connectTokenBody = z.strictObject({
  /** Reconexão/atualização de uma conexão existente (ex.: renovar o consentimento). */
  connectionId: uuid.optional(),
  /** Onde o widget vai rodar: o banco devolve o usuário ao deep link do app (native) ou à página do app web (web). */
  platform: z.enum(["native", "web"]).optional(),
});

export const connectTokenDTO = z.object({
  /** Token de curta duração (30 min) que só abre o widget do provedor. Nunca é guardado. */
  accessToken: z.string(),
  expiresAt: timestamp,
  /** Preenchido ao reconectar uma conexão existente (o widget abre em modo de atualização). */
  itemId: z.string().nullable(),
});

/** Depois de o usuário concluir o fluxo oficial no widget, o app informa o id da conexão. */
export const registerConnectionBody = z.strictObject({
  itemId: z.uuid(),
  /** Importar tudo sozinho (cria contas/cartões e lançamentos) ou revisar antes. Padrão: automático. */
  autoImport: z.boolean().optional(),
});

export const updateConnectionBody = z.strictObject({ autoImport: z.boolean() });

/** Dados do cartão exatamente como o banco informou (só em kind = CREDIT). */
export const cardBankDataDTO = z.object({
  brand: z.string().nullable(),
  limitCents: z.number().int().nullable(),
  /** Limite disponível agora. */
  availableCents: z.number().int().nullable(),
  /** Quanto do limite está em uso (limite − disponível), quando os dois são conhecidos. */
  usedCents: z.number().int().nullable(),
  /** Fatura em aberto. */
  billCents: z.number().int().nullable(),
  minimumPaymentCents: z.number().int().nullable(),
  closeDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
});

export const connectionAccountDTO = z.object({
  /** Id da conta no provedor (usado nas rotas de vínculo). */
  providerAccountId: z.string(),
  name: z.string(),
  kind: z.enum(["BANK", "CREDIT"]),
  /** Conta: saldo no banco. Cartão: fatura em aberto. */
  balanceCents: z.number().int().nullable(),
  credit: cardBankDataDTO.nullable(),
  /** Quando o app leu estes dados do provedor pela última vez. */
  dataUpdatedAt: timestamp.nullable(),
  account: accountRef.nullable(),
  card: cardRef.nullable(),
});

export const connectionDTO = z.object({
  id: uuid,
  provider: OpenFinanceProvider,
  institutionName: z.string(),
  status: ConnectionStatus,
  consentGrantedAt: timestamp.nullable(),
  consentExpiresAt: timestamp.nullable(),
  lastSyncAt: timestamp.nullable(),
  lastErrorCode: z.string().nullable(),
  accounts: z.array(connectionAccountDTO),
  /** true = contas, cartões e transações entram sozinhos; false = o usuário revisa cada transação. */
  autoImport: z.boolean(),
  /** Transações novas aguardando revisão. */
  pendingCount: z.number().int(),
  /** Investimentos ativos trazidos desta conexão. */
  investmentCount: z.number().int(),
  /** Quantos pedidos de atualização ao banco ainda cabem hoje (a rede do Open Finance limita as consultas). */
  refreshesLeftToday: z.number().int(),
});

/** Vincula uma conta do banco a uma conta OU cartão do app. Os dois nulos desvinculam. */
export const linkAccountBody = z
  .strictObject({
    accountId: uuid.nullable().optional(),
    cardId: uuid.nullable().optional(),
  })
  .refine((v) => !(v.accountId && v.cardId), { message: "Escolha uma conta ou um cartão, não os dois", path: ["accountId"] });

export const providerAccountParams = z.object({ id: uuid, providerAccountId: z.string().min(1).max(128) });

export const syncResultDTO = z.object({
  /** Transações novas trazidas do banco nesta sincronização. */
  newTransactions: z.number().int(),
  accounts: z.number().int(),
  /** Investimentos ativos lidos do banco. */
  investments: z.number().int(),
  status: ConnectionStatus,
});

export const bankTransactionDTO = z.object({
  id: uuid,
  connectionId: uuid,
  institutionName: z.string(),
  accountName: z.string(),
  amountCents: positiveCents,
  direction: BankTransactionDirection,
  postedOn: isoDate,
  description: z.string(),
  status: BankTransactionStatus,
  account: accountRef.nullable(),
  card: cardRef.nullable(),
  /** Lançamento manual parecido (mesmo valor, perto da data) que provavelmente é o mesmo gasto. */
  suggestedMatch: z
    .object({ transactionId: uuid, description: z.string(), occurredOn: isoDate })
    .nullable(),
});

export const listBankTransactionsQuery = z.object({
  status: BankTransactionStatus.default("NEW"),
  connectionId: uuid.optional(),
  ...cursorQuery.shape,
});

export const importBankTransactionBody = z.strictObject({
  categoryId: uuid.nullable().optional(),
  /** Padrão: a descrição do banco. */
  description: singleLine(200).optional(),
  /** Em conta (não cartão). Crédito é definido pelo cartão vinculado. */
  paymentMethod: PaymentMethod.exclude(["CREDIT"]).optional(),
});

export const matchBankTransactionBody = z.strictObject({ transactionId: uuid });

export type ConnectorsDTO = z.infer<typeof connectorsDTO>;
export type OpenFinanceStatusDTO = z.infer<typeof openFinanceStatusDTO>;
export type ConnectionDTO = z.infer<typeof connectionDTO>;
export type BankTransactionDTO = z.infer<typeof bankTransactionDTO>;
export type ImportBankTransactionBody = z.infer<typeof importBankTransactionBody>;

// ----- Pedido de atualização ao banco

export const refreshResultDTO = z.object({
  requested: z.literal(true),
  refreshesLeftToday: z.number().int(),
});

// ----- Investimentos (CDB, caixinhas, cofrinhos, fundos...)

export const investmentDTO = z.object({
  id: uuid,
  connectionId: uuid,
  institutionName: z.string(),
  name: z.string(),
  /** Categoria do provedor (FIXED_INCOME, MUTUAL_FUND, EQUITY...). */
  type: z.string(),
  /** Produto (CDB, LCI, LCA, TREASURE...), quando informado. */
  subtype: z.string().nullable(),
  /** Chave de agrupamento (produto ou categoria) e seu nome em português. */
  groupKey: z.string(),
  groupLabel: z.string(),
  issuer: z.string().nullable(),
  status: z.enum(["ACTIVE", "PENDING", "TOTAL_WITHDRAWAL"]),
  balanceCents: z.number().int(),
  investedCents: z.number().int().nullable(),
  profitCents: z.number().int().nullable(),
  /** Rendimento sobre o valor investido, em %. */
  profitPct: z.number().nullable(),
  withdrawableCents: z.number().int().nullable(),
  rateType: z.string().nullable(),
  rate: z.number().nullable(),
  fixedAnnualRate: z.number().nullable(),
  annualRate: z.number().nullable(),
  /** Taxa em linguagem do dia a dia ("110% do CDI"), como o banco informou. */
  rateLabel: z.string().nullable(),
  issueDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  /** Última leitura que trouxe este investimento do banco. */
  updatedAt: timestamp,
  /** Resgatado por completo ou sumiu do banco. */
  closed: z.boolean(),
});

export const investmentsResponse = z.object({
  summary: z.object({
    totalCents: z.number().int(),
    investedCents: z.number().int(),
    profitCents: z.number().int(),
    profitPct: z.number().nullable(),
    count: z.number().int(),
    /** Leitura mais recente entre todos os investimentos. */
    updatedAt: timestamp.nullable(),
  }),
  groups: z.array(z.object({ key: z.string(), label: z.string(), totalCents: z.number().int(), count: z.number().int() })),
  items: z.array(investmentDTO),
});

export const investmentDetailDTO = investmentDTO.extend({
  /** Uma foto por dia (últimos 180 dias), do mais antigo ao mais recente. */
  history: z.array(z.object({ date: isoDate, balanceCents: z.number().int(), profitCents: z.number().int().nullable() })),
});

export const listInvestmentsQuery = z.object({
  /** Incluir os já resgatados/encerrados. */
  includeClosed: z.enum(["true", "false"]).transform((v) => v === "true").default(false),
});

// ----- Visão geral do que veio do banco, para as telas de Carteira

export const bankOverviewDTO = z.object({
  accounts: z.array(
    z.object({
      accountId: uuid,
      institutionName: z.string(),
      balanceCents: z.number().int().nullable(),
      updatedAt: timestamp.nullable(),
    }),
  ),
  cards: z.array(cardBankDataDTO.extend({ cardId: uuid, institutionName: z.string(), updatedAt: timestamp.nullable() })),
});

export type CardBankDataDTO = z.infer<typeof cardBankDataDTO>;
export type InvestmentDTO = z.infer<typeof investmentDTO>;
export type InvestmentsResponse = z.infer<typeof investmentsResponse>;
export type InvestmentDetailDTO = z.infer<typeof investmentDetailDTO>;
export type BankOverviewDTO = z.infer<typeof bankOverviewDTO>;
