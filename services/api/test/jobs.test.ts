import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMaintenance } from "../src/jobs/maintenance";
import { localHour, runReminders } from "../src/jobs/reminders";
import { withJobLock } from "../src/jobs/scheduler";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { createWorld } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv(); // "hoje" = 2026-10-04, 12:00 em São Paulo
});
afterAll(async () => {
  await env.close();
});

const notifications = async (w: Awaited<ReturnType<typeof createWorld>>) =>
  (await w.user.get("/v1/notifications")).body.data as any[];

describe("lembretes de vencimento", () => {
  it("avisa de faturas, contas pendentes e recorrências que vencem em até 3 dias — uma vez só", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const card = (await w.user.post("/v1/cards", { name: "Nubank", limitCents: 500_000, closingDay: 28, dueDay: 6, payAccountId: w.account.id })).body;
    await w.user.post("/v1/transactions", {
      type: "EXPENSE", description: "Compra", amountCents: 45_000, occurredOn: "2026-09-20", cardId: card.id,
      categoryId: w.cat("expense.shopping").id,
    }); // vence 6/out (em 2 dias)
    await w.user.post("/v1/transactions", {
      type: "EXPENSE", description: "Conta de luz", amountCents: 18_990, occurredOn: "2026-10-05", accountId: w.account.id,
      categoryId: w.cat("expense.bills").id,
    }); // PENDING, vence amanhã
    await w.user.post("/v1/recurring", {
      type: "EXPENSE", description: "Aluguel", amountCents: 200_000, accountId: w.account.id, frequency: "MONTHLY",
      startDate: "2026-10-07", categoryId: w.cat("expense.housing").id,
    }); // em 3 dias
    await w.user.post("/v1/recurring", {
      type: "EXPENSE", description: "Escola", amountCents: 50_000, accountId: w.account.id, frequency: "MONTHLY",
      startDate: "2026-10-20", categoryId: w.cat("expense.education").id,
    }); // longe: não avisa

    const run = await runReminders(env.prisma, env.now(), { notifier: env.app.notifier });
    expect(run.created).toBeGreaterThanOrEqual(3);

    const list = await notifications(w);
    const bodies = list.map((n) => n.body).sort();
    expect(bodies).toEqual([
      "A fatura do Nubank vence em 2 dias (R$ 450,00).",
      "Aluguel (R$ 2.000,00) vence em 3 dias.",
      "Conta de luz (R$ 189,90) vence amanhã.",
    ]);
    expect(list.map((n) => n.type).sort()).toEqual(["BILL_DUE", "BILL_DUE", "INVOICE_DUE"]);

    // segunda execução não repete
    await runReminders(env.prisma, env.now(), { notifier: env.app.notifier });
    expect(await notifications(w)).toHaveLength(3);
  });

  it("fatura paga não gera lembrete", async () => {
    const w = await createWorld(env, { opening: 100_000 });
    const card = (await w.user.post("/v1/cards", { name: "Cartão", limitCents: 500_000, closingDay: 28, dueDay: 6, payAccountId: w.account.id })).body;
    await w.user.post("/v1/transactions", {
      type: "EXPENSE", description: "Compra", amountCents: 10_000, occurredOn: "2026-09-20", cardId: card.id,
    });
    const [inv] = (await w.user.get(`/v1/cards/${card.id}/invoices`)).body.data;
    await w.user.post(`/v1/cards/${card.id}/invoices/${inv.id}/payments`, { accountId: w.account.id });
    await runReminders(env.prisma, env.now(), { notifier: env.app.notifier });
    expect(await notifications(w)).toHaveLength(0);
  });

  it("respeita a preferência do usuário e o horário de silêncio (madrugada)", async () => {
    const quiet = await createTestEnv();
    try {
      const w = await createWorld(quiet);
      await w.user.post("/v1/transactions", {
        type: "EXPENSE", description: "Boleto", amountCents: 5_000, occurredOn: "2026-10-05", accountId: w.account.id,
      });
      // 3h da manhã em São Paulo = 06:00 UTC
      quiet.setNow("2026-10-04T06:00:00.000Z");
      await runReminders(quiet.prisma, quiet.now(), { notifier: quiet.app.notifier });
      expect(await notifications(w)).toHaveLength(0);

      // desliga a preferência e roda em horário normal
      await w.user.patch("/v1/me", { notificationPrefs: { billsDue: false } });
      quiet.setNow("2026-10-04T15:00:00.000Z");
      await runReminders(quiet.prisma, quiet.now(), { notifier: quiet.app.notifier });
      expect(await notifications(w)).toHaveLength(0);

      // liga de volta
      await w.user.patch("/v1/me", { notificationPrefs: { billsDue: true } });
      await runReminders(quiet.prisma, quiet.now(), { notifier: quiet.app.notifier });
      expect(await notifications(w)).toHaveLength(1);
    } finally {
      await quiet.close();
    }
  });

  it("calcula a hora local por fuso", () => {
    const at = new Date("2026-10-04T15:00:00Z");
    expect(localHour("America/Sao_Paulo", at)).toBe(12);
    expect(localHour("America/Manaus", at)).toBe(11);
    expect(localHour("Asia/Tokyo", at)).toBe(0);
  });

  it("usuários suspensos ou isolados: lembretes só vão para o dono", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    await a.user.post("/v1/transactions", { type: "EXPENSE", description: "Só do A", amountCents: 100, occurredOn: "2026-10-05", accountId: a.account.id });
    await runReminders(env.prisma, env.now(), { notifier: env.app.notifier });
    expect(await notifications(a)).toHaveLength(1);
    expect(await notifications(b)).toHaveLength(0);
  });
});

