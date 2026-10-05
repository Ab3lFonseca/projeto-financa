import { appearanceSchema, type CustomColors } from "@app/shared";
import { describe, expect, it } from "vitest";
import { contrast, ensureContrast, luminance, mix, normalizeHex, readableOn, withAlpha } from "./color";
import { contrastWarnings, DEFAULT_CUSTOM, derivePalette, legacyThemeFor, PRESET_BASES, resolveTheme, THEME_META } from "./presets";
import { darkPalette, lightPalette, type Palette } from "./tokens";

describe("cores", () => {
  it("normaliza hexadecimal (#abc, abc, minúsculas, espaços) e recusa o inválido", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex(" 4f46e5 ")).toBe("#4F46E5");
    expect(normalizeHex("#4F46E5")).toBe("#4F46E5");
    for (const bad of ["", "#12", "#12345", "#1234567", "vermelho", "#GGGGGG", "#12 456"]) expect(normalizeHex(bad), bad).toBeNull();
  });

  it("contraste segue os valores de referência do WCAG", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1); // cinza clássico: quase 4,5
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBe(0);
  });

  it("mistura, texto legível e alfa", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#102030", "#FFFFFF", 0)).toBe("#102030");
    expect(mix("#102030", "#FFFFFF", 1)).toBe("#FFFFFF");
    expect(readableOn("#000000")).toBe("#FFFFFF");
    expect(readableOn("#FFFFFF")).toBe("#0B0D14");
    expect(withAlpha("#FF8000", 0.5)).toBe("rgba(255,128,0,0.5)");
  });

  it("ensureContrast mantém a cor se já serve e ajusta (sem trocar de matiz) se não", () => {
    expect(ensureContrast("#4F46E5", "#FFFFFF", 3)).toBe("#4F46E5");
    const fixed = ensureContrast("#EEEEEE", "#FFFFFF", 3);
    expect(contrast(fixed, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    // contra dois fundos ao mesmo tempo
    const both = ensureContrast("#777777", ["#FFFFFF", "#000000"], 3);
    expect(Math.min(contrast(both, "#FFFFFF"), contrast(both, "#000000"))).toBeGreaterThanOrEqual(3);
  });
});

