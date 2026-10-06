import { useEffect, useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { seeded } from "./pixelShapes";

export const CONFETTI_COLORS = ["#FACC15", "#F472B6", "#38BDF8", "#34D399", "#A78BFA", "#FB923C", "#FFFFFF"] as const;

type Piece = { dx: number; dy: number; fall: number; rot: number; size: number; color: string; delay: number; duration: number; round: boolean; sway: number };

/** Gera as peças de uma explosão de confete (sempre as mesmas para a mesma semente). `rain`: caem de cima da tela; senão, saem do centro. */
export function confettiPieces(count: number, width: number, height: number, mode: "burst" | "rain", seed = 3, colors: readonly string[] = CONFETTI_COLORS): Piece[] {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => {
    const a = rand();
    const b = rand();
    const c = rand();
    const d = rand();
    const color = colors[Math.floor(c * colors.length) % colors.length]!;
    if (mode === "rain") {
      return { dx: (a - 0.5) * width, dy: -height * 0.1, fall: height * (0.9 + b * 0.35), rot: 360 * (c + 1), size: 6 + d * 7, color, delay: Math.floor(a * 900), duration: 2300 + Math.floor(b * 1400), round: d > 0.7, sway: (b - 0.5) * 70 };
    }
    const angle = a * Math.PI * 2;
    const dist = (0.18 + b * 0.5) * Math.min(width, height);
    return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist - dist * 0.25, fall: height * (0.12 + d * 0.2), rot: 540 * (c - 0.3), size: 6 + d * 7, color, delay: Math.floor(b * 250), duration: 1500 + Math.floor(a * 1100), round: d > 0.7, sway: 0 };
  });
}

function Particle({ piece, mode, originY }: { piece: Piece; mode: "burst" | "rain"; originY: number }) {
  const p = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(piece.delay, withTiming(1, { duration: piece.duration, easing: mode === "burst" ? Easing.out(Easing.cubic) : Easing.linear }));
  }, [reduce, piece, mode, p]);
  const style = useAnimatedStyle(() => {
    const t = p.value;
    // Explosão: sobe/abre no começo e cai com a gravidade no fim. Chuva: cai reto, balançando.
    const x = piece.dx * (mode === "burst" ? t : 1) + (mode === "rain" ? Math.sin(t * 7) * piece.sway : 0);
    const y = mode === "burst" ? piece.dy * t + piece.fall * t * t : piece.dy + piece.fall * t;
    return {
      opacity: t === 0 ? 0 : t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
      transform: [{ translateX: x }, { translateY: y + originY }, { rotate: `${piece.rot * t}deg` }, { scaleY: Math.cos(t * 10) * 0.5 + 0.7 }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: "50%", top: 0, width: piece.size, height: piece.round ? piece.size : piece.size * 0.55, borderRadius: piece.round ? piece.size : 2, backgroundColor: piece.color }, style]}
    />
  );
}

/**
 * Confete em tela cheia (só decoração, não recebe toques). `burst` explode do centro; `rain` cai de cima. Cada peça roda na thread de UI.
 * Com "reduzir movimento" ligado no sistema, não aparece (a mensagem continua).
 */
export function Confetti({ count = 46, mode = "burst", seed = 3, colors = CONFETTI_COLORS }: { count?: number; mode?: "burst" | "rain"; seed?: number; colors?: readonly string[] }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const pieces = useMemo(() => confettiPieces(count, width, height, mode, seed, colors), [count, width, height, mode, seed, colors]);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      {pieces.map((piece, i) => (
        <Particle key={i} piece={piece} mode={mode} originY={mode === "burst" ? height * 0.42 : 0} />
      ))}
    </View>
  );
}
