import { useEffect, useMemo } from "react";
import { Platform, useWindowDimensions, View, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { mix } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";
import { logoCells, type PixelCell } from "./pixelShapes";

const web = Platform.OS === "web";
/** `filter` só existe na web; no celular o desenho fica sem desfoque (continua suave, de tão apagado). */
const blur = (px: number) => (web ? ({ filter: `blur(${px}px)` } as ViewStyle) : null);

const BAR_ALPHA = { 1: 0.55, 2: 0.8, 3: 1 } as const;

function Cells({ cells, bg, bar }: { cells: PixelCell[]; bg: (gradient: number) => string; bar: string }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1 1">
      {cells.map((c, i) => {
        const fill = c.tone === 0 ? bg(c.gradient) : bar;
        const opacity = c.alpha * (c.tone === 0 ? 0.8 : BAR_ALPHA[c.tone]);
        // `rotation`/`origin` geram um atributo DOM inválido na web; o `transform` em texto vale igual nas duas plataformas.
        const transform = c.rotate === 0 ? undefined : `rotate(${c.rotate.toFixed(1)} ${(c.x + c.size / 2).toFixed(4)} ${(c.y + c.size / 2).toFixed(4)})`;
        return <Rect key={i} x={c.x} y={c.y} width={c.size} height={c.size} fill={fill} opacity={opacity} transform={transform} />;
      })}
    </Svg>
  );
}

/**
 * A logo do Finança no fundo do app: desfocada e se desfazendo em pixels (os da direita se soltam, giram e somem), com os estilhaços
 * derivando devagar. Só decoração (não recebe toques) e bem apagada, para nunca atrapalhar a leitura. `intensity` multiplica a opacidade.
 */
export function PixelLogoBackdrop({ intensity = 1 }: { intensity?: number }) {
  const { colors, scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const { solid, shards } = useMemo(() => {
    const all = logoCells(24, 11, 0.34);
    return { solid: all.filter((c) => !c.shard), shards: all.filter((c) => c.shard) };
  }, []);

  const size = Math.min(Math.max(width, height) * 0.95, 780);
  const second = colors.accent === colors.primary ? mix(colors.primary, "#7C3AED", 0.6) : colors.accent;
  const bg = (g: number) => mix(colors.primary, second, g);
  const bar = scheme === "dark" ? "#FFFFFF" : mix(colors.primary, "#FFFFFF", 0.55);

  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce, t]);
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: size * 0.018 * t.value }, { translateY: -size * 0.012 * t.value }, { rotate: `${1.2 * t.value}deg` }] }));

  const frame = { position: "absolute" as const, width: size, height: size, right: -size * 0.2, bottom: -size * 0.16 };
  const base = (scheme === "dark" ? 0.15 : 0.1) * intensity;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", opacity: base }}>
      <View style={[frame, blur(web ? 3.2 : 0)]}>
        <Cells cells={solid} bg={bg} bar={bar} />
      </View>
      <Animated.View style={[frame, blur(web ? 1 : 0), drift]}>
        <Cells cells={shards} bg={bg} bar={bar} />
      </Animated.View>
    </View>
  );
}
