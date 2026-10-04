import type { z } from "zod";
import { Errors } from "./errors";

/** Cursores são opacos para o cliente: JSON em base64url, validado ao decodificar. */
export function encodeCursor(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.success) return parsed.data;
  } catch {
    /* cai no erro abaixo */
  }
  throw Errors.badRequest("Cursor de paginação inválido", { code: "INVALID_CURSOR" });
}

/** Pega `limit + 1` linhas para saber se há próxima página sem fazer COUNT. */
export function slicePage<T>(rows: T[], limit: number): { items: T[]; hasMore: boolean } {
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
}
