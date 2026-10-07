import { describe, expect, it } from "vitest";
import { closedMonthSavings, type ClosedMonth } from "./savings";

const closed = (over: Partial<ClosedMonth> = {}): ClosedMonth => ({ month: "2026-09-01", incomeCents: 700_000, expenseCents: 525_000, leftoverCents: 175_000, leftoverRatePct: 25, ...over });

describe("economia: só do mês fechado", () => {
  it("sobrou dinheiro no mês que fechou: mostra o valor, com o nome do mês e a porcentagem", () => {
    const s = closedMonthSavings(closed());
    expect(s.label).toBe("Sobrou em setembro");
    expect(s.cents).toBe(175_000);
    expect(s.hint).toMatch(/25.* do que recebeu/);
    expect(s.summary).toMatch(/^em setembro você guardou 25.*% do que recebeu$/);
  });

  it("sem mês fechado (conta nova, ou resposta antiga do servidor): nunca mostra valor de economia", () => {
    for (const none of [null, undefined]) {
      const s = closedMonthSavings(none);
      expect(s).toEqual({ label: "Economia", cents: null, hint: "aparece quando um mês fecha", summary: null });
    }
  });

  it("o mês fechado gastou mais do que recebeu: sem valor (traço) e sem frase de 'você guardou'", () => {
    const s = closedMonthSavings(closed({ incomeCents: 100_000, expenseCents: 130_000, leftoverCents: -30_000, leftoverRatePct: -30 }));
    expect(s).toMatchObject({ label: "Sobrou em setembro", cents: null, hint: "gastou a mais que recebeu", summary: null });
  });

  it("o mês fechado zerou: nada sobrou", () => {
    const s = closedMonthSavings(closed({ incomeCents: 100_000, expenseCents: 100_000, leftoverCents: 0, leftoverRatePct: 0 }));
    expect(s).toMatchObject({ cents: null, hint: "nada sobrou", summary: null });
  });

  it("sobrou, mas sem receita registrada (taxa indisponível): mostra o valor sem inventar porcentagem", () => {
    const s = closedMonthSavings(closed({ incomeCents: 0, expenseCents: 0, leftoverCents: 50_000, leftoverRatePct: null }));
    expect(s.cents).toBe(50_000);
    expect(s.hint).toBe("mês fechado");
    expect(s.summary).toBeNull();
  });

  it("o nome do mês acompanha o mês fechado (virada de ano)", () => {
    expect(closedMonthSavings(closed({ month: "2026-12-01" })).label).toBe("Sobrou em dezembro");
    expect(closedMonthSavings(closed({ month: "2027-01-01" })).label).toBe("Sobrou em janeiro");
  });
});
