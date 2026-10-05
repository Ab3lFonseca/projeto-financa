import { afterAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env";

/** Rota pública com limite de 3 por minuto (STRICT(3)). */
const hit = (env: TestEnv, headers: Record<string, string> = {}) =>
  env.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "alguem@exemplo.dev" }, headers });

async function exhaust(env: TestEnv, headers: Record<string, string> = {}) {
  for (let i = 0; i < 3; i++) expect((await hit(env, headers)).statusCode).toBe(200);
}

describe("IP do cliente nos limites de tentativas (relatório: bypass pelo X-Forwarded-For)", () => {
  const envs: TestEnv[] = [];
  const make = async (overrides: Record<string, string>) => {
    const env = await createTestEnv({ RATE_LIMIT_ENABLED: "true", ...overrides });
    envs.push(env);
    return env;
  };
  afterAll(async () => {
    for (const e of envs) await e.close();
  });

  it("com CLIENT_IP_HEADER, trocar o X-Forwarded-For NÃO abre um contador novo", async () => {
    const env = await make({ CLIENT_IP_HEADER: "cf-connecting-ip", TRUST_PROXY: "true" });
    const cf = { "cf-connecting-ip": "198.51.100.10" };
    await exhaust(env, cf);
    expect((await hit(env, cf)).statusCode).toBe(429);
    // o ataque do relatório: mesmo cliente, X-Forwarded-For forjado
    expect((await hit(env, { ...cf, "x-forwarded-for": "203.0.113.17" })).statusCode).toBe(429);
    expect((await hit(env, { ...cf, "x-forwarded-for": "203.0.113.18, 203.0.113.19" })).statusCode).toBe(429);
    const blocked = await hit(env, cf);
    expect(blocked.json().error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("clientes realmente diferentes (cabeçalho da borda diferente) têm contadores separados", async () => {
    const env = await make({ CLIENT_IP_HEADER: "cf-connecting-ip" });
    await exhaust(env, { "cf-connecting-ip": "198.51.100.20" });
    expect((await hit(env, { "cf-connecting-ip": "198.51.100.20" })).statusCode).toBe(429);
    expect((await hit(env, { "cf-connecting-ip": "198.51.100.21" })).statusCode).toBe(200);
    // IPv6 também vale
    expect((await hit(env, { "cf-connecting-ip": "2001:db8::1" })).statusCode).toBe(200);
  });

  it("valor inválido ou ausente cai no IP da conexão (um único contador), nunca no X-Forwarded-For", async () => {
    const env = await make({ CLIENT_IP_HEADER: "cf-connecting-ip" });
    await exhaust(env, { "cf-connecting-ip": "isto-nao-e-um-ip" });
    expect((await hit(env, { "cf-connecting-ip": "outro-lixo", "x-forwarded-for": "203.0.113.50" })).statusCode).toBe(429);
    expect((await hit(env, { "x-forwarded-for": "203.0.113.51" })).statusCode).toBe(429);
    expect((await hit(env)).statusCode).toBe(429);
  });

  it("controle: só com TRUST_PROXY=true (sem CLIENT_IP_HEADER) o ataque do relatório funciona, por isso a API avisa na inicialização", async () => {
    const env = await make({ TRUST_PROXY: "true" });
    await exhaust(env, { "x-forwarded-for": "203.0.113.70" });
    expect((await hit(env, { "x-forwarded-for": "203.0.113.70" })).statusCode).toBe(429);
    // contador novo só por mudar o cabeçalho: é exatamente o bypass relatado
    expect((await hit(env, { "x-forwarded-for": "203.0.113.71" })).statusCode).toBe(200);
  });

  it("TRUST_PROXY=false ignora o X-Forwarded-For", async () => {
    const env = await make({ TRUST_PROXY: "false" });
    await exhaust(env, { "x-forwarded-for": "203.0.113.60" });
    expect((await hit(env, { "x-forwarded-for": "203.0.113.61" })).statusCode).toBe(429);
  });

  it("o nome do cabeçalho é validado na configuração", async () => {
    const { loadConfig } = await import("../src/config");
    const base = { NODE_ENV: "development", DATABASE_URL: "postgres://x" };
    expect(loadConfig({ ...base, CLIENT_IP_HEADER: "CF-Connecting-IP" }).CLIENT_IP_HEADER).toBe("cf-connecting-ip");
    expect(loadConfig({ ...base, CLIENT_IP_HEADER: "" }).CLIENT_IP_HEADER).toBeUndefined();
    expect(loadConfig(base).CLIENT_IP_HEADER).toBeUndefined();
    expect(() => loadConfig({ ...base, CLIENT_IP_HEADER: "x forwarded" })).toThrow(/CLIENT_IP_HEADER/);
  });
});
