// Funções de cor puras (sem React): conversão, mistura e contraste (WCAG 2). Base do tema personalizado, que deriva
// uma paleta inteira de 4 cores e precisa garantir que o texto continue legível.

export type Hex = string;

/** Aceita "#abc", "abc", "#AABBCC" ou "aabbcc" (com espaços nas pontas) e devolve "#AABBCC"; senão, null. */
export function normalizeHex(input: string): Hex | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return `#${h.toUpperCase()}`;
}

function channels(hex: Hex): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex(r: number, g: number, b: number): Hex {
  const part = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** Mistura `a` e `b`: t = 0 devolve `a`, t = 1 devolve `b`. */
export function mix(a: Hex, b: Hex, t: number): Hex {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  const k = Math.max(0, Math.min(1, t));
  return toHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
}

/** Luminância relativa (WCAG): 0 = preto, 1 = branco. */
export function luminance(hex: Hex): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razão de contraste (WCAG): de 1 (iguais) a 21 (preto no branco). Texto normal pede 4,5; elementos de interface, 3. */
export function contrast(a: Hex, b: Hex): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A cor de texto (clara ou escura) mais legível sobre `bg`. Prefere o par estético (`light`/`dark`); só recorre ao
 * branco/preto puro quando esse par não chega a 4,5:1 (cores de luminância média, onde o "quase preto" perde contraste).
 */
export function readableOn(bg: Hex, light: Hex = "#FFFFFF", dark: Hex = "#0B0D14"): Hex {
  const best = contrast(light, bg) >= contrast(dark, bg) ? light : dark;
  if (contrast(best, bg) >= 4.5) return best;
  const pure = contrast("#FFFFFF", bg) >= contrast("#000000", bg) ? "#FFFFFF" : "#000000";
  return contrast(pure, bg) > contrast(best, bg) ? pure : best;
}

/**
 * Ajusta `fg` (clareando ou escurecendo, sem trocar o matiz) até atingir `min` de contraste contra TODOS os fundos.
 * Se nenhuma variação alcançar, devolve branco ou preto, o que tiver o melhor contraste no pior caso.
 */
export function ensureContrast(fg: Hex, backgrounds: Hex | Hex[], min: number): Hex {
  const list = Array.isArray(backgrounds) ? backgrounds : [backgrounds];
  const worst = (c: Hex) => Math.min(...list.map((b) => contrast(c, b)));
  if (worst(fg) >= min) return fg;
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const lighter = mix(fg, "#FFFFFF", t);
    const darker = mix(fg, "#000000", t);
    const okLighter = worst(lighter) >= min;
    const okDarker = worst(darker) >= min;
    if (okLighter && okDarker) return worst(lighter) >= worst(darker) ? lighter : darker;
    if (okLighter) return lighter;
    if (okDarker) return darker;
  }
  return worst("#FFFFFF") >= worst("#000000") ? "#FFFFFF" : "#000000";
}

/** "rgba(r,g,b,a)" a partir de um hexadecimal (para brilhos e sobreposições). */
export function withAlpha(hex: Hex, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}
