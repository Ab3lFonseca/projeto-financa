import { LIMITED_RESOURCE_LABEL_PT, PLAN_LIMITS, type LimitedResource, type PlanLimits, type PlanName } from "@app/shared";
import type { Prisma } from "@app/database";
import { Errors } from "./errors";

type Tx = Prisma.TransactionClient;

// O plano efetivo de cada pessoa (Premium enquanto o acesso está liberado, Free no somente leitura) vem de `lib/access.ts` (`planOf`).

export function limitsFor(plan: PlanName): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** Quantos itens "limitados" o usuário já tem (excluídos e arquivados não contam). */
export async function countUsage(tx: Tx, userId: string): Promise<Record<LimitedResource, number>> {
  // Sequencial de propósito: uma transação usa uma única conexão (consultas concorrentes na
  // mesma conexão são desencorajadas pelo driver).
  const accounts = await tx.account.count({ where: { userId, deletedAt: null, archivedAt: null } });
  const cards = await tx.creditCard.count({ where: { userId, deletedAt: null, archivedAt: null } });
  const goals = await tx.goal.count({ where: { userId, deletedAt: null, status: { not: "ARCHIVED" } } });
  const recurringRules = await tx.recurringRule.count({ where: { userId, deletedAt: null, active: true } });
  return { accounts, cards, goals, recurringRules };
}

/** Lança 402 PLAN_LIMIT_REACHED se criar mais um item estourar o limite do plano. */
export async function assertCanCreate(
  tx: Tx,
  user: { id: string; plan: PlanName },
  resource: LimitedResource,
): Promise<void> {
  const limit = limitsFor(user.plan)[resource];
  if (limit === null) return;
  const usage = await countUsage(tx, user.id);
  if (usage[resource] >= limit) {
    throw Errors.planLimit(
      `Seu plano gratuito permite até ${limit} ${LIMITED_RESOURCE_LABEL_PT[resource]}. Faça upgrade para adicionar mais.`,
      { resource, limit },
    );
  }
}
