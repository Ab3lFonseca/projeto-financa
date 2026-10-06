import type { Appearance, CustomColors, ThemePresetId } from "@app/shared";
import { contrast, ensureContrast, mix, readableOn, type Hex } from "./color";
import { darkPalette, lightPalette, type Palette } from "./tokens";

export type Scheme = "light" | "dark";
export type ThemeGroupId = "basic" | "colorful" | "opaque" | "matte" | "pastel" | "custom";
export type ThemeMeta = { id: ThemePresetId; label: string; emoji: string; hint: string; group: ThemeGroupId };

/** Famílias de temas, na ordem em que aparecem na tela Aparência. */
export const THEME_GROUPS: readonly { id: ThemeGroupId; title: string; hint: string }[] = [
  { id: "basic", title: "Básicos", hint: "O visual padrão, claro ou escuro" },
  { id: "colorful", title: "Coloridos", hint: "Escuros, com destaque vivo" },
  { id: "opaque", title: "Opacos", hint: "Cores cheias e chapadas, sem brilho" },
  { id: "matte", title: "Foscos", hint: "Tons suaves e acinzentados, que descansam a vista" },
  { id: "pastel", title: "Pastéis", hint: "Claros, delicados e bem suaves" },
  { id: "custom", title: "Do seu jeito", hint: "Você escolhe as cores" },
];

/** Lista exibida na tela Aparência, na ordem em que aparece. */
export const THEME_META: readonly ThemeMeta[] = [
  { id: "system", label: "Automático", emoji: "📱", hint: "Segue o claro ou escuro do aparelho", group: "basic" },
  { id: "dark", label: "Escuro", emoji: "🌙", hint: "Fundo escuro e confortável à noite", group: "basic" },
  { id: "light", label: "Claro", emoji: "☀️", hint: "Fundo claro, o visual padrão", group: "basic" },
  { id: "blue", label: "Azul", emoji: "🌌", hint: "Azul profundo com destaque ciano", group: "colorful" },
  { id: "purple", label: "Roxo", emoji: "🟣", hint: "Roxo noturno com destaque rosa", group: "colorful" },
  { id: "green", label: "Verde", emoji: "🟢", hint: "Verde escuro com destaque lima", group: "colorful" },
  { id: "red", label: "Vermelho", emoji: "🔴", hint: "Vinho escuro com destaque laranja", group: "colorful" },
  { id: "opaque-ocean", label: "Oceano", emoji: "🌊", hint: "Azul cheio e chapado, com destaque âmbar", group: "opaque" },
  { id: "opaque-forest", label: "Floresta", emoji: "🌲", hint: "Verde esmeralda cheio, com destaque amarelo", group: "opaque" },
  { id: "opaque-wine", label: "Vinho", emoji: "🍷", hint: "Bordô cheio, com destaque salmão", group: "opaque" },
  { id: "opaque-grape", label: "Uva", emoji: "🍇", hint: "Roxo cheio, com destaque rosa", group: "opaque" },
  { id: "opaque-ember", label: "Brasa", emoji: "🔥", hint: "Marrom alaranjado cheio, com destaque dourado", group: "opaque" },
  { id: "matte-graphite", label: "Grafite", emoji: "⚫", hint: "Cinza escuro fosco, com destaque azul acinzentado", group: "matte" },
  { id: "matte-slate", label: "Ardósia", emoji: "🌫️", hint: "Azul acinzentado escuro e fosco", group: "matte" },
  { id: "matte-sage", label: "Sálvia", emoji: "🌿", hint: "Verde acinzentado claro e fosco", group: "matte" },
  { id: "matte-sand", label: "Areia", emoji: "🏜️", hint: "Bege quente, claro e fosco", group: "matte" },
  { id: "matte-mauve", label: "Malva", emoji: "🔮", hint: "Lilás acinzentado claro e fosco", group: "matte" },
  { id: "pastel-pink", label: "Rosa", emoji: "🌸", hint: "Rosa pastel, claro e delicado", group: "pastel" },
  { id: "pastel-mint", label: "Menta", emoji: "🍃", hint: "Verde menta pastel, fresco e suave", group: "pastel" },
  { id: "pastel-lavender", label: "Lavanda", emoji: "💜", hint: "Lavanda pastel, calmo e suave", group: "pastel" },
  { id: "pastel-peach", label: "Pêssego", emoji: "🍑", hint: "Pêssego pastel, quente e acolhedor", group: "pastel" },
  { id: "pastel-sky", label: "Céu", emoji: "☁️", hint: "Azul céu pastel, leve e limpo", group: "pastel" },
  { id: "custom", label: "Personalizado", emoji: "🎨", hint: "Você escolhe as cores", group: "custom" },
];

