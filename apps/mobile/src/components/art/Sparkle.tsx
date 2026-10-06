import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

/** Estrela de quatro pontas (o "brilho"). */
export const SPARKLE_PATH = "M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z";

/**
 * Brilho que pisca: cresce, gira um pouco e some, em ciclos. Posicionado de forma absoluta (passe `style` com top/left). Com "reduzir movimento"
 * ligado no sistema, fica parado e visível.
 */
export function Sparkle({
  size = 14,
  color = "#FFFFFF",
  delay = 0,
  duration = 1800,
  style,
}: {
  size?: number;
  color?: string;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce, delay, duration, t]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.2 + 0.8 * t.value,
    transform: [{ scale: 0.5 + 0.65 * t.value }, { rotate: `${t.value * 50}deg` }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size, height: size }, style, animated]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={SPARKLE_PATH} fill={color} />
      </Svg>
    </Animated.View>
  );
}
