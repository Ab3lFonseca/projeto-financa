import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOpenFinanceJob } from "../src/modules/open-finance/service";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { createWorld, type World } from "./helpers/factories";
import { FakeOpenFinanceProvider, WEBHOOK_SECRET } from "./helpers/fake-open-finance";

const provider = new FakeOpenFinanceProvider();
let env: TestEnv;

beforeAll(async () => {
  env = await createTestEnv({ OPEN_FINANCE_ENABLED: "true" }, { openFinanceProvider: provider });
});
afterAll(async () => {
  await env.close();
});

const CONSENT = { type: "OPEN_FINANCE", version: "2026-10-01", granted: true };

async function world(withConsent = true): Promise<World> {
  const w = await createWorld(env);
  if (withConsent) expect((await w.user.post("/v1/privacy/consents", CONSENT)).status).toBe(200);
  return w;
}

/** Usuário com conexão registrada e a conta corrente do banco vinculada à conta do app. */
async function connected(txs: Array<Record<string, unknown>> = []) {
  const w = await world();
  const { itemId, accountIds } = provider.addItem(w.user.id, { accounts: [{ kind: "BANK", name: "Conta Corrente", txs }] });
  const reg = await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false });
  expect(reg.status).toBe(201);
  const link = await w.user.put(`/v1/open-finance/connections/${reg.body.id}/accounts/${accountIds[0]}`, { accountId: w.account.id });
  expect(link.status).toBe(200);
  return { w, itemId, accountId: accountIds[0]!, connectionId: reg.body.id as string };
}

describe("disponibilidade e acesso", () => {
  it("desligado no servidor: status informa e as rotas respondem 503", async () => {
    const off = await createTestEnv(); // OPEN_FINANCE_ENABLED=false (padrão)
    try {
      const w = await createWorld(off);
      const status = await w.user.get("/v1/open-finance/status");
      expect(status.body).toMatchObject({ enabled: false, provider: "PLUGGY" });
      const token = await w.user.post("/v1/open-finance/connect-token", {});
      expect(token.status).toBe(503);
      expect(token.body.error.code).toBe("OPEN_FINANCE_DISABLED");
      expect((await w.user.get("/v1/me")).body.entitlements.features.openFinance).toBe(false);
    } finally {
      await off.close();
    }
  });

  it("teste vencido e sem assinatura (cobrança ligada) recebe 402; no beta todos têm acesso", async () => {
    const paid = await createTestEnv({ OPEN_FINANCE_ENABLED: "true", BILLING_ENFORCED: "true" }, { openFinanceProvider: provider });
    try {
      const w = await createWorld(paid);
      await paid.expireTrial(w.user.id);
      const status = await w.user.get("/v1/open-finance/status");
      expect(status.body).toMatchObject({ enabled: true, allowedByPlan: false });
      // Ler a lista de bancos pede o plano; já criar a conexão (escrita) cai antes no somente leitura.
      const connectors = await w.user.get("/v1/open-finance/connectors");
      expect(connectors.status).toBe(402);
      expect(connectors.body.error.details.feature).toBe("openFinance");
      const res = await w.user.post("/v1/open-finance/connect-token", {});
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe("SUBSCRIPTION_REQUIRED");
    } finally {
      await paid.close();
    }
    const w = await world(false);
    expect((await w.user.get("/v1/open-finance/status")).body).toMatchObject({ enabled: true, allowedByPlan: true, consentGranted: false });
  });

  it("exige o consentimento específico de Open Finance", async () => {
    const w = await world(false);
    const res = await w.user.post("/v1/open-finance/connect-token", {});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OPEN_FINANCE_CONSENT_REQUIRED");
    const { itemId } = provider.addItem(w.user.id);
    expect((await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false })).body.error.code).toBe("OPEN_FINANCE_CONSENT_REQUIRED");

    await w.user.post("/v1/privacy/consents", CONSENT);
    expect((await w.user.get("/v1/open-finance/status")).body.consentGranted).toBe(true);
    const ok = await w.user.post("/v1/open-finance/connect-token", {});
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toMatch(/^connect-token-/);
    // o token é amarrado ao usuário que o pediu
    expect(provider.tokens.at(-1)).toEqual({ clientUserId: w.user.id, itemId: undefined });
  });

  it("exige login", async () => {
    expect((await env.anon.get("/v1/open-finance/connections")).status).toBe(401);
  });
});