/** Temas prontos que partem de 4 cores (todos menos Automático, Claro, Escuro e Personalizado). */
export type BasedPresetId = Exclude<ThemePresetId, "system" | "light" | "dark" | "custom">;

/**
 * As 4 cores de partida (fundo, cartões, principal, destaque) dos temas prontos; o resto da paleta é derivado delas por `derivePalette`, que
 * ainda ajusta texto e cores para manter o contraste. Opacos: escuros, cheios e chapados. Foscos: pouca saturação. Pastéis: claros e suaves
 * (a cor principal escurece um pouco, o necessário para o botão e o texto colorido continuarem legíveis).
 */
export const PRESET_BASES: Record<BasedPresetId, CustomColors> = {
  blue: { background: "#0A1020", surface: "#111A30", primary: "#3B82F6", accent: "#38BDF8" },
  purple: { background: "#0F0A1F", surface: "#181230", primary: "#8B5CF6", accent: "#E879F9" },
  green: { background: "#06130E", surface: "#0D1F17", primary: "#22C55E", accent: "#A3E635" },
  red: { background: "#150A0C", surface: "#201114", primary: "#EF4444", accent: "#FB923C" },
  "opaque-ocean": { background: "#0B3B66", surface: "#11507F", primary: "#FFD166", accent: "#7DD3FC" },
  "opaque-forest": { background: "#0F3D2E", surface: "#165240", primary: "#FDE68A", accent: "#6EE7B7" },
  "opaque-wine": { background: "#4A0F24", surface: "#62192F", primary: "#FFB4A2", accent: "#FFD6A5" },
  "opaque-grape": { background: "#3B1D6E", surface: "#4C2A87", primary: "#F9A8D4", accent: "#A5B4FC" },
  "opaque-ember": { background: "#5A2209", surface: "#74300F", primary: "#FCD34D", accent: "#FDBA74" },
  "matte-graphite": { background: "#1E1F22", surface: "#2A2B2F", primary: "#9DB4D0", accent: "#C9B79C" },
  "matte-slate": { background: "#1F2933", surface: "#2B3844", primary: "#8FB3C9", accent: "#CDB9A6" },
  "matte-sage": { background: "#E6EAE2", surface: "#F3F5F0", primary: "#5F7D63", accent: "#A88B6B" },
  "matte-sand": { background: "#ECE6DC", surface: "#F6F2EA", primary: "#8C6A4F", accent: "#5E7C86" },
  "matte-mauve": { background: "#E9E1E6", surface: "#F5F0F3", primary: "#85607A", accent: "#5B7A8C" },
  "pastel-pink": { background: "#FDE8EF", surface: "#FFF5F8", primary: "#E0709A", accent: "#9B7FD1" },
  "pastel-mint": { background: "#E3F6EC", surface: "#F4FCF8", primary: "#4FB38A", accent: "#5B9BD5" },
  "pastel-lavender": { background: "#ECE6FA", surface: "#F7F4FE", primary: "#8A6FD6", accent: "#E58AB8" },
  "pastel-peach": { background: "#FFEBDD", surface: "#FFF7F1", primary: "#E8875A", accent: "#6FB1A0" },
  "pastel-sky": { background: "#E1F1FB", surface: "#F3FAFE", primary: "#4A9AD4", accent: "#F29E8E" },
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
  // Um tema que esta versão do app não conhece (ex.: criado numa versão mais nova) volta ao do aparelho em vez de quebrar a tela.
  const base = preset === "custom" ? (custom ?? DEFAULT_CUSTOM) : PRESET_BASES[preset as BasedPresetId];
  if (!base) return resolveTheme(system, custom, system);
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
  // Coloridos e opacos são escuros; foscos e pastéis podem ser claros: o esquema vem da paleta derivada.
  return resolveTheme(a.preset, a.custom, "light").scheme === "dark" ? "DARK" : "LIGHT";
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
