import * as Haptics from "expo-haptics";
import { useEffect, useId, useState } from "react";
import { Modal, Platform, Pressable, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, ZoomIn } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Confetti } from "@/components/art/Confetti";
import { Rocket } from "@/components/art/Rocket";
import { Sparkle } from "@/components/art/Sparkle";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/Controls";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { useCelebrationStore, type Celebration, type CelebrationKind } from "@/lib/celebrate";
import { useTheme } from "@/theme/ThemeProvider";

const GOLD = ["#FCD34D", "#F59E0B"] as const;
const LOOK: Record<CelebrationKind, { icon: string; colors: readonly [string, string]; rocket: boolean; confetti: "burst" | "rain" | null; auto: number | null }> = {
  goal: { icon: "trophy", colors: GOLD, rocket: true, confetti: "burst", auto: null },
  saved: { icon: "piggy-bank", colors: ["#34D399", "#059669"], rocket: false, confetti: "burst", auto: 4800 },
  badge: { icon: "gem", colors: ["#A78BFA", "#6D28D9"], rocket: false, confetti: "burst", auto: null },
  premium: { icon: "crown", colors: GOLD, rocket: true, confetti: "rain", auto: null },
  welcome: { icon: "sparkles", colors: ["#818CF8", "#7C3AED"], rocket: true, confetti: "rain", auto: null },
};

/** O foguete decola do pé da tela, deixando um rastro de fogo, e some no alto. */
function RocketLaunch() {
  const { height, width } = useWindowDimensions();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(120, withTiming(1, { duration: 1500, easing: Easing.in(Easing.cubic) }));
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : t.value > 0.92 ? (1 - t.value) / 0.08 : 1,
    transform: [{ translateY: -(height + 260) * t.value }, { translateX: Math.sin(t.value * 9) * 8 }],
  }));
  const id = `trail${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: width * 0.5 - 30, bottom: -20, alignItems: "center" }, style]}>
      <Rocket size={60} />
      <Svg width={26} height={190} viewBox="0 0 26 190" style={{ marginTop: -6 }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FDE047" stopOpacity="0.9" />
            <Stop offset="0.4" stopColor="#FB923C" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#EF4444" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="3" y="0" width="20" height="190" rx="10" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Emblema redondo com brilho pulsando e anéis que se expandem. */
function Emblem({ celebration }: { celebration: Celebration }) {
  const look = LOOK[celebration.kind];
  const reduce = useReducedMotion();
  const ring = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    ring.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) }), -1, false);
  }, [reduce, ring]);
  const ringA = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - ring.value), transform: [{ scale: 1 + 0.9 * ring.value }] }));
  const ringB = useAnimatedStyle(() => {
    const p = (ring.value + 0.5) % 1;
    return { opacity: 0.4 * (1 - p), transform: [{ scale: 1 + 0.9 * p }] };
  });
  const id = `em${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (celebration.emblem) return <View style={{ alignItems: "center", justifyContent: "center", minHeight: 150 }}>{celebration.emblem}</View>;
  return (
    <View style={{ width: 150, height: 150, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: look.colors[0] }, ringA]} />
      <Animated.View style={[{ position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: look.colors[1] }, ringB]} />
      <Animated.View entering={ZoomIn.delay(250).springify().damping(10)} style={{ width: 104, height: 104, borderRadius: 52, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.55)" }}>
        <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: "absolute" }}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={look.colors[0]} />
              <Stop offset="1" stopColor={look.colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
        </Svg>
        <Icon name={celebration.icon ?? look.icon} size={50} color="#FFFFFF" strokeWidth={2.2} />
      </Animated.View>
      <Sparkle size={20} color="#FDE68A" style={{ left: 8, top: 14 }} delay={200} />
      <Sparkle size={14} color="#FFFFFF" style={{ right: 10, top: 28 }} delay={700} duration={1500} />
      <Sparkle size={16} color="#FDE68A" style={{ right: 22, bottom: 18 }} delay={450} duration={2000} />
      <Sparkle size={10} color="#FFFFFF" style={{ left: 22, bottom: 30 }} delay={1000} duration={1400} />
    </View>
  );
}

function Panel({ celebration, onClose }: { celebration: Celebration; onClose: () => void }) {
  const { colors, radius } = useTheme();
  const look = LOOK[celebration.kind];
  const reduce = useReducedMotion();
  const [boom, setBoom] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    const burst = setTimeout(() => setBoom(true), look.rocket ? 850 : 120);
    const auto = look.auto ? setTimeout(onClose, look.auto) : null;
    return () => {
      clearTimeout(burst);
      if (auto) clearTimeout(auto);
    };
  }, [look.rocket, look.auto, onClose]);

  return (
    <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }} onPress={look.auto ? onClose : undefined} accessibilityLabel="Fechar comemoração">
      <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(200)} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(8,10,24,0.78)" }} />
      {boom && look.confetti ? <Confetti mode={look.confetti} count={look.confetti === "rain" ? 56 : 64} seed={celebration.id} /> : null}
      {!reduce && look.rocket ? <RocketLaunch /> : null}
      <Animated.View
        entering={ZoomIn.delay(look.rocket ? 650 : 80).springify().damping(14)}
        exiting={FadeOut.duration(160)}
        accessibilityRole="alert"
        style={{ width: "100%", maxWidth: 400, alignItems: "center", gap: 10, paddingHorizontal: 22, paddingBottom: 22, paddingTop: 6, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
      >
        <Emblem celebration={celebration} />
        <Text variant="title" align="center">
          {celebration.title}
        </Text>
        {celebration.amountCents !== undefined ? <Money cents={celebration.amountCents} variant="display" weight="700" tone="positive" animate sensitive={false} /> : null}
        {celebration.message ? (
          <Text tone="muted" align="center">
            {celebration.message}
          </Text>
        ) : null}
        {celebration.progressPct !== undefined ? (
          <View style={{ alignSelf: "stretch", gap: 6, marginTop: 4 }}>
            <ProgressBar value={celebration.progressPct} height={10} color={look.colors[1]} />
            <Text variant="caption" tone="muted" align="center">
              {Math.round(celebration.progressPct)}% da meta
            </Text>
          </View>
        ) : null}
        <View style={{ alignSelf: "stretch", gap: 8, marginTop: 8 }}>
          {celebration.actionLabel ? (
            <Button
              label={celebration.actionLabel}
              onPress={() => {
                onClose();
                celebration.onAction?.();
              }}
            />
          ) : null}
          <Button label={celebration.actionLabel ? "Fechar" : "Continuar"} variant={celebration.actionLabel ? "ghost" : "primary"} onPress={onClose} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Comemorações em tela cheia, uma de cada vez. Montada uma vez na raiz do app (ver `celebrate`). */
export function CelebrationHost() {
  const current = useCelebrationStore((s) => s.current);
  const dismiss = useCelebrationStore((s) => s.dismiss);
  if (!current) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <Panel key={current.id} celebration={current} onClose={dismiss} />
    </Modal>
  );
}