describe("bancos regulados (widget só lista estes)", () => {
  it("entrega a lista de conectores regulados e a guarda em cache", async () => {
    const w = await world(false);
    const before = provider.connectorCalls;
    const res = await w.user.get("/v1/open-finance/connectors");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 601, name: "Banco A" }, { id: 602, name: "Banco B" }]);
    await w.user.get("/v1/open-finance/connectors");
    expect(provider.connectorCalls - before).toBeLessThanOrEqual(1);
  });

  it("lista vazia (falha transitória) não fica em cache", async () => {
    const own = new FakeOpenFinanceProvider();
    own.connectors = [];
    const e = await createTestEnv({ OPEN_FINANCE_ENABLED: "true" }, { openFinanceProvider: own });
    try {
      const w = await createWorld(e);
      expect((await w.user.get("/v1/open-finance/connectors")).body.data).toEqual([]);
      own.connectors = [{ id: 7, name: "Banco Z" }];
      expect((await w.user.get("/v1/open-finance/connectors")).body.data).toEqual([{ id: 7, name: "Banco Z" }]);
    } finally {
      await e.close();
    }
  });

  it("exige recurso ligado e plano Premium; envia o deep link de retorno no token", async () => {
    const off = await createTestEnv();
    try {
      const w = await createWorld(off);
      expect((await w.user.get("/v1/open-finance/connectors")).status).toBe(503);
    } finally {
      await off.close();
    }
    const paid = await createTestEnv({ OPEN_FINANCE_ENABLED: "true", BILLING_ENFORCED: "true" }, { openFinanceProvider: provider });
    try {
      const w = await createWorld(paid);
      await paid.expireTrial(w.user.id);
      expect((await w.user.get("/v1/open-finance/connectors")).status).toBe(402);
    } finally {
      await paid.close();
    }
    const own = new FakeOpenFinanceProvider();
    const withUri = await createTestEnv(
      { OPEN_FINANCE_ENABLED: "true", OPEN_FINANCE_REDIRECT_URI: "financa://open-finance", OPEN_FINANCE_WEB_REDIRECT_URI: "https://app.exemplo.dev/open-finance" },
      { openFinanceProvider: own },
    );
    try {
      const w = await createWorld(withUri);
      await w.user.post("/v1/privacy/consents", CONSENT);
      await w.user.post("/v1/open-finance/connect-token", {});
      expect(own.tokens.at(-1)).toMatchObject({ clientUserId: w.user.id, redirectUri: "financa://open-finance" });
      // o app nativo pede explicitamente; o navegador recebe o endereço da página (deep link não abre na web)
      await w.user.post("/v1/open-finance/connect-token", { platform: "native" });
      expect(own.tokens.at(-1)).toMatchObject({ redirectUri: "financa://open-finance" });
      await w.user.post("/v1/open-finance/connect-token", { platform: "web" });
      expect(own.tokens.at(-1)).toMatchObject({ redirectUri: "https://app.exemplo.dev/open-finance" });
      expect((await w.user.post("/v1/open-finance/connect-token", { platform: "tv" })).status).toBe(422);
    } finally {
      await withUri.close();
    }
  });
});

