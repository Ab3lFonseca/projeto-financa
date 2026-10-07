import { BADGES, WELCOME_BADGE_ID, badgePoints } from "@app/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, DEFAULT_NOW, type TestEnv } from "./helpers/env";
import { createWorld } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});
beforeEach(() => env.setNow(DEFAULT_NOW));

const item = (body: any, id: string) => body.items.find((i: any) => i.id === id);
const badges = async (u: { get: (url: string) => Promise<any> }) => (await u.get("/v1/badges")).body;

describe("insígnias: contrato", () => {
  it("exige login e os Termos aceitos (mas não a assinatura paga)", async () => {
    expect((await env.anon.get("/v1/badges")).status).toBe(401);
    expect((await env.anon.post("/v1/badges/seen", {})).status).toBe(401);
    const noConsent = await env.newUser({ consent: false });
    await noConsent.get("/v1/me");
    const res = await noConsent.get("/v1/badges");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CONSENT_REQUIRED");
  });

  it("devolve TODAS as insígnias do catálogo (pelo menos 50), com valor, nível, datas e comemorações pendentes", async () => {
    const w = await createWorld(env);
    const res = await w.user.get("/v1/badges");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(BADGES.length);
    expect(BADGES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(res.body.items.map((i: any) => i.id))).toEqual(new Set(BADGES.map((b) => b.id)));
    for (const i of res.body.items) {
      expect(Number.isFinite(i.value), i.id).toBe(true);
      expect(i.level).toBeGreaterThanOrEqual(0);
      expect(i.level).toBeLessThanOrEqual(6);
      expect(i.earnedAt).toHaveLength(6);
      // as datas só existem até o nível ganho
      i.earnedAt.forEach((d: string | null, idx: number) => expect(d !== null, `${i.id} nível ${idx + 1}`).toBe(idx < i.level));
      expect(i.unseen.every((t: number) => t >= 1 && t <= i.level)).toBe(true);
    }
    expect(res.body.summary.total).toBe(BADGES.length);
  });
});

describe("boas-vindas: a primeira insígnia vem ao criar a conta", () => {
  it("quem acabou de criar a conta já ganha o Bronze de Boas-vindas, ainda não visto (o app comemora na tela)", async () => {
    const u = await env.newUser();
    await u.get("/v1/me");
    const res = await badges(u);
    const welcome = item(res, WELCOME_BADGE_ID);
    expect(welcome).toMatchObject({ level: 1, value: 1, unseen: [1] });
    expect(welcome.earnedAt[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.summary.unlocked).toBeGreaterThanOrEqual(1);
    expect(res.summary.points).toBeGreaterThanOrEqual(10);
  });

  it("avaliar de novo não duplica nem muda a data; só marcar como vista tira a comemoração pendente", async () => {
    const u = await env.newUser();
    await u.get("/v1/me");
    const first = item(await badges(u), WELCOME_BADGE_ID);
    const again = item(await badges(u), WELCOME_BADGE_ID);
    expect(again.earnedAt[0]).toBe(first.earnedAt[0]);
    expect(again.unseen).toEqual([1]); // continua pendente até a pessoa ver
    expect(await env.prisma.userBadge.count({ where: { userId: u.id, badgeId: WELCOME_BADGE_ID } })).toBe(1);

    expect((await u.post("/v1/badges/seen", {})).body).toEqual({ ok: true });
    const seen = await badges(u);
    expect(item(seen, WELCOME_BADGE_ID)).toMatchObject({ level: 1, unseen: [] });
    expect(seen.items.every((i: any) => i.unseen.length === 0)).toBe(true);
    expect(item(seen, WELCOME_BADGE_ID).earnedAt[0]).toBe(first.earnedAt[0]);
  });

  it("avaliações simultâneas não quebram nem duplicam (restrição única no banco)", async () => {
    const u = await env.newUser();
    await u.get("/v1/me");
    const results = await Promise.all([u.get("/v1/badges"), u.get("/v1/badges"), u.get("/v1/badges")]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await env.prisma.userBadge.count({ where: { userId: u.id, badgeId: WELCOME_BADGE_ID, tier: 1 } })).toBe(1);
  });

  it("marcar só algumas como vistas: as outras continuam pendentes; e ninguém marca as de outra pessoa", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    await a.expense();
    const before = await badges(a.user);
    const pending = before.items.filter((i: any) => i.unseen.length > 0).map((i: any) => i.id);
    expect(pending.length).toBeGreaterThan(1);
    await a.user.post("/v1/badges/seen", { ids: [WELCOME_BADGE_ID] });
    const after = await badges(a.user);
    expect(item(after, WELCOME_BADGE_ID).unseen).toEqual([]);
    expect(after.items.filter((i: any) => i.unseen.length > 0)).toHaveLength(pending.length - 1);

    await badges(b.user);
    await a.user.post("/v1/badges/seen", {}); // marca só as de A
    expect(item(await badges(b.user), WELCOME_BADGE_ID).unseen).toEqual([1]);
  });

  it("o tempo de conta sobe os níveis: conta antiga já nasce nos níveis altos (veterano ganha o Mestre)", async () => {
    const u = await env.newUser();
    await u.get("/v1/me");
    await env.expireTrial(u.id); // recua o cadastro para 2020
    const welcome = item(await badges(u), WELCOME_BADGE_ID);
    expect(welcome.level).toBe(6);
    expect(welcome.unseen).toEqual([1, 2, 3, 4, 5, 6]); // todos os níveis chegam de uma vez (o app resume)
    expect(welcome.value).toBeGreaterThan(730);
  });
});

