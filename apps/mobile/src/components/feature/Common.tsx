import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeInUp, FadeOut, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring, ZoomIn } from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { glow, smooth, useHover } from "@/components/ui/hover";
import { AnimatedPressable, GoChevron, PressableRow, useSpringPress } from "@/components/ui/Interactive";
import { useTourTarget } from "@/lib/tour/registry";
import { Card, IconBadge, Row } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import type { Dashboard } from "@/lib/api/endpoints";
import { useOutbox } from "@/lib/offline/outbox";
import { withAlpha } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";

/** O que o "+" oferece e para onde cada opção leva. Cada uma abre a tela própria de cadastro. */
export const QUICK_ADD_OPTIONS = [
  { value: "expense", label: "Despesa", subtitle: "Um gasto, na conta ou no cartão", icon: "arrow-up-right", tone: "negative", href: "/transaction/new" },
  { value: "income", label: "Receita", subtitle: "Dinheiro que entrou", icon: "arrow-down-left", tone: "positive", href: "/transaction/new?type=income" },
  { value: "transfer", label: "Transferência", subtitle: "Mover dinheiro entre as suas contas", icon: "arrow-left-right", tone: "primary", href: "/transfer/new" },
  { value: "recurring", label: "Recorrência", subtitle: "Conta ou receita que se repete (aluguel, salário…)", icon: "calendar-clock", tone: "accent", href: "/recurring/new" },
] as const;

export type QuickAddKind = (typeof QUICK_ADD_OPTIONS)[number]["value"];

const FAB_SIZE = 58;
const DIAL_SIZE = 46;
const DIAL_STEP = 56;

/** Uma opção do menu: círculo com o ícone e o nome ao lado. Sobe do "+" em cascata (a mais próxima primeiro) e desce ao fechar. */
function QuickAddItem({ option, index, tint, onPress }: { option: (typeof QUICK_ADD_OPTIONS)[number]; index: number; tint: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  const press = useSpringPress(0.94);
  return (
    <Animated.View
      entering={FadeInUp.delay(index * 55).springify().damping(15).stiffness(190)}
      exiting={FadeOutDown.delay((QUICK_ADD_OPTIONS.length - 1 - index) * 25).duration(140)}
      style={{ alignSelf: "flex-end" }}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[{ flexDirection: "row", alignItems: "center", gap: 10, marginRight: (FAB_SIZE - DIAL_SIZE) / 2 }, press.style]}
      >
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
          }}
        >
          <Text weight="700">{option.label}</Text>
        </View>
        <View
          style={{
            width: DIAL_SIZE,
            height: DIAL_SIZE,
            borderRadius: DIAL_SIZE / 2,
            backgroundColor: tint,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: tint,
            shadowOpacity: 0.4,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <Icon name={option.icon} size={22} color={colors.onPrimary} strokeWidth={2.4} />
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

/**
 * Botão flutuante "+". Por padrão abre o menu Adicionar: o "+" gira até virar "×" e os ícones (despesa, receita, transferência e recorrência)
 * sobem com seus nomes; cada um leva à tela de cadastro. Com `onPress`, faz só o que for pedido.
 */
export function Fab({ onPress, label = "Adicionar", tourId }: { onPress?: () => void; label?: string; tourId?: string }) {
  const { colors } = useTheme();
  const tourRef = useTourTarget(tourId);
  const { hovered, hoverProps } = useHover();
  const [pressed, setPressed] = useState(false);
  const [open, setOpen] = useState(false);
  const press = useSpringPress(0.9);
  const tint = { negative: colors.negative, positive: colors.positive, primary: colors.primary, accent: colors.accent };
  const spin = useSharedValue(0);
  // Fechado: "+" (gira um pouco ao passar o mouse). Aberto: dá a volta e para em "×".
  useEffect(() => {
    spin.value = withSpring(open ? 225 : hovered ? 90 : 0, { damping: 13, stiffness: 140, mass: 0.8 });
  }, [open, hovered, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  // Esc fecha o menu (web).
  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const choose = (href: string) => {
    setOpen(false);
    router.push(href as never);
  };
  return (
    <>
      {open ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}>
          <Pressable accessibilityLabel="Fechar o menu" style={{ flex: 1, backgroundColor: colors.overlay }} onPress={() => setOpen(false)} />
        </Animated.View>
      ) : null}
      {open ? (
        <View pointerEvents="box-none" style={{ position: "absolute", right: 20, bottom: 20 + FAB_SIZE + 14, gap: DIAL_STEP - DIAL_SIZE, zIndex: 21, flexDirection: "column-reverse" }}>
          {QUICK_ADD_OPTIONS.map((o, i) => (
            <QuickAddItem key={o.value} option={o} index={i} tint={tint[o.tone]} onPress={() => choose(o.href)} />
          ))}
        </View>
      ) : null}
    {/* Nasce com uma mola curta (cresce do centro) logo depois da tela aparecer. */}
    <Animated.View entering={ZoomIn.delay(320).springify().damping(14)} style={{ position: "absolute", right: 20, bottom: 20, zIndex: 22 }}>
      <AnimatedPressable
        ref={tourRef as never}
        accessibilityRole="button"
        accessibilityLabel={onPress ? label : open ? "Fechar o menu" : label}
        accessibilityHint={onPress ? undefined : "Abre as opções: despesa, receita, transferência e recorrência"}
        accessibilityState={onPress ? undefined : { expanded: open }}
        onPress={onPress ?? (() => setOpen((v) => !v))}
        {...hoverProps}
        onPressIn={() => {
          setPressed(true);
          press.onPressIn();
        }}
        onPressOut={() => {
          setPressed(false);
          press.onPressOut();
        }}
        style={[
          {
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: pressed || hovered ? colors.primaryPressed : colors.primary,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: colors.primary,
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          },
          smooth,
          hovered ? glow(withAlpha(colors.primary, 0.55)) : null,
          press.style,
        ]}
      >
        <Animated.View style={spinStyle}>
          <Icon name="plus" size={28} color={colors.onPrimary} strokeWidth={2.5} />
        </Animated.View>
      </AnimatedPressable>
    </Animated.View>
    </>
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
  return (
    <PressableRow onPress={onPress}>
      {({ hovered }) => (
        <Row style={{ paddingVertical: 10 }}>
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
          <GoChevron hovered={hovered} />
        </Row>
      )}
    </PressableRow>
  );
}

export { Card };
