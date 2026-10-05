import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBuilders, createTestDb } from "./helpers";

let db: PGlite;
let mk: ReturnType<typeof createBuilders>;

beforeAll(async () => {
  db = await createTestDb();
  mk = createBuilders(db);
});

afterAll(async () => {
  await db.close();
});

/** Roda `fn` numa transação como `app_user` com RLS ativo, em nome de `userId`. */
async function asUser<T>(userId: string | null, fn: (q: PGlite["query"]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE app_user");
    if (userId) await tx.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    return fn(tx.query.bind(tx) as PGlite["query"]);
  });
}

describe("CHECK constraints", () => {
  it("rejeita lançamento sem conta e sem cartão", async () => {
    const u = await mk.user();
    await expect(mk.transaction(u.id)).rejects.toThrow(/ck_transactions_source_xor/);
  });

  it("rejeita lançamento com conta E cartão ao mesmo tempo", async () => {
    const u = await mk.user();
    const a = await mk.account(u.id);
    const c = await mk.card(u.id);
    await expect(
      mk.transaction(u.id, { account_id: a.id, card_id: c.id, payment_method: "CREDIT" }),
    ).rejects.toThrow(/ck_transactions_source_xor/);
  });

  it("rejeita valor zero ou negativo", async () => {
    const u = await mk.user();
    const a = await mk.account(u.id);
    await expect(mk.transaction(u.id, { account_id: a.id, amount_cents: 0 })).rejects.toThrow(
      /ck_transactions_amount_positive/,
    );
    await expect(mk.transaction(u.id, { account_id: a.id, amount_cents: -5 })).rejects.toThrow(
      /ck_transactions_amount_positive/,
    );
  });

  it("exige forma de pagamento CREDIT quando há cartão (e vice-versa)", async () => {
    const u = await mk.user();
    const a = await mk.account(u.id);
    const c = await mk.card(u.id);
    await expect(mk.transaction(u.id, { card_id: c.id, payment_method: "PIX" })).rejects.toThrow(
      /ck_transactions_card_payment/,
    );
    await expect(mk.transaction(u.id, { account_id: a.id, payment_method: "CREDIT" })).rejects.toThrow(
      /ck_transactions_card_payment/,
    );
    await expect(mk.transaction(u.id, { card_id: c.id, payment_method: "CREDIT" })).resolves.toBeTruthy();
  });

  it("transferência exige cabeçalho e lado, e não aceita categoria", async () => {
    const u = await mk.user();
    const a = await mk.account(u.id);
    const cat = await mk.category(u.id);
    await expect(mk.transaction(u.id, { account_id: a.id, type: "TRANSFER" })).rejects.toThrow(
      /ck_transactions_transfer_shape/,
    );
    await expect(
      mk.transaction(u.id, { account_id: a.id, type: "EXPENSE", transfer_side: "OUT" }),
    ).rejects.toThrow(/ck_transactions_transfer_shape/);
    const b = await mk.account(u.id, { name: "Poupança" });
    const t = await mk.insert("transfers", {
      user_id: u.id, from_account_id: a.id, to_account_id: b.id, amount_cents: 5000, occurred_on: "2026-10-01",
    });
    await expect(
      mk.transaction(u.id, {
        account_id: a.id, type: "TRANSFER", transfer_id: t.id, transfer_side: "OUT", category_id: cat.id,
      }),
    ).rejects.toThrow(/ck_transactions_transfer_no_category/);
  });

  it("transferência não pode ter a mesma conta de origem e destino", async () => {
    const u = await mk.user();
    const a = await mk.account(u.id);
    await expect(
      mk.insert("transfers", {
        user_id: u.id, from_account_id: a.id, to_account_id: a.id, amount_cents: 100, occurred_on: "2026-10-01",
      }),
    ).rejects.toThrow(/ck_transfers_distinct_accounts/);
  });

  it("valida parcelas (grupo, número e total andam juntos; 1 <= n <= total)", async () => {
    const u = await mk.user();
    const c = await mk.card(u.id);
    const base = { card_id: c.id, payment_method: "CREDIT" };
    await expect(
      mk.transaction(u.id, { ...base, installment_group_id: randomUUID(), installment_no: 4, installment_total: 3 }),
    ).rejects.toThrow(/ck_transactions_installments/);
    await expect(mk.transaction(u.id, { ...base, installment_no: 1 })).rejects.toThrow(/ck_transactions_installments/);
    await expect(
      mk.transaction(u.id, { ...base, installment_group_id: randomUUID(), installment_no: 1, installment_total: 3 }),
    ).resolves.toBeTruthy();
  });

  it("e-mail precisa estar em minúsculas", async () => {
    await expect(mk.insert("users", { id: randomUUID(), email: "Maiuscula@Teste.dev" })).rejects.toThrow(
      /ck_users_email_lowercase/,
    );
  });

  it("orçamento só no dia 1 do mês e com alerta entre 1 e 100", async () => {
    const u = await mk.user();
    const cat = await mk.category(u.id);
    await expect(
      mk.insert("budgets", { user_id: u.id, category_id: cat.id, month: "2026-10-15", amount_cents: 1000 }),
    ).rejects.toThrow(/ck_budgets_month_first_day/);
    await expect(
      mk.insert("budgets", { user_id: u.id, category_id: cat.id, month: "2026-10-01", amount_cents: 1000, alert_pct: 0 }),
    ).rejects.toThrow(/ck_budgets_alert_pct/);
  });
});

