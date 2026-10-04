import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "../src/config";
import { DemoOpenFinanceProvider, demoItemIdFor, userIdFromDemoItem } from "../src/modules/open-finance/demo";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { createWorld } from "./helpers/factories";

const at = (iso: string) => new DemoOpenFinanceProvider(() => new Date(iso));

describe("id do item de demonstração", () => {
  it("é reversível, determinístico, diferente por usuário e um UUID válido", () => {
    for (let i = 0; i < 25; i++) {
      const user = randomUUID();
      const item = demoItemIdFor(user);
      expect(z.uuid().safeParse(item).success).toBe(true);
      expect(userIdFromDemoItem(item)).toBe(user);
      expect(demoItemIdFor(user)).toBe(item);
      expect(item).not.toBe(user);
    }
    expect(demoItemIdFor(randomUUID())).not.toBe(demoItemIdFor(randomUUID()));
  });

  it("recusa o que não é UUID", async () => {
    expect(userIdFromDemoItem("nao-e-uuid")).toBeNull();
    expect(await at("2026-10-04T12:00:00Z").getItem("123")).toBeNull();
  });

  it("o item pertence ao usuário que o gerou", async () => {
    const user = randomUUID();
    const item = await at("2026-10-04T12:00:00Z").getItem(demoItemIdFor(user));
    expect(item).toMatchObject({ clientUserId: user, isOpenFinance: true, status: "ACTIVE", partial: false, institutionName: "Banco Demo" });
  });
});

