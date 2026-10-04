import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDueRecurrences } from "../src/modules/recurring/service";
import { createTestEnv, DEFAULT_NOW, type TestEnv } from "./helpers/env";
import { createWorld, type World } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv(); // "hoje" = 2026-10-04
});
afterAll(async () => {
  await env.close();
});

describe("metas", () => {
  it("calcula progresso, restante e quanto guardar por mês até o prazo", async () => {
    const w = await createWorld(env);
    const created = await w.user.post("/v1/goals", {
      name: "Comprar carro", kind: "VEHICLE", targetCents: 5_000_000, initialCents: 1_850_000, deadline: "2027-10-04",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Comprar carro", kind: "VEHICLE", currentCents: 1_850_000, remainingCents: 3_150_000,
      progressPct: 37, status: "ACTIVE", deadline: "2027-10-04",
    });
    expect(created.body.monthlyNeededCents).toBe(Math.ceil(3_150_000 / 12));

    const noDeadline = await w.user.post("/v1/goals", { name: "Reserva", targetCents: 100_000 });
    expect(noDeadline.body.monthlyNeededCents).toBeNull();
  });

  it("aportes e resgates movem o valor; resgate maior que o guardado é recusado", async () => {
    const w = await createWorld(env);
    const goal = (await w.user.post("/v1/goals", { name: "Viagem", kind: "TRAVEL", targetCents: 100_000, initialCents: 10_000 })).body;
    let r = await w.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: 20_000, notes: "13º" });
    expect(r.status).toBe(201);
    expect(r.body.currentCents).toBe(30_000);
    r = await w.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: -5_000 });
    expect(r.body.currentCents).toBe(25_000);
    const tooMuch = await w.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: -25_001 });
    expect(tooMuch.body.error.code).toBe("WITHDRAWAL_TOO_LARGE");
    expect((await w.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: 0 })).status).toBe(422);

    const detail = (await w.user.get(`/v1/goals/${goal.id}`)).body;
    expect(detail.contributions.map((c: any) => c.amountCents).sort((a: number, b: number) => a - b)).toEqual([-5_000, 20_000]);
    const del = await w.user.delete(`/v1/goals/${goal.id}/contributions/${detail.contributions[0].id}`);
    expect(del.status).toBe(200);
  });

  it("notifica 25/50/75% e a conclusão, uma única vez cada; marca como ATINGIDA", async () => {
    const w = await createWorld(env);
    const goal = (await w.user.post("/v1/goals", { name: "Notebook", targetCents: 100_000 })).body;
    const add = (n: number) => w.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: n });
    await add(30_000); // 30% → marco 25
    await add(25_000); // 55% → marco 50
    await add(-20_000); // 35%
    await add(20_000); // volta a 55%: não repete o marco 50
    let list = (await w.user.get("/v1/notifications")).body.data;
    expect(list.filter((n: any) => n.type === "GOAL_PROGRESS")).toHaveLength(2);

    const last = (await add(50_000)).body; // 105% → conclui
    expect(last.status).toBe("ACHIEVED");
    expect(last.achievedAt).toBeTruthy();
    expect(last.progressPct).toBe(100);
    list = (await w.user.get("/v1/notifications")).body.data;
    expect(list.filter((n: any) => n.type === "GOAL_ACHIEVED")).toHaveLength(1);
    expect(list.find((n: any) => n.type === "GOAL_ACHIEVED").body).toContain("Notebook");

    // resgatar abaixo do alvo reabre a meta
    expect((await add(-60_000)).body.status).toBe("ACTIVE");
  });

  it("edita, arquiva e exclui; lista padrão esconde arquivadas", async () => {
    const w = await createWorld(env);
    const goal = (await w.user.post("/v1/goals", { name: "Casa", targetCents: 1_000_000 })).body;
    const upd = await w.user.put(`/v1/goals/${goal.id}`, { name: "Casa própria", targetCents: 2_000_000, kind: "HOME" });
    expect(upd.body).toMatchObject({ name: "Casa própria", targetCents: 2_000_000, kind: "HOME" });
    await w.user.put(`/v1/goals/${goal.id}`, { status: "ARCHIVED" });
    expect((await w.user.get("/v1/goals")).body.data).toHaveLength(0);
    expect((await w.user.get("/v1/goals", { query: { status: "ARCHIVED" } })).body.data).toHaveLength(1);
    expect((await w.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: 100 })).body.error.code).toBe("GOAL_ARCHIVED");
    expect((await w.user.delete(`/v1/goals/${goal.id}`)).status).toBe(200);
    expect((await w.user.get(`/v1/goals/${goal.id}`)).status).toBe(404);
  });

  it("rejeita prazo no passado e valor inválido", async () => {
    const w = await createWorld(env);
    expect((await w.user.post("/v1/goals", { name: "x", targetCents: 1000, deadline: "2026-10-04" })).body.error.code).toBe("DEADLINE_IN_PAST");
    expect((await w.user.post("/v1/goals", { name: "x", targetCents: 0 })).status).toBe(422);
  });

  it("isolamento entre usuários", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    const goal = (await a.user.post("/v1/goals", { name: "Segredo", targetCents: 1000 })).body;
    expect((await b.user.get(`/v1/goals/${goal.id}`)).status).toBe(404);
    expect((await b.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: 100 })).status).toBe(404);
    expect((await b.user.put(`/v1/goals/${goal.id}`, { name: "x" })).status).toBe(404);
    expect((await b.user.delete(`/v1/goals/${goal.id}`)).status).toBe(404);
    expect((await b.user.get("/v1/goals")).body.data).toHaveLength(0);
  });

  it("plano gratuito: no máximo 2 metas ativas", async () => {
    const billing = await createTestEnv({ BILLING_ENFORCED: "true" });
    try {
      const u = await billing.newUser();
      expect((await u.post("/v1/goals", { name: "A", targetCents: 1000 })).status).toBe(201);
      expect((await u.post("/v1/goals", { name: "B", targetCents: 1000 })).status).toBe(201);
      const third = await u.post("/v1/goals", { name: "C", targetCents: 1000 });
      expect(third.status).toBe(402);
      expect(third.body.error.code).toBe("PLAN_LIMIT_REACHED");
    } finally {
      await billing.close();
    }
  });
});

