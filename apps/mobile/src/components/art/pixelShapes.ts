/**
 * A logo do Finança (quadrado com três barras que sobem) desenhada em "pixels", com o lado direito se despedaçando: os pixels se soltam, giram,
 * encolhem e somem. Tudo calculado aqui, sem React, para ser previsível (mesma imagem sempre) e testável.
 *
 * Coordenadas em 0..1 (o desenho é o ícone do app, de 1024 px, dividido por 1024).
 */

export type PixelTone = 0 | 1 | 2 | 3;

export type PixelCell = {
  /** Posição do canto de cima à esquerda da célula, já com o deslocamento de quem se soltou. */
  x: number;
  y: number;
  /** Lado da célula (já encolhido, se for estilhaço). */
  size: number;
  /** Rotação em graus (só estilhaços). */
  rotate: number;
  /** 0 = fundo; 1, 2 e 3 = barra pequena, média e alta (clara → branca). */
  tone: PixelTone;
  /** 0..1: a posição na diagonal do ícone, para o degradê do fundo. */
  gradient: number;
  /** Opacidade da célula (estilhaços ficam mais fracos quanto mais longe). */
  alpha: number;
  /** Soltou-se do desenho. */
  shard: boolean;
};

/** Gerador pseudoaleatório determinístico (mulberry32): a mesma semente sempre produz a mesma imagem. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BARS = [
  { x: 185 / 1024, top: 545 / 1024, w: 170 / 1024, tone: 1 as const },
  { x: 427 / 1024, top: 388 / 1024, w: 170 / 1024, tone: 2 as const },
  { x: 669 / 1024, top: 185 / 1024, w: 170 / 1024, tone: 3 as const },
];
const BAR_BOTTOM = 838 / 1024;
/** Raio da ponta arredondada das barras (metade da largura: formato de pílula). */
const BAR_R = 85 / 1024;
/** Raio dos cantos do quadrado de fundo. */
const BG_R = 0.2;

/** O ponto (px, py) está dentro da barra em forma de pílula? */
function inBar(px: number, py: number, bar: (typeof BARS)[number]): TonePick {
  const cx = bar.x + bar.w / 2;
  if (px < bar.x || px > bar.x + bar.w || py < bar.top || py > BAR_BOTTOM) return false;
  if (py < bar.top + BAR_R) return Math.hypot(px - cx, py - (bar.top + BAR_R)) <= BAR_R;
  if (py > BAR_BOTTOM - BAR_R) return Math.hypot(px - cx, py - (BAR_BOTTOM - BAR_R)) <= BAR_R;
  return true;
}
type TonePick = boolean;

/** O ponto está dentro do quadrado de cantos arredondados? */
function inBackground(px: number, py: number): boolean {
  if (px < 0 || px > 1 || py < 0 || py > 1) return false;
  const dx = Math.max(BG_R - px, 0, px - (1 - BG_R));
  const dy = Math.max(BG_R - py, 0, py - (1 - BG_R));
  return Math.hypot(dx, dy) <= BG_R;
}

/** Em qual parte do desenho cai o ponto: fundo (0) ou uma das barras (1 a 3); `null` = fora do ícone. */
export function toneAt(px: number, py: number): PixelTone | null {
  for (const bar of BARS) if (inBar(px, py, bar)) return bar.tone;
  return inBackground(px, py) ? 0 : null;
}

/**
 * Células da logo. `grid` é quantos pixels por lado. A partir de `breakFrom` (0..1, da esquerda para a direita) os pixels começam a se soltar,
 * cada vez mais, e alguns somem de vez (buracos). Os que ficam à esquerda continuam inteiros.
 */
export function logoCells(grid = 24, seed = 11, breakFrom = 0.34): PixelCell[] {
  const rand = seeded(seed);
  const cell = 1 / grid;
  const out: PixelCell[] = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const cx = (gx + 0.5) * cell;
      const cy = (gy + 0.5) * cell;
      const tone = toneAt(cx, cy);
      if (tone === null) continue;
      // Sorteios sempre na mesma ordem (a imagem não muda se o código mudar de lugar).
      const r1 = rand();
      const r2 = rand();
      const r3 = rand();
      const r4 = rand();
      const gradient = (cx + cy) / 2;
      // 0 no lado esquerdo intacto, 1 na borda direita.
      const t = Math.max(0, (cx - breakFrom) / (1 - breakFrom));
      const breaks = r1 < Math.min(0.96, t * 1.25);
      if (!breaks) {
        out.push({ x: gx * cell, y: gy * cell, size: cell * 0.94, rotate: 0, tone, gradient, alpha: 1, shard: false });
        continue;
      }
      // Alguns pixels somem de vez: abre buracos na região que se desfaz.
      if (r2 > 1 - t * 0.55) continue;
      const push = 0.04 + t * 0.55 * (0.4 + r3);
      const lift = (r4 - 0.62) * 0.5 * (0.3 + t);
      out.push({
        x: gx * cell + push,
        y: gy * cell + lift,
        size: cell * (0.34 + 0.6 * (1 - t) * (0.5 + r2 * 0.5)),
        rotate: (r3 - 0.5) * 140 * (0.4 + t),
        tone,
        gradient,
        alpha: Math.max(0.12, 0.95 - t * 0.8 - r4 * 0.15),
        shard: true,
      });
    }
  }
  return out;
}
