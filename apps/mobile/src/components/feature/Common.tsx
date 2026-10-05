import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/Icon";
import { smooth, useHover } from "@/components/ui/hover";
import { useTourTarget } from "@/lib/tour/registry";
import { Card, IconBadge, Row } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import type { Dashboard } from "@/lib/api/endpoints";
import { useOutbox } from "@/lib/offline/outbox";
import { useTheme } from "@/theme/ThemeProvider";

/** Botão flutuante "+" para lançar. */
export function Fab({ onPress, label = "Novo lançamento", tourId }: { onPress?: () => void; label?: string; tourId?: string }) {
  const { colors } = useTheme();
  const tourRef = useTourTarget(tourId);
  return (
    <Pressable
      ref={tourRef}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress ?? (() => router.push("/transaction/new"))}
      style={({ pressed }) => ({
        position: "absolute",
        right: 20,
        bottom: 20,
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: colors.primary,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      })}
    >
      <Icon name="plus" size={28} color={colors.onPrimary} strokeWidth={2.5} />
    </Pressable>
  );
}

const INSIGHT_ICON: Record<Dashboard["insights"][number]["kind"], string> = {
  SPENDING_DOWN: "trending-up",
  SPENDING_UP: "trending-up",
  CATEGORY_DOWN: "chart-pie",
  CATEGORY_UP: "chart-pie",
  BUDGET_NEAR_LIMIT: "triangle-alert",
  BUDGET_EXCEEDED: "circle-alert",
  SAVINGS_POSITIVE: "piggy-bank",
  SAVINGS_NEGATIVE: "triangle-alert",
  INVOICE_DUE_SOON: "credit-card",
  GOAL_PROGRESS: "target",
};

/** Frase de insight com ícone e cor pela severidade. */
export function InsightCard({ insight }: { insight: Dashboard["insights"][number] }) {
  const { colors, radius } = useTheme();
  const tint = { positive: colors.positive, info: colors.primary, warning: colors.warning, critical: colors.negative }[insight.severity];
  const soft = { positive: colors.positiveSoft, info: colors.primarySoft, warning: colors.warningSoft, critical: colors.negativeSoft }[insight.severity];
  const down = insight.kind === "SPENDING_DOWN" || insight.kind === "CATEGORY_DOWN";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: soft }}>
      <View style={{ transform: down ? [{ scaleY: -1 }] : undefined }}>
        <Icon name={INSIGHT_ICON[insight.kind]} size={22} color={tint} />
      </View>
      <Text variant="bodySm" weight="500" style={{ flex: 1 }}>
        {insight.message}
      </Text>
    </View>
  );
}

/** Convite ao plano Premium (recurso bloqueado no plano gratuito). */
export function UpsellCard({ text, title = "Recurso Premium" }: { text?: string; title?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: colors.primarySoft }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
        <Icon name="crown" size={22} color={colors.onPrimary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="700">{title}</Text>
        <Text variant="bodySm" tone="muted">
          {text ?? "Disponível no plano Premium."}
        </Text>
      </View>
    </View>
  );
}

/** Aviso de lançamentos que ainda não foram enviados ao servidor (fila offline). */
export function PendingSyncBanner() {
  const items = useOutbox((s) => s.items);
  const { colors, radius } = useTheme();
  if (items.length === 0) return null;
  const failed = items.filter((i) => i.error).length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: failed ? colors.negativeSoft : colors.warningSoft }}>
      <Icon name={failed ? "circle-alert" : "cloud-off"} size={18} color={failed ? colors.negative : colors.warning} />
      <Text variant="bodySm" style={{ flex: 1 }}>
        {failed
          ? `${failed} lançamento(s) não puderam ser enviados. Toque em Mais → Pendências.`
          : `${items.length} lançamento(s) aguardando conexão para sincronizar.`}
      </Text>
    </View>
  );
}

/** Cartão de ação rápida (grade de atalhos da aba Mais). */
export function ShortcutRow({ icon, title, subtitle, onPress, badge, color }: { icon: string; title: string; subtitle?: string; onPress: () => void; badge?: ReactNode; color?: string }) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} {...hoverProps} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, backgroundColor: hovered ? colors.surfaceAlt : "transparent", borderRadius: 12, ...smooth })}>
      <Row style={{ paddingVertical: 12 }}>
        <IconBadge icon={icon} color={color ?? colors.primary} />
        <View style={{ flex: 1 }}>
          <Text weight="500">{title}</Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {badge}
        <Icon name="chevron-right" size={18} color={colors.textFaint} />
      </Row>
    </Pressable>
  );
}

export { Card };
