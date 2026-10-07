import { BADGES, BADGE_CATEGORIES } from "@app/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Consistência entre pacotes: o catálogo de insígnias (compartilhado) usa nomes de ícones que precisam existir no conjunto do app. Um nome
 * desconhecido desenha o ícone genérico de etiqueta, o que estragaria a insígnia sem nenhum erro. O app importa uma biblioteca de ícones que não roda
 * no Node, então a conferência é pelo texto do registro (`Icon.tsx`).
 */
describe("ícones das insígnias", () => {
  const source = readFileSync(join(__dirname, "..", "..", "..", "apps", "mobile", "src", "components", "Icon.tsx"), "utf8");
  const registered = new Set([...source.matchAll(/"([a-z0-9-]+)":\s*[A-Z]/g)].map((m) => m[1]));

  it("o registro de ícones foi lido (e não está vazio)", () => {
    expect(registered.size).toBeGreaterThan(100);
  });

  it("todo ícone de insígnia existe no conjunto do app", () => {
    expect(BADGES.filter((b) => !registered.has(b.icon)).map((b) => `${b.id}: ${b.icon}`)).toEqual([]);
  });

  it("todo ícone de assunto da galeria também", () => {
    expect(BADGE_CATEGORIES.filter((c) => !registered.has(c.icon)).map((c) => `${c.id}: ${c.icon}`)).toEqual([]);
  });
});
