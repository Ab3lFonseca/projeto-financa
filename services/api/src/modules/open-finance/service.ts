import type { Prisma, PrismaClient } from "@app/database";
import { addDays, fromISODate, toISODate, type BankTransactionDTO, type ConnectionDTO, type ImportBankTransactionBody, type ISODate } from "@app/shared";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit";
import type { OpCtx, Tx } from "../../lib/db";
import { dateOut, num, tsOut } from "../../lib/dto";
import { AppError, Errors } from "../../lib/errors";
import { decodeCursor, encodeCursor, slicePage } from "../../lib/pagination";
import { limitsFor, resolvePlan } from "../../lib/plan";
import type { AuthUser } from "../../types";
import { createNotifications, type NewNotification } from "../notifications/service";
import type { PushNotifier } from "../notifications/notifier";
import { createTransactions } from "../transactions/service";
import { anchorOpeningBalance, autoImportNew, autoLinkAccounts, cleanDescription, guessPaymentMethod, suggestMatch } from "./auto-import";
import { cardBankData, syncInvestments } from "./investments";
import { ProviderError, type OpenFinanceProvider, type ProviderConnector, type ProviderItem } from "./provider";

/** Primeira sincronização busca os últimos 90 dias; as seguintes, desde a última (com folga). */
const FIRST_SYNC_DAYS = 90;
const OVERLAP_DAYS = 7;
const REVOKE_PENDING = "REVOKE_PENDING";

export type OfDeps = {
  prisma: PrismaClient;
  provider: OpenFinanceProvider;
  notifier: PushNotifier;
  now: () => Date;
  billingEnforced: boolean;
  pepper: string;
  /** Deep link do app para onde o banco devolve o usuário após autorizar. */
  redirectUri?: string;
  /** Idem, para o app web (o deep link do app não abre no navegador). */
  webRedirectUri?: string;
  log?: FastifyBaseLogger;
};

const CONNECTORS_TTL_MS = 6 * 3600_000;

/** Agrupa as dependências e acompanha tarefas em segundo plano (webhooks), para encerrar/testar com calma. */
export class OpenFinanceRuntime {
  private readonly pending = new Set<Promise<unknown>>();
  private connectors: { at: number; list: ProviderConnector[] } | null = null;
  constructor(readonly deps: OfDeps) {}

  /** Bancos regulados (cache de 6 h: o catálogo muda raramente e o provedor limita requisições). */
  async regulatedConnectors(): Promise<ProviderConnector[]> {
    const now = this.deps.now().getTime();
    if (this.connectors && now - this.connectors.at < CONNECTORS_TTL_MS) return this.connectors.list;
    const list = await this.deps.provider.listRegulatedConnectors();
    // Lista vazia não é guardada: pode ser falha transitória e o app não deve ficar sem bancos por 6 h.
    if (list.length > 0) this.connectors = { at: now, list };
    return list;
  }

  get provider(): OpenFinanceProvider {
    return this.deps.provider;
  }

