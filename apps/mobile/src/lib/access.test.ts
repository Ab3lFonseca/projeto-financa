import type { AccessDTO } from "@app/shared";
import { describe, expect, it } from "vitest";
import { accessBadge, accessBanner, accessSummary, dateText, daysText, defaultInterval, formatMoneyCents, formatPrice, GRANT_DURATIONS, planOffers } from "./access";

const base: AccessDTO = { state: "trial", allowed: true, expiresAt: "2026-11-03T12:00:00.000Z", daysLeft: 12, cancelAtPeriodEnd: false, features: { investments: true } };
const access = (over: Partial<AccessDTO>): AccessDTO => ({ ...base, ...over });
/** `Intl` separa o símbolo do valor com um espaço não separável: normaliza para comparar. */
const plain = (s: string | null) => s?.replace(/\s/g, " ");

describe("preços", () => {
  it("mostra o valor do provedor com o período, em reais", () => {
    expect(plain(formatPrice({ amountCents: 990, currency: "BRL", interval: "month" }))).toBe("R$ 9,90 / mês");
    expect(plain(formatPrice({ amountCents: 9990, currency: "BRL", interval: "year" }))).toBe("R$ 99,90 / ano");
  });
  it("sem preço (provedor fora do ar ou não configurado), não inventa valor", () => {
    expect(formatPrice(null)).toBeNull();
    expect(formatPrice(undefined)).toBeNull();
  });
  it("formata centavos para o painel do administrador", () => {
    expect(plain(formatMoneyCents(123_456))).toBe("R$ 1.234,56");
    expect(plain(formatMoneyCents(0))).toBe("R$ 0,00");
  });
});

describe("textos de tempo", () => {
  it("dias no singular e no plural; zero vira 'hoje'", () => {
    expect(daysText(0)).toBe("hoje");
    expect(daysText(-3)).toBe("hoje");
    expect(daysText(1)).toBe("1 dia");
    expect(daysText(12)).toBe("12 dias");
  });
  it("a data sai no formato brasileiro", () => {
    expect(dateText("2026-11-03T12:00:00.000Z")).toMatch(/^0?3\/11\/2026$/);
  });
});

describe("resumo da situação", () => {
  it("cada estado tem etiqueta, título e explicação", () => {
    for (const state of ["beta", "trial", "paid", "complimentary", "admin", "expired"] as const) {
      const s = accessSummary(access({ state, allowed: state !== "expired" }));
      expect(s.badge.label.length, state).toBeGreaterThan(2);
      expect(s.title.length, state).toBeGreaterThan(5);
      expect(s.detail.length, state).toBeGreaterThan(15);
    }
  });
  it("teste: diz quando acaba; no último dia diz 'hoje'", () => {
    expect(accessSummary(access({ daysLeft: 12 })).detail).toContain("faltam 12 dias");
    expect(accessSummary(access({ daysLeft: 0 })).detail).toContain("hoje");
  });
  it("assinatura cancelada avisa que o acesso vale até o fim do período; ativa mostra a renovação", () => {
    expect(accessSummary(access({ state: "paid", cancelAtPeriodEnd: true })).detail).toMatch(/Cancelada: vale até/);
    expect(accessSummary(access({ state: "paid", cancelAtPeriodEnd: false })).detail).toMatch(/Renova em/);
  });
  it("cortesia sem prazo e com prazo", () => {
    expect(accessSummary(access({ state: "complimentary", expiresAt: null, daysLeft: null })).detail).toMatch(/sem data/);
    expect(accessSummary(access({ state: "complimentary" })).detail).toMatch(/até/);
  });
  it("vencido: diz que dá para ver e exportar, mas não editar", () => {
    const s = accessSummary(access({ state: "expired", allowed: false, expiresAt: null, daysLeft: null }));
    expect(s.badge.tone).toBe("negative");
    expect(s.detail).toMatch(/exportar/);
    expect(accessBadge(access({ state: "paid" })).label).toBe("Premium");
  });
});

