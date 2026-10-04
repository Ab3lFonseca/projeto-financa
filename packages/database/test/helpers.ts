import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "prisma", "migrations");

/** Sobe um Postgres em memória e aplica TODAS as migrations, na ordem real. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (dirs.length < 2) {
    throw new Error(
      `Esperava a migration de estrutura (init) + a de constraints/RLS em ${MIGRATIONS_DIR}; achei: ${dirs.join(", ") || "nenhuma"}. ` +
        "Gere a init com: pnpm --filter @app/database run migrate:init",
    );
  }
  for (const dir of dirs) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
  }
  return db;
}

/** Builders de linhas para os testes. updated_at (sem default no banco) é preenchido sozinho. */
export function createBuilders(db: PGlite) {
  let tablesWithUpdatedAt: Set<string> | undefined;

  async function hasUpdatedAt(table: string): Promise<boolean> {
    if (!tablesWithUpdatedAt) {
      const res = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'updated_at'`,
      );
      tablesWithUpdatedAt = new Set(res.rows.map((r) => r.table_name));
    }
    return tablesWithUpdatedAt.has(table);
  }

  /** Insere e devolve a linha criada. Nomes de tabela/coluna vêm só do código de teste. */
  async function insert(table: string, data: Record<string, unknown>): Promise<Record<string, any>> {
    const row = { ...data };
    if ((await hasUpdatedAt(table)) && row.updated_at === undefined) {
      row.updated_at = new Date().toISOString();
    }
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const res = await db.query<Record<string, any>>(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      Object.values(row),
    );
    return res.rows[0]!;
  }

  const user = (email = `u-${randomUUID()}@teste.dev`) => insert("users", { id: randomUUID(), email });

  const account = (userId: string, over: Record<string, unknown> = {}) =>
    insert("accounts", { user_id: userId, name: "Conta", type: "CHECKING", ...over });

  const category = (userId: string, over: Record<string, unknown> = {}) =>
    insert("categories", { user_id: userId, type: "EXPENSE", name: "Cat", ...over });

  const card = (userId: string, over: Record<string, unknown> = {}) =>
    insert("credit_cards", { user_id: userId, name: "Cartão", limit_cents: 500_000, closing_day: 5, due_day: 12, ...over });

  const invoice = (userId: string, cardId: string, over: Record<string, unknown> = {}) =>
    insert("invoices", {
      user_id: userId,
      card_id: cardId,
      reference_month: "2026-10-01",
      closing_date: "2026-10-05",
      due_date: "2026-10-12",
      ...over,
    });

  /** Lançamento de despesa em conta (PIX). `over` sobrescreve/adiciona colunas. */
  const transaction = (userId: string, over: Record<string, unknown> = {}) =>
    insert("transactions", {
      user_id: userId,
      type: "EXPENSE",
      description: "Teste",
      amount_cents: 1000,
      occurred_on: "2026-10-01",
      payment_method: "PIX",
      ...over,
    });

  return { insert, user, account, category, card, invoice, transaction };
}
