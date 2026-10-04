import { formatBRL } from "@app/shared";
import type { StyleProp, TextStyle } from "react-native";
import { usePrivacyStore } from "@/lib/privacy-store";
import { Text, type Tone } from "./Text";
import type { TextVariant } from "@/theme/tokens";

/**
 * Valor monetário (recebe centavos). `colorize` pinta de verde (positivo) ou vermelho (negativo);
 * `signed` mostra "+"; respeita o modo discreto (ocultar valores).
 */
export function Money({
  cents,
  variant = "body",
  tone,
  colorize,
  signed,
  weight = "600",
  sensitive = true,
  hideZeroCents,
  style,
  prefix,
}: {
  cents: number;
  variant?: TextVariant;
  tone?: Tone;
  colorize?: boolean;
  signed?: boolean;
  weight?: "400" | "500" | "600" | "700" | "800";
  sensitive?: boolean;
  hideZeroCents?: boolean;
  style?: StyleProp<TextStyle>;
  prefix?: string;
}) {
  const hidden = usePrivacyStore((s) => s.hideAmounts) && sensitive;
  const resolved: Tone = tone ?? (colorize ? (cents > 0 ? "positive" : cents < 0 ? "negative" : "default") : "default");
  const text = hidden ? "R$ ••••" : formatBRL(cents, { signed, hideZeroCents });
  return (
    <Text variant={variant} tone={resolved} weight={weight} tabular style={style} accessibilityLabel={hidden ? "valor oculto" : undefined}>
      {prefix}
      {text}
    </Text>
  );
}
