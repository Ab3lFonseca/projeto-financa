import { describe, expect, it } from "vitest";
import { BADGES, badgeDiscount, DISCOUNT_BADGES_PER_STEP, DISCOUNT_CAP_PERCENT, DISCOUNT_MIN_LEVEL, DISCOUNT_STEP_PERCENT, discountedCents } from "../src";

/** `n` insígnias com o nível pedido, o resto sem nada. */
const levels = (n: number, level: number, total = BADGES.length) => Array.from({ length: total }, (_, i) => (i < n ? level : 0));

describe("desconto por insígnias", () => {
  it("as regras combinadas: 5 insígnias de Ouro ou acima = 5%, de 5 em 5, até 15%", () => {
    expect(DISCOUNT_MIN_LEVEL).toBe(3);
    expect(DISCOUNT_BADGES_PER_STEP).toBe(5);
    expect(DISCOUNT_STEP_PERCENT).toBe(5);
    expect(DISCOUNT_CAP_PERCENT).toBe(15);
  });

  it("sem insígnias de Ouro: nenhum desconto, e mostra quanto falta", () => {
    expect(badgeDiscount([])).toMatchObject({ qualifying: 0, percent: 0, nextPercent: 5, badgesToNext: 5 });
    expect(badgeDiscount(levels(53, 2))).toMatchObject({ qualifying: 0, percent: 0 }); // Prata não conta
    expect(badgeDiscount(levels(4, 3))).toMatchObject({ qualifying: 4, percent: 0, badgesToNext: 1 });
  });

  it("5 de Ouro: 5%; 10: 10%; 15: 15%", () => {
    expect(badgeDiscount(levels(5, 3))).toMatchObject({ qualifying: 5, percent: 5, nextPercent: 10, badgesToNext: 5 });
    expect(badgeDiscount(levels(9, 3))).toMatchObject({ percent: 5, nextPercent: 10, badgesToNext: 1 });
    expect(badgeDiscount(levels(10, 3))).toMatchObject({ percent: 10, nextPercent: 15, badgesToNext: 5 });
    expect(badgeDiscount(levels(15, 3))).toMatchObject({ percent: 15, nextPercent: null, badgesToNext: null });
  });

  it("Platina, Diamante e Mestre também valem (Ouro ou acima)", () => {
    expect(badgeDiscount([3, 4, 5, 6, 3]).percent).toBe(5);
    expect(badgeDiscount([4, 4, 4, 4, 4]).percent).toBe(5);
    expect(badgeDiscount([6, 6, 6, 6, 6]).percent).toBe(5);
  });

  it("nunca passa do teto de 15%, mesmo com todas as insígnias no Mestre", () => {
    expect(badgeDiscount(levels(BADGES.length, 6)).percent).toBe(15);
    expect(badgeDiscount(levels(100, 6, 100))).toMatchObject({ percent: 15, nextPercent: null });
  });

  it("só cresce: mais insígnias nunca diminuem o desconto", () => {
    let last = 0;
    for (let n = 0; n <= BADGES.length; n++) {
      const p = badgeDiscount(levels(n, 3)).percent;
      expect(p).toBeGreaterThanOrEqual(last);
      expect([0, 5, 10, 15]).toContain(p);
      last = p;
    }
  });

  it("o nível 3 é o Ouro (e existem insígnias suficientes para chegar ao teto)", () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(DISCOUNT_BADGES_PER_STEP * (DISCOUNT_CAP_PERCENT / DISCOUNT_STEP_PERCENT));
  });
});

describe("valor com desconto", () => {
  it("aplica o percentual e arredonda ao centavo", () => {
    expect(discountedCents(1000, 5)).toBe(950);
    expect(discountedCents(1000, 15)).toBe(850);
    expect(discountedCents(10_000, 10)).toBe(9_000);
    expect(discountedCents(999, 5)).toBe(949); // 949,05
    expect(discountedCents(1000, 0)).toBe(1000);
  });
  it("percentuais fora de 0 a 100 são ajustados", () => {
    expect(discountedCents(1000, -5)).toBe(1000);
    expect(discountedCents(1000, 150)).toBe(0);
  });
});
