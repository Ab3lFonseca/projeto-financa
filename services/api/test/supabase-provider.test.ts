import { describe, expect, it } from "vitest";
import { mapGoTrueError, SupabaseAuthProvider } from "../src/modules/auth/supabase-provider";

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

function provider(extra: { anonKey?: string; serviceRoleKey?: string } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const p = new SupabaseAuthProvider({ url: "https://abc.supabase.co", anonKey: extra.anonKey ?? "sb_publishable_x", serviceRoleKey: extra.serviceRoleKey, fetch: fetchImpl });
  return { p, calls };
}

const JWT_LIKE = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura";

describe("erros do Supabase Auth", () => {
  it("limite de envio de e-mail tem código próprio (não se confunde com o limite de requisições da API)", () => {
    const email = mapGoTrueError(429, { error_code: "over_email_send_rate_limit" });
    expect(email).toMatchObject({ status: 429, code: "EMAIL_RATE_LIMITED" });
    expect(email.message).toMatch(/e-mails/);
    expect(mapGoTrueError(429, { error_code: "over_request_rate_limit" })).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(mapGoTrueError(429, null)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });

  it("endereço não autorizado no e-mail embutido vira erro claro de configuração (não 'senha incorreta')", () => {
    const err = mapGoTrueError(400, { error_code: "email_address_not_authorized", msg: "Email address not authorized" });
    expect(err).toMatchObject({ status: 503, code: "EMAIL_DELIVERY_RESTRICTED" });
    expect(err.code).not.toBe("INVALID_CREDENTIALS");
  });
});

describe("destino do link de confirmação no Supabase", () => {
  it("cadastro e reenvio mandam redirect_to na URL (e não mandam quando não há destino)", async () => {
    const { p, calls } = provider();
    await p.signUp({ email: "a@b.com", password: "senhaForte123", metadata: {}, redirectTo: "https://site.exemplo.dev/confirm-email" });
    expect(new URL(calls[0]!.url).pathname).toBe("/auth/v1/signup");
    expect(new URL(calls[0]!.url).searchParams.get("redirect_to")).toBe("https://site.exemplo.dev/confirm-email");
    expect(JSON.stringify(calls[0]!.body)).not.toContain("redirect"); // o destino vai na URL, não no corpo

    await p.resendVerification("a@b.com", "financa://confirm-email");
    expect(new URL(calls[1]!.url).pathname).toBe("/auth/v1/resend");
    expect(new URL(calls[1]!.url).searchParams.get("redirect_to")).toBe("financa://confirm-email");

    await p.signUp({ email: "c@d.com", password: "senhaForte123", metadata: {} });
    expect(new URL(calls[2]!.url).searchParams.has("redirect_to")).toBe(false);
  });
});

describe("chaves do Supabase", () => {
  it("login e cadastro usam a chave pública só no cabeçalho apikey (sem Authorization)", async () => {
    const { p, calls } = provider({ anonKey: "sb_publishable_abc" });
    await p.requestPasswordReset("a@b.com");
    expect(calls[0]!.headers.apikey).toBe("sb_publishable_abc");
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  it("exclusão de conta com a chave NOVA (sb_secret_): só apikey, nunca Authorization: Bearer", async () => {
    const { p, calls } = provider({ serviceRoleKey: "sb_secret_abc" });
    await p.deleteUser("11111111-1111-4111-8111-111111111111");
    expect(calls[0]).toMatchObject({ method: "DELETE" });
    expect(calls[0]!.url).toBe("https://abc.supabase.co/auth/v1/admin/users/11111111-1111-4111-8111-111111111111");
    expect(calls[0]!.headers.apikey).toBe("sb_secret_abc");
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  it("exclusão de conta com a chave LEGADA (service_role, JWT): apikey e Bearer", async () => {
    const { p, calls } = provider({ serviceRoleKey: JWT_LIKE });
    await p.deleteUser("11111111-1111-4111-8111-111111111111");
    expect(calls[0]!.headers.apikey).toBe(JWT_LIKE);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${JWT_LIKE}`);
  });

  it("sem chave de serviço, a exclusão falha com código claro (nada é chamado)", async () => {
    const { p, calls } = provider();
    await expect(p.deleteUser("11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({ code: "ADMIN_KEY_MISSING" });
    expect(calls).toHaveLength(0);
  });
});
