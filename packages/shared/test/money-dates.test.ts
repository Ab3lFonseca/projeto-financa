import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateInMonth,
  diffDays,
  endOfMonth,
  formatBRL,
  isISODate,
  listMonthStarts,
  parseMoneyToCents,
  percentChange,
  splitInstallments,
  startOfMonth,
  startOfWeek,
  todayIn,
} from "../src";

describe("formatBRL", () => {
  it("formata no padrão brasileiro", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(100_000_000)).toBe("R$ 1.000.000,00");
  });
  it("trata negativos, sinal e opções", () => {
    expect(formatBRL(-500)).toBe("-R$ 5,00");
    expect(formatBRL(100, { signed: true })).toBe("+R$ 1,00");
    expect(formatBRL(0, { signed: true })).toBe("R$ 0,00");
    expect(formatBRL(720000, { hideZeroCents: true })).toBe("R$ 7.200");
    expect(formatBRL(720050, { hideZeroCents: true })).toBe("R$ 7.200,50");
    expect(formatBRL(5, { noSymbol: true })).toBe("0,05");
  });
});

describe("parseMoneyToCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["R$ 12", 1200],
    ["12", 1200],
    ["0,5", 50],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["1.234,5", 123450],
    ["1234.5", 123450],
    ["-10,50", -1050],
    ["R$ 1.000,00", 100000],
  ])("aceita %s", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "12,345", "1,2,3", "1.2.3", "R$", "12,3,4", "99999999999999999"])("rejeita %j", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("splitInstallments", () => {
  it("distribui os centavos restantes nas primeiras parcelas", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(100, 1)).toEqual([100]);
    expect(splitInstallments(5, 3)).toEqual([2, 2, 1]);
  });
  it("a soma das parcelas é sempre o total", () => {
    for (const [total, n] of [[99999, 7], [1, 1], [123457, 12], [1_000_000_00, 24]] as const) {
      expect(splitInstallments(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it("rejeita entradas inválidas", () => {
    expect(() => splitInstallments(0, 3)).toThrow();
    expect(() => splitInstallments(100, 0)).toThrow();
    expect(() => splitInstallments(10.5, 2)).toThrow();
  });
});

describe("percentChange", () => {
  it("calcula com 1 casa decimal e trata base zero", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(90, 100)).toBe(-10);
    expect(percentChange(1, 3)).toBe(-66.7);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe("datas de calendário", () => {
  it("valida datas reais", () => {
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("26-1-1")).toBe(false);
  });

  it("soma meses limitando ao último dia do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -13)).toBe("2024-12-15");
  });

  it("calcula dia fixo dentro do mês", () => {
    expect(dateInMonth("2026-02-10", 31)).toBe("2026-02-28");
    expect(dateInMonth("2026-10-01", 15)).toBe("2026-10-15");
  });

  it("início/fim de mês, semana e diferenças", () => {
    expect(startOfMonth("2026-10-17")).toBe("2026-10-01");
    expect(endOfMonth("2026-02-03")).toBe("2026-02-28");
    // 2026-10-04 é domingo → a semana começa na segunda anterior
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28");
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05");
    expect(diffDays("2026-10-01", "2026-10-31")).toBe(30);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("lista os meses entre duas datas", () => {
    expect(listMonthStarts("2026-08-15", "2026-10-02")).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
  });

  it("calcula 'hoje' no fuso do usuário", () => {
    // 02:30 UTC ainda é "ontem" em São Paulo (UTC-3)
    expect(todayIn("America/Sao_Paulo", new Date("2026-10-04T02:30:00Z"))).toBe("2026-10-03");
    expect(todayIn("America/Sao_Paulo", new Date("2026-10-04T12:00:00Z"))).toBe("2026-10-04");
    expect(todayIn("Fuso/Invalido", new Date("2026-10-04T12:00:00Z"))).toBe("2026-10-04");
  });
});
