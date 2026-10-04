import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { DEFAULT_CATEGORIES } from "./catalog";

type CategoryDb = Pick<PrismaClient | Prisma.TransactionClient, "category">;

/**
 * Copia as categorias padrão para o usuário (chamar no primeiro login/cadastro).
 * Idempotente: (user_id, system_key) é único e duplicatas são ignoradas.
 * Retorna quantas categorias foram criadas.
 */
export async function seedDefaultCategories(db: CategoryDb, userId: string): Promise<number> {
  const result = await db.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      userId,
      systemKey: c.systemKey,
      type: c.type,
      name: c.name,
      icon: c.icon,
      color: c.color,
      sortOrder: c.sortOrder,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
