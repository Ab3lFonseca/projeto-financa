import { describe, expect, it } from "vitest";
import {
  createGoalBody,
  createTransactionBody,
  createTransferBody,
  listTransactionsQuery,
  monthParam,
  multiLine,
  registerBody,
  reportQuery,
  singleLine,
  updateTransactionBody,
} from "../src";

const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
const uuid2 = "1f8fad5b-d9cb-469f-a165-70867728950e";

describe("sanitização de texto", () => {
  it("singleLine normaliza espaços e remove caracteres de controle", () => {
    expect(singleLine(50).parse("  Mercado \n  do\tZé \u0000 ")).toBe("Mercado do Zé");
  });
  it("singleLine rejeita vazio e excesso", () => {
    expect(singleLine(5).safeParse("   ").success).toBe(false);
    expect(singleLine(5).safeParse("123456").success).toBe(false);
  });
  it("multiLine preserva quebras de linha e remove controles", () => {
    expect(multiLine(100).parse("linha 1\r\nlinha 2\u0007")).toBe("linha 1\nlinha 2");
  });
});

describe("registerBody", () => {
  const valid = {
    email: "  Maria@Exemplo.com ",
    password: "senhaForte123",
    acceptTerms: true,
    acceptPrivacy: true,
    termsVersion: "2026-10-01",
    privacyVersion: "2026-10-01",
  };
  it("normaliza o e-mail e aplica defaults", () => {
    const r = registerBody.parse(valid);
    expect(r.email).toBe("maria@exemplo.com");
    expect(r.marketingOptIn).toBe(false);
  });
  it("exige aceite dos termos e da privacidade", () => {
    expect(registerBody.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
    expect(registerBody.safeParse({ ...valid, acceptPrivacy: undefined }).success).toBe(false);
  });
  it("rejeita senha fraca", () => {
    expect(registerBody.safeParse({ ...valid, password: "curta1" }).success).toBe(false);
    expect(registerBody.safeParse({ ...valid, password: "somenteletrasaqui" }).success).toBe(false);
    expect(registerBody.safeParse({ ...valid, password: "1234567890123" }).success).toBe(false);
    expect(registerBody.safeParse({ ...valid, password: "a1".repeat(40) }).success).toBe(false);
  });
  it("rejeita campos desconhecidos (mass assignment)", () => {
    expect(registerBody.safeParse({ ...valid, role: "ADMIN" }).success).toBe(false);
  });
});

describe("createTransactionBody", () => {
  const base = {
    type: "EXPENSE",
    description: "Almoço",
    amountCents: 4590,
    occurredOn: "2026-10-04",
    accountId: uuid,
    categoryId: uuid2,
  };
  it("aceita despesa em conta", () => {
    expect(createTransactionBody.safeParse(base).success).toBe(true);
  });
  it("exige conta OU cartão (apenas um)", () => {
    expect(createTransactionBody.safeParse({ ...base, accountId: undefined }).success).toBe(false);
    expect(createTransactionBody.safeParse({ ...base, cardId: uuid2, paymentMethod: "CREDIT" }).success).toBe(false);
  });
  it("cartão e Crédito andam juntos", () => {
    const card = { ...base, accountId: undefined, cardId: uuid2 };
    expect(createTransactionBody.safeParse({ ...card, paymentMethod: "PIX" }).success).toBe(false);
    expect(createTransactionBody.safeParse({ ...card, paymentMethod: "CREDIT" }).success).toBe(true);
    expect(createTransactionBody.safeParse({ ...base, paymentMethod: "CREDIT" }).success).toBe(false);
  });
  it("parcelamento: no cartão só despesa; na conta vale para despesa e receita", () => {
    const card = { ...base, accountId: undefined, cardId: uuid2 };
    expect(createTransactionBody.safeParse({ ...card, installments: 3 }).success).toBe(true);
    expect(createTransactionBody.safeParse({ ...card, type: "INCOME", installments: 3 }).success).toBe(false);
    expect(createTransactionBody.safeParse({ ...card, installments: 1 }).success).toBe(false);
    // na conta
    expect(createTransactionBody.safeParse({ ...base, installments: 3 }).success).toBe(true);
    expect(createTransactionBody.safeParse({ ...base, type: "INCOME", installments: 3 }).success).toBe(true);
    expect(createTransactionBody.safeParse({ ...base, installments: 1 }).success).toBe(false);
    expect(createTransactionBody.safeParse({ ...base, installments: 121 }).success).toBe(false);
  });
  it("não aceita TRANSFER (existe rota própria), valor <= 0 nem data inválida", () => {
    expect(createTransactionBody.safeParse({ ...base, type: "TRANSFER" }).success).toBe(false);
    expect(createTransactionBody.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
    expect(createTransactionBody.safeParse({ ...base, amountCents: 10.5 }).success).toBe(false);
    expect(createTransactionBody.safeParse({ ...base, occurredOn: "2026-02-30" }).success).toBe(false);
  });
  it("não aceita campos de controle (userId, version)", () => {
    expect(createTransactionBody.safeParse({ ...base, userId: uuid }).success).toBe(false);
    expect(createTransactionBody.safeParse({ ...base, version: 5 }).success).toBe(false);
  });
});

describe("updateTransactionBody", () => {
  it("exige ao menos um campo alterável", () => {
    expect(updateTransactionBody.safeParse({}).success).toBe(false);
    expect(updateTransactionBody.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(updateTransactionBody.safeParse({ description: "Novo" }).success).toBe(true);
  });
});

describe("createTransferBody", () => {
  it("origem e destino devem ser diferentes", () => {
    const ok = { fromAccountId: uuid, toAccountId: uuid2, amountCents: 100, occurredOn: "2026-10-04" };
    expect(createTransferBody.safeParse(ok).success).toBe(true);
    expect(createTransferBody.safeParse({ ...ok, toAccountId: uuid }).success).toBe(false);
  });
});

describe("listTransactionsQuery", () => {
  it("aplica defaults e converte listas e números", () => {
    const q = listTransactionsQuery.parse({ type: "INCOME,EXPENSE", categoryId: `${uuid},${uuid2}`, limit: "10" });
    expect(q.type).toEqual(["INCOME", "EXPENSE"]);
    expect(q.categoryId).toEqual([uuid, uuid2]);
    expect(q.limit).toBe(10);
    expect(q.sort).toBe("date_desc");
  });
  it("limita o tamanho da página e valida enums", () => {
    expect(listTransactionsQuery.safeParse({ limit: "500" }).success).toBe(false);
    expect(listTransactionsQuery.safeParse({ type: "OUTRO" }).success).toBe(false);
  });
});

describe("monthParam e reportQuery", () => {
  it("normaliza para o primeiro dia do mês", () => {
    expect(monthParam.parse("2026-10")).toBe("2026-10-01");
    expect(monthParam.parse("2026-10-17")).toBe("2026-10-01");
    expect(monthParam.safeParse("2026-13").success).toBe(false);
  });
  it("período personalizado exige datas coerentes", () => {
    expect(reportQuery.safeParse({ range: "custom" }).success).toBe(false);
    expect(reportQuery.safeParse({ range: "custom", from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
    expect(reportQuery.safeParse({ range: "custom", from: "2026-01-01", to: "2026-02-01" }).success).toBe(true);
    expect(reportQuery.parse({}).range).toBe("this_month");
  });
});

describe("createGoalBody", () => {
  it("aplica defaults e valida o valor", () => {
    const g = createGoalBody.parse({ name: " Comprar carro ", targetCents: 5_000_000 });
    expect(g.name).toBe("Comprar carro");
    expect(g.initialCents).toBe(0);
    expect(g.kind).toBe("OTHER");
    expect(createGoalBody.safeParse({ name: "x", targetCents: 0 }).success).toBe(false);
  });
});
