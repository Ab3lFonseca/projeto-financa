import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { createTestEnv, DEFAULT_NOW, type TestEnv, type TestUser } from "./helpers/env";

const DAY = 86_400_000;
const WEB_REDIRECT = "https://app.exemplo.test/auth/callback";
const NATIVE_REDIRECT = "financa://auth/callback";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({
    OAUTH_PROVIDERS: "google,facebook",
    OAUTH_WEB_REDIRECT_URL: WEB_REDIRECT,
    OAUTH_REDIRECT_URL: NATIVE_REDIRECT,
    EMAIL_CONFIRM_WEB_REDIRECT_URL: "https://app.exemplo.test/confirm-email",
    EMAIL_CONFIRM_REDIRECT_URL: "financa://confirm-email",
    PASSWORD_RESET_REDIRECT_URL: "financa://reset-password",
  });
});
afterAll(async () => {
  await env.close();
});
beforeEach(() => env.setNow(DEFAULT_NOW));

async function member(): Promise<TestUser> {
  const u = await env.newUser();
  await u.get("/v1/me"); // provisiona
  return u;
}

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

/** Cria uma conta SÓ com login social (sem senha) pelo fluxo real: início → provedor → troca do código. */
async function socialUser(over: { email?: string; name?: string; provider?: string } = {}) {
  const { verifier, challenge } = pkce();
  const email = over.email ?? `social-${randomBytes(4).toString("hex")}@gmail.test`;
  const { code } = env.auth.issueOauthCode({ email, name: over.name, provider: over.provider ?? "google", codeChallenge: challenge });
  const res = await env.anon.post("/v1/auth/oauth/exchange", { code, codeVerifier: verifier });
  expect(res.status).toBe(200);
  return { user: env.asUser(res.body), session: res.body, email };
}

/** Liga a verificação em duas etapas pelo fluxo real e devolve a sessão aal2 e o fator. */
async function enableMfa(u: TestUser) {
  const enrolled = (await u.post("/v1/me/mfa/enroll")).body;
  const code = env.auth.codeFor(u.id, enrolled.factorId);
  const res = await u.post("/v1/me/mfa/enable", { factorId: enrolled.factorId, code });
  expect(res.status).toBe(200);
  return { aal2: env.asUser(res.body, u.password), factorId: enrolled.factorId as string };
}

// ================================================================================================ minha conta

