import { z } from "zod";
import { PaymentMethod, TransactionStatus, TransactionType, TransferSide } from "../enums";
import {
  boolQuery,
  csvList,
  cursorQuery,
  isoDate,
  multiLine,
  positiveCents,
  singleLine,
  timestamp,
  uuid,
} from "./common";
import { accountDTO, accountRef } from "./accounts";
import { categoryRef } from "./categories";

export const cardRef = z.object({ id: uuid, name: z.string(), deleted: z.boolean() });

export const installmentInfo = z.object({
  groupId: uuid,
  number: z.number().int(),
  total: z.number().int(),
});

export const transactionDTO = z.object({
  id: uuid,
  type: TransactionType,
  status: TransactionStatus,
  description: z.string(),
  amountCents: z.number().int(),
  occurredOn: isoDate,
  account: accountRef.nullable(),
  card: cardRef.nullable(),
  category: categoryRef.nullable(),
  paymentMethod: PaymentMethod,
  invoiceId: uuid.nullable(),
  installment: installmentInfo.nullable(),
  transferId: uuid.nullable(),
  transferSide: TransferSide.nullable(),
  /** Em transferências: a conta do outro lado. */
  counterpartAccount: accountRef.nullable(),
  recurrenceId: uuid.nullable(),
  notes: z.string().nullable(),
  version: z.number().int(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const baseCreate = z.strictObject({
  /** UUID gerado no aparelho: torna a criação offline idempotente. */
  id: uuid.optional(),
  type: z.enum(["INCOME", "EXPENSE"]),
  description: singleLine(200),
  amountCents: positiveCents,
  occurredOn: isoDate,
  accountId: uuid.nullable().optional(),
  cardId: uuid.nullable().optional(),
  categoryId: uuid.nullable().optional(),
  paymentMethod: PaymentMethod.optional(),
  status: TransactionStatus.optional(),
  notes: multiLine(1000).nullable().optional(),
  /**
   * Parcelado: número de parcelas (2–120), uma por mês. `amountCents` é o TOTAL. No cartão (só despesa) cada parcela vai para a fatura do mês; na conta
   * (despesa ou receita) cada parcela é um lançamento mensal, e as futuras ficam agendadas.
   */
  installments: z.number().int().min(2).max(120).optional(),
});

export const createTransactionBody = baseCreate.superRefine((v, ctx) => {
  const hasAccount = Boolean(v.accountId);
  const hasCard = Boolean(v.cardId);
  if (hasAccount === hasCard) {
    ctx.addIssue({ code: "custom", path: ["accountId"], message: "Informe a conta ou o cartão (apenas um)" });
  }
  if (hasCard && v.paymentMethod && v.paymentMethod !== "CREDIT") {
    ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Compras no cartão usam a forma de pagamento Crédito" });
  }
  if (hasAccount && v.paymentMethod === "CREDIT") {
    ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Crédito exige um cartão" });
  }
  if (v.installments !== undefined && hasCard && v.type !== "EXPENSE") {
    ctx.addIssue({ code: "custom", path: ["installments"], message: "No cartão, apenas despesas podem ser parceladas" });
  }
});

export const updateTransactionBody = z
  .strictObject({
    description: singleLine(200).optional(),
    amountCents: positiveCents.optional(),
    occurredOn: isoDate.optional(),
    accountId: uuid.nullable().optional(),
    cardId: uuid.nullable().optional(),
    categoryId: uuid.nullable().optional(),
    paymentMethod: PaymentMethod.optional(),
    status: TransactionStatus.optional(),
    notes: multiLine(1000).nullable().optional(),
    /** Se informado e diferente da versão atual, a API responde 409 (edição concorrente). */
    expectedVersion: z.number().int().min(1).optional(),
    /** Em compras parceladas: "group" aplica descrição, categoria e observação a todas as parcelas. */
    scope: z.enum(["one", "group"]).default("one"),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== "scope" && k !== "expectedVersion" && v[k as keyof typeof v] !== undefined),
    "Informe ao menos um campo para alterar",
  );

export const deleteTransactionQuery = z.object({
  /** Em compras parceladas: "group" exclui todas as parcelas. */
  scope: z.enum(["one", "group"]).default("one"),
});

const filterFields = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: csvList(TransactionType).optional(),
  categoryId: csvList(uuid).optional(),
  uncategorized: boolQuery.optional(),
  accountId: uuid.optional(),
  cardId: uuid.optional(),
  invoiceId: uuid.optional(),
  paymentMethod: csvList(PaymentMethod).optional(),
  status: TransactionStatus.optional(),
  q: z.string().trim().max(100).optional(),
  minAmountCents: z.coerce.number().int().min(0).optional(),
  maxAmountCents: z.coerce.number().int().min(0).optional(),
};

export const transactionSort = z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]);

export const listTransactionsQuery = z.object({
  ...filterFields,
  sort: transactionSort.default("date_desc"),
  ...cursorQuery.shape,
});

export const transactionSummaryQuery = z.object(filterFields);

export const transactionSummaryDTO = z.object({
  incomeCents: z.number().int(),
  expenseCents: z.number().int(),
  netCents: z.number().int(),
  count: z.number().int(),
});

// ----- Transferências entre contas -----

export const transferDTO = z.object({
  id: uuid,
  from: accountRef,
  to: accountRef,
  amountCents: z.number().int(),
  occurredOn: isoDate,
  notes: z.string().nullable(),
  createdAt: timestamp,
});

export const createTransferBody = z
  .strictObject({
    id: uuid.optional(),
    fromAccountId: uuid,
    toAccountId: uuid,
    amountCents: positiveCents,
    occurredOn: isoDate,
    notes: multiLine(500).nullable().optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    path: ["toAccountId"],
    message: "A conta de origem e a de destino devem ser diferentes",
  });

export const updateTransferBody = z.strictObject({
  fromAccountId: uuid.optional(),
  toAccountId: uuid.optional(),
  amountCents: positiveCents.optional(),
  occurredOn: isoDate.optional(),
  notes: multiLine(500).nullable().optional(),
});

/** Conta com as últimas movimentações (tela de detalhe). */
export const accountDetailDTO = accountDTO.extend({
  recentTransactions: z.array(transactionDTO),
});

export type AccountDetailDTO = z.infer<typeof accountDetailDTO>;
export type TransactionDTO = z.infer<typeof transactionDTO>;
export type CreateTransactionBody = z.infer<typeof createTransactionBody>;
export type UpdateTransactionBody = z.infer<typeof updateTransactionBody>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;
export type TransferDTO = z.infer<typeof transferDTO>;