describe("unicidade e idempotência", () => {
  it("não permite gerar a mesma ocorrência de recorrência duas vezes", async () => {
    const u = await mk.user();
    const a = await mk.account(u.id);
    const rule = await mk.insert("recurring_rules", {
      user_id: u.id, type: "EXPENSE", description: "Netflix", amount_cents: 5590, account_id: a.id,
      payment_method: "PIX", frequency: "MONTHLY", day_of_month: 10, start_date: "2026-10-10", next_run_on: "2026-10-10",
    });
    const occ = { account_id: a.id, recurrence_id: rule.id, occurred_on: "2026-10-10" };
    await mk.transaction(u.id, occ);
    await expect(mk.transaction(u.id, occ)).rejects.toThrow(/unique|duplicate/i);
  });

  it("um orçamento por categoria e mês", async () => {
    const u = await mk.user();
    const cat = await mk.category(u.id);
    const b = { user_id: u.id, category_id: cat.id, month: "2026-10-01", amount_cents: 1000 };
    await mk.insert("budgets", b);
    await expect(mk.insert("budgets", b)).rejects.toThrow(/unique|duplicate/i);
  });

  it("categorias padrão: system_key único por usuário, mas livre entre usuários", async () => {
    const u1 = await mk.user();
    const u2 = await mk.user();
    await mk.category(u1.id, { system_key: "expense.food" });
    await expect(mk.category(u1.id, { system_key: "expense.food" })).rejects.toThrow(/unique|duplicate/i);
    await expect(mk.category(u2.id, { system_key: "expense.food" })).resolves.toBeTruthy();
  });
});

