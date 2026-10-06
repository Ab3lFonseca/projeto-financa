/**
 * Endereço `otpauth://` que os aplicativos autenticadores (Google Authenticator, Microsoft Authenticator, Authy, 1Password...) entendem: é o que
 * o QR carrega. Montado aqui a partir da chave, para o QR nunca depender de imagem pronta de terceiros.
 *
 * Os parâmetros padrão (SHA-1, 6 dígitos, 30 segundos) ficam de fora de propósito: o padrão do formato já é esse, e um endereço mais curto
 * gera um QR menos denso, que a câmera lê mais fácil.
 */
export function otpauthUri(input: { secret: string; account: string; issuer?: string }): string | null {
  // A chave vem em base32 (A-Z e 2-7); espaços e hífens são só formatação.
  const secret = input.secret.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z2-7]{16,}$/.test(secret)) return null;
  const issuer = encodeURIComponent(input.issuer ?? "Finança");
  return `otpauth://totp/${issuer}:${encodeURIComponent(input.account)}?secret=${secret}&issuer=${issuer}`;
}
