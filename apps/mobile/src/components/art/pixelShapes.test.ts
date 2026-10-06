import { describe, expect, it } from "vitest";
import { logoCells, seeded, toneAt } from "./pixelShapes";

describe("logo em pixels", () => {
  it("o gerador é determinístico: a mesma semente produz a mesma imagem", () => {
    const a = seeded(5);
    const b = seeded(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(logoCells(24, 11)).toEqual(logoCells(24, 11));
    expect(logoCells(24, 11)).not.toEqual(logoCells(24, 12));
  });

  it("reconhece o desenho: fundo, as três barras e o que está fora do ícone", () => {
    expect(toneAt(0.5, 0.05)).toBe(0); // fundo, em cima
    expect(toneAt(0.255, 0.72)).toBe(1); // barra pequena
    expect(toneAt(0.5, 0.6)).toBe(2); // barra média
    expect(toneAt(0.79, 0.5)).toBe(3); // barra alta
    expect(toneAt(0.02, 0.02)).toBeNull(); // canto arredondado: fora
    expect(toneAt(1.2, 0.5)).toBeNull();
    // a ponta da barra é arredondada: o canto de cima da barra alta está fora dela (cai no fundo)
    expect(toneAt(0.655, 0.182)).toBe(0);
  });

  it("o lado esquerdo fica inteiro e o direito se desfaz em estilhaços cada vez mais soltos", () => {
    const cells = logoCells(24, 11, 0.34);
    const left = cells.filter((c) => c.x + c.size / 2 < 0.3);
    expect(left.length).toBeGreaterThan(50);
    expect(left.every((c) => !c.shard)).toBe(true);

    const shards = cells.filter((c) => c.shard);
    expect(shards.length).toBeGreaterThan(40);
    const far = shards.filter((c) => c.x > 0.8);
    const near = shards.filter((c) => c.x < 0.6);
    expect(far.length).toBeGreaterThan(0);
    // quanto mais à direita, mais fracos e menores
    const avg = (list: typeof shards, pick: (c: (typeof shards)[number]) => number) => list.reduce((s, c) => s + pick(c), 0) / list.length;
    if (near.length > 0) expect(avg(far, (c) => c.alpha)).toBeLessThan(avg(near, (c) => c.alpha));
    // alguns pixels somem de vez: há menos células à direita do que o quadrado cheio teria
    const fullGrid = 24 * 24;
    expect(cells.length).toBeLessThan(fullGrid);
  });

  it("valores sempre válidos: tamanhos positivos, opacidade entre 0 e 1 e degradê entre 0 e 1", () => {
    for (const c of logoCells(24, 3)) {
      expect(c.size).toBeGreaterThan(0);
      expect(c.alpha).toBeGreaterThan(0);
      expect(c.alpha).toBeLessThanOrEqual(1);
      expect(c.gradient).toBeGreaterThanOrEqual(0);
      expect(c.gradient).toBeLessThanOrEqual(1);
      expect([0, 1, 2, 3]).toContain(c.tone);
    }
  });

  it("o número de células cabe numa tela sem pesar (centenas, não milhares)", () => {
    expect(logoCells(24, 11).length).toBeLessThan(600);
  });
});
