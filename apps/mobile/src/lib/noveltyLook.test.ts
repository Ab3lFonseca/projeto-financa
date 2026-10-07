import { describe, expect, it } from "vitest";
import { contrastWithWhite, FLIGHTS, flightById, hslToHex, hueGap, noveltyGradient, relLuminance, type Motion } from "./noveltyLook";

describe("animações de novidade", () => {
  it("cada animação tem id único e a combinação ícone + movimento + giro também é única (nenhuma é igual a outra)", () => {
    expect(new Set(FLIGHTS.map((f) => f.id)).size).toBe(FLIGHTS.length);
    expect(new Set(FLIGHTS.map((f) => `${f.icon}|${f.motion}|${f.spin}`)).size).toBe(FLIGHTS.length);
  });

  it("todo movimento é conhecido e os sete aparecem (há variedade de trajetórias)", () => {
    const known: Motion[] = ["ltr", "rtl", "rise", "fall", "diag-up", "diag-down", "wave"];
    for (const f of FLIGHTS) expect(known, f.id).toContain(f.motion);
    for (const m of known) expect(FLIGHTS.some((f) => f.motion === m), m).toBe(true);
  });

  it("as cores dos desenhos são #RRGGBB claras (aparecem sobre o degradê escuro)", () => {
    for (const f of FLIGHTS) {
      expect(f.tint, f.id).toMatch(/^#[0-9A-F]{6}$/);
      expect(relLuminance(f.tint), f.id).toBeGreaterThan(0.45);
    }
  });

  it("o quadro do topo continua com o foguete cruzando da esquerda para a direita", () => {
    expect(flightById("rocket-ltr")).toMatchObject({ icon: "rocket-art", motion: "ltr" });
  });
});

describe("cores das novidades", () => {
  it("hslToHex converte as cores de referência", () => {
    expect(hslToHex(0, 1, 0.5)).toBe("#FF0000");
    expect(hslToHex(120, 1, 0.5)).toBe("#00FF00");
    expect(hslToHex(240, 1, 0.5)).toBe("#0000FF");
    expect(hslToHex(0, 0, 1)).toBe("#FFFFFF");
    expect(hslToHex(360, 1, 0.5)).toBe("#FF0000"); // volta ao vermelho
    expect(hslToHex(-120, 1, 0.5)).toBe("#0000FF"); // matiz negativo dá a volta
  });

  it("o texto branco tem contraste de pelo menos 4,5 sobre o degradê, em QUALQUER matiz (inclusive amarelos e verdes)", () => {
    for (let hue = 0; hue < 360; hue++) {
      const [from, to] = noveltyGradient(hue);
      expect(from, `${hue}`).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrastWithWhite(from), `${hue} início`).toBeGreaterThanOrEqual(4.5);
      expect(contrastWithWhite(to), `${hue} fim`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o degradê é de fato colorido (não vira cinza) e tem dois tons diferentes", () => {
    for (const hue of [0, 60, 120, 200, 280]) {
      const [from, to] = noveltyGradient(hue);
      const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(Math.max(...ch(to)) - Math.min(...ch(to)), `${hue} fim`).toBeGreaterThan(30);
      expect(Math.max(...ch(from)) - Math.min(...ch(from)), `${hue} início`).toBeGreaterThan(30);
      expect(from, `${hue}`).not.toBe(to);
    }
  });

  it("matizes diferentes dão degradês diferentes", () => {
    expect(noveltyGradient(10)).not.toEqual(noveltyGradient(200));
  });

  it("distância entre matizes é circular", () => {
    expect(hueGap(350, 10)).toBe(20);
    expect(hueGap(0, 180)).toBe(180);
    expect(hueGap(90, 90)).toBe(0);
    expect(hueGap(-10, 10)).toBe(20);
  });
});
