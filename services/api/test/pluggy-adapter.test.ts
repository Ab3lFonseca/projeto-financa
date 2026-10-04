import { describe, expect, it } from "vitest";
import { mapItemStatus, normalizeTransaction, PluggyProvider } from "../src/modules/open-finance/pluggy";
import { ProviderError } from "../src/modules/open-finance/provider";

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

/** `fetch` simulado: responde por regra (método + caminho) e registra cada chamada. */
function mockFetch(handler: (call: Call) => { status?: number; json?: unknown } | Error) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const out = handler(call);
    if (out instanceof Error) throw out;
    return new Response(out.json === undefined ? null : JSON.stringify(out.json), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const make = (handler: Parameters<typeof mockFetch>[0], extra: Record<string, unknown> = {}) => {
  const f = mockFetch(handler);
  let now = new Date("2026-10-04T12:00:00Z");
  const provider = new PluggyProvider({ clientId: "cid", clientSecret: "secret", webhookSecret: "whsec", fetch: f.impl, now: () => now, ...extra });
  return { provider, calls: f.calls, advance: (ms: number) => void (now = new Date(now.getTime() + ms)) };
};

describe("autenticação", () => {
  it("autentica uma vez, reaproveita a chave e renova antes de vencer (2 h)", async () => {
    let n = 0;
    const { provider, calls, advance } = make((c) => {
      if (c.url.endsWith("/auth")) return { json: { apiKey: `key-${++n}` } };
      return { json: { results: [] } };
    });
    await provider.listAccounts("item-1");
    await provider.listAccounts("item-1");
    expect(calls.filter((c) => c.url.endsWith("/auth"))).toHaveLength(1);
    expect(calls.find((c) => c.url.endsWith("/auth"))!.body).toEqual({ clientId: "cid", clientSecret: "secret" });
    expect(calls.at(-1)!.headers["x-api-key"]).toBe("key-1");
    advance(101 * 60_000);
    await provider.listAccounts("item-1");
    expect(calls.at(-1)!.headers["x-api-key"]).toBe("key-2");
  });

  it("chamadas simultâneas compartilham uma única autenticação", async () => {
    const { provider, calls } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { results: [] } }));
    await Promise.all([provider.listAccounts("a"), provider.listAccounts("b"), provider.listAccounts("c")]);
    expect(calls.filter((c) => c.url.endsWith("/auth"))).toHaveLength(1);
  });

  it("chave recusada (401) é renovada e a chamada repetida uma vez", async () => {
    let auths = 0;
    const { provider, calls } = make((c) => {
      if (c.url.endsWith("/auth")) return { json: { apiKey: `k${++auths}` } };
      return c.headers["x-api-key"] === "k1" ? { status: 401 } : { json: { results: [] } };
    });
    await expect(provider.listAccounts("item")).resolves.toEqual([]);
    expect(auths).toBe(2);
    expect(calls.filter((c) => c.url.includes("/accounts"))).toHaveLength(2);
  });

  it("credenciais inválidas viram erro do provedor sem vazar detalhes", async () => {
    const { provider } = make(() => ({ status: 401, json: { message: "clientSecret inválido: segredo-vazado" } }));
    const err = await provider.listAccounts("item").catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe("PROVIDER_AUTH_FAILED");
    expect(err.message).not.toContain("segredo-vazado");
  });
});

