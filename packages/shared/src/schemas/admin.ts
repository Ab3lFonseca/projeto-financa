import { z } from "zod";
import { Plan, UserRole, UserStatus } from "../enums";
import { AccessState } from "./billing";
import { cursorQuery, isoDate, timestamp, uuid } from "./common";

// O painel administrativo NUNCA expõe senhas, tokens, credenciais bancárias nem dados financeiros
// (valores, lançamentos, saldos, contas, cartões, bancos conectados) dos usuários. Só metadados de conta e de perfil
// (nome, e-mail, plano, status, datas e preferências de aparência) e números agregados.

export const adminUserDTO = z.object({
  id: uuid,
  email: z.string(),
  /** Nome de exibição que a própria pessoa escolheu no cadastro. */
  displayName: z.string().nullable(),
  role: UserRole,
  status: UserStatus,
  plan: Plan,
  createdAt: timestamp,
  lastSeenAt: timestamp.nullable(),
  /** Concluiu (ou pulou) o tutorial de primeiro uso. */
  onboardingCompleted: z.boolean(),
  /**
   * Acesso que a pessoa terá com a cobrança ligada (teste grátis até quando, assinante, cortesia, administrador ou teste vencido).
   * Mostrado mesmo no beta, para o administrador ver o que acontece quando a cobrança começar.
   */
  access: z.object({ state: AccessState, expiresAt: timestamp.nullable(), investments: z.boolean() }),
  /** A conta usa verificação em duas etapas (só se está ligada; nada do segredo). */
  mfaEnabled: z.boolean(),
});

/** Detalhe de um usuário: os mesmos dados da lista mais a aparência escolhida. Nada financeiro. */
export const adminUserDetailDTO = adminUserDTO.extend({
  themePreset: z.string().nullable(),
});

export const listAdminUsersQuery = z.object({
  /** Busca por e-mail ou nome. */
  search: z.string().trim().min(1).max(100).optional(),
  status: UserStatus.optional(),
  ...cursorQuery.shape,
});

export const setUserStatusBody = z.strictObject({ status: z.enum(["ACTIVE", "SUSPENDED"]) });

/** Excluir a conta de outra pessoa é definitivo (apaga tudo, como o pedido dela pela LGPD): exige a palavra de confirmação. */
export const deleteUserBody = z.strictObject({ confirm: z.literal("EXCLUIR") });
export const setUserRoleBody = z.strictObject({ role: z.enum(["USER", "ADMIN"]) });
/** Prorroga o teste grátis: soma `days` dias ao fim atual (ou a partir de hoje, se o teste já tinha acabado). */
export const extendTrialBody = z.strictObject({ days: z.number().int().min(1).max(365) });

/** Atividade dos administradores: quem fez o quê, em qual conta e quando. Sem dados financeiros nem segredos. */
export const adminAuditEntryDTO = z.object({
  id: z.string(),
  action: z.string(),
  at: timestamp,
  actor: z.object({ id: z.string().nullable(), label: z.string().nullable() }),
  target: z.object({ id: z.string().nullable(), label: z.string().nullable() }).nullable(),
  /** Detalhe curto e legível (ex.: "30 dias · com Rendimentos"). */
  detail: z.string().nullable(),
});
export const listAdminAuditQuery = z.object({ ...cursorQuery.shape });
export type AdminAuditEntryDTO = z.infer<typeof adminAuditEntryDTO>;

export const adminStatsDTO = z.object({
  users: z.object({
    total: z.number().int(),
    active: z.number().int(),
    suspended: z.number().int(),
    premium: z.number().int(),
    newLast7Days: z.number().int(),
    newLast30Days: z.number().int(),
    activeLast7Days: z.number().int(),
    /** Quantos já concluíram o tutorial de primeiro uso. */
    onboardingCompleted: z.number().int(),
    /** Quantos ligaram a verificação em duas etapas. */
    mfaEnabled: z.number().int(),
  }),
  signupsByDay: z.array(z.object({ date: isoDate, count: z.number().int() })),
  /** Quantas pessoas usam cada tema (id do tema → total). */
  themes: z.record(z.string(), z.number().int()),
  /** Assinaturas, como estariam com a cobrança ligada. Só números: nada de quem paga nem de quanto cada um pagou. */
  billing: z.object({
    /** A cobrança está ligada neste servidor. */
    enforced: z.boolean(),
    trial: z.number().int(),
    paid: z.number().int(),
    complimentary: z.number().int(),
    admin: z.number().int(),
    expired: z.number().int(),
    /** Entre os pagantes e as cortesias, quantos têm o adicional Rendimentos. */
    investmentsAddon: z.number().int(),
    /** Receita mensal recorrente estimada (assinantes pagos × preço mensal lido do provedor); `null` sem preço ou sem provedor. */
    monthlyRevenueCents: z.number().int().nullable(),
    currency: z.string().length(3).nullable(),
  }),
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
export type AdminUserDetailDTO = z.infer<typeof adminUserDetailDTO>;
export type AdminStatsDTO = z.infer<typeof adminStatsDTO>;
export type AdminIntegrationsDTO = z.infer<typeof adminIntegrationsDTO>;
export type AdminIssueDTO = z.infer<typeof adminIssueDTO>;
