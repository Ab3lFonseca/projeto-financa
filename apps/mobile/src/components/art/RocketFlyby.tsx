import { useEffect, useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { flybyPlan, type Flight } from "@/lib/rocketFlyby";
import { Rocket } from "./Rocket";

/** Um foguete cruzando o quadro da esquerda para a direita, acelerando, e sumindo na borda (some também aos poucos, para não "cortar" seco). */
function Flyer({ flight, width }: { flight: Flight; width: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withDelay(flight.delayMs, withTiming(1, { duration: flight.durationMs, easing: Easing.in(Easing.quad) }));
  }, [flight, t]);
  const run = width + flight.size * 4; // sai de fora, à esquerda, e termina fora, à direita
  const style = useAnimatedStyle(() => ({
    opacity: t.value <= 0 ? 0 : t.value < 0.08 ? t.value / 0.08 : t.value > 0.88 ? Math.max(0, (1 - t.value) / 0.12) : 1,
    transform: [
      { translateX: -flight.size * 2 + t.value * run },
      { translateY: t.value * flight.tiltDeg * 1.6 },
      { rotate: `${90 + flight.tiltDeg * 0.6}deg` }, // o desenho aponta para cima: 90° aponta para a direita
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: `${flight.topPct}%`, opacity: 0 }, style]}>
      <Rocket size={flight.size} fly={false} />
    </Animated.View>
  );
}

/**
 * Cena de foguetes no fundo de um quadro: de 3 a 5, um depois do outro, cruzando bem rápido e sumindo. Toca uma vez, quando a tela abre. Fica atrás
 * do texto (o quadro corta o que passar da borda). Com "reduzir movimento" ligado não aparece nada.
 */
export function RocketFlyby() {
  const reduce = useReducedMotion();
  // O quadro nunca é mais largo que a janela: a distância percorrida é a da janela (o excesso é cortado pela borda do quadro). Evita depender de
  // medir o quadro, que atrasaria a cena.
  const { width } = useWindowDimensions();
  const plan = useMemo(() => flybyPlan(), []);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      {plan.map((f, i) => (
        <Flyer key={i} flight={f} width={width} />
      ))}
    </View>
  );
}
