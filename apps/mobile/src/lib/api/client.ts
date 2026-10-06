import { API_URL } from "../config";
import { useLoginNotice } from "../auth/notice";
import { tokenStore } from "../auth/tokens";
import { log } from "../logger";
import { usePaywall } from "../paywall";

/** Erro padronizado da API (`{ error: { code, message, details } }`) ou de rede (status 0). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isNetwork() {
    return this.status === 0;
  }
  /** Mensagens de validação por campo: { campo: "mensagem" }. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== "VALIDATION_ERROR" || !Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as { path?: string; message?: string }[]) {
      if (d.path && d.message && !(d.path in out)) out[d.path] = d.message;
    }
    return out;
  }
}

type QueryValue = string | number | boolean | undefined | null | string[];

export type RequestOptions = {
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Chave de idempotência (fila offline): repetir a mesma chave não repete a operação. */
  idempotencyKey?: string;
  /** false = rota pública (não envia nem renova token). */
  auth?: boolean;
  signal?: AbortSignal;
  /** Resposta crua em texto (exportação de dados). */
  raw?: boolean;
};

const TIMEOUT_MS = 20_000;
let refreshing: Promise<boolean> | null = null;

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return url.toString();
}

/** Renova o token de acesso. Uma única renovação por vez (as demais esperam). */
async function refreshSession(): Promise<boolean> {
  const tokens = await tokenStore.get();
  if (!tokens?.refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) {
      // Recusado de verdade (revogado/expirado): encerra. Erro de servidor: mantém a sessão.
      if (res.status >= 400 && res.status < 500) {
        await tokenStore.clear();
        tokenStore.notifyExpired();
      }
      return false;
    }
    const s = (await res.json()) as { accessToken: string; refreshToken: string; expiresAt: number };
    await tokenStore.set({ accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt });
    return true;
  } catch {
    return false; // sem rede: mantém os tokens e tenta de novo depois
  }
}

async function send(method: string, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  if (opts.auth !== false) {
    const tokens = await tokenStore.get();
    if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  opts.signal?.addEventListener("abort", () => controller.abort());
  try {
    return await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function toError(res: Response): Promise<ApiError> {
  let code = "HTTP_ERROR";
  let message = "Algo deu errado. Tente novamente.";
  let details: unknown;
  let requestId: string | undefined;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
      requestId = body.error.requestId;
    }
  } catch {
    /* corpo não-JSON */
  }
  return new ApiError(res.status, code, message, details, requestId);
}

/**
 * Registra no diagnóstico só o que interessa a quem for investigar: queda de rede (informativo) e erro
 * do servidor (aviso, com o id da requisição para achar a linha correspondente no log da API).
 * Recusas esperadas (401, 404, 409, 422...) não entram. A rota de diagnóstico nunca se registra.
 */
function logFailure(method: string, path: string, err: unknown): void {
  if (!(err instanceof ApiError) || path.startsWith("/v1/diagnostics")) return;
  if (err.isNetwork) log.info("api", `${method} ${path}: sem conexão`);
  else if (err.status >= 500) log.warn("api", `${method} ${path} → ${err.status} ${err.code}`, { status: err.status, code: err.code, requestId: err.requestId ?? null });
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await requestInner<T>(method, path, opts);
  } catch (err) {
    logFailure(method, path, err);
    throw err;
  }
}

async function requestInner<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, opts);
  } catch {
    throw new ApiError(0, "NETWORK", "Sem conexão com o servidor.");
  }

  // Token vencido: renova (uma vez) e repete a chamada.
  if (res.status === 401 && opts.auth !== false) {
    const peek = await toError(res.clone());
    if (["TOKEN_EXPIRED", "INVALID_TOKEN", "UNAUTHORIZED"].includes(peek.code)) {
      refreshing ??= refreshSession().finally(() => {
        refreshing = null;
      });
      if (await refreshing) {
        try {
          res = await send(method, path, opts);
        } catch {
          throw new ApiError(0, "NETWORK", "Sem conexão com o servidor.");
        }
      }
    }
  }

  if (!res.ok) {
    const err = await toError(res);
    // Teste grátis acabou e a pessoa tentou criar/editar: convida a assinar (o aviso de erro da tela continua valendo).
    if (err.status === 402 && err.code === "SUBSCRIPTION_REQUIRED") usePaywall.getState().show();
    // A conta passou a exigir o código da verificação em duas etapas (ligada em outro aparelho): a tela de código assume.
    if (err.status === 401 && err.code === "MFA_REQUIRED") tokenStore.notifyMfaRequired((err.details as { factorId?: string | null } | undefined)?.factorId ?? null);
    // 3 códigos errados: o servidor já encerrou esta sessão. Sai agora, sem esperar o próximo erro, e a tela de login explica o motivo.
    if (err.status === 429 && err.code === "MFA_LOCKED") {
      useLoginNotice.getState().show(err.message);
      await tokenStore.clear();
      tokenStore.notifyExpired();
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  if (opts.raw) return (await res.text()) as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
};
