import EmbeddedPostgres from "embedded-postgres";
import { BANKS } from "@app/database/catalog";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import pg from "pg";

/** Migrations do pacote @app/database, aplicadas na ordem dos nomes de pasta. */
const MIGRATIONS_DIR = resolve(import.meta.dirname, "..", "..", "database", "prisma", "migrations");

export const DEV_PASSWORD = "dev-only-password";
export const DEV_PORT = 54329;

export type DevDbOptions = {
  /** Pasta do cluster. Em testes use uma pasta temporária; em dev, uma persistente. */
  dataDir: string;
  port?: number;
  database?: string;
  /** Apaga o cluster ao parar (testes). */
  ephemeral?: boolean;
};

export type DevDb = {
  /** Conexão como dono do schema (ignora RLS; usada por migrations, seeds e jobs). */
  url: string;
  port: number;
  database: string;
  stop(): Promise<void>;
};

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

/**
 * Migrations que já estavam aplicadas nos clusters de desenvolvimento criados ANTES de existir o
 * controle abaixo. Um banco com a tabela `users` e sem controle é tratado como "já tem estas".
 */
const LEGACY_BASELINE = ["20261004000000_init", "20261004000100_constraints_and_rls"];

/**
 * Aplica as migrations SQL pendentes, na ordem dos nomes, e registra cada uma. É incremental:
 * um banco de desenvolvimento antigo recebe só o que faltar. O controle fica no schema `dev_tools`
 * (fora de `public`, para não contar como tabela sem RLS na checagem das migrations).
 */
export async function applyMigrations(connectionString: string): Promise<string[]> {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS dev_tools;
      CREATE TABLE IF NOT EXISTS dev_tools._migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM dev_tools._migrations")).rows.map((r) => r.name));
    if (done.size === 0) {
      const legacy = await client.query<{ t: string | null }>("SELECT to_regclass('public.users')::text AS t");
      if (legacy.rows[0]?.t) {
        for (const name of LEGACY_BASELINE) {
          await client.query("INSERT INTO dev_tools._migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [name]);
          done.add(name);
        }
      }
    }
    for (const dir of dirs) {
      if (done.has(dir)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
        await client.query("INSERT INTO dev_tools._migrations (name) VALUES ($1)", [dir]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Falha ao aplicar a migration ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      }
      applied.push(dir);
    }
  } finally {
    await client.end();
  }
  return applied;
}

/** Popula o catálogo global de bancos (o mesmo que `prisma db seed` faz em produção). */
export async function seedBanks(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const b of BANKS) {
      await client.query(
        `INSERT INTO banks (compe_code, name, short_name, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (compe_code) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name, updated_at = now()`,
        [b.compeCode, b.name, b.shortName],
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Sobe um Postgres real (binários oficiais via npm), cria o banco e aplica as migrations
 * apenas se o banco ainda estiver vazio (primeira execução do cluster).
 */
export async function startDevDb(options: DevDbOptions): Promise<DevDb> {
  const port = options.port ?? (await freePort());
  const database = options.database ?? "financa";
  // Cluster de desenvolvimento persiste entre execuções, então a senha precisa ser estável.
  // É uma senha local, de um banco ouvindo só em 127.0.0.1 e sem dados reais.
  const password = options.ephemeral ? randomBytes(12).toString("hex") : DEV_PASSWORD;
  const dataDir = resolve(options.dataDir);
  const fresh = !existsSync(join(dataDir, "PG_VERSION"));

  mkdirSync(dataDir, { recursive: true });
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password,
    port,
    // Sempre persistente para a lib: a remoção do diretório efêmero é feita por nós (ver stop()),
    // porque a limpeza da própria lib falha com EBUSY no Windows.
    persistent: true,
    // Igual ao Supabase: UTF-8. O padrão do Windows seria WIN1252 (não grava emoji nem outros alfabetos).
    // A locale pt-BR faz lower()/ILIKE tratarem acentos corretamente ("AÇÃO" = "ação").
    initdbFlags: ["--encoding=UTF8", "--locale=pt-BR"],
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
    onLog: () => {},
    onError: (msg: unknown) => {
      if (process.env.DEV_DB_VERBOSE) console.error("[dev-db]", msg);
    },
  });

  if (fresh) await server.initialise();
  await server.start();
  if (fresh) await server.createDatabase(database);

  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
  // Sempre: aplica só as migrations pendentes (clusters antigos acompanham as novas versões do schema)
  // e mantém o catálogo de bancos em dia (upsert idempotente).
  const applied = await applyMigrations(url);
  if (applied.length > 0 && !fresh) console.log(`[dev-db] migrations aplicadas: ${applied.join(", ")}`);
  await seedBanks(url);

  return {
    url,
    port,
    database,
    async stop() {
      await server.stop();
      if (options.ephemeral) {
        // No Windows os arquivos podem ficar travados por instantes após o stop; limpeza é melhor-esforço.
        try {
          rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
        } catch {
          /* o diretório temporário será removido pelo sistema */
        }
      }
    },
  };
}