describe("connect token", () => {
  it("envia clientUserId DENTRO de options (no nível raiz o Pluggy ignora) e evita duplicatas", async () => {
    const { provider, calls } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { accessToken: "ct-1" } }));
    const token = await provider.createConnectToken({ clientUserId: "user-1", itemId: "item-9" });
    const call = calls.find((c) => c.url.endsWith("/connect_token"))!;
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({ options: { clientUserId: "user-1", itemId: "item-9", avoidDuplicates: true } });
    expect(call.body.clientUserId).toBeUndefined();
    expect(token.accessToken).toBe("ct-1");
    expect(token.expiresAt.toISOString()).toBe("2026-10-04T12:30:00.000Z"); // 30 minutos
  });

  it("envia o deep link de retorno (oauthRedirectUri) quando configurado", async () => {
    const { provider, calls } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { accessToken: "x" } }));
    await provider.createConnectToken({ clientUserId: "u", redirectUri: "financa://open-finance" });
    expect(calls.find((c) => c.url.endsWith("/connect_token"))!.body.options).toMatchObject({ oauthRedirectUri: "financa://open-finance" });
  });

  it("não envia itemId quando é conexão nova", async () => {
    const { provider, calls } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { accessToken: "x" } }));
    await provider.createConnectToken({ clientUserId: "u" });
    expect(calls.find((c) => c.url.endsWith("/connect_token"))!.body.options).toEqual({ clientUserId: "u", avoidDuplicates: true });
  });
});

describe("conectores regulados", () => {
  it("pede só Open Finance de pessoa física no Brasil e percorre as páginas", async () => {
    const { provider, calls } = make((c) => {
      if (c.url.endsWith("/auth")) return { json: { apiKey: "k" } };
      const page = new URL(c.url).searchParams.get("page");
      return page === "1"
        ? { json: { page: 1, totalPages: 2, results: [{ id: 1, name: "Banco 1", isOpenFinance: true }, { id: 2, name: "Sem marca" }] } }
        : { json: { page: 2, totalPages: 2, results: [{ id: 3, name: "Banco 3", isOpenFinance: true }, { id: 4, name: "Não regulado", isOpenFinance: false }] } };
    });
    const list = await provider.listRegulatedConnectors();
    const reqs = calls.filter((c) => c.url.includes("/connectors"));
    expect(reqs).toHaveLength(2);
    const q = new URL(reqs[0]!.url).searchParams;
    expect(q.get("isOpenFinance")).toBe("true");
    expect(q.get("countries")).toBe("BR");
    expect(q.get("types")).toBe("PERSONAL_BANK");
    // mesmo que o provedor devolva um não regulado por engano, ele não passa
    expect(list.map((c) => c.id)).toEqual([1, 2, 3]);
  });
});

describe("itens e contas", () => {
  it("mapeia o item (conector regulado, consentimento, status)", async () => {
    const { provider, calls } = make((c) =>
      c.url.endsWith("/auth")
        ? { json: { apiKey: "k" } }
        : {
            json: {
              id: "it-1",
              clientUserId: "user-1",
              status: "UPDATED",
              executionStatus: "SUCCESS",
              lastUpdatedAt: "2026-10-04T10:00:00.000Z",
              consentExpiresAt: "2027-04-04T00:00:00.000Z",
              connector: { name: "Itaú", isOpenFinance: true },
              error: null,
            },
          },
    );
    const item = await provider.getItem("it-1");
    expect(calls.at(-1)!.url).toContain("/items/it-1");
    expect(item).toMatchObject({ id: "it-1", clientUserId: "user-1", institutionName: "Itaú", isOpenFinance: true, status: "ACTIVE", errorCode: null });
    expect(item!.consentExpiresAt?.toISOString()).toBe("2027-04-04T00:00:00.000Z");
  });

  it("conector sem a marca isOpenFinance é tratado como NÃO regulado", async () => {
    const { provider } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { id: "x", connector: { name: "Banco" } } }));
    expect((await provider.getItem("x"))!.isOpenFinance).toBe(false);
  });

  it("item inexistente → null", async () => {
    const { provider } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { status: 404 }));
    expect(await provider.getItem("nope")).toBeNull();
  });

  it("contas: tipo, nome e saldo em centavos", async () => {
    const { provider, calls } = make((c) =>
      c.url.endsWith("/auth")
        ? { json: { apiKey: "k" } }
        : { json: { results: [{ id: "a1", type: "BANK", name: "Conta", balance: 1234.56 }, { id: "a2", type: "CREDIT", name: "Cartão", balance: -300.1 }, { id: "a3", type: "BANK" }] } },
    );
    const accounts = await provider.listAccounts("item 1");
    expect(calls.at(-1)!.url).toContain("/accounts?itemId=item%201");
    expect(accounts).toEqual([
      { id: "a1", kind: "BANK", name: "Conta", balanceCents: 123_456, credit: null },
      { id: "a2", kind: "CREDIT", name: "Cartão", balanceCents: -30_010, credit: null },
      { id: "a3", kind: "BANK", name: "Conta", balanceCents: null, credit: null },
    ]);
  });
});

