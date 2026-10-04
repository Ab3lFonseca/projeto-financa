import { formatBRL, parseISODate, type GoalDTO, type ISODate } from "@app/shared";
import type { OpCtx, Tx } from "../../lib/db";
import { dateOut, num, tsOut } from "../../lib/dto";
import { createNotifications } from "../notifications/service";
import type { PushNotifier } from "../notifications/notifier";

type GoalRow = {
  id: string;
  name: string;
  kind: GoalDTO["kind"];
  targetCents: bigint;
  initialCents: bigint;
  deadline: Date | null;
  status: GoalDTO["status"];
  icon: string | null;
  color: string | null;
  achievedAt: Date | null;
  createdAt: Date;
};

/** Meses (inteiros, arredondando para cima) de `today` até `deadline`; mínimo 1. */
export function monthsUntil(today: ISODate, deadline: ISODate): number {
  const a = parseISODate(today);
  const b = parseISODate(deadline);
  const months = (b.year - a.year) * 12 + (b.month - a.month) + (b.day > a.day ? 1 : 0);
  return Math.max(1, months);
}

export function toGoalDTO(g: GoalRow, contributionsSumCents: number, today: ISODate): GoalDTO {
  const target = num(g.targetCents);
  const current = num(g.initialCents) + contributionsSumCents;
  const remaining = Math.max(target - current, 0);
  const deadline = g.deadline ? dateOut(g.deadline) : null;
  const monthlyNeeded =
    deadline && deadline > today && remaining > 0 && g.status === "ACTIVE"
      ? Math.ceil(remaining / monthsUntil(today, deadline))
      : null;
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    targetCents: target,
    initialCents: num(g.initialCents),
    currentCents: current,
    remainingCents: remaining,
    progressPct: target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 1000) / 10)) : 0,
    deadline,
    status: g.status,
    monthlyNeededCents: monthlyNeeded,
    icon: g.icon,
    color: g.color,
    achievedAt: g.achievedAt ? tsOut(g.achievedAt) : null,
    createdAt: tsOut(g.createdAt),
  };
}

export async function contributionSums(tx: Tx, userId: string, goalIds: string[]): Promise<Map<string, number>> {
  if (goalIds.length === 0) return new Map();
  const groups = await tx.goalContribution.groupBy({
    by: ["goalId"],
    where: { userId, goalId: { in: goalIds } },
    _sum: { amountCents: true },
  });
  return new Map(groups.map((g) => [g.goalId, num(g._sum.amountCents)]));
}

export async function listGoalDTOs(
  tx: Tx,
  userId: string,
  today: ISODate,
  opts: { status?: GoalDTO["status"]; ids?: string[]; includeArchived?: boolean } = {},
): Promise<GoalDTO[]> {
  const rows = await tx.goal.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(opts.status ? { status: opts.status } : opts.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const sums = await contributionSums(tx, userId, rows.map((r) => r.id));
  return rows.map((r) => toGoalDTO(r, sums.get(r.id) ?? 0, today));
}

const MILESTONES = [25, 50, 75] as const;

/**
 * Reavalia a meta depois de aporte/resgate/edição: marca como ATINGIDA (ou reabre) e
 * notifica marcos de 25/50/75% e a conclusão — cada um uma única vez.
 */
export async function syncGoalProgress(
  tx: Tx,
  user: { id: string },
  goalId: string,
  previousPct: number,
  now: Date,
  deps: { notifier: PushNotifier },
  ctx: OpCtx,
): Promise<void> {
  const goal = await tx.goal.findFirst({ where: { id: goalId, userId: user.id, deletedAt: null } });
  if (!goal) return;
  const sums = await contributionSums(tx, user.id, [goal.id]);
  const target = num(goal.targetCents);
  const current = num(goal.initialCents) + (sums.get(goal.id) ?? 0);
  const pct = target > 0 ? (current / target) * 100 : 0;

  if (goal.status === "ACTIVE" && current >= target) {
    await tx.goal.update({ where: { id: goal.id }, data: { status: "ACHIEVED", achievedAt: now } });
  } else if (goal.status === "ACHIEVED" && current < target) {
    await tx.goal.update({ where: { id: goal.id }, data: { status: "ACTIVE", achievedAt: null } });
  }

  const items = [];
  if (previousPct < 100 && pct >= 100) {
    items.push({
      type: "GOAL_ACHIEVED" as const,
      title: "Meta atingida! 🎉",
      body: `Você alcançou a meta "${goal.name}" (${formatBRL(target)}).`,
      data: { goalId: goal.id },
      dedupeKey: `goal:${goal.id}:achieved`,
    });
  } else {
    for (const m of MILESTONES) {
      if (previousPct < m && pct >= m && pct < 100) {
        items.push({
          type: "GOAL_PROGRESS" as const,
          title: "Meta em andamento",
          body: `Você já chegou a ${m}% da meta "${goal.name}" (${formatBRL(current)} de ${formatBRL(target)}).`,
          data: { goalId: goal.id, milestone: m },
          dedupeKey: `goal:${goal.id}:${m}`,
        });
      }
    }
  }
  await createNotifications(tx, user.id, items, ctx, deps.notifier);
}
