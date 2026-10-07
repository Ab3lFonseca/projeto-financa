/**
 * Formas das insígnias, calculadas aqui (sem React) para serem previsíveis e testáveis. Tudo numa tela de 120 × 120, centro em (60, 60).
 * Cada nível tem a sua silhueta: Bronze redondo, Prata em rosácea (8 lóbulos), Ouro em sol (12 raios), Platina hexagonal, Diamante lapidado
 * (octógono com facetas) e Mestre em brasão com coroa e asas.
 */

export type Pt = readonly [number, number];

export const VIEW = 120;
export const C = VIEW / 2;

const rad = (deg: number) => (deg * Math.PI) / 180;
const fmt = (n: number) => (Math.abs(n) < 1e-9 ? "0" : n.toFixed(2));

/** Ponto no círculo de raio `r` a `deg` graus (0 = direita, -90 = em cima). */
export const onCircle = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];

/** Vértices de um polígono regular de `n` lados (o primeiro aponta para cima por padrão). */
export function polygon(cx: number, cy: number, r: number, n: number, startDeg = -90): Pt[] {
  return Array.from({ length: n }, (_, i) => onCircle(cx, cy, r, startDeg + (360 / n) * i));
}

/** Pontos no formato do atributo `points` do SVG. */
export const pointsAttr = (pts: readonly Pt[]) => pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");

/** Caminho fechado a partir de pontos (linhas retas). */
export const polyPath = (pts: readonly Pt[]) => `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(" L")} Z`;

/** Raios de um sol: `n` pontas alternando entre `rOuter` e `rInner`, com bordas retas. */
export function starburst(cx: number, cy: number, rOuter: number, rInner: number, n: number): Pt[] {
  return Array.from({ length: n * 2 }, (_, i) => onCircle(cx, cy, i % 2 === 0 ? rOuter : rInner, -90 + (180 / n) * i));
}

/**
 * Rosácea de `n` lóbulos arredondados: cada lóbulo é uma curva entre dois vales (raio `rInner`), puxada para fora até perto de `rOuter`.
 */
export function scallopPath(cx: number, cy: number, rOuter: number, rInner: number, n: number): string {
  const step = 360 / n;
  const valley = (k: number) => onCircle(cx, cy, rInner, -90 + step * (k - 0.5));
  const control = (k: number) => onCircle(cx, cy, rInner + (rOuter - rInner) * 2, -90 + step * k); // curva quadrática: o ápice fica a meio caminho do controle
  const [sx, sy] = valley(0);
  let d = `M${fmt(sx)} ${fmt(sy)}`;
  for (let k = 0; k < n; k++) {
    const [qx, qy] = control(k);
    const [ex, ey] = valley(k + 1);
    d += ` Q${fmt(qx)} ${fmt(qy)} ${fmt(ex)} ${fmt(ey)}`;
  }
  return `${d} Z`;
}

/** Facetas de um diamante (octógono lapidado): mesa no centro, 8 faces trapezoidais e 8 pontas, cada uma com um brilho de 0 (escura) a 1 (clara). */
export function facets(cx: number, cy: number, r: number): { points: Pt[]; shade: number }[] {
  const outer = polygon(cx, cy, r, 8, -90 + 22.5);
  const table = polygon(cx, cy, r * 0.5, 8, -90 + 22.5);
  const out: { points: Pt[]; shade: number }[] = [{ points: table, shade: 0.92 }];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    // luz vinda do alto à esquerda: faces voltadas para lá são mais claras
    const facing = Math.cos(rad(-90 + 22.5 + 45 * i + 22.5 + 135));
    out.push({ points: [table[i]!, table[j]!, outer[j]!, outer[i]!], shade: 0.5 + 0.4 * facing });
  }
  return out;
}

/** Arco de progresso (anel que enche): de cima, no sentido horário, até `progress` (0 a 1). Vazio quando é 0; círculo cheio em 1. */
export function progressArc(cx: number, cy: number, r: number, progress: number): string {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) return "";
  if (p >= 0.9999) {
    const [tx, ty] = onCircle(cx, cy, r, -90);
    const [bx, by] = onCircle(cx, cy, r, 90);
    return `M${fmt(tx)} ${fmt(ty)} A${r} ${r} 0 1 1 ${fmt(bx)} ${fmt(by)} A${r} ${r} 0 1 1 ${fmt(tx)} ${fmt(ty)}`;
  }
  const [sx, sy] = onCircle(cx, cy, r, -90);
  const [ex, ey] = onCircle(cx, cy, r, -90 + 360 * p);
  return `M${fmt(sx)} ${fmt(sy)} A${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${fmt(ex)} ${fmt(ey)}`;
}

/** Folhas de louro (Ouro): `count` elipses por lado, subindo pelos dois lados do medalhão. */
export function laurel(cx: number, cy: number, r: number, count: number): { cx: number; cy: number; rot: number; side: -1 | 1 }[] {
  const out: { cx: number; cy: number; rot: number; side: -1 | 1 }[] = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < count; i++) {
      const deg = 100 + (i * 70) / Math.max(1, count - 1); // de baixo para cima, de 100° a 170°
      const angle = side === -1 ? deg : 180 - deg;
      const [x, y] = onCircle(cx, cy, r, angle);
      out.push({ cx: x, cy: y, rot: angle + 90, side });
    }
  }
  return out;
}

/** Brasão do Mestre (escudo largo com ponta embaixo). `scale` encolhe em volta do centro para fazer a borda interna. */
export function crestPath(scale = 1): string {
  const x = (v: number) => C + (v - C) * scale;
  const y = (v: number) => C + (v - C) * scale;
  return [
    `M${fmt(x(60))} ${fmt(y(12))}`,
    `L${fmt(x(98))} ${fmt(y(24))}`,
    `L${fmt(x(98))} ${fmt(y(62))}`,
    `Q${fmt(x(98))} ${fmt(y(94))} ${fmt(x(60))} ${fmt(y(112))}`,
    `Q${fmt(x(22))} ${fmt(y(94))} ${fmt(x(22))} ${fmt(y(62))}`,
    `L${fmt(x(22))} ${fmt(y(24))}`,
    "Z",
  ].join(" ");
}

/** Coroa do Mestre: pontas e as três joias. */
export function crown(): { path: string; gems: Pt[] } {
  return {
    path: "M38 22 L44 6 L53 16 L60 2 L67 16 L76 6 L82 22 Q60 28 38 22 Z",
    gems: [
      [44, 12],
      [60, 9],
      [76, 12],
    ],
  };
}

/** Asa (um lado) do Mestre: penas que abrem para fora. `side` -1 = esquerda, 1 = direita. */
export function wing(side: -1 | 1): string[] {
  // Desenhada para a direita e espelhada em torno do centro (x → 120 - x) para a esquerda.
  const x = (v: number) => (side === 1 ? v : VIEW - v);
  const feather = (tipX: number, tipY: number, baseY: number) => {
    const baseX = 96;
    return `M${x(baseX)} ${baseY} Q${fmt(x((baseX + tipX) / 2))} ${fmt(baseY - 10)} ${fmt(x(tipX))} ${fmt(tipY)} Q${fmt(x((baseX + tipX) / 2))} ${fmt(baseY + 4)} ${x(baseX)} ${fmt(baseY + 8)} Z`;
  };
  return [feather(116, 30, 46), feather(118, 46, 54), feather(114, 62, 62)];
}
