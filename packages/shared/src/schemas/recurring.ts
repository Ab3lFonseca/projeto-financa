import { z } from "zod";
import { PaymentMethod, RecurrenceFrequency } from "../enums";
import { accountRef } from "./accounts";
import { categoryRef } from "./categories";
import { isoDate, multiLine, positiveCents, singleLine, timestamp, uuid } from "./common";
import { cardRef } from "./transactions";

export const recurringRuleDTO = z.object({
  id: uuid,
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string(),
  amountCents: z.number().int(),
  account: accountRef.nullable(),
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
  type: z.enum(["INCOME", "EXPENSE"]),
  description: singleLine(200),
  amountCents: positiveCents,
  accountId: uuid.nullable().optional(),
  cardId: uuid.nullable().optional(),
  categoryId: uuid.nullable().optional(),
  paymentMethod: PaymentMethod.optional(),
  frequency: RecurrenceFrequency,
  intervalCount: z.number().int().min(1).max(60).default(1),
  /** Para MONTHLY/YEARLY. Se omitido, usa o dia de `startDate`. */
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  notes: multiLine(1000).nullable().optional(),
};

export const createRecurringBody = z.strictObject(recurringFields).superRefine((v, ctx) => {
  if (Boolean(v.accountId) === Boolean(v.cardId)) {
    ctx.addIssue({ code: "custom", path: ["accountId"], message: "Informe a conta ou o cartão (apenas um)" });
  }
  if (v.cardId && v.paymentMethod && v.paymentMethod !== "CREDIT") {
    ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Cartão usa a forma de pagamento Crédito" });
  }
  if (v.accountId && v.paymentMethod === "CREDIT") {
    ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Crédito exige um cartão" });
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
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string(),
  amountCents: z.number().int(),
  category: categoryRef.nullable(),
});

export const upcomingQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type RecurringRuleDTO = z.infer<typeof recurringRuleDTO>;
export type CreateRecurringBody = z.infer<typeof createRecurringBody>;
