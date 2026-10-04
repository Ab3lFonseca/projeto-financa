import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { TextVariant } from "@/theme/tokens";

export type Tone = "default" | "muted" | "faint" | "primary" | "positive" | "negative" | "warning" | "onPrimary";

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: Tone;
  weight?: "400" | "500" | "600" | "700" | "800";
  align?: "left" | "center" | "right";
  /** Dígitos de largura fixa (valores monetários alinham melhor). */
  tabular?: boolean;
};

export function Text({ variant = "body", tone = "default", weight, align, tabular, style, ...rest }: TextProps) {
  const { colors, typography } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    primary: colors.primary,
    positive: colors.positive,
    negative: colors.negative,
    warning: colors.warning,
    onPrimary: colors.onPrimary,
  }[tone];
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    />
  );
}