describe("recorrências", () => {
  const rent = (w: World, over: Record<string, unknown> = {}) =>
    w.user.post("/v1/recurring", {
      type: "EXPENSE",
      description: "Aluguel",
      amountCents: 200_000,
      accountId: w.account.id,
      categoryId: w.cat("expense.housing").id,
      paymentMethod: "TED_DOC",
      frequency: "MONTHLY",
      startDate: "2026-08-05",
      ...over,
    });

  const txsOf = async (w: World, ruleId?: string) =>
    ((await w.user.get("/v1/transactions", { query: { sort: "date_asc", limit: "100" } })).body.data as any[]).filter(
      (t) => (ruleId ? t.recurrenceId === ruleId : true),
    );

  it("gera as ocorrências devidas até hoje e agenda a próxima", async () => {
    const w = await createWorld(env);
    const res = await rent(w);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ frequency: "MONTHLY", dayOfMonth: 5, nextRunOn: "2026-10-05", lastRunOn: "2026-09-05", active: true });
    const txs = await txsOf(w, res.body.id);
    expect(txs.map((t) => [t.occurredOn, t.amountCents, t.status, t.description])).toEqual([
      ["2026-08-05", 200_000, "POSTED", "Aluguel"],
      ["2026-09-05", 200_000, "POSTED", "Aluguel"],
    ]);
    expect(txs[0].category.name).toBe("Moradia");
  });

  it("é idempotente: listar de novo não duplica", async () => {
    const w = await createWorld(env);
    const rule = (await rent(w)).body;
    await w.user.get("/v1/recurring");
    await w.user.get("/v1/recurring");
    await w.user.get("/v1/recurring/upcoming");
    expect(await txsOf(w, rule.id)).toHaveLength(2);
  });

  it("com o passar do tempo gera as novas ocorrências", async () => {
    const clock = await createTestEnv();
    try {
      const w = await createWorld(clock);
      const rule = (await rent(w, { startDate: "2026-10-05" })).body;
      expect(await txsOf(w, rule.id)).toHaveLength(0); // ainda não venceu
      expect(rule.nextRunOn).toBe("2026-10-05");

      clock.setNow("2026-11-06T15:00:00.000Z");
      const list = (await w.user.get("/v1/recurring")).body.data;
      expect(list[0]).toMatchObject({ lastRunOn: "2026-11-05", nextRunOn: "2026-12-05" });
      expect((await txsOf(w, rule.id)).map((t) => t.occurredOn)).toEqual(["2026-10-05", "2026-11-05"]);
    } finally {
      await clock.close();
    }
  });

  it("dia 31 usa o último dia dos meses curtos", async () => {
    const w = await createWorld(env);
    const rule = (await rent(w, { startDate: "2026-07-31", description: "Condomínio" })).body;
    expect((await txsOf(w, rule.id)).map((t) => t.occurredOn)).toEqual(["2026-07-31", "2026-08-31", "2026-09-30"]);
    expect(rule.nextRunOn).toBe("2026-10-31");
  });

  it("respeita a data final e desativa a regra ao terminar", async () => {
    const w = await createWorld(env);
    const rule = (await rent(w, { startDate: "2026-07-10", endDate: "2026-09-10", description: "Parcelado" })).body;
    expect((await txsOf(w, rule.id)).map((t) => t.occurredOn)).toEqual(["2026-07-10", "2026-08-10", "2026-09-10"]);
    expect(rule.active).toBe(false);
  });

  it("não recria ocorrência que o usuário excluiu", async () => {
    const w = await createWorld(env);
    const rule = (await rent(w)).body;
    const [first] = await txsOf(w, rule.id);
    await w.user.delete(`/v1/transactions/${first.id}`);
    await w.user.get("/v1/recurring");
    expect((await txsOf(w, rule.id)).map((t) => t.occurredOn)).toEqual(["2026-09-05"]);
  });

  it("recorrência no cartão cai na fatura certa", async () => {
    const w = await createWorld(env);
    const card = (await w.user.post("/v1/cards", { name: "Cartão", limitCents: 500_000, closingDay: 5, dueDay: 12 })).body;
    const rule = (
      await w.user.post("/v1/recurring", {
        type: "EXPENSE", description: "Netflix", amountCents: 5_590, cardId: card.id,
        categoryId: w.cat("expense.subscriptions").id, frequency: "MONTHLY", startDate: "2026-09-03",
      })
    ).body;
    expect(rule.paymentMethod).toBe("CREDIT");
    // hoje é 4/out: já venceram 3/set e 3/out
    const txs = await txsOf(w, rule.id);
    expect(txs.map((t) => t.occurredOn)).toEqual(["2026-09-03", "2026-10-03"]);
    expect(txs.every((t) => t.invoiceId)).toBe(true);
    expect((await w.user.get(`/v1/cards/${card.id}`)).body.usedCents).toBe(2 * 5_590);
  });

  it("projeta as próximas ocorrências sem gravar", async () => {
    const w = await createWorld(env);
    await rent(w, { startDate: "2026-10-10", description: "Escola" });
    await rent(w, { startDate: "2026-10-20", description: "Academia", amountCents: 12_000 });
    // 4/out + 47 dias = 20/nov
    const up = (await w.user.get("/v1/recurring/upcoming", { query: { days: "47" } })).body.data;
    expect(up.map((u: any) => [u.date, u.description])).toEqual([
      ["2026-10-10", "Escola"],
      ["2026-10-20", "Academia"],
      ["2026-11-10", "Escola"],
      ["2026-11-20", "Academia"],
    ]);
    expect(await txsOf(w)).toHaveLength(0);
  });

  it("editar altera só as próximas ocorrências; pausar/retomar não recupera o período pausado", async () => {
    const clock = await createTestEnv();
    try {
      const w = await createWorld(clock);
      const rule = (await rent(w, { startDate: "2026-09-05" })).body; // gera 5/set
      await w.user.put(`/v1/recurring/${rule.id}`, { amountCents: 250_000, description: "Aluguel reajustado" });
      expect((await txsOf(w, rule.id))[0]).toMatchObject({ amountCents: 200_000, description: "Aluguel" });

      await w.user.put(`/v1/recurring/${rule.id}`, { active: false });
      clock.setNow("2027-01-10T15:00:00.000Z");
      await w.user.get("/v1/recurring");
      expect(await txsOf(w, rule.id)).toHaveLength(1); // pausada: nada novo

      const resumed = await w.user.put(`/v1/recurring/${rule.id}`, { active: true });
      expect(resumed.body.nextRunOn).toBe("2027-02-05"); // não gerou out/nov/dez/jan
      expect(resumed.body.active).toBe(true);
      const txs = await txsOf(w, rule.id);
      expect(txs).toHaveLength(1);
    } finally {
      await clock.close();
    }
  });

  it("valida conta/cartão, categoria e período; exclui sem apagar o histórico", async () => {
    const w = await createWorld(env);
    expect((await rent(w, { accountId: undefined })).status).toBe(422);
    expect((await rent(w, { categoryId: w.cat("income.salary").id })).body.error.code).toBe("CATEGORY_TYPE_MISMATCH");
    expect((await rent(w, { endDate: "2026-01-01" })).status).toBe(422);
    const rule = (await rent(w)).body;
    expect((await w.user.delete(`/v1/recurring/${rule.id}`)).status).toBe(200);
    expect((await w.user.get(`/v1/recurring/${rule.id}`)).status).toBe(404);
    expect(await txsOf(w, rule.id)).toHaveLength(2);
  });

  it("o job gera para todos os usuários, cada um no seu escopo", async () => {
    const clock = await createTestEnv();
    try {
      const a = await createWorld(clock);
      const b = await createWorld(clock);
      const ra = (await rent(a, { startDate: "2026-10-05", description: "Do A" })).body;
      const rb = (await rent(b, { startDate: "2026-10-05", description: "Do B", amountCents: 999 })).body;
      clock.setNow("2026-10-06T15:00:00.000Z");
      const result = await runDueRecurrences(clock.prisma, clock.now(), { notifier: clock.app.notifier });
      expect(result.generated).toBeGreaterThanOrEqual(2);
      expect((await txsOf(a, ra.id)).map((t) => t.description)).toEqual(["Do A"]);
      expect((await txsOf(b, rb.id)).map((t) => t.amountCents)).toEqual([999]);
      // rodar de novo não duplica
      await runDueRecurrences(clock.prisma, clock.now(), { notifier: clock.app.notifier });
      expect(await txsOf(a, ra.id)).toHaveLength(1);
    } finally {
      await clock.close();
    }
  });

  it("isolamento entre usuários", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    const rule = (await rent(a)).body;
    expect((await b.user.get(`/v1/recurring/${rule.id}`)).status).toBe(404);
    expect((await b.user.put(`/v1/recurring/${rule.id}`, { amountCents: 1 })).status).toBe(404);
    expect((await b.user.delete(`/v1/recurring/${rule.id}`)).status).toBe(404);
    expect((await b.user.get("/v1/recurring")).body.data).toHaveLength(0);
    const cross = await b.user.post("/v1/recurring", {
      type: "EXPENSE", description: "x", amountCents: 1, accountId: a.account.id, frequency: "MONTHLY", startDate: "2026-10-10",
    });
    expect(cross.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });
});

void DEFAULT_NOW;
