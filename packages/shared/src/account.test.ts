import { describe, expect, it } from "vitest";
import { ACCOUNT_CHANGE_LIMITS, CHANGE_WINDOW_DAYS, evaluateChangeLimit } from "./schemas/account";
import { changeEmailBody, accountChangeKinds } from "./schemas/account";
import { mfaCode, oauthExchangeBody, oauthStartBody, OAUTH_PROVIDERS } from "./schemas/security";

const DAY = 86_400_000;
const NOW = new Date("2026-10-06T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const NAME = ACCOUNT_CHANGE_LIMITS.NAME; // 2 por mês, 6 por ano

describe("limites de alteração do cadastro", () => {
  it("sem alterações anteriores: livre", () => {
    const s = evaluateChangeLimit([], NOW, NAME);
    expect(s).toEqual({ perMonth: { used: 0, max: 2 }, perYear: { used: 0, max: 6 }, canChange: true, nextAvailableAt: null });
  });

  it("conta só o que está dentro da janela; alterações antigas deixam de pesar", () => {
    const s = evaluateChangeLimit([ago(40), ago(100), ago(5)], NOW, NAME);
    expect(s.perMonth.used).toBe(1);
    expect(s.perYear.used).toBe(3);
    expect(s.canChange).toBe(true);
  });

  it("mês cheio bloqueia e diz quando a vaga abre (a alteração mais antiga completa 30 dias)", () => {
    const first = ago(10);
    const s = evaluateChangeLimit([first, ago(3)], NOW, NAME);
    expect(s.canChange).toBe(false);
    expect(s.nextAvailableAt).toBe(new Date(first.getTime() + CHANGE_WINDOW_DAYS.month * DAY).toISOString());
  });

  it("ano cheio bloqueia mesmo com o mês livre, e a data vem da janela de um ano", () => {
    // 6 alterações espalhadas pelo ano, nenhuma nos últimos 30 dias
    const times = [ago(350), ago(300), ago(250), ago(200), ago(150), ago(100)];
    const s = evaluateChangeLimit(times, NOW, NAME);
    expect(s.perMonth.used).toBe(0);
    expect(s.canChange).toBe(false);
    expect(s.nextAvailableAt).toBe(new Date(times[0]!.getTime() + CHANGE_WINDOW_DAYS.year * DAY).toISOString());
  });

  it("com as duas janelas cheias, vale a data mais distante", () => {
    const times = [ago(350), ago(300), ago(250), ago(200), ago(10), ago(3)]; // mês cheio (2) e ano cheio (6)
    const s = evaluateChangeLimit(times, NOW, NAME);
    expect(s.canChange).toBe(false);
    const monthFree = times[4]!.getTime() + 30 * DAY;
    const yearFree = times[0]!.getTime() + 365 * DAY;
    expect(new Date(s.nextAvailableAt!).getTime()).toBe(Math.max(monthFree, yearFree));
  });

  it("no instante exato em que a janela fecha, a vaga já abriu", () => {
    const s = evaluateChangeLimit([ago(30), ago(1)], NOW, NAME); // a de 30 dias já saiu da janela
    expect(s.perMonth.used).toBe(1);
    expect(s.canChange).toBe(true);
  });

  it("cada tipo tem limites próprios e mais apertados no e-mail do que no nome", () => {
    expect(accountChangeKinds).toEqual(["NAME", "EMAIL", "PASSWORD"]);
    for (const k of accountChangeKinds) {
      const l = ACCOUNT_CHANGE_LIMITS[k];
      expect(l.perMonth).toBeGreaterThanOrEqual(1);
      expect(l.perYear).toBeGreaterThanOrEqual(l.perMonth);
    }
    expect(ACCOUNT_CHANGE_LIMITS.EMAIL.perMonth).toBeLessThanOrEqual(ACCOUNT_CHANGE_LIMITS.NAME.perMonth);
  });
});

describe("pedidos da conta e da segurança", () => {
  it("trocar o e-mail exige o novo e-mail válido (em minúsculas) e a senha", () => {
    expect(changeEmailBody.parse({ newEmail: "  NOVO@Email.com ", password: "x" }).newEmail).toBe("novo@email.com");
    expect(changeEmailBody.safeParse({ newEmail: "invalido", password: "x" }).success).toBe(false);
    expect(changeEmailBody.safeParse({ newEmail: "a@b.co" }).success).toBe(false);
    expect(changeEmailBody.safeParse({ newEmail: "a@b.co", password: "x", extra: 1 }).success).toBe(false);
  });

  it("o código do autenticador tem exatamente 6 números", () => {
    expect(mfaCode.safeParse("123456").success).toBe(true);
    expect(mfaCode.parse(" 123456 ")).toBe("123456");
    for (const bad of ["12345", "1234567", "12345a", "", "abcdef"]) expect(mfaCode.safeParse(bad).success, bad).toBe(false);
  });

  it("login por outra conta: só provedores conhecidos e desafio PKCE no formato certo", () => {
    const challenge = "a".repeat(43);
    expect(OAUTH_PROVIDERS.map((p) => p.id)).toEqual(expect.arrayContaining(["google", "facebook", "apple"]));
    expect(oauthStartBody.safeParse({ provider: "google", codeChallenge: challenge }).success).toBe(true);
    expect(oauthStartBody.safeParse({ provider: "instagram", codeChallenge: challenge }).success).toBe(false); // sem login próprio
    expect(oauthStartBody.safeParse({ provider: "google", codeChallenge: "curto" }).success).toBe(false);
    expect(oauthExchangeBody.safeParse({ code: "codigo-valido-123", codeVerifier: challenge }).success).toBe(true);
    expect(oauthExchangeBody.safeParse({ code: "x", codeVerifier: challenge }).success).toBe(false);
  });
});
