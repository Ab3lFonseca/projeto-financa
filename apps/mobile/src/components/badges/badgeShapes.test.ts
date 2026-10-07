import { describe, expect, it } from "vitest";
import { C, crestPath, crown, facets, laurel, onCircle, polygon, pointsAttr, polyPath, progressArc, scallopPath, starburst, VIEW, wing } from "./badgeShapes";

const dist = (p: readonly [number, number]) => Math.hypot(p[0] - C, p[1] - C);

describe("formas das insígnias", () => {
  it("polígonos regulares: n vértices, todos à mesma distância do centro, o primeiro apontando para cima", () => {
    for (const n of [6, 8]) {
      const pts = polygon(C, C, 40, n);
      expect(pts).toHaveLength(n);
      for (const p of pts) expect(dist(p)).toBeCloseTo(40, 6);
      expect(pts[0]![0]).toBeCloseTo(C, 6);
      expect(pts[0]![1]).toBeCloseTo(C - 40, 6);
    }
  });

  it("o sol do Ouro tem 12 raios (24 pontos alternando longe e perto) e fica dentro da tela", () => {
    const pts = starburst(C, C, 50, 42, 12);
    expect(pts).toHaveLength(24);
    pts.forEach((p, i) => expect(dist(p)).toBeCloseTo(i % 2 === 0 ? 50 : 42, 6));
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(VIEW);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(VIEW);
    }
  });

  it("a rosácea da Prata tem 8 lóbulos (8 curvas), começa e fecha, e não passa dos limites", () => {
    const d = scallopPath(C, C, 48, 41, 8);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect((d.match(/Q/g) ?? []).length).toBe(8);
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    // os pontos de controle ficam um pouco além do raio externo (a curva só chega a meio caminho), mas dentro da tela
    for (const v of nums) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(VIEW);
    }
  });

  it("o diamante é lapidado: uma mesa e 8 faces, com brilhos entre 0 e 1 e faces diferentes entre si", () => {
    const list = facets(C, C, 46);
    expect(list).toHaveLength(9);
    expect(list[0]!.points).toHaveLength(8); // mesa
    for (const f of list) {
      expect(f.shade).toBeGreaterThanOrEqual(0);
      expect(f.shade).toBeLessThanOrEqual(1);
    }
    expect(list.slice(1).every((f) => f.points.length === 4)).toBe(true);
    expect(new Set(list.slice(1).map((f) => f.shade.toFixed(3))).size).toBeGreaterThan(3); // não é tudo da mesma cor
  });

  it("o anel de progresso: vazio em 0, cheio em 1, e termina onde deve em 25%, 50% e 75%", () => {
    expect(progressArc(C, C, 55, 0)).toBe("");
    expect(progressArc(C, C, 55, -3)).toBe("");
    expect(progressArc(C, C, 55, 1)).toContain("A55 55 0 1 1"); // dois arcos grandes: círculo completo
    expect((progressArc(C, C, 55, 1).match(/A/g) ?? []).length).toBe(2);
    const end = (p: number) => {
      const nums = (progressArc(C, C, 55, p).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      return [nums[nums.length - 2]!, nums[nums.length - 1]!];
    };
    expect(end(0.25)[0]).toBeCloseTo(C + 55, 1); // 3 horas
    expect(end(0.25)[1]).toBeCloseTo(C, 1);
    expect(end(0.5)[0]).toBeCloseTo(C, 1); // 6 horas (embaixo)
    expect(end(0.5)[1]).toBeCloseTo(C + 55, 1);
    expect(end(0.75)[0]).toBeCloseTo(C - 55, 1); // 9 horas
    expect(progressArc(C, C, 55, 0.6)).toContain(" 0 1 1 "); // passou da metade: arco grande
    expect(progressArc(C, C, 55, 0.3)).toContain(" 0 0 1 ");
  });

  it("o louro tem o mesmo número de folhas dos dois lados, espelhadas", () => {
    const leaves = laurel(C, C, 52, 6);
    expect(leaves).toHaveLength(12);
    const left = leaves.filter((l) => l.side === -1);
    const right = leaves.filter((l) => l.side === 1);
    expect(left).toHaveLength(6);
    left.forEach((l, i) => {
      expect(l.cx + right[i]!.cx).toBeCloseTo(VIEW, 5); // espelhadas em torno do centro
      expect(l.cy).toBeCloseTo(right[i]!.cy, 5);
    });
  });

  it("brasão, coroa e asas do Mestre são caminhos fechados válidos; a borda interna cabe dentro da externa", () => {
    expect(crestPath().startsWith("M")).toBe(true);
    expect(crestPath().endsWith("Z")).toBe(true);
    const bounds = (d: string) => {
      const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const xs = n.filter((_, i) => i % 2 === 0);
      const ys = n.filter((_, i) => i % 2 === 1);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    expect(bounds(crestPath(0.84)).w).toBeLessThan(bounds(crestPath()).w);
    expect(bounds(crestPath(0.84)).h).toBeLessThan(bounds(crestPath()).h);
    expect(crown().gems).toHaveLength(3);
    const right = wing(1);
    const left = wing(-1);
    expect(right).toHaveLength(3);
    expect(left).toHaveLength(3);
    for (const d of [...right, ...left]) {
      expect(d.endsWith("Z")).toBe(true);
      for (const v of (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(VIEW);
      }
    }
    // a asa esquerda é o espelho da direita
    const firstX = (d: string) => Number(d.match(/^M(-?\d+(\.\d+)?)/)![1]);
    expect(firstX(left[0]!) + firstX(right[0]!)).toBeCloseTo(VIEW, 5);
  });

  it("utilitários de texto do SVG", () => {
    expect(pointsAttr([[1, 2], [3.456, 4]])).toBe("1.00,2.00 3.46,4.00");
    expect(polyPath([[0, 0], [10, 0], [10, 10]])).toBe("M0 0 L10.00 0 L10.00 10.00 Z");
    expect(onCircle(0, 0, 10, 0)[0]).toBeCloseTo(10, 6);
  });
});