describe("registro da conexão", () => {
  it("aceita item regulado do próprio usuário e lista as contas do banco", async () => {
    const w = await world();
    const { itemId } = provider.addItem(w.user.id, {
      institution: "Banco do Teste",
      accounts: [
        { kind: "BANK", name: "Conta Corrente", balanceCents: 250_000 },
        { kind: "CREDIT", name: "Cartão Gold" },
      ],
    });
    const res = await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ institutionName: "Banco do Teste", status: "ACTIVE", pendingCount: 0 });
    expect(res.body.accounts).toHaveLength(2);
    expect(res.body.accounts[0]).toMatchObject({ name: "Conta Corrente", kind: "BANK", balanceCents: 250_000, account: null, card: null });
    expect((await w.user.get("/v1/open-finance/connections")).body.data).toHaveLength(1);
    // registrar de novo é idempotente
    const again = await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false });
    expect(again.body.id).toBe(res.body.id);
    expect((await w.user.get("/v1/open-finance/connections")).body.data).toHaveLength(1);
  });

  it("recusa conexão de outra pessoa (clientUserId diferente) sem apagá-la", async () => {
    const w = await world();
    const stranger = await world();
    const { itemId } = provider.addItem(stranger.user.id);
    const res = await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ITEM_NOT_OWNED");
    expect(provider.deleted).not.toContain(itemId);
    const orphan = provider.addItem(null);
    expect((await w.user.post("/v1/open-finance/connections", { itemId: orphan.itemId })).body.error.code).toBe("ITEM_NOT_OWNED");
  });

  it("recusa conectores NÃO regulados (login e senha) e remove a conexão no provedor", async () => {
    const w = await world();
    const { itemId } = provider.addItem(w.user.id, { isOpenFinance: false });
    const res = await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_OPEN_FINANCE");
    expect(provider.deleted).toContain(itemId);
    expect((await w.user.get("/v1/open-finance/connections")).body.data).toHaveLength(0);
  });

  it("item inexistente → 404; itemId inválido → 422", async () => {
    const w = await world();
    expect((await w.user.post("/v1/open-finance/connections", { itemId: "11111111-1111-4111-8111-111111111111" })).status).toBe(404);
    expect((await w.user.post("/v1/open-finance/connections", { itemId: "nao-e-uuid" })).status).toBe(422);
  });

  it("usuário não enxerga nem mexe nas conexões de outro", async () => {
    const { connectionId } = await connected();
    const other = await world();
    expect((await other.user.get("/v1/open-finance/connections")).body.data).toHaveLength(0);
    expect((await other.user.post(`/v1/open-finance/connections/${connectionId}/sync`)).status).toBe(404);
    expect((await other.user.delete(`/v1/open-finance/connections/${connectionId}`)).status).toBe(404);
    expect((await other.user.post("/v1/open-finance/connect-token", { connectionId })).status).toBe(404);
  });
});

describe("vínculo de contas", () => {
  it("conta do banco só vincula a conta do app; cartão do banco, a cartão; sem duplicar o destino", async () => {
    const w = await world();
    const { itemId, accountIds } = provider.addItem(w.user.id, { accounts: [{ kind: "BANK", name: "CC" }, { kind: "CREDIT", name: "Cartão" }] });
    const reg = (await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false })).body;
    const base = `/v1/open-finance/connections/${reg.id}/accounts`;
    const card = (await w.user.post("/v1/cards", { name: "Cartão", brand: "VISA", last4: "4321", limitCents: 100_000, closingDay: 5, dueDay: 12, payAccountId: w.account.id })).body;

    expect((await w.user.put(`${base}/${accountIds[0]}`, { cardId: card.id })).body.error.code).toBe("KIND_MISMATCH");
    expect((await w.user.put(`${base}/${accountIds[1]}`, { accountId: w.account.id })).body.error.code).toBe("KIND_MISMATCH");
    expect((await w.user.put(`${base}/${accountIds[0]}`, { accountId: w.account.id, cardId: card.id })).status).toBe(422);

    const ok = await w.user.put(`${base}/${accountIds[0]}`, { accountId: w.account.id });
    expect(ok.body.accounts[0].account).toMatchObject({ id: w.account.id });
    expect((await w.user.put(`${base}/${accountIds[1]}`, { cardId: card.id })).body.accounts[1].card).toMatchObject({ id: card.id });

    // outra conta do banco não pode apontar para a mesma conta do app
    const second = provider.addItem(w.user.id, { accounts: [{ kind: "BANK", name: "Outra" }] });
    const reg2 = (await w.user.post("/v1/open-finance/connections", { itemId: second.itemId, autoImport: false })).body;
    const dup = await w.user.put(`/v1/open-finance/connections/${reg2.id}/accounts/${second.accountIds[0]}`, { accountId: w.account.id });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("ALREADY_LINKED");

    // conta de outro usuário não existe para quem pede
    const other = await createWorld(env);
    expect((await w.user.put(`${base}/${accountIds[0]}`, { accountId: other.account.id })).status).toBe(422);
    // desvincular
    expect((await w.user.put(`${base}/${accountIds[0]}`, { accountId: null })).body.accounts[0].account).toBeNull();
  });
});