describe("insígnias: o que cada atividade conta", () => {
  it("lançamentos, categorias, formas de pagamento e conta: contam do jeito prometido", async () => {
    const w = await createWorld(env);
    for (let i = 0; i < 10; i++) await w.expense({ description: `Compra ${i}`, notes: i < 3 ? "com observação" : undefined });
    await w.income({ amountCents: 300_000 });
    await w.expense({ paymentMethod: "DEBIT" });
    await w.expense({ paymentMethod: "CASH" });
    const res = await badges(w.user);
    expect(item(res, "scribe")).toMatchObject({ value: 13, level: 1 }); // 13 lançamentos manuais (Bronze em 10)
    expect(item(res, "expense-tracker").value).toBe(12);
    expect(item(res, "income-tracker").value).toBe(1);
    expect(item(res, "describer").value).toBe(3);
    expect(item(res, "payment-mix").value).toBe(3); // Pix, débito e dinheiro
    expect(item(res, "categorized").value).toBe(13);
    expect(item(res, "multi-account").value).toBe(1);
    expect(item(res, "big-day").value).toBe(13); // todos registrados hoje
    expect(item(res, "daily-streak").value).toBe(1);
    expect(item(res, "active-days").value).toBe(1);
    expect(item(res, "income-volume").value).toBe(300_000);
    expect(item(res, "single-income").value).toBe(300_000);
    expect(item(res, "category-variety").value).toBe(2); // alimentação e salário
    expect(item(res, "income-sources").value).toBe(1);
  });

  it("nunca tira: apagar os lançamentos baixa o número mas o nível ganho fica", async () => {
    const w = await createWorld(env);
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push((await w.expense({ description: `Item ${i}` })).id);
    expect(item(await badges(w.user), "scribe")).toMatchObject({ value: 10, level: 1 });
    for (const id of ids) expect((await w.user.delete(`/v1/transactions/${id}`)).status).toBeLessThan(300);
    const after = item(await badges(w.user), "scribe");
    expect(after.value).toBe(0);
    expect(after.level).toBe(1); // continua Bronze
    expect(after.earnedAt[0]).not.toBeNull();
  });

  it("metas e aportes", async () => {
    const w = await createWorld(env);
    const goal = (await w.user.post("/v1/goals", { name: "Viagem", kind: "TRAVEL", targetCents: 100_000, initialCents: 10_000 })).body;
    await w.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: 20_000 });
    await w.user.post(`/v1/goals/${goal.id}/contributions`, { amountCents: 5_000 });
    const res = await badges(w.user);
    expect(item(res, "dreamer")).toMatchObject({ value: 1, level: 1 });
    expect(item(res, "contributor").value).toBe(2);
    expect(item(res, "goal-vault").value).toBe(35_000);
    expect(item(res, "big-goal").value).toBe(100_000);
    expect(item(res, "achiever").value).toBe(0);
  });

  it("orçamento do mês corrente ainda não conta como 'respeitado' (só meses fechados); mês passado respeitado, sim", async () => {
    const w = await createWorld(env);
    const food = w.cat("expense.food");
    await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-10", amountCents: 100_000 });
    await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-09", amountCents: 50_000 });
    await w.expense({ amountCents: 30_000, occurredOn: "2026-09-10" });
    const res = await badges(w.user);
    expect(item(res, "planner").value).toBe(2);
    expect(item(res, "budget-months").value).toBe(2);
    expect(item(res, "budget-variety").value).toBe(1);
    expect(item(res, "in-limit").value).toBe(1); // setembro, com R$ 300 de R$ 500
    expect(item(res, "perfect-month").value).toBe(1);
  });

  it("estourar o orçamento do mês fecha sem o mês perfeito", async () => {
    const w = await createWorld(env);
    const food = w.cat("expense.food");
    await w.user.post("/v1/budgets", { categoryId: food.id, month: "2026-09", amountCents: 10_000 });
    await w.expense({ amountCents: 30_000, occurredOn: "2026-09-10" });
    const res = await badges(w.user);
    expect(item(res, "in-limit").value).toBe(0);
    expect(item(res, "perfect-month").value).toBe(0);
  });

  it("economia: meses fechados no azul contam; o mês corrente não", async () => {
    const w = await createWorld(env);
    await w.income({ amountCents: 500_000, occurredOn: "2026-08-05" });
    await w.expense({ amountCents: 300_000, occurredOn: "2026-08-10" });
    await w.income({ amountCents: 500_000, occurredOn: "2026-09-05" });
    await w.expense({ amountCents: 250_000, occurredOn: "2026-09-10" });
    await w.income({ amountCents: 500_000, occurredOn: "2026-10-02" }); // mês corrente: não entra
    const res = await badges(w.user);
    expect(item(res, "saver-months").value).toBe(2);
    expect(item(res, "blue-streak").value).toBe(2);
    expect(item(res, "saved-total").value).toBe(200_000 + 250_000);
    expect(item(res, "saving-rate").value).toBe(50);
    expect(item(res, "spend-down").value).toBe(1); // 3000 → 2500
    expect(item(res, "months-tracked").value).toBe(3);
  });

  it("segurança e primeiros passos refletem o que a pessoa fez", async () => {
    const w = await createWorld(env);
    const base = await badges(w.user);
    expect(item(base, "first-steps").value).toBeGreaterThanOrEqual(1); // já tem conta
    await w.expense();
    expect(item(await badges(w.user), "first-steps").value).toBeGreaterThan(item(base, "first-steps").value);
    const exported = await w.user.get("/v1/privacy/export");
    expect(exported.status).toBe(200);
    expect(item(await badges(w.user), "data-owner").value).toBe(1);
  });

  it("lançamentos gerados sozinhos (recorrência) não inflam o 'Anotador', mas contam em 'Tudo no automático'", async () => {
    const w = await createWorld(env);
    const rule = await w.user.post("/v1/recurring", {
      type: "EXPENSE", description: "Aluguel", amountCents: 100_000, accountId: w.account.id, categoryId: w.cat("expense.housing").id,
      paymentMethod: "TED_DOC", frequency: "MONTHLY", startDate: "2026-08-05",
    });
    expect(rule.status).toBe(201);
    await w.user.get("/v1/recurring"); // a listagem gera as ocorrências vencidas (ago, set e out)
    const res = await badges(w.user);
    expect(item(res, "autopilot").value).toBe(1); // uma regra ativa
    expect(item(res, "automated").value).toBeGreaterThanOrEqual(2); // ocorrências geradas sozinhas
    expect(item(res, "scribe").value).toBe(0); // o que o app lançou sozinho não conta como "anotado por você"
    expect(item(res, "expense-tracker").value).toBe(0);
  });
});

