/**
 * Escala "bonita" para eixos: passos 1/2/5 × 10^n. Os valores são centavos inteiros, então o passo
 * nunca é menor que 1 (passos fracionários, arredondados, repetiam rótulos e chaves do React).
 */
export function niceScale(min: number, max: number, ticks = 4): { min: number; max: number; step: number; values: number[] } {
  if (min === max) {
    max = min + 1;
  }
  const rawStep = (max - min) / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const frac = rawStep / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  const step = Math.max(1, nice * pow);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const values: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) {
    const r = Math.round(v);
    if (values[values.length - 1] !== r) values.push(r);
  }
  return { min: lo, max: hi, step, values };
}

/** Caminho SVG suavizado (Catmull-Rom → Bézier) passando pelos pontos. */
export function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}