describe("Minha conta: dados de cadastro", () => {
  it("mostra os dados da própria pessoa: cadastro, aceites, contagens, segurança e limites", async () => {
    const u = await member();
    expect((await u.post("/v1/accounts", { name: "Conta corrente", type: "CHECKING", openingBalanceCents: 0 })).status).toBe(201);
    const res = await u.get("/v1/me/account");
    expect(res.status).toBe(200);
    const a = res.body;
    expect(a).toMatchObject({ id: u.id, email: u.email, displayName: null, locale: "pt-BR", timezone: "America/Sao_Paulo", currency: "BRL" });
    expect(a.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(a.legal).toMatchObject({ termsVersion: "2026-10-01", privacyVersion: "2026-10-01", marketingOptIn: false });
    expect(a.legal.termsAcceptedAt).not.toBeNull();
    expect(a.security).toEqual({ mfa: { enabled: false, enabledAt: null }, hasPassword: true, providers: ["email"], canChangeEmail: true });
    expect(a.summary.accounts).toBe(1);
    for (const kind of ["NAME", "EMAIL", "PASSWORD"]) expect(a.limits[kind]).toMatchObject({ canChange: true, nextAvailableAt: null });
    expect(a.limits.NAME).toMatchObject({ perMonth: { used: 0, max: 2 }, perYear: { used: 0, max: 6 } });
  });

  it("exige login e nunca mostra dados de outra pessoa", async () => {
    expect((await env.anon.get("/v1/me/account")).status).toBe(401);
    const a = await member();
    const b = await member();
    expect((await a.get("/v1/me/account")).body.id).toBe(a.id);
    expect((await b.get("/v1/me/account")).body.email).toBe(b.email);
  });
});

describe("Minha conta: trocar o nome (limite por mês e por ano)", () => {
  const rename = (u: TestUser, name: string | null) => u.patch("/v1/me", { displayName: name });

  it("definir o nome pela primeira vez é livre; depois cada troca conta, e a terceira no mês é recusada com a data de liberação", async () => {
    const u = await member();
    expect((await rename(u, "Maria")).status).toBe(200); // primeira definição: não conta
    expect((await u.get("/v1/me/account")).body.limits.NAME.perMonth.used).toBe(0);

    expect((await rename(u, "Maria Souza")).status).toBe(200);
    expect((await rename(u, "Maria S.")).status).toBe(200);
    const blocked = await rename(u, "Outra Maria");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("CHANGE_LIMIT_REACHED");
    expect(blocked.body.error.message).toMatch(/2 por mês e 6 por ano/);
    expect(new Date(blocked.body.error.details.nextAvailableAt).getTime()).toBe(env.now().getTime() + 30 * DAY);
    expect((await u.get("/v1/me")).body.profile.displayName).toBe("Maria S."); // o nome não mudou

    const state = (await u.get("/v1/me/account")).body.limits.NAME;
    expect(state).toMatchObject({ canChange: false, perMonth: { used: 2, max: 2 } });
  });

  it("repetir o mesmo nome não conta; os outros campos do perfil não têm limite", async () => {
    const u = await member();
    await rename(u, "Ana");
    await rename(u, "Ana Lima");
    await rename(u, "Ana Lima"); // igual: nada muda
    expect((await u.get("/v1/me/account")).body.limits.NAME.perMonth.used).toBe(1);
    for (let i = 0; i < 5; i++) expect((await u.patch("/v1/me", { timezone: i % 2 ? "America/Manaus" : "America/Sao_Paulo" })).status).toBe(200);
  });

  it("depois de 30 dias a vaga do mês volta; o limite do ano continua valendo", async () => {
    const u = await member();
    await rename(u, "Primeiro");
    // 6 trocas em 3 rodadas de 2, a cada 31 dias: fecha o limite do ano (6) com o mês livre
    for (const round of [0, 1, 2]) {
      env.setNow(new Date(Date.parse(DEFAULT_NOW) + round * 31 * DAY).toISOString());
      expect((await rename(u, `Nome ${round}a`)).status).toBe(200);
      expect((await rename(u, `Nome ${round}b`)).status).toBe(200);
    }
    env.setNow(new Date(Date.parse(DEFAULT_NOW) + 93 * DAY).toISOString());
    const state = (await u.get("/v1/me/account")).body.limits.NAME;
    expect(state.perMonth.used).toBe(0);
    expect(state.perYear.used).toBe(6);
    expect(state.canChange).toBe(false);
    const blocked = await rename(u, "Sétimo");
    expect(blocked.status).toBe(429);
    // libera quando a troca mais antiga completa um ano
    expect(new Date(blocked.body.error.details.nextAvailableAt).getTime()).toBe(Date.parse(DEFAULT_NOW) + 365 * DAY);
  });

  it("o limite é de cada pessoa", async () => {
    const a = await member();
    const b = await member();
    await rename(a, "A1");
    await rename(a, "A2");
    await rename(a, "A3");
    expect((await rename(a, "A4")).status).toBe(429);
    await rename(b, "B1");
    expect((await rename(b, "B2")).status).toBe(200);
  });
});

describe("Minha conta: trocar o e-mail", () => {
  it("exige a senha certa e um e-mail diferente do atual", async () => {
    const u = await member();
    const wrong = await u.post("/v1/me/change-email", { newEmail: "novo@teste.dev", password: "errada" });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe("WRONG_PASSWORD");
    const same = await u.post("/v1/me/change-email", { newEmail: u.email.toUpperCase(), password: u.password });
    expect(same.body.error.code).toBe("SAME_EMAIL");
    expect((await u.post("/v1/me/change-email", { newEmail: "isso-nao-e-email", password: u.password })).status).toBe(422);
    expect(env.auth.emailChanges.filter((c) => c.userId === u.id)).toHaveLength(0);
  });

  it("pede a confirmação no endereço novo (com o destino vindo da configuração) e só muda depois do clique no link", async () => {
    const u = await member();
    const newEmail = `novo-${randomBytes(3).toString("hex")}@teste.dev`;
    const res = await u.post("/v1/me/change-email", { newEmail, password: u.password, platform: "web" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, pendingEmail: newEmail });
    const req = env.auth.emailChanges.at(-1)!;
    expect(req).toMatchObject({ userId: u.id, newEmail, redirectTo: "https://app.exemplo.test/confirm-email" });

    // Ainda não confirmou: o e-mail da conta é o mesmo.
    expect((await u.get("/v1/me")).body.email).toBe(u.email);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(u.email);

    // Clica no link: o provedor passa a emitir tokens com o e-mail novo e a conta local acompanha.
    env.auth.confirmEmailChange(u.id);
    const session = await env.auth.signIn(newEmail, u.password);
    const after = env.asUser(session, u.password);
    expect((await after.get("/v1/me")).body.email).toBe(newEmail);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(newEmail);
  });

  it("no celular o link volta para o aplicativo (deep link)", async () => {
    const u = await member();
    await u.post("/v1/me/change-email", { newEmail: `cel-${randomBytes(3).toString("hex")}@teste.dev`, password: u.password, platform: "native" });
    expect(env.auth.emailChanges.at(-1)!.redirectTo).toBe("financa://confirm-email");
  });

  it("e-mail de outra conta tem a MESMA resposta (não revela quem está cadastrado) e não envia nada", async () => {
    const u = await member();
    const other = await member();
    const before = env.auth.emailChanges.length;
    const res = await u.post("/v1/me/change-email", { newEmail: other.email, password: u.password });
    expect(res.status).toBe(200);
    expect(res.body.pendingEmail).toBe(other.email);
    expect(env.auth.emailChanges).toHaveLength(before);
  });

  it("1 troca por mês e 3 por ano: a segunda no mês é recusada", async () => {
    const u = await member();
    const mk = () => `e-${randomBytes(3).toString("hex")}@teste.dev`;
    expect((await u.post("/v1/me/change-email", { newEmail: mk(), password: u.password })).status).toBe(200);
    const second = await u.post("/v1/me/change-email", { newEmail: mk(), password: u.password });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("CHANGE_LIMIT_REACHED");
    expect((await u.get("/v1/me/account")).body.limits.EMAIL).toMatchObject({ canChange: false, perMonth: { used: 1, max: 1 } });
    env.setNow(new Date(Date.parse(DEFAULT_NOW) + 31 * DAY).toISOString());
    expect((await u.post("/v1/me/change-email", { newEmail: mk(), password: u.password })).status).toBe(200);
  });

  it("o pedido fica na auditoria sem o e-mail", async () => {
    const u = await member();
    const newEmail = `audit-${randomBytes(3).toString("hex")}@teste.dev`;
    await u.post("/v1/me/change-email", { newEmail, password: u.password });
    const rows = await env.prisma.auditLog.findMany({ where: { actorId: u.id, action: "account.email_change_requested" } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(newEmail);
  });
});

describe("Minha conta: senha e link de redefinição", () => {
  it("troca a senha e conta no limite (3 por mês); o limite é só da senha", async () => {
    const u = await member();
    let current = u.password;
    for (const next of ["novaSenha111", "novaSenha222", "novaSenha333"]) {
      const res = await u.post("/v1/me/change-password", { currentPassword: current, newPassword: next });
      expect(res.status).toBe(200);
      current = next;
    }
    const blocked = await u.post("/v1/me/change-password", { currentPassword: current, newPassword: "novaSenha444" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("CHANGE_LIMIT_REACHED");
    expect((await u.get("/v1/me/account")).body.limits.PASSWORD.perMonth.used).toBe(3);
    expect((await u.get("/v1/me/account")).body.limits.EMAIL.perMonth.used).toBe(0);
  });

  it("senha atual errada continua sendo recusada e NÃO gasta o limite", async () => {
    const u = await member();
    const res = await u.post("/v1/me/change-password", { currentPassword: "errada-errada", newPassword: "novaSenha111" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("WRONG_PASSWORD");
    expect((await u.get("/v1/me/account")).body.limits.PASSWORD.perMonth.used).toBe(0);
  });

  it("manda o link de redefinição para o próprio e-mail, com o destino da configuração", async () => {
    const u = await member();
    const res = await u.post("/v1/me/reset-link");
    expect(res.status).toBe(200);
    expect(env.auth.passwordResets.at(-1)).toBe(u.email);
    expect((await env.anon.post("/v1/me/reset-link")).status).toBe(401);
  });
});

describe("Primeiro acesso: avisos que saem uma vez", () => {
  it("a pergunta da verificação em duas etapas e o aviso do teste grátis são marcados como vistos, em qualquer aparelho", async () => {
    const u = await member();
    const before = (await u.get("/v1/me")).body;
    expect(before.security).toMatchObject({ mfaEnabled: false, promptAnswered: false, hasPassword: true });
    expect(before.notices).toEqual({ trialIntroSeen: false });

    expect((await u.post("/v1/me/security-prompt")).status).toBe(200);
    expect((await u.post("/v1/me/security-prompt")).status).toBe(200); // repetir não faz mal
    expect((await u.post("/v1/me/trial-intro-seen")).status).toBe(200);
    const after = (await u.get("/v1/me")).body;
    expect(after.security.promptAnswered).toBe(true);
    expect(after.notices.trialIntroSeen).toBe(true);
    expect((await env.anon.post("/v1/me/security-prompt")).status).toBe(401);
  });
});

// ================================================================================================ conta sem senha (login social)

describe("Conta criada por login social (sem senha)", () => {
  it("o primeiro acesso cria a conta com o nome do provedor e cai na tela de aceite dos Termos", async () => {
    const { user, email } = await socialUser({ name: "Maria Souza" });
    const me = (await user.get("/v1/me")).body;
    expect(me.email).toBe(email);
    expect(me.profile.displayName).toBe("Maria Souza");
    expect(me.consentRequired).toBe(true);
    expect(me.security).toMatchObject({ hasPassword: false, mfaEnabled: false });
    expect((await user.get("/v1/accounts")).body.error.code).toBe("CONSENT_REQUIRED");
    const acc = (await user.get("/v1/me/account")).body.security;
    expect(acc).toMatchObject({ hasPassword: false, canChangeEmail: false, providers: ["google"] });
  });

  it("não troca o e-mail por aqui (ele pertence ao provedor) nem pede link de senha", async () => {
    const { user } = await socialUser();
    const res = await user.post("/v1/me/change-email", { newEmail: "outro@teste.dev", password: "qualquer" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_MANAGED_BY_PROVIDER");
    expect((await user.post("/v1/me/reset-link")).body.error.code).toBe("NO_PASSWORD");
  });

  it("define a primeira senha sem senha atual, com um login recente; depois a conta passa a ter senha", async () => {
    const { user, session } = await socialUser();
    const res = await user.post("/v1/me/change-password", { newPassword: "primeiraSenha1" });
    expect(res.status).toBe(200);
    // Um token novo já traz a entrada por e-mail e senha.
    const fresh = env.asUser({ ...session, accessToken: await env.auth.issueToken(user.id) });
    expect((await fresh.get("/v1/me")).body.security.hasPassword).toBe(true);
    expect((await env.auth.signIn(user.email, "primeiraSenha1")).user.id).toBe(user.id);
  });

  it("login ANTIGO não basta para definir senha nem apagar a conta (pede para entrar de novo)", async () => {
    const { user, session } = await socialUser();
    const staleAuthAt = Math.floor(env.now().getTime() / 1000) - 3_600;
    const stale = env.asUser({ ...session, accessToken: await env.auth.issueToken(user.id, { authAt: staleAuthAt }) });
    const pass = await stale.post("/v1/me/change-password", { newPassword: "primeiraSenha1" });
    expect(pass.status).toBe(401);
    expect(pass.body.error.code).toBe("REAUTH_REQUIRED");
    const del = await stale.delete("/v1/me", { body: { confirm: "EXCLUIR" } });
    expect(del.body.error.code).toBe("REAUTH_REQUIRED");
    expect(await env.prisma.user.count({ where: { id: user.id } })).toBe(1);
  });

  it("com login recente, apaga a conta só confirmando a palavra EXCLUIR", async () => {
    const { user } = await socialUser();
    await user.get("/v1/me");
    expect((await user.delete("/v1/me", { body: { confirm: "EXCLUIR" } })).status).toBe(200);
    expect(env.auth.deletedUserIds).toContain(user.id);
    expect(await env.prisma.user.count({ where: { id: user.id } })).toBe(0);
  });

  it("conta com senha continua exigindo a senha para apagar", async () => {
    const u = await member();
    const none = await u.delete("/v1/me", { body: { confirm: "EXCLUIR" } });
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe("WRONG_PASSWORD");
    expect(await env.prisma.user.count({ where: { id: u.id } })).toBe(1);
  });
});

describe("Login por outras contas: início e troca do código (PKCE)", () => {
  it("só mostra os provedores ligados no servidor, e Instagram não existe (entra pelo Facebook)", async () => {
    const res = await env.anon.get("/v1/auth/oauth/providers");
    expect(res.body.providers).toEqual([
      { id: "google", label: "Google" },
      { id: "facebook", label: "Facebook" },
    ]);
    const { challenge } = pkce();
    expect((await env.anon.post("/v1/auth/oauth/start", { provider: "instagram", codeChallenge: challenge })).status).toBe(422);
  });

  it("provedor que existe mas não está ligado: 404", async () => {
    const { challenge } = pkce();
    const res = await env.anon.post("/v1/auth/oauth/start", { provider: "apple", codeChallenge: challenge, platform: "web" });
    expect(res.status).toBe(404);
  });

  it("o endereço de retorno vem SEMPRE da configuração (web ou celular), nunca do pedido", async () => {
    const { challenge } = pkce();
    const web = await env.anon.post("/v1/auth/oauth/start", { provider: "google", codeChallenge: challenge, platform: "web" });
    expect(web.status).toBe(200);
    expect(web.body.url).toContain("oauth.fake.local");
    expect(env.auth.oauthStarts.at(-1)).toEqual({ provider: "google", redirectTo: WEB_REDIRECT, codeChallenge: challenge });
    await env.anon.post("/v1/auth/oauth/start", { provider: "facebook", codeChallenge: challenge });
    expect(env.auth.oauthStarts.at(-1)!.redirectTo).toBe(NATIVE_REDIRECT);
    // campo extra (tentativa de escolher o destino) é recusado
    expect((await env.anon.post("/v1/auth/oauth/start", { provider: "google", codeChallenge: challenge, redirectTo: "https://malicioso.example" })).status).toBe(422);
  });

  it("a troca só funciona com o verifier que gerou o desafio, e o código vale uma vez", async () => {
    const { verifier, challenge } = pkce();
    const { code } = env.auth.issueOauthCode({ email: `pkce-${randomBytes(3).toString("hex")}@gmail.test`, codeChallenge: challenge });
    const other = pkce();
    const wrong = await env.anon.post("/v1/auth/oauth/exchange", { code, codeVerifier: other.verifier });
    expect(wrong.status).toBe(401);
    const ok = await env.anon.post("/v1/auth/oauth/exchange", { code, codeVerifier: verifier });
    expect(ok.status).toBe(200);
    expect(ok.body.mfa).toBeNull();
    expect(ok.body.accessToken).toBeTruthy();
    expect((await env.anon.post("/v1/auth/oauth/exchange", { code, codeVerifier: verifier })).status).toBe(401);
  });

  it("e-mail que já tem conta por senha entra na MESMA conta (o provedor liga as identidades)", async () => {
    const u = await member();
    const { verifier, challenge } = pkce();
    const { code, userId } = env.auth.issueOauthCode({ email: u.email, codeChallenge: challenge });
    expect(userId).toBe(u.id);
    const res = await env.anon.post("/v1/auth/oauth/exchange", { code, codeVerifier: verifier });
    expect((await env.asUser(res.body).get("/v1/me")).body.id).toBe(u.id);
  });

  it("sem endereço de retorno para a plataforma, avisa que não está disponível", async () => {
    const e = await createTestEnv({ OAUTH_PROVIDERS: "google", OAUTH_WEB_REDIRECT_URL: WEB_REDIRECT });
    try {
      const { challenge } = pkce();
      const native = await e.anon.post("/v1/auth/oauth/start", { provider: "google", codeChallenge: challenge, platform: "native" });
      expect(native.status).toBe(503);
      expect(native.body.error.code).toBe("OAUTH_NOT_CONFIGURED");
    } finally {
      await e.close();
    }
  });

  it("sem OAUTH_PROVIDERS ninguém vê botão nenhum", async () => {
    const e = await createTestEnv();
    try {
      expect((await e.anon.get("/v1/auth/oauth/providers")).body.providers).toEqual([]);
    } finally {
      await e.close();
    }
  });
});

// ================================================================================================ verificação em duas etapas

describe("Verificação em duas etapas (TOTP)", () => {
  it("ligar: cria o fator, o código errado não liga nada e o certo liga e devolve a sessão verificada", async () => {
    const u = await member();
    const enrolled = await u.post("/v1/me/mfa/enroll");
    expect(enrolled.status).toBe(200);
    expect(enrolled.body).toMatchObject({ factorId: expect.any(String), secret: expect.stringMatching(/^[A-Z2-7]{20,}$/), uri: expect.stringMatching(/^otpauth:\/\//) });
    expect(enrolled.body.qrSvg).toContain("<svg");

    const bad = await u.post("/v1/me/mfa/enable", { factorId: enrolled.body.factorId, code: "000000" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("INVALID_MFA_CODE");
    expect((await u.get("/v1/me")).body.security.mfaEnabled).toBe(false);

    const ok = await u.post("/v1/me/mfa/enable", { factorId: enrolled.body.factorId, code: env.auth.codeFor(u.id, enrolled.body.factorId) });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    const aal2 = env.asUser(ok.body);
    const me = (await aal2.get("/v1/me")).body;
    expect(me.security.mfaEnabled).toBe(true);
    const account = (await aal2.get("/v1/me/account")).body.security.mfa;
    expect(account.enabled).toBe(true);
    expect(account.enabledAt).not.toBeNull();
    expect(await env.prisma.auditLog.count({ where: { actorId: u.id, action: "auth.mfa_enabled" } })).toBe(1);
  });

  it("o código precisa ter 6 números e o aparelho não liga duas vezes", async () => {
    const u = await member();
    const { factorId } = (await u.post("/v1/me/mfa/enroll")).body;
    for (const code of ["12345", "abcdef", "1234567", ""]) expect((await u.post("/v1/me/mfa/enable", { factorId, code })).status, code).toBe(422);
    const { aal2 } = await enableMfa(u);
    const again = await aal2.post("/v1/me/mfa/enroll");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("MFA_ALREADY_ENABLED");
  });

  it("depois de ligada, a sessão antiga (só senha) NÃO abre nada: toda rota autenticada responde MFA_REQUIRED", async () => {
    const u = await member();
    const { factorId } = await enableMfa(u);
    for (const path of ["/v1/me", "/v1/accounts", "/v1/dashboard", "/v1/me/account", "/v1/billing"]) {
      const res = await u.get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code, path).toBe("MFA_REQUIRED");
      expect(res.body.error.details).toEqual({ factorId });
    }
    expect((await u.post("/v1/me/mfa/disable", { code: "123456" })).body.error.code).toBe("MFA_REQUIRED");
  });

  it("login: a senha sozinha devolve o fator a confirmar; com o código vira uma sessão que funciona", async () => {
    const u = await member();
    const { factorId } = await enableMfa(u);
    const login = await env.anon.post("/v1/auth/login", { email: u.email, password: u.password });
    expect(login.status).toBe(200);
    expect(login.body.mfa).toEqual({ factorId });
    const partial = env.asUser(login.body, u.password);
    expect((await partial.get("/v1/me")).body.error.code).toBe("MFA_REQUIRED");

    const wrong = await env.call("POST", "/v1/auth/mfa/verify", { body: { factorId, code: "000000" }, token: partial.token });
    expect(wrong.status).toBe(422);
    const ok = await env.call("POST", "/v1/auth/mfa/verify", { body: { factorId, code: env.auth.codeFor(u.id, factorId) }, token: partial.token });
    expect(ok.status).toBe(200);
    expect((await env.asUser(ok.body).get("/v1/me")).status).toBe(200);
    expect(await env.prisma.auditLog.count({ where: { actorId: u.id, action: "auth.mfa_verified" } })).toBe(1);
  });

  it("conta sem verificação ligada entra direto (mfa nulo)", async () => {
    const u = await member();
    const login = await env.anon.post("/v1/auth/login", { email: u.email, password: u.password });
    expect(login.body.mfa).toBeNull();
    expect((await env.asUser(login.body).get("/v1/me")).status).toBe(200);
  });

  it("5 códigos errados travam a conta por 15 minutos, mesmo com o código certo depois", async () => {
    const u = await member();
    const { factorId } = await enableMfa(u);
    const partial = env.asUser((await env.anon.post("/v1/auth/login", { email: u.email, password: u.password })).body);
    for (let i = 0; i < 5; i++) {
      const r = await env.call("POST", "/v1/auth/mfa/verify", { body: { factorId, code: "000000" }, token: partial.token });
      expect(r.status).toBe(422);
    }
    const locked = await env.call("POST", "/v1/auth/mfa/verify", { body: { factorId, code: env.auth.codeFor(u.id, factorId) }, token: partial.token });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("MFA_LOCKED");
  });

  it("não aceita o fator de outra pessoa nem sem sessão", async () => {
    const a = await member();
    const b = await member();
    const fa = await enableMfa(a);
    const fb = await enableMfa(b);
    const partialB = env.asUser((await env.anon.post("/v1/auth/login", { email: b.email, password: b.password })).body);
    const stolen = await env.call("POST", "/v1/auth/mfa/verify", { body: { factorId: fa.factorId, code: env.auth.codeFor(a.id, fa.factorId) }, token: partialB.token });
    expect(stolen.status).toBe(403);
    expect(stolen.body.error.code).toBe("MFA_NOT_ENABLED");
    expect((await env.call("POST", "/v1/auth/mfa/verify", { body: { factorId: fb.factorId, code: "123456" } })).status).toBe(401);
  });

  it("desligar exige um código válido agora; depois a sessão só com senha volta a funcionar", async () => {
    const u = await member();
    const { aal2 } = await enableMfa(u);
    const bad = await aal2.post("/v1/me/mfa/disable", { code: "000000" });
    expect(bad.status).toBe(422);
    expect((await aal2.get("/v1/me")).body.security.mfaEnabled).toBe(true);

    const ok = await aal2.post("/v1/me/mfa/disable", { code: env.auth.codeFor(u.id) });
    expect(ok.status).toBe(200);
    expect(env.auth.factorsOf(u.id)).toEqual([]);
    expect((await u.get("/v1/me")).status).toBe(200); // a sessão antiga (aal1) já serve
    expect((await u.get("/v1/me")).body.security.mfaEnabled).toBe(false);
    expect((await aal2.post("/v1/me/mfa/disable", { code: "123456" })).body.error.code).toBe("MFA_NOT_ENABLED");
    expect(await env.prisma.auditLog.count({ where: { actorId: u.id, action: "auth.mfa_disabled" } })).toBe(1);
  });

  it("com a verificação ligada, trocar a senha e o e-mail usa a sessão verificada", async () => {
    const u = await member();
    const { aal2 } = await enableMfa(u);
    const res = await aal2.post("/v1/me/change-password", { currentPassword: u.password, newPassword: "senhaNova123" });
    expect(res.status).toBe(200);
    const mail = await aal2.post("/v1/me/change-email", { newEmail: `mfa-${randomBytes(3).toString("hex")}@teste.dev`, password: "senhaNova123" });
    expect(mail.status).toBe(200);
  });

  it("quem entra por Google com verificação ligada também precisa do código", async () => {
    const { user, session } = await socialUser();
    await user.get("/v1/me");
    const { factorId } = await enableMfa(user);
    // novo login social: devolve o fator pendente
    const { verifier, challenge } = pkce();
    const { code } = env.auth.issueOauthCode({ email: user.email, codeChallenge: challenge });
    const again = await env.anon.post("/v1/auth/oauth/exchange", { code, codeVerifier: verifier });
    expect(again.body.mfa).toEqual({ factorId });
    expect((await env.asUser(again.body).get("/v1/me")).body.error.code).toBe("MFA_REQUIRED");
    expect(session.accessToken).toBeTruthy();
  });
});

// ================================================================================================ configuração

describe("configuração do login por outras contas", () => {
  const base = { NODE_ENV: "development", DATABASE_URL: "postgres://x" };

  it("por padrão não há provedor nenhum", () => {
    expect(loadConfig(base).OAUTH_PROVIDERS).toEqual([]);
  });

  it("aceita só provedores conhecidos; Instagram é recusado", () => {
    expect(loadConfig({ ...base, OAUTH_PROVIDERS: "google, facebook", OAUTH_WEB_REDIRECT_URL: WEB_REDIRECT }).OAUTH_PROVIDERS).toEqual(["google", "facebook"]);
    expect(() => loadConfig({ ...base, OAUTH_PROVIDERS: "instagram", OAUTH_WEB_REDIRECT_URL: WEB_REDIRECT })).toThrow(/OAUTH_PROVIDERS/);
  });

  it("exige um endereço de retorno quando há provedor, e não vale no login local de desenvolvimento", () => {
    expect(() => loadConfig({ ...base, OAUTH_PROVIDERS: "google" })).toThrow(/OAUTH_WEB_REDIRECT_URL/);
    expect(() => loadConfig({ ...base, OAUTH_PROVIDERS: "google", OAUTH_REDIRECT_URL: NATIVE_REDIRECT }).OAUTH_PROVIDERS).not.toThrow();
    expect(() => loadConfig({ ...base, AUTH_MODE: "dev", OAUTH_PROVIDERS: "google", OAUTH_WEB_REDIRECT_URL: WEB_REDIRECT })).toThrow(/AUTH_MODE=supabase/);
  });
});
