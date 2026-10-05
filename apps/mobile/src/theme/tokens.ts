// Linguagem visual: minimalista, clara e premium. Poucas cores: neutros + índigo de destaque,
// verde para entradas e vermelho para saídas. Modo escuro com o mesmo contraste.

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  /** Cor de destaque (itens selecionados, links, progresso, foco). Nos temas Claro e Escuro é a própria cor principal. */
  accent: string;
  accentSoft: string;
  onAccent: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
  shadow: string;
};

export const lightPalette: Palette = {
  bg: "#F5F6FA",
  surface: "#FFFFFF",
  surfaceAlt: "#F0F2F7",
  border: "#E6E8EF",
  text: "#0F1222",
  textMuted: "#5B6275",
  textFaint: "#9AA1B2",
  primary: "#4F46E5",
  primaryPressed: "#4338CA",
  onPrimary: "#FFFFFF",
  primarySoft: "#EEF0FF",
  accent: "#4F46E5",
  accentSoft: "#EEF0FF",
  onAccent: "#FFFFFF",
  positive: "#16A34A",
  positiveSoft: "#E8F7EE",
  negative: "#E11D48",
  negativeSoft: "#FDECEF",
  warning: "#D97706",
  warningSoft: "#FFF4E0",
  overlay: "rgba(15,18,34,0.45)",
  shadow: "#0F1222",
};

export const darkPalette: Palette = {
  bg: "#0A0B10",
  surface: "#14161E",
  surfaceAlt: "#1C1F2A",
  border: "#262A37",
  text: "#F2F3F7",
  textMuted: "#A0A7B8",
  textFaint: "#6B7285",
  primary: "#6366F1",
  primaryPressed: "#818CF8",
  onPrimary: "#FFFFFF",
  primarySoft: "#1E2048",
  accent: "#6366F1",
  accentSoft: "#1E2048",
  onAccent: "#FFFFFF",
  positive: "#34D399",
  positiveSoft: "#10281F",
  negative: "#FB7185",
  negativeSoft: "#2E1119",
  warning: "#FBBF24",
  warningSoft: "#2B2110",
  overlay: "rgba(0,0,0,0.6)",
  shadow: "#000000",
};

export type TextVariant = "display" | "title" | "heading" | "body" | "bodySm" | "caption" | "overline";

export const typography: Record<TextVariant, { fontSize: number; lineHeight: number; fontWeight: "400" | "500" | "600" | "700" | "800"; letterSpacing?: number }> = {
  display: { fontSize: 36, lineHeight: 42, fontWeight: "700", letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700", letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 0.8 },
};

/** Cores sugeridas para categorias/contas (pouco colorido, tons equilibrados). */
export const COLOR_CHOICES = [
  "#F97316", "#84CC16", "#3B82F6", "#8B5CF6", "#EC4899", "#06B6D4",
  "#F59E0B", "#D946EF", "#6366F1", "#14B8A6", "#64748B", "#22C55E",
  "#EF4444", "#0EA5E9", "#A3E635", "#94A3B8",
] as const;
