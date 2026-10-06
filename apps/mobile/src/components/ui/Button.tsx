import * as Haptics from "expo-haptics";
import { useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/color";
import { Icon } from "../Icon";
import { glow, smooth, useHover } from "./hover";
import { AnimatedPressable, useSpringPress } from "./Interactive";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid";
type Size = "sm" | "md" | "lg";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const HEIGHT: Record<Size, number> = { sm: 38, md: 48, lg: 56 };

export function Button({ label, onPress, variant = "primary", size = "md", loading, disabled, icon, fullWidth = true, style, testID }: ButtonProps) {
  const { colors, radius } = useTheme();
  const { hovered, hoverProps } = useHover();
  const press = useSpringPress();

  // Com o mouse por cima (web/desktop) cada variante ganha um tom um pouco mais forte; no celular nada muda.
  const palette = {
    primary: { bg: hovered ? colors.primaryPressed : colors.primary, fg: colors.onPrimary },
    secondary: { bg: hovered ? colors.border : colors.surfaceAlt, fg: colors.text },
    ghost: { bg: hovered ? colors.primarySoft : "transparent", fg: colors.primary },
    danger: { bg: colors.negativeSoft, fg: colors.negative },
    dangerSolid: { bg: colors.negative, fg: "#FFFFFF" },
  }[variant];
  const inactive = disabled || loading;

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      {...hoverProps}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        if (Platform.OS !== "web") void Haptics.selectionAsync();
        onPress?.();
      }}
      style={[
        styles.base,
        smooth,
        {
          backgroundColor: palette.bg,
          height: HEIGHT[size],
          borderRadius: radius.md,
          opacity: inactive ? 0.55 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          paddingHorizontal: size === "sm" ? 14 : 20,
        },
        hovered && !inactive && (variant === "primary" || variant === "dangerSolid") ? glow(withAlpha(variant === "primary" ? colors.primary : colors.negative, 0.4)) : null,
        press.style,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} color={palette.fg} /> : null}
          <Text variant={size === "sm" ? "bodySm" : "body"} weight="600" style={{ color: palette.fg }}>
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});

export function IconButton({
  icon,
  onPress,
  label,
  tone = "default",
  size = 40,
  badge,
}: {
  icon: string;
  onPress?: () => void;
  label: string;
  tone?: "default" | "primary" | "danger";
  size?: number;
  badge?: number;
}) {
  const { colors, radius } = useTheme();
  const { hovered, hoverProps } = useHover();
  const [pressed, setPressed] = useState(false);
  const press = useSpringPress(0.88);
  const fg = tone === "primary" ? colors.primary : tone === "danger" ? colors.negative : colors.text;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
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
          width: size,
          height: size,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed || hovered ? colors.surfaceAlt : "transparent",
        },
        smooth,
        press.style,
      ]}
    >
      <Icon name={icon} size={22} color={fg} />
      {badge ? (
        <View style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.negative, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
          <Text variant="caption" style={{ color: "#fff", fontSize: 10, lineHeight: 12 }} weight="700">
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}
