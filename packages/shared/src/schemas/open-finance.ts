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
});

export const connectTokenDTO = z.object({
  /** Token de curta duração (30 min) que só abre o widget do provedor. Nunca é guardado. */
  accessToken: z.string(),
  expiresAt: timestamp,
  /** Preenchido ao reconectar uma conexão existente (o widget abre em modo de atualização). */
  itemId: z.string().nullable(),
});

/** Depois de o usuário concluir o fluxo oficial no widget, o app informa o id da conexão. */
export const registerConnectionBody = z.strictObject({ itemId: z.uuid() });

export const connectionAccountDTO = z.object({
  /** Id da conta no provedor (usado nas rotas de vínculo). */
  providerAccountId: z.string(),
  name: z.string(),
  kind: z.enum(["BANK", "CREDIT"]),
  balanceCents: z.number().int().nullable(),
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
  /** Transações novas aguardando revisão. */
  pendingCount: z.number().int(),
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