  track(task: Promise<unknown>): void {
    const p = task.catch((err) => this.deps.log?.error({ err }, "tarefa de Open Finance falhou")).finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}

// ---------------------------------------------------------------------------- DTOs

const refSelect = { select: { id: true, name: true, deletedAt: true } } as const;
const connectionInclude = {
  // Conta e cartão nascem no mesmo instante: o desempate fixa a ordem (contas primeiro, depois cartões).
  accounts: { include: { account: refSelect, card: refSelect }, orderBy: [{ createdAt: "asc" }, { kind: "asc" }, { providerAccountId: "asc" }] },
} satisfies Prisma.BankConnectionInclude;

type ConnectionRow = Prisma.BankConnectionGetPayload<{ include: typeof connectionInclude }>;
const ref = (x: { id: string; name: string; deletedAt: Date | null }) => ({ id: x.id, name: x.name, deleted: x.deletedAt !== null });

type ConnectionStats = { pending: number; investments: number; refreshes: number };

function toConnectionDTO(c: ConnectionRow, stats: ConnectionStats): ConnectionDTO {
  return {
    id: c.id,
    provider: c.provider,
    institutionName: c.institutionName,
    status: c.status,
    consentGrantedAt: c.consentGrantedAt ? tsOut(c.consentGrantedAt) : null,
    consentExpiresAt: c.consentExpiresAt ? tsOut(c.consentExpiresAt) : null,
    lastSyncAt: c.lastSyncAt ? tsOut(c.lastSyncAt) : null,
    lastErrorCode: c.lastErrorCode,
    accounts: c.accounts.map((a) => ({
      providerAccountId: a.providerAccountId,
      name: a.displayName ?? "Conta",
      kind: a.kind === "CREDIT" ? "CREDIT" : "BANK",
      balanceCents: a.balanceCents === null ? null : num(a.balanceCents),
      credit: a.kind === "CREDIT" ? cardBankData(a) : null,
      dataUpdatedAt: a.providerDataAt ? tsOut(a.providerDataAt) : null,
      account: a.account ? ref(a.account) : null,
      card: a.card ? ref(a.card) : null,
    })),
    autoImport: c.autoImport,
    pendingCount: stats.pending,
    investmentCount: stats.investments,
    refreshesLeftToday: Math.max(0, MAX_REFRESHES_PER_DAY - stats.refreshes),
  };
}

async function connectionStats(tx: Tx | PrismaClient, userId: string, ids: string[], refreshes: Map<string, number>): Promise<Map<string, ConnectionStats>> {
  const out = new Map<string, ConnectionStats>(ids.map((id) => [id, { pending: 0, investments: 0, refreshes: refreshes.get(id) ?? 0 }]));
  if (ids.length === 0) return out;
  const db = tx as Tx;
  const pending = await db.bankTransaction.groupBy({ by: ["connectionId"], where: { userId, connectionId: { in: ids }, status: "NEW" }, _count: { _all: true } });
  for (const g of pending) out.get(g.connectionId)!.pending = g._count._all;
  const investments = await db.bankInvestment.groupBy({ by: ["connectionId"], where: { userId, connectionId: { in: ids }, closedAt: null }, _count: { _all: true } });
  for (const g of investments) out.get(g.connectionId)!.investments = g._count._all;
  return out;
}

/** `refreshes` = pedidos de atualização nas últimas 24 h por conexão (vem do log de auditoria: ver `refreshCounts`). */
export async function listConnections(tx: Tx, userId: string, refreshes: Map<string, number> = new Map()): Promise<ConnectionDTO[]> {
  const rows = await tx.bankConnection.findMany({
    where: { userId, revokedAt: null },
    include: connectionInclude,
    orderBy: { createdAt: "asc" },
  });
  const stats = await connectionStats(tx, userId, rows.map((r) => r.id), refreshes);
  return rows.map((r) => toConnectionDTO(r, stats.get(r.id)!));
}

export async function getConnectionDTO(prisma: PrismaClient, userId: string, id: string, now: Date = new Date()): Promise<ConnectionDTO> {
  const row = await prisma.bankConnection.findFirst({ where: { id, userId, revokedAt: null }, include: connectionInclude });
  if (!row) throw Errors.notFound("Conexão");
  const stats = await connectionStats(prisma, userId, [row.id], await refreshCounts(prisma, userId, now));
  return toConnectionDTO(row, stats.get(row.id)!);
}

// ---------------------------------------------------------------------------- plano e consentimento

export async function userHasOpenFinance(deps: Pick<OfDeps, "prisma" | "billingEnforced" | "now">, userId: string): Promise<boolean> {
  const subscription = await deps.prisma.subscription.findUnique({ where: { userId } });
  const plan = resolvePlan(subscription, deps.billingEnforced, deps.now());
  return limitsFor(plan).openFinance;
}

export async function hasOpenFinanceConsent(tx: Tx | PrismaClient, userId: string): Promise<boolean> {
  const c = await (tx as Tx).consent.findFirst({ where: { userId, type: "OPEN_FINANCE", revokedAt: null }, select: { id: true } });
  return c !== null;
}

// ---------------------------------------------------------------------------- notificações

async function notifyUser(deps: OfDeps, userId: string, item: NewNotification): Promise<void> {
  const callbacks: Array<() => Promise<void> | void> = [];
  const ctx: OpCtx = { afterCommit: (cb) => void callbacks.push(cb) };
  await deps.prisma.$transaction((tx) => createNotifications(tx, userId, [item], ctx, deps.notifier));
  for (const cb of callbacks) {
    try {
      await cb();
    } catch (err) {
      deps.log?.error({ err }, "falha ao enviar push do Open Finance");
    }
  }
}

// ---------------------------------------------------------------------------- conexão

/**
 * Registra a conexão que o usuário acabou de autorizar no fluxo oficial do banco.
 * Segurança: só aceitamos conexões (1) que NÓS iniciamos para este usuário (clientUserId) e
 * (2) de conectores regulados do Open Finance — nunca coleta por usuário/senha do banco.
 */
export async function registerConnection(deps: OfDeps, userId: string, itemId: string, ip?: string, autoImport?: boolean): Promise<ConnectionDTO> {
  const { prisma, provider } = deps;
  const item = await provider.getItem(itemId);
  if (!item) throw Errors.notFound("Conexão");
  if (item.clientUserId !== userId) {
    throw Errors.forbidden("Esta conexão não pertence à sua conta", "ITEM_NOT_OWNED");
  }
  if (!item.isOpenFinance) {
    // Remove no provedor para não deixar uma conexão por credencial ativa.
    await provider.deleteItem(itemId).catch((err) => deps.log?.warn({ err }, "não foi possível remover conexão não regulada"));
    throw Errors.unprocessable(
      "Só aceitamos bancos conectados pelo Open Finance regulado. Não pedimos usuário e senha do banco.",
      "NOT_OPEN_FINANCE",
    );
  }

  const now = deps.now();
  const existing = await prisma.bankConnection.findUnique({
    where: { provider_providerItemId: { provider: provider.name, providerItemId: itemId } },
  });
  if (existing && existing.userId !== userId) throw Errors.forbidden("Esta conexão não pertence à sua conta", "ITEM_NOT_OWNED");

  const common = {
    institutionName: item.institutionName.slice(0, 120),
    status: item.status,
    consentExpiresAt: item.consentExpiresAt,
    lastErrorCode: item.errorCode,
  };
  const connection = existing
    ? await prisma.bankConnection.update({
        where: { id: existing.id },
        data: { ...common, ...(autoImport !== undefined ? { autoImport } : {}), revokedAt: null, consentGrantedAt: existing.revokedAt ? now : existing.consentGrantedAt },
      })
    : await prisma.bankConnection.create({
        data: { userId, provider: provider.name, providerItemId: itemId, consentGrantedAt: now, autoImport: autoImport ?? true, ...common },
      });

  await audit(prisma, deps.pepper, { actorId: userId, action: "open_finance.connected", entity: "bank_connection", entityId: connection.id, ip }, deps.log);

  // Já traz as contas disponíveis. Falha aqui não invalida a conexão (o banco pode ainda estar processando).
  try {
    await syncConnection(deps, connection.id);
  } catch (err) {
    deps.log?.warn({ err }, "primeira sincronização do Open Finance falhou");
  }
  return getConnectionDTO(prisma, userId, connection.id, deps.now());
}

/** Vincula (ou desvincula) uma conta do banco a uma conta/cartão do app. Só vinculadas são sincronizadas. */
export async function linkProviderAccount(
  tx: Tx,
  userId: string,
  connectionId: string,
  providerAccountId: string,
  target: { accountId?: string | null; cardId?: string | null },
): Promise<void> {
  const link = await tx.bankConnectionAccount.findFirst({ where: { userId, connectionId, providerAccountId, connection: { revokedAt: null } } });
  if (!link) throw Errors.notFound("Conta do banco");

  if (target.accountId) {
    if (link.kind !== "BANK") throw Errors.unprocessable("Um cartão do banco só pode ser vinculado a um cartão do app", "KIND_MISMATCH");
    const account = await tx.account.findFirst({ where: { id: target.accountId, userId, deletedAt: null, archivedAt: null } });
    if (!account) throw Errors.unprocessable("Conta não encontrada", "ACCOUNT_NOT_FOUND", { field: "accountId" });
    const taken = await tx.bankConnectionAccount.findFirst({ where: { userId, accountId: account.id, NOT: { id: link.id } } });
    if (taken) throw Errors.conflict("Esta conta do app já está vinculada a outra conta do banco", "ALREADY_LINKED");
  }
  if (target.cardId) {
    if (link.kind !== "CREDIT") throw Errors.unprocessable("Uma conta do banco só pode ser vinculada a uma conta do app", "KIND_MISMATCH");
    const card = await tx.creditCard.findFirst({ where: { id: target.cardId, userId, deletedAt: null, archivedAt: null } });
    if (!card) throw Errors.unprocessable("Cartão não encontrado", "CARD_NOT_FOUND", { field: "cardId" });
    const taken = await tx.bankConnectionAccount.findFirst({ where: { userId, cardId: card.id, NOT: { id: link.id } } });
    if (taken) throw Errors.conflict("Este cartão do app já está vinculado a outro cartão do banco", "ALREADY_LINKED");
  }
  await tx.bankConnectionAccount.update({
    where: { id: link.id },
    data: { accountId: target.accountId ?? null, cardId: target.cardId ?? null },
  });
}

// ---------------------------------------------------------------------------- sincronização

export type SyncResult = { newTransactions: number; accounts: number; investments: number; status: ConnectionRow["status"] };

async function markFailed(deps: OfDeps, connectionId: string, userId: string, item: ProviderItem): Promise<void> {
  const day = toISODate(deps.now());
  await notifyUser(deps, userId, {
    type: "SYNC_FAILED",
    title: "Conexão com o banco precisa de atenção",
    body: `Não conseguimos atualizar os dados de ${item.institutionName}. Abra o Open Finance para reconectar.`,
    data: { connectionId },
    dedupeKey: `of-fail:${connectionId}:${day}`,
  });
}

/** Sincronizações em andamento por conexão: webhook + pedido manual ao mesmo tempo viram uma só. */
const inflight = new Map<string, Promise<SyncResult>>();

/**
 * Atualiza uma conexão: status, contas, cartões (limite/fatura), transações novas e investimentos.
 * Com `autoImport` (padrão), também cria as contas/cartões que faltam e importa as transações sozinha.
 * Idempotente (reprocessar não duplica) e tolerante a corridas entre webhook e sincronização manual.
 * Roda com acesso direto ao banco (sem RLS), então TODA consulta filtra por userId da conexão.
 */
export function syncConnection(deps: OfDeps, connectionId: string): Promise<SyncResult> {
  const running = inflight.get(connectionId);
  if (running) return running;
  const p = syncConnectionOnce(deps, connectionId).finally(() => inflight.delete(connectionId));
  inflight.set(connectionId, p);
  return p;
}

async function syncConnectionOnce(deps: OfDeps, connectionId: string): Promise<SyncResult> {
  const { prisma, provider } = deps;
  const conn = await prisma.bankConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.revokedAt || conn.status === "REVOKED") throw Errors.notFound("Conexão");
  const userId = conn.userId;
  const now = deps.now();

