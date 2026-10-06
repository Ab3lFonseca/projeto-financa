import { useState } from "react";
import { Platform, type ViewStyle } from "react-native";
import { CSS_EASE } from "./motion";

/**
 * Estado de "mouse por cima" (web e desktop). No celular `hovered` fica sempre falso, então nada muda no toque.
 * Uso: `const { hovered, hoverProps } = useHover();` e espalhar `{...hoverProps}` no Pressable.
 */
export function useHover() {
  const [hovered, setHovered] = useState(false);
  return { hovered, hoverProps: { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) } };
}

const web = Platform.OS === "web";

/** Transição suave de cor, borda e sombra ao passar o mouse (só web; no celular não existe e é ignorado). */
export const smooth = (web
  ? { transitionProperty: "background-color, border-color, box-shadow, opacity, color", transitionDuration: "180ms", transitionTimingFunction: CSS_EASE }
  : {}) as ViewStyle;

/** Transição só do deslocamento (setas e ícones que "andam" no hover). Fica separada para não brigar com a mola do toque. */
export const smoothMove = (web ? { transitionProperty: "transform", transitionDuration: "200ms", transitionTimingFunction: CSS_EASE } : {}) as ViewStyle;

/** Anel suave ao redor de um campo em foco (só web; no celular o foco já tem o cursor e o teclado). */
export const focusRing = (color: string): ViewStyle => (web ? ({ boxShadow: `0 0 0 4px ${color}` } as ViewStyle) : {});

/** Clareia um bloco colorido (ex.: cartão de crédito) com o mouse por cima, com transição (só web). */
export const brighten = (on: boolean): ViewStyle =>
  (web ? { filter: on ? "brightness(1.08)" : "brightness(1)", transitionProperty: "filter", transitionDuration: "180ms", transitionTimingFunction: CSS_EASE } : {}) as ViewStyle;

/** Brilho suave ao redor de um elemento com o mouse por cima (só web). */
export const glow = (color: string): ViewStyle => (web ? ({ boxShadow: `0 6px 22px ${color}` } as ViewStyle) : {});
