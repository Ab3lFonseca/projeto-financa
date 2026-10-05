import { useEffect } from "react";
import { Pressable, ScrollView, Switch, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { smooth, useHover } from "./hover";
import { Text } from "./Text";

/** Pílula selecionável (filtros, formas de pagamento...). */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  color?: string | null;
}) {
  const { colors, radius } = useTheme();
  const { hovered, hoverProps } = useHover();
  const tint = color ?? colors.primary;
  // Texto sobre o chip selecionado: a cor própria da categoria usa branco; sem cor, o texto próprio da cor principal do tema.
  const onTint = color ? "#FFFFFF" : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-pressed={!!selected}
      onPress={onPress}
      {...hoverProps}
      style={{
        ...smooth,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        height: 38,
        borderRadius: radius.pill,
        backgroundColor: selected ? tint : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: selected ? tint : hovered ? colors.accent : colors.border,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? onTint : (color ?? colors.textMuted)} /> : null}
      <Text variant="bodySm" weight="600" style={{ color: selected ? onTint : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Linha de chips rolável na horizontal. */
export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingHorizontal: 16 }, style]} style={{ marginHorizontal: -16, flexGrow: 0 }}>
      {children}
    </ScrollView>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; tone?: "positive" | "negative" | "primary" };

/** Controle segmentado (ex.: Despesa | Receita | Transferência). A opção selecionada usa a cor de destaque do tema. */
export function Segmented<T extends string>({ options, value, onChange }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 }}>
      {options.map((o) => (
        <SegmentItem key={o.value} option={o} active={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

function SegmentItem<T extends string>({ option: o, active, onPress }: { option: SegmentOption<T>; active: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  const { hovered, hoverProps } = useHover();
  const tint = o.tone === "positive" ? colors.positive : o.tone === "negative" ? colors.negative : colors.accent;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      aria-selected={active}
      onPress={onPress}
      {...hoverProps}
      style={{
        flex: 1,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.md - 4,
        backgroundColor: active ? colors.surface : hovered ? colors.border : "transparent",
        ...smooth,
      }}
    >
      <Text variant="bodySm" weight="600" style={{ color: active ? tint : colors.textMuted }}>
        {o.label}
      </Text>
    </Pressable>
  );
}

/** Barra de progresso com animação suave. `value` de 0 a 100 (acima de 100 é limitado). */
export function ProgressBar({ value, color, height = 8, track }: { value: number; color?: string; height?: number; track?: string }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(100, value)), { duration: 600 });
  }, [value, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(100, value)) }}
      style={{ height, borderRadius: height / 2, backgroundColor: track ?? colors.surfaceAlt, overflow: "hidden" }}
    >
      <Animated.View style={[{ height: "100%", borderRadius: height / 2, backgroundColor: color ?? colors.accent }, fill]} />
    </View>
  );
}

/** Etiqueta pequena (status). */
export function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "positive" | "negative" | "warning" | "primary" }) {
  const { colors, radius } = useTheme();
  const palette = {
    default: { bg: colors.surfaceAlt, fg: colors.textMuted },
    positive: { bg: colors.positiveSoft, fg: colors.positive },
    negative: { bg: colors.negativeSoft, fg: colors.negative },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    primary: { bg: colors.primarySoft, fg: colors.primary },
  }[tone];
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: palette.bg }}>
      <Text variant="caption" weight="600" style={{ color: palette.fg }}>
        {label}
      </Text>
    </View>
  );
}

/** Linha com título, descrição e interruptor (preferências). */
export function SwitchRow({ title, subtitle, value, onChange, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="500">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={title}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}