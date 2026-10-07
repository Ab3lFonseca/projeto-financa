/**
 * Contas das insígnias que não dependem do banco: sequências (dias, semanas e meses seguidos) e o resumo dos meses fechados.
 * Tudo puro, para ser testado sem banco e dar sempre o mesmo resultado.
 */

const DAY_MS = 86_400_000;

/** Dias desde 1970-01-01 de uma data "AAAA-MM-DD". */
export function dayIndex(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Número da semana (começa na segunda-feira): duas datas da mesma semana dão o mesmo número, e semanas seguidas dão números seguidos. */
export function weekIndex(iso: string): number {
  // 1970-01-01 foi uma quinta-feira: somar 3 faz a virada da semana cair na segunda.
  return Math.floor((dayIndex(iso) + 3) / 7);
}

/** Número do mês de "AAAA-MM" (ou "AAAA-MM-DD"): meses seguidos dão números seguidos. */
export function monthIndex(ym: string): number {
  const [y, m] = ym.slice(0, 7).split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
}

/** A maior sequência de números inteiros consecutivos (repetidos contam uma vez). `[3,4,5,9,10]` → 3. */
export function longestRun(values: Iterable<number>): number {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const v of sorted) {
    run = previous !== null && v === previous + 1 ? run + 1 : 1;
    if (run > best) best = run;
    previous = v;
  }
  return best;
}

/** Receitas e despesas (em centavos) de um mês já fechado. */
export type MonthTotals = { ym: string; income: number; expense: number };

export type SavingsSummary = {
  /** Meses fechados em que a pessoa gastou menos do que recebeu (e recebeu algo). */
  savingMonths: number;
  /** Maior sequência de meses seguidos no azul. */
  savingStreak: number;
  /** Soma do que sobrou nesses meses. */
  savedTotalCents: number;
  /** Maior fatia da renda guardada em um mês (% inteiro, arredondado para baixo). */
  bestSavingRatePct: number;
  /** Maior sequência de meses seguidos com despesa menor que a do mês anterior (ambos com despesa). */
  spendDownStreak: number;
};

/** Resumo dos meses FECHADOS (o mês corrente ainda não conta: pode virar). */
export function savingsSummary(closed: MonthTotals[]): SavingsSummary {
  const months = [...closed].sort((a, b) => a.ym.localeCompare(b.ym));
  const saving = months.filter((m) => m.income > 0 && m.expense < m.income);
  const byIndex = new Map(months.map((m) => [monthIndex(m.ym), m]));
  const decreases = months.filter((m) => {
    const before = byIndex.get(monthIndex(m.ym) - 1);
    return before !== undefined && before.expense > 0 && m.expense > 0 && m.expense < before.expense;
  });
  return {
    savingMonths: saving.length,
    savingStreak: longestRun(saving.map((m) => monthIndex(m.ym))),
    savedTotalCents: saving.reduce((sum, m) => sum + (m.income - m.expense), 0),
    bestSavingRatePct: months.reduce((best, m) => (m.income > 0 && m.income > m.expense ? Math.max(best, Math.floor(((m.income - m.expense) / m.income) * 100)) : best), 0),
    spendDownStreak: longestRun(decreases.map((m) => monthIndex(m.ym))),
  };
}

/** Quantos meses de despesas o saldo cobre, pela média dos últimos meses fechados com despesa (no máximo 3). Sem saldo positivo ou sem histórico: 0. */
export function cushionMonths(netWorthCents: number, closed: MonthTotals[]): number {
  if (netWorthCents <= 0) return 0;
  const recent = [...closed]
    .filter((m) => m.expense > 0)
    .sort((a, b) => b.ym.localeCompare(a.ym))
    .slice(0, 3);
  if (recent.length === 0) return 0;
  const average = recent.reduce((sum, m) => sum + m.expense, 0) / recent.length;
  return Math.floor(netWorthCents / average);
}
