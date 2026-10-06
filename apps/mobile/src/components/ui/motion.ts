import { Easing } from "react-native-reanimated";

/**
 * Tempos e curvas do app. Tudo o que se move (entrada de telas, toque, abas, folhas, avisos) usa estes valores,
 * para o movimento parecer uma coisa só. O Reanimated já respeita "reduzir movimento" do sistema (as animações
 * viram instantâneas); o CSS da web faz o mesmo em `theme/web-global.ts`.
 */
export const motion = {
  /** Retorno de toque e hover. */
  fast: 140,
  /** Entradas e saídas comuns. */
  base: 240,
  /** Movimentos maiores (folhas, números, gráficos). */
  slow: 420,
  /** Atraso entre itens de uma lista que entra em cascata. */
  stagger: 55,
  /** Sai rápido e pousa devagar: curva "easeOutQuint". */
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  /** Mola curta, sem ficar quicando. */
  spring: { damping: 18, stiffness: 240, mass: 0.8 },
  /** Quanto um item encolhe enquanto é pressionado. */
  pressScale: 0.97,
} as const;

/** A mesma curva, em CSS (hover na web). */
export const CSS_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
