import { describe, expect, it } from "vitest";
import { boardTabs, DECISIONS, remainingText, statusLook, suggestionCheck, suggestionCounter } from "./suggestions";

describe("texto da sugestão", () => {
  it("vazio, curto, certo e grande demais", () => {
    expect(suggestionCheck("")).toMatchObject({ ok: false, length: 0, hint: "Escreva pelo menos 10 caracteres." });
    expect(suggestionCheck("   ")).toMatchObject({ ok: false, length: 0 }); // espaços não contam
    expect(suggestionCheck("123456")).toMatchObject({ ok: false, hint: "Faltam 4 caracteres." });
    expect(suggestionCheck("1234567890")).toEqual({ ok: true, length: 10, hint: null });
    expect(suggestionCheck("a".repeat(1000)).ok).toBe(true);
    expect(suggestionCheck("a".repeat(1003))).toMatchObject({ ok: false, hint: "Passou 3 caracteres do limite." });
  });

  it("espaços nas pontas não contam, como no servidor", () => {
    expect(suggestionCheck("   curto   ").length).toBe(5);
    expect(suggestionCounter("  abc  ")).toBe("3/1000");
  });
});

describe("situação da sugestão", () => {
  it("cada situação tem texto, cor e ícone próprios", () => {
    expect(statusLook("PENDING")).toEqual({ label: "Em análise", tone: "default", icon: "clock" });
    expect(statusLook("APPROVED")).toEqual({ label: "Aprovada para validação", tone: "positive", icon: "circle-check" });
    expect(statusLook("REJECTED")).toEqual({ label: "Não aplicável", tone: "negative", icon: "circle-x" });
  });
});

describe("quadro do administrador", () => {
  it("os três botões: verde, vermelho e branco, nessa ordem, cada um com a sua situação", () => {
    expect(DECISIONS.map((d) => [d.color, d.status])).toEqual([
      ["green", "APPROVED"],
      ["red", "REJECTED"],
      ["white", "PENDING"],
    ]);
    expect(DECISIONS[0]!.label).toBe("Válida");
    expect(DECISIONS[1]!.label).toBe("Não válida");
    expect(DECISIONS[2]!.label).toBe("Em análise");
    expect(DECISIONS[0]!.done).toMatch(/passa para a validação/);
    expect(DECISIONS[1]!.done).toMatch(/não passa pela validação/);
  });

  it("as abas mostram quantas há em cada situação", () => {
    expect(boardTabs({ PENDING: 4, APPROVED: 2, REJECTED: 0 })).toEqual([
      { status: "PENDING", label: "Em análise (4)" },
      { status: "APPROVED", label: "Válidas (2)" },
      { status: "REJECTED", label: "Não válidas (0)" },
    ]);
  });
});

describe("limite diário", () => {
  it("diz quantas ainda dá para enviar", () => {
    expect(remainingText(5)).toBe("Você ainda pode enviar 5 sugestões hoje.");
    expect(remainingText(1)).toBe("Você ainda pode enviar 1 sugestão hoje.");
    expect(remainingText(0)).toMatch(/máximo de hoje/);
    expect(remainingText(-2)).toMatch(/máximo de hoje/);
  });
});
