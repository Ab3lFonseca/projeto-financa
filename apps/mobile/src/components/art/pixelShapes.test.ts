import { describe, expect, it } from "vitest";
import { approach, HOVER_RADIUS, hoverShift, logoCells, seeded, toneAt, type PixelCell } from "./pixelShapes";

const cube = (x: number, y: number, over: Partial<PixelCell> = {}): PixelCell => ({ x, y, size: 0.04, rotate: 0, tone: 0, gradient: 0.5, alpha: 1, shard: false, ...over });
const center = (c: PixelCell) => ({ x: c.x + c.size / 2, y: c.y + c.size / 2 });

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

describe("cubos reagindo ao mouse", () => {
  const rest = { dx: 0, dy: 0, rotate: 0, glow: 0 };

  it("sem mouse, ou com o mouse longe (além do raio), nada se mexe", () => {
    const c = cube(0.5, 0.5);
    expect(hoverShift(c, 0.5, null)).toEqual(rest);
    const far = center(c);
    expect(hoverShift(c, 0.5, { x: far.x + HOVER_RADIUS + 0.01, y: far.y })).toEqual(rest);
  });

  it("não há salto na borda do raio: o efeito vai a zero de forma contínua (o cubo não 'estala' quando o mouse passa)", () => {
    const c = cube(0.5, 0.5);
    const mid = center(c);
    const justInside = hoverShift(c, 0.9, { x: mid.x - (HOVER_RADIUS - 1e-4), y: mid.y });
    expect(justInside.glow).toBeLessThan(1e-6);
    expect(Math.hypot(justInside.dx, justInside.dy)).toBeLessThan(1e-5);
    expect(Math.abs(justInside.rotate)).toBeLessThan(1e-3);
  });

  it("o cubo é empurrado para LONGE do cursor, qualquer que seja o lado em que o mouse passa", () => {
    const c = cube(0.5, 0.5);
    const mid = center(c);
    for (const [ox, oy] of [[-0.08, 0], [0.08, 0], [0, -0.08], [0, 0.08], [0.06, 0.06], [-0.06, 0.05]]) {
      const pointer = { x: mid.x + ox!, y: mid.y + oy! };
      const s = hoverShift(c, 0.5, pointer);
      // produto escalar com (cubo - mouse) > 0 = afastando
      expect(s.dx * -ox! + s.dy * -oy!, `mouse em (${ox}, ${oy})`).toBeGreaterThan(0);
    }
  });

  it("quanto mais perto o mouse, mais o cubo salta, gira e brilha", () => {
    const c = cube(0.5, 0.5);
    const mid = center(c);
    const at = (d: number) => hoverShift(c, 0.8, { x: mid.x - d, y: mid.y });
    const near = at(0.03);
    const middle = at(0.12);
    const edge = at(0.2);
    expect(near.glow).toBeGreaterThan(middle.glow);
    expect(middle.glow).toBeGreaterThan(edge.glow);
    expect(Math.abs(near.dx)).toBeGreaterThan(Math.abs(middle.dx));
    expect(Math.abs(near.rotate)).toBeGreaterThan(Math.abs(middle.rotate));
    for (const s of [near, middle, edge]) {
      expect(s.glow).toBeGreaterThanOrEqual(0);
      expect(s.glow).toBeLessThanOrEqual(1);
    }
  });

  it("o sorteio de cada cubo varia a força e o sentido do giro (não é uma onda certinha)", () => {
    const c = cube(0.5, 0.5);
    const mid = center(c);
    const pointer = { x: mid.x - 0.05, y: mid.y };
    const calm = hoverShift(c, 0.1, pointer);
    const wild = hoverShift(c, 0.95, pointer);
    expect(Math.abs(wild.dx)).toBeGreaterThan(Math.abs(calm.dx));
    expect(Math.sign(calm.rotate)).toBe(-1);
    expect(Math.sign(wild.rotate)).toBe(1);
  });

  it("com o mouse exatamente em cima do cubo ainda sai um empurrão válido (sem dividir por zero)", () => {
    const c = cube(0.5, 0.5);
    const s = hoverShift(c, 0.3, center(c));
    for (const v of [s.dx, s.dy, s.rotate, s.glow]) expect(Number.isFinite(v)).toBe(true);
    expect(Math.hypot(s.dx, s.dy)).toBeGreaterThan(0);
    expect(s.glow).toBe(1);
  });

  it("é determinístico: a mesma entrada dá a mesma reação", () => {
    const c = cube(0.4, 0.45);
    const p = { x: 0.42, y: 0.5 };
    expect(hoverShift(c, 0.37, p)).toEqual(hoverShift(c, 0.37, p));
  });

  it("aproxima do alvo sem passar dele, e volta ao repouso mais devagar do que sai dele", () => {
    // sobe (mouse chegou): converge para o alvo sem ultrapassar
    let v = 0;
    for (let i = 0; i < 120; i++) {
      const next = approach(v, 1, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(v);
      expect(next).toBeLessThanOrEqual(1);
      v = next;
    }
    expect(v).toBeGreaterThan(0.99);
    // um quadro de subida avança mais do que um quadro de descida (o cubo salta e depois assenta devagar)
    const up = approach(0, 1, 1 / 60);
    const down = 1 - approach(1, 0, 1 / 60);
    expect(up).toBeGreaterThan(down);
    // quadro muito longo (aba escondida): limitado, o cubo não "teletransporta"
    expect(approach(0, 1, 5)).toBeCloseTo(approach(0, 1, 0.05), 10);
    expect(approach(0.3, 0.3, 1 / 60)).toBe(0.3);
  });
});
