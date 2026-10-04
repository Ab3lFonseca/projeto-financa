import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOpenFinanceJob } from "../src/modules/open-finance/service";
import { createTestEnv, DEFAULT_NOW, type TestEnv } from "./helpers/env";
import { createWorld, type World } from "./helpers/factories";
import { FakeOpenFinanceProvider } from "./helpers/fake-open-finance";

const provider = new FakeOpenFinanceProvider();
let env: TestEnv;

beforeAll(async () => {
  env = await createTestEnv({ OPEN_FINANCE_ENABLED: "true" }, { openFinanceProvider: provider });
});
afterAll(async () => {
  await env.close();
});

const CONSENT = { type: "OPEN_FINANCE", version: "2026-10-01", granted: true };
const CARD = { brand: "MASTERCARD", limitCents: 800_000, availableCents: 512_055, closeDate: "2026-10-10", dueDate: "2026-10-17", minimumPaymentCents: 28_794 };

async function world(): Promise<World> {
  const w = await createWorld(env);
  expect((await w.user.post("/v1/privacy/consents", CONSENT)).status).toBe(200);
  return w;
}

/** Banco com conta corrente (saldo R$ 2.500) e cartão (limite R$ 8.000), como o Pluggy entrega. */
function bankWithCard(w: World, extra: { investments?: Array<Record<string, unknown>> } = {}) {
  return provider.addItem(w.user.id, {
    institution: "Banco Teste",
    accounts: [
      {
        kind: "BANK",
        name: "Conta Corrente",
        balanceCents: 250_000,
        txs: [
          { description: "MERCADO CENTRAL", amountCents: 8_990, postedOn: "2026-10-02" },
          { description: "PIX RECEBIDO JOAO", direction: "CREDIT", amountCents: 500_000, postedOn: "2026-10-01" },
        ],
      },
      {
        kind: "CREDIT",
        name: "Cartão Gold",
        balanceCents: 287_945,
        credit: CARD,
        txs: [
          { description: "LOJA XYZ", amountCents: 20_000, postedOn: "2026-10-02" },
          { description: "PAGAMENTO FATURA", direction: "CREDIT", amountCents: 150_000, postedOn: "2026-10-03" },
        ],
      },
    ],
    investments: extra.investments,
  });
}

const connect = (w: World, itemId: string, body: Record<string, unknown> = {}) => w.user.post("/v1/open-finance/connections", { itemId, ...body });
const listAccounts = async (w: World) => (await w.user.get("/v1/accounts")).body.data as any[];
const listTxs = async (w: World) => (await w.user.get("/v1/transactions", { query: { limit: 100 } })).body.data as any[];

