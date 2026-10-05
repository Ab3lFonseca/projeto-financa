import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTourTarget } from "@/lib/tour/registry";

/**
 * Marca um trecho da tela como destacável pelo tutorial. Não muda o visual: é só um contêiner transparente
 * (`collapsable={false}` impede o Android de removê-lo da hierarquia, o que impossibilitaria medir a posição).
 */
export function TourTarget({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useTourTarget(id);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