describe("isolamento entre usuários (FK composta)", () => {
  it("lançamento não pode referenciar conta de outro usuário", async () => {
    const a = await mk.user();
    const b = await mk.user();
    const accountOfB = await mk.account(b.id);
    await expect(mk.transaction(a.id, { account_id: accountOfB.id })).rejects.toThrow(/foreign key|violates/i);
  });

  it("lançamento não pode referenciar categoria de outro usuário", async () => {
    const a = await mk.user();
    const b = await mk.user();
    const accountOfA = await mk.account(a.id);
    const categoryOfB = await mk.category(b.id);
    await expect(
      mk.transaction(a.id, { account_id: accountOfA.id, category_id: categoryOfB.id }),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("cartão não pode ser pago por conta de outro usuário", async () => {
    const a = await mk.user();
    const b = await mk.user();
    const accountOfB = await mk.account(b.id);
    await expect(mk.card(a.id, { pay_account_id: accountOfB.id })).rejects.toThrow(/foreign key|violates/i);
  });
});

describe("Row Level Security", () => {
  it("cada usuário enxerga apenas as próprias linhas", async () => {
    const a = await mk.user();
    const b = await mk.user();
    const accA = await mk.account(a.id, { name: "A1" });
    await mk.account(b.id, { name: "B1" });

    const rows = await asUser(a.id, async (q) => (await q<{ id: string }>("SELECT id FROM accounts")).rows);
    expect(rows.map((r) => r.id)).toEqual([accA.id]);
  });

  it("sem app.user_id definido nenhuma linha é visível (falha fechada)", async () => {
    const a = await mk.user();
    await mk.account(a.id);
    const rows = await asUser(null, async (q) => (await q("SELECT id FROM accounts")).rows);
    expect(rows).toHaveLength(0);
  });

  it("usuário não consegue inserir dados em nome de outro", async () => {
    const a = await mk.user();
    const b = await mk.user();
    await expect(
      asUser(a.id, (q) =>
        q("INSERT INTO accounts (user_id, name, type, updated_at) VALUES ($1, 'Invasora', 'CHECKING', now())", [b.id]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("usuário não consegue alterar nem apagar linhas de outro", async () => {
    const a = await mk.user();
    const b = await mk.user();
    const accB = await mk.account(b.id, { name: "Intocável" });
    const upd = await asUser(a.id, (q) => q("UPDATE accounts SET name = 'hack' WHERE id = $1", [accB.id]));
    const del = await asUser(a.id, (q) => q("DELETE FROM accounts WHERE id = $1", [accB.id]));
    expect(upd.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
    const still = await db.query<{ name: string }>("SELECT name FROM accounts WHERE id = $1", [accB.id]);
    expect(still.rows[0]?.name).toBe("Intocável");
  });

  it("app_user só lê o catálogo de bancos e não escreve nele", async () => {
    await db.query("INSERT INTO banks (name, updated_at) VALUES ('Banco Teste', now())");
    const rows = await asUser(null, async (q) => (await q("SELECT id FROM banks")).rows);
    expect(rows.length).toBeGreaterThan(0);
    await expect(asUser(null, (q) => q("INSERT INTO banks (name, updated_at) VALUES ('X', now())"))).rejects.toThrow(
      /permission denied|row-level security/i,
    );
  });

  it("app_user não acessa audit_logs nem webhook_events", async () => {
    await expect(asUser(null, (q) => q("SELECT * FROM audit_logs"))).rejects.toThrow(/permission denied/i);
    await expect(asUser(null, (q) => q("SELECT * FROM webhook_events"))).rejects.toThrow(/permission denied/i);
  });

  it("usuário não consegue se promover a ADMIN nem alterar a própria assinatura", async () => {
    const a = await mk.user();
    await expect(asUser(a.id, (q) => q("UPDATE users SET role = 'ADMIN' WHERE id = $1", [a.id]))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asUser(a.id, (q) => q("UPDATE subscriptions SET plan = 'PREMIUM'"))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("toda tabela com user_id tem RLS e ao menos uma policy", async () => {
    const res = await db.query<{ relname: string }>(`
      SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
        AND (NOT c.relrowsecurity
             OR (EXISTS (SELECT 1 FROM information_schema.columns col
                         WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'user_id')
                 AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)))
    `);
    expect(res.rows).toEqual([]);
  });
});

describe("updated_at", () => {
  it("é atualizado por trigger mesmo em UPDATE fora do Prisma", async () => {
    const u = await mk.user();
    const a = await mk.account(u.id, { updated_at: "2000-01-01T00:00:00Z" });
    await db.query("UPDATE accounts SET name = 'Renomeada' WHERE id = $1", [a.id]);
    const res = await db.query<{ ok: boolean }>("SELECT updated_at > '2020-01-01' AS ok FROM accounts WHERE id = $1", [a.id]);
    expect(res.rows[0]?.ok).toBe(true);
  });
});

describe("funções do banco", () => {
  it("têm search_path fixo (aviso 'Function Search Path Mutable' do Supabase) e seguem funcionando", async () => {
    const res = await db.query<{ proname: string; proconfig: string[] | null }>(`
      SELECT p.proname, p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('app_current_user_id', 'set_updated_at')
      ORDER BY p.proname
    `);
    expect(res.rows.map((r) => r.proname)).toEqual(["app_current_user_id", "set_updated_at"]);
    for (const r of res.rows) expect(r.proconfig).toContain('search_path=""');

    // A função do RLS continua lendo app.user_id mesmo com o search_path vazio...
    const a = await mk.user();
    const seen = await asUser(a.id, (q) => q<{ id: string | null }>("SELECT app_current_user_id() AS id"));
    expect(seen.rows[0]?.id).toBe(a.id);
    // ...e continua falhando fechado sem usuário definido.
    const none = await asUser(null, (q) => q<{ id: string | null }>("SELECT app_current_user_id() AS id"));
    expect(none.rows[0]?.id).toBeNull();
  });
});

describe("perfil: aparência", () => {
  const inserirPerfil = (userId: string, appearance: unknown) =>
    mk.insert("profiles", { user_id: userId, appearance: appearance === null ? null : JSON.stringify(appearance) });

  it("aceita nulo e um tema pequeno, com as cores personalizadas", async () => {
    const a = await mk.user();
    const p = await inserirPerfil(a.id, null);
    expect(p.appearance).toBeNull();
    const b = await mk.user();
    const q = await inserirPerfil(b.id, { preset: "custom", custom: { primary: "#112233", accent: "#445566", background: "#778899", surface: "#AABBCC" } });
    expect(q.appearance.preset).toBe("custom");
  });

  it("recusa um JSON grande demais (a coluna não é depósito de dados)", async () => {
    const u = await mk.user();
    await expect(inserirPerfil(u.id, { preset: "dark", lixo: "x".repeat(600) })).rejects.toThrow(/ck_profiles_appearance_size/);
  });
});

describe("exclusão de conta (LGPD)", () => {
  it("DELETE do usuário remove TODOS os dados dele, em qualquer ordem de cascata", async () => {
    const u = await mk.user();
    const other = await mk.user();
    await mk.account(other.id, { name: "Outro usuário — deve sobreviver" });

    // Grafo completo de dados do usuário
    const a = await mk.account(u.id, { name: "Corrente" });
    const b = await mk.account(u.id, { name: "Poupança" });
    const cat = await mk.category(u.id);
    const card = await mk.card(u.id, { pay_account_id: a.id });
    const inv = await mk.invoice(u.id, card.id);
    await mk.transaction(u.id, { account_id: a.id, category_id: cat.id });
    await mk.transaction(u.id, { card_id: card.id, invoice_id: inv.id, category_id: cat.id, payment_method: "CREDIT" });
    const tr = await mk.insert("transfers", {
      user_id: u.id, from_account_id: a.id, to_account_id: b.id, amount_cents: 2000, occurred_on: "2026-10-02",
    });
    await mk.transaction(u.id, { account_id: a.id, type: "TRANSFER", transfer_id: tr.id, transfer_side: "OUT", payment_method: "OTHER" });
    await mk.transaction(u.id, { account_id: b.id, type: "TRANSFER", transfer_id: tr.id, transfer_side: "IN", payment_method: "OTHER" });
    await mk.insert("invoice_payments", { user_id: u.id, invoice_id: inv.id, account_id: a.id, amount_cents: 1000, paid_on: "2026-10-12" });
    await mk.insert("budgets", { user_id: u.id, category_id: cat.id, month: "2026-10-01", amount_cents: 50_000 });
    const goal = await mk.insert("goals", { user_id: u.id, name: "Carro", target_cents: 5_000_000 });
    await mk.insert("goal_contributions", { user_id: u.id, goal_id: goal.id, amount_cents: 10_000, occurred_on: "2026-10-03" });
    await mk.insert("profiles", { user_id: u.id });
    await mk.insert("subscriptions", { user_id: u.id });
    await mk.insert("consents", { user_id: u.id, type: "TERMS", version: "2026-10-01" });
    await mk.insert("notifications", { user_id: u.id, type: "SYSTEM", title: "Oi", body: "Teste" });
    const pr = await mk.insert("privacy_requests", { user_id: u.id, type: "DELETE" });

    await db.query("DELETE FROM users WHERE id = $1", [u.id]);

    // Nenhuma tabela com user_id pode reter linhas do usuário apagado
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'user_id'`,
    );
    expect(tables.rows.length).toBeGreaterThan(15);
    for (const { table_name } of tables.rows) {
      const left = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table_name} WHERE user_id = $1`, [u.id]);
      expect(left.rows[0]?.n, `tabela ${table_name} reteve dados do usuário apagado`).toBe(0);
    }

    // A prova do pedido de exclusão permanece, sem dado pessoal (user_id = NULL)
    const proof = await db.query<{ user_id: string | null; type: string }>(
      "SELECT user_id, type FROM privacy_requests WHERE id = $1",
      [pr.id],
    );
    expect(proof.rows).toEqual([{ user_id: null, type: "DELETE" }]);

    // Dados de outro usuário não são tocados
    const survivors = await db.query("SELECT 1 FROM accounts WHERE user_id = $1", [other.id]);
    expect(survivors.rows).toHaveLength(1);
  });
});
