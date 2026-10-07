import { useEffect, useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { flybyPlan, type Flight } from "@/lib/rocketFlyby";
import type { FlightKind, Motion } from "@/lib/noveltyLook";
import { Rocket } from "./Rocket";

/**
 * Um desenho cruzando o quadro de uma ponta à outra, acelerando, e sumindo na borda (some também aos poucos, para não "cortar" seco). A trajetória
 * (`motion`) é o que diferencia as novidades: da esquerda para a direita, ao contrário, subindo, caindo, na diagonal ou ondulando.
 */
function Flyer({ flight, kind, width, height }: { flight: Flight; kind: FlightKind; width: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withDelay(flight.delayMs, withTiming(1, { duration: flight.durationMs, easing: Easing.in(Easing.quad) }));
  }, [flight, t]);
  const s = flight.size;
  const motion: Motion = kind.motion;
  const spin = kind.spin;
  const isRocket = kind.icon === "rocket-art";
  // para onde o foguete aponta (graus no sentido horário, a partir de "para cima")
  const heading = motion === "ltr" || motion === "wave" ? 90 : motion === "rtl" ? 270 : motion === "rise" ? 0 : motion === "fall" ? 180 : motion === "diag-up" ? (Math.atan2(width, height) * 180) / Math.PI : 180 - (Math.atan2(width, height) * 180) / Math.PI;
  const tilt = flight.tiltDeg;
  const runX = width + s * 4;
  const runY = height + s * 4;
  const style = useAnimatedStyle(() => {
    const p = t.value;
    let x = 0;
    let y = 0;
    if (motion === "ltr") {
      x = -s * 2 + p * runX;
      y = p * tilt * 1.6;
    } else if (motion === "rtl") {
      x = width + s * 2 - p * runX;
      y = p * tilt * 1.6;
    } else if (motion === "wave") {
      x = -s * 2 + p * runX;
      y = Math.sin(p * Math.PI * 4 + flight.leftPct) * (height * 0.16);
    } else if (motion === "rise") {
      y = height + s * 2 - p * runY;
    } else if (motion === "fall") {
      y = -s * 2 + p * runY;
    } else if (motion === "diag-up") {
      x = -s * 2 + p * runX;
      y = height + s * 2 - p * runY;
    } else {
      x = -s * 2 + p * runX;
      y = -s * 2 + p * runY;
    }
    const rot = isRocket ? heading + (motion === "ltr" || motion === "rtl" ? tilt * 0.6 : 0) : spin ? p * 540 : (motion === "ltr" || motion === "rtl" ? tilt * 0.6 : 0);
    return {
      opacity: p <= 0 ? 0 : p < 0.08 ? p / 0.08 : p > 0.88 ? Math.max(0, (1 - p) / 0.12) : 1,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${rot}deg` }],
    };
  });
  const vertical = motion === "rise" || motion === "fall";
  const place = vertical ? { left: `${flight.leftPct}%` as const, top: 0 } : motion === "diag-up" || motion === "diag-down" ? { left: 0, top: 0 } : { left: 0, top: `${flight.topPct}%` as const };
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", opacity: 0 }, place, style]}>
      {isRocket ? <Rocket size={s} fly={false} /> : <Icon name={kind.icon} size={Math.round(s * 0.95)} color={kind.tint} strokeWidth={2.2} />}
    </Animated.View>
  );
}

/**
 * Cena de passagem no fundo de um quadro: de 3 a 5 desenhos, um depois do outro, cruzando bem rápido e sumindo. Toca quando o quadro aparece (depois de
 * `startDelayMs`) e, se `repeatMs` vier, de novo a cada tantos ms (para os quadros mais abaixo na lista também mostrarem a sua cena quando a pessoa
 * chegar neles). Fica atrás do texto (o quadro corta o que passar da borda). Com "reduzir movimento" ligado não aparece nada.
 */
export function Flyby({ kind, height, repeatMs, startDelayMs = 0 }: { kind: FlightKind; height: number; repeatMs?: number; startDelayMs?: number }) {
  const reduce = useReducedMotion();
  // O quadro nunca é mais largo que a janela: a distância percorrida é a da janela (o excesso é cortado pela borda do quadro). Evita depender de medir
  // o quadro, que atrasaria a cena.
  const { width } = useWindowDimensions();
  const [round, setRound] = useState(0);
  const [started, setStarted] = useState(startDelayMs <= 0);
  const plan = useMemo(() => flybyPlan(), [round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (started) return;
    const t = setTimeout(() => setStarted(true), startDelayMs);
    return () => clearTimeout(t);
  }, [started, startDelayMs]);
  useEffect(() => {
    if (reduce || !repeatMs || !started) return;
    // cada quadro repete num ritmo um pouco diferente, para não passarem todos juntos
    const t = setTimeout(() => setRound((r) => r + 1), repeatMs * (0.85 + Math.random() * 0.4));
    return () => clearTimeout(t);
  }, [reduce, repeatMs, started, round]);
  if (reduce || !started) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      {plan.map((f, i) => (
        <Flyer key={`${round}-${i}`} flight={f} kind={kind} width={width} height={height} />
      ))}
    </View>
  );
}
