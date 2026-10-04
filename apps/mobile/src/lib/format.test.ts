import { describe, expect, it } from "vitest";
import {
  capitalize,
  formatAgo,
  formatCompactBRL,
  formatDateLong,
  formatDateRelative,
  formatDateShort,
  formatDayHeader,
  formatMonth,
  formatMonthShort,
  formatPct,
  weekdayOf,
} from "./format";

const TODAY = "2026-10-04"; // domingo

describe("datas", () => {
  it("dia da semana (0 = domingo)", () => {
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(weekdayOf("2026-10-05")).toBe(1);
    expect(weekdayOf("2024-02-29")).toBe(4); // bissexto
  });

  it("formatos curtos e longos", () => {
    expect(formatDateShort("2026-10-04")).toBe("4 out 2026");
    expect(formatDateLong("2026-10-04")).toBe("domingo, 4 de outubro de 2026");
    expect(formatMonth("2026-10-15")).toBe("outubro de 2026");
    expect(formatMonthShort("2026-10-15")).toBe("Out/26");
  });

  it("relativo: hoje, ontem, amanhã, ou data", () => {
    expect(formatDateRelative("2026-10-04", TODAY)).toBe("Hoje");
    expect(formatDateRelative("2026-10-03", TODAY)).toBe("Ontem");
    expect(formatDateRelative("2026-10-05", TODAY)).toBe("Amanhã");
    expect(formatDateRelative("2026-10-20", TODAY)).toBe("20 out 2026");
  });

  it("cabeçalho de dia: omite o ano só quando é o atual", () => {
    expect(formatDayHeader("2026-10-04", TODAY)).toBe("Hoje");
    expect(formatDayHeader("2026-10-03", TODAY)).toBe("Ontem");
    expect(formatDayHeader("2026-10-02", TODAY)).toBe("sex, 2 out");
    expect(formatDayHeader("2025-12-31", TODAY)).toBe("qua, 31 dez 2025");
  });

  it("virada de mês e de ano no relativo", () => {
    expect(formatDateRelative("2026-11-01", "2026-10-31")).toBe("Amanhã");
    expect(formatDateRelative("2026-12-31", "2027-01-01")).toBe("Ontem");
  });
});

describe("atualizado há...", () => {
  const NOW = new Date("2026-10-04T12:00:00Z").getTime();
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it("agora, minutos, horas, dias ou a data", () => {
    expect(formatAgo(ago(20_000), NOW)).toBe("agora");
    expect(formatAgo(ago(5 * 60_000), NOW)).toBe("há 5 min");
    expect(formatAgo(ago(59 * 60_000), NOW)).toBe("há 59 min");
    expect(formatAgo(ago(2 * 3_600_000 + 1), NOW)).toBe("há 2 h");
    expect(formatAgo(ago(3 * 86_400_000), NOW)).toBe("há 3 d");
    expect(formatAgo("2026-07-01T10:00:00Z", NOW)).toBe("1 jul 2026");
  });

  it("sem data e relógios adiantados não quebram", () => {
    expect(formatAgo(null, NOW)).toBe("nunca");
    expect(formatAgo(undefined, NOW)).toBe("nunca");
    expect(formatAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe("agora");
  });
});

describe("números", () => {
  it("valores compactos de eixo (entrada em centavos)", () => {
    expect(formatCompactBRL(0)).toBe("0");
    expect(formatCompactBRL(5_049)).toBe("50");
    expect(formatCompactBRL(125_000)).toBe("1,3 mil");
    expect(formatCompactBRL(5_000_000)).toBe("50 mil");
    expect(formatCompactBRL(-5_000_000)).toBe("-50 mil");
    expect(formatCompactBRL(150_000_000)).toBe("1,5 mi");
  });

  it("percentuais: vírgula, sinal opcional e nulo", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(10)).toBe("10%");
    expect(formatPct(12.5, { signed: true })).toBe("+12,5%");
    expect(formatPct(-8.34, { signed: true })).toBe("−8,3%");
    expect(formatPct(-8.34)).toBe("8,3%");
    expect(formatPct(0, { signed: true })).toBe("0%");
  });

  it("capitalize", () => {
    expect(capitalize("outubro de 2026")).toBe("Outubro de 2026");
    expect(capitalize("")).toBe("");
  });
});