  const item = await provider.getItem(conn.providerItemId);
  if (!item) {
    // Removida no provedor (ex.: usuário revogou no app do banco).
    await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: "REVOKED", revokedAt: now } });
    return { newTransactions: 0, accounts: 0, investments: 0, status: "REVOKED" };
  }

  await prisma.bankConnection.update({
    where: { id: conn.id },
    data: { status: item.status, lastErrorCode: item.errorCode, consentExpiresAt: item.consentExpiresAt, institutionName: item.institutionName.slice(0, 120) },
  });
  if (item.status === "ERROR") {
    await markFailed(deps, conn.id, userId, item);
    return { newTransactions: 0, accounts: 0, investments: 0, status: "ERROR" };
  }
  if (item.status === "CONNECTING") return { newTransactions: 0, accounts: 0, investments: 0, status: "CONNECTING" };

  const accounts = await provider.listAccounts(conn.providerItemId);
  for (const a of accounts) {
    const credit = a.credit;
    const fields = {
      displayName: a.name,
      kind: a.kind,
      balanceCents: a.balanceCents,
      providerDataAt: now,
      // Dados do cartão exatamente como o banco informou (em conta, ficam vazios).
      creditLimitCents: credit?.limitCents ?? null,
      availableCreditCents: credit?.availableCents ?? null,
      minimumPaymentCents: credit?.minimumPaymentCents ?? null,
      billCloseDate: credit?.closeDate ? fromISODate(credit.closeDate) : null,
      billDueDate: credit?.dueDate ? fromISODate(credit.dueDate) : null,
      cardBrand: credit?.brand ?? null,
    };
    await prisma.bankConnectionAccount.upsert({
      where: { connectionId_providerAccountId: { connectionId: conn.id, providerAccountId: a.id } },
      create: { userId, connectionId: conn.id, providerAccountId: a.id, ...fields },
      update: fields,
    });
  }

  const info = { id: conn.id, userId, institutionName: item.institutionName.slice(0, 120) };
  const autoDeps = { prisma, notifier: deps.notifier, now: deps.now, billingEnforced: deps.billingEnforced, log: deps.log };

  let links = await prisma.bankConnectionAccount.findMany({ where: { connectionId: conn.id, userId } });
  const createdAccounts = new Map<string, { accountId: string; balanceCents: number | null }>();
  let accountsCreated = 0;
  let cardsCreated = 0;
  if (conn.autoImport) {
    const linked = await autoLinkAccounts(autoDeps, info, links);
    accountsCreated = linked.accounts;
    cardsCreated = linked.cards;
    for (const c of linked.createdAccounts) createdAccounts.set(c.linkId, { accountId: c.accountId, balanceCents: c.balanceCents });
    if (linked.accounts + linked.cards > 0) links = await prisma.bankConnectionAccount.findMany({ where: { connectionId: conn.id, userId } });
  }

  const today = toISODate(now);
  const defaultFrom: ISODate = conn.lastSyncAt ? addDays(toISODate(conn.lastSyncAt), -OVERLAP_DAYS) : addDays(today, -FIRST_SYNC_DAYS);

  let fresh = 0;
  let imported = 0;
  let matched = 0;
  // Cartões primeiro: o débito que paga a fatura (na conta corrente) só consegue quitá-la se as compras já estiverem importadas.
  const ordered = links.filter((l) => l.accountId || l.cardId).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "CREDIT" ? -1 : 1));
  for (const acct of ordered) {
    // Conta vinculada depois da primeira sincronização ainda não tem histórico: busca a janela inicial completa.
    const hasHistory = (await prisma.bankTransaction.count({ where: { userId, connectionId: conn.id, providerAccountId: acct.providerAccountId } })) > 0;
    const fromDate = hasHistory ? defaultFrom : addDays(today, -FIRST_SYNC_DAYS);
    const txs = await provider.listTransactions(acct.providerAccountId, acct.kind === "CREDIT" ? "CREDIT" : "BANK", fromDate);
    // Só lançamentos efetivados: os pendentes costumam mudar de id ao efetivar (geraria duplicatas).
    const posted = txs.filter((t) => t.status === "POSTED");
    for (let i = 0; i < posted.length; i += 500) {
      const chunk = posted.slice(i, i + 500);
      const created = await prisma.bankTransaction.createManyAndReturn({
        data: chunk.map((t) => ({
          userId,
          connectionId: conn.id,
          providerAccountId: acct.providerAccountId,
          providerTxId: t.id,
          amountCents: t.amountCents,
          direction: t.direction,
          postedOn: fromISODate(t.postedOn),
          descriptionRaw: t.description,
          // Em cartão, crédito = pagamento de fatura/estorno: a fatura é paga pela conta, então não duplica.
          status: acct.kind === "CREDIT" && t.direction === "CREDIT" ? ("IGNORED" as const) : ("NEW" as const),
        })),
        skipDuplicates: true,
        select: { status: true },
      });
      fresh += created.filter((c) => c.status === "NEW").length;
    }
    if (conn.autoImport) {
      const r = await autoImportNew(autoDeps, info, acct);
      imported += r.imported;
      matched += r.matched;
      // Conta criada agora: o saldo inicial é ancorado no saldo do banco, depois de importar o histórico.
      const created = createdAccounts.get(acct.id);
      if (created) await anchorOpeningBalance(autoDeps, userId, created.accountId, created.balanceCents);
    }
  }

  const investments = await syncInvestments(prisma, provider, { id: conn.id, userId, providerItemId: conn.providerItemId }, { partial: item.partial, now, log: deps.log });

  await prisma.bankConnection.update({ where: { id: conn.id }, data: { lastSyncAt: now, status: item.status === "OUTDATED" ? "OUTDATED" : "ACTIVE" } });

  if (conn.autoImport && imported + matched > 0) {
    await notifyUser(deps, userId, {
      type: "TRANSACTION_SYNCED",
      title: "Transações importadas do seu banco",
      body: `${imported} ${imported === 1 ? "transação foi importada" : "transações foram importadas"} automaticamente${matched > 0 ? ` e ${matched} já estavam lançadas` : ""}.`,
      data: { connectionId: conn.id },
      dedupeKey: `of-new:${conn.id}:${today}`,
    });
  } else if (!conn.autoImport && fresh > 0) {
    await notifyUser(deps, userId, {
      type: "TRANSACTION_SYNCED",
      title: "Novas transações do seu banco",
      body: `${fresh} ${fresh === 1 ? "transação nova está" : "transações novas estão"} aguardando sua revisão.`,
      data: { connectionId: conn.id },
      dedupeKey: `of-new:${conn.id}:${today}`,
    });
  }
  if (accountsCreated + cardsCreated > 0) deps.log?.info({ connectionId: conn.id, accountsCreated, cardsCreated }, "contas/cartões criados automaticamente a partir do banco");
  return { newTransactions: fresh, accounts: accounts.length, investments, status: item.status === "OUTDATED" ? "OUTDATED" : "ACTIVE" };
}

