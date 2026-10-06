import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, DEFAULT_NOW, type TestEnv, type TestUser } from "./helpers/env";

const DAY = 86_400_000;

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({ BILLING_ENFORCED: "true", PASSWORD_RESET_REDIRECT_URL: "financa://reset-password" });
});
afterAll(async () => {
  await env.close();
});
beforeEach(() => env.setNow(DEFAULT_NOW));

async function member(o: { expired?: boolean } = {}): Promise<TestUser> {
  const u = await env.newUser();
  await u.get("/v1/me");
  if (o.expired) await env.expireTrial(u.id);
  return u;
}
async function makeAdmin(): Promise<TestUser> {
  const a = await member();
  await env.prisma.user.update({ where: { id: a.id }, data: { role: "ADMIN" } });
  env.app.users.invalidate(a.id);
  return a;
}
async function enableMfa(u: TestUser) {
  const enrolled = (await u.post("/v1/me/mfa/enroll")).body;
  const res = await u.post("/v1/me/mfa/enable", { factorId: enrolled.factorId, code: env.auth.codeFor(u.id, enrolled.factorId) });
  expect(res.status).toBe(200);
  return env.asUser(res.body, u.password);
}

describe("administrador: excluir usuário", () => {
  it("apaga a conta e TODOS os dados dela (como no pedido LGPD) e deixa a auditoria sem dado pessoal", async () => {
    const admin = await makeAdmin();
    const target = await member();
    await target.post("/v1/accounts", { name: "Conta corrente", type: "CHECKING", openingBalanceCents: 5_000 });
    const bystander = await member();
    await bystander.post("/v1/accounts", { name: "Conta de outra pessoa", type: "CHECKING", openingBalanceCents: 1_000 });

    const res = await admin.delete(`/v1/admin/users/${target.id}`, { body: { confirm: "EXCLUIR" } });
    expect(res.status).toBe(200);
    expect(env.auth.deletedUserIds).toContain(target.id);
    expect(await env.prisma.user.count({ where: { id: target.id } })).toBe(0);
    expect(await env.prisma.account.count({ where: { userId: target.id } })).toBe(0);
    expect(await env.prisma.account.count({ where: { userId: bystander.id } })).toBe(1);

    const rows = await env.prisma.auditLog.findMany({ where: { actorId: admin.id, action: "admin.user.deleted", entityId: target.id } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(target.email);
    // o token antigo da conta apagada não ressuscita nada
    expect((await target.get("/v1/me")).body.error.code).toBe("ACCOUNT_DELETED");
  });

  it("exige a palavra EXCLUIR e só vale para administradores", async () => {
    const admin = await makeAdmin();
    const target = await member();
    expect((await admin.delete(`/v1/admin/users/${target.id}`, { body: {} })).status).toBe(422);
    expect((await admin.delete(`/v1/admin/users/${target.id}`, { body: { confirm: "excluir" } })).status).toBe(422);
    const common = await member();
    expect((await common.delete(`/v1/admin/users/${target.id}`, { body: { confirm: "EXCLUIR" } })).status).toBe(403);
    expect((await env.anon.delete(`/v1/admin/users/${target.id}`, { body: { confirm: "EXCLUIR" } })).status).toBe(401);
    expect(await env.prisma.user.count({ where: { id: target.id } })).toBe(1);
  });

  it("protege administradores e a si mesmo; conta que não existe é 404", async () => {
    const admin = await makeAdmin();
    const other = await makeAdmin();
    const self = await admin.delete(`/v1/admin/users/${admin.id}`, { body: { confirm: "EXCLUIR" } });
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe("SELF_ACTION");
    const prot = await admin.delete(`/v1/admin/users/${other.id}`, { body: { confirm: "EXCLUIR" } });
    expect(prot.status).toBe(403);
    expect(prot.body.error.code).toBe("ADMIN_PROTECTED");
    expect((await admin.delete(`/v1/admin/users/${randomUUID()}`, { body: { confirm: "EXCLUIR" } })).status).toBe(404);
    expect(await env.prisma.user.count({ where: { id: other.id } })).toBe(1);
  });

  it("se o provedor de login falhar, nada é apagado e a conta fica bloqueada até o job retomar", async () => {
    const admin = await makeAdmin();
    const target = await member();
    env.auth.failDelete = true;
    const res = await admin.delete(`/v1/admin/users/${target.id}`, { body: { confirm: "EXCLUIR" } });
    env.auth.failDelete = false;
    expect(res.status).toBe(502);
    expect(await env.prisma.user.count({ where: { id: target.id } })).toBe(1);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("DELETING");
  });
});

describe("administrador: papel (promover e rebaixar)", () => {
  it("promove uma conta ativa e rebaixa depois; as duas ações ficam na auditoria", async () => {
    const admin = await makeAdmin();
    const target = await member();
    const up = await admin.post(`/v1/admin/users/${target.id}/role`, { role: "ADMIN" });
    expect(up.status).toBe(200);
    expect(up.body.role).toBe("ADMIN");
    expect((await target.get("/v1/admin/stats")).status).toBe(200);

    const down = await admin.post(`/v1/admin/users/${target.id}/role`, { role: "USER" });
    expect(down.body.role).toBe("USER");
    expect((await target.get("/v1/admin/stats")).status).toBe(403);
    expect(await env.prisma.auditLog.count({ where: { actorId: admin.id, action: "admin.user.role_changed", entityId: target.id } })).toBe(2);
  });

  it("não promove conta suspensa, não rebaixa quem é administrador pela configuração, e não vale para si mesmo", async () => {
    const admin = await makeAdmin();
    const suspended = await member();
    await admin.patch(`/v1/admin/users/${suspended.id}`, { status: "SUSPENDED" });
    const r1 = await admin.post(`/v1/admin/users/${suspended.id}/role`, { role: "ADMIN" });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe("ACCOUNT_NOT_ACTIVE");

    const fixed = await makeAdmin();
    env.config.ADMIN_USER_IDS.push(fixed.id);
    const r2 = await admin.post(`/v1/admin/users/${fixed.id}/role`, { role: "USER" });
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe("ADMIN_FROM_CONFIG");
    env.config.ADMIN_USER_IDS.splice(env.config.ADMIN_USER_IDS.indexOf(fixed.id), 1);

    expect((await admin.post(`/v1/admin/users/${admin.id}/role`, { role: "USER" })).body.error.code).toBe("SELF_ACTION");
    expect((await admin.post(`/v1/admin/users/${suspended.id}/role`, { role: "SUPER" })).status).toBe(422);
  });
});

describe("administrador: e-mail de redefinição de senha", () => {
  it("manda o link para a PESSOA (o administrador nunca vê nem define a senha) e audita", async () => {
    const admin = await makeAdmin();
    const target = await member();
    const res = await admin.post(`/v1/admin/users/${target.id}/password-reset`);
    expect(res.status).toBe(200);
    expect(env.auth.passwordResets.at(-1)).toBe(target.email);
    expect(await env.prisma.auditLog.count({ where: { actorId: admin.id, action: "admin.user.password_reset_sent", entityId: target.id } })).toBe(1);
    expect((await (await member()).post(`/v1/admin/users/${target.id}/password-reset`)).status).toBe(403);
    expect((await admin.post(`/v1/admin/users/${randomUUID()}/password-reset`)).status).toBe(404);
  });
});

describe("administrador: prorrogar o teste grátis", () => {
  it("soma dias ao fim atual do teste", async () => {
    const admin = await makeAdmin();
    const target = await member();
    const before = (await admin.get(`/v1/admin/users/${target.id}`)).body.access;
    expect(before.state).toBe("trial");
    const res = await admin.post(`/v1/admin/users/${target.id}/trial`, { days: 15 });
    expect(res.status).toBe(200);
    expect(new Date(res.body.access.expiresAt).getTime()).toBe(new Date(before.expiresAt).getTime() + 15 * DAY);
    expect((await target.get("/v1/billing")).body.access.daysLeft).toBeGreaterThan(0);
  });

  it("teste já vencido: conta a partir de HOJE e a pessoa volta a poder editar", async () => {
    const admin = await makeAdmin();
    const target = await member({ expired: true });
    expect((await target.post("/v1/categories", { type: "EXPENSE", name: "Antes" })).status).toBe(402);
    const res = await admin.post(`/v1/admin/users/${target.id}/trial`, { days: 10 });
    expect(new Date(res.body.access.expiresAt).getTime()).toBe(env.now().getTime() + 10 * DAY);
    expect(res.body.access.state).toBe("trial");
    expect((await target.post("/v1/categories", { type: "EXPENSE", name: "Depois" })).status).toBe(201);
    expect(await env.prisma.auditLog.count({ where: { actorId: admin.id, action: "admin.trial.extended", entityId: target.id } })).toBe(1);
  });

  it("valida os dias (1 a 365), exige administrador e não vale para outros administradores", async () => {
    const admin = await makeAdmin();
    const target = await member();
    for (const days of [0, 366, 1.5, "7"]) expect((await admin.post(`/v1/admin/users/${target.id}/trial`, { days })).status, String(days)).toBe(422);
    expect((await (await member()).post(`/v1/admin/users/${target.id}/trial`, { days: 7 })).status).toBe(403);
    const other = await makeAdmin();
    expect((await admin.post(`/v1/admin/users/${other.id}/trial`, { days: 7 })).body.error.code).toBe("ADMIN_PROTECTED");
  });
});

describe("administrador: verificação em duas etapas (suporte)", () => {
  it("mostra quem usa a verificação e, para quem perdeu o celular, desliga sem precisar do código", async () => {
    const admin = await makeAdmin();
    const target = await member();
    expect((await admin.get(`/v1/admin/users/${target.id}`)).body.mfaEnabled).toBe(false);
    const aal2 = await enableMfa(target);
    expect((await admin.get(`/v1/admin/users/${target.id}`)).body.mfaEnabled).toBe(true);
    expect((await admin.get("/v1/admin/stats")).body.users.mfaEnabled).toBeGreaterThanOrEqual(1);
    expect((await target.get("/v1/me")).body.error.code).toBe("MFA_REQUIRED"); // a sessão antiga só com senha não entra

    const res = await admin.delete(`/v1/admin/users/${target.id}/mfa`);
    expect(res.status).toBe(200);
    expect(res.body.mfaEnabled).toBe(false);
    expect(env.auth.mfaRemovedByAdmin).toContain(target.id);
    expect((await target.get("/v1/me")).status).toBe(200); // entra de novo só com a senha
    expect((await aal2.get("/v1/me")).status).toBe(200);
    expect(await env.prisma.auditLog.count({ where: { actorId: admin.id, action: "admin.mfa.removed", entityId: target.id } })).toBe(1);
  });

  it("conta sem verificação ligada: 409; só administrador faz; não vale para outro administrador", async () => {
    const admin = await makeAdmin();
    const target = await member();
    const none = await admin.delete(`/v1/admin/users/${target.id}/mfa`);
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe("MFA_NOT_ENABLED");
    expect((await (await member()).delete(`/v1/admin/users/${target.id}/mfa`)).status).toBe(403);
    const other = await makeAdmin();
    expect((await admin.delete(`/v1/admin/users/${other.id}/mfa`)).body.error.code).toBe("ADMIN_PROTECTED");
  });
});

describe("administrador: atividade (auditoria)", () => {
  it("lista o que os administradores fizeram, do mais recente ao mais antigo, com quem e em qual conta, sem dados financeiros", async () => {
    const admin = await makeAdmin();
    const target = await member();
    await env.prisma.profile.update({ where: { userId: target.id }, data: { displayName: "Auditada Zeferina Unica" } });
    await admin.post(`/v1/admin/users/${target.id}/access`, { days: 30, investments: true });
    await admin.post(`/v1/admin/users/${target.id}/trial`, { days: 5 });
    await admin.post(`/v1/admin/users/${target.id}/password-reset`);

    const res = await admin.get("/v1/admin/audit", { query: { limit: "50" } });
    expect(res.status).toBe(200);
    const mine = res.body.data.filter((e: any) => e.actor.id === admin.id && e.target?.id === target.id);
    expect(mine.map((e: any) => e.action)).toEqual(["admin.user.password_reset_sent", "admin.trial.extended", "admin.access.granted"]);
    expect(mine[0].target.label).toBe("Auditada Zeferina Unica");
    expect(mine[1].detail).toBe("+5 dias");
    expect(mine[2].detail).toBe("30 dias · com Rendimentos");
    expect(res.body.data.every((e: any) => e.action.startsWith("admin."))).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/amountCents|balance|password"|token/i);
  });

  it("pagina por cursor e é só para administradores", async () => {
    const admin = await makeAdmin();
    const target = await member();
    for (let i = 0; i < 3; i++) await admin.post(`/v1/admin/users/${target.id}/trial`, { days: 1 });
    const page1 = await admin.get("/v1/admin/audit", { query: { limit: "2" } });
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.page.hasMore).toBe(true);
    const page2 = await admin.get("/v1/admin/audit", { query: { limit: "2", cursor: page1.body.page.nextCursor } });
    const ids1 = page1.body.data.map((e: any) => e.id);
    expect(page2.body.data.every((e: any) => !ids1.includes(e.id))).toBe(true);
    expect((await (await member()).get("/v1/admin/audit")).status).toBe(403);
    expect((await env.anon.get("/v1/admin/audit")).status).toBe(401);
  });

  it("a conta excluída aparece como 'sem nome' (rótulo nulo), sem quebrar a lista", async () => {
    const admin = await makeAdmin();
    const target = await member();
    await admin.delete(`/v1/admin/users/${target.id}`, { body: { confirm: "EXCLUIR" } });
    const res = await admin.get("/v1/admin/audit", { query: { limit: "20" } });
    const entry = res.body.data.find((e: any) => e.action === "admin.user.deleted" && e.target?.id === target.id);
    expect(entry).toBeTruthy();
    expect(entry.target.label).toBeNull();
    expect(entry.actor.label).toBeTruthy();
    expect(randomBytes(1)).toBeTruthy();
  });
});
