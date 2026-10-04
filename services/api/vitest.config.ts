import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Um único Postgres compartilhado; cada teste usa usuários próprios (dados isolados).
    fileParallelism: true,
    pool: "forks",
  },
});
