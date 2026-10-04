import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { createWorld, type World } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv(); // "hoje" = 2026-10-04 (domingo)
});
afterAll(async () => {
  await env.close();
});

/**
 * Cenário com números conhecidos (valores em centavos):
 *   saldo inicial 500.000
 *   setembro: receita 700.000 (5/set); despesas: 40.000 alimentação (2/set), 20.000 transporte (3/set), 30.000 lazer (10/set)
 *   outubro:  receita 720.000 (1/out); despesas: 25.000 alim. (2/out), 15.000 mercado (3/out), 10.000 transporte (3/out), 5.000 lazer (4/out)
 *             + 8.000 de lazer em 20/out (futuro → PENDING, não conta)
 */
async function scenario(): Promise<World> {
  const w = await createWorld(env, { opening: 500_000 });
  const food = w.cat("expense.food").id;
  const groceries = w.cat("expense.groceries").id;
  const transport = w.cat("expense.transport").id;
  const leisure = w.cat("expense.leisure").id;
  await w.income({ amountCents: 700_000, occurredOn: "2026-09-05" });
  await w.expense({ amountCents: 40_000, occurredOn: "2026-09-02", categoryId: food });
  await w.expense({ amountCents: 20_000, occurredOn: "2026-09-03", categoryId: transport });
  await w.expense({ amountCents: 30_000, occurredOn: "2026-09-10", categoryId: leisure });
  await w.income({ amountCents: 720_000, occurredOn: "2026-10-01" });
  await w.expense({ amountCents: 25_000, occurredOn: "2026-10-02", categoryId: food });
  await w.expense({ amountCents: 15_000, occurredOn: "2026-10-03", categoryId: groceries });
  await w.expense({ amountCents: 10_000, occurredOn: "2026-10-03", categoryId: transport });
  await w.expense({ amountCents: 5_000, occurredOn: "2026-10-04", categoryId: leisure });
  await w.expense({ amountCents: 8_000, occurredOn: "2026-10-20", categoryId: leisure });
  return w;
}

