import { useEffect, type ReactNode } from "react";
import { Pressable, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeOutUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUiStore } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { ApiErrorMessage } from "./ApiErrorMessage";
import { Button } from "./Button";
import { Card } from "./Layout";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

/** Bloco "carregando" com pulsar suave. */
export function Skeleton({ width = "100%", height = 16, radius = 8, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceAlt }, animated, style]} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <View style={{ gap: 12 }}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="65%" height={28} />
        {Array.from({ length: lines - 2 }).map((_, i) => (
          <Skeleton key={i} height={12} width={`${90 - i * 15}%`} />
        ))}
      </View>
    </Card>
  );
}

export function EmptyState({ icon = "layers", title, message, action, onAction }: { icon?: string; title: string; message?: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 32, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text tone="muted" align="center">
          {message}
        </Text>
      ) : null}
      {action ? <Button label={action} onPress={onAction} fullWidth={false} size="md" /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 32, paddingHorizontal: 24 }}>
      <Icon name="cloud-off" size={32} color="#9AA1B2" />
      <ApiErrorMessage error={error} align="center" />
      {onRetry ? <Button label="Tentar novamente" variant="secondary" onPress={onRetry} fullWidth={false} /> : null}
    </View>
  );
}

/** Faixa de aviso (offline, pendências...). */
export function Banner({ tone = "info", icon, children, onPress }: { tone?: "info" | "warning" | "negative" | "positive"; icon?: string; children: ReactNode; onPress?: () => void }) {
  const { colors, radius } = useTheme();
  const palette = {
    info: { bg: colors.primarySoft, fg: colors.primary },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    negative: { bg: colors.negativeSoft, fg: colors.negative },
    positive: { bg: colors.positiveSoft, fg: colors.positive },
  }[tone];
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: palette.bg }}>
      {icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Text variant="bodySm" style={{ color: palette.fg }}>{children}</Text> : children}</View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

/** Avisos rápidos no topo da tela. Montado uma vez na raiz do app. */
export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const { colors, radius } = useTheme();
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, gap: 8, alignItems: "center", zIndex: 1000 }}>
      {toasts.map((t) => {
        const tint = t.tone === "success" ? colors.positive : t.tone === "error" ? colors.negative : colors.primary;
        return (
          <Animated.View key={t.id} entering={FadeInDown.duration(220)} exiting={FadeOutUp.duration(180)} style={{ maxWidth: 520, width: "100%" }}>
            <Pressable
              onPress={() => dismiss(t.id)}
              accessibilityRole="alert"
              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: tint, shadowColor: colors.shadow, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
            >
              <Icon name={t.tone === "success" ? "circle-check" : t.tone === "error" ? "circle-alert" : "info"} size={20} color={tint} />
              <Text variant="bodySm" style={{ flex: 1 }}>
                {t.message}
              </Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** Diálogo de confirmação global (ver `confirmDialog`). */
export function ConfirmHost() {
  const confirm = useUiStore((s) => s.confirm);
  const answer = useUiStore((s) => s.answer);
  return (
    <Sheet visible={!!confirm} onClose={() => answer(false)} scroll={false}>
      {confirm ? (
        <View style={{ gap: 16, paddingBottom: 8 }}>
          <View style={{ gap: 6 }}>
            <Text variant="heading">{confirm.title}</Text>
            {confirm.message ? <Text tone="muted">{confirm.message}</Text> : null}
          </View>
          <View style={{ gap: 8 }}>
            <Button label={confirm.confirmLabel ?? "Confirmar"} variant={confirm.destructive ? "dangerSolid" : "primary"} onPress={() => answer(true)} />
            <Button label={confirm.cancelLabel ?? "Cancelar"} variant="ghost" onPress={() => answer(false)} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
