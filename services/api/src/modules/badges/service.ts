import type { PrismaClient } from "@app/database";
import { BADGES, badgePoints, tierReached, type BadgesResponse, type BadgeStateDTO } from "@app/shared";
import type { Tx } from "../../lib/db";
import { tsOut } from "../../lib/dto";
import { computeMetrics } from "./metrics";

type User = { id: string; timezone: string };

/**
 * Avalia as insígnias da pessoa: calcula os números dos dados dela, grava os níveis NOVOS alcançados e devolve o estado de todas. Níveis já
 * ganhos nunca saem (apagar lançamentos não "desconquista"). Idempotente: avaliar duas vezes não duplica nada (restrição única no banco).
 * Os níveis recém-ganhos voltam em `unseen` até a pessoa ver a comemoração (`markSeen`).
 */
export async function evaluateBadges(tx: Tx, prisma: PrismaClient, user: User, now: Date): Promise<BadgesResponse> {
  const metrics = await computeMetrics(tx, prisma, user, now);

  const earned = await prisma.userBadge.findMany({ where: { userId: user.id }, select: { badgeId: true, tier: true, earnedAt: true, seenAt: true } });
  const have = new Set(earned.map((e) => `${e.badgeId}:${e.tier}`));
  const fresh: { userId: string; badgeId: string; tier: number; earnedAt: Date }[] = [];
  for (const def of BADGES) {
    const reached = tierReached(def, metrics[def.metric]);
    for (let tier = 1; tier <= reached; tier++) if (!have.has(`${def.id}:${tier}`)) fresh.push({ userId: user.id, badgeId: def.id, tier, earnedAt: now });
  }
  if (fresh.length > 0) {
    await prisma.userBadge.createMany({ data: fresh, skipDuplicates: true });
    for (const f of fresh) earned.push({ badgeId: f.badgeId, tier: f.tier, earnedAt: f.earnedAt, seenAt: null });
  }

  const byBadge = new Map<string, typeof earned>();
  for (const e of earned) byBadge.set(e.badgeId, [...(byBadge.get(e.badgeId) ?? []), e]);

  const items: BadgeStateDTO[] = BADGES.map((def) => {
    const rows = byBadge.get(def.id) ?? [];
    const earnedAt: (string | null)[] = [null, null, null, null, null, null];
    for (const r of rows) earnedAt[r.tier - 1] = tsOut(r.earnedAt);
    return {
      id: def.id,
      value: metrics[def.metric],
      level: rows.reduce((best, r) => Math.max(best, r.tier), 0),
      earnedAt,
      unseen: rows.filter((r) => r.seenAt === null).map((r) => r.tier).sort((a, b) => a - b),
    };
  });

  return {
    items,
    summary: {
      unlocked: items.filter((i) => i.level >= 1).length,
      total: BADGES.length,
      tiersEarned: items.reduce((sum, i) => sum + i.level, 0),
      points: badgePoints(items.map((i) => i.level)),
      masters: items.filter((i) => i.level === 6).length,
    },
  };
}

/** Marca as comemorações como vistas (todas, ou só as das insígnias informadas). */
export async function markBadgesSeen(prisma: PrismaClient, userId: string, ids: string[] | undefined, now: Date): Promise<number> {
  const res = await prisma.userBadge.updateMany({
    where: { userId, seenAt: null, ...(ids && ids.length > 0 ? { badgeId: { in: ids } } : {}) },
    data: { seenAt: now },
  });
  return res.count;
}