describe("manutenção e retenção", () => {
  it("apaga só o que passou da retenção e preserva dados financeiros", async () => {
    const w = await createWorld(env);
    const old = new Date("2026-01-01T00:00:00Z"); // bem anterior a "hoje" (2026-10-04)
    await w.expense();
    await env.prisma.idempotencyKey.create({ data: { userId: w.user.id, key: "chave-velha-0001", createdAt: old } });
    await env.prisma.idempotencyKey.create({ data: { userId: w.user.id, key: "chave-nova-00001", createdAt: env.now() } });
    await env.prisma.webhookEvent.create({ data: { provider: "PLUGGY", eventId: "velho", eventType: "x", payload: {}, receivedAt: old } });
    await env.prisma.webhookEvent.create({ data: { provider: "PLUGGY", eventId: "novo", eventType: "x", payload: {}, receivedAt: env.now() } });
    await env.prisma.auditLog.create({ data: { action: "teste.velho", createdAt: old } });
    await env.prisma.auditLog.create({ data: { action: "teste.novo", createdAt: env.now() } });
    await env.prisma.notification.create({ data: { userId: w.user.id, type: "SYSTEM", title: "velha", body: "x", readAt: old, createdAt: old } });
    await env.prisma.notification.create({ data: { userId: w.user.id, type: "SYSTEM", title: "não lida", body: "x", createdAt: old } });

    const result = await runMaintenance(env.prisma, env.now());
    expect(result.idempotencyKeys).toBeGreaterThanOrEqual(1);
    expect(result.webhookEvents).toBeGreaterThanOrEqual(1);
    expect(result.auditLogs).toBeGreaterThanOrEqual(1);
    expect(result.notifications).toBeGreaterThanOrEqual(1);

    expect(await env.prisma.idempotencyKey.count({ where: { key: "chave-velha-0001" } })).toBe(0);
    expect(await env.prisma.idempotencyKey.count({ where: { key: "chave-nova-00001" } })).toBe(1);
    expect(await env.prisma.webhookEvent.count({ where: { eventId: "novo" } })).toBe(1);
    expect(await env.prisma.auditLog.count({ where: { action: "teste.novo" } })).toBe(1);
    expect(await env.prisma.notification.count({ where: { title: "velha" } })).toBe(0);
    expect(await env.prisma.notification.count({ where: { title: "não lida" } })).toBe(1);
    expect(await env.prisma.transaction.count({ where: { userId: w.user.id } })).toBe(1);
  });
});

describe("trava de jobs (múltiplas instâncias)", () => {
  it("só uma instância executa o job por vez", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const first = withJobLock(env.prisma, 9_999, async () => {
      order.push("primeira começou");
      await gate;
      order.push("primeira terminou");
    });
    await new Promise((r) => setTimeout(r, 300)); // garante que a primeira já pegou o lock
    const second = await withJobLock(env.prisma, 9_999, async () => {
      order.push("segunda rodou (não deveria)");
    });
    expect(second).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(order).toEqual(["primeira começou", "primeira terminou"]);

    // depois de liberado, volta a funcionar
    expect(await withJobLock(env.prisma, 9_999, async () => {})).toBe(true);
  });
});