describe("GET /v1/dashboard", () => {
  it("usuário novo e vazio: tudo zerado, sem erro e sem insights", async () => {
    const w = await createWorld(env, { opening: 0 });
    const res = await w.user.get("/v1/dashboard");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      today: "2026-10-04",
      totalBalanceCents: 0,
      month: { month: "2026-10-01", incomeCents: 0, expenseCents: 0, savingsCents: 0, savingsRatePct: null, expenseChangePct: null },
      recentTransactions: [],
      spendingByCategory: [],
      budgetAlerts: [],
      insights: [],
      unreadNotifications: 0,
    });
    expect(res.body.evolution).toHaveLength(6);
    expect(res.body.evolution.map((e: any) => e.month)).toEqual([
      "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01",
    ]);
  });

  it("calcula saldo total, resumo do mês, comparativo e economia", async () => {
    const w = await scenario();
    const d = (await w.user.get("/v1/dashboard")).body;
    // 500.000 + 700.000 − 90.000 + 720.000 − 55.000
    expect(d.totalBalanceCents).toBe(1_775_000);
    expect(d.month).toMatchObject({
      month: "2026-10-01",
      incomeCents: 720_000,
      expenseCents: 55_000, // a despesa de 20/out está PENDING
      savingsCents: 665_000,
      savingsRatePct: 92.4,
      // mesmo período do mês anterior (1–4/set): despesas 60.000, receita 0 (o salário caiu em 5/set)
      previousExpenseCents: 60_000,
      previousIncomeCents: 0,
      // dia 4: cedo demais para comparar em %, então o dashboard devolve null
      expenseChangePct: null,
      incomeChangePct: null,
    });
    expect(d.accounts).toHaveLength(1);
    expect(d.accounts[0].balanceCents).toBe(1_775_000);
  });

  it("últimas transações (até hoje), gastos por categoria e evolução de 6 meses", async () => {
    const w = await scenario();
    const d = (await w.user.get("/v1/dashboard")).body;
    expect(d.recentTransactions[0].occurredOn).toBe("2026-10-04");
    expect(d.recentTransactions.every((t: any) => t.occurredOn <= "2026-10-04")).toBe(true);
    expect(d.recentTransactions).toHaveLength(8);

    expect(d.spendingByCategory.map((c: any) => [c.name, c.totalCents])).toEqual([
      ["Alimentação", 25_000],
      ["Mercado", 15_000],
      ["Transporte", 10_000],
      ["Lazer", 5_000],
    ]);
    expect(d.spendingByCategory[0].pct).toBe(45.5);

    const sep = d.evolution.find((e: any) => e.month === "2026-09-01");
    const oct = d.evolution.find((e: any) => e.month === "2026-10-01");
    expect(sep).toMatchObject({ incomeCents: 700_000, expenseCents: 90_000, balanceCents: 1_110_000 });
    expect(oct).toMatchObject({ incomeCents: 720_000, expenseCents: 55_000, balanceCents: 1_775_000 });
  });

  it("agrupa em 'Outras categorias' quando há mais de 5", async () => {
    const w = await createWorld(env, { opening: 0 });
    const keys = ["food", "groceries", "transport", "housing", "health", "education", "leisure"];
    for (const [i, k] of keys.entries()) await w.expense({ amountCents: 1_000 * (keys.length - i), categoryId: w.cat(`expense.${k}`).id });
    const d = (await w.user.get("/v1/dashboard")).body;
    expect(d.spendingByCategory).toHaveLength(6);
    expect(d.spendingByCategory[5]).toMatchObject({ name: "Outras categorias", totalCents: 2_000 + 1_000 });
    const pctSum = d.spendingByCategory.reduce((s: number, c: any) => s + c.pct, 0);
    expect(pctSum).toBeGreaterThan(99.5);
    expect(pctSum).toBeLessThan(100.5);
  });

  it("gera insights com dados reais em português (a partir do dia 7 inclui comparativos)", async () => {
    const clock = await createTestEnv();
    try {
      clock.setNow("2026-10-10T15:00:00.000Z"); // dia 10: já há dados suficientes para comparar
      const w = await createWorld(clock, { opening: 500_000 });
      const food = w.cat("expense.food").id;
      const transport = w.cat("expense.transport").id;
      const leisure = w.cat("expense.leisure").id;
      // mês anterior até o dia 10: despesas 80.000 (alimentação 60.000 + transporte 20.000)
      await w.expense({ amountCents: 60_000, occurredOn: "2026-09-02", categoryId: food });
      await w.expense({ amountCents: 20_000, occurredOn: "2026-09-08", categoryId: transport });
      await w.income({ amountCents: 700_000, occurredOn: "2026-10-01" });
      await w.expense({ amountCents: 40_000, occurredOn: "2026-10-03", categoryId: food });
      await w.expense({ amountCents: 20_000, occurredOn: "2026-10-09", categoryId: transport });
      await w.expense({ amountCents: 5_000, occurredOn: "2026-10-10", categoryId: leisure });
      await w.user.post("/v1/budgets", { categoryId: leisure, month: "2026-10", amountCents: 5_500 });

      const d = (await w.user.get("/v1/dashboard")).body;
      const messages = d.insights.map((i: any) => i.message) as string[];
      // mês até hoje: 65.000 × mês anterior até o dia 10: 80.000 → −18,75%
      expect(messages).toContain("Suas despesas caíram 19% em relação ao mês passado.");
      expect(messages).toContain("Você economizou R$ 6.350,00 este mês.");
      expect(messages.some((m) => m.startsWith("Você está próximo de ultrapassar seu orçamento de Lazer"))).toBe(true);
      expect(messages.some((m) => /menos com Alimentação este mês\.$/.test(m))).toBe(true);
      expect(d.budgetAlerts).toHaveLength(1);
      expect(d.budgetAlerts[0]).toMatchObject({ status: "WARNING", spentCents: 5_000 });
      // críticos/avisos aparecem antes dos positivos
      expect(["critical", "warning"]).toContain(d.insights[0].severity);
    } finally {
      await clock.close();
    }
  });

  it("nos primeiros dias do mês, o dashboard não mostra comparativos percentuais", async () => {
    const w = await scenario(); // hoje = dia 4
    const d = (await w.user.get("/v1/dashboard")).body;
    const messages = d.insights.map((i: any) => i.message) as string[];
    expect(messages.some((m) => /em relação ao mês passado/.test(m))).toBe(false);
    expect(messages).toContain("Você economizou R$ 6.650,00 este mês.");
    // o dashboard também omite os percentuais; os números seguem disponíveis na tela de relatórios
    expect(d.month.expenseChangePct).toBeNull();
    expect(d.month.incomeChangePct).toBeNull();
    expect(d.month.previousExpenseCents).toBe(60_000);
    const cmp = (await w.user.get("/v1/reports/month-comparison")).body;
    expect(cmp.expenseChangePct).toBe(-8.3);
  });

  it("mostra fatura a vencer, próximas contas e metas", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const card = (await w.user.post("/v1/cards", { name: "Nubank", limitCents: 500_000, closingDay: 28, dueDay: 6, payAccountId: w.account.id })).body;
    await w.user.post("/v1/transactions", {
      type: "EXPENSE", description: "Compra", amountCents: 45_000, occurredOn: "2026-09-20", cardId: card.id,
      categoryId: w.cat("expense.shopping").id,
    }); // fecha 28/set, vence 6/out
    await w.user.post("/v1/recurring", {
      type: "EXPENSE", description: "Internet", amountCents: 9_990, accountId: w.account.id,
      categoryId: w.cat("expense.bills").id, frequency: "MONTHLY", startDate: "2026-10-08",
    });
    await w.user.post("/v1/goals", { name: "Viagem", targetCents: 100_000, initialCents: 80_000 });

    const d = (await w.user.get("/v1/dashboard")).body;
    expect(d.upcoming.invoices).toEqual([
      expect.objectContaining({ cardName: "Nubank", dueDate: "2026-10-06", remainingCents: 45_000 }),
    ]);
    expect(d.upcoming.bills.map((b: any) => [b.date, b.description])).toEqual([["2026-10-08", "Internet"]]);
    expect(d.cards[0].usedCents).toBe(45_000);
    expect(d.goals[0]).toMatchObject({ name: "Viagem", progressPct: 80 });
    const messages = d.insights.map((i: any) => i.message) as string[];
    expect(messages).toContain("A fatura do Nubank vence em 2 dias (R$ 450,00).");
    expect(messages).toContain('Falta pouco para a meta "Viagem": 80% concluída.');
  });

  it("gera recorrências atrasadas antes de somar", async () => {
    const w = await createWorld(env, { opening: 0 });
    await w.user.post("/v1/recurring", {
      type: "INCOME", description: "Salário", amountCents: 500_000, accountId: w.account.id,
      categoryId: w.cat("income.salary").id, frequency: "MONTHLY", startDate: "2026-10-01",
    });
    const d = (await w.user.get("/v1/dashboard")).body;
    expect(d.month.incomeCents).toBe(500_000);
    expect(d.totalBalanceCents).toBe(500_000);
  });

  it("isolamento: nunca mistura dados de outro usuário", async () => {
    const a = await scenario();
    const b = await createWorld(env, { opening: 1_000 });
    const d = (await b.user.get("/v1/dashboard")).body;
    expect(d.totalBalanceCents).toBe(1_000);
    expect(d.month.incomeCents).toBe(0);
    expect(d.recentTransactions).toEqual([]);
    expect((await a.user.get("/v1/dashboard")).body.totalBalanceCents).toBe(1_775_000);
  });

  it("exige autenticação", async () => {
    expect((await env.anon.get("/v1/dashboard")).status).toBe(401);
  });
});

