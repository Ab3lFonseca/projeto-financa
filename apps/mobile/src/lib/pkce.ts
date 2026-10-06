/**
 * PKCE (RFC 7636) para o login por outras contas. O aparelho gera um segredo aleatório (`verifier`), manda ao servidor só o SHA-256 dele
 * (`challenge`) e guarda o segredo até a volta do provedor. Quem interceptar o código da volta não consegue usá-lo sem o segredo.
 *
 * As partes que dependem do sistema (bytes aleatórios e SHA-256) entram por parâmetro: no app vêm do expo-crypto, nos testes do Node.
 */

/** Bytes → base64url (sem "=", com "-" e "_"), o formato do PKCE. */
export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return toBase64url(btoa(bin));
}

/** base64 comum → base64url (o expo-crypto devolve o SHA-256 em base64). */
export function toBase64url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type Pkce = { verifier: string; challenge: string };

/** Gera o par PKCE. `randomBytes(32)` dá um verifier de 43 caracteres; `sha256Base64(texto)` devolve o SHA-256 do texto em base64. */
export async function makePkce(randomBytes: (n: number) => Uint8Array, sha256Base64: (text: string) => Promise<string>): Promise<Pkce> {
  const verifier = base64url(randomBytes(32));
  const challenge = toBase64url(await sha256Base64(verifier));
  return { verifier, challenge };
}