// ---------------------------------------------------------------------------- pedido de atualização ao banco

/** Quantos pedidos de atualização ao banco por dia (a rede do Open Finance limita as consultas por mês). */
export const MAX_REFRESHES_PER_DAY = 3;
const MIN_REFRESH_GAP_MS = 30 * 60_000;
const DAY_MS = 86_400_000;

/** Pedidos de atualização das últimas 24 h por conexão (a contagem vem do log de auditoria). */
export async function refreshCounts(prisma: PrismaClient, userId: string, now: Date): Promise<Map<string, number>> {
  const groups = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: { actorId: userId, action: "open_finance.refresh", createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    _count: { _all: true },
  });
  return new Map(groups.flatMap((g) => (g.entityId ? [[g.entityId, g._count._all] as const] : [])));
}

/**
 * Pede ao provedor uma NOVA coleta no banco. O provedor já atualiza sozinho uma vez ao dia e avisa por webhook; este
 * pedido existe para o usuário forçar uma leitura (ex.: acabou de receber o pagamento). Como cada coleta consome a cota
 * mensal do Open Finance por produto, há limite diário e um intervalo mínimo entre pedidos.
 */
export async function refreshConnection(deps: OfDeps, userId: string, connectionId: string, ip?: string): Promise<{ requested: true; refreshesLeftToday: number }> {
  const { prisma, provider } = deps;
  const conn = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId, revokedAt: null } });
  if (!conn) throw Errors.notFound("Conexão");
  const now = deps.now();
  const recent = await prisma.auditLog.findMany({
    where: { actorId: userId, action: "open_finance.refresh", entityId: conn.id, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
    take: MAX_REFRESHES_PER_DAY,
  });
  if (recent.length >= MAX_REFRESHES_PER_DAY) {
    const nextAt = new Date(recent[recent.length - 1]!.createdAt.getTime() + DAY_MS);
    throw new AppError(429, "REFRESH_LIMIT", `Você já pediu ${MAX_REFRESHES_PER_DAY} atualizações hoje. O banco limita as consultas por mês; os dados também se atualizam sozinhos uma vez ao dia.`, { nextAt: nextAt.toISOString() });
  }
  const last = recent[0]?.createdAt;
  if (last && now.getTime() - last.getTime() < MIN_REFRESH_GAP_MS) {
    const retryAfterSeconds = Math.ceil((MIN_REFRESH_GAP_MS - (now.getTime() - last.getTime())) / 1000);
    throw new AppError(429, "REFRESH_TOO_SOON", "Aguarde alguns minutos para pedir outra atualização.", { retryAfterSeconds });
  }
  await provider.refreshItem(conn.providerItemId);
  await audit(prisma, deps.pepper, { actorId: userId, action: "open_finance.refresh", entity: "bank_connection", entityId: conn.id, ip, at: now }, deps.log);
  return { requested: true, refreshesLeftToday: MAX_REFRESHES_PER_DAY - recent.length - 1 };
}

