import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { createWorld, type World } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv(); // "hoje" = 2026-10-04
});
afterAll(async () => {
  await env.close();
});

const txsOf = async (w: World, query: Record<string, string> = {}) =>
  (await w.user.get("/v1/transactions", { query: { sort: "date_asc", limit: "100", ...query } })).body.data as any[];

describe("recorrência de transferência", () => {
  const reserve = (w: World, to: any, over: Record<string, unknown> = {}) =>
    w.user.post("/v1/recurring", {
      type: "TRANSFER",
      description: "Reserva mensal",
      amountCents: 20_000,
      accountId: w.account.id,
      toAccountId: to.id,
      frequency: "MONTHLY",
      startDate: "2026-08-05",
      ...over,
    });

  it("gera uma transferência de verdade por data (saída e entrada) e os saldos acompanham", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const to = await w.newAccount("Reserva", 0);
    const res = await reserve(w, to);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: "TRANSFER",
      amountCents: 20_000,
      account: { id: w.account.id },
      toAccount: { id: to.id, name: "Reserva" },
      card: null,
      category: null,
      paymentMethod: "OTHER",
      nextRunOn: "2026-10-05",
      lastRunOn: "2026-09-05",
    });
    // hoje é 4/out: venceram 5/ago e 5/set
    expect(await w.balanceOf(w.account.id)).toBe(100_000 - 2 * 20_000);
    expect(await w.balanceOf(to.id)).toBe(2 * 20_000);

    const legs = await txsOf(w, { type: "TRANSFER" });
    expect(legs).toHaveLength(4);
    expect(legs.map((t) => [t.occurredOn, t.transferSide, t.amountCents]).sort()).toEqual([
      ["2026-08-05", "IN", 20_000],
      ["2026-08-05", "OUT", 20_000],
      ["2026-09-05", "IN", 20_000],
      ["2026-09-05", "OUT", 20_000],
    ]);
    // cada data tem a sua transferência, ligando as duas pernas
    expect(new Set(legs.map((t) => t.transferId)).size).toBe(2);
    // só a perna de saída leva a marca da recorrência (a chave única regra + data não admite duas)
    expect(legs.filter((t) => t.recurrenceId === res.body.id).map((t) => t.transferSide)).toEqual(["OUT", "OUT"]);
    // a transferência existe na rota própria, com as contas certas
    const transferId = legs[0].transferId as string;
    const transfer = (await w.user.get(`/v1/transfers/${transferId}`)).body;
    expect(transfer).toMatchObject({ amountCents: 20_000, from: { id: w.account.id }, to: { id: to.id } });
  });

  it("não entra em receitas nem despesas", async () => {
    const w = await createWorld(env);
    const to = await w.newAccount("Reserva");
    await reserve(w, to);
    expect(await txsOf(w, { type: "EXPENSE" })).toHaveLength(0);
    expect(await txsOf(w, { type: "INCOME" })).toHaveLength(0);
  });

  it("é idempotente: listar de novo, projetar e rodar o job não duplicam", async () => {
    const w = await createWorld(env);
    const to = await w.newAccount("Reserva");
    const rule = (await reserve(w, to)).body;
    await w.user.get("/v1/recurring");
    await w.user.get("/v1/recurring/upcoming");
    await w.user.get("/v1/recurring");
    expect(await txsOf(w, { type: "TRANSFER" })).toHaveLength(4);
    expect((await w.user.get(`/v1/recurring/${rule.id}`)).body.lastRunOn).toBe("2026-09-05");
  });

  it("não recria a transferência que a pessoa excluiu", async () => {
    const w = await createWorld(env);
    const to = await w.newAccount("Reserva");
    await reserve(w, to);
    const first = (await txsOf(w, { type: "TRANSFER" })).find((t) => t.occurredOn === "2026-08-05")!;
    expect((await w.user.delete(`/v1/transfers/${first.transferId}`)).status).toBe(200);
    await w.user.get("/v1/recurring");
    const left = await txsOf(w, { type: "TRANSFER" });
    expect(left.map((t) => t.occurredOn)).toEqual(["2026-09-05", "2026-09-05"]);
    expect(await w.balanceOf(to.id)).toBe(20_000);
  });

  it("com o passar do tempo gera as próximas", async () => {
    const clock = await createTestEnv();
    try {
      const w = await createWorld(clock);
      const to = await w.newAccount("Reserva");
      await reserve(w, to, { startDate: "2026-10-05" });
      expect(await txsOf(w, { type: "TRANSFER" })).toHaveLength(0);
      clock.setNow("2026-12-06T15:00:00.000Z");
      await w.user.get("/v1/recurring");
      expect((await txsOf(w, { type: "TRANSFER" })).filter((t) => t.transferSide === "OUT").map((t) => t.occurredOn)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    } finally {
      await clock.close();
    }
  });

  it("aparece nas próximas ocorrências como transferência", async () => {
    const w = await createWorld(env);
    const to = await w.newAccount("Reserva");
    await reserve(w, to, { startDate: "2026-10-10" });
    const upcoming = (await w.user.get("/v1/recurring/upcoming", { query: { days: "40" } })).body.data as any[];
    expect(upcoming.map((u) => [u.date, u.type, u.description])).toEqual([
      ["2026-10-10", "TRANSFER", "Reserva mensal"],
      ["2026-11-10", "TRANSFER", "Reserva mensal"],
    ]);
  });

  it("recusa origem igual ao destino, cartão, categoria, forma de pagamento e conta que não é sua", async () => {
    const w = await createWorld(env);
    const to = await w.newAccount("Reserva");
    expect((await reserve(w, w.account)).status).toBe(422);
    expect((await reserve(w, to, { cardId: "2f8fad5b-d9cb-469f-a165-70867728950e" })).status).toBe(422);
    expect((await reserve(w, to, { categoryId: w.cat("expense.housing").id })).status).toBe(422);
    expect((await reserve(w, to, { paymentMethod: "PIX" })).status).toBe(422);
    expect((await reserve(w, to, { toAccountId: undefined })).status).toBe(422);
    const other = await createWorld(env);
    const alheia = await reserve(w, other.account);
    expect(alheia.status).toBe(422);
    expect(alheia.body.error.code).toBe("ACCOUNT_NOT_FOUND");
    // a conta de destino só vale em transferência
    const bad = await w.user.post("/v1/recurring", { type: "EXPENSE", description: "x", amountCents: 100, accountId: w.account.id, toAccountId: to.id, frequency: "MONTHLY", startDate: "2026-10-10" });
    expect(bad.status).toBe(422);
  });

  it("editar: valor e fim valem para as próximas; categoria e forma de pagamento não existem em transferência", async () => {
    const w = await createWorld(env);
    const to = await w.newAccount("Reserva");
    const rule = (await reserve(w, to, { startDate: "2026-10-10" })).body;
    const edited = await w.user.put(`/v1/recurring/${rule.id}`, { amountCents: 30_000, endDate: "2026-12-10" });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ amountCents: 30_000, endDate: "2026-12-10" });
    const cat = await w.user.put(`/v1/recurring/${rule.id}`, { categoryId: w.cat("expense.housing").id });
    expect(cat.status).toBe(422);
    expect(cat.body.error.code).toBe("TRANSFER_NO_CATEGORY");
    expect((await w.user.put(`/v1/recurring/${rule.id}`, { paymentMethod: "PIX" })).status).toBe(422);
  });

  it("conta de origem ou destino arquivada pausa a geração e, ao desarquivar, recupera o atraso", async () => {
    const w = await createWorld(env);
    const to = await w.newAccount("Reserva");
    // arquivar o destino ANTES de a regra vencer
    const rule = (await reserve(w, to, { startDate: "2026-10-10" })).body;
    expect((await w.user.put(`/v1/accounts/${to.id}`, { archived: true })).status).toBe(200);
    expect(rule.lastRunOn).toBeNull();
    // simula atraso: a regra vence com o destino arquivado
    await env.prisma.recurringRule.update({ where: { id: rule.id }, data: { startDate: new Date("2026-09-10"), nextRunOn: new Date("2026-09-10") } });
    await w.user.get("/v1/recurring");
    expect(await txsOf(w, { type: "TRANSFER" })).toHaveLength(0);
    expect((await w.user.put(`/v1/accounts/${to.id}`, { archived: false })).status).toBe(200);
    await w.user.get("/v1/recurring");
    expect((await txsOf(w, { type: "TRANSFER" })).filter((t) => t.transferSide === "OUT").map((t) => t.occurredOn)).toEqual(["2026-09-10"]);
  });

  it("isolamento: ninguém vê nem mexe na transferência recorrente do outro", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    const to = await a.newAccount("Reserva");
    const rule = (await reserve(a, to)).body;
    expect((await b.user.get(`/v1/recurring/${rule.id}`)).status).toBe(404);
    expect((await b.user.put(`/v1/recurring/${rule.id}`, { amountCents: 1 })).status).toBe(404);
    expect((await b.user.get("/v1/recurring")).body.data).toHaveLength(0);
  });

  it("no banco, só é aceita com origem e destino diferentes, sem cartão nem categoria (a regra vale mesmo fora da API)", async () => {
    const w = await createWorld(env);
    const to = await w.newAccount("Reserva");
    const base = {
      userId: w.user.id,
      description: "x",
      amountCents: 100n,
      frequency: "MONTHLY" as const,
      startDate: new Date("2026-10-10"),
      nextRunOn: new Date("2026-10-10"),
    };
    const create = (data: Record<string, unknown>) => env.prisma.recurringRule.create({ data: { ...base, ...data } as never });
    await expect(create({ type: "TRANSFER", accountId: w.account.id, toAccountId: w.account.id })).rejects.toThrow();
    await expect(create({ type: "TRANSFER", accountId: w.account.id })).rejects.toThrow(); // sem destino
    await expect(create({ type: "EXPENSE", accountId: w.account.id, toAccountId: to.id })).rejects.toThrow(); // destino em despesa
    await expect(create({ type: "TRANSFER", accountId: w.account.id, toAccountId: to.id, categoryId: w.cat("expense.housing").id })).rejects.toThrow();
    await expect(create({ type: "TRANSFER", accountId: w.account.id, toAccountId: to.id })).resolves.toBeTruthy();
  });
});

