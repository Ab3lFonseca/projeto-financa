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

async function newCard(w: World, over: Record<string, unknown> = {}) {
  const r = await w.user.post("/v1/cards", {
    name: "Nubank",
    brand: "MASTERCARD",
    last4: "1234",
    limitCents: 500_000,
    closingDay: 5,
    dueDay: 12,
    payAccountId: w.account.id,
    ...over,
  });
  if (r.status !== 201) throw new Error(`falha ao criar cartão: ${JSON.stringify(r.body)}`);
  return r.body;
}

const buy = (w: World, cardId: string, over: Record<string, unknown> = {}) =>
  w.user.post("/v1/transactions", {
    type: "EXPENSE",
    description: "Compra",
    amountCents: 10_000,
    occurredOn: "2026-10-03",
    cardId,
    categoryId: w.cat("expense.shopping").id,
    ...over,
  });

describe("cadastro de cartão", () => {
  it("cria o cartão com limite, fechamento e vencimento; limite disponível = limite", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    expect(card).toMatchObject({
      name: "Nubank", brand: "MASTERCARD", last4: "1234", limitCents: 500_000, usedCents: 0,
      availableCents: 500_000, closingDay: 5, dueDay: 12, currentInvoice: null, archived: false,
    });
    expect(card.payAccount.name).toBe("Conta corrente");
  });

  it("valida dias (1–31), últimos 4 dígitos, nome único e conta de pagamento", async () => {
    const w = await createWorld(env);
    const base = { name: "X", limitCents: 1000, closingDay: 5, dueDay: 12 };
    expect((await w.user.post("/v1/cards", { ...base, closingDay: 32 })).status).toBe(422);
    expect((await w.user.post("/v1/cards", { ...base, dueDay: 0 })).status).toBe(422);
    expect((await w.user.post("/v1/cards", { ...base, last4: "12" })).status).toBe(422);
    expect((await w.user.post("/v1/cards", { ...base, limitCents: -1 })).status).toBe(422);
    await newCard(w, { name: "Meu cartão" });
    const dup = await w.user.post("/v1/cards", { ...base, name: "MEU CARTÃO" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CARD_EXISTS");
    const other = await createWorld(env);
    const foreign = await w.user.post("/v1/cards", { ...base, name: "Y", payAccountId: other.account.id });
    expect(foreign.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("edita, arquiva e só exclui cartão sem compras", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    const upd = await w.user.put(`/v1/cards/${card.id}`, { limitCents: 800_000, name: "Roxinho" });
    expect(upd.body).toMatchObject({ limitCents: 800_000, name: "Roxinho", availableCents: 800_000 });

    await buy(w, card.id);
    const blocked = await w.user.delete(`/v1/cards/${card.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CARD_HAS_TRANSACTIONS");
    const archived = await w.user.put(`/v1/cards/${card.id}`, { archived: true });
    expect(archived.body.archived).toBe(true);
    expect((await w.user.get("/v1/cards")).body.data).toHaveLength(0);
    expect((await buy(w, card.id)).body.error.code).toBe("CARD_ARCHIVED");

    const empty = await newCard(w, { name: "Vazio" });
    expect((await w.user.delete(`/v1/cards/${empty.id}`)).status).toBe(200);
  });
});

describe("compras e faturas", () => {
  it("compra antes do fechamento entra na fatura do mês; depois, na seguinte", async () => {
    const w = await createWorld(env);
    const card = await newCard(w); // fecha dia 5, vence dia 12
    const a = (await buy(w, card.id, { occurredOn: "2026-10-03", amountCents: 12_000 })).body;
    const b = (await buy(w, card.id, { occurredOn: "2026-10-06", amountCents: 3_000 })).body;
    expect(a.paymentMethod).toBe("CREDIT");
    expect(a.account).toBeNull();
    expect(a.card.id).toBe(card.id);

    const invoices = (await w.user.get(`/v1/cards/${card.id}/invoices`)).body.data;
    expect(invoices.map((i: any) => [i.referenceMonth, i.closingDate, i.dueDate, i.totalCents])).toEqual([
      ["2026-11-01", "2026-11-05", "2026-11-12", 3_000],
      ["2026-10-01", "2026-10-05", "2026-10-12", 12_000],
    ]);
    expect(a.invoiceId).toBe(invoices[1].id);
    expect(b.invoiceId).toBe(invoices[0].id);
  });

  it("compra no cartão não mexe no saldo da conta; limite e fatura atual refletem", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const card = await newCard(w);
    await buy(w, card.id, { amountCents: 25_000 });
    expect(await w.balanceOf(w.account.id)).toBe(100_000);
    const got = (await w.user.get(`/v1/cards/${card.id}`)).body;
    expect(got.usedCents).toBe(25_000);
    expect(got.availableCents).toBe(475_000);
    expect(got.currentInvoice).toMatchObject({ referenceMonth: "2026-10-01", totalCents: 25_000, status: "OPEN", remainingCents: 25_000 });
  });

  it("fatura vira CLOSED depois do fechamento", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    await buy(w, card.id, { occurredOn: "2026-09-02", amountCents: 8_000 }); // fatura de setembro (fechou 5/set... vence 12/set)
    const hist = (await w.user.get(`/v1/cards/${card.id}/invoices`, { query: { period: "history" } })).body.data;
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ status: "CLOSED", totalCents: 8_000 });
  });

  it("parcela a compra: divide sem perder centavo e distribui nas faturas", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    const first = (await buy(w, card.id, { description: "Notebook", amountCents: 10_000, installments: 3 })).body;
    expect(first.installment).toMatchObject({ number: 1, total: 3 });
    expect(first.amountCents).toBe(3_334);

    const all = (await w.user.get("/v1/transactions", { query: { cardId: card.id, sort: "date_asc" } })).body.data;
    expect(all.map((t: any) => [t.occurredOn, t.amountCents, t.installment.number])).toEqual([
      ["2026-10-03", 3_334, 1],
      ["2026-11-03", 3_333, 2],
      ["2026-12-03", 3_333, 3],
    ]);
    expect(new Set(all.map((t: any) => t.installment.groupId)).size).toBe(1);
    expect(all.reduce((s: number, t: any) => s + t.amountCents, 0)).toBe(10_000);

    // limite comprometido inclui as parcelas futuras
    expect((await w.user.get(`/v1/cards/${card.id}`)).body.usedCents).toBe(10_000);

    const upcoming = (await w.user.get(`/v1/cards/${card.id}/invoices`, { query: { period: "upcoming" } })).body.data;
    expect(upcoming.map((i: any) => [i.referenceMonth, i.totalCents])).toEqual([
      ["2026-10-01", 3_334],
      ["2026-11-01", 3_333],
      ["2026-12-01", 3_333],
    ]);

    const plans = (await w.user.get(`/v1/cards/${card.id}/installments`)).body.data;
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      description: "Notebook", total: 3, currentNumber: 1, remainingCount: 2,
      installmentCents: 3_333, remainingCents: 6_666, nextDueDate: "2026-11-12",
    });
  });

  it("exclui as parcelas em grupo e a fatura volta a zero", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    const first = (await buy(w, card.id, { amountCents: 9_000, installments: 3 })).body;
    expect((await w.user.delete(`/v1/transactions/${first.id}`, { query: { scope: "group" } })).status).toBe(200);
    expect((await w.user.get("/v1/transactions", { query: { cardId: card.id } })).body.data).toHaveLength(0);
    expect((await w.user.get(`/v1/cards/${card.id}`)).body.usedCents).toBe(0);
    expect((await w.user.get(`/v1/cards/${card.id}/installments`)).body.data).toHaveLength(0);
  });

  it("edita descrição/categoria do grupo todo, mas valor e data só por parcela", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    const first = (await buy(w, card.id, { amountCents: 9_000, installments: 3, description: "Sofá" })).body;
    const upd = await w.user.put(`/v1/transactions/${first.id}`, { description: "Sofá da sala", scope: "group", categoryId: w.cat("expense.housing").id });
    expect(upd.status).toBe(200);
    const all = (await w.user.get("/v1/transactions", { query: { cardId: card.id } })).body.data;
    expect(all.every((t: any) => t.description === "Sofá da sala" && t.category.name === "Moradia")).toBe(true);

    const bad = await w.user.put(`/v1/transactions/${first.id}`, { amountCents: 1, scope: "group" });
    expect(bad.body.error.code).toBe("GROUP_SCOPE_FIELDS");
    const one = await w.user.put(`/v1/transactions/${first.id}`, { amountCents: 3_500 });
    expect(one.body.amountCents).toBe(3_500);
    const locked = await w.user.put(`/v1/transactions/${first.id}`, { accountId: w.account.id });
    expect(locked.body.error.code).toBe("INSTALLMENT_SOURCE_LOCKED");
  });

  it("mudar a data da compra move para a fatura certa", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    const t = (await buy(w, card.id, { occurredOn: "2026-10-03" })).body;
    const moved = await w.user.put(`/v1/transactions/${t.id}`, { occurredOn: "2026-10-20" });
    const invoices = (await w.user.get(`/v1/cards/${card.id}/invoices`)).body.data;
    const target = invoices.find((i: any) => i.id === moved.body.invoiceId);
    expect(target.referenceMonth).toBe("2026-11-01");
    expect(invoices.find((i: any) => i.referenceMonth === "2026-10-01").totalCents).toBe(0);
  });

  it("regras: cartão exige Crédito; parcelar na conta é permitido (sem fatura); conta ou cartão (um só)", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    expect((await buy(w, card.id, { paymentMethod: "PIX" })).status).toBe(422);
    // na conta o parcelamento vale (uma parcela por mês, sem fatura); ver recurring-transfers.test.ts
    const onAccount = await w.user.post("/v1/transactions", {
      type: "EXPENSE", description: "x", amountCents: 1000, occurredOn: "2026-10-01", accountId: w.account.id, installments: 3,
    });
    expect(onAccount.status).toBe(201);
    expect((await w.user.get("/v1/transactions", { query: { limit: "50" } })).body.data.every((t: any) => t.invoiceId === null)).toBe(true);
    expect((await buy(w, card.id, { accountId: w.account.id })).status).toBe(422);
  });

  it("detalhe da fatura traz compras e pagamentos", async () => {
    const w = await createWorld(env);
    const card = await newCard(w);
    await buy(w, card.id, { description: "Compra A", amountCents: 4_000 });
    await buy(w, card.id, { description: "Compra B", amountCents: 6_000, occurredOn: "2026-10-04" });
    const [inv] = (await w.user.get(`/v1/cards/${card.id}/invoices`)).body.data;
    const detail = (await w.user.get(`/v1/cards/${card.id}/invoices/${inv.id}`)).body;
    expect(detail.card.name).toBe("Nubank");
    expect(detail.totalCents).toBe(10_000);
    expect(detail.transactions.map((t: any) => t.description)).toEqual(["Compra B", "Compra A"]);
    expect(detail.payments).toEqual([]);
  });
});

describe("pagamento de fatura", () => {
  async function setupInvoice() {
    const w = await createWorld(env, { opening: 100_000 });
    const card = await newCard(w);
    await buy(w, card.id, { amountCents: 40_000 });
    const [invoice] = (await w.user.get(`/v1/cards/${card.id}/invoices`)).body.data;
    return { w, card, invoice, pay: (body: any) => w.user.post(`/v1/cards/${card.id}/invoices/${invoice.id}/payments`, body) };
  }

  it("pagamento parcial e total: debita a conta, não vira despesa e atualiza status e limite", async () => {
    const { w, card, invoice, pay } = await setupInvoice();
    const p1 = await pay({ accountId: w.account.id, amountCents: 15_000 });
    expect(p1.status).toBe(201);
    expect(p1.body).toMatchObject({ amountCents: 15_000, paidOn: "2026-10-04" });
    expect(await w.balanceOf(w.account.id)).toBe(85_000);

    let detail = (await w.user.get(`/v1/cards/${card.id}/invoices/${invoice.id}`)).body;
    expect(detail).toMatchObject({ paidCents: 15_000, remainingCents: 25_000, status: "OPEN" });
    expect((await w.user.get(`/v1/cards/${card.id}`)).body.usedCents).toBe(25_000);

    const p2 = await pay({ accountId: w.account.id }); // restante
    expect(p2.body.amountCents).toBe(25_000);
    detail = (await w.user.get(`/v1/cards/${card.id}/invoices/${invoice.id}`)).body;
    expect(detail).toMatchObject({ status: "PAID", remainingCents: 0 });
    expect(await w.balanceOf(w.account.id)).toBe(60_000);
    expect((await w.user.get(`/v1/cards/${card.id}`)).body.usedCents).toBe(0);
    expect((await w.user.get(`/v1/cards/${card.id}`)).body.availableCents).toBe(500_000);

    // pagar a fatura NÃO é despesa: o total de despesas do período continua só a compra
    const sum = (await w.user.get("/v1/transactions/summary", { query: { from: "2026-10-01", to: "2026-10-31" } })).body;
    expect(sum.expenseCents).toBe(40_000);

    const again = await pay({ accountId: w.account.id });
    expect(again.body.error.code).toBe("ALREADY_PAID");
  });

  it("não deixa pagar mais que o restante e valida a conta", async () => {
    const { w, pay } = await setupInvoice();
    const over = await pay({ accountId: w.account.id, amountCents: 40_001 });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe("OVERPAYMENT");
    expect(over.body.error.details.remainingCents).toBe(40_000);
    const other = await createWorld(env);
    expect((await pay({ accountId: other.account.id })).body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("desfazer o pagamento devolve o saldo e reabre a fatura", async () => {
    const { w, card, invoice, pay } = await setupInvoice();
    const p = (await pay({ accountId: w.account.id })).body;
    expect((await w.user.get(`/v1/cards/${card.id}/invoices/${invoice.id}`)).body.status).toBe("PAID");
    expect((await w.user.delete(`/v1/cards/${card.id}/invoices/${invoice.id}/payments/${p.id}`)).status).toBe(200);
    expect(await w.balanceOf(w.account.id)).toBe(100_000);
    expect((await w.user.get(`/v1/cards/${card.id}/invoices/${invoice.id}`)).body.status).toBe("OPEN");
  });

  it("isolamento: outro usuário não vê nem paga a fatura alheia", async () => {
    const { w, card, invoice } = await setupInvoice();
    const other = await createWorld(env);
    expect((await other.user.get(`/v1/cards/${card.id}`)).status).toBe(404);
    expect((await other.user.get(`/v1/cards/${card.id}/invoices/${invoice.id}`)).status).toBe(404);
    const pay = await other.user.post(`/v1/cards/${card.id}/invoices/${invoice.id}/payments`, { accountId: other.account.id });
    expect(pay.status).toBe(404);
    expect((await w.user.get(`/v1/cards/${card.id}/invoices/${invoice.id}`)).body.paidCents).toBe(0);
  });
});
