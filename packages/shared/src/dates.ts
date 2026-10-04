// Datas "de calendário" são strings ISO "YYYY-MM-DD", sem fuso e sem hora.
// Toda aritmética usa UTC para ser determinística (independe do fuso da máquina).

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseISODate(iso: ISODate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(iso);
  if (!m) throw new RangeError(`Data inválida: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatISODate(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Date (qualquer instante) → "YYYY-MM-DD" em UTC. */
export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Date em 00:00 UTC (formato que o Prisma usa para colunas DATE). */
export function fromISODate(iso: ISODate): Date {
  const { year, month, day } = parseISODate(iso);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Data de hoje no fuso informado (ex.: "America/Sao_Paulo"). */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  try {
    // "en-CA" formata como YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return toISODate(now);
  }
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/**
 * Soma meses preservando o dia quando possível; em mês mais curto usa o último dia
 * (31/jan + 1 mês = 28 ou 29/fev). Para "dia fixo do mês" use `dateInMonth`.
 */
export function addMonths(iso: ISODate, months: number): ISODate {
  const { year, month, day } = parseISODate(iso);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12 + 12) % 12 + 1;
  return formatISODate(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Data com o `day` pedido no mês de `iso`, limitada ao último dia do mês. */
export function dateInMonth(iso: ISODate, day: number): ISODate {
  const { year, month } = parseISODate(iso);
  return formatISODate(year, month, Math.min(day, daysInMonth(year, month)));
}

export function startOfMonth(iso: ISODate): ISODate {
  const { year, month } = parseISODate(iso);
  return formatISODate(year, month, 1);
}

export function endOfMonth(iso: ISODate): ISODate {
  const { year, month } = parseISODate(iso);
  return formatISODate(year, month, daysInMonth(year, month));
}

/** "2026-10-15" → "2026-10". */
export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

/** Segunda-feira da semana de `iso` (semanas começam na segunda). */
export function startOfWeek(iso: ISODate): ISODate {
  const d = fromISODate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return toISODate(d);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Diferença em dias (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

/** Primeiros dias de cada mês entre `from` e `to` (inclusive), em ordem. */
export function listMonthStarts(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);
  while (cursor <= last) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

const MONTH_NAMES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MONTH_SHORT_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthNamePt(iso: ISODate): string {
  return MONTH_NAMES_PT[parseISODate(iso).month - 1]!;
}

export function monthShortPt(iso: ISODate): string {
  return MONTH_SHORT_PT[parseISODate(iso).month - 1]!;
}