describe("aviso na tela inicial", () => {
  it("cobrança desligada (beta): nunca avisa", () => {
    expect(accessBanner(access({ state: "beta" }), false)).toBeNull();
    expect(accessBanner(access({ state: "expired", allowed: false }), false)).toBeNull();
  });
  it("teste longe do fim: sem aviso; perto do fim: avisa (informativo, depois alerta)", () => {
    expect(accessBanner(access({ daysLeft: 25 }), true)).toBeNull();
    expect(accessBanner(access({ daysLeft: 10 }), true)).toMatchObject({ tone: "info" });
    expect(accessBanner(access({ daysLeft: 5 }), true)).toMatchObject({ tone: "warning" });
    expect(accessBanner(access({ daysLeft: 0 }), true)?.text).toContain("termina hoje");
    expect(accessBanner(access({ daysLeft: 1 }), true)?.text).toContain("1 dia");
  });
  it("vencido: aviso forte de somente leitura", () => {
    const b = accessBanner(access({ state: "expired", allowed: false, daysLeft: null, expiresAt: null }), true);
    expect(b).toMatchObject({ tone: "negative" });
    expect(b?.text).toMatch(/somente leitura/i);
  });
  it("assinante em dia, cortesia e administrador não veem aviso; cancelada perto do fim sim", () => {
    expect(accessBanner(access({ state: "paid", daysLeft: 20 }), true)).toBeNull();
    expect(accessBanner(access({ state: "paid", daysLeft: 3, cancelAtPeriodEnd: false }), true)).toBeNull();
    expect(accessBanner(access({ state: "complimentary", daysLeft: 2 }), true)).toBeNull();
    expect(accessBanner(access({ state: "admin", daysLeft: null, expiresAt: null }), true)).toBeNull();
    expect(accessBanner(access({ state: "paid", daysLeft: 3, cancelAtPeriodEnd: true }), true)).toMatchObject({ tone: "warning" });
  });
});

describe("cortesia (administrador)", () => {
  it("as opções de duração são válidas para a API (1 a 3650 dias ou sem prazo) e únicas", () => {
    for (const d of GRANT_DURATIONS) {
      if (d.days !== null) {
        expect(Number.isInteger(d.days)).toBe(true);
        expect(d.days).toBeGreaterThanOrEqual(1);
        expect(d.days).toBeLessThanOrEqual(3650);
      }
    }
    expect(new Set(GRANT_DURATIONS.map((d) => d.label)).size).toBe(GRANT_DURATIONS.length);
    expect(GRANT_DURATIONS.some((d) => d.days === null)).toBe(true);
  });
});

describe("opções de plano (mensal e anual)", () => {
  const planPrice = (amountCents: number, interval: "month" | "year") => ({ amountCents, currency: "BRL", interval });
  const both = { month: planPrice(1000, "month"), year: planPrice(10000, "year") };

  it("mostra o anual primeiro, com a economia calculada dos dois preços e o valor por mês", () => {
    const [yearly, monthly] = planOffers(both);
    expect(yearly).toMatchObject({ interval: "year", label: "Anual", savings: 17 });
    expect(plain(yearly!.total)).toBe("R$ 100,00 / ano");
    expect(plain(yearly!.perMonth)).toBe("R$ 8,33 por mês");
    expect(monthly).toMatchObject({ interval: "month", label: "Mensal", savings: null, perMonth: null });
    expect(plain(monthly!.total)).toBe("R$ 10,00 / mês");
  });

  it("só mostra o que existe no provedor: um ciclo só, ou nenhum", () => {
    expect(planOffers({ month: planPrice(1000, "month"), year: null }).map((o) => o.interval)).toEqual(["month"]);
    expect(planOffers({ month: null, year: planPrice(10000, "year") }).map((o) => o.interval)).toEqual(["year"]);
    expect(planOffers({ month: null, year: null })).toEqual([]);
    expect(planOffers(null)).toEqual([]);
  });

  it("não inventa economia: sem o preço mensal, ou com anual sem desconto, não há selo", () => {
    expect(planOffers({ month: null, year: planPrice(10000, "year") })[0]!.savings).toBeNull();
    expect(planOffers({ month: planPrice(1000, "month"), year: planPrice(12000, "year") })[0]!.savings).toBeNull();
  });

  it("vem marcado o anual, quando existe; senão o que houver", () => {
    expect(defaultInterval(planOffers(both))).toBe("year");
    expect(defaultInterval(planOffers({ month: planPrice(1000, "month"), year: null }))).toBe("month");
    expect(defaultInterval([])).toBe("month");
  });
});