describe("transações (GET /v2/transactions por cursor)", () => {
  it("segue o cursor `next` até acabar e normaliza o sinal por tipo de conta", async () => {
    const { provider, calls } = make((c) => {
      if (c.url.endsWith("/auth")) return { json: { apiKey: "k" } };
      if (!c.url.includes("after=")) {
        return {
          json: {
            results: [
              { id: "t1", description: "Mercado", amount: -89.9, date: "2026-10-02T00:00:00.000Z", status: "POSTED" },
              { id: "t2", description: "Salário", amount: 5000, date: "2026-10-01T00:00:00.000Z", status: "POSTED" },
            ],
            next: "?accountId=acc-1&dateFrom=2026-07-06&after=cursor%3D%3D1",
          },
        };
      }
      return { json: { results: [{ id: "t3", description: "Pix", amount: -10, date: "2026-09-30T03:00:00.000Z", status: "PENDING" }], next: null } };
    });
    const txs = await provider.listTransactions("acc-1", "BANK", "2026-07-06");
    const reqs = calls.filter((c) => c.url.includes("/v2/transactions"));
    expect(reqs).toHaveLength(2);
    expect(reqs[0]!.url).toContain("accountId=acc-1");
    expect(reqs[0]!.url).toContain("dateFrom=2026-07-06");
    expect(reqs[1]!.url).toContain("after=cursor%3D%3D1");
    expect(txs).toEqual([
      { id: "t1", accountId: "acc-1", description: "Mercado", amountCents: 8_990, direction: "DEBIT", postedOn: "2026-10-02", status: "POSTED" },
      { id: "t2", accountId: "acc-1", description: "Salário", amountCents: 500_000, direction: "CREDIT", postedOn: "2026-10-01", status: "POSTED" },
      { id: "t3", accountId: "acc-1", description: "Pix", amountCents: 1_000, direction: "DEBIT", postedOn: "2026-09-30", status: "PENDING" },
    ]);
  });

  it("ignora um `next` fora do formato esperado (não segue URL estranha)", async () => {
    const { provider, calls } = make((c) =>
      c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { results: [], next: "https://evil.example/steal?x=1" } },
    );
    await provider.listTransactions("a", "BANK", "2026-01-01");
    expect(calls.filter((c) => c.url.includes("/v2/transactions"))).toHaveLength(1);
    expect(calls.some((c) => c.url.includes("evil"))).toBe(false);
  });

  it("sinal: em conta + é entrada; em cartão + é compra e − é pagamento/estorno", () => {
    const base = { id: "x", date: "2026-10-01T00:00:00Z" };
    expect(normalizeTransaction({ ...base, amount: 100 }, "BANK", "a")).toMatchObject({ direction: "CREDIT", amountCents: 10_000 });
    expect(normalizeTransaction({ ...base, amount: -100 }, "BANK", "a")).toMatchObject({ direction: "DEBIT", amountCents: 10_000 });
    expect(normalizeTransaction({ ...base, amount: 100 }, "CREDIT", "a")).toMatchObject({ direction: "DEBIT", amountCents: 10_000 });
    expect(normalizeTransaction({ ...base, amount: -100 }, "CREDIT", "a")).toMatchObject({ direction: "CREDIT", amountCents: 10_000 });
  });

  it("arredonda centavos sem erro de ponto flutuante e descarta valor zero", () => {
    const base = { id: "x", date: "2026-10-01T00:00:00Z" };
    expect(normalizeTransaction({ ...base, amount: -19.99 }, "BANK", "a")!.amountCents).toBe(1_999);
    expect(normalizeTransaction({ ...base, amount: 0.1 + 0.2 }, "BANK", "a")!.amountCents).toBe(30);
    expect(normalizeTransaction({ ...base, amount: 1.005 }, "BANK", "a")!.amountCents).toBe(101);
    expect(normalizeTransaction({ ...base, amount: 0 }, "BANK", "a")).toBeNull();
  });

  it("usa descriptionRaw quando falta description e limita o tamanho", () => {
    const base = { id: "x", date: "2026-10-01T00:00:00Z", amount: 1 };
    expect(normalizeTransaction({ ...base, descriptionRaw: "RAW" }, "BANK", "a")!.description).toBe("RAW");
    expect(normalizeTransaction(base, "BANK", "a")!.description).toBe("Transação bancária");
    expect(normalizeTransaction({ ...base, description: "x".repeat(900) }, "BANK", "a")!.description).toHaveLength(500);
  });
});

