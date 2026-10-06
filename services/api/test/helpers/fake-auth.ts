import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { AppError } from "../../src/lib/errors";
import type { AuthProvider, MfaEnrollment, ProviderSession, SignUpResult } from "../../src/modules/auth/provider";

export const TEST_JWT_SECRET = "test-secret-test-secret-test-secret-123456";
export const TEST_SUPABASE_URL = "https://test.supabase.local";
export const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;

type FakeFactor = { id: string; secret: Buffer; verified: boolean };

type FakeUser = {
  id: string;
  email: string;
  password: string | null;
  confirmed: boolean;
  metadata: Record<string, unknown>;
  /** Formas de entrar: "email" (com senha) e/ou provedores de login social. */
  providers: string[];
  factors: FakeFactor[];
};

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Código TOTP (RFC 6238: HMAC-SHA1, passo de 30 s, 6 dígitos): o mesmo cálculo de um aplicativo autenticador. */
export function totp(secret: Buffer, atMs: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const h = createHmac("sha1", secret).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/**
 * Provedor de autenticação em memória para os testes. Emite JWTs HS256 REAIS, então a
 * verificação (assinatura, emissor, audiência, expiração) roda de verdade na API.
 * Também simula a verificação em duas etapas (TOTP de verdade), a troca de e-mail e o login por outra conta (PKCE).
 */
export class FakeAuthProvider implements AuthProvider {
  readonly users = new Map<string, FakeUser>();
  readonly deletedUserIds: string[] = [];
  readonly signOuts: { scope: string }[] = [];
  /** Quando true, novos cadastros ficam não confirmados e não recebem sessão. */
  requireVerification = false;
  /** Força falha na exclusão (testa o rollback). */
  failDelete = false;
  /** Pedidos de troca de e-mail recebidos (o link de confirmação é "clicado" com `confirmEmailChange`). */
  readonly emailChanges: Array<{ userId: string; newEmail: string; redirectTo?: string }> = [];
  /** E-mails de recuperação de senha pedidos. */
  readonly passwordResets: string[] = [];
  /** Usuários cujos fatores foram removidos pelo suporte. */
  readonly mfaRemovedByAdmin: string[] = [];
  /** Início de login por outra conta: o que o servidor pediu ao provedor. */
  readonly oauthStarts: Array<{ provider: string; redirectTo: string; codeChallenge: string }> = [];

  private readonly refreshTokens = new Map<string, string>();
  private readonly oauthCodes = new Map<string, { userId: string; challenge: string }>();

  private byEmail(email: string): FakeUser | undefined {
    return [...this.users.values()].find((u) => u.email === email);
  }

  async issueToken(userId: string, overrides: { expSeconds?: number; secret?: string; aud?: string; iss?: string; aal?: "aal1" | "aal2"; iat?: number; authAt?: number } = {}): Promise<string> {
    const user = this.users.get(userId);
    if (!user) throw new Error("usuário inexistente");
    const now = overrides.iat ?? Math.floor(Date.now() / 1000);
    return new SignJWT({
      email: user.email,
      role: "authenticated",
      user_metadata: user.metadata,
      app_metadata: { provider: user.providers[0] ?? "email", providers: user.providers },
      aal: overrides.aal ?? "aal1",
      amr: [{ method: user.password === null ? "oauth" : "password", timestamp: overrides.authAt ?? now }],
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setAudience(overrides.aud ?? "authenticated")
      .setIssuer(overrides.iss ?? TEST_ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(now + (overrides.expSeconds ?? 3600))
      .sign(new TextEncoder().encode(overrides.secret ?? TEST_JWT_SECRET));
  }

  private async session(user: FakeUser, aal: "aal1" | "aal2" = "aal1", iat?: number): Promise<ProviderSession> {
    const refresh = `refresh-${randomUUID()}`;
    this.refreshTokens.set(refresh, user.id);
    const now = Math.floor(Date.now() / 1000);
    return {
      accessToken: await this.issueToken(user.id, { aal, iat }),
      refreshToken: refresh,
      expiresIn: 3600,
      expiresAt: now + 3600,
      user: { id: user.id, email: user.email },
    };
  }

  private async userOf(accessToken: string): Promise<{ user: FakeUser; aal: string }> {
    const { payload } = await jwtVerify(accessToken, new TextEncoder().encode(TEST_JWT_SECRET), { issuer: TEST_ISSUER, audience: "authenticated" }).catch(() => {
      throw new AppError(401, "INVALID_TOKEN", "Sessão inválida");
    });
    const user = this.users.get(String(payload.sub));
    if (!user) throw new AppError(401, "INVALID_TOKEN", "Sessão inválida");
    return { user, aal: String(payload.aal ?? "aal1") };
  }

  /** Destino pedido para o link do e-mail de confirmação, em cada cadastro/reenvio (para os testes conferirem). */
  readonly confirmRedirects: Array<{ kind: "signup" | "resend"; email: string; redirectTo?: string }> = [];

  async signUp(input: { email: string; password: string; metadata: Record<string, unknown>; redirectTo?: string }): Promise<SignUpResult> {
    this.confirmRedirects.push({ kind: "signup", email: input.email, redirectTo: input.redirectTo });
    if (this.byEmail(input.email)) {
      // Igual ao provedor real: não revela que o e-mail já existe.
      return { userId: null, session: null, requiresEmailVerification: true };
    }
    const user: FakeUser = {
      id: randomUUID(),
      email: input.email,
      password: input.password,
      confirmed: !this.requireVerification,
      metadata: input.metadata,
      providers: ["email"],
      factors: [],
    };
    this.users.set(user.id, user);
    if (this.requireVerification) return { userId: user.id, session: null, requiresEmailVerification: true };
    return { userId: user.id, session: await this.session(user), requiresEmailVerification: false };
  }

  async signIn(email: string, password: string): Promise<ProviderSession> {
    const user = this.byEmail(email);
    if (!user || user.password === null || user.password !== password) {
      throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos");
    }
    if (!user.confirmed) throw new AppError(403, "EMAIL_NOT_VERIFIED", "Confirme seu e-mail antes de entrar");
    return this.session(user);
  }

  async refresh(refreshToken: string): Promise<ProviderSession> {
    const id = this.refreshTokens.get(refreshToken);
    const user = id ? this.users.get(id) : undefined;
    if (!user) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Sessão expirada. Entre novamente.");
    this.refreshTokens.delete(refreshToken);
    return this.session(user);
  }

  async signOut(_accessToken: string, scope: "global" | "local" | "others" = "global"): Promise<void> {
    this.signOuts.push({ scope });
  }

  async requestPasswordReset(email?: string): Promise<void> {
    this.passwordResets.push(email ?? "");
  }
  async resendVerification(email?: string, redirectTo?: string): Promise<void> {
    this.confirmRedirects.push({ kind: "resend", email: email ?? "", redirectTo });
  }

  async updatePassword(accessToken: string, newPassword: string): Promise<void> {
    const { user } = await this.userOf(accessToken);
    user.password = newPassword;
    // Quem entrava só por Google/Facebook passa a ter também a entrada por e-mail e senha.
    if (!user.providers.includes("email")) user.providers.push("email");
  }

  async deleteUser(userId: string): Promise<void> {
    if (this.failDelete) throw new AppError(502, "AUTH_PROVIDER_ERROR", "Serviço de autenticação indisponível");
    this.users.delete(userId);
    this.deletedUserIds.push(userId);
  }

  // ---------------------------------------------------------------------------------------------- troca de e-mail

  async requestEmailChange(accessToken: string, newEmail: string, redirectTo?: string): Promise<void> {
    const { user } = await this.userOf(accessToken);
    // E-mail de outra conta: não revela (nada é enviado).
    if (this.byEmail(newEmail)) return;
    this.emailChanges.push({ userId: user.id, newEmail, redirectTo });
  }

  /** "Clica no link" do e-mail enviado ao endereço novo: o e-mail da conta passa a ser o novo. */
  confirmEmailChange(userId: string): void {
    const pending = [...this.emailChanges].reverse().find((c) => c.userId === userId);
    const user = this.users.get(userId);
    if (!pending || !user) throw new Error("não há troca de e-mail pendente");
    user.email = pending.newEmail;
  }

  // ---------------------------------------------------------------------------------------------- verificação em duas etapas

  async mfaEnroll(accessToken: string): Promise<MfaEnrollment> {
    const { user } = await this.userOf(accessToken);
    user.factors = user.factors.filter((f) => f.verified); // apaga os que ficaram pela metade
    const factor: FakeFactor = { id: randomUUID(), secret: randomBytes(20), verified: false };
    user.factors.push(factor);
    const secret = base32(factor.secret);
    return { factorId: factor.id, secret, uri: `otpauth://totp/Finan%C3%A7a:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Finan%C3%A7a` };
  }

  async mfaVerify(accessToken: string, factorId: string, code: string): Promise<ProviderSession> {
    const { user } = await this.userOf(accessToken);
    const factor = user.factors.find((f) => f.id === factorId);
    if (!factor) throw new AppError(404, "NOT_FOUND", "Fator de verificação não encontrado");
    const now = Date.now();
    const ok = [-30_000, 0, 30_000].some((drift) => totp(factor.secret, now + drift) === code);
    if (!ok) throw new AppError(422, "INVALID_MFA_CODE", "Código incorreto ou expirado.");
    factor.verified = true;
    return this.session(user, "aal2");
  }

  async mfaUnenroll(accessToken: string, factorId: string): Promise<void> {
    const { user, aal } = await this.userOf(accessToken);
    const factor = user.factors.find((f) => f.id === factorId);
    if (!factor) throw new AppError(404, "NOT_FOUND", "Fator de verificação não encontrado");
    // Como no provedor real: desligar um fator já confirmado exige uma sessão aal2.
    if (factor.verified && aal !== "aal2") throw new AppError(401, "MFA_REQUIRED", "Confirme o código para continuar.");
    user.factors = user.factors.filter((f) => f.id !== factorId);
  }

  async adminRemoveMfa(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.factors = [];
    this.mfaRemovedByAdmin.push(userId);
  }

  /** Código que o aplicativo autenticador mostraria agora para o fator (usado pelos testes no lugar do celular). */
  codeFor(userId: string, factorId?: string, atMs: number = Date.now()): string {
    const user = this.users.get(userId);
    const factor = user?.factors.find((f) => !factorId || f.id === factorId);
    if (!factor) throw new Error("fator inexistente");
    return totp(factor.secret, atMs);
  }

  factorsOf(userId: string): { id: string; verified: boolean }[] {
    return (this.users.get(userId)?.factors ?? []).map((f) => ({ id: f.id, verified: f.verified }));
  }

  // ---------------------------------------------------------------------------------------------- login por outra conta

  oauthAuthorizeUrl(input: { provider: string; redirectTo: string; codeChallenge: string }): string {
    this.oauthStarts.push(input);
    return `https://oauth.fake.local/authorize?provider=${input.provider}&redirect_to=${encodeURIComponent(input.redirectTo)}&code_challenge=${input.codeChallenge}&code_challenge_method=s256`;
  }

  /**
   * Simula a pessoa autorizando no Google/Facebook: cria a conta (se não existir) sem senha e devolve o código que o provedor mandaria
   * para o endereço de retorno. A troca só funciona com o verifier cujo SHA-256 é o desafio informado no início.
   */
  issueOauthCode(input: { email: string; provider?: string; name?: string; codeChallenge: string }): { code: string; userId: string } {
    const provider = input.provider ?? "google";
    let user = this.byEmail(input.email);
    if (!user) {
      user = { id: randomUUID(), email: input.email, password: null, confirmed: true, metadata: input.name ? { full_name: input.name, name: input.name, email_verified: true } : { email_verified: true }, providers: [provider], factors: [] };
      this.users.set(user.id, user);
    } else if (!user.providers.includes(provider)) {
      user.providers.push(provider);
    }
    const code = `code-${randomUUID()}`;
    this.oauthCodes.set(code, { userId: user.id, challenge: input.codeChallenge });
    return { code, userId: user.id };
  }

  async oauthExchange(code: string, codeVerifier: string): Promise<ProviderSession> {
    const entry = this.oauthCodes.get(code);
    if (!entry || s256(codeVerifier) !== entry.challenge) throw new AppError(401, "INVALID_CREDENTIALS", "Não foi possível autenticar");
    this.oauthCodes.delete(code); // o código vale uma vez
    const user = this.users.get(entry.userId);
    if (!user) throw new AppError(401, "INVALID_CREDENTIALS", "Não foi possível autenticar");
    return this.session(user);
  }
}
