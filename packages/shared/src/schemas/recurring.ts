import { z } from "zod";
import { PaymentMethod, RecurrenceFrequency } from "../enums";
import { accountRef } from "./accounts";
import { categoryRef } from "./categories";
import { isoDate, multiLine, positiveCents, singleLine, timestamp, uuid } from "./common";
import { cardRef } from "./transactions";

/** O que a recorrência gera: receita, despesa ou transferência entre contas. */
export const recurringKinds = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export const RecurringKind = z.enum(recurringKinds);
export type RecurringKindName = z.infer<typeof RecurringKind>;

export const recurringRuleDTO = z.object({
  id: uuid,
  type: RecurringKind,
  description: z.string(),
  amountCents: z.number().int(),
  /** Conta (em transferência, a de ORIGEM). */
  account: accountRef.nullable(),
  /** Só em transferência: a conta de destino. */
  toAccount: accountRef.nullable(),
  card: cardRef.nullable(),
  category: categoryRef.nullable(),
  paymentMethod: PaymentMethod,
  frequency: RecurrenceFrequency,
  intervalCount: z.number().int(),
  dayOfMonth: z.number().int().nullable(),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  /** Próxima ocorrência ainda não gerada. */
  nextRunOn: isoDate,
  lastRunOn: isoDate.nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: timestamp,
});

const recurringFields = {
  type: RecurringKind,
  description: singleLine(200),
  amountCents: positiveCents,
  /** Conta (em transferência, a de ORIGEM). */
  accountId: uuid.nullable().optional(),
  /** Só em transferência: a conta de destino. */
  toAccountId: uuid.nullable().optional(),
  cardId: uuid.nullable().optional(),
  categoryId: uuid.nullable().optional(),
  paymentMethod: PaymentMethod.optional(),
  frequency: RecurrenceFrequency,
  intervalCount: z.number().int().min(1).max(60).default(1),
  /** Para MONTHLY/YEARLY. Se omitido, usa o dia de `startDate`. */
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  startDate: isoDate,
  /** Termina nesta data (inclusive). Sem fim e sem `occurrences`, repete para sempre. */
  endDate: isoDate.nullable().optional(),
  /** Termina depois de N vezes (a primeira conta). O servidor calcula a data do fim. Não vale junto com `endDate`. */
  occurrences: z.number().int().min(2).max(600).optional(),
  notes: multiLine(1000).nullable().optional(),
};

export const createRecurringBody = z.strictObject(recurringFields).superRefine((v, ctx) => {
  if (v.type === "TRANSFER") {
    if (!v.accountId) ctx.addIssue({ code: "custom", path: ["accountId"], message: "Informe a conta de origem" });
    if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Informe a conta de destino" });
    if (v.accountId && v.accountId === v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "A conta de origem e a de destino devem ser diferentes" });
    if (v.cardId) ctx.addIssue({ code: "custom", path: ["cardId"], message: "Transferência é entre contas, não usa cartão" });
    if (v.categoryId) ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Transferência não tem categoria" });
    if (v.paymentMethod) ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Transferência não tem forma de pagamento" });
  } else {
    if (v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "A conta de destino só vale em transferência" });
    if (Boolean(v.accountId) === Boolean(v.cardId)) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Informe a conta ou o cartão (apenas um)" });
    }
    if (v.cardId && v.paymentMethod && v.paymentMethod !== "CREDIT") {
      ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Cartão usa a forma de pagamento Crédito" });
    }
    if (v.accountId && v.paymentMethod === "CREDIT") {
      ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Crédito exige um cartão" });
    }
  }
  if (v.endDate && v.occurrences !== undefined) {
    ctx.addIssue({ code: "custom", path: ["occurrences"], message: "Escolha o fim por data ou por número de vezes, não os dois" });
  }
  if (v.endDate && v.endDate < v.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "O fim deve ser depois do início" });
  }
});

export const updateRecurringBody = z.strictObject({
  description: singleLine(200).optional(),
  amountCents: positiveCents.optional(),
  categoryId: uuid.nullable().optional(),
  paymentMethod: PaymentMethod.optional(),
  endDate: isoDate.nullable().optional(),
  active: z.boolean().optional(),
  notes: multiLine(1000).nullable().optional(),
});

/** Ocorrências futuras projetadas (não gravadas), para a tela "Próximas contas". */
export const upcomingOccurrenceDTO = z.object({
  ruleId: uuid,
  date: isoDate,
  type: RecurringKind,
  description: z.string(),
  amountCents: z.number().int(),
  category: categoryRef.nullable(),
});

export const upcomingQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type RecurringRuleDTO = z.infer<typeof recurringRuleDTO>;
export type CreateRecurringBody = z.infer<typeof createRecurringBody>;
