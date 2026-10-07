import { createPrismaClient, type PrismaClient } from "@app/database";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { Config } from "./config";
import { accessConfigOf } from "./lib/access-db";
import { Errors } from "./lib/errors";
import { createLogSinks, type LogSinks } from "./lib/log-files";
import { diagnosticsRoutes } from "./modules/diagnostics/routes";
import { healthRoutes } from "./modules/health/routes";
import { authRoutes } from "./modules/auth/routes";
import { meRoutes } from "./modules/me/routes";
import { privacyRoutes } from "./modules/privacy/routes";
import type { AuthProvider } from "./modules/auth/provider";
import { DEV_AUDIENCE, DEV_ISSUER, DevAuthProvider } from "./modules/auth/dev-provider";
import { SupabaseAuthProvider } from "./modules/auth/supabase-provider";
import { JoseTokenVerifier, type TokenVerifier } from "./modules/auth/token-verifier";
import { UserDirectory } from "./modules/users/directory";
import { DevBillingProvider } from "./modules/billing/dev";
import type { BillingProvider } from "./modules/billing/provider";
import { billingRoutes, billingWebhookRoutes } from "./modules/billing/routes";
import { BillingService } from "./modules/billing/service";
import { StripeProvider, stripePlanSources } from "./modules/billing/stripe";
import { ExpoPushNotifier, NoopNotifier, type PushNotifier } from "./modules/notifications/notifier";
import { DemoOpenFinanceProvider } from "./modules/open-finance/demo";
import { PluggyProvider } from "./modules/open-finance/pluggy";
import type { OpenFinanceProvider } from "./modules/open-finance/provider";
import { openFinanceWebhookRoutes } from "./modules/open-finance/routes";
import { OpenFinanceRuntime } from "./modules/open-finance/service";
import { registerAuthHooks } from "./plugins/auth";
import { registerErrorHandling } from "./plugins/errors";
import { registerOpenApi } from "./plugins/openapi";
import { registerSecurity } from "./plugins/security";
import { registerDomainRoutes } from "./routes";

// Mensagens de validação do Zod em português.
z.config(z.locales.pt());

export type AppDeps = {
  config: Config;
  prisma?: PrismaClient;
  authProvider?: AuthProvider;
  tokenVerifier?: TokenVerifier;
  notifier?: PushNotifier;
  /** Injetável nos testes; em produção vem da configuração (Pluggy). */
  openFinanceProvider?: OpenFinanceProvider;
  /** Injetável nos testes; em produção vem da configuração (BILLING_PROVIDER). `null` = ninguém consegue assinar. */
  billingProvider?: BillingProvider | null;
  clock?: () => Date;
};

function buildBillingProvider(config: Config, log: { warn: (obj: object, msg: string) => void }): BillingProvider | null {
  if (config.BILLING_PROVIDER === "dev") return new DevBillingProvider();
  if (config.BILLING_PROVIDER === "stripe") {
    return new StripeProvider({
      secretKey: config.STRIPE_SECRET_KEY!,
      webhookSecret: config.STRIPE_WEBHOOK_SECRET!,
      apiBase: config.STRIPE_API_BASE,
      ...stripePlanSources(config),
      log,
    });
  }
  return null;
}

/** Provedor "desligado": falha com 503 claro quando a autenticação não está configurada. */
class DisabledAuthProvider implements AuthProvider {
  private fail(): never {
    throw Errors.unavailable("Autenticação não configurada neste ambiente", "AUTH_NOT_CONFIGURED");
  }
  signUp(): never { return this.fail(); }
  signIn(): never { return this.fail(); }
  refresh(): never { return this.fail(); }
  signOut(): never { return this.fail(); }
  requestPasswordReset(): never { return this.fail(); }
  resendVerification(): never { return this.fail(); }
  updatePassword(): never { return this.fail(); }
  deleteUser(): never { return this.fail(); }
  requestEmailChange(): never { return this.fail(); }
  mfaEnroll(): never { return this.fail(); }
  mfaVerify(): never { return this.fail(); }
  mfaUnenroll(): never { return this.fail(); }
  adminRemoveMfa(): never { return this.fail(); }
  oauthAuthorizeUrl(): never { return this.fail(); }
  oauthExchange(): never { return this.fail(); }
}

