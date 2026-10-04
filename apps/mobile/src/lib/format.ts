import { daysInMonth, diffDays, formatBRL, monthNamePt, monthShortPt, parseISODate, startOfMonth, type ISODate } from "@app/shared";

export { formatBRL };

const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAYS_LONG = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** 0 = domingo. */
export function weekdayOf(iso: ISODate): number {
  const { year, month, day } = parseISODate(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "4 out 2026" (compacto). */
export function formatDateShort(iso: ISODate): string {
  const { year, day } = parseISODate(iso);
  return `${day} ${monthShortPt(iso)} ${year}`;
}

/** "Hoje", "Ontem", "Amanhã" ou "4 out 2026". */
export function formatDateRelative(iso: ISODate, today: ISODate): string {
  const d = diffDays(today, iso);
  if (d === 0) return "Hoje";
  if (d === -1) return "Ontem";
  if (d === 1) return "Amanhã";
  return formatDateShort(iso);
}

/** Título de seção da lista de transações: "Hoje", "Ontem" ou "qua, 2 out". */
export function formatDayHeader(iso: ISODate, today: ISODate): string {
  const d = diffDays(today, iso);
  if (d === 0) return "Hoje";
  if (d === -1) return "Ontem";
  const { day, year } = parseISODate(iso);
  const base = `${WEEKDAYS_SHORT[weekdayOf(iso)]}, ${day} ${monthShortPt(iso)}`;
  return year === Number(today.slice(0, 4)) ? base : `${base} ${year}`;
}

export function formatDateLong(iso: ISODate): string {
  const { day, year } = parseISODate(iso);
  return `${WEEKDAYS_LONG[weekdayOf(iso)]}, ${day} de ${monthNamePt(iso)} de ${year}`;
}

/** "outubro de 2026". */
export function formatMonth(iso: ISODate): string {
  return `${monthNamePt(iso)} de ${parseISODate(iso).year}`;
}

/** "Out/2026" curto, para chips de mês. */
export function formatMonthShort(iso: ISODate): string {
  const first = startOfMonth(iso);
  const name = monthShortPt(first);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}/${first.slice(2, 4)}`;
}

/** Valores compactos para eixos de gráfico: 1.250 → "1,3 mil". Entrada em centavos. */
export function formatCompactBRL(cents: number): string {
  const reais = cents / 100;
  const abs = Math.abs(reais);
  const sign = reais < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(".", ",")} mil`;
  return `${sign}${Math.round(abs)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export { daysInMonth };

/** "+12,5%" / "-8,3%". */
export function formatPct(value: number | null, opts: { signed?: boolean } = {}): string {
  if (value === null) return "—";
  const text = `${Math.abs(value).toFixed(Math.abs(value) % 1 === 0 ? 0 : 1).replace(".", ",")}%`;
  if (opts.signed) return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}`;
  return text;
}

/** "agora", "há 5 min", "há 2 h", "há 3 d" ou a data, para "atualizado ..." (instante ISO → texto). */
export function formatAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "nunca";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return formatDateShort(iso.slice(0, 10));
}