/** Liga/desliga a importação automática da conexão. */
export async function setAutoImport(prisma: PrismaClient, userId: string, connectionId: string, autoImport: boolean): Promise<void> {
  const r = await prisma.bankConnection.updateMany({ where: { id: connectionId, userId, revokedAt: null }, data: { autoImport } });
  if (r.count === 0) throw Errors.notFound("Conexão");
}

// ---------------------------------------------------------------------------- revogação

/**
 * Encerra a conexão no provedor e localmente. Se o provedor falhar, a conexão fica marcada como
 * REVOKE_PENDING e o job tenta de novo — o consentimento nunca fica ativo "por esquecimento".
 */
export async function revokeConnection(deps: OfDeps, connectionId: string, userId: string, opts: { ip?: string; strict?: boolean } = {}): Promise<void> {
  const { prisma, provider } = deps;
  const conn = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) throw Errors.notFound("Conexão");
  if (conn.revokedAt) return;

  try {
    await provider.deleteItem(conn.providerItemId);
  } catch (err) {
    await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: "ERROR", lastErrorCode: REVOKE_PENDING } });
    deps.log?.error({ err, connectionId }, "revogação no provedor falhou; será repetida");
    if (opts.strict) throw err;
    if (err instanceof ProviderError) throw Errors.upstream("Não foi possível encerrar a conexão agora. Vamos tentar de novo automaticamente.", "REVOKE_PENDING");
    throw err;
  }
  await finalizeRevocation(prisma, conn.id, userId, deps.now());
  await audit(prisma, deps.pepper, { actorId: userId, action: "open_finance.revoked", entity: "bank_connection", entityId: conn.id, ip: opts.ip }, deps.log);
}