describe("sincronização e revisão", () => {
  it("traz só as contas vinculadas, só lançamentos efetivados, e é idempotente", async () => {
    const w = await world();
    const { itemId, accountIds } = provider.addItem(w.user.id, {
      accounts: [
        { kind: "BANK", name: "Linked", txs: [{ description: "MERCADO CENTRAL", amountCents: 8_990 }, { description: "PENDENTE", status: "PENDING" }, { description: "SALARIO", direction: "CREDIT", amountCents: 500_000 }] },
        { kind: "BANK", name: "Not linked", txs: [{ description: "NAO DEVE VIR" }] },
      ],
    });
    const reg = (await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false })).body;
    await w.user.put(`/v1/open-finance/connections/${reg.id}/accounts/${accountIds[0]}`, { accountId: w.account.id });

    const first = await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ newTransactions: 2, accounts: 2, status: "ACTIVE" });
    const second = await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect(second.body.newTransactions).toBe(0);

    const list = (await w.user.get("/v1/open-finance/bank-transactions")).body;
    expect(list.data.map((t: any) => t.description).sort()).toEqual(["MERCADO CENTRAL", "SALARIO"]);
    expect(list.data[0]).toMatchObject({ institutionName: "Banco Teste", accountName: "Linked", account: { id: w.account.id }, status: "NEW" });
    expect((await w.user.get("/v1/open-finance/connections")).body.data[0].pendingCount).toBe(2);

    // notificação "novas transações" (uma por dia por conexão)
    const notes = (await w.user.get("/v1/notifications")).body.data;
    expect(notes.filter((n: any) => n.type === "TRANSACTION_SYNCED")).toHaveLength(1);
  });

  it("importa como lançamento (receita/despesa), ligado à transação do banco, e o saldo reflete", async () => {
    const { w } = await connected([{ description: "MERCADO CENTRAL", amountCents: 8_990 }, { description: "SALARIO", direction: "CREDIT", amountCents: 500_000 }]);
    const conn = (await w.user.get("/v1/open-finance/connections")).body.data[0];
    await w.user.post(`/v1/open-finance/connections/${conn.id}/sync`);
    const list = (await w.user.get("/v1/open-finance/bank-transactions")).body.data as any[];
    const expense = list.find((t) => t.description === "MERCADO CENTRAL");
    const income = list.find((t) => t.description === "SALARIO");

    const before = await w.balanceOf(w.account.id);
    const imp = await w.user.post(`/v1/open-finance/bank-transactions/${expense.id}/import`, { categoryId: w.cat("expense.food").id });
    expect(imp.status).toBe(201);
    const tx = (await w.user.get(`/v1/transactions/${imp.body.transactionId}`)).body;
    expect(tx).toMatchObject({ type: "EXPENSE", description: "Mercado central", amountCents: 8_990, occurredOn: "2026-10-02", status: "POSTED" });
    expect(tx.category.id).toBe(w.cat("expense.food").id);
    expect(await w.balanceOf(w.account.id)).toBe(before - 8_990);
    const row = await env.prisma.transaction.findUnique({ where: { id: imp.body.transactionId } });
    expect(row?.bankTransactionId).toBe(expense.id);

    expect((await w.user.post(`/v1/open-finance/bank-transactions/${income.id}/import`, { description: "Salário de outubro" })).status).toBe(201);
    expect(await w.balanceOf(w.account.id)).toBe(before - 8_990 + 500_000);

    // não importa duas vezes
    const dup = await w.user.post(`/v1/open-finance/bank-transactions/${expense.id}/import`, {});
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("BANK_TRANSACTION_HANDLED");
    expect((await w.user.get("/v1/open-finance/bank-transactions")).body.data).toHaveLength(0);
    expect((await w.user.get("/v1/open-finance/bank-transactions", { query: { status: "IMPORTED" } })).body.data).toHaveLength(2);
  });

  it("sugere e concilia com lançamento manual parecido, sem duplicar o saldo", async () => {
    const { w, connectionId } = await connected([{ description: "PADARIA", amountCents: 1_550, postedOn: "2026-10-03" }]);
    const manual = await w.expense({ description: "Padaria", amountCents: 1_550, occurredOn: "2026-10-02" });
    const farAway = await w.expense({ description: "Outra", amountCents: 1_550, occurredOn: "2026-09-01" });
    await w.user.post(`/v1/open-finance/connections/${connectionId}/sync`);
    const item = (await w.user.get("/v1/open-finance/bank-transactions")).body.data[0];
    expect(item.suggestedMatch).toMatchObject({ transactionId: manual.id, description: "Padaria" });

    const balance = await w.balanceOf(w.account.id);
    // valor diferente não concilia
    const wrong = await w.expense({ amountCents: 999, occurredOn: "2026-10-03" });
    expect((await w.user.post(`/v1/open-finance/bank-transactions/${item.id}/match`, { transactionId: wrong.id })).body.error.code).toBe("MATCH_MISMATCH");
    expect((await w.user.post(`/v1/open-finance/bank-transactions/${item.id}/match`, { transactionId: manual.id })).status).toBe(200);
    expect(await w.balanceOf(w.account.id)).toBe(balance - 999); // só a despesa "wrong" mexeu; conciliar não cria lançamento
    expect((await w.user.get("/v1/open-finance/bank-transactions", { query: { status: "MATCHED" } })).body.data).toHaveLength(1);
    // um lançamento só concilia com uma transação do banco
    const row = await env.prisma.transaction.findUnique({ where: { id: manual.id } });
    expect(row?.bankTransactionId).toBe(item.id);
    expect((await w.user.post(`/v1/open-finance/bank-transactions/${item.id}/match`, { transactionId: farAway.id })).body.error.code).toBe("BANK_TRANSACTION_HANDLED");
  });

  it("ignorar e restaurar", async () => {
    const { w, connectionId } = await connected([{ description: "TARIFA" }]);
    await w.user.post(`/v1/open-finance/connections/${connectionId}/sync`);
    const t = (await w.user.get("/v1/open-finance/bank-transactions")).body.data[0];
    expect((await w.user.post(`/v1/open-finance/bank-transactions/${t.id}/ignore`)).status).toBe(200);
    expect((await w.user.get("/v1/open-finance/bank-transactions")).body.data).toHaveLength(0);
    expect((await w.user.post(`/v1/open-finance/bank-transactions/${t.id}/ignore`)).status).toBe(409);
    expect((await w.user.post(`/v1/open-finance/bank-transactions/${t.id}/restore`)).status).toBe(200);
    expect((await w.user.get("/v1/open-finance/bank-transactions")).body.data).toHaveLength(1);
  });

  it("não importa sem vínculo e não deixa outro usuário mexer na transação", async () => {
    const w = await world();
    const { itemId, accountIds } = provider.addItem(w.user.id, { accounts: [{ kind: "BANK", name: "CC", txs: [{ description: "X" }] }] });
    const reg = (await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false })).body;
    // vincula, sincroniza e desvincula
    const url = `/v1/open-finance/connections/${reg.id}/accounts/${accountIds[0]}`;
    await w.user.put(url, { accountId: w.account.id });
    await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    await w.user.put(url, { accountId: null });
    const t = (await w.user.get("/v1/open-finance/bank-transactions")).body.data[0];
    expect((await w.user.post(`/v1/open-finance/bank-transactions/${t.id}/import`, {})).body.error.code).toBe("ACCOUNT_NOT_LINKED");

    const other = await world();
    expect((await other.user.post(`/v1/open-finance/bank-transactions/${t.id}/ignore`)).status).toBe(404);
    expect((await other.user.post(`/v1/open-finance/bank-transactions/${t.id}/import`, {})).status).toBe(404);
  });

  it("cartão: compras entram; pagamento/estorno da fatura é ignorado (não vira receita)", async () => {
    const w = await world();
    const { itemId, accountIds } = provider.addItem(w.user.id, {
      accounts: [{ kind: "CREDIT", name: "Cartão", txs: [{ description: "LOJA", amountCents: 20_000 }, { description: "PAGAMENTO FATURA", direction: "CREDIT", amountCents: 20_000 }] }],
    });
    const reg = (await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false })).body;
    const card = (await w.user.post("/v1/cards", { name: "Cartão", brand: "VISA", last4: "4321", limitCents: 100_000, closingDay: 5, dueDay: 12, payAccountId: w.account.id })).body;
    await w.user.put(`/v1/open-finance/connections/${reg.id}/accounts/${accountIds[0]}`, { cardId: card.id });
    const sync = await w.user.post(`/v1/open-finance/connections/${reg.id}/sync`);
    expect(sync.body.newTransactions).toBe(1);
    const pending = (await w.user.get("/v1/open-finance/bank-transactions")).body.data;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ description: "LOJA", card: { id: card.id }, account: null });

    const imp = await w.user.post(`/v1/open-finance/bank-transactions/${pending[0].id}/import`, {});
    expect(imp.status).toBe(201);
    const tx = (await w.user.get(`/v1/transactions/${imp.body.transactionId}`)).body;
    expect(tx).toMatchObject({ paymentMethod: "CREDIT", card: { id: card.id } });
    expect(tx.invoiceId).toBeTruthy();

    const ignored = (await w.user.get("/v1/open-finance/bank-transactions", { query: { status: "IGNORED" } })).body.data;
    expect(ignored.map((t: any) => t.description)).toEqual(["PAGAMENTO FATURA"]);
    const forced = await w.user.post(`/v1/open-finance/bank-transactions/${ignored[0].id}/import`, {});
    expect(forced.body.error.code).toBe("CARD_CREDIT_NOT_IMPORTABLE");
  });

  it("conexão com erro no banco: marca ERROR e avisa o usuário (uma vez por dia)", async () => {
    const { w, itemId, connectionId } = await connected();
    provider.items.get(itemId)!.status = "ERROR";
    provider.items.get(itemId)!.errorCode = "LOGIN_ERROR";
    const res = await w.user.post(`/v1/open-finance/connections/${connectionId}/sync`);
    expect(res.body).toMatchObject({ status: "ERROR", newTransactions: 0 });
    await w.user.post(`/v1/open-finance/connections/${connectionId}/sync`);
    const conn = (await w.user.get("/v1/open-finance/connections")).body.data[0];
    expect(conn).toMatchObject({ status: "ERROR", lastErrorCode: "LOGIN_ERROR" });
    const fails = (await w.user.get("/v1/notifications")).body.data.filter((n: any) => n.type === "SYNC_FAILED");
    expect(fails).toHaveLength(1);
    // recuperou
    provider.items.get(itemId)!.status = "ACTIVE";
    provider.items.get(itemId)!.errorCode = null;
    expect((await w.user.post(`/v1/open-finance/connections/${connectionId}/sync`)).body.status).toBe("ACTIVE");
  });
});

