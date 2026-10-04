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

describe("criar lançamentos", () => {
  it("cria despesa com todos os campos e devolve o DTO completo", async () => {
    const w = await createWorld(env);
    const res = await w.user.post("/v1/transactions", {
      type: "EXPENSE",
      description: "  Almoço   no\tcentro ",
      amountCents: 4590,
      occurredOn: "2026-10-03",
      accountId: w.account.id,
      categoryId: w.cat("expense.food").id,
      paymentMethod: "PIX",
      notes: "com a equipe",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: "EXPENSE",
      status: "POSTED",
      description: "Almoço no centro",
      amountCents: 4590,
      occurredOn: "2026-10-03",
      paymentMethod: "PIX",
      notes: "com a equipe",
      version: 1,
      installment: null,
      transferId: null,
    });
    expect(res.body.account).toEqual({ id: w.account.id, name: "Conta corrente", deleted: false });
    expect(res.body.category).toMatchObject({ name: "Alimentação", type: "EXPENSE" });
  });

  it("lançamento com data futura em conta fica PENDING e não mexe no saldo", async () => {
    const w = await createWorld(env, { opening: 10_000 });
    const t = await w.expense({ amountCents: 2_000, occurredOn: "2026-10-15" });
    expect(t.status).toBe("PENDING");
    expect(await w.balanceOf(w.account.id)).toBe(10_000);
    // marcar como pago efetiva
    const paid = await w.user.put(`/v1/transactions/${t.id}`, { status: "POSTED", occurredOn: "2026-10-04" });
    expect(paid.body.status).toBe("POSTED");
    expect(await w.balanceOf(w.account.id)).toBe(8_000);
  });

  it("é idempotente pelo id gerado no aparelho (fila offline)", async () => {
    const w = await createWorld(env);
    const id = "5b1c3a52-0a8e-4f0a-9a52-6a5d2f8e1b11";
    const body = {
      id, type: "EXPENSE", description: "Offline", amountCents: 1500, occurredOn: "2026-10-03",
      accountId: w.account.id, categoryId: w.cat("expense.transport").id,
    };
    const first = await w.user.post("/v1/transactions", body);
    const again = await w.user.post("/v1/transactions", body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(id);
    const list = (await w.user.get("/v1/transactions")).body.data;
    expect(list.filter((t: any) => t.id === id)).toHaveLength(1);
  });

  it("Idempotency-Key repetida devolve 409 ALREADY_PROCESSED sem duplicar", async () => {
    const w = await createWorld(env);
    const headers = { "idempotency-key": "chave-offline-0001" };
    const body = { type: "EXPENSE", description: "Uma vez", amountCents: 700, occurredOn: "2026-10-03", accountId: w.account.id };
    expect((await w.user.post("/v1/transactions", body, { headers })).status).toBe(201);
    const replay = await w.user.post("/v1/transactions", body, { headers });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe("ALREADY_PROCESSED");
    expect((await w.user.get("/v1/transactions", { query: { q: "Uma vez" } })).body.data).toHaveLength(1);
    expect((await w.user.post("/v1/transactions", body, { headers: { "idempotency-key": "curta" } })).status).toBe(400);
  });

  it("valida referências e regras (sem vazar a existência de recursos alheios)", async () => {
    const w = await createWorld(env);
    const other = await createWorld(env);
    const base = { type: "EXPENSE", description: "x", amountCents: 100, occurredOn: "2026-10-01" };

    const foreignAccount = await w.user.post("/v1/transactions", { ...base, accountId: other.account.id });
    expect(foreignAccount.status).toBe(422);
    expect(foreignAccount.body.error.code).toBe("ACCOUNT_NOT_FOUND");

    const wrongCategoryType = await w.user.post("/v1/transactions", {
      ...base, accountId: w.account.id, categoryId: w.cat("income.salary").id,
    });
    expect(wrongCategoryType.body.error.code).toBe("CATEGORY_TYPE_MISMATCH");

    expect((await w.user.post("/v1/transactions", { ...base, accountId: w.account.id, amountCents: 0 })).status).toBe(422);
    expect((await w.user.post("/v1/transactions", { ...base, accountId: w.account.id, userId: other.user.id })).status).toBe(422);
    expect((await w.user.post("/v1/transactions", { ...base, type: "TRANSFER", accountId: w.account.id })).status).toBe(422);
  });
});

describe("editar e excluir", () => {
  it("edição parcial incrementa a versão e detecta edição concorrente", async () => {
    const w = await createWorld(env);
    const t = await w.expense({ description: "Original", amountCents: 1000 });
    const ok = await w.user.put(`/v1/transactions/${t.id}`, { description: "Editado", amountCents: 2500, expectedVersion: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ description: "Editado", amountCents: 2500, version: 2 });

    const stale = await w.user.put(`/v1/transactions/${t.id}`, { description: "Outro aparelho", expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.details.currentVersion).toBe(2);
    expect((await w.user.get(`/v1/transactions/${t.id}`)).body.description).toBe("Editado");
  });

  it("não permite zerar campos obrigatórios nem corpo vazio", async () => {
    const w = await createWorld(env);
    const t = await w.expense();
    expect((await w.user.put(`/v1/transactions/${t.id}`, {})).status).toBe(422);
    expect((await w.user.put(`/v1/transactions/${t.id}`, { amountCents: -5 })).status).toBe(422);
    expect((await w.user.put(`/v1/transactions/${t.id}`, { accountId: null })).body.error.code).toBe("SOURCE_REQUIRED");
  });

  it("muda de conta e de categoria", async () => {
    const w = await createWorld(env, { opening: 0 });
    const other = await w.newAccount("Outra", 0);
    const t = await w.expense({ amountCents: 1000 });
    const moved = await w.user.put(`/v1/transactions/${t.id}`, { accountId: other.id, categoryId: w.cat("expense.leisure").id });
    expect(moved.body.account.id).toBe(other.id);
    expect(moved.body.category.name).toBe("Lazer");
    expect(await w.balanceOf(w.account.id)).toBe(0);
    expect(await w.balanceOf(other.id)).toBe(-1000);
  });

  it("exclui (soft delete): some das consultas e devolve o saldo", async () => {
    const w = await createWorld(env, { opening: 10_000 });
    const t = await w.expense({ amountCents: 4_000 });
    expect(await w.balanceOf(w.account.id)).toBe(6_000);
    expect((await w.user.delete(`/v1/transactions/${t.id}`)).status).toBe(200);
    expect((await w.user.get(`/v1/transactions/${t.id}`)).status).toBe(404);
    expect((await w.user.get("/v1/transactions")).body.data).toHaveLength(0);
    expect(await w.balanceOf(w.account.id)).toBe(10_000);
    // continua no banco (histórico/auditoria), marcado como excluído
    const row = await env.prisma.transaction.findUnique({ where: { id: t.id } });
    expect(row?.deletedAt).not.toBeNull();
    expect((await w.user.delete(`/v1/transactions/${t.id}`)).status).toBe(404);
  });
});

describe("consulta: filtros, ordenação e paginação", () => {
  async function seed() {
    const w = await createWorld(env, { opening: 0 });
    const other = await w.newAccount("Carteira", 0, { type: "WALLET" });
    await w.income({ description: "Salário outubro", amountCents: 500_000, occurredOn: "2026-10-01" });
    await w.expense({ description: "Mercado do bairro", amountCents: 25_000, occurredOn: "2026-10-02", categoryId: w.cat("expense.groceries").id });
    await w.expense({ description: "Uber", amountCents: 3_200, occurredOn: "2026-10-03", categoryId: w.cat("expense.transport").id, accountId: other.id });
    await w.expense({ description: "Pizza", amountCents: 7_800, occurredOn: "2026-09-28", paymentMethod: "DEBIT" });
    await w.expense({ description: "Sem categoria", amountCents: 900, occurredOn: "2026-10-03", categoryId: null });
    return { w, other };
  }

  it("filtra por período, tipo, categoria, conta, forma de pagamento, texto e valor", async () => {
    const { w, other } = await seed();
    const get = async (query: Record<string, string>) =>
      ((await w.user.get("/v1/transactions", { query })).body.data as any[]).map((t) => t.description).sort();

    expect(await get({ from: "2026-10-01", to: "2026-10-02" })).toEqual(["Mercado do bairro", "Salário outubro"]);
    expect(await get({ type: "INCOME" })).toEqual(["Salário outubro"]);
    expect(await get({ categoryId: w.cat("expense.groceries").id })).toEqual(["Mercado do bairro"]);
    expect(await get({ accountId: other.id })).toEqual(["Uber"]);
    expect(await get({ paymentMethod: "DEBIT" })).toEqual(["Pizza"]);
    expect(await get({ q: "MERCADO" })).toEqual(["Mercado do bairro"]);
    expect(await get({ minAmountCents: "10000" })).toEqual(["Mercado do bairro", "Salário outubro"]);
    expect(await get({ maxAmountCents: "1000" })).toEqual(["Sem categoria"]);
    expect(await get({ uncategorized: "true" })).toEqual(["Sem categoria"]);
    expect(
      await get({ categoryId: `${w.cat("expense.groceries").id},${w.cat("expense.transport").id}`, type: "EXPENSE" }),
    ).toEqual(["Mercado do bairro", "Uber"]);
  });

  it("ordena por data e valor", async () => {
    const { w } = await seed();
    const order = async (sort: string) =>
      ((await w.user.get("/v1/transactions", { query: { sort } })).body.data as any[]).map((t) => t.description);
    expect((await order("date_desc"))[4]).toBe("Pizza");
    expect((await order("date_asc"))[0]).toBe("Pizza");
    expect((await order("amount_desc"))[0]).toBe("Salário outubro");
    expect((await order("amount_asc"))[0]).toBe("Sem categoria");
  });

  it("pagina por cursor sem repetir nem perder itens (inclusive com datas iguais)", async () => {
    const w = await createWorld(env, { opening: 0 });
    for (let i = 0; i < 25; i++) {
      await w.expense({ description: `Item ${String(i).padStart(2, "0")}`, amountCents: 100 + (i % 7), occurredOn: `2026-10-0${1 + (i % 4)}` });
    }
    for (const sort of ["date_desc", "date_asc", "amount_desc", "amount_asc"]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: any = await w.user.get("/v1/transactions", { query: { limit: "10", sort, ...(cursor ? { cursor } : {}) } });
        expect(res.status).toBe(200);
        seen.push(...res.body.data.map((t: any) => t.id));
        cursor = res.body.page.nextCursor;
        pages++;
        expect(res.body.page.hasMore).toBe(cursor !== null);
      } while (cursor && pages < 10);
      expect(pages).toBe(3);
      expect(seen).toHaveLength(25);
      expect(new Set(seen).size).toBe(25);
    }
  });

  it("rejeita cursor adulterado e limite fora da faixa", async () => {
    const w = await createWorld(env);
    expect((await w.user.get("/v1/transactions", { query: { cursor: "lixo" } })).status).toBe(400);
    const forged = Buffer.from(JSON.stringify({ d: "2026-10-01", id: "nao-e-uuid" })).toString("base64url");
    expect((await w.user.get("/v1/transactions", { query: { cursor: forged } })).status).toBe(400);
    expect((await w.user.get("/v1/transactions", { query: { limit: "1000" } })).status).toBe(422);
  });

  it("resumo do período soma receitas e despesas (transferências ficam de fora)", async () => {
    const { w, other } = await seed();
    await w.user.post("/v1/transfers", {
      fromAccountId: w.account.id, toAccountId: other.id, amountCents: 50_000, occurredOn: "2026-10-03",
    });
    const sum = (await w.user.get("/v1/transactions/summary", { query: { from: "2026-10-01", to: "2026-10-31" } })).body;
    expect(sum).toMatchObject({ incomeCents: 500_000, expenseCents: 25_000 + 3_200 + 900 });
    expect(sum.netCents).toBe(500_000 - 29_100);
    expect(sum.count).toBe(6); // 1 receita + 3 despesas + 2 pernas da transferência
  });
});

describe("transferências", () => {
  it("movem saldo entre contas sem virar receita/despesa", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const savings = await w.newAccount("Poupança", 0, { type: "SAVINGS" });
    const res = await w.user.post("/v1/transfers", {
      fromAccountId: w.account.id, toAccountId: savings.id, amountCents: 30_000, occurredOn: "2026-10-04", notes: "reserva",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amountCents: 30_000, notes: "reserva" });
    expect(res.body.from.name).toBe("Conta corrente");
    expect(await w.balanceOf(w.account.id)).toBe(70_000);
    expect(await w.balanceOf(savings.id)).toBe(30_000);

    const legs = (await w.user.get("/v1/transactions", { query: { type: "TRANSFER" } })).body.data;
    expect(legs).toHaveLength(2);
    const out = legs.find((l: any) => l.transferSide === "OUT");
    expect(out.counterpartAccount.name).toBe("Poupança");
    expect(out.category).toBeNull();
    const sum = (await w.user.get("/v1/transactions/summary")).body;
    expect(sum.incomeCents).toBe(0);
    expect(sum.expenseCents).toBe(0);
  });

  it("editar e excluir a transferência atualiza as duas pernas", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const savings = await w.newAccount("Poupança", 0);
    const t = (await w.user.post("/v1/transfers", {
      fromAccountId: w.account.id, toAccountId: savings.id, amountCents: 10_000, occurredOn: "2026-10-04",
    })).body;

    const upd = await w.user.put(`/v1/transfers/${t.id}`, { amountCents: 25_000 });
    expect(upd.body.amountCents).toBe(25_000);
    expect(await w.balanceOf(w.account.id)).toBe(75_000);
    expect(await w.balanceOf(savings.id)).toBe(25_000);

    expect((await w.user.delete(`/v1/transfers/${t.id}`)).status).toBe(200);
    expect(await w.balanceOf(w.account.id)).toBe(100_000);
    expect(await w.balanceOf(savings.id)).toBe(0);
    expect((await w.user.get(`/v1/transfers/${t.id}`)).status).toBe(404);
  });

  it("rejeita mesma conta, conta alheia, e edição de perna por /transactions", async () => {
    const w = await createWorld(env);
    const other = await createWorld(env);
    const savings = await w.newAccount("Poupança");
    expect(
      (await w.user.post("/v1/transfers", { fromAccountId: w.account.id, toAccountId: w.account.id, amountCents: 100, occurredOn: "2026-10-04" })).status,
    ).toBe(422);
    const foreign = await w.user.post("/v1/transfers", {
      fromAccountId: w.account.id, toAccountId: other.account.id, amountCents: 100, occurredOn: "2026-10-04",
    });
    expect(foreign.body.error.code).toBe("ACCOUNT_NOT_FOUND");

    const t = (await w.user.post("/v1/transfers", {
      fromAccountId: w.account.id, toAccountId: savings.id, amountCents: 100, occurredOn: "2026-10-04",
    })).body;
    const leg = (await w.user.get("/v1/transactions", { query: { type: "TRANSFER" } })).body.data[0];
    expect((await w.user.put(`/v1/transactions/${leg.id}`, { description: "x" })).body.error.code).toBe("USE_TRANSFERS_ENDPOINT");
    expect((await w.user.delete(`/v1/transactions/${leg.id}`)).body.error.code).toBe("USE_TRANSFERS_ENDPOINT");
    expect((await other.user.delete(`/v1/transfers/${t.id}`)).status).toBe(404);
  });
});

describe("isolamento entre usuários (IDOR)", () => {
  it("outro usuário não lê, edita, exclui nem enxerga lançamentos alheios", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    const t = await a.expense({ description: "Segredo do A" });

    expect((await b.user.get(`/v1/transactions/${t.id}`)).status).toBe(404);
    expect((await b.user.put(`/v1/transactions/${t.id}`, { description: "Invadido" })).status).toBe(404);
    expect((await b.user.delete(`/v1/transactions/${t.id}`)).status).toBe(404);
    expect((await b.user.get("/v1/transactions", { query: { q: "Segredo" } })).body.data).toHaveLength(0);
    expect((await b.user.get("/v1/transactions/summary")).body.count).toBe(0);
    expect((await a.user.get(`/v1/transactions/${t.id}`)).body.description).toBe("Segredo do A");
  });

  it("não é possível criar lançamento reaproveitando o id de outro usuário", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    const t = await a.expense();
    const res = await b.user.post("/v1/transactions", {
      id: t.id, type: "EXPENSE", description: "x", amountCents: 100, occurredOn: "2026-10-01", accountId: b.account.id,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await a.user.get(`/v1/transactions/${t.id}`)).body.description).toBe("Despesa");
  });
});
