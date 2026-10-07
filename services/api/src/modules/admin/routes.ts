import { Prisma } from "@app/database";
import {
  adminAuditEntryDTO,
  adminIntegrationsDTO,
  adminIssueDTO,
  adminStatsDTO,
  adminUserDetailDTO,
  adminUserDTO,
  appearanceSchema,
  deleteUserBody,
  extendTrialBody,
  grantAccessBody,
  idParam,
  listAdminAuditQuery,
  listAdminUsersQuery,
  listOf,
  perMonthCents,
  setUserRoleBody,
  setUserStatusBody,
  THEME_PRESET_IDS,
  toISODate,
  type AdminUserDTO,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { resolveAccess, trialEnd, type SubscriptionInfo } from "../../lib/access";
import { accessConfigOf, subscriptionAccessSelect } from "../../lib/access-db";
import { audit } from "../../lib/audit";
import { tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { decodeCursor, encodeCursor, slicePage } from "../../lib/pagination";
import { asInterval } from "../billing/service";
import type { BillingInterval } from "../billing/provider";
import { beforeEraseOf } from "../privacy/before-erase";
import { eraseAccount } from "../privacy/service";

const cursorShape = z.object({ t: z.string(), id: z.uuid() });
const DAY_MS = 86_400_000;

/** Tema que a pessoa usa: o escolhido na tela Aparência ou, se nunca escolheu, o antigo Claro/Escuro/Automático. */
function themeOf(profile: { theme: "SYSTEM" | "LIGHT" | "DARK"; appearance: unknown } | null): string | null {
  if (!profile) return null;
  const chosen = appearanceSchema.safeParse(profile.appearance);
  if (chosen.success) return chosen.data.preset;
  return profile.theme === "DARK" ? "dark" : profile.theme === "LIGHT" ? "light" : "system";
}

/**
 * Painel administrativo (API). Só metadados de conta e de perfil (nome, e-mail, plano, status, datas, tema) e números
 * agregados. NÃO expõe senhas (não existem aqui), tokens, credenciais bancárias, bancos conectados nem valores,
 * saldos, contas, cartões ou lançamentos. Escritas e leituras de dados de usuários são auditadas (sem dados pessoais
 * na trilha: só quem, o quê e qual registro).
 */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma, config } = app;
  app.addHook("onRequest", app.requireAdmin);

  type UserRow = {
    id: string; email: string; role: AdminUserDTO["role"]; status: AdminUserDTO["status"];
    createdAt: Date; lastSeenAt: Date | null; subscription: SubscriptionInfo;
    mfaFactorId: string | null; mfaEnabledAt: Date | null;
    profile: { displayName: string | null; onboardingCompletedAt: Date | null; theme: "SYSTEM" | "LIGHT" | "DARK"; appearance: unknown } | null;
  };

  // O painel mostra o acesso que cada pessoa TERÁ com a cobrança ligada (mesmo durante o beta): é o que o administrador precisa ver.
  const accessOf = (u: Pick<UserRow, "role" | "createdAt" | "subscription">) =>
    resolveAccess({ role: u.role, createdAt: u.createdAt, subscription: u.subscription, config: { ...accessConfigOf(config), billingEnforced: true }, now: app.clock() });

  const toUserDTO = (u: UserRow): AdminUserDTO => {
    const access = accessOf(u);
    return {
      id: u.id,
      email: u.email,
      displayName: u.profile?.displayName ?? null,
      role: u.role,
      status: u.status,
      plan: access.state === "paid" || access.state === "complimentary" ? "PREMIUM" : "FREE",
      createdAt: tsOut(u.createdAt),
      lastSeenAt: u.lastSeenAt ? tsOut(u.lastSeenAt) : null,
      onboardingCompleted: Boolean(u.profile?.onboardingCompletedAt),
      access: { state: access.state, expiresAt: access.expiresAt ? tsOut(access.expiresAt) : null, investments: access.features.investments },
      mfaEnabled: u.mfaFactorId !== null && u.mfaEnabledAt !== null,
    };
  };
  const userSelect = {
    id: true, email: true, role: true, status: true, createdAt: true, lastSeenAt: true, mfaFactorId: true, mfaEnabledAt: true,
    subscription: { select: subscriptionAccessSelect },
    profile: { select: { displayName: true, onboardingCompletedAt: true, theme: true, appearance: true } },
  } as const;

  app.get(
    "/users",
    { schema: { tags: ["admin"], querystring: listAdminUsersQuery, response: { 200: listOf(adminUserDTO) } } },
    async (req) => {
      const { search, status, limit, cursor } = req.query;
      const c = cursor ? decodeCursor(cursor, cursorShape) : null;
      const rows = await prisma.user.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(search
            ? {
                OR: [
                  { email: { contains: search.toLowerCase() } },
                  { profile: { displayName: { contains: search, mode: "insensitive" as const } } },
                ],
              }
            : {}),
          ...(c ? { AND: [{ OR: [{ createdAt: { lt: new Date(c.t) } }, { createdAt: new Date(c.t), id: { lt: c.id } }] }] } : {}),
        },
        select: userSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const { items, hasMore } = slicePage(rows, limit);
      const last = items[items.length - 1];
      await audit(prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "admin.users.listed", entity: "user", ip: req.ip, metadata: { searched: Boolean(search), results: items.length } }, req.log);
      return {
        data: items.map(toUserDTO),
        page: { hasMore, nextCursor: hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null },
      };
    },
  );

  app.get(
    "/users/:id",
    { schema: { tags: ["admin"], params: idParam, response: { 200: adminUserDetailDTO } } },
    async (req) => {
      const u = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
      if (!u) throw Errors.notFound("Usuário");
      await audit(prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "admin.user.viewed", entity: "user", entityId: u.id, ip: req.ip }, req.log);
      return { ...toUserDTO(u), themePreset: themeOf(u.profile) };
    },
  );

  app.patch(
    "/users/:id",
    { schema: { tags: ["admin"], params: idParam, body: setUserStatusBody, response: { 200: adminUserDTO } } },
    async (req) => {
      if (req.params.id === req.user!.id) throw Errors.unprocessable("Você não pode alterar o próprio status", "SELF_ACTION");
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, status: true } });
      if (!target) throw Errors.notFound("Usuário");
      if (target.role === "ADMIN") throw Errors.forbidden("Administradores não podem ser suspensos por aqui", "ADMIN_PROTECTED");
      if (target.status === "DELETING") throw Errors.conflict("Conta em processo de exclusão", "ACCOUNT_DELETING");
      const updated = await prisma.user.update({ where: { id: target.id }, data: { status: req.body.status }, select: userSelect });
      app.users.invalidate(target.id);
      await audit(prisma, config.IP_HASH_PEPPER, {
        actorId: req.user!.id,
        action: `admin.user.${req.body.status === "SUSPENDED" ? "suspended" : "reactivated"}`,
        entity: "user",
        entityId: target.id,
        ip: req.ip,
      }, req.log);
      return toUserDTO(updated);
    },
  );

  /** Carrega o alvo de uma ação administrativa e aplica as proteções comuns: não vale para você mesmo (use o seu perfil). */
  const targetOf = async (req: { params: { id: string }; user: { id: string } | null }, opts: { allowAdmin?: boolean } = {}) => {
    if (req.params.id === req.user!.id) throw Errors.unprocessable("Use as suas configurações para isso: aqui só vale para outras contas.", "SELF_ACTION");
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true, role: true, status: true, createdAt: true, mfaFactorId: true, subscription: { select: subscriptionAccessSelect } } });
    if (!target) throw Errors.notFound("Usuário");
    if (target.role === "ADMIN" && !opts.allowAdmin) throw Errors.forbidden("Esta ação não vale para administradores. Remova o papel de administrador primeiro.", "ADMIN_PROTECTED");
    return target;
  };

  // Excluir a conta de outra pessoa: o mesmo apagamento definitivo do pedido dela (LGPD): cancela a assinatura e as conexões nos provedores,
  // remove o login e TODOS os dados. Fica na auditoria sem dado pessoal. Exige a palavra EXCLUIR.
  app.delete(
    "/users/:id",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: { tags: ["admin"], params: idParam, body: deleteUserBody, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      const target = await targetOf(req);
      await audit(prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "admin.user.deleted", entity: "user", entityId: target.id, ip: req.ip }, req.log);
      await eraseAccount(target.id, {
        prisma,
        authProvider: app.authProvider,
        pepper: config.IP_HASH_PEPPER,
        now: app.clock,
        log: req.log,
        beforeErase: beforeEraseOf(app),
      });
      app.users.invalidate(target.id);
      return { ok: true as const };
    },
  );

  // Promover a administrador ou voltar a usuário comum. Contas listadas em ADMIN_USER_IDS voltariam a ser promovidas no próximo acesso:
  // essas só se rebaixam tirando o ID da configuração.
  app.post(
    "/users/:id/role",
    { schema: { tags: ["admin"], params: idParam, body: setUserRoleBody, response: { 200: adminUserDTO } } },
    async (req) => {
      const target = await targetOf(req, { allowAdmin: true });
      if (req.body.role === "ADMIN" && target.status !== "ACTIVE") throw Errors.conflict("Só contas ativas podem ser administradoras.", "ACCOUNT_NOT_ACTIVE");
      if (req.body.role === "USER" && target.role === "ADMIN" && config.ADMIN_USER_IDS.includes(target.id)) {
        throw Errors.conflict("Esta conta é administradora pela configuração do servidor (ADMIN_USER_IDS). Tire o ID de lá para rebaixá-la.", "ADMIN_FROM_CONFIG");
      }
      if (target.role !== req.body.role) {
        await prisma.user.update({ where: { id: target.id }, data: { role: req.body.role } });
        app.users.invalidate(target.id);
        await audit(prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "admin.user.role_changed", entity: "user", entityId: target.id, ip: req.ip, metadata: { role: req.body.role } }, req.log);
      }
      return toUserDTO(await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: userSelect }));
    },
  );

  // Manda à pessoa o e-mail de redefinição de senha (suporte). O administrador nunca vê nem define a senha.
  app.post(
    "/users/:id/password-reset",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } }, schema: { tags: ["admin"], params: idParam, response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req) => {
      const target = await targetOf(req, { allowAdmin: true });
      await app.authProvider.requestPasswordReset(target.email, config.PASSWORD_RESET_REDIRECT_URL);
      await audit(prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "admin.user.password_reset_sent", entity: "user", entityId: target.id, ip: req.ip }, req.log);
      return { ok: true as const };
    },
  );

  // Prorroga o teste grátis (suporte, cortesia de boas-vindas...): soma dias ao fim atual, ou a partir de hoje se o teste já tinha acabado.
  app.post(
    "/users/:id/trial",
    { schema: { tags: ["admin"], params: idParam, body: extendTrialBody, response: { 200: adminUserDTO } } },
    async (req) => {
      const target = await targetOf(req);
      const now = app.clock();
      const currentEnd = trialEnd(target.createdAt, target.subscription, accessConfigOf(config));
      const newEnd = new Date(Math.max(currentEnd.getTime(), now.getTime()) + req.body.days * DAY_MS);
      await prisma.subscription.upsert({ where: { userId: target.id }, create: { userId: target.id, trialEndsAt: newEnd }, update: { trialEndsAt: newEnd } });
      app.users.invalidate(target.id);
      await audit(prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "admin.trial.extended", entity: "user", entityId: target.id, ip: req.ip, metadata: { days: req.body.days } }, req.log);
      return toUserDTO(await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: userSelect }));
    },
  );

  // Perdeu o celular e não consegue o código: o suporte desliga a verificação em duas etapas dessa conta (ela entra de novo com a senha).
  app.delete(
    "/users/:id/mfa",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } }, schema: { tags: ["admin"], params: idParam, response: { 200: adminUserDTO } } },
    async (req) => {
      const target = await targetOf(req);
      if (!target.mfaFactorId) throw Errors.conflict("Esta conta não usa verificação em duas etapas.", "MFA_NOT_ENABLED");
      await app.authProvider.adminRemoveMfa(target.id);
      await prisma.user.update({ where: { id: target.id }, data: { mfaFactorId: null, mfaEnabledAt: null } });
      app.users.invalidate(target.id);
      await audit(prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "admin.mfa.removed", entity: "user", entityId: target.id, ip: req.ip }, req.log);
      return toUserDTO(await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: userSelect }));
    },
  );

  // Atividade dos administradores (do mais recente para o mais antigo): o que foi feito, por quem e em qual conta.
  const auditDetail = (action: string, metadata: unknown): string | null => {
    const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
    if (action === "admin.access.granted") {
      const days = typeof m.days === "number" ? `${m.days} dias` : "sem prazo";
      return `${days}${m.investments === true ? " · com Rendimentos" : ""}`;
    }
    if (action === "admin.trial.extended" && typeof m.days === "number") return `+${m.days} dias`;
    if (action === "admin.user.role_changed" && typeof m.role === "string") return m.role === "ADMIN" ? "virou administrador" : "voltou a usuário";
    return null;
  };
  app.get(
    "/audit",
    { schema: { tags: ["admin"], querystring: listAdminAuditQuery, response: { 200: listOf(adminAuditEntryDTO) } } },
    async (req) => {
      const { limit, cursor } = req.query;
      const c = cursor ? decodeCursor(cursor, z.object({ id: z.string().regex(/^\d+$/) })) : null;
      const rows = await prisma.auditLog.findMany({
        where: { action: { startsWith: "admin." }, ...(c ? { id: { lt: BigInt(c.id) } } : {}) },
        orderBy: { id: "desc" },
        take: limit + 1,
      });
      const { items, hasMore } = slicePage(rows, limit);
      const ids = [...new Set(items.flatMap((r) => [r.actorId, r.entityId]).filter((v): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v)))];
      const people = ids.length
        ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, profile: { select: { displayName: true } } } })
        : [];
      const label = (id: string | null) => {
        const p = id ? people.find((x) => x.id === id) : undefined;
        return p ? (p.profile?.displayName?.trim() || p.email.split("@")[0] || p.email) : null;
      };
      const last = items[items.length - 1];
      return {
        data: items.map((r) => ({
          id: r.id.toString(),
          action: r.action,
          at: tsOut(r.createdAt),
          actor: { id: r.actorId, label: label(r.actorId) },
          target: r.entityId ? { id: r.entityId, label: label(r.entityId) } : null,
          detail: auditDetail(r.action, r.metadata),
        })),
        page: { hasMore, nextCursor: hasMore && last ? encodeCursor({ id: last.id.toString() }) : null },
      };
    },
  );

  // Cortesia: acesso sem pagar (dias ou sem prazo, com ou sem o adicional Rendimentos). Quem já paga não é sobrescrito.
  app.post(
    "/users/:id/access",
    { schema: { tags: ["admin"], params: idParam, body: grantAccessBody, response: { 200: adminUserDTO } } },
    async (req) => {
      await app.billing.grantComplimentary(req.user!.id, req.params.id, req.body, req.ip);
      const u = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id }, select: userSelect });
      return toUserDTO(u);
    },
  );

  app.delete(
    "/users/:id/access",
    { schema: { tags: ["admin"], params: idParam, response: { 200: adminUserDTO } } },
    async (req) => {
      await app.billing.revokeComplimentary(req.user!.id, req.params.id, req.ip);
      const u = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id }, select: userSelect });
      return toUserDTO(u);
    },
  );

  app.get(
    "/stats",
    { schema: { tags: ["admin"], response: { 200: adminStatsDTO } } },
    async () => {
      const now = app.clock();
      const d7 = new Date(now.getTime() - 7 * DAY_MS);
      const d30 = new Date(now.getTime() - 30 * DAY_MS);
      const total = await prisma.user.count();
      const active = await prisma.user.count({ where: { status: "ACTIVE" } });
      const suspended = await prisma.user.count({ where: { status: "SUSPENDED" } });
      const premium = await prisma.subscription.count({ where: { plan: "PREMIUM", status: { in: ["ACTIVE", "TRIALING"] } } });
      const new7 = await prisma.user.count({ where: { createdAt: { gte: d7 } } });
      const new30 = await prisma.user.count({ where: { createdAt: { gte: d30 } } });
      const active7 = await prisma.user.count({ where: { lastSeenAt: { gte: d7 } } });
      const onboarded = await prisma.profile.count({ where: { onboardingCompletedAt: { not: null } } });
      const withMfa = await prisma.user.count({ where: { mfaFactorId: { not: null } } });

      const recent = await prisma.user.findMany({ where: { createdAt: { gte: d30 } }, select: { createdAt: true } });
      const byDay = new Map<string, number>();
      for (const r of recent) byDay.set(toISODate(r.createdAt), (byDay.get(toISODate(r.createdAt)) ?? 0) + 1);
      const signupsByDay = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

      // Tema em uso: o escolhido na tela Aparência ou, sem escolha, o antigo Claro/Escuro/Automático.
      const themeRows = await prisma.$queryRaw<{ preset: string; n: number }[]>(Prisma.sql`
        SELECT COALESCE(appearance->>'preset', CASE theme::text WHEN 'LIGHT' THEN 'light' WHEN 'DARK' THEN 'dark' ELSE 'system' END) AS preset,
               COUNT(*)::int AS n
        FROM profiles GROUP BY 1`);
      const known = new Set<string>(THEME_PRESET_IDS);
      const themes: Record<string, number> = {};
      for (const r of themeRows) {
        const key = known.has(r.preset) ? r.preset : "outro";
        themes[key] = (themes[key] ?? 0) + Number(r.n);
      }

      // Assinaturas (como estariam com a cobrança ligada). Carrega só o mínimo de cada conta e conta em memória.
      const everyone = await prisma.user.findMany({ select: { role: true, createdAt: true, subscription: { select: { ...subscriptionAccessSelect, billingInterval: true, externalId: true } } } });
      const billing = { enforced: config.BILLING_ENFORCED, trial: 0, paid: 0, complimentary: 0, admin: 0, expired: 0, investmentsAddon: 0 };
      let paidWithAddon = 0;
      // Receita RECORRENTE: quem pagou uma vez (sem vínculo de assinatura) não renova sozinho, então não entra na estimativa mensal.
      const payers: { interval: BillingInterval | null; addon: boolean }[] = [];
      for (const u of everyone) {
        const a = accessOf(u);
        if (a.state === "trial") billing.trial++;
        else if (a.state === "paid") { billing.paid++; if (a.features.investments) paidWithAddon++; if (u.subscription?.externalId !== null) payers.push({ interval: asInterval(u.subscription?.billingInterval), addon: a.features.investments }); }
        else if (a.state === "complimentary") { billing.complimentary++; if (a.features.investments) billing.investmentsAddon++; }
        else if (a.state === "admin") billing.admin++;
        else if (a.state === "expired") billing.expired++;
      }
      billing.investmentsAddon += paidWithAddon;
      // Receita mensal recorrente estimada: cada pagante vale o preço do SEU ciclo lido do provedor (anual ÷ 12). Quem ainda não tem o ciclo
      // gravado (assinatura anterior a este campo) conta como mensal, ou como anual se só o anual existir. Cortesia não paga, então não entra.
      let monthlyRevenueCents: number | null = null;
      let currency: string | null = null;
      try {
        const catalog = await app.billing.provider?.catalog();
        if (catalog && (catalog.basic.month || catalog.basic.year)) {
          const fallback: BillingInterval = catalog.basic.month ? "month" : "year";
          monthlyRevenueCents = 0;
          for (const p of payers) {
            const interval = p.interval ?? fallback;
            const plan = catalog.basic[interval];
            if (plan) monthlyRevenueCents += perMonthCents(plan);
            const addon = p.addon ? catalog.investments[interval] : null;
            if (addon) monthlyRevenueCents += perMonthCents(addon);
          }
          currency = (catalog.basic.month ?? catalog.basic.year)!.currency;
        }
      } catch {
        /* sem preço (provedor fora do ar): a receita fica nula, o resto do painel funciona */
      }

      const conns = await prisma.bankConnection.groupBy({ by: ["status"], _count: { _all: true } });
      return {
        users: { total, active, suspended, premium, newLast7Days: new7, newLast30Days: new30, activeLast7Days: active7, onboardingCompleted: onboarded, mfaEnabled: withMfa },
        signupsByDay,
        themes,
        billing: { ...billing, monthlyRevenueCents, currency },
        bankConnections: Object.fromEntries(conns.map((c) => [c.status, c._count._all])),
      };
    },
  );

  app.get(
    "/integrations",
    { schema: { tags: ["admin"], response: { 200: adminIntegrationsDTO } } },
    async () => {
      const since = new Date(app.clock().getTime() - DAY_MS);
      const conns = await prisma.bankConnection.groupBy({ by: ["status"], _count: { _all: true } });
      const lastSync = await prisma.bankConnection.aggregate({ _max: { lastSyncAt: true } });
      const webhooks = await prisma.webhookEvent.count({ where: { receivedAt: { gte: since } } });
      const webhookErrors = await prisma.webhookEvent.count({ where: { receivedAt: { gte: since }, error: { not: null } } });
      const codes = await prisma.bankConnection.groupBy({
        by: ["lastErrorCode"],
        where: { lastErrorCode: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { lastErrorCode: "desc" } },
        take: 5,
      });
      const tokens = await prisma.pushToken.count();
      return {
        auth: { provider: "supabase", configured: Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY) },
        openFinance: {
          provider: "PLUGGY",
          enabled: config.OPEN_FINANCE_ENABLED,
          configured: Boolean(config.PLUGGY_CLIENT_ID && config.PLUGGY_CLIENT_SECRET),
          connectionsByStatus: Object.fromEntries(conns.map((c) => [c.status, c._count._all])),
          lastSyncAt: lastSync._max.lastSyncAt ? tsOut(lastSync._max.lastSyncAt) : null,
          webhooksLast24h: webhooks,
          webhookErrorsLast24h: webhookErrors,
          topErrorCodes: codes.map((c) => ({ code: c.lastErrorCode ?? "", count: c._count._all })),
        },
        push: { registeredTokens: tokens },
      };
    },
  );

  // Problemas recentes: conexões bancárias com erro, webhooks que falharam, pedidos LGPD que falharam.
  // O nome do banco da conexão NÃO aparece: o painel mostra que existe um problema e o código, nunca qual banco.
  app.get(
    "/issues",
    { schema: { tags: ["admin"], response: { 200: z.object({ data: z.array(adminIssueDTO) }) } } },
    async () => {
      const conns = await prisma.bankConnection.findMany({
        where: { status: "ERROR" },
        select: { id: true, lastErrorCode: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });
      const hooks = await prisma.webhookEvent.findMany({
        where: { error: { not: null } },
        select: { id: true, eventType: true, error: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
        take: 20,
      });
      const privacy = await prisma.privacyRequest.findMany({
        where: { status: "FAILED" },
        select: { id: true, type: true, requestedAt: true },
        orderBy: { requestedAt: "desc" },
        take: 20,
      });
      const data = [
        ...conns.map((c) => ({ kind: "BANK_CONNECTION_ERROR" as const, at: tsOut(c.updatedAt), summary: `Conexão bancária: ${c.lastErrorCode ?? "erro"}`, ref: c.id })),
        ...hooks.map((h) => ({ kind: "WEBHOOK_ERROR" as const, at: tsOut(h.receivedAt), summary: `${h.eventType}: ${(h.error ?? "").slice(0, 120)}`, ref: h.id })),
        ...privacy.map((p) => ({ kind: "PRIVACY_REQUEST_FAILED" as const, at: tsOut(p.requestedAt), summary: `Pedido ${p.type} falhou`, ref: p.id })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      return { data: data.slice(0, 50) };
    },
  );
};