describe("revogação", () => {
  it("remover a conexão encerra no provedor, apaga o que não foi aproveitado e mantém os lançamentos", async () => {
    const { w, itemId, connectionId } = await connected([{ description: "A" }, { description: "B" }]);
    await w.user.post(`/v1/open-finance/connections/${connectionId}/sync`);
    const [a] = (await w.user.get("/v1/open-finance/bank-transactions")).body.data;
    const imported = (await w.user.post(`/v1/open-finance/bank-transactions/${a.id}/import`, {})).body.transactionId;

    const res = await w.user.delete(`/v1/open-finance/connections/${connectionId}`);
    expect(res.status).toBe(200);
    expect(provider.deleted).toContain(itemId);
    expect((await w.user.get("/v1/open-finance/connections")).body.data).toHaveLength(0);
    expect((await w.user.get("/v1/open-finance/bank-transactions")).body.data).toHaveLength(0);
    expect((await w.user.get(`/v1/transactions/${imported}`)).status).toBe(200);
    expect(await env.prisma.bankTransaction.count({ where: { connectionId, status: { in: ["NEW", "IGNORED"] } } })).toBe(0);
    expect((await w.user.post(`/v1/open-finance/connections/${connectionId}/sync`)).status).toBe(404);
    // repetir é inofensivo (idempotente)
    expect((await w.user.delete(`/v1/open-finance/connections/${connectionId}`)).status).toBe(200);
    const audit = await env.prisma.auditLog.findFirst({ where: { actorId: w.user.id, action: "open_finance.revoked" } });
    expect(audit).not.toBeNull();
  });

  it("se o provedor falhar, a revogação fica pendente e o job conclui depois", async () => {
    const { w, itemId, connectionId } = await connected();
    provider.failDelete = true;
    const res = await w.user.delete(`/v1/open-finance/connections/${connectionId}`);
    provider.failDelete = false;
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("REVOKE_PENDING");
    expect(await env.prisma.bankConnection.findUnique({ where: { id: connectionId } })).toMatchObject({ revokedAt: null, lastErrorCode: "REVOKE_PENDING" });

    const out = await runOpenFinanceJob(env.app.openFinance!.deps, { userIds: [w.user.id] });
    expect(out.revoked).toBeGreaterThanOrEqual(1);
    expect(provider.deleted).toContain(itemId);
    expect((await env.prisma.bankConnection.findUnique({ where: { id: connectionId } }))?.revokedAt).not.toBeNull();
  });

  it("retirar o consentimento de Open Finance revoga todas as conexões", async () => {
    const { w, itemId } = await connected();
    const res = await w.user.post("/v1/privacy/consents", { ...CONSENT, granted: false });
    expect(res.status).toBe(200);
    expect(provider.deleted).toContain(itemId);
    expect((await w.user.get("/v1/open-finance/connections")).body.data).toHaveLength(0);
    expect((await w.user.post("/v1/open-finance/connect-token", {})).body.error.code).toBe("OPEN_FINANCE_CONSENT_REQUIRED");
  });

  it("excluir a conta encerra as conexões no provedor antes de apagar tudo", async () => {
    const { w, itemId, connectionId } = await connected([{ description: "A" }]);
    const res = await w.user.delete("/v1/me", { body: { password: w.user.password, confirm: "EXCLUIR" } });
    expect(res.status).toBe(200);
    expect(provider.deleted).toContain(itemId);
    expect(await env.prisma.bankConnection.count({ where: { id: connectionId } })).toBe(0);
    expect(await env.prisma.bankTransaction.count({ where: { userId: w.user.id } })).toBe(0);
  });

  it("se o provedor falhar ao excluir a conta, nada é apagado (o job retoma)", async () => {
    const { w, itemId, connectionId } = await connected();
    provider.failDelete = true;
    const res = await w.user.delete("/v1/me", { body: { password: w.user.password, confirm: "EXCLUIR" } });
    provider.failDelete = false;
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await env.prisma.bankConnection.count({ where: { id: connectionId } })).toBe(1);
    expect(provider.deleted).not.toContain(itemId);
    // limpeza: este usuário ficou "em exclusão" de propósito
    await env.prisma.user.delete({ where: { id: w.user.id } });
  });
});

