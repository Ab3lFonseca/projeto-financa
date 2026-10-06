import { describe, expect, it } from "vitest";
import { describeAdminAction, fillSignups, onboardingRate, themeRows, userInitial, userLabel } from "./admin";

describe("describeAdminAction", () => {
  it("traduz cada ação da auditoria em verbo, ícone e cor", () => {
    expect(describeAdminAction("admin.user.deleted")).toMatchObject({ icon: "trash", tone: "negative", verb: "Excluiu a conta de" });
    expect(describeAdminAction("admin.trial.extended").verb).toBe("Prorrogou o teste de");
    expect(describeAdminAction("admin.mfa.removed").tone).toBe("warning");
    expect(describeAdminAction("admin.bootstrap").verb).toMatch(/administrador/);
  });
  it("ação desconhecida (de uma versão mais nova do servidor) aparece de forma legível e nunca quebra", () => {
    expect(describeAdminAction("admin.algo.novo_aqui")).toEqual({ icon: "file-text", tone: "default", verb: "algo novo aqui" });
  });
});

describe("fillSignups", () => {
  it("devolve sempre `days` dias seguidos, terminando hoje, com 0 nos dias sem cadastro", () => {
    const out = fillSignups([{ date: "2026-10-03", count: 4 }, { date: "2026-10-05", count: 1 }], "2026-10-05", 5);
    expect(out).toEqual([
      { date: "2026-10-01", count: 0 },
      { date: "2026-10-02", count: 0 },
      { date: "2026-10-03", count: 4 },
      { date: "2026-10-04", count: 0 },
      { date: "2026-10-05", count: 1 },
    ]);
  });

  it("atravessa a virada de mês e ignora datas fora da janela", () => {
    const out = fillSignups([{ date: "2026-08-01", count: 9 }, { date: "2026-10-01", count: 2 }], "2026-10-02", 3);
    expect(out.map((d) => d.date)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(out.map((d) => d.count)).toEqual([0, 2, 0]);
  });

  it("padrão de 30 dias", () => {
    expect(fillSignups([], "2026-10-05")).toHaveLength(30);
  });
});

describe("onboardingRate", () => {
  it("percentual inteiro, sem passar de 100 e sem dividir por zero", () => {
    expect(onboardingRate(1, 3)).toBe(33);
    expect(onboardingRate(2, 3)).toBe(67);
    expect(onboardingRate(5, 5)).toBe(100);
    expect(onboardingRate(9, 5)).toBe(100);
    expect(onboardingRate(0, 0)).toBeNull();
  });
});

describe("themeRows", () => {
  it("ordena do mais usado ao menos usado, traduz o nome e calcula a fatia", () => {
    const rows = themeRows({ dark: 6, purple: 3, system: 1, custom: 0 });
    expect(rows.map((r) => r.id)).toEqual(["dark", "purple", "system"]);
    expect(rows[0]).toMatchObject({ label: "Escuro", emoji: "🌙", count: 6, pct: 60 });
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeGreaterThanOrEqual(99);
  });

  it("tema desconhecido vira 'Outro' (nunca quebra a tela) e vazio devolve lista vazia", () => {
    expect(themeRows({ outro: 2 })[0]).toMatchObject({ label: "Outro", count: 2, pct: 100 });
    expect(themeRows({})).toEqual([]);
  });
});

describe("nome e inicial do usuário", () => {
  it("usa o nome escolhido; sem nome, a parte do e-mail antes do @", () => {
    expect(userLabel("Maria Silva", "maria@x.dev")).toBe("Maria Silva");
    expect(userLabel(null, "joao.pedro@x.dev")).toBe("joao.pedro");
    expect(userLabel("  ", "ana@x.dev")).toBe("ana");
  });

  it("inicial maiúscula, ignorando símbolos no começo", () => {
    expect(userInitial("maria", "m@x.dev")).toBe("M");
    expect(userInitial(null, "_zeca@x.dev")).toBe("Z");
    expect(userInitial("émerson", "e@x.dev")).toBe("É");
  });
});