async function finalizeRevocation(prisma: PrismaClient, connectionId: string, userId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.bankConnection.update({ where: { id: connectionId }, data: { status: "REVOKED", revokedAt: now, lastErrorCode: null } });
    // Dados brutos que o usuário nunca aproveitou não têm por que ficar guardados.
    await tx.bankTransaction.deleteMany({ where: { userId, connectionId, status: { in: ["NEW", "IGNORED"] } } });
    // Investimentos e histórico vieram só desse consentimento: saem junto com ele.
    await tx.bankInvestmentSnapshot.deleteMany({ where: { userId, investment: { connectionId } } });
    await tx.bankInvestment.deleteMany({ where: { userId, connectionId } });
  });
}

/** Revoga todas as conexões do usuário (consentimento retirado ou conta excluída). */
export async function revokeAllConnections(deps: OfDeps, userId: string, opts: { ip?: string; strict?: boolean } = {}): Promise<void> {
  const conns = await deps.prisma.bankConnection.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
  let failure: unknown = null;
  for (const c of conns) {
    try {
      await revokeConnection(deps, c.id, userId, { ...opts, strict: true });
    } catch (err) {
      failure ??= err;
    }
  }
  if (failure && !opts.strict) {
    // A UI não precisa saber qual falhou: o job repete. O consentimento local já foi retirado.
    deps.log?.error({ err: failure, userId }, "algumas conexões continuam pendentes de revogação");
    return;
  }
  if (failure) throw failure;
}

// ---------------------------------------------------------------------------- webhook

export type PluggyWebhookPayload = { event: string; eventId?: string; itemId?: string; error?: { code?: string } | null } & Record<string, unknown>;

