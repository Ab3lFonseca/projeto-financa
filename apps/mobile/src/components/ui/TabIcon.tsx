import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { motion } from "./motion";
import { TAB_METRICS } from "./tabBarMetrics";

const W = 54;
const H = TAB_METRICS.icon;

/**
 * Ícone da barra de abas. A aba ativa ganha uma "pílula" na cor de destaque que cresce com uma mola e o ícone sobe um
 * pouco; ao trocar de aba a pílula some na antiga e aparece na nova. A altura é a mesma do ícone padrão (28),
 * então a barra não muda de tamanho.
 */
export function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const { colors } = useTheme();
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, motion.spring);
  }, [focused, progress]);
  const pill = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: 0.55 + 0.45 * progress.value }, { scaleY: 0.7 + 0.3 * progress.value }],
  }));
  const glyph = useAnimatedStyle(() => ({ transform: [{ translateY: -1 * progress.value }, { scale: 1 + 0.08 * progress.value }] }));
  return (
    <View style={{ width: W, height: H, alignItems: "center", justifyContent: "center" }}>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", width: W, height: H, borderRadius: H / 2, backgroundColor: colors.accentSoft }, pill]} />
      <Animated.View style={glyph}>
        <Icon name={name} size={23} color={color} strokeWidth={focused ? 2.4 : 2} />
      </Animated.View>
    </View>
  );
}
