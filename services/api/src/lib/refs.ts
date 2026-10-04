import type { Account, Category, CreditCard } from "@app/database";
import { Errors } from "./errors";
import type { Tx } from "./db";

// As consultas rodam sob RLS: um id de outro usuário simplesmente "não existe" para quem pede,
// sem revelar que existe.

export async function requireAccount(
  tx: Tx,
  userId: string,
  id: string,
  opts: { allowArchived?: boolean; field?: string } = {},
): Promise<Account> {
  const account = await tx.account.findFirst({ where: { id, userId, deletedAt: null } });
  if (!account) throw Errors.unprocessable("Conta não encontrada", "ACCOUNT_NOT_FOUND", { field: opts.field ?? "accountId" });
  if (account.archivedAt && !opts.allowArchived) {
    throw Errors.unprocessable("Esta conta está arquivada", "ACCOUNT_ARCHIVED", { field: opts.field ?? "accountId" });
  }
  return account;
}

export async function requireCard(
  tx: Tx,
  userId: string,
  id: string,
  opts: { allowArchived?: boolean; field?: string } = {},
): Promise<CreditCard> {
  const card = await tx.creditCard.findFirst({ where: { id, userId, deletedAt: null } });
  if (!card) throw Errors.unprocessable("Cartão não encontrado", "CARD_NOT_FOUND", { field: opts.field ?? "cardId" });
  if (card.archivedAt && !opts.allowArchived) {
    throw Errors.unprocessable("Este cartão está arquivado", "CARD_ARCHIVED", { field: opts.field ?? "cardId" });
  }
  return card;
}

export async function requireCategory(
  tx: Tx,
  userId: string,
  id: string,
  expectedType?: "INCOME" | "EXPENSE",
  field = "categoryId",
): Promise<Category> {
  const category = await tx.category.findFirst({ where: { id, userId, deletedAt: null } });
  if (!category) throw Errors.unprocessable("Categoria não encontrada", "CATEGORY_NOT_FOUND", { field });
  if (expectedType && category.type !== expectedType) {
    throw Errors.unprocessable(
      expectedType === "EXPENSE" ? "Use uma categoria de despesa" : "Use uma categoria de receita",
      "CATEGORY_TYPE_MISMATCH",
      { field },
    );
  }
  return category;
}
