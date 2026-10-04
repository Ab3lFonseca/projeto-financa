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
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
        // O Supabase não emite token para e-mail não confirmado quando a confirmação está ligada.
        emailVerified: metadata.email_verified !== false,
        userMetadata: metadata,
        expiresAt: typeof payload.exp === "number" ? payload.exp : 0,
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
