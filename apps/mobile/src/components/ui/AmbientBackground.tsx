import { useEffect } from "react";
import { Platform, View, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/color";

const web = Platform.OS === "web";
/** No celular não há blur: muitas camadas concêntricas quase transparentes somam um degradê sem degraus visíveis. */
const LAYERS = 28;

/**
 * Mancha de luz suave que deriva devagar, como se respirasse.
 * Web: um círculo com `blur` de verdade. Celular: camadas concêntricas de opacidade mínima.
 */
function Orb({ color, size, dx, dy, duration, position }: { color: string; size: number; dx: number; dy: number; duration: number; position: { top?: number; bottom?: number; left?: number; right?: number } }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [duration, t]);
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: dx * t.value }, { translateY: dy * t.value }, { scale: 1 + 0.1 * t.value }] }));
  return (
    <Animated.View style={[{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center", ...position }, drift]}>
      {web ? (
        <View style={{ width: size * 0.7, height: size * 0.7, borderRadius: size, backgroundColor: withAlpha(color, 0.3), filter: "blur(70px)" } as ViewStyle} />
      ) : (
        Array.from({ length: LAYERS }).map((_, i) => {
          const s = size * (1 - i / LAYERS);
          return <View key={i} style={{ position: "absolute", width: s, height: s, borderRadius: s / 2, backgroundColor: withAlpha(color, 0.011) }} />;
        })
      )}
    </Animated.View>
  );
}

/** Fundo das telas de entrada: duas manchas de luz (cor principal e de destaque do tema) que derivam devagar. */
export function AmbientBackground() {
  const { colors } = useTheme();
  return (
    <>
      <Orb color={colors.primary} size={520} dx={46} dy={34} duration={15000} position={{ top: -200, left: -170 }} />
      <Orb color={colors.accent} size={460} dx={-40} dy={-30} duration={19000} position={{ bottom: -170, right: -150 }} />
    </>
  );
}
