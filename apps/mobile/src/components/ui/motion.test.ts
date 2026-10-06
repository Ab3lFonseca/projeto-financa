import { describe, expect, it } from "vitest";
import { countUpValue, easeOutQuart } from "./countUp";

describe("contador animado (valores em centavos)", () => {
  it("começa no valor de partida e termina exatamente no valor final", () => {
    expect(countUpValue(0, 854000, 0)).toBe(0);
    expect(countUpValue(0, 854000, 1)).toBe(854000);
    expect(countUpValue(120000, 854000, 1)).toBe(854000);
  });

  it("nunca passa do valor final nem fica abaixo do de partida (também ao diminuir)", () => {
    for (const [from, to] of [[0, 854000], [854000, 120000], [-5000, 5000], [0, 0]] as const) {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      for (let i = 0; i <= 100; i++) {
        const v = countUpValue(from, to, i / 100);
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it("é monótono: só avança em direção ao valor final", () => {
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const v = countUpValue(0, 1_000_000, i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("p fora de 0–1 é limitado (relógio adiantado ou atrasado não quebra o valor)", () => {
    expect(countUpValue(10, 500, 5)).toBe(500);
    expect(countUpValue(10, 500, -2)).toBe(10);
  });

  it("a curva sai rápido e pousa devagar", () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.9);
  });
});