describe("modo automático: conta, cartão e transações entram sozinhos", () => {
  it("cria a conta e o cartão do app, importa as transações e ancora o saldo no saldo do banco", async () => {
    const w = await world();
    const { itemId } = bankWithCard(w);
    const res = await connect(w, itemId);
    expect(res.status).toBe(201);
    expect(res.body.autoImport).toBe(true);

    const [bank, card] = res.body.accounts;
    expect(bank.account).toMatchObject({ name: "Banco Teste · Conta Corrente" });
    expect(card.card).toMatchObject({ name: "Banco Teste · Cartão Gold" });
    expect(bank.balanceCents).toBe(250_000);
    expect(card.credit).toMatchObject({ brand: "MASTERCARD", limitCents: 800_000, availableCents: 512_055, usedCents: 287_945, billCents: 287_945, minimumPaymentCents: 28_794, closeDate: "2026-10-10", dueDate: "2026-10-17" });
    expect(bank.dataUpdatedAt).toBeTruthy();

    // o saldo calculado pelo app fecha com o saldo do banco (saldo inicial ancorado)
    const created = (await listAccounts(w)).find((a) => a.id === bank.account.id);
    expect(created.balanceCents).toBe(250_000);

    // cartão e conta de origem marcados como vindos do Open Finance
    const cardRow = await env.prisma.creditCard.findUnique({ where: { id: card.card.id } });
    expect(cardRow).toMatchObject({ source: "OPEN_FINANCE", closingDay: 10, dueDay: 17, brand: "MASTERCARD", payAccountId: bank.account.id });
    expect(Number(cardRow!.limitCents)).toBe(800_000);
    expect((await env.prisma.account.findUnique({ where: { id: bank.account.id } }))?.source).toBe("OPEN_FINANCE");

    const txs = await listTxs(w);
    const expense = txs.find((t) => t.description === "Mercado central");
    const income = txs.find((t) => t.description === "Pix recebido joao");
    const purchase = txs.find((t) => t.description === "Loja xyz");
    expect(expense).toMatchObject({ type: "EXPENSE", amountCents: 8_990, occurredOn: "2026-10-02", paymentMethod: "OTHER", account: { id: bank.account.id } });
    expect(income).toMatchObject({ type: "INCOME", amountCents: 500_000, paymentMethod: "PIX" });
    expect(purchase).toMatchObject({ type: "EXPENSE", amountCents: 20_000, paymentMethod: "CREDIT", card: { id: card.card.id } });
    expect(purchase.invoiceId).toBeTruthy();
    expect(txs.some((t) => t.description.toLowerCase().includes("pagamento"))).toBe(false); // pagamento de fatura não vira lançamento

    const statuses = (await env.prisma.bankTransaction.findMany({ where: { connectionId: res.body.id } })).map((b) => b.status).sort();
    expect(statuses).toEqual(["IGNORED", "IMPORTED", "IMPORTED", "IMPORTED"]);
    expect(res.body.pendingCount).toBe(0);

    const notes = (await w.user.get("/v1/notifications")).body.data.filter((n: any) => n.type === "TRANSACTION_SYNCED");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("3 transações foram importadas");
  });

  it("sincronizar de novo não duplica nada (contas, cartões ou lançamentos)", async () => {
    const w = await world();
    const { itemId } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    const before = { accounts: (await listAccounts(w)).length, cards: (await w.user.get("/v1/cards")).body.data.length, txs: (await listTxs(w)).length };
    for (let i = 0; i < 2; i++) {
      const sync = await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
      expect(sync.body).toMatchObject({ newTransactions: 0, accounts: 2, status: "ACTIVE" });
    }
    expect({ accounts: (await listAccounts(w)).length, cards: (await w.user.get("/v1/cards")).body.data.length, txs: (await listTxs(w)).length }).toEqual(before);
  });

  it("transações novas entram sozinhas depois e o saldo continua batendo com o banco", async () => {
    const w = await world();
    const { itemId, accountIds } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    provider.addTransactions(accountIds[0]!, [{ description: "PADARIA", amountCents: 3_000, postedOn: "2026-10-03" }]);
    provider.accounts.get(itemId)![0]!.balanceCents = 247_000;
    const sync = await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect(sync.body.newTransactions).toBe(1);
    expect((await listTxs(w)).some((t) => t.description === "Padaria" && t.amountCents === 3_000)).toBe(true);
    const account = (await listAccounts(w)).find((a) => a.id === reg.accounts[0].account.id);
    expect(account.balanceCents).toBe(247_000);
  });

  it("concilia com um lançamento manual parecido em vez de duplicar", async () => {
    const w = await world();
    const { itemId, accountIds } = provider.addItem(w.user.id, {
      accounts: [{ kind: "BANK", name: "CC", balanceCents: 90_000, txs: [{ description: "PADARIA", amountCents: 1_550, postedOn: "2026-10-03" }] }],
    });
    // registra em modo revisão, vincula à conta que o usuário já tem e só então liga o automático
    const reg = (await connect(w, itemId, { autoImport: false })).body;
    await w.user.put(`/v1/open-finance/connections/${reg.id}/accounts/${accountIds[0]}`, { accountId: w.account.id });
    const manual = await w.expense({ description: "Padaria", amountCents: 1_550, occurredOn: "2026-10-02" });
    const before = (await listTxs(w)).length;
    expect((await w.user.patch(`/v1/open-finance/connections/${reg.id}`, { autoImport: true })).body.autoImport).toBe(true);
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);

    expect((await listTxs(w)).length).toBe(before); // nenhum lançamento novo
    const row = await env.prisma.transaction.findUnique({ where: { id: manual.id } });
    expect(row?.bankTransactionId).toBeTruthy();
    expect((await env.prisma.bankTransaction.findFirst({ where: { connectionId: reg.id } }))?.status).toBe("MATCHED");
  });

  it("cartão só é criado quando o banco informa fechamento e vencimento", async () => {
    const w = await world();
    const { itemId } = provider.addItem(w.user.id, {
      accounts: [{ kind: "CREDIT", name: "Cartão", balanceCents: 0, credit: { brand: "VISA", limitCents: 100_000, availableCents: 100_000, closeDate: null, dueDate: null, minimumPaymentCents: null }, txs: [{ description: "COMPRA", amountCents: 5_000 }] }],
    });
    const reg = (await connect(w, itemId)).body;
    expect(reg.accounts[0].card).toBeNull();
    expect((await w.user.get("/v1/cards")).body.data).toHaveLength(0);

    provider.accounts.get(itemId)![0]!.credit = { brand: "VISA", limitCents: 100_000, availableCents: 95_000, closeDate: "2026-10-20", dueDate: "2026-10-28", minimumPaymentCents: null };
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    const cards = (await w.user.get("/v1/cards")).body.data;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ closingDay: 20, dueDay: 28 });
    expect((await listTxs(w)).some((t) => t.description === "Compra" && t.paymentMethod === "CREDIT")).toBe(true);
  });

  it("dois bancos com contas de mesmo nome não geram nomes repetidos", async () => {
    const w = await world();
    for (let i = 0; i < 2; i++) {
      const { itemId } = provider.addItem(w.user.id, { institution: "Banco Igual", accounts: [{ kind: "BANK", name: "Conta", balanceCents: 1_000 }] });
      expect((await connect(w, itemId)).status).toBe(201);
    }
    const names = (await listAccounts(w)).map((a) => a.name).filter((n) => n.startsWith("Banco Igual"));
    expect(names.sort()).toEqual(["Banco Igual · Conta", "Banco Igual · Conta (2)"]);
  });

  it("desligar o automático volta ao modo revisão; ligar de novo importa o que ficou esperando", async () => {
    const w = await world();
    const { itemId, accountIds } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    expect((await w.user.patch(`/v1/open-finance/connections/${reg.id}`, { autoImport: false })).body.autoImport).toBe(false);

    provider.addTransactions(accountIds[0]!, [{ description: "NOVA", amountCents: 700, postedOn: "2026-10-03" }]);
    const sync = await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect(sync.body.newTransactions).toBe(1);
    expect((await w.user.get("/v1/open-finance/connections")).body.data[0].pendingCount).toBe(1);
    expect((await listTxs(w)).some((t) => t.description === "Nova")).toBe(false);

    await w.user.patch(`/v1/open-finance/connections/${reg.id}`, { autoImport: true });
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect((await listTxs(w)).some((t) => t.description === "Nova")).toBe(true);
    expect((await w.user.get("/v1/open-finance/connections")).body.data[0].pendingCount).toBe(0);
  });

  it("só o dono altera a opção", async () => {
    const w = await world();
    const { itemId } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    const other = await world();
    expect((await other.user.patch(`/v1/open-finance/connections/${reg.id}`, { autoImport: false })).status).toBe(404);
    expect((await w.user.patch(`/v1/open-finance/connections/${reg.id}`, { autoImport: "sim" })).status).toBe(422);
  });
});

