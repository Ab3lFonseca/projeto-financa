import {
  bankOverviewDTO,
  bankTransactionDTO,
  connectionDTO,
  connectorsDTO,
  connectTokenBody,
  connectTokenDTO,
  idParam,
  importBankTransactionBody,
  investmentDetailDTO,
  investmentsResponse,
  linkAccountBody,
  listBankTransactionsQuery,
  listInvestmentsQuery,
  listOf,
  matchBankTransactionBody,
  okResponse,
  openFinanceStatusDTO,
  providerAccountParams,
  refreshResultDTO,
  registerConnectionBody,
  syncResultDTO,
  updateConnectionBody,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createHash } from "node:crypto";
import { z } from "zod";
import { runAs, runMutation } from "../../lib/db";
import { Errors } from "../../lib/errors";
import { limitsFor } from "../../lib/plan";
import type { AuthUser } from "../../types";
import { bankOverview, getInvestmentDetail, listInvestments } from "./investments";
import { ProviderError } from "./provider";
import {
  acceptWebhook,
  getConnectionDTO,
  hasOpenFinanceConsent,
  importBankTransaction,
  linkProviderAccount,
  listBankTransactions,
  listConnections,
  matchBankTransaction,
  refreshConnection,
  refreshCounts,
  registerConnection,
  revokeConnection,
  setAutoImport,
  setBankTransactionIgnored,
  syncConnection,
  type OpenFinanceRuntime,
} from "./service";

/** Falha do provedor vira 502 com mensagem neutra (sem detalhes que possam conter dados do usuário). */
async function viaProvider<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ProviderError) {
      throw Errors.upstream("Não foi possível falar com o provedor de Open Finance agora. Tente novamente em instantes.", err.code);
    }
    throw err;
  }
}

const CONSENT_MESSAGE = "Autorize o compartilhamento de dados via Open Finance para continuar.";

