import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Text } from "@/components/ui/Text";
import { accessStrip } from "@/lib/access";
import { useMe } from "@/lib/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Faixa fixa sob o cabeçalho das telas principais: quanto falta do teste grátis (e até quando) com o botão para assinar já; no modo somente
 * leitura, o aviso; e, para quem pagou uma vez, o aviso de que o plano está acabando. Quem está em dia, cortesia, administrador e o beta não veem
 * nada. A regra do texto e da cor está em `accessStrip` (lib/access.ts).
 */
export function TrialStrip() {
  const { entitlements } = useMe();
  const { colors, radius } = useTheme();
  const info = accessStrip(entitlements.access, entitlements.billingEnforced);
  if (!info) return null;
  const palette = {
    info: { bg: colors.primarySoft, fg: colors.primary },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    negative: { bg: colors.negativeSoft, fg: colors.negative },
  }[info.tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${info.text}. ${info.cta}`}
      onPress={() => router.push("/subscription" as never)}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 4, paddingVertical: 8, paddingLeft: 12, paddingRight: 8, borderRadius: radius.md, backgroundColor: palette.bg }}
    >
      <Icon name={info.icon} size={16} color={palette.fg} />
      <Text variant="bodySm" weight="600" style={{ flex: 1, color: palette.fg }} numberOfLines={2}>
        {info.text}
      </Text>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: palette.fg }}>
        <Text variant="caption" weight="700" style={{ color: colors.onPrimary }}>
          {info.cta}
        </Text>
      </View>
    </Pressable>
  );
}
