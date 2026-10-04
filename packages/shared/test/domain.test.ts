import { describe, expect, it } from "vitest";
import {
  deriveInvoiceStatus,
  invoiceCycleFor,
  nextOccurrence,
  occurrencesBetween,
  resolveRange,
  type RecurrenceRule,
} from "../src";

describe("invoiceCycleFor (fatura do cartão)", () => {
  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(invoiceCycleFor("2026-10-03", 5, 12)).toEqual({
      closingDate: "2026-10-05",
      dueDate: "2026-10-12",
      referenceMonth: "2026-10-01",
    });
  });

  it("compra no dia do fechamento ainda entra na fatura que fecha", () => {
    expect(invoiceCycleFor("2026-10-05", 5, 12).closingDate).toBe("2026-10-05");
  });

  it("compra depois do fechamento vai para a fatura seguinte", () => {
    expect(invoiceCycleFor("2026-10-06", 5, 12)).toEqual({
      closingDate: "2026-11-05",
      dueDate: "2026-11-12",
      referenceMonth: "2026-11-01",
    });
  });

  it("vencimento antes do fechamento (dia) cai no mês seguinte", () => {
    expect(invoiceCycleFor("2026-10-20", 25, 5)).toEqual({
      closingDate: "2026-10-25",
      dueDate: "2026-11-05",
      referenceMonth: "2026-11-01",
    });
    expect(invoiceCycleFor("2026-10-26", 25, 5)).toEqual({
      closingDate: "2026-11-25",
      dueDate: "2026-12-05",
      referenceMonth: "2026-12-01",
    });
  });

  it("vira o ano corretamente", () => {
    expect(invoiceCycleFor("2026-12-26", 25, 5)).toEqual({
      closingDate: "2027-01-25",
      dueDate: "2027-02-05",
      referenceMonth: "2027-02-01",
    });
  });

  it("fechamento em dia 29–31 usa o último dia de meses curtos", () => {
    expect(invoiceCycleFor("2026-02-10", 31, 10)).toEqual({
      closingDate: "2026-02-28",
      dueDate: "2026-03-10",
      referenceMonth: "2026-03-01",
    });
    expect(invoiceCycleFor("2026-02-28", 30, 10).closingDate).toBe("2026-02-28");
  });
});

describe("deriveInvoiceStatus", () => {
  const base = { closingDate: "2026-10-05", today: "2026-10-03" };
  it("aberta antes do fechamento", () => {
    expect(deriveInvoiceStatus({ ...base, totalCents: 1000, paidCents: 0 })).toBe("OPEN");
  });
  it("fechada depois do fechamento", () => {
    expect(deriveInvoiceStatus({ ...base, today: "2026-10-06", totalCents: 1000, paidCents: 0 })).toBe("CLOSED");
  });
  it("paga quando os pagamentos cobrem o total", () => {
    expect(deriveInvoiceStatus({ ...base, today: "2026-10-06", totalCents: 1000, paidCents: 1000 })).toBe("PAID");
    expect(deriveInvoiceStatus({ ...base, today: "2026-10-06", totalCents: 1000, paidCents: 400 })).toBe("CLOSED");
  });
  it("fatura zerada já fechada conta como paga", () => {
    expect(deriveInvoiceStatus({ ...base, today: "2026-10-06", totalCents: 0, paidCents: 0 })).toBe("PAID");
  });
});

describe("recorrência", () => {
  const monthly: RecurrenceRule = { frequency: "MONTHLY", intervalCount: 1, dayOfMonth: 31, startDate: "2026-01-31" };

  it("mensal ancorada no dia: 31/jan → 28/fev → 31/mar", () => {
    expect(nextOccurrence(monthly, "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(monthly, "2026-02-28")).toBe("2026-03-31");
  });

  it("semanal, intervalo e anual", () => {
    expect(nextOccurrence({ frequency: "WEEKLY", intervalCount: 1, startDate: "2026-10-01" }, "2026-10-01")).toBe("2026-10-08");
    expect(nextOccurrence({ frequency: "WEEKLY", intervalCount: 2, startDate: "2026-10-01" }, "2026-10-01")).toBe("2026-10-15");
    expect(nextOccurrence({ frequency: "MONTHLY", intervalCount: 2, startDate: "2026-10-10" }, "2026-10-10")).toBe("2026-12-10");
    expect(
      nextOccurrence({ frequency: "YEARLY", intervalCount: 1, dayOfMonth: 29, startDate: "2028-02-29" }, "2028-02-29"),
    ).toBe("2029-02-28");
  });

  it("usa o dia de início quando dayOfMonth não é informado", () => {
    expect(nextOccurrence({ frequency: "MONTHLY", intervalCount: 1, startDate: "2026-10-17" }, "2026-10-17")).toBe("2026-11-17");
  });

  it("respeita a data final", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", intervalCount: 1, startDate: "2026-10-10", endDate: "2026-12-10" };
    expect(occurrencesBetween(rule, "2026-10-10", "2027-12-31")).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(nextOccurrence(rule, "2026-12-10")).toBeNull();
  });

  it("limita o número de ocorrências por execução", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", intervalCount: 1, startDate: "2020-01-01" };
    expect(occurrencesBetween(rule, "2020-01-01", "2030-01-01", 10)).toHaveLength(10);
  });
});

describe("resolveRange", () => {
  const today = "2026-10-04";
  it("resolve os períodos pré-definidos", () => {
    expect(resolveRange("this_month", today)).toEqual({ range: "this_month", from: "2026-10-01", to: "2026-10-31" });
    expect(resolveRange("last_3_months", today)).toEqual({ range: "last_3_months", from: "2026-08-01", to: "2026-10-31" });
    expect(resolveRange("last_6_months", today)).toEqual({ range: "last_6_months", from: "2026-05-01", to: "2026-10-31" });
    expect(resolveRange("this_year", today)).toEqual({ range: "this_year", from: "2026-01-01", to: "2026-10-31" });
  });
  it("valida o período personalizado", () => {
    expect(resolveRange("custom", today, { from: "2026-01-10", to: "2026-02-20" })).toEqual({
      range: "custom",
      from: "2026-01-10",
      to: "2026-02-20",
    });
    expect(() => resolveRange("custom", today)).toThrow();
    expect(() => resolveRange("custom", today, { from: "2026-03-01", to: "2026-02-01" })).toThrow();
    expect(() => resolveRange("custom", today, { from: "2000-01-01", to: "2026-02-01" })).toThrow();
  });
});