describe("cartões (creditData)", () => {
  it("limite, disponível, datas e pagamento mínimo em centavos; só em conta de crédito", async () => {
    const { provider } = make((c) =>
      c.url.endsWith("/auth")
        ? { json: { apiKey: "k" } }
        : {
            json: {
              results: [
                {
                  id: "card",
                  type: "CREDIT",
                  name: "Gold",
                  balance: 2879.45,
                  creditData: {
                    brand: "MASTERCARD",
                    creditLimit: 8000,
                    availableCreditLimit: 5120.55,
                    balanceCloseDate: "2026-10-10T00:00:00.000Z",
                    balanceDueDate: "2026-10-17T00:00:00.000Z",
                    minimumPayment: 287.94,
                  },
                },
                { id: "semdados", type: "CREDIT", name: "Sem dados", creditData: null },
                { id: "conta", type: "BANK", name: "Corrente", balance: 10, creditData: { creditLimit: 1 } },
              ],
            },
          },
    );
    const [card, empty, bank] = await provider.listAccounts("it");
    expect(card).toMatchObject({ kind: "CREDIT", balanceCents: 287_945 });
    expect(card!.credit).toEqual({ brand: "MASTERCARD", limitCents: 800_000, availableCents: 512_055, closeDate: "2026-10-10", dueDate: "2026-10-17", minimumPaymentCents: 28_794 });
    expect(empty!.credit).toBeNull();
    expect(bank!.credit).toBeNull();
  });

  it("campos ausentes ou inválidos viram null (nunca NaN ou datas quebradas)", async () => {
    const { provider } = make((c) =>
      c.url.endsWith("/auth")
        ? { json: { apiKey: "k" } }
        : { json: { results: [{ id: "c", type: "CREDIT", creditData: { creditLimit: "muito", balanceCloseDate: "ontem", availableCreditLimit: null } }] } },
    );
    const [card] = await provider.listAccounts("it");
    expect(card!.credit).toEqual({ brand: null, limitCents: null, availableCents: null, closeDate: null, dueDate: null, minimumPaymentCents: null });
  });
});

