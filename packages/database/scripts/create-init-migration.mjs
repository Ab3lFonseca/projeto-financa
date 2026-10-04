// Gera a migration de ESTRUTURA (tabelas, enums, índices, FKs) a partir do schema.prisma,
// sem precisar de banco de dados. Rode UMA vez; depois use `prisma migrate dev` para mudanças.
//
// A migration de constraints/RLS (20261004000100_...) é escrita à mão e deve rodar depois desta,
// por isso a pasta usa um timestamp anterior (20261004000000).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = join("prisma", "migrations", "20261004000000_init");
const file = join(dir, "migration.sql");

if (existsSync(file)) {
  console.error(`Já existe ${file}. Não vou sobrescrever uma migration existente.`);
  console.error("Para mudar o schema depois do primeiro deploy, use: pnpm migrate:dev");
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
execSync(`pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output "${file}"`, {
  stdio: "inherit",
});
console.log(`Migration de estrutura gerada em ${file}`);
