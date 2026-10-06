import { View } from "react-native";
import { Card } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { useCountUp } from "@/components/ui/useCountUp";
import { useTheme } from "@/theme/ThemeProvider";

/** Número em destaque do painel: rótulo, valor que "conta" até o total e uma dica opcional. */
export function StatTile({ label, value, suffix = "", hint, tone }: { label: string; value: number; suffix?: string; hint?: string; tone?: "positive" | "negative" | "primary" }) {
  const { colors } = useTheme();
  const shown = useCountUp(value, true, 800);
  const dot = tone === "positive" ? colors.positive : tone === "negative" ? colors.negative : colors.primary;
  return (
    <Card style={{ flexGrow: 1, flexBasis: 150, gap: 6, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text variant="caption" tone="muted" weight="600">
          {label}
        </Text>
      </View>
      <Text variant="title" weight="700" tabular>
        {shown.toLocaleString("pt-BR")}
        {suffix}
      </Text>
      {hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}
