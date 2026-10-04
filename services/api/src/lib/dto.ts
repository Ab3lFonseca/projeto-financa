import { toISODate } from "@app/shared";

/** DATE do Postgres (00:00 UTC) → "YYYY-MM-DD". */
export const dateOut = (d: Date): string => toISODate(d);

export const tsOut = (d: Date): string => d.toISOString();

/** BigInt/Decimal do banco → number. Valores são limitados a R$ 10 bi, bem abaixo de 2^53. */
export function num(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(n)) throw new RangeError("Valor monetário fora do intervalo seguro");
  return n;
}