describe("investimentos (GET /investments)", () => {
  const cdb = {
    id: "inv-1",
    name: "CDB Banco Teste 110% CDI",
    type: "FIXED_INCOME",
    subtype: "cdb",
    issuer: "Banco Teste S.A.",
    status: "ACTIVE",
    balance: 1050.37,
    amountOriginal: 1000,
    amountProfit: 50.37,
    amountWithdrawal: 1050.37,
    rate: 110,
    rateType: "cdi",
    fixedAnnualRate: null,
    annualRate: null,
    issueDate: "2026-07-01T00:00:00.000Z",
    dueDate: "2028-07-01T00:00:00.000Z",
  };

  it("normaliza valores em centavos, caixa alta e datas", async () => {
    const { provider, calls } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { page: 1, totalPages: 1, results: [cdb] } }));
    const list = await provider.listInvestments("item 1");
    expect(calls.at(-1)!.url).toContain("/investments?itemId=item+1&page=1");
    expect(list).toEqual([
      {
        id: "inv-1",
        name: "CDB Banco Teste 110% CDI",
        type: "FIXED_INCOME",
        subtype: "CDB",
        issuer: "Banco Teste S.A.",
        status: "ACTIVE",
        balanceCents: 105_037,
        investedCents: 100_000,
        profitCents: 5_037,
        withdrawableCents: 105_037,
        rateType: "CDI",
        rate: 110,
        fixedAnnualRate: null,
        annualRate: null,
        issueDate: "2026-07-01",
        dueDate: "2028-07-01",
      },
    ]);
  });

  it("calcula o rendimento quando o banco não informa, aceita prejuízo e usa `amount` se faltar `balance`", async () => {
    const { provider } = make((c) =>
      c.url.endsWith("/auth")
        ? { json: { apiKey: "k" } }
        : {
            json: {
              results: [
                { id: "a", name: "Sem lucro informado", balance: 1100, amountOriginal: 1000 },
                { id: "b", name: "No prejuízo", balance: 900, amountOriginal: 1000, amountProfit: -100 },
                { id: "c", name: "Só amount", amount: 500 },
                { id: "d", name: "Sem base", balance: 300 },
              ],
            },
          },
    );
    const [a, b, c, d] = await provider.listInvestments("it");
    expect(a).toMatchObject({ balanceCents: 110_000, investedCents: 100_000, profitCents: 10_000 });
    expect(b).toMatchObject({ balanceCents: 90_000, profitCents: -10_000 });
    expect(c).toMatchObject({ balanceCents: 50_000, investedCents: null, profitCents: null });
    expect(d).toMatchObject({ investedCents: null, profitCents: null, status: "ACTIVE", type: "OTHER", subtype: null });
  });

  it("descarta o que não tem id ou valor; status desconhecido vira ACTIVE; resgate total é mantido", async () => {
    const { provider } = make((c) =>
      c.url.endsWith("/auth")
        ? { json: { apiKey: "k" } }
        : {
            json: {
              results: [
                { name: "Sem id", balance: 10 },
                { id: "sem-valor", name: "Sem valor" },
                { id: "x", name: "Status novo", balance: 10, status: "ALGO_NOVO" },
                { id: "y", name: "Resgatado", balance: 0, status: "TOTAL_WITHDRAWAL" },
              ],
            },
          },
    );
    const list = await provider.listInvestments("it");
    expect(list.map((i) => [i.id, i.status])).toEqual([["x", "ACTIVE"], ["y", "TOTAL_WITHDRAWAL"]]);
  });

  it("percorre as páginas (totalPages) e para no teto", async () => {
    const { provider, calls } = make((c) => {
      if (c.url.endsWith("/auth")) return { json: { apiKey: "k" } };
      const page = new URL(c.url).searchParams.get("page");
      return { json: { page: Number(page), totalPages: 2, results: [{ id: `p${page}`, name: `Inv ${page}`, balance: 1 }] } };
    });
    const list = await provider.listInvestments("it");
    expect(list.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(calls.filter((c) => c.url.includes("/investments"))).toHaveLength(2);

    const endless = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { totalPages: 999, results: [] } }));
    await endless.provider.listInvestments("it");
    expect(endless.calls.filter((c) => c.url.includes("/investments"))).toHaveLength(10);
  });

  it("conector sem investimentos (404) devolve lista vazia", async () => {
    const { provider } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { status: 404 }));
    expect(await provider.listInvestments("it")).toEqual([]);
  });
});

