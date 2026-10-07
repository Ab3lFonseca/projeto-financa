import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { accessStrip } from "@/lib/access";
import { useMe } from "@/lib/auth/AuthProvider";
import type { TrialMeter } from "@/lib/trialMeter";
import { withAlpha } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";

/** Gotas de suor no máximo; quantas aparecem depende de `meter.sweat`. */
const DROPS = 3;

/** Uma gota de suor: nasce na borda de baixo da barra, escorre uns pixels e some. Pequenininha, só para dar a ideia. `scale` aumenta tudo no cartão grande. */
function SweatDrop({ index, left, period, barHeight, scale }: { index: number; left: `${number}%`; period: number; barHeight: number; scale: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    // cada gota começa em um momento diferente do ciclo, para não pingarem juntas
    t.value = withDelay((period / DROPS) * index, withRepeat(withTiming(1, { duration: period, easing: Easing.in(Easing.quad) }), -1, false));
    return () => cancelAnimation(t);
  }, [index, period, t]);
  const fall = 9 * scale;
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? t.value / 0.15 : 1 - Math.max(0, (t.value - 0.55) / 0.45),
    transform: [{ translateY: t.value * fall }, { scale: 0.7 + 0.3 * Math.min(1, t.value * 3) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", top: barHeight - 2, left, width: 3 * scale, height: 4.5 * scale, borderRadius: 2 * scale, borderTopLeftRadius: 1.5 * scale, borderTopRightRadius: 1.5 * scale, backgroundColor: "#7DD3FC" }, style]}
    />
  );
}

/**
 * Barra de progressão do teste: enche conforme os dias passam e muda do verde ao vermelho (cada vez mais escuro perto do fim). Na segunda metade
 * do teste começa a estremecer de leve, e nos últimos dias "sua" (gotinhas escorrem da barra). Só a barra se mexe, nunca o texto. Respeita
 * "reduzir movimento": sem tremor e sem suor, só a cor. No cartão do Início (`big`) ela é mais grossa e o tremor e o suor são um pouco maiores.
 */
function TrialMeterBar({ meter, big = false }: { meter: TrialMeter; big?: boolean }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  const height = big ? 14 : 6;
  const scale = big ? 1.6 : 1;
  const moving = !reduce && meter.shake > 0;
  useEffect(() => {
    if (!moving) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    // quanto mais perto do fim, mais rápido treme (de ~1,2 s por ciclo até ~0,45 s)
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 1200 - 750 * meter.shake, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [moving, meter.shake, t]);
  const amp = (0.35 + 1.45 * meter.shake) * scale; // px: de quase nada a ~1,8 px (~2,9 px no cartão grande)
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.sin(t.value * Math.PI * 2 * 5) * amp }, { translateY: Math.sin(t.value * Math.PI * 2 * 7 + 1) * amp * 0.35 }],
  }));
  const fill = Math.max(0.04, meter.progress); // no primeiro dia ainda aparece um tiquinho
  const drops = reduce ? 0 : Math.round(meter.sweat * DROPS + (meter.sweat > 0 ? 0.4 : 0));
  const period = 1900 - 900 * meter.sweat;
  return (
    <Animated.View style={[{ height, marginTop: big ? 12 : 8 }, shakeStyle]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(meter.progress * 100) }} accessibilityLabel="Progresso do teste grátis">
      <View style={{ height, borderRadius: height / 2, backgroundColor: withAlpha(colors.text, 0.12), overflow: "hidden" }}>
        <View style={{ width: `${fill * 100}%`, height, borderRadius: height / 2, backgroundColor: meter.color }} />
      </View>
      {Array.from({ length: drops }, (_, i) => (
        // as gotas escorrem perto da ponta da barra, espalhadas
        <SweatDrop key={i} index={i} period={period} barHeight={height} scale={scale} left={`${Math.max(4, fill * 100 - 3 - i * 9)}%`} />
      ))}
    </Animated.View>
  );
}

/**
 * Aviso do teste grátis, em duas versões:
 *  - `strip` (padrão): faixa fina e fixa sob o cabeçalho das telas principais, com a barra e o botão de assinar;
 *  - `hero`: cartão grande no alto do Início, para chamar atenção (título, explicação, barra grossa e botão cheio).
 * No modo somente leitura avisa, e para quem pagou uma vez avisa perto do fim. Quem está em dia, cortesia, administrador e o beta não veem nada.
 * A regra do texto e da cor está em `accessStrip` (lib/access.ts) e `trialMeter` (lib/trialMeter.ts).
 */
export function TrialStrip({ variant = "strip" }: { variant?: "strip" | "hero" }) {
  const { entitlements } = useMe();
  const { colors, radius } = useTheme();
  const info = accessStrip(entitlements.access, entitlements.billingEnforced, entitlements.trialDays);
  if (!info) return null;
  const palette = {
    info: { bg: colors.primarySoft, fg: colors.primary },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    negative: { bg: colors.negativeSoft, fg: colors.negative },
  }[info.tone];
  const subscribe = () => router.push("/subscription" as never);

  if (variant === "hero") {
    return (
      <View accessibilityRole="summary" style={{ padding: 16, gap: 4, borderRadius: radius.lg, backgroundColor: palette.bg, borderWidth: 1, borderColor: withAlpha(palette.fg, 0.35) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={info.icon} size={18} color={palette.fg} />
          <Text variant="caption" weight="700" style={{ color: palette.fg, letterSpacing: 0.6 }}>
            {info.tone === "negative" ? "SOMENTE LEITURA" : info.meter ? "TESTE GRÁTIS" : "SEU PLANO"}
          </Text>
        </View>
        <Text variant="heading" weight="700">
          {info.title}
        </Text>
        <Text variant="bodySm" tone="muted">
          {info.detail}
        </Text>
        {info.meter ? <TrialMeterBar meter={info.meter} big /> : null}
        <View style={{ marginTop: 12 }}>
          <Button label={info.cta} icon="crown" onPress={subscribe} />
        </View>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${info.text}. ${info.cta}`}
      onPress={subscribe}
      style={{ marginHorizontal: 16, marginBottom: info.meter ? 10 : 4, paddingTop: 8, paddingBottom: info.meter ? 14 : 8, paddingLeft: 12, paddingRight: 8, borderRadius: radius.md, backgroundColor: palette.bg }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name={info.icon} size={16} color={palette.fg} />
        <Text variant="bodySm" weight="600" style={{ flex: 1, color: palette.fg }} numberOfLines={2}>
          {info.text}
        </Text>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: palette.fg }}>
          <Text variant="caption" weight="700" style={{ color: colors.onPrimary }}>
            {info.cta}
          </Text>
        </View>
      </View>
      {info.meter ? (
        <View style={{ paddingRight: 4 }}>
          <TrialMeterBar meter={info.meter} />
        </View>
      ) : null}
    </Pressable>
  );
}
