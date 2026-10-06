import { describe, expect, it } from "vitest";
import { resolveTheme } from "./presets";
import { buildGlobalCss } from "./web-global";

describe("CSS global da web", () => {
  const palette = resolveTheme("purple", null, "dark").palette;
  const css = buildGlobalCss(palette);

  it("usa as cores do tema (foco, rolagem e seleção) e não cores fixas", () => {
    expect(css).toContain(`outline: 2px solid ${palette.accent}`);
    expect(css).toContain(palette.border);
    expect(css).toContain(palette.textFaint);
  });

  it("o anel de foco aparece só por teclado (:focus-visible) e os campos de texto ficam de fora", () => {
    expect(css).toContain("[tabindex]:focus-visible");
    expect(css).toContain("input:focus-visible, textarea:focus-visible { outline: none !important; }");
    expect(css).not.toMatch(/(^|[^-])\[tabindex\]:focus\s*\{/);
  });

  it("respeita 'reduzir movimento'", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition-duration: 0.01ms !important");
    expect(css).toContain("animation-duration: 0.01ms !important");
  });

  it("é CSS bem formado (chaves balanceadas) em todos os temas", () => {
    for (const id of ["light", "dark", "blue", "purple", "green", "red"] as const) {
      const text = buildGlobalCss(resolveTheme(id, null, "light").palette);
      expect(text.split("{").length).toBe(text.split("}").length);
    }
  });
});
