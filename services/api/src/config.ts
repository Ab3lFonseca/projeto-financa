import { OAUTH_PROVIDERS } from "@app/shared";
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

/** Variável opcional: vazia vale como não definida (assim o painel do Render pode deixar o campo em branco). */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v), schema.optional());

/** Id de preço do Stripe (price_...). Quem cola um id de produto aqui recebe a dica de onde ele vai. */
const stripePriceId = () => optionalText(z.string().regex(/^price_[A-Za-z0-9]+$/, "Deve começar com price_ (um id de PRODUTO, prod_..., vai em STRIPE_PRODUCT_ID_MONTHLY ou STRIPE_PRODUCT_ID_YEARLY)"));
/** Id de produto do Stripe (prod_...): o servidor descobre sozinho o preço ativo dele. */
const stripeProductId = () => optionalText(z.string().regex(/^prod_[A-Za-z0-9]+$/, "Deve começar com prod_ (um id de PREÇO, price_..., vai em STRIPE_PRICE_ID_MONTHLY ou STRIPE_PRICE_ID_YEARLY)"));

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
    /**
     * Para onde o link do e-mail de CONFIRMAÇÃO de cadastro leva: a tela /confirm-email do app. Celular: deep link
     * (financa://confirm-email); web: https://SEU-SITE/confirm-email. Precisam estar em "Redirect URLs" no Supabase,
     * senão ele cai no Site URL. Nunca vêm do cliente (sem redirecionamento aberto).
     */
    EMAIL_CONFIRM_REDIRECT_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().min(1).optional()),
    EMAIL_CONFIRM_WEB_REDIRECT_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.url().optional()),

    /** Segredo para HMAC de IPs (consentimentos/auditoria). Nunca armazenamos IP em claro. */
    IP_HASH_PEPPER: z.string().min(16, "IP_HASH_PEPPER precisa de ao menos 16 caracteres").default("dev-only-pepper-change-me"),

    LEGAL_TERMS_VERSION: z.string().default("2026-10-07"),
    LEGAL_PRIVACY_VERSION: z.string().default("2026-10-07"),

    /**
     * IDs (UUID, separados por vírgula) de quem é SEMPRE administrador. Ao entrar, a conta listada é promovida a ADMIN no
     * banco (idempotente). Fica na configuração do servidor, e não no código, para o repositório não guardar quem administra.
     * Remover um ID daqui não rebaixa ninguém: isso se faz no banco.
     */
    ADMIN_USER_IDS: csv.pipe(z.array(z.uuid()).transform((ids) => ids.map((id) => id.toLowerCase()))),

    /**
     * false = beta: ninguém precisa assinar, tudo liberado para todos.
     * true  = cobrança ligada: cada pessoa tem TRIAL_DAYS de teste grátis (com tudo liberado) e depois o app fica somente leitura
     *         até assinar. Administradores e contas com cortesia nunca são limitados. Ver docs/assinatura.md.
     */
    BILLING_ENFORCED: bool(false),
    /** Dias de teste grátis, contados do cadastro. */
    TRIAL_DAYS: z.coerce.number().int().min(0).max(365).default(30),
    /**
     * Data (AAAA-MM-DD) em que a cobrança começa. Contas criadas antes dela começam o teste grátis nesta data (senão as contas
     * antigas já nasceriam com o teste vencido no dia em que a cobrança ligasse). Vazio = o teste conta do cadastro.
     */
    BILLING_STARTS_AT: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD")
        .transform((s) => new Date(`${s}T00:00:00.000Z`))
        .refine((d) => !Number.isNaN(d.getTime()), "Data inválida")
        .optional(),
    ),

    // --- Pagamento da assinatura ---
    /** "none" (padrão: ninguém consegue assinar), "stripe" (cobrança hospedada pelo provedor) ou "dev" (ativa na hora, só desenvolvimento). */
    BILLING_PROVIDER: z.enum(["none", "stripe", "dev"]).default("none"),
    /** Chave secreta do Stripe (sk_live_/sk_test_ ou restrita rk_...). NUNCA a publicável (pk_...). Só no servidor. */
    STRIPE_SECRET_KEY: optionalText(z.string().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, "Use a chave SECRETA do Stripe (sk_... ou rk_...), não a publicável (pk_...)")),
    /** Segredo de assinatura do endpoint de webhook (whsec_...), em Stripe → Developers → Webhooks. */
    STRIPE_WEBHOOK_SECRET: optionalText(z.string().regex(/^whsec_[A-Za-z0-9]+$/, "Deve começar com whsec_")),
    /**
     * PLANO BÁSICO, mensal e/ou anual. Para cada ciclo informe o PRODUTO (prod_...: o servidor descobre o preço ativo dele no Stripe) ou, se
     * preferir fixar, o PREÇO (price_...). Pelo menos um é obrigatório; oferecer os dois ciclos mostra "mensal" e "anual" na tela de assinatura.
     * Se houver os dois para o mesmo ciclo, o preço (price_) vale mais. Valores nunca ficam no código: vêm sempre do Stripe.
     */
    STRIPE_PRODUCT_ID_MONTHLY: stripeProductId(),
    STRIPE_PRODUCT_ID_YEARLY: stripeProductId(),
    STRIPE_PRICE_ID_MONTHLY: stripePriceId(),
    STRIPE_PRICE_ID_YEARLY: stripePriceId(),
    /** Forma antiga: UM preço só (price_...), de qualquer ciclo. Continua funcionando; o ciclo é o que o Stripe disser. */
    STRIPE_PRICE_ID: stripePriceId(),
    /**
     * ADICIONAL "Rendimentos" (opcional), com o mesmo formato. O Stripe exige o mesmo ciclo em todos os itens de uma assinatura, então o adicional
     * precisa existir em cada ciclo que você vende o plano. Sem ele em um ciclo, o adicional não é oferecido nesse ciclo.
     */
    STRIPE_PRODUCT_ID_INVESTMENTS_MONTHLY: stripeProductId(),
    STRIPE_PRODUCT_ID_INVESTMENTS_YEARLY: stripeProductId(),
    STRIPE_PRICE_ID_INVESTMENTS_MONTHLY: stripePriceId(),
    STRIPE_PRICE_ID_INVESTMENTS_YEARLY: stripePriceId(),
    STRIPE_PRICE_ID_INVESTMENTS: stripePriceId(),
    /**
     * Pix Automático (Pix que renova sozinho) na assinatura MENSAL. Desligado por padrão: precisa estar liberado na sua conta do Stripe (se não
     * estiver, abrir o pagamento falha). O pagamento avulso por período fechado aceita Pix sem isso.
     */
    STRIPE_PIX_RECURRING: bool(false),
    STRIPE_API_BASE: z.url().default("https://api.stripe.com"),
    /** Endereço do site (ex.: https://financa-web.onrender.com): o pagamento volta para ele. Nunca vem do cliente (sem redirecionamento aberto). */
    APP_WEB_URL: optionalText(z.url()),

    // --- Cadastro e login por outras contas (Google, Facebook...) ---
    /**
     * Provedores de login social que aparecem no app (ids separados por vírgula: google, facebook, apple, azure...). Cada um precisa estar
     * ligado no Supabase (Authentication → Providers). Vazio = só e-mail e senha. O Instagram não tem login próprio: entra pelo Facebook.
     */
    OAUTH_PROVIDERS: csv.pipe(z.array(z.enum(OAUTH_PROVIDERS.map((p) => p.id) as [string, ...string[]]))),
    /** Para onde o provedor devolve a pessoa no celular (deep link, ex.: financa://auth/callback). Precisa estar em "Redirect URLs" no Supabase. */
    OAUTH_REDIRECT_URL: optionalText(z.string().min(3)),
    /** Idem na web (ex.: https://financa-web.onrender.com/auth/callback). Nunca vem do cliente (sem redirecionamento aberto). */
    OAUTH_WEB_REDIRECT_URL: optionalText(z.url()),

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
    // Em qualquer ambiente: um provedor pela metade quebra a assinatura de um jeito difícil de achar.
    if (env.BILLING_PROVIDER === "stripe") {
      for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "APP_WEB_URL"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} é obrigatória com BILLING_PROVIDER=stripe` });
      }
      const hasPlan = [env.STRIPE_PRODUCT_ID_MONTHLY, env.STRIPE_PRODUCT_ID_YEARLY, env.STRIPE_PRICE_ID_MONTHLY, env.STRIPE_PRICE_ID_YEARLY, env.STRIPE_PRICE_ID].some(Boolean);
      if (!hasPlan) {
        ctx.addIssue({ code: "custom", path: ["STRIPE_PRODUCT_ID_MONTHLY"], message: "Defina o plano com BILLING_PROVIDER=stripe: STRIPE_PRODUCT_ID_MONTHLY e/ou STRIPE_PRODUCT_ID_YEARLY (ou os STRIPE_PRICE_ID_...)" });
      }
    }
    if (env.OAUTH_PROVIDERS.length > 0) {
      if (!env.OAUTH_REDIRECT_URL && !env.OAUTH_WEB_REDIRECT_URL) {
        ctx.addIssue({ code: "custom", path: ["OAUTH_WEB_REDIRECT_URL"], message: "OAUTH_WEB_REDIRECT_URL (ou OAUTH_REDIRECT_URL) é obrigatória com OAUTH_PROVIDERS: é para onde o provedor devolve a pessoa" });
      }
      if (env.AUTH_MODE === "dev") {
        ctx.addIssue({ code: "custom", path: ["OAUTH_PROVIDERS"], message: "OAUTH_PROVIDERS exige AUTH_MODE=supabase (o login local de desenvolvimento não tem login social)" });
      }
    }
    if (env.NODE_ENV !== "production") return;
    if (env.BILLING_PROVIDER === "dev") {
      ctx.addIssue({ code: "custom", path: ["BILLING_PROVIDER"], message: "BILLING_PROVIDER=dev é proibido em produção (ativa assinaturas sem pagar)" });
    }
    if (env.BILLING_ENFORCED && env.BILLING_PROVIDER === "none") {
      ctx.addIssue({ code: "custom", path: ["BILLING_PROVIDER"], message: "BILLING_ENFORCED=true exige um provedor de pagamento: sem ele, ninguém conseguiria assinar quando o teste acabasse" });
    }
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
