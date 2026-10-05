export type Rect = { x: number; y: number; width: number; height: number };
export type Viewport = { width: number; height: number };
export type Placement = { top: number; left: number; width: number; where: "center" | "above" | "below" | "top" | "bottom" };

/** Aumenta o retângulo em `pad` de cada lado e o recorta para caber na janela (o destaque nunca sai da tela). */
export function padRect(r: Rect, pad: number, viewport: Viewport): Rect {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  const right = Math.min(viewport.width, r.x + r.width + pad);
  const bottom = Math.min(viewport.height, r.y + r.height + pad);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/**
 * Onde pôr o cartão com a explicação:
 *  - sem destaque: no centro;
 *  - com destaque: embaixo dele, ou em cima se não couber embaixo (e prefere em cima quando o alvo está na metade de baixo,
 *    como a barra de abas); se não couber em nenhum, fixa no topo ou na base da tela, longe do alvo;
 *  - horizontalmente: centrado no alvo, mas sempre dentro da tela. Em telas estreitas o cartão ocupa a largura toda.
 */
export function placeCard(target: Rect | null, viewport: Viewport, card: { height: number }, opts: { margin?: number; gap?: number; maxWidth?: number } = {}): Placement {
  const margin = opts.margin ?? 16;
  const gap = opts.gap ?? 14;
  const width = Math.max(220, Math.min(opts.maxWidth ?? 380, viewport.width - margin * 2));
  const clampLeft = (left: number) => Math.max(margin, Math.min(left, viewport.width - width - margin));
  const clampTop = (top: number) => Math.max(margin, Math.min(top, viewport.height - card.height - margin));

  if (!target) {
    return { top: clampTop((viewport.height - card.height) / 2), left: clampLeft((viewport.width - width) / 2), width, where: "center" };
  }
  const left = clampLeft(target.x + target.width / 2 - width / 2);
  const below = viewport.height - (target.y + target.height) - margin;
  const above = target.y - margin;
  const fitsBelow = below >= card.height + gap;
  const fitsAbove = above >= card.height + gap;
  const targetInLowerHalf = target.y + target.height / 2 > viewport.height * 0.55;

  if (targetInLowerHalf && fitsAbove) return { top: clampTop(target.y - gap - card.height), left, width, where: "above" };
  if (fitsBelow) return { top: clampTop(target.y + target.height + gap), left, width, where: "below" };
  if (fitsAbove) return { top: clampTop(target.y - gap - card.height), left, width, where: "above" };
  // Não cabe nem em cima nem embaixo (tela baixa): vai para o lado oposto ao do alvo.
  return targetInLowerHalf ? { top: margin, left, width, where: "top" } : { top: viewport.height - card.height - margin, left, width, where: "bottom" };
}

/** Iguais com folga de 1px (evita redesenhar por diferenças de arredondamento ao medir). */
export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}
