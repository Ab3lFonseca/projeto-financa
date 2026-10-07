import { useEffect, useMemo } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { mix } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";
import { InteractivePixelLogo, type CellPaint } from "./InteractivePixelLogo";
import { AMBIENT_AMPLITUDE, AMBIENT_LAYERS, AMBIENT_PERIOD, AMBIENT_PHASES, ambientLayerOf, LOGO_BREAK_FROM, LOGO_GRID, logoCells, type PixelCell } from "./pixelShapes";

const web = Platform.OS === "web";

const BAR_ALPHA = { 1: 0.55, 2: 0.8, 3: 1 } as const;

function Cells({ cells, paint, indexes }: { cells: PixelCell[]; paint: CellPaint[]; indexes: number[] }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1 1">
      {indexes.map((i) => {
        const c = cells[i]!;
        // `rotation`/`origin` geram um atributo DOM inválido na web; o `transform` em texto vale igual nas duas plataformas.
        const transform = c.rotate === 0 ? undefined : `rotate(${c.rotate.toFixed(1)} ${(c.x + c.size / 2).toFixed(4)} ${(c.y + c.size / 2).toFixed(4)})`;
        return <Rect key={i} x={c.x} y={c.y} width={c.size} height={c.size} fill={paint[i]!.fill} opacity={paint[i]!.alpha} transform={transform} />;
      })}
    </Svg>
  );
}

/** Um dos grupos de cubos no celular: a camada inteira sobe e desce e acende e apaga, em oposição aos grupos vizinhos. */
function AmbientLayer({ layer, cells, paint, indexes, box, t }: { layer: number; cells: PixelCell[]; paint: CellPaint[]; indexes: number[]; box: number; t: { value: number } }) {
  const phase = AMBIENT_PHASES[layer]!;
  const style = useAnimatedStyle(() => {
    const wave = Math.sin(t.value * 2 * Math.PI + phase);
    return { transform: [{ translateY: wave * AMBIENT_AMPLITUDE * box }], opacity: 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t.value * 2 * Math.PI + phase + Math.PI / 2)) };
  });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Cells cells={cells} paint={paint} indexes={indexes} />
    </Animated.View>
  );
}

/**
 * Celular nativo (sem mouse): os cubos ficam em 6 camadas que alternam sozinhas. Enquanto umas sobem, as vizinhas descem e o brilho se
 * alterna, com uma onda lenta atravessando a imagem. Só transformações (rodam na placa de vídeo), sem redesenhar nada.
 */
function AmbientCells({ cells, paint, box }: { cells: PixelCell[]; paint: CellPaint[]; box: number }) {
  const reduce = useReducedMotion();
  const groups = useMemo(() => {
    const out: number[][] = Array.from({ length: AMBIENT_LAYERS }, () => []);
    cells.forEach((c, i) => out[ambientLayerOf(c)]!.push(i));
    return out;
  }, [cells]);
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withRepeat(withTiming(1, { duration: AMBIENT_PERIOD * 1000, easing: Easing.linear }), -1, false);
  }, [reduce, t]);
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: box, height: box, left: "50%", top: "50%", marginLeft: -box / 2, marginTop: -box / 2 }}>
      {groups.map((indexes, layer) => (
        <AmbientLayer key={layer} layer={layer} cells={cells} paint={paint} indexes={indexes} box={box} t={t} />
      ))}
    </View>
  );
}

/**
 * A logo do Finança no fundo do app, CENTRALIZADA na tela, INTEIRA, grande e feita de muitíssimos cubos, desfocada. No computador fica parada e,
 * quando o mouse passa por cima, os cubos dentro de um círculo pequeno em volta do cursor saltam, giram e acendem, e depois voltam ao lugar. No celular, onde não há mouse, os cubos alternam sozinhos, subindo e descendo. Só decoração (não recebe toques) e
 * bem apagada, para nunca atrapalhar a leitura. `intensity` multiplica a opacidade.
 */
export function PixelLogoBackdrop({ intensity = 1 }: { intensity?: number }) {
  const { colors, scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  // A logo inteira, sem cubos soltos nem faltando.
  const cells = useMemo(() => logoCells(LOGO_GRID, 11, LOGO_BREAK_FROM), []);

  // Maior que a menor medida da tela (a logo "estoura" um pouco as bordas, sempre centralizada), com limites.
  const box = Math.round(Math.min(Math.max(Math.min(width, height) * 1.5, 520), 1200));
  const second = colors.accent === colors.primary ? mix(colors.primary, "#7C3AED", 0.6) : colors.accent;
  const bar = scheme === "dark" ? "#FFFFFF" : mix(colors.primary, "#FFFFFF", 0.55);
  const paint = useMemo<CellPaint[]>(
    () =>
      cells.map((c) => ({
        fill: c.tone === 0 ? mix(colors.primary, second, c.gradient) : bar,
        alpha: c.alpha * (c.tone === 0 ? 0.8 : BAR_ALPHA[c.tone]),
      })),
    [cells, colors.primary, second, bar],
  );

  const base = (scheme === "dark" ? 0.15 : 0.1) * intensity;
  // Onde o mouse passa, a opacidade sobe até aqui (para a reação aparecer), sem nunca ficar forte a ponto de competir com o texto.
  const peak = Math.min(0.75, Math.max(base * 3.5, 0.45));

  if (web) {
    return (
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <InteractivePixelLogo cells={cells} paint={paint} box={box} base={base} peak={peak} />
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", opacity: base }}>
      <AmbientCells cells={cells} paint={paint} box={box} />
    </View>
  );
}
