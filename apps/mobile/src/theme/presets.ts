import type { Appearance, CustomColors, ThemePresetId } from "@app/shared";
import { contrast, ensureContrast, mix, readableOn, type Hex } from "./color";
import { darkPalette, lightPalette, type Palette } from "./tokens";

export type Scheme = "light" | "dark";
export type ThemeMeta = { id: ThemePresetId; label: string; emoji: string; hint: string };

/** Lista exibida na tela Aparência, na ordem em que aparece. */
export const THEME_META: readonly ThemeMeta[] = [
  { id: "system", label: "Automático", emoji: "📱", hint: "Segue o claro ou escuro do aparelho" },
  { id: "dark", label: "Escuro", emoji: "🌙", hint: "Fundo escuro e confortável à noite" },
  { id: "light", label: "Claro", emoji: "☀️", hint: "Fundo claro, o visual padrão" },
  { id: "blue", label: "Azul", emoji: "🌌", hint: "Azul profundo com destaque ciano" },
  { id: "purple", label: "Roxo", emoji: "🟣", hint: "Roxo noturno com destaque rosa" },
  { id: "green", label: "Verde", emoji: "🟢", hint: "Verde escuro com destaque lima" },
  { id: "red", label: "Vermelho", emoji: "🔴", hint: "Vinho escuro com destaque laranja" },
  { id: "custom", label: "Personalizado", emoji: "🎨", hint: "Você escolhe as cores" },
];

/** As 4 cores de partida dos temas coloridos; o resto da paleta é derivado delas por `derivePalette`. */
export const PRESET_BASES: Record<"blue" | "purple" | "green" | "red", CustomColors> = {
  blue: { background: "#0A1020", surface: "#111A30", primary: "#3B82F6", accent: "#38BDF8" },
  purple: { background: "#0F0A1F", surface: "#181230", primary: "#8B5CF6", accent: "#E879F9" },
  green: { background: "#06130E", surface: "#0D1F17", primary: "#22C55E", accent: "#A3E635" },
  red: { background: "#150A0C", surface: "#201114", primary: "#EF4444", accent: "#FB923C" },
};

/** Ponto de partida do editor do tema personalizado (o visual claro padrão com destaque ciano). */
export const DEFAULT_CUSTOM: CustomColors = { background: "#F5F6FA", surface: "#FFFFFF", primary: "#4F46E5", accent: "#0891B2" };

export type ResolvedTheme = { palette: Palette; scheme: Scheme };

/** Mistura `color` por cima de `surface`: tons suaves (fundos de selo, destaque) que seguem o cartão. */
const soft = (surface: Hex, color: Hex, amount: number) => mix(surface, color, amount);

/**
 * Deriva uma paleta completa de 4 cores (principal, destaque, fundo e cartões):
 *  - o esquema (claro/escuro) sai da luminância do fundo;
 *  - texto, cores principal e de destaque são ajustados para manter contraste mínimo (texto 4,5; interface 3) contra
 *    o fundo E contra os cartões;
 *  - bordas, superfícies alternativas e tons suaves são misturas do cartão com o texto/cor;
 *  - cores de status (receita, despesa, aviso) seguem o esquema, ajustadas ao mesmo contraste.
 */
