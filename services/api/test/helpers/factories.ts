import type { TestEnv, TestUser } from "./env";

export type World = {
  user: TestUser;
  cat: (key: string) => any;
  account: any;
  /** Cria outra conta rapidamente. */
  newAccount(name: string, opening?: number, extra?: Record<string, unknown>): Promise<any>;
  balanceOf(accountId: string): Promise<number>;
  expense(over?: Record<string, unknown>): Promise<any>;
  income(over?: Record<string, unknown>): Promise<any>;
};

/** Usuário pronto: perfil provisionado, categorias padrão e uma conta com R$ 1.000,00. */
export async function createWorld(env: TestEnv, opts: { opening?: number; email?: string } = {}): Promise<World> {
  const user = await env.newUser({ email: opts.email });
  await user.get("/v1/me");
  const categories = (await user.get("/v1/categories")).body.data as any[];
  const cat = (key: string) => {
    const c = categories.find((x) => x.systemKey === key);
    if (!c) throw new Error(`categoria padrão ${key} não encontrada`);
    return c;
  };
  const created = await user.post("/v1/accounts", {
    name: "Conta corrente",
    type: "CHECKING",
    openingBalanceCents: opts.opening ?? 100_000,
  });
  if (created.status !== 201) throw new Error(`falha ao criar conta: ${JSON.stringify(created.body)}`);
  const account = created.body;

  const balanceOf = async (id: string) => (await user.get(`/v1/accounts/${id}`)).body.balanceCents as number;

  return {
    user,
    cat,
    account,
    balanceOf,
    async newAccount(name, opening = 0, extra = {}) {
      const r = await user.post("/v1/accounts", { name, type: "CHECKING", openingBalanceCents: opening, ...extra });
      if (r.status !== 201) throw new Error(`falha ao criar conta: ${JSON.stringify(r.body)}`);
      return r.body;
    },
    async expense(over = {}) {
      const r = await user.post("/v1/transactions", {
        type: "EXPENSE",
        description: "Despesa",
        amountCents: 1000,
        occurredOn: "2026-10-03",
        accountId: account.id,
        categoryId: cat("expense.food").id,
        paymentMethod: "PIX",
        ...over,
      });
      if (r.status >= 300) throw new Error(`falha ao criar despesa: ${JSON.stringify(r.body)}`);
      return r.body;
    },
    async income(over = {}) {
      const r = await user.post("/v1/transactions", {
        type: "INCOME",
        description: "Receita",
        amountCents: 5000,
        occurredOn: "2026-10-02",
        accountId: account.id,
        categoryId: cat("income.salary").id,
        paymentMethod: "PIX",
        ...over,
      });
      if (r.status >= 300) throw new Error(`falha ao criar receita: ${JSON.stringify(r.body)}`);
      return r.body;
    },
  };
}