class DisabledTokenVerifier implements TokenVerifier {
  verify(): never {
    throw Errors.unavailable("Autenticação não configurada neste ambiente", "AUTH_NOT_CONFIGURED");
  }
}

function buildAuthProvider(config: Config): AuthProvider {
  if (config.AUTH_MODE === "dev") {
    return new DevAuthProvider(config.DEV_JWT_SECRET, resolve(config.DEV_AUTH_FILE), (m) => console.log(m));
  }
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return new DisabledAuthProvider();
  return new SupabaseAuthProvider({
    url: config.SUPABASE_URL,
    anonKey: config.SUPABASE_ANON_KEY,
    serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,
  });
}

function buildTokenVerifier(config: Config): TokenVerifier {
  if (config.AUTH_MODE === "dev") {
    return new JoseTokenVerifier({ issuer: DEV_ISSUER, audience: DEV_AUDIENCE, hs256Secret: config.DEV_JWT_SECRET });
  }
  if (!config.SUPABASE_URL) return new DisabledTokenVerifier();
  const issuer = `${config.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;
  return new JoseTokenVerifier({
    issuer,
    audience: config.JWT_AUDIENCE,
    jwksUrl: `${issuer}/.well-known/jwks.json`,
    hs256Secret: config.SUPABASE_JWT_SECRET,
  });
}

function buildOpenFinanceProvider(config: Config, clock: () => Date): OpenFinanceProvider | null {
  if (config.OPEN_FINANCE_PROVIDER === "demo") return new DemoOpenFinanceProvider(clock);
  if (!config.PLUGGY_CLIENT_ID || !config.PLUGGY_CLIENT_SECRET) return null;
  return new PluggyProvider({
    clientId: config.PLUGGY_CLIENT_ID,
    clientSecret: config.PLUGGY_CLIENT_SECRET,
    baseUrl: config.PLUGGY_BASE_URL,
    webhookSecret: config.PLUGGY_WEBHOOK_SECRET,
    allowMeuPluggy: config.PLUGGY_ALLOW_MEUPLUGGY,
  });
}

/** Sobe da pasta atual até achar a raiz do monorepo (pnpm-workspace.yaml); sem achar, usa a atual. */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Destinos do log: console (legível em desenvolvimento) + arquivos diários com retenção
 * (`api-<dia>.log` com tudo e `errors-<dia>.log` só com warn/error). Em testes fica em silêncio
 * (TEST_LOG=1 para depurar uma falha).
 */
async function createLogging(config: Config): Promise<{ level: string; sinks: LogSinks }> {
  const silent = config.NODE_ENV === "test" && !process.env.TEST_LOG;
  let console_: { write(line: string): void } = { write: (line) => void process.stdout.write(line) };
  if (config.NODE_ENV === "development" && !silent) {
    try {
      // Só existe em desenvolvimento (devDependency): por isso a importação é dinâmica.
      const { default: pretty } = await import("pino-pretty");
      console_ = pretty({ colorize: true, translateTime: "HH:MM:ss", sync: true });
    } catch {
      /* sem pino-pretty: segue com JSON cru */
    }
  }
  const dir = config.LOG_DIR ?? (config.NODE_ENV === "development" ? join(findRepoRoot(), ".data", "logs") : undefined);
  const sinks = createLogSinks({
    dir: silent ? config.LOG_DIR : dir,
    retentionDays: config.LOG_RETENTION_DAYS,
    console: silent ? { write: () => undefined } : console_,
  });
  return { level: silent ? "silent" : config.LOG_LEVEL, sinks };
}

function loggerOptions(config: Config, level: string, stream: LogSinks["stream"]) {
  return {
    level,
    stream,
    // Credenciais nunca vão para o log. Corpos de requisição também não são logados.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        "*.password",
        "*.currentPassword",
        "*.newPassword",
        "*.refreshToken",
        "*.accessToken",
        "*.access_token",
        "*.refresh_token",
      ],
      censor: "[REDACTED]",
    },
    serializers: {
      // Só método e caminho (sem query string: pode conter termos de busca do usuário).
      req(req: { method: string; url: string; id: string }) {
        return { method: req.method, path: req.url.split("?")[0], id: req.id };
      },
    },
  };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;

  const logging = await createLogging(config);
  const app = Fastify({
    logger: loggerOptions(config, logging.level, logging.sinks.stream),
    // Com CLIENT_IP_HEADER o X-Forwarded-For é ignorado (o IP vem do cabeçalho da borda, abaixo).
    trustProxy: config.CLIENT_IP_HEADER ? false : config.TRUST_PROXY,
    bodyLimit: 512 * 1024,
    genReqId: (req) => {
      const header = req.headers["x-request-id"];
      return typeof header === "string" && /^[\w-]{8,64}$/.test(header) ? header : randomUUID();
    },
  });

  // IP real do cliente vindo de um cabeçalho que só o proxy de borda escreve (o cliente não consegue forjá-lo). Roda antes de tudo
  // (limitador de tentativas, auditoria): valor ausente ou que não seja um IP válido cai no IP da conexão, nunca no que o cliente enviar.
  if (config.CLIENT_IP_HEADER) {
    const header = config.CLIENT_IP_HEADER;
    app.addHook("onRequest", async (req) => {
      const raw = req.headers[header];
      const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
      if (value && isIP(value) !== 0) Object.defineProperty(req, "ip", { value, configurable: true });
    });
  }

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const prisma = deps.prisma ?? createPrismaClient({ connectionString: config.DATABASE_URL, maxConnections: config.DB_POOL_MAX });
  const clock = deps.clock ?? (() => new Date());

  app.decorate("config", config);
  app.decorate("prisma", prisma);
  app.decorate("clock", clock);
  app.decorate("authProvider", deps.authProvider ?? buildAuthProvider(config));
  app.decorate("tokenVerifier", deps.tokenVerifier ?? buildTokenVerifier(config));
  app.decorate("users", new UserDirectory(prisma, config, clock));
  app.decorate(
    "billing",
    new BillingService({
      prisma,
      config,
      provider: deps.billingProvider !== undefined ? deps.billingProvider : buildBillingProvider(config, app.log),
      users: app.users,
      now: clock,
      log: app.log,
    }),
  );
  app.decorate(
    "notifier",
    deps.notifier ?? (config.NODE_ENV === "test" ? new NoopNotifier() : new ExpoPushNotifier(prisma, app.log)),
  );

  const ofProvider = deps.openFinanceProvider ?? buildOpenFinanceProvider(config, clock);
  app.decorate(
    "openFinance",
    config.OPEN_FINANCE_ENABLED && ofProvider
      ? new OpenFinanceRuntime({
          prisma,
          provider: ofProvider,
          notifier: app.notifier,
          now: clock,
          access: accessConfigOf(config),
          pepper: config.IP_HASH_PEPPER,
          redirectUri: config.OPEN_FINANCE_REDIRECT_URI,
          webRedirectUri: config.OPEN_FINANCE_WEB_REDIRECT_URI,
          log: app.log,
        })
      : null,
  );

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });
  app.addHook("onClose", async () => {
    await app.openFinance?.idle();
    if (!deps.prisma) await prisma.$disconnect();
    await logging.sinks.close(); // por último: grava as linhas finais nos arquivos
  });

  registerErrorHandling(app);
  registerAuthHooks(app);
  await registerSecurity(app);
  await registerOpenApi(app);

  await app.register(healthRoutes);
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: "/auth" });
      // Webhooks de provedores: sem login de usuário, autenticados por segredo.
      await v1.register(openFinanceWebhookRoutes, { prefix: "/webhooks" });
      await v1.register(billingWebhookRoutes, { prefix: "/webhooks" });

      // Tudo abaixo exige token válido.
      await v1.register(async (authed) => {
        authed.addHook("onRequest", app.authenticate);
        // Exceção ao bloqueio por consentimento: o usuário precisa conseguir ver o perfil,
        // aceitar os termos e excluir a conta.
        await authed.register(meRoutes, { prefix: "/me" });
        await authed.register(privacyRoutes, { prefix: "/privacy" });
        await authed.register(diagnosticsRoutes, { prefix: "/diagnostics" });
        await authed.register(billingRoutes, { prefix: "/billing" });
        await authed.register(async (gated) => {
          gated.addHook("onRequest", app.requireConsent);
          // Depois do teste grátis, sem assinatura: só leitura (criar e editar respondem 402).
          gated.addHook("onRequest", app.requireActiveAccess);
          await registerDomainRoutes(gated);
        });
      });
    },
    { prefix: "/v1" },
  );

  return app;
}
