import { z } from "zod";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(def ? "true" : "false")
    .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .default("")
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    /**
     * Pasta dos arquivos de log: `api-AAAA-MM-DD.log` (tudo) e `errors-AAAA-MM-DD.log` (só warn/error).
     * Em desenvolvimento o padrão é `.data/logs` na raiz do projeto. Em produção, vazio = só stdout
     * (no Fly: `fly logs`); para guardar em disco, monte um volume e aponte esta variável para ele.
     */
    LOG_DIR: z.string().optional(),
    /** Quantos dias de arquivos de log manter. */
    LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    /** Origens permitidas no CORS (painel web futuro). O app mobile não usa CORS. */
    CORS_ORIGINS: csv,
    /**
     * Confiar no X-Forwarded-For. ATENÇÃO: confia em TODOS os valores do cabeçalho, inclusive os que o cliente envia, então
     * quem muda o X-Forwarded-For ganha um contador novo nos limitadores de tentativas. Em produção prefira CLIENT_IP_HEADER.
     */
    TRUST_PROXY: bool(true),
    /**
     * Cabeçalho com o IP real do cliente, escrito pelo SEU proxy de borda e que o cliente não consegue forjar
     * (Render, que passa pelo Cloudflare: `cf-connecting-ip`; Fly.io: `fly-client-ip`). Quando definido, o X-Forwarded-For
     * é ignorado e esse cabeçalho vira o IP usado nos limites de tentativas e na auditoria.
     */
    CLIENT_IP_HEADER: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,64}$/, "Nome de cabeçalho inválido").optional(),
    ),

    // --- Autenticação ---
    /** "supabase" (padrão) ou "dev" (somente desenvolvimento local; recusado em produção). */
    AUTH_MODE: z.enum(["supabase", "dev"]).default("supabase"),
    DEV_JWT_SECRET: z.string().min(16).default("dev-only-jwt-secret-change-me-1234"),
    /** Arquivo onde o modo dev guarda usuários (hash scrypt). Não versionado. */
    DEV_AUTH_FILE: z.string().default(".data/dev-auth.json"),
    SUPABASE_URL: z.url().optional(),
    /** Chave pública (anon/publishable) — usada nas chamadas REST de auth. */
    SUPABASE_ANON_KEY: z.string().optional(),
    /** Chave SECRETA (service role) — só no servidor; necessária para excluir contas. */
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    /** Segredo HS256 legado do Supabase (opcional; o padrão é JWKS assimétrico). */
    SUPABASE_JWT_SECRET: z.string().optional(),
    JWT_AUDIENCE: z.string().default("authenticated"),
    /** Link aberto pelo e-mail de recuperação de senha (deep link do app). */
    PASSWORD_RESET_REDIRECT_URL: z.string().optional(),

    /** Segredo para HMAC de IPs (consentimentos/auditoria). Nunca armazenamos IP em claro. */
    IP_HASH_PEPPER: z.string().min(16, "IP_HASH_PEPPER precisa de ao menos 16 caracteres").default("dev-only-pepper-change-me"),

    LEGAL_TERMS_VERSION: z.string().default("2026-10-01"),
    LEGAL_PRIVACY_VERSION: z.string().default("2026-10-01"),

    /** false = beta: todos têm recursos Premium. true = limites do plano gratuito valem. */
    BILLING_ENFORCED: bool(false),

    RATE_LIMIT_ENABLED: bool(true),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    JOBS_ENABLED: bool(true),

    // --- Open Finance (Etapa 10) ---
    OPEN_FINANCE_ENABLED: bool(false),
    /** "pluggy" (real) ou "demo" (banco fictício para testar sem contratar; PROIBIDO em produção). */
    OPEN_FINANCE_PROVIDER: z.enum(["pluggy", "demo"]).default("pluggy"),
    PLUGGY_CLIENT_ID: z.string().optional(),
    PLUGGY_CLIENT_SECRET: z.string().optional(),
    PLUGGY_WEBHOOK_URL: z.string().optional(),
    PLUGGY_WEBHOOK_SECRET: z.string().optional(),
    PLUGGY_BASE_URL: z.url().default("https://api.pluggy.ai"),
    /**
     * Aceita também o conector gratuito MeuPluggy (id 200) para testar com a SUA conta real sem contratar o Pluggy.
     * Só desenvolvimento/uso pessoal: PROIBIDO em produção (limite de 5 conexões, sem SLA e sem controle de bancos).
     */
    PLUGGY_ALLOW_MEUPLUGGY: bool(false),
    /** Deep link do app para onde o banco devolve o usuário após autorizar (ex.: financa://open-finance). */
    OPEN_FINANCE_REDIRECT_URI: z.string().optional(),
    /** Endereço do app WEB para onde o banco devolve o usuário (ex.: https://financa-web.onrender.com/open-finance). */
    OPEN_FINANCE_WEB_REDIRECT_URI: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.AUTH_MODE === "dev") {
      ctx.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "AUTH_MODE=dev é proibido em produção" });
    }
    const need = (key: keyof typeof env, label = key as string) => {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${label} é obrigatória em produção` });
    };
    need("SUPABASE_URL");
    need("SUPABASE_ANON_KEY");
    need("SUPABASE_SERVICE_ROLE_KEY");
    if (env.IP_HASH_PEPPER === "dev-only-pepper-change-me") {
      ctx.addIssue({ code: "custom", path: ["IP_HASH_PEPPER"], message: "Defina um IP_HASH_PEPPER próprio em produção" });
    }
    if (env.OPEN_FINANCE_PROVIDER === "demo") {
      ctx.addIssue({ code: "custom", path: ["OPEN_FINANCE_PROVIDER"], message: "OPEN_FINANCE_PROVIDER=demo é proibido em produção" });
    }
    if (env.PLUGGY_ALLOW_MEUPLUGGY) {
      ctx.addIssue({ code: "custom", path: ["PLUGGY_ALLOW_MEUPLUGGY"], message: "PLUGGY_ALLOW_MEUPLUGGY é só para desenvolvimento: proibido em produção" });
    }
    if (env.OPEN_FINANCE_ENABLED && env.OPEN_FINANCE_PROVIDER === "pluggy") {
      need("PLUGGY_CLIENT_ID");
      need("PLUGGY_CLIENT_SECRET");
      need("PLUGGY_WEBHOOK_SECRET");
    }
  });

export type Config = z.infer<typeof schema>;

/** Valida o ambiente e falha cedo, com mensagem clara, se algo estiver errado. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(raiz)"}: ${i.message}`);
    throw new Error(`Configuração inválida:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
