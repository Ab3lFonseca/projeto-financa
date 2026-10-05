import { useState } from "react";
import { Platform, type ViewStyle } from "react-native";

/**
 * Estado de "mouse por cima" (web e desktop). No celular `hovered` fica sempre falso, então nada muda no toque.
 * Uso: `const { hovered, hoverProps } = useHover();` e espalhar `{...hoverProps}` no Pressable.
 */
export function useHover() {
  const [hovered, setHovered] = useState(false);
  return { hovered, hoverProps: { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) } };
}

/** Transição suave de cor ao passar o mouse (só web; no celular não existe e é ignorado). */
export const smooth = (Platform.OS === "web" ? { transitionProperty: "background-color, border-color, opacity", transitionDuration: "160ms" } : {}) as ViewStyle;
