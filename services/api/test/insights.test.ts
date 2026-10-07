import { describe, expect, it } from "vitest";
import { buildInsights, type InsightInput } from "../src/modules/dashboard/insights";

const base: InsightInput = {
  today: "2026-10-10",
  previousMonth: null,
  expenseToDateCents: 0,
  previousExpenseToDateCents: 0,
  categories: [],
  budgets: [],
  invoicesDue: [],
  goals: [],
  advanced: true,
};

const messages = (over: Partial<InsightInput>) => buildInsights({ ...base, ...over }).map((i) => i.message);

describe("motor de insights", () => {
  it("sem dados, nenhum insight", () => {
    expect(buildInsights(base)).toEqual([]);
  });

  it("despesas subiram / caíram em relação ao mês passado (só com base de comparação)", () => {
    expect(messages({ expenseToDateCents: 112_000, previousExpenseToDateCents: 100_000 })).toContain(
      "Suas despesas aumentaram 12% em relação ao mês passado.",
    );
    expect(messages({ expenseToDateCents: 82_000, previousExpenseToDateCents: 100_000 })).toContain(
      "Suas despesas caíram 18% em relação ao mês passado.",
    );
    // variação pequena ou sem base: silêncio
    expect(messages({ expenseToDateCents: 102_000, previousExpenseToDateCents: 100_000 })).toEqual([]);
    expect(messages({ expenseToDateCents: 50_000, previousExpenseToDateCents: 0 })).toEqual([]);
    expect(messages({ expenseToDateCents: 50_000, previousExpenseToDateCents: 1_000 })).toEqual([]);
  });

  it("nos primeiros dias do mês não compara com o mês anterior (evita percentuais ruidosos)", () => {
    const early = { today: "2026-10-04" };
    expect(messages({ ...early, expenseToDateCents: 112_000, previousExpenseToDateCents: 100_000 })).toEqual([]);
    expect(
      messages({ ...early, categories: [{ categoryId: "a", name: "Alimentação", currentCents: 10_000, previousCents: 40_000 }] }),
    ).toEqual([]);
    // a sobra do mês que fechou e os orçamentos valem desde o dia 1
    expect(messages({ ...early, previousMonth: { month: "2026-09-01", incomeCents: 100_000, expenseCents: 40_000 } })).toEqual(["Em setembro sobraram R$ 600,00 do que você recebeu."]);
  });

  describe("economia: só do mês FECHADO", () => {
    const closed = (incomeCents: number, expenseCents: number) => ({ previousMonth: { month: "2026-09-01" as const, incomeCents, expenseCents } });

    it("sobrou dinheiro no mês que fechou: avisa com o nome do mês; gastou a mais: avisa também", () => {
      expect(messages(closed(720_000, 595_000))).toContain("Em setembro sobraram R$ 1.250,00 do que você recebeu.");
      expect(messages(closed(100_000, 130_000))).toContain("Em setembro você gastou R$ 300,00 a mais do que recebeu.");
      expect(messages(closed(100_000, 100_000))).toEqual([]); // zerou: nada a dizer
    });

    it("receita lançada no mês em andamento NUNCA vira economia (sem mês fechado, nada de economia)", () => {
      // o salário caiu hoje e ainda não há despesas: antes isso aparecia como "você economizou o salário inteiro"
      expect(messages({ previousMonth: null, expenseToDateCents: 0 })).toEqual([]);
      for (const m of messages({ previousMonth: null, expenseToDateCents: 30_000, previousExpenseToDateCents: 30_000 })) expect(m).not.toMatch(/economiz|sobraram/);
    });

    it("mês fechado sem nenhum lançamento não gera aviso", () => {
      expect(messages(closed(0, 0))).toEqual([]);
    });

    it("o aviso vale só até o dia 10 do mês seguinte (depois é notícia velha)", () => {
      expect(messages({ ...closed(720_000, 595_000), today: "2026-10-10" })).toHaveLength(1);
      expect(messages({ ...closed(720_000, 595_000), today: "2026-10-11" })).toEqual([]);
      expect(messages({ ...closed(100_000, 130_000), today: "2026-10-28" })).toEqual([]);
    });

    it("usa o nome do mês que fechou (janeiro/dezembro, virada de ano)", () => {
      expect(messages({ today: "2027-01-05", previousMonth: { month: "2026-12-01", incomeCents: 500_000, expenseCents: 300_000 } })).toEqual(["Em dezembro sobraram R$ 2.000,00 do que você recebeu."]);
    });
  });

  it("orçamentos: aviso e estouro, com severidade crítica no estouro", () => {
    const category = { id: "c1", name: "Lazer", icon: "x", color: "#000000", type: "EXPENSE" as const, deleted: false };
    const out = buildInsights({
      ...base,
      budgets: [
        { id: "b1", category, usedPct: 92, status: "WARNING", spentCents: 92_000, amountCents: 100_000 },
        { id: "b2", category: { ...category, id: "c2", name: "Transporte" }, usedPct: 110, status: "EXCEEDED", spentCents: 55_000, amountCents: 50_000 },
        { id: "b3", category: { ...category, id: "c3", name: "Mercado" }, usedPct: 10, status: "OK", spentCents: 1, amountCents: 10 },
      ],
    });
    expect(out.map((i) => i.message)).toEqual([
      "Você ultrapassou o orçamento de Transporte em R$ 50,00.",
      "Você está próximo de ultrapassar seu orçamento de Lazer (92% usado).",
    ]);
    expect(out[0]!.severity).toBe("critical");
    expect(out[1]!.severity).toBe("warning");
  });

  it("faturas: hoje, amanhã, em N dias; ignora longe, paga e vencida", () => {
    const due = (dueDate: string, remainingCents = 10_000) => ({ cardName: "Nubank", dueDate, remainingCents });
    expect(messages({ invoicesDue: [due("2026-10-10")] })).toEqual(["A fatura do Nubank vence hoje (R$ 100,00)."]);
    expect(messages({ invoicesDue: [due("2026-10-11")] })).toEqual(["A fatura do Nubank vence amanhã (R$ 100,00)."]);
    expect(messages({ invoicesDue: [due("2026-10-13", 123_456)] })).toEqual(["A fatura do Nubank vence em 3 dias (R$ 1.234,56)."]);
    expect(messages({ invoicesDue: [due("2026-10-20"), due("2026-10-12", 0), due("2026-10-01")] })).toEqual([]);
  });

  it("variação por categoria e meta quase concluída só no Premium (advanced)", () => {
    const input: Partial<InsightInput> = {
      categories: [
        { categoryId: "a", name: "Alimentação", currentCents: 82_000, previousCents: 100_000 },
        { categoryId: "b", name: "Lazer", currentCents: 10_000, previousCents: 9_000 },
      ],
      goals: [{ id: "g1", name: "Carro", progressPct: 85, status: "ACTIVE" }],
    };
    const premium = messages({ ...input, advanced: true });
    expect(premium).toContain("Você gastou 18% menos com Alimentação este mês.");
    expect(premium).toContain('Falta pouco para a meta "Carro": 85% concluída.');
    expect(messages({ ...input, advanced: false })).toEqual([]);
  });

  it("escolhe a categoria com maior variação e ignora variações irrelevantes", () => {
    const out = messages({
      categories: [
        { categoryId: "a", name: "Mercado", currentCents: 150_000, previousCents: 100_000 },
        { categoryId: "b", name: "Lazer", currentCents: 6_000, previousCents: 5_000 }, // < R$ 30 de diferença
        { categoryId: "c", name: "Novo", currentCents: 90_000, previousCents: 0 }, // sem base
      ],
    });
    expect(out).toEqual(["Você gastou 50% a mais com Mercado este mês."]);
  });

  it("limita a 6 insights e ordena por severidade", () => {
    const category = { id: "c1", name: "X", icon: "x", color: "#000000", type: "EXPENSE" as const, deleted: false };
    const out = buildInsights({
      ...base,
      previousMonth: { month: "2026-09-01", incomeCents: 200_000, expenseCents: 100_000 },
      expenseToDateCents: 50_000,
      previousExpenseToDateCents: 100_000,
      budgets: Array.from({ length: 5 }, (_, i) => ({
        id: `b${i}`, category: { ...category, name: `Cat ${i}` }, usedPct: 120, status: "EXCEEDED" as const, spentCents: 12_000, amountCents: 10_000,
      })),
      invoicesDue: [{ cardName: "Nubank", dueDate: "2026-10-11", remainingCents: 1_000 }],
    });
    expect(out).toHaveLength(6);
    const severities = out.map((i) => i.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ["critical", "warning", "positive", "info"].indexOf(a) - ["critical", "warning", "positive", "info"].indexOf(b)));
    expect(severities[0]).toBe("critical");
  });
});
