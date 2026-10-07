import { useEffect, useId, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon } from "@/components/Icon";
import { AnimatedPressable, useSpringPress } from "@/components/ui/Interactive";
import { Text } from "@/components/ui/Text";
import { mix } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";
import { flightById, type FlightId } from "@/lib/noveltyLook";
import { Flyby } from "./Flyby";
import { Rocket } from "./Rocket";
import { Sparkle } from "./Sparkle";

export type BannerTone = "primary" | "positive" | "warning" | "violet" | "slate";

/** Cores do degradê de cada tom. `primary` segue o tema do app; os outros são fixos (escuros o bastante para o texto branco ter contraste). */
export function bannerGradient(tone: BannerTone, primary: string, accent: string): [string, string] {
  switch (tone) {
    case "primary":
      return [mix(primary, "#000000", 0.12), accent === primary ? mix(primary, "#7C3AED", 0.55) : accent];
    case "positive":
      return ["#047857", "#0D9488"];
    case "warning":
      return ["#B45309", "#D97706"];
    case "violet":
      return ["#6D28D9", "#9333EA"];
    case "slate":
      return ["#1E293B", "#4338CA"];
  }
}

/** Posições (em %) e tempos dos brilhos espalhados no banner. */
const SPARKLES: { left: string; top: string; size: number; delay: number; duration: number; color: string }[] = [
  { left: "8%", top: "14%", size: 16, delay: 0, duration: 1900, color: "#FFFFFF" },
  { left: "22%", top: "70%", size: 10, delay: 600, duration: 1500, color: "#FDE68A" },
  { left: "42%", top: "10%", size: 9, delay: 1100, duration: 1700, color: "#FFFFFF" },
  { left: "70%", top: "76%", size: 14, delay: 300, duration: 2100, color: "#FDE68A" },
  { left: "86%", top: "18%", size: 12, delay: 900, duration: 1600, color: "#FFFFFF" },
  { left: "92%", top: "58%", size: 8, delay: 1400, duration: 1400, color: "#FFFFFF" },
  { left: "56%", top: "86%", size: 7, delay: 200, duration: 1800, color: "#FFFFFF" },
];

/**
 * Banner de destaque: degradê, mensagem centralizada, brilhos que piscam e, se quiser, um foguete. É a "arte" das telas de Novidades, Termos de Uso e
 * Política de Privacidade. O texto é sempre branco sobre o degradê. Entra com um fade curto.
 */
export function HeroBanner({
  tone = "primary",
  icon,
  title,
  subtitle,
  badge,
  rocket = false,
  flight,
  flightRepeatMs,
  colors: gradientColors,
  compact = false,
  children,
  style,
  delay = 0,
  onPress,
  hint,
}: {
  tone?: BannerTone;
  icon?: string;
  title: string;
  subtitle?: string;
  /** Etiqueta pequena acima do título (ex.: "Em breve"). */
  badge?: string;
  rocket?: boolean;
  /** A animação PRÓPRIA do quadro: de 3 a 5 desenhos cruzam o fundo, bem rápido, quando ele aparece (mural de Novidades). */
  flight?: FlightId;
  /** Repete a passagem a cada tantos ms (os quadros mais abaixo da lista também mostram a sua cena). Sem isto, toca só uma vez. */
  flightRepeatMs?: number;
  /** Cores do degradê (substituem as do `tone`): cada novidade tem a sua. */
  colors?: [string, string];
  compact?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Atraso da entrada (para vários banners entrarem em cascata). */
  delay?: number;
  /** Torna o banner tocável (mola ao tocar). */
  onPress?: () => void;
  /** Linha pequena no pé do banner, ex.: "Toque para ver como vai funcionar". */
  hint?: string;
}) {
  const { colors, radius } = useTheme();
  const gradientId = `hero${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [from, to] = gradientColors ?? bannerGradient(tone, colors.primary, colors.accent);
  const reduce = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduce || !rocket) return;
    drift.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce, rocket, drift]);
  const rocketStyle = useAnimatedStyle(() => ({ transform: [{ translateX: 8 * drift.value }, { translateY: -10 * drift.value }, { rotate: "45deg" }] }));
  const press = useSpringPress(0.985);
  const Wrapper = onPress ? AnimatedPressable : Animated.View;
  const wrapperProps = onPress ? { accessibilityRole: "button" as const, accessibilityLabel: title, onPress, onPressIn: press.onPressIn, onPressOut: press.onPressOut } : {};

  return (
    <Wrapper entering={FadeInDown.delay(delay).duration(420)} {...(wrapperProps as object)} style={[{ borderRadius: radius.xl, overflow: "hidden" }, onPress ? press.style : null, style]}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />
        </Svg>
        {/* círculos de luz, para dar profundidade */}
        <View style={{ position: "absolute", right: -60, top: -60, width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(255,255,255,0.09)" }} />
        <View style={{ position: "absolute", left: -50, bottom: -70, width: 170, height: 170, borderRadius: 85, backgroundColor: "rgba(255,255,255,0.07)" }} />
        {SPARKLES.map((s, i) => (
          <Sparkle key={i} size={s.size} color={s.color} delay={s.delay} duration={s.duration} style={{ left: s.left as never, top: s.top as never }} />
        ))}
        {/* a cena própria do quadro cruzando o fundo (3 a 5 desenhos), por trás do texto */}
        {flight ? <Flyby kind={flightById(flight)} height={compact ? 175 : 270} repeatMs={flightRepeatMs} startDelayMs={delay + 350} /> : null}
      </View>

      {rocket ? (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", right: 14, top: 10, opacity: 0.95 }, rocketStyle]}>
          <Rocket size={compact ? 34 : 44} />
        </Animated.View>
      ) : null}

      <View style={{ alignItems: "center", gap: compact ? 6 : 10, paddingVertical: compact ? 20 : 30, paddingHorizontal: 22 }}>
        {icon ? (
          <View style={{ width: compact ? 44 : 56, height: compact ? 44 : 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} size={compact ? 22 : 28} color="#FFFFFF" />
          </View>
        ) : null}
        {badge ? (
          <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" }}>
            <Text variant="caption" weight="700" style={{ color: "#FFFFFF", letterSpacing: 0.4 }}>
              {badge}
            </Text>
          </View>
        ) : null}
        <Text variant={compact ? "heading" : "title"} align="center" style={{ color: "#FFFFFF" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" align="center" style={{ color: "rgba(255,255,255,0.88)", maxWidth: 420 }}>
            {subtitle}
          </Text>
        ) : null}
        {children}
        {hint ? (
          <Text variant="caption" align="center" style={{ color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Wrapper>
  );
}