export const openFinanceRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Recurso ligado no servidor + plano Premium. */
  const gate = (user: AuthUser): OpenFinanceRuntime => {
    const runtime = app.openFinance;
    if (!runtime) throw Errors.unavailable("O Open Finance não está disponível no momento.", "OPEN_FINANCE_DISABLED");
    if (!limitsFor(user.plan).openFinance) throw Errors.planLimit("O Open Finance faz parte do plano Premium.", { feature: "openFinance" });
    return runtime;
  };
  const needRuntime = (): OpenFinanceRuntime => {
    if (!app.openFinance) throw Errors.unavailable("O Open Finance não está disponível no momento.", "OPEN_FINANCE_DISABLED");
    return app.openFinance;
  };

  app.get(
    "/status",
    { schema: { tags: ["open-finance"], response: { 200: openFinanceStatusDTO } } },
    async (req) =>
      runAs(req, async (tx, user) => ({
        enabled: app.openFinance !== null,
        allowedByPlan: limitsFor(user.plan).openFinance,
        provider: "PLUGGY" as const,
        consentGranted: await hasOpenFinanceConsent(tx, user.id),
      })),
  );

  // Bancos do Open Finance regulado: o app passa estes ids ao widget, que não lista mais nada.
  app.get(
    "/connectors",
    { schema: { tags: ["open-finance"], response: { 200: connectorsDTO } } },
    async (req) => {
      const runtime = gate(req.user!);
      const list = await viaProvider(() => runtime.regulatedConnectors());
      return { data: list };
    },
  );

  // Token curto (30 min) para abrir o widget do provedor. O usuário se autentica DIRETO no banco.
  app.post(
    "/connect-token",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: { tags: ["open-finance"], body: connectTokenBody, response: { 200: connectTokenDTO } },
    },
    async (req) => {
      const user = req.user!;
      const runtime = gate(user);
      const itemId = await runAs(req, async (tx, u) => {
        if (!(await hasOpenFinanceConsent(tx, u.id))) throw Errors.forbidden(CONSENT_MESSAGE, "OPEN_FINANCE_CONSENT_REQUIRED");
        if (!req.body.connectionId) return undefined;
        const c = await tx.bankConnection.findFirst({ where: { id: req.body.connectionId, userId: u.id, revokedAt: null } });
        if (!c) throw Errors.notFound("Conexão");
        return c.providerItemId;
      });
      const token = await viaProvider(() => runtime.provider.createConnectToken({ clientUserId: user.id, itemId, redirectUri: runtime.deps.redirectUri }));
      return { accessToken: token.accessToken, expiresAt: token.expiresAt.toISOString(), itemId: itemId ?? null };
    },
  );

  // O app informa o id da conexão ao concluir o widget. Validamos posse e tipo no provedor.
  app.post(
    "/connections",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: { tags: ["open-finance"], body: registerConnectionBody, response: { 201: connectionDTO } },
    },
    async (req, reply) => {
      const user = req.user!;
      const runtime = gate(user);
      await runAs(req, async (tx, u) => {
        if (!(await hasOpenFinanceConsent(tx, u.id))) throw Errors.forbidden(CONSENT_MESSAGE, "OPEN_FINANCE_CONSENT_REQUIRED");
      });
      const dto = await viaProvider(() => registerConnection(runtime.deps, user.id, req.body.itemId, req.ip, req.body.autoImport));
      return reply.code(201).send(dto);
    },
  );

  app.get(
    "/connections",
    { schema: { tags: ["open-finance"], response: { 200: z.object({ data: z.array(connectionDTO) }) } } },
    async (req) => {
      const refreshes = await refreshCounts(app.prisma, req.user!.id, app.clock());
      return runAs(req, async (tx, user) => ({ data: await listConnections(tx, user.id, refreshes) }));
    },
  );

  // Liga/desliga a importação automática (contas, cartões e transações entram sozinhos).
  app.patch(
    "/connections/:id",
    { schema: { tags: ["open-finance"], params: idParam, body: updateConnectionBody, response: { 200: connectionDTO } } },
    async (req) => {
      await setAutoImport(app.prisma, req.user!.id, req.params.id, req.body.autoImport);
      return getConnectionDTO(app.prisma, req.user!.id, req.params.id, app.clock());
    },
  );

  // Pede ao banco uma nova leitura (o provedor já atualiza sozinho 1x ao dia; cada pedido consome a cota mensal do Open Finance).
  app.post(
    "/connections/:id/refresh",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
      schema: { tags: ["open-finance"], params: idParam, response: { 200: refreshResultDTO } },
    },
    async (req) => {
      const user = req.user!;
      const runtime = gate(user);
      await runAs(req, async (tx, u) => {
        const c = await tx.bankConnection.findFirst({ where: { id: req.params.id, userId: u.id, revokedAt: null }, select: { id: true } });
        if (!c) throw Errors.notFound("Conexão");
        if (!(await hasOpenFinanceConsent(tx, u.id))) throw Errors.forbidden(CONSENT_MESSAGE, "OPEN_FINANCE_CONSENT_REQUIRED");
      });
      return viaProvider(() => refreshConnection(runtime.deps, user.id, req.params.id, req.ip));
    },
  );

  app.delete(
    "/connections/:id",
    { schema: { tags: ["open-finance"], params: idParam, response: { 200: okResponse } } },
    async (req) => {
      const runtime = needRuntime();
      await viaProvider(() => revokeConnection(runtime.deps, req.params.id, req.user!.id, { ip: req.ip }));
      return { ok: true as const };
    },
  );

  app.post(
    "/connections/:id/sync",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: { tags: ["open-finance"], params: idParam, response: { 200: syncResultDTO } },
    },
    async (req) => {
      const user = req.user!;
      const runtime = gate(user);
      await runAs(req, async (tx, u) => {
        const c = await tx.bankConnection.findFirst({ where: { id: req.params.id, userId: u.id, revokedAt: null }, select: { id: true } });
        if (!c) throw Errors.notFound("Conexão");
        if (!(await hasOpenFinanceConsent(tx, u.id))) throw Errors.forbidden(CONSENT_MESSAGE, "OPEN_FINANCE_CONSENT_REQUIRED");
      });
      return viaProvider(() => syncConnection(runtime.deps, req.params.id));
    },
  );

  // Escolhe qual conta/cartão do app recebe as transações de cada conta do banco.
  app.put(
    "/connections/:id/accounts/:providerAccountId",
    { schema: { tags: ["open-finance"], params: providerAccountParams, body: linkAccountBody, response: { 200: connectionDTO } } },
    async (req) => {
      await runMutation(req, async (tx, user) =>
        linkProviderAccount(tx, user.id, req.params.id, req.params.providerAccountId, req.body),
      );
      return getConnectionDTO(app.prisma, req.user!.id, req.params.id, app.clock());
    },
  );

  // ---- Investimentos e visão geral (somente leitura; os dados já foram guardados pela sincronização)

  app.get(
    "/investments",
    { schema: { tags: ["open-finance"], querystring: listInvestmentsQuery, response: { 200: investmentsResponse } } },
    async (req) => runAs(req, async (tx, user) => listInvestments(tx, user.id, req.query)),
  );

  app.get(
    "/investments/:id",
    { schema: { tags: ["open-finance"], params: idParam, response: { 200: investmentDetailDTO } } },
    async (req) => runAs(req, async (tx, user) => getInvestmentDetail(tx, user.id, req.params.id, app.clock())),
  );

  // Saldo, limite e fatura informados pelo banco para as contas e cartões já vinculados.
  app.get(
    "/overview",
    { schema: { tags: ["open-finance"], response: { 200: bankOverviewDTO } } },
    async (req) => runAs(req, async (tx, user) => bankOverview(tx, user.id)),
  );

  // ---- Transações do banco (revisão antes de virar lançamento)

  app.get(
    "/bank-transactions",
    { schema: { tags: ["open-finance"], querystring: listBankTransactionsQuery, response: { 200: listOf(bankTransactionDTO) } } },
    async (req) => runAs(req, async (tx, user) => listBankTransactions(tx, user.id, req.query)),
  );

  app.post(
    "/bank-transactions/:id/import",
    {
      schema: {
        tags: ["open-finance"],
        params: idParam,
        body: importBankTransactionBody,
        response: { 201: z.object({ transactionId: z.uuid() }) },
      },
    },
    async (req, reply) => {
      const out = await runMutation(req, async (tx, user, ctx) =>
        importBankTransaction(tx, user, req.params.id, req.body, { notifier: app.notifier, now: app.clock() }, ctx),
      );
      return reply.code(201).send(out);
    },
  );

  app.post(
    "/bank-transactions/:id/match",
    { schema: { tags: ["open-finance"], params: idParam, body: matchBankTransactionBody, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => matchBankTransaction(tx, user.id, req.params.id, req.body.transactionId));
      return { ok: true as const };
    },
  );

  app.post(
    "/bank-transactions/:id/ignore",
    { schema: { tags: ["open-finance"], params: idParam, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => setBankTransactionIgnored(tx, user.id, req.params.id, true));
      return { ok: true as const };
    },
  );

  app.post(
    "/bank-transactions/:id/restore",
    { schema: { tags: ["open-finance"], params: idParam, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => setBankTransactionIgnored(tx, user.id, req.params.id, false));
      return { ok: true as const };
    },
  );
};