export function derivePalette(base: CustomColors): ResolvedTheme {
  const bg = base.background as Hex;
  const surface = base.surface as Hex;
  const pair = [bg, surface];
  const dark = contrast(bg, "#FFFFFF") >= contrast(bg, "#000000");

  const text = ensureContrast(dark ? "#F2F3F7" : "#0F1222", pair, 7);
  const textMuted = ensureContrast(mix(text, surface, 0.32), pair, 4.5);
  const textFaint = ensureContrast(mix(text, surface, 0.55), pair, 3);
  const surfaceAlt = mix(surface, text, dark ? 0.07 : 0.05);
  const border = mix(surface, text, dark ? 0.15 : 0.11);

  const primary0 = ensureContrast(base.primary as Hex, pair, 3);
  const accent0 = ensureContrast(base.accent as Hex, pair, 3);
  const primarySoft = soft(surface, primary0, dark ? 0.2 : 0.1);
  const accentSoft = soft(surface, accent0, dark ? 0.2 : 0.12);
  // O texto colorido também aparece sobre o tom suave (selos, avisos): garante contraste lá.
  const primary = ensureContrast(primary0, [...pair, primarySoft], 3);
  const accent = ensureContrast(accent0, [...pair, accentSoft], 3);

  const positive = ensureContrast(dark ? "#34D399" : "#16A34A", pair, 3);
  const negative = ensureContrast(dark ? "#FB7185" : "#E11D48", pair, 3);
  const warning = ensureContrast(dark ? "#FBBF24" : "#D97706", pair, 3);

  const palette: Palette = {
    bg,
    surface,
    surfaceAlt,
    border,
    text,
    textMuted,
    textFaint,
    primary,
    primaryPressed: dark ? mix(primary, "#FFFFFF", 0.18) : mix(primary, "#000000", 0.15),
    onPrimary: readableOn(primary),
    primarySoft,
    accent,
    accentSoft,
    onAccent: readableOn(accent),
    positive,
    positiveSoft: soft(surface, positive, dark ? 0.16 : 0.1),
    negative,
    negativeSoft: soft(surface, negative, dark ? 0.16 : 0.1),
    warning,
    warningSoft: soft(surface, warning, dark ? 0.16 : 0.1),
    overlay: dark ? "rgba(0,0,0,0.6)" : "rgba(15,18,34,0.45)",
    shadow: dark ? "#000000" : "#0F1222",
  };
  return { palette, scheme: dark ? "dark" : "light" };
}

const cache = new Map<string, ResolvedTheme>();

/** Paleta e esquema de um tema. `system` decide pelo esquema do aparelho. Resultados derivados ficam em cache. */
export function resolveTheme(preset: ThemePresetId, custom: CustomColors | null | undefined, system: Scheme): ResolvedTheme {
  if (preset === "system") return resolveTheme(system, custom, system);
  if (preset === "light") return { palette: lightPalette, scheme: "light" };
  if (preset === "dark") return { palette: darkPalette, scheme: "dark" };
  const base = preset === "custom" ? (custom ?? DEFAULT_CUSTOM) : PRESET_BASES[preset];
  const key = `${preset}:${base.background}${base.surface}${base.primary}${base.accent}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = derivePalette(base);
    if (cache.size > 50) cache.clear();
    cache.set(key, hit);
  }
  return hit;
}

/** O valor equivalente de `profile.theme` (Sistema/Claro/Escuro), mantido na conta para quem usa versões antigas do app. */
export function legacyThemeFor(a: Appearance): "SYSTEM" | "LIGHT" | "DARK" {
  if (a.preset === "system") return "SYSTEM";
  if (a.preset === "light") return "LIGHT";
  if (a.preset === "custom") return resolveTheme("custom", a.custom, "light").scheme === "dark" ? "DARK" : "LIGHT";
  return "DARK";
}

/**
 * Avisos de legibilidade do tema personalizado (vazio = tudo certo). A paleta é ajustada automaticamente quando dá, mas
 * combinações como fundo escuro com cartões claros não têm texto único que sirva nos dois.
 */
export function contrastWarnings(custom: CustomColors): string[] {
  const { palette } = derivePalette(custom);
  const out: string[] = [];
  const pair = [palette.bg, palette.surface];
  if (Math.min(...pair.map((b) => contrast(palette.text, b))) < 4.5) out.push("O fundo e os cartões são muito diferentes: o texto pode ficar difícil de ler em um deles.");
  if (contrast(custom.primary as Hex, custom.surface as Hex) < 3 || contrast(custom.primary as Hex, custom.background as Hex) < 3)
    out.push("A cor principal é parecida com o fundo ou com os cartões e foi ajustada para continuar visível.");
  if (contrast(custom.accent as Hex, custom.surface as Hex) < 3 || contrast(custom.accent as Hex, custom.background as Hex) < 3)
    out.push("A cor de destaque é parecida com o fundo ou com os cartões e foi ajustada para continuar visível.");
  return out;
}
