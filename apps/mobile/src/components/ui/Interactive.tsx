import { useState, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { smooth, smoothMove, useHover } from "./hover";
import { motion } from "./motion";

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Mola de toque: o item encolhe um pouco enquanto é pressionado e volta ao soltar. Roda na thread de UI,
 * igual no celular e na web. Uso: espalhar `onPressIn/onPressOut` e somar `style` num `AnimatedPressable`.
 */
export function useSpringPress(to: number = motion.pressScale) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      scale.value = withSpring(to, motion.spring);
    },
    onPressOut: () => {
      scale.value = withSpring(1, motion.spring);
    },
  };
}

/** Quanto o destaque de uma linha passa do conteúdo, para o ícone e a seta nunca encostarem na borda dele. */
export const ROW_BLEED = 8;

/**
 * Linha tocável dentro de um cartão. No hover (web) e no toque ela ganha um fundo arredondado que **sobra
 * `ROW_BLEED` px além do conteúdo** (margem negativa + preenchimento): o destaque fica respirando, sem encostar no
 * ícone, na seta nem nas bordas do cartão (o cartão tem 16 px de folga). Deixa 2 px de ar acima e abaixo, para não
 * colar nos divisores.
 */
export function PressableRow({
  onPress,
  children,
  label,
  style,
}: {
  onPress: () => void;
  children: (state: { hovered: boolean }) => ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const [pressed, setPressed] = useState(false);
  const press = useSpringPress(0.985);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...hoverProps}
      onPressIn={() => {
        setPressed(true);
        press.onPressIn();
      }}
      onPressOut={() => {
        setPressed(false);
        press.onPressOut();
      }}
      style={[
        {
          marginHorizontal: -ROW_BLEED,
          paddingHorizontal: ROW_BLEED,
          marginVertical: 2,
          borderRadius: 14,
          backgroundColor: pressed ? colors.border : hovered ? colors.surfaceAlt : "transparent",
        },
        smooth,
        press.style,
        style,
      ]}
    >
      {children({ hovered })}
    </AnimatedPressable>
  );
}

/** Seta "ir para": no hover (web) anda alguns pixels para a direita, como convite ao clique. */
export function GoChevron({ hovered }: { hovered?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[{ transform: [{ translateX: hovered ? 3 : 0 }] }, smoothMove]}>
      <Icon name="chevron-right" size={18} color={colors.textFaint} />
    </View>
  );
}
