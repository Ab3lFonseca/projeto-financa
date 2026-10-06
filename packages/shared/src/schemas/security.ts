import { z } from "zod";
import { clientPlatform } from "./auth";
import { sessionResponse } from "./auth";

// ------------------------------------------------------------------------------------------------ verificação em duas etapas (TOTP)

/** Código do aplicativo autenticador: 6 dígitos. */
export const mfaCode = z.string().trim().regex(/^\d{6}$/, "O código tem 6 números");

/** Resposta do login: quando a conta tem verificação em duas etapas, o app ainda precisa pedir o código antes de abrir a conta. */
export const loginResponse = sessionResponse.extend({
  mfa: z.object({ factorId: z.string() }).nullable(),
});
export type LoginResponse = z.infer<typeof loginResponse>;

export const mfaEnrollDTO = z.object({
  factorId: z.string(),
  /** Chave para digitar à mão no aplicativo autenticador (quando não dá para ler o QR). */
  secret: z.string(),
  /** Endereço otpauth:// (o que o QR contém). O app desenha o QR a partir dele, sem depender de imagem pronta do provedor. */
  uri: z.string(),
});

export const mfaVerifyBody = z.strictObject({ factorId: z.string().min(1).max(64), code: mfaCode });
/** A resposta traz a sessão nova (já com a verificação feita), que substitui a anterior. */
export const mfaSessionResponse = sessionResponse;
export const mfaDisableBody = z.strictObject({ code: mfaCode });

// ------------------------------------------------------------------------------------------------ cadastro e login por outras contas

/** Provedores que a API aceita ligar (o servidor só mostra os que estão configurados). O Instagram não oferece login próprio: entra pelo Facebook. */
export const OAUTH_PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" },
  { id: "apple", label: "Apple" },
  { id: "azure", label: "Microsoft" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "discord", label: "Discord" },
  { id: "linkedin_oidc", label: "LinkedIn" },
  { id: "github", label: "GitHub" },
] as const;
export const oauthProviderId = z.enum(OAUTH_PROVIDERS.map((p) => p.id) as [string, ...string[]]);

export const oauthProvidersDTO = z.object({ providers: z.array(z.object({ id: z.string(), label: z.string() })) });

/** O desafio PKCE é um SHA-256 em base64url (43 caracteres). O segredo (verifier) nunca sai do aparelho até a troca final. */
const pkce = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/, "Valor PKCE inválido");

export const oauthStartBody = z.strictObject({ provider: oauthProviderId, codeChallenge: pkce, platform: clientPlatform.optional() });
export const oauthStartResponse = z.object({ url: z.string() });
export const oauthExchangeBody = z.strictObject({ code: z.string().min(8).max(600), codeVerifier: pkce });

export type OAuthProviderInfo = { id: string; label: string };
