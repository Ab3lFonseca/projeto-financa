import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes unitários da lógica pura do app (formatação, escalas dos gráficos, fila offline).
// Não carregam React Native: módulos nativos são simulados nos próprios testes.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