describe("relatórios", () => {
  it("despesas por categoria no período, com percentual e total", async () => {
    const w = await scenario();
    const res = (await w.user.get("/v1/reports/category-breakdown", { query: { range: "this_month" } })).body;
    expect(res.range).toEqual({ range: "this_month", from: "2026-10-01", to: "2026-10-31" });
    expect(res.totalCents).toBe(55_000);
    expect(res.items.map((i: any) => i.name)).toEqual(["Alimentação", "Mercado", "Transporte", "Lazer"]);
    expect(res.items.reduce((s: number, i: any) => s + i.totalCents, 0)).toBe(55_000);

    const sixMonths = (await w.user.get("/v1/reports/category-breakdown", { query: { range: "last_3_months" } })).body;
    expect(sixMonths.totalCents).toBe(145_000);

    const income = (await w.user.get("/v1/reports/category-breakdown", { query: { range: "this_month", type: "INCOME" } })).body;
    expect(income.items).toHaveLength(1);
    expect(income.items[0]).toMatchObject({ name: "Salário", totalCents: 720_000, pct: 100 });
  });

  it("receitas × despesas por mês (3 meses) e por semana (mês atual)", async () => {
    const w = await scenario();
    const months = (await w.user.get("/v1/reports/income-vs-expense", { query: { range: "last_3_months" } })).body;
    expect(months.granularity).toBe("month");
    expect(months.points.map((p: any) => [p.label, p.incomeCents, p.expenseCents, p.netCents])).toEqual([
      ["ago", 0, 0, 0],
      ["set", 700_000, 90_000, 610_000],
      ["out", 720_000, 55_000, 665_000],
    ]);

    const weeks = (await w.user.get("/v1/reports/income-vs-expense", { query: { range: "this_month" } })).body;
    expect(weeks.granularity).toBe("week");
    expect(weeks.points.map((p: any) => p.startDate)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(weeks.points[0]).toMatchObject({ label: "28/09", incomeCents: 720_000, expenseCents: 55_000 });
    expect(weeks.points[4]).toMatchObject({ incomeCents: 0, expenseCents: 0 });

    const forcedMonth = (await w.user.get("/v1/reports/income-vs-expense", { query: { range: "this_month", granularity: "month" } })).body;
    expect(forcedMonth.points).toHaveLength(1);
  });

  it("evolução do saldo consolidado, dia a dia, sem projetar o futuro", async () => {
    const w = await scenario();
    const res = (await w.user.get("/v1/reports/balance-evolution", { query: { range: "this_month" } })).body;
    expect(res.startingBalanceCents).toBe(1_110_000);
    expect(res.points).toEqual([
      { date: "2026-10-01", balanceCents: 1_830_000 },
      { date: "2026-10-02", balanceCents: 1_805_000 },
      { date: "2026-10-03", balanceCents: 1_780_000 },
      { date: "2026-10-04", balanceCents: 1_775_000 },
    ]);
    expect(res.endingBalanceCents).toBe(1_775_000);

    const longer = (await w.user.get("/v1/reports/balance-evolution", { query: { range: "last_3_months" } })).body;
    expect(longer.points.length).toBeLessThan(40); // semanal, não diário
    expect(longer.endingBalanceCents).toBe(1_775_000);
  });

  it("fluxo de caixa usa regime de caixa: compra no cartão só sai quando a fatura é paga", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const card = (await w.user.post("/v1/cards", { name: "Cartão", limitCents: 500_000, closingDay: 5, dueDay: 12, payAccountId: w.account.id })).body;
    await w.income({ amountCents: 50_000, occurredOn: "2026-10-02" });
    await w.expense({ amountCents: 10_000, occurredOn: "2026-10-03" });
    await w.user.post("/v1/transactions", {
      type: "EXPENSE", description: "Tênis", amountCents: 20_000, occurredOn: "2026-10-03", cardId: card.id, categoryId: w.cat("expense.shopping").id,
    });
    const [invoice] = (await w.user.get(`/v1/cards/${card.id}/invoices`)).body.data;
    await w.user.post(`/v1/cards/${card.id}/invoices/${invoice.id}/payments`, { accountId: w.account.id, amountCents: 8_000 });

    const cash = (await w.user.get("/v1/reports/cash-flow", { query: { range: "this_month" } })).body;
    expect(cash.points[0]).toMatchObject({ inflowCents: 50_000, outflowCents: 10_000 + 8_000, netCents: 32_000, cumulativeCents: 32_000 });

    // competência: a compra de 20.000 já é despesa; o pagamento da fatura não
    const accrual = (await w.user.get("/v1/reports/income-vs-expense", { query: { range: "this_month" } })).body;
    expect(accrual.points[0]).toMatchObject({ incomeCents: 50_000, expenseCents: 30_000 });
    // e o saldo da conta reflete apenas o que saiu de fato
    const evo = (await w.user.get("/v1/reports/balance-evolution", { query: { range: "this_month" } })).body;
    expect(evo.endingBalanceCents).toBe(100_000 + 50_000 - 10_000 - 8_000);
  });

  it("transferência para conta que não entra no total sai do saldo consolidado, mas não do fluxo de caixa", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const invest = await w.newAccount("Corretora", 0, { type: "INVESTMENT", includeInTotal: false });
    await w.user.post("/v1/transfers", { fromAccountId: w.account.id, toAccountId: invest.id, amountCents: 30_000, occurredOn: "2026-10-03" });
    const evo = (await w.user.get("/v1/reports/balance-evolution", { query: { range: "this_month" } })).body;
    expect(evo.endingBalanceCents).toBe(70_000);
    const cash = (await w.user.get("/v1/reports/cash-flow", { query: { range: "this_month" } })).body;
    expect(cash.points.every((p: any) => p.outflowCents === 0 && p.inflowCents === 0)).toBe(true);
    expect((await w.user.get("/v1/dashboard")).body.totalBalanceCents).toBe(70_000);
  });

  it("comparação entre meses usa o mesmo período do mês anterior e mostra variação por categoria", async () => {
    const w = await scenario();
    const cmp = (await w.user.get("/v1/reports/month-comparison")).body;
    expect(cmp.current).toMatchObject({ month: "2026-10-01", incomeCents: 720_000, expenseCents: 55_000 });
    expect(cmp.previous).toMatchObject({ month: "2026-09-01", incomeCents: 0, expenseCents: 60_000 });
    expect(cmp.expenseChangePct).toBe(-8.3);
    expect(cmp.incomeChangePct).toBeNull();
    const food = cmp.categories.find((c: any) => c.name === "Alimentação");
    expect(food).toMatchObject({ currentCents: 25_000, previousCents: 40_000, deltaCents: -15_000, changePct: -37.5 });

    // mês fechado: compara meses inteiros
    const sep = (await w.user.get("/v1/reports/month-comparison", { query: { month: "2026-09" } })).body;
    expect(sep.current).toMatchObject({ incomeCents: 700_000, expenseCents: 90_000 });
  });

  it("período personalizado e validações", async () => {
    const w = await scenario();
    const custom = await w.user.get("/v1/reports/category-breakdown", { query: { range: "custom", from: "2026-09-01", to: "2026-09-30" } });
    expect(custom.status).toBe(200);
    expect(custom.body.totalCents).toBe(90_000);
    expect((await w.user.get("/v1/reports/category-breakdown", { query: { range: "custom" } })).status).toBe(422);
    expect((await w.user.get("/v1/reports/category-breakdown", { query: { range: "custom", from: "2026-10-02", to: "2026-10-01" } })).status).toBe(422);
    expect((await w.user.get("/v1/reports/category-breakdown", { query: { range: "ontem" } })).status).toBe(422);
    expect((await env.anon.get("/v1/reports/cash-flow")).status).toBe(401);
  });

  it("plano gratuito: só 'este mês' e 'últimos 3 meses'; demais períodos pedem Premium (402)", async () => {
    const billing = await createTestEnv({ BILLING_ENFORCED: "true" });
    try {
      const u = await billing.newUser();
      await u.get("/v1/me");
      expect((await u.get("/v1/reports/category-breakdown", { query: { range: "this_month" } })).status).toBe(200);
      expect((await u.get("/v1/reports/cash-flow", { query: { range: "last_3_months" } })).status).toBe(200);
      for (const range of ["last_6_months", "this_year"]) {
        const res = await u.get("/v1/reports/income-vs-expense", { query: { range } });
        expect(res.status).toBe(402);
        expect(res.body.error.code).toBe("PLAN_LIMIT_REACHED");
      }
      expect((await u.get("/v1/reports/balance-evolution", { query: { range: "custom", from: "2026-01-01", to: "2026-02-01" } })).status).toBe(402);
    } finally {
      await billing.close();
    }
  });

  it("isolamento: relatórios só consideram os dados do próprio usuário", async () => {
    await scenario();
    const b = await createWorld(env, { opening: 0 });
    const breakdown = (await b.user.get("/v1/reports/category-breakdown", { query: { range: "last_3_months" } })).body;
    expect(breakdown.totalCents).toBe(0);
    const evo = (await b.user.get("/v1/reports/balance-evolution", { query: { range: "this_month" } })).body;
    expect(evo.endingBalanceCents).toBe(0);
  });
});
