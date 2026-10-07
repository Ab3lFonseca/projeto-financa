import { describe, expect, it } from "vitest";
import { luminance, meterColor, SHAKE_FROM, SWEAT_FROM, trialMeter } from "./trialMeter";

describe("progressão do teste", () => {
  it("começa em 0 e termina em 1, proporcional aos dias que faltam", () => {
    expect(trialMeter(30, 30).progress).toBe(0);
    expect(trialMeter(15, 30).progress).toBe(0.5);
    expect(trialMeter(0, 30).progress).toBe(1);
    expect(trialMeter(3, 30).progress).toBeCloseTo(0.9, 5);
  });

  it("ajusta valores fora do intervalo e testes de 0 dias", () => {
    expect(trialMeter(45, 30).progress).toBe(0);
    expect(trialMeter(-3, 30).progress).toBe(1);
    expect(trialMeter(0, 0).progress).toBe(1);
    expect(trialMeter(5, 14).progress).toBeCloseTo(9 / 14, 5);
  });

  it("só sobe com o passar dos dias", () => {
    let last = -1;
    for (let left = 30; left >= 0; left--) {
      const p = trialMeter(left, 30).progress;
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });
});

describe("cor da barra: verde → vermelho, cada vez mais escuro", () => {
  it("começa verde e termina vermelho escuro", () => {
    expect(meterColor(0)).toBe("#22C55E");
    expect(meterColor(1)).toBe("#A31D1D");
    expect(trialMeter(30, 30).color).toBe("#22C55E");
    expect(trialMeter(0, 30).color).toBe("#A31D1D");
  });

  it("no começo domina o verde e no fim domina o vermelho", () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const [r0, g0] = rgb(meterColor(0.05));
    expect(g0).toBeGreaterThan(r0);
    const [r1, g1] = rgb(meterColor(0.95));
    expect(r1).toBeGreaterThan(g1);
  });

  it("depois que vira vermelho, só escurece até o fim", () => {
    let last = luminance(meterColor(0.82));
    for (let p = 0.84; p <= 1.0001; p += 0.02) {
      const l = luminance(meterColor(p));
      expect(l).toBeLessThanOrEqual(last + 1e-9);
      last = l;
    }
    expect(luminance(meterColor(1))).toBeLessThan(luminance(meterColor(0.82)) - 0.1);
  });

  it("é sempre um #RRGGBB válido, e a cor muda de forma contínua (sem saltos bruscos)", () => {
    let prev = meterColor(0);
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const c = meterColor(p);
      expect(c).toMatch(/^#[0-9A-F]{6}$/);
      for (const i of [1, 3, 5]) expect(Math.abs(parseInt(c.slice(i, i + 2), 16) - parseInt(prev.slice(i, i + 2), 16))).toBeLessThan(20);
      prev = c;
    }
  });
});

describe("tremor e suor", () => {
  it("a barra fica parada na primeira metade do teste e não sua", () => {
    for (let left = 30; left >= 14; left--) {
      const m = trialMeter(left, 30);
      expect(m.shake, `${left} dias`).toBe(0);
      expect(m.sweat, `${left} dias`).toBe(0);
    }
  });

  it("começa a estremecer aos poucos, antes de começar a suar", () => {
    const afterShake = trialMeter(30 - Math.ceil(30 * (SHAKE_FROM + 0.05)), 30);
    expect(afterShake.shake).toBeGreaterThan(0);
    expect(afterShake.shake).toBeLessThan(0.2);
    expect(afterShake.sweat).toBe(0);
    const sweating = trialMeter(30 - Math.ceil(30 * (SWEAT_FROM + 0.05)), 30);
    expect(sweating.sweat).toBeGreaterThan(0);
    expect(sweating.shake).toBeGreaterThan(afterShake.shake);
  });

  it("só aumenta até o último dia, quando chega ao máximo", () => {
    let shake = -1;
    let sweat = -1;
    for (let left = 30; left >= 0; left--) {
      const m = trialMeter(left, 30);
      expect(m.shake).toBeGreaterThanOrEqual(shake);
      expect(m.sweat).toBeGreaterThanOrEqual(sweat);
      shake = m.shake;
      sweat = m.sweat;
    }
    expect(trialMeter(0, 30)).toMatchObject({ shake: 1, sweat: 1 });
  });
});
