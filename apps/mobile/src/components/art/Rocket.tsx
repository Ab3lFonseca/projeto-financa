import { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

/**
 * Foguete desenhado em SVG (aponta para cima). `fly` faz ele flutuar de leve e a chama pulsar. Gire com `style={{ transform: [{ rotate: "45deg" }] }}`
 * para apontar para o canto de cima, à direita.
 */
export function Rocket({ size = 56, fly = true, style }: { size?: number; fly?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce || !fly) return;
    t.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduce, fly, t]);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * t.value }] }));
  const flame = useAnimatedStyle(() => ({ opacity: 0.75 + 0.25 * t.value, transform: [{ scaleY: 0.85 + 0.4 * t.value }, { scaleX: 1 - 0.12 * t.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size * 1.25 }, style, bob]}>
      <Animated.View style={[{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", height: size * 0.5 }, flame]}>
        <Svg width={size * 0.4} height={size * 0.5} viewBox="0 0 24 30">
          <Defs>
            <LinearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FDE047" />
              <Stop offset="0.55" stopColor="#FB923C" />
              <Stop offset="1" stopColor="#EF4444" stopOpacity="0.1" />
            </LinearGradient>
          </Defs>
          <Path d="M12 0C18 7 22 12 19 20C17.5 25 14.5 28 12 30C9.5 28 6.5 25 5 20C2 12 6 7 12 0Z" fill="url(#flame)" />
        </Svg>
      </Animated.View>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, alignItems: "center" }}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <LinearGradient id="body" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#E2E8F0" />
              <Stop offset="0.5" stopColor="#FFFFFF" />
              <Stop offset="1" stopColor="#CBD5E1" />
            </LinearGradient>
          </Defs>
          {/* aletas */}
          <Path d="M19 36L7 51L20 48Z" fill="#EF4444" />
          <Path d="M45 36L57 51L44 48Z" fill="#EF4444" />
          {/* corpo */}
          <Path d="M32 3C41 11 45 23 45 37V47H19V37C19 23 23 11 32 3Z" fill="url(#body)" />
          {/* ponta */}
          <Path d="M32 3C36 7 38.7 11.5 40.2 16.5H23.8C25.3 11.5 28 7 32 3Z" fill="#EF4444" />
          {/* janela */}
          <Circle cx="32" cy="27" r="6.2" fill="#38BDF8" />
          <Circle cx="32" cy="27" r="6.2" fill="none" stroke="#94A3B8" strokeWidth="1.6" />
          <Circle cx="30" cy="25" r="1.8" fill="#FFFFFF" opacity="0.8" />
          {/* base do motor */}
          <Path d="M24 47H40L38 51H26Z" fill="#94A3B8" />
        </Svg>
      </View>
    </Animated.View>
  );
}
