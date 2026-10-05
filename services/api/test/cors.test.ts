import { afterAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env";

const SITE = "https://financa-web.onrender.com";

/** Requisição de teste (preflight) que o navegador faz antes de um POST com JSON. */
const preflight = (env: TestEnv, origin: string) =>
  env.app.inject({
    method: "OPTIONS",
    url: "/v1/auth/register",
    headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  });

describe("CORS (app web no navegador)", () => {
  const envs: TestEnv[] = [];
  afterAll(async () => {
    for (const e of envs) await e.close();
  });

  it("libera o site configurado em CORS_ORIGINS", async () => {
    const env = await createTestEnv({ CORS_ORIGINS: `${SITE}, http://localhost:8081` });
    envs.push(env);
    const res = await preflight(env, SITE);
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(SITE);
    expect(String(res.headers["access-control-allow-headers"]).toLowerCase()).toContain("content-type");
    expect((await preflight(env, "http://localhost:8081")).headers["access-control-allow-origin"]).toBe("http://localhost:8081");
  });

  it("não libera outro site, nem o mesmo com barra no final", async () => {
    const env = await createTestEnv({ CORS_ORIGINS: SITE });
    envs.push(env);
    expect((await preflight(env, "https://site-do-mal.exemplo.dev")).headers["access-control-allow-origin"]).toBeUndefined();
    // o navegador nunca envia barra no Origin; configurar com barra no final não casa (erro comum no painel do Render)
    const withSlash = await createTestEnv({ CORS_ORIGINS: `${SITE}/` });
    envs.push(withSlash);
    expect((await preflight(withSlash, SITE)).headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sem CORS_ORIGINS o CORS fica desligado: o navegador é bloqueado (o app nativo não precisa)", async () => {
    const env = await createTestEnv({});
    envs.push(env);
    const res = await preflight(env, SITE);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.statusCode).toBeGreaterThanOrEqual(400); // o mesmo 404 que aparece no console do navegador
  });
});
