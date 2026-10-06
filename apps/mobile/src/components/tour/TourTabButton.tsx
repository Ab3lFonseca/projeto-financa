import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { AnimatedPressable, useSpringPress } from "@/components/ui/Interactive";
import { smooth, useHover } from "@/components/ui/hover";
import { TAB_METRICS } from "@/components/ui/tabBarMetrics";
import { useTourTarget } from "@/lib/tour/registry";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  id: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityState?: { selected?: boolean };
  accessibilityLabel?: string;
  testID?: string;
  onPress?: (e: never) => void;
  onLongPress?: (e: never) => void;
  [rest: string]: unknown;
};

/**
 * Botão de uma aba da barra inferior que também se registra como destacável pelo tutorial. Repassa só o que a barra de abas
 * precisa (toque, toque longo, estado selecionado, rótulo); o visual vem dos filhos e do `style` que a própria barra entrega.
 * Ganha o mesmo acabamento do resto do app: fundo arredondado com o mouse por cima (nas abas não selecionadas) e mola ao tocar.
 */
export function TourTabButton({ id, children, style, accessibilityState, accessibilityLabel, testID, onPress, onLongPress }: Props) {
  const ref = useTourTarget(id);
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const press = useSpringPress(0.94);
  const selected = !!accessibilityState?.selected;
  return (
    // Folga só em cima e embaixo (conta da altura da barra) e 1 px nas laterais: celulares estreitos (320 px) precisam de toda a largura para "Transações".
    <View ref={ref} collapsable={false} style={{ flex: 1, paddingVertical: TAB_METRICS.hoverInset, paddingHorizontal: 1 }}>
      <AnimatedPressable
        accessibilityRole="tab"
        accessibilityState={accessibilityState}
        aria-selected={selected}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        onPress={onPress as never}
        onLongPress={onLongPress as never}
        {...hoverProps}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[{ flex: 1 }, style, { paddingHorizontal: 0, borderRadius: 16, backgroundColor: hovered && !selected ? colors.surfaceAlt : "transparent" }, smooth, press.style]}
      >
        {children}
      </AnimatedPressable>
    </View>
  );
}
