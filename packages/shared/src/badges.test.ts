import { describe, expect, it } from "vitest";
import {
  BADGE_CATEGORIES,
  BADGE_TIERS,
  BADGES,
  badgeById,
  badgePoints,
  formatBadgeValue,
  METRIC_KEYS,
  nextTarget,
  progressToNext,
  TIER_LABEL,
  TIER_POINTS,
  tierReached,
  WELCOME_BADGE_ID,
} from "./badges";

describe("catálogo de insígnias", () => {
  it("tem pelo menos 50 insígnias, com ids únicos", () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });

  it("os 6 níveis são Bronze, Prata, Ouro, Platina, Diamante e, por último, Mestre", () => {
    expect(BADGE_TIERS).toEqual(["bronze", "silver", "gold", "platinum", "diamond", "master"]);
    expect(BADGE_TIERS.map((t) => TIER_LABEL[t])).toEqual(["Bronze", "Prata", "Ouro", "Platina", "Diamante", "Mestre"]);
    // cada nível vale mais que o anterior
    const points = BADGE_TIERS.map((t) => TIER_POINTS[t]);
    expect([...points].sort((a, b) => a - b)).toEqual(points);
  });

  it("toda insígnia tem 6 metas estritamente crescentes e positivas", () => {
    for (const b of BADGES) {
      expect(b.thresholds, b.id).toHaveLength(6);
      expect(b.thresholds[0], b.id).toBeGreaterThan(0);
      for (let i = 1; i < 6; i++) expect(b.thresholds[i]!, `${b.id} nível ${i + 1}`).toBeGreaterThan(b.thresholds[i - 1]!);
    }
  });

  it("toda insígnia aponta para uma métrica e uma categoria que existem, e tem texto completo", () => {
    const categories = new Set<string>(BADGE_CATEGORIES.map((c) => c.id));
    const metrics = new Set<string>(METRIC_KEYS);
    for (const b of BADGES) {
      expect(metrics.has(b.metric), `${b.id}: métrica ${b.metric}`).toBe(true);
      expect(categories.has(b.category), `${b.id}: categoria ${b.category}`).toBe(true);
      expect(b.name.length, b.id).toBeGreaterThan(3);
      expect(b.what.length, b.id).toBeGreaterThan(15);
      expect(b.how.length, b.id).toBeGreaterThan(10);
      expect(b.lore.length, b.id).toBeGreaterThan(8);
      expect(b.icon, b.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("cada categoria tem insígnias e cada métrica é usada por alguma insígnia (nada calculado à toa)", () => {
    for (const c of BADGE_CATEGORIES) expect(BADGES.some((b) => b.category === c.id), c.id).toBe(true);
    const used = new Set(BADGES.map((b) => b.metric));
    for (const m of METRIC_KEYS) expect(used.has(m), `métrica sem insígnia: ${m}`).toBe(true);
  });

  it("os nomes não se repetem (cada insígnia é reconhecível)", () => {
    expect(new Set(BADGES.map((b) => b.name)).size).toBe(BADGES.length);
  });

  it("metas que dependem de algo limitado são alcançáveis (formas de pagamento: 6; fontes de renda e passos: 6)", () => {
    expect(badgeById("payment-mix")!.thresholds[5]).toBeLessThanOrEqual(6);
    expect(badgeById("first-steps")!.thresholds[5]).toBe(6);
    expect(badgeById("shielded")!.thresholds[5]).toBe(6);
  });
});

describe("regras de nível", () => {
  const veteran = { thresholds: [7, 30, 90, 180, 365, 730] } as const; // um exemplo qualquer de metas crescentes

  it("a insígnia de boas-vindas é do primeiro dia: o Bronze vem ao criar a conta", () => {
    const welcome = badgeById(WELCOME_BADGE_ID)!;
    expect(welcome.thresholds[0]).toBe(1);
    expect(tierReached(welcome, 1)).toBe(1); // o dia do cadastro já conta como o dia 1
    expect(tierReached(welcome, 0)).toBe(0);
    expect(tierReached(welcome, 7)).toBe(2);
  });

  it("conta quantos níveis o valor alcança, incluindo o valor exato da meta", () => {
    expect(tierReached(veteran, 0)).toBe(0);
    expect(tierReached(veteran, 6)).toBe(0);
    expect(tierReached(veteran, 7)).toBe(1);
    expect(tierReached(veteran, 89)).toBe(2);
    expect(tierReached(veteran, 90)).toBe(3);
    expect(tierReached(veteran, 729)).toBe(5);
    expect(tierReached(veteran, 730)).toBe(6);
    expect(tierReached(veteran, 99999)).toBe(6);
  });

  it("diz qual é o próximo nível e a meta dele; no Mestre não há próximo", () => {
    expect(nextTarget(veteran, 0)).toEqual({ tier: "bronze", threshold: 7 });
    expect(nextTarget(veteran, 7)).toEqual({ tier: "silver", threshold: 30 });
    expect(nextTarget(veteran, 400)).toEqual({ tier: "master", threshold: 730 });
    expect(nextTarget(veteran, 730)).toBeNull();
  });

  it("o progresso vai de 0 a 1 entre o nível atual e o próximo", () => {
    expect(progressToNext(veteran, 0)).toBe(0);
    expect(progressToNext(veteran, 3.5)).toBeCloseTo(0.5);
    expect(progressToNext(veteran, 7)).toBe(0); // acabou de ganhar o Bronze: recomeça rumo à Prata
    expect(progressToNext(veteran, 18.5)).toBeCloseTo(0.5);
    expect(progressToNext(veteran, 730)).toBe(1);
  });

  it("os pontos somam os níveis já ganhos de todas as insígnias", () => {
    expect(badgePoints([])).toBe(0);
    expect(badgePoints([0, 0])).toBe(0);
    expect(badgePoints([1])).toBe(10);
    expect(badgePoints([2])).toBe(10 + 25);
    expect(badgePoints([6])).toBe(10 + 25 + 50 + 100 + 200 + 400);
    expect(badgePoints([1, 3])).toBe(10 + (10 + 25 + 50));
  });

  it("formata o valor com a unidade certa", () => {
    expect(formatBadgeValue("days", 1)).toBe("1 dia");
    expect(formatBadgeValue("days", 30)).toBe("30 dias");
    expect(formatBadgeValue("months", 1)).toBe("1 mês");
    expect(formatBadgeValue("months", 12)).toBe("12 meses");
    expect(formatBadgeValue("weeks", 8)).toBe("8 semanas");
    expect(formatBadgeValue("percent", 40)).toBe("40%");
    expect(formatBadgeValue("count", 1500)).toBe("1.500");
    expect(formatBadgeValue("money", 500_000).replace(/\s/g, " ")).toBe("R$ 5.000");
    expect(formatBadgeValue("money", 0).replace(/\s/g, " ")).toBe("R$ 0");
  });
});
