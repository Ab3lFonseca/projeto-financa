import { createRemoteJWKSet, decodeProtectedHeader, errors as joseErrors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { Errors } from "../../lib/errors";

export type VerifiedToken = {
  /** Id do usuário no provedor de autenticação (= users.id). */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  userMetadata: Record<string, unknown>;
  /** Epoch em segundos. */
  expiresAt: number;
  /** Nível de autenticação: aal2 = a sessão passou pelo código da verificação em duas etapas. */
  aal: "aal1" | "aal2";
  /** Formas de entrar ligadas à conta ("email", "google"...). Contas que entram só por Google/Facebook não têm "email" (sem senha). */
  providers: string[];
  /**
   * Quando a pessoa se autenticou de fato (epoch em segundos), para exigir um login recente em operações sensíveis. Vem do `amr` do token
   * (hora de cada método usado, que NÃO muda quando o token é renovado); sem `amr`, cai na emissão do token.
   */
  authenticatedAt: number;
};

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export type JoseVerifierOptions = {
  issuer: string;
  audience: string;
  /** Chaves públicas (padrão do Supabase com signing keys assimétricas). */
  jwksUrl?: string;
  /** Segredo HS256 (projetos legados e testes). */
  hs256Secret?: string;
};

const ASYMMETRIC_ALGS = ["ES256", "RS256", "EdDSA"];

/** Hora do login mais recente registrada no `amr` do token; sem ela, a emissão (`iat`). */
function authTime(payload: Record<string, unknown>): number {
  const times = Array.isArray(payload.amr)
    ? payload.amr.map((a) => (a && typeof a === "object" ? (a as { timestamp?: unknown }).timestamp : undefined)).filter((t): t is number => typeof t === "number")
    : [];
  if (times.length > 0) return Math.max(...times);
  return typeof payload.iat === "number" ? payload.iat : 0;
}

/**
 * Valida o JWT de acesso: assinatura, emissor, audiência e expiração.
 * As famílias de algoritmo são fixadas por configuração para evitar "algorithm confusion":
 * um token HS256 só é aceito se houver segredo configurado, e nunca com chave pública.
 */
export class JoseTokenVerifier implements TokenVerifier {
  private readonly jwks?: JWTVerifyGetKey;
  private readonly secret?: Uint8Array;

  constructor(private readonly options: JoseVerifierOptions) {
    if (!options.jwksUrl && !options.hs256Secret) {
      throw new Error("JoseTokenVerifier precisa de jwksUrl ou hs256Secret");
    }
    if (options.jwksUrl) {
      this.jwks = createRemoteJWKSet(new URL(options.jwksUrl), { cooldownDuration: 30_000, timeoutDuration: 5_000 });
    }
    if (options.hs256Secret) this.secret = new TextEncoder().encode(options.hs256Secret);
  }

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const alg = decodeProtectedHeader(token).alg;
      const verifyOptions = { issuer: this.options.issuer, audience: this.options.audience, clockTolerance: 5 };

      const { payload } =
        alg === "HS256"
          ? await jwtVerify(token, this.requireSecret(), { ...verifyOptions, algorithms: ["HS256"] })
          : await jwtVerify(token, this.requireJwks(), { ...verifyOptions, algorithms: ASYMMETRIC_ALGS });

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw Errors.unauthorized("Token sem usuário", "INVALID_TOKEN");
      }
      const metadata =
        payload.user_metadata && typeof payload.user_metadata === "object"
          ? (payload.user_metadata as Record<string, unknown>)
          : {};
      const app = payload.app_metadata && typeof payload.app_metadata === "object" ? (payload.app_metadata as Record<string, unknown>) : {};
      const providers = Array.isArray(app.providers) ? app.providers.filter((p): p is string => typeof p === "string") : typeof app.provider === "string" ? [app.provider] : [];
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
        // O Supabase não emite token para e-mail não confirmado quando a confirmação está ligada.
        emailVerified: metadata.email_verified !== false,
        userMetadata: metadata,
        expiresAt: typeof payload.exp === "number" ? payload.exp : 0,
        aal: payload.aal === "aal2" ? "aal2" : "aal1",
        providers,
        authenticatedAt: authTime(payload),
      };
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw Errors.unauthorized("Sessão expirada", "TOKEN_EXPIRED");
      if (err && typeof err === "object" && "status" in err && "code" in err) throw err; // já é AppError
      throw Errors.unauthorized("Sessão inválida", "INVALID_TOKEN");
    }
  }

  private requireSecret(): Uint8Array {
    if (!this.secret) throw Errors.unauthorized("Algoritmo de token não suportado", "INVALID_TOKEN");
    return this.secret;
  }

  private requireJwks(): JWTVerifyGetKey {
    if (!this.jwks) throw Errors.unauthorized("Algoritmo de token não suportado", "INVALID_TOKEN");
    return this.jwks;
  }
}
