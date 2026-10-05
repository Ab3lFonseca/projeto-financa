import { afterAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env";

const NATIVE = "financa://confirm-email";
const WEB = "https://financa-web.onrender.com/confirm-email";

const body = (email: string, extra: Record<string, unknown> = {}) => ({
  email,
  password: "senhaForte123",
  acceptTerms: true,
  acceptPrivacy: true,
  termsVersion: "2026-10-01",
  privacyVersion: "2026-10-01",
  ...extra,
});

describe("destino do link do e-mail de confirmação", () => {
  const envs: TestEnv[] = [];
  const make = async (overrides: Record<string, string>) => {
    const env = await createTestEnv(overrides);
    envs.push(env);
    return env;
  };
  afterAll(async () => {
    for (const e of envs) await e.close();
  });
  const last = (env: TestEnv) => env.auth.confirmRedirects.at(-1)!;

  it("cadastro pela web recebe o endereço do site; pelo celular (ou sem informar), o deep link", async () => {
    const env = await make({ EMAIL_CONFIRM_REDIRECT_URL: NATIVE, EMAIL_CONFIRM_WEB_REDIRECT_URL: WEB });
    expect((await env.anon.post("/v1/auth/register", body("web@exemplo.dev", { platform: "web" }))).status).toBe(201);
    expect(last(env)).toMatchObject({ kind: "signup", email: "web@exemplo.dev", redirectTo: WEB });
    await env.anon.post("/v1/auth/register", body("nativo@exemplo.dev", { platform: "native" }));
    expect(last(env).redirectTo).toBe(NATIVE);
    await env.anon.post("/v1/auth/register", body("padrao@exemplo.dev"));
    expect(last(env).redirectTo).toBe(NATIVE);
  });

  it("o reenvio da confirmação usa o mesmo critério", async () => {
    const env = await make({ EMAIL_CONFIRM_REDIRECT_URL: NATIVE, EMAIL_CONFIRM_WEB_REDIRECT_URL: WEB });
    await env.anon.post("/v1/auth/resend-verification", { email: "x@exemplo.dev", platform: "web" });
    expect(last(env)).toMatchObject({ kind: "resend", redirectTo: WEB });
    await env.anon.post("/v1/auth/resend-verification", { email: "x@exemplo.dev" });
    expect(last(env).redirectTo).toBe(NATIVE);
  });

  it("sem configuração, nada é enviado ao provedor (cai no Site URL dele)", async () => {
    const env = await make({});
    await env.anon.post("/v1/auth/register", body("sem-config@exemplo.dev", { platform: "web" }));
    expect(last(env).redirectTo).toBeUndefined();
  });

  it("o cliente NÃO escolhe o destino: campos extras (redirectTo, redirect_to) são recusados", async () => {
    const env = await make({ EMAIL_CONFIRM_WEB_REDIRECT_URL: WEB });
    const before = env.auth.confirmRedirects.length;
    for (const extra of [{ redirectTo: "https://site-do-mal.exemplo.dev" }, { redirect_to: "https://site-do-mal.exemplo.dev" }, { platform: "tv" }]) {
      const res = await env.anon.post("/v1/auth/register", body("mal@exemplo.dev", extra));
      expect(res.status).toBe(422);
    }
    expect((await env.anon.post("/v1/auth/resend-verification", { email: "mal@exemplo.dev", redirectTo: "https://site-do-mal.exemplo.dev" })).status).toBe(422);
    expect(env.auth.confirmRedirects.length).toBe(before); // nada chegou ao provedor
  });

  it("a configuração aceita vazio e recusa URL inválida na web", async () => {
    const { loadConfig } = await import("../src/config");
    const base = { NODE_ENV: "development", DATABASE_URL: "postgres://x" };
    expect(loadConfig({ ...base, EMAIL_CONFIRM_WEB_REDIRECT_URL: "", EMAIL_CONFIRM_REDIRECT_URL: "" })).toMatchObject({
      EMAIL_CONFIRM_WEB_REDIRECT_URL: undefined,
      EMAIL_CONFIRM_REDIRECT_URL: undefined,
    });
    expect(loadConfig({ ...base, EMAIL_CONFIRM_WEB_REDIRECT_URL: WEB }).EMAIL_CONFIRM_WEB_REDIRECT_URL).toBe(WEB);
    expect(() => loadConfig({ ...base, EMAIL_CONFIRM_WEB_REDIRECT_URL: "isto nao e url" })).toThrow(/EMAIL_CONFIRM_WEB_REDIRECT_URL/);
  });
});
