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

/** Onde está o mouse, em coordenadas da logo (0..1 dentro do quadrado; pode passar disso para fora). */
export type Pointer = { x: number; y: number };

/** Quanto um cubo foi movido pelo mouse: deslocamento (em unidades da logo), giro extra (graus) e brilho (0..1). */
export type HoverShift = { readonly dx: number; readonly dy: number; readonly rotate: number; readonly glow: number };

const AT_REST: HoverShift = Object.freeze({ dx: 0, dy: 0, rotate: 0, glow: 0 });

/** Distância (em unidades da logo) a partir do mouse em que os cubos reagem: um círculo pequeno em volta do cursor. */
export const HOVER_RADIUS = 0.12;

/**
 * Como um cubo reage ao mouse passando por perto: é empurrado para longe do cursor, gira e brilha, mais forte quanto mais perto (e nada além do
 * raio). `noise` (0..1, fixo por cubo) varia a força e o sentido do giro, para o efeito parecer algo se quebrando e não uma onda certinha.
 */
export function hoverShift(cell: PixelCell, noise: number, pointer: Pointer | null, radius = HOVER_RADIUS): HoverShift {
  if (!pointer) return AT_REST;
  const vx = cell.x + cell.size / 2 - pointer.x;
  const vy = cell.y + cell.size / 2 - pointer.y;
  const d = Math.hypot(vx, vy);
  if (d >= radius) return AT_REST;
  const k = 1 - d / radius;
  const strength = k * k * (3 - 2 * k); // forte no centro, some devagar na borda
  // Bem embaixo do cursor não existe "para longe": o sentido vem do sorteio do cubo.
  const angle = d < 1e-6 ? noise * Math.PI * 2 : Math.atan2(vy, vx);
  const push = radius * strength * (0.5 + noise);
  return { dx: Math.cos(angle) * push, dy: Math.sin(angle) * push - strength * 0.02 * noise, rotate: (noise - 0.5) * 300 * strength, glow: strength };
}

/** Pixels por lado da logo de fundo: grade bem fina (a primeira versão tinha 24; depois 40). */
export const LOGO_GRID = 56;
/** A logo de fundo é mostrada INTEIRA (nenhum cubo se solta ou some em repouso); só reage quando o mouse passa. */
export const LOGO_BREAK_FROM = 1;

/** Quantos grupos de cubos se mexem em oposição no celular, e quanto dura uma subida e descida completa. */
export const AMBIENT_LAYERS = 6;
export const AMBIENT_PERIOD = 4.2;
/** Quanto os cubos sobem e descem, em fração do tamanho da logo. */
export const AMBIENT_AMPLITUDE = 0.016;

/**
 * Em qual dos 6 grupos o cubo está: a paridade da posição (xadrez) separa vizinhos em lados opostos do movimento, e faixas diagonais atrasam
 * cada grupo um pouco, o que faz uma onda lenta atravessar a imagem. No celular nativo cada grupo é uma camada que sobe e desce inteira.
 */
export function ambientLayerOf(cell: Pick<PixelCell, "x" | "y">, grid = LOGO_GRID): number {
  const ix = Math.round(cell.x * grid);
  const iy = Math.round(cell.y * grid);
  const parity = (ix + iy) & 1; // vale também para somas negativas (estilhaços que subiram acima da borda)
  const band = Math.abs(Math.floor((ix + iy) / 8)) % 3;
  return parity * 3 + band;
}

/** Atraso (em radianos) de cada grupo: quem tem paridade oposta fica meio ciclo defasado, e cada faixa, um terço de ciclo. */
export const AMBIENT_PHASES: readonly number[] = Array.from({ length: AMBIENT_LAYERS }, (_, layer) => (layer >= 3 ? Math.PI : 0) + (layer % 3) * ((2 * Math.PI) / 3));

/**
 * Movimento próprio dos cubos, para telas sem mouse (celular): cada um sobe e desce, e vizinhos fazem o contrário (enquanto um sobe, o do lado
 * desce) e acendem e apagam em alternância. `noise` dá a cada cubo um pequeno atraso, para não parecer uma máquina. Repete a cada `AMBIENT_PERIOD`.
 */
export function ambientShift(cell: PixelCell, noise: number, seconds: number, grid = LOGO_GRID): HoverShift {
  const phase = AMBIENT_PHASES[ambientLayerOf(cell, grid)]! + noise * 0.9;
  const w = (seconds / AMBIENT_PERIOD) * 2 * Math.PI + phase;
  const s = Math.sin(w);
  return {
    dx: 0,
    dy: s * AMBIENT_AMPLITUDE * (0.6 + 0.8 * noise),
    rotate: Math.sin(w * 0.7) * (cell.shard ? 7 : 2),
    glow: (0.5 + 0.5 * Math.sin(w + Math.PI / 2)) * 0.45,
  };
}

/**
 * Aproxima `current` de `target` suavemente, no mesmo ritmo em qualquer taxa de quadros. Vai rápido quando o valor se afasta do repouso (o cubo
 * salta quando o mouse chega) e devagar quando volta a ele (assenta quando o mouse sai).
 */
export function approach(current: number, target: number, dtSeconds: number, upRate = 14, downRate = 4.5): number {
  const rate = Math.abs(target) >= Math.abs(current) ? upRate : downRate;
  const dt = Math.max(0, Math.min(dtSeconds, 0.05));
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Células da logo. `grid` é quantos pixels por lado. A partir de `breakFrom` (0..1, da esquerda para a direita) os pixels começam a se soltar,
 * cada vez mais, e alguns somem de vez (buracos). Os que ficam à esquerda continuam inteiros.
 */
export function logoCells(grid = LOGO_GRID, seed = 11, breakFrom = 0.34): PixelCell[] {
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
      // `breakFrom` 1 ou mais = a logo inteira, sem nenhum cubo solto ou faltando.
      if (breakFrom >= 1) {
        out.push({ x: gx * cell, y: gy * cell, size: cell * 0.94, rotate: 0, tone, gradient, alpha: 1, shard: false });
        continue;
      }
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
