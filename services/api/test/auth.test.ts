import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { TEST_ISSUER, TEST_JWT_SECRET } from "./helpers/fake-auth";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

const registerBody = (email: string, extra: Record<string, unknown> = {}) => ({
  email,
  password: "senhaForte123",
  acceptTerms: true,
  acceptPrivacy: true,
  termsVersion: "2026-10-07",
  privacyVersion: "2026-10-07",
  ...extra,
});

describe("saúde", () => {
  it("/health e /ready respondem", async () => {
    expect((await env.anon.get("/health")).body).toEqual({ status: "ok" });
    const ready = await env.anon.get("/ready");
    expect(ready.status).toBe(200);
  });

  it("devolve x-request-id e cabeçalhos de segurança", async () => {
    const res = await env.anon.get("/health", { headers: { "x-request-id": "meu-id-de-teste-123" } });
    expect(res.headers["x-request-id"]).toBe("meu-id-de-teste-123");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("404 e JSON malformado usam o formato único de erro", async () => {
    const nf = await env.anon.get("/rota-que-nao-existe");
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe("NOT_FOUND");
    expect(nf.body.error.requestId).toBeTruthy();

    const bad = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{nao e json",
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("BAD_REQUEST");
  });
});

describe("cadastro e login", () => {
  it("cadastra e devolve a sessão (sem verificação de e-mail)", async () => {
    const res = await env.anon.post("/v1/auth/register", registerBody("novo@teste.dev"));
    expect(res.status).toBe(201);
    expect(res.body.requiresEmailVerification).toBe(false);
    expect(res.body.session.accessToken).toBeTruthy();
  });

  it("exige verificação de e-mail quando o provedor pede", async () => {
    env.auth.requireVerification = true;
    try {
      const res = await env.anon.post("/v1/auth/register", registerBody("verificar@teste.dev"));
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ requiresEmailVerification: true, session: null });
      const login = await env.anon.post("/v1/auth/login", { email: "verificar@teste.dev", password: "senhaForte123" });
      expect(login.status).toBe(403);
      expect(login.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    } finally {
      env.auth.requireVerification = false;
    }
  });

  it("e-mail já cadastrado devolve a mesma resposta (anti-enumeração)", async () => {
    await env.anon.post("/v1/auth/register", registerBody("duplicado@teste.dev"));
    const again = await env.anon.post("/v1/auth/register", registerBody("duplicado@teste.dev"));
    expect(again.status).toBe(201);
    expect(again.body.session).toBeNull();
  });

  it("login correto e incorreto", async () => {
    await env.anon.post("/v1/auth/register", registerBody("login@teste.dev"));
    const ok = await env.anon.post("/v1/auth/login", { email: "LOGIN@teste.dev ", password: "senhaForte123" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe("login@teste.dev");

    const bad = await env.anon.post("/v1/auth/login", { email: "login@teste.dev", password: "errada" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("refresh renova a sessão e não aceita token reutilizado", async () => {
    await env.anon.post("/v1/auth/register", registerBody("refresh@teste.dev"));
    const login = await env.anon.post("/v1/auth/login", { email: "refresh@teste.dev", password: "senhaForte123" });
    const refreshed = await env.anon.post("/v1/auth/refresh", { refreshToken: login.body.refreshToken });
    expect(refreshed.status).toBe(200);
    const reuse = await env.anon.post("/v1/auth/refresh", { refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it("valida o corpo em português, com o caminho do campo", async () => {
    const res = await env.anon.post("/v1/auth/register", { ...registerBody("x@teste.dev"), password: "curta1", acceptTerms: false });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const byPath = Object.fromEntries(res.body.error.details.map((d: any) => [d.path, d]));
    expect(byPath.password.in).toBe("body");
    expect(byPath.password.message).toBe("A senha deve ter pelo menos 10 caracteres");
    expect(byPath.acceptTerms.message).toBe("É necessário aceitar os Termos de Uso");
  });

  it("rejeita campos extras (ex.: tentar se cadastrar como ADMIN)", async () => {
    const res = await env.anon.post("/v1/auth/register", { ...registerBody("admin@teste.dev"), role: "ADMIN" });
    expect(res.status).toBe(422);
  });

  it("forgot-password responde igual para e-mail existente ou não", async () => {
    const a = await env.anon.post("/v1/auth/forgot-password", { email: "existe@teste.dev" });
    const b = await env.anon.post("/v1/auth/forgot-password", { email: "naoexiste@teste.dev" });
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
  });

  it("logout é idempotente mesmo sem token", async () => {
    const res = await env.anon.post("/v1/auth/logout");
    expect(res.status).toBe(200);
  });
});

describe("proteção das rotas (JWT)", () => {
  it("rejeita sem token, com token malformado e com esquema errado", async () => {
    expect((await env.anon.get("/v1/me")).status).toBe(401);
    expect((await env.anon.get("/v1/me", { token: "isso.nao.e.jwt" })).status).toBe(401);
    const basic = await env.anon.get("/v1/me", { headers: { authorization: "Basic abc" } });
    expect(basic.status).toBe(401);
  });

  it("rejeita assinatura de outra chave, emissor/audiência errados e token expirado", async () => {
    const u = await env.newUser();
    const wrongSecret = await env.auth.issueToken(u.id, { secret: "outro-segredo-outro-segredo-outro-1234" });
    expect((await env.anon.get("/v1/me", { token: wrongSecret })).body.error.code).toBe("INVALID_TOKEN");

    const wrongIss = await env.auth.issueToken(u.id, { iss: "https://atacante.example/auth/v1" });
    expect((await env.anon.get("/v1/me", { token: wrongIss })).status).toBe(401);

    const wrongAud = await env.auth.issueToken(u.id, { aud: "anon" });
    expect((await env.anon.get("/v1/me", { token: wrongAud })).status).toBe(401);

    const expired = await env.auth.issueToken(u.id, { expSeconds: -60 });
    const res = await env.anon.get("/v1/me", { token: expired });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("rejeita token com alg=none (forjado)", async () => {
    const u = await env.newUser();
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: u.id, aud: "authenticated", iss: TEST_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    const forged = `${header}.${payload}.`;
    expect((await env.anon.get("/v1/me", { token: forged })).status).toBe(401);
  });

  it("rejeita token assimétrico quando só há segredo HS256 configurado", async () => {
    // Um atacante não pode forçar o algoritmo: RS256 sem JWKS configurado é recusado.
    const { generateKeyPair } = await import("jose");
    const { privateKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ email: "x@y.z" })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("00000000-0000-4000-8000-000000000000")
      .setAudience("authenticated")
      .setIssuer(TEST_ISSUER)
      .setExpirationTime("1h")
      .sign(privateKey);
    expect((await env.anon.get("/v1/me", { token })).status).toBe(401);
  });

  it("segredo conhecido só vale com o segredo certo (sanidade)", async () => {
    const u = await env.newUser();
    const good = await env.auth.issueToken(u.id, { secret: TEST_JWT_SECRET });
    expect((await env.anon.get("/v1/me", { token: good })).status).toBe(200);
  });
});

describe("GET /v1/me e provisionamento", () => {
  it("cria perfil, plano e categorias padrão no primeiro acesso", async () => {
    const u = await env.newUser();
    const res = await u.get("/v1/me");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(u.id);
    expect(res.body.email).toBe(u.email);
    expect(res.body.role).toBe("USER");
    expect(res.body.consentRequired).toBe(false);
    expect(res.body.profile).toMatchObject({ locale: "pt-BR", timezone: "America/Sao_Paulo", currency: "BRL", theme: "SYSTEM" });
    expect(res.body.profile.notificationPrefs.billsDue).toBe(true);

    const categories = await env.prisma.category.count({ where: { userId: u.id } });
    expect(categories).toBe(17);
    const consents = await env.prisma.consent.findMany({ where: { userId: u.id }, orderBy: { type: "asc" } });
    expect(consents.map((c) => c.type).sort()).toEqual(["PRIVACY", "TERMS"]);
  });

  it("no beta (BILLING_ENFORCED=false) todos recebem Premium", async () => {
    const u = await env.newUser();
    const res = await u.get("/v1/me");
    expect(res.body.entitlements.plan).toBe("PREMIUM");
    expect(res.body.entitlements.billingEnforced).toBe(false);
    expect(res.body.entitlements.limits.accounts).toBeNull();
  });

  it("acessos simultâneos no primeiro login não duplicam nem quebram o provisionamento", async () => {
    const u = await env.newUser();
    const results = await Promise.all(Array.from({ length: 6 }, () => u.get("/v1/me")));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await env.prisma.user.count({ where: { id: u.id } })).toBe(1);
    expect(await env.prisma.category.count({ where: { userId: u.id } })).toBe(17);
  });

  it("sem aceite dos termos: /me funciona e sinaliza consentRequired", async () => {
    const u = await env.newUser({ consent: false });
    const res = await u.get("/v1/me");
    expect(res.status).toBe(200);
    expect(res.body.consentRequired).toBe(true);
  });

  it("usuário suspenso é barrado", async () => {
    const u = await env.newUser();
    await u.get("/v1/me"); // provisiona
    await env.prisma.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    env.app.users.invalidate(u.id);
    const res = await u.get("/v1/me");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_SUSPENDED");
  });
});

describe("PATCH /v1/me", () => {
  it("atualiza perfil e preferências parciais", async () => {
    const u = await env.newUser();
    const res = await u.patch("/v1/me", {
      displayName: "  Maria   Silva ",
      theme: "DARK",
      timezone: "America/Manaus",
      onboardingCompleted: true,
      notificationPrefs: { budgets: false },
    });
    expect(res.status).toBe(200);
    expect(res.body.profile.displayName).toBe("Maria Silva");
    expect(res.body.profile.theme).toBe("DARK");
    expect(res.body.profile.timezone).toBe("America/Manaus");
    expect(res.body.profile.onboardingCompleted).toBe(true);
    expect(res.body.profile.notificationPrefs).toMatchObject({ budgets: false, billsDue: true });
  });

  it("rejeita fuso horário inválido e campos desconhecidos (ex.: role)", async () => {
    const u = await env.newUser();
    expect((await u.patch("/v1/me", { timezone: "Marte/Olympus" })).status).toBe(422);
    expect((await u.patch("/v1/me", { role: "ADMIN" })).status).toBe(422);
  });

  describe("aparência (tema da conta)", () => {
    const CUSTOM = { primary: "#112233", accent: "#445566", background: "#0A0B10", surface: "#14161E" };

    it("começa nula, guarda o tema (inclusive as cores personalizadas) e devolve no perfil", async () => {
      const u = await env.newUser();
      expect((await u.get("/v1/me")).body.profile.appearance).toBeNull();

      const blue = await u.patch("/v1/me", { theme: "DARK", appearance: { preset: "blue" } });
      expect(blue.status).toBe(200);
      expect(blue.body.profile.appearance).toEqual({ preset: "blue" });
      expect(blue.body.profile.theme).toBe("DARK");

      const custom = await u.patch("/v1/me", { appearance: { preset: "custom", custom: CUSTOM } });
      expect(custom.body.profile.appearance).toEqual({ preset: "custom", custom: CUSTOM });
      // as cores ficam guardadas mesmo ao voltar para um tema pronto
      const back = await u.patch("/v1/me", { appearance: { preset: "green", custom: CUSTOM } });
      expect(back.body.profile.appearance).toEqual({ preset: "green", custom: CUSTOM });
      // e persistem para quem entrar de novo
      expect((await u.get("/v1/me")).body.profile.appearance).toEqual({ preset: "green", custom: CUSTOM });
    });

    it("null restaura o padrão e o tema de um usuário não vaza para outro", async () => {
      const a = await env.newUser();
      const b = await env.newUser();
      await a.patch("/v1/me", { appearance: { preset: "red" } });
      expect((await b.get("/v1/me")).body.profile.appearance).toBeNull();
      expect((await a.patch("/v1/me", { appearance: null })).body.profile.appearance).toBeNull();
    });

    it("recusa tema inválido: preset desconhecido, cor malformada, custom ausente ou campos extras", async () => {
      const u = await env.newUser();
      const bad = [
        { preset: "neon" },
        { preset: "custom" }, // sem as cores
        { preset: "custom", custom: { ...CUSTOM, primary: "vermelho" } },
        { preset: "custom", custom: { ...CUSTOM, primary: "#12345" } },
        { preset: "custom", custom: { primary: "#112233" } },
        { preset: "dark", custom: { ...CUSTOM, extra: "#000000" } },
        { preset: "dark", script: "<script>" },
      ];
      for (const appearance of bad) expect((await u.patch("/v1/me", { appearance })).status, JSON.stringify(appearance)).toBe(422);
      expect((await u.get("/v1/me")).body.profile.appearance).toBeNull();
    });

    it("um valor inválido gravado direto no banco não quebra o perfil (vira nulo)", async () => {
      const u = await env.newUser();
      await u.get("/v1/me");
      await env.prisma.profile.update({ where: { userId: u.id }, data: { appearance: { preset: "neon", lixo: true } } });
      const me = await u.get("/v1/me");
      expect(me.status).toBe(200);
      expect(me.body.profile.appearance).toBeNull();
    });
  });
});

describe("POST /v1/me/change-password", () => {
  it("troca a senha com a senha atual correta", async () => {
    const u = await env.newUser();
    const res = await u.post("/v1/me/change-password", { currentPassword: u.password, newPassword: "novaSenha12345" });
    expect(res.status).toBe(200);
    const login = await env.anon.post("/v1/auth/login", { email: u.email, password: "novaSenha12345" });
    expect(login.status).toBe(200);
    expect(env.auth.signOuts.some((s) => s.scope === "others")).toBe(true);
  });

  it("recusa senha atual incorreta com 422 (sem derrubar a sessão)", async () => {
    const u = await env.newUser();
    const res = await u.post("/v1/me/change-password", { currentPassword: "errada", newPassword: "novaSenha12345" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("WRONG_PASSWORD");
  });
});

describe("push tokens", () => {
  it("registra e remove, e o token migra de dono se outro usuário usar o mesmo aparelho", async () => {
    const a = await env.newUser();
    const b = await env.newUser();
    const token = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]";
    expect((await a.post("/v1/me/push-tokens", { expoToken: token, platform: "ANDROID" })).status).toBe(200);
    expect((await b.post("/v1/me/push-tokens", { expoToken: token, platform: "ANDROID" })).status).toBe(200);
    expect(await env.prisma.pushToken.count({ where: { expoToken: token, userId: b.id } })).toBe(1);
    expect(await env.prisma.pushToken.count({ where: { expoToken: token, userId: a.id } })).toBe(0);
    // quem não é dono não consegue remover
    await a.delete("/v1/me/push-tokens", { query: { token } });
    expect(await env.prisma.pushToken.count({ where: { expoToken: token } })).toBe(1);
    await b.delete("/v1/me/push-tokens", { query: { token } });
    expect(await env.prisma.pushToken.count({ where: { expoToken: token } })).toBe(0);
  });
});

describe("limite de taxa", () => {
  it("bloqueia excesso de tentativas de login com 429 no formato padrão", async () => {
    const limited = await createTestEnv({ RATE_LIMIT_ENABLED: "true" });
    try {
      const attempts = [];
      for (let i = 0; i < 12; i++) {
        attempts.push(await limited.anon.post("/v1/auth/login", { email: "x@teste.dev", password: "errada" }));
      }
      const statuses = attempts.map((a) => a.status);
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
      expect(attempts[10]!.body.error.code).toBe("RATE_LIMITED");
      expect(attempts[10]!.headers["retry-after"]).toBeTruthy();
    } finally {
      await limited.close();
    }
  });
});