describe("pagamento da fatura: o débito na conta quita a fatura em vez de virar despesa", () => {
  const CARD_DATES = { brand: "VISA", limitCents: 500_000, availableCents: 400_000, closeDate: "2026-10-10", dueDate: "2026-10-17", minimumPaymentCents: null };

  /** Banco com conta corrente (saldo informado) e cartão; `cardTxs`/`bankTxs` no formato do provedor. */
  function bank(w: World, opts: { balance: number; bankTxs: Array<Record<string, unknown>>; cardTxs?: Array<Record<string, unknown>> }) {
    const accounts: any[] = [{ kind: "BANK", name: "CC", balanceCents: opts.balance, txs: opts.bankTxs }];
    if (opts.cardTxs) accounts.push({ kind: "CREDIT", name: "Cartão", balanceCents: 0, credit: CARD_DATES, txs: opts.cardTxs });
    return provider.addItem(w.user.id, { accounts });
  }
  const invoicesOf = async (w: World, cardId: string) => (await w.user.get(`/v1/cards/${cardId}/invoices`)).body.data as any[];
  const byTotal = (list: any[], total: number) => list.find((i) => i.totalCents === total);

  it("quita a fatura fechada, não cria despesa e o saldo continua batendo com o banco", async () => {
    const w = await world();
    const { itemId } = bank(w, {
      balance: 330_000,
      bankTxs: [
        { description: "PAGAMENTO FATURA CARTAO", amountCents: 20_000, postedOn: "2026-09-17" },
        { description: "SALARIO", direction: "CREDIT", amountCents: 500_000, postedOn: "2026-09-05" },
      ],
      cardTxs: [
        { description: "LOJA A", amountCents: 20_000, postedOn: "2026-09-05" },
        { description: "LOJA B", amountCents: 7_000, postedOn: "2026-10-02" },
      ],
    });
    const reg = (await connect(w, itemId)).body;
    const [bankAcc, cardAcc] = reg.accounts;

    const invoices = await invoicesOf(w, cardAcc.card.id);
    expect(byTotal(invoices, 20_000)).toMatchObject({ status: "PAID", paidCents: 20_000, remainingCents: 0 });
    expect(byTotal(invoices, 7_000)).toMatchObject({ paidCents: 0, remainingCents: 7_000 });

    const payments = await env.prisma.invoicePayment.findMany({ where: { userId: w.user.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ accountId: bankAcc.account.id, notes: "Importado do banco" });
    expect(Number(payments[0]!.amountCents)).toBe(20_000);
    expect(payments[0]!.paidOn.toISOString().slice(0, 10)).toBe("2026-09-17");

    expect((await listTxs(w)).some((t) => /fatura/i.test(t.description))).toBe(false); // não virou despesa
    const account = (await listAccounts(w)).find((a) => a.id === bankAcc.account.id);
    expect(account.balanceCents).toBe(330_000);
    const statuses = (await env.prisma.bankTransaction.findMany({ where: { connectionId: reg.id, descriptionRaw: "PAGAMENTO FATURA CARTAO" } })).map((b) => b.status);
    expect(statuses).toEqual(["IMPORTED"]);
  });

  it("paga as faturas da mais antiga para a mais nova, parcialmente a última", async () => {
    const w = await world();
    const { itemId } = bank(w, {
      balance: 100_000,
      bankTxs: [{ description: "PAG FATURA CARTAO", amountCents: 25_000, postedOn: "2026-09-17" }],
      cardTxs: [
        { description: "AGOSTO", amountCents: 20_000, postedOn: "2026-08-05" },
        { description: "SETEMBRO", amountCents: 10_000, postedOn: "2026-09-05" },
      ],
    });
    const reg = (await connect(w, itemId)).body;
    const invoices = await invoicesOf(w, reg.accounts[1].card.id);
    expect(byTotal(invoices, 20_000)).toMatchObject({ status: "PAID", paidCents: 20_000 });
    expect(byTotal(invoices, 10_000)).toMatchObject({ paidCents: 5_000, remainingCents: 5_000 });
  });

  it("valor acima da fatura vira pagamento a maior (o saldo da conta não se perde)", async () => {
    const w = await world();
    const { itemId } = bank(w, {
      balance: 100_000,
      bankTxs: [{ description: "PAGAMENTO DE FATURA", amountCents: 30_000, postedOn: "2026-09-17" }],
      cardTxs: [{ description: "COMPRA", amountCents: 20_000, postedOn: "2026-09-05" }],
    });
    const reg = (await connect(w, itemId)).body;
    const payments = await env.prisma.invoicePayment.findMany({ where: { userId: w.user.id }, orderBy: { amountCents: "desc" } });
    expect(payments.map((p) => Number(p.amountCents))).toEqual([20_000, 10_000]);
    expect(byTotal(await invoicesOf(w, reg.accounts[1].card.id), 20_000)).toMatchObject({ status: "PAID" });
    expect((await listAccounts(w)).find((a) => a.id === reg.accounts[0].account.id).balanceCents).toBe(100_000);
  });

  it("sem fatura para quitar, o débito entra como despesa normal; descrição comum nunca é tratada como fatura", async () => {
    const w = await world();
    const none = bank(w, { balance: 50_000, bankTxs: [{ description: "PAGAMENTO FATURA CARTAO", amountCents: 5_000, postedOn: "2026-09-17" }] });
    await connect(w, none.itemId);
    expect((await listTxs(w)).find((t) => t.description === "Pagamento fatura cartao")).toMatchObject({ type: "EXPENSE", amountCents: 5_000 });
    expect(await env.prisma.invoicePayment.count({ where: { userId: w.user.id } })).toBe(0);

    const w2 = await world();
    const other = bank(w2, {
      balance: 50_000,
      bankTxs: [{ description: "PIX FARMACIA SAO JOAO", amountCents: 20_000, postedOn: "2026-09-17" }],
      cardTxs: [{ description: "COMPRA", amountCents: 20_000, postedOn: "2026-09-05" }],
    });
    const reg = (await connect(w2, other.itemId)).body;
    expect(await env.prisma.invoicePayment.count({ where: { userId: w2.user.id } })).toBe(0);
    expect(byTotal(await invoicesOf(w2, reg.accounts[1].card.id), 20_000)).toMatchObject({ paidCents: 0 });
    expect((await listTxs(w2)).some((t) => t.description === "Pix farmacia sao joao")).toBe(true);
  });
});
describe("visão geral do que veio do banco (saldo, limite e fatura)", () => {
  it("devolve o saldo da conta e os dados do cartão vinculados", async () => {
    const w = await world();
    const { itemId } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    const overview = (await w.user.get("/v1/open-finance/overview")).body;
    expect(overview.accounts).toEqual([{ accountId: reg.accounts[0].account.id, institutionName: "Banco Teste", balanceCents: 250_000, updatedAt: expect.any(String) }]);
    expect(overview.cards).toEqual([
      {
        cardId: reg.accounts[1].card.id,
        institutionName: "Banco Teste",
        updatedAt: expect.any(String),
        brand: "MASTERCARD",
        limitCents: 800_000,
        availableCents: 512_055,
        usedCents: 287_945,
        billCents: 287_945,
        minimumPaymentCents: 28_794,
        closeDate: "2026-10-10",
        dueDate: "2026-10-17",
      },
    ]);
  });

  it("limite e fatura acompanham as leituras seguintes (atualização automática)", async () => {
    const w = await world();
    const { itemId } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    provider.accounts.get(itemId)![1]!.credit = { ...CARD, availableCents: 400_000 };
    provider.accounts.get(itemId)![1]!.balanceCents = 400_000;
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    const card = (await w.user.get("/v1/open-finance/overview")).body.cards[0];
    expect(card).toMatchObject({ availableCents: 400_000, usedCents: 400_000, billCents: 400_000 });
  });

  it("não mostra nada de outro usuário nem de conexões revogadas", async () => {
    const w = await world();
    const { itemId } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    const other = await world();
    expect((await other.user.get("/v1/open-finance/overview")).body).toEqual({ accounts: [], cards: [] });
    await w.user.delete(`/v1/open-finance/connections/${reg.id}`);
    expect((await w.user.get("/v1/open-finance/overview")).body).toEqual({ accounts: [], cards: [] });
  });
});

describe("investimentos (CDB, caixinhas, cofrinhos...)", () => {
  const cdb = { name: "CDB Banco Teste 110% CDI", subtype: "CDB", balanceCents: 105_000, investedCents: 100_000, profitCents: 5_000, rateType: "CDI", rate: 110 };
  const caixinha = { name: "Caixinha Viagem", subtype: "CDB", issuer: "Nu Pagamentos", balanceCents: 52_000, investedCents: 50_000, profitCents: 2_000, rateType: "CDI", rate: 100, dueDate: null };
  const fundo = { name: "Fundo Multimercado", type: "MUTUAL_FUND", subtype: "MULTIMARKET_FUND", balanceCents: 30_000, investedCents: 28_000, profitCents: 2_000, rateType: null, rate: null, annualRate: 11.25 };

  async function withInvestments(list: Array<Record<string, unknown>>) {
    const w = await world();
    const { itemId } = provider.addItem(w.user.id, { accounts: [{ kind: "BANK", name: "CC", balanceCents: 1_000 }], investments: list });
    const reg = (await connect(w, itemId)).body;
    return { w, itemId, reg };
  }
  const invs = async (w: World, query: Record<string, string> = {}) => (await w.user.get("/v1/open-finance/investments", { query })).body;

  it("traz os investimentos, com total, rendimento e agrupamento por produto", async () => {
    const { w, reg } = await withInvestments([cdb, caixinha, fundo]);
    expect(reg.investmentCount).toBe(3);
    const body = await invs(w);
    expect(body.summary).toMatchObject({ totalCents: 187_000, investedCents: 178_000, profitCents: 9_000, profitPct: 5.06, count: 3 });
    expect(body.summary.updatedAt).toBeTruthy();
    expect(body.groups).toEqual([
      { key: "CDB", label: "CDB", totalCents: 157_000, count: 2 },
      { key: "MULTIMARKET_FUND", label: "Fundos multimercado", totalCents: 30_000, count: 1 },
    ]);
    expect(body.items.map((i: any) => i.name)).toEqual(["CDB Banco Teste 110% CDI", "Caixinha Viagem", "Fundo Multimercado"]); // maior valor primeiro
    expect(body.items[0]).toMatchObject({ institutionName: "Banco Teste", groupLabel: "CDB", rateLabel: "110% do CDI", profitPct: 5, closed: false, dueDate: "2028-07-01" });
    expect(body.items[1]).toMatchObject({ issuer: "Nu Pagamentos", rateLabel: "100% do CDI", dueDate: null, profitPct: 4 });
    expect(body.items[2].rateLabel).toBe("rentabilidade anual 11,25%");
  });

  it("a sincronização também devolve a quantidade de investimentos", async () => {
    const { w, reg } = await withInvestments([cdb]);
    const sync = await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect(sync.body.investments).toBe(1);
  });

  it("guarda uma foto por dia: novo dia = novo ponto; mesmo dia só atualiza", async () => {
    const { w, itemId, reg } = await withInvestments([{ ...cdb, id: "inv-1" }]);
    const id = (await invs(w)).items[0].id;
    const sync = () => w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);

    env.setNow("2026-10-04T18:00:00.000Z");
    provider.setInvestments(itemId, [{ ...cdb, id: "inv-1", balanceCents: 105_500, profitCents: 5_500 }]);
    await sync(); // mesmo dia: atualiza o ponto de hoje
    env.setNow("2026-10-05T15:00:00.000Z");
    provider.setInvestments(itemId, [{ ...cdb, id: "inv-1", balanceCents: 106_000, profitCents: 6_000 }]);
    await sync();
    await sync(); // repetir no mesmo dia não cria outro ponto
    env.setNow(DEFAULT_NOW);

    const detail = (await w.user.get(`/v1/open-finance/investments/${id}`)).body;
    expect(detail.history).toEqual([
      { date: "2026-10-04", balanceCents: 105_500, profitCents: 5_500 },
      { date: "2026-10-05", balanceCents: 106_000, profitCents: 6_000 },
    ]);
    expect(detail.balanceCents).toBe(106_000);
    expect(detail.name).toBe("CDB Banco Teste 110% CDI");
  });

  it("o que sumiu do banco é encerrado; só com leitura completa e não vazia", async () => {
    const { w, itemId, reg } = await withInvestments([{ ...cdb, id: "a" }, { ...caixinha, id: "b" }]);
    const sync = () => w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);

    // lista vazia (pode ser limite mensal do Open Finance) NÃO encerra nada
    provider.setInvestments(itemId, []);
    await sync();
    expect((await invs(w)).items).toHaveLength(2);

    // coleta parcial NÃO encerra o que faltou
    provider.items.get(itemId)!.partial = true;
    provider.setInvestments(itemId, [{ ...cdb, id: "a" }]);
    await sync();
    expect((await invs(w)).items).toHaveLength(2);

    // leitura completa sem o "b": encerrado
    provider.items.get(itemId)!.partial = false;
    await sync();
    const active = await invs(w);
    expect(active.items.map((i: any) => i.name)).toEqual(["CDB Banco Teste 110% CDI"]);
    expect(active.summary.count).toBe(1);
    const all = await invs(w, { includeClosed: "true" });
    expect(all.items.find((i: any) => i.name === "Caixinha Viagem")).toMatchObject({ closed: true });
    expect(all.summary.totalCents).toBe(105_000); // encerrados não entram no total

    // voltou a aparecer: reabre
    provider.setInvestments(itemId, [{ ...cdb, id: "a" }, { ...caixinha, id: "b" }]);
    await sync();
    expect((await invs(w)).items).toHaveLength(2);
  });

  it("resgate total encerra e mantém a data original de encerramento", async () => {
    const { w, itemId, reg } = await withInvestments([{ ...cdb, id: "a" }]);
    provider.setInvestments(itemId, [{ ...cdb, id: "a", status: "TOTAL_WITHDRAWAL", balanceCents: 0 }]);
    env.setNow("2026-10-05T12:00:00.000Z");
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    const first = (await env.prisma.bankInvestment.findFirst({ where: { connectionId: reg.id } }))!.closedAt;
    expect(first).not.toBeNull();
    env.setNow("2026-10-06T12:00:00.000Z");
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    env.setNow(DEFAULT_NOW);
    expect((await env.prisma.bankInvestment.findFirst({ where: { connectionId: reg.id } }))!.closedAt?.toISOString()).toBe(first!.toISOString());
    expect((await invs(w)).items).toHaveLength(0);
  });

  it("falha na leitura de investimentos não derruba contas e transações", async () => {
    const w = await world();
    const { itemId } = bankWithCard(w, { investments: [cdb] });
    provider.failInvestments = true;
    try {
      const res = await connect(w, itemId);
      expect(res.status).toBe(201);
      expect(res.body.investmentCount).toBe(0);
      expect((await listTxs(w)).length).toBeGreaterThan(0);
    } finally {
      provider.failInvestments = false;
    }
    const reg = (await w.user.get("/v1/open-finance/connections")).body.data[0];
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect((await invs(w)).items).toHaveLength(1); // recuperou na leitura seguinte
  });

  it("isolamento: outro usuário não vê nem abre os investimentos", async () => {
    const { w } = await withInvestments([cdb]);
    const id = (await invs(w)).items[0].id;
    const other = await world();
    expect((await invs(other)).items).toEqual([]);
    expect((await other.user.get(`/v1/open-finance/investments/${id}`)).status).toBe(404);
    expect((await env.anon.get("/v1/open-finance/investments")).status).toBe(401);
    expect((await w.user.get("/v1/open-finance/investments/nao-e-uuid")).status).toBe(422);
  });

  it("os usuários não conseguem gravar investimentos (somente leitura sob RLS)", async () => {
    const { w } = await withInvestments([cdb]);
    const rows = await env.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM bank_investments WHERE user_id = ${w.user.id}::uuid`;
    expect(Number(rows[0]!.n)).toBe(1);
    // como app_user (RLS ativo) só dá para ler: tentar escrever é negado pelo banco
    await expect(
      env.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${w.user.id}, true)`;
        await tx.$executeRaw`SET LOCAL ROLE app_user`;
        await tx.$executeRaw`UPDATE bank_investments SET balance_cents = 999999999 WHERE user_id = ${w.user.id}::uuid`;
      }),
    ).rejects.toThrow();
  });

  it("revogar a conexão apaga os investimentos e o histórico; excluir a conta também", async () => {
    const { w, reg } = await withInvestments([cdb, caixinha]);
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect(await env.prisma.bankInvestmentSnapshot.count({ where: { userId: w.user.id } })).toBe(2);
    expect((await w.user.delete(`/v1/open-finance/connections/${reg.id}`)).status).toBe(200);
    expect(await env.prisma.bankInvestment.count({ where: { userId: w.user.id } })).toBe(0);
    expect(await env.prisma.bankInvestmentSnapshot.count({ where: { userId: w.user.id } })).toBe(0);
    expect((await invs(w)).items).toEqual([]);

    const again = await withInvestments([cdb]);
    expect((await again.w.user.delete("/v1/me", { body: { password: again.w.user.password, confirm: "EXCLUIR" } })).status).toBe(200);
    expect(await env.prisma.bankInvestment.count({ where: { userId: again.w.user.id } })).toBe(0);
  });

  it("os investimentos entram na exportação dos dados (LGPD)", async () => {
    const { w } = await withInvestments([cdb]);
    const exported = (await w.user.get("/v1/privacy/export")).body;
    expect(exported.data.bankInvestments).toHaveLength(1);
    expect(exported.data.bankInvestments[0].name).toBe("CDB Banco Teste 110% CDI");
    expect(exported.data.bankInvestmentSnapshots).toHaveLength(1);
  });
});

