import { z } from "zod";
import { CardBrand, DataOrigin, InvoiceStatus } from "../enums";
import { accountRef, bankDTO } from "./accounts";
import { cursorQuery, hexColor, iconName, isoDate, positiveCents, singleLine, timestamp, uuid } from "./common";
import { transactionDTO } from "./transactions";

export const invoiceDTO = z.object({
  id: uuid,
  cardId: uuid,
  /** Primeiro dia do mês do vencimento (rótulo da fatura). */
  referenceMonth: isoDate,
  closingDate: isoDate,
  dueDate: isoDate,
  status: InvoiceStatus,
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  remainingCents: z.number().int(),
});

export const cardDTO = z.object({
  id: uuid,
  name: z.string(),
  bank: bankDTO.nullable(),
  brand: CardBrand,
  last4: z.string().nullable(),
  limitCents: z.number().int(),
  /** Limite comprometido: faturas ainda não pagas (inclui parcelas futuras). */
  usedCents: z.number().int(),
  availableCents: z.number().int(),
  closingDay: z.number().int(),
  dueDay: z.number().int(),
  payAccount: accountRef.nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  source: DataOrigin,
  archived: z.boolean(),
  /** Fatura que recebe as compras de hoje. */
  currentInvoice: invoiceDTO.nullable(),
  createdAt: timestamp,
});

export const createCardBody = z.strictObject({
  name: singleLine(80),
  bankId: uuid.nullable().optional(),
  brand: CardBrand.default("OTHER"),
  last4: z.string().regex(/^\d{4}$/, "Informe os 4 últimos dígitos").nullable().optional(),
  limitCents: z.number().int().min(0).max(1_000_000_000_000),
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  payAccountId: uuid.nullable().optional(),
  color: hexColor.nullable().optional(),
  icon: iconName.nullable().optional(),
});

export const updateCardBody = z.strictObject({
  name: singleLine(80).optional(),
  bankId: uuid.nullable().optional(),
  brand: CardBrand.optional(),
  last4: z.string().regex(/^\d{4}$/).nullable().optional(),
  limitCents: z.number().int().min(0).max(1_000_000_000_000).optional(),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  payAccountId: uuid.nullable().optional(),
  color: hexColor.nullable().optional(),
  icon: iconName.nullable().optional(),
  archived: z.boolean().optional(),
});

export const invoicePaymentDTO = z.object({
  id: uuid,
  invoiceId: uuid,
  account: accountRef,
  amountCents: z.number().int(),
  paidOn: isoDate,
  notes: z.string().nullable(),
});

export const invoiceDetailDTO = invoiceDTO.extend({
  card: z.object({ id: uuid, name: z.string() }),
  transactions: z.array(transactionDTO),
  payments: z.array(invoicePaymentDTO),
});

export const payInvoiceBody = z.strictObject({
  accountId: uuid,
  /** Se omitido, paga o valor que falta. */
  amountCents: positiveCents.optional(),
  paidOn: isoDate.optional(),
  notes: singleLine(500, 0).nullable().optional(),
});

export const listInvoicesQuery = z.object({
  status: InvoiceStatus.optional(),
  /** "upcoming" = faturas com vencimento de hoje em diante (inclui parcelas futuras). */
  period: z.enum(["all", "upcoming", "history"]).default("all"),
  ...cursorQuery.shape,
});

/** Compra parcelada em andamento. */
export const installmentPlanDTO = z.object({
  groupId: uuid,
  description: z.string(),
  total: z.number().int(),
  /** Parcelas já lançadas até hoje (a "atual" é a última com data <= hoje). */
  currentNumber: z.number().int(),
  remainingCount: z.number().int(),
  installmentCents: z.number().int(),
  remainingCents: z.number().int(),
  nextDueDate: isoDate.nullable(),
  category: z.object({ id: uuid, name: z.string(), color: z.string() }).nullable(),
});

export type CardDTO = z.infer<typeof cardDTO>;
export type InvoiceDTO = z.infer<typeof invoiceDTO>;
export type InvoiceDetailDTO = z.infer<typeof invoiceDetailDTO>;
export type InstallmentPlanDTO = z.infer<typeof installmentPlanDTO>;
export type InvoicePaymentDTO = z.infer<typeof invoicePaymentDTO>;
