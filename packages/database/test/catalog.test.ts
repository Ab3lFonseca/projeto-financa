import { describe, expect, it } from "vitest";
import { BANKS, DEFAULT_CATEGORIES } from "../src/catalog";

describe("catálogo de categorias padrão", () => {
  it("cobre as categorias pedidas no escopo", () => {
    const expense = DEFAULT_CATEGORIES.filter((c) => c.type === "EXPENSE").map((c) => c.name);
    const income = DEFAULT_CATEGORIES.filter((c) => c.type === "INCOME").map((c) => c.name);
    expect(expense).toEqual([
      "Alimentação", "Mercado", "Transporte", "Moradia", "Saúde", "Educação",
      "Lazer", "Compras", "Assinaturas", "Viagens", "Contas", "Outros",
    ]);
    expect(income).toEqual(["Salário", "Freelance", "Investimentos", "Vendas", "Outros"]);
  });

  it("tem chaves estáveis únicas e cores hex válidas (espelha os CHECKs do banco)", () => {
    const keys = DEFAULT_CATEGORIES.map((c) => c.systemKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.systemKey).toMatch(/^(expense|income)\.[a-z]+$/);
      expect(c.systemKey.startsWith(c.type.toLowerCase())).toBe(true);
    }
  });
});

describe("catálogo de bancos", () => {
  it("tem códigos COMPE de 3 dígitos, sem duplicatas", () => {
    const codes = BANKS.map((b) => b.compeCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[0-9]{3}$/);
  });
});
