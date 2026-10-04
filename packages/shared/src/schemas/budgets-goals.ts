import { z } from "zod";
import { GoalKind, GoalStatus } from "../enums";
import { categoryRef } from "./categories";
import {
  cents,
  cursorQuery,
  hexColor,
  iconName,
  isoDate,
  monthParam,
  multiLine,
  positiveCents,
  singleLine,
  timestamp,
  uuid,
} from "./common";

// ---------------------------------------------------------------- Orçamentos

export const budgetStatus = z.enum(["OK", "WARNING", "EXCEEDED"]);

export const budgetDTO = z.object({
  id: uuid,
  category: categoryRef,
  /** Primeiro dia do mês. */
  month: isoDate,
  amountCents: z.number().int(),
  alertPct: z.number().int(),
  spentCents: z.number().int(),
  remainingCents: z.number().int(),
  /** Percentual consumido (pode passar de 100). */
  usedPct: z.number(),
  status: budgetStatus,
});

export const budgetsResponse = z.object({
  month: isoDate,
  totalBudgetCents: z.number().int(),
  totalSpentCents: z.number().int(),
  budgets: z.array(budgetDTO),
});

export const listBudgetsQuery = z.object({ month: monthParam.optional() });

export const upsertBudgetBody = z.strictObject({
  categoryId: uuid,
  month: monthParam,
  amountCents: positiveCents,
  alertPct: z.number().int().min(1).max(100).default(80),
});

export const updateBudgetBody = z.strictObject({
  amountCents: positiveCents.optional(),
  alertPct: z.number().int().min(1).max(100).optional(),
});

export const copyBudgetsBody = z.strictObject({
  fromMonth: monthParam,
  toMonth: monthParam,
  /** Se true, substitui orçamentos que já existem no mês de destino. */
  overwrite: z.boolean().default(false),
});

export const copyBudgetsResponse = z.object({ created: z.number().int(), skipped: z.number().int() });

// -------------------------------------------------------------------- Metas

export const goalContributionDTO = z.object({
  id: uuid,
  amountCents: z.number().int(),
  occurredOn: isoDate,
  notes: z.string().nullable(),
  createdAt: timestamp,
});

export const goalDTO = z.object({
  id: uuid,
  name: z.string(),
  kind: GoalKind,
  targetCents: z.number().int(),
  initialCents: z.number().int(),
  currentCents: z.number().int(),
  remainingCents: z.number().int(),
  /** 0–100 (limitado a 100). */
  progressPct: z.number(),
  deadline: isoDate.nullable(),
  status: GoalStatus,
  /** Quanto guardar por mês até o prazo (null sem prazo ou meta concluída). */
  monthlyNeededCents: z.number().int().nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  achievedAt: timestamp.nullable(),
  createdAt: timestamp,
});

export const createGoalBody = z.strictObject({
  name: singleLine(80),
  kind: GoalKind.default("OTHER"),
  targetCents: positiveCents,
  initialCents: z.number().int().min(0).max(1_000_000_000_000).default(0),
  deadline: isoDate.nullable().optional(),
  icon: iconName.nullable().optional(),
  color: hexColor.nullable().optional(),
});

export const updateGoalBody = z.strictObject({
  name: singleLine(80).optional(),
  kind: GoalKind.optional(),
  targetCents: positiveCents.optional(),
  deadline: isoDate.nullable().optional(),
  icon: iconName.nullable().optional(),
  color: hexColor.nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const listGoalsQuery = z.object({
  status: GoalStatus.optional(),
});

export const addContributionBody = z.strictObject({
  /** Positivo = aporte; negativo = resgate. */
  amountCents: cents.refine((n) => n !== 0, "O valor não pode ser zero"),
  occurredOn: isoDate.optional(),
  notes: multiLine(500).nullable().optional(),
});

export const goalDetailDTO = goalDTO.extend({
  contributions: z.array(goalContributionDTO),
});

export const listContributionsQuery = z.object({ ...cursorQuery.shape });

export type BudgetDTO = z.infer<typeof budgetDTO>;
export type BudgetsResponse = z.infer<typeof budgetsResponse>;
export type GoalDTO = z.infer<typeof goalDTO>;
