import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Pacotes do workspace são TypeScript puro: precisam ser embutidos no bundle.
  noExternal: [/^@app\//],
  // Dependências nativas/ESM puras ficam externas e vêm do node_modules da imagem.
  external: ["pg", "pg-native", "pino-pretty"],
  banner: {
    // Alguns pacotes CJS embutidos usam require/__dirname.
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
