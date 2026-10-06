import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { createTestEnv, type TestEnv } from "./helpers/env";

const base = { NODE_ENV: "test", DATABASE_URL: "postgresql://x:y@localhost:5432/z" };

describe("ADMIN_USER_IDS: leitura da configuração", () => {
  it("aceita UUIDs separados por vírgula, ignora espaços e vazios e normaliza para minúsculas", () => {
    const cfg = loadConfig({ ...base, ADMIN_USER_IDS: " 11111111-1111-4111-8111-111111111111 , ,AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" });
    expect(cfg.ADMIN_USER_IDS).toEqual(["11111111-1111-4111-8111-111111111111", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  });

  it("sem a variável, ninguém é promovido", () => {
    expect(loadConfig(base).ADMIN_USER_IDS).toEqual([]);
  });

  it("recusa valores que não são UUID (um e-mail ou um nome não pode virar administrador por engano)", () => {
    expect(() => loadConfig({ ...base, ADMIN_USER_IDS: "voce@email.com" })).toThrow(/ADMIN_USER_IDS/);
    expect(() => loadConfig({ ...base, ADMIN_USER_IDS: "11111111-1111-4111-8111-111111111111,qualquer-coisa" })).toThrow(/ADMIN_USER_IDS/);
  });
});

describe("administrador definido na configuração", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  it("a conta listada vira ADMIN no primeiro acesso depois de listada (no banco, na API e na auditoria); as outras não", async () => {
    const owner = await env.newUser();
    const other = await env.newUser();

    // Antes de estar na lista: usuário comum, sem acesso ao painel.
    expect((await owner.get("/v1/me")).body.role).toBe("USER");
    expect((await owner.get("/v1/admin/stats")).status).toBe(403);
    await other.get("/v1/me");

    // Passa a constar na configuração (o serviço lê a lista a cada acesso novo, sem reiniciar).
    env.config.ADMIN_USER_IDS.push(owner.id);
    env.app.users.invalidate(owner.id);

    const me = await owner.get("/v1/me");
    expect(me.body.role).toBe("ADMIN");
    expect((await owner.get("/v1/admin/stats")).status).toBe(200);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).role).toBe("ADMIN");

    // Quem não está na lista continua comum.
    expect((await other.get("/v1/me")).body.role).toBe("USER");
    expect((await other.get("/v1/admin/stats")).status).toBe(403);

    // Promoção auditada uma única vez (sem dados pessoais).
    env.app.users.invalidate(owner.id);
    await owner.get("/v1/me");
    const audits = await env.prisma.auditLog.findMany({ where: { action: "admin.bootstrap", entityId: owner.id } });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(owner.email);
  });

  it("um administrador promovido não pode ser suspenso pelo painel (proteção continua valendo)", async () => {
    const admin = await env.newUser();
    await admin.get("/v1/me");
    env.config.ADMIN_USER_IDS.push(admin.id);
    env.app.users.invalidate(admin.id);
    await admin.get("/v1/me");
    const second = await env.newUser();
    await second.get("/v1/me");
    env.config.ADMIN_USER_IDS.push(second.id);
    env.app.users.invalidate(second.id);
    await second.get("/v1/me");

    const res = await admin.patch(`/v1/admin/users/${second.id}`, { status: "SUSPENDED" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ADMIN_PROTECTED");
  });
});
