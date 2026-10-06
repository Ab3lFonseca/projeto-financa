/**
 * Medidas da barra de abas, em um lugar só. A altura da barra é a **soma** de tudo o que há dentro dela; já deu defeito duas vezes
 * (rótulos cortados pela metade) quando se mudou uma peça sem refazer a conta. Mexeu em qualquer valor? A altura acompanha sozinha,
 * e `tabBarMetrics.test.ts` confere a soma.
 */
export const TAB_METRICS = {
  /** Altura da área do ícone (a pílula da aba ativa tem a mesma altura). */
  icon: 28,
  /** Espaço entre o ícone e o rótulo. */
  labelGap: 2,
  /** Altura da linha do rótulo (fonte 10, com folga). Fixa: não deixa o texto ser espremido nem crescer com a fonte do sistema. */
  labelLine: 12,
  /** Preenchimento de cada lado que a própria barra de abas dá ao botão (react-navigation). */
  itemPadding: 5,
  /** Folga de cada lado em volta do botão, para o fundo do hover não encostar nas vizinhas (TourTabButton). */
  hoverInset: 2,
  /** Espaço acima dos botões. */
  barPaddingTop: 6,
  /** Linha fina no topo da barra. */
  border: 1,
} as const;

/** Altura total da barra de abas; `bottomInset` é a área segura de baixo (barra de gestos) ou o respiro na web. */
export function tabBarHeight(bottomInset: number): number {
  const m = TAB_METRICS;
  return m.border + m.barPaddingTop + m.hoverInset * 2 + m.itemPadding * 2 + m.icon + m.labelGap + m.labelLine + Math.max(0, bottomInset);
}
