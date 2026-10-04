import type { Prisma, PrismaClient } from "./generated/prisma/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executa `fn` numa transação em nome de um usuário, com Row Level Security ATIVO:
 * a transação passa a rodar como o papel `app_user` (que não ignora RLS) e o
 * `app.user_id` é fixado para o usuário. Qualquer consulta fora desse escopo
 * retorna zero linhas, mesmo que um filtro por user_id seja esquecido na API.
 *
 * Use em TODO caminho de requisição de usuário. Jobs e rotinas administrativas
 * usam o cliente direto (papel dono) e DEVEM filtrar por user_id explicitamente.
 *
 * `SET LOCAL` vale só até o fim da transação, então é seguro com pgbouncer/Supavisor.
 */
export async function withUser<T>(
  prisma: PrismaClient,
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(userId)) {
    throw new Error("withUser: userId inválido");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx.$executeRaw`SET LOCAL ROLE app_user`;
    return fn(tx);
  });
}