describe("dados simulados", () => {
  const NOW = "2026-10-04T12:00:00Z";

  it("transações: determinísticas, positivas, sem datas futuras e com ids estáveis", async () => {
    const p = at(NOW);
    const a = await p.listTransactions("demo-conta-corrente", "BANK", "2026-07-06");
    const b = await p.listTransactions("demo-conta-corrente", "BANK", "2026-07-06");
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(30);
    expect(new Set(a.map((t) => t.id)).size).toBe(a.length);
    expect(a.every((t) => t.amountCents > 0 && t.postedOn <= "2026-10-04" && t.postedOn >= "2026-07-06" && t.status === "POSTED")).toBe(true);
    expect(a.some((t) => t.description === "SALARIO EMPRESA XYZ" && t.direction === "CREDIT")).toBe(true);
    // uma janela menor é um subconjunto da maior (a mesma data gera as mesmas transações)
    const recent = await p.listTransactions("demo-conta-corrente", "BANK", "2026-09-20");
    expect(recent.every((t) => a.some((x) => x.id === t.id && x.amountCents === t.amountCents))).toBe(true);
  });

  it("um novo dia traz transações novas (atualização automática)", async () => {
    const today = await at("2026-10-04T12:00:00Z").listTransactions("demo-conta-corrente", "BANK", "2026-09-01");
    const later = await at("2026-10-10T12:00:00Z").listTransactions("demo-conta-corrente", "BANK", "2026-09-01");
    const ids = new Set(today.map((t) => t.id));
    expect(later.length).toBeGreaterThan(today.length);
    expect(today.every((t) => later.some((x) => x.id === t.id))).toBe(true);
    expect(later.filter((t) => !ids.has(t.id)).every((t) => t.postedOn > "2026-10-04")).toBe(true);
  });

  it("cartão: compras e pagamento da fatura; dados do banco coerentes", async () => {
    const p = at(NOW);
    const txs = await p.listTransactions("demo-cartao-gold", "CREDIT", "2026-07-06");
    expect(txs.some((t) => t.direction === "DEBIT")).toBe(true);
    expect(txs.some((t) => t.description === "PAGAMENTO FATURA" && t.direction === "CREDIT")).toBe(true);
    const [bank, card] = await p.listAccounts("x");
    expect(bank).toMatchObject({ kind: "BANK", credit: null });
    expect(card!.kind).toBe("CREDIT");
    const c = card!.credit!;
    expect(c.limitCents).toBe(800_000);
    expect(c.availableCents!).toBeLessThanOrEqual(c.limitCents!);
    expect(c.availableCents!).toBeGreaterThanOrEqual(0);
    expect(c.closeDate! < c.dueDate!).toBe(true);
    expect(c.closeDate! >= "2026-10-04").toBe(true);
    expect(card!.balanceCents).toBeGreaterThanOrEqual(0);
  });

  it("pagamento da fatura = total da fatura que fechou, na conta e no cartão; o devido do banco exclui o que já foi pago", async () => {
    const p = at("2026-10-04T12:00:00Z");
    const card = await p.listTransactions("demo-cartao-gold", "CREDIT", "2026-04-01");
    const bank = await p.listTransactions("demo-conta-corrente", "BANK", "2026-07-06");
    const spent = (from: string, to: string) => card.filter((t) => t.direction === "DEBIT" && t.postedOn >= from && t.postedOn <= to).reduce((s, t) => s + t.amountCents, 0);

    // fatura que fecha dia 10: compras de 11 do mês anterior a 10; paga dia 17 (agosto e setembro estão inteiras na janela)
    expect(card.find((t) => t.description === "PAGAMENTO FATURA" && t.postedOn === "2026-09-17")!.amountCents).toBe(spent("2026-08-11", "2026-09-10"));
    expect(card.find((t) => t.description === "PAGAMENTO FATURA" && t.postedOn === "2026-08-17")!.amountCents).toBe(spent("2026-07-11", "2026-08-10"));
    // o débito na conta é o mesmo valor, no mesmo dia
    for (const day of ["2026-08-17", "2026-09-17"]) {
      const debit = bank.find((t) => t.description === "PAGAMENTO FATURA CARTAO" && t.postedOn === day)!;
      expect(debit.direction).toBe("DEBIT");
      expect(debit.amountCents).toBe(card.find((t) => t.description === "PAGAMENTO FATURA" && t.postedOn === day)!.amountCents);
    }

    // em 4/out o devido é só o ciclo aberto (a fatura de setembro já foi paga em 17/set)
    const [, cardAccount] = await p.listAccounts("x");
    expect(cardAccount!.balanceCents).toBe(spent("2026-09-11", "2026-10-04"));
    // de 11 a 16 a fatura fechada ainda não foi paga e entra no devido; dia 17 o pagamento sai
    const later = await at("2026-10-17T12:00:00Z").listTransactions("demo-cartao-gold", "CREDIT", "2026-04-01");
    const spentLater = (from: string, to: string) => later.filter((t) => t.direction === "DEBIT" && t.postedOn >= from && t.postedOn <= to).reduce((s, t) => s + t.amountCents, 0);
    const on = async (iso: string) => (await at(`${iso}T12:00:00Z`).listAccounts("x"))[1]!.balanceCents;
    expect(await on("2026-10-12")).toBe(spentLater("2026-09-11", "2026-10-12"));
    expect(await on("2026-10-17")).toBe(spentLater("2026-10-11", "2026-10-17"));
  });

  it("investimentos: CDB, caixinha, porquinho, LCI e fundo; rendem com o passar dos dias", async () => {
    const day1 = await at("2026-10-04T12:00:00Z").listInvestments("x");
    const day2 = await at("2026-10-05T12:00:00Z").listInvestments("x");
    expect(day1.map((i) => i.name)).toEqual(["CDB Banco Demo 110% CDI", "Caixinha Viagem", "Meu Porquinho", "LCI Banco Demo 94% CDI", "Fundo DI Demo"]);
    expect(day1.find((i) => i.name === "Meu Porquinho")).toMatchObject({ subtype: "CDB", withdrawableCents: expect.any(Number), dueDate: null });
    expect(day1.find((i) => i.subtype === "LCI")!.withdrawableCents).toBeNull();
    for (const [i, inv] of day1.entries()) {
      expect(inv.profitCents).toBe(inv.balanceCents - inv.investedCents!);
      expect(inv.profitCents!).toBeGreaterThan(0);
      expect(day2[i]!.balanceCents).toBeGreaterThan(inv.balanceCents); // rende todo dia
      expect(day2[i]!.id).toBe(inv.id); // mesmo investimento
    }
    // CDB a 110% do CDI rende mais que o mesmo valor a 94%
    const cdb = day1[0]!;
    expect(cdb.balanceCents / cdb.investedCents!).toBeGreaterThan(1.03);
  });
});

