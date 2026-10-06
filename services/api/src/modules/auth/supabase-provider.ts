import { randomBytes } from "node:crypto";
import { AppError, Errors } from "../../lib/errors";
import type { AuthProvider, MfaEnrollment, ProviderSession, SignUpResult } from "./provider";

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
    case "over_email_send_rate_limit":
      // Limite de ENVIO DE E-MAIL do Supabase (o embutido manda poucos por hora): não é o limite de requisições da nossa API.
      return new AppError(429, "EMAIL_RATE_LIMITED", "Limite de envio de e-mails atingido. Tente novamente mais tarde.");
    case "email_address_not_authorized":
      // E-mail embutido do Supabase só entrega para a equipe do projeto; outros endereços exigem SMTP próprio.
      return Errors.unavailable("O envio de e-mails do servidor ainda não aceita este endereço. Fale com o suporte.", "EMAIL_DELIVERY_RESTRICTED");
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return Errors.tooMany();
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
    case "mfa_verification_rejected":
      return Errors.unprocessable("Código incorreto ou expirado. Confira o aplicativo autenticador e tente de novo.", "INVALID_MFA_CODE");
    case "mfa_factor_not_found":
      return Errors.notFound("Fator de verificação");
    case "insufficient_aal":
      return Errors.unauthorized("Confirme o código da verificação em duas etapas para continuar.", "MFA_REQUIRED");
    case "too_many_enrolled_mfa_factors":
    case "mfa_factor_name_conflict":
      return Errors.conflict("Já existe uma verificação em andamento. Tente de novo em instantes.", "MFA_ENROLL_CONFLICT");
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "session_expired":
    case "session_not_found":
    case "bad_jwt":
      return Errors.unauthorized("Sessão expirada. Entre novamente.", "INVALID_REFRESH_TOKEN");
  }
  if (status === 429) return Errors.tooMany();
  // Falha ao ENVIAR o e-mail (SMTP próprio com senha errada, domínio do remetente não verificado, porta errada...): o Supabase
  // responde 500 "Error sending confirmation email". Vale um código próprio: o motivo real está nos Auth Logs do Supabase.
  const msg = String(payload?.msg ?? payload?.message ?? "").toLowerCase();
  if (status >= 500 && /sending .*e-?mail|smtp/.test(msg)) {
    return new AppError(502, "EMAIL_SEND_FAILED", "Não foi possível enviar o e-mail de confirmação agora. Tente novamente em instantes.", { upstreamStatus: status, upstreamCode: code || null });
  }
  if (status === 401 || status === 400) return Errors.unauthorized("Não foi possível autenticar", "INVALID_CREDENTIALS");
  // Resposta genérica, mas com o status e o código do Supabase (sem mensagem livre) para o log e o diagnóstico.
  return new AppError(502, "AUTH_PROVIDER_ERROR", "Serviço de autenticação indisponível", { upstreamStatus: status, upstreamCode: code || null });
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
      // Sem resposta do Supabase (rede, DNS ou tempo esgotado): distinto de "o Supabase respondeu com erro".
      throw new AppError(502, "AUTH_PROVIDER_ERROR", "Serviço de autenticação indisponível", { upstreamStatus: null, upstreamCode: "network_error" });
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

  async signUp(input: { email: string; password: string; metadata: Record<string, unknown>; redirectTo?: string }): Promise<SignUpResult> {
    try {
      const raw = await this.request<Record<string, any>>("POST", "/signup", {
        body: { email: input.email, password: input.password, data: input.metadata },
        query: input.redirectTo ? { redirect_to: input.redirectTo } : undefined,
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

  async resendVerification(email: string, redirectTo?: string): Promise<void> {
    await this.request("POST", "/resend", { body: { type: "signup", email }, query: redirectTo ? { redirect_to: redirectTo } : undefined });
  }

  async updatePassword(accessToken: string, newPassword: string): Promise<void> {
    await this.request("PUT", "/user", { bearer: accessToken, body: { password: newPassword } });
  }

  /** Credenciais da chave de serviço. As chaves novas (sb_secret_...) não são JWT: vão só em `apikey`. A legada (service_role) também vai em Authorization. */
  private adminAuth(): { bearer?: string; apiKey: string } {
    const key = this.config.serviceRoleKey;
    if (!key) throw Errors.unavailable("Operação de administração indisponível: chave de serviço não configurada", "ADMIN_KEY_MISSING");
    return { bearer: key.startsWith("eyJ") ? key : undefined, apiKey: key };
  }

  async deleteUser(userId: string): Promise<void> {
    const key = this.config.serviceRoleKey;
    if (!key) throw Errors.unavailable("Exclusão de conta indisponível: chave de serviço não configurada", "ADMIN_KEY_MISSING");
    await this.request("DELETE", `/admin/users/${encodeURIComponent(userId)}`, this.adminAuth());
  }

  async requestEmailChange(accessToken: string, newEmail: string, redirectTo?: string): Promise<void> {
    try {
      await this.request("PUT", "/user", { bearer: accessToken, body: { email: newEmail }, query: redirectTo ? { redirect_to: redirectTo } : undefined });
    } catch (err) {
      // E-mail de outra conta: não revelamos (anti-enumeração). A pessoa simplesmente não recebe o link.
      if (err instanceof AppError && err.code === "EMAIL_IN_USE") return;
      throw err;
    }
  }

  // ---------------------------------------------------------------------------------------------- verificação em duas etapas

  async mfaEnroll(accessToken: string): Promise<MfaEnrollment> {
    // Fatores criados e nunca confirmados (a pessoa fechou a tela no meio) travam novos cadastros: limpa antes.
    const user = await this.request<{ factors?: { id: string; status: string }[] }>("GET", "/user", { bearer: accessToken });
    for (const f of user.factors ?? []) {
      if (f.status !== "verified") await this.request("DELETE", `/factors/${encodeURIComponent(f.id)}`, { bearer: accessToken }).catch(() => undefined);
    }
    const raw = await this.request<{ id: string; totp?: { qr_code?: string; secret?: string; uri?: string } }>("POST", "/factors", {
      bearer: accessToken,
      body: { factor_type: "totp", issuer: "Finança", friendly_name: `Finança ${randomBytes(3).toString("hex")}` },
    });
    const totp = raw.totp ?? {};
    return { factorId: String(raw.id), secret: String(totp.secret ?? ""), uri: String(totp.uri ?? ""), qrSvg: decodeSvgDataUri(String(totp.qr_code ?? "")) };
  }

  async mfaVerify(accessToken: string, factorId: string, code: string): Promise<ProviderSession> {
    const id = encodeURIComponent(factorId);
    const challenge = await this.request<{ id: string }>("POST", `/factors/${id}/challenge`, { bearer: accessToken, body: {} });
    const raw = await this.request<Record<string, any>>("POST", `/factors/${id}/verify`, { bearer: accessToken, body: { challenge_id: challenge.id, code } });
    return this.toSession(raw);
  }

  async mfaUnenroll(accessToken: string, factorId: string): Promise<void> {
    await this.request("DELETE", `/factors/${encodeURIComponent(factorId)}`, { bearer: accessToken });
  }

  async adminRemoveMfa(userId: string): Promise<void> {
    const auth = this.adminAuth();
    const user = await this.request<{ factors?: { id: string }[] }>("GET", `/admin/users/${encodeURIComponent(userId)}`, auth);
    for (const f of user.factors ?? []) {
      await this.request("DELETE", `/admin/users/${encodeURIComponent(userId)}/factors/${encodeURIComponent(f.id)}`, auth);
    }
  }

  // ---------------------------------------------------------------------------------------------- cadastro e login por outras contas

  oauthAuthorizeUrl(input: { provider: string; redirectTo: string; codeChallenge: string }): string {
    const url = new URL(`${this.base}/authorize`);
    url.searchParams.set("provider", input.provider);
    url.searchParams.set("redirect_to", input.redirectTo);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "s256");
    return url.toString();
  }

  async oauthExchange(code: string, codeVerifier: string): Promise<ProviderSession> {
    const raw = await this.request<Record<string, any>>("POST", "/token", { query: { grant_type: "pkce" }, body: { auth_code: code, code_verifier: codeVerifier } });
    return this.toSession(raw);
  }
}

/** O Supabase devolve o QR como `data:image/svg+xml;utf-8,<svg...>` (com o SVG codificado para URL). O app precisa do SVG puro. */
export function decodeSvgDataUri(value: string): string {
  const comma = value.indexOf(",");
  const body = value.startsWith("data:") && comma >= 0 ? value.slice(comma + 1) : value;
  try {
    return decodeURIComponent(body);
  } catch {
    return body;
  }
}