describe("pedir atualização ao banco (com limite diário)", () => {
  async function connected() {
    const w = await world();
    const { itemId } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    return { w, itemId, reg, url: `/v1/open-finance/connections/${reg.id}/refresh` };
  }
  const minutes = (n: number) => new Date(new Date(DEFAULT_NOW).getTime() + n * 60_000).toISOString();

  it("pede ao provedor uma nova coleta e informa quantos pedidos ainda cabem hoje", async () => {
    const { w, itemId, reg, url } = await connected();
    expect(reg.refreshesLeftToday).toBe(3);
    const res = await w.user.post(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: true, refreshesLeftToday: 2 });
    expect(provider.refreshed).toContain(itemId);
    expect((await w.user.get("/v1/open-finance/connections")).body.data[0].refreshesLeftToday).toBe(2);
    env.setNow(DEFAULT_NOW);
  });

  it("intervalo mínimo de 30 min e no máximo 3 por dia; depois de 24 h libera de novo", async () => {
    const { w, url } = await connected();
    expect((await w.user.post(url)).status).toBe(200);

    const soon = await w.user.post(url);
    expect(soon.status).toBe(429);
    expect(soon.body.error.code).toBe("REFRESH_TOO_SOON");
    expect(soon.body.error.details.retryAfterSeconds).toBeGreaterThan(0);

    env.setNow(minutes(31));
    expect((await w.user.post(url)).body.refreshesLeftToday).toBe(1);
    env.setNow(minutes(62));
    expect((await w.user.post(url)).body.refreshesLeftToday).toBe(0);
    env.setNow(minutes(93));
    const limit = await w.user.post(url);
    expect(limit.status).toBe(429);
    expect(limit.body.error.code).toBe("REFRESH_LIMIT");
    expect(new Date(limit.body.error.details.nextAt).getTime()).toBe(new Date(minutes(24 * 60)).getTime());

    // A janela de 24 h é deslizante: às 24h05 só o 1º pedido (0h00) saiu dela; os das 0h31 e 1h02 ainda contam.
    env.setNow(minutes(24 * 60 + 5));
    const next = await w.user.post(url);
    expect(next.status).toBe(200);
    expect(next.body.refreshesLeftToday).toBe(0);
    // Às 25h06 os três primeiros já saíram da janela: só o das 24h05 conta.
    env.setNow(minutes(25 * 60 + 6));
    expect((await w.user.post(url)).body.refreshesLeftToday).toBe(1);
    env.setNow(DEFAULT_NOW);
  });

  it("falha do provedor vira 502 e não gasta o limite", async () => {
    const { w, url } = await connected();
    provider.failRefresh = true;
    try {
      expect((await w.user.post(url)).status).toBe(502);
    } finally {
      provider.failRefresh = false;
    }
    expect((await w.user.post(url)).body.refreshesLeftToday).toBe(2);
    env.setNow(DEFAULT_NOW);
  });

  it("outro usuário não consegue pedir atualização da conexão alheia; exige login e consentimento", async () => {
    const { url } = await connected();
    const other = await world();
    expect((await other.user.post(url)).status).toBe(404);
    expect((await env.anon.post(url)).status).toBe(401);

    const w = await world();
    const { itemId } = bankWithCard(w);
    const reg = (await connect(w, itemId)).body;
    await w.user.post("/v1/privacy/consents", { ...CONSENT, granted: false }); // revoga e encerra as conexões
    expect((await w.user.post(`/v1/open-finance/connections/${reg.id}/refresh`)).status).toBe(404);
  });
});

describe("rotina periódica", () => {
  it("pode ser restrita a alguns usuários e atualiza só as conexões paradas há mais de 24 h", async () => {
    const a = await world();
    const b = await world();
    const regA = (await connect(a, bankWithCard(a).itemId)).body;
    const regB = (await connect(b, bankWithCard(b).itemId)).body;
    const old = new Date("2026-10-01T00:00:00Z");
    await env.prisma.bankConnection.updateMany({ where: { id: { in: [regA.id, regB.id] } }, data: { lastSyncAt: old } });

    const out = await runOpenFinanceJob(env.app.openFinance!.deps, { userIds: [a.user.id] });
    expect(out.synced).toBe(1);
    const last = async (id: string) => (await env.prisma.bankConnection.findUnique({ where: { id } }))!.lastSyncAt!.getTime();
    expect(await last(regA.id)).toBeGreaterThan(old.getTime());
    expect(await last(regB.id)).toBe(old.getTime()); // fora do escopo: intocada
  });
});
