import { BADGES, type BadgeStateDTO } from "@app/shared";
import { describe, expect, it } from "vitest";
import { filterBadges, nextGoals, planCelebrations, tierName } from "./badges";

const state = (id: string, over: Partial<BadgeStateDTO> = {}): BadgeStateDTO => ({ id, value: 0, level: 0, earnedAt: [null, null, null, null, null, null], unseen: [], ...over });
const earned = (id: string, level: number, over: Partial<BadgeStateDTO> = {}): BadgeStateDTO =>
  state(id, { level, earnedAt: Array.from({ length: 6 }, (_, i) => (i < level ? "2026-10-04T12:00:00.000Z" : null)), ...over });
const all = (over: Record<string, Partial<BadgeStateDTO>> = {}) => BADGES.map((b) => state(b.id, over[b.id]));

describe("comemorações de insígnias", () => {
  it("sem nada novo, não comemora", () => {
    expect(planCelebrations([])).toEqual([]);
    expect(planCelebrations(all())).toEqual([]);
    expect(planCelebrations(all({ scribe: { level: 2, unseen: [] } }))).toEqual([]);
  });

  it("conta nova: as boas-vindas, com o nome da pessoa e a explicação da coleção", () => {
    const plans = planCelebrations(all({ welcome: { level: 1, value: 1, unseen: [1] } }), "  Maria ");
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: "welcome", badgeId: "welcome", tier: 1, title: "Boas-vindas ao Finança, Maria!" });
    expect(plans[0]!.message).toContain("primeira insígnia");
    expect(plans[0]!.message).toContain(String(BADGES.length));
    expect(planCelebrations(all({ welcome: { level: 1, unseen: [1] } }), null)[0]!.title).toBe("Boas-vindas ao Finança!");
    expect(planCelebrations(all({ welcome: { level: 1, unseen: [1] } }), "")[0]!.title).toBe("Boas-vindas ao Finança!");
  });

  it("conquista comum: título com o nome e o nível, e a frase de efeito da insígnia", () => {
    const [p] = planCelebrations(all({ scribe: { level: 3, unseen: [3] } }));
    expect(p).toMatchObject({ kind: "badge", badgeId: "scribe", tier: 3, title: "Anotador · Ouro" });
    expect(p!.message.length).toBeGreaterThan(20);
  });

  it("vários níveis novos da mesma insígnia: mostra só o mais alto", () => {
    const [p] = planCelebrations(all({ scribe: { level: 3, unseen: [1, 2, 3] } }));
    expect(p!.tier).toBe(3);
    expect(planCelebrations(all({ scribe: { level: 3, unseen: [1, 2, 3] } }))).toHaveLength(1);
  });

  it("até 3 conquistas viram 3 comemorações, as boas-vindas primeiro e depois o maior nível", () => {
    const four = planCelebrations(all({ scribe: { level: 2, unseen: [2] }, planner: { level: 1, unseen: [1] }, "saver-months": { level: 4, unseen: [4] }, welcome: { level: 1, unseen: [1] } }));
    expect(four).toHaveLength(1); // 4 de uma vez já viram um resumo só
    expect(four[0]!.kind).toBe("summary");
    const three = planCelebrations(all({ scribe: { level: 2, unseen: [2] }, "saver-months": { level: 4, unseen: [4] }, welcome: { level: 1, unseen: [1] } }));
    expect(three.map((p) => p.badgeId)).toEqual(["welcome", "saver-months", "scribe"]);
  });

  it("conta antiga com muitas de uma vez: UMA comemoração-resumo com o total, os nomes e a melhor", () => {
    const plans = planCelebrations(
      all({ welcome: { level: 6, unseen: [1, 2, 3, 4, 5, 6] }, scribe: { level: 3, unseen: [1, 2, 3] }, "saver-months": { level: 2, unseen: [1, 2] }, planner: { level: 1, unseen: [1] }, dreamer: { level: 1, unseen: [1] } }),
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: "summary", count: 5, badgeId: "welcome", tier: 6, title: "Você conquistou 5 insígnias!" });
    expect(plans[0]!.message).toContain("e mais 2");
    expect(plans[0]!.message).toContain("Mestre");
  });

  it("ignora insígnia que não existe mais no catálogo (versão antiga/nova do app)", () => {
    expect(planCelebrations([state("insignia-do-futuro", { level: 1, unseen: [1] })])).toEqual([]);
  });

  it("o nome do nível de 1 a 6", () => {
    expect([1, 2, 3, 4, 5, 6].map(tierName)).toEqual(["bronze", "silver", "gold", "platinum", "diamond", "master"]);
    expect(tierName(0)).toBe("bronze");
    expect(tierName(9)).toBe("master");
  });
});

