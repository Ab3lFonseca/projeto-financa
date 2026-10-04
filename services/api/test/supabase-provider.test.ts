import { describe, expect, it } from "vitest";
import { SupabaseAuthProvider } from "../src/modules/auth/supabase-provider";

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
