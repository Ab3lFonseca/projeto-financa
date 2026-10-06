import { jwtVerify, SignJWT } from "jose";
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { Errors } from "../../lib/errors";
import type { AuthProvider, ProviderSession, SignUpResult } from "./provider";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const DEV_ISSUER = "financa-dev";
export const DEV_AUDIENCE = "authenticated";

type DevUser = { id: string; email: string; salt: string; hash: string; metadata: Record<string, unknown> };
type Store = { users: DevUser[] };

/**
 * Autenticação LOCAL para desenvolvimento (AUTH_MODE=dev). Serve para rodar o app sem criar
 * um projeto no Supabase. NUNCA use em produção: a configuração recusa subir assim.
 * Senhas ficam com hash scrypt em um arquivo local não versionado (.data/dev-auth.json).
 */
export class DevAuthProvider implements AuthProvider {
  private store: Store = { users: [] };
  private mtimeMs = 0;
  private readonly refreshTokens = new Map<string, { userId: string; expiresAt: number }>();

  constructor(
    private readonly secret: string,
    private readonly file: string,
    private readonly log: (msg: string) => void = () => {},
  ) {
    this.sync();
  }

  /** Outro processo (ex.: `pnpm dev:seed -- --reset`) pode ter alterado o arquivo: relê quando ele mudou. */
  private sync() {
    const mtime = existsSync(this.file) ? statSync(this.file).mtimeMs : 0;
    if (mtime === this.mtimeMs) return;
    this.mtimeMs = mtime;
    try {
      this.store = mtime ? (JSON.parse(readFileSync(this.file, "utf8")) as Store) : { users: [] };
    } catch {
      this.store = { users: [] };
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.store, null, 2));
    this.mtimeMs = statSync(this.file).mtimeMs;
  }

  private async hash(password: string, salt: Buffer): Promise<string> {
    return (await scrypt(password, salt, 32)).toString("hex");
  }

  private find(email: string) {
    this.sync();
    return this.store.users.find((u) => u.email === email);
  }

  private async issue(user: DevUser): Promise<ProviderSession> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600;
    const accessToken = await new SignJWT({ email: user.email, role: "authenticated", user_metadata: user.metadata, app_metadata: { provider: "email", providers: ["email"] }, aal: "aal1" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setAudience(DEV_AUDIENCE)
      .setIssuer(DEV_ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .sign(new TextEncoder().encode(this.secret));
    const refreshToken = `dev-${randomBytes(24).toString("hex")}`;
    this.refreshTokens.set(refreshToken, { userId: user.id, expiresAt: Date.now() + 30 * 86_400_000 });
    return { accessToken, refreshToken, expiresIn, expiresAt: now + expiresIn, user: { id: user.id, email: user.email } };
  }

  async signUp(input: { email: string; password: string; metadata: Record<string, unknown> }): Promise<SignUpResult> {
    if (this.find(input.email)) return { userId: null, session: null, requiresEmailVerification: true };
    const salt = randomBytes(16);
    const user: DevUser = {
      id: randomUUID(),
      email: input.email,
      salt: salt.toString("hex"),
      hash: await this.hash(input.password, salt),
      metadata: input.metadata,
    };
    this.store.users.push(user);
    this.save();
    return { userId: user.id, session: await this.issue(user), requiresEmailVerification: false };
  }

  async signIn(email: string, password: string): Promise<ProviderSession> {
    const user = this.find(email);
    const salt = user ? Buffer.from(user.salt, "hex") : randomBytes(16);
    const candidate = await this.hash(password, salt);
    const ok = user && timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(user.hash, "hex"));
    if (!user || !ok) throw Errors.unauthorized("E-mail ou senha incorretos", "INVALID_CREDENTIALS");
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<ProviderSession> {
    this.sync();
    const entry = this.refreshTokens.get(refreshToken);
    const user = entry && entry.expiresAt > Date.now() ? this.store.users.find((u) => u.id === entry.userId) : undefined;
    if (!user) throw Errors.unauthorized("Sessão expirada. Entre novamente.", "INVALID_REFRESH_TOKEN");
    this.refreshTokens.delete(refreshToken); // rotação: cada refresh token vale uma vez
    return this.issue(user);
  }

  async signOut(accessToken: string): Promise<void> {
    void accessToken;
    this.refreshTokens.clear(); // dev: encerra todas as sessões
  }

  async requestPasswordReset(email: string): Promise<void> {
    this.log(`[dev-auth] recuperação de senha solicitada para ${email} (nenhum e-mail é enviado em dev)`);
  }

  async resendVerification(): Promise<void> {}

  async updatePassword(accessToken: string, newPassword: string): Promise<void> {
    const { payload } = await jwtVerify(accessToken, new TextEncoder().encode(this.secret), {
      issuer: DEV_ISSUER,
      audience: DEV_AUDIENCE,
    }).catch(() => {
      throw Errors.unauthorized("Sessão inválida", "INVALID_TOKEN");
    });
    this.sync();
    const user = this.store.users.find((u) => u.id === payload.sub);
    if (!user) throw Errors.unauthorized("Sessão inválida", "INVALID_TOKEN");
    const salt = randomBytes(16);
    user.salt = salt.toString("hex");
    user.hash = await this.hash(newPassword, salt);
    this.save();
  }

  async deleteUser(userId: string): Promise<void> {
    this.sync();
    this.store.users = this.store.users.filter((u) => u.id !== userId);
    this.save();
  }

  /** Dev: troca na hora (não há e-mail de confirmação para clicar). */
  async requestEmailChange(accessToken: string, newEmail: string): Promise<void> {
    const { payload } = await jwtVerify(accessToken, new TextEncoder().encode(this.secret), { issuer: DEV_ISSUER, audience: DEV_AUDIENCE }).catch(() => {
      throw Errors.unauthorized("Sessão inválida", "INVALID_TOKEN");
    });
    this.sync();
    const user = this.store.users.find((u) => u.id === payload.sub);
    if (!user) throw Errors.unauthorized("Sessão inválida", "INVALID_TOKEN");
    if (this.store.users.some((u) => u.email === newEmail && u.id !== user.id)) return; // anti-enumeração
    user.email = newEmail;
    this.save();
  }

  // Verificação em duas etapas e login por outras contas dependem do Supabase: não existem no modo de desenvolvimento local.
  private unsupported(): never {
    throw Errors.unavailable("Indisponível no modo de desenvolvimento local (AUTH_MODE=dev). Use o Supabase.", "AUTH_FEATURE_UNAVAILABLE");
  }
  async mfaEnroll(): Promise<never> {
    return this.unsupported();
  }
  async mfaVerify(): Promise<never> {
    return this.unsupported();
  }
  async mfaUnenroll(): Promise<never> {
    return this.unsupported();
  }
  async adminRemoveMfa(): Promise<never> {
    return this.unsupported();
  }
  oauthAuthorizeUrl(): never {
    return this.unsupported();
  }
  async oauthExchange(): Promise<never> {
    return this.unsupported();
  }
}
