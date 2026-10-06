import type { ChangeLimitState } from "@app/shared";
import { describe, expect, it } from "vitest";
import { codeDigits, dateBR, limitText, memberSince, providerLabel } from "./account";

const state = (over: Partial<ChangeLimitState> = {}): ChangeLimitState => ({
  perMonth: { used: 0, max: 2 },
  perYear: { used: 0, max: 6 },
  canChange: true,
  nextAvailableAt: null,
  ...over,
});

describe("Minha conta: textos", () => {
  it("mostra quantas trocas restam, no singular e no plural", () => {
    expect(limitText(state())).toBe("Restam 2 trocas neste mês e 6 trocas neste ano.");
    expect(limitText(state({ perMonth: { used: 1, max: 2 }, perYear: { used: 5, max: 6 } }))).toBe("Restam 1 troca neste mês e 1 troca neste ano.");
  });

  it("limite atingido diz quando libera de novo", () => {
    const text = limitText(state({ canChange: false, perMonth: { used: 2, max: 2 }, nextAvailableAt: "2026-11-05T12:00:00.000Z" }));
    expect(text).toMatch(/^Limite atingido\. Você poderá alterar de novo em \d{2}\/11\/2026\.$/);
    expect(limitText(state({ canChange: false, nextAvailableAt: null }))).toBe("Limite atingido por enquanto.");
  });

  it("nunca mostra número negativo de trocas", () => {
    expect(limitText(state({ perMonth: { used: 5, max: 2 }, perYear: { used: 9, max: 6 } }))).toBe("Restam 0 trocas neste mês e 0 trocas neste ano.");
  });

  it("formas de entrar com nome amigável e fallback", () => {
    expect(providerLabel("email")).toBe("E-mail e senha");
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("azure")).toBe("Microsoft");
    expect(providerLabel("novo_provedor")).toBe("Novo_provedor");
  });

  it("datas em formato brasileiro", () => {
    expect(dateBR("2026-10-06T15:00:00.000Z")).toMatch(/^0[56]\/10\/2026$/);
    expect(memberSince("2026-10-06T15:00:00.000Z")).toMatch(/^Membro desde 0[56]\/10\/2026$/);
  });

  it("código do autenticador: só 6 dígitos, mesmo colado com espaços", () => {
    expect(codeDigits("123 456")).toBe("123456");
    expect(codeDigits("12-34-56-78")).toBe("123456");
    expect(codeDigits("abc")).toBe("");
  });
});