describe("pedido de atualização e coleta parcial", () => {
  it("PATCH /items/{id} com corpo vazio", async () => {
    const { provider, calls } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { id: "x" } }));
    await provider.refreshItem("abc-1");
    const call = calls.at(-1)!;
    expect(call.method).toBe("PATCH");
    expect(call.url).toBe("https://api.pluggy.ai/items/abc-1");
    expect(call.body).toEqual({});
  });

  it("404, limite e erro do servidor viram erros claros", async () => {
    const run = (status: number) => make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { status })).provider.refreshItem("it");
    await expect(run(404)).rejects.toMatchObject({ code: "PROVIDER_ITEM_NOT_FOUND", retryable: false });
    await expect(run(429)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: true });
    await expect(run(500)).rejects.toMatchObject({ code: "PROVIDER_ERROR", retryable: true });
    await expect(run(400)).rejects.toMatchObject({ code: "PROVIDER_ERROR", retryable: false });
  });

  it("PARTIAL_SUCCESS marca a coleta como parcial (lista vazia não prova nada)", async () => {
    const make1 = (status: string) => make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { json: { id: "i", status, connector: { name: "B", isOpenFinance: true } } } ));
    expect((await make1("PARTIAL_SUCCESS").provider.getItem("i"))).toMatchObject({ status: "ACTIVE", partial: true });
    expect((await make1("UPDATED").provider.getItem("i"))).toMatchObject({ status: "ACTIVE", partial: false });
  });
});

describe("remoção e erros", () => {
  it("DELETE do item: 404 conta como sucesso; 5xx e rede são repetíveis; 429 informa limite", async () => {
    const run = (status: number) => make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { status })).provider.deleteItem("it");
    await expect(run(204)).resolves.toBeUndefined();
    await expect(run(404)).resolves.toBeUndefined();
    await expect(run(500)).rejects.toMatchObject({ code: "PROVIDER_ERROR", retryable: true });
    await expect(run(429)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: true });
    await expect(run(400)).rejects.toMatchObject({ code: "PROVIDER_ERROR", retryable: false });
    const down = make(() => new Error("ECONNRESET")).provider;
    await expect(down.deleteItem("it")).rejects.toMatchObject({ code: "PROVIDER_UNREACHABLE", retryable: true });
  });

  it("DELETE usa o método e o caminho corretos", async () => {
    const { provider, calls } = make((c) => (c.url.endsWith("/auth") ? { json: { apiKey: "k" } } : { status: 204 }));
    await provider.deleteItem("abc-123");
    const call = calls.at(-1)!;
    expect(call.method).toBe("DELETE");
    expect(call.url).toBe("https://api.pluggy.ai/items/abc-123");
  });
});

describe("webhook", () => {
  it("só aceita o segredo configurado (cabeçalho x-webhook-secret)", () => {
    const { provider } = make(() => ({ json: {} }));
    expect(provider.verifyWebhook({ "x-webhook-secret": "whsec" })).toBe(true);
    expect(provider.verifyWebhook({ "x-webhook-secret": ["whsec"] })).toBe(true);
    expect(provider.verifyWebhook({ "x-webhook-secret": "whsec2" })).toBe(false);
    expect(provider.verifyWebhook({ "x-webhook-secret": "" })).toBe(false);
    expect(provider.verifyWebhook({})).toBe(false);
  });

  it("sem segredo configurado, nenhum webhook é aceito", () => {
    const { provider } = make(() => ({ json: {} }), { webhookSecret: undefined });
    expect(provider.verifyWebhook({ "x-webhook-secret": "qualquer" })).toBe(false);
    expect(provider.verifyWebhook({ "x-webhook-secret": "undefined" })).toBe(false);
  });
});

describe("mapItemStatus", () => {
  it.each([
    ["UPDATED", "ACTIVE"],
    ["PARTIAL_SUCCESS", "ACTIVE"],
    ["UPDATING", "CONNECTING"],
    ["CREATING", "CONNECTING"],
    ["WAITING_USER_INPUT", "CONNECTING"],
    ["WAITING_USER_ACTION", "CONNECTING"],
    ["LOGIN_ERROR", "ERROR"],
    ["OUTDATED", "OUTDATED"],
    ["ALGO_NOVO", "OUTDATED"],
  ])("%s → %s", (input, expected) => {
    expect(mapItemStatus(input, undefined)).toBe(expected);
  });

  it("status desconhecido com execução em erro → ERROR", () => {
    expect(mapItemStatus("ALGO_NOVO", "CONNECTION_ERROR")).toBe("ERROR");
  });
});