describe("insígnias: isolamento e exportação", () => {
  it("cada pessoa só enxerga o que é dela", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    for (let i = 0; i < 12; i++) await a.expense({ description: `A ${i}` });
    expect(item(await badges(a.user), "scribe").value).toBe(12);
    expect(item(await badges(b.user), "scribe").value).toBe(0);
  });

  it("entra na exportação dos dados (LGPD) e some junto com a conta (exclusão em cascata)", async () => {
    const w = await createWorld(env);
    await badges(w.user);
    const res = await w.user.get("/v1/privacy/export");
    expect(res.status).toBe(200);
    const exported = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
    expect(exported.data.badges.some((b: any) => b.badgeId === WELCOME_BADGE_ID && b.tier === 1)).toBe(true);
    expect(exported.data.badges[0]).not.toHaveProperty("userId");
    await env.prisma.user.delete({ where: { id: w.user.id } });
    expect(await env.prisma.userBadge.count({ where: { userId: w.user.id } })).toBe(0);
  });

  it("os pontos somam exatamente os níveis ganhos", async () => {
    const w = await createWorld(env);
    await w.expense();
    const res = await badges(w.user);
    expect(res.summary.points).toBe(badgePoints(res.items.map((i: any) => i.level)));
    expect(res.summary.tiersEarned).toBe(res.items.reduce((s: number, i: any) => s + i.level, 0));
    expect(res.summary.unlocked).toBe(res.items.filter((i: any) => i.level >= 1).length);
  });
});
