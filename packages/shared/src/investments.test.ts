import { describe, expect, it } from "vitest";
import { investmentGroupKey, investmentLabelPt, investmentRateLabel, profitPct } from "./investments";

describe("agrupamento e rótulos", () => {
  it("agrupa pelo produto (subtype) e cai para a categoria (type)", () => {
    expect(investmentGroupKey("FIXED_INCOME", "CDB")).toBe("CDB");
    expect(investmentGroupKey("FIXED_INCOME", "cdb")).toBe("CDB");
    expect(investmentGroupKey("FIXED_INCOME", null)).toBe("FIXED_INCOME");
    expect(investmentGroupKey("MUTUAL_FUND", "  ")).toBe("MUTUAL_FUND");
  });

  it("nomes em português, com fallback legível para tipos novos", () => {
    expect(investmentLabelPt("CDB")).toBe("CDB");
    expect(investmentLabelPt("TREASURE")).toBe("Tesouro Direto");
    expect(investmentLabelPt("REAL_ESTATE_FUND")).toBe("Fundos imobiliários");
    expect(investmentLabelPt("NEW_THING_FUND")).toBe("New thing fund");
  });
});

describe("rótulo de taxa", () => {
  it("CDI: percentual do CDI ou spread, conforme o valor", () => {
    expect(investmentRateLabel({ rateType: "CDI", rate: 110 })).toBe("110% do CDI");
    expect(investmentRateLabel({ rateType: "CDI", rate: 100 })).toBe("100% do CDI");
    expect(investmentRateLabel({ rateType: "CDI", rate: 2 })).toBe("CDI + 2% a.a.");
    expect(investmentRateLabel({ rateType: "cdi", rate: 98.5 })).toBe("98,5% do CDI");
  });

  it("outros indexadores e pré-fixado", () => {
    expect(investmentRateLabel({ rateType: "IPCA", rate: 6.2 })).toBe("IPCA + 6,2% a.a.");
    expect(investmentRateLabel({ rateType: "PRE", rate: 13.5 })).toBe("13,5% a.a.");
    expect(investmentRateLabel({ fixedAnnualRate: 12 })).toBe("12% a.a.");
  });

  it("fundos e ausência de taxa", () => {
    expect(investmentRateLabel({ annualRate: 11.25 })).toBe("rentabilidade anual 11,25%");
    expect(investmentRateLabel({})).toBeNull();
    expect(investmentRateLabel({ rateType: null, rate: null })).toBeNull();
  });
});

describe("rendimento percentual", () => {
  it("sobre o valor investido, com duas casas", () => {
    expect(profitPct(500_000, 12_345)).toBe(2.47);
    expect(profitPct(100_000, -5_000)).toBe(-5);
  });

  it("null quando não dá para calcular", () => {
    expect(profitPct(0, 100)).toBeNull();
    expect(profitPct(null, 100)).toBeNull();
    expect(profitPct(1000, null)).toBeNull();
  });
});
