import { jwtVerify, SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { AppError } from "../../src/lib/errors";
import type { AuthProvider, ProviderSession, SignUpResult } from "../../src/modules/auth/provider";

export const TEST_JWT_SECRET = "test-secret-test-secret-test-secret-123456";
export const TEST_SUPABASE_URL = "https://test.supabase.local";
export const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;

type FakeUser = {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
  metadata: Record<string, unknown>;
};

/**
 * Provedor de autenticação em memória para os testes. Emite JWTs HS256 REAIS, então a
 * verificação (assinatura, emissor, audiência, expiração) roda de verdade na API.
 */
export class FakeAuthProvider implements AuthProvider {
  readonly users = new Map<string, FakeUser>();
  readonly deletedUserIds: string[] = [];
  readonly signOuts: { scope: string }[] = [];
  /** Quando true, novos cadastros ficam não confirmados e não recebem sessão. */
  requireVerification = false;
  /** Força falha na exclusão (testa o rollback). */
  failDelete = false;

  private readonly refreshTokens = new Map<string, string>();

  private byEmail(email: string): FakeUser | undefined {
    return [...this.users.values()].find((u) => u.email === email);
  }

  async issueToken(userId: string, overrides: { expSeconds?: number; secret?: string; aud?: string; iss?: string } = {}): Promise<string> {
    const user = this.users.get(userId);
    if (!user) throw new Error("usuário inexistente");
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      email: user.email,
      role: "authenticated",
      user_metadata: user.metadata,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setAudience(overrides.aud ?? "authenticated")
      .setIssuer(overrides.iss ?? TEST_ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(now + (overrides.expSeconds ?? 3600))
      .sign(new TextEncoder().encode(overrides.secret ?? TEST_JWT_SECRET));
  }

  private async session(user: FakeUser): Promise<ProviderSession> {
    const refresh = `refresh-${randomUUID()}`;
    this.refreshTokens.set(refresh, user.id);
    const now = Math.floor(Date.now() / 1000);
    return {
      accessToken: await this.issueToken(user.id),
      refreshToken: refresh,
      expiresIn: 3600,
      expiresAt: now + 3600,
      user: { id: user.id, email: user.email },
    };
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
    };
    this.users.set(user.id, user);
    if (this.requireVerification) return { userId: user.id, session: null, requiresEmailVerification: true };
    return { userId: user.id, session: await this.session(user), requiresEmailVerification: false };
  }

  async signIn(email: string, password: string): Promise<ProviderSession> {
    const user = this.byEmail(email);
    if (!user || user.password !== password) {
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

  async requestPasswordReset(): Promise<void> {}
  async resendVerification(email?: string, redirectTo?: string): Promise<void> {
    this.confirmRedirects.push({ kind: "resend", email: email ?? "", redirectTo });
  }

  async updatePassword(accessToken: string, newPassword: string): Promise<void> {
    const { payload } = await jwtVerify(accessToken, new TextEncoder().encode(TEST_JWT_SECRET), {
      issuer: TEST_ISSUER,
      audience: "authenticated",
    }).catch(() => {
      throw new AppError(401, "INVALID_TOKEN", "Sessão inválida");
    });
    const user = this.users.get(String(payload.sub));
    if (!user) throw new AppError(401, "INVALID_TOKEN", "Sessão inválida");
    user.password = newPassword;
  }

  async deleteUser(userId: string): Promise<void> {
    if (this.failDelete) throw new AppError(502, "AUTH_PROVIDER_ERROR", "Serviço de autenticação indisponível");
    this.users.delete(userId);
    this.deletedUserIds.push(userId);
  }
}
