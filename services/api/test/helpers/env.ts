import { createPrismaClient, type PrismaClient } from "@app/database";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { buildApp, type AppDeps } from "../../src/app";
import { loadConfig, type Config } from "../../src/config";
import { JoseTokenVerifier } from "../../src/modules/auth/token-verifier";
import { FakeAuthProvider, TEST_ISSUER, TEST_JWT_SECRET, TEST_SUPABASE_URL } from "./fake-auth";

export type CallOptions = {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  token?: string | null;
};

export type ApiResponse<T = any> = { status: number; body: T; headers: Record<string, any> };

export type TestUser = {
  id: string;
  email: string;
  password: string;
  token: string;
  get<T = any>(url: string, opts?: CallOptions): Promise<ApiResponse<T>>;
  post<T = any>(url: string, body?: unknown, opts?: CallOptions): Promise<ApiResponse<T>>;
  put<T = any>(url: string, body?: unknown, opts?: CallOptions): Promise<ApiResponse<T>>;
  patch<T = any>(url: string, body?: unknown, opts?: CallOptions): Promise<ApiResponse<T>>;
  delete<T = any>(url: string, opts?: CallOptions): Promise<ApiResponse<T>>;
};

export type TestEnv = Awaited<ReturnType<typeof createTestEnv>>;

/** Relógio de teste: fixa o "hoje" do negócio (o JWT usa o relógio real, que é independente). */
export const DEFAULT_NOW = "2026-10-04T15:00:00.000Z";

export async function createTestEnv(overrides: Record<string, string> = {}, extraDeps: Partial<AppDeps> = {}) {
  const dbUrl = inject("dbUrl");
  const config: Config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: dbUrl,
    SUPABASE_URL: TEST_SUPABASE_URL,
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    RATE_LIMIT_ENABLED: "false",
    JOBS_ENABLED: "false",
    IP_HASH_PEPPER: "test-pepper-test-pepper",
    ...overrides,
  });
  const prisma: PrismaClient = createPrismaClient({ connectionString: dbUrl, maxConnections: 5 });
  const auth = new FakeAuthProvider();
  let now = new Date(DEFAULT_NOW);

  const app: FastifyInstance = await buildApp({
    config,
    prisma,
    authProvider: auth,
    tokenVerifier: new JoseTokenVerifier({ issuer: TEST_ISSUER, audience: "authenticated", hs256Secret: TEST_JWT_SECRET }),
    clock: () => new Date(now),
    ...extraDeps,
  });
  await app.ready();

  async function call<T = any>(method: string, url: string, opts: CallOptions = {}): Promise<ApiResponse<T>> {
    const res = await app.inject({
      method: method as any,
      url,
      payload: opts.body === undefined ? undefined : (opts.body as any),
      query: opts.query as any,
      headers: {
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.headers ?? {}),
      },
    });
    let body: any = null;
    if (res.body) {
      try {
        body = res.json();
      } catch {
        body = res.body;
      }
    }
    return { status: res.statusCode, body, headers: res.headers };
  }

  const anon = {
    get: <T = any>(url: string, opts?: CallOptions) => call<T>("GET", url, opts),
    post: <T = any>(url: string, body?: unknown, opts?: CallOptions) => call<T>("POST", url, { ...opts, body }),
    put: <T = any>(url: string, body?: unknown, opts?: CallOptions) => call<T>("PUT", url, { ...opts, body }),
    patch: <T = any>(url: string, body?: unknown, opts?: CallOptions) => call<T>("PATCH", url, { ...opts, body }),
    delete: <T = any>(url: string, opts?: CallOptions) => call<T>("DELETE", url, opts),
  };

  /** Cria um usuário já cadastrado e autenticado. Por padrão, com os aceites legais em dia. */
  async function newUser(opts: { email?: string; consent?: boolean; password?: string } = {}): Promise<TestUser> {
    const email = opts.email ?? `user-${randomUUID()}@teste.dev`;
    const password = opts.password ?? "senhaForte123";
    const withConsent = opts.consent !== false;
    const result = await auth.signUp({
      email,
      password,
      metadata: withConsent
        ? {
            terms_version: config.LEGAL_TERMS_VERSION,
            privacy_version: config.LEGAL_PRIVACY_VERSION,
            accepted_at: now.toISOString(),
            marketing_opt_in: false,
          }
        : {},
    });
    const session = result.session ?? (await auth.signIn(email, password));
    const token = session.accessToken;
    return {
      id: session.user.id,
      email,
      password,
      token,
      get: (url, o) => call("GET", url, { ...o, token }),
      post: (url, body, o) => call("POST", url, { ...o, body, token }),
      put: (url, body, o) => call("PUT", url, { ...o, body, token }),
      patch: (url, body, o) => call("PATCH", url, { ...o, body, token }),
      delete: (url, o) => call("DELETE", url, { ...o, token }),
    };
  }

  return {
    app,
    prisma,
    auth,
    config,
    anon,
    call,
    newUser,
    setNow: (iso: string) => {
      now = new Date(iso);
    },
    now: () => new Date(now),
    async close() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}