describe("recorrência: fim e intervalo", () => {
  const rent = (w: World, over: Record<string, unknown> = {}) =>
    w.user.post("/v1/recurring", {
      type: "EXPENSE",
      description: "Curso",
      amountCents: 15_000,
      accountId: w.account.id,
      categoryId: w.cat("expense.housing").id,
      frequency: "MONTHLY",
      startDate: "2026-08-05",
      ...over,
    });

  it("termina depois de N vezes: o servidor calcula a data do fim e a regra acaba sozinha", async () => {
    const w = await createWorld(env);
    const res = await rent(w, { startDate: "2026-07-10", occurrences: 3 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ endDate: "2026-09-10", active: false, lastRunOn: "2026-09-10" });
    expect((await txsOf(w)).map((t) => t.occurredOn)).toEqual(["2026-07-10", "2026-08-10", "2026-09-10"]);
  });

  it("termina depois de N vezes, com parte ainda no futuro: gera até hoje e segue ativa até a última", async () => {
    const w = await createWorld(env);
    const res = await rent(w, { startDate: "2026-08-05", occurrences: 4 });
    expect(res.body).toMatchObject({ endDate: "2026-11-05", active: true, nextRunOn: "2026-10-05" });
    expect((await txsOf(w)).map((t) => t.occurredOn)).toEqual(["2026-08-05", "2026-09-05"]);
    expect((await w.user.get("/v1/recurring/upcoming", { query: { days: "90" } })).body.data.map((u: any) => u.date)).toEqual(["2026-10-05", "2026-11-05"]);
  });

  it("a cada 2 meses e semanal a cada 2 semanas", async () => {
    const w = await createWorld(env);
    const bi = (await rent(w, { startDate: "2026-06-05", intervalCount: 2, description: "Bimestral" })).body;
    // 5/jun e 5/ago já venceram; a próxima (5/out) ainda não
    expect(bi).toMatchObject({ intervalCount: 2, lastRunOn: "2026-08-05", nextRunOn: "2026-10-05" });
    const weekly = (await rent(w, { startDate: "2026-09-07", frequency: "WEEKLY", intervalCount: 2, description: "Quinzenal" })).body;
    const dates = (await txsOf(w)).filter((t) => t.description === "Quinzenal").map((t) => t.occurredOn);
    expect(dates).toEqual(["2026-09-07", "2026-09-21"]); // a de 5/out ainda não venceu
    expect(weekly).toMatchObject({ intervalCount: 2, nextRunOn: "2026-10-05" });
  });

  it("fim por data e por número de vezes juntos é recusado; 1 vez e valores absurdos também", async () => {
    const w = await createWorld(env);
    expect((await rent(w, { occurrences: 3, endDate: "2027-01-01" })).status).toBe(422);
    expect((await rent(w, { occurrences: 1 })).status).toBe(422);
    expect((await rent(w, { occurrences: 9999 })).status).toBe(422);
    expect((await rent(w, { intervalCount: 0 })).status).toBe(422);
  });

  it("pode tirar ou mudar o fim depois (editar), e reativar uma regra que acabou sem novo fim é possível", async () => {
    const w = await createWorld(env);
    const rule = (await rent(w, { startDate: "2026-09-05", occurrences: 2 })).body; // 5/set e 5/out (futura)
    expect(rule.endDate).toBe("2026-10-05");
    const noEnd = await w.user.put(`/v1/recurring/${rule.id}`, { endDate: null });
    expect(noEnd.body.endDate).toBeNull();
    expect(noEnd.body.active).toBe(true);
  });
});

