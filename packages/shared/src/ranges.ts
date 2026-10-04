import { addMonths, diffDays, endOfMonth, startOfMonth, type ISODate } from "./dates";

export type ReportRange = "this_month" | "last_3_months" | "last_6_months" | "this_year" | "custom";

export const REPORT_RANGES: readonly ReportRange[] = [
  "this_month",
  "last_3_months",
  "last_6_months",
  "this_year",
  "custom",
];

/** Limite do período personalizado (protege o banco de varreduras gigantes). */
export const MAX_CUSTOM_RANGE_DAYS = 366 * 3;

export type ResolvedRange = { range: ReportRange; from: ISODate; to: ISODate };

/**
 * Converte o período escolhido no app em datas concretas (inclusivas), relativas a `today`
 * no fuso do usuário. "Últimos N meses" = N meses de calendário, incluindo o mês corrente.
 */
export function resolveRange(
  range: ReportRange,
  today: ISODate,
  custom?: { from?: ISODate; to?: ISODate },
): ResolvedRange {
  switch (range) {
    case "this_month":
      return { range, from: startOfMonth(today), to: endOfMonth(today) };
    case "last_3_months":
      return { range, from: startOfMonth(addMonths(today, -2)), to: endOfMonth(today) };
    case "last_6_months":
      return { range, from: startOfMonth(addMonths(today, -5)), to: endOfMonth(today) };
    case "this_year":
      return { range, from: `${today.slice(0, 4)}-01-01`, to: endOfMonth(today) };
    case "custom": {
      if (!custom?.from || !custom.to) throw new RangeError("Período personalizado exige from e to");
      if (custom.from > custom.to) throw new RangeError("from deve ser anterior a to");
      if (diffDays(custom.from, custom.to) > MAX_CUSTOM_RANGE_DAYS) throw new RangeError("Período muito longo");
      return { range, from: custom.from, to: custom.to };
    }
  }
}

/** Granularidade padrão dos gráficos: semanas para períodos de até ~1 mês, senão meses. */
export function granularityFor(from: ISODate, to: ISODate): "day" | "week" | "month" {
  const days = diffDays(from, to) + 1;
  if (days <= 35) return "week";
  return "month";
}
