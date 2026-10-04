import { z } from "zod";
import { isISODate, startOfMonth } from "../dates";
import { MAX_CENTS } from "../money";

export const uuid = z.uuid();
/** "YYYY-MM-DD" (data de calendário válida, sem fuso). */
export const isoDate = z.string().refine(isISODate, "Data inválida (use AAAA-MM-DD)");
/** Instante ISO 8601 em UTC, como retornado pelo servidor. */
export const timestamp = z.string();

export const cents = z.number().int().min(-MAX_CENTS).max(MAX_CENTS);
export const positiveCents = z.number().int().min(1, "O valor deve ser maior que zero").max(MAX_CENTS);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida (use #RRGGBB)");
export const iconName = z.string().regex(/^[a-z0-9-]{1,40}$/, "Ícone inválido");

// eslint-disable-next-line no-control-regex
const ANY_CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;

/** Texto de uma linha: normaliza Unicode, troca controles por espaço, colapsa espaços, apara. */
export const singleLine = (max: number, min = 1) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(ANY_CONTROL, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min, min === 1 ? "Campo obrigatório" : `Mínimo de ${min} caracteres`).max(max, `Máximo de ${max} caracteres`));

/** Texto multilinha (observações): remove controles exceto quebra de linha. */
export const multiLine = (max: number) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(CONTROL_EXCEPT_NEWLINE, "").replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(max, `Máximo de ${max} caracteres`));

export const boolQuery = z.enum(["true", "false"]).transform((v) => v === "true");

/** "a,b,c" → ["a","b","c"] validando cada item. */
export const csvList = <T extends z.ZodType<unknown, string>>(item: T, maxItems = 50) =>
  z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(item).max(maxItems));

/** "2026-10" ou "2026-10-17" → "2026-10-01". */
export const monthParam = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "Mês inválido (use AAAA-MM)")
  .transform((s) => (s.length === 7 ? `${s}-01` : s))
  .refine(isISODate, "Mês inválido")
  .transform(startOfMonth);

export const cursorQuery = z.object({
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const pageMeta = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const listOf = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), page: pageMeta });

export const idParam = z.object({ id: uuid });

export const okResponse = z.object({ ok: z.literal(true) });

/** Formato único de erro em toda a API. */
export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponse>;