describe("parcelar na conta e em receitas", () => {
  const post = (w: World, over: Record<string, unknown> = {}) =>
    w.user.post("/v1/transactions", {
      type: "EXPENSE",
      description: "Notebook",
      amountCents: 90_000,
      occurredOn: "2026-10-03",
      accountId: w.account.id,
      installments: 3,
      ...over,
    });

  it("despesa na conta: o total é dividido, uma parcela por mês; a que já passou fica lançada e as futuras, agendadas", async () => {
    const w = await createWorld(env);
    const res = await post(w);
    expect(res.status).toBe(201);
    const txs = await txsOf(w);
    expect(txs.map((t) => [t.occurredOn, t.amountCents, t.status, t.installment.number, t.installment.total])).toEqual([
      ["2026-10-03", 30_000, "POSTED", 1, 3],
      ["2026-11-03", 30_000, "PENDING", 2, 3],
      ["2026-12-03", 30_000, "PENDING", 3, 3],
    ]);
    expect(new Set(txs.map((t) => t.installment.groupId)).size).toBe(1);
    expect(txs.every((t) => t.account.id === w.account.id && t.card === null)).toBe(true);
  });

  it("o resto da divisão vai para as primeiras parcelas e a soma fecha o total", async () => {
    const w = await createWorld(env);
    await post(w, { amountCents: 10_000, installments: 3 });
    const txs = await txsOf(w);
    expect(txs.map((t) => t.amountCents)).toEqual([3_334, 3_333, 3_333]);
    expect(txs.reduce((s, t) => s + t.amountCents, 0)).toBe(10_000);
  });

  it("receita parcelada na conta (ex.: venda recebida em 3 vezes)", async () => {
    const w = await createWorld(env);
    const res = await post(w, { type: "INCOME", description: "Venda", categoryId: w.cat("income.salary").id });
    expect(res.status).toBe(201);
    const txs = await txsOf(w, { type: "INCOME" });
    expect(txs.map((t) => [t.occurredOn, t.amountCents, t.status])).toEqual([
      ["2026-10-03", 30_000, "POSTED"],
      ["2026-11-03", 30_000, "PENDING"],
      ["2026-12-03", 30_000, "PENDING"],
    ]);
  });

  it("a tudo-ou-nada: excluir o grupo remove todas as parcelas; editar o grupo muda descrição e categoria de todas", async () => {
    const w = await createWorld(env);
    await post(w);
    const [first] = await txsOf(w);
    const edited = await w.user.put(`/v1/transactions/${first.id}`, { expectedVersion: first.version, scope: "group", description: "Notebook novo" });
    expect(edited.status).toBe(200);
    expect((await txsOf(w)).map((t) => t.description)).toEqual(["Notebook novo", "Notebook novo", "Notebook novo"]);
    const del = await w.user.delete(`/v1/transactions/${first.id}`, { query: { scope: "group" } });
    expect(del.status).toBe(200);
    expect(await txsOf(w)).toHaveLength(0);
  });

  it("no cartão continua só para despesa; parcela na conta com 1 vez ou além de 120 é recusada", async () => {
    const w = await createWorld(env);
    const card = (await w.user.post("/v1/cards", { name: "Cartão", limitCents: 500_000, closingDay: 5, dueDay: 12 })).body;
    const incomeOnCard = await w.user.post("/v1/transactions", { type: "INCOME", description: "x", amountCents: 9_000, occurredOn: "2026-10-03", cardId: card.id, installments: 3 });
    expect(incomeOnCard.status).toBe(422);
    expect((await post(w, { installments: 1 })).status).toBe(422);
    expect((await post(w, { installments: 121 })).status).toBe(422);
    const cardExpense = await w.user.post("/v1/transactions", { type: "EXPENSE", description: "TV", amountCents: 9_000, occurredOn: "2026-10-03", cardId: card.id, installments: 3 });
    expect(cardExpense.status).toBe(201);
  });
});
