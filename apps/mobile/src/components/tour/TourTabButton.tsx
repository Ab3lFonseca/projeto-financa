import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTourTarget } from "@/lib/tour/registry";

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
 */
export function TourTabButton({ id, children, style, accessibilityState, accessibilityLabel, testID, onPress, onLongPress }: Props) {
  const ref = useTourTarget(id);
  return (
    <View ref={ref} collapsable={false} style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={accessibilityState}
        aria-selected={!!accessibilityState?.selected}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        onPress={onPress as never}
        onLongPress={onLongPress as never}
        style={[{ flex: 1 }, style]}
      >
        {children}
      </Pressable>
    </View>
  );
}
