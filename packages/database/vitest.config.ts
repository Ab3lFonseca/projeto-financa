import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // PGlite sobe um Postgres em WASM; a primeira migration pode levar alguns segundos.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
