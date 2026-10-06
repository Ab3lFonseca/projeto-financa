import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { createWorld } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

describe("categorias", () => {
  it("o usuário nasce com as 12 categorias de despesa e 5 de receita", async () => {
    const w = await createWorld(env);
    const all = (await w.user.get("/v1/categories")).body.data;
    expect(all.filter((c: any) => c.type === "EXPENSE")).toHaveLength(12);
    expect(all.filter((c: any) => c.type === "INCOME")).toHaveLength(5);
    const onlyIncome = (await w.user.get("/v1/categories", { query: { type: "INCOME" } })).body.data;
    expect(onlyIncome.map((c: any) => c.name)).toEqual(["Salário", "Freelance", "Investimentos", "Vendas", "Outros"]);
  });

  it("cria, edita e arquiva categorias com ícone e cor", async () => {
    const w = await createWorld(env);
    const created = await w.user.post("/v1/categories", { type: "EXPENSE", name: "  Pets ", icon: "paw-print", color: "#AA00FF" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Pets", icon: "paw-print", color: "#AA00FF", systemKey: null, archived: false });

    const edited = await w.user.put(`/v1/categories/${created.body.id}`, { name: "Animais", color: "#112233" });
    expect(edited.body).toMatchObject({ name: "Animais", color: "#112233" });

    await w.user.put(`/v1/categories/${created.body.id}`, { archived: true });
    const visible = (await w.user.get("/v1/categories")).body.data.map((c: any) => c.id);
    expect(visible).not.toContain(created.body.id);
    const withArchived = (await w.user.get("/v1/categories", { query: { includeArchived: "true" } })).body.data.map((c: any) => c.id);
    expect(withArchived).toContain(created.body.id);
  });

  it("não permite nome repetido (sem diferenciar maiúsculas) no mesmo tipo", async () => {
    const w = await createWorld(env);
    const dup = await w.user.post("/v1/categories", { type: "EXPENSE", name: "ALIMENTAÇÃO" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CATEGORY_EXISTS");
    // mesmo nome em outro tipo é permitido (ex.: "Outros")
    expect((await w.user.post("/v1/categories", { type: "INCOME", name: "Alimentação" })).status).toBe(201);
  });

  it("valida cor, ícone e subcategorias", async () => {
    const w = await createWorld(env);
    expect((await w.user.post("/v1/categories", { type: "EXPENSE", name: "X", color: "vermelho" })).status).toBe(422);
    expect((await w.user.post("/v1/categories", { type: "EXPENSE", name: "X", icon: "<script>" })).status).toBe(422);

    const food = w.cat("expense.food");
    const child = await w.user.post("/v1/categories", { type: "EXPENSE", name: "Restaurantes", parentId: food.id });
    expect(child.status).toBe(201);
    expect(child.body.parentId).toBe(food.id);
    const grandchild = await w.user.post("/v1/categories", { type: "EXPENSE", name: "Japonês", parentId: child.body.id });
    expect(grandchild.body.error.code).toBe("CATEGORY_DEPTH");
    const wrongType = await w.user.post("/v1/categories", { type: "INCOME", name: "Y", parentId: food.id });
    expect(wrongType.body.error.code).toBe("CATEGORY_TYPE_MISMATCH");
  });

  it("excluir: mantém o histórico, apaga orçamentos e pode mover lançamentos", async () => {
    const w = await createWorld(env);
    const pets = (await w.user.post("/v1/categories", { type: "EXPENSE", name: "Pets" })).body;
    const tx = await w.expense({ categoryId: pets.id, description: "Ração" });
    await w.user.post("/v1/budgets", { categoryId: pets.id, month: "2026-10", amountCents: 20_000 });

    const del = await w.user.delete(`/v1/categories/${pets.id}`, { query: { reassignTo: w.cat("expense.other").id } });
    expect(del.status).toBe(200);
    const moved = (await w.user.get(`/v1/transactions/${tx.id}`)).body;
    expect(moved.category.id).toBe(w.cat("expense.other").id);
    expect((await w.user.get("/v1/budgets", { query: { month: "2026-10" } })).body.budgets).toHaveLength(0);
    expect((await w.user.get("/v1/categories")).body.data.map((c: any) => c.id)).not.toContain(pets.id);
  });

  it("excluir sem mover: o lançamento antigo continua mostrando a categoria (marcada como excluída)", async () => {
    const w = await createWorld(env);
    const temp = (await w.user.post("/v1/categories", { type: "EXPENSE", name: "Temporária" })).body;
    const tx = await w.expense({ categoryId: temp.id });
    await w.user.delete(`/v1/categories/${temp.id}`);
    const got = (await w.user.get(`/v1/transactions/${tx.id}`)).body;
    expect(got.category).toMatchObject({ id: temp.id, name: "Temporária", deleted: true });
  });

  it("recusa mover para categoria de outro tipo", async () => {
    const w = await createWorld(env);
    const temp = (await w.user.post("/v1/categories", { type: "EXPENSE", name: "Temp" })).body;
    const res = await w.user.delete(`/v1/categories/${temp.id}`, { query: { reassignTo: w.cat("income.salary").id } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CATEGORY_TYPE_MISMATCH");
  });

  it("isolamento: outro usuário não vê, edita nem exclui categorias alheias", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    const mine = a.cat("expense.food");
    expect((await b.user.put(`/v1/categories/${mine.id}`, { name: "Invadida" })).status).toBe(404);
    expect((await b.user.delete(`/v1/categories/${mine.id}`)).status).toBe(404);
    const bList = (await b.user.get("/v1/categories")).body.data.map((c: any) => c.id);
    expect(bList).not.toContain(mine.id);
    // usar a categoria do outro numa transação também falha, sem revelar que ela existe
    const res = await b.user.post("/v1/transactions", {
      type: "EXPENSE", description: "x", amountCents: 100, occurredOn: "2026-10-01", accountId: b.account.id, categoryId: mine.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });
});

describe("contas", () => {
  it("cria conta com saldo inicial e calcula o saldo a partir dos lançamentos", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    expect(w.account).toMatchObject({ name: "Conta corrente", type: "CHECKING", balanceCents: 100_000, openingBalanceCents: 100_000 });

    await w.income({ amountCents: 20_000 });
    await w.expense({ amountCents: 4_590 });
    expect(await w.balanceOf(w.account.id)).toBe(100_000 + 20_000 - 4_590);
  });

  it("saldo ignora lançamentos futuros e pendentes", async () => {
    const w = await createWorld(env, { opening: 50_000 });
    await w.expense({ amountCents: 10_000, occurredOn: "2026-10-20" }); // futuro → PENDING
    await w.expense({ amountCents: 3_000, occurredOn: "2026-10-04", status: "PENDING" });
    expect(await w.balanceOf(w.account.id)).toBe(50_000);
  });

  it("aceita saldo inicial negativo (cheque especial)", async () => {
    const w = await createWorld(env);
    const acc = await w.newAccount("Especial", -25_000);
    expect(acc.balanceCents).toBe(-25_000);
  });

  it("lista só contas ativas por padrão e permite arquivar/desarquivar", async () => {
    const w = await createWorld(env);
    const extra = await w.newAccount("Poupança", 0, { type: "SAVINGS", color: "#00AA00", icon: "piggy-bank" });
    await w.user.put(`/v1/accounts/${extra.id}`, { archived: true });
    const active = (await w.user.get("/v1/accounts")).body.data.map((a: any) => a.name);
    expect(active).toEqual(["Conta corrente"]);
    const all = (await w.user.get("/v1/accounts", { query: { includeArchived: "true" } })).body.data;
    expect(all.find((a: any) => a.id === extra.id).archived).toBe(true);
    const back = await w.user.put(`/v1/accounts/${extra.id}`, { archived: false });
    expect(back.body.archived).toBe(false);
  });

  it("não aceita lançar em conta arquivada", async () => {
    const w = await createWorld(env);
    const extra = await w.newAccount("Antiga");
    await w.user.put(`/v1/accounts/${extra.id}`, { archived: true });
    const res = await w.user.post("/v1/transactions", {
      type: "EXPENSE", description: "x", amountCents: 100, occurredOn: "2026-10-01", accountId: extra.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ACCOUNT_ARCHIVED");
  });

  it("nome único por usuário (sem diferenciar maiúsculas)", async () => {
    const w = await createWorld(env);
    const res = await w.user.post("/v1/accounts", { name: "CONTA CORRENTE", type: "CHECKING" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACCOUNT_EXISTS");
    // outro usuário pode ter o mesmo nome
    const other = await createWorld(env);
    expect(other.account.name).toBe("Conta corrente");
  });

  it("vincula banco do catálogo e rejeita banco inexistente", async () => {
    const w = await createWorld(env);
    await env.prisma.bank.upsert({
      where: { compeCode: "260" },
      update: {},
      create: { compeCode: "260", name: "Nu Pagamentos (Nubank)", shortName: "Nubank" },
    });
    const banks = (await w.user.get("/v1/banks")).body.data;
    const nubank = banks.find((b: any) => b.compeCode === "260");
    expect(nubank).toBeTruthy();
    const acc = await w.newAccount("Nu", 0, { type: "DIGITAL", bankId: nubank.id });
    expect(acc.bank.shortName).toBe("Nubank");
    const bad = await w.user.post("/v1/accounts", { name: "Z", type: "CHECKING", bankId: "11111111-1111-4111-8111-111111111111" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("BANK_NOT_FOUND");
  });

  it("detalhe traz as últimas movimentações", async () => {
    const w = await createWorld(env);
    await w.expense({ description: "A", occurredOn: "2026-10-01" });
    await w.expense({ description: "B", occurredOn: "2026-10-03" });
    const detail = (await w.user.get(`/v1/accounts/${w.account.id}`)).body;
    expect(detail.recentTransactions.map((t: any) => t.description)).toEqual(["B", "A"]);
  });

  it("excluir: bloqueado com movimentações; permitido em conta vazia", async () => {
    const w = await createWorld(env);
    await w.expense();
    const blocked = await w.user.delete(`/v1/accounts/${w.account.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("ACCOUNT_HAS_TRANSACTIONS");

    const empty = await w.newAccount("Vazia");
    expect((await w.user.delete(`/v1/accounts/${empty.id}`)).status).toBe(200);
    expect((await w.user.get(`/v1/accounts/${empty.id}`)).status).toBe(404);
  });

  it("isolamento: conta de outro usuário é invisível (404) e não pode ser alterada", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    expect((await b.user.get(`/v1/accounts/${a.account.id}`)).status).toBe(404);
    expect((await b.user.put(`/v1/accounts/${a.account.id}`, { name: "Minha agora" })).status).toBe(404);
    expect((await b.user.delete(`/v1/accounts/${a.account.id}`)).status).toBe(404);
    const stillMine = (await a.user.get(`/v1/accounts/${a.account.id}`)).body;
    expect(stillMine.name).toBe("Conta corrente");
  });

  it("rejeita campos de controle no corpo (userId, balanceCents)", async () => {
    const w = await createWorld(env);
    const res = await w.user.post("/v1/accounts", { name: "Hack", type: "CHECKING", userId: "x", balanceCents: 999999 });
    expect(res.status).toBe(422);
  });
});

describe("cobrança ligada: teste grátis, assinatura e somente leitura", () => {
  it("dentro do teste grátis tudo está liberado (sem limite de contas); vencido o teste, criar responde 402 e ler continua", async () => {
    const billing = await createTestEnv({ BILLING_ENFORCED: "true" });
    try {
      const u = await billing.newUser();
      const me = (await u.get("/v1/me")).body;
      expect(me.entitlements.plan).toBe("PREMIUM");
      expect(me.entitlements.access).toMatchObject({ state: "trial", allowed: true, features: { investments: true } });
      expect(me.entitlements.access.daysLeft).toBeGreaterThan(25);

      for (const name of ["A", "B", "C"]) expect((await u.post("/v1/accounts", { name, type: "CHECKING" })).status).toBe(201);

      // O teste acaba, sem assinatura: somente leitura.
      await billing.expireTrial(u.id);
      const after = (await u.get("/v1/me")).body;
      expect(after.entitlements.access).toMatchObject({ state: "expired", allowed: false, expiresAt: null, features: { investments: false } });
      expect(after.entitlements.plan).toBe("FREE");

      const blocked = await u.post("/v1/accounts", { name: "D", type: "CHECKING" });
      expect(blocked.status).toBe(402);
      expect(blocked.body.error.code).toBe("SUBSCRIPTION_REQUIRED");
      expect((await u.put(`/v1/accounts/${(await u.get("/v1/accounts")).body.data[0].id}`, { name: "Nova" })).body.error.code).toBe("SUBSCRIPTION_REQUIRED");
      // Ler e exportar continuam: a pessoa não perde os dados.
      expect((await u.get("/v1/accounts")).body.data).toHaveLength(3);
      expect((await u.get("/v1/dashboard")).status).toBe(200);
      expect((await u.get("/v1/privacy/export")).status).toBe(200);
    } finally {
      await billing.close();
    }
  });

  it("assinatura paga em dia libera de novo; cortesia e administrador nunca ficam em somente leitura", async () => {
    const billing = await createTestEnv({ BILLING_ENFORCED: "true" });
    try {
      const paid = await billing.newUser();
      await paid.get("/v1/me");
      await billing.expireTrial(paid.id);
      expect((await paid.post("/v1/accounts", { name: "X", type: "CHECKING" })).status).toBe(402);

      await billing.makePaid(paid.id);
      expect((await paid.get("/v1/me")).body.entitlements.access).toMatchObject({ state: "paid", allowed: true, features: { investments: false } });
      expect((await paid.post("/v1/accounts", { name: "X", type: "CHECKING" })).status).toBe(201);

      const gift = await billing.newUser();
      await gift.get("/v1/me");
      await billing.expireTrial(gift.id);
      await billing.makePaid(gift.id, { store: "MANUAL", currentPeriodEnd: null, investmentsAddon: true });
      expect((await gift.get("/v1/me")).body.entitlements.access).toMatchObject({ state: "complimentary", allowed: true, expiresAt: null, features: { investments: true } });
      expect((await gift.post("/v1/accounts", { name: "Y", type: "CHECKING" })).status).toBe(201);

      const admin = await billing.newUser();
      await admin.get("/v1/me");
      await billing.expireTrial(admin.id);
      await billing.prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
      billing.app.users.invalidate(admin.id);
      expect((await admin.get("/v1/me")).body.entitlements.access).toMatchObject({ state: "admin", allowed: true });
      expect((await admin.post("/v1/accounts", { name: "Z", type: "CHECKING" })).status).toBe(201);
    } finally {
      await billing.close();
    }
  });

  it("marcar notificações como lidas continua liberado no somente leitura (não é editar dados)", async () => {
    const billing = await createTestEnv({ BILLING_ENFORCED: "true" });
    try {
      const u = await billing.newUser();
      await u.get("/v1/me");
      await billing.expireTrial(u.id);
      expect((await u.post("/v1/notifications/read-all", {})).status).not.toBe(402);
    } finally {
      await billing.close();
    }
  });
});