/** Regras que todo tema (pronto ou derivado) precisa cumprir para o app ser legível. */
function expectReadable(p: Palette, label: string, strictFaint: boolean, onColorMin = 4.5) {
  const pair = [p.bg, p.surface];
  for (const b of pair) {
    expect(contrast(p.text, b), `${label}: texto sobre ${b}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.textMuted, b), `${label}: texto secundário sobre ${b}`).toBeGreaterThanOrEqual(4.5);
    if (strictFaint) expect(contrast(p.textFaint, b), `${label}: texto discreto sobre ${b}`).toBeGreaterThanOrEqual(3);
  }
  expect(contrast(p.onPrimary, p.primary), `${label}: texto sobre a cor principal`).toBeGreaterThanOrEqual(onColorMin);
  expect(contrast(p.onAccent, p.accent), `${label}: texto sobre o destaque`).toBeGreaterThanOrEqual(onColorMin);
  for (const b of pair) {
    expect(contrast(p.primary, b), `${label}: cor principal sobre ${b}`).toBeGreaterThanOrEqual(3);
    expect(contrast(p.accent, b), `${label}: destaque sobre ${b}`).toBeGreaterThanOrEqual(3);
  }
}

describe("temas prontos", () => {
  it("todos os 8 temas existem na lista da tela e têm nome, emoji e descrição", () => {
    expect(THEME_META.map((t) => t.id)).toEqual(["system", "dark", "light", "blue", "purple", "green", "red", "custom"]);
    for (const t of THEME_META) {
      expect(t.label.length).toBeGreaterThan(2);
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(t.hint.length).toBeGreaterThan(5);
    }
  });

  it("claro e escuro continuam exatamente como eram, com o destaque igual à cor principal", () => {
    expect(resolveTheme("light", null, "dark").palette).toBe(lightPalette);
    expect(resolveTheme("dark", null, "light").palette).toBe(darkPalette);
    for (const p of [lightPalette, darkPalette]) {
      expect(p.accent).toBe(p.primary);
      // O tema escuro original usa texto branco sobre #6366F1 (4,47:1, a 0,03 do mínimo AA); não mudamos o visual atual por isso.
      expectReadable(p, "padrão", false, 4.4);
    }
  });

  it("automático segue o esquema do aparelho", () => {
    expect(resolveTheme("system", null, "dark")).toMatchObject({ scheme: "dark", palette: darkPalette });
    expect(resolveTheme("system", null, "light")).toMatchObject({ scheme: "light", palette: lightPalette });
  });

  it.each(["blue", "purple", "green", "red"] as const)("tema %s: escuro, legível e com destaque diferente da cor principal", (id) => {
    const { palette, scheme } = resolveTheme(id, null, "light");
    expect(scheme).toBe("dark");
    expect(palette.accent).not.toBe(palette.primary);
    expect(palette.bg).toBe(PRESET_BASES[id].background);
    expectReadable(palette, id, true);
  });

  it("o resultado é reaproveitado (mesmo objeto) para as mesmas cores", () => {
    expect(resolveTheme("blue", null, "light")).toBe(resolveTheme("blue", null, "dark"));
  });

  it("toda cor da paleta é um hexadecimal ou rgba válido (nada indefinido)", () => {
    for (const id of ["blue", "purple", "green", "red", "custom"] as const) {
      const { palette } = resolveTheme(id, DEFAULT_CUSTOM, "light");
      for (const [k, v] of Object.entries(palette)) expect(v, `${id}.${k}`).toMatch(/^(#[0-9A-F]{6}|rgba\(.+\))$/);
    }
  });
});

describe("tema personalizado", () => {
  it("o ponto de partida é válido, legível e sem avisos", () => {
    expect(appearanceSchema.safeParse({ preset: "custom", custom: DEFAULT_CUSTOM }).success).toBe(true);
    expectReadable(derivePalette(DEFAULT_CUSTOM).palette, "personalizado padrão", true);
    expect(contrastWarnings(DEFAULT_CUSTOM)).toEqual([]);
  });

  it("o esquema vem da luminância do fundo", () => {
    expect(derivePalette({ ...DEFAULT_CUSTOM, background: "#000000", surface: "#111111" }).scheme).toBe("dark");
    expect(derivePalette({ ...DEFAULT_CUSTOM, background: "#FFFFFF", surface: "#F0F0F0" }).scheme).toBe("light");
  });

  it("cor principal igual ao cartão é ajustada e avisada", () => {
    const custom: CustomColors = { background: "#FFFFFF", surface: "#FFFFFF", primary: "#FEFEFE", accent: "#FDFDFD" };
    expect(contrast(derivePalette(custom).palette.primary, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(contrastWarnings(custom).join(" ")).toMatch(/principal/);
    expect(contrastWarnings(custom).join(" ")).toMatch(/destaque/);
  });

  it("fundo escuro com cartões claros não tem texto único: o app avisa", () => {
    const custom: CustomColors = { background: "#000000", surface: "#FFFFFF", primary: "#4F46E5", accent: "#0891B2" };
    expect(contrastWarnings(custom).join(" ")).toMatch(/difícil de ler/);
  });

  // Gerador determinístico (mulberry32) para não depender de sorte.
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hex = (r: () => number, lo: number, hi: number) => `#${[0, 1, 2].map(() => (lo + Math.floor(r() * (hi - lo + 1))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const randomHex = (r: () => number) => hex(r, 0, 255);

  it("600 combinações aleatórias: sempre hexadecimal válido; legível sempre que fundo e cartão são do mesmo tipo; senão, com aviso", () => {
    const r = rng(2026);
    let coherent = 0;
    for (let i = 0; i < 600; i++) {
      // 1/3 com fundo e cartão escuros, 1/3 claros (o caso comum) e 1/3 totalmente aleatórios (inclui combinações ruins).
      const [lo, hi] = i % 3 === 0 ? [0, 60] : i % 3 === 1 ? [200, 255] : [0, 255];
      const custom: CustomColors = { background: hex(r, lo, hi), surface: hex(r, lo, hi), primary: randomHex(r), accent: randomHex(r) };
      const { palette } = derivePalette(custom);
      for (const [k, v] of Object.entries(palette)) expect(v, `${JSON.stringify(custom)} → ${k}`).toMatch(/^(#[0-9A-F]{6}|rgba\(.+\))$/);
      const similar = (luminance(custom.background) < 0.08 && luminance(custom.surface) < 0.08) || (luminance(custom.background) > 0.55 && luminance(custom.surface) > 0.55);
      if (similar) {
        coherent++;
        expectReadable(palette, JSON.stringify(custom), true);
      } else {
        // fora do caso comum, o app pelo menos avisa quando o texto não consegue ficar legível nos dois fundos
        const worst = Math.min(contrast(palette.text, palette.bg), contrast(palette.text, palette.surface));
        if (worst < 4.5) expect(contrastWarnings(custom).some((w) => /difícil de ler/.test(w)), JSON.stringify(custom)).toBe(true);
      }
    }
    expect(coherent).toBeGreaterThan(30); // o teste realmente exercitou o caso estrito
  });
});

describe("tema da conta (formato e compatibilidade)", () => {
  it("aceita todos os presets e exige as cores no personalizado", () => {
    for (const t of THEME_META) {
      const input = t.id === "custom" ? { preset: t.id, custom: DEFAULT_CUSTOM } : { preset: t.id };
      expect(appearanceSchema.safeParse(input).success, t.id).toBe(true);
    }
    expect(appearanceSchema.safeParse({ preset: "custom" }).success).toBe(false);
    expect(appearanceSchema.safeParse({ preset: "custom", custom: { ...DEFAULT_CUSTOM, primary: "azul" } }).success).toBe(false);
  });

  it("deriva o valor antigo (Sistema/Claro/Escuro) para quem usa versões anteriores", () => {
    expect(legacyThemeFor({ preset: "system" })).toBe("SYSTEM");
    expect(legacyThemeFor({ preset: "light" })).toBe("LIGHT");
    expect(legacyThemeFor({ preset: "dark" })).toBe("DARK");
    for (const p of ["blue", "purple", "green", "red"] as const) expect(legacyThemeFor({ preset: p })).toBe("DARK");
    expect(legacyThemeFor({ preset: "custom", custom: { ...DEFAULT_CUSTOM, background: "#000000", surface: "#111111" } })).toBe("DARK");
    expect(legacyThemeFor({ preset: "custom", custom: DEFAULT_CUSTOM })).toBe("LIGHT");
  });
});
