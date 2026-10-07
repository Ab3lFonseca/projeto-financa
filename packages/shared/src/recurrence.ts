import { addDays, addMonths, dateInMonth, parseISODate, startOfMonth, type ISODate } from "./dates";

export type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export type RecurrenceRule = {
  frequency: Frequency;
  /** A cada N períodos (1 = todo mês/semana/ano). */
  intervalCount: number;
  /** MONTHLY/YEARLY: dia do mês âncora (31 em mês curto = último dia). */
  dayOfMonth?: number | null;
  startDate: ISODate;
  endDate?: ISODate | null;
};

/** Primeira ocorrência: no próprio dia de início. */
export function firstOccurrence(rule: RecurrenceRule): ISODate {
  return rule.startDate;
}

/**
 * Ocorrência seguinte a `current`. Ancorada no dia do mês, então 31/jan → 28/fev → 31/mar
 * (e não 28/fev → 28/mar). Retorna null se passar de `endDate`.
 */
export function nextOccurrence(rule: RecurrenceRule, current: ISODate): ISODate | null {
  const interval = Math.max(1, rule.intervalCount);
  let next: ISODate;
  if (rule.frequency === "WEEKLY") {
    next = addDays(current, 7 * interval);
  } else {
    const anchorDay = rule.dayOfMonth ?? parseISODate(rule.startDate).day;
    const months = rule.frequency === "MONTHLY" ? interval : 12 * interval;
    next = dateInMonth(addMonths(startOfMonth(current), months), anchorDay);
  }
  if (rule.endDate && next > rule.endDate) return null;
  return next;
}

/**
 * Data da N-ésima ocorrência (a primeira, no início, conta como 1): é onde a regra "termina depois de N vezes" acaba.
 * `rule.endDate` é ignorado aqui (é justamente o que se está calculando).
 */
export function dateOfOccurrence(rule: Omit<RecurrenceRule, "endDate">, n: number): ISODate {
  let current: ISODate = rule.startDate;
  for (let i = 1; i < Math.max(1, Math.floor(n)); i++) {
    // sem endDate, nextOccurrence nunca devolve null
    current = nextOccurrence({ ...rule, endDate: null }, current) as ISODate;
  }
  return current;
}

/**
 * Todas as ocorrências de `from` (inclusive) até `to` (inclusive), no máximo `limit`.
 * `from` deve ser uma ocorrência válida da regra (normalmente `nextRunOn`).
 */
export function occurrencesBetween(rule: RecurrenceRule, from: ISODate, to: ISODate, limit = 366): ISODate[] {
  const out: ISODate[] = [];
  let cursor: ISODate | null = from;
  while (cursor && cursor <= to && out.length < limit) {
    if (rule.endDate && cursor > rule.endDate) break;
    out.push(cursor);
    cursor = nextOccurrence(rule, cursor);
  }
  return out;
}
