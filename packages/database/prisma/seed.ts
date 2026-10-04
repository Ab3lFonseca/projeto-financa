// Seed de dados GLOBAIS (catálogo de bancos). Idempotente.
// Categorias padrão NÃO entram aqui: são copiadas por usuário no cadastro
// (ver seedDefaultCategories em src/seed-user.ts).
import { config } from "dotenv";
import { BANKS } from "../src/catalog";
import { createPrismaClient } from "../src/client";

config({ path: [".env", "../../.env"], quiet: true });

// O seed escreve em `banks`, que o papel app_user só lê: use a conexão do dono.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Defina DIRECT_URL ou DATABASE_URL para rodar o seed.");
}

const prisma = createPrismaClient({ connectionString, maxConnections: 2 });

try {
  await prisma.$transaction(
    BANKS.map((bank) =>
      prisma.bank.upsert({
        where: { compeCode: bank.compeCode },
        update: { name: bank.name, shortName: bank.shortName },
        create: { compeCode: bank.compeCode, name: bank.name, shortName: bank.shortName },
      }),
    ),
  );
  console.log(`Seed concluído: ${BANKS.length} bancos.`);
} finally {
  await prisma.$disconnect();
}
