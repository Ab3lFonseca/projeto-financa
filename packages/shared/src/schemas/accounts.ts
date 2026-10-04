import { z } from "zod";
import { AccountType, DataOrigin } from "../enums";
import { cents, hexColor, iconName, singleLine, timestamp, uuid } from "./common";

export const bankDTO = z.object({
  id: uuid,
  compeCode: z.string().nullable(),
  name: z.string(),
  shortName: z.string().nullable(),
  logoUrl: z.string().nullable(),
});

export const accountDTO = z.object({
  id: uuid,
  name: z.string(),
  type: AccountType,
  bank: bankDTO.nullable(),
  currency: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  includeInTotal: z.boolean(),
  source: DataOrigin,
  openingBalanceCents: z.number().int(),
  /** Saldo até hoje (lançamentos efetivados). */
  balanceCents: z.number().int(),
  archived: z.boolean(),
  createdAt: timestamp,
});

export const accountRef = z.object({ id: uuid, name: z.string(), deleted: z.boolean() });

export const createAccountBody = z.strictObject({
  name: singleLine(80),
  type: AccountType,
  bankId: uuid.nullable().optional(),
  /** Saldo no momento do cadastro (pode ser negativo). */
  openingBalanceCents: cents.default(0),
  color: hexColor.nullable().optional(),
  icon: iconName.nullable().optional(),
  includeInTotal: z.boolean().default(true),
});

export const updateAccountBody = z.strictObject({
  name: singleLine(80).optional(),
  type: AccountType.optional(),
  bankId: uuid.nullable().optional(),
  openingBalanceCents: cents.optional(),
  color: hexColor.nullable().optional(),
  icon: iconName.nullable().optional(),
  includeInTotal: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const listAccountsQuery = z.object({
  includeArchived: z.enum(["true", "false"]).transform((v) => v === "true").default(false),
});

export type AccountDTO = z.infer<typeof accountDTO>;
export type BankDTO = z.infer<typeof bankDTO>;
