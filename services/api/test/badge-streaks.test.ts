import { describe, expect, it } from "vitest";
import { cushionMonths, dayIndex, longestRun, monthIndex, savingsSummary, weekIndex, type MonthTotals } from "../src/modules/badges/streaks";

describe("sequências", () => {
  it("dias, semanas e meses seguidos dão números seguidos (inclusive na virada de mês e de ano)", () => {
    expect(dayIndex("2026-03-01") - dayIndex("2026-02-28")).toBe(1);
    expect(dayIndex("2027-01-01") - dayIndex("2026-12-31")).toBe(1);
    expect(dayIndex("2024-03-01") - dayIndex("2024-02-28")).toBe(2); // ano bissexto
    expect(monthIndex("2027-01") - monthIndex("2026-12")).toBe(1);
    expect(monthIndex("2026-10-15")).toBe(monthIndex("2026-10"));
  });

  it("a semana começa na segunda-feira", () => {
    // 5/10/2026 é segunda; 11/10/2026 é domingo (mesma semana); 12/10 é a segunda seguinte
    expect(weekIndex("2026-10-05")).toBe(weekIndex("2026-10-11"));
    expect(weekIndex("2026-10-12")).toBe(weekIndex("2026-10-05") + 1);
    expect(weekIndex("2026-10-04")).toBe(weekIndex("2026-10-05") - 1); // domingo anterior
    expect(weekIndex("2027-01-04") - weekIndex("2026-12-28")).toBe(1); // virada de ano
  });

  it("a maior sequência de consecutivos, ignorando repetidos e ordem", () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun([5])).toBe(1);
    expect(longestRun([3, 4, 5, 9, 10])).toBe(3);
    expect(longestRun([10, 9, 3, 5, 4, 4, 4])).toBe(3);
    expect(longestRun([1, 3, 5, 7])).toBe(1);
    expect(longestRun(new Set([7, 8, 9, 10, 11]))).toBe(5);
  });

  it("dias seguidos de verdade: 28/fev → 1/mar entra na mesma sequência", () => {
    const days = ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-03"].map(dayIndex);
    expect(longestRun(days)).toBe(3);
  });
});

const m = (ym: string, income: number, expense: number): MonthTotals => ({ ym, income, expense });

describe("resumo dos meses fechados", () => {
  it("conta os meses no azul, a maior sequência, o total que sobrou e a melhor taxa", () => {
    const s = savingsSummary([m("2026-01", 500_000, 400_000), m("2026-02", 500_000, 450_000), m("2026-03", 500_000, 600_000), m("2026-04", 500_000, 250_000)]);
    expect(s.savingMonths).toBe(3);
    expect(s.savingStreak).toBe(2); // jan e fev; março estourou
    expect(s.savedTotalCents).toBe(100_000 + 50_000 + 250_000);
    expect(s.bestSavingRatePct).toBe(50);
  });

  it("mês sem receita não conta como economia (não dá para 'guardar' sem receber); empate também não", () => {
    const s = savingsSummary([m("2026-01", 0, 0), m("2026-02", 0, 100), m("2026-03", 1000, 1000)]);
    expect(s.savingMonths).toBe(0);
    expect(s.savedTotalCents).toBe(0);
    expect(s.bestSavingRatePct).toBe(0);
  });

  it("a taxa é arredondada para baixo (99,9% não vira 100%)", () => {
    expect(savingsSummary([m("2026-01", 10_000, 1)]).bestSavingRatePct).toBe(99);
    expect(savingsSummary([m("2026-01", 3, 2)]).bestSavingRatePct).toBe(33);
  });

  it("a sequência exige meses de calendário seguidos: um mês sem movimento no meio quebra", () => {
    const s = savingsSummary([m("2026-01", 100, 10), m("2026-03", 100, 10), m("2026-04", 100, 10)]);
    expect(s.savingMonths).toBe(3);
    expect(s.savingStreak).toBe(2); // mar e abr
  });

  it("não depende da ordem em que os meses chegam", () => {
    const a = [m("2026-01", 100, 10), m("2026-02", 100, 10), m("2026-03", 100, 90)];
    expect(savingsSummary([...a].reverse())).toEqual(savingsSummary(a));
  });

  it("despesa em queda: meses seguidos gastando menos que o mês anterior", () => {
    expect(savingsSummary([m("2026-01", 1000, 900), m("2026-02", 1000, 800), m("2026-03", 1000, 700), m("2026-04", 1000, 750)]).spendDownStreak).toBe(2);
    expect(savingsSummary([m("2026-01", 1000, 900), m("2026-02", 1000, 900)]).spendDownStreak).toBe(0); // igual não é queda
    expect(savingsSummary([m("2026-01", 1000, 900), m("2026-03", 1000, 100)]).spendDownStreak).toBe(0); // mês no meio sem dados: não compara
    expect(savingsSummary([m("2026-01", 1000, 0), m("2026-02", 1000, 0)]).spendDownStreak).toBe(0); // sem despesa não é "economia de gasto"
  });
});

describe("colchão financeiro", () => {
  it("quantos meses de despesas o saldo cobre, pela média dos últimos 3 meses fechados", () => {
    const closed = [m("2026-01", 0, 999_999), m("2026-02", 0, 100_000), m("2026-03", 0, 200_000), m("2026-04", 0, 300_000)]; // janeiro fica de fora (só os 3 últimos)
    expect(cushionMonths(1_200_000, closed)).toBe(6); // média 200.000
    expect(cushionMonths(199_999, closed)).toBe(0);
    expect(cushionMonths(200_000, closed)).toBe(1);
  });

  it("sem saldo positivo ou sem histórico de despesas, é zero", () => {
    expect(cushionMonths(0, [m("2026-01", 0, 100)])).toBe(0);
    expect(cushionMonths(-500, [m("2026-01", 0, 100)])).toBe(0);
    expect(cushionMonths(1_000_000, [])).toBe(0);
    expect(cushionMonths(1_000_000, [m("2026-01", 500, 0)])).toBe(0);
  });
});
