import { describe, expect, it } from "vitest";
import { billingDTO, checkoutBody, perMonthCents, yearlySavingsPercent, type PricesByInterval } from "./schemas/billing";

const price = (amountCents: number, interval: "month" | "year", currency = "BRL") => ({ amountCents, currency, interval });
const none: PricesByInterval = { month: null, year: null };

describe("valor por mês e economia do plano anual", () => {
  it("o plano mensal vale o que custa; o anual vale um doze avos (arredondado)", () => {
    expect(perMonthCents(price(2990, "month"))).toBe(2990);
    expect(perMonthCents(price(29900, "year"))).toBe(2492); // 24,9167
    expect(perMonthCents(price(12000, "year"))).toBe(1000);
  });

  it("a economia do anual vem só dos dois preços reais: % inteiro sobre 12 mensais", () => {
    expect(yearlySavingsPercent({ month: price(1000, "month"), year: price(10000, "year") })).toBe(17); // paga 10 em vez de 12
    expect(yearlySavingsPercent({ month: price(1000, "month"), year: price(9000, "year") })).toBe(25);
    expect(yearlySavingsPercent({ month: price(2990, "month"), year: price(29900, "year") })).toBe(17);
  });

  it("sem preço dos dois ciclos, com moedas diferentes ou sem desconto de verdade: não inventa economia", () => {
    expect(yearlySavingsPercent(none)).toBeNull();
    expect(yearlySavingsPercent({ month: price(1000, "month"), year: null })).toBeNull();
    expect(yearlySavingsPercent({ month: null, year: price(10000, "year") })).toBeNull();
    expect(yearlySavingsPercent({ month: price(1000, "month", "BRL"), year: price(10000, "year", "USD") })).toBeNull();
    expect(yearlySavingsPercent({ month: price(1000, "month"), year: price(12000, "year") })).toBeNull(); // igual a 12 mensais
    expect(yearlySavingsPercent({ month: price(1000, "month"), year: price(15000, "year") })).toBeNull(); // mais caro
    expect(yearlySavingsPercent({ month: price(0, "month"), year: price(0, "year") })).toBeNull();
  });
});

describe("contrato de cobrança", () => {
  it("o pedido de pagamento sem ciclo vale o MENSAL (nunca cobra o anual sem a pessoa escolher)", () => {
    expect(checkoutBody.parse({})).toEqual({ investments: false, interval: "month", mode: "recurring" });
    expect(checkoutBody.parse({ interval: "year", investments: true })).toEqual({ investments: true, interval: "year", mode: "recurring" });
    expect(checkoutBody.parse({ mode: "once", interval: "year" })).toEqual({ investments: false, interval: "year", mode: "once" });
    expect(checkoutBody.safeParse({ mode: "weekly" }).success).toBe(false);
    expect(checkoutBody.safeParse({ interval: "week" }).success).toBe(false);
    expect(checkoutBody.safeParse({ interval: "year", extra: 1 }).success).toBe(false);
  });

  it("a resposta traz os preços por ciclo e o ciclo da assinatura atual", () => {
    const ok = billingDTO.safeParse({
      access: { state: "paid", allowed: true, expiresAt: null, daysLeft: null, cancelAtPeriodEnd: false, features: { investments: false } },
      enforced: true,
      trialDays: 30,
      provider: "stripe",
      checkoutAvailable: true,
      investmentsAvailable: true,
      canManage: true,
      hasInvestmentsAddon: false,
      interval: "year",
      autoRenew: false,
      prices: { basic: { month: price(1000, "month"), year: price(10000, "year") }, investments: { month: price(500, "month"), year: null } },
    });
    expect(ok.success).toBe(true);
    expect(billingDTO.safeParse({ ...ok.data, interval: "week" }).success).toBe(false);
  });
});
