import { withUser } from "@app/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finalizeDeletions } from "../src/modules/privacy/service";
import { createTestEnv, type TestEnv, type TestUser } from "./helpers/env";
import { createWorld } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv(); // "hoje" = 2026-10-04; termos vigentes = 2026-10-01
});
afterAll(async () => {
  await env.close();
});

async function makeAdmin(): Promise<TestUser> {
  const admin = await env.newUser();
  await admin.get("/v1/me"); // provisiona
  await env.prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  env.app.users.invalidate(admin.id);
  return admin;
}

describe("consentimento (LGPD)", () => {
  it("sem aceite dos termos, dados financeiros ficam bloqueados; /me e privacidade continuam", async () => {
    const u = await env.newUser({ consent: false });
    expect((await u.get("/v1/me")).body.consentRequired).toBe(true);
    const blocked = await u.get("/v1/accounts");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("CONSENT_REQUIRED");
    expect((await u.get("/v1/transactions")).status).toBe(403);
    expect((await u.get("/v1/dashboard")).status).toBe(403);

    const before = (await u.get("/v1/privacy/consents")).body;
    expect(before.legalVersions).toEqual({ terms: "2026-10-01", privacy: "2026-10-01" });
    expect(before.current).toEqual([]);

    expect((await u.post("/v1/privacy/consents", { type: "TERMS", version: "2026-10-01", granted: true })).status).toBe(200);
    // ainda falta a Política de Privacidade
    expect((await u.get("/v1/accounts")).status).toBe(403);
    await u.post("/v1/privacy/consents", { type: "PRIVACY", version: "2026-10-01", granted: true });
    expect((await u.get("/v1/accounts")).status).toBe(200);
    expect((await u.get("/v1/me")).body.consentRequired).toBe(false);
  });

  it("recusa versão desatualizada e não deixa retirar Termos/Privacidade (só excluindo a conta)", async () => {
    const u = await env.newUser();
    await u.get("/v1/me");
    const old = await u.post("/v1/privacy/consents", { type: "TERMS", version: "2020-01-01", granted: true });
    expect(old.status).toBe(422);
    expect(old.body.error.code).toBe("OUTDATED_VERSION");
    expect(old.body.error.details.expectedVersion).toBe("2026-10-01");
    const revoke = await u.post("/v1/privacy/consents", { type: "PRIVACY", version: "2026-10-01", granted: false });
    expect(revoke.body.error.code).toBe("CANNOT_REVOKE_REQUIRED");
  });

  it("marketing e Open Finance: concede e revoga a qualquer momento", async () => {
    const u = await env.newUser();
    await u.get("/v1/me");
    const granted = await u.post("/v1/privacy/consents", { type: "MARKETING", version: "2026-10-01", granted: true });
    expect(granted.body.current.find((c: any) => c.type === "MARKETING").revokedAt).toBeNull();
    const revoked = await u.post("/v1/privacy/consents", { type: "MARKETING", version: "2026-10-01", granted: false });
    expect(revoked.body.current.find((c: any) => c.type === "MARKETING").revokedAt).toBeTruthy();
    expect((await u.get("/v1/accounts")).status).toBe(200);
  });

  it("nova versão dos termos exige novo aceite", async () => {
    const v2 = await createTestEnv({ LEGAL_TERMS_VERSION: "2027-01-01" });
    try {
      // usuário aceitou a versão antiga (2026-10-01) no cadastro
      const u = await v2.newUser();
      await v2.prisma.consent.deleteMany({ where: { userId: u.id } });
      await u.get("/v1/me");
      await v2.prisma.consent.updateMany({ where: { userId: u.id, type: "TERMS" }, data: { version: "2026-10-01" } });
      v2.app.users.invalidate(u.id);
      const gate = await u.get("/v1/accounts");
      expect(gate.status).toBe(403);
      expect(gate.body.error.code).toBe("CONSENT_REQUIRED");
      await u.post("/v1/privacy/consents", { type: "TERMS", version: "2027-01-01", granted: true });
      expect((await u.get("/v1/accounts")).status).toBe(200);
    } finally {
      await v2.close();
    }
  });

  it("registra o aceite feito no cadastro como consentimento", async () => {
    const res = await env.anon.post("/v1/auth/register", {
      email: "cadastro-lgpd@teste.dev", password: "senhaForte123", acceptTerms: true, acceptPrivacy: true,
      termsVersion: "2026-10-01", privacyVersion: "2026-10-01", marketingOptIn: true,
    });
    const token = res.body.session.accessToken;
    const consents = (await env.anon.get("/v1/privacy/consents", { token })).body.current.map((c: any) => c.type).sort();
    expect(consents).toEqual(["MARKETING", "PRIVACY", "TERMS"]);
  });
});