describe("webhook do provedor", () => {
  const hook = (body: unknown, headers: Record<string, string> = { "x-webhook-secret": WEBHOOK_SECRET }) =>
    env.anon.post("/v1/webhooks/pluggy", body, { headers });

  it("recusa sem segredo ou com segredo errado (antes de ler o corpo)", async () => {
    expect((await hook({ event: "item/updated" }, {})).status).toBe(401);
    expect((await hook({ event: "item/updated" }, { "x-webhook-secret": "errado" })).status).toBe(401);
    expect((await hook("lixo", { "x-webhook-secret": "errado" })).status).toBe(401);
  });

  it("evento de item sincroniza a conexão; repetido (mesmo eventId) é ignorado", async () => {
    const { w, itemId, accountId, connectionId } = await connected();
    provider.addTransactions(accountId, [{ description: "NOVA DO WEBHOOK", amountCents: 4_200 }]);
    const eventId = `evt-${Date.now()}`;
    const res = await hook({ event: "item/updated", eventId, itemId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, duplicate: false });
    await env.app.openFinance!.idle();
    const list = (await w.user.get("/v1/open-finance/bank-transactions")).body.data;
    expect(list.map((t: any) => t.description)).toEqual(["NOVA DO WEBHOOK"]);
    const stored = await env.prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: "PLUGGY", eventId } } });
    expect(stored?.processedAt).not.toBeNull();
    expect(stored?.error).toBeNull();

    provider.addTransactions(accountId, [{ description: "NAO DEVE ENTRAR" }]);
    const dup = await hook({ event: "item/updated", eventId, itemId });
    expect(dup.body).toEqual({ ok: true, duplicate: true });
    await env.app.openFinance!.idle();
    expect((await w.user.get("/v1/open-finance/bank-transactions")).body.data).toHaveLength(1);
    void connectionId;
  });

  it("transactions/created também dispara a sincronização", async () => {
    const { w, itemId, accountId } = await connected();
    provider.addTransactions(accountId, [{ description: "VIA TRANSACTIONS" }]);
    await hook({ event: "transactions/created", eventId: `evt-${Math.random()}`, itemId, accountId });
    await env.app.openFinance!.idle();
    expect((await w.user.get("/v1/open-finance/bank-transactions")).body.data).toHaveLength(1);
  });

  it("item/error marca a conexão; item/deleted revoga localmente", async () => {
    const { w, itemId, connectionId } = await connected();
    await hook({ event: "item/error", eventId: `evt-${Math.random()}`, itemId, error: { code: "CONNECTION_ERROR" } });
    await env.app.openFinance!.idle();
    expect((await w.user.get("/v1/open-finance/connections")).body.data[0]).toMatchObject({ status: "ERROR", lastErrorCode: "CONNECTION_ERROR" });
    await hook({ event: "item/deleted", eventId: `evt-${Math.random()}`, itemId });
    await env.app.openFinance!.idle();
    expect((await w.user.get("/v1/open-finance/connections")).body.data).toHaveLength(0);
    expect((await env.prisma.bankConnection.findUnique({ where: { id: connectionId } }))?.status).toBe("REVOKED");
  });

  it("item desconhecido ou evento irrelevante: responde 200 e não faz nada", async () => {
    const res = await hook({ event: "item/updated", eventId: `evt-${Math.random()}`, itemId: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(200);
    expect((await hook({ event: "payment_intent/created", eventId: `evt-${Math.random()}` })).status).toBe(200);
    await env.app.openFinance!.idle();
  });

  it("webhook para conexão de usuário sem acesso ao recurso não sincroniza (cobrança ligada)", async () => {
    const paidProvider = new FakeOpenFinanceProvider();
    const paid = await createTestEnv({ OPEN_FINANCE_ENABLED: "true", BILLING_ENFORCED: "false" }, { openFinanceProvider: paidProvider });
    try {
      const w = await createWorld(paid);
      await w.user.post("/v1/privacy/consents", CONSENT);
      const { itemId, accountIds } = paidProvider.addItem(w.user.id, { accounts: [{ kind: "BANK", name: "CC", txs: [{ description: "X" }] }] });
      const reg = (await w.user.post("/v1/open-finance/connections", { itemId, autoImport: false })).body;
      await w.user.put(`/v1/open-finance/connections/${reg.id}/accounts/${accountIds[0]}`, { accountId: w.account.id });
      // simula o fim do teste grátis sem assinatura: liga a cobrança no runtime e deixa a conta antiga (teste de 30 dias vencido)
      paid.app.openFinance!.deps.access.billingEnforced = true;
      await paid.expireTrial(w.user.id);
      await paid.anon.post("/v1/webhooks/pluggy", { event: "item/updated", eventId: `evt-${Math.random()}`, itemId }, { headers: { "x-webhook-secret": WEBHOOK_SECRET } });
      await paid.app.openFinance!.idle();
      expect(await paid.prisma.bankTransaction.count({ where: { userId: w.user.id } })).toBe(0);
    } finally {
      await paid.close();
    }
  });
});

describe("job periódico", () => {
  it("atualiza conexões paradas há mais de 24 h e respeita o consentimento", async () => {
    const { w, accountId, connectionId } = await connected();
    provider.addTransactions(accountId, [{ description: "DO JOB" }]);
    await env.prisma.bankConnection.update({ where: { id: connectionId }, data: { lastSyncAt: new Date("2026-10-01T00:00:00Z") } });
    const out = await runOpenFinanceJob(env.app.openFinance!.deps, { userIds: [w.user.id] });
    expect(out.synced).toBeGreaterThanOrEqual(1);
    expect((await w.user.get("/v1/open-finance/bank-transactions")).body.data.map((t: any) => t.description)).toEqual(["DO JOB"]);
  });
});
