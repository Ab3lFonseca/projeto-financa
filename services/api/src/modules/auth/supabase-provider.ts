import { AppError, Errors } from "../../lib/errors";
import type { AuthProvider, ProviderSession, SignUpResult } from "./provider";

export type SupabaseProviderConfig = {
  /** Ex.: https://abcd.supabase.co */
  url: string;
  /** Chave pública (anon/publishable). */
  anonKey: string;
  /** Chave secreta (service role): somente para operações administrativas. */
  serviceRoleKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type GoTrueError = {
  code?: number | string;
  error_code?: string;
  error?: string;
  msg?: string;
  message?: string;
  error_description?: string;
};

/** Converte erros do GoTrue em erros da nossa API, sem vazar detalhes internos. */
export function mapGoTrueError(status: number, payload: GoTrueError | null): AppError {
  const code = String(payload?.error_code ?? payload?.error ?? "").toLowerCase();
  switch (code) {
    case "invalid_credentials":
    case "invalid_grant":
      return Errors.unauthorized("E-mail ou senha incorretos", "INVALID_CREDENTIALS");
    case "email_not_confirmed":
      return Errors.forbidden("Confirme seu e-mail antes de entrar", "EMAIL_NOT_VERIFIED");
    case "weak_password":
      return Errors.unprocessable("Senha muito fraca", "WEAK_PASSWORD");
    case "same_password":
      return Errors.unprocessable("A nova senha deve ser diferente da atual", "SAME_PASSWORD");
    case "user_already_exists":
    case "email_exists":
      return Errors.conflict("E-mail já cadastrado", "EMAIL_IN_USE");
    case "signup_disabled":
      return Errors.forbidden("Cadastros desativados no momento", "SIGNUP_DISABLED");
    case "user_banned":
      return Errors.forbidden("Conta suspensa", "ACCOUNT_SUSPENDED");
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return Errors.tooMany();
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "session_expired":
    case "session_not_found":
    case "bad_jwt":
      return Errors.unauthorized("Sessão expirada. Entre novamente.", "INVALID_REFRESH_TOKEN");
  }
  if (status === 429) return Errors.tooMany();
  if (status === 401 || status === 400) return Errors.unauthorized("Não foi possível autenticar", "INVALID_CREDENTIALS");
  return Errors.upstream("Serviço de autenticação indisponível", "AUTH_PROVIDER_ERROR");
}

export class SupabaseAuthProvider implements AuthProvider {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: SupabaseProviderConfig) {
    this.base = `${config.url.replace(/\/+$/, "")}/auth/v1`;
    this.fetchFn = config.fetch ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 8_000;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; bearer?: string; apiKey?: string; query?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const apiKey = opts.apiKey ?? this.config.anonKey;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method,
        headers: {
          apikey: apiKey,
          "content-type": "application/json",
          ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw Errors.upstream("Serviço de autenticação indisponível", "AUTH_PROVIDER_ERROR");
    }

    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) throw mapGoTrueError(res.status, json as GoTrueError | null);
    return json as T;
  }

  private toSession(raw: Record<string, any>): ProviderSession {
    const expiresIn = Number(raw.expires_in ?? 3600);
    return {
      accessToken: String(raw.access_token),
      refreshToken: String(raw.refresh_token),
      expiresIn,
      expiresAt: Number(raw.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn),
      user: { id: String(raw.user?.id), email: String(raw.user?.email ?? "").toLowerCase() },
    };
  }

  async signUp(input: { email: string; password: string; metadata: Record<string, unknown> }): Promise<SignUpResult> {
    try {
      const raw = await this.request<Record<string, any>>("POST", "/signup", {
        body: { email: input.email, password: input.password, data: input.metadata },
      });
      if (raw.access_token) {
        return { userId: String(raw.user?.id ?? ""), session: this.toSession(raw), requiresEmailVerification: false };
      }
      return { userId: raw.id ? String(raw.id) : null, session: null, requiresEmailVerification: true };
    } catch (err) {
      // E-mail já cadastrado: não revelamos (anti-enumeração) — mesma resposta de um cadastro novo.
      if (err instanceof AppError && err.code === "EMAIL_IN_USE") {
        return { userId: null, session: null, requiresEmailVerification: true };
      }
      throw err;
    }
  }

  async signIn(email: string, password: string): Promise<ProviderSession> {
    const raw = await this.request<Record<string, any>>("POST", "/token", {
      query: { grant_type: "password" },
      body: { email, password },
    });
    return this.toSession(raw);
  }

  async refresh(refreshToken: string): Promise<ProviderSession> {
    const raw = await this.request<Record<string, any>>("POST", "/token", {
      query: { grant_type: "refresh_token" },
      body: { refresh_token: refreshToken },
    });
    return this.toSession(raw);
  }

  async signOut(accessToken: string, scope: "global" | "local" | "others" = "global"): Promise<void> {
    await this.request("POST", "/logout", { bearer: accessToken, query: { scope } });
  }

  async requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
    await this.request("POST", "/recover", {
      body: { email },
      query: redirectTo ? { redirect_to: redirectTo } : undefined,
    });
  }

  async resendVerification(email: string): Promise<void> {
    await this.request("POST", "/resend", { body: { type: "signup", email } });
  }

  async updatePassword(accessToken: string, newPassword: string): Promise<void> {
    await this.request("PUT", "/user", { bearer: accessToken, body: { password: newPassword } });
  }

  async deleteUser(userId: string): Promise<void> {
    const key = this.config.serviceRoleKey;
    if (!key) throw Errors.unavailable("Exclusão de conta indisponível: chave de serviço não configurada", "ADMIN_KEY_MISSING");
    // Chave legada (service_role) é um JWT e também vai em Authorization. As chaves novas (sb_secret_...) NÃO são JWT:
    // o Supabase manda enviá-las só no cabeçalho `apikey` (no Bearer a verificação do JWT falharia).
    const isJwt = key.startsWith("eyJ");
    await this.request("DELETE", `/admin/users/${encodeURIComponent(userId)}`, { bearer: isJwt ? key : undefined, apiKey: key });
  }
}
