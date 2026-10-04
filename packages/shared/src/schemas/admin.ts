import { z } from "zod";
import { ConnectionStatus, Plan, UserRole, UserStatus } from "../enums";
import { cursorQuery, isoDate, timestamp, uuid } from "./common";

// O painel administrativo NUNCA expõe senhas, tokens, credenciais bancárias nem dados financeiros
// (valores, lançamentos, saldos) dos usuários. Só metadados de conta, contagens e status.

export const adminUserDTO = z.object({
  id: uuid,
  email: z.string(),
  role: UserRole,
  status: UserStatus,
  plan: Plan,
  createdAt: timestamp,
  lastSeenAt: timestamp.nullable(),
});

export const adminUserDetailDTO = adminUserDTO.extend({
  counts: z.object({
    accounts: z.number().int(),
    cards: z.number().int(),
    transactions: z.number().int(),
    goals: z.number().int(),
    bankConnections: z.number().int(),
  }),
  bankConnections: z.array(
    z.object({
      id: uuid,
      provider: z.string(),
      institutionName: z.string(),
      status: ConnectionStatus,
      lastSyncAt: timestamp.nullable(),
      lastErrorCode: z.string().nullable(),
    }),
  ),
});

export const listAdminUsersQuery = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: UserStatus.optional(),
  ...cursorQuery.shape,
});

export const setUserStatusBody = z.strictObject({ status: z.enum(["ACTIVE", "SUSPENDED"]) });

export const adminStatsDTO = z.object({
  users: z.object({
    total: z.number().int(),
    active: z.number().int(),
    suspended: z.number().int(),
    premium: z.number().int(),
    newLast7Days: z.number().int(),
    newLast30Days: z.number().int(),
    activeLast7Days: z.number().int(),
  }),
  signupsByDay: z.array(z.object({ date: isoDate, count: z.number().int() })),
  bankConnections: z.record(z.string(), z.number().int()),
});

export const adminIntegrationsDTO = z.object({
  auth: z.object({ provider: z.string(), configured: z.boolean() }),
  openFinance: z.object({
    provider: z.string(),
    enabled: z.boolean(),
    configured: z.boolean(),
    connectionsByStatus: z.record(z.string(), z.number().int()),
    lastSyncAt: timestamp.nullable(),
    webhooksLast24h: z.number().int(),
    webhookErrorsLast24h: z.number().int(),
    topErrorCodes: z.array(z.object({ code: z.string(), count: z.number().int() })),
  }),
  push: z.object({ registeredTokens: z.number().int() }),
});

export const adminIssueDTO = z.object({
  kind: z.enum(["BANK_CONNECTION_ERROR", "WEBHOOK_ERROR", "PRIVACY_REQUEST_FAILED"]),
  at: timestamp,
  summary: z.string(),
  ref: z.string(),
});

export type AdminUserDTO = z.infer<typeof adminUserDTO>;
export type AdminStatsDTO = z.infer<typeof adminStatsDTO>;