describe("próximas conquistas", () => {
  it("lista as mais perto do próximo nível, só as que já têm progresso, com o que falta", () => {
    const goals = nextGoals(all({ scribe: { value: 40, level: 1 }, "saver-months": { value: 2, level: 1 }, planner: { value: 0 } }), 5);
    expect(goals.map((g) => g.def.id)).toEqual(["scribe", "saver-months"]); // planner sem progresso fica de fora
    const scribe = goals[0]!;
    expect(scribe).toMatchObject({ nextTier: "silver", threshold: 50 });
    expect(scribe.progress).toBeCloseTo((40 - 10) / (50 - 10));
    expect(scribe.remaining).toBe("Faltam 10");
  });

  it("ordena da mais perto para a mais longe e respeita o limite", () => {
    const goals = nextGoals(all({ scribe: { value: 49, level: 1 }, "expense-tracker": { value: 12, level: 1 }, "income-tracker": { value: 1, level: 0 }, describer: { value: 1, level: 0 } }), 2);
    expect(goals).toHaveLength(2);
    expect(goals[0]!.progress).toBeGreaterThanOrEqual(goals[1]!.progress);
    expect(goals[0]!.def.id).toBe("scribe");
  });

  it("insígnia no Mestre não tem próxima meta", () => {
    expect(nextGoals(all({ scribe: { value: 99999, level: 6 } }))).toEqual([]);
  });

  it("nível ganho nunca sai: se o número caiu, a meta é o nível seguinte ao ganho, partindo de zero", () => {
    const [g] = nextGoals(all({ scribe: { value: 5, level: 2 } }));
    expect(g).toMatchObject({ nextTier: "gold", threshold: 150 });
    expect(g!.progress).toBeCloseTo(5 / 150);
  });

  it("dinheiro e tempo saem com a unidade certa", () => {
    const [g] = nextGoals(all({ "saved-total": { value: 20_000, level: 0 } })); // R$ 200 de R$ 100 (Bronze já alcançado pelo número)
    expect(g!.remaining).toMatch(/^Faltam R\$/);
  });
});

describe("galeria: filtros", () => {
  const items = all({ scribe: { value: 60, level: 2 }, "expense-tracker": { value: 4, level: 0 }, welcome: { value: 1, level: 1 } });

  it("sem filtro mostra todas, na ordem do catálogo", () => {
    expect(filterBadges(items, { category: "all", status: "all" }).map((r) => r.def.id)).toEqual(BADGES.map((b) => b.id));
  });

  it("por assunto", () => {
    const habit = filterBadges(items, { category: "habit", status: "all" });
    expect(habit.length).toBeGreaterThan(3);
    expect(habit.every((r) => r.def.category === "habit")).toBe(true);
  });

  it("por situação: conquistadas, em andamento e ainda sem nada", () => {
    expect(filterBadges(items, { category: "all", status: "earned" }).map((r) => r.def.id).sort()).toEqual(["scribe", "welcome"]);
    expect(filterBadges(items, { category: "all", status: "progress" }).map((r) => r.def.id).sort()).toEqual(["expense-tracker", "scribe", "welcome"]);
    const locked = filterBadges(items, { category: "all", status: "locked" });
    expect(locked).toHaveLength(BADGES.length - 3);
    expect(locked.every((r) => r.state.level === 0 && r.state.value === 0)).toBe(true);
  });
});