describe("exportação dos dados", () => {
  it("entrega tudo do usuário em JSON, sem dados de outros e sem credenciais", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    await a.expense({ description: "Minha despesa", amountCents: 1234 });
    await b.expense({ description: "Despesa do outro" });
    await a.user.post("/v1/goals", { name: "Minha meta", targetCents: 5000 });

    const res = await a.user.get("/v1/privacy/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("meus-dados.json");
    expect(res.headers["cache-control"]).toBe("no-store");
    const doc = res.body;
    expect(doc.format).toBe("financa-export-v1");
    expect(doc.account).toEqual({ id: a.user.id, email: a.user.email });
    expect(doc.data.transactions.map((t: any) => t.description)).toEqual(["Minha despesa"]);
    expect(doc.data.transactions[0].amountCents).toBe(1234);
    expect(doc.data.categories).toHaveLength(17);
    expect(doc.data.goals[0].name).toBe("Minha meta");
    expect(doc.data.consents.map((c: any) => c.type).sort()).toEqual(["PRIVACY", "TERMS"]);

    const text = JSON.stringify(doc);
    expect(text).not.toContain("Despesa do outro");
    expect(text).not.toContain(b.user.id);
    expect(text).not.toMatch(/password|senha|token|secret/i);
    // sem userId repetido em cada linha
    expect(doc.data.transactions[0].userId).toBeUndefined();

    const requests = (await a.user.get("/v1/privacy/requests")).body.data;
    expect(requests[0]).toMatchObject({ type: "EXPORT", status: "COMPLETED" });
  });

  it("limita a 3 exportações por hora", async () => {
    const limited = await createTestEnv({ RATE_LIMIT_ENABLED: "true" });
    try {
      const u = await limited.newUser();
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await u.get("/v1/privacy/export")).status);
      expect(statuses).toEqual([200, 200, 200, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe("exclusão de conta", () => {
  it("exige a senha e a confirmação", async () => {
    const w = await createWorld(env);
    const wrong = await w.user.delete("/v1/me", { body: { password: "errada", confirm: "EXCLUIR" } });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe("WRONG_PASSWORD");
    expect((await w.user.delete("/v1/me", { body: { password: w.user.password, confirm: "talvez" } })).status).toBe(422);
    expect((await w.user.delete("/v1/me", { body: { password: w.user.password } })).status).toBe(422);
    expect(await env.prisma.user.count({ where: { id: w.user.id } })).toBe(1);
  });

  it("apaga a conta no provedor e TODOS os dados locais; mantém só a prova do pedido", async () => {
    const w = await createWorld(env);
    const other = await createWorld(env);
    await w.income({ amountCents: 5000 });
    await w.expense();
    await w.user.post("/v1/goals", { name: "Meta", targetCents: 1000 });
    const card = (await w.user.post("/v1/cards", { name: "Cartão", limitCents: 100_000, closingDay: 5, dueDay: 12 })).body;
    await w.user.post("/v1/transactions", {
      type: "EXPENSE", description: "No cartão", amountCents: 1000, occurredOn: "2026-10-03", cardId: card.id,
    });
    await w.user.post("/v1/budgets", { categoryId: w.cat("expense.food").id, month: "2026-10", amountCents: 9000 });
    await w.user.post("/v1/me/push-tokens", { expoToken: "ExponentPushToken[delete-me-xxxxxx]", platform: "IOS" });
    await other.expense();

    const res = await w.user.delete("/v1/me", { body: { password: w.user.password, confirm: "EXCLUIR" } });
    expect(res.status).toBe(200);
    expect(env.auth.deletedUserIds).toContain(w.user.id);

    // nenhuma tabela com user_id guarda dados dele
    const tables = await env.prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'user_id'`;
    for (const { table_name } of tables) {
      const [row] = await env.prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${table_name}" WHERE user_id = $1::uuid`, w.user.id,
      );
      expect(row?.n, `tabela ${table_name}`).toBe(0);
    }
    expect(await env.prisma.user.count({ where: { id: w.user.id } })).toBe(0);

    // prova do atendimento, sem dado pessoal; auditoria sem FK
    const proof = await env.prisma.privacyRequest.findMany({ where: { userId: null, type: "DELETE", status: "COMPLETED" } });
    expect(proof.length).toBeGreaterThanOrEqual(1);
    expect(await env.prisma.auditLog.count({ where: { action: "account.deleted", entityId: w.user.id } })).toBe(1);

    // dados de outro usuário intactos
    expect(await env.prisma.transaction.count({ where: { userId: other.user.id } })).toBe(1);
  });

  it("o token antigo não ressuscita a conta excluída", async () => {
    const w = await createWorld(env);
    await w.user.delete("/v1/me", { body: { password: w.user.password, confirm: "EXCLUIR" } });
    const again = await w.user.get("/v1/me"); // JWT ainda é válido criptograficamente
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe("ACCOUNT_DELETED");
    expect(await env.prisma.user.count({ where: { id: w.user.id } })).toBe(0);
  });

  it("se o provedor falhar, nada é apagado, a conta fica bloqueada e o job retoma depois", async () => {
    const w = await createWorld(env);
    await w.expense();
    env.auth.failDelete = true;
    const failed = await w.user.delete("/v1/me", { body: { password: w.user.password, confirm: "EXCLUIR" } });
    env.auth.failDelete = false;
    expect(failed.status).toBe(502);
    expect(await env.prisma.user.count({ where: { id: w.user.id } })).toBe(1);
    expect(await env.prisma.transaction.count({ where: { userId: w.user.id } })).toBe(1);
    expect((await env.prisma.user.findUnique({ where: { id: w.user.id } }))?.status).toBe("DELETING");

    // enquanto isso a conta não pode ser usada
    env.app.users.invalidate(w.user.id);
    expect((await w.user.get("/v1/me")).body.error.code).toBe("ACCOUNT_DELETING");

    // o job de retomada conclui a exclusão
    const done = await finalizeDeletions(
      { prisma: env.prisma, authProvider: env.auth, pepper: "p".repeat(16), now: () => new Date(Date.now() + 3_600_000) },
      0,
    );
    expect(done).toBeGreaterThanOrEqual(1);
    expect(await env.prisma.user.count({ where: { id: w.user.id } })).toBe(0);
    expect(await env.prisma.transaction.count({ where: { userId: w.user.id } })).toBe(0);
  });
});

describe("administração", () => {
  it("só administradores acessam (401 sem login, 403 para usuário comum)", async () => {
    const common = await createWorld(env);
    for (const path of ["/v1/admin/users", "/v1/admin/stats", "/v1/admin/integrations", "/v1/admin/issues"]) {
      expect((await env.anon.get(path)).status).toBe(401);
      const res = await common.user.get(path);
      expect(res.status).toBe(403);
    }
    expect((await common.user.patch(`/v1/admin/users/${common.user.id}`, { status: "SUSPENDED" })).status).toBe(403);
  });

  it("lista, busca e pagina usuários sem expor dados financeiros nem segredos", async () => {
    const admin = await makeAdmin();
    const target = await createWorld(env, { email: "alvo-admin@teste.dev" });
    await target.expense({ description: "Dado financeiro sensível", amountCents: 987_654 });

    await env.prisma.profile.update({ where: { userId: target.user.id }, data: { displayName: "Maria Alvo Silva" } });
    await env.prisma.bankConnection.create({
      data: { userId: target.user.id, provider: "PLUGGY", providerItemId: `item-detail-${Date.now()}`, institutionName: "Banco Secreto S.A.", status: "ACTIVE" },
    });

    const found = await admin.get("/v1/admin/users", { query: { search: "ALVO-ADMIN" } });
    expect(found.body.data).toHaveLength(1);
    expect(found.body.data[0]).toMatchObject({ email: "alvo-admin@teste.dev", displayName: "Maria Alvo Silva", role: "USER", status: "ACTIVE", plan: "FREE", onboardingCompleted: false });

    // A busca também acha pelo nome (sem diferenciar maiúsculas).
    const byName = await admin.get("/v1/admin/users", { query: { search: "maria alvo" } });
    expect(byName.body.data.map((u: any) => u.id)).toEqual([target.user.id]);

    const detail = (await admin.get(`/v1/admin/users/${target.user.id}`)).body;
    expect(detail).toMatchObject({ id: target.user.id, displayName: "Maria Alvo Silva", themePreset: "system" });

    // Contrato fechado: só estes campos, nunca nada financeiro ou bancário (contagens, bancos conectados...).
    expect(Object.keys(detail).sort()).toEqual(
      ["createdAt", "displayName", "email", "id", "lastSeenAt", "onboardingCompleted", "plan", "role", "status", "themePreset"].sort(),
    );
    expect(Object.keys(found.body.data[0]).sort()).toEqual(
      ["createdAt", "displayName", "email", "id", "lastSeenAt", "onboardingCompleted", "plan", "role", "status"].sort(),
    );

    const everything = JSON.stringify([found.body, detail]);
    expect(everything).not.toContain("Dado financeiro sensível");
    expect(everything).not.toContain("987654");
    expect(everything).not.toContain("Banco Secreto");
    expect(everything).not.toMatch(/password|senha|secret|token|service-key|anon-key|bankConnections|institution|counts|balance|amountCents/i);

    // Ler a lista e o detalhe de usuários deixa rastro na auditoria (sem dados pessoais).
    const reads = await env.prisma.auditLog.findMany({ where: { actorId: admin.id, action: { in: ["admin.users.listed", "admin.user.viewed"] } } });
    expect(reads.map((a) => a.action)).toEqual(expect.arrayContaining(["admin.users.listed", "admin.user.viewed"]));
    const readsJson = JSON.stringify(reads, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(readsJson).not.toContain("alvo-admin@teste.dev");
    expect(readsJson).not.toContain("Maria Alvo");

    const page1 = await admin.get("/v1/admin/users", { query: { limit: "2" } });
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.page.hasMore).toBe(true);
    const page2 = await admin.get("/v1/admin/users", { query: { limit: "2", cursor: page1.body.page.nextCursor } });
    const ids1 = page1.body.data.map((u: any) => u.id);
    expect(page2.body.data.every((u: any) => !ids1.includes(u.id))).toBe(true);
    expect((await admin.get("/v1/admin/users/11111111-1111-4111-8111-111111111111")).status).toBe(404);
  });

  it("suspende e reativa usuários (auditado); protege administradores e a si mesmo", async () => {
    const admin = await makeAdmin();
    const target = await createWorld(env);
    const off = await admin.patch(`/v1/admin/users/${target.user.id}`, { status: "SUSPENDED" });
    expect(off.status).toBe(200);
    expect(off.body.status).toBe("SUSPENDED");
    expect((await target.user.get("/v1/me")).body.error.code).toBe("ACCOUNT_SUSPENDED");

    const on = await admin.patch(`/v1/admin/users/${target.user.id}`, { status: "ACTIVE" });
    expect(on.body.status).toBe("ACTIVE");
    expect((await target.user.get("/v1/me")).status).toBe(200);

    const audits = await env.prisma.auditLog.findMany({ where: { actorId: admin.id, entityId: target.user.id } });
    expect(audits.map((a) => a.action).sort()).toEqual(["admin.user.reactivated", "admin.user.suspended"]);

    expect((await admin.patch(`/v1/admin/users/${admin.id}`, { status: "SUSPENDED" })).body.error.code).toBe("SELF_ACTION");
    const other = await makeAdmin();
    expect((await admin.patch(`/v1/admin/users/${other.id}`, { status: "SUSPENDED" })).body.error.code).toBe("ADMIN_PROTECTED");
    expect((await admin.patch(`/v1/admin/users/${target.user.id}`, { status: "DELETING" })).status).toBe(422);
  });

  it("estatísticas, integrações e problemas — sem segredos", async () => {
    const admin = await makeAdmin();
    const w = await createWorld(env);
    await env.prisma.bankConnection.create({
      data: { userId: w.user.id, provider: "PLUGGY", providerItemId: `item-${Date.now()}`, institutionName: "Banco X", status: "ERROR", lastErrorCode: "LOGIN_FAILED" },
    });
    await env.prisma.webhookEvent.create({
      data: { provider: "PLUGGY", eventId: `evt-${Date.now()}`, eventType: "item/error", payload: {}, error: "falha ao processar" },
    });

    await env.prisma.profile.update({ where: { userId: w.user.id }, data: { onboardingCompletedAt: new Date(), appearance: { preset: "purple" } } });

    const stats = (await admin.get("/v1/admin/stats")).body;
    expect(stats.users.total).toBeGreaterThan(0);
    expect(stats.users.active).toBeGreaterThan(0);
    expect(stats.users.onboardingCompleted).toBeGreaterThanOrEqual(1);
    expect(stats.bankConnections.ERROR).toBeGreaterThanOrEqual(1);
    // Temas: quem escolheu pela tela Aparência conta pelo tema escolhido; quem nunca escolheu conta como "system".
    expect(stats.themes.purple).toBeGreaterThanOrEqual(1);
    expect(stats.themes.system).toBeGreaterThanOrEqual(1);
    expect(Object.values(stats.themes).reduce((a: number, b) => a + (b as number), 0)).toBe(await env.prisma.profile.count());

    const integrations = (await admin.get("/v1/admin/integrations")).body;
    expect(integrations.auth).toEqual({ provider: "supabase", configured: true });
    expect(integrations.openFinance).toMatchObject({ provider: "PLUGGY", enabled: false, configured: false });
    expect(integrations.openFinance.webhookErrorsLast24h).toBeGreaterThanOrEqual(1);
    expect(integrations.openFinance.topErrorCodes[0]).toMatchObject({ code: "LOGIN_FAILED" });
    expect(JSON.stringify(integrations)).not.toMatch(/service-key|anon-key|secret/i);

    const issues = (await admin.get("/v1/admin/issues")).body.data;
    expect(issues.map((i: any) => i.kind)).toEqual(expect.arrayContaining(["BANK_CONNECTION_ERROR", "WEBHOOK_ERROR"]));
    // O painel mostra que há um problema e o código, nunca qual banco.
    expect(JSON.stringify(issues)).not.toContain("Banco X");
    expect(issues.find((i: any) => i.kind === "BANK_CONNECTION_ERROR").summary).toBe("Conexão bancária: LOGIN_FAILED");
  });
});

describe("defesa em profundidade (RLS)", () => {
  it("mesmo esquecendo o filtro por user_id, a transação do usuário só enxerga os próprios dados", async () => {
    const a = await createWorld(env);
    const b = await createWorld(env);
    await a.expense({ description: "do A" });
    await b.expense({ description: "do B" });

    const seen = await withUser(env.prisma, a.user.id, (tx) => tx.transaction.findMany()); // sem where!
    expect(seen.map((t) => t.description)).toEqual(["do A"]);

    const updated = await withUser(env.prisma, a.user.id, (tx) => tx.transaction.updateMany({ data: { notes: "hack" } }));
    expect(updated.count).toBe(1);
    expect((await env.prisma.transaction.findFirst({ where: { userId: b.user.id } }))?.notes).toBeNull();

    // e não consegue gravar em nome de outro usuário
    await expect(
      withUser(env.prisma, a.user.id, (tx) =>
        tx.account.create({ data: { userId: b.user.id, name: "Invasora", type: "CHECKING" } }),
      ),
    ).rejects.toThrow();
  });

  it("papel da aplicação não lê auditoria nem webhooks", async () => {
    const a = await createWorld(env);
    await expect(withUser(env.prisma, a.user.id, (tx) => tx.auditLog.findMany())).rejects.toThrow();
    await expect(withUser(env.prisma, a.user.id, (tx) => tx.webhookEvent.findMany())).rejects.toThrow();
  });
});

describe("documentação OpenAPI", () => {
  it("gera a especificação a partir dos schemas, incluindo as rotas principais", async () => {
    const res = await env.anon.get("/openapi.json");
    expect(res.status).toBe(200);
    // rotas de coleção ("/") aparecem com barra final; funcionam das duas formas
    const paths = Object.keys(res.body.paths).map((p) => p.replace(/\/$/, ""));
    for (const p of ["/v1/auth/login", "/v1/transactions", "/v1/accounts", "/v1/cards", "/v1/budgets", "/v1/goals", "/v1/dashboard", "/v1/reports/cash-flow"]) {
      expect(paths).toContain(p);
    }
    expect(res.body.openapi).toMatch(/^3\./);
  });
});
