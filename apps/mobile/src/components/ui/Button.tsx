import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { Text } from "./Text";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.surfaceAlt, fg: colors.text },
    ghost: { bg: "transparent", fg: colors.primary },
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
      onPressIn={() => (scale.value = withSpring(0.97, { damping: 18, stiffness: 300 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 300 }))}
      onPress={() => {
        if (Platform.OS !== "web") void Haptics.selectionAsync();
        onPress?.();
      }}
      style={[
        styles.base,
        {
          backgroundColor: palette.bg,
          height: HEIGHT[size],
          borderRadius: radius.md,
          opacity: inactive ? 0.55 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          paddingHorizontal: size === "sm" ? 14 : 20,
        },
        animated,
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
  const fg = tone === "primary" ? colors.primary : tone === "danger" ? colors.negative : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.surfaceAlt : "transparent",
      })}
    >
      <Icon name={icon} size={22} color={fg} />
      {badge ? (
        <View style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.negative, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
          <Text variant="caption" style={{ color: "#fff", fontSize: 10, lineHeight: 12 }} weight="700">
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
