import type { PrismaClient } from "@app/database";
import type { FastifyBaseLogger } from "fastify";
import { audit } from "../../lib/audit";
import type { Tx } from "../../lib/db";
import { AppError } from "../../lib/errors";
import type { AuthProvider } from "../auth/provider";

/** JSON.stringify que aceita BigInt (valores monetários) como número. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2);
}

/**
 * Exportação completa dos dados do usuário (LGPD art. 18, II e V — acesso e portabilidade).
 * Roda sob RLS: só enxerga o que é do próprio usuário. Não inclui credenciais (não existem aqui).
 */
export async function exportUserData(tx: Tx, user: { id: string; email: string }, now: Date) {
  const where = { userId: user.id };
  const profile = await tx.profile.findUnique({ where });
  const consents = await tx.consent.findMany({ where, orderBy: { grantedAt: "asc" }, select: { type: true, version: true, grantedAt: true, revokedAt: true } });
  const accounts = await tx.account.findMany({ where, orderBy: { createdAt: "asc" } });
  const creditCards = await tx.creditCard.findMany({ where, orderBy: { createdAt: "asc" } });
  const invoices = await tx.invoice.findMany({ where, orderBy: { referenceMonth: "asc" } });
  const invoicePayments = await tx.invoicePayment.findMany({ where, orderBy: { paidOn: "asc" } });
  const categories = await tx.category.findMany({ where, orderBy: { createdAt: "asc" } });
  const transactions = await tx.transaction.findMany({ where, orderBy: [{ occurredOn: "asc" }, { id: "asc" }] });
  const transfers = await tx.transfer.findMany({ where, orderBy: { occurredOn: "asc" } });
  const recurringRules = await tx.recurringRule.findMany({ where, orderBy: { createdAt: "asc" } });
  const budgets = await tx.budget.findMany({ where, orderBy: { month: "asc" } });
  const goals = await tx.goal.findMany({ where, orderBy: { createdAt: "asc" } });
  const goalContributions = await tx.goalContribution.findMany({ where, orderBy: { occurredOn: "asc" } });
  const bankConnections = await tx.bankConnection.findMany({
    where,
    select: { id: true, provider: true, institutionName: true, status: true, consentGrantedAt: true, lastSyncAt: true, createdAt: true, revokedAt: true },
  });
  const bankTransactions = await tx.bankTransaction.findMany({ where, orderBy: { postedOn: "asc" } });
  const notifications = await tx.notification.findMany({ where, orderBy: { createdAt: "asc" } });

  // Removemos só campos internos (userId repetido em cada linha).
  const strip = <T extends { userId?: unknown }>(rows: T[]) => rows.map(({ userId: _u, ...rest }) => rest);

  return {
    format: "financa-export-v1",
    exportedAt: now.toISOString(),
    note: "Dados pessoais tratados por este aplicativo. Valores monetários em centavos; datas em AAAA-MM-DD.",
    account: { id: user.id, email: user.email },
    data: {
      profile: profile ? (({ userId: _u, ...p }) => p)(profile) : null,
      consents,
      accounts: strip(accounts),
      creditCards: strip(creditCards),
      invoices: strip(invoices),
      invoicePayments: strip(invoicePayments),
      categories: strip(categories),
      transactions: strip(transactions),
      transfers: strip(transfers),
      recurringRules: strip(recurringRules),
      budgets: strip(budgets),
      goals: strip(goals),
      goalContributions: strip(goalContributions),
      bankConnections,
      bankTransactions: strip(bankTransactions),
      notifications: strip(notifications),
    },
  };
}

type DeletionDeps = {
  prisma: PrismaClient;
  authProvider: AuthProvider;
  pepper: string;
  now: () => Date;
  log?: FastifyBaseLogger;
  /** Chamado antes de apagar (ex.: revogar consentimentos no provedor de Open Finance). */
  beforeErase?: (userId: string) => Promise<void>;
};

/**
 * Exclusão definitiva da conta. Ordem pensada para ser segura e retomável:
 *  1. marca DELETING (bloqueia novos acessos) e registra o pedido;
 *  2. remove o usuário do provedor de autenticação (ninguém consegue entrar de novo);
 *  3. apaga TODOS os dados locais por cascata (user_id) — uma transação;
 *  4. o pedido fica como prova de atendimento, sem dado pessoal (user_id vira NULL).
 * Se qualquer etapa falhar, `finalizeDeletions` (job) retoma de onde parou.
 */
export async function eraseAccount(userId: string, deps: DeletionDeps): Promise<void> {
  const { prisma } = deps;

  let request = await prisma.privacyRequest.findFirst({
    where: { userId, type: "DELETE", status: { in: ["PENDING", "PROCESSING"] } },
  });
  if (!request) request = await prisma.privacyRequest.create({ data: { userId, type: "DELETE", status: "PROCESSING" } });
  // Só marca na primeira vez: `deletedAt` é a referência do job de retomada.
  await prisma.user.updateMany({
    where: { id: userId, status: { not: "DELETING" } },
    data: { status: "DELETING", deletedAt: deps.now() },
  });

  if (deps.beforeErase) await deps.beforeErase(userId);

  try {
    await deps.authProvider.deleteUser(userId);
  } catch (err) {
    // Usuário já removido no provedor (retomada) conta como sucesso.
    const alreadyGone = err instanceof AppError && (err.status === 404 || err.code === "USER_NOT_FOUND");
    if (!alreadyGone) {
      await prisma.privacyRequest.update({ where: { id: request.id }, data: { status: "FAILED" } });
      throw err;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.privacyRequest.update({ where: { id: request!.id }, data: { status: "COMPLETED", completedAt: deps.now() } });
    await tx.user.delete({ where: { id: userId } });
  });
  await audit(prisma, deps.pepper, { actorId: userId, action: "account.deleted", entity: "user", entityId: userId }, deps.log);
}

/** Retoma exclusões que ficaram pela metade (queda do servidor, falha do provedor). */
export async function finalizeDeletions(deps: DeletionDeps, olderThanMs = 10 * 60_000): Promise<number> {
  const cutoff = new Date(deps.now().getTime() - olderThanMs);
  const stuck = await deps.prisma.user.findMany({
    where: { status: "DELETING", deletedAt: { lt: cutoff } },
    select: { id: true },
    take: 50,
  });
  let done = 0;
  for (const u of stuck) {
    try {
      await eraseAccount(u.id, deps);
      done++;
    } catch (err) {
      deps.log?.error({ err, userId: u.id }, "falha ao finalizar exclusão de conta");
    }
  }
  return done;
}
