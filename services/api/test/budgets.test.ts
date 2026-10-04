import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { createWorld } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv(); // "hoje" = 2026-10-04
});
afterAll(async () => {
  await env.close();
});

describe("orçamentos", () => {
  it("mostra gasto, restante, percentual e status (OK → WARNING → EXCEEDED)", async () => {
    const w = await createWorld(env);
    const food = w.cat("expense.food");
    const created = await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-10", amountCents: 100_000 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ month: "2026-10-01", amountCents: 100_000, alertPct: 80, spentCents: 0, status: "OK" });

    await w.expense({ amountCents: 72_000, categoryId: food.id });
    let b = (await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body;
    expect(b.budgets[0]).toMatchObject({ spentCents: 72_000, remainingCents: 28_000, usedPct: 72, status: "OK" });

    await w.expense({ amountCents: 10_000, categoryId: food.id });
    b = (await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body;
    expect(b.budgets[0]).toMatchObject({ spentCents: 82_000, usedPct: 82, status: "WARNING" });

    await w.expense({ amountCents: 18_000, categoryId: food.id });
    b = (await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body;
    expect(b.budgets[0]).toMatchObject({ spentCents: 100_000, usedPct: 100, status: "EXCEEDED" });
    expect(b.totalBudgetCents).toBe(100_000);
    expect(b.totalSpentCents).toBe(100_000);
  });

  it("só conta despesas efetivadas, não excluídas e do mês do orçamento", async () => {
    const w = await createWorld(env);
    const food = w.cat("expense.food");
    await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-10", amountCents: 50_000 });
    await w.expense({ amountCents: 10_000, categoryId: food.id });
    await w.expense({ amountCents: 9_999, categoryId: food.id, occurredOn: "2026-09-30" }); // outro mês
    await w.expense({ amountCents: 7_777, categoryId: food.id, occurredOn: "2026-10-20" }); // PENDING
    const del = await w.expense({ amountCents: 5_555, categoryId: food.id });
    await w.user.delete(`/v1/transactions/${del.id}`);
    await w.income({ amountCents: 40_000 }); // receita não conta
    const b = (await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body;
    expect(b.budgets[0].spentCents).toBe(10_000);
  });

  it("orçamento da categoria-pai inclui o gasto das subcategorias", async () => {
    const w = await createWorld(env);
    const food = w.cat("expense.food");
    const child = (await w.user.post("/v1/categories", { type: "EXPENSE", name: "Restaurantes", parentId: food.id })).body;
    await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-10", amountCents: 100_000 });
    await w.expense({ amountCents: 20_000, categoryId: food.id });
    await w.expense({ amountCents: 30_000, categoryId: child.id });
    const b = (await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body;
    expect(b.budgets[0].spentCents).toBe(50_000);
  });

  it("POST é upsert: segunda chamada atualiza (200) em vez de duplicar", async () => {
    const w = await createWorld(env);
    const cat = w.cat("expense.leisure");
    expect((await w.user.post("/v1/budgets", { categoryId: cat.id, month: "2026-10-15", amountCents: 10_000 })).status).toBe(201);
    const again = await w.user.post("/v1/budgets", { categoryId: cat.id, month: "2026-10", amountCents: 20_000, alertPct: 90 });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ amountCents: 20_000, alertPct: 90, month: "2026-10-01" });
    expect((await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body.budgets).toHaveLength(1);
  });

  it("padrão do GET é o mês atual; edita e exclui", async () => {
    const w = await createWorld(env);
    const b = (await w.user.post("/v1/budgets", { categoryId: w.cat("expense.bills").id, month: "2026-10", amountCents: 10_000 })).body;
    const current = (await w.user.get("/v1/budgets")).body;
    expect(current.month).toBe("2026-10-01");
    expect(current.budgets).toHaveLength(1);

    const upd = await w.user.put(`/v1/budgets/${b.id}`, { amountCents: 15_000, alertPct: 50 });
    expect(upd.body).toMatchObject({ amountCents: 15_000, alertPct: 50 });
    expect((await w.user.delete(`/v1/budgets/${b.id}`)).status).toBe(200);
    expect((await w.user.delete(`/v1/budgets/${b.id}`)).status).toBe(404);
  });

  it("só aceita categorias de despesa", async () => {
    const w = await createWorld(env);
    const res = await w.user.post("/v1/budgets", { categoryId: w.cat("income.salary").id, month: "2026-10", amountCents: 1000 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CATEGORY_TYPE_MISMATCH");
  });

  it("copia os orçamentos do mês anterior sem sobrescrever (a menos que pedido)", async () => {
    const w = await createWorld(env);
    const food = w.cat("expense.food");
    const leisure = w.cat("expense.leisure");
    await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-09", amountCents: 80_000 });
    await w.user.post("/v1/budgets", { categoryId: leisure.id, month: "2026-09", amountCents: 20_000 });
    await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-10", amountCents: 99_999 });

    const copy = await w.user.post("/v1/budgets/copy", { fromMonth: "2026-09", toMonth: "2026-10" });
    expect(copy.body).toEqual({ created: 1, skipped: 1 });
    let oct = (await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body.budgets;
    expect(oct.find((x: any) => x.category.id === food.id).amountCents).toBe(99_999);

    const over = await w.user.post("/v1/budgets/copy", { fromMonth: "2026-09", toMonth: "2026-10", overwrite: true });
    expect(over.body.created).toBe(2);
    oct = (await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body.budgets;
    expect(oct.find((x: any) => x.category.id === food.id).amountCents).toBe(80_000);
    expect((await w.user.post("/v1/budgets/copy", { fromMonth: "2026-10", toMonth: "2026-10-20" })).status).toBe(422);
  });

  it("alerta uma única vez ao passar do limite e ao estourar (notificação + push)", async () => {
    const pushes: any[] = [];
    const alerts = await createTestEnv();
    // substitui o notificador por um espião
    (alerts.app as any).notifier = { send: async (userId: string, msgs: any[]) => void pushes.push({ userId, msgs }) };
    try {
      const w = await createWorld(alerts);
      const food = w.cat("expense.food");
      await alerts.prisma.pushToken.create({ data: { userId: w.user.id, expoToken: "ExponentPushToken[abcdefghijkl]", platform: "ANDROID" } });
      await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-10", amountCents: 100_000 });

      await w.expense({ amountCents: 50_000, categoryId: food.id });
      expect((await w.user.get("/v1/notifications")).body.data).toHaveLength(0);

      await w.expense({ amountCents: 35_000, categoryId: food.id }); // 85% → aviso
      await w.expense({ amountCents: 1_000, categoryId: food.id }); // continua em aviso: não repete
      let list = (await w.user.get("/v1/notifications")).body.data;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ type: "BUDGET_NEAR_LIMIT", title: "Orçamento perto do limite" });
      // A mensagem reflete o momento em que cruzou o limite (85%); não é reenviada depois.
      expect(list[0].body).toContain("85%");
      expect(list[0].body).toContain("Alimentação");

      await w.expense({ amountCents: 20_000, categoryId: food.id }); // 106% → estourou
      await w.expense({ amountCents: 500, categoryId: food.id });
      list = (await w.user.get("/v1/notifications")).body.data;
      expect(list.map((n: any) => n.type).sort()).toEqual(["BUDGET_EXCEEDED", "BUDGET_NEAR_LIMIT"]);
      expect(pushes).toHaveLength(2);

      expect((await w.user.get("/v1/notifications/unread-count")).body.count).toBe(2);
      const one = list[0];
      expect((await w.user.patch(`/v1/notifications/${one.id}/read`)).body.readAt).toBeTruthy();
      expect((await w.user.get("/v1/notifications/unread-count")).body.count).toBe(1);
      await w.user.post("/v1/notifications/read-all");
      expect((await w.user.get("/v1/notifications/unread-count")).body.count).toBe(0);
      expect((await w.user.get("/v1/notifications", { query: { unreadOnly: "true" } })).body.data).toHaveLength(0);
    } finally {
      await alerts.close();
    }
  });

  it("respeita a preferência de notificações de orçamento desligada", async () => {
    const w = await createWorld(env);
    await w.user.patch("/v1/me", { notificationPrefs: { budgets: false } });
    const food = w.cat("expense.food");
    await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-10", amountCents: 10_000 });
    await w.expense({ amountCents: 20_000, categoryId: food.id });
    expect((await w.user.get("/v1/notifications")).body.data).toHaveLength(0);
  });

  it("isolamento: orçamentos e notificações de outro usuário são invisíveis", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    const budget = (await a.user.post("/v1/budgets", { categoryId: a.cat("expense.food").id, month: "2026-10", amountCents: 1000 })).body;
    expect((await b.user.put(`/v1/budgets/${budget.id}`, { amountCents: 1 })).status).toBe(404);
    expect((await b.user.delete(`/v1/budgets/${budget.id}`)).status).toBe(404);
    expect((await b.user.get("/v1/budgets", { query: { month: "2026-10" } })).body.budgets).toHaveLength(0);
    const cross = await b.user.post("/v1/budgets", { categoryId: a.cat("expense.food").id, month: "2026-10", amountCents: 1000 });
    expect(cross.status).toBe(422);
  });
});
