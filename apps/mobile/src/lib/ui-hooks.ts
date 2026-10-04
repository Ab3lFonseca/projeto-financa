import { addMonths, endOfMonth, startOfMonth, type ISODate } from "@app/shared";
import { useEffect, useState } from "react";

/** Valor "atrasado": útil para busca digitada (evita uma consulta por tecla). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export type PeriodPreset = "this_month" | "last_month" | "last_3_months" | "this_year" | "all" | "custom";

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  this_month: "Este mês",
  last_month: "Mês passado",
  last_3_months: "3 meses",
  this_year: "Este ano",
  all: "Tudo",
  custom: "Personalizado",
};

/** Converte o período escolhido em datas (inclusivas); `all` não filtra por data. */
export function periodRange(preset: PeriodPreset, today: ISODate, custom?: { from?: ISODate; to?: ISODate }): { from?: ISODate; to?: ISODate } {
  switch (preset) {
    case "this_month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last_month": {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case "last_3_months":
      return { from: startOfMonth(addMonths(today, -2)), to: endOfMonth(today) };
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: endOfMonth(today) };
    case "custom":
      return { from: custom?.from, to: custom?.to };
    default:
      return {};
  }
}
