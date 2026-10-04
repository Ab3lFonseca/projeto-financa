import { router } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { IconButton } from "./Button";
import { Text } from "./Text";

/** Card de superfície com cantos arredondados e sombra discreta. */
export function Card({
  children,
  onPress,
  style,
  padded = true,
  tone = "surface",
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: "surface" | "alt" | "primarySoft" | "warning" | "negative" | "positive";
}) {
  const { colors, radius, scheme } = useTheme();
  const bg = { surface: colors.surface, alt: colors.surfaceAlt, primarySoft: colors.primarySoft, warning: colors.warningSoft, negative: colors.negativeSoft, positive: colors.positiveSoft }[tone];
  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius.lg,
    padding: padded ? 16 : 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...(scheme === "light" ? { shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 } : null),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed ? { opacity: 0.85 } : null, style]}>
      {children}
    </Pressable>
  );
}

export function Section({ title, action, onAction, children, style }: { title: string; action?: string; onAction?: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 12 }, style]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text variant="heading">{title}</Text>
        {action ? (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="link">
            <Text variant="bodySm" tone="primary" weight="600">
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

/** Cabeçalho de telas internas: voltar + título + ações. */
export function ScreenHeader({ title, subtitle, onBack, right, back = true }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode; back?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 56 }}>
      {back ? (
        <IconButton
          icon="chevron-left"
          label="Voltar"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
        />
      ) : (
        <View style={{ width: 8 }} />
      )}
      <View style={{ flex: 1 }}>
        <Text variant="heading" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

type ScreenProps = {
  children: ReactNode;
  /** Conteúdo rolável (padrão). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
  /** Reserva espaço para a barra de abas (telas dentro das abas). */
  tabs?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
};

/** Esqueleto de tela: área segura, fundo do tema, rolagem com "puxar para atualizar" e teclado. */
export function Screen({ children, scroll = true, refreshing, onRefresh, header, footer, padded = true, tabs = false, contentStyle, keyboard = false }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ padding: padded ? 16 : 0, paddingBottom: (padded ? 24 : 0) + (tabs ? 16 : 0), gap: 20 }, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, padding: padded ? 16 : 0 }, contentStyle]}>{children}</View>
  );
  const content = (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {header}
      {body}
      {footer ? <View style={{ padding: 16, paddingBottom: 16 + (tabs ? 0 : insets.bottom), backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>{footer}</View> : null}
    </View>
  );
  if (!keyboard) return content;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {content}
    </KeyboardAvoidingView>
  );
}

/** Entrada suave (fade + subida) para blocos de conteúdo. Respeita ordem pelo `index`. */
export function Reveal({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).duration(320)} style={style}>
      {children}
    </Animated.View>
  );
}

export function Row({ children, gap = 12, style, align = "center" }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: "center" | "flex-start" | "flex-end" | "baseline" }) {
  return <View style={[{ flexDirection: "row", alignItems: align, gap }, style]}>{children}</View>;
}

/** Linha de lista: ícone/avatar à esquerda, título/subtítulo e valor à direita. */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron,
  style,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }, style]}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="500" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={18} color={colors.textFaint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

/** Ícone de categoria/conta em círculo com a cor em tom suave. */
export function IconBadge({ icon, color, size = 40 }: { icon: string; color?: string | null; size?: number }) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${tint}26`, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={size * 0.5} color={tint} />
    </View>
  );
}
