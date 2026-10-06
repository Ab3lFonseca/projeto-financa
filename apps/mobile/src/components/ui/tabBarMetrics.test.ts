import { describe, expect, it } from "vitest";
import { TAB_METRICS, tabBarHeight } from "./tabBarMetrics";

describe("altura da barra de abas", () => {
  it("é a soma de tudo o que cabe dentro dela: ícone, rótulo, preenchimentos, folga do hover, borda e topo", () => {
    const m = TAB_METRICS;
    const conteudo = m.icon + m.labelGap + m.labelLine;
    expect(tabBarHeight(0)).toBe(m.border + m.barPaddingTop + m.hoverInset * 2 + m.itemPadding * 2 + conteudo);
    // Valor atual, para qualquer mudança nas medidas aparecer aqui de propósito.
    expect(tabBarHeight(0)).toBe(63);
  });

  it("o botão sobra espaço para ícone + rótulo inteiros (o rótulo não é espremido)", () => {
    const m = TAB_METRICS;
    const alturaDoBotao = tabBarHeight(0) - m.border - m.barPaddingTop - m.hoverInset * 2; // o que a barra entrega ao Pressable
    const necessario = m.itemPadding * 2 + m.icon + m.labelGap + m.labelLine;
    expect(alturaDoBotao).toBeGreaterThanOrEqual(necessario);
  });

  it("a área segura de baixo soma por cima, sem nunca encolher a barra", () => {
    expect(tabBarHeight(34)).toBe(tabBarHeight(0) + 34);
    expect(tabBarHeight(-10)).toBe(tabBarHeight(0));
  });
});