// ------------------------------------------------------------------------------ webhook

const webhookBody = z.looseObject({
  event: z.string().min(1).max(80),
  eventId: z.string().min(1).max(128).optional(),
  itemId: z.string().max(128).optional(),
  error: z.object({ code: z.union([z.string(), z.number()]).optional() }).nullish(),
});

/**
 * Webhook do provedor (sem login de usuário). Autenticado por segredo em cabeçalho, conferido ANTES
 * de ler o corpo. Responde rápido e processa em segundo plano; o payload é só um gatilho — os dados
 * sempre vêm da API do provedor.
 */
export const openFinanceWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/pluggy",
    {
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
      onRequest: async (req) => {
        const runtime = app.openFinance;
        if (!runtime || !runtime.provider.verifyWebhook(req.headers)) {
          throw Errors.unauthorized("Webhook não autorizado", "WEBHOOK_UNAUTHORIZED");
        }
      },
      schema: { tags: ["webhooks"], body: webhookBody, response: { 200: z.object({ ok: z.literal(true), duplicate: z.boolean() }) } },
    },
    async (req) => {
      const key = createHash("sha256").update(JSON.stringify(req.body)).digest("hex");
      const { duplicate } = await acceptWebhook(app.openFinance!, req.body as never, key);
      return { ok: true as const, duplicate };
    },
  );
};