/** Grava o evento (idempotente) e, se for novo, processa em segundo plano. Retorna se era repetido. */
export async function acceptWebhook(runtime: OpenFinanceRuntime, payload: PluggyWebhookPayload, rawKey: string): Promise<{ duplicate: boolean }> {
  const { prisma, provider } = runtime.deps;
  const eventId = (payload.eventId ?? rawKey).slice(0, 128);
  try {
    await prisma.webhookEvent.create({
      data: { provider: provider.name, eventId, eventType: payload.event.slice(0, 80), payload: payload as Prisma.InputJsonValue },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { duplicate: true };
    throw err;
  }
  runtime.track(processWebhook(runtime.deps, eventId, payload));
  return { duplicate: false };
}

async function processWebhook(deps: OfDeps, eventId: string, payload: PluggyWebhookPayload): Promise<void> {
  const { prisma, provider } = deps;
  let error: string | null = null;
  try {
    if (payload.itemId) {
      const conn = await prisma.bankConnection.findUnique({
        where: { provider_providerItemId: { provider: provider.name, providerItemId: payload.itemId } },
      });
      if (conn && !conn.revokedAt) {
        // O payload só serve de gatilho: os dados sempre vêm da API do provedor (autenticada).
        if (payload.event === "item/deleted") {
          await finalizeRevocation(prisma, conn.id, conn.userId, deps.now());
        } else if (payload.event === "item/error") {
          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { status: "ERROR", lastErrorCode: (payload.error?.code ? String(payload.error.code) : "ITEM_ERROR").slice(0, 64) },
          });
        } else if (/^(item\/(created|updated|login_succeeded)|transactions\/(created|updated|deleted))$/.test(payload.event)) {
          if (await userHasOpenFinance(deps, conn.userId)) await syncConnection(deps, conn.id);
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 400) : "erro desconhecido";
    deps.log?.error({ err, event: payload.event }, "falha ao processar webhook do Open Finance");
  }
  await prisma.webhookEvent
    .update({ where: { provider_eventId: { provider: provider.name, eventId } }, data: { processedAt: deps.now(), error } })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------- job periódico

/** Reenvia revogações pendentes e atualiza conexões que ficaram mais de 24 h sem sincronizar. */
/** `userIds` restringe a rotina a esses usuários (operação pontual e testes); sem ele, vale para todos. */
export async function runOpenFinanceJob(deps: OfDeps, opts: { userIds?: string[] } = {}): Promise<{ revoked: number; synced: number; failed: number }> {
  const { prisma } = deps;
  const only = opts.userIds ? { userId: { in: opts.userIds } } : {};
  let revoked = 0;
  let synced = 0;
  let failed = 0;

  const pending = await prisma.bankConnection.findMany({ where: { ...only, revokedAt: null, lastErrorCode: REVOKE_PENDING }, take: 50 });
  for (const c of pending) {
    try {
      await revokeConnection(deps, c.id, c.userId, { strict: true });
      revoked++;
    } catch {
      failed++;
    }
  }

  const cutoff = new Date(deps.now().getTime() - 24 * 3600_000);
  const stale = await prisma.bankConnection.findMany({
    where: {
      ...only,
      revokedAt: null,
      status: { in: ["ACTIVE", "OUTDATED"] },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    take: 50,
  });
  for (const c of stale) {
    try {
      if (!(await userHasOpenFinance(deps, c.userId))) continue;
      if (!(await hasOpenFinanceConsent(prisma, c.userId))) continue;
      await syncConnection(deps, c.id);
      synced++;
    } catch (err) {
      failed++;
      // Falha temporária do provedor não é motivo para alarmar: tentamos no próximo ciclo.
      if (!(err instanceof ProviderError && err.retryable)) deps.log?.warn({ err, connectionId: c.id }, "sincronização periódica falhou");
    }
  }
  return { revoked, synced, failed };
}

// ---------------------------------------------------------------------------- transações do banco

type BtRow = Prisma.BankTransactionGetPayload<object>;

export async function listBankTransactions(
  tx: Tx,
  userId: string,
  q: { status: BtRow["status"]; connectionId?: string; cursor?: string; limit: number },
): Promise<{ data: BankTransactionDTO[]; page: { nextCursor: string | null; hasMore: boolean } }> {
  const cursor = q.cursor ? decodeCursor(q.cursor, cursorShape) : null;
  const rows = await tx.bankTransaction.findMany({
    where: {
      userId,
      status: q.status,
      ...(q.connectionId ? { connectionId: q.connectionId } : {}),
      connection: { revokedAt: null },
      ...(cursor ? { OR: [{ postedOn: { lt: fromISODate(cursor.d) } }, { postedOn: fromISODate(cursor.d), id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ postedOn: "desc" }, { id: "desc" }],
    take: q.limit + 1,
  });
  const { items, hasMore } = slicePage(rows, q.limit);

  const connIds = [...new Set(items.map((r) => r.connectionId))];
  const links = connIds.length
    ? await tx.bankConnectionAccount.findMany({ where: { userId, connectionId: { in: connIds } }, include: { account: refSelect, card: refSelect, connection: { select: { institutionName: true } } } })
    : [];
  const linkOf = (r: BtRow) => links.find((l) => l.connectionId === r.connectionId && l.providerAccountId === r.providerAccountId);

  const data: BankTransactionDTO[] = [];
  for (const r of items) {
    const link = linkOf(r);
    data.push({
      id: r.id,
      connectionId: r.connectionId,
      institutionName: link?.connection.institutionName ?? "Banco",
      accountName: link?.displayName ?? "Conta",
      amountCents: num(r.amountCents),
      direction: r.direction,
      postedOn: dateOut(r.postedOn),
      description: r.descriptionRaw,
      status: r.status,
      account: link?.account ? ref(link.account) : null,
      card: link?.card ? ref(link.card) : null,
      suggestedMatch: r.status === "NEW" ? await suggestMatch(tx, userId, r, link) : null,
    });
  }
  const last = items[items.length - 1];
  return { data, page: { hasMore, nextCursor: hasMore && last ? encodeCursor({ d: dateOut(last.postedOn), id: last.id }) : null } };
}

const cursorShape = z.object({ d: z.string(), id: z.uuid() });

async function requireBankTransaction(tx: Tx, userId: string, id: string, allowed: BtRow["status"][]): Promise<BtRow> {
  const bt = await tx.bankTransaction.findFirst({ where: { id, userId, connection: { revokedAt: null } } });
  if (!bt) throw Errors.notFound("Transação do banco");
  if (!allowed.includes(bt.status)) {
    throw Errors.conflict("Esta transação já foi tratada", "BANK_TRANSACTION_HANDLED", { status: bt.status });
  }
  return bt;
}

/** Transforma uma transação do banco em lançamento do app (na conta/cartão vinculado). */
export async function importBankTransaction(
  tx: Tx,
  user: AuthUser,
  id: string,
  body: ImportBankTransactionBody,
  deps: { notifier: PushNotifier; now: Date },
  ctx: OpCtx,
): Promise<{ transactionId: string }> {
  const bt = await requireBankTransaction(tx, user.id, id, ["NEW", "IGNORED"]);
  const link = await tx.bankConnectionAccount.findFirst({
    where: { userId: user.id, connectionId: bt.connectionId, providerAccountId: bt.providerAccountId },
  });
  if (!link || (!link.accountId && !link.cardId)) {
    throw Errors.unprocessable("Vincule esta conta do banco a uma conta ou cartão do app antes de importar", "ACCOUNT_NOT_LINKED");
  }
  if (link.cardId && bt.direction === "CREDIT") {
    throw Errors.unprocessable("Pagamentos e estornos de fatura não viram lançamento. Use Ignorar.", "CARD_CREDIT_NOT_IMPORTABLE");
  }

  const { rows } = await createTransactions(
    tx,
    user,
    {
      type: bt.direction === "CREDIT" ? "INCOME" : "EXPENSE",
      description: body.description ?? cleanDescription(bt.descriptionRaw),
      amountCents: num(bt.amountCents),
      occurredOn: dateOut(bt.postedOn),
      accountId: link.accountId,
      cardId: link.cardId,
      categoryId: body.categoryId ?? null,
      paymentMethod: link.cardId ? "CREDIT" : (body.paymentMethod ?? guessPaymentMethod(bt.descriptionRaw)),
      status: "POSTED",
    },
    deps,
    ctx,
  );
  const created = rows[0]!;
  // A origem fica registrada pelo vínculo com a transação do banco (bank_transaction_id).
  await tx.transaction.update({ where: { id: created.id }, data: { bankTransactionId: bt.id } });
  await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: "IMPORTED" } });
  return { transactionId: created.id };
}

/** Marca que a transação do banco é a mesma de um lançamento manual (evita duplicar). */
export async function matchBankTransaction(tx: Tx, userId: string, id: string, transactionId: string): Promise<void> {
  const bt = await requireBankTransaction(tx, userId, id, ["NEW", "IGNORED"]);
  const target = await tx.transaction.findFirst({ where: { id: transactionId, userId, deletedAt: null } });
  if (!target) throw Errors.unprocessable("Lançamento não encontrado", "TRANSACTION_NOT_FOUND", { field: "transactionId" });
  if (target.bankTransactionId) throw Errors.conflict("Este lançamento já está ligado a outra transação do banco", "ALREADY_MATCHED");
  const expectedType = bt.direction === "CREDIT" ? "INCOME" : "EXPENSE";
  if (target.type !== expectedType || target.amountCents !== bt.amountCents) {
    throw Errors.unprocessable("O lançamento precisa ter o mesmo tipo e valor da transação do banco", "MATCH_MISMATCH");
  }
  await tx.transaction.update({ where: { id: target.id }, data: { bankTransactionId: bt.id } });
  await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: "MATCHED" } });
}

export async function setBankTransactionIgnored(tx: Tx, userId: string, id: string, ignored: boolean): Promise<void> {
  const bt = await requireBankTransaction(tx, userId, id, ignored ? ["NEW"] : ["IGNORED"]);
  await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: ignored ? "IGNORED" : "NEW" } });
}
