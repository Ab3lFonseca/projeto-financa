/** Curva "easeOutQuart": começa rápido e pousa devagar no valor final. */
export function easeOutQuart(p: number): number {
  return 1 - Math.pow(1 - p, 4);
}

/** Valor intermediário (em centavos, inteiro) entre `from` e `to` no instante `p` (0 a 1) da animação. */
export function countUpValue(from: number, to: number, p: number): number {
  if (p >= 1) return to;
  if (p <= 0) return from;
  return Math.round(from + (to - from) * easeOutQuart(p));
}
