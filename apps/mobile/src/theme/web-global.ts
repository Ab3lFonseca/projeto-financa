import type { Palette } from "./tokens";
import { withAlpha } from "./color";

/**
 * CSS global da versão web, gerado a partir da paleta (assim acompanha qualquer tema):
 *  - anel de foco **só para quem navega pelo teclado** (`:focus-visible`), na cor de destaque do tema;
 *  - barras de rolagem finas e discretas, na cor das bordas;
 *  - cor da seleção de texto e suavização de fonte;
 *  - "reduzir movimento": transições e animações CSS viram instantâneas.
 */
export function buildGlobalCss(p: Palette): string {
  return `
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }
::selection { background: ${withAlpha(p.accent, 0.35)}; }
* { scrollbar-width: thin; scrollbar-color: ${p.border} transparent; }
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: ${p.border}; border-radius: 8px; border: 3px solid transparent; background-clip: content-box; }
*::-webkit-scrollbar-thumb:hover { background: ${p.textFaint}; background-clip: content-box; }
[tabindex]:focus-visible, a:focus-visible, button:focus-visible { outline: 2px solid ${p.accent} !important; outline-offset: 2px; }
input:focus-visible, textarea:focus-visible { outline: none !important; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
`.trim();
}