describe("configuração", () => {
  it("o modo demonstração é proibido em produção", () => {
    const prod = { NODE_ENV: "production", DATABASE_URL: "postgres://x", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "b", IP_HASH_PEPPER: "pepper-pepper-pepper-123" };
    expect(() => loadConfig({ ...prod, OPEN_FINANCE_ENABLED: "true", OPEN_FINANCE_PROVIDER: "demo" })).toThrow(/OPEN_FINANCE_PROVIDER=demo é proibido em produção/);
    expect(() => loadConfig({ ...prod, OPEN_FINANCE_ENABLED: "false" })).not.toThrow();
    expect(loadConfig({ NODE_ENV: "development", DATABASE_URL: "postgres://x", OPEN_FINANCE_PROVIDER: "demo" }).OPEN_FINANCE_PROVIDER).toBe("demo");
    // com o Pluggy real ligado em produção, as credenciais continuam obrigatórias
    expect(() => loadConfig({ ...prod, OPEN_FINANCE_ENABLED: "true" })).toThrow(/PLUGGY_CLIENT_ID/);
  });
});

describe("fluxo completo pela API com o banco de demonstração", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ OPEN_FINANCE_ENABLED: "true", OPEN_FINANCE_PROVIDER: "demo" });
  });
  afterAll(async () => {
    await env.close();
  });

  it("conecta, cria conta e cartão, importa transações e mostra os investimentos", async () => {
    const w = await createWorld(env);
    await w.user.post("/v1/privacy/consents", { type: "OPEN_FINANCE", version: "2026-10-01", granted: true });

    expect((await w.user.get("/v1/open-finance/connectors")).body.data).toEqual([{ id: 9001, name: "Banco Demo (Open Finance)" }]);
    const token = (await w.user.post("/v1/open-finance/connect-token", {})).body;
    expect(token.accessToken).toMatch(/^demo:[0-9a-f-]{36}$/);

    const reg = await w.user.post("/v1/open-finance/connections", { itemId: token.accessToken.slice(5) });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    expect(reg.body).toMatchObject({ institutionName: "Banco Demo", autoImport: true, investmentCount: 5 });
    expect(reg.body.accounts[0].account).toBeTruthy();
    expect(reg.body.accounts[1].card).toBeTruthy();

    const inv = (await w.user.get("/v1/open-finance/investments")).body;
    expect(inv.summary.count).toBe(5);
    expect(inv.summary.profitCents).toBeGreaterThan(0);
    expect(inv.items.map((i: any) => i.name)).toContain("Meu Porquinho");
    expect(inv.groups.find((g: any) => g.key === "CDB")).toMatchObject({ label: "CDB", count: 3 });

    const txs = (await w.user.get("/v1/transactions", { query: { limit: 100 } })).body.data;
    expect(txs.length).toBeGreaterThan(30);
    const bankAccount = (await w.user.get("/v1/accounts")).body.data.find((a: any) => a.id === reg.body.accounts[0].account.id);
    expect(bankAccount.balanceCents).toBe(reg.body.accounts[0].balanceCents); // saldo do app = saldo do banco

    // o que o app calcula das faturas bate com o devido informado pelo banco (as pagas pela conta ficam quitadas)
    const cardId = reg.body.accounts[1].card.id;
    const overview = (await w.user.get("/v1/open-finance/overview")).body;
    const invoices = (await w.user.get(`/v1/cards/${cardId}/invoices`)).body.data;
    const owed = invoices.reduce((s: number, i: any) => s + i.remainingCents, 0);
    expect(owed).toBe(overview.cards[0].billCents);
    expect(invoices.filter((i: any) => i.status === "PAID").length).toBeGreaterThanOrEqual(1);

    // repetir não duplica
    const sync = await w.user.post(`/v1/open-finance/connections/${reg.body.id}/sync`);
    expect(sync.body).toMatchObject({ newTransactions: 0, investments: 5 });
  });

  it("não deixa conectar o item de demonstração de outro usuário", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    await b.user.post("/v1/privacy/consents", { type: "OPEN_FINANCE", version: "2026-10-01", granted: true });
    const res = await b.user.post("/v1/open-finance/connections", { itemId: demoItemIdFor(a.user.id) });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ITEM_NOT_OWNED");
  });
});
