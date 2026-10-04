import { z } from "zod";
import { CategoryType } from "../enums";
import { hexColor, iconName, singleLine, uuid } from "./common";

export const categoryDTO = z.object({
  id: uuid,
  type: CategoryType,
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  parentId: uuid.nullable(),
  /** Preenchido nas categorias padrão (ex.: "expense.food"). */
  systemKey: z.string().nullable(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

/** Versão resumida embutida em outros DTOs (ex.: lançamento). */
export const categoryRef = z.object({
  id: uuid,
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  type: CategoryType,
  deleted: z.boolean(),
});

export const createCategoryBody = z.strictObject({
  type: CategoryType,
  name: singleLine(60),
  icon: iconName.optional(),
  color: hexColor.optional(),
  parentId: uuid.nullable().optional(),
});

export const updateCategoryBody = z.strictObject({
  name: singleLine(60).optional(),
  icon: iconName.optional(),
  color: hexColor.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  archived: z.boolean().optional(),
});

export const listCategoriesQuery = z.object({
  type: CategoryType.optional(),
  includeArchived: z.enum(["true", "false"]).transform((v) => v === "true").default(false),
});

/** Ao excluir, opcionalmente move os lançamentos para outra categoria do mesmo tipo. */
export const deleteCategoryQuery = z.object({ reassignTo: uuid.optional() });

export type CategoryDTO = z.infer<typeof categoryDTO>;
export type CategoryRef = z.infer<typeof categoryRef>;
