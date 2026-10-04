import { describe, expect, it } from "vitest";
import { niceScale, smoothPath } from "./scale";

describe("niceScale", () => {
  it("usa passos 1/2/5 × 10^n e cobre o intervalo", () => {
    expect(niceScale(0, 100, 4)).toMatchObject({ min: 0, max: 100, step: 50, values: [0, 50, 100] });
    expect(niceScale(0, 1000, 4)).toMatchObject({ step: 500, values: [0, 500, 1000] });
  });

  it("o intervalo devolvido sempre contém os dados e é igualmente espaçado", () => {
    for (const [lo, hi] of [[0, 8800], [-3200, 12500], [120, 980], [0, 0.9], [-50, -10]] as const) {
      const s = niceScale(lo, hi, 4);
      expect(s.min).toBeLessThanOrEqual(lo);
      expect(s.max).toBeGreaterThanOrEqual(hi);
      expect(s.values.length).toBeGreaterThanOrEqual(2);
    }
    const s = niceScale(-3200, 12500, 4);
    const gaps = s.values.slice(1).map((v, i) => v - s.values[i]!);
    expect(new Set(gaps).size).toBe(1);
  });

  it("valores pequenos (centavos inteiros) não repetem rótulos nem chaves", () => {
    for (const [lo, hi] of [[0, 1], [0, 0.9], [0, 2], [-1, 1], [0, 3], [0, 7]] as const) {
      const { values } = niceScale(lo, hi, 4);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("intervalo degenerado (min = max) não quebra", () => {
    const s = niceScale(5, 5);
    expect(s.max).toBeGreaterThan(s.min);
    expect(Number.isFinite(s.step)).toBe(true);
  });
});

describe("smoothPath", () => {
  it("vazio, ponto único e curva", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([{ x: 1, y: 2 }])).toBe("M 1 2");
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect((d.match(/ C /g) ?? []).length).toBe(2);
    expect(d.endsWith("20.00 0.00")).toBe(true);
  });
});
