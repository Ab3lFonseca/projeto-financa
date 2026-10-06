// Configuração MÍNIMA do Prisma só para aplicar migrations em produção (`prisma migrate deploy`), dentro do contêiner da API.
// Não importa nada (a imagem de runtime não leva `prisma/config` nem `dotenv`) e lê a conexão do ambiente:
// DIRECT_URL (conexão direta/Session pooler, preferida para migrations) ou, se não houver, DATABASE_URL.
// Para desenvolvimento use `prisma.config.ts` (carrega .env).
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error("Defina DATABASE_URL (ou DIRECT_URL) para aplicar as migrations.");
}

export default {
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
};
