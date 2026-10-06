import { useMemo } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { mix } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";
import { InteractivePixelLogo, type CellPaint } from "./InteractivePixelLogo";
import { logoCells, type PixelCell } from "./pixelShapes";

const web = Platform.OS === "web";

const BAR_ALPHA = { 1: 0.55, 2: 0.8, 3: 1 } as const;

/** Parada (celular): a logo desenhada em SVG, sem movimento. */
function StaticCells({ cells, paint, box }: { cells: PixelCell[]; paint: CellPaint[]; box: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: box, height: box, left: "50%", top: "50%", marginLeft: -box / 2, marginTop: -box / 2 }}>
      <Svg width="100%" height="100%" viewBox="0 0 1 1">
        {cells.map((c, i) => {
          // `rotation`/`origin` geram um atributo DOM inválido na web; o `transform` em texto vale igual nas duas plataformas.
          const transform = c.rotate === 0 ? undefined : `rotate(${c.rotate.toFixed(1)} ${(c.x + c.size / 2).toFixed(4)} ${(c.y + c.size / 2).toFixed(4)})`;
          return <Rect key={i} x={c.x} y={c.y} width={c.size} height={c.size} fill={paint[i]!.fill} opacity={paint[i]!.alpha} transform={transform} />;
        })}
      </Svg>
    </View>
  );
}

/**
 * A logo do Finança no fundo do app, CENTRALIZADA na tela: desfocada e se desfazendo em pixels (os da direita se soltam, giram e somem). Fica
 * parada; na web, quando o mouse passa por cima da imagem, os cubos perto do cursor saltam, giram e acendem, e depois voltam ao lugar.
 * Só decoração (não recebe toques) e bem apagada, para nunca atrapalhar a leitura. `intensity` multiplica a opacidade.
 */
export function PixelLogoBackdrop({ intensity = 1 }: { intensity?: number }) {
  const { colors, scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  // Os que passam da borda direita da logo ficavam cortados (invisíveis): nem entram na conta.
  const cells = useMemo(() => logoCells(24, 11, 0.34).filter((c) => c.x < 1), []);

  // Do tamanho da menor medida da tela (a logo aparece inteira, de celular a monitor), com limites.
  const box = Math.round(Math.min(Math.max(Math.min(width, height) * 1.1, 360), 760));
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
      <StaticCells cells={cells} paint={paint} box={box} />
    </View>
  );
}
