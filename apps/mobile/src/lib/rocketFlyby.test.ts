import { describe, expect, it } from "vitest";
import { FLYBY_MAX, FLYBY_MIN, flybyPlan } from "./rocketFlyby";

/** Gerador repetível para os testes (LCG simples). */
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

describe("foguetes passando pelas Novidades", () => {
  it("passam de 3 a 5 foguetes, em qualquer sorteio", () => {
    expect(FLYBY_MIN).toBe(3);
    expect(FLYBY_MAX).toBe(5);
    const counts = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const n = flybyPlan(seeded(seed * 2654435761)).length; // sementes bem espalhadas (o gerador simples correlaciona sementes pequenas)
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      counts.add(n);
    }
    expect([...counts].sort()).toEqual([3, 4, 5]); // as três quantidades acontecem
    expect(flybyPlan(() => 0)).toHaveLength(3);
    expect(flybyPlan(() => 0.999999)).toHaveLength(5);
  });

  it("a quantidade pedida é ajustada ao limite de 3 a 5", () => {
    expect(flybyPlan(seeded(1), 1)).toHaveLength(3);
    expect(flybyPlan(seeded(1), 4)).toHaveLength(4);
    expect(flybyPlan(seeded(1), 99)).toHaveLength(5);
  });

  it("saem um depois do outro (atrasos crescentes) e começam logo", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const plan = flybyPlan(seeded(seed));
      expect(plan[0]!.delayMs).toBeLessThanOrEqual(400);
      for (let i = 1; i < plan.length; i++) expect(plan[i]!.delayMs).toBeGreaterThan(plan[i - 1]!.delayMs);
      // a cena inteira acaba em poucos segundos
      const end = Math.max(...plan.map((f) => f.delayMs + f.durationMs));
      expect(end).toBeLessThan(4_500);
    }
  });

  it("cada passagem é rápida e fica dentro do quadro", () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const f of flybyPlan(seeded(seed))) {
        expect(f.durationMs).toBeGreaterThanOrEqual(800);
        expect(f.durationMs).toBeLessThanOrEqual(1150);
        expect(f.topPct).toBeGreaterThanOrEqual(8);
        expect(f.topPct).toBeLessThanOrEqual(78);
        expect(f.size).toBeGreaterThanOrEqual(20);
        expect(f.size).toBeLessThanOrEqual(34);
        expect(Math.abs(f.tiltDeg)).toBeLessThanOrEqual(14);
      }
    }
  });

  it("cada abertura sorteia uma cena diferente", () => {
    const a = JSON.stringify(flybyPlan(seeded(1)));
    const b = JSON.stringify(flybyPlan(seeded(2)));
    expect(a).not.toBe(b);
  });
});
