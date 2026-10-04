import {
  adminIntegrationsDTO,
  adminIssueDTO,
  adminStatsDTO,
  adminUserDetailDTO,
  adminUserDTO,
  idParam,
  listAdminUsersQuery,
  listOf,
  setUserStatusBody,
  toISODate,
  type AdminUserDTO,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { audit } from "../../lib/audit";
import { tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { decodeCursor, encodeCursor, slicePage } from "../../lib/pagination";

const cursorShape = z.object({ t: z.string(), id: z.uuid() });
const DAY_MS = 86_400_000;

/**
 * Painel administrativo (API). Só metadados: contas, status, contagens, integrações e erros.
 * NÃO expõe senhas (não existem aqui), tokens, credenciais bancárias nem valores/lançamentos.
 * Todas as ações de escrita são auditadas.
 */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma, config } = app;
  app.addHook("onRequest", app.requireAdmin);

  const toUserDTO = (u: {
    id: string; email: string; role: AdminUserDTO["role"]; status: AdminUserDTO["status"];
    createdAt: Date; lastSeenAt: Date | null; subscription: { plan: AdminUserDTO["plan"]; status: string } | null;
  }): AdminUserDTO => ({
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    plan: u.subscription?.plan === "PREMIUM" && ["ACTIVE", "TRIALING"].includes(u.subscription.status) ? "PREMIUM" : "FREE",
    createdAt: tsOut(u.createdAt),
    lastSeenAt: u.lastSeenAt ? tsOut(u.lastSeenAt) : null,
  });
  const userSelect = {
    id: true, email: true, role: true, status: true, createdAt: true, lastSeenAt: true,
    subscription: { select: { plan: true, status: true } },
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
          ...(search ? { email: { contains: search.toLowerCase() } } : {}),
          ...(c ? { OR: [{ createdAt: { lt: new Date(c.t) } }, { createdAt: new Date(c.t), id: { lt: c.id } }] } : {}),
        },
        select: userSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const { items, hasMore } = slicePage(rows, limit);
      const last = items[items.length - 1];
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
      const id = u.id;
      const [accounts, cards, transactions, goals, connections] = [
        await prisma.account.count({ where: { userId: id, deletedAt: null } }),
        await prisma.creditCard.count({ where: { userId: id, deletedAt: null } }),
        await prisma.transaction.count({ where: { userId: id, deletedAt: null } }),
        await prisma.goal.count({ where: { userId: id, deletedAt: null } }),
        await prisma.bankConnection.findMany({
          where: { userId: id },
          select: { id: true, provider: true, institutionName: true, status: true, lastSyncAt: true, lastErrorCode: true },
        }),
      ];
      return {
        ...toUserDTO(u),
        counts: { accounts, cards, transactions, goals, bankConnections: connections.length },
        bankConnections: connections.map((b) => ({
          ...b,
          lastSyncAt: b.lastSyncAt ? tsOut(b.lastSyncAt) : null,
        })),
      };
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

      const recent = await prisma.user.findMany({ where: { createdAt: { gte: d30 } }, select: { createdAt: true } });
      const byDay = new Map<string, number>();
      for (const r of recent) byDay.set(toISODate(r.createdAt), (byDay.get(toISODate(r.createdAt)) ?? 0) + 1);
      const signupsByDay = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

      const conns = await prisma.bankConnection.groupBy({ by: ["status"], _count: { _all: true } });
      return {
        users: { total, active, suspended, premium, newLast7Days: new7, newLast30Days: new30, activeLast7Days: active7 },
        signupsByDay,
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
  app.get(
    "/issues",
    { schema: { tags: ["admin"], response: { 200: z.object({ data: z.array(adminIssueDTO) }) } } },
    async () => {
      const conns = await prisma.bankConnection.findMany({
        where: { status: "ERROR" },
        select: { id: true, institutionName: true, lastErrorCode: true, updatedAt: true },
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
        ...conns.map((c) => ({ kind: "BANK_CONNECTION_ERROR" as const, at: tsOut(c.updatedAt), summary: `${c.institutionName}: ${c.lastErrorCode ?? "erro"}`, ref: c.id })),
        ...hooks.map((h) => ({ kind: "WEBHOOK_ERROR" as const, at: tsOut(h.receivedAt), summary: `${h.eventType}: ${(h.error ?? "").slice(0, 120)}`, ref: h.id })),
        ...privacy.map((p) => ({ kind: "PRIVACY_REQUEST_FAILED" as const, at: tsOut(p.requestedAt), summary: `Pedido ${p.type} falhou`, ref: p.id })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      return { data: data.slice(0, 50) };
    },
  );
};
