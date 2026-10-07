import { BADGES, TIER_LABEL, TIER_TAGLINE, BADGE_TIERS, WELCOME_BADGE_ID, formatBadgeValue, tierReached, type BadgeCategoryId, type BadgeDef, type BadgeDiscount, type BadgeStateDTO, type BadgeTier } from "@app/shared";

/** O nível (1 a 6) como nome do nível. */
export const tierName = (tier: number): BadgeTier => BADGE_TIERS[Math.max(1, Math.min(6, tier)) - 1]!;

/** O que o app mostra como comemoração quando há conquistas novas. */
export type CelebrationPlan =
  | { kind: "welcome" | "badge"; key: string; badgeId: string; tier: number; title: string; message: string; icon: string }
  | { kind: "summary"; key: string; badgeId: string; tier: number; title: string; message: string; icon: string; count: number };

/** Mais que isto de uma vez (conta antiga que acabou de ganhar o catálogo) vira UMA comemoração só, em vez de uma fila longa. */
const MAX_SEPARATE = 3;

const catalog = new Map(BADGES.map((b) => [b.id, b]));

/**
 * Decide o que comemorar. Cada insígnia com nível novo mostra o MAIS ALTO ainda não visto. A primeira conta nova ganha as boas-vindas; quem
 * chega com muitas de uma vez (ex.: conta antiga) recebe um resumo só, com a melhor insígnia.
 */
export function planCelebrations(items: readonly BadgeStateDTO[], firstName?: string | null): CelebrationPlan[] {
  const pending = items
    .filter((i) => i.unseen.length > 0 && catalog.has(i.id))
    .map((i) => ({ item: i, def: catalog.get(i.id)!, tier: Math.max(...i.unseen) }))
    .sort((a, b) => (a.def.id === WELCOME_BADGE_ID ? -1 : b.def.id === WELCOME_BADGE_ID ? 1 : b.tier - a.tier || BADGES.indexOf(a.def) - BADGES.indexOf(b.def)));
  if (pending.length === 0) return [];

  if (pending.length > MAX_SEPARATE) {
    const best = [...pending].sort((a, b) => b.tier - a.tier || BADGES.indexOf(a.def) - BADGES.indexOf(b.def))[0]!;
    const names = pending.slice(0, 3).map((p) => p.def.name);
    const more = pending.length - names.length;
    return [
      {
        kind: "summary",
        key: `summary:${pending.map((p) => `${p.def.id}${p.tier}`).join(",")}`,
        badgeId: best.def.id,
        tier: best.tier,
        icon: best.def.icon,
        count: pending.length,
        title: `Você conquistou ${pending.length} insígnias!`,
        message: `${names.join(", ")}${more > 0 ? ` e mais ${more}` : ""}. A melhor é ${best.def.name} (${TIER_LABEL[tierName(best.tier)]}). Veja todas em Mais → Insígnias.`,
      },
    ];
  }

  return pending.map(({ item, def, tier }): CelebrationPlan => {
    const isWelcome = def.id === WELCOME_BADGE_ID && tier === 1 && item.unseen.length === 1;
    const key = `${def.id}:${tier}`;
    if (isWelcome) {
      const name = firstName?.trim();
      return {
        kind: "welcome",
        key,
        badgeId: def.id,
        tier,
        icon: def.icon,
        title: name ? `Boas-vindas ao Finança, ${name}!` : "Boas-vindas ao Finança!",
        message: `Você acabou de ganhar a sua primeira insígnia: ${def.name}, nível ${TIER_LABEL.bronze}. Ela é só a primeira de uma coleção de ${BADGES.length}: registre, planeje e guarde para completar todas, até o nível Mestre.`,
      };
    }
    return {
      kind: "badge",
      key,
      badgeId: def.id,
      tier,
      icon: def.icon,
      title: `${def.name} · ${TIER_LABEL[tierName(tier)]}`,
      message: `${def.lore} ${TIER_TAGLINE[tierName(tier)]}`,
    };
  });
}

/** Uma insígnia a caminho do próximo nível, para os cartões "Próximas conquistas". */
export type NextGoal = { def: BadgeDef; state: BadgeStateDTO; nextTier: BadgeTier; threshold: number; progress: number; remaining: string };

/** As insígnias mais perto de subir de nível (só as que já têm algum progresso), da mais perto para a mais longe. */
export function nextGoals(items: readonly BadgeStateDTO[], limit = 3): NextGoal[] {
  const out: NextGoal[] = [];
  for (const state of items) {
    const def = catalog.get(state.id);
    if (!def || state.value <= 0) continue;
    // Nível que vale: o ganho (nunca sai) ou o que o número de agora mostra, o que for maior. A meta é sempre o seguinte.
    const level = Math.max(state.level, tierReached(def, state.value));
    if (level >= 6) continue;
    const threshold = def.thresholds[level]!;
    // O progresso parte do nível de onde o número está; se o número caiu abaixo de um nível já ganho, parte de zero.
    const from = level > 0 && tierReached(def, state.value) === level ? def.thresholds[level - 1]! : 0;
    out.push({
      def,
      state,
      nextTier: tierName(level + 1),
      threshold,
      progress: Math.max(0, Math.min(1, (state.value - from) / Math.max(1, threshold - from))),
      remaining: `Faltam ${formatBadgeValue(def.unit, Math.max(1, threshold - state.value))}`,
    });
  }
  return out.sort((a, b) => b.progress - a.progress || BADGES.indexOf(a.def) - BADGES.indexOf(b.def)).slice(0, limit);
}

/** Textos e progresso do cartão "Desconto na assinatura" (Insígnias e Assinatura), a partir do cálculo compartilhado `badgeDiscount`. */
export function discountSummary(d: BadgeDiscount): { title: string; detail: string; progressPct: number; atCap: boolean } {
  const atCap = d.nextPercent === null;
  const count = (n: number) => `${n} ${n === 1 ? "insígnia" : "insígnias"}`;
  const title = d.percent > 0 ? `Você tem ${d.percent}% de desconto na assinatura` : "Ganhe desconto na assinatura";
  const detail = atCap
    ? `Desconto máximo de ${d.capPercent}%, com ${count(d.qualifying)} no nível Ouro ou acima.`
    : `${d.qualifying === 0 ? "Nenhuma insígnia" : count(d.qualifying)} no nível Ouro ou acima. Faltam ${d.badgesToNext} para ${d.nextPercent}% (a cada ${d.badgesPerStep}, até ${d.capPercent}%).`;
  const progressPct = atCap ? 100 : ((d.qualifying % d.badgesPerStep) / d.badgesPerStep) * 100;
  return { title, detail, progressPct, atCap };
}

export type BadgeFilter = { category: BadgeCategoryId | "all"; status: "all" | "earned" | "progress" | "locked" };

/** Filtros da galeria: por assunto e por situação (conquistadas, em andamento ou ainda sem nada). */
export function filterBadges(items: readonly BadgeStateDTO[], f: BadgeFilter): { def: BadgeDef; state: BadgeStateDTO }[] {
  return BADGES.flatMap((def) => {
    const state = items.find((i) => i.id === def.id);
    if (!state) return [];
    if (f.category !== "all" && def.category !== f.category) return [];
    if (f.status === "earned" && state.level < 1) return [];
    if (f.status === "progress" && !(state.level < 6 && state.value > 0)) return [];
    if (f.status === "locked" && !(state.level === 0 && state.value <= 0)) return [];
    return [{ def, state }];
  });
}
