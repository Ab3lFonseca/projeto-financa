/**
 * Interpreta o endereço em que o link do e-mail (confirmação de cadastro, troca de e-mail...) devolve o usuário ao app.
 * O Supabase põe o resultado no "fragmento" da URL: `#access_token=...&type=signup` em caso de sucesso ou
 * `#error=access_denied&error_code=otp_expired&error_description=...` quando o link venceu ou já foi usado.
 *
 * Regras de segurança: o resultado NUNCA inclui tokens nem texto vindo da URL (a tela só mostra mensagens fixas, escolhidas
 * por `flow`/`reason`), então um link montado por terceiros não consegue colocar texto na tela nem vazar sessão.
 */
export type AuthRedirect =
  | { kind: "success"; flow: "signup" | "email_change" | "other" }
  | { kind: "error"; reason: "expired" | "denied" | "unknown"; code: string | null }
  | { kind: "none" };

export function parseAuthRedirect(input: string | null | undefined): AuthRedirect {
  if (!input) return { kind: "none" };
  const hash = input.indexOf("#");
  const query = input.indexOf("?");
  const parts: string[] = [];
  if (query >= 0) parts.push(input.slice(query + 1, hash > query ? hash : undefined));
  if (hash >= 0) parts.push(input.slice(hash + 1));
  if (hash < 0 && query < 0 && input.includes("=")) parts.push(input); // só "a=b&c=d"
  const params = new URLSearchParams(parts.join("&"));

  const rawCode = params.get("error_code") ?? params.get("error");
  if (rawCode || params.has("error_description")) {
    const code = rawCode ? rawCode.toLowerCase().slice(0, 64) : null;
    // O Supabase manda error=access_denied junto de error_code=otp_expired quando o link venceu ou já foi usado.
    const reason = code === "otp_expired" ? "expired" : code === "access_denied" ? "denied" : "unknown";
    return { kind: "error", reason, code };
  }

  const type = params.get("type");
  if (params.has("access_token") || params.has("token_hash") || params.has("message") || type) {
    return { kind: "success", flow: type === "signup" ? "signup" : type === "email_change" ? "email_change" : "other" };
  }
  return { kind: "none" };
}
