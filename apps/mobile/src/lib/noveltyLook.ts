/**
 * A "cara" de cada novidade no mural: uma animação de passagem PRÓPRIA (o que voa pelo fundo do quadro, bem rápido, de 3 a 5 vezes) e uma COR própria.
 * REGRA DO DONO: toda novidade nova ganha uma animação diferente das que já existem e uma cor diferente das que já existem. Os testes conferem
 * (`roadmap.test.ts`): cada item do mural tem `flight` e `hue`, e nenhum se repete.
 *
 * Tudo aqui é puro (sem React) para ser testável; a animação em si está em `components/art/Flyby.tsx`.
 */

/** Como o desenho cruza o quadro. */
export type Motion = "ltr" | "rtl" | "rise" | "fall" | "diag-up" | "diag-down" | "wave";

export type FlightKind = {
  id: string;
  /** Nome de um ícone do app, ou "rocket-art" para o foguete desenhado. */
  icon: string;
  motion: Motion;
  /** Gira enquanto passa. */
  spin: boolean;
  /** Cor do desenho (clara, para aparecer sobre o degradê escuro). */
  tint: string;
};

/** Uma animação por novidade. Para uma novidade nova, crie uma entrada nova (ícone e movimento que ainda não existam juntos). */
export const FLIGHTS = [
  { id: "rocket-ltr", icon: "rocket-art", motion: "ltr", spin: false, tint: "#FFFFFF" }, // o quadro do topo ("Estamos sempre construindo")
  { id: "rocket-up", icon: "rocket-art", motion: "diag-up", spin: false, tint: "#FFFFFF" },
  { id: "coins-rise", icon: "coins", motion: "rise", spin: false, tint: "#FDE047" },
  { id: "key-spin", icon: "key-round", motion: "ltr", spin: true, tint: "#FDE68A" },
  { id: "bank-diag", icon: "landmark", motion: "diag-up", spin: false, tint: "#E2E8F0" },
  { id: "crown-fall", icon: "crown", motion: "fall", spin: false, tint: "#FACC15" },
  { id: "wrench-wave", icon: "wrench", motion: "wave", spin: true, tint: "#CBD5E1" },
  { id: "percent-rtl", icon: "percent", motion: "rtl", spin: false, tint: "#BEF264" },
  { id: "clock-spin", icon: "clock", motion: "rtl", spin: true, tint: "#67E8F9" },
  { id: "repeat-wave", icon: "repeat", motion: "wave", spin: true, tint: "#A5F3FC" },
  { id: "plus-rise", icon: "plus", motion: "rise", spin: true, tint: "#FFFFFF" },
  { id: "gem-diag", icon: "gem", motion: "diag-down", spin: false, tint: "#7DD3FC" },
  { id: "palette-ltr", icon: "palette", motion: "ltr", spin: false, tint: "#F9A8D4" },
  { id: "layers-fall", icon: "layers", motion: "fall", spin: false, tint: "#C4B5FD" },
  { id: "shield-up", icon: "shield-check", motion: "diag-up", spin: false, tint: "#86EFAC" },
  { id: "user-rtl", icon: "user", motion: "rtl", spin: false, tint: "#E0E7FF" },
  { id: "party-rise", icon: "party-popper", motion: "rise", spin: false, tint: "#FDBA74" },
  { id: "gift-spin", icon: "gift", motion: "diag-down", spin: true, tint: "#FDA4AF" },
  { id: "buoy-wave", icon: "life-buoy", motion: "wave", spin: true, tint: "#FCA5A5" },
  { id: "file-ltr", icon: "file-text", motion: "ltr", spin: false, tint: "#F1F5F9" },
  { id: "sun-fall", icon: "sun", motion: "fall", spin: true, tint: "#FEF08A" },
  { id: "cap-diag", icon: "graduation-cap", motion: "diag-up", spin: false, tint: "#FFFFFF" },
  { id: "sparkles-wave", icon: "sparkles", motion: "wave", spin: false, tint: "#FDE68A" },
  { id: "zap-diag", icon: "zap", motion: "diag-down", spin: false, tint: "#FEF9C3" },
  { id: "bulb-rise", icon: "lightbulb", motion: "rise", spin: false, tint: "#FEF08A" },
  { id: "film-rtl", icon: "film", motion: "rtl", spin: false, tint: "#E9D5FF" },
  { id: "chart-rise", icon: "chart-pie", motion: "rise", spin: false, tint: "#BAE6FD" },
  { id: "piggy-fall", icon: "piggy-bank", motion: "fall", spin: false, tint: "#FBCFE8" },
] as const satisfies readonly FlightKind[];

export type FlightId = (typeof FLIGHTS)[number]["id"];

export const flightById = (id: FlightId): FlightKind => FLIGHTS.find((f) => f.id === id)!;

// --------------------------------------------------------------------------------------------------------------------------- cores

/** Distância mínima, em graus de matiz, entre duas novidades (para as cores não parecerem a mesma). */
export const MIN_HUE_GAP = 7;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** HSL (h em graus, s e l em 0 a 1) para #RRGGBB. */
export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hh / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const hex = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`.toUpperCase();
}

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Luminância relativa (WCAG). */
export function relLuminance(hex: string): number {
  return 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
}

/** Razão de contraste (WCAG) entre a cor e o branco. 4,5 ou mais é o mínimo para texto normal. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (relLuminance(hex) + 0.05);
}

/**
 * Degradê do quadro de uma novidade a partir do matiz (0 a 359): sempre escuro o bastante para o texto branco ter contraste de 4,5 ou mais, em qualquer matiz
 * (amarelos e verdes ficam mais fechados que azuis e roxos).
 */
export function noveltyGradient(hue: number): [string, string] {
  let light = 0.34;
  let to = hslToHex(hue + 28, 0.6, light);
  while (contrastWithWhite(to) < 4.5 && light > 0.1) {
    light -= 0.01;
    to = hslToHex(hue + 28, 0.6, light);
  }
  return [hslToHex(hue, 0.62, Math.max(0.1, light - 0.11)), to];
}

/** Distância circular entre dois matizes, em graus (0 a 180). */
export function hueGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d);
}
