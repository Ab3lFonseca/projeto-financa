import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Carrega .env do pacote e, se não houver, o da raiz do monorepo.
config({ path: [".env", "../../.env"], quiet: true });

// Migrations preferem a conexão direta; sem DIRECT_URL, usa a mesma do runtime.
// O placeholder só existe para `prisma generate`/`validate` rodarem sem banco (CI);
// qualquer comando que de fato conecte falha alto se a variável não estiver definida.
const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url },
});
